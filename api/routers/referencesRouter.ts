// 2.6 重要参考文献管理（EndNote 化）+ 2.7 WoS 引用次数
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permProcedure, audit, createAutoTodo } from "../auth";
import { getDb } from "../queries/connection";
import { TRPCError } from "@trpc/server";
import { references, referencePushes, wosCitations, achievements, refDirections } from "@db/schema";

function assertReferenceManager(profile: string) {
  if (profile !== "super_admin" && profile !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "重要参考文献仅管理员可新增、编辑和导入" });
  }
}

const refInput = z.object({
  authors: z.string().min(1),
  year: z.number().optional(),
  title: z.string().min(1),
  referenceType: z.enum(["article", "book"]).default("article"),
  venue: z.string().optional(),
  publisher: z.string().optional(),
  isbn: z.string().optional(),
  volume: z.string().optional(),
  pages: z.string().optional(),
  doi: z.string().optional(),
  abstract: z.string().optional(),
  keywords: z.string().optional(),
  category: z.string().optional(),
  directionId: z.number().nullable().optional(), // 需求 9：研究方向文件夹
  tags: z.string().optional(),
  importance: z.number().min(1).max(5).default(3),
  notes: z.string().optional(),
  fileId: z.number().optional(),
});

// ---- 引用格式生成 ----
export function formatCitation(r: { authors: string; year: number | null; title: string; venue: string | null; volume: string | null; pages: string | null; doi: string | null; referenceType?: string; publisher?: string | null; isbn?: string | null }, style: string): string {
  const yr = r.year ? String(r.year) : "";
  if (r.referenceType === "book") {
    if (style === "bibtex") return `@book{ref${yr}${r.authors.split(/[,，]/)[0].trim().replace(/\s+/g, "")},\n  author = {${r.authors}},\n  title = {${r.title}},\n  publisher = {${r.publisher ?? ""}},\n  year = {${yr}},\n  isbn = {${r.isbn ?? ""}}\n}`;
    return `${r.authors}. ${r.title}[M]. ${r.publisher ?? ""}${yr ? `, ${yr}` : ""}.${r.isbn ? ` ISBN: ${r.isbn}.` : ""}`;
  }
  switch (style) {
    case "gbt7714":
      return `${r.authors}. ${r.title}[J]. ${r.venue ?? ""}${yr ? `, ${yr}` : ""}${r.volume ? `, ${r.volume}` : ""}${r.pages ? `: ${r.pages}` : ""}.${r.doi ? ` DOI: ${r.doi}.` : ""}`;
    case "apa":
      return `${r.authors} (${yr}). ${r.title}. ${r.venue ?? ""}${r.volume ? `, ${r.volume}` : ""}${r.pages ? `, ${r.pages}` : ""}.${r.doi ? ` https://doi.org/${r.doi}` : ""}`;
    case "ieee":
      return `${r.authors}, "${r.title}," ${r.venue ?? ""}${r.volume ? `, vol. ${r.volume}` : ""}${r.pages ? `, pp. ${r.pages}` : ""}${yr ? `, ${yr}` : ""}.`;
    case "bibtex":
      return `@article{ref${r.year ?? ""}${(r.authors.split(/[,，]/)[0] || "unknown").trim().replace(/\s+/g, "")},\n  author = {${r.authors}},\n  title = {${r.title}},\n  journal = {${r.venue ?? ""}},\n  year = {${yr}},\n  volume = {${r.volume ?? ""}},\n  pages = {${r.pages ?? ""}},\n  doi = {${r.doi ?? ""}}\n}`;
    default:
      return `${r.authors}. ${r.title}. ${r.venue ?? ""}, ${yr}.`;
  }
}

