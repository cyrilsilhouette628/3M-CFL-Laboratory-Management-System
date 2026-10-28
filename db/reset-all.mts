
import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [rows] = await conn.query("SELECT table_name t FROM information_schema.tables WHERE table_schema = DATABASE()");
await conn.query("SET FOREIGN_KEY_CHECKS=0");
for (const r of rows as any[]) await conn.query(`TRUNCATE TABLE \`${r.t}\``);
await conn.query("SET FOREIGN_KEY_CHECKS=1");
console.log("truncated", (rows as any[]).length, "tables");
await conn.end();
