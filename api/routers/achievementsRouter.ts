// 模块三：成果管理（9 个子模块 + 统计 + 年度盘点）& 模块四：社会服务
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { permProcedure, audit, createAutoTodo, queueWebsiteUpdate, hasPerm, syncFundings, fundingsOf, clearFundings, studentsOfMentor, assertFundingProjectsVisible } from "../auth";
import { getDb } from "../queries/connection";
import { achievements, socialServices, academicActivities, expertVisits, students, users } from "@db/schema";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_CATEGORY_LABELS, ACHIEVEMENT_SECTIONS } from "@contracts/constants";

const achievementInput = z.object({
  category: z.enum(ACHIEVEMENT_CATEGORIES),
  title: z.string().min(1),
  authors: z.string().optional(),
  year: z.number(),
  date: z.string().optional(),
  detail: z.record(z.string(), z.string()).default({}),
  evidenceFileIds: z.array(z.number()).default([]),
  isPublic: z.boolean().default(false),
  fromStudentName: z.string().optional(),
  // V6 需求 2：资助项目（有序，第一位=第一资助；获批号自动带出项目编号）
  fundingProjectIds: z.array(z.number()).optional(),
});


const PERM_OF_CATEGORY: Record<string, string> = Object.fromEntries(
  ACHIEVEMENT_SECTIONS.map((s2) => [s2.category, s2.perm]),
);
async function assertCategoryPerm(profile: string, category: string, min: "readonly" | "editable" | "manage") {
  const key = PERM_OF_CATEGORY[category] ?? "achievement.list";
  if (!(await hasPerm(profile, key, min)))
    throw new TRPCError({ code: "FORBIDDEN", message: `无权访问【${(ACHIEVEMENT_CATEGORY_LABELS as Record<string,string>)[category] ?? category}】子模块` });
}

