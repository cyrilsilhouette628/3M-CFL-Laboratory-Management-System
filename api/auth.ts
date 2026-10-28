// 自定义用户名/密码鉴权 + RBAC（角色×子模块）+ 数据归属校验 + 审计日志
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, and, gt } from "drizzle-orm";
import { publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sessions, users, rolePermissions, auditLogs } from "@db/schema";
import {
  DEFAULT_PERMISSIONS,
  PERM_LEVELS,
  type PermProfile,
  type PermLevel,
} from "@contracts/constants";

export type SessionUser = typeof users.$inferSelect;

// ---- 密码哈希（scrypt）----
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ---- 强密码规则（V10）：≥8 位，同时含大写字母、小写字母、数字，且不等于用户名 ----
export function isStrongPassword(password: string, username?: string): boolean {
  if (password.length < 8) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (username && password.toLowerCase() === username.toLowerCase()) return false;
  return true;
}
export const STRONG_PASSWORD_HINT = "至少 8 位，需同时包含大写字母、小写字母和数字，且不能等于用户名";

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, "hex");
  return calc.length === ref.length && crypto.timingSafeEqual(calc, ref);
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await getDb().insert(sessions).values({ token, userId, expiresAt });
  return token;
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const db = getDb();
  const [sess] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!sess) return null;
  const [user] = await db.select().from(users).where(eq(users.id, sess.userId)).limit(1);
  if (!user || !user.active) return null;
  return user;
}

// ---- 权限解析：身份 × 管理标志 → 权限档；数据库覆盖默认值 ----
const LEVEL_RANK: Record<PermLevel, number> = { hidden: 0, readonly: 1, editable: 2, manage: 3 };

// 用户的有效权限档：super_admin 恒为超级档；isAdmin → 管理员档；否则按身份
export function profileOf(user: { role: string; isAdmin: boolean }): PermProfile {
  if (user.role === "super_admin") return "super_admin";
  if (user.isAdmin) return "admin";
  return user.role as PermProfile;
}

export async function getPermLevel(profile: PermProfile | string, permKey: string): Promise<PermLevel> {
  if (profile === "super_admin") return "manage";
  const db = getDb();
  const [row] = await db
    .select()
    .from(rolePermissions)
    .where(and(eq(rolePermissions.role, profile), eq(rolePermissions.permKey, permKey)))
    .limit(1);
  if (row) return row.level;
  return DEFAULT_PERMISSIONS[profile as PermProfile]?.[permKey] ?? "hidden";
}

export async function hasPerm(profile: PermProfile | string, permKey: string, min: PermLevel): Promise<boolean> {
  const level = await getPermLevel(profile, permKey);
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

// ---- 过程（procedure）构造 ----
// V11：受限账号仍可执行的只读自助操作（其余 mutation 一律禁止）
const RESTRICTED_MUTATION_WHITELIST = ["auth.logout", "auth.changePassword", "users.updateProfile"];

export const authedProcedure = publicQuery.use(async ({ ctx, next, type, path }) => {
  const user = await getSessionUser(ctx.req);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  // V11：受限状态（毕业/离校）——可登录浏览，禁止数据添加/修改/删除
  if (user.restricted && type === "mutation" && !RESTRICTED_MUTATION_WHITELIST.some((p) => path.startsWith(p))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "您的账号处于受限状态（已毕业/离校），仅可浏览系统信息，不能进行数据添加、修改或删除操作" });
  }
  return next({ ctx: { ...ctx, user, profile: profileOf(user) } });
});

export function permProcedure(permKey: string, min: PermLevel = "readonly") {
  return authedProcedure.use(async ({ ctx, next }) => {
    const ok = await hasPerm(ctx.profile, permKey, min);
    if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "无权访问该子模块" });
    return next({ ctx });
  });
}

// 管理员档及以上（超级管理员 / 勾选管理标志的用户）
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.profile !== "super_admin" && ctx.profile !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可操作" });
  }
  return next({ ctx });
});

// 仅超级管理员（如网站更新推送）
export const superAdminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.profile !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅超级管理员可操作" });
  }
  return next({ ctx });
});

// ---- 导师—学生映射（advisor_map，多对多）----
// 某学生的全部指导教师 userId
export async function mentorsOfStudent(studentId: number): Promise<number[]> {
  const { advisorMap } = await import("@db/schema");
  const { asc } = await import("drizzle-orm");
  const rows = await getDb().select().from(advisorMap).where(eq(advisorMap.studentId, studentId)).orderBy(asc(advisorMap.ord));
  return rows.map((r) => r.mentorId);
}

// 某导师名下的全部学生 userId
export async function studentsOfMentor(mentorId: number): Promise<number[]> {
  const { advisorMap } = await import("@db/schema");
  const rows = await getDb().select().from(advisorMap).where(eq(advisorMap.mentorId, mentorId));
  return rows.map((r) => r.studentId);
}

// 培养类数据的可见学生范围：null = 不限制（超管/管理员）；导师 = 名下学生；学生 = 仅本人
export async function visibleStudentIds(
  user: { id: number },
  profile: string,
): Promise<number[] | null> {
  if (profile === "super_admin") return null;
  if (profile === "teacher" || profile === "postdoc" || profile === "admin") return studentsOfMentor(user.id);
  return [user.id];
}

// ---- V6 需求 2：成果 × 项目 资助关联（project_outputs）----
export type FundingLink = { projectId: number; projectName: string; projectCode: string | null; ord: number };

export async function assertFundingProjectsVisible(projectIds: number[], user: { id: number; name: string }, profile: string) {
  if (!projectIds.length || profile === "super_admin") return;
  const { projects } = await import("@db/schema");
  const rows = await getDb().select().from(projects);
  for (const id of projectIds) {
    const project = rows.find((row) => row.id === id);
    if (!project || !(project.leaderId === user.id || (project.participantIds ?? []).includes(user.id) || (!project.leaderId && project.leader === user.name))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "不能关联未牵头或未参与的资助项目" });
    }
  }
}

