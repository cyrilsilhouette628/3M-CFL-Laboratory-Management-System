// 前后端共享常量：角色/权限档、权限树、各模块枚举与中文标签（V4）

// ---- 身份角色（描述"这个人是谁"）----
export const ROLES = [
  "super_admin",
  "teacher",
  "postdoc",
  "grad",
  "benyan",
  "intern",
  "guest",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "超级管理员",
  teacher: "教师",
  postdoc: "博士后",
  grad: "研究生",
  benyan: "本科生",
  intern: "实习生",
  guest: "访客",
};

// 角色中文名 → key（用于 Excel 批量导入兼容中文填写）
export const ROLE_NAME_TO_KEY: Record<string, Role> = {
  超级管理员: "super_admin",
  PI: "super_admin",
  教师: "teacher",
  老师: "teacher",
  博士后: "postdoc",
  研究生: "grad",
  博士生: "grad",
  硕士生: "grad",
  本科生: "benyan",
  本研生: "benyan", // 兼容旧导入文件
  实习生: "intern",
  访客: "guest",
};

// 学生类身份（可被映射指导教师）；导师类身份（可成为指导教师）
export const STUDENT_ROLES: Role[] = ["grad", "benyan", "intern", "postdoc"];
export const MENTOR_CAPABLE_ROLES: Role[] = ["super_admin", "teacher", "postdoc"];

// ---- 权限档（身份 × 管理标志 正交模型）----
export const PERM_PROFILES = ["super_admin", "admin", "teacher", "postdoc", "grad", "benyan", "intern", "guest"] as const;
export type PermProfile = (typeof PERM_PROFILES)[number];

export const PROFILE_LABELS: Record<PermProfile, string> = {
  super_admin: "超级管理员",
  admin: "管理员（管理标志）",
  teacher: "教师",
  postdoc: "博士后",
  grad: "研究生",
  benyan: "本科生",
  intern: "实习生",
  guest: "访客",
};

export const PERM_LEVELS = ["hidden", "readonly", "editable", "manage"] as const;
export type PermLevel = (typeof PERM_LEVELS)[number];

export const PERM_LEVEL_LABELS: Record<PermLevel, string> = {
  hidden: "不可见",
  readonly: "只读",
  editable: "可编辑",
  manage: "可管理",
};

// ---- 模块 → 子模块 权限树（V4，无数字编号）----
export const PERMISSION_TREE: { module: string; label: string; subs: { key: string; label: string }[] }[] = [
  { module: "todo", label: "待办事项", subs: [{ key: "todo.list", label: "待办事项" }] },
  {
    module: "research",
    label: "科研管理",
    subs: [
      { key: "research.projects", label: "科研项目管理" },
      { key: "research.collaborations", label: "合作者科研工作" },
      { key: "research.papers", label: "投稿论文进度" },
      { key: "research.ip", label: "申请知识产权进度" },
      { key: "research.reviews", label: "审稿情况" },
      { key: "research.references", label: "重要参考文献" },
      { key: "research.citations", label: "WoS 引用次数" },
      { key: "research.activities", label: "学术活动管理" },
      { key: "research.visits", label: "专家来访管理" },
    ],
  },
  {
    module: "training",
    label: "人才培养",
    subs: [
      { key: "training.grads", label: "研究生培养" },
      { key: "training.undergrads", label: "本科生研修" },
      { key: "training.postdocs", label: "博士后管理" },
    ],
  },
  {
    module: "device",
    label: "仪器设备管理",
    subs: [
      { key: "device.assets", label: "设备台账" },
      { key: "device.bookings", label: "预约使用" },
      { key: "device.maintenance", label: "维护保养" },
    ],
  },
  {
    module: "achievement",
    label: "成果管理",
    subs: [
      { key: "achievement.papers", label: "已发表论文" },
      { key: "achievement.patents", label: "已获知识产权" },
      { key: "achievement.awards", label: "科研奖励" },
      { key: "achievement.student", label: "学生研究成果" },
      { key: "achievement.books", label: "专著与教材" },
      { key: "achievement.software", label: "软件著作权与标准" },
      { key: "achievement.list", label: "统计与年度盘点" },
    ],
  },
  { module: "social", label: "社会服务", subs: [{ key: "social.list", label: "社会服务" }] },
  {
    module: "config",
    label: "配置",
    subs: [
      { key: "config.users", label: "用户与权限" },
      { key: "config.review", label: "内容审核" },
      { key: "config.website", label: "网站更新" },
      { key: "config.integrations", label: "外部接口" },
      { key: "config.audit", label: "审计日志" },
    ],
  },
];

