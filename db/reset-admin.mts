/** 交付状态复位：所有种子账号密码重置为 123456，全员强制首登设置；admin 显示名归位 */
import "dotenv/config";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync("123456", salt, 64).toString("hex");
await conn.query("UPDATE users SET password_hash = ?", [`${salt}:${hash}`]);
await conn.query("UPDATE users SET name = 'admin' WHERE username = 'admin'");
await conn.query("UPDATE users SET must_change_password = 1, must_complete_profile = 1, restricted = 0, active = 1");
console.log("all users -> password 123456, first-login flags = 1, restricted = 0");
await conn.end();
