// 投稿论文进度（V4 需求 8）：状态看板 + 投稿轮次状态机（已投稿→外审→拒稿/待修→修改重投→…→录用）+ 拒稿清单
// 投稿阶段的流转通过【投稿轮次】登记决议驱动；录用后（在线发表/检索）仍用「流转」按钮
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PAPER_STATUS_FLOW, PAPER_STATUS_LABELS, PAPER_ROUND_STATUS_LABELS } from "@contracts/constants";
import { exportXlsx } from "@/lib/helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ui2";
import { FundingEditor, FundingChips, type Funding } from "@/components/FundingEditor";
import { Link } from "react-router";
import { Plus, Pencil, Trash2, Download, ArrowRight, Sparkles, History, Gavel, BookCheck } from "lucide-react";

type Row = {
  id: number; title: string; authors: string | null; journal: string | null; targetTier: string | null;
  status: string; submitDate: string | null; doi: string | null; fileId: number | null;
  leaderId: number; leaderName: string; participantIds: number[]; participantNames: string[]; note: string | null;
  achievementId: number | null; fundings: Funding[];
};

export default function Papers() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.papers.list.useQuery();
  const { data: userOptions } = trpc.users.options.useQuery();
  type EditRow = Partial<Row> & { fundingProjectIds?: number[] };
  const [editing, setEditing] = useState<EditRow | null>(null);
  const editable = can("research.papers", "editable");

  const create = trpc.papers.create.useMutation({ onSuccess: () => utils.papers.list.invalidate() });
  const update = trpc.papers.update.useMutation({ onSuccess: () => utils.papers.list.invalidate() });
  const advance = trpc.papers.advanceStatus.useMutation({ onSuccess: () => utils.papers.list.invalidate() });
  const remove = trpc.papers.remove.useMutation({ onSuccess: () => utils.papers.list.invalidate() });
  const [aiNote, setAiNote] = useState("");

  function save() {
    if (!editing?.title || !editing?.leaderId) return;
    const payload = {
      title: editing.title, authors: editing.authors ?? "", journal: editing.journal ?? "",
      targetTier: editing.targetTier ?? "", status: (editing.status ?? "writing") as "writing",
      submitDate: editing.submitDate ?? "", doi: editing.doi ?? "", fileId: editing.fileId ?? undefined,
      leaderId: editing.leaderId, participantIds: editing.participantIds ?? [], note: editing.note ?? "",
      fundingProjectIds: editing.fundingProjectIds ?? editing.fundings?.map((f) => f.projectId) ?? [],
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
    setAiNote("");
  }

  const columns = PAPER_STATUS_FLOW.map((s) => ({ status: s, items: (data ?? []).filter((p) => p.status === s) }));
  const [roundsFor, setRoundsFor] = useState<Row | null>(null);
  const rejectQuery = trpc.paperRounds.rejectList.useQuery();

  return (
    <div>
      <PageHeader title="投稿论文进度" sub="投稿轮次状态机：已投稿 → 外审 → 拒稿/待修 → 修改重投（新一轮）→ …→ 录用 → 在线发表 → 检索；拒稿论文自动进入拒稿清单"
        actions={<>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("投稿论文", "论文", (data ?? []).map((p) => ({ 题目: p.title, 作者: p.authors, 期刊: p.journal, 分区: p.targetTier, 状态: PAPER_STATUS_LABELS[p.status], 牵头人: p.leaderName, 参与者: p.participantNames.join("、") })))}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
          {editable && <Button size="sm" onClick={() => { setEditing({ status: "writing", participantIds: [] }); setAiNote(""); }}><Plus className="mr-1 h-3.5 w-3.5" />添加论文</Button>}
        </>} />
      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">状态看板</TabsTrigger>
          <TabsTrigger value="rejected">拒稿清单（{rejectQuery.data?.length ?? 0}）</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
      {!data?.length ? <EmptyState text="暂无投稿论文" /> : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <div key={col.status} className="w-64 shrink-0 rounded-md border border-border bg-secondary/30">
              <div className="border-b border-border px-3 py-2 text-[13px] font-semibold">
                {PAPER_STATUS_LABELS[col.status]} <span className="ml-1 text-muted-foreground">({col.items.length})</span>
              </div>
              <div className="space-y-2 p-2">
                {col.items.map((p) => (
                  <div key={p.id} className="rounded-sm border border-border bg-card p-2.5">
                    <div className="text-[13px] font-medium leading-5">{p.title}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">{p.journal || "未定期刊"}{p.targetTier ? ` · ${p.targetTier}` : ""}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">牵头：{p.leaderName}{p.participantNames.length > 0 && ` · 参与：${p.participantNames.join("、")}`}</div>
                    {p.fundings?.length > 0 && <div className="mt-1"><FundingChips fundings={p.fundings} /></div>}
                    {p.achievementId && (
                      <div className="mt-1">
                        <Link to="/achievements/papers" className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-800 hover:underline" title="已自动登记到 成果管理·已发表论文">
                          <BookCheck className="h-3.5 w-3.5" /> 已转成果（#{p.achievementId}）→
                        </Link>
                      </div>
                    )}
                    {p.fileId && <div className="mt-1.5"><FileChips ids={[p.fileId]} /></div>}
                    {editable && (
                      <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5">
                        <div className="flex gap-1">
                          <button title="投稿轮次" className="text-muted-foreground hover:text-primary" onClick={() => setRoundsFor(p)}><History className="h-3.5 w-3.5" /></button>
                          <button className="text-muted-foreground hover:text-foreground" onClick={() => { setEditing(p); setAiNote(""); }}><Pencil className="h-3.5 w-3.5" /></button>
                          {can("research.papers", "manage") && <button className="text-muted-foreground hover:text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: p.id })}><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                        {col.status !== "indexed" && (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => advance.mutate({ id: p.id })}>
                            流转 <ArrowRight className="ml-0.5 h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {col.items.length === 0 && <div className="py-4 text-center text-[12px] text-muted-foreground">—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
        </TabsContent>

        {/* ============ 拒稿清单（需求 8：详细记录被拒论文） ============ */}
        <TabsContent value="rejected">
          {!rejectQuery.data?.length ? <EmptyState text="暂无拒稿记录" /> : (
            <div className="space-y-3">
              {((rejectQuery.data ?? []) as unknown as (Row & { rejectedRounds: Round[] })[]).map((p) => (
                <div key={p.id} className="rounded-md border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-semibold">{p.title}</div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">{p.authors} · 牵头：{p.leaderName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill text={`被拒 ${p.rejectedRounds.length} 次`} tone="red" />
                      <Pill text={PAPER_STATUS_LABELS[p.status] ?? p.status} tone="blue" />
                    </div>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {p.rejectedRounds.map((r) => (
                      <div key={r.id} className="rounded-sm border border-red-800/20 bg-red-700/5 px-3 py-2 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">第 {r.round} 轮 · {r.venue}</span>
                          <span className="tabular-nums text-muted-foreground">投稿 {r.submittedAt} · 拒稿 {r.decisionAt ?? "—"}</span>
                        </div>
                        {r.decisionNote && <div className="mt-1 whitespace-pre-wrap text-muted-foreground">拒稿意见：{r.decisionNote}</div>}
                      </div>
                    ))}
                  </div>
                  {editable && ["rejected", "writing"].includes(p.status) && (
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => setRoundsFor(p)}>修改后重投（新一轮）→</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 投稿轮次 Dialog */}
      {roundsFor && <RoundsDialog paper={roundsFor} onClose={() => setRoundsFor(null)} />}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setAiNote(""); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑论文" : "添加投稿论文"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editing?.id && (
              <Field label="拖拽上传论文 PDF（后台扫描自动给出填写建议，人工确认后入库）">
                <FileUpload module="paper" onUploaded={(fid, fname) => {
                  setEditing((e) => ({ ...e, fileId: fid }));
                  setAiNote(`已上传 ${fname}，AI 扫描建议已生成（见首页"待确认 AI 解析"），请在下方核对字段后保存。`);
                }} />
              </Field>
            )}
            {aiNote && <div className="flex items-start gap-2 rounded-sm border border-amber-700/30 bg-amber-600/5 px-3 py-2 text-[12px]"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />{aiNote}</div>}
            {editing?.id && editing.fileId && <Field label="稿件附件"><FileChips ids={[editing.fileId]} /></Field>}
            <Field label="论文题目" required><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="作者"><Input value={editing?.authors ?? ""} onChange={(e) => setEditing({ ...editing, authors: e.target.value })} /></Field>
              <Field label="期刊 / 会议"><Input value={editing?.journal ?? ""} onChange={(e) => setEditing({ ...editing, journal: e.target.value })} /></Field>
              <Field label="目标分区"><Input value={editing?.targetTier ?? ""} onChange={(e) => setEditing({ ...editing, targetTier: e.target.value })} placeholder="如 CCF-A / 中科院一区" /></Field>
              <Field label="当前状态">
                <Select value={editing?.status ?? "writing"} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAPER_STATUS_FLOW.map((s) => <SelectItem key={s} value={s}>{PAPER_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="投稿日期"><Input type="date" value={editing?.submitDate ?? ""} onChange={(e) => setEditing({ ...editing, submitDate: e.target.value })} /></Field>
              <Field label="DOI"><Input value={editing?.doi ?? ""} onChange={(e) => setEditing({ ...editing, doi: e.target.value })} /></Field>
              <div className="col-span-2">
                <div className="mb-1 text-[12px] font-medium text-muted-foreground">资助项目（勾选已入库项目；获批号自动带出；排序即资助排名，第 1 位为第一资助）</div>
                <FundingEditor
                  value={editing?.fundingProjectIds ?? editing?.fundings?.map((f) => f.projectId) ?? []}
                  onChange={(ids) => setEditing({ ...editing, fundingProjectIds: ids, fundings: undefined })}
                />
              </div>
              <Field label="牵头人" required>
                <Select value={editing?.leaderId ? String(editing.leaderId) : ""} onValueChange={(v) => setEditing({ ...editing, leaderId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="选择牵头人" /></SelectTrigger>
                  <SelectContent>{userOptions?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div>
                <div className="mb-1 text-[12px] font-medium text-muted-foreground">参与者</div>
                <div className="flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-y-auto rounded-sm border border-border p-2">
                  {userOptions?.map((u) => (
                    <label key={u.id} className="flex items-center gap-1.5 text-[12px]">
                      <Checkbox checked={(editing?.participantIds ?? []).includes(u.id)} onCheckedChange={() => {
                        const cur = editing?.participantIds ?? [];
                        setEditing({ ...editing, participantIds: cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id] });
                      }} /> {u.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <Field label="备注"><Textarea rows={2} value={editing?.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.title || !editing?.leaderId} onClick={save}>确认入库</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


type Round = {
  id: number; paperId: number; round: number; venue: string; submittedAt: string;
  status: string; decisionAt: string | null; decisionNote: string | null; fileIds: number[];
  createdByName: string | null;
};

// 投稿轮次管理：发起投稿 → 登记外审/待修/拒稿/录用决议 → 拒稿后可再发起新一轮
function RoundsDialog({ paper, onClose }: { paper: Row; onClose: () => void }) {
  const utils = trpc.useUtils();
  const roundsQuery = trpc.paperRounds.list.useQuery({ paperId: paper.id });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ venue: paper.journal ?? "", submittedAt: new Date().toISOString().slice(0, 10), fileIds: [] as number[] });
  const [deciding, setDeciding] = useState<Round | null>(null);
  const [decForm, setDecForm] = useState({ decision: "under_review", decisionAt: new Date().toISOString().slice(0, 10), decisionNote: "", fileIds: [] as number[] });

  const invalidate = () => { utils.paperRounds.list.invalidate(); utils.papers.list.invalidate(); utils.paperRounds.rejectList.invalidate(); };
  const addRound = trpc.paperRounds.add.useMutation({ onSuccess: () => { invalidate(); setAdding(false); }, onError: (e) => alert(e.message) });
  const decide = trpc.paperRounds.decide.useMutation({ onSuccess: () => { invalidate(); setDeciding(null); }, onError: (e) => alert(e.message) });

  const rounds = (roundsQuery.data ?? []) as Round[];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>投稿轮次 —— {paper.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[12px] text-muted-foreground">流程：已投稿 → 外审 → 拒稿/待修 → 修改重投（新一轮）→ … → 录用；当前状态：{PAPER_STATUS_LABELS[paper.status] ?? paper.status}</div>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 h-3.5 w-3.5" />发起新一轮投稿</Button>
          </div>

          {rounds.length === 0 ? <EmptyState text="尚无投稿轮次，点击「发起新一轮投稿」开始记录" /> : (
            <div className="space-y-2">
              {rounds.map((r) => (
                <div key={r.id} className="rounded-sm border border-border bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-medium">第 {r.round} 轮 · {r.venue}</div>
                    <div className="flex items-center gap-2">
                      <Pill text={PAPER_ROUND_STATUS_LABELS[r.status as keyof typeof PAPER_ROUND_STATUS_LABELS] ?? r.status}
                        tone={r.status === "rejected" ? "red" : r.status === "accepted" ? "green" : r.status === "revision" ? "amber" : "blue"} />
                      {["submitted", "under_review", "revision"].includes(r.status) && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => { setDeciding(r); setDecForm({ decision: r.status === "submitted" ? "under_review" : "revision", decisionAt: new Date().toISOString().slice(0, 10), decisionNote: "", fileIds: [] }); }}>
                          <Gavel className="mr-1 h-3 w-3" />登记决议
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">
                    投稿 {r.submittedAt}{r.decisionAt ? ` · 决议 ${r.decisionAt}` : ""} · 记录人 {r.createdByName ?? "—"}
                  </div>
                  {r.decisionNote && <div className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{r.decisionNote}</div>}
                  {r.fileIds.length > 0 && <div className="mt-1"><FileChips ids={r.fileIds} /></div>}
                </div>
              ))}
            </div>
          )}

          {/* 发起新一轮 */}
          {adding && (
            <div className="space-y-2 rounded-sm border border-primary/30 bg-primary/5 p-3">
              <div className="text-[13px] font-medium">发起第 {(rounds[0]?.round ?? 0) + 1} 轮投稿</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="期刊 / 会议" required><Input value={addForm.venue} onChange={(e) => setAddForm({ ...addForm, venue: e.target.value })} /></Field>
                <Field label="投稿日期" required><Input type="date" value={addForm.submittedAt} onChange={(e) => setAddForm({ ...addForm, submittedAt: e.target.value })} /></Field>
              </div>
              <Field label="当轮稿件附件">
                <FileUpload module="paper" compact onUploaded={(fid) => setAddForm((f2) => ({ ...f2, fileIds: [...f2.fileIds, fid] }))} />
                {addForm.fileIds.length > 0 && <div className="mt-1"><FileChips ids={addForm.fileIds} /></div>}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAdding(false)}>取消</Button>
                <Button size="sm" disabled={!addForm.venue || addRound.isPending} onClick={() => addRound.mutate({ paperId: paper.id, ...addForm })}>确认投稿</Button>
              </div>
            </div>
          )}

          {/* 登记决议 */}
          {deciding && (
            <div className="space-y-2 rounded-sm border border-amber-700/30 bg-amber-600/5 p-3">
              <div className="text-[13px] font-medium">登记第 {deciding.round} 轮决议（{deciding.venue}）</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="决议" required>
                  <Select value={decForm.decision} onValueChange={(v) => setDecForm({ ...decForm, decision: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under_review">送外审</SelectItem>
                      <SelectItem value="revision">待修（退修）</SelectItem>
                      <SelectItem value="rejected">拒稿</SelectItem>
                      <SelectItem value="accepted">录用</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="决议日期"><Input type="date" value={decForm.decisionAt} onChange={(e) => setDecForm({ ...decForm, decisionAt: e.target.value })} /></Field>
              </div>
              <Field label="决议意见（拒稿理由 / 修改意见摘要）">
                <Textarea rows={3} value={decForm.decisionNote} onChange={(e) => setDecForm({ ...decForm, decisionNote: e.target.value })} />
              </Field>
              <Field label="审稿意见 / 修改稿附件">
                <FileUpload module="paper" compact onUploaded={(fid) => setDecForm((f2) => ({ ...f2, fileIds: [...f2.fileIds, fid] }))} />
                {decForm.fileIds.length > 0 && <div className="mt-1"><FileChips ids={decForm.fileIds} /></div>}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeciding(null)}>取消</Button>
                <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: deciding.id, decision: decForm.decision as "under_review", decisionAt: decForm.decisionAt, decisionNote: decForm.decisionNote, fileIds: decForm.fileIds })}>保存决议</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
