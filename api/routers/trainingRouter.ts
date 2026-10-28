// 模块三·人才培养：研究任务 / 关键研究点 / 过程文档版本 / 文档提交与导师反馈
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { permProcedure, authedProcedure, audit, createAutoTodo, visibleStudentIds, mentorsOfStudent, studentsOfMentor, completeSourceTodos } from "../auth";
import { getDb } from "../queries/connection";
import { researchTasks, researchPoints, pointDocs, docShares, weeklyReports, todos, users, trainingNodes, achievements, papers } from "@db/schema";

// 导师视角：超级管理员/管理员/教师/博士后 可见全部；学生类身份仅见本人相关
function isMentor(profile: string) {
  return ["super_admin", "admin", "teacher", "postdoc"].includes(profile);
}

// 需求 1/15：基于 advisor_map 的可见范围。
// 超级管理员/管理员 → 不限制；教师/博士后 → 名下学生；学生类身份 → 仅本人
async function visibleScope(ctx: { user: { id: number }; profile: string }): Promise<number[] | null> {
  return visibleStudentIds(ctx.user, ctx.profile);
}

// 学生可见范围：本人创建 / 归属本人 / 本人导师创建
async function visibleTaskIds(ctx: { user: { id: number }; profile: string }): Promise<number[] | null> {
  if (ctx.profile === "super_admin") return null; // null = 不限制
  const db = getDb();
  const scope = await visibleScope(ctx); // 教师/博士后：名下学生；学生：[本人]
  const ids = scope ?? [];
  const advisorIds = isMentor(ctx.profile) ? [] : await mentorsOfStudent(ctx.user.id);
  const mine = await db
    .select()
    .from(researchTasks)
    .where(inArray(researchTasks.studentId, ids.length ? ids : [-1]));
  const created = await db
    .select()
    .from(researchTasks)
    .where(inArray(researchTasks.createdBy, [ctx.user.id, ...advisorIds]));
  return [...new Set([...mine.map((t) => t.id), ...created.map((t) => t.id)])];
}

async function assertTaskAccess(id: number, ctx: { user: { id: number }; profile: string }) {
  const [task] = await getDb().select().from(researchTasks).where(eq(researchTasks.id, id)).limit(1);
  const allowed = await visibleTaskIds(ctx);
  if (!task || (allowed !== null && !allowed.includes(id))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "研究任务不存在或无权访问" });
  }
  return task;
}

async function assertPointAccess(id: number, ctx: { user: { id: number }; profile: string }) {
  const [point] = await getDb().select().from(researchPoints).where(eq(researchPoints.id, id)).limit(1);
  if (!point) throw new TRPCError({ code: "NOT_FOUND", message: "关键研究点不存在" });
  await assertTaskAccess(point.taskId, ctx);
  return point;
}

async function assertStudentScope(studentId: number, ctx: { user: { id: number }; profile: string }) {
  if (ctx.profile === "super_admin" || studentId === ctx.user.id) return;
  const scope = (await visibleScope(ctx)) ?? [];
  if (!isMentor(ctx.profile) || !scope.includes(studentId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "只能维护本人或名下学生的培养数据" });
  }
}

const taskInput = z.object({
  studentId: z.number(),
  title: z.string().min(1),
  direction: z.string().optional(),
  question: z.string().optional(),
  goal: z.string().optional(),
  approach: z.string().optional(),
  expectedOutput: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["active", "paused", "done"]).default("active"),
});