// ---- BibTeX / RIS 简易解析 ----
function parseBibTeX(text: string) {
  const entries: Record<string, string>[] = [];
  const blocks = text.split(/@\w+\{/).slice(1);
  for (const b of blocks) {
    const entry: Record<string, string> = {};
    const re = /(\w+)\s*=\s*[{\"]([^}\"]*)[}\"]/g;
    let m;
    while ((m = re.exec(b))) entry[m[1].toLowerCase()] = m[2].trim();
    if (entry.title) entries.push(entry);
  }
  return entries.map((e) => ({
    authors: (e.author || "").replace(/\s+and\s+/g, ", ") || "未知",
    year: e.year ? parseInt(e.year) : undefined,
    title: e.title,
    venue: e.journal || e.booktitle || "",
    volume: e.volume || "",
    pages: (e.pages || "").replace(/--/g, "-"),
    doi: e.doi || "",
  }));
}

function parseRIS(text: string) {
  const entries: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])\s+-\s+(.*)$/.exec(line);
    if (!m) continue;
    const [, tag, val] = m;
    if (tag === "TY") cur = {};
    else if (tag === "ER" && cur) { entries.push(cur); cur = null; }
    else if (cur) {
      if (tag === "AU") cur.authors = cur.authors ? `${cur.authors}, ${val}` : val;
      else if (tag === "TI" || tag === "T1") cur.title = val;
      else if (tag === "JO" || tag === "T2") cur.venue = val;
      else if (tag === "PY" || tag === "Y1") cur.year = val.slice(0, 4);
      else if (tag === "VL") cur.volume = val;
      else if (tag === "SP") cur.pages = val;
      else if (tag === "DO") cur.doi = val;
    }
  }
  return entries.map((e) => ({
    authors: e.authors || "未知",
    year: e.year ? parseInt(e.year) : undefined,
    title: e.title || "未命名",
    venue: e.venue || "",
    volume: e.volume || "",
    pages: e.pages || "",
    doi: e.doi || "",
  }));
}

export const referencesRouter = createRouter({
  list: permProcedure("research.references", "readonly")
    .input(
      z
        .object({
          category: z.string().optional(),
          keyword: z.string().optional(),
          directionId: z.number().nullable().optional(), // null=未分类
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(references).orderBy(desc(references.id));
      const dirs = await db.select().from(refDirections);
      const dirName = (id: number | null) => dirs.find((d) => d.id === id)?.name ?? null;
      return rows
        .filter((r) => {
          if (input?.directionId !== undefined) {
            if (input.directionId === null) { if (r.directionId !== null) return false; }
            else if (r.directionId !== input.directionId) return false;
          }
          if (input?.category && r.category !== input.category) return false;
          if (input?.keyword) {
            const k = input.keyword.toLowerCase();
            const hay = `${r.title} ${r.authors} ${r.keywords ?? ""} ${r.tags ?? ""}`.toLowerCase();
            if (!hay.includes(k)) return false;
          }
          return true;
        })
        .map((r) => ({ ...r, directionName: dirName(r.directionId) }));
    }),

  create: permProcedure("research.references", "editable")
    .input(refInput)
    .mutation(async ({ ctx, input }) => {
      assertReferenceManager(ctx.profile);
      await getDb().insert(references).values(input);
      await audit(ctx.user, "新增文献", "research.references", input.title);
      return { ok: true };
    }),

  update: permProcedure("research.references", "editable")
    .input(refInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertReferenceManager(ctx.profile);
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(references).set(patch).where(eq(references.id, id));
      await audit(ctx.user, "编辑文献", "research.references", `#${id}`);
      return { ok: true };
    }),

  importText: permProcedure("research.references", "editable")
    .input(z.object({ format: z.enum(["bibtex", "ris"]), content: z.string().min(4) }))
    .mutation(async ({ ctx, input }) => {
      assertReferenceManager(ctx.profile);
      const entries = input.format === "bibtex" ? parseBibTeX(input.content) : parseRIS(input.content);
      const db = getDb();
      for (const e of entries) {
        await db.insert(references).values({ ...e, importance: 3 });
      }
      await audit(ctx.user, "导入文献", "research.references", `${input.format} 导入 ${entries.length} 条`);
      return { imported: entries.length };
    }),

  exportText: permProcedure("research.references", "readonly")
    .input(z.object({ format: z.enum(["bibtex", "ris", "gbt7714", "apa", "ieee"]) }))
    .query(async ({ input }) => {
      const rows = await getDb().select().from(references).orderBy(desc(references.id));
      if (input.format === "bibtex") return { text: rows.map((r) => formatCitation(r, "bibtex")).join("\n\n") };
      if (input.format === "ris")
        return {
          text: rows
            .map(
              (r) =>
                `TY  - JOUR\n${(r.authors || "").split(/[,，]/).map((a) => `AU  - ${a.trim()}`).join("\n")}\nTI  - ${r.title}\nJO  - ${r.venue ?? ""}\nPY  - ${r.year ?? ""}\nVL  - ${r.volume ?? ""}\nSP  - ${r.pages ?? ""}\nDO  - ${r.doi ?? ""}\nER  - `,
            )
            .join("\n\n"),
        };
      return { text: rows.map((r) => formatCitation(r, input.format)).join("\n") };
    }),

  cite: permProcedure("research.references", "readonly")
    .input(z.object({ id: z.number(), style: z.enum(["gbt7714", "apa", "ieee", "bibtex"]) }))
    .query(async ({ input }) => {
      const [r] = await getDb().select().from(references).where(eq(references.id, input.id)).limit(1);
      if (!r) return { text: "" };
      return { text: formatCitation(r, input.style) };
    }),

  // 推送文献给指定用户 → 自动生成待办
  push: permProcedure("research.references", "editable")
    .input(z.object({ referenceId: z.number(), toUserIds: z.array(z.number()).min(1), message: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [r] = await db.select().from(references).where(eq(references.id, input.referenceId)).limit(1);
      if (!r) return { ok: false };
      for (const uid of input.toUserIds) {
        await db.insert(referencePushes).values({ referenceId: input.referenceId, toUserId: uid, message: input.message });
        await createAutoTodo({
          title: `阅读并反馈文献：${r.title}`,
          description: `${ctx.user.name} 向你推送了文献《${r.title}》${r.venue ? `（${r.venue}）` : ""}，请阅读后反馈。${input.message ?? ""}`,
          priority: "medium",
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [uid],
          source: "reference",
          sourceRefId: r.id,
        link: "/research/references",
        });
      }
      await audit(ctx.user, "推送文献", "research.references", `《${r.title}》→ ${input.toUserIds.length} 人`);
      return { ok: true };
    }),

  remove: permProcedure("research.references", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.profile !== "super_admin" && ctx.profile !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可删除文献" });
      await getDb().delete(references).where(eq(references.id, input.id));
      await audit(ctx.user, "删除文献", "research.references", `#${input.id}`);
      return { ok: true };
    }),
});

