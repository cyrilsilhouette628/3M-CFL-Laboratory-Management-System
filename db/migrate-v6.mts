// V6 迁移：导师位次(advisor_map.ord) / 论文转成果回链(papers.achievement_id) / 成果-项目资助关联(project_outputs)
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function columnExists(table: string, column: string): Promise<boolean> {
  const db = getDb();
  const rows: any = await db.execute(sql`
    SELECT COUNT(*) AS c FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`);
  return Number(rows[0]?.[0]?.c ?? rows[0]?.c ?? 0) > 0;
}
async function tableExists(table: string): Promise<boolean> {
  const db = getDb();
  const rows: any = await db.execute(sql`
    SELECT COUNT(*) AS c FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`);
  return Number(rows[0]?.[0]?.c ?? rows[0]?.c ?? 0) > 0;
}
async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) { console.log(`skip ${table}.${column}`); return; }
  await getDb().execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${ddl}`));
  console.log(`added ${table}.${column}`);
}

async function main() {
  const db = getDb();

  // 1. advisor_map.ord（1=主导师）
  await addColumn("advisor_map", "ord", "`ord` INT NOT NULL DEFAULT 1");
  // 存量回填：按每学生的 id 顺序编位次
  const maps: any = await db.execute(sql`SELECT id, student_id FROM advisor_map ORDER BY student_id, id`);
  const rows: { id: number; student_id: number }[] = maps[0] ?? maps;
  const counter = new Map<number, number>();
  for (const r of rows) {
    const n = (counter.get(r.student_id) ?? 0) + 1;
    counter.set(r.student_id, n);
    await db.execute(sql`UPDATE advisor_map SET ord = ${n} WHERE id = ${r.id}`);
  }
  console.log("advisor_map.ord backfilled");

  // 2. papers.achievement_id（转成果回链，幂等防重复登记）
  await addColumn("papers", "achievement_id", "`achievement_id` BIGINT UNSIGNED NULL");

  // 3. project_outputs（成果×项目 资助关联，ord=资助排名）
  if (!(await tableExists("project_outputs"))) {
    await db.execute(sql.raw(`
      CREATE TABLE project_outputs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT UNSIGNED NOT NULL,
        output_type ENUM('paper','achievement') NOT NULL,
        output_id BIGINT UNSIGNED NOT NULL,
        ord INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`));
    console.log("created project_outputs");
  } else console.log("skip project_outputs");

  console.log("V6 migration done");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