export const tasksRouter = createRouter({
  list: permProcedure("training.grads", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(researchTasks).orderBy(desc(researchTasks.id));
    const allowed = await visibleTaskIds(ctx);
    const tasks = allowed === null ? rows : rows.filter((t) => allowed.includes(t.id));
    // 附带学生姓名
    const allUsers = await db.select().from(users);
    const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;
    return tasks.map((t) => ({ ...t, studentName: nameOf(t.studentId) }));
  }),

  create: permProcedure("training.grads", "editable")
    .input(taskInput)
    .mutation(async ({ ctx, input }) => {
      // 学生身份只能为自己建任务；教师/博士后只能给名下学生建任务
      const studentId = isMentor(ctx.profile) ? input.studentId : ctx.user.id;
      if (isMentor(ctx.profile) && ctx.profile !== "super_admin") {
        const scope = (await visibleScope(ctx)) ?? [];
        if (!scope.includes(studentId))
          throw new TRPCError({ code: "FORBIDDEN", message: "只能为名下学生创建研究任务" });
      }
      await getDb().insert(researchTasks).values({
        ...input,
        studentId,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name,
      });
      await audit(ctx.user, "新建研究任务", "training.grads", input.title);
      return { ok: true };
    }),

  update: permProcedure("training.grads", "editable")
    .input(taskInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertTaskAccess(id, ctx);
      if (rest.studentId) await assertStudentScope(rest.studentId, ctx);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(researchTasks).set(patch).where(eq(researchTasks.id, id));
      await audit(ctx.user, "编辑研究任务", "training.grads", `#${id}`);
      return { ok: true };
    }),

  remove: permProcedure("training.grads", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await assertTaskAccess(input.id, ctx);
      const points = await db.select().from(researchPoints).where(eq(researchPoints.taskId, input.id));
      for (const p of points) await db.delete(pointDocs).where(eq(pointDocs.pointId, p.id));
      await db.delete(researchPoints).where(eq(researchPoints.taskId, input.id));
      await db.delete(researchTasks).where(eq(researchTasks.id, input.id));
      await audit(ctx.user, "删除研究任务", "training.grads", `#${input.id}`);
      return { ok: true };
    }),
});

export const pointsRouter = createRouter({
  // 某任务下的关键研究点 + 过程文档版本
  list: permProcedure("training.grads", "readonly")
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      await assertTaskAccess(input.taskId, ctx);
      const points = await db
        .select()
        .from(researchPoints)
        .where(eq(researchPoints.taskId, input.taskId))
        .orderBy(desc(researchPoints.id));
      const docs = await db.select().from(pointDocs).orderBy(desc(pointDocs.id));
      return points.map((p) => ({ ...p, docs: docs.filter((d) => d.pointId === p.id) }));
    }),

  add: permProcedure("training.grads", "editable")
    .input(z.object({ taskId: z.number(), title: z.string().min(1), summary: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertTaskAccess(input.taskId, ctx);
      const res = await getDb().insert(researchPoints).values({
        ...input,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name,
      });
      await audit(ctx.user, "新建关键研究点", "training.grads", input.title);
      return { ok: true, pointId: Number(res[0].insertId) };
    }),

  remove: permProcedure("training.grads", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await assertPointAccess(input.id, ctx);
      await db.delete(pointDocs).where(eq(pointDocs.pointId, input.id));
      await db.delete(researchPoints).where(eq(researchPoints.id, input.id));
      await audit(ctx.user, "删除关键研究点", "training.grads", `#${input.id}`);
      return { ok: true };
    }),

  // 上传过程文档新版本（v1、v2…）
  addDoc: permProcedure("training.grads", "editable")
    .input(z.object({ pointId: z.number(), fileId: z.number(), fileName: z.string(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await assertPointAccess(input.pointId, ctx);
      const existing = await db.select().from(pointDocs).where(eq(pointDocs.pointId, input.pointId));
      const version = existing.reduce((m, d) => Math.max(m, d.version), 0) + 1;
      await db.insert(pointDocs).values({
        pointId: input.pointId,
        fileId: input.fileId,
        fileName: input.fileName,
        version,
        note: input.note,
        uploadedBy: ctx.user.id,
        uploadedByName: ctx.user.name,
      });
      await audit(ctx.user, "提交过程文档", "training.grads", `${input.fileName} v${version}`);
      return { ok: true, version };
    }),
});

