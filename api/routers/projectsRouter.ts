// 2.1 科研项目进度（仅项目管理员及以上）
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permProcedure, audit, isOwnerOrParticipant } from "../auth";
import { getDb } from "../queries/connection";
import { projects, fundCards, projectOutputs, papers, achievements, users } from "@db/schema";
import { TRPCError } from "@trpc/server";
import { FUNDING_OUTPUT_TYPE_LABELS, ACHIEVEMENT_SECTIONS } from "@contracts/constants";

// 需求 6：里程碑支持节点类型（立项/中期检查/结题/审计）与节点文书附件
const milestone = z.object({
  name: z.string(),
  date: z.string(),
  status: z.enum(["pending", "done"]),
  note: z.string().optional(),
  nodeType: z.enum(["立项", "中期检查", "结题", "审计"]).optional(),
  fileIds: z.array(z.number()).optional(), // 立项合同/获批通知书/结题报告等
});

const projectInput = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  source: z.string().optional(),
  leader: z.string().optional(),
  leaderId: z.number().optional(),
  participantIds: z.array(z.number()).default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  totalBudget: z.number().default(0),
  receivedAmount: z.number().default(0),
  status: z.enum(["preparing", "ongoing", "concluding", "concluded"]).default("ongoing"),
  description: z.string().optional(),
  milestones: z.array(milestone).default([]),
  // 需求 6/13：纵向/横向统一入科研项目管理；合同文书入库
  category: z.enum(["vertical", "horizontal"]).default("vertical"),
  contractFileIds: z.array(z.number()).default([]),
});

// 兼容历史空值：JSON 列在老数据上可能为 NULL，统一归一化为数组
function normalize<T extends { milestones: unknown; contractFileIds: unknown; participantIds: unknown }>(p: T) {
  return { ...p, milestones: (p.milestones ?? []) as T["milestones"], contractFileIds: (p.contractFileIds ?? []) as T["contractFileIds"], participantIds: (p.participantIds ?? []) as number[] };
}

function withCountdown<T extends { endDate: string | null; status: string }>(p: T) {
  let daysLeft: number | null = null;
  if (p.endDate) {
    daysLeft = Math.ceil((new Date(p.endDate + "T00:00:00").getTime() - Date.now()) / 86400000);
  }
  return { ...p, daysLeft };
}

function canSeeProject(p: typeof projects.$inferSelect, user: { id: number; name: string }, profile: string) {
  if (profile === "super_admin") return true;
  if (isOwnerOrParticipant(user.id, p.leaderId, p.participantIds ?? [])) return true;
  // 历史 V2.1 数据只有负责人姓名，仅用于兼容过渡；新数据统一使用用户 ID。
  return !p.leaderId && p.leader === user.name;
}

async function assertProjectAccess(id: number, user: { id: number; name: string }, profile: string) {
  const [p] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!p || !canSeeProject(p, user, profile)) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在或无权访问" });
  return p;
}

export const projectsRouter = createRouter({
  list: permProcedure("research.projects", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = (await db.select().from(projects).orderBy(desc(projects.id))).filter((p) => canSeeProject(p, ctx.user, ctx.profile));
    const projectIds = rows.map((p) => p.id);
    const cards = (await db.select().from(fundCards)).filter((c) => c.projectId && projectIds.includes(c.projectId));
    // V6 需求 2：成果归集 —— 每个项目关联的论文/专利/软著等成果（按资助排名排序）
    const links = await db.select().from(projectOutputs);
    const allPapers = await db.select().from(papers);
    const allAchs = await db.select().from(achievements);
    const pathOf = (cat: string) => ACHIEVEMENT_SECTIONS.find((s2) => s2.category === cat)?.path ?? "/achievements";
    const outputsOf = (pid: number) =>
      links
        .filter((l) => l.projectId === pid)
        .sort((a, b) => a.ord - b.ord)
        .map((l) => {
          if (l.outputType === "paper") {
            const o = allPapers.find((x) => x.id === l.outputId);
            return { id: l.id, outputType: l.outputType, outputId: l.outputId, ord: l.ord, title: o?.title ?? `#${l.outputId}`, typeLabel: FUNDING_OUTPUT_TYPE_LABELS.paper, yearOrDate: o?.submitDate ?? "", link: "/research/papers" };
          }
          const o = allAchs.find((x) => x.id === l.outputId);
          return { id: l.id, outputType: l.outputType, outputId: l.outputId, ord: l.ord, title: o?.title ?? `#${l.outputId}`, typeLabel: FUNDING_OUTPUT_TYPE_LABELS[o?.category ?? ""] ?? o?.category ?? "成果", yearOrDate: o ? String(o.year) : "", link: o ? pathOf(o.category) : "/achievements" };
        });
    return rows.map((p) => ({
      ...withCountdown(normalize(p)),
      // 需求 6：经费管理并入科研项目（按 projectId 关联的经费卡）
      funds: cards.filter((c) => c.projectId === p.id),
      outputs: outputsOf(p.id),
    }));
  }),

  // 结题项目列表（需求 12：在成果管理移除后，于科研管理·科研项目管理中以列表给出）
  concluded: permProcedure("research.projects", "readonly").query(async ({ ctx }) => {
    const rows = await getDb().select().from(projects).orderBy(desc(projects.endDate));
    return rows.filter((p) => p.status === "concluded" && canSeeProject(p, ctx.user, ctx.profile)).map((p) => withCountdown(normalize(p)));
  }),

  create: permProcedure("research.projects", "editable")
    .input(projectInput)
    .mutation(async ({ ctx, input }) => {
      const leaderId = input.leaderId ?? ctx.user.id;
      const allUsers = await getDb().select().from(users);
      const leaderName = allUsers.find((u) => u.id === leaderId)?.name ?? ctx.user.name;
      await getDb().insert(projects).values({ ...input, leaderId, leader: leaderName });
      await audit(ctx.user, "新增项目", "research.projects", input.name);
      return { ok: true };
    }),

  update: permProcedure("research.projects", "editable")
    .input(projectInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertProjectAccess(id, ctx.user, ctx.profile);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(projects).set(patch).where(eq(projects.id, id));
      await audit(ctx.user, "编辑项目", "research.projects", `#${id}`);
      return { ok: true };
    }),

  toggleMilestone: permProcedure("research.projects", "editable")
    .input(z.object({ id: z.number(), index: z.number(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const p = await assertProjectAccess(input.id, ctx.user, ctx.profile);
      const ms = [...p.milestones];
      if (ms[input.index]) ms[input.index] = { ...ms[input.index], status: input.done ? "done" : "pending" };
      await db.update(projects).set({ milestones: ms }).where(eq(projects.id, input.id));
      await audit(ctx.user, "更新里程碑", "research.projects", `${p.name} #${input.index}`);
      return { ok: true };
    }),

  remove: permProcedure("research.projects", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(input.id, ctx.user, ctx.profile);
      await getDb().delete(projects).where(eq(projects.id, input.id));
      await getDb().delete(projectOutputs).where(eq(projectOutputs.projectId, input.id));
      await audit(ctx.user, "删除项目", "research.projects", `#${input.id}`);
      return { ok: true };
    }),
});
