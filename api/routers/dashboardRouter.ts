// 首页仪表盘：按当前登录用户聚合
import { createRouter } from "../middleware";
import { authedProcedure, visibleStudentIds } from "../auth";
import { getDb } from "../queries/connection";
import { AI_MODULE_LABELS } from "@contracts/constants";
import { todos, projects, papers, achievements, aiTasks, students, docShares, websiteUpdates, weeklyReports, files } from "@db/schema";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// V5 需求 1：AI 解析建议条目化 —— 按来源模块给出跳转落点，供人工确认
const AI_MODULE_LINKS: Record<string, string> = {
  paper: "/research/papers",
  review: "/research/reviews",
  achievement: "/achievements",
  training: "/training/grads",
  reference: "/research/references",
  project: "/research/projects",
  activity: "/research/activities",
  visit: "/research/visits",
  social: "/social",
  device: "/device/assets",
};
// AI_MODULE_LABELS 移至 @contracts/constants（V6：与 AI 解析确认页共用）

export const dashboardRouter = createRouter({
  summary: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const uid = ctx.user.id;
    const today = todayStr();
    const weekEnd = addDays(today, 7);
    const monthPrefix = today.slice(0, 7);

    const allTodos = await db.select().from(todos);
    const mine = allTodos.filter(
      (t) => t.creatorId === uid || t.leaderIds.includes(uid) || t.participantIds.includes(uid),
    );
    const pending = mine.filter((t) => t.status === "pending");
    const overdue = pending.filter((t) => t.dueDate && t.dueDate < today);
    const todayTodos = pending.filter((t) => t.dueDate === today || t.pinned);
    const weekTodos = pending.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd);
    const sourceTodos = pending.filter((t) => t.source !== "manual" && !["weekly_feedback", "doc_feedback"].includes(t.source));

    const allProjects = await db.select().from(projects);
    const visibleProjects = allProjects.filter((p) => ctx.profile === "super_admin" || p.leaderId === uid || (p.participantIds ?? []).includes(uid) || (!p.leaderId && p.leader === ctx.user.name));
    const ongoingProjects = visibleProjects.filter((p) => p.status === "ongoing" || p.status === "concluding");

    const allPapers = await db.select().from(papers);
    const myPapers =
      ctx.profile === "super_admin"
        ? allPapers
        : allPapers.filter((p) => p.leaderId === uid || p.participantIds.includes(uid));
    const inReview = myPapers.filter((p) => ["submitted", "under_review", "revision"].includes(p.status));

    const allAch = await db.select().from(achievements);
    const monthNew = allAch.filter(
      (a) => a.date?.startsWith(monthPrefix) || String(a.year) === monthPrefix.slice(0, 4),
    );

    // 学生关键节点倒计时：未完成的 开题/中期/答辩（V5：按导师可见范围过滤）
    const allStudents = await db.select().from(students);
    const scope0 = await visibleStudentIds(ctx.user, ctx.profile);
    const nodeAlerts: { name: string; node: string; userId: number | null }[] = [];
    for (const s of allStudents) {
      if (s.kind !== "grad") continue;
      const uid2 = s.userId ?? null;
      if (scope0 !== null && (uid2 === null || !scope0.includes(uid2))) continue;
      if (s.proposalStatus !== "已完成") nodeAlerts.push({ name: s.name, node: "开题", userId: uid2 });
      else if (s.midtermStatus !== "已完成") nodeAlerts.push({ name: s.name, node: "中期", userId: uid2 });
      else if (s.defenseStatus !== "已完成") nodeAlerts.push({ name: s.name, node: "答辩", userId: uid2 });
    }

    const pendingAi = await db.select().from(aiTasks);
    const aiPending = pendingAi.filter((t) => t.status === "pending" && (ctx.profile === "super_admin" || t.createdBy === uid));

    // 过程文档：导师待批阅 / 学生待查收反馈
    const allShares = await db.select().from(docShares);
    const docToReview = allShares.filter((s) => s.status === "submitted" && s.toUserIds.includes(uid));
    const docFeedback = allShares.filter((s) => s.status === "feedback" && s.studentId === uid);

    // 网站更新待推送（管理员关注）
    const allUpdates = await db.select().from(websiteUpdates);
    const websitePending = ctx.profile === "super_admin" ? allUpdates.filter((w) => w.status === "pending") : [];

    // 需求 16：周报——导师视角=名下学生待批阅；学生视角=本周是否已交
    const allWeekly = await db.select().from(weeklyReports);
    const scope = scope0;
    const weeklyToReview = allWeekly.filter(
      (r) => r.status === "submitted" && (scope === null || scope.includes(r.studentId)) && ctx.user.role !== "grad",
    );
    const monday = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); })();
    const myWeekSubmitted = allWeekly.some((r) => r.studentId === uid && r.weekStart === monday);

    // 需求 10：待审核内容数（管理员关注）
    const allFiles = await db.select().from(files);
    const reviewPending = ctx.profile === "super_admin" || ctx.profile === "admin" ? allFiles.filter((f2) => f2.reviewStatus === "pending") : [];

    return {
      counts: {
        overdue: overdue.length,
        today: todayTodos.length,
        week: weekTodos.length,
        source: sourceTodos.length,
        ongoingProjects: ongoingProjects.length,
        inReviewPapers: inReview.length,
        monthNewAchievements: monthNew.length,
        aiPending: aiPending.length,
        docToReview: docToReview.length,
        docFeedback: docFeedback.length,
        websitePending: websitePending.length,
        weeklyToReview: weeklyToReview.length,
        reviewPending: reviewPending.length,
      },
      myWeekSubmitted,
      overdue: overdue.slice(0, 8),
      todayTodos: todayTodos.slice(0, 8),
      weekTodos: weekTodos.slice(0, 10),
      sourceTodos: sourceTodos.slice(0, 8),
      nodeAlerts: nodeAlerts.slice(0, 10),
      aiTasks: aiPending.slice(0, 12).map((t) => ({
        ...t,
        moduleLabel: AI_MODULE_LABELS[t.module] ?? t.module,
        moduleLink: AI_MODULE_LINKS[t.module] ?? "/config/review",
        link: `/config/ai?task=${t.id}`,
      })),
    };
  }),
});
