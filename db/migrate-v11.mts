/**
 * migrate-v11: users 新增 restricted（受限状态：可浏览，禁止增删改）
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [r] = await conn.query(
  `SELECT COUNT(*) c FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'restricted'`
);
if (Number((r as any[])[0].c) === 0) {
  await conn.query("ALTER TABLE users ADD COLUMN `restricted` tinyint(1) NOT NULL DEFAULT 0");
  console.log("added users.restricted");
} else console.log("skip users.restricted");
await conn.end();
console.log("migrate-v11 done");
