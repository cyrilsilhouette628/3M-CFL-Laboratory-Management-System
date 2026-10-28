// V4 种子：师生映射、周报迁移与演示、文献方向、仪器设备演示、待办链接回填
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

const db = getDb();
const q = async (s: string) => (await db.execute(sql.raw(s)))[0] as unknown as Record<string, unknown>[];

// ---- 1. 导师—学生映射 ----
const users = await q("SELECT id, username, name FROM users");
const uid = (u: string) => Number(users.find((x) => x.username === u)?.id);
const mappings: [string, string[]][] = [
  ["student1", ["admin"]],
  ["student2", ["admin", "teacher1"]],
  ["postdoc1", ["admin"]],
  ["undergrad1", ["teacher1"]],
  ["intern1", ["teacher1"]],
];
await q("DELETE FROM advisor_map");
for (const [s, ms] of mappings) {
  for (const m of ms) {
    if (uid(s) && uid(m))
      await db.execute(sql`INSERT INTO advisor_map (student_id, mentor_id) VALUES (${uid(s)}, ${uid(m)})`);
  }
}
console.log("advisor_map seeded");

// ---- 2. student_progress 周报数据 → weekly_reports ----
const sp = await q("SELECT student_id, reports FROM student_progress");
let migrated = 0;
for (const row of sp) {
  const stu = users.find((u) => Number(u.id) === Number(row.student_id));
  const reports = (typeof row.reports === "string" ? JSON.parse(row.reports) : row.reports) as { type: string; content: string; date: string }[];
  for (const r of reports.filter((x) => x.type === "week")) {
    await db.execute(
      sql`INSERT INTO weekly_reports (student_id, student_name, week_start, content, plan, problems, file_ids, status)
          VALUES (${Number(row.student_id)}, ${stu?.name ?? ""}, ${r.date}, ${r.content}, NULL, NULL, ${JSON.stringify([])}, 'reviewed')`,
    );
    migrated++;
  }
}
console.log("weekly migrated:", migrated);

// 演示周报：student1 最近两周 + 五周前一篇（演示折叠）
function monday(weeksAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}
const s1 = uid("student1");
const s2 = uid("student2");
const demoWeekly: [number, number, string, string, string][] = [
  [s1, 0, "完成跨注意力融合模块的消融实验，BLEU 指标提升 1.8%；整理实验记录 v2。", "撰写论文实验章节初稿", "GPU 资源紧张，排队时间长"],
  [s1, 1, "复现两个基线模型，完成 CMU-MOSEI 数据集清洗；修正对齐误差统计口径。", "开展消融实验", "基线 B 的指标与原文有差距，待排查"],
  [s1, 5, "完成文献综述第一稿，梳理跨模态对齐方向 20 篇核心文献。", "搭建实验环境", "无"],
  [s2, 1, "开题报告 PPT 初稿完成；收集摩擦学纹理表面相关实验数据。", "完善开题报告", "部分实验设备预约紧张"],
];
for (const [sid, ago, content, plan, problems] of demoWeekly) {
  const stu = users.find((u) => Number(u.id) === sid);
  await db.execute(
    sql`INSERT INTO weekly_reports (student_id, student_name, week_start, content, plan, problems, file_ids, status)
        VALUES (${sid}, ${stu?.name ?? ""}, ${monday(ago)}, ${content}, ${plan}, ${problems}, ${JSON.stringify([])}, ${ago === 0 ? "submitted" : "reviewed"})`,
  );
}
console.log("demo weekly seeded");

// ---- 3. 文献方向文件夹 ----
const pi = uid("admin");
await q("DELETE FROM ref_directions");
const dirs = ["多模态机器学习", "摩擦学与表面工程", "知识图谱与 NLP"];
for (const d of dirs) {
  await db.execute(sql`INSERT INTO ref_directions (name, description, created_by, created_by_name) VALUES (${d}, ${d + "方向核心文献"}, ${pi}, '王教授')`);
}
const dirRows = await q("SELECT id, name FROM ref_directions");
const defaultDir = Number(dirRows[0].id);
await db.execute(sql.raw(`UPDATE \`references\` SET direction_id = ${defaultDir} WHERE direction_id IS NULL`));
console.log("ref_directions seeded:", dirRows.length);

// ---- 4. 仪器设备演示数据 ----
await q("DELETE FROM device_bookings"); await q("DELETE FROM device_maintenance"); await q("DELETE FROM devices");
const t1 = uid("teacher1");
const demoDevices = [
  ["UMT-3 多功能摩擦磨损试验机", "UMT-3", "ZC-2019-011", "Bruker", "2019-06-15", 860000, "实验楼 B203", pi, "王教授", "in_use", 1],
  ["场发射扫描电子显微镜", "GeminiSEM 300", "ZC-2021-004", "ZEISS", "2021-03-20", 2450000, "实验楼 A105", t1, "孙老师", "in_use", 1],
  ["桌面级 3D 打印机", "Prusa MK4", "ZC-2024-017", "Prusa", "2024-01-10", 8900, "实验楼 B201", t1, "孙老师", "maintenance", 1],
] as const;
for (const [name, model, no, vendor, pd, price, loc, kid, kn, st, shared] of demoDevices) {
  await db.execute(
    sql`INSERT INTO devices (name, model, asset_no, vendor, purchase_date, price, location, keeper_id, keeper_name, status, shared, note, file_ids)
        VALUES (${name}, ${model}, ${no}, ${vendor}, ${pd}, ${price}, ${loc}, ${kid}, ${kn}, ${st}, ${shared}, NULL, ${JSON.stringify([])})`,
  );
}
const devRows = await q("SELECT id, name FROM devices");
await db.execute(
  sql`INSERT INTO device_bookings (device_id, user_id, user_name, start_time, end_time, purpose, status)
      VALUES (${Number(devRows[0].id)}, ${s1}, '张研一', ${monday(0) + " 14:00"}, ${monday(0) + " 17:00"}, '纹理表面往复摩擦实验', 'pending')`,
);
await db.execute(
  sql`INSERT INTO device_maintenance (device_id, type, date, cost, operator, note, file_ids, created_by, created_by_name)
      VALUES (${Number(devRows[2].id)}, 'repair', ${new Date().toISOString().slice(0, 10)}, 350, '售后工程师', '更换挤出机加热块，待复测', ${JSON.stringify([])}, ${t1}, '孙老师')`,
);
console.log("devices seeded");

// ---- 5. 既有待办回填跳转链接 ----
const linkMap: Record<string, string> = {
  review: "/research/reviews", reference: "/research/references", visit: "/research/visits",
  activity: "/research/activities", social_review: "/social", fund: "/research/projects",
  doc_share: "/training/grads?tab=docs", doc_feedback: "/training/grads?tab=docs",
};
for (const [src, link] of Object.entries(linkMap)) {
  await db.execute(sql`UPDATE todos SET link = ${link} WHERE source = ${src} AND link IS NULL`);
}
console.log("todo links backfilled");

// ---- 6. 清理旧权限键 ----
await q("DELETE FROM role_permissions WHERE perm_key IN ('research.studentProgress','research.funds','achievement.list')");
console.log("old perm keys cleared");

console.log("seed-v4 done");
process.exit(0);
