
import { getDb } from "../api/queries/connection";
import { externalConfigs } from "./schema";
const db = getDb();
const rows = await db.select().from(externalConfigs);
for (const r of rows) console.log(r.key, JSON.stringify(r.config));
process.exit(0);
