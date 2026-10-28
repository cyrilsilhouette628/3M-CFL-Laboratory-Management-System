// 需求 10：内容审核队列（config.review）
// 规则：超管/管理员提交免审；普通用户提交的文档需审核；访客只允许浏览。
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { permProcedure, audit, createAutoTodo, completeSourceTodos } from "../auth";
import { getDb } from "../queries/connection";
import { files, users } from "@db/schema";

function adminOnly(profile: string) {
  if (profile !== "super_admin" && profile !== "admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问内容审核" });
}

export const reviewRouter = createRouter({
  // 审核队列：待审文件列表（附上传者姓名）
  pending: permProcedure("config.review", "readonly").query(async ({ ctx }) => {
    adminOnly(ctx.profile);
    const db = getDb();
    const rows = (await db.select().from(files).orderBy(desc(files.id))).filter(
      (f) => f.reviewStatus === "pending",
    );
    const allUsers = await db.select().from(users);
    const nameOf = (id: number | null) => (id ? allUsers.find((u) => u.id === id)?.name ?? `#${id}` : "系统");
    return rows.map(({ dataBase64: _, ...f }) => ({ ...f, uploaderName: nameOf(f.uploadedBy) }));
  }),

  // 审核历史
  history: permProcedure("config.review", "readonly").query(async ({ ctx }) => {
    adminOnly(ctx.profile);
    const db = getDb();
    const rows = (await db.select().from(files).orderBy(desc(files.id))).filter(
      (f) => f.reviewStatus !== "pending",
    );
    const allUsers = await db.select().from(users);
    const nameOf = (id: number | null) => (id ? allUsers.find((u) => u.id === id)?.name ?? `#${id}` : "系统");
    return rows.slice(0, 100).map(({ dataBase64: _, ...f }) => ({ ...f, uploaderName: nameOf(f.uploadedBy) }));
  }),

  // 通过 / 驳回（驳回需填写原因）→ 结果通知提交者
  decide: permProcedure("config.review", "manage")
    .input(
      z.object({
        id: z.number(),
        approve: z.boolean(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.profile);
      if (!input.approve && !input.note)
        throw new TRPCError({ code: "BAD_REQUEST", message: "驳回时请填写原因" });
      const db = getDb();
      const [f] = await db.select().from(files).where(eq(files.id, input.id)).limit(1);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
      if (f.reviewStatus !== "pending")
        throw new TRPCError({ code: "BAD_REQUEST", message: "该文件已审核" });
      await db
        .update(files)
        .set({ reviewStatus: input.approve ? "approved" : "rejected", reviewNote: input.note })
        .where(eq(files.id, input.id));
      await completeSourceTodos("content_review", f.id, ctx.user.id);
      if (f.uploadedBy && !input.approve) {
        await createAutoTodo({
          title: `文档审核${input.approve ? "通过" : "被驳回"}：${f.fileName}`,
          description: input.approve
            ? `${ctx.user.name} 审核通过了您提交的文件。`
            : `${ctx.user.name} 驳回了您提交的文件。原因：${input.note}`,
          priority: input.approve ? "low" : "high",
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [f.uploadedBy],
          source: "review_result",
          sourceRefId: f.id,
          link: "/config/review",
        });
      }
      await audit(ctx.user, input.approve ? "审核通过" : "审核驳回", "config.review", f.fileName);
      return { ok: true };
    }),
});