// ---- 文档提交与导师反馈 ----
export const docSharesRouter = createRouter({
  // 学生见本人提交的；导师见送达自己的；管理员见全部
  list: permProcedure("training.grads", "readonly").query(async ({ ctx }) => {
    const rows = await getDb().select().from(docShares).orderBy(desc(docShares.id));
    const scope = await visibleScope(ctx);
    if (scope === null) return rows; // 超管/管理员
    if (isMentor(ctx.profile))
      return rows.filter((s) => s.toUserIds.includes(ctx.user.id) || scope.includes(s.studentId));
    return rows.filter((s) => s.studentId === ctx.user.id);
  }),

  submit: permProcedure("training.grads", "editable")
    .input(
      z.object({
        type: z.enum(["weekly", "paper_draft", "ppt_draft", "report", "other"]),
        title: z.string().min(1),
        content: z.string().optional(),
        fileIds: z.array(z.number()).default([]),
        toUserIds: z.array(z.number()).min(1, "请至少选择一位送达导师"),
        taskId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const res = await db.insert(docShares).values({
        ...input,
        studentId: ctx.user.id,
        studentName: ctx.user.name,
      });
      const shareId = Number(res[0].insertId);
      // 自动在每位送达导师的待办中生成提醒
      await createAutoTodo({
        title: `文档待批阅：${input.title}（${ctx.user.name} 提交）`,
        description: `类型：${input.type}。请到【人才培养·研究生培养】中查看并反馈。`,
        priority: "high",
        creatorId: ctx.user.id,
        creatorName: ctx.user.name,
        leaderIds: input.toUserIds,
        source: "doc_share",
        sourceRefId: shareId,
      link: `/training/grads?studentId=${ctx.user.id}&tab=docs`,
      });
      await audit(ctx.user, "提交过程文档", "training.grads", input.title);
      return { ok: true, id: shareId };
    }),

  feedback: permProcedure("training.grads", "editable")
    .input(
      z.object({
        id: z.number(),
        feedback: z.string().min(1, "请填写反馈内容"),
        feedbackFileIds: z.array(z.number()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [share] = await db.select().from(docShares).where(eq(docShares.id, input.id)).limit(1);
      if (!share) throw new TRPCError({ code: "NOT_FOUND", message: "事项不存在" });
      // 仅送达导师或超级管理员可反馈；管理标志不能越权查看或批阅他人学生。
      if (!isMentor(ctx.profile)) throw new TRPCError({ code: "FORBIDDEN", message: "仅导师可反馈" });
      if (ctx.profile !== "super_admin" && !share.toUserIds.includes(ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "只能批阅送达本人的文档" });
      await db
        .update(docShares)
        .set({
          status: "feedback",
          feedback: input.feedback,
          feedbackFileIds: input.feedbackFileIds,
          feedbackBy: ctx.user.id,
          feedbackByName: ctx.user.name,
          feedbackAt: new Date(),
        })
        .where(eq(docShares.id, input.id));
      await completeSourceTodos("doc_share", share.id, ctx.user.id);
      // 自动在学生待办中提醒
      await createAutoTodo({
        title: `导师已反馈：${share.title}`,
        description: `${ctx.user.name} 反馈了您提交的文档，请到【人才培养·研究生培养】查看。`,
        priority: "medium",
        creatorId: ctx.user.id,
        creatorName: ctx.user.name,
        leaderIds: [share.studentId],
        source: "doc_feedback",
        sourceRefId: share.id,
      link: "/training/grads?tab=docs",
      });
      await audit(ctx.user, "反馈过程文档", "training.grads", share.title);
      return { ok: true };
    }),
});

// 导师列表（供学生选择送达对象：教师/博士后/管理员）
export const mentorsRouter = createRouter({
  options: authedProcedure.query(async () => {
    const rows = await getDb().select().from(users).orderBy(users.id);
    return rows
      .filter((u) => u.active && (u.isAdmin || ["super_admin", "teacher", "postdoc"].includes(u.role)))
      .map((u) => ({ id: u.id, name: u.name, role: u.role, title: u.title }));
  }),
});

// ---- 需求 16：研究生周报（仅研究生提交；教师/博士后只审阅；博士后/实习生/本研生不需要）----
function mondayOf(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 周一=0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export const weeklyRouter = createRouter({
  // 列表：超管/管理员看全部；教师/博士后看名下学生；学生只看自己
  // 副作用：为当前登录的研究生懒生成「连续三周未交周报」提醒（幂等）
  list: permProcedure("training.grads", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(weeklyReports).orderBy(desc(weeklyReports.weekStart), desc(weeklyReports.id));
    const scope = await visibleScope(ctx);
    const visible = scope === null ? rows : rows.filter((r) => scope.includes(r.studentId));

    // 连续三周未提交 → 自动待办提醒（仅对当前登录的研究生检测，懒生成）
    if (ctx.profile === "grad") {
      const now = new Date();
      const expected: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - 7 * i);
        expected.push(mondayOf(d));
      }
      const mine = rows.filter((r) => r.studentId === ctx.user.id);
      const submittedWeeks = new Set(mine.map((r) => r.weekStart));
      const missingCount = expected.filter((w) => !submittedWeeks.has(w)).length;
      if (missingCount >= 3) {
        const existing = await db.select().from(todos).where(eq(todos.source, "weekly_missing"));
        const dup = existing.find(
          (t) => t.status === "pending" && t.sourceRefId === ctx.user.id,
        );
        if (!dup) {
          await createAutoTodo({
            title: "周报提醒：您已连续三周未提交周报",
            description: "请及时到【人才培养·研究生培养·周报】补交本周及往周周报。",
            priority: "high",
            creatorId: ctx.user.id,
            creatorName: ctx.user.name,
            leaderIds: [ctx.user.id],
            source: "weekly_missing",
            sourceRefId: ctx.user.id,
            link: "/training/grads?tab=weekly",
          });
        }
      }
    }
    return visible;
  }),

  // 提交：仅研究生（grad）
  submit: permProcedure("training.grads", "editable")
    .input(
      z.object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart 格式为 YYYY-MM-DD"),
        content: z.string().min(1, "请填写本周进展"),
        plan: z.string().optional(),
        problems: z.string().optional(),
        fileIds: z.array(z.number()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "grad")
        throw new TRPCError({ code: "FORBIDDEN", message: "仅研究生需要提交周报" });
      const db = getDb();
      const res = await db.insert(weeklyReports).values({
        ...input,
        studentId: ctx.user.id,
        studentName: ctx.user.name,
      });
      const reportId = Number(res[0].insertId);
      await completeSourceTodos("weekly_missing", ctx.user.id, ctx.user.id);
      // 提交后 → 导师待办提醒（需求 16）；无导师映射时兜底发给超管
      let mentors = await mentorsOfStudent(ctx.user.id);
      if (mentors.length === 0) {
        const supers = await db.select().from(users);
        mentors = supers.filter((u) => u.role === "super_admin" && u.active).map((u) => u.id);
      }
      if (mentors.length) {
        await createAutoTodo({
          title: `周报待审阅：${ctx.user.name}（${input.weekStart} 周）`,
          description: "请到【人才培养·研究生培养·周报】审阅并填写评语。",
          priority: "medium",
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: mentors,
          source: "weekly_report",
          sourceRefId: reportId,
          link: `/training/grads?studentId=${ctx.user.id}&tab=weekly`,
        });
      }
      await audit(ctx.user, "提交周报", "training.grads", `${input.weekStart} 周`);
      return { ok: true, id: reportId };
    }),

  // 批阅：教师/博士后/管理员
  feedback: permProcedure("training.grads", "editable")
    .input(
      z.object({
        id: z.number(),
        feedback: z.string().min(1, "请填写评语"),
        feedbackFileIds: z.array(z.number()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isMentor(ctx.profile))
        throw new TRPCError({ code: "FORBIDDEN", message: "仅导师可审阅周报" });
      const db = getDb();
      const [rep] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, input.id)).limit(1);
      if (!rep) throw new TRPCError({ code: "NOT_FOUND", message: "周报不存在" });
      // 教师/博士后只能批阅名下学生的周报
      if (ctx.profile !== "super_admin") {
        const scope = (await visibleScope(ctx)) ?? [];
        if (!scope.includes(rep.studentId))
          throw new TRPCError({ code: "FORBIDDEN", message: "只能审阅名下学生的周报" });
      }
      await db
        .update(weeklyReports)
        .set({
          status: "reviewed",
          feedback: input.feedback,
          feedbackFileIds: input.feedbackFileIds,
          feedbackBy: ctx.user.id,
          feedbackByName: ctx.user.name,
          feedbackAt: new Date(),
        })
        .where(eq(weeklyReports.id, input.id));
      await completeSourceTodos("weekly_report", rep.id, ctx.user.id);
      await completeSourceTodos("weekly_missing", rep.studentId, rep.studentId);
      // 批阅后 → 学生待办提醒
      await createAutoTodo({
        title: `周报已批阅：${rep.weekStart} 周`,
        description: `${ctx.user.name} 批阅了您的周报，请到【人才培养·研究生培养·周报】查看评语。`,
        priority: "medium",
        creatorId: ctx.user.id,
        creatorName: ctx.user.name,
        leaderIds: [rep.studentId],
        source: "weekly_feedback",
        sourceRefId: rep.id,
        link: "/training/grads?tab=weekly",
      });
      await audit(ctx.user, "批阅周报", "training.grads", `${rep.studentName} ${rep.weekStart} 周`);
      return { ok: true };
    }),

  reply: permProcedure("training.grads", "editable")
    .input(z.object({ id: z.number(), content: z.string().min(1, "请填写二次反馈内容") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [rep] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, input.id)).limit(1);
      if (!rep || rep.studentId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "周报不存在或无权反馈" });
      if (rep.status !== "reviewed") throw new TRPCError({ code: "BAD_REQUEST", message: "导师批阅后才能二次反馈" });
      await db.update(weeklyReports).set({ studentReply: input.content, studentReplyAt: new Date() }).where(eq(weeklyReports.id, rep.id));
      await completeSourceTodos("weekly_feedback", rep.id, ctx.user.id);
      const mentors = await mentorsOfStudent(ctx.user.id);
      if (mentors.length) await createAutoTodo({ title: `周报二次反馈：${ctx.user.name}（${rep.weekStart} 周）`, description: input.content, priority: "medium", creatorId: ctx.user.id, creatorName: ctx.user.name, leaderIds: mentors, source: "weekly_reply", sourceRefId: rep.id, link: `/training/grads?studentId=${ctx.user.id}&tab=weekly` });
      await audit(ctx.user, "周报二次反馈", "training.grads", `${rep.weekStart} 周`);
      return { ok: true };
    }),
});

