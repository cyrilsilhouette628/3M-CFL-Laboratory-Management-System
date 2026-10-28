// 2.8 学术活动管理 + 2.9 学术报告和专家来访管理
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { TRPCError } from "@trpc/server";
import { permProcedure, audit, createAutoTodo, queueWebsiteUpdate } from "../auth";
import { getDb } from "../queries/connection";
import { academicActivities, expertVisits, users } from "@db/schema";

async function assertActivityAccess(id: number, userId: number, profile: string) {
  const [activity] = await getDb().select().from(academicActivities).where(eq(academicActivities.id, id)).limit(1);
  if (!activity || (profile !== "super_admin" && activity.createdBy !== userId && !(activity.attendeeIds ?? []).includes(userId))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "学术活动不存在或无权访问" });
  }
  return activity;
}

async function assertVisitAccess(id: number, userId: number, profile: string) {
  const [visit] = await getDb().select().from(expertVisits).where(eq(expertVisits.id, id)).limit(1);
  if (!visit || (profile !== "super_admin" && visit.hostId !== userId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "来访记录不存在或无权访问" });
  }
  return visit;
}

const reportItem = z.object({
  type: z.string(),
  titleCn: z.string(),
  titleEn: z.string().optional(),
  session: z.string().optional(),
  speakers: z.string().optional(),
  abstract: z.string().optional(),
  paperNo: z.string().optional(),
  evidenceFileIds: z.array(z.number()).optional(),
  travel: z.object({ transport: z.string().optional(), hotel: z.string().optional(), cost: z.string().optional() }).optional(),
});

const activityInput = z.object({
  nameCn: z.string().min(1),
  nameEn: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  url: z.string().optional(),
  submitDeadline: z.string().optional(),
  regDeadline: z.string().optional(),
  attendeeIds: z.array(z.number()).default([]),
  abstracts: z.string().optional(),
  submissionRecord: z.string().optional(),
  reports: z.array(reportItem).default([]),
});

export const activitiesRouter = createRouter({
  list: permProcedure("research.activities", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(academicActivities).orderBy(desc(academicActivities.id));
    const allUsers = await db.select().from(users);
    const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;
    return rows
      .filter((a) => ctx.profile === "super_admin" || a.createdBy === ctx.user.id || (a.attendeeIds ?? []).includes(ctx.user.id))
      .map((a) => ({ ...a, attendeeNames: (a.attendeeIds ?? []).map(nameOf) }));
  }),

  create: permProcedure("research.activities", "editable")
    .input(activityInput)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const res = await db.insert(academicActivities).values({ ...input, createdBy: ctx.user.id });
      const newId = Number(res[0].insertId);
      // 指定参会人员 → 自动生成待办
      for (const uid of input.attendeeIds) {
        await createAutoTodo({
          title: `参加学术会议：${input.nameCn}`,
          description: `会议时间 ${input.startDate ?? "待定"}${input.location ? `，地点 ${input.location}` : ""}${input.regDeadline ? `，注册截止 ${input.regDeadline}` : ""}`,
          priority: "medium",
          dueDate: input.regDeadline || input.startDate,
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [uid],
          source: "activity",
          sourceRefId: newId,
        link: "/research/activities",
        });
      }
      await audit(ctx.user, "新增学术活动", "research.activities", input.nameCn);
      return { ok: true };
    }),

  update: permProcedure("research.activities", "editable")
    .input(activityInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertActivityAccess(id, ctx.user.id, ctx.profile);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(academicActivities).set(patch).where(eq(academicActivities.id, id));
      await audit(ctx.user, "编辑学术活动", "research.activities", `#${id}`);
      return { ok: true };
    }),

  addReport: permProcedure("research.activities", "editable")
    .input(z.object({ id: z.number(), report: reportItem }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const a = await assertActivityAccess(input.id, ctx.user.id, ctx.profile);
      await db.update(academicActivities).set({ reports: [...a.reports, input.report] }).where(eq(academicActivities.id, input.id));
      // 学生参会 → 网站更新队列
      await queueWebsiteUpdate({
        type: "student_conference",
        title: `学生参会：${a.nameCn}（${input.report.speakers ?? "课题组学生"}）`,
        payload: {
          会议名称: a.nameCn,
          地点: a.location ?? "",
          日期: a.startDate ?? "",
          参会学生: input.report.speakers ?? "",
          报告类型: input.report.type,
          报告题目: input.report.titleCn,
        },
        source: "research.activities",
        user: ctx.user,
      });
      await audit(ctx.user, "新增会议报告记录", "research.activities", input.report.titleCn);
      return { ok: true };
    }),

  remove: permProcedure("research.activities", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertActivityAccess(input.id, ctx.user.id, ctx.profile);
      await getDb().delete(academicActivities).where(eq(academicActivities.id, input.id));
      await audit(ctx.user, "删除学术活动", "research.activities", `#${input.id}`);
      return { ok: true };
    }),
});

