// V3 迁移第一步：角色枚举平滑过渡（先扩枚举，再改数据，之后由 db:push 收敛新 schema）
// 运行：npx tsx db/migrate-v3.ts
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  console.log("Step 1: 扩展 role 枚举（新旧并存）...");
  await db.execute(
    sql`ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','teacher','postdoc','grad','benyan','intern','guest','project_admin','student','undergrad','collaborator') NOT NULL DEFAULT 'grad'`,
  );
  console.log("Step 2: 迁移存量用户角色...");
  await db.execute(sql`UPDATE users SET role='teacher' WHERE role='project_admin'`);
  await db.execute(sql`UPDATE users SET role='grad' WHERE role='student'`);
  await db.execute(sql`UPDATE users SET role='benyan' WHERE role='undergrad'`);
  await db.execute(sql`UPDATE users SET role='guest' WHERE role='collaborator'`);
  const rows = await db.execute(sql`SELECT id, username, role FROM users`);
  console.log("当前用户：", JSON.stringify(rows[0]));
  console.log("完成。请接着运行 npm run db:push，再运行 npx tsx db/seed-v3.ts");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