// ===================== V5 需求 2/3/4：培养仪表盘与学生个人页 =====================

// 培养档案节点（入学/开题/中期/预答辩/答辩/毕业）
export const trainingNodesRouter = createRouter({
  list: permProcedure("training.grads", "readonly")
    .input(z.object({ studentId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db.select().from(trainingNodes).orderBy(trainingNodes.studentId, trainingNodes.id);
      const scope = await visibleScope(ctx);
      const visible = scope === null ? rows : rows.filter((n) => scope.includes(n.studentId));
      return input.studentId ? visible.filter((n) => n.studentId === input.studentId) : visible;
    }),

  upsert: permProcedure("training.grads", "editable")
    .input(
      z.object({
        id: z.number().optional(),
        studentId: z.number(),
        nodeType: z.enum(["入学", "开题", "中期", "预答辩", "答辩", "毕业"]),
        date: z.string().optional(),
        status: z.enum(["pending", "done"]).default("pending"),
        note: z.string().optional(),
        fileIds: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 学生本人可补录自己的节点；导师仅维护名下学生，超管可维护全部。
      await assertStudentScope(input.studentId, ctx);
      const db = getDb();
      const { id, ...rest } = input;
      if (id) {
        const [existing] = await db.select().from(trainingNodes).where(eq(trainingNodes.id, id)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "培养节点不存在" });
        await assertStudentScope(existing.studentId, ctx);
        await db.update(trainingNodes).set(rest).where(eq(trainingNodes.id, id));
      } else {
        await db.insert(trainingNodes).values(rest);
      }
      await audit(ctx.user, id ? "更新培养节点" : "新建培养节点", "training.grads", `${input.studentId}·${input.nodeType}`);
      return { ok: true };
    }),

  remove: permProcedure("training.grads", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [existing] = await db.select().from(trainingNodes).where(eq(trainingNodes.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "培养节点不存在" });
      await assertStudentScope(existing.studentId, ctx);
      await db.delete(trainingNodes).where(eq(trainingNodes.id, input.id));
      await audit(ctx.user, "删除培养节点", "training.grads", `#${input.id}`);
      return { ok: true };
    }),
});

