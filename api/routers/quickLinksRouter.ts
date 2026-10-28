// V8 标注 1：常用网站链接（登录用户各自维护自己的链接清单，用于首页仪表盘快捷跳转）
import { z } from "zod";
import { asc, eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProcedure } from "../auth";
import { getDb } from "../queries/connection";
import { quickLinks } from "@db/schema";

const linkInput = z.object({
  title: z.string().min(1).max(120),
  url: z.string().min(1).max(500),
});

function normalizeUrl(url: string): string {
  const u = url.trim();
  // 未带协议时默认补 https://，避免相对跳转
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export const quickLinksRouter = createRouter({
  // 我的链接列表（按 ord、id 排序）
  list: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    return db.select().from(quickLinks)
      .where(eq(quickLinks.userId, ctx.user.id))
      .orderBy(asc(quickLinks.ord), asc(quickLinks.id));
  }),

  create: authedProcedure.input(linkInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const mine = await db.select().from(quickLinks).where(eq(quickLinks.userId, ctx.user.id));
    const ord = mine.length ? Math.max(...mine.map((l) => l.ord)) + 1 : 1;
    const r = await db.insert(quickLinks).values({
      userId: ctx.user.id, title: input.title.trim(), url: normalizeUrl(input.url), ord,
    });
    return { ok: true, id: Number(r[0].insertId) };
  }),

  update: authedProcedure.input(linkInput.extend({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.update(quickLinks)
      .set({ title: input.title.trim(), url: normalizeUrl(input.url) })
      .where(and(eq(quickLinks.id, input.id), eq(quickLinks.userId, ctx.user.id)));
    if (!r[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "链接不存在或无权修改" });
    return { ok: true };
  }),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const r = await db.delete(quickLinks)
      .where(and(eq(quickLinks.id, input.id), eq(quickLinks.userId, ctx.user.id)));
    if (!r[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "链接不存在或无权删除" });
    return { ok: true };
  }),

  // 上移/下移（与相邻项交换 ord）
  move: authedProcedure.input(z.object({ id: z.number(), dir: z.enum(["up", "down"]) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const mine = await db.select().from(quickLinks)
      .where(eq(quickLinks.userId, ctx.user.id))
      .orderBy(asc(quickLinks.ord), asc(quickLinks.id));
    const i = mine.findIndex((l) => l.id === input.id);
    const j = input.dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= mine.length) return { ok: true };
    await db.update(quickLinks).set({ ord: mine[j].ord }).where(eq(quickLinks.id, mine[i].id));
    await db.update(quickLinks).set({ ord: mine[i].ord }).where(eq(quickLinks.id, mine[j].id));
    return { ok: true };
  }),
});
