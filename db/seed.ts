// 数据库种子脚本：初始化各角色账号与演示数据
// 运行：npx tsx db/seed.ts
import { getDb } from "../api/queries/connection";
import { hashPassword } from "../api/auth";
import * as schema from "./schema";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const year = new Date().getFullYear();

async function seed() {
  const db = getDb();
  console.log("开始初始化种子数据...");

  // 幂等：已有用户则跳过
  const existing = await db.select().from(schema.users);
  if (existing.length > 0) {
    console.log(`已有 ${existing.length} 个用户，跳过初始化。`);
    process.exit(0);
  }

  // ---- 用户（初始密码均为 123456，请及时修改）----
  const userRows = [
    { username: "admin", name: "admin", role: "super_admin" as const, title: "教授·PI", researchDirection: "人工智能, 数据挖掘, 机器学习", email: "admin@lab.edu.cn" },
    { username: "secretary", name: "李秘书", role: "teacher" as const, isAdmin: true, title: "管理老师", researchDirection: "科研管理, 财务助理", email: "sec@lab.edu.cn" },
    { username: "teacher1", name: "孙老师", role: "teacher" as const, isAdmin: true, title: "副教授", researchDirection: "多模态学习, 知识图谱", email: "sun@lab.edu.cn" },
    { username: "postdoc1", name: "钱博后", role: "postdoc" as const, researchDirection: "图神经网络, 推荐系统", email: "qian@lab.edu.cn" },
    { username: "intern1", name: "周实习", role: "intern" as const, researchDirection: "机器学习", email: "zhou@stu.edu.cn" },
    { username: "student1", name: "张研一", role: "grad" as const, researchDirection: "机器学习, 深度学习", email: "zhang@stu.edu.cn" },
    { username: "student2", name: "刘研二", role: "grad" as const, researchDirection: "数据挖掘, 图神经网络", email: "liu@stu.edu.cn" },
    { username: "undergrad1", name: "陈本科", role: "benyan" as const, researchDirection: "机器学习", email: "chen@stu.edu.cn" },
    { username: "guest", name: "访客", role: "guest" as const },
  ];
  for (const u of userRows) {
    await db.insert(schema.users).values({ ...u, passwordHash: hashPassword("123456") });
  }
  const allUsers = await db.select().from(schema.users);
  const uid = (name: string) => allUsers.find((u) => u.username === name)!.id;
  console.log(`用户初始化完成（${allUsers.length} 个，初始密码 123456）`);

  // ---- 待办 ----
  await db.insert(schema.todos).values([
    { title: "审阅张研一的周报", priority: "high", dueDate: today(), creatorId: uid("admin"), creatorName: "admin", leaderIds: [uid("admin")], participantIds: [], source: "manual", pinned: true },
    { title: "准备基金中期检查材料", priority: "urgent", dueDate: plusDays(3), creatorId: uid("secretary"), creatorName: "李秘书", leaderIds: [uid("admin"), uid("secretary")], participantIds: [uid("student1")], source: "manual" },
    { title: "整理实验数据", priority: "medium", dueDate: plusDays(5), creatorId: uid("student1"), creatorName: "张研一", leaderIds: [uid("student1")], participantIds: [], source: "manual" },
    { title: "逾期待办示例：提交报销单", priority: "high", dueDate: plusDays(-2), creatorId: uid("student2"), creatorName: "刘研二", leaderIds: [uid("student2")], participantIds: [], source: "manual" },
  ]);

  // ---- 2.1 项目 ----
  await db.insert(schema.projects).values([
    {
      name: "基于深度学习的多模态数据挖掘方法研究",
      code: "NSFC-62377001",
      source: "国家自然科学基金面上项目",
      leader: "admin",
      leaderId: uid("admin"),
      participantIds: [uid("teacher1"), uid("student1")],
      startDate: `${year - 1}-01-01`,
      endDate: `${year + 2}-12-31`,
      totalBudget: 580000,
      receivedAmount: 348000,
      status: "ongoing",
      description: "研究多模态数据融合与挖掘关键技术",
      category: "vertical" as const, contractFileIds: [], milestones: [
        { name: "开题论证", date: `${year - 1}-03-01`, status: "done" },
        { name: "中期检查", date: `${year}-09-30`, status: "pending" },
        { name: "结题验收", date: `${year + 2}-12-31`, status: "pending" },
      ],
    },
    {
      name: "企业横向：智能质检系统开发",
      code: "HX-2025-018",
      source: "XX科技有限公司",
      leader: "admin",
      leaderId: uid("admin"),
      participantIds: [uid("secretary"), uid("student2")],
      startDate: `${year}-03-01`,
      endDate: `${year + 1}-02-28`,
      totalBudget: 300000,
      receivedAmount: 150000,
      status: "ongoing",
      description: "工业视觉质检算法与系统交付",
      category: "vertical" as const, contractFileIds: [], milestones: [
        { name: "需求确认", date: `${year}-03-15`, status: "done" },
        { name: "系统交付", date: `${year + 1}-01-31`, status: "pending" },
      ],
    },
  ]);

  const seededProjects = await db.select().from(schema.projects);
  const mainProjectId = seededProjects.find((p) => p.code === "NSFC-62377001")?.id;

  // ---- 2.2 学生科研进度 ----
  await db.insert(schema.studentProgress).values([
    { studentId: uid("student1"), topic: "多模态情感分析模型研究", stageGoal: "完成基线模型搭建与数据集构建", proposalStatus: "done", midtermStatus: "ongoing", defenseStatus: "not_started", reports: [{ type: "week" as const, content: "完成数据集清洗，准确率达 78%。", date: today() }] },
    { studentId: uid("student2"), topic: "图神经网络在推荐系统中的应用", stageGoal: "完成文献综述与开题报告", proposalStatus: "ongoing", midtermStatus: "not_started", defenseStatus: "not_started", reports: [] },
  ]);

  // ---- 2.3 合作者 ----
  await db.insert(schema.collaborations).values([
    { title: "跨模态检索联合研究", partner: "赵合作", partnerOrg: "合作高校计算机学院", division: "我方负责模型设计，对方负责数据集与评测", outputs: "联合投稿 CCF-A 会议 1 篇（在审）", status: "ongoing", startDate: `${year}-01-15`, ownerId: uid("admin"), participantIds: [uid("teacher1"), uid("student1")] },
  ]);

  // ---- 2.4 投稿论文 ----
  await db.insert(schema.papers).values([
    { title: "Multi-modal Sentiment Analysis via Cross-attention Fusion", authors: "张研一, 王教授", journal: "AAAI", targetTier: "CCF-A", status: "under_review" as const, submitDate: `${year}-08-01`, leaderId: uid("student1"), participantIds: [uid("admin")], note: "外审中" },
    { title: "图神经网络推荐算法综述", authors: "刘研二", journal: "计算机学报", targetTier: "CCF-B", status: "writing" as const, leaderId: uid("student2"), participantIds: [uid("student1")], note: "" },
  ]);

  // ---- 2.5 审稿 ----
  await db.insert(schema.reviews).values([
    { title: "Deep Graph Learning for Recommendation", authors: "匿名", direction: "数据挖掘, 图神经网络, 机器学习", keywords: "GNN, 推荐系统", journal: "KDD", status: "in_review" as const, assignments: [{ reviewerId: uid("student2"), reviewerName: "刘研二", deadline: plusDays(10), status: "pending" as const }], note: "", createdBy: uid("admin") },
  ]);

  // ---- 2.6 文献 ----
  await db.insert(schema.references).values([
    { authors: "Vaswani A, Shazeer N", year: 2017, title: "Attention Is All You Need", venue: "NeurIPS", volume: "30", pages: "5998-6008", doi: "10.48550/arXiv.1706.03762", abstract: "提出 Transformer 架构……", keywords: "Transformer; 注意力机制", category: "机器学习/基础模型", tags: "经典, 必读", importance: 5, notes: "组会精读过" },
    { authors: "Kipf T, Welling M", year: 2017, title: "Semi-Supervised Classification with Graph Convolutional Networks", venue: "ICLR", doi: "10.48550/arXiv.1609.02907", keywords: "GCN; 图神经网络", category: "图神经网络", tags: "经典", importance: 5 },
  ]);

  // ---- 2.8 学术活动 ----
  await db.insert(schema.academicActivities).values([
    { nameCn: "中国计算机大会", nameEn: "CNCC", startDate: `${year}-10-23`, endDate: `${year}-10-25`, location: "杭州", url: "https://ccf.org.cn", submitDeadline: `${year}-06-15`, regDeadline: `${year}-09-30`, attendeeIds: [uid("student1"), uid("admin")], abstracts: "", submissionRecord: "投稿 1 篇（已录用）", reports: [{ type: "口头报告", titleCn: "多模态融合方法", speakers: "张研一", paperNo: "CNCC-2025-101" }], createdBy: uid("admin") },
  ]);

  // ---- 2.9 专家来访 ----
  await db.insert(schema.expertVisits).values([
    { expertName: "陈教授", expertOrg: "清华大学计算机系", expertTitle: "教授", reportTitle: "大模型时代的知识图谱构建", abstract: "介绍大模型与知识图谱融合的最新进展……", reportTime: `${year}-11-10 14:00`, location: "学院报告厅 A101", reception: "校门口迎接，安排工作餐", hostId: uid("secretary"), photoFileIds: [], isPublic: true, status: "planned" as const },
  ]);

  // ---- 2.10 经费 ----
  await db.insert(schema.fundCards).values([
    {
      projectId: mainProjectId,
      projectCode: "NSFC-62377001",
      projectName: "基于深度学习的多模态数据挖掘方法研究",
      ownerId: uid("admin"),
      source: "国家自然科学基金",
      totalAmount: 580000,
      budgets: [
        { subject: "设备费", amount: 100000 },
        { subject: "材料费", amount: 50000 },
        { subject: "测试化验加工费", amount: 80000 },
        { subject: "差旅/会议/国际合作交流费", amount: 100000 },
        { subject: "出版/文献/信息传播费", amount: 60000 },
        { subject: "劳务费", amount: 120000 },
        { subject: "专家咨询费", amount: 30000 },
        { subject: "间接费用", amount: 40000 },
      ],
      arrivals: [
        { plannedDate: `${year - 1}-06-01`, plannedAmount: 348000, actualDate: `${year - 1}-06-10`, actualAmount: 348000 },
        { plannedDate: `${year}-06-01`, plannedAmount: 116000 },
      ],
      expenses: [
        { date: `${year}-03-12`, subject: "设备费", amount: 45000, description: "GPU 服务器一台" },
        { date: `${year}-05-20`, subject: "差旅/会议/国际合作交流费", amount: 12000, description: "CNCC 会议差旅" },
      ],
      laborPayments: [{ payee: "张研一", month: `${year}-06`, amount: 1500 }],
      transfers: [],
    },
  ]);

  // ---- 2.11 研究生 + 5.2 本科生 ----
  await db.insert(schema.students).values([
    { kind: "grad" as const, name: "张研一", studentNo: "S2024001", gender: "男", phone: "13800000001", email: "zhang@stu.edu.cn", hometown: "山东济南", bachelorSchool: "山东大学", advisor: "王教授", direction: "机器学习", proposalStatus: "已完成", midtermStatus: "进行中", defenseStatus: "未开始", files: [], userId: uid("student1") },
    { kind: "grad" as const, name: "刘研二", studentNo: "S2024002", gender: "女", phone: "13800000002", email: "liu@stu.edu.cn", hometown: "江苏南京", bachelorSchool: "南京大学", advisor: "王教授", direction: "图神经网络", proposalStatus: "进行中", midtermStatus: "未开始", defenseStatus: "未开始", files: [], userId: uid("student2") },
    { kind: "undergrad" as const, name: "陈本科", studentNo: "B2023001", gender: "男", phone: "13800000003", email: "chen@stu.edu.cn", hometown: "浙江杭州", advisor: "王教授", direction: "机器学习", files: [], userId: uid("undergrad1") },
  ]);

  await db.insert(schema.advisorMap).values([
    { studentId: uid("student1"), mentorId: uid("admin"), ord: 1 },
    { studentId: uid("student2"), mentorId: uid("admin"), ord: 1 },
    { studentId: uid("student2"), mentorId: uid("teacher1"), ord: 2 },
    { studentId: uid("undergrad1"), mentorId: uid("admin"), ord: 1 },
  ]);

  // ---- 模块三 成果 ----
  const ach1 = await db.insert(schema.achievements).values([
    { category: "published_paper" as const, title: "Multi-modal Fusion Networks: A Survey", authors: "王教授, 张研一", year: year - 1, date: `${year - 1}-11-20`, detail: { 期刊: "IEEE TMM", 分区: "中科院一区" }, evidenceFileIds: [], isPublic: true, createdBy: uid("admin") },
    { category: "patent" as const, title: "一种多模态数据对齐方法", authors: "王教授, 刘研二", year, date: `${year}-04-15`, detail: { 专利号: "ZL202510001" }, evidenceFileIds: [], isPublic: true, createdBy: uid("student2") },
    { category: "student_work" as const, title: "全国大学生计算机设计大赛一等奖", authors: "陈本科", year, date: `${year}-08-01`, detail: { 奖项: "一等奖" }, evidenceFileIds: [], fromStudentName: "陈本科", isPublic: true, createdBy: uid("undergrad1") },
  ]);
  void ach1;

  // ---- 2.7 WoS 引用 ----
  const achs = await db.select().from(schema.achievements);
  const paper1 = achs.find((a) => a.category === "published_paper");
  if (paper1) {
    await db.insert(schema.wosCitations).values({
      achievementId: paper1.id,
      counts: { [String(year - 2)]: 3, [String(year - 1)]: 12, [String(year)]: 21 },
    });
  }

  // ---- 模块四 社会服务 ----
  await db.insert(schema.socialServices).values([
    { type: "academic_org" as const, orgName: "中国计算机学会", position: "专业委员会委员", startDate: `${year - 2}-01-01`, endDate: `${year + 1}-12-31`, confidential: false, detail: {}, attachmentFileIds: [], isPublic: true, ownerId: uid("admin") },
    { type: "review" as const, orgName: "国家自然科学基金委", position: "通讯评审专家", deadline: plusDays(15), confidential: true, detail: { 评审类型: "基金项目评审" }, attachmentFileIds: [], isPublic: false, ownerId: uid("admin") },
  ]);

  console.log("种子数据初始化完成！");
  console.log("账号：admin / secretary / teacher1 / postdoc1 / student1 / student2 / undergrad1 / intern1 / guest（密码均为 123456）");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