export const achievementsRouter = createRouter({
  list: permProcedure("achievement.list", "readonly")
    .input(z.object({ category: z.string().optional(), year: z.number().optional(), keyword: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb().select().from(achievements).orderBy(desc(achievements.id));
      const filtered = rows.filter((a) => {
        if (input?.category && a.category !== input.category) return false;
        if (input?.year && a.year !== input.year) return false;
        if (input?.keyword) {
          const k = input.keyword.toLowerCase();
          if (!`${a.title} ${a.authors ?? ""}`.toLowerCase().includes(k)) return false;
        }
        return true;
      });
      const fmap = await fundingsOf("achievement", filtered.map((a) => a.id), { ...ctx.user, profile: ctx.profile });
      return filtered.map((a) => ({ ...a, fundings: fmap.get(a.id) ?? [] }));
    }),

  create: permProcedure("achievement.list", "editable")
    .input(achievementInput)
    .mutation(async ({ ctx, input }) => {
      await assertCategoryPerm(ctx.profile, input.category, "editable");
      const { fundingProjectIds, ...data } = input;
      if (fundingProjectIds) await assertFundingProjectsVisible(fundingProjectIds, ctx.user, ctx.profile);
      const r: any = await getDb().insert(achievements).values({ ...data, createdBy: ctx.user.id });
      const newId = Number(r[0]?.insertId ?? 0);
      if (newId && fundingProjectIds) await syncFundings("achievement", newId, fundingProjectIds);
      // 获奖类成果 → 网站更新队列（团队获奖 / 学生个人获奖）
      if (input.category === "award" || input.category === "student_work") {
        const isStudent = input.category === "student_work" || !!input.fromStudentName;
        await queueWebsiteUpdate({
          type: isStudent ? "student_award" : "team_award",
          title: `${isStudent ? "学生获奖" : "团队获奖"}：${input.title}`,
          payload: {
            奖项名称: input.title,
            获奖人: input.fromStudentName ?? input.authors ?? "",
            级别: input.detail["奖项"] ?? input.detail["级别"] ?? "",
            日期: input.date ?? String(input.year),
          },
          source: "achievement",
          user: ctx.user,
        });
      }
      await audit(ctx.user, "新增成果", "achievement", `${(ACHIEVEMENT_CATEGORY_LABELS as Record<string,string>)[input.category] ?? input.category}：${input.title}`);
      return { ok: true };
    }),

  update: permProcedure("achievement.list", "editable")
    .input(achievementInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, fundingProjectIds, ...rest } = input;
      const db = getDb();
      const [existing] = await db.select().from(achievements).where(eq(achievements.id, id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "成果不存在" });
      await assertCategoryPerm(ctx.profile, existing.category, "editable");
      if (fundingProjectIds) await assertFundingProjectsVisible(fundingProjectIds, ctx.user, ctx.profile);
      if (!["super_admin", "admin"].includes(ctx.profile) && existing.createdBy !== ctx.user.id && existing.fromStudentName !== ctx.user.name) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能修改本人录入或归属本人的成果；其他有误数据请使用系统内纠错反馈" });
      }
      if (rest.category) await assertCategoryPerm(ctx.profile, rest.category, "editable");
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await db.update(achievements).set(patch).where(eq(achievements.id, id));
      if (fundingProjectIds !== undefined) await syncFundings("achievement", id, fundingProjectIds);
      await audit(ctx.user, "编辑成果", "achievement", `#${id}`);
      return { ok: true };
    }),

  remove: permProcedure("achievement.list", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [existing] = await db.select().from(achievements).where(eq(achievements.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "成果不存在" });
      await assertCategoryPerm(ctx.profile, existing.category, "manage");
      if (!["super_admin", "admin"].includes(ctx.profile) && existing.createdBy !== ctx.user.id && existing.fromStudentName !== ctx.user.name) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能删除本人录入或归属本人的成果" });
      }
      await db.delete(achievements).where(eq(achievements.id, input.id));
      await clearFundings("achievement", input.id);
      await audit(ctx.user, "删除成果", "achievement", `#${input.id}`);
      return { ok: true };
    }),

  // 统计：按年度 + 按类型
  stats: permProcedure("achievement.list", "readonly").query(async () => {
    const rows = await getDb().select().from(achievements);
    const byYear: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const yearCategory = new Map<string, { year: string; published_paper: number; patent: number; award: number }>();
    for (const a of rows) {
      byYear[a.year] = (byYear[a.year] ?? 0) + 1;
      byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
      const year = String(a.year);
      const item = yearCategory.get(year) ?? { year, published_paper: 0, patent: 0, award: 0 };
      if (a.category === "published_paper" || a.category === "patent" || a.category === "award") item[a.category] += 1;
      yearCategory.set(year, item);
    }
    return {
      byYear: Object.entries(byYear).map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year)),
      byYearCategory: [...yearCategory.values()].sort((a, b) => a.year.localeCompare(b.year)),
      byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, label: (ACHIEVEMENT_CATEGORY_LABELS as Record<string,string>)[category] ?? category, count })),
      total: rows.length,
    };
  }),

  // 年度盘点：汇总 + 自动生成《年度科研工作总结》草稿
  annualReview: permProcedure("achievement.list", "readonly")
    .input(z.object({ year: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const achs = (await db.select().from(achievements)).filter((a) => a.year === input.year);
      const acts = (await db.select().from(academicActivities)).filter((a) => a.startDate?.startsWith(String(input.year)) && (ctx.profile === "super_admin" || a.createdBy === ctx.user.id || (a.attendeeIds ?? []).includes(ctx.user.id)));
      const visits = (await db.select().from(expertVisits)).filter((v) => v.reportTime?.startsWith(String(input.year)) && (ctx.profile === "super_admin" || v.hostId === ctx.user.id));
      const group = (cat: string) => achs.filter((a) => a.category === cat);
      const count = (cat: string) => group(cat).length;

      const lines: string[] = [];
      lines.push(`《${input.year} 年度科研工作总结》（系统生成草稿 · 请人工修订）`);
      lines.push("");
      lines.push(`一、年度成果概况`);
      lines.push(`本年度课题组共登记科研成果 ${achs.length} 项，其中：已发表论文 ${count("published_paper")} 篇、已获知识产权 ${count("patent")} 项、科研奖励 ${count("award")} 项、学生研究成果 ${count("student_work")} 项、专著与教材 ${count("book")} 部、软件著作权与标准 ${count("software_copyright")} 项。（结题/在研/横向项目请见【科研管理·科研项目管理】）`);
      lines.push("");
      if (count("published_paper") > 0) {
        lines.push(`二、代表性论文`);
        group("published_paper").slice(0, 10).forEach((a, i) => lines.push(`${i + 1}. ${a.authors ?? ""}. ${a.title}. ${a.detail["期刊"] ?? a.detail["venue"] ?? ""}, ${a.year}.`));
        lines.push("");
      }
      lines.push(`三、学术活动与对外交流`);
      lines.push(`本年度参加/组织学术活动 ${acts.length} 次，接待专家来访学术报告 ${visits.length} 场。`);
      visits.slice(0, 10).forEach((v, i) => lines.push(`${i + 1}. ${v.reportTime ?? ""} ${v.expertName}（${v.expertOrg ?? ""}）：《${v.reportTitle}》`));
      lines.push("");
      lines.push(`四、下一年度工作计划`);
      lines.push(`（请课题组补充）`);
      lines.push("");
      lines.push(`—— 本总结由系统根据 ${input.year} 年度归档数据自动生成，请审核修订后导出。`);

      return {
        year: input.year,
        summary: { achievements: achs.length, papers: count("published_paper"), patents: count("patent"), awards: count("award"), activities: acts.length, visits: visits.length },
        achievements: achs,
        report: lines.join("\n"),
      };
    }),

  // 个人年度科研表现报告
  personalReport: permProcedure("achievement.list", "readonly")
    .input(z.object({ year: z.number(), name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const stu = (await db.select().from(students)).find((s) => s.name === input.name);
      const targetUser = (await db.select().from(users)).find((u) => u.name === input.name);
      if (ctx.profile !== "super_admin" && input.name !== ctx.user.name) {
        const scope = await studentsOfMentor(ctx.user.id);
        if (!targetUser || !scope.includes(targetUser.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "只能生成本人或名下学生的年度科研表现报告" });
        }
      }
      const achs = (await db.select().from(achievements)).filter(
        (a) => a.year === input.year && ((a.authors ?? "").includes(input.name) || a.fromStudentName === input.name),
      );
      const lines: string[] = [];
      lines.push(`《${input.year} 年度个人科研表现报告》—— ${input.name}`);
      lines.push("");
      lines.push(`一、成果数量与质量`);
      lines.push(`本年度登记成果 ${achs.length} 项：`);
      achs.forEach((a, i) => lines.push(`${i + 1}. [${(ACHIEVEMENT_CATEGORY_LABELS as Record<string,string>)[a.category] ?? a.category}] ${a.title}`));
      if (achs.length === 0) lines.push("（本年度暂无登记成果）");
      lines.push("");
      if (stu) {
        lines.push(`二、培养节点进展`);
        lines.push(`开题：${stu.proposalStatus ?? "未开始"}；中期：${stu.midtermStatus ?? "未开始"}；答辩：${stu.defenseStatus ?? "未开始"}。`);
        lines.push(`研究方向：${stu.direction ?? "—"}；负责导师：${stu.advisor ?? "—"}。`);
        lines.push("");
      }
      lines.push(`三、进展评价`);
      lines.push(achs.length >= 3 ? "本年度成果产出丰富，科研状态活跃，建议继续保持并冲击更高水平成果。" : achs.length >= 1 ? "本年度有一定成果产出，建议加强高水平成果的规划与积累。" : "本年度成果产出偏少，建议明确研究目标、加快进度。");
      lines.push("");
      lines.push(`—— 本报告由系统自动生成，供导师评阅参考。`);
      return { report: lines.join("\n"), count: achs.length };
    }),
});

