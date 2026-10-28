import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const db = getDb();
const a = await db.execute(sql.raw("SELECT id, category, title FROM achievements"));
console.log("achievements:", JSON.stringify(a[0]));
const p = await db.execute(sql.raw("SELECT id, status, title FROM papers"));
console.log("papers:", JSON.stringify(p[0]));
process.exit(0);
