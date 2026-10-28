// 文件上传/下载 + 真实 AI 文档解析与人工确认队列
import crypto from "node:crypto";
import { generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createRequire as nodeCreateRequire } from "node:module";
// V15 修复：pdf-parse/mammoth 必须走 node_modules 运行时加载——esbuild 打包会弄丢 pdfjs 的 worker 文件，
// 且不同构建环境的产物形态不一（云端报 “PDFParse2 is not a constructor”）。createRequire 让运行行为与依赖安装目录一致。
// 注意：必须用别名导入，避免与构建 banner 注入的 createRequire 冲突。
const requireCjs = nodeCreateRequire(import.meta.url);
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { TRPCError } from "@trpc/server";
import { authedProcedure, permProcedure, audit, createAutoTodo } from "../auth";
import { getDb } from "../queries/connection";
import { files, fileChunks, aiTasks, users, papers, achievements, reviews } from "@db/schema";
import { storage } from "../lib/storage";
import { AiMisconfigured, AiUnavailable, classifyAiError, listModels } from "../lib/ai-client";

// 文件可见范围鉴权：private 仅本人+超管；admins 管理档；no_guest 非访客；all 全员
function canAccessFile(
  user: { id: number; role: string },
  profile: string,
  f: { uploadedBy: number | null; visibility: string; reviewStatus?: string; sharedWithIds?: number[] | null },
): boolean {
  if (f.uploadedBy === user.id || (f.sharedWithIds ?? []).includes(user.id)) return true;
  if (profile === "super_admin") return true;
  // 待审核/已驳回的私有文件仍只对本人、指定共享人员和超管可见；
  // “仅管理员可见”的文件允许管理档审核，不能借此读取其他用户的私有附件。
  if (f.reviewStatus && f.reviewStatus !== "approved") {
    return f.visibility === "admins" && profile === "admin";
  }
  switch (f.visibility) {
    case "private":
      return false;
    case "admins":
      return profile === "admin";
    case "no_guest":
      // 历史“非游客可见”不再等同于全组可见；仅上传者、指定共享人员和超管可读。
      return false;
    case "all":
    default:
      return true;
  }
}

// ---- V12：分片上传（规避网关请求体上限导致的上传卡死）----
type PendingUpload = {
  fileName: string; mime: string; module?: string; visibility: "private" | "admins" | "no_guest" | "all";
  userId: number; partCount: number; parts: Map<number, string>; createdAt: number; sharedWithIds: number[];
};
const pendingUploads = new Map<string, PendingUpload>();
const PART_MAX = 900_000; // 单片 base64 字符上限（约 660KB 原始数据）

function purgeStaleUploads() {
  const now = Date.now();
  for (const [k, v] of pendingUploads) if (now - v.createdAt > 3600_000) pendingUploads.delete(k);
}

// 新文件从对象存储读取；历史记录优先拼接 file_chunks，再回退 files.data_base64。
async function assembleBase64(f: { id: number; dataBase64: string | null; storageKey?: string | null }): Promise<string> {
  if (f.storageKey) return Buffer.from(await storage.readFile({ fileKey: f.storageKey })).toString("base64");
  const chunks = await getDb()
    .select({ seq: fileChunks.seq, data: fileChunks.data })
    .from(fileChunks)
    .where(eq(fileChunks.fileId, f.id))
    .orderBy(asc(fileChunks.seq));
  if (chunks.length) return chunks.map((c) => c.data).join("");
  return f.dataBase64 ?? "";
}

