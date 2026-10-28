// 6.1 用户与权限管理（身份 × 管理标志 正交模型）
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { createRouter } from "../middleware";
import {
  authedProcedure,
  permProcedure,
  hashPassword,
  audit,
  getPermLevel,
  queueWebsiteUpdate,
} from "../auth";
import { getDb } from "../queries/connection";
import { users, rolePermissions, auditLogs, advisorMap, students } from "@db/schema";
import {
  ROLES,
  PERM_LEVELS,
  PERM_PROFILES,
  ROLE_NAME_TO_KEY,
  ROLE_LABELS,
  type Role,
  type PermLevel,
} from "@contracts/constants";

const userInput = z.object({
  username: z.string().min(2),
  name: z.string().min(1),
  role: z.enum(ROLES),
  isAdmin: z.boolean().default(false),
  title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  researchDirection: z.string().optional(),
  orcid: z.string().optional(),
  homepage: z.string().optional(),
  // V5 需求 7：用户字段全局梳理（身份证号/校区/楼宇房间/入学与预计毕业年份）
  idCard: z.string().max(32).optional(),
  mainCampus: z.string().max(64).optional(),
  campus: z.string().max(64).optional(),
  building: z.string().max(64).optional(),
  room: z.string().max(64).optional(),
  enrollYear: z.number().int().min(1950).max(2100).nullable().optional(),
  expectedGradYear: z.number().int().min(1950).max(2100).nullable().optional(),
  // V10：科研管理常用统计字段
  gender: z.string().max(10).optional(),
  birthDate: z.string().max(10).optional(),
  staffNo: z.string().max(50).optional(),
  degree: z.string().max(50).optional(),
  almaMater: z.string().max(200).optional(),
  politicalStatus: z.string().max(50).optional(),
  joinDate: z.string().max(10).optional(),
  password: z.string().min(6).optional(),
  // 需求 1：学生/博士后设置指导教师（可多选）；教师侧反向自动可见
  advisorIds: z.array(z.number()).default([]),
});

// V11：非超管管理员的写操作目标只能是学生账号（研究生/本科生/实习生）
const STUDENT_ROLES = ["grad", "benyan", "intern"];
async function assertStudentTarget(profile: string, targetId: number, managerId: number) {
  if (profile === "super_admin") return;
  const [u] = await getDb().select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!u || !STUDENT_ROLES.includes(u.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理员仅可管理学生账号（研究生/本科生/实习生）；其他账号请联系超级管理员" });
  }
  const mappings = await getDb().select().from(advisorMap).where(eq(advisorMap.studentId, targetId));
  if (!mappings.some((item) => item.mentorId === managerId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "只能管理自己名下的学生账号" });
  }
}

// 同步某学生的指导教师映射（全量替换）
async function syncAdvisors(studentId: number, mentorIds: number[]) {
  const db = getDb();
  await db.delete(advisorMap).where(eq(advisorMap.studentId, studentId));
  // V6 需求 1：数组顺序即导师位次，第一位为主负责导师（ord=1）
  const uniq = [...new Set(mentorIds)];
  for (let i = 0; i < uniq.length; i++) {
    await db.insert(advisorMap).values({ studentId, mentorId: uniq[i], ord: i + 1 });
  }
}

// 博士后账号与合作导师名册共用同一份人员关系，避免重复建档。
async function syncPostdocRoster(userId: number) {
  const db = getDb();
  const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!account || account.role !== "postdoc") return;
  const maps = await db.select().from(advisorMap).where(eq(advisorMap.studentId, userId)).orderBy(advisorMap.ord);
  const mentorNames: string[] = [];
  for (const map of maps) {
    const [mentor] = await db.select({ name: users.name }).from(users).where(eq(users.id, map.mentorId)).limit(1);
    if (mentor) mentorNames.push(mentor.name);
  }
  const values = {
    kind: "postdoc" as const,
    name: account.name,
    gender: account.gender,
    phone: account.phone,
    email: account.email,
    advisor: mentorNames.join("、").slice(0, 64),
    direction: account.researchDirection,
    detail: { 进站日期: account.joinDate ?? "", 在站状态: account.active ? "在站" : "已出站" },
    userId,
  };
  const [existing] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1);
  if (existing) await db.update(students).set(values).where(eq(students.id, existing.id));
  else await db.insert(students).values({ ...values, files: [] });
}

