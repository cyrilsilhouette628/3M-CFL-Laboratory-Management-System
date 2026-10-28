import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const db = getDb();
const t = await db.execute(sql.raw("SHOW TABLES"));
const names = (t[0] as unknown as Record<string, string>[]).map((r) => Object.values(r)[0]);
for (const want of ["advisor_map","weekly_reports","paper_rounds","ref_directions","devices","device_bookings","device_maintenance"]) {
  console.log(want, names.includes(want) ? "EXISTS" : "MISSING");
}
process.exit(0);
