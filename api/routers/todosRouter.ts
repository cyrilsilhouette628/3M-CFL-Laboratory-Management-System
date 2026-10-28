// 模块一：待办事项 —— 按登录用户隔离（创建者/牵头人/参与人可见）
import { z } from "zod";
import { desc } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProcedure, audit } from "../auth";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { todos } from "@db/schema";
import { eq } from "drizzle-orm";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function visibleTo(t: typeof todos.$inferSelect, userId: number) {
  return (
    t.creatorId === userId || t.leaderIds.includes(userId) || t.participantIds.includes(userId)
  );
}

export const todosRouter = createRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await getDb().select().from(todos).orderBy(desc(todos.id));
    const mine = rows.filter((t) => visibleTo(t, ctx.user.id));
    const today = todayStr();
    // 逾期标记：未完成且到期日早于今天
    return mine.map((t) => ({
      ...t,
      overdue: t.status === "pending" && !!t.dueDate && t.dueDate < today,
    }));
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        dueDate: z.string().optional(),
        pinned: z.boolean().default(false),
        leaderIds: z.array(z.number()).default([]),
        participantIds: z.array(z.number()).default([]),
        attachmentFileIds: z.array(z.number()).default([]),
        category: z.string().max(64).optional(), // V5 需求 6：属性（一级/二级标题）
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const leaderIds = input.leaderIds.length > 0 ? input.leaderIds : [ctx.user.id];
      await getDb().insert(todos).values({
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate,
        pinned: input.pinned,
        creatorId: ctx.user.id,
        creatorName: ctx.user.name,
        leaderIds,
        participantIds: input.participantIds,
        attachmentFileIds: input.attachmentFileIds,
        source: "manual",
        category: input.category ?? null,
      });
      await audit(ctx.user, "新增待办", "todo", input.title);
      return { ok: true };
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        dueDate: z.string().nullable().optional(),
        pinned: z.boolean().optional(),
        leaderIds: z.array(z.number()).optional(),
        participantIds: z.array(z.number()).optional(),
        attachmentFileIds: z.array(z.number()).optional(),
        category: z.string().max(64).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [existing] = await getDb().select().from(todos).where(eq(todos.id, id)).limit(1);
      if (!existing || !visibleTo(existing, ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "待办不存在或无权访问" });
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(todos).set(patch).where(eq(todos.id, id));
      await audit(ctx.user, "编辑待办", "todo", `#${id}`);
      return { ok: true };
    }),

  toggle: authedProcedure
    .input(z.object({ id: z.number(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await getDb().select().from(todos).where(eq(todos.id, input.id)).limit(1);
      if (!existing || !visibleTo(existing, ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "待办不存在或无权访问" });
      await getDb()
        .update(todos)
        .set({
          status: input.done ? "done" : "pending",
          completedAt: input.done ? new Date() : null,
        })
        .where(eq(todos.id, input.id));
      return { ok: true };
    }),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const [existing] = await getDb().select().from(todos).where(eq(todos.id, input.id)).limit(1);
    if (!existing || !visibleTo(existing, ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "待办不存在或无权访问" });
    await getDb().delete(todos).where(eq(todos.id, input.id));
    await audit(ctx.user, "删除待办", "todo", `#${input.id}`);
    return { ok: true };
  }),
});
