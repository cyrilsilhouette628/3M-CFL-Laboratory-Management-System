/**
 * migrate-v12: 新增 file_chunks 表（文件内容分块存储，规避 TiDB 单行 6MB 上限）
 * 幂等：已存在则跳过
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [rows] = await conn.query(
  "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'file_chunks'",
);
if ((rows as any[]).length) {
  console.log("file_chunks 已存在，跳过");
} else {
  await conn.query(`CREATE TABLE file_chunks (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    file_id bigint unsigned NOT NULL,
    seq int NOT NULL,
    data longtext NOT NULL,
    KEY idx_file_chunks_file (file_id)
  )`);
  console.log("file_chunks 创建完成");
}
await conn.end();
process.exit(0);
