// 2.5 审稿情况：AI 解析稿件 + 推荐审稿人 + 指派截止 + 自动生成待办
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { exportXlsx } from "@/lib/helpers";
import { Plus, Pencil, Trash2, Download, Sparkles, UserCheck, CheckCircle2 } from "lucide-react";

type Assignment = { reviewerId: number; reviewerName: string; deadline: string; status: "pending" | "done" };
type Row = {
  id: number; title: string; authors: string | null; direction: string | null; keywords: string | null;
  journal: string | null; fileId: number | null; status: string; assignments: Assignment[]; note: string | null;
};
const REVIEW_STATUS: Record<string, string> = { pending: "待分配", assigned: "已分配", in_review: "审稿中", done: "已完成" };

export default function Reviews() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.reviews.list.useQuery();
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [assigning, setAssigning] = useState<Row | null>(null);
  const [deadlines, setDeadlines] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const editable = can("research.reviews", "editable");

  const create = trpc.reviews.create.useMutation({ onSuccess: () => utils.reviews.list.invalidate() });
  const update = trpc.reviews.update.useMutation({ onSuccess: () => utils.reviews.list.invalidate() });
  const remove = trpc.reviews.remove.useMutation({ onSuccess: () => utils.reviews.list.invalidate() });
  const assign = trpc.reviews.assign.useMutation({ onSuccess: () => { utils.reviews.list.invalidate(); setAssigning(null); alert("已指派审稿人，系统已在对应审稿人及管理员看板生成待办。"); } });
  const completeAssignment = trpc.reviews.completeAssignment.useMutation({ onSuccess: () => utils.reviews.list.invalidate() });
  const [recommendFor, setRecommendFor] = useState<number | null>(null);
  const recommend = trpc.reviews.recommend.useQuery({ id: recommendFor! }, { enabled: recommendFor !== null });

  function save() {
    if (!editing?.title) return;
    const payload = { title: editing.title, authors: editing.authors ?? "", direction: editing.direction ?? "", keywords: editing.keywords ?? "", journal: editing.journal ?? "", fileId: editing.fileId ?? undefined, note: editing.note ?? "" };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader title="审稿情况" sub="上传稿件自动解析 → AI 推荐审稿人 → 设置审稿周期 → 自动生成审稿待办"
        actions={<>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("审稿情况", "审稿", (data ?? []).map((r) => ({ 稿件: r.title, 方向: r.direction, 期刊: r.journal, 状态: REVIEW_STATUS[r.status], 审稿人: r.assignments.map((a) => `${a.reviewerName}(${a.deadline})`).join("、") })))}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
          {editable && <Button size="sm" onClick={() => setEditing({})}><Plus className="mr-1 h-3.5 w-3.5" />新增待审稿件</Button>}
        </>} />
      {!data?.length ? <EmptyState /> : (
        <div className="space-y-3">
          {data.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold">{r.title}</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">
                    {r.journal && <span className="mr-2">{r.journal}</span>}
                    {r.direction && <span className="mr-2">方向：{r.direction}</span>}
                    {r.keywords && <span>关键词：{r.keywords}</span>}
                  </div>
                </div>
                <Pill text={REVIEW_STATUS[r.status] ?? r.status} tone={r.status === "done" ? "green" : r.status === "in_review" ? "blue" : "amber"} />
              </div>
              {r.fileId && <div className="mt-2"><FileChips ids={[r.fileId]} /></div>}
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 text-[12px] font-medium text-muted-foreground">审稿人（{r.assignments.length}）</div>
                {r.assignments.length === 0 ? <div className="text-[12px] text-muted-foreground">尚未指派</div> : (
                  <div className="space-y-1.5">
                    {r.assignments.map((a) => (
                      <div key={a.reviewerId} className="flex items-center gap-3 text-[13px]">
                        <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{a.reviewerName}</span>
                        <span className="tabular-nums text-muted-foreground">截止 {a.deadline}</span>
                        <Pill text={a.status === "done" ? "已完成" : "审稿中"} tone={a.status === "done" ? "green" : "amber"} />
                        {editable && a.status !== "done" && (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => completeAssignment.mutate({ id: r.id, reviewerId: a.reviewerId })}>
                            <CheckCircle2 className="mr-1 h-3 w-3" />标记完成
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {editable && (
                <div className="mt-3 flex justify-end gap-2 border-t border-border pt-2">
                  <Button variant="outline" size="sm" onClick={() => { setAssigning(r); setRecommendFor(r.id); setSelected([]); setDeadlines({}); }}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />推荐并指派审稿人
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button>
                  {can("research.reviews", "manage") && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: r.id })}><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑稿件 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑稿件" : "新增待审稿件"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editing?.id && (
              <Field label="拖拽上传稿件（自动扫描给出信息建议）">
                <FileUpload module="review" onUploaded={(fid) => setEditing((e) => ({ ...e, fileId: fid }))} />
              </Field>
            )}
            {editing?.id && editing.fileId && <Field label="稿件附件"><FileChips ids={[editing.fileId]} /></Field>}
            <Field label="稿件题目" required><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="作者"><Input value={editing?.authors ?? ""} onChange={(e) => setEditing({ ...editing, authors: e.target.value })} /></Field>
              <Field label="期刊 / 会议"><Input value={editing?.journal ?? ""} onChange={(e) => setEditing({ ...editing, journal: e.target.value })} /></Field>
              <Field label="研究方向"><Input value={editing?.direction ?? ""} onChange={(e) => setEditing({ ...editing, direction: e.target.value })} /></Field>
              <Field label="关键词"><Input value={editing?.keywords ?? ""} onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} /></Field>
            </div>
            <Field label="备注"><Textarea rows={2} value={editing?.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.title} onClick={save}>保存</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 推荐审稿人 + 指派 */}
      <Dialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>指派审稿人 — {assigning?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-[12px] text-muted-foreground">基于系统内用户的科研方向、投稿情况自动匹配推荐（可人工调整）：</div>
            {recommend.isLoading && <div className="py-6 text-center text-[13px] text-muted-foreground">正在匹配候选审稿人…</div>}
            {recommend.data?.map((c) => (
              <div key={c.userId} className="flex items-center gap-3 rounded-sm border border-border px-3 py-2">
                <Checkbox checked={selected.includes(c.userId)} onCheckedChange={() => setSelected((s) => s.includes(c.userId) ? s.filter((x) => x !== c.userId) : [...s, c.userId])} />
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{c.name} <span className="ml-1 text-[11px] text-muted-foreground">{c.role}</span></div>
                  <div className="text-[12px] text-muted-foreground">{c.direction || "未填写研究方向"}{c.matched.length > 0 && <span className="ml-2 text-primary">命中：{c.matched.join("、")}</span>}</div>
                </div>
                <Pill text={`匹配度 ${c.score}`} tone={c.score >= 70 ? "green" : "gray"} />
                {selected.includes(c.userId) && (
                  <Input type="date" className="w-36" value={deadlines[c.userId] ?? ""} onChange={(e) => setDeadlines({ ...deadlines, [c.userId]: e.target.value })} />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAssigning(null)}>取消</Button>
              <Button
                disabled={selected.length === 0 || selected.some((id) => !deadlines[id])}
                onClick={() => assign.mutate({ id: assigning!.id, assignments: selected.map((reviewerId) => ({ reviewerId, deadline: deadlines[reviewerId] })) })}
              >确认指派并生成待办</Button>
            </div>
            {selected.some((id) => !deadlines[id]) && <div className="text-right text-[12px] text-amber-800">请为每位审稿人设置审稿截止日期</div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
