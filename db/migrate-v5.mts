// V5 迁移：用户字段扩展、待办属性列、培养档案节点表、历史待办属性回填
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

// 1. users 新字段（需求 7）
await addColumn("users", "id_card", "id_card VARCHAR(32) NULL AFTER homepage");
await addColumn("users", "main_campus", "main_campus VARCHAR(64) NULL AFTER id_card");
await addColumn("users", "campus", "campus VARCHAR(64) NULL AFTER main_campus");
await addColumn("users", "building", "building VARCHAR(64) NULL AFTER campus");
await addColumn("users", "room", "room VARCHAR(64) NULL AFTER building");
await addColumn("users", "enroll_year", "enroll_year INT NULL AFTER room");
await addColumn("users", "expected_grad_year", "expected_grad_year INT NULL AFTER enroll_year");

// 2. todos 属性列（需求 6）
await addColumn("todos", "category", "category VARCHAR(64) NULL AFTER link");

// 3. 培养档案节点表（需求 3）
await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS training_nodes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  node_type ENUM('入学','开题','中期','预答辩','答辩','毕业') NOT NULL,
  date VARCHAR(10) NULL,
  status ENUM('pending','done') NOT NULL DEFAULT 'pending',
  note VARCHAR(512) NULL,
  file_ids JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`));
console.log("training_nodes 表就绪");

// 4. 历史待办按 source 回填属性
const SOURCE_CATEGORY: Record<string, string> = {
  weekly_report: "人才培养/研究生培养",
  weekly_feedback: "人才培养/研究生培养",
  weekly_missing: "人才培养/研究生培养",
  doc_share: "人才培养/研究生培养",
  doc_feedback: "人才培养/研究生培养",
  training: "人才培养/研究生培养",
  device_booking: "仪器设备/预约使用",
  content_review: "系统配置/内容审核",
  review_result: "系统配置/内容审核",
  review: "科研管理/审稿情况",
  reference: "科研管理/重要参考文献",
  fund: "科研管理/科研项目管理",
  paper_round: "科研管理/投稿论文进度",
  project_milestone: "科研管理/科研项目管理",
  visit: "科研管理/专家来访管理",
  activity: "科研管理/学术活动管理",
  social_review: "社会服务",
  achievement: "成果管理/统计与年度盘点",
};
for (const [src, cat] of Object.entries(SOURCE_CATEGORY)) {
  // 全量覆盖：保证 V5 正式标签（首次回填的占位标签一并纠正）
  await db.execute(sql`UPDATE todos SET category = ${cat} WHERE source = ${src}`);
}
console.log("todos.category 历史回填完成");

console.log("migrate-v5 done");
process.exit(0);