// ---- 默认权限矩阵（权限档 × 子模块）----
const ALL_SUBS = PERMISSION_TREE.flatMap((m) => m.subs.map((s) => s.key));

function full(level: PermLevel): Record<string, PermLevel> {
  return Object.fromEntries(ALL_SUBS.map((k) => [k, level]));
}

const ACHIEVEMENT_KEYS = [
  "achievement.papers",
  "achievement.patents",
  "achievement.awards",
  "achievement.student",
  "achievement.books",
  "achievement.software",
  "achievement.list", // 统计与年度盘点（V13 修复：此前路由使用该键但权限树未定义，非超管一律 hidden → “无权访问该子模块”）
];

function withAchievements(level: PermLevel): Record<string, PermLevel> {
  return Object.fromEntries(ACHIEVEMENT_KEYS.map((k) => [k, level]));
}

export const DEFAULT_PERMISSIONS: Record<PermProfile, Record<string, PermLevel>> = {
  super_admin: full("manage"),
  admin: {
    ...full("manage"),
    "config.users": "manage", // V11：管理员可添加/管理自己名下的学生（研究生/本科生/实习生），越权操作在后端拦截
    "config.integrations": "readonly",
    "config.website": "readonly", // 网站更新写操作仅超级管理员（按钮置灰）
  },
  teacher: {
    ...full("hidden"),
    "todo.list": "manage",
    "research.projects": "manage",
    "research.collaborations": "editable",
    "research.papers": "manage",
    "research.ip": "manage",
    "research.reviews": "manage",
    "research.references": "editable",
    "research.citations": "editable",
    "research.activities": "editable",
    "research.visits": "editable",
    "training.grads": "manage",
    "training.undergrads": "editable",
    "training.postdocs": "readonly",
    "device.assets": "readonly",
    "device.bookings": "editable",
    "device.maintenance": "editable",
    ...withAchievements("editable"),
    "social.list": "editable",
  },
  postdoc: {
    ...full("hidden"),
    "todo.list": "manage",
    "research.projects": "readonly",
    "research.collaborations": "editable",
    "research.papers": "editable",
    "research.ip": "editable",
    "research.reviews": "editable",
    "research.references": "editable",
    "research.citations": "readonly",
    "research.activities": "readonly",
    "research.visits": "readonly",
    "training.grads": "editable", // 协助指导研究生
    "training.undergrads": "readonly",
    "training.postdocs": "readonly",
    "device.assets": "readonly",
    "device.bookings": "editable",
    "device.maintenance": "readonly",
    ...withAchievements("editable"),
    "social.list": "readonly",
  },
  grad: {
    ...full("hidden"),
    "todo.list": "manage",
    "research.papers": "editable",
    "research.ip": "editable",
    "research.reviews": "editable", // 被指派审稿的学生需从待办进入并办理本人任务
    "research.references": "readonly", // 学生可检索与接收推送，新增重要文献仅教师/管理员
    "research.activities": "readonly",
    "research.visits": "readonly",
    "training.grads": "editable", // 本人研究任务/周报/过程文档
    "device.assets": "readonly",
    "device.bookings": "editable",
    ...withAchievements("editable"),
    "social.list": "editable",
  },
  benyan: {
    ...full("hidden"),
    "todo.list": "manage",
    "research.ip": "editable",
    "research.reviews": "editable",
    "research.references": "readonly",
    "research.activities": "readonly",
    "training.undergrads": "editable",
    "device.assets": "readonly",
    "device.bookings": "editable",
    ...withAchievements("editable"),
    "social.list": "editable",
  },
  intern: {
    ...full("hidden"),
    "todo.list": "editable",
    "research.ip": "editable",
    "research.reviews": "editable",
    "research.references": "readonly",
    "training.undergrads": "readonly",
    "device.assets": "readonly",
    "device.bookings": "editable",
    ...withAchievements("editable"),
    "social.list": "editable",
  },
  // 访客：只读浏览，不允许任何提交
  guest: {
    ...full("hidden"),
    "research.activities": "readonly",
    "research.visits": "readonly",
    "device.assets": "readonly",
    ...withAchievements("readonly"),
    "social.list": "readonly",
  },
};