// 校验 + 落库（单请求与分片共用）
async function persistFile(
  ctx: { user: { id: number; name: string; role: string }; profile: string },
  input: { fileName: string; mime: string; base64: string; module?: string; visibility: "private" | "admins" | "no_guest" | "all"; sharedWithIds?: number[] },
) {
  if (ctx.user.role === "guest")
    throw new TRPCError({ code: "FORBIDDEN", message: "访客仅可浏览，不能上传文件" });
  if (ctx.profile !== "super_admin" && ["no_guest", "all"].includes(input.visibility)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "普通用户不能上传全局可见文件，请指定可见人员" });
  }
  const bytes = Uint8Array.from(Buffer.from(input.base64, "base64"));
  const size = bytes.byteLength;
  if (size > 50 * 1024 * 1024) return { ok: false as const, message: "单文件大小不得超过 50MB（系统全局约束）" };
  const isPrivileged = ctx.profile === "super_admin" || ctx.profile === "admin";
  const safeName = input.fileName.replace(/[\/\\]/g, "_").replace(/\.\./g, "_").replace(/[\x00-\x1f]/g, "_");
  let saved: Awaited<ReturnType<typeof storage.uploadFile>>;
  try {
    saved = await storage.uploadFile({ fileContent: bytes, fileName: `lab/${ctx.user.id}/${safeName}`, contentType: input.mime });
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `对象存储上传失败：${error instanceof Error ? error.message : "未知错误"}` });
  }
  let fileId: number;
  try {
    const res = await getDb().insert(files).values({
      fileName: input.fileName,
      mime: input.mime,
      size,
      dataBase64: "",
      storageKey: saved.key,
      sharedWithIds: [...new Set(input.sharedWithIds ?? [])].filter((id) => id !== ctx.user.id),
      module: input.module,
      visibility: input.visibility,
      uploadedBy: ctx.user.id,
      reviewStatus: isPrivileged ? "approved" : "pending",
    });
    fileId = Number(res[0].insertId);
  } catch (error) {
    await storage.deleteFile({ fileKey: saved.key }).catch(() => false);
    throw error;
  }
  if (!isPrivileged) {
    const db = getDb();
    const allUsers = await db.select().from(users);
    const adminIds = allUsers.filter((u) => u.active && (u.role === "super_admin" || u.isAdmin)).map((u) => u.id);
    if (adminIds.length) {
      await createAutoTodo({
        title: `文档待审核：${input.fileName}`,
        description: `${ctx.user.name} 提交了文件（${input.module ?? "通用"}），请到【系统配置·内容审核】处理。`,
        priority: "medium",
        creatorId: ctx.user.id,
        creatorName: ctx.user.name,
        leaderIds: adminIds,
        source: "content_review",
        sourceRefId: fileId,
        link: "/config/review",
      });
    }
  }
  await audit(ctx.user, "上传文件", input.module ?? "files", `${input.fileName}（${(size / 1024).toFixed(1)}KB${isPrivileged ? "，免审" : "，待审核"}）`);
  return { ok: true as const, fileId, reviewStatus: isPrivileged ? ("approved" as const) : ("pending" as const) };
}

export const filesRouter = createRouter({
  // 分片上传：开始
  uploadBegin: authedProcedure
    .input(z.object({
      fileName: z.string().min(1),
      mime: z.string().default("application/octet-stream"),
      module: z.string().optional(),
      visibility: z.enum(["private", "admins", "no_guest", "all"]).default("private"),
      sharedWithIds: z.array(z.number()).default([]),
      partCount: z.number().int().min(2).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "guest")
        throw new TRPCError({ code: "FORBIDDEN", message: "访客仅可浏览，不能上传文件" });
      purgeStaleUploads();
      const uploadId = crypto.randomUUID();
      pendingUploads.set(uploadId, {
        fileName: input.fileName, mime: input.mime, module: input.module, visibility: input.visibility,
        userId: ctx.user.id, partCount: input.partCount, parts: new Map(), createdAt: Date.now(), sharedWithIds: input.sharedWithIds,
      });
      return { ok: true, uploadId };
    }),

  // 分片上传：传一片
  uploadPart: authedProcedure
    .input(z.object({ uploadId: z.string(), seq: z.number().int().min(0), data: z.string().max(PART_MAX + 100) }))
    .mutation(async ({ ctx, input }) => {
      const p = pendingUploads.get(input.uploadId);
      if (!p || p.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "上传会话不存在或已过期，请重新上传" });
      if (input.seq >= p.partCount) throw new TRPCError({ code: "BAD_REQUEST", message: "分片序号越界" });
      p.parts.set(input.seq, input.data);
      return { ok: true, received: p.parts.size };
    }),

  // 分片上传：合并落库
  uploadFinish: authedProcedure
    .input(z.object({ uploadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const p = pendingUploads.get(input.uploadId);
      if (!p || p.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "上传会话不存在或已过期，请重新上传" });
      if (p.parts.size !== p.partCount) throw new TRPCError({ code: "BAD_REQUEST", message: `分片不完整（${p.parts.size}/${p.partCount}），请重试` });
      const base64 = Array.from({ length: p.partCount }, (_, i) => p.parts.get(i) ?? "").join("");
      pendingUploads.delete(input.uploadId);
      return persistFile(ctx, { fileName: p.fileName, mime: p.mime, base64, module: p.module, visibility: p.visibility, sharedWithIds: p.sharedWithIds });
    }),

  // base64 仅作传输编码；文件内容统一写入平台对象存储，数据库只保存 key。
  upload: authedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        mime: z.string().default("application/octet-stream"),
        base64: z.string(),
        module: z.string().optional(),
        visibility: z.enum(["private", "admins", "no_guest", "all"]).default("private"),
        sharedWithIds: z.array(z.number()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => persistFile(ctx, input)),

  meta: authedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db.select().from(files);
      return rows
        .filter((f) => input.ids.includes(f.id) && canAccessFile(ctx.user, ctx.profile, f))
        .map(({ dataBase64: _, ...meta }) => meta);
    }),

  url: authedProcedure
    .input(z.object({ id: z.number(), download: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const [f] = await getDb().select().from(files).where(eq(files.id, input.id)).limit(1);
      if (!f || !canAccessFile(ctx.user, ctx.profile, f) || !f.storageKey) return null;
      const { url } = await storage.getPresignedUrl({ key: f.storageKey, download: input.download });
      return { url, fileName: f.fileName, mime: f.mime };
    }),

  download: authedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [f] = await getDb().select().from(files).where(eq(files.id, input.id)).limit(1);
      if (!f || !canAccessFile(ctx.user, ctx.profile, f)) return null;
      return { fileName: f.fileName, mime: f.mime, base64: await assembleBase64(f) };
    }),
});

