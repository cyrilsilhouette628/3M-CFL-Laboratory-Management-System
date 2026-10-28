// V4 迁移（push 前执行）：补列、枚举放宽、成果项目并入 projects、文件审核回填
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

const db = getDb();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await db.execute(
    sql`SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`,
  );
  return Number((rows[0] as unknown as { c: number }[])[0].c) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`skip ${table}.${column}（已存在）`);
    return;
  }
  await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${ddl}`));
  console.log(`added ${table}.${column}`);
}

// 1. papers.status 枚举放宽（新旧并集），再把旧值 review → under_review
await db.execute(
  sql.raw(
    "ALTER TABLE papers MODIFY COLUMN status ENUM('writing','submitted','review','under_review','revision','accepted','online','indexed','rejected') NOT NULL DEFAULT 'writing'",
  ),
);
await db.execute(sql.raw("UPDATE papers SET status='under_review' WHERE status='review'"));
console.log("papers.status: review → under_review");

// 2. 新列
await addColumn("todos", "link", "link VARCHAR(255) NULL AFTER source_ref_id");
await addColumn("projects", "category", "category ENUM('vertical','horizontal') NOT NULL DEFAULT 'vertical' AFTER code");
await addColumn("projects", "contract_file_ids", "contract_file_ids JSON NOT NULL AFTER milestones");
await addColumn("files", "review_status", "review_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER visibility");
await addColumn("files", "review_note", "review_note VARCHAR(255) NULL AFTER review_status");
await addColumn("`references`", "direction_id", "direction_id BIGINT UNSIGNED NULL AFTER id");

// 3. 成果管理中的 结题/在研/横向项目 → 迁入 projects
const rows = (await db.execute(
  sql.raw(
    "SELECT id, category, title, authors, year, date, detail, evidence_file_ids FROM achievements WHERE category IN ('concluded_project','ongoing_project','horizontal_project')",
  ),
))[0] as unknown as {
  id: number; category: string; title: string; authors: string | null; year: number;
  date: string | null; detail: Record<string, string>; evidence_file_ids: number[];
}[];
for (const r of rows) {
  const status = r.category === "concluded_project" ? "concluded" : "ongoing";
  const category = r.category === "horizontal_project" ? "horizontal" : "vertical";
  const d = r.detail ?? {};
  await db.execute(
    sql`INSERT INTO projects (name, code, category, source, leader, start_date, end_date, total_budget, received_amount, status, description, milestones, contract_file_ids)
        VALUES (${r.title}, ${d["项目编号"] ?? d["编号"] ?? null}, ${category}, ${d["来源"] ?? d["立项单位"] ?? null}, ${d["负责人"] ?? r.authors ?? null},
        ${d["开始日期"] ?? null}, ${d["结束日期"] ?? r.date ?? null}, ${Number(d["总经费"] ?? 0) || 0}, ${Number(d["已到账"] ?? 0) || 0},
        ${status}, ${JSON.stringify(d)}, ${JSON.stringify([
          { name: "立项", date: d["开始日期"] ?? "", status: "done" },
          ...(status === "concluded" ? [{ name: "结题", date: r.date ?? "", status: "done" }] : []),
        ])}, ${JSON.stringify(r.evidence_file_ids ?? [])})`,
  );
  await db.execute(sql`DELETE FROM achievements WHERE id = ${r.id}`);
  console.log(`moved achievement#${r.id}（${r.category}）→ projects`);
}

// 4. 既有文件一律视为已生效（approved 为默认值，无需回填；仅确保无 NULL）
await db.execute(sql.raw("UPDATE files SET review_status='approved' WHERE review_status IS NULL"));

console.log("migrate-v4 phase A done");
process.exit(0);
