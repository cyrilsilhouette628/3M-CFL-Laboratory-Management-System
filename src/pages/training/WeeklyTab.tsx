// 需求 16：研究生周报页签
// 仅研究生提交；教师/博士后/管理员只审阅；按时间倒序，默认展开最近四周，更早的折叠
import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { Pill, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Send, MessageSquareReply } from "lucide-react";

type WeeklyReport = {
  id: number; studentId: number; studentName: string | null; weekStart: string;
  content: string; plan: string | null; problems: string | null; fileIds: number[];
  status: string; feedback: string | null; feedbackFileIds: number[] | null;
  studentReply: string | null; studentReplyAt: Date | null;
  feedbackByName: string | null; feedbackAt: Date | null; createdAt: Date;
};

function mondayOf(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export default function WeeklyTab() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isGrad = user?.role === "grad";
  const mentorView = !!user && (user.isAdmin || ["super_admin", "teacher", "postdoc"].includes(user.role));

  const listQuery = trpc.weekly.list.useQuery();
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [submitOpen, setSubmitOpen] = useState(false);
  const [form, setForm] = useState({ weekStart: mondayOf(new Date()), content: "", plan: "", problems: "", fileIds: [] as number[] });
  const [fbFor, setFbFor] = useState<WeeklyReport | null>(null);
  const [fbForm, setFbForm] = useState({ feedback: "", fileIds: [] as number[] });
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const submit = trpc.weekly.submit.useMutation({
    onSuccess: () => {
      utils.weekly.list.invalidate();
      setSubmitOpen(false);
      setForm({ weekStart: mondayOf(new Date()), content: "", plan: "", problems: "", fileIds: [] });
      alert("周报已提交，导师的待办事项中已生成审阅提醒。");
    },
    onError: (e) => alert(e.message),
  });
  const feedback = trpc.weekly.feedback.useMutation({
    onSuccess: () => {
      utils.weekly.list.invalidate();
      setFbFor(null);
      setFbForm({ feedback: "", fileIds: [] });
      alert("已批阅，学生的待办事项中已生成提醒。");
    },
    onError: (e) => alert(e.message),
  });

  const reply = trpc.weekly.reply.useMutation({
    onSuccess: () => {
      utils.weekly.list.invalidate();
      setReplyFor(null);
      setReplyText("");
      alert("二次反馈已提交，导师将收到待办提醒。");
    },
    onError: (e) => alert(e.message),
  });

  const reports = (listQuery.data ?? []) as WeeklyReport[];
  // 最近四周的周一集合（默认展开范围）
  const recentMondays = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - 7 * i);
      set.add(mondayOf(d));
    }
    return set;
  }, []);
  const isOpen = (r: WeeklyReport) => !(collapsed[r.id] ?? !recentMondays.has(r.weekStart));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground">
          {isGrad
            ? "学生视图：仅研究生需提交周报；提交后导师将收到待办提醒"
            : mentorView
              ? "教师视图：可审阅名下研究生的周报并填写评语；学生将收到待办提醒"
              : "周报仅面向研究生；博士后/实习生/本科生无需提交"}
        </div>
        {isGrad && (
          <Button size="sm" onClick={() => setSubmitOpen(true)}>
            <Send className="mr-1 h-3.5 w-3.5" />提交本周周报
          </Button>
        )}
      </div>

      {reports.length === 0 ? (
        <EmptyState text="暂无周报记录" />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const open = isOpen(r);
            return (
              <div key={r.id} className="rounded-md border border-border bg-card">
                <button
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
                  onClick={() => setCollapsed((c) => ({ ...c, [r.id]: open ? true : false }))}
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="tabular-nums text-[13px] font-medium">{r.weekStart} 周</span>
                  <span className="text-[13px] text-muted-foreground">{r.studentName}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <Pill text={r.status === "reviewed" ? "已批阅" : "待批阅"} tone={r.status === "reviewed" ? "green" : "amber"} />
                    {mentorView && r.status === "submitted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFbFor(r);
                        }}
                      >
                        <MessageSquareReply className="mr-1 h-3.5 w-3.5" />批阅
                      </Button>
                    )}
                  </span>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-border px-4 py-3 text-[13px]">
                    <div>
                      <div className="mb-0.5 text-[12px] font-medium text-muted-foreground">本周进展</div>
                      <div className="whitespace-pre-wrap">{r.content}</div>
                    </div>
                    {r.plan && (
                      <div>
                        <div className="mb-0.5 text-[12px] font-medium text-muted-foreground">下周计划</div>
                        <div className="whitespace-pre-wrap">{r.plan}</div>
                      </div>
                    )}
                    {r.problems && (
                      <div>
                        <div className="mb-0.5 text-[12px] font-medium text-muted-foreground">遇到的问题</div>
                        <div className="whitespace-pre-wrap">{r.problems}</div>
                      </div>
                    )}
                    {r.fileIds.length > 0 && <FileChips ids={r.fileIds} />}
                    {r.feedback && (
                      <div className="rounded-sm bg-accent/60 px-3 py-2">
                        <div className="mb-0.5 text-[12px] font-medium text-muted-foreground">
                          导师评语（{r.feedbackByName}）
                        </div>
                        <div className="whitespace-pre-wrap">{r.feedback}</div>
                        {r.feedbackFileIds && r.feedbackFileIds.length > 0 && (
                          <div className="mt-1"><FileChips ids={r.feedbackFileIds} /></div>
                        )}
                      </div>
                    )}
                    {r.studentReply && (
                      <div className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2">
                        <div className="mb-0.5 text-[12px] font-medium text-primary">学生二次反馈{r.studentReplyAt ? `（${new Date(r.studentReplyAt).toLocaleString("zh-CN")}）` : ""}</div>
                        <div className="whitespace-pre-wrap">{r.studentReply}</div>
                      </div>
                    )}
                    {isGrad && r.studentId === user?.id && r.status === "reviewed" && !r.studentReply && (
                      <div className="rounded-sm border border-border p-3">
                        {replyFor === r.id ? (
                          <div className="space-y-2">
                            <Textarea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="针对导师评语补充说明、反馈落实情况或提出新的问题…" />
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => { setReplyFor(null); setReplyText(""); }}>取消</Button>
                              <Button size="sm" disabled={!replyText.trim() || reply.isPending} onClick={() => reply.mutate({ id: r.id, content: replyText.trim() })}>提交二次反馈</Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setReplyFor(r.id)}><MessageSquareReply className="mr-1 h-3.5 w-3.5" />回复导师评语</Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 提交周报 */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>提交周报</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="周起始日（周一）" required>
              <Input type="date" value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: e.target.value })} />
            </Field>
            <Field label="本周进展" required>
              <Textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="本周完成的工作、实验结果、论文进展…" />
            </Field>
            <Field label="下周计划">
              <Textarea rows={2} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
            </Field>
            <Field label="遇到的问题">
              <Textarea rows={2} value={form.problems} onChange={(e) => setForm({ ...form, problems: e.target.value })} />
            </Field>
            <Field label="附件">
              <FileUpload module="weekly" compact onUploaded={(id) => setForm((f) => ({ ...f, fileIds: [...f.fileIds, id] }))} />
              {form.fileIds.length > 0 && <div className="mt-1.5"><FileChips ids={form.fileIds} /></div>}
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setSubmitOpen(false)}>取消</Button>
              <Button disabled={submit.isPending || !form.content} onClick={() => submit.mutate(form)}>提交</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 导师批阅 */}
      <Dialog open={!!fbFor} onOpenChange={(o) => !o && setFbFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>批阅周报 —— {fbFor?.studentName}（{fbFor?.weekStart} 周）</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-sm bg-accent/60 px-3 py-2 text-[13px] whitespace-pre-wrap">{fbFor?.content}</div>
            <Field label="评语" required>
              <Textarea rows={4} value={fbForm.feedback} onChange={(e) => setFbForm({ ...fbForm, feedback: e.target.value })} placeholder="肯定进展、指出问题、下周要求…" />
            </Field>
            <Field label="批注附件">
              <FileUpload module="weekly" compact onUploaded={(id) => setFbForm((f) => ({ ...f, fileIds: [...f.fileIds, id] }))} />
              {fbForm.fileIds.length > 0 && <div className="mt-1.5"><FileChips ids={fbForm.fileIds} /></div>}
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFbFor(null)}>取消</Button>
              <Button disabled={feedback.isPending || !fbForm.feedback} onClick={() => fbFor && feedback.mutate({ id: fbFor.id, feedback: fbForm.feedback, feedbackFileIds: fbForm.fileIds })}>提交批阅</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
