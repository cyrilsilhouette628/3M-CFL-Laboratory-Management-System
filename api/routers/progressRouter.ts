// 2.2 学生科研进度（管理员看全部，学生看自己）+ 2.3 合作者科研工作（仅管理员）
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permProcedure, audit, studentsOfMentor, isOwnerOrParticipant } from "../auth";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { studentProgress, collaborations, users } from "@db/schema";

const nodeEnum = z.enum(["not_started", "ongoing", "done"]);

async function canAccessStudent(studentId: number, user: { id: number; role: string }, profile: string) {
  if (profile === "super_admin") return true;
  if (["grad", "benyan", "intern"].includes(user.role)) return studentId === user.id;
  if (["teacher", "postdoc", "admin"].includes(profile)) return (await studentsOfMentor(user.id)).includes(studentId);
  return false;
}
async function assertProgressAccess(id: number, user: { id: number; role: string }, profile: string) {
  const [row] = await getDb().select().from(studentProgress).where(eq(studentProgress.id, id)).limit(1);
  if (!row || !(await canAccessStudent(row.studentId, user, profile))) throw new TRPCError({ code: "NOT_FOUND", message: "科研进度不存在或无权访问" });
  return row;
}

export const progressRouter = createRouter({
  list: permProcedure("training.grads", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(studentProgress).orderBy(desc(studentProgress.id));
    const allUsers = await db.select().from(users);
    const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;
    const scoped = [];
    for (const row of rows) if (await canAccessStudent(row.studentId, ctx.user, ctx.profile)) scoped.push(row);
    return scoped.map((r) => ({ ...r, studentName: nameOf(r.studentId) }));
  }),

  upsert: permProcedure("training.grads", "editable")
    .input(
      z.object({
        id: z.number().optional(),
        studentId: z.number(),
        topic: z.string().min(1),
        stageGoal: z.string().optional(),
        proposalStatus: nodeEnum.default("not_started"),
        midtermStatus: nodeEnum.default("not_started"),
        defenseStatus: nodeEnum.default("not_started"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...rest } = input;
      if (id) {
        await assertProgressAccess(id, ctx.user, ctx.profile);
        if (!(await canAccessStudent(rest.studentId, ctx.user, ctx.profile))) throw new TRPCError({ code: "FORBIDDEN", message: "不能将进度转给指导范围外的学生" });
        await db.update(studentProgress).set({ ...rest, updatedAt: new Date() }).where(eq(studentProgress.id, id));
      } else {
        if (!(await canAccessStudent(rest.studentId, ctx.user, ctx.profile))) throw new TRPCError({ code: "FORBIDDEN", message: "只能维护本人或名下学生的科研进度" });
        await db.insert(studentProgress).values({ ...rest, reports: [] });
      }
      await audit(ctx.user, "更新学生科研进度", "research.studentProgress", input.topic);
      return { ok: true };
    }),

  addReport: permProcedure("training.grads", "editable")
    .input(z.object({ id: z.number(), type: z.enum(["week", "month"]), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const row = await assertProgressAccess(input.id, ctx.user, ctx.profile);
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const reports = [{ type: input.type, content: input.content, date }, ...row.reports];
      await db.update(studentProgress).set({ reports, updatedAt: new Date() }).where(eq(studentProgress.id, input.id));
      await audit(ctx.user, "提交汇报", "research.studentProgress", `${input.type === "week" ? "周报" : "月报"}`);
      return { ok: true };
    }),

  remove: permProcedure("training.grads", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertProgressAccess(input.id, ctx.user, ctx.profile);
      await getDb().delete(studentProgress).where(eq(studentProgress.id, input.id));
      await audit(ctx.user, "删除进度记录", "research.studentProgress", `#${input.id}`);
      return { ok: true };
    }),
});

const collabInput = z.object({
  title: z.string().min(1),
  partner: z.string().min(1),
  partnerOrg: z.string().optional(),
  division: z.string().optional(),
  outputs: z.string().optional(),
  status: z.enum(["ongoing", "done", "paused"]).default("ongoing"),
  startDate: z.string().optional(),
  ownerId: z.number().optional(),
  participantIds: z.array(z.number()).default([]),
});

async function assertCollabAccess(id: number, userId: number, profile: string) {
  const [row] = await getDb().select().from(collaborations).where(eq(collaborations.id, id)).limit(1);
  if (!row || (profile !== "super_admin" && !isOwnerOrParticipant(userId, row.ownerId, row.participantIds ?? []))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "合作课题不存在或无权访问" });
  }
  return row;
}

export const collabRouter = createRouter({
  list: permProcedure("research.collaborations", "readonly").query(async ({ ctx }) => {
    const rows = await getDb().select().from(collaborations).orderBy(desc(collaborations.id));
    return rows
      .filter((row) => ctx.profile === "super_admin" || isOwnerOrParticipant(ctx.user.id, row.ownerId, row.participantIds ?? []))
      .map((row) => ({ ...row, participantIds: row.participantIds ?? [] }));
  }),
  create: permProcedure("research.collaborations", "editable")
    .input(collabInput)
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(collaborations).values({ ...input, ownerId: input.ownerId ?? ctx.user.id });
      await audit(ctx.user, "新增合作课题", "research.collaborations", input.title);
      return { ok: true };
    }),
  update: permProcedure("research.collaborations", "editable")
    .input(collabInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertCollabAccess(id, ctx.user.id, ctx.profile);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(collaborations).set(patch).where(eq(collaborations.id, id));
      await audit(ctx.user, "编辑合作课题", "research.collaborations", `#${id}`);
      return { ok: true };
    }),
  remove: permProcedure("research.collaborations", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollabAccess(input.id, ctx.user.id, ctx.profile);
      await getDb().delete(collaborations).where(eq(collaborations.id, input.id));
      await audit(ctx.user, "删除合作课题", "research.collaborations", `#${input.id}`);
      return { ok: true };
    }),
});