// 培养仪表盘（导师视图：名下学生总体情况 + 逐生摘要）
export const trainingDashRouter = createRouter({
  // 可见学生列表（导师 = 名下学生；超级管理员 = 全部学生类用户）
  students: permProcedure("training.grads", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const allUsers = await db.select().from(users);
    let scope = await visibleScope(ctx);
    // V12 问题1：导师身份（教师/博士后）即使勾选了管理标志，培养总览也只显示自己名下的学生；
    // 仅超级管理员可见全组学生
    if (ctx.profile !== "super_admin" && ["teacher", "postdoc", "admin"].includes(ctx.profile)) {
      scope = await studentsOfMentor(ctx.user.id);
    }
    const studentRows = allUsers.filter(
      (u) => u.active && ["grad", "benyan", "intern", "postdoc"].includes(u.role) && (scope === null || scope.includes(u.id)),
    );
    const allTasks = await db.select().from(researchTasks);
    const allWeekly = await db.select().from(weeklyReports);
    const allShares = await db.select().from(docShares);
    const allNodes = await db.select().from(trainingNodes);
    const nowMonday = mondayOf(new Date());
    return studentRows.map((u) => {
      const tks = allTasks.filter((t) => t.studentId === u.id);
      const wks = allWeekly.filter((w) => w.studentId === u.id).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
      const shs = allShares.filter((x) => x.studentId === u.id);
      const nds = allNodes.filter((n) => n.studentId === u.id);
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        title: u.title,
        researchDirection: u.researchDirection,
        enrollYear: u.enrollYear,
        expectedGradYear: u.expectedGradYear,
        taskTotal: tks.length,
        taskActive: tks.filter((t) => t.status === "active").length,
        lastWeeklyAt: wks[0]?.weekStart ?? null,
        thisWeekSubmitted: wks.some((w) => w.weekStart === nowMonday),
        pendingReviewWeekly: wks.filter((w) => w.status === "submitted").length,
        docTotal: shs.length,
        docPending: shs.filter((x) => x.status === "submitted").length,
        nodesDone: nds.filter((n) => n.status === "done").length,
        nodesTotal: nds.length,
      };
    });
  }),

  // 学生个人页聚合：总体表现（四子栏目的数据一次取回）
  overview: permProcedure("training.grads", "readonly")
    .input(z.object({ studentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const scope = await visibleScope(ctx);
      if (scope !== null && !scope.includes(input.studentId) && input.studentId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "无权查看该学生的培养情况" });
      const db = getDb();
      const allUsers = await db.select().from(users);
      const stu = allUsers.find((u) => u.id === input.studentId);
      if (!stu) throw new TRPCError({ code: "NOT_FOUND", message: "学生不存在" });
      const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;

      // 1) 研究任务与关键研究点
      const tks = (await db.select().from(researchTasks).where(eq(researchTasks.studentId, input.studentId))).sort((a, b) => b.id - a.id);
      const pts = await db.select().from(researchPoints);
      const pdocs = await db.select().from(pointDocs);
      const tasks = tks.map((t) => ({
        ...t,
        points: pts.filter((p) => p.taskId === t.id).map((p) => ({
          ...p,
          docs: pdocs.filter((d) => d.pointId === p.id),
        })),
      }));

      // 2) 周报
      const weekly = (await db.select().from(weeklyReports).where(eq(weeklyReports.studentId, input.studentId)))
        .sort((a, b) => (a.weekStart < b.weekStart ? 1 : b.id - a.id));

      // 3) 文档提交与导师反馈
      const shares = (await db.select().from(docShares).where(eq(docShares.studentId, input.studentId)))
        .sort((a, b) => b.id - a.id)
        .map((x) => ({ ...x, toUserNames: x.toUserIds.map(nameOf) }));

      // 4) 档案节点成果
      const nodes = (await db.select().from(trainingNodes).where(eq(trainingNodes.studentId, input.studentId)))
        .sort((a, b) => a.id - b.id);
      const ach = (await db.select().from(achievements)).filter(
        (a) => a.fromStudentName === stu.name || (a.authors ?? "").includes(stu.name),
      );
      const pps = (await db.select().from(papers)).filter(
        (p) => p.leaderId === input.studentId || p.participantIds.includes(input.studentId),
      );

      return {
        student: {
          id: stu.id, name: stu.name, role: stu.role, title: stu.title,
          researchDirection: stu.researchDirection, email: stu.email, phone: stu.phone,
          enrollYear: stu.enrollYear, expectedGradYear: stu.expectedGradYear,
          campus: stu.campus, building: stu.building, room: stu.room,
        },
        advisorNames: (await mentorsOfStudent(input.studentId)).map(nameOf),
        tasks,
        weekly,
        shares,
        nodes,
        achievements: ach,
        papers: pps,
        stats: {
          taskTotal: tasks.length,
          taskActive: tasks.filter((t) => t.status === "active").length,
          weeklyTotal: weekly.length,
          weeklyReviewed: weekly.filter((w) => w.status === "reviewed").length,
          docTotal: shares.length,
          nodesDone: nodes.filter((n) => n.status === "done").length,
          nodesTotal: nodes.length,
          achievementTotal: ach.length + pps.length,
        },
      };
    }),
});