// ============ AI 解析（真实 LLM + 人工确认队列）============
const extractionSchema = z.object({
  标题: z.string().optional(),
  作者: z.string().optional(),
  年度: z.string().optional(),
  日期: z.string().optional(),
  期刊: z.string().optional(),
  分区: z.string().optional(),
  DOI号: z.string().optional(),
  卷期页: z.string().optional(),
  专利号: z.string().optional(),
  专利类型: z.string().optional(),
  授权日: z.string().optional(),
  奖励名称: z.string().optional(),
  等级: z.string().optional(),
  颁奖单位: z.string().optional(),
  登记号: z.string().optional(),
  出版社: z.string().optional(),
  ISBN: z.string().optional(),
  关键词: z.string().optional(),
  摘要: z.string().optional(),
});

export const aiRouter = createRouter({
  // parseFileFields 成功后，将真实解析结果送入人工确认队列。
  createTask: authedProcedure
    .input(z.object({ fileName: z.string(), fileId: z.number(), module: z.string(), suggested: z.record(z.string(), z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const [file] = await getDb().select().from(files).where(eq(files.id, input.fileId)).limit(1);
      if (!file || !canAccessFile(ctx.user, ctx.profile, file)) throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在或无权访问" });
      const res = await getDb().insert(aiTasks).values({
        module: input.module,
        fileName: input.fileName,
        fileId: input.fileId,
        suggested: input.suggested,
        createdBy: ctx.user.id,
      });
      await audit(ctx.user, "AI 扫描解析", input.module, `${input.fileName}（真实 LLM，待人工确认）`);
      return { ok: true, taskId: Number(res[0].insertId) };
    }),

  pending: authedProcedure.query(async ({ ctx }) => {
    const rows = await getDb().select().from(aiTasks).orderBy(desc(aiTasks.id));
    return rows.filter((t) => t.status === "pending" && (ctx.profile === "super_admin" || t.createdBy === ctx.user.id));
  }),

  // V6 需求 C-4：AI 解析确认入库（建议字段经人工编辑后写入对应模块）
  confirm: authedProcedure
    .input(z.object({
      id: z.number(),
      fields: z.record(z.string(), z.string()),
      achievementCategory: z.string().optional(), // module=achievement 时的成果类别
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, input.id)).limit(1);
      if (!task || (ctx.profile !== "super_admin" && task.createdBy !== ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "AI 任务不存在或无权处理" });
      if (task.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "该建议已处理" });
      const f = input.fields;
      const today = new Date().toISOString().slice(0, 10);
      let createdInfo = "";
      if (task.module === "paper") {
        await db.insert(papers).values({
          title: f["论文题目"] || task.fileName,
          authors: f["作者"] ?? "",
          journal: f["期刊会议"] ?? "",
          doi: f["DOI号"] ?? f["DOI"] ?? "",
          status: "writing",
          leaderId: ctx.user.id,
          participantIds: [],
          note: f["摘要"] ?? "",
          fileId: task.fileId ?? null,
        });
        createdInfo = "已登记到【科研管理·投稿论文进度】";
      } else if (task.module === "achievement") {
        const cat = (["published_paper", "patent", "award", "student_work", "book", "software_copyright"].includes(input.achievementCategory ?? "") ? input.achievementCategory! : "published_paper") as "published_paper";
        await db.insert(achievements).values({
          category: cat,
          title: f["论文题目"] || f["标题"] || task.fileName,
          authors: f["作者"] ?? "",
          year: Number((f["发表时间"] ?? today).slice(0, 4)) || Number(today.slice(0, 4)),
          date: today,
          detail: { 期刊: f["期刊会议"] ?? "", DOI号: f["DOI号"] ?? f["DOI"] ?? "", 关键词: f["关键词"] ?? "", 摘要: (f["摘要"] ?? "").slice(0, 500) },
          evidenceFileIds: task.fileId ? [task.fileId] : [],
          isPublic: false,
          createdBy: ctx.user.id,
        });
        createdInfo = "已登记到【成果管理】";
      } else if (task.module === "review") {
        await db.insert(reviews).values({
          title: f["稿件题目"] || task.fileName,
          authors: f["作者"] ?? "",
          direction: f["研究方向"] ?? "",
          keywords: f["关键词"] ?? "",
          fileId: task.fileId ?? null,
          assignments: [],
          createdBy: ctx.user.id,
        });
        createdInfo = "已登记到【科研管理·审稿情况】";
      }
      await db.update(aiTasks).set({ status: "confirmed", suggested: f }).where(eq(aiTasks.id, input.id));
      await audit(ctx.user, "确认 AI 建议", "ai", `#${input.id} ${task.fileName} ${createdInfo || "（仅标记确认）"}`);
      return { ok: true, createdInfo };
    }),

  resolve: authedProcedure
    .input(z.object({ id: z.number(), action: z.enum(["confirmed", "rejected"]) }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await getDb().select().from(aiTasks).where(eq(aiTasks.id, input.id)).limit(1);
      if (!task || (ctx.profile !== "super_admin" && task.createdBy !== ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "AI 任务不存在或无权处理" });
      await getDb().update(aiTasks).set({ status: input.action }).where(eq(aiTasks.id, input.id));
      await audit(ctx.user, input.action === "confirmed" ? "确认 AI 建议" : "拒绝 AI 建议", "ai", `#${input.id}`);
      return { ok: true };
    }),

  // V12 问题2b：对已上传文件做真实 LLM 解析，返回结构化字段供表单回填
  parseFileFields: authedProcedure
    .input(z.object({ fileId: z.number(), module: z.string().default("achievement") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [f] = await db.select().from(files).where(eq(files.id, input.fileId)).limit(1);
      if (!f || !canAccessFile(ctx.user, ctx.profile, f))
        throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在或无权访问" });

      // 提取文件内容（文本 / 图片；扫描版 PDF 渲染为图片走多模态视觉解析）
      const fileBase64 = await assembleBase64(f);
      const buf = Buffer.from(fileBase64, "base64");
      let text = "";
      const imageDataUrls: string[] = [];
      const name = f.fileName.toLowerCase();
      try {
        if (name.endsWith(".pdf") || f.mime === "application/pdf") {
          const { PDFParse } = requireCjs("pdf-parse") as typeof import("pdf-parse");
          const parser = new PDFParse({ data: new Uint8Array(buf) });
          try {
            text = ((await parser.getText()).text ?? "").trim();
            if (text.length < 20) {
              // 扫描件（无文字层）：渲染前两页为 PNG，交给多模态大模型看图识别
              const shot: any = await parser.getScreenshot({ imageBuffer: true, scale: 1.5, first: 2 });
              for (const pg of (shot?.pages ?? []).slice(0, 2)) {
                if (pg?.data) imageDataUrls.push(`data:image/png;base64,${Buffer.from(pg.data).toString("base64")}`);
              }
            }
          } finally {
            await parser.destroy().catch(() => undefined);
          }
        } else if (/\.docx$/.test(name)) {
          const mammoth = requireCjs("mammoth") as typeof import("mammoth");
          text = (await mammoth.extractRawText({ buffer: buf })).value ?? "";
        } else if (/\.(txt|md|tex|bib|ris|csv)$/.test(name) || (f.mime ?? "").startsWith("text/")) {
          text = buf.toString("utf8");
        } else if ((f.mime ?? "").startsWith("image/") && buf.length <= 12 * 1024 * 1024) {
          imageDataUrls.push(`data:${f.mime ?? "image/png"};base64,${fileBase64}`);
        } else {
          return { ok: false as const, message: "该文件类型暂不支持 AI 解析（支持 PDF / DOCX / TXT / 图片）。" };
        }
      } catch (e) {
        return { ok: false as const, message: `文件内容提取失败：${e instanceof Error ? e.message : "未知错误"}` };
      }
      if (imageDataUrls.length === 0 && text.trim().length < 20) {
        return { ok: false as const, message: "未能从文件中提取到有效文字或图像内容。" };
      }
      text = text.slice(0, 12000);

      const sysPrompt = "你是科研管理信息抽取助手。从用户提供的文件内容中抽取关键信息。"
        + "日期与授权日使用 YYYY-MM-DD；只填写你确有把握的字段；摘要不超 300 字。证书/合同等扫描件请结合图像内容识别。"
        + "专利类型的取值仅允许：发明专利、GF专利、实用新型、软件著作权。";
      const userContent = imageDataUrls.length
        ? [
            { type: "text" as const, text: `请抽取这份文件（${f.fileName}，共 ${imageDataUrls.length} 页图像）的关键信息。` },
            ...imageDataUrls.map((url) => ({ type: "image" as const, image: url })),
          ]
        : [{ type: "text" as const, text: `文件名：${f.fileName}\n文件内容：\n${text}` }];

      try {
        const { models, defaultModelId } = await listModels();
        const defaultModel = models.find((item) => item.id === defaultModelId);
        const model = imageDataUrls.length && defaultModel?.supportsImageIn === false
          ? models.find((item) => item.supportsImageIn)?.id
          : defaultModelId;
        if (!model) return { ok: false as const, message: "当前没有支持图像输入的可用模型，请人工填写。" };
        const baseURL = process.env.KIMI_AGENTGW_BASE_URL;
        const apiKey = process.env.KIMI_AGENTGW_API_KEY;
        if (!baseURL || !apiKey) throw new AiMisconfigured("平台模型接口尚未供给，请发布或重新打开站点后重试。");
        const provider = createOpenAICompatible({
          name: "kimi-gw",
          baseURL,
          apiKey,
          includeUsage: true,
          supportsStructuredOutputs: true,
        });
        const result = await generateObject({
          model: provider(model),
          schema: extractionSchema,
          system: sysPrompt,
          messages: [{ role: "user", content: userContent }],
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(90_000),
        });
        const fields = Object.fromEntries(
          Object.entries(result.object).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
        );
        if (Object.keys(fields).length === 0) {
          return { ok: false as const, message: "大模型未返回可识别的字段，请人工填写。" };
        }
        await audit(ctx.user, "AI 解析回填", input.module, `${f.fileName}（${model}，${Object.keys(fields).length} 个字段）`);
        return { ok: true as const, fields, model, fileName: f.fileName };
      } catch (error) {
        const classified = classifyAiError(error);
        const message = classified instanceof AiUnavailable
          ? "额度耗尽或模型权益不可用，请管理员在 Kimi 检查站点额度。"
          : classified instanceof AiMisconfigured
            ? "平台模型接口配置异常，请发布或重新打开站点后重试。"
            : classified.message;
        return { ok: false as const, message: `AI 解析未完成：${message}` };
      }
    }),

  // 权限检查用（可选）
  _perm: permProcedure("achievement.list", "readonly").query(() => ({ ok: true })),
});
