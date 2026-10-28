import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use("/api/trpc/*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// 课题组网站只读 Feed API（拉模式）：网站前端定时拉取已推送内容
// 鉴权：若【配置·外部接口·课题组网站】设置了 feedToken，则需 ?token= 匹配
app.get("/api/public/website-feed", async (c) => {
  const { getDb } = await import("./queries/connection");
  const { websiteUpdates, externalConfigs } = await import("@db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const db = getDb();
  const [site] = await db.select().from(externalConfigs).where(eq(externalConfigs.key, "website")).limit(1);
  const token = site?.config?.feedToken;
  if (token && c.req.query("token") !== token) {
    return c.json({ error: "invalid token" }, 401);
  }
  const rows = await db
    .select()
    .from(websiteUpdates)
    .where(eq(websiteUpdates.status, "pushed"))
    .orderBy(desc(websiteUpdates.pushedAt))
    .limit(200);
  return c.json({
    site: "3M-CFL",
    generatedAt: new Date().toISOString(),
    items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, payload: r.payload, pushedAt: r.pushedAt })),
  });
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