// ---- 文件可见范围（四级）----
export const FILE_VISIBILITIES = ["private", "admins", "no_guest", "all"] as const;
export type FileVisibility = (typeof FILE_VISIBILITIES)[number];
export const FILE_VISIBILITY_LABELS: Record<FileVisibility, string> = {
  private: "仅自己可见",
  admins: "仅管理员可见",
  no_guest: "游客不可见",
  all: "全员可见",
};

// ---- 内容审核状态（需求 10）----
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: "审核中",
  approved: "已通过",
  rejected: "已驳回",
};

// ---- 过程文档提交类型 ----
export const DOC_SHARE_TYPES = ["weekly", "paper_draft", "ppt_draft", "report", "other"] as const;
export const DOC_SHARE_TYPE_LABELS: Record<string, string> = {
  weekly: "周报类文档",
  paper_draft: "论文初稿",
  ppt_draft: "PPT 初稿",
  report: "研究报告",
  other: "其他文档",
};

// ---- 网站更新类型 ----
export const WEBSITE_UPDATE_TYPES = [
  "teacher_change",
  "student_change",
  "paper",
  "expert_talk_announce",
  "expert_talk_news",
  "team_award",
  "student_conference",
  "student_award",
] as const;
export const WEBSITE_UPDATE_TYPE_LABELS: Record<string, string> = {
  teacher_change: "教师变动",
  student_change: "学生变动",
  paper: "论文发表",
  expert_talk_announce: "学术报告预告",
  expert_talk_news: "学术报告新闻",
  team_award: "团队科研获奖",
  student_conference: "学生参加学术会议",
  student_award: "学生个人获奖",
};

// ===== 各模块枚举与标签 =====

// 论文总体状态（当前轮次决定）；投稿轮次状态见 PAPER_ROUND_STATUS
export const PAPER_STATUS_FLOW = ["writing","submitted","under_review","revision","accepted","online","indexed","rejected"] as const;
export const PAPER_STATUS_LABELS: Record<string, string> = {
  writing: "撰写中",
  submitted: "已投稿",
  under_review: "外审中",
  revision: "待修改",
  accepted: "已录用",
  online: "在线发表",
  indexed: "检索",
  rejected: "已被拒稿",
};

// 投稿轮次状态机：已投稿→外审中→待修/拒稿→（修改重投新一轮）…→录用或拒稿终结
export const PAPER_ROUND_STATUSES = ["submitted", "under_review", "revision", "rejected", "accepted"] as const;
export type PaperRoundStatus = (typeof PAPER_ROUND_STATUSES)[number];
export const PAPER_ROUND_STATUS_LABELS: Record<PaperRoundStatus, string> = {
  submitted: "已投稿",
  under_review: "外审中",
  revision: "待修（退修）",
  rejected: "拒稿",
  accepted: "录用",
};

// 科研项目
export const PROJECT_CATEGORIES = ["vertical", "horizontal"] as const;
export const PROJECT_CATEGORY_LABELS: Record<string, string> = {
  vertical: "纵向项目",
  horizontal: "横向项目/技术合作",
};
export const PROJECT_NODE_TYPES = ["立项", "中期检查", "结题", "审计"] as const;

// 成果管理子模块（类别 → 权限/路由）
export const ACHIEVEMENT_CATEGORIES = [
  "published_paper",
  "patent",
  "award",
  "student_work",
  "book",
  "software_copyright",
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];
export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  published_paper: "已发表论文",
  patent: "已获知识产权",
  award: "科研奖励",
  student_work: "学生研究成果",
  book: "专著与教材",
  software_copyright: "软件著作权与标准",
};
export const ACHIEVEMENT_SECTIONS: { category: AchievementCategory; label: string; perm: string; path: string }[] = [
  { category: "published_paper", label: "已发表论文", perm: "achievement.papers", path: "/achievements/papers" },
  { category: "patent", label: "已获知识产权", perm: "achievement.patents", path: "/achievements/patents" },
  { category: "award", label: "科研奖励", perm: "achievement.awards", path: "/achievements/awards" },
  { category: "student_work", label: "学生研究成果", perm: "achievement.student", path: "/achievements/student" },
  { category: "book", label: "专著与教材", perm: "achievement.books", path: "/achievements/books" },
  { category: "software_copyright", label: "软件著作权与标准", perm: "achievement.software", path: "/achievements/software" },
];