// ============ 2.7 WoS 引用次数 ============
export const citationsRouter = createRouter({
  list: permProcedure("research.citations", "readonly").query(async () => {
    const db = getDb();
    const rows = await db.select().from(wosCitations).orderBy(desc(wosCitations.id));
    const achs = await db.select().from(achievements);
    const papersAch = achs.filter((a) => a.category === "published_paper");
    // 自动补齐：已发表论文还没有引用记录的补空记录
    const linked = new Set(rows.map((r) => r.achievementId));
    const result = rows.map((r) => ({
      ...r,
      title: achs.find((a) => a.id === r.achievementId)?.title ?? "（已删除）",
      authors: achs.find((a) => a.id === r.achievementId)?.authors ?? "",
    }));
    const unlinked = papersAch.filter((a) => !linked.has(a.id));
    return { rows: result, unlinked: unlinked.map((a) => ({ id: a.id, title: a.title, authors: a.authors })) };
  }),

  link: permProcedure("research.citations", "editable")
    .input(z.object({ achievementId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(wosCitations).values({ achievementId: input.achievementId, counts: {} });
      await audit(ctx.user, "关联引用追踪", "research.citations", `#${input.achievementId}`);
      return { ok: true };
    }),

  updateCount: permProcedure("research.citations", "editable")
    .input(z.object({ id: z.number(), year: z.string(), count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.select().from(wosCitations).where(eq(wosCitations.id, input.id)).limit(1);
      if (!row) return { ok: false };
      const counts = { ...row.counts, [input.year]: input.count };
      await db.update(wosCitations).set({ counts, updatedAt: new Date() }).where(eq(wosCitations.id, input.id));
      await audit(ctx.user, "手动补录引用数", "research.citations", `#${input.id} ${input.year}=${input.count}`);
      return { ok: true };
    }),

  // 模拟 WoS API 自动更新（预留接口）：基于现有数据递增
  refreshAll: permProcedure("research.citations", "editable").mutation(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(wosCitations);
    const year = String(new Date().getFullYear());
    for (const row of rows) {
      const prev = row.counts[year] ?? Object.values(row.counts).pop() ?? 0;
      const counts = { ...row.counts, [year]: prev + Math.floor(Math.random() * 4) };
      await db.update(wosCitations).set({ counts, updatedAt: new Date() }).where(eq(wosCitations.id, row.id));
    }
    await audit(ctx.user, "WoS 引用批量更新", "research.citations", `更新 ${rows.length} 条（模拟接口）`);
    return { updated: rows.length };
  }),
});

// ============ 需求 9：研究方向文件夹（方向管理仅超管/管理员；LLM 自动判别方向）============
export const refDirectionsRouter = createRouter({
  list: permProcedure("research.references", "readonly").query(async () => {
    const db = getDb();
    const dirs = await db.select().from(refDirections).orderBy(refDirections.id);
    const refs = await db.select().from(references);
    const byId = new Map(dirs.map((d) => [d.id, d]));
    const pathFor = (direction: (typeof dirs)[number]) => {
      const names: string[] = [];
      const seen = new Set<number>();
      let current: (typeof dirs)[number] | undefined = direction;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return names.join(" / ");
    };
    return dirs
      .map((d) => ({ ...d, path: pathFor(d), count: refs.filter((r) => r.directionId === d.id).length }))
      .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }),

  create: permProcedure("research.references", "manage")
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), parentId: z.number().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.profile !== "super_admin" && ctx.profile !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可管理研究方向" });
      if (input.parentId) {
        const [parent] = await getDb().select({ id: refDirections.id }).from(refDirections).where(eq(refDirections.id, input.parentId)).limit(1);
        if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "上级研究方向不存在" });
      }
      await getDb().insert(refDirections).values(input);
      await audit(ctx.user, "新增研究方向", "research.references", input.name);
      return { ok: true };
    }),

  remove: permProcedure("research.references", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.profile !== "super_admin" && ctx.profile !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可管理研究方向" });
      const db = getDb();
      const children = await db.select({ id: refDirections.id }).from(refDirections).where(eq(refDirections.parentId, input.id)).limit(1);
      if (children.length) throw new TRPCError({ code: "BAD_REQUEST", message: "请先删除或移动该方向下的子方向" });
      // 方向下的文献回到「未归入方向」
      const refs = await db.select().from(references).where(eq(references.directionId, input.id));
      for (const r of refs) await db.update(references).set({ directionId: null }).where(eq(references.id, r.id));
      await db.delete(refDirections).where(eq(refDirections.id, input.id));
      await audit(ctx.user, "删除研究方向", "research.references", `#${input.id}`);
      return { ok: true };
    }),

  // LLM 自动判别文献所属方向（模拟实现：基于方向名称/描述与文献标题、摘要、关键词的语义重叠打分）
  classify: permProcedure("research.references", "editable")
    .input(z.object({ title: z.string(), abstract: z.string().optional(), keywords: z.string().optional() }))
    .mutation(async ({ input }) => {
      const dirs = await getDb().select().from(refDirections);
      const suggestions = scoreDirections(dirs, input).slice(0, 3);
      return { suggestions, best: suggestions[0] ?? null };
    }),

});

// 方向打分：方向名称/描述中的关键词在文献文本中出现次数加权
function scoreDirections(
  dirs: { id: number; name: string; description: string | null }[],
  r: { title: string; abstract?: string | null; keywords?: string | null },
) {
  const hay = `${r.title} ${r.abstract ?? ""} ${r.keywords ?? ""}`.toLowerCase();
  return dirs
    .map((d) => {
      const tokens = `${d.name} ${d.description ?? ""}`
        .toLowerCase()
        .split(/[\s,，、;；/丨|·:：()（）-]+/)
        .filter((t) => t.length >= 2);
      let score = 0;
      for (const t of new Set(tokens)) if (hay.includes(t)) score += t.length >= 4 ? 2 : 1;
      // 反向：文献中的拉丁词（len≥4）出现在方向名称/描述中也计分（中英混排场景）
      const dirText = `${d.name} ${d.description ?? ""}`.toLowerCase();
      for (const w of hay.split(/[^a-z]+/).filter((w) => w.length >= 4)) {
        if (dirText.includes(w)) score += 2;
      }
      return { id: d.id, name: d.name, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}
