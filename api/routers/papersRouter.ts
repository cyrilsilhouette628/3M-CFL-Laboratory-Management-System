// 2.4 投稿论文进度（牵头人/参与者数据归属）+ 2.5 审稿情况（AI 推荐审稿人 + 自动待办）
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { permProcedure, audit, createAutoTodo, queueWebsiteUpdate, syncFundings, fundingsOf, clearFundings, isOwnerOrParticipant, completeSourceTodos, assertFundingProjectsVisible } from "../auth";
import { getDb } from "../queries/connection";
import { papers, paperRounds, reviews, users, achievements, projectOutputs } from "@db/schema";
import { PAPER_STATUS_FLOW } from "@contracts/constants";
import { and } from "drizzle-orm";

const paperInput = z.object({
  title: z.string().min(1),
  authors: z.string().optional(),
  journal: z.string().optional(),
  targetTier: z.string().optional(),
  status: z.enum(PAPER_STATUS_FLOW).default("writing"),
  submitDate: z.string().optional(),
  doi: z.string().optional(),
  fileId: z.number().optional(),
  leaderId: z.number(),
  participantIds: z.array(z.number()).default([]),
  note: z.string().optional(),
  // V6 需求 2：资助项目（有序，第一位=第一资助；获批号自动带出项目编号）
  fundingProjectIds: z.array(z.number()).optional(),
});

async function assertPaperAccess(id: number, user: { id: number }, profile: string) {
  const [p] = await getDb().select().from(papers).where(eq(papers.id, id)).limit(1);
  if (!p || (profile !== "super_admin" && !isOwnerOrParticipant(user.id, p.leaderId, p.participantIds))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "论文不存在或无权访问" });
  }
  return p;
}

function canSeeReview(review: typeof reviews.$inferSelect, userId: number, profile: string) {
  return profile === "super_admin" || review.createdBy === userId || review.assignments.some((a) => a.reviewerId === userId);
}

async function assertReviewAccess(id: number, userId: number, profile: string) {
  const [review] = await getDb().select().from(reviews).where(eq(reviews.id, id)).limit(1);
  if (!review || !canSeeReview(review, userId, profile)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "审稿记录不存在或无权访问" });
  }
  return review;
}

