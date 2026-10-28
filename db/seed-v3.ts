// V3 迁移第二步：管理标志/职称回填 + 新演示账号 + 人才培养/网站更新/外部接口演示数据
// 运行：npx tsx db/seed-v3.ts（幂等，可重复执行）
import { getDb } from "../api/queries/connection";
import { hashPassword } from "../api/auth";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const db = getDb();
  console.log("V3 数据回填开始...");

  // 1) 旧权限矩阵覆盖项作废（角色体系已变）
  await db.delete(schema.rolePermissions);

  // 2) 存量用户：管理标志与职称
  await db.update(schema.users).set({ isAdmin: true, title: "管理老师" }).where(eq(schema.users.username, "secretary"));
  await db.update(schema.users).set({ title: "教授·PI" }).where(eq(schema.users.username, "admin"));

  // 3) 新演示账号（幂等：按 username 检查）
  const newUsers = [
    { username: "teacher1", name: "孙老师", role: "teacher" as const, isAdmin: true, title: "副教授", researchDirection: "多模态学习, 知识图谱", email: "sun@lab.edu.cn" },
    { username: "postdoc1", name: "钱博后", role: "postdoc" as const, isAdmin: false, title: "博士后", researchDirection: "图神经网络, 推荐系统", email: "qian@lab.edu.cn" },
    { username: "intern1", name: "周实习", role: "intern" as const, isAdmin: false, title: "本科实习生", researchDirection: "机器学习", email: "zhou@stu.edu.cn" },
  ];
  for (const u of newUsers) {
    const [exist] = await db.select().from(schema.users).where(eq(schema.users.username, u.username)).limit(1);
    if (!exist) {
      await db.insert(schema.users).values({ ...u, passwordHash: hashPassword("123456") });
      console.log(`新增用户 ${u.username}`);
    }
  }

  const allUsers = await db.select().from(schema.users);
  const uid = (name: string) => allUsers.find((u) => u.username === name)!.id;
  const uname = (name: string) => allUsers.find((u) => u.username === name)!.name;

  // 4) 博士后档案（人才培养·3.3）
  const postdocStu = await db.select().from(schema.students).where(eq(schema.students.kind, "postdoc"));
  if (postdocStu.length === 0) {
    await db.insert(schema.students).values({
      kind: "postdoc",
      name: "钱博后",
      advisor: "王教授",
      direction: "图神经网络",
      email: "qian@lab.edu.cn",
      files: [],
      detail: { 进站日期: "2025-09-01", 预计出站: "2027-08-31", 在站状态: "在站", 国家级课题: "中国博士后科学基金面上项目", 合作导师: "王教授" },
      userId: uid("postdoc1"),
    });
    console.log("新增博士后档案");
  }

  // 5) 研究任务 + 关键研究点 + 文档提交（研究生培养演示）
  const existingTasks = await db.select().from(schema.researchTasks);
  if (existingTasks.length === 0) {
    const t1 = await db.insert(schema.researchTasks).values({
      studentId: uid("student1"),
      title: "多模态情感分析模型研究",
      direction: "机器学习",
      question: "跨模态特征对齐在弱监督条件下如何保证语义一致性？",
      goal: "构建跨注意力融合模型，在三个公开数据集上超过基线 3%",
      approach: "数据构建 → 基线复现 → 跨注意力融合 → 消融实验 → 论文撰写",
      expectedOutput: "CCF-A 会议论文 1 篇",
      startDate: "2026-03-01",
      endDate: "2026-12-31",
      status: "active",
      createdBy: uid("student1"),
      createdByName: uname("student1"),
    });
    const taskId = Number(t1[0].insertId);
    const p1 = await db.insert(schema.researchPoints).values({
      taskId,
      title: "基线模型复现与数据集清洗",
      summary: "完成 CMU-MOSEI 数据集清洗与两个基线复现，记录对齐误差来源。",
      createdBy: uid("student1"),
      createdByName: uname("student1"),
    });
    void p1;
    await db.insert(schema.researchPoints).values({
      taskId,
      title: "跨注意力融合模块设计",
      summary: "设计双向交叉注意力，解决弱监督下的语义漂移问题。",
      createdBy: uid("admin"),
      createdByName: uname("admin"),
    });

    // 学生提交周报 → 导师待办
    const share = await db.insert(schema.docShares).values({
      studentId: uid("student1"),
      studentName: uname("student1"),
      taskId,
      type: "weekly",
      title: "第 12 周周报：基线复现进展",
      content: "本周完成 MOSEI 数据清洗与 MulT 基线复现，准确率 78.2%，遇到对齐误差问题，请老师指导。",
      fileIds: [],
      toUserIds: [uid("admin"), uid("teacher1")],
      status: "submitted",
    });
    const shareId = Number(share[0].insertId);
    await db.insert(schema.todos).values({
      title: `文档待批阅：第 12 周周报：基线复现进展（${uname("student1")} 提交）`,
      description: "类型：weekly。请到【人才培养·研究生培养】中查看并反馈。",
      priority: "high",
      creatorId: uid("student1"),
      creatorName: uname("student1"),
      leaderIds: [uid("admin"), uid("teacher1")],
      participantIds: [],
      source: "doc_share",
      sourceRefId: shareId,
    });
    console.log("新增研究任务/关键研究点/文档提交演示数据");
  }

  // 6) 网站更新待推送示例
  const existingUpdates = await db.select().from(schema.websiteUpdates);
  if (existingUpdates.length === 0) {
    await db.insert(schema.websiteUpdates).values([
      {
        type: "paper",
        title: "论文发表：Multi-modal Fusion Networks: A Survey",
        payload: { 题目: "Multi-modal Fusion Networks: A Survey", 作者: "王教授, 张研一", 期刊会议: "IEEE TMM", 发表日期: `${new Date().getFullYear() - 1}-11-20`, DOI: "" },
        source: "achievement",
        createdBy: uid("admin"),
        createdByName: uname("admin"),
      },
      {
        type: "expert_talk_announce",
        title: "报告预告：陈教授《大模型时代的知识图谱构建》",
        payload: { 专家姓名: "陈教授", 单位: "清华大学计算机系", 职称: "教授", 报告题目: "大模型时代的知识图谱构建", 时间: `${new Date().getFullYear()}-11-10 14:00`, 地点: "学院报告厅 A101", 摘要: "介绍大模型与知识图谱融合的最新进展" },
        source: "research.visits",
        createdBy: uid("secretary"),
        createdByName: uname("secretary"),
      },
      {
        type: "student_award",
        title: "学生获奖：全国大学生计算机设计大赛一等奖",
        payload: { 奖项名称: "全国大学生计算机设计大赛一等奖", 获奖人: "陈本科", 级别: "一等奖", 日期: today() },
        source: "achievement",
        createdBy: uid("admin"),
        createdByName: uname("admin"),
      },
    ]);
    console.log("新增网站更新待推送示例");
  }

  // 7) 外部接口默认配置（占位，管理员在界面中填写）
  const existingConfigs = await db.select().from(schema.externalConfigs);
  if (existingConfigs.length === 0) {
    await db.insert(schema.externalConfigs).values([
      { key: "llm", name: "LLM 大模型接口", config: { baseUrl: "", apiKey: "", model: "" }, enabled: false },
      { key: "wos", name: "Web of Science API", config: { apiKey: "" }, enabled: false },
      { key: "website", name: "课题组网站", config: { siteUrl: "https://3m-cfl.lab.example.cn", feedToken: "", webhookUrl: "" }, enabled: true },
      { key: "caldav", name: "CalDAV 日历同步", config: { server: "", username: "", password: "" }, enabled: false },
    ]);
    console.log("新增外部接口默认配置");
  }

  console.log("V3 数据回填完成！");
  console.log(`演示账号（密码 123456）：admin / secretary / teacher1 / postdoc1 / student1 / student2 / undergrad1 / intern1 / guest`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
