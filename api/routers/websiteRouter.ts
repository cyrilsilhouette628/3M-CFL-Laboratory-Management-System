// 6.2 网站更新（一键网站内容更新）+ 6.3 外部接口配置
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permProcedure, superAdminProcedure, audit } from "../auth";
import { getDb } from "../queries/connection";
import { websiteUpdates, externalConfigs } from "@db/schema";

export const websiteRouter = createRouter({
  // 待更新队列 + 历史
  list: permProcedure("config.website", "readonly").query(async () => {
    const rows = await getDb().select().from(websiteUpdates).orderBy(desc(websiteUpdates.id));
    return {
      pending: rows.filter((r) => r.status === "pending"),
      pushed: rows.filter((r) => r.status === "pushed").slice(0, 100),
    };
  }),

  // 手工补录条目
  create: superAdminProcedure
    .input(
      z.object({
        type: z.string().min(1),
        title: z.string().min(1),
        payload: z.record(z.string(), z.string()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(websiteUpdates).values({
        ...input,
        source: "manual",
        createdBy: ctx.user.id,
        createdByName: ctx.user.name,
      });
      await audit(ctx.user, "手工新增网站更新条目", "config.website", input.title);
      return { ok: true };
    }),

  // 推送前删除待更新条目
  discard: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(websiteUpdates).set({ status: "discarded" }).where(eq(websiteUpdates.id, input.id));
      await audit(ctx.user, "移除网站更新条目", "config.website", `#${input.id}`);
      return { ok: true };
    }),

  // 确认推送（网站经 Feed API / Webhook 获取）
  pushAll: superAdminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(websiteUpdates)
        .set({ status: "pushed", pushedBy: ctx.user.id, pushedByName: ctx.user.name, pushedAt: new Date() })
        .where(inArray(websiteUpdates.id, input.ids));
      // 读取网站接口配置，说明推送通道
      const [site] = await db.select().from(externalConfigs).where(eq(externalConfigs.key, "website")).limit(1);
      const url = site?.config?.siteUrl;
      const webhook = site?.config?.webhookUrl;
      await audit(ctx.user, "一键推送网站更新", "config.website", `推送 ${input.ids.length} 条`);
      return {
        ok: true,
        count: input.ids.length,
        channel: webhook
          ? `已通过 Webhook 推送至 ${webhook}（模拟），并可在 ${url ?? "课题组网站"} 经 Feed API 拉取`
          : `已发布到 Feed API（/api/public/website-feed），${url ?? "课题组网站"} 可定时拉取`,
      };
    }),
});

// ---- 6.3 外部接口配置 ----
const CONFIG_DEFAULTS: Record<string, { name: string; fields: { key: string; label: string; secret?: boolean }[] }> = {
  llm: {
    name: "平台 AI 文档解析",
    // 模型、网关与凭证由平台按站点供给，不能在页面填写或硬编码。
    fields: [],
  },
  wos: {
    name: "Web of Science API",
    fields: [{ key: "apiKey", label: "API Key", secret: true }],
  },
  website: {
    name: "课题组网站",
    fields: [
      { key: "siteUrl", label: "网站地址" },
      { key: "feedToken", label: "Feed 访问 Token", secret: true },
      { key: "webhookUrl", label: "Webhook 推送地址（可选）" },
    ],
  },
  caldav: {
    name: "CalDAV 日历同步",
    fields: [
      { key: "server", label: "服务器地址" },
      { key: "username", label: "账号" },
      { key: "password", label: "应用密码", secret: true },
    ],
  },
};

export const configRouter = createRouter({
  // 列出全部外部接口（含字段定义；密钥仅回显掩码）
  list: permProcedure("config.integrations", "readonly").query(async () => {
    const rows = await getDb().select().from(externalConfigs);
    return Object.entries(CONFIG_DEFAULTS).map(([key, def]) => {
      const row = rows.find((r) => r.key === key);
      const config: Record<string, string> = {};
      for (const f of def.fields) {
        const v = row?.config?.[f.key] ?? "";
        config[f.key] = f.secret && v ? "••••••••" : v;
      }
      return { key, name: def.name, fields: def.fields, config, enabled: key === "llm" ? true : (row?.enabled ?? false) };
    });
  }),

  save: permProcedure("config.integrations", "manage")
    .input(
      z.object({
        key: z.enum(["llm", "wos", "website", "caldav"]),
        config: z.record(z.string(), z.string()),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [exist] = await db.select().from(externalConfigs).where(eq(externalConfigs.key, input.key)).limit(1);
      // 掩码值不回写，保留原密钥
      const merged: Record<string, string> = { ...(exist?.config ?? {}) };
      for (const [k, v] of Object.entries(input.config)) {
        if (v !== "••••••••") merged[k] = v;
      }
      if (exist) {
        await db
          .update(externalConfigs)
          .set({ config: merged, enabled: input.enabled, updatedBy: ctx.user.id, updatedAt: new Date() })
          .where(eq(externalConfigs.id, exist.id));
      } else {
        await db.insert(externalConfigs).values({
          key: input.key,
          name: CONFIG_DEFAULTS[input.key].name,
          config: merged,
          enabled: input.enabled,
          updatedBy: ctx.user.id,
        });
      }
      await audit(ctx.user, "保存外部接口配置", "config.integrations", input.key);
      return { ok: true };
    }),

  // 连接测试（原型为模拟；正式环境按 key 调用真实接口）
  test: permProcedure("config.integrations", "manage")
    .input(z.object({ key: z.enum(["llm", "wos", "website", "caldav"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.key === "llm") return { ok: true, message: "平台 AI 由站点统一供给，无需在此配置或测试连接。" };
      const [row] = await getDb().select().from(externalConfigs).where(eq(externalConfigs.key, input.key)).limit(1);
      await audit(ctx.user, "测试外部接口", "config.integrations", input.key);
      if (!row?.enabled) return { ok: false, message: "该接口未启用，请先保存并启用" };
      const msgs: Record<string, string> = {
        wos: "WoS API 鉴权通过，可拉取他引数据（模拟测试）",
        website: `Feed API 可用：/api/public/website-feed${row.config.feedToken ? "?token=***" : ""}（模拟测试）`,
        caldav: `CalDAV 服务器 ${row.config.server ?? ""}  reachable，待办可同步到手机日历（模拟测试）`,
      };
      return { ok: true, message: msgs[input.key] };
    }),
});
