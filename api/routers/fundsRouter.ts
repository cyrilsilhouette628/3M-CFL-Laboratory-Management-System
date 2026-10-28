// 2.10 科研经费管理 + 模块三·人才培养（研究生/本科生/博士后档案）
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permProcedure, authedProcedure, audit, createAutoTodo, hasPerm, queueWebsiteUpdate, studentsOfMentor, isOwnerOrParticipant } from "../auth";
import { TRPCError } from "@trpc/server";
import type { PermLevel } from "@contracts/constants";

// 学生类别 → 权限键
const KIND_PERM: Record<string, string> = {
  grad: "training.grads",
  undergrad: "training.undergrads",
  postdoc: "training.postdocs",
};

// 学生模块动态权限：按 kind 检查对应子模块；管理档/教师跨类别放行
function studentPerm(min: PermLevel) {
  return authedProcedure.use(async ({ ctx, next, getRawInput }) => {
    const raw = (await getRawInput()) as { kind?: string } | undefined;
    const key = KIND_PERM[raw?.kind ?? "grad"] ?? "training.grads";
    const ok =
      (await hasPerm(ctx.profile, key, min)) ||
      (await hasPerm(ctx.profile, "training.grads", min));
    if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "无权访问该子模块" });
    return next({ ctx });
  });
}
import { getDb } from "../queries/connection";
import { fundCards, students, studentAchievements, achievements, projects } from "@db/schema";

async function canSeeFundCard(
  card: typeof fundCards.$inferSelect,
  user: { id: number; name: string },
  profile: string,
) {
  if (profile === "super_admin" || card.ownerId === user.id) return true;
  if (!card.projectId) return false;
  const [project] = await getDb().select().from(projects).where(eq(projects.id, card.projectId)).limit(1);
  if (!project) return false;
  return isOwnerOrParticipant(user.id, project.leaderId, project.participantIds ?? []) || (!project.leaderId && project.leader === user.name);
}

async function assertFundAccess(id: number, user: { id: number; name: string }, profile: string) {
  const [card] = await getDb().select().from(fundCards).where(eq(fundCards.id, id)).limit(1);
  if (!card || !(await canSeeFundCard(card, user, profile))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "经费卡不存在或无权访问" });
  }
  return card;
}

async function assertLinkedProjectAccess(projectId: number | undefined, user: { id: number; name: string }, profile: string) {
  if (!projectId || profile === "super_admin") return;
  const [project] = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || !(isOwnerOrParticipant(user.id, project.leaderId, project.participantIds ?? []) || (!project.leaderId && project.leader === user.name))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "不能关联未牵头或未参与的项目" });
  }
}

// ============ 2.10 科研经费 ============
const budgetItem = z.object({ subject: z.string(), amount: z.number() });

const fundInput = z.object({
  projectId: z.number().optional(),
  projectCode: z.string().optional(),
  projectName: z.string().min(1),
  source: z.string().optional(),
  totalAmount: z.number().default(0),
  budgets: z.array(budgetItem).default([]),
});

function enrichFund(f: typeof fundCards.$inferSelect) {
  const spent = f.expenses.reduce((s, e) => s + e.amount, 0) + f.laborPayments.reduce((s, l) => s + l.amount, 0);
  const arrived = f.arrivals.reduce((s, a) => s + (a.actualAmount ?? 0), 0);
  const budgetTotal = f.budgets.reduce((s, b) => s + b.amount, 0);
  const subjectExec = f.budgets.map((b) => {
    const used =
      f.expenses.filter((e) => e.subject === b.subject).reduce((s, e) => s + e.amount, 0) +
      (b.subject === "劳务费" ? f.laborPayments.reduce((s, l) => s + l.amount, 0) : 0);
    return { subject: b.subject, budget: b.amount, used, rate: b.amount > 0 ? Math.round((used / b.amount) * 100) : 0 };
  });
  const today = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];
  for (const s of subjectExec) {
    if (s.rate > 90) warnings.push(`科目「${s.subject}」执行率过高（${s.rate}%）`);
    if (s.rate < 20 && s.budget > 0) warnings.push(`科目「${s.subject}」执行率过低（${s.rate}%）`);
  }
  for (const a of f.arrivals) {
    if (!a.actualDate && a.plannedDate < today) warnings.push(`计划 ${a.plannedDate} 到账 ${a.plannedAmount} 元已逾期未到`);
  }
  if (f.totalAmount > 0 && arrived / f.totalAmount < 0.5 && spent / Math.max(arrived, 1) > 0.9) {
    warnings.push("到账不足但支出接近耗尽，请关注后续到账");
  }
  return { ...f, spent, arrived, budgetTotal, subjectExec, warnings };
}

