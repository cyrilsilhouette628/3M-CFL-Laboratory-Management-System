import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const db = getDb();
for (const t of ["advisor_map","weekly_reports","paper_rounds","ref_directions","devices","device_bookings","device_maintenance","projects","todos","files","references"]) {
  const c = await db.execute(sql.raw(`SHOW COLUMNS FROM ${t === "references" ? "`references`" : t}`));
  console.log(t + ":", (c[0] as unknown as { Field: string }[]).map((r) => r.Field).join(","));
}
process.exit(0);
