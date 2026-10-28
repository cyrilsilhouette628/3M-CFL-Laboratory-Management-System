// V9：正式部署前数据清理 —— 清空全部业务/测试数据，仅保留账号体系与系统配置
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const KEEP = new Set(["users", "role_permissions", "external_configs"]);

const db = getDb();
const t: any = await db.execute(sql`SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE='BASE TABLE'`);
const tables = (Array.isArray(t[0]) ? t[0] : t).map((x: any) => String(x.t));
await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS=0"));
for (const tb of tables) {
  if (KEEP.has(tb)) continue;
  await db.execute(sql.raw(`TRUNCATE TABLE \`${tb}\``));
}
await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS=1"));
console.log("cleaned:", tables.filter((x: string) => !KEEP.has(x)).length, "tables; kept:", [...KEEP].join(","));
process.exit(0);