// 全量替换某成果的资助项目（ids 有序，索引+1 = 资助排名，1=第一资助）
export async function syncFundings(outputType: "paper" | "achievement", outputId: number, projectIds: number[]) {
  const { projectOutputs } = await import("@db/schema");
  const { and } = await import("drizzle-orm");
  const db = getDb();
  await db.delete(projectOutputs).where(and(eq(projectOutputs.outputType, outputType), eq(projectOutputs.outputId, outputId)));
  const uniq = [...new Set(projectIds)];
  for (let i = 0; i < uniq.length; i++) {
    await db.insert(projectOutputs).values({ projectId: uniq[i], outputType, outputId, ord: i + 1 });
  }
}

// 查询若干成果的资助项目（含项目名与获批号，按 ord 排序）
export async function fundingsOf(
  outputType: "paper" | "achievement",
  outputIds: number[],
  viewer?: { id: number; name: string; profile: string },
): Promise<Map<number, FundingLink[]>> {
  const map = new Map<number, FundingLink[]>();
  if (outputIds.length === 0) return map;
  const { projectOutputs, projects } = await import("@db/schema");
  const db = getDb();
  const links = await db.select().from(projectOutputs).where(eq(projectOutputs.outputType, outputType));
  const prows = await db.select().from(projects);
  const pOf = (id: number) => prows.find((p) => p.id === id);
  for (const oid of outputIds) {
    map.set(
      oid,
      links
        .filter((l) => l.outputId === oid)
        .filter((l) => {
          if (!viewer || viewer.profile === "super_admin") return true;
          const project = pOf(l.projectId);
          return !!project && (project.leaderId === viewer.id || (project.participantIds ?? []).includes(viewer.id) || (!project.leaderId && project.leader === viewer.name));
        })
        .sort((a, b) => a.ord - b.ord)
        .map((l) => ({ projectId: l.projectId, projectName: pOf(l.projectId)?.name ?? `#${l.projectId}`, projectCode: pOf(l.projectId)?.code ?? null, ord: l.ord })),
    );
  }
  return map;
}

// 清理某成果的全部资助关联（删除条目时调用）
export async function clearFundings(outputType: "paper" | "achievement", outputId: number) {
  const { projectOutputs } = await import("@db/schema");
  const { and } = await import("drizzle-orm");
  await getDb().delete(projectOutputs).where(and(eq(projectOutputs.outputType, outputType), eq(projectOutputs.outputId, outputId)));
}

// ---- 审计日志 ----
export async function audit(
  user: { id: number; name: string } | null,
  action: string,
  module: string,
  detail?: string,
) {
  try {
    await getDb().insert(auditLogs).values({
      userId: user?.id ?? null,
      userName: user?.name ?? "匿名",
      action,
      module,
      detail: detail?.slice(0, 2000),
    });
  } catch {
    // 审计失败不阻断业务
  }
}

// ---- 自动待办生成（多模块复用）----
export async function createAutoTodo(opts: {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  creatorId: number;
  creatorName: string;
  leaderIds: number[];
  participantIds?: number[];
  source: string;
  sourceRefId?: number;
  link?: string; // 跳转路由（需求 4：待办重定向）
  category?: string; // V5 需求 6：属性（缺省按 source 映射）
}) {
  const { todos } = await import("@db/schema");
  const { TODO_SOURCE_CATEGORY } = await import("@contracts/constants");
  await getDb().insert(todos).values({
    title: opts.title,
    description: opts.description,
    priority: opts.priority ?? "medium",
    dueDate: opts.dueDate,
    creatorId: opts.creatorId,
    creatorName: opts.creatorName,
    leaderIds: opts.leaderIds,
    participantIds: opts.participantIds ?? [],
    source: opts.source,
    sourceRefId: opts.sourceRefId,
    link: opts.link,
    category: opts.category ?? TODO_SOURCE_CATEGORY[opts.source] ?? null,
  });
}

// 源业务办理后，同步完成对应自动待办；首页与待办页读取同一状态。
export async function completeSourceTodos(source: string, sourceRefId: number, userId?: number) {
  const { todos } = await import("@db/schema");
  const rows = await getDb().select().from(todos).where(and(eq(todos.source, source), eq(todos.sourceRefId, sourceRefId), eq(todos.status, "pending")));
  for (const todo of rows) {
    if (userId && todo.creatorId !== userId && !todo.leaderIds.includes(userId) && !todo.participantIds.includes(userId)) continue;
    await getDb().update(todos).set({ status: "done", completedAt: new Date() }).where(eq(todos.id, todo.id));
  }
}

// 普通用户仅能访问本人牵头或参与的记录；全局查看仅限超级管理员。
export function isOwnerOrParticipant(userId: number, leaderId: number | null, participantIds: number[] | null) {
  return leaderId === userId || (participantIds ?? []).includes(userId);
}

// ---- 网站更新队列（业务事件自动入队，管理员确认后推送）----
export async function queueWebsiteUpdate(opts: {
  type: string;
  title: string;
  payload: Record<string, string>;
  source: string;
  user?: { id: number; name: string } | null;
}) {
  try {
    const { websiteUpdates } = await import("@db/schema");
    await getDb().insert(websiteUpdates).values({
      type: opts.type,
      title: opts.title,
      payload: opts.payload,
      source: opts.source,
      createdBy: opts.user?.id ?? null,
      createdByName: opts.user?.name ?? "系统",
    });
  } catch {
    // 入队失败不阻断业务
  }
}

export { PERM_LEVELS };