// ============ 2.9 专家来访 ============
const visitInput = z.object({
  expertName: z.string().min(1),
  expertOrg: z.string().optional(),
  expertTitle: z.string().optional(),
  reportTitle: z.string().min(1),
  abstract: z.string().optional(),
  reportTime: z.string().optional(),
  location: z.string().optional(),
  reception: z.string().optional(),
  hostId: z.number(),
  isPublic: z.boolean().default(false),
});

export const visitsRouter = createRouter({
  list: permProcedure("research.visits", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(expertVisits).orderBy(desc(expertVisits.id));
    const allUsers = await db.select().from(users);
    const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;
    return rows
      .filter((v) => ctx.profile === "super_admin" || v.hostId === ctx.user.id)
      .map((v) => ({ ...v, hostName: nameOf(v.hostId) }));
  }),

  create: permProcedure("research.visits", "editable")
    .input(visitInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.profile !== "super_admin" && input.hostId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能创建本人负责接待的来访记录" });
      }
      const db = getDb();
      const res = await db.insert(expertVisits).values({ ...input, photoFileIds: [] });
      const newId = Number(res[0].insertId);
      // 接待负责人 → 自动生成接待待办
      await createAutoTodo({
        title: `接待任务：${input.expertName} 来访学术报告`,
        description: `报告题目《${input.reportTitle}》，时间 ${input.reportTime ?? "待定"}，地点 ${input.location ?? "待定"}。请负责接待安排与结束后归档。`,
        priority: "high",
        dueDate: input.reportTime?.slice(0, 10),
        creatorId: ctx.user.id,
        creatorName: ctx.user.name,
        leaderIds: [input.hostId],
        source: "visit",
        sourceRefId: newId,
      link: "/research/visits",
      });
      // 学术报告预告 → 网站更新队列
      await queueWebsiteUpdate({
        type: "expert_talk_announce",
        title: `报告预告：${input.expertName}《${input.reportTitle}》`,
        payload: {
          专家姓名: input.expertName,
          单位: input.expertOrg ?? "",
          职称: input.expertTitle ?? "",
          报告题目: input.reportTitle,
          时间: input.reportTime ?? "",
          地点: input.location ?? "",
          摘要: input.abstract ?? "",
        },
        source: "research.visits",
        user: ctx.user,
      });
      await audit(ctx.user, "新增专家来访", "research.visits", `${input.expertName}：${input.reportTitle}`);
      return { ok: true };
    }),

  update: permProcedure("research.visits", "editable")
    .input(
      visitInput.partial().extend({
        id: z.number(),
        posterContent: z.string().optional(),
        newsDraft: z.string().optional(),
        expertBio: z.string().optional(),
        photoFileIds: z.array(z.number()).optional(),
        status: z.enum(["planned", "held", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertVisitAccess(id, ctx.user.id, ctx.profile);
      if (ctx.profile !== "super_admin" && rest.hostId && rest.hostId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "不能将来访记录转交给其他负责人" });
      }
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(expertVisits).set(patch).where(eq(expertVisits.id, id));
      await audit(ctx.user, "编辑专家来访", "research.visits", `#${id}`);
      return { ok: true };
    }),

  // 海报自动生成（内置模板，可编辑）
  generatePoster: permProcedure("research.visits", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const v = await assertVisitAccess(input.id, ctx.user.id, ctx.profile);
      const poster = `━━━━━━━━━━━━━━━━━━━━━━━
【学术报告海报】
━━━━━━━━━━━━━━━━━━━━━━━

报告题目：${v.reportTitle}

报告人：${v.expertName}${v.expertTitle ? `（${v.expertTitle}）` : ""}
单位：${v.expertOrg ?? "—"}

报告时间：${v.reportTime ?? "待定"}
报告地点：${v.location ?? "待定"}

【摘要】
${v.abstract ?? "（待补充）"}

主办：课题组
欢迎广大师生参加！
（本海报由系统模板自动生成，可编辑后导出）`;
      await db.update(expertVisits).set({ posterContent: poster }).where(eq(expertVisits.id, input.id));
      await audit(ctx.user, "生成海报", "research.visits", v.reportTitle);
      return { ok: true, poster };
    }),

  // 新闻稿自动生成（草稿，人工确认后导出/同步）
  generateNews: permProcedure("research.visits", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const v = await assertVisitAccess(input.id, ctx.user.id, ctx.profile);
      const news = `【新闻稿草稿】${v.expertOrg ?? "专家"}${v.expertName}${v.expertTitle ? v.expertTitle : ""}来课题组作学术报告

${v.reportTime ?? "近日"}，${v.expertOrg ?? ""}${v.expertTitle ? `${v.expertTitle}` : ""}${v.expertName}应邀来访，并作题为《${v.reportTitle}》的学术报告。报告在${v.location ?? "本课题组会议室"}举行。

${v.abstract ? `报告中，${v.expertName}围绕"${v.reportTitle}"主题，系统介绍了${v.abstract.slice(0, 120)}${v.abstract.length > 120 ? "……" : ""}` : ""}

报告结束后，${v.expertName}与在场师生进行了深入交流，现场讨论热烈。本次活动拓宽了课题组师生的学术视野，为后续合作研究奠定了良好基础。

（本新闻稿由系统自动生成草稿，请人工审核修订后发布）`;
      await db.update(expertVisits).set({ newsDraft: news }).where(eq(expertVisits.id, input.id));
      await audit(ctx.user, "生成新闻稿", "research.visits", v.reportTitle);
      return { ok: true, news };
    }),

  // 联网检索专家履历（预留接口：模拟返回，人工确认后入库）
  lookupExpert: permProcedure("research.visits", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const v = await assertVisitAccess(input.id, ctx.user.id, ctx.profile);
      const bio = `【联网检索结果 · 预留接口（模拟）】
${v.expertName}，${v.expertTitle ?? "教授"}，${v.expertOrg ?? "—"}。
主要研究方向与 ${v.reportTitle} 相关领域相符。代表成果与详细履历请接入正式检索接口（base_url/api_key 可配置）后自动补全。
请人工核实后点击"确认入库"。`;
      await db.update(expertVisits).set({ expertBio: bio }).where(eq(expertVisits.id, input.id));
      await audit(ctx.user, "检索专家履历", "research.visits", v.expertName);
      return { ok: true, bio };
    }),

  // 归档：需上传现场照片至少 2 张
  archive: permProcedure("research.visits", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const v = await assertVisitAccess(input.id, ctx.user.id, ctx.profile);
      if (v.photoFileIds.length < 2) {
        return { ok: false, message: `归档需上传至少 2 张现场照片（当前 ${v.photoFileIds.length} 张）` };
      }
      await db.update(expertVisits).set({ status: "archived" }).where(eq(expertVisits.id, input.id));
      // 学术报告新闻 → 网站更新队列
      await queueWebsiteUpdate({
        type: "expert_talk_news",
        title: `报告新闻：${v.expertName}《${v.reportTitle}》`,
        payload: {
          专家姓名: v.expertName,
          单位: v.expertOrg ?? "",
          职称: v.expertTitle ?? "",
          报告题目: v.reportTitle,
          时间: v.reportTime ?? "",
          地点: v.location ?? "",
          现场照片文件: v.photoFileIds.join(","),
        },
        source: "research.visits",
        user: ctx.user,
      });
      await audit(ctx.user, "归档来访记录", "research.visits", v.reportTitle);
      return { ok: true };
    }),

  remove: permProcedure("research.visits", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertVisitAccess(input.id, ctx.user.id, ctx.profile);
      await getDb().delete(expertVisits).where(eq(expertVisits.id, input.id));
      await audit(ctx.user, "删除来访记录", "research.visits", `#${input.id}`);
      return { ok: true };
    }),
});
