// 科研项目管理（V4：合并原「科研项目进度」+「科研经费管理」；需求 6/12/13）
// 页签：项目看板（纵向/横向统一）/ 经费管理 / 结题项目
// 节点模板：立项 → 中期检查 → 结题 → 审计；合同文本（立项合同/获批通知书等）入库
import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field, Money } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { PROJECT_STATUS_LABELS, exportXlsx } from "@/lib/helpers";
import { PROJECT_CATEGORY_LABELS, PROJECT_NODE_TYPES } from "@contracts/constants";
import { Link } from "react-router";
import Funds from "@/pages/research/Funds";
import { Plus, Trash2, Pencil, Download, Sparkles, ChevronUp, ChevronDown, List } from "lucide-react";

type NodeType = "立项" | "中期检查" | "结题" | "审计";
type Milestone = { name: string; date: string; status: "pending" | "done"; note?: string; nodeType?: NodeType; fileIds?: number[] };
type Project = {
  id: number; name: string; code: string | null; source: string | null; leader: string | null;
  leaderId: number | null; participantIds: number[];
  startDate: string | null; endDate: string | null; totalBudget: number; receivedAmount: number;
  status: string; description: string | null; milestones: Milestone[]; daysLeft: number | null;
  category: string; contractFileIds: number[];
  // V6 需求 2：成果归集（本项目资助的成果，按资助排名排序）
  outputs?: { id: number; outputType: string; outputId: number; ord: number; title: string; typeLabel: string; yearOrDate: string; link: string }[];
};

// 节点模板：按项目生命周期生成常用节点（需求 6）
function milestoneTemplate(startDate?: string, endDate?: string): Milestone[] {
  const mid = startDate && endDate
    ? new Date((new Date(startDate).getTime() + new Date(endDate).getTime()) / 2).toISOString().slice(0, 10)
    : "";
  return [
    { name: "立项（合同/获批通知书入库）", date: startDate ?? "", status: "pending", nodeType: "立项" },
    { name: "中期检查", date: mid, status: "pending", nodeType: "中期检查" },
    { name: "结题验收", date: endDate ?? "", status: "pending", nodeType: "结题" },
    { name: "经费审计", date: endDate ?? "", status: "pending", nodeType: "审计" },
  ];
}

