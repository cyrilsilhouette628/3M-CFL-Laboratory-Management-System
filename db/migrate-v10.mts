/**
 * migrate-v10: 用户体系强化
 * 1) users 新增强制标记：must_change_password / must_complete_profile
 * 2) users 新增科研管理常用字段：gender / birth_date / staff_no / degree /
 *    alma_mater / political_status / join_date
 * 3) admin 显示名改为 "admin"；所有存量用户下次登录须改强密码并完善资料
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const conn = await mysql.createConnection(url);

async function hasCol(table: string, col: string): Promise<boolean> {
  const [r] = await conn.query(
    `SELECT COUNT(*) c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col]
  );
  return Number((r as any[])[0].c) > 0;
}
async function addCol(table: string, col: string, ddl: string) {
  if (await hasCol(table, col)) {
    console.log(`skip ${table}.${col}`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`added ${table}.${col}`);
}

await addCol("users", "must_change_password", "`must_change_password` tinyint(1) NOT NULL DEFAULT 1");
await addCol("users", "must_complete_profile", "`must_complete_profile` tinyint(1) NOT NULL DEFAULT 1");
await addCol("users", "gender", "`gender` varchar(10) NULL");
await addCol("users", "birth_date", "`birth_date` varchar(10) NULL");
await addCol("users", "staff_no", "`staff_no` varchar(50) NULL");
await addCol("users", "degree", "`degree` varchar(50) NULL");
await addCol("users", "alma_mater", "`alma_mater` varchar(200) NULL");
await addCol("users", "political_status", "`political_status` varchar(50) NULL");
await addCol("users", "join_date", "`join_date` varchar(10) NULL");

// 存量用户：全部要求下次登录改强密码 + 完善基本信息
await conn.query("UPDATE users SET must_change_password = 1, must_complete_profile = 1");
// 超级管理员显示名统一为 admin
await conn.query("UPDATE users SET name = 'admin' WHERE username = 'admin'");

console.log("migrate-v10 done");
await conn.end();
