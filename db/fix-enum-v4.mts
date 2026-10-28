import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const db = getDb();
await db.execute(sql.raw("ALTER TABLE achievements MODIFY COLUMN category ENUM('published_paper','patent','award','student_work','book','software_copyright') NOT NULL"));
await db.execute(sql.raw("ALTER TABLE papers MODIFY COLUMN status ENUM('writing','submitted','under_review','revision','accepted','online','indexed','rejected') NOT NULL DEFAULT 'writing'"));
console.log("enums narrowed");
process.exit(0);
