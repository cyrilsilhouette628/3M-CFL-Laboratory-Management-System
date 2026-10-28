// V8 迁移：常用网站链接（quick_links，每用户自管）
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function tableExists(table: string): Promise<boolean> {
  const db = getDb();
  const rows: any = await db.execute(sql`
    SELECT COUNT(*) AS c FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`);
  return Number(rows[0]?.[0]?.c ?? rows[0]?.c ?? 0) > 0;
}

async function main() {
  const db = getDb();
  if (await tableExists("quick_links")) { console.log("skip quick_links"); return; }
  await db.execute(sql.raw(`
    CREATE TABLE quick_links (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(120) NOT NULL,
      url VARCHAR(500) NOT NULL,
      ord INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_quick_links_user (user_id)
    )`));
  console.log("created quick_links");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
