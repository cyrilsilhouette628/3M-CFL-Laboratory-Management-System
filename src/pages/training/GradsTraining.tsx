// 研究生培养（V5 需求 2/3/4 重构）：三级视图
//  · 导师/管理员首页 = 培养仪表盘（名下学生总体情况 + 逐生摘要列表，点击进入学生个人页）
//  · 学生首页 = 自己的培养仪表盘（等价于 studentId=本人 的个人页）
//  · 学生个人页（?studentId=）= 四子栏目：研究任务与关键研究点 / 周报 / 文档提交与导师反馈 / 档案节点成果
import { useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field, StatCard } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DOC_SHARE_TYPES, DOC_SHARE_TYPE_LABELS, TRAINING_NODE_TYPES,
  WEEKLY_STATUS_LABELS, ACHIEVEMENT_CATEGORY_LABELS, PAPER_STATUS_LABELS, ROLE_LABELS, type Role,
} from "@contracts/constants";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, Send, MessageSquareReply,
  FlaskConical, FileText, ArrowLeft, GraduationCap, CalendarCheck2, BookOpenCheck, Trophy,
} from "lucide-react";

// ============ 类型 ============
type Task = {
  id: number; studentId: number; title: string; direction: string | null;
  question: string | null; goal: string | null; approach: string | null; expectedOutput: string | null;
  startDate: string | null; endDate: string | null; status: string; createdByName: string | null;
  points?: Point[];
};
type PointDoc = { id: number; fileId: number; fileName: string; version: number; note: string | null; uploadedByName: string | null; createdAt: string };
type Point = { id: number; taskId: number; title: string; summary: string | null; createdByName: string | null; createdAt: string; docs: PointDoc[] };
type Share = {
  id: number; studentId: number; studentName: string | null; type: string; title: string; content: string | null;
  fileIds: number[]; toUserIds: number[]; toUserNames?: string[]; status: string; feedback: string | null;
  feedbackFileIds: number[] | null; feedbackByName: string | null; feedbackAt: string | null; createdAt: string;
};
type Weekly = {
  id: number; studentId: number; studentName: string | null; weekStart: string; content: string;
  plan: string | null; problems: string | null; fileIds: number[]; status: string;
  feedback: string | null; feedbackByName: string | null; feedbackAt: string | null; createdAt: string;
  studentReply: string | null; studentReplyAt: string | null;
};
type Node = { id: number; studentId: number; nodeType: string; date: string | null; status: string; note: string | null; fileIds: number[] | null };
type Ach = { id: number; category: string; title: string; authors: string | null; year: number; date: string | null };
type Paper = { id: number; title: string; journal: string | null; status: string };
type Overview = {
  student: { id: number; name: string; role: string; title: string | null; researchDirection: string | null; email: string | null; phone: string | null; enrollYear: number | null; expectedGradYear: number | null; campus: string | null; building: string | null; room: string | null };
  advisorNames: string[];
  tasks: Task[]; weekly: Weekly[]; shares: Share[]; nodes: Node[]; achievements: Ach[]; papers: Paper[];
  stats: { taskTotal: number; taskActive: number; weeklyTotal: number; weeklyReviewed: number; docTotal: number; nodesDone: number; nodesTotal: number; achievementTotal: number };
};
type StudentSummary = {
  id: number; name: string; role: string; title: string | null; researchDirection: string | null;
  enrollYear: number | null; expectedGradYear: number | null;
  taskTotal: number; taskActive: number; lastWeeklyAt: string | null; thisWeekSubmitted: boolean;
  pendingReviewWeekly: number; docTotal: number; docPending: number; nodesDone: number; nodesTotal: number;
};

const TASK_STATUS: Record<string, { label: string; tone: "green" | "amber" | "gray" }> = {
  active: { label: "进行中", tone: "green" },
  paused: { label: "暂停", tone: "amber" },
  done: { label: "已完成", tone: "gray" },
};

function mondayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * offset);
  return d.toISOString().slice(0, 10);
}