export default function Projects() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.projects.list.useQuery();
  const { data: userOptions } = trpc.users.options.useQuery();
  const concludedQuery = trpc.projects.concluded.useQuery();
  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const [catFilter, setCatFilter] = useState<"all" | "vertical" | "horizontal">("all");
  const editable = can("research.projects", "editable");

  // V7 标注 3：项目看板折叠状态（localStorage 记忆，下次打开自动恢复）
  const [collapsedCards, setCollapsedCards] = useState<Record<number, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("lab-collapsed-projects") ?? "{}"); } catch { return {}; }
  });
  useEffect(() => {
    localStorage.setItem("lab-collapsed-projects", JSON.stringify(collapsedCards));
  }, [collapsedCards]);

  // V7 标注 2：项目总览锚点跳转（滚动定位 + 短暂高亮）
  const [hlId, setHlId] = useState<number | null>(null);
  function jumpTo(id: number) {
    document.getElementById(`project-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHlId(id);
    window.setTimeout(() => setHlId((cur) => (cur === id ? null : cur)), 1800);
  }

  const create = trpc.projects.create.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const update = trpc.projects.update.useMutation({ onSuccess: () => { utils.projects.list.invalidate(); utils.projects.concluded.invalidate(); } });
  const toggleMs = trpc.projects.toggleMilestone.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const remove = trpc.projects.remove.useMutation({ onSuccess: () => { utils.projects.list.invalidate(); utils.projects.concluded.invalidate(); } });

  function save() {
    if (!editing?.name) return;
    const payload = {
      name: editing.name, code: editing.code ?? "", source: editing.source ?? "", leader: editing.leader ?? "",
      leaderId: editing.leaderId ?? undefined, participantIds: editing.participantIds ?? [],
      startDate: editing.startDate ?? "", endDate: editing.endDate ?? "",
      totalBudget: editing.totalBudget ?? 0, receivedAmount: editing.receivedAmount ?? 0,
      status: (editing.status ?? "ongoing") as "ongoing", description: editing.description ?? "",
      milestones: (editing.milestones ?? []) as Milestone[],
      category: (editing.category ?? "vertical") as "vertical",
      contractFileIds: editing.contractFileIds ?? [],
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  const filtered = (data ?? []).filter((p) => catFilter === "all" || p.category === catFilter);

  return (
    <div>
      <PageHeader
        title="科研项目管理"
        sub="纵向/横向项目统一管理：立项·中期·结题·审计节点模板，合同文书入库，经费台账内嵌（需求 6/12/13）"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportXlsx("科研项目", "项目", (data ?? []).map((p) => ({ 名称: p.name, 类别: PROJECT_CATEGORY_LABELS[p.category] ?? p.category, 编号: p.code, 来源: p.source, 负责人: p.leader, 起: p.startDate, 止: p.endDate, 总经费: p.totalBudget, 已到账: p.receivedAmount, 状态: PROJECT_STATUS_LABELS[p.status] })))}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
            {editable && <Button size="sm" onClick={() => setEditing({ status: "ongoing", milestones: [], totalBudget: 0, receivedAmount: 0, category: "vertical", contractFileIds: [] })}><Plus className="mr-1 h-3.5 w-3.5" />新建项目</Button>}
          </>
        }
      />

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">项目看板</TabsTrigger>
          <TabsTrigger value="funds">经费管理</TabsTrigger>
          <TabsTrigger value="concluded">结题项目（{concludedQuery.data?.length ?? 0}）</TabsTrigger>
        </TabsList>

        {/* ============ 项目看板 ============ */}
        <TabsContent value="board">
          {/* 纵向/横向筛选 */}
          <div className="mb-3 flex gap-1.5">
            {([["all", "全部"], ["vertical", "纵向项目"], ["horizontal", "横向项目/技术合作"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setCatFilter(k)}
                className={`rounded-sm border px-2.5 py-1 text-[12px] transition-colors ${catFilter === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* V7 标注 2：项目总览列表 —— 概要 + 超链接跳转至对应项目看板 */}
          {filtered.length > 0 && (
            <div className="mb-4 rounded-md border border-border bg-card">
              <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[12px] font-medium text-muted-foreground">
                <List className="h-3.5 w-3.5" /> 项目总览（{filtered.length}）
                <span className="font-normal text-muted-foreground/70">点击项目名称跳转到对应看板</span>
              </div>
              <ul className="divide-y divide-border">
                {filtered.map((p) => {
                  const rate = Math.min(100, Math.round((p.receivedAmount / (p.totalBudget || 1)) * 100));
                  const doneMs = p.milestones.filter((m) => m.status === "done").length;
                  return (
                    <li key={p.id} className="flex items-center gap-2.5 px-3 py-1.5 text-[12.5px]">
                      <button
                        onClick={() => jumpTo(p.id)}
                        title={`跳转到「${p.name}」项目看板`}
                        className="min-w-0 flex-1 truncate text-left font-medium text-primary hover:underline"
                      >
                        {p.name}
                      </button>
                      <Pill text={PROJECT_CATEGORY_LABELS[p.category] ?? "纵向项目"} tone={p.category === "horizontal" ? "purple" : "gray"} />
                      <span className="hidden shrink-0 text-muted-foreground md:inline">{p.leader ?? "—"}</span>
                      <span className="hidden shrink-0 tabular-nums text-muted-foreground lg:inline">{p.startDate ?? "—"} ~ {p.endDate ?? "—"}</span>
                      <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">节点 {doneMs}/{p.milestones.length}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">到账 {rate}%</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">成果 {p.outputs?.length ?? 0}</span>
                      <Pill text={PROJECT_STATUS_LABELS[p.status] ?? p.status} tone={p.status === "concluded" ? "green" : "blue"} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!filtered.length ? <EmptyState text="暂无科研项目" /> : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filtered.map((p) => {
                const total = p.totalBudget || 1;
                const arriveRate = Math.min(100, Math.round((p.receivedAmount / total) * 100));
                const start = p.startDate ? new Date(p.startDate).getTime() : 0;
                const end = p.endDate ? new Date(p.endDate).getTime() : 0;
                const now = Date.now();
                const pct = (t: number) => (end > start ? Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100)) : 0);
                const isC = !!collapsedCards[p.id];
                return (
                  <div
                    key={p.id}
                    id={`project-card-${p.id}`}
                    className={`scroll-mt-20 rounded-md border bg-card p-4 transition-shadow ${hlId === p.id ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold leading-6">{p.name}</span>
                          <Pill text={PROJECT_CATEGORY_LABELS[p.category] ?? "纵向项目"} tone={p.category === "horizontal" ? "purple" : "gray"} />
                        </div>
                        <div className="mt-1 text-[12px] text-muted-foreground">{p.code} · {p.source} · 负责人：{p.leader}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Pill text={PROJECT_STATUS_LABELS[p.status] ?? p.status} tone={p.status === "concluded" ? "green" : "blue"} />
                        {p.daysLeft !== null && p.status !== "concluded" && (
                          <Pill text={p.daysLeft >= 0 ? `结题倒计时 ${p.daysLeft} 天` : `已超期 ${-p.daysLeft} 天`} tone={p.daysLeft < 90 ? "red" : "amber"} />
                        )}
                        {/* V7 标注 3：折叠/展开该看板（状态自动记忆） */}
                        <button
                          onClick={() => setCollapsedCards((c) => ({ ...c, [p.id]: !c[p.id] }))}
                          title={isC ? "展开该项目看板" : "折叠该项目看板（下次打开保持折叠）"}
                          aria-expanded={!isC}
                          className="rounded-sm border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {isC ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* V7 标注 3：折叠态仅保留一行概要 */}
                    {isC && (
                      <div className="mt-2 text-[12px] tabular-nums text-muted-foreground">
                        经费到账 {arriveRate}% · 节点 {p.milestones.filter((m) => m.status === "done").length}/{p.milestones.length} · 成果 {p.outputs?.length ?? 0} 项
                      </div>
                    )}

                    {!isC && (<>
                    {/* 甘特条 */}
                    {start > 0 && end > 0 && (
                      <div className="mt-3">
                        <div className="relative h-2.5 rounded-full bg-secondary">
                          <div className="absolute inset-y-0 left-0 rounded-full bg-primary/70" style={{ width: `${pct(now)}%` }} />
                          {p.milestones.map((m, i) => (
                            <span key={i} title={`${m.nodeType ? `[${m.nodeType}] ` : ""}${m.name} ${m.date}`} className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card ${m.status === "done" ? "bg-emerald-700" : "bg-amber-600"}`} style={{ left: `${pct(new Date(m.date).getTime())}%` }} />
                          ))}
                        </div>
                        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground"><span>{p.startDate}</span><span>{p.endDate}</span></div>
                      </div>
                    )}

                    {/* 里程碑（节点类型 + 文书附件） */}
                    <div className="mt-3 space-y-1">
                      {p.milestones.map((m, i) => (
                        <div key={i}>
                          <label className="flex items-center gap-2 text-[13px]">
                            <Checkbox disabled={!editable} checked={m.status === "done"} onCheckedChange={(v) => toggleMs.mutate({ id: p.id, index: i, done: !!v })} />
                            {m.nodeType && <Pill text={m.nodeType} tone="gray" />}
                            <span className={m.status === "done" ? "text-muted-foreground line-through" : ""}>{m.name}</span>
                            <span className="text-[12px] tabular-nums text-muted-foreground">{m.date}</span>
                          </label>
                          {m.fileIds && m.fileIds.length > 0 && <div className="ml-7 mt-0.5"><FileChips ids={m.fileIds} /></div>}
                        </div>
                      ))}
                    </div>

                    {/* 合同文书（需求 6：立项合同/获批通知书入库） */}
                    {p.contractFileIds.length > 0 && (
                      <div className="mt-3 border-t border-border pt-2">
                        <div className="mb-1 text-[12px] font-medium text-muted-foreground">合同与获批文书</div>
                        <FileChips ids={p.contractFileIds} />
                      </div>
                    )}

                    {/* 经费概览 */}
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="mb-1 flex justify-between text-[12px] text-muted-foreground">
                        <span>经费到账</span>
                        <span><Money n={p.receivedAmount} /> / <Money n={p.totalBudget} /> 元（{arriveRate}%）</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-emerald-800/70" style={{ width: `${arriveRate}%` }} /></div>
                    </div>

                    {/* V6 需求 2：成果归集 —— 本项目资助的论文/专利/软著等成果（按资助排名） */}
                    <div className="mt-3 border-t border-border pt-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-muted-foreground">成果归集（{p.outputs?.length ?? 0}）</span>
                        {(p.outputs?.length ?? 0) === 0 && <span className="text-[11px] text-muted-foreground/70">在论文/成果条目中勾选本项目即可归集</span>}
                      </div>
                      {(p.outputs ?? []).length > 0 && (
                        <ul className="space-y-1">
                          {p.outputs.map((o) => (
                            <li key={o.id} className="flex items-center gap-2 text-[12px]">
                              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary tabular-nums">{o.ord}</span>
                              <Pill text={o.typeLabel} tone="gray" />
                              <Link to={o.link} className="min-w-0 flex-1 truncate text-primary hover:underline" title={o.title}>{o.title}</Link>
                              <span className="shrink-0 tabular-nums text-muted-foreground">{o.yearOrDate}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {editable && (
                      <div className="mt-3 flex justify-end gap-2 border-t border-border pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(p)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button>
                        {can("research.projects", "manage") && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除该项目？") && remove.mutate({ id: p.id })}><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button>}
                      </div>
                    )}
                    </>)}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============ 经费管理（内嵌） ============ */}
        <TabsContent value="funds">
          <Funds embedded />
        </TabsContent>

        {/* ============ 结题项目列表（需求 12） ============ */}
        <TabsContent value="concluded">
          {!concludedQuery.data?.length ? <EmptyState text="暂无结题项目" /> : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="data-table">
                <thead>
                  <tr><th>项目名称</th><th>类别</th><th>编号</th><th>负责人</th><th>起止</th><th>总经费</th><th>合同文书</th></tr>
                </thead>
                <tbody>
                  {(concludedQuery.data as Project[]).map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td><Pill text={PROJECT_CATEGORY_LABELS[p.category] ?? "纵向项目"} tone={p.category === "horizontal" ? "purple" : "gray"} /></td>
                      <td className="tabular-nums">{p.code ?? "—"}</td>
                      <td>{p.leader ?? "—"}</td>
                      <td className="whitespace-nowrap tabular-nums text-[12px]">{p.startDate ?? "—"} ~ {p.endDate ?? "—"}</td>
                      <td className="tabular-nums"><Money n={p.totalBudget} /> 元</td>
                      <td>{p.contractFileIds.length > 0 ? <FileChips ids={p.contractFileIds} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑项目" : "新建项目"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <div className="col-span-2"><Field label="项目名称" required><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field></div>
            <Field label="项目类别" required>
              <Select value={editing?.category ?? "vertical"} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="项目编号"><Input value={editing?.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></Field>
            <Field label="经费来源"><Input value={editing?.source ?? ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} /></Field>
            <Field label="负责人" required>
              <Select value={editing?.leaderId ? String(editing.leaderId) : ""} onValueChange={(v) => { const id = Number(v); const u = userOptions?.find((x) => x.id === id); setEditing({ ...editing, leaderId: id, leader: u?.name ?? editing?.leader }); }}>
                <SelectTrigger><SelectValue placeholder="选择项目牵头人" /></SelectTrigger>
                <SelectContent>{userOptions?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="状态">
              <Select value={editing?.status ?? "ongoing"} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="开始日期"><Input type="date" value={editing?.startDate ?? ""} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} /></Field>
            <Field label="结题日期"><Input type="date" value={editing?.endDate ?? ""} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} /></Field>
            <Field label="总经费（元）"><Input type="number" value={editing?.totalBudget ?? 0} onChange={(e) => setEditing({ ...editing, totalBudget: Number(e.target.value) })} /></Field>
            <Field label="已到账（元）"><Input type="number" value={editing?.receivedAmount ?? 0} onChange={(e) => setEditing({ ...editing, receivedAmount: Number(e.target.value) })} /></Field>
            <div className="col-span-2"><Field label="项目参与人（仅牵头人与参与人可见）">
              <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto rounded-sm border border-border p-2 md:grid-cols-3">
                {userOptions?.filter((u) => u.id !== editing?.leaderId).map((u) => <label key={u.id} className="flex items-center gap-2 text-[12px]"><Checkbox checked={(editing?.participantIds ?? []).includes(u.id)} onCheckedChange={(ck) => setEditing({ ...editing, participantIds: ck ? [...(editing?.participantIds ?? []), u.id] : (editing?.participantIds ?? []).filter((id) => id !== u.id) })} />{u.name}</label>)}
              </div>
            </Field></div>
            <div className="col-span-2"><Field label="项目描述"><Textarea rows={2} value={editing?.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field></div>
            <div className="col-span-2">
              <Field label="合同与获批文书（立项合同 / 获批通知书扫描件）">
                <FileUpload module="project" compact onUploaded={(id) => setEditing((cur) => cur ? { ...cur, contractFileIds: [...(cur.contractFileIds ?? []), id] } : cur)} />
                {editing?.contractFileIds && editing.contractFileIds.length > 0 && (
                  <div className="mt-1.5"><FileChips ids={editing.contractFileIds} /></div>
                )}
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="里程碑节点（立项 / 中期检查 / 结题 / 审计）">
                <MilestoneEditor
                  value={(editing?.milestones ?? []) as Milestone[]}
                  onChange={(ms) => setEditing({ ...editing, milestones: ms })}
                  onTemplate={() => setEditing({ ...editing, milestones: milestoneTemplate(editing?.startDate ?? undefined, editing?.endDate ?? undefined) })}
                />
              </Field>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MilestoneEditor({ value, onChange, onTemplate }: { value: Milestone[]; onChange: (v: Milestone[]) => void; onTemplate: () => void }) {
  return (
    <div className="space-y-2">
      {value.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={m.nodeType ?? "none"} onValueChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, nodeType: (v === "none" ? undefined : v) as NodeType | undefined } : x))}>
            <SelectTrigger className="w-32"><SelectValue placeholder="节点类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">普通节点</SelectItem>
              {PROJECT_NODE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="flex-1" placeholder="节点名称" value={m.name} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
          <Input type="date" className="w-40" value={m.date} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
          <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onChange([...value, { name: "", date: "", status: "pending" }])}><Plus className="mr-1 h-3.5 w-3.5" />添加节点</Button>
        <Button variant="outline" size="sm" onClick={onTemplate}><Sparkles className="mr-1 h-3.5 w-3.5" />按模板生成（立项→中期→结题→审计）</Button>
      </div>
    </div>
  );
}