export const papersRouter = createRouter({
  list: permProcedure("research.papers", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(papers).orderBy(desc(papers.id));
    const allUsers = await db.select().from(users);
    const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;
    const scoped =
      ctx.profile === "super_admin"
        ? rows
        : rows.filter((p) => p.leaderId === ctx.user.id || p.participantIds.includes(ctx.user.id));
    const fmap = await fundingsOf("paper", scoped.map((p) => p.id), { ...ctx.user, profile: ctx.profile });
    return scoped.map((p) => ({
      ...p,
      leaderName: nameOf(p.leaderId),
      participantNames: p.participantIds.map(nameOf),
      fundings: fmap.get(p.id) ?? [],
    }));
  }),

  create: permProcedure("research.papers", "editable")
    .input(paperInput)
    .mutation(async ({ ctx, input }) => {
      const { fundingProjectIds, ...data } = input;
      if (fundingProjectIds) await assertFundingProjectsVisible(fundingProjectIds, ctx.user, ctx.profile);
      const r: any = await getDb().insert(papers).values(data);
      const newId = Number(r[0]?.insertId ?? 0);
      if (newId && fundingProjectIds) await syncFundings("paper", newId, fundingProjectIds);
      await audit(ctx.user, "新增投稿论文", "research.papers", input.title);
      return { ok: true, id: newId };
    }),

  update: permProcedure("research.papers", "editable")
    .input(paperInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, fundingProjectIds, ...rest } = input;
      await assertPaperAccess(id, ctx.user, ctx.profile);
      if (fundingProjectIds) await assertFundingProjectsVisible(fundingProjectIds, ctx.user, ctx.profile);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(papers).set(patch).where(eq(papers.id, id));
      if (fundingProjectIds !== undefined) await syncFundings("paper", id, fundingProjectIds);
      await audit(ctx.user, "编辑投稿论文", "research.papers", `#${id}`);
      return { ok: true };
    }),

  advanceStatus: permProcedure("research.papers", "editable")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const p = await assertPaperAccess(input.id, ctx.user, ctx.profile);
      // 投稿阶段（投稿→外审→待修/拒稿→重投…）由【投稿轮次】驱动，这里仅处理录用后的发表流程
      const POST_ACCEPT: Partial<Record<(typeof PAPER_STATUS_FLOW)[number], (typeof PAPER_STATUS_FLOW)[number]>> = { accepted: "online", online: "indexed", indexed: "indexed" };
      const next = POST_ACCEPT[p.status];
      if (!next)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "投稿中的论文请通过【投稿轮次】记录外审/拒稿/录用决议",
        });
      await db.update(papers).set({ status: next }).where(eq(papers.id, input.id));
      // V6 需求 5：在线发表 → 检索 时自动登记【已发表论文】成果（预填信息，留待作者补充）
      let newAchievementId: number | null = null;
      if (next === "indexed" && !p.achievementId) {
        const today = new Date().toISOString().slice(0, 10);
        const ra: any = await db.insert(achievements).values({
          category: "published_paper",
          title: p.title,
          authors: p.authors ?? "",
          year: Number(today.slice(0, 4)),
          date: today,
          detail: {
            期刊: p.journal ?? "",
            分区: p.targetTier ?? "",
            DOI: p.doi ?? "",
            卷期页: "",
            收录情况: "",
            影响因子: "",
            _来源: `投稿论文流转自动登记（#${p.id}），请补充完善`,
          },
          evidenceFileIds: p.fileId ? [p.fileId] : [],
          isPublic: false,
        });
        newAchievementId = Number(ra[0]?.insertId ?? 0) || null;
        if (newAchievementId) {
          await db.update(papers).set({ achievementId: newAchievementId }).where(eq(papers.id, p.id));
          // 资助关系自动迁移：投稿论文 → 已发表论文成果
          const links = await db.select().from(projectOutputs).where(and(eq(projectOutputs.outputType, "paper"), eq(projectOutputs.outputId, p.id)));
          for (const l of links) {
            await db.insert(projectOutputs).values({ projectId: l.projectId, outputType: "achievement", outputId: newAchievementId, ord: l.ord });
          }
          if (links.length) await clearFundings("paper", p.id);
          // 给牵头人发"补充成果信息"待办
          await createAutoTodo({
            title: `补充成果信息：论文《${p.title}》已转入已发表论文`,
            description: "已自动登记到【成果管理·已发表论文】（预填题目/作者/期刊/分区/DOI），请补充收录情况、影响因子、卷期页等信息并核对资助项目。",
            priority: "medium",
            creatorId: ctx.user.id,
            creatorName: ctx.user.name,
            leaderIds: [p.leaderId],
            source: "achievement",
            sourceRefId: newAchievementId,
            link: "/achievements/papers",
          });
        }
      }
      // 在线发表/检索 → 自动进入网站更新队列（最新论文发表情况）
      if (next === "online" || next === "indexed") {
        await queueWebsiteUpdate({
          type: "paper",
          title: `论文发表：${p.title}`,
          payload: { 题目: p.title, 作者: p.authors ?? "", 期刊会议: p.journal ?? "", 发表日期: p.submitDate ?? "", DOI: p.doi ?? "" },
          source: "research.papers",
          user: ctx.user,
        });
      }
      await audit(ctx.user, "论文状态流转", "research.papers", `${p.title}: ${p.status} → ${next}${newAchievementId ? `（登记成果 #${newAchievementId}）` : ""}`);
      return { ok: true, status: next, achievementId: newAchievementId ?? p.achievementId ?? null };
    }),

  remove: permProcedure("research.papers", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertPaperAccess(input.id, ctx.user, ctx.profile);
      await getDb().delete(papers).where(eq(papers.id, input.id));
      await clearFundings("paper", input.id);
      await audit(ctx.user, "删除投稿论文", "research.papers", `#${input.id}`);
      return { ok: true };
    }),
});

// ============ 2.5 审稿情况 ============
const reviewInput = z.object({
  title: z.string().min(1),
  authors: z.string().optional(),
  direction: z.string().optional(),
  keywords: z.string().optional(),
  journal: z.string().optional(),
  fileId: z.number().optional(),
  note: z.string().optional(),
});