// 人员变动 → 网站更新队列
async function queuePeopleChange(
  user: { id: number; name: string } | null,
  u: { name: string; role: string; title?: string | null; researchDirection?: string | null },
  change: "入职" | "离职" | "入学" | "离校" | "进站" | "出站",
) {
  const isTeacherSide = ["super_admin", "teacher"].includes(u.role);
  const kindLabel =
    u.role === "postdoc" ? "博士后" : u.role === "benyan" ? "本科生" : u.role === "intern" ? "实习生" : u.role === "grad" ? "研究生" : "教师";
  await queueWebsiteUpdate({
    type: isTeacherSide ? "teacher_change" : "student_change",
    title: `${isTeacherSide ? "教师" : kindLabel}${change}：${u.name}`,
    payload: isTeacherSide
      ? { 姓名: u.name, 职称: u.title ?? "", 变动类型: change, 研究方向: u.researchDirection ?? "", 日期: new Date().toISOString().slice(0, 10) }
      : { 姓名: u.name, 类别: kindLabel, 变动类型: change, 导师: "", 日期: new Date().toISOString().slice(0, 10) },
    source: "config.users",
    user,
  });
}

export const usersRouter = createRouter({
  list: permProcedure("config.users", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(users).orderBy(users.id);
    const maps = await db.select().from(advisorMap);
    const menteeIds = maps.filter((m) => m.mentorId === ctx.user.id).map((m) => m.studentId);
    const visibleRows = ctx.profile === "super_admin"
      ? rows
      : rows.filter((u) => u.id === ctx.user.id || menteeIds.includes(u.id));
    const nameOf = (id: number) => rows.find((u) => u.id === id)?.name ?? `#${id}`;
    return visibleRows.map(({ passwordHash: _, ...u }) => {
      const advisorIds = maps.filter((m) => m.studentId === u.id).sort((a, b) => a.ord - b.ord).map((m) => m.mentorId);
      const menteeIds = maps.filter((m) => m.mentorId === u.id).map((m) => m.studentId);
      return {
        ...u,
        advisorIds,
        advisorNames: advisorIds.map(nameOf),
        menteeNames: menteeIds.map(nameOf),
      };
    });
  }),

  // 供各模块选择牵头人/参与人/审稿人/导师（登录即可见基础信息）
  options: authedProcedure.query(async () => {
    const rows = await getDb().select().from(users).orderBy(users.id);
    return rows
      .filter((u) => u.active)
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        isAdmin: u.isAdmin,
        title: u.title,
        researchDirection: u.researchDirection,
        email: u.email,
      }));
  }),

  create: permProcedure("config.users", "manage")
    .input(userInput)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [dup] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
      if (dup) throw new TRPCError({ code: "BAD_REQUEST", message: "用户名已存在" });
      const { password, advisorIds: rawAdvisorIds, ...rest } = input;
      // V11：管理员（非超管）仅可添加自己名下指导的学生（研究生/本科生/实习生），主导师默认为本人；
      //      超级管理员可添加任意角色、为研究生指定任意导师
      let advisorIds = rawAdvisorIds;
      if (ctx.profile !== "super_admin") {
        if (!["grad", "benyan", "intern"].includes(input.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理员仅可添加自己名下指导的学生（研究生/本科生/实习生）；添加教师/博士后等账号请联系超级管理员" });
        }
        advisorIds = [ctx.user.id, ...rawAdvisorIds.filter((x) => x !== ctx.user.id)];
      }
      const r: any = await db.insert(users).values({
        ...rest,
        passwordHash: hashPassword(password || "123456"),
        // V10：新建用户首次登录强制改强密码 + 完善基本信息
        mustChangePassword: true,
        mustCompleteProfile: true,
      });
      const newId = Number(r[0]?.insertId || 0);
      if (newId && advisorIds.length) await syncAdvisors(newId, advisorIds);
      if (newId && input.role === "postdoc") await syncPostdocRoster(newId);
      // 教师入职 / 博士后进站 / 学生入学 → 网站更新队列
      const change = input.role === "postdoc" ? "进站" : ["super_admin", "teacher"].includes(input.role) ? "入职" : "入学";
      await queuePeopleChange(ctx.user, input, change);
      await audit(ctx.user, "新增用户", "config.users", `新增用户 ${input.name}（${ROLE_LABELS[input.role]}${input.isAdmin ? "·管理员" : ""}）`);
      return { ok: true };
    }),

  update: permProcedure("config.users", "manage")
    .input(userInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      let { id, password, advisorIds, ...rest } = input;
      await assertStudentTarget(ctx.profile, id, ctx.user.id);
      const db = getDb();
      // V11：管理员（非超管）编辑时同样受限：不能把学生改成教师/博士后等角色；导师映射强制本人为主负责导师
      if (ctx.profile !== "super_admin") {
        if (rest.role && !["grad", "benyan", "intern"].includes(rest.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理员仅可管理学生账号（研究生/本科生/实习生）；其他角色请联系超级管理员" });
        }
        if (rest.isAdmin === true) {
          throw new TRPCError({ code: "FORBIDDEN", message: "仅超级管理员可授予管理标志" });
        }
        if (advisorIds !== undefined) advisorIds = [ctx.user.id, ...advisorIds.filter((x) => x !== ctx.user.id)];
      }
      await db.update(users).set(rest).where(eq(users.id, id));
      if (advisorIds !== undefined) await syncAdvisors(id, advisorIds);
      if (password) {
        await db.update(users).set({ passwordHash: hashPassword(password), mustChangePassword: true }).where(eq(users.id, id));
      }
      await syncPostdocRoster(id);
      await audit(ctx.user, "编辑用户", "config.users", `编辑用户 #${id}`);
      return { ok: true };
    }),

  toggleActive: permProcedure("config.users", "manage")
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertStudentTarget(ctx.profile, input.id, ctx.user.id);
      const db = getDb();
      const [u] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      await db.update(users).set({ active: input.active }).where(eq(users.id, input.id));
      await syncPostdocRoster(input.id);
      // 停用 = 离职/离校/出站 → 网站更新队列
      if (!input.active && u) {
        const change = u.role === "postdoc" ? "出站" : ["super_admin", "teacher"].includes(u.role) ? "离职" : "离校";
        await queuePeopleChange(ctx.user, u, change);
      }
      await audit(ctx.user, input.active ? "启用账号" : "停用账号", "config.users", `用户 #${input.id}`);
      return { ok: true };
    }),

  // V11：受限状态（毕业/离校）——可登录浏览，禁止数据增删改；与停用（不能登录）正交
  setRestricted: permProcedure("config.users", "manage")
    .input(z.object({ id: z.number(), restricted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertStudentTarget(ctx.profile, input.id, ctx.user.id);
      if (input.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "不能对自己设置受限状态" });
      await getDb().update(users).set({ restricted: input.restricted }).where(eq(users.id, input.id));
      await audit(ctx.user, input.restricted ? "设为受限状态" : "解除受限状态", "config.users", `用户 #${input.id}`);
      return { ok: true };
    }),

  remove: permProcedure("config.users", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertStudentTarget(ctx.profile, input.id, ctx.user.id);
      if (input.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "不能删除自己" });
      await getDb().delete(users).where(eq(users.id, input.id));
      await audit(ctx.user, "删除用户", "config.users", `删除用户 #${input.id}`);
      return { ok: true };
    }),

  resetPassword: permProcedure("config.users", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertStudentTarget(ctx.profile, input.id, ctx.user.id);
      await getDb()
        .update(users)
        .set({ passwordHash: hashPassword("123456"), mustChangePassword: true })
        .where(eq(users.id, input.id));
      await audit(ctx.user, "重置密码", "config.users", `重置用户 #${input.id} 密码为初始密码`);
      return { ok: true };
    }),

  // Excel 批量导入（前端解析后传入行数据；角色支持中文名）
  batchImport: permProcedure("config.users", "manage")
    .input(z.array(userInput.extend({ role: z.string() })))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let created = 0;
      for (const row of input) {
        const [dup] = await db.select().from(users).where(eq(users.username, row.username)).limit(1);
        if (dup) continue;
        const role: Role =
          ROLE_NAME_TO_KEY[row.role] ?? ((ROLES as readonly string[]).includes(row.role) ? (row.role as Role) : "guest");
        // V11：非超管批量导入仅限学生角色，其余行跳过
        if (ctx.profile !== "super_admin" && !STUDENT_ROLES.includes(role)) continue;
        let { advisorIds, ...rowRest } = row;
        if (ctx.profile !== "super_admin") advisorIds = [ctx.user.id, ...(advisorIds ?? []).filter((x: number) => x !== ctx.user.id)];
        const r: any = await db.insert(users).values({
          ...rowRest,
          role,
          passwordHash: hashPassword(row.password || "123456"),
          // V10：导入用户首次登录强制改强密码 + 完善基本信息
          mustChangePassword: true,
          mustCompleteProfile: true,
        });
        const newId = Number(r[0]?.insertId || 0);
        if (newId && advisorIds?.length) await syncAdvisors(newId, advisorIds); // V5 需求 7：导入模板含导师列
        if (newId && role === "postdoc") await syncPostdocRoster(newId);
        created++;
      }
      await audit(ctx.user, "批量导入用户", "config.users", `导入 ${created}/${input.length} 条`);
      return { created, total: input.length };
    }),

  // 个人资料维护（V5 需求 7/9：字段与 PROFILE_EDITABLE_FIELDS 单点常量保持一致）
  updateProfile: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(), // V10：首次完善资料允许本人修正姓名
        email: z.string().optional(),
        phone: z.string().optional(),
        researchDirection: z.string().optional(),
        orcid: z.string().optional(),
        homepage: z.string().optional(),
        idCard: z.string().max(32).optional(),
        mainCampus: z.string().max(64).optional(),
        campus: z.string().max(64).optional(),
        building: z.string().max(64).optional(),
        room: z.string().max(64).optional(),
        expectedGradYear: z.number().int().min(1950).max(2100).nullable().optional(),
        // V10：科研管理常用统计字段
        gender: z.string().max(10).optional(),
        birthDate: z.string().max(10).optional(),
        staffNo: z.string().max(50).optional(),
        degree: z.string().max(50).optional(),
        almaMater: z.string().max(200).optional(),
        politicalStatus: z.string().max(50).optional(),
        joinDate: z.string().max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(users).set(input).where(eq(users.id, ctx.user.id));
      // V10：基本信息（姓名/性别/手机/邮箱/身份证号）齐全后自动解除「强制完善资料」
      const [u] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (u && u.mustCompleteProfile) {
        const complete = [u.name, u.gender, u.phone, u.email, u.idCard].every((v) => v && String(v).trim().length > 0);
        if (complete) {
          await db.update(users).set({ mustCompleteProfile: false }).where(eq(users.id, ctx.user.id));
        }
      }
      await audit(ctx.user, "更新个人资料", "config.users");
      return { ok: true };
    }),

  // 当前用户完整资料（含身份证号，仅本人；个人资料页用）
  me: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!u) throw new TRPCError({ code: "NOT_FOUND" });
    const maps = await db.select().from(advisorMap);
    const all = await db.select().from(users);
    const nameOf = (id: number) => all.find((x) => x.id === id)?.name ?? `#${id}`;
    const advisorIds = maps.filter((m) => m.studentId === u.id).sort((a, b) => a.ord - b.ord).map((m) => m.mentorId);
    const { passwordHash: _, ...rest } = u;
    return { ...rest, advisorIds, advisorNames: advisorIds.map(nameOf) };
  }),

  // ---- 权限矩阵（按权限档）----
  getPermissions: permProcedure("config.users", "manage").query(async () => {
    const rows = await getDb().select().from(rolePermissions);
    const matrix: Record<string, Record<string, PermLevel>> = {};
    for (const p of PERM_PROFILES) matrix[p] = {};
    for (const r of rows) {
      matrix[r.role] = matrix[r.role] || {};
      matrix[r.role][r.permKey] = r.level;
    }
    return matrix;
  }),

  setPermission: permProcedure("config.users", "manage")
    .input(z.object({ role: z.string(), permKey: z.string(), level: z.enum(PERM_LEVELS) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { and } = await import("drizzle-orm");
      await db
        .delete(rolePermissions)
        .where(and(eq(rolePermissions.role, input.role), eq(rolePermissions.permKey, input.permKey)));
      await db.insert(rolePermissions).values(input);
      await audit(ctx.user, "修改权限", "config.users", `${input.role} / ${input.permKey} → ${input.level}`);
      return { ok: true };
    }),

  // 当前用户各子模块权限（登录即可查，用于前端菜单渲染）
  myPermissions: authedProcedure.query(async ({ ctx }) => {
    const { PERMISSION_TREE } = await import("@contracts/constants");
    const result: Record<string, PermLevel> = {};
    for (const m of PERMISSION_TREE) {
      for (const s of m.subs) {
        result[s.key] = await getPermLevel(ctx.profile, s.key);
      }
    }
    return result;
  }),

  auditLogs: permProcedure("config.audit", "readonly")
    .input(z.object({ limit: z.number().default(200) }))
    .query(async ({ ctx, input }) => {
      const rows = await getDb().select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(input.limit);
      if (ctx.profile === "super_admin") return rows;
      const scope = await getDb().select().from(advisorMap).where(eq(advisorMap.mentorId, ctx.user.id));
      const visibleUserIds = new Set([ctx.user.id, ...scope.map((item) => item.studentId)]);
      return rows.filter((row) => row.userId !== null && visibleUserIds.has(row.userId));
    }),
});