// ============ 入口：三级视图分发 ============
export default function GradsTraining() {
  const { user, can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const mentorView = can("training.grads", "manage") || user?.isAdmin || ["teacher", "postdoc", "super_admin"].includes(user?.role ?? "");
  const studentIdParam = Number(searchParams.get("studentId")) || null;
  const tabParam = searchParams.get("tab");

  // 学生类身份首页即为自己的培养仪表盘（V5 需求 3）
  const effectiveStudentId = mentorView ? studentIdParam : (user?.id ?? null);

  if (effectiveStudentId) {
    return (
      <StudentTrainingPage
        studentId={effectiveStudentId}
        tab={tabParam}
        mentorView={mentorView}
        onBack={mentorView ? () => setSearchParams({}) : null}
        onTab={(t) => setSearchParams({ studentId: String(effectiveStudentId), tab: t })}
      />
    );
  }
  return <MentorDashboard onPick={(id) => setSearchParams({ studentId: String(id) })} />;
}

// ============ 导师视图首页：培养总仪表盘 ============
function MentorDashboard({ onPick }: { onPick: (id: number) => void }) {
  const { data, isLoading } = trpc.trainingDash.students.useQuery();
  const students = (data ?? []) as StudentSummary[];

  const totalActive = students.reduce((a, s) => a + s.taskActive, 0);
  const weekSubmitted = students.filter((s) => s.thisWeekSubmitted).length;
  const pendingReview = students.reduce((a, s) => a + s.pendingReviewWeekly + s.docPending, 0);
  const nodePending = students.reduce((a, s) => a + (s.nodesTotal - s.nodesDone), 0);

  return (
    <div>
      <PageHeader title="研究生培养 · 总览" sub="所指导学生的总体情况；点击学生条目进入该学生的个人培养页（研究任务 / 周报 / 文档 / 档案节点成果）" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="名下学生" value={students.length} icon={<GraduationCap className="h-4 w-4" />} />
        <StatCard label="本周周报已交" value={`${weekSubmitted}/${students.length}`} icon={<CalendarCheck2 className="h-4 w-4" />} />
        <StatCard label="进行中研究任务" value={totalActive} icon={<FlaskConical className="h-4 w-4" />} />
        <StatCard label="待批阅（周报+文档）" value={pendingReview} icon={<BookOpenCheck className="h-4 w-4" />} />
        <StatCard label="待完成培养节点" value={nodePending} icon={<Trophy className="h-4 w-4" />} />
      </div>

      {isLoading ? <EmptyState text="加载中…" /> : students.length === 0 ? (
        <EmptyState text="暂无名下学生。请先在【系统配置 · 用户与权限】中为学生账号指定指导教师。" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead>
              <tr>
                <th>学生</th><th>入学 / 预计毕业</th><th>研究方向</th><th>研究任务</th>
                <th>最近周报</th><th>本周周报</th><th>待批阅</th><th>培养节点</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-accent/50" onClick={() => onPick(s.id)} title="点击进入该学生的个人培养页">
                  <td>
                    <span className="font-medium text-primary underline-offset-2 hover:underline">{s.name}</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{ROLE_LABELS[s.role as Role] ?? s.role}</span>
                  </td>
                  <td className="tabular-nums text-[12px]">{s.enrollYear ?? "—"} / {s.expectedGradYear ?? "—"}</td>
                  <td className="max-w-44 truncate text-[12px]">{s.researchDirection ?? "—"}</td>
                  <td className="text-[12px]">{s.taskActive} 进行中 / {s.taskTotal} 总计</td>
                  <td className="tabular-nums text-[12px]">{s.lastWeeklyAt ?? "从未提交"}</td>
                  <td>{s.thisWeekSubmitted ? <Pill text="已交" tone="green" /> : <Pill text="未交" tone="red" />}</td>
                  <td>{s.pendingReviewWeekly + s.docPending > 0 ? <Pill text={`${s.pendingReviewWeekly + s.docPending} 项`} tone="amber" /> : <span className="text-[12px] text-muted-foreground">—</span>}</td>
                  <td className="text-[12px]">{s.nodesDone}/{s.nodesTotal || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============ 学生个人页：四子栏目 ============
function StudentTrainingPage({
  studentId, tab, mentorView, onBack, onTab,
}: {
  studentId: number; tab: string | null; mentorView: boolean; onBack: (() => void) | null; onTab: (t: string) => void;
}) {
  const { user, can } = useAuth();
  const utils = trpc.useUtils();
  const editable = can("training.grads", "editable");
  const isSelf = user?.id === studentId;
  const overview = trpc.trainingDash.overview.useQuery({ studentId });
  const ov = overview.data as Overview | undefined;
  const curTab = tab === "weekly" ? "weekly" : tab === "docs" ? "shares" : tab === "archive" ? "archive" : "tasks";

  if (overview.error) {
    return (
      <div>
        {onBack && <Button variant="ghost" size="sm" className="mb-2" onClick={onBack}><ArrowLeft className="mr-1 h-3.5 w-3.5" />返回总览</Button>}
        <EmptyState text={overview.error.message} />
      </div>
    );
  }
  if (!ov) return <EmptyState text="加载中…" />;

  const invalidate = () => utils.trainingDash.overview.invalidate();

  return (
    <div>
      {onBack && <Button variant="ghost" size="sm" className="mb-2" onClick={onBack}><ArrowLeft className="mr-1 h-3.5 w-3.5" />返回总览</Button>}
      <PageHeader
        title={`${ov.student.name} · 个人培养页`}
        sub={`${ROLE_LABELS[ov.student.role as Role] ?? ov.student.role}${ov.student.title ? ` · ${ov.student.title}` : ""} · 指导教师：${ov.advisorNames.join("、") || "—"} · ${ov.student.enrollYear ?? "—"} 年入学 / 预计 ${ov.student.expectedGradYear ?? "—"} 年毕业`}
      />

      {/* 总体表现 */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="研究任务（进行中/总计）" value={`${ov.stats.taskActive}/${ov.stats.taskTotal}`} icon={<FlaskConical className="h-4 w-4" />} />
        <StatCard label="周报（已批阅/总计）" value={`${ov.stats.weeklyReviewed}/${ov.stats.weeklyTotal}`} icon={<CalendarCheck2 className="h-4 w-4" />} />
        <StatCard label="文档提交" value={ov.stats.docTotal} icon={<FileText className="h-4 w-4" />} />
        <StatCard label="节点成果（节点/成果）" value={`${ov.stats.nodesDone}/${ov.stats.nodesTotal || 0} · ${ov.stats.achievementTotal}`} icon={<Trophy className="h-4 w-4" />} />
      </div>

      <Tabs value={curTab} onValueChange={onTab}>
        <TabsList>
          <TabsTrigger value="tasks">研究任务与关键研究点</TabsTrigger>
          <TabsTrigger value="weekly">周报</TabsTrigger>
          <TabsTrigger value="shares">文档提交与导师反馈</TabsTrigger>
          <TabsTrigger value="archive">档案节点成果</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks"><TasksPanel ov={ov} editable={editable} isSelf={isSelf} onChanged={invalidate} /></TabsContent>
        <TabsContent value="weekly"><WeeklyPanel ov={ov} editable={editable} isSelf={isSelf} mentorView={mentorView} onChanged={invalidate} /></TabsContent>
        <TabsContent value="shares"><SharesPanel ov={ov} editable={editable} isSelf={isSelf} mentorView={mentorView} onChanged={invalidate} /></TabsContent>
        <TabsContent value="archive"><ArchivePanel ov={ov} editable={editable} isSelf={isSelf} onChanged={invalidate} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============ 子栏目 1：研究任务与关键研究点 ============
function TasksPanel({ ov, editable, isSelf, onChanged }: { ov: Overview; editable: boolean; isSelf: boolean; onChanged: () => void }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [taskEdit, setTaskEdit] = useState<Partial<Task> | null>(null);
  const [pointFor, setPointFor] = useState<Task | null>(null);
  const [newPoint, setNewPoint] = useState({ title: "", summary: "" });

  const createTask = trpc.tasks.create.useMutation({ onSuccess: onChanged });
  const updateTask = trpc.tasks.update.useMutation({ onSuccess: onChanged });
  const removeTask = trpc.tasks.remove.useMutation({ onSuccess: onChanged });
  const addPoint = trpc.points.add.useMutation({ onSuccess: () => { onChanged(); setNewPoint({ title: "", summary: "" }); } });
  const removePoint = trpc.points.remove.useMutation({ onSuccess: onChanged });
  const addDoc = trpc.points.addDoc.useMutation({ onSuccess: onChanged });

  function saveTask() {
    if (!taskEdit?.title) return;
    const payload = {
      studentId: ov.student.id,
      title: taskEdit.title,
      direction: taskEdit.direction ?? "",
      question: taskEdit.question ?? "",
      goal: taskEdit.goal ?? "",
      approach: taskEdit.approach ?? "",
      expectedOutput: taskEdit.expectedOutput ?? "",
      startDate: taskEdit.startDate ?? "",
      endDate: taskEdit.endDate ?? "",
      status: (taskEdit.status ?? "active") as "active",
    };
    if (taskEdit.id) updateTask.mutate({ id: taskEdit.id, ...payload });
    else createTask.mutate(payload);
    setTaskEdit(null);
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setTaskEdit({ status: "active" })}>
            <Plus className="mr-1 h-3.5 w-3.5" />新建研究任务
          </Button>
        )}
      </div>
      {ov.tasks.length === 0 ? <EmptyState text="暂无研究任务。每个研究任务以关键研究点进行过程管理，过程文档版本化沉淀。" /> : (
        <div className="space-y-3">
          {ov.tasks.map((t) => (
            <div key={t.id} className="rounded-md border border-border bg-card">
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FlaskConical className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-[14px] font-semibold">{t.title}</span>
                    <Pill text={TASK_STATUS[t.status]?.label ?? t.status} tone={TASK_STATUS[t.status]?.tone ?? "gray"} />
                  </div>
                  <div className="mt-1 text-[12px] text-muted-foreground">
                    {t.direction && <span className="mr-3">方向：{t.direction}</span>}
                    {(t.startDate || t.endDate) && <span className="mr-3 tabular-nums">{t.startDate} ~ {t.endDate}</span>}
                    {t.expectedOutput && <span>预期成果：{t.expectedOutput}</span>}
                  </div>
                  {(t.question || t.goal) && (
                    <div className="mt-1.5 space-y-0.5 text-[12px]">
                      {t.question && <div><span className="text-muted-foreground">关键科学问题：</span>{t.question}</div>}
                      {t.goal && <div><span className="text-muted-foreground">研究目标：</span>{t.goal}</div>}
                      {t.approach && <div><span className="text-muted-foreground">技术路线：</span>{t.approach}</div>}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setExpanded({ ...expanded, [t.id]: !expanded[t.id] })}>
                    {expanded[t.id] ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
                    关键研究点（{t.points?.length ?? 0}）
                  </Button>
                  {editable && (
                    <>
                      <button className="text-muted-foreground hover:text-foreground" onClick={() => setTaskEdit(t)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => confirm("删除该任务及其全部研究点？") && removeTask.mutate({ id: t.id })}><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
              {expanded[t.id] && (
                <div className="border-t border-border bg-secondary/30 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-muted-foreground">关键研究点（过程文档版本管理）</span>
                    {editable && <Button variant="ghost" size="sm" onClick={() => setPointFor(t)}><Plus className="mr-1 h-3 w-3" />新建研究点</Button>}
                  </div>
                  {(t.points ?? []).length === 0 ? (
                    <div className="py-3 text-center text-[12px] text-muted-foreground">暂无研究点。创建研究点 = 新建/提交/交换一份过程文档。</div>
                  ) : (
                    <div className="space-y-2.5">
                      {(t.points ?? []).map((pt) => (
                        <div key={pt.id} className="rounded-sm border border-border bg-card px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-primary" />
                                <span className="text-[13px] font-medium">{pt.title}</span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">{pt.createdByName} · {new Date(pt.createdAt).toLocaleString("zh-CN")}</div>
                              {pt.summary && <div className="mt-1 whitespace-pre-wrap text-[12px]">{pt.summary}</div>}
                            </div>
                            {editable && (
                              <button className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => confirm("删除该研究点及其文档版本？") && removePoint.mutate({ id: pt.id })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {pt.docs.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {pt.docs.map((d) => (
                                <div key={d.id} className="flex items-center gap-2 text-[12px]">
                                  <Pill text={`v${d.version}`} tone={d.version === Math.max(...pt.docs.map((x) => x.version)) ? "green" : "gray"} />
                                  <span className="truncate">{d.fileName}</span>
                                  <span className="text-muted-foreground">{d.uploadedByName}</span>
                                  {d.note && <span className="text-muted-foreground">（{d.note}）</span>}
                                  <FileChips ids={[d.fileId]} />
                                </div>
                              ))}
                            </div>
                          )}
                          {editable && (
                            <div className="mt-2 max-w-xs">
                              <FileUpload module="training" compact onUploaded={(fid, fname) => addDoc.mutate({ pointId: pt.id, fileId: fid, fileName: fname })} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 新建研究点 */}
      <Dialog open={!!pointFor} onOpenChange={(o) => !o && setPointFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>新建关键研究点 — {pointFor?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="研究点标题" required>
              <Input value={newPoint.title} onChange={(e) => setNewPoint({ ...newPoint, title: e.target.value })} placeholder="如：基线模型复现与数据集清洗" />
            </Field>
            <Field label="内容摘要（研究工作整理 / 研究问题总结 / 重要文献交换）">
              <Textarea rows={4} value={newPoint.summary} onChange={(e) => setNewPoint({ ...newPoint, summary: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPointFor(null)}>取消</Button>
              <Button disabled={!newPoint.title} onClick={() => { addPoint.mutate({ taskId: pointFor!.id, ...newPoint }); setPointFor(null); }}>创建</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新建/编辑研究任务 */}
      <Dialog open={!!taskEdit} onOpenChange={(o) => !o && setTaskEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{taskEdit?.id ? "编辑研究任务" : "新建研究任务"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <Field label="任务名称" required><Input value={taskEdit?.title ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, title: e.target.value })} /></Field>
            <Field label="所属研究方向"><Input value={taskEdit?.direction ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, direction: e.target.value })} /></Field>
            <Field label="起始日期"><Input type="date" value={taskEdit?.startDate ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, startDate: e.target.value })} /></Field>
            <Field label="结束日期"><Input type="date" value={taskEdit?.endDate ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, endDate: e.target.value })} /></Field>
            <Field label="预期成果"><Input value={taskEdit?.expectedOutput ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, expectedOutput: e.target.value })} placeholder="如：CCF-A 论文 1 篇" /></Field>
            <Field label="任务状态">
              <Select value={taskEdit?.status ?? "active"} onValueChange={(v) => setTaskEdit({ ...taskEdit, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="col-span-2"><Field label="关键科学问题"><Textarea rows={2} value={taskEdit?.question ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, question: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="研究目标"><Textarea rows={2} value={taskEdit?.goal ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, goal: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="技术路线"><Textarea rows={2} value={taskEdit?.approach ?? ""} onChange={(e) => setTaskEdit({ ...taskEdit, approach: e.target.value })} /></Field></div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTaskEdit(null)}>取消</Button>
            <Button disabled={!taskEdit?.title} onClick={saveTask}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
      {isSelf && null}
    </div>
  );
}

// ============ 子栏目 2：周报 ============
function WeeklyPanel({ ov, editable, isSelf, mentorView, onChanged }: { ov: Overview; editable: boolean; isSelf: boolean; mentorView: boolean; onChanged: () => void }) {
  const { user } = useAuth();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [form, setForm] = useState({ weekStart: mondayStr(), content: "", plan: "", problems: "", fileIds: [] as number[] });
  const [fbFor, setFbFor] = useState<Weekly | null>(null);
  const [fbText, setFbText] = useState("");
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const submit = trpc.weekly.submit.useMutation({
    onSuccess: () => { onChanged(); setSubmitOpen(false); setForm({ weekStart: mondayStr(), content: "", plan: "", problems: "", fileIds: [] }); alert("周报已提交，导师的待办事项中已生成审阅提醒。"); },
    onError: (e) => alert(e.message),
  });
  const feedback = trpc.weekly.feedback.useMutation({
    onSuccess: () => { onChanged(); setFbFor(null); setFbText(""); alert("已批阅，学生的待办事项中已生成提醒。"); },
    onError: (e) => alert(e.message),
  });

  const reply = trpc.weekly.reply.useMutation({
    onSuccess: () => { onChanged(); setReplyFor(null); setReplyText(""); alert("二次反馈已提交，导师将收到待办提醒。"); },
    onError: (e) => alert(e.message),
  });

  const submittedWeeks = new Set(ov.weekly.map((w) => w.weekStart));

  return (
    <div>
      {isSelf && user?.role === "grad" && (
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[12px] text-muted-foreground">
            本周（{mondayStr()}）{submittedWeeks.has(mondayStr()) ? "已提交 ✓" : "尚未提交"}
          </div>
          <Button size="sm" onClick={() => setSubmitOpen(true)}><Send className="mr-1 h-3.5 w-3.5" />提交本周周报</Button>
        </div>
      )}
      {ov.weekly.length === 0 ? <EmptyState text="暂无周报记录。" /> : (
        <div className="space-y-3">
          {ov.weekly.map((w) => (
            <div key={w.id} className="rounded-md border border-border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold tabular-nums">{w.weekStart} 周</span>
                    <Pill text={WEEKLY_STATUS_LABELS[w.status] ?? w.status} tone={w.status === "reviewed" ? "green" : "amber"} />
                  </div>
                  <div className="mt-1.5 whitespace-pre-wrap text-[13px]">{w.content}</div>
                  {w.plan && <div className="mt-1 text-[12px]"><span className="text-muted-foreground">下周计划：</span>{w.plan}</div>}
                  {w.problems && <div className="mt-1 text-[12px]"><span className="text-muted-foreground">问题与困难：</span>{w.problems}</div>}
                  {w.fileIds.length > 0 && <div className="mt-2"><FileChips ids={w.fileIds} /></div>}
                  {w.status === "reviewed" && w.feedback && (
                    <div className="mt-2 rounded-sm border border-emerald-800/30 bg-emerald-900/10 px-3 py-2">
                      <div className="text-[12px] font-medium text-emerald-900 dark:text-emerald-200">
                        导师评语（{w.feedbackByName} · {w.feedbackAt ? new Date(w.feedbackAt).toLocaleString("zh-CN") : ""}）
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-[13px]">{w.feedback}</div>
                    </div>
                  )}
                  {w.studentReply && (
                    <div className="mt-2 rounded-sm border border-primary/20 bg-primary/5 px-3 py-2">
                      <div className="text-[12px] font-medium text-primary">学生二次反馈{w.studentReplyAt ? `（${new Date(w.studentReplyAt).toLocaleString("zh-CN")}）` : ""}</div>
                      <div className="mt-1 whitespace-pre-wrap text-[13px]">{w.studentReply}</div>
                    </div>
                  )}
                  {isSelf && w.studentId === user?.id && w.status === "reviewed" && !w.studentReply && (
                    <div className="mt-2">
                      {replyFor === w.id ? (
                        <div className="space-y-2 rounded-sm border border-border p-3">
                          <Textarea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="针对导师评语补充说明、反馈落实情况或提出新的问题…" />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => { setReplyFor(null); setReplyText(""); }}>取消</Button>
                            <Button size="sm" disabled={!replyText.trim() || reply.isPending} onClick={() => reply.mutate({ id: w.id, content: replyText.trim() })}>提交二次反馈</Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setReplyFor(w.id)}><MessageSquareReply className="mr-1 h-3.5 w-3.5" />回复导师评语</Button>
                      )}
                    </div>
                  )}
                </div>
                {mentorView && w.status === "submitted" && editable && (
                  <Button size="sm" variant="outline" onClick={() => { setFbFor(w); setFbText(""); }}>
                    <MessageSquareReply className="mr-1 h-3.5 w-3.5" />批阅
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 提交周报（学生本人） */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>提交周报</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="周起始日（周一）" required>
              <Input type="date" value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: e.target.value })} />
            </Field>
            <Field label="本周进展" required>
              <Textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </Field>
            <Field label="下周计划"><Textarea rows={2} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} /></Field>
            <Field label="问题与困难"><Textarea rows={2} value={form.problems} onChange={(e) => setForm({ ...form, problems: e.target.value })} /></Field>
            <Field label="附件">
              <FileUpload module="training" onUploaded={(fid) => setForm((f) => ({ ...f, fileIds: [...f.fileIds, fid] }))} />
              {form.fileIds.length > 0 && <div className="mt-1"><FileChips ids={form.fileIds} /></div>}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSubmitOpen(false)}>取消</Button>
              <Button disabled={!form.content || submit.isPending} onClick={() => submit.mutate(form)}>提交（导师待办自动提醒）</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 导师批阅 */}
      <Dialog open={!!fbFor} onOpenChange={(o) => !o && setFbFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>批阅周报 — {fbFor?.weekStart} 周</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-sm bg-secondary/60 px-3 py-2 text-[13px] whitespace-pre-wrap">{fbFor?.content}</div>
            <Field label="评语" required>
              <Textarea rows={4} value={fbText} onChange={(e) => setFbText(e.target.value)} placeholder="本周工作评价、下周要求…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFbFor(null)}>取消</Button>
              <Button disabled={!fbText || feedback.isPending} onClick={() => feedback.mutate({ id: fbFor!.id, feedback: fbText, feedbackFileIds: [] })}>发送评语（学生待办自动提醒）</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ 子栏目 3：文档提交与导师反馈 ============
function SharesPanel({ ov, editable, isSelf, mentorView, onChanged }: { ov: Overview; editable: boolean; isSelf: boolean; mentorView: boolean; onChanged: () => void }) {
  const { data: mentors } = trpc.mentors.options.useQuery();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareForm, setShareForm] = useState<{ type: string; title: string; content: string; fileIds: number[]; toUserIds: number[] }>({
    type: "weekly", title: "", content: "", fileIds: [], toUserIds: [],
  });
  const [fbFor, setFbFor] = useState<Share | null>(null);
  const [fbForm, setFbForm] = useState<{ feedback: string; fileIds: number[] }>({ feedback: "", fileIds: [] });

  const submitShare = trpc.docShares.submit.useMutation({
    onSuccess: () => {
      onChanged();
      setShareOpen(false);
      setShareForm({ type: "weekly", title: "", content: "", fileIds: [], toUserIds: [] });
      alert("已提交，导师的待办事项中已生成批阅提醒。");
    },
    onError: (e) => alert(e.message),
  });
  const feedback = trpc.docShares.feedback.useMutation({
    onSuccess: () => {
      onChanged();
      setFbFor(null);
      setFbForm({ feedback: "", fileIds: [] });
      alert("已反馈，学生的待办事项中已生成提醒。");
    },
    onError: (e) => alert(e.message),
  });

  return (
    <div>
      {isSelf && editable && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setShareOpen(true)}><Send className="mr-1 h-3.5 w-3.5" />提交文档给导师</Button>
        </div>
      )}
      {ov.shares.length === 0 ? <EmptyState text="暂无文档提交记录。学生可提交论文初稿/PPT 初稿/报告等，导师批阅后反馈。" /> : (
        <div className="space-y-3">
          {ov.shares.map((s) => (
            <div key={s.id} className="rounded-md border border-border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill text={DOC_SHARE_TYPE_LABELS[s.type] ?? s.type} tone="purple" />
                    <span className="text-[14px] font-semibold">{s.title}</span>
                    {s.status === "feedback" ? <Pill text="导师已反馈" tone="green" /> : <Pill text="待导师批阅" tone="amber" />}
                  </div>
                  <div className="mt-1 text-[12px] text-muted-foreground">
                    提交人：{s.studentName} · {new Date(s.createdAt).toLocaleString("zh-CN")}
                    {s.toUserNames?.length ? ` · 送达：${s.toUserNames.join("、")}` : ""}
                  </div>
                  {s.content && <div className="mt-1.5 whitespace-pre-wrap text-[13px]">{s.content}</div>}
                  {s.fileIds.length > 0 && <div className="mt-2"><FileChips ids={s.fileIds} /></div>}
                  {s.status === "feedback" && (
                    <div className="mt-2 rounded-sm border border-emerald-800/30 bg-emerald-900/10 px-3 py-2">
                      <div className="text-[12px] font-medium text-emerald-900 dark:text-emerald-200">
                        导师反馈（{s.feedbackByName} · {s.feedbackAt ? new Date(s.feedbackAt).toLocaleString("zh-CN") : ""}）
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-[13px]">{s.feedback}</div>
                      {s.feedbackFileIds && s.feedbackFileIds.length > 0 && <div className="mt-2"><FileChips ids={s.feedbackFileIds} /></div>}
                    </div>
                  )}
                </div>
                {mentorView && s.status === "submitted" && editable && (
                  <Button size="sm" variant="outline" onClick={() => { setFbFor(s); setFbForm({ feedback: "", fileIds: [] }); }}>
                    <MessageSquareReply className="mr-1 h-3.5 w-3.5" />批阅并反馈
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 提交文档给导师 */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>提交过程文档给导师</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="文档类型">
                <Select value={shareForm.type} onValueChange={(v) => setShareForm({ ...shareForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_SHARE_TYPES.map((t) => <SelectItem key={t} value={t}>{DOC_SHARE_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="标题" required>
                <Input value={shareForm.title} onChange={(e) => setShareForm({ ...shareForm, title: e.target.value })} placeholder="如：论文初稿 v1" />
              </Field>
            </div>
            <Field label="正文说明">
              <Textarea rows={3} value={shareForm.content} onChange={(e) => setShareForm({ ...shareForm, content: e.target.value })} placeholder="本次提交的内容要点、希望导师重点关注的问题…" />
            </Field>
            <Field label="送达导师（可多选）" required>
              <div className="flex flex-wrap gap-3 rounded-sm border border-border px-3 py-2">
                {(mentors ?? []).map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <Checkbox
                      checked={shareForm.toUserIds.includes(m.id)}
                      onCheckedChange={(ck) =>
                        setShareForm({
                          ...shareForm,
                          toUserIds: ck ? [...shareForm.toUserIds, m.id] : shareForm.toUserIds.filter((id) => id !== m.id),
                        })
                      }
                    />
                    {m.name}{m.title ? `（${m.title}）` : ""}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="附件（过程文档：Word / PPT / PDF / LaTeX 包，单文件 ≤ 50MB）">
              <FileUpload module="training" aiScanOption onUploaded={(fid) => setShareForm((f) => ({ ...f, fileIds: [...f.fileIds, fid] }))} />
              {shareForm.fileIds.length > 0 && <div className="mt-1"><FileChips ids={shareForm.fileIds} /></div>}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareOpen(false)}>取消</Button>
              <Button
                disabled={!shareForm.title || shareForm.toUserIds.length === 0 || submitShare.isPending}
                onClick={() => submitShare.mutate({ ...shareForm, type: shareForm.type as "weekly" })}
              >
                <Send className="mr-1 h-3.5 w-3.5" />提交（导师待办自动提醒）
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 导师批阅反馈 */}
      <Dialog open={!!fbFor} onOpenChange={(o) => !o && setFbFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>批阅并反馈 — {fbFor?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {fbFor?.content && <div className="rounded-sm bg-secondary/60 px-3 py-2 text-[13px]">{fbFor.content}</div>}
            {fbFor && fbFor.fileIds.length > 0 && <FileChips ids={fbFor.fileIds} />}
            <Field label="反馈简报（批注意见）" required>
              <Textarea rows={4} value={fbForm.feedback} onChange={(e) => setFbForm({ ...fbForm, feedback: e.target.value })} placeholder="修改意见、下一步要求…" />
            </Field>
            <Field label="反馈附件（批注版文档等）">
              <FileUpload module="training" onUploaded={(fid) => setFbForm((f) => ({ ...f, fileIds: [...f.fileIds, fid] }))} />
              {fbForm.fileIds.length > 0 && <div className="mt-1"><FileChips ids={fbForm.fileIds} /></div>}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFbFor(null)}>取消</Button>
              <Button disabled={!fbForm.feedback || feedback.isPending} onClick={() => feedback.mutate({ id: fbFor!.id, feedback: fbForm.feedback, feedbackFileIds: fbForm.fileIds })}>
                发送反馈（学生待办自动提醒）
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ 子栏目 4：档案节点成果 ============
function ArchivePanel({ ov, editable, isSelf, onChanged }: { ov: Overview; editable: boolean; isSelf: boolean; onChanged: () => void }) {
  const [nodeEdit, setNodeEdit] = useState<Partial<Node> | null>(null);
  const upsert = trpc.trainingNodes.upsert.useMutation({ onSuccess: () => { onChanged(); setNodeEdit(null); }, onError: (e) => alert(e.message) });
  const removeNode = trpc.trainingNodes.remove.useMutation({ onSuccess: onChanged });
  const nodeOf = (t: string) => ov.nodes.find((n) => n.nodeType === t);

  return (
    <div className="space-y-4">
      {/* 培养档案节点时间线 */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[14px] font-semibold">培养档案节点</div>
          {(editable || isSelf) && (
            <Button variant="outline" size="sm" onClick={() => setNodeEdit({ nodeType: "开题", status: "pending" })}>
              <Plus className="mr-1 h-3.5 w-3.5" />登记节点
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {TRAINING_NODE_TYPES.map((t) => {
            const n = nodeOf(t);
            return (
              <button
                key={t}
                onClick={() => (editable || isSelf) && setNodeEdit(n ?? { nodeType: t, status: "pending" })}
                className={`rounded-md border px-3.5 py-2.5 text-left transition-colors ${n?.status === "done" ? "border-emerald-700/40 bg-emerald-900/10" : "border-border bg-secondary/40"} ${editable || isSelf ? "hover:border-primary/60" : "cursor-default"}`}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  {t}
                  {n ? (n.status === "done" ? <Pill text="已完成" tone="green" /> : <Pill text="待完成" tone="amber" />) : <span className="text-[11px] text-muted-foreground">未登记</span>}
                </div>
                {n?.date && <div className="mt-0.5 tabular-nums text-[11px] text-muted-foreground">{n.date}</div>}
                {n?.note && <div className="mt-0.5 max-w-40 truncate text-[11px] text-muted-foreground">{n.note}</div>}
                {n?.fileIds && n.fileIds.length > 0 && <div className="mt-1"><FileChips ids={n.fileIds} /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 成果 */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-[14px] font-semibold">成果（按姓名/参与关系自动归集）</div>
        {ov.achievements.length === 0 && ov.papers.length === 0 ? (
          <EmptyState text="暂无归集成果。成果管理中的条目按作者姓名、投稿论文按牵头/参与人自动归集到此处。" />
        ) : (
          <div className="space-y-2">
            {ov.papers.map((p) => (
              <div key={`p${p.id}`} className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-[13px]">
                <Pill text="投稿论文" tone="blue" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                <span className="text-[12px] text-muted-foreground">{p.journal ?? ""}</span>
                <Pill text={PAPER_STATUS_LABELS[p.status] ?? p.status} tone="gray" />
              </div>
            ))}
            {ov.achievements.map((a) => (
              <div key={`a${a.id}`} className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-[13px]">
                <Pill text={(ACHIEVEMENT_CATEGORY_LABELS as Record<string, string>)[a.category] ?? a.category} tone="purple" />
                <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                <span className="text-[12px] text-muted-foreground">{a.authors ?? ""}</span>
                <span className="tabular-nums text-[12px] text-muted-foreground">{a.date ?? a.year}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 节点登记/编辑 */}
      <Dialog open={!!nodeEdit} onOpenChange={(o) => !o && setNodeEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{nodeEdit?.id ? "编辑培养节点" : "登记培养节点"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="节点类型" required>
                <Select value={nodeEdit?.nodeType ?? "开题"} onValueChange={(v) => setNodeEdit({ ...nodeEdit, nodeType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAINING_NODE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="日期"><Input type="date" value={nodeEdit?.date ?? ""} onChange={(e) => setNodeEdit({ ...nodeEdit, date: e.target.value })} /></Field>
              <Field label="状态">
                <Select value={nodeEdit?.status ?? "pending"} onValueChange={(v) => setNodeEdit({ ...nodeEdit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pending">待完成</SelectItem><SelectItem value="done">已完成</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="备注"><Input value={nodeEdit?.note ?? ""} onChange={(e) => setNodeEdit({ ...nodeEdit, note: e.target.value })} /></Field>
            <Field label="佐证材料（开题报告/中期报告/答辩决议等，单文件 ≤ 50MB）">
              <FileUpload module="training" onUploaded={(fid) => setNodeEdit((n) => ({ ...n, fileIds: [...(n?.fileIds ?? []), fid] }))} />
              {nodeEdit?.fileIds && nodeEdit.fileIds.length > 0 && <div className="mt-1"><FileChips ids={nodeEdit.fileIds} /></div>}
            </Field>
            <div className="flex justify-between">
              <div>
                {nodeEdit?.id && editable && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("删除该节点记录？")) { removeNode.mutate({ id: nodeEdit.id! }); setNodeEdit(null); } }}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />删除
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setNodeEdit(null)}>取消</Button>
                <Button onClick={() => upsert.mutate({
                  id: nodeEdit?.id,
                  studentId: ov.student.id,
                  nodeType: (nodeEdit?.nodeType ?? "开题") as "开题",
                  date: nodeEdit?.date ?? "",
                  status: (nodeEdit?.status ?? "pending") as "pending",
                  note: nodeEdit?.note ?? "",
                  fileIds: nodeEdit?.fileIds ?? [],
                })}>保存</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
