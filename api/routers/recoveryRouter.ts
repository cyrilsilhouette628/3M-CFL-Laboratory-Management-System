import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProcedure, permProcedure, adminProcedure, audit, isOwnerOrParticipant } from "../auth";
import { getDb } from "../queries/connection";
import { ipApplications, achievements, dataFeedback, mentoringPosts, users } from "@db/schema";

const IP_TYPES = ["发明专利", "GF专利", "实用新型", "软件著作权"] as const;
const IP_STATUSES = ["writing", "external_review", "revision", "new_external_review", "accepted", "granted"] as const;

const ipInput = z.object({
  title: z.string().min(1),
  ipType: z.enum(IP_TYPES),
  agency: z.string().min(1, "申报由代理公司操作，请填写代理公司"),
  applicationNo: z.string().optional(),
  status: z.enum(IP_STATUSES).default("writing"),
  ownerId: z.number().optional(),
  participantIds: z.array(z.number()).default([]),
  submitDate: z.string().optional(),
  protectionEnd: z.string().optional(),
  note: z.string().optional(),
  fileIds: z.array(z.number()).default([]),
});

function canSeeIp(row: typeof ipApplications.$inferSelect, userId: number, profile: string) {
  return profile === "super_admin" || isOwnerOrParticipant(userId, row.ownerId, row.participantIds);
}
async function assertIpAccess(id: number, userId: number, profile: string) {
  const [row] = await getDb().select().from(ipApplications).where(eq(ipApplications.id, id)).limit(1);
  if (!row || !canSeeIp(row, userId, profile)) throw new TRPCError({ code: "NOT_FOUND", message: "知识产权申请不存在或无权访问" });
  return row;
}

export const ipRouter = createRouter({
  list: permProcedure("research.ip", "readonly").query(async ({ ctx }) => {
    const rows = await getDb().select().from(ipApplications).orderBy(desc(ipApplications.id));
    return rows.filter((r) => canSeeIp(r, ctx.user.id, ctx.profile)).map((r) => ({
      ...r,
      daysLeft: r.status === "granted" && r.protectionEnd ? Math.ceil((new Date(`${r.protectionEnd}T00:00:00`).getTime() - Date.now()) / 86400000) : null,
    }));
  }),
  create: permProcedure("research.ip", "editable").input(ipInput).mutation(async ({ ctx, input }) => {
    const res = await getDb().insert(ipApplications).values({ ...input, ownerId: input.ownerId ?? ctx.user.id });
    await audit(ctx.user, "新增知识产权申请", "research.ip", input.title);
    return { ok: true, id: Number(res[0].insertId) };
  }),
  update: permProcedure("research.ip", "editable").input(ipInput.partial().extend({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const existing = await assertIpAccess(input.id, ctx.user.id, ctx.profile);
    const { id, ...rest } = input;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    await getDb().update(ipApplications).set(patch).where(eq(ipApplications.id, id));
    if (input.status === "granted" && existing.status !== "granted") {
      const title = input.title ?? existing.title;
      await getDb().insert(achievements).values({
        category: "patent",
        title,
        authors: "",
        year: new Date().getFullYear(),
        date: new Date().toISOString().slice(0, 10),
        detail: { 专利类型: input.ipType ?? existing.ipType, 专利号: input.applicationNo ?? existing.applicationNo ?? "", 维护代理: input.agency ?? existing.agency, 专利保护期: input.protectionEnd ?? existing.protectionEnd ?? "" },
        evidenceFileIds: input.fileIds ?? existing.fileIds,
        isPublic: false,
        createdBy: ctx.user.id,
      });
    }
    await audit(ctx.user, "更新知识产权申请", "research.ip", `#${id}`);
    return { ok: true };
  }),
  remove: permProcedure("research.ip", "manage").input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await assertIpAccess(input.id, ctx.user.id, ctx.profile);
    await getDb().delete(ipApplications).where(eq(ipApplications.id, input.id));
    await audit(ctx.user, "删除知识产权申请", "research.ip", `#${input.id}`);
    return { ok: true };
  }),
});

export const feedbackRouter = createRouter({
  create: authedProcedure.input(z.object({ module: z.string().min(1), recordId: z.number().optional(), recordTitle: z.string().optional(), content: z.string().min(2) })).mutation(async ({ ctx, input }) => {
    const res = await getDb().insert(dataFeedback).values({ ...input, createdBy: ctx.user.id, createdByName: ctx.user.name });
    await audit(ctx.user, "提交数据纠错反馈", input.module, input.recordTitle ?? input.content.slice(0, 60));
    return { ok: true, id: Number(res[0].insertId) };
  }),
  list: adminProcedure.query(async () => getDb().select().from(dataFeedback).orderBy(desc(dataFeedback.id))),
  resolve: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().update(dataFeedback).set({ status: "resolved", resolvedBy: ctx.user.id, resolvedAt: new Date() }).where(eq(dataFeedback.id, input.id));
    await audit(ctx.user, "处理数据纠错反馈", "feedback", `#${input.id}`);
    return { ok: true };
  }),
});

export const mentoringRouter = createRouter({
  list: authedProcedure.input(z.object({ keyword: z.string().optional() }).optional()).query(async ({ input }) => {
    const rows = await getDb().select().from(mentoringPosts).orderBy(desc(mentoringPosts.updatedAt));
    const k = input?.keyword?.toLowerCase();
    return k ? rows.filter((r) => `${r.topics} ${r.skills} ${r.research ?? ""} ${r.userName}`.toLowerCase().includes(k)) : rows;
  }),
  save: authedProcedure.input(z.object({ topics: z.string().min(1), skills: z.string().min(1), research: z.string().optional(), contact: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [old] = await db.select().from(mentoringPosts).where(eq(mentoringPosts.userId, ctx.user.id)).limit(1);
    if (old) await db.update(mentoringPosts).set({ ...input, userName: ctx.user.name }).where(eq(mentoringPosts.id, old.id));
    else await db.insert(mentoringPosts).values({ ...input, userId: ctx.user.id, userName: ctx.user.name });
    await audit(ctx.user, "维护传帮带名片", "training.mentoring", input.skills);
    return { ok: true };
  }),
  remove: authedProcedure.mutation(async ({ ctx }) => {
    await getDb().delete(mentoringPosts).where(eq(mentoringPosts.userId, ctx.user.id));
    return { ok: true };
  }),
});

export async function activeAdminIds() {
  const rows = await getDb().select().from(users);
  return rows.filter((u) => u.active && (u.role === "super_admin" || u.isAdmin)).map((u) => u.id);
}
