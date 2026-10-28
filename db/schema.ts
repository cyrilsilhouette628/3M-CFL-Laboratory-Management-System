import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  varchar,
  text,
  longtext,
  json,
  timestamp,
  int,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

// ===================== 账户与权限 =====================

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  role: mysqlEnum("role", [
    "super_admin",
    "teacher",
    "postdoc",
    "grad",
    "benyan",
    "intern",
    "guest",
  ])
    .notNull()
    .default("grad"),
  // 管理标志：与身份正交；教师默认 true，部分博士后/高年级博士生按需勾选
  isAdmin: boolean("is_admin").notNull().default(false),
  title: varchar("title", { length: 64 }), // 职称/身份说明（教授/副教授/讲师/博士后…）
  email: varchar("email", { length: 128 }),
  phone: varchar("phone", { length: 32 }),
  researchDirection: varchar("research_direction", { length: 255 }),
  orcid: varchar("orcid", { length: 64 }),
  homepage: varchar("homepage", { length: 255 }),
  // V5 需求 7：用户字段全局梳理
  idCard: varchar("id_card", { length: 32 }), // 身份证号（出差购票）
  mainCampus: varchar("main_campus", { length: 64 }), // 主要校区（跨校区联合办公）
  campus: varchar("campus", { length: 64 }), // 现办公校区
  building: varchar("building", { length: 64 }), // 楼宇
  room: varchar("room", { length: 64 }), // 房间号
  enrollYear: int("enroll_year"), // 入学年份（开题/中期/答辩过程管理）
  expectedGradYear: int("expected_grad_year"), // 预计毕业年份
  // V10：首次登录强制流程
  mustChangePassword: boolean("must_change_password").notNull().default(true), // 首次登录强制改强密码
  mustCompleteProfile: boolean("must_complete_profile").notNull().default(true), // 首次登录强制完善基本信息
  // V10：科研管理常用统计字段
  gender: varchar("gender", { length: 10 }), // 性别
  birthDate: varchar("birth_date", { length: 10 }), // 出生日期 YYYY-MM-DD
  staffNo: varchar("staff_no", { length: 50 }), // 学号/工号
  degree: varchar("degree", { length: 50 }), // 学位/学历
  almaMater: varchar("alma_mater", { length: 200 }), // 毕业院校
  politicalStatus: varchar("political_status", { length: 50 }), // 政治面貌
  joinDate: varchar("join_date", { length: 10 }), // 进组日期 YYYY-MM-DD
  active: boolean("active").notNull().default(true),
  // V11：受限状态（毕业/离校人员）：可登录浏览，禁止一切数据增删改
  restricted: boolean("restricted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = mysqlTable("sessions", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 角色 × 子模块 权限矩阵：key 形如 "research.projects"，level: hidden/readonly/editable/manage
export const rolePermissions = mysqlTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: varchar("role", { length: 32 }).notNull(),
  permKey: varchar("perm_key", { length: 64 }).notNull(),
  level: mysqlEnum("level", ["hidden", "readonly", "editable", "manage"])
    .notNull()
    .default("readonly"),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  userName: varchar("user_name", { length: 64 }),
  action: varchar("action", { length: 64 }).notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== 模块一：待办事项 =====================

export const todos = mysqlTable("todos", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"])
    .notNull()
    .default("medium"),
  dueDate: varchar("due_date", { length: 10 }), // YYYY-MM-DD
  status: mysqlEnum("status", ["pending", "done"]).notNull().default("pending"),
  pinned: boolean("pinned").notNull().default(false),
  creatorId: bigint("creator_id", { mode: "number", unsigned: true }).notNull(),
  creatorName: varchar("creator_name", { length: 64 }),
  // 牵头人与参与人（用户ID数组）
  leaderIds: json("leader_ids").$type<number[]>().notNull(),
  participantIds: json("participant_ids").$type<number[]>().notNull(),
  // 来源模块自动流入：manual/review/reference/visit/activity/social_review/fund/doc_share/weekly_*/content_review/device_booking
  source: varchar("source", { length: 32 }).notNull().default("manual"),
  sourceRefId: bigint("source_ref_id", { mode: "number", unsigned: true }),
  link: varchar("link", { length: 255 }), // 跳转路由（需求 4：待办重定向到对应模块条目）
  category: varchar("category", { length: 64 }), // V5 需求 6：属性（一级标题/二级标题，如 人才培养/研究生培养）
  attachmentFileIds: json("attachment_file_ids").$type<number[]>(), // 附件（V3：所有条目可挂文件）
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== 模块二：科研管理 =====================

// 2.1 科研项目管理（V4：合并原经费管理；含合同文书与纵向/横向类别）
export const projects = mysqlTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 64 }),
  category: mysqlEnum("category", ["vertical", "horizontal"]).notNull().default("vertical"), // 纵向/横向（横向含技术合作）
  source: varchar("source", { length: 128 }), // 经费来源/立项单位
  leader: varchar("leader", { length: 64 }),
  leaderId: bigint("leader_id", { mode: "number", unsigned: true }),
  participantIds: json("participant_ids").$type<number[]>(),
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  totalBudget: int("total_budget").notNull().default(0), // 万元
  receivedAmount: int("received_amount").notNull().default(0),
  status: mysqlEnum("status", ["preparing", "ongoing", "concluding", "concluded"])
    .notNull()
    .default("ongoing"),
  description: text("description"),
  milestones: json("milestones")
    .$type<{ name: string; date: string; status: "pending" | "done"; note?: string; nodeType?: "立项" | "中期检查" | "结题" | "审计"; fileIds?: number[] }[]>()
    .notNull(), // 关键节点：立项/中期检查/结题/审计
  contractFileIds: json("contract_file_ids").$type<number[]>().notNull(), // 立项合同/获批通知书/结题证明等文书
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// V6 需求 2：成果 × 项目 资助关联（多对多 + 资助排名；outputType: paper=投稿论文 / achievement=成果）
export const projectOutputs = mysqlTable("project_outputs", {
  id: serial("id").primaryKey(),
  projectId: bigint("project_id", { mode: "number", unsigned: true }).notNull(),
  outputType: mysqlEnum("output_type", ["paper", "achievement"]).notNull(),
  outputId: bigint("output_id", { mode: "number", unsigned: true }).notNull(),
  ord: int("ord").notNull().default(1), // 资助排名，1=第一资助
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== 导师—学生映射（V4 核心：多对多）=====================
// student 一侧：研究生/本研生/实习生/博士后；mentor 一侧：教师/超级管理员/管理博士后
export const advisorMap = mysqlTable("advisor_map", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(),
  mentorId: bigint("mentor_id", { mode: "number", unsigned: true }).notNull(),
  // V6 需求 1：导师位次，1=主负责导师
  ord: int("ord").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 2.2 学生科研进度：V4 起废弃（周报数据已迁移至 weekly_reports；表保留为历史归档，不再使用）
export const studentProgress = mysqlTable("student_progress", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(),
  topic: varchar("topic", { length: 255 }).notNull(),
  stageGoal: text("stage_goal"),
  proposalStatus: mysqlEnum("proposal_status", ["not_started", "ongoing", "done"])
    .notNull()
    .default("not_started"),
  midtermStatus: mysqlEnum("midterm_status", ["not_started", "ongoing", "done"])
    .notNull()
    .default("not_started"),
  defenseStatus: mysqlEnum("defense_status", ["not_started", "ongoing", "done"])
    .notNull()
    .default("not_started"),
  reports: json("reports")
    .$type<{ type: "week" | "month"; content: string; date: string }[]>()
    .notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 2.3 合作者科研工作
export const collaborations = mysqlTable("collaborations", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  partner: varchar("partner", { length: 128 }).notNull(),
  partnerOrg: varchar("partner_org", { length: 255 }),
  division: text("division"), // 分工
  outputs: text("outputs"), // 产出跟踪
  status: mysqlEnum("status", ["ongoing", "done", "paused"])
    .notNull()
    .default("ongoing"),
  startDate: varchar("start_date", { length: 10 }),
  ownerId: bigint("owner_id", { mode: "number", unsigned: true }),
  participantIds: json("participant_ids").$type<number[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 2.4 投稿论文进度
export const papers = mysqlTable("papers", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  authors: varchar("authors", { length: 512 }),
  journal: varchar("journal", { length: 255 }),
  targetTier: varchar("target_tier", { length: 64 }), // 目标分区
  status: mysqlEnum("status", [
    "writing",
    "submitted",
    "under_review",
    "revision",
    "accepted",
    "online",
    "indexed",
    "rejected",
  ])
    .notNull()
    .default("writing"),
  submitDate: varchar("submit_date", { length: 10 }),
  doi: varchar("doi", { length: 128 }),
  fileId: bigint("file_id", { mode: "number", unsigned: true }),
  leaderId: bigint("leader_id", { mode: "number", unsigned: true }).notNull(),
  participantIds: json("participant_ids").$type<number[]>().notNull(),
  note: text("note"),
  // V6 需求 5：在线发表→流转后自动登记的已发表论文成果（幂等回链）
  achievementId: bigint("achievement_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 投稿轮次（V4：一论文多轮投稿；当前状态=最新一轮状态；拒稿轮次汇成拒稿清单）
export const paperRounds = mysqlTable("paper_rounds", {
  id: serial("id").primaryKey(),
  paperId: bigint("paper_id", { mode: "number", unsigned: true }).notNull(),
  round: int("round").notNull().default(1), // 第几轮投稿
  venue: varchar("venue", { length: 255 }).notNull(), // 当轮投稿期刊/会议
  submittedAt: varchar("submitted_at", { length: 10 }).notNull(),
  status: mysqlEnum("status", ["submitted", "under_review", "revision", "rejected", "accepted"])
    .notNull()
    .default("submitted"),
  decisionAt: varchar("decision_at", { length: 10 }), // 决议日期
  decisionNote: text("decision_note"), // 决议意见（拒稿理由/修改意见摘要）
  fileIds: json("file_ids").$type<number[]>().notNull(), // 当轮稿件/修改稿/审稿意见附件
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
  createdByName: varchar("created_by_name", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 2.5 审稿情况
export const reviews = mysqlTable("reviews", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  authors: varchar("authors", { length: 512 }),
  direction: varchar("direction", { length: 255 }), // 研究方向
  keywords: varchar("keywords", { length: 512 }),
  journal: varchar("journal", { length: 255 }),
  fileId: bigint("file_id", { mode: "number", unsigned: true }),
  status: mysqlEnum("status", ["pending", "assigned", "in_review", "done"])
    .notNull()
    .default("pending"),
  assignments: json("assignments")
    .$type<
      { reviewerId: number; reviewerName: string; deadline: string; status: "pending" | "done" }[]
    >()
    .notNull(),
  note: text("note"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 2.6 重要参考文献（V4：按研究方向分文件夹）
export const refDirections = mysqlTable("ref_directions", {
  id: serial("id").primaryKey(),
  parentId: bigint("parent_id", { mode: "number", unsigned: true }),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 255 }),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdByName: varchar("created_by_name", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const references = mysqlTable("references", {
  id: serial("id").primaryKey(),
  directionId: bigint("direction_id", { mode: "number", unsigned: true }), // 所属研究方向文件夹
  authors: varchar("authors", { length: 512 }).notNull(),
  year: int("year"),
  title: varchar("title", { length: 512 }).notNull(),
  referenceType: mysqlEnum("reference_type", ["article", "book"]).notNull().default("article"),
  venue: varchar("venue", { length: 255 }), // 期刊/会议
  publisher: varchar("publisher", { length: 255 }),
  isbn: varchar("isbn", { length: 64 }),
  volume: varchar("volume", { length: 64 }),
  pages: varchar("pages", { length: 64 }),
  doi: varchar("doi", { length: 128 }),
  abstract: text("abstract"),
  keywords: varchar("keywords", { length: 512 }),
  category: varchar("category", { length: 128 }), // 领域/主题分类
  tags: varchar("tags", { length: 512 }),
  importance: int("importance").notNull().default(3), // 1-5
  notes: text("notes"), // 个人笔记
  fileId: bigint("file_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 文献推送记录
export const referencePushes = mysqlTable("reference_pushes", {
  id: serial("id").primaryKey(),
  referenceId: bigint("reference_id", { mode: "number", unsigned: true }).notNull(),
  toUserId: bigint("to_user_id", { mode: "number", unsigned: true }).notNull(),
  message: varchar("message", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 2.7 WoS 引用次数
export const wosCitations = mysqlTable("wos_citations", {
  id: serial("id").primaryKey(),
  achievementId: bigint("achievement_id", { mode: "number", unsigned: true }).notNull(),
  counts: json("counts").$type<Record<string, number>>().notNull(), // {"2023": 5}
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 2.8 学术活动
export const academicActivities = mysqlTable("academic_activities", {
  id: serial("id").primaryKey(),
  nameCn: varchar("name_cn", { length: 255 }).notNull(),
  nameEn: varchar("name_en", { length: 255 }),
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  location: varchar("location", { length: 255 }),
  url: varchar("url", { length: 512 }),
  submitDeadline: varchar("submit_deadline", { length: 10 }),
  regDeadline: varchar("reg_deadline", { length: 10 }),
  attendeeIds: json("attendee_ids").$type<number[]>().notNull(), // 参会人员
  abstracts: text("abstracts"), // 会议摘要
  submissionRecord: text("submission_record"), // 投稿记录
  reports: json("reports")
    .$type<
      {
        type: string; // 大会邀请报告/分会邀请报告/口头报告/海报
        titleCn: string;
        titleEn?: string;
        session?: string;
        speakers?: string;
        abstract?: string;
        paperNo?: string;
        evidenceFileIds?: number[];
        travel?: { transport?: string; hotel?: string; cost?: string };
      }[]
    >()
    .notNull(),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 2.9 学术报告和专家来访
export const expertVisits = mysqlTable("expert_visits", {
  id: serial("id").primaryKey(),
  expertName: varchar("expert_name", { length: 64 }).notNull(),
  expertOrg: varchar("expert_org", { length: 255 }),
  expertTitle: varchar("expert_title", { length: 128 }),
  reportTitle: varchar("report_title", { length: 512 }).notNull(),
  abstract: text("abstract"),
  reportTime: varchar("report_time", { length: 32 }),
  location: varchar("location", { length: 255 }),
  reception: text("reception"), // 接待安排
  hostId: bigint("host_id", { mode: "number", unsigned: true }).notNull(), // 接待负责人
  photoFileIds: json("photo_file_ids").$type<number[]>().notNull(),
  posterContent: text("poster_content"), // AI 生成海报文案
  newsDraft: text("news_draft"), // AI 生成新闻稿
  expertBio: text("expert_bio"), // 联网检索履历（预留接口）
  isPublic: boolean("is_public").notNull().default(false),
  status: mysqlEnum("status", ["planned", "held", "archived"])
    .notNull()
    .default("planned"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 2.10 科研经费
export const fundCards = mysqlTable("fund_cards", {
  id: serial("id").primaryKey(),
  projectId: bigint("project_id", { mode: "number", unsigned: true }),
  projectCode: varchar("project_code", { length: 64 }),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  source: varchar("source", { length: 128 }), // 经费来源
  totalAmount: int("total_amount").notNull().default(0), // 元
  budgets: json("budgets")
    .$type<{ subject: string; amount: number }[]>()
    .notNull(), // 预算科目
  arrivals: json("arrivals")
    .$type<{ plannedDate: string; plannedAmount: number; actualDate?: string; actualAmount?: number }[]>()
    .notNull(), // 到账管理
  expenses: json("expenses")
    .$type<{ date: string; subject: string; amount: number; description: string; fileIds?: number[] }[]>()
    .notNull(), // 报销与票据
  laborPayments: json("labor_payments")
    .$type<{ payee: string; month: string; amount: number; receiptFileId?: number }[]>()
    .notNull(), // 劳务费
  transfers: json("transfers")
    .$type<{ targetOrg: string; amount: number; date: string; docFileId?: number }[]>()
    .notNull(), // 外拨经费
  ownerId: bigint("owner_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 模块三·人才培养：3.1 研究生 / 3.2 本科生 / 3.3 博士后
export const students = mysqlTable("students", {
  id: serial("id").primaryKey(),
  kind: mysqlEnum("kind", ["grad", "undergrad", "postdoc"]).notNull().default("grad"),
  name: varchar("name", { length: 64 }).notNull(),
  studentNo: varchar("student_no", { length: 64 }),
  gender: varchar("gender", { length: 8 }),
  phone: varchar("phone", { length: 32 }),
  wechat: varchar("wechat", { length: 64 }),
  email: varchar("email", { length: 128 }),
  hometown: varchar("hometown", { length: 128 }),
  bachelorSchool: varchar("bachelor_school", { length: 255 }),
  advisor: varchar("advisor", { length: 64 }),
  direction: varchar("direction", { length: 255 }),
  proposalStatus: varchar("proposal_status", { length: 32 }).default("未开始"),
  midtermStatus: varchar("midterm_status", { length: 32 }).default("未开始"),
  defenseStatus: varchar("defense_status", { length: 32 }).default("未开始"),
  files: json("files")
    .$type<{ label: string; fileId: number }[]>()
    .notNull(), // 开题报告/中期报告/毕业论文/答辩PPT
  // 类别扩展字段（博士后：进站日期/预计出站/在站状态/国家级课题等）
  detail: json("detail").$type<Record<string, string>>(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 3.1 研究任务（每学生可多个）
export const researchTasks = mysqlTable("research_tasks", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(), // 归属学生（users.id）
  title: varchar("title", { length: 255 }).notNull(),
  direction: varchar("direction", { length: 255 }), // 所属研究方向
  question: text("question"), // 关键科学问题
  goal: text("goal"), // 研究目标
  approach: text("approach"), // 技术路线
  expectedOutput: varchar("expected_output", { length: 255 }), // 预期成果
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  status: mysqlEnum("status", ["active", "paused", "done"]).notNull().default("active"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
  createdByName: varchar("created_by_name", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 关键研究点（挂靠在研究任务下的过程记录）
export const researchPoints = mysqlTable("research_points", {
  id: serial("id").primaryKey(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  summary: text("summary"), // 内容摘要/研究问题总结
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
  createdByName: varchar("created_by_name", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 过程文档版本（关键研究点下的 Word/PPT/PDF/LaTeX 包，v1/v2…）
export const pointDocs = mysqlTable("point_docs", {
  id: serial("id").primaryKey(),
  pointId: bigint("point_id", { mode: "number", unsigned: true }).notNull(),
  fileId: bigint("file_id", { mode: "number", unsigned: true }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  version: int("version").notNull().default(1),
  note: varchar("note", { length: 255 }), // 版本说明
  uploadedBy: bigint("uploaded_by", { mode: "number", unsigned: true }).notNull(),
  uploadedByName: varchar("uploaded_by_name", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 过程文档提交与导师反馈（学生 → 导师 → 学生 的交互流）
export const docShares = mysqlTable("doc_shares", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(), // 提交学生（users.id）
  studentName: varchar("student_name", { length: 64 }),
  taskId: bigint("task_id", { mode: "number", unsigned: true }), // 可选：关联研究任务
  type: mysqlEnum("type", ["weekly", "paper_draft", "ppt_draft", "report", "other"])
    .notNull()
    .default("weekly"),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"), // 正文说明
  fileIds: json("file_ids").$type<number[]>().notNull(), // 提交附件
  toUserIds: json("to_user_ids").$type<number[]>().notNull(), // 送达导师（可多选）
  status: mysqlEnum("status", ["submitted", "feedback"]).notNull().default("submitted"),
  feedback: text("feedback"), // 导师文字简报
  feedbackFileIds: json("feedback_file_ids").$type<number[]>(), // 导师反馈附件（批注版）
  feedbackBy: bigint("feedback_by", { mode: "number", unsigned: true }),
  feedbackByName: varchar("feedback_by_name", { length: 64 }),
  feedbackAt: timestamp("feedback_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 学生研究成果（确认后转入成果管理）
export const studentAchievements = mysqlTable("student_achievements", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(),
  type: mysqlEnum("type", ["paper", "patent", "competition", "conference_award"]).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  detail: text("detail"),
  date: varchar("date", { length: 10 }),
  status: mysqlEnum("status", ["pending", "confirmed"]).notNull().default("pending"),
  achievementId: bigint("achievement_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 研究生周报（V4：仅研究生提交；导师批阅；提交/缺交均自动生成待办）
export const weeklyReports = mysqlTable("weekly_reports", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(), // 提交学生（users.id）
  studentName: varchar("student_name", { length: 64 }),
  weekStart: varchar("week_start", { length: 10 }).notNull(), // 周一日期 YYYY-MM-DD
  content: text("content").notNull(), // 本周进展
  plan: text("plan"), // 下周计划
  problems: text("problems"), // 遇到的问题
  fileIds: json("file_ids").$type<number[]>().notNull(), // 附件
  status: mysqlEnum("status", ["submitted", "reviewed"]).notNull().default("submitted"),
  studentReply: text("student_reply"),
  studentReplyAt: timestamp("student_reply_at"),
  feedback: text("feedback"), // 导师评语
  feedbackFileIds: json("feedback_file_ids").$type<number[]>(),
  feedbackBy: bigint("feedback_by", { mode: "number", unsigned: true }),
  feedbackByName: varchar("feedback_by_name", { length: 64 }),
  feedbackAt: timestamp("feedback_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// V5 需求 3：培养档案节点（开题/中期/答辩等过程管理）
export const trainingNodes = mysqlTable("training_nodes", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(),
  nodeType: mysqlEnum("node_type", ["入学", "开题", "中期", "预答辩", "答辩", "毕业"]).notNull(),
  date: varchar("date", { length: 10 }),
  status: mysqlEnum("status", ["pending", "done"]).notNull().default("pending"),
  note: varchar("note", { length: 512 }),
  fileIds: json("file_ids").$type<number[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== 仪器设备管理（V4 新模块）=====================

// 设备台账
export const devices = mysqlTable("devices", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  model: varchar("model", { length: 128 }), // 型号规格
  assetNo: varchar("asset_no", { length: 64 }), // 资产编号
  vendor: varchar("vendor", { length: 128 }), // 厂商
  purchaseDate: varchar("purchase_date", { length: 10 }),
  price: int("price").notNull().default(0), // 元
  projectId: bigint("project_id", { mode: "number", unsigned: true }), // 购置经费来源项目
  location: varchar("location", { length: 128 }), // 存放地点
  keeperId: bigint("keeper_id", { mode: "number", unsigned: true }), // 负责人
  keeperName: varchar("keeper_name", { length: 64 }),
  status: mysqlEnum("status", ["in_use", "maintenance", "idle", "scrapped"])
    .notNull()
    .default("in_use"),
  shared: boolean("shared").notNull().default(true), // 是否开放共享预约
  note: text("note"),
  fileIds: json("file_ids").$type<number[]>().notNull(), // 说明书/采购合同附件
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 预约使用（普通用户预约，负责人/管理员审批）
export const deviceBookings = mysqlTable("device_bookings", {
  id: serial("id").primaryKey(),
  deviceId: bigint("device_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  userName: varchar("user_name", { length: 64 }),
  startTime: varchar("start_time", { length: 16 }).notNull(), // YYYY-MM-DD HH:mm
  endTime: varchar("end_time", { length: 16 }).notNull(),
  purpose: varchar("purpose", { length: 255 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "done", "cancelled"])
    .notNull()
    .default("pending"),
  reviewedBy: bigint("reviewed_by", { mode: "number", unsigned: true }),
  reviewedByName: varchar("reviewed_by_name", { length: 64 }),
  reviewNote: varchar("review_note", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 维护保养（日常保养/故障维修/检定校准）
export const deviceMaintenance = mysqlTable("device_maintenance", {
  id: serial("id").primaryKey(),
  deviceId: bigint("device_id", { mode: "number", unsigned: true }).notNull(),
  type: mysqlEnum("type", ["routine", "repair", "calibration"]).notNull().default("routine"),
  date: varchar("date", { length: 10 }).notNull(),
  cost: int("cost").notNull().default(0), // 元
  operator: varchar("operator", { length: 64 }), // 经办人/维保单位
  note: text("note"),
  fileIds: json("file_ids").$type<number[]>().notNull(), // 票据/报告附件
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdByName: varchar("created_by_name", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== 模块三：成果管理 =====================

export const achievements = mysqlTable("achievements", {
  id: serial("id").primaryKey(),
  // V4：删除 concluded_project/ongoing_project/horizontal_project（迁入科研项目管理）
  category: mysqlEnum("category", [
    "published_paper",
    "patent",
    "award",
    "student_work",
    "book",
    "software_copyright",
  ]).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  authors: varchar("authors", { length: 512 }),
  year: int("year").notNull(),
  date: varchar("date", { length: 10 }),
  detail: json("detail").$type<Record<string, string>>().notNull(), // 各类别扩展字段
  evidenceFileIds: json("evidence_file_ids").$type<number[]>().notNull(), // 佐证文件
  isPublic: boolean("is_public").notNull().default(false),
  fromStudentName: varchar("from_student_name", { length: 64 }),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 申请知识产权进度（代理公司全程参与申报）
export const ipApplications = mysqlTable("ip_applications", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  ipType: mysqlEnum("ip_type", ["发明专利", "GF专利", "实用新型", "软件著作权"]).notNull(),
  agency: varchar("agency", { length: 255 }).notNull(),
  applicationNo: varchar("application_no", { length: 128 }),
  status: mysqlEnum("status", ["writing", "external_review", "revision", "new_external_review", "accepted", "granted"]).notNull().default("writing"),
  ownerId: bigint("owner_id", { mode: "number", unsigned: true }).notNull(),
  participantIds: json("participant_ids").$type<number[]>().notNull(),
  submitDate: varchar("submit_date", { length: 10 }),
  protectionEnd: varchar("protection_end", { length: 10 }),
  note: text("note"),
  fileIds: json("file_ids").$type<number[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// 系统内数据纠错反馈
export const dataFeedback = mysqlTable("data_feedback", {
  id: serial("id").primaryKey(),
  module: varchar("module", { length: 64 }).notNull(),
  recordId: bigint("record_id", { mode: "number", unsigned: true }),
  recordTitle: varchar("record_title", { length: 512 }),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["pending", "resolved"]).notNull().default("pending"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
  createdByName: varchar("created_by_name", { length: 64 }),
  resolvedBy: bigint("resolved_by", { mode: "number", unsigned: true }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 传帮带：按课题、技术与研究内容寻找擅长同门
export const mentoringPosts = mysqlTable("mentoring_posts", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  userName: varchar("user_name", { length: 64 }).notNull(),
  topics: varchar("topics", { length: 512 }).notNull(),
  skills: varchar("skills", { length: 512 }).notNull(),
  research: text("research"),
  contact: varchar("contact", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// ===================== 模块四：社会服务 =====================

export const socialServices = mysqlTable("social_services", {
  id: serial("id").primaryKey(),
  type: mysqlEnum("type", [
    "parttime", // 社会兼职
    "academic_org", // 学术组织任职
    "conference_host", // 主办承办会议
    "review", // 学术评审
    "advisory", // 咨询报告与智库
    "popularization", // 科普与媒体
  ]).notNull(),
  orgName: varchar("org_name", { length: 255 }).notNull(), // 组织/单位/会议/活动名称
  position: varchar("position", { length: 128 }), // 职务/角色
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  deadline: varchar("deadline", { length: 10 }), // 评审截止
  confidential: boolean("confidential").notNull().default(false), // 保密标记
  detail: json("detail").$type<Record<string, string>>().notNull(),
  attachmentFileIds: json("attachment_file_ids").$type<number[]>().notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  ownerId: bigint("owner_id", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== AI 解析任务（待人工确认） =====================

export const aiTasks = mysqlTable("ai_tasks", {
  id: serial("id").primaryKey(),
  module: varchar("module", { length: 64 }).notNull(), // paper/review/achievement/...
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileId: bigint("file_id", { mode: "number", unsigned: true }),
  suggested: json("suggested").$type<Record<string, string>>().notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "rejected"])
    .notNull()
    .default("pending"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== 文件存储 =====================

// 内容审核（需求 10：普通用户提交的文件需审核；管理员免审；访客禁止提交）
export const files = mysqlTable("files", {
  id: serial("id").primaryKey(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 128 }),
  size: int("size").notNull().default(0),
  dataBase64: longtext("data_base64"), // 历史数据回退；新文件内容存平台对象存储
  storageKey: varchar("storage_key", { length: 512 }),
  sharedWithIds: json("shared_with_ids").$type<number[]>(),
  module: varchar("module", { length: 64 }),
  // 可见范围：private 仅自己 / admins 仅管理员 / no_guest 游客不可见（默认）/ all 全员
  visibility: mysqlEnum("visibility", ["private", "admins", "no_guest", "all"])
    .notNull()
    .default("no_guest"),
  // 审核状态：管理员/超管上传即 approved；普通用户默认 pending，审核通过后生效
  reviewStatus: mysqlEnum("review_status", ["pending", "approved", "rejected"])
    .notNull()
    .default("approved"),
  reviewNote: varchar("review_note", { length: 255 }), // 驳回原因
  uploadedBy: bigint("uploaded_by", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// V13：文件内容分块存储（TiDB 单行上限 6MB，大文件 base64 拆成多行，读取时按 seq 拼接；files.data_base64 仅作历史数据回退）
export const fileChunks = mysqlTable(
  "file_chunks",
  {
    id: serial("id").primaryKey(),
    fileId: bigint("file_id", { mode: "number", unsigned: true }).notNull(),
    seq: int("seq").notNull(),
    data: longtext("data").notNull(),
  },
  (t) => [index("idx_file_chunks_file").on(t.fileId)],
);

// ===================== 网站一键更新 =====================

// 待更新/已推送条目（管理系统 → 课题组网站 的内容队列）
export const websiteUpdates = mysqlTable("website_updates", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 32 }).notNull(), // teacher_change/student_change/paper/expert_talk_announce/expert_talk_news/team_award/student_conference/student_award
  title: varchar("title", { length: 512 }).notNull(),
  payload: json("payload").$type<Record<string, string>>().notNull(), // 网站渲染所需结构化字段
  source: varchar("source", { length: 64 }), // 来源模块
  status: mysqlEnum("status", ["pending", "pushed", "discarded"]).notNull().default("pending"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdByName: varchar("created_by_name", { length: 64 }),
  pushedBy: bigint("pushed_by", { mode: "number", unsigned: true }),
  pushedByName: varchar("pushed_by_name", { length: 64 }),
  pushedAt: timestamp("pushed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===================== 外部接口配置 =====================

export const externalConfigs = mysqlTable("external_configs", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 32 }).notNull().unique(), // llm / wos / website / caldav
  name: varchar("name", { length: 64 }).notNull(),
  config: json("config").$type<Record<string, string>>().notNull(),
  enabled: boolean("enabled").notNull().default(false),
  updatedBy: bigint("updated_by", { mode: "number", unsigned: true }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ===================== V8 标注 1：常用网站链接（每用户自管） =====================

export const quickLinks = mysqlTable("quick_links", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(), // 归属用户（各自维护自己的链接）
  title: varchar("title", { length: 120 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  ord: int("ord").notNull().default(0), // 排序号，越小越靠前
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
