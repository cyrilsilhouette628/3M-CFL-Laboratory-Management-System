// 认证路由：登录 / 登出 / 当前用户 / 修改密码
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { authedProcedure, verifyPassword, hashPassword, createSession, audit, isStrongPassword, STRONG_PASSWORD_HINT } from "../auth";
import { getDb } from "../queries/connection";
import { users, sessions } from "@db/schema";

export const authRouter = createRouter({
  login: publicQuery
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用户名或密码错误" });
      }
      if (!user.active) throw new TRPCError({ code: "FORBIDDEN", message: "账号已被停用" });
      const token = await createSession(user.id);
      await audit(user, "登录", "auth", `用户 ${user.name} 登录成功`);
      const { passwordHash: _, ...safe } = user;
      return { token, user: safe };
    }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    const header = ctx.req.headers.get("authorization") || "";
    const token = header.slice(7);
    await getDb().delete(sessions).where(eq(sessions.token, token));
    await audit(ctx.user, "登出", "auth");
    return { ok: true };
  }),

  me: authedProcedure.query(async ({ ctx }) => {
    const { passwordHash: _, ...safe } = ctx.user;
    return safe;
  }),

  changePassword: authedProcedure
    .input(z.object({ oldPassword: z.string(), newPassword: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!verifyPassword(input.oldPassword, ctx.user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "原密码错误" });
      }
      // V10：强密码规则（与其他信息系统一致：≥8 位 + 大小写字母 + 数字）
      if (!isStrongPassword(input.newPassword, ctx.user.username)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `密码强度不足：${STRONG_PASSWORD_HINT}` });
      }
      await getDb()
        .update(users)
        .set({ passwordHash: hashPassword(input.newPassword), mustChangePassword: false })
        .where(eq(users.id, ctx.user.id));
      await audit(ctx.user, "修改密码", "auth");
      return { ok: true };
    }),
});