// ============ 模块四：社会服务 ============
const socialInput = z.object({
  type: z.enum(["parttime", "academic_org", "conference_host", "review", "advisory", "popularization"]),
  orgName: z.string().min(1),
  position: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  deadline: z.string().optional(),
  confidential: z.boolean().default(false),
  detail: z.record(z.string(), z.string()).default({}),
  attachmentFileIds: z.array(z.number()).default([]),
  isPublic: z.boolean().default(false),
});

export const socialRouter = createRouter({
  list: permProcedure("social.list", "readonly")
    .input(z.object({ type: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb().select().from(socialServices).orderBy(desc(socialServices.id));
      return rows.filter((r) => (!input?.type || r.type === input.type) && (ctx.profile === "super_admin" || r.ownerId === ctx.user.id));
    }),

  create: permProcedure("social.list", "editable")
    .input(socialInput)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // 查重：同类型 + 同组织 + 同职务 不重复录入
      const rows = await db.select().from(socialServices);
      const dup = rows.find((r) => r.type === input.type && r.orgName === input.orgName && (r.position ?? "") === (input.position ?? "") && (r.startDate ?? "") === (input.startDate ?? ""));
      if (dup) return { ok: false, message: "查重拦截：已存在相同类型/单位/职务/起始时间的记录" };
      const res = await db.insert(socialServices).values({ ...input, ownerId: ctx.user.id });
      // 学术评审截止日期 → 自动进入本人待办
      if (input.type === "review" && input.deadline) {
        await createAutoTodo({
          title: `评审截止提醒：${input.orgName}`,
          description: `${input.detail["评审类型"] ?? "学术评审"}，委托单位 ${input.orgName}，截止 ${input.deadline}。`,
          priority: "high",
          dueDate: input.deadline,
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [ctx.user.id],
          source: "social_review",
          sourceRefId: Number(res[0].insertId),
        link: "/social",
        });
      }
      await audit(ctx.user, "新增社会服务记录", "social", input.orgName);
      return { ok: true };
    }),

  update: permProcedure("social.list", "editable")
    .input(socialInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [existing] = await getDb().select().from(socialServices).where(eq(socialServices.id, id)).limit(1);
      if (!existing || (ctx.profile !== "super_admin" && existing.ownerId !== ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在或无权修改" });
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(socialServices).set(patch).where(eq(socialServices.id, id));
      await audit(ctx.user, "编辑社会服务记录", "social", `#${id}`);
      return { ok: true };
    }),

  remove: permProcedure("social.list", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await getDb().select().from(socialServices).where(eq(socialServices.id, input.id)).limit(1);
      if (!existing || (ctx.profile !== "super_admin" && existing.ownerId !== ctx.user.id)) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在或无权删除" });
      await getDb().delete(socialServices).where(eq(socialServices.id, input.id));
      await audit(ctx.user, "删除社会服务记录", "social", `#${input.id}`);
      return { ok: true };
    }),
});