export const reviewsRouter = createRouter({
  list: permProcedure("research.reviews", "readonly").query(async ({ ctx }) => {
    const rows = await getDb().select().from(reviews).orderBy(desc(reviews.id));
    return rows.filter((r) => canSeeReview(r, ctx.user.id, ctx.profile));
  }),

  create: permProcedure("research.reviews", "editable")
    .input(reviewInput)
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(reviews).values({ ...input, assignments: [], createdBy: ctx.user.id });
      await audit(ctx.user, "新增待审稿件", "research.reviews", input.title);
      return { ok: true };
    }),

  update: permProcedure("research.reviews", "editable")
    .input(reviewInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertReviewAccess(id, ctx.user.id, ctx.profile);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(reviews).set(patch).where(eq(reviews.id, id));
      await audit(ctx.user, "编辑稿件", "research.reviews", `#${id}`);
      return { ok: true };
    }),

  // AI 推荐审稿人：基于用户科研方向与稿件方向/关键词匹配打分
  recommend: permProcedure("research.reviews", "editable")
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const r = await assertReviewAccess(input.id, ctx.user.id, ctx.profile);
      const allUsers = await db.select().from(users);
      const terms = `${r.direction ?? ""} ${r.keywords ?? ""} ${r.title}`
        .toLowerCase()
        .split(/[,，;；\s]+/)
        .filter(Boolean);
      const candidates = allUsers
        .filter((u) => u.active && ["grad", "benyan", "teacher", "postdoc", "super_admin"].includes(u.role))
        .map((u) => {
          const dir = (u.researchDirection || "").toLowerCase();
          const matched = terms.filter((t) => t.length >= 2 && dir.includes(t));
          const score = Math.min(99, 40 + matched.length * 20 + (u.role === "teacher" || u.isAdmin ? 10 : 0));
          return {
            userId: u.id,
            name: u.name,
            role: u.role,
            direction: u.researchDirection,
            matched,
            score,
          };
        })
        .sort((a, b) => b.score - a.score);
      return candidates.slice(0, 5);
    }),

  // 确定审稿人并设置截止日期 → 自动生成待办
  assign: permProcedure("research.reviews", "editable")
    .input(
      z.object({
        id: z.number(),
        assignments: z.array(z.object({ reviewerId: z.number(), deadline: z.string() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const r = await assertReviewAccess(input.id, ctx.user.id, ctx.profile);
      const allUsers = await db.select().from(users);
      const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;
      const assignments = input.assignments.map((a) => ({
        reviewerId: a.reviewerId,
        reviewerName: nameOf(a.reviewerId),
        deadline: a.deadline,
        status: "pending" as const,
      }));
      await db
        .update(reviews)
        .set({ assignments, status: "in_review" })
        .where(eq(reviews.id, input.id));
      // 为每位审稿人生成待办
      for (const a of assignments) {
        await createAutoTodo({
          title: `审稿任务：${r.title}`,
          description: `稿件《${r.title}》请于 ${a.deadline} 前完成审稿。研究方向：${r.direction ?? "—"}`,
          priority: "high",
          dueDate: a.deadline,
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [a.reviewerId],
          source: "review",
          sourceRefId: r.id,
        link: "/research/reviews",
        });
      }
      await audit(ctx.user, "指派审稿人", "research.reviews", `${r.title} → ${assignments.map((a) => a.reviewerName).join("、")}`);
      return { ok: true };
    }),

  completeAssignment: permProcedure("research.reviews", "editable")
    .input(z.object({ id: z.number(), reviewerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const r = await assertReviewAccess(input.id, ctx.user.id, ctx.profile);
      if (ctx.profile !== "super_admin" && input.reviewerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能办理分配给本人的审稿任务" });
      }
      if (!r.assignments.some((a) => a.reviewerId === input.reviewerId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该审稿人不在本稿件的指派名单中" });
      }
      const assignments = r.assignments.map((a) =>
        a.reviewerId === input.reviewerId ? { ...a, status: "done" as const } : a,
      );
      const allDone = assignments.every((a) => a.status === "done");
      await db
        .update(reviews)
        .set({ assignments, status: allDone ? "done" : "in_review" })
        .where(eq(reviews.id, input.id));
      await completeSourceTodos("review", r.id, input.reviewerId);
      await audit(ctx.user, "完成审稿", "research.reviews", r.title);
      return { ok: true };
    }),

  remove: permProcedure("research.reviews", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertReviewAccess(input.id, ctx.user.id, ctx.profile);
      await getDb().delete(reviews).where(eq(reviews.id, input.id));
      await audit(ctx.user, "删除稿件", "research.reviews", `#${input.id}`);
      return { ok: true };
    }),
});

// ============ 需求 8：投稿轮次（已投稿→外审→拒稿/待修→修改重投→…→录用）============
export const paperRoundsRouter = createRouter({
  list: permProcedure("research.papers", "readonly")
    .input(z.object({ paperId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPaperAccess(input.paperId, ctx.user, ctx.profile);
      const rows = await getDb()
        .select()
        .from(paperRounds)
        .where(eq(paperRounds.paperId, input.paperId))
        .orderBy(desc(paperRounds.round));
      return rows;
    }),

  // 发起新一轮投稿（首轮投稿 / 拒稿后修改重投）
  add: permProcedure("research.papers", "editable")
    .input(
      z.object({
        paperId: z.number(),
        venue: z.string().min(1, "请填写投稿期刊/会议"),
        submittedAt: z.string().min(4),
        fileIds: z.array(z.number()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const p = await assertPaperAccess(input.paperId, ctx.user, ctx.profile);
      const existing = await db.select().from(paperRounds).where(eq(paperRounds.paperId, input.paperId));
      // 存在进行中的轮次（未出决议）时不允许重复投稿
      const open = existing.find((r) => ["submitted", "under_review", "revision"].includes(r.status));
      if (open)
        throw new TRPCError({ code: "BAD_REQUEST", message: `第 ${open.round} 轮投稿尚未出决议，请先登记决议` });
      const round = existing.reduce((m, r) => Math.max(m, r.round), 0) + 1;
      await db.insert(paperRounds).values({
        paperId: input.paperId,
        round,
        venue: input.venue,
        submittedAt: input.submittedAt,
        fileIds: input.fileIds,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name,
      });
      await db
        .update(papers)
        .set({ status: "submitted", journal: input.venue, submitDate: input.submittedAt })
        .where(eq(papers.id, input.paperId));
      await audit(ctx.user, "发起投稿轮次", "research.papers", `${p.title} 第 ${round} 轮 → ${input.venue}`);
      return { ok: true, round };
    }),

  // 登记当轮决议：送外审 / 待修 / 拒稿 / 录用
  decide: permProcedure("research.papers", "editable")
    .input(
      z.object({
        id: z.number(), // round id
        decision: z.enum(["under_review", "revision", "rejected", "accepted"]),
        decisionAt: z.string().optional(),
        decisionNote: z.string().optional(),
        fileIds: z.array(z.number()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [r] = await db.select().from(paperRounds).where(eq(paperRounds.id, input.id)).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "投稿轮次不存在" });
      await assertPaperAccess(r.paperId, ctx.user, ctx.profile);
      await db
        .update(paperRounds)
        .set({
          status: input.decision,
          decisionAt: input.decisionAt ?? new Date().toISOString().slice(0, 10),
          decisionNote: input.decisionNote,
          fileIds: input.fileIds.length ? [...r.fileIds, ...input.fileIds] : r.fileIds,
        })
        .where(eq(paperRounds.id, input.id));
      await db.update(papers).set({ status: input.decision }).where(eq(papers.id, r.paperId));
      const [p] = await db.select().from(papers).where(eq(papers.id, r.paperId)).limit(1);
      // 决议 → 牵头人/参与者待办提醒
      const label = { under_review: "送外审", revision: "待修", rejected: "拒稿", accepted: "录用" }[input.decision];
      if (p) {
        await createAutoTodo({
          title: `论文${label}：${p.title}（第 ${r.round} 轮）`,
          description: input.decisionNote ?? "",
          priority: input.decision === "rejected" ? "high" : "medium",
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [p.leaderId],
          participantIds: p.participantIds,
          source: "paper_round",
          sourceRefId: r.id,
          link: "/research/papers",
        });
      }
      await audit(ctx.user, "登记投稿决议", "research.papers", `轮次 #${input.id} → ${label}`);
      return { ok: true };
    }),

  // 拒稿清单：含拒稿轮的论文 + 各拒稿轮详情
  rejectList: permProcedure("research.papers", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const allPapers = await db.select().from(papers).orderBy(desc(papers.id));
    const scoped =
      ctx.profile === "super_admin"
        ? allPapers
        : allPapers.filter((p) => p.leaderId === ctx.user.id || p.participantIds.includes(ctx.user.id));
    const rounds = await db.select().from(paperRounds).orderBy(desc(paperRounds.id));
    const allUsers = await db.select().from(users);
    const nameOf = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`;
    return scoped
      .map((p) => ({
        ...p,
        leaderName: nameOf(p.leaderId),
        participantNames: p.participantIds.map(nameOf),
        rejectedRounds: rounds.filter((r) => r.paperId === p.id && r.status === "rejected"),
      }))
      .filter((p) => p.rejectedRounds.length > 0);
  }),
});
