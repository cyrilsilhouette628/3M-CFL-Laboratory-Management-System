// V9：数据备份与恢复（仅超级管理员）
// 导出：全表打包为 JSON，可选用口令 AES-256-GCM 加密；导入：清空业务数据后整包恢复（含文件附件 base64）
import { z } from "zod";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { superAdminProcedure, audit } from "../auth";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";

const APP_TAG = "lab-lms-backup";
const BACKUP_VERSION = 1;

// ---- 底层 helpers ----

async function listTables(): Promise<string[]> {
  const db = getDb();
  const r: any = await db.execute(sql`
    SELECT TABLE_NAME AS t FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
  const rows = Array.isArray(r[0]) ? r[0] : r;
  return rows.map((x: any) => String(x.t ?? x.TABLE_NAME));
}

async function selectAll(table: string): Promise<any[]> {
  const r: any = await getDb().execute(sql.raw(`SELECT * FROM \`${table}\``));
  return Array.isArray(r[0]) ? r[0] : r;
}

// 导入时的值规整：JSON 列对象→字符串；ISO 日期→MySQL datetime；boolean→0/1
function conv(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(v);
    if (m) return `${m[1]} ${m[2]}`;
    return v;
  }
  return v;
}

// ---- 口令加解密（AES-256-GCM，scrypt 派生密钥）----

function encryptJson(plain: string, passphrase: string) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    encrypted: true as const, app: APP_TAG, kdf: "scrypt", algo: "aes-256-gcm",
    salt: salt.toString("base64"), iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"), payload: data.toString("base64"),
  };
}

function decryptJson(bundle: any, passphrase: string): string {
  try {
    const key = crypto.scryptSync(passphrase, Buffer.from(bundle.salt, "base64"), 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(bundle.iv, "base64"));
    decipher.setAuthTag(Buffer.from(bundle.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(bundle.payload, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "解密失败：口令错误或备份文件已损坏" });
  }
}

type BundleData = Record<string, any[]>;

function makeBundle(data: BundleData) {
  const tables: Record<string, number> = {};
  let total = 0;
  for (const [t, rows] of Object.entries(data)) { tables[t] = rows.length; total += rows.length; }
  return { app: APP_TAG, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), totalRows: total, tables, data };
}

function parseBundle(raw: string, passphrase?: string): ReturnType<typeof makeBundle> {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "备份文件不是有效的 JSON" }); }
  if (parsed?.encrypted) {
    if (!passphrase) throw new TRPCError({ code: "BAD_REQUEST", message: "该备份已加密，请输入备份口令" });
    const plain = decryptJson(parsed, passphrase);
    try { parsed = JSON.parse(plain); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "解密后内容异常" }); }
  }
  if (parsed?.app !== APP_TAG || typeof parsed?.data !== "object" || !parsed.data) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "不是本系统生成的备份文件" });
  }
  return parsed;
}

export const backupRouter = createRouter({
  // 各表记录数（导出前预览 / 导入后核对）
  stats: superAdminProcedure.query(async () => {
    const tables = await listTables();
    const db = getDb();
    const out: { table: string; rows: number }[] = [];
    for (const t of tables) {
      const r: any = await db.execute(sql.raw(`SELECT COUNT(*) AS c FROM \`${t}\``));
      const rows = Array.isArray(r[0]) ? r[0] : r;
      out.push({ table: t, rows: Number(rows[0]?.c ?? 0) });
    }
    return out;
  }),

  // 导出全量数据（可选口令加密；返回 bundle，由前端落盘为文件）
  exportAll: superAdminProcedure
    .input(z.object({ passphrase: z.string().min(4).max(64).optional() }))
    .mutation(async ({ ctx, input }) => {
      const tables = await listTables();
      const data: BundleData = {};
      for (const t of tables) data[t] = await selectAll(t);
      const bundle = makeBundle(data);
      await audit(ctx.user, "导出全量数据备份", "config.backup");
      if (input.passphrase) {
        return { file: encryptJson(JSON.stringify(bundle), input.passphrase), meta: { exportedAt: bundle.exportedAt, totalRows: bundle.totalRows, encrypted: true } };
      }
      return { file: bundle, meta: { exportedAt: bundle.exportedAt, totalRows: bundle.totalRows, encrypted: false } };
    }),

  // 导入全量数据（清空式恢复；需输入确认语）
  importAll: superAdminProcedure
    .input(z.object({
      fileContent: z.string().max(200 * 1024 * 1024),
      passphrase: z.string().max(64).optional(),
      confirm: z.literal("清空并导入"),
    }))
    .mutation(async ({ ctx, input }) => {
      const bundle = parseBundle(input.fileContent, input.passphrase || undefined);
      const existing = new Set(await listTables());
      const results: { table: string; rows: number }[] = [];

      // 先整体校验表名合法性，再执行任何清空动作
      for (const t of Object.keys(bundle.data)) {
        if (!existing.has(t)) throw new TRPCError({ code: "BAD_REQUEST", message: `备份中包含未知数据表：${t}` });
      }

      // 导入用原生 mysql2 连接（参数绑定，避免拼接 SQL 注入/转义问题）
      const conn = await mysql.createConnection(env.databaseUrl);
      try {
        await conn.query("SET FOREIGN_KEY_CHECKS=0");
        // 与库内历史数据兼容：个别 NOT NULL JSON 列在早期非严格模式下存过 NULL，
        // 导入侧放宽 sql_mode，保证"导出什么就能原样恢复什么"
        await conn.query("SET SESSION sql_mode=''");
        // 先清空备份中涉及的所有表
        for (const t of Object.keys(bundle.data)) {
          await conn.query(`DELETE FROM \`${t}\``);
        }
        // 再逐表逐行写入
        for (const [t, rows] of Object.entries(bundle.data) as [string, any[]][]) {
          for (const row of rows) {
            const cols = Object.keys(row);
            const placeholders = cols.map(() => "?").join(",");
            const values = cols.map((c) => conv(row[c]));
            await conn.query(
              `INSERT INTO \`${t}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${placeholders})`,
              values,
            );
          }
          results.push({ table: t, rows: rows.length });
        }
      } finally {
        await conn.query("SET FOREIGN_KEY_CHECKS=1").catch(() => {});
        await conn.end();
      }
      await audit(ctx.user, `导入全量数据备份（${bundle.totalRows} 行）`, "config.backup");
      return { ok: true, exportedAt: bundle.exportedAt, results };
    }),
});