export const fundsRouter = createRouter({
  list: permProcedure("research.projects", "readonly").query(async ({ ctx }) => {
    const rows = await getDb().select().from(fundCards).orderBy(desc(fundCards.id));
    const visible = [];
    for (const row of rows) if (await canSeeFundCard(row, ctx.user, ctx.profile)) visible.push(row);
    return visible.map(enrichFund);
  }),

  create: permProcedure("research.projects", "editable")
    .input(fundInput)
    .mutation(async ({ ctx, input }) => {
      await assertLinkedProjectAccess(input.projectId, ctx.user, ctx.profile);
      await getDb().insert(fundCards).values({ ...input, ownerId: ctx.user.id, arrivals: [], expenses: [], laborPayments: [], transfers: [] });
      await audit(ctx.user, "新建经费卡", "research.funds", input.projectName);
      return { ok: true };
    }),

  update: permProcedure("research.projects", "editable")
    .input(fundInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertFundAccess(id, ctx.user, ctx.profile);
      await assertLinkedProjectAccess(rest.projectId, ctx.user, ctx.profile);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(fundCards).set(patch).where(eq(fundCards.id, id));
      await audit(ctx.user, "编辑经费卡", "research.funds", `#${id}`);
      return { ok: true };
    }),

  addArrival: permProcedure("research.projects", "editable")
    .input(z.object({ id: z.number(), plannedDate: z.string(), plannedAmount: z.number(), actualDate: z.string().optional(), actualAmount: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const f = await assertFundAccess(input.id, ctx.user, ctx.profile);
      const { id, ...item } = input;
      await db.update(fundCards).set({ arrivals: [...f.arrivals, item] }).where(eq(fundCards.id, id));
      // 逾期未到的由预警机制在列表中提示；若已逾期同时给管理员待办
      const today = new Date().toISOString().slice(0, 10);
      if (!item.actualDate && item.plannedDate < today) {
        await createAutoTodo({
          title: `经费到账逾期提醒：${f.projectName}`,
          description: `计划 ${item.plannedDate} 到账 ${item.plannedAmount} 元，至今未到，请跟进。`,
          priority: "high",
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [ctx.user.id],
          source: "fund",
          sourceRefId: id,
        link: "/research/projects",
        });
      }
      await audit(ctx.user, "登记到账", "research.funds", `${f.projectName} ${input.plannedAmount} 元`);
      return { ok: true };
    }),

  addExpense: permProcedure("research.projects", "editable")
    .input(z.object({ id: z.number(), date: z.string(), subject: z.string(), amount: z.number(), description: z.string(), fileIds: z.array(z.number()).default([]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const f = await assertFundAccess(input.id, ctx.user, ctx.profile);
      const { id, ...item } = input;
      await db.update(fundCards).set({ expenses: [...f.expenses, item] }).where(eq(fundCards.id, id));
      await audit(ctx.user, "登记报销", "research.funds", `${f.projectName} ${input.subject} ${input.amount} 元`);
      return { ok: true };
    }),

  addLabor: permProcedure("research.projects", "editable")
    .input(z.object({ id: z.number(), payee: z.string(), month: z.string(), amount: z.number(), receiptFileId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const f = await assertFundAccess(input.id, ctx.user, ctx.profile);
      const { id, ...item } = input;
      await db.update(fundCards).set({ laborPayments: [...f.laborPayments, item] }).where(eq(fundCards.id, id));
      await audit(ctx.user, "登记劳务费", "research.funds", `${input.payee} ${input.amount} 元`);
      return { ok: true };
    }),

  addTransfer: permProcedure("research.projects", "editable")
    .input(z.object({ id: z.number(), targetOrg: z.string(), amount: z.number(), date: z.string(), docFileId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const f = await assertFundAccess(input.id, ctx.user, ctx.profile);
      const { id, ...item } = input;
      await db.update(fundCards).set({ transfers: [...f.transfers, item] }).where(eq(fundCards.id, id));
      await audit(ctx.user, "登记外拨经费", "research.funds", `${input.targetOrg} ${input.amount} 元`);
      return { ok: true };
    }),

  remove: permProcedure("research.projects", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertFundAccess(input.id, ctx.user, ctx.profile);
      await getDb().delete(fundCards).where(eq(fundCards.id, input.id));
      await audit(ctx.user, "删除经费卡", "research.funds", `#${input.id}`);
      return { ok: true };
    }),
});

// ============ 模块三·人才培养：研究生 / 本科生 / 博士后档案 ============
const studentInput = z.object({
  kind: z.enum(["grad", "undergrad", "postdoc"]),
  name: z.string().min(1),
  studentNo: z.string().optional(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  wechat: z.string().optional(),
  email: z.string().optional(),
  hometown: z.string().optional(),
  bachelorSchool: z.string().optional(),
  advisor: z.string().optional(),
  direction: z.string().optional(),
  proposalStatus: z.string().optional(),
  midtermStatus: z.string().optional(),
  defenseStatus: z.string().optional(),
  detail: z.record(z.string(), z.string()).optional(), // 博士后：进站日期/预计出站/在站状态/国家级课题
  userId: z.number().optional(),
});

type StudentAccessUser = { id: number; role: string };
async function visibleStudentRecord(row: typeof students.$inferSelect, user: StudentAccessUser, profile: string) {
  if (profile === "super_admin") return true;
  if (["grad", "benyan", "intern"].includes(user.role)) return row.userId === user.id;
  if (["teacher", "postdoc", "admin"].includes(profile)) {
    if (row.userId === user.id) return true;
    return row.userId !== null && (await studentsOfMentor(user.id)).includes(row.userId);
  }
  return false;
}
async function assertStudentRecordAccess(id: number, user: StudentAccessUser, profile: string) {
  const [row] = await getDb().select().from(students).where(eq(students.id, id)).limit(1);
  if (!row || !(await visibleStudentRecord(row, user, profile))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "学生档案不存在或无权访问" });
  }
  return row;
}

export const studentsRouter = createRouter({
  list: studentPerm("readonly")
    .input(z.object({ kind: z.enum(["grad", "undergrad", "postdoc"]) }))
    .query(async ({ ctx, input }) => {
      const rows = (await getDb().select().from(students).orderBy(desc(students.id))).filter((s) => s.kind === input.kind);
      const visible = [];
      for (const row of rows) if (await visibleStudentRecord(row, ctx.user, ctx.profile)) visible.push(row);
      return visible;
    }),

  create: studentPerm("editable")
    .input(studentInput)
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(students).values({ ...input, files: [] });
      // 入学/进站 → 网站更新队列
      const kindLabel = input.kind === "postdoc" ? "博士后" : input.kind === "undergrad" ? "本科生" : "研究生";
      await queueWebsiteUpdate({
        type: "student_change",
        title: `${kindLabel}${input.kind === "postdoc" ? "进站" : "入学"}：${input.name}`,
        payload: {
          姓名: input.name,
          类别: kindLabel,
          变动类型: input.kind === "postdoc" ? "进站" : "入学",
          导师: input.advisor ?? "",
          日期: new Date().toISOString().slice(0, 10),
        },
        source: "training",
        user: ctx.user,
      });
      await audit(ctx.user, "新增学生档案", KIND_PERM[input.kind], input.name);
      return { ok: true };
    }),

  batchImport: studentPerm("editable")
    .input(z.array(studentInput))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      for (const row of input) await db.insert(students).values({ ...row, files: [] });
      await audit(ctx.user, "批量导入学生", "training", `导入 ${input.length} 条`);
      return { imported: input.length };
    }),

  update: studentPerm("editable")
    .input(studentInput.partial().extend({ id: z.number(), files: z.array(z.object({ label: z.string(), fileId: z.number() })).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertStudentRecordAccess(input.id, ctx.user, ctx.profile);
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(students).set(patch).where(eq(students.id, id));
      await audit(ctx.user, "编辑学生档案", "training", `#${id}`);
      return { ok: true };
    }),

  remove: studentPerm("manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertStudentRecordAccess(input.id, ctx.user, ctx.profile);
      await getDb().delete(students).where(eq(students.id, input.id));
      await audit(ctx.user, "删除学生档案", "training", `#${input.id}`);
      return { ok: true };
    }),

  // ---- 学生研究成果 ----
  listAchievements: authedProcedure
    .input(z.object({ studentId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertStudentRecordAccess(input.studentId, ctx.user, ctx.profile);
      return getDb().select().from(studentAchievements).where(eq(studentAchievements.studentId, input.studentId));
    }),

  addAchievement: studentPerm("editable")
    .input(z.object({ studentId: z.number(), type: z.enum(["paper", "patent", "competition", "conference_award"]), title: z.string().min(1), detail: z.string().optional(), date: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertStudentRecordAccess(input.studentId, ctx.user, ctx.profile);
      await getDb().insert(studentAchievements).values(input);
      await audit(ctx.user, "新增学生成果", "training.grads", input.title);
      return { ok: true };
    }),

  // 确认后自动转入模块三成果管理
  confirmAchievement: studentPerm("manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [sa] = await db.select().from(studentAchievements).where(eq(studentAchievements.id, input.id)).limit(1);
      if (!sa) return { ok: false };
      const stu = await assertStudentRecordAccess(sa.studentId, ctx.user, ctx.profile);
      const category = sa.type === "paper" ? "published_paper" : sa.type === "patent" ? "patent" : "student_work";
      const res = await db.insert(achievements).values({
        category,
        title: sa.title,
        authors: stu?.name ?? "",
        year: sa.date ? parseInt(sa.date.slice(0, 4)) : new Date().getFullYear(),
        date: sa.date,
        detail: { 来源: "学生成果转入", 类型: sa.type, 说明: sa.detail ?? "" },
        evidenceFileIds: [],
        fromStudentName: stu?.name,
      });
      await db
        .update(studentAchievements)
        .set({ status: "confirmed", achievementId: Number(res[0].insertId) })
        .where(eq(studentAchievements.id, input.id));
      await audit(ctx.user, "确认学生成果并转入成果管理", "training.grads", sa.title);
      return { ok: true };
    }),
});