export const SOCIAL_TYPES = ["parttime", "academic_org", "conference_host", "review", "advisory", "popularization"] as const;
export const SOCIAL_TYPE_LABELS: Record<string, string> = {
  parttime: "社会兼职情况",
  academic_org: "学术组织任职",
  conference_host: "主办/承办学术会议",
  review: "学术评审工作",
  advisory: "咨询报告与智库成果",
  popularization: "科普与媒体宣传",
};

// 仪器设备
export const DEVICE_STATUSES = ["in_use", "maintenance", "idle", "scrapped"] as const;
export const DEVICE_STATUS_LABELS: Record<string, string> = {
  in_use: "在用",
  maintenance: "维修中",
  idle: "闲置",
  scrapped: "已报废",
};
export const BOOKING_STATUSES = ["pending", "approved", "rejected", "done", "cancelled"] as const;
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已批准",
  rejected: "已驳回",
  done: "已完成",
  cancelled: "已取消",
};
export const MAINTENANCE_TYPES = ["routine", "repair", "calibration"] as const;
export const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  routine: "日常保养",
  repair: "故障维修",
  calibration: "检定校准",
};

// 周报
export const WEEKLY_STATUS_LABELS: Record<string, string> = {
  submitted: "待批阅",
  reviewed: "已批阅",
};

export const FUND_SUBJECTS = [
  "设备费",
  "材料费",
  "测试化验加工费",
  "差旅/会议/国际合作交流费",
  "出版/文献/信息传播费",
  "劳务费",
  "专家咨询费",
  "间接费用",
];

export const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

// 待办来源标签与默认跳转链接（需求 4）
export const TODO_SOURCE_LABELS: Record<string, string> = {
  manual: "手动创建",
  review: "审稿任务",
  reference: "文献推送",
  visit: "接待任务",
  activity: "学术活动",
  social_review: "评审截止",
  fund: "经费提醒",
  doc_share: "文档提交",
  doc_feedback: "导师反馈",
  weekly_report: "周报提交",
  weekly_feedback: "周报评语",
  weekly_reply: "周报二次反馈",
  weekly_missing: "周报缺交",
  content_review: "内容审核",
  review_result: "审核结果",
  device_booking: "设备预约",
};
export const TODO_SOURCE_LINKS: Record<string, string> = {
  review: "/research/reviews",
  reference: "/research/references",
  visit: "/research/visits",
  activity: "/research/activities",
  social_review: "/social",
  fund: "/research/projects",
  doc_share: "/training/grads?tab=docs",
  doc_feedback: "/training/grads?tab=docs",
  weekly_report: "/training/grads?tab=weekly",
  weekly_feedback: "/training/grads?tab=weekly",
  weekly_reply: "/training/grads?tab=weekly",
  weekly_missing: "/training/grads?tab=weekly",
  content_review: "/config/review",
  device_booking: "/device/bookings",
};

// 学生类别（人才培养）
export const STUDENT_KINDS = ["grad", "undergrad", "postdoc"] as const;
export const STUDENT_KIND_LABELS: Record<string, string> = {
  grad: "研究生",
  undergrad: "本科生",
  postdoc: "博士后",
};

// ===================== V5 =====================

// 需求 6：待办【属性】字段 —— source → 一级标题/二级标题 默认映射（与左侧导航标题一致）
export const TODO_SOURCE_CATEGORY: Record<string, string> = {
  weekly_report: "人才培养/研究生培养",
  weekly_feedback: "人才培养/研究生培养",
  weekly_reply: "人才培养/研究生培养",
  weekly_missing: "人才培养/研究生培养",
  doc_share: "人才培养/研究生培养",
  doc_feedback: "人才培养/研究生培养",
  training: "人才培养/研究生培养",
  device_booking: "仪器设备/预约使用",
  content_review: "系统配置/内容审核",
  review_result: "系统配置/内容审核",
  review: "科研管理/审稿情况",
  reference: "科研管理/重要参考文献",
  fund: "科研管理/科研项目管理",
  paper_round: "科研管理/投稿论文进度",
  project_milestone: "科研管理/科研项目管理",
  visit: "科研管理/专家来访管理",
  activity: "科研管理/学术活动管理",
  social_review: "社会服务",
  achievement: "成果管理/统计与年度盘点",
};

// 属性级联选项（与左侧导航一级/二级标题一致，供人工编辑待办属性）
export const TODO_CATEGORY_TREE: { first: string; seconds: string[] }[] = [
  { first: "待办事项", seconds: [] },
  { first: "科研管理", seconds: ["科研项目管理", "合作者科研工作", "投稿论文进度", "申请知识产权进度", "审稿情况", "重要参考文献", "WoS 引用次数", "学术活动管理", "专家来访管理"] },
  { first: "人才培养", seconds: ["研究生培养", "本科生研修", "博士后管理"] },
  { first: "仪器设备", seconds: ["设备台账", "预约使用", "维护保养"] },
  { first: "成果管理", seconds: ["统计与年度盘点", "已发表论文", "已获知识产权", "科研奖励", "学生研究成果", "专著与教材", "软件著作权与标准"] },
  { first: "社会服务", seconds: [] },
  { first: "系统配置", seconds: ["用户与权限", "内容审核", "外部接口", "审计日志"] },
];

// 需求 7/8/9：用户字段单点定义 —— 用户与权限表单、导入模板表头、个人资料表单共用，保证一致性
export const USER_FIELD_LABELS: Record<string, string> = {
  username: "用户名",
  name: "姓名",
  role: "角色",
  isAdmin: "管理员",
  title: "职称/身份",
  email: "邮箱",
  phone: "电话",
  researchDirection: "研究方向",
  orcid: "ORCID",
  homepage: "主页",
  idCard: "身份证号",
  mainCampus: "人事关系所在校区",
  campus: "当前所在校区",
  building: "楼宇",
  room: "房间号",
  enrollYear: "入学年份",
  expectedGradYear: "预计毕业年份",
  advisorIds: "指导教师",
  // V10：科研管理常用统计字段
  gender: "性别",
  birthDate: "出生日期",
  staffNo: "学号/工号",
  degree: "学位/学历",
  almaMater: "毕业院校",
  politicalStatus: "政治面貌",
  joinDate: "进组日期",
};

// 个人资料页允许用户自行修改的字段（与【用户与权限】可编辑字段保持一致；身份类字段仅管理员维护）
export const PROFILE_EDITABLE_FIELDS = [
  "name",
  "gender",
  "birthDate",
  "staffNo",
  "idCard",
  "email",
  "phone",
  "degree",
  "almaMater",
  "politicalStatus",
  "joinDate",
  "researchDirection",
  "orcid",
  "homepage",
  "mainCampus",
  "campus",
  "building",
  "room",
  "expectedGradYear",
] as const;

// 批量导入模板的列顺序（用户名密码 + 全量字段 + 导师）
export const USER_IMPORT_COLUMNS = [
  "username",
  "password",
  "name",
  "role",
  "isAdmin",
  "title",
  "email",
  "phone",
  "researchDirection",
  "idCard",
  "gender",
  "birthDate",
  "staffNo",
  "degree",
  "almaMater",
  "politicalStatus",
  "joinDate",
  "mainCampus",
  "campus",
  "building",
  "room",
  "enrollYear",
  "expectedGradYear",
  "advisorIds",
] as const;

// 需求 3：培养档案节点类型
export const TRAINING_NODE_TYPES = ["入学", "开题", "中期", "预答辩", "答辩", "毕业"] as const;
export const MAX_FILE_SIZE_MB = 50; // 需求 10：全局单文件上限

// ===================== V6 需求 2：成果归集（项目 × 成果资助关联）=====================
export const FUNDING_OUTPUT_TYPE_LABELS: Record<string, string> = {
  paper: "投稿论文（在投）",
  published_paper: "已发表论文",
  patent: "已获知识产权",
  award: "科研奖励",
  student_work: "学生研究成果",
  book: "专著与教材",
  software_copyright: "软件著作权与标准",
};

// V6 需求 C-4：AI 解析任务的模块标签（确认页与仪表盘共用）
export const AI_MODULE_LABELS: Record<string, string> = {
  paper: "投稿论文进度",
  review: "审稿情况",
  achievement: "成果管理",
  training: "研究生培养",
  reference: "重要参考文献",
  project: "科研项目管理",
  activity: "学术活动管理",
  visit: "专家来访管理",
  social: "社会服务",
  device: "仪器设备",
};
