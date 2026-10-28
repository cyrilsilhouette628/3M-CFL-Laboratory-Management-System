// 模块一：待办事项（今日 / 本周 / 本月 / 全部）
import { useMemo, useState, useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { useNavigate, useSearchParams } from "react-router";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRIORITY_LABELS, TODO_SOURCE_LABELS, TODO_CATEGORY_TREE } from "@contracts/constants";
import { exportXlsx, todayStr } from "@/lib/helpers";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Plus, Pin, Trash2, Pencil, Download , SquareArrowOutUpRight } from "lucide-react";

type TodoRow = {
  id: number; title: string; description: string | null; priority: string; dueDate: string | null;
  status: string; pinned: boolean; creatorId: number; creatorName: string | null;
  leaderIds: number[]; participantIds: number[]; source: string; overdue: boolean; link?: string | null;
  attachmentFileIds: number[] | null; category?: string | null; // V5 需求 6：属性（一级/二级标题）
};

export default function Todos() {
  const { user, can } = useAuth();
  const utils = trpc.useUtils();
  const { data: todos } = trpc.todos.list.useQuery();
  const { data: userOptions } = trpc.users.options.useQuery();
  const [tab, setTab] = useState("today");
  const [catFilter, setCatFilter] = useState<string>(""); // V5 需求 6：按属性（一级标题）筛选
  const [editing, setEditing] = useState<Partial<TodoRow> | null>(null);
  // V6 需求 C-3：从仪表盘跳入 /todos?focus=<id> 时高亮定位该待办
  const [params] = useSearchParams();
  const focusId = Number(params.get("focus") ?? 0);
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (focusId) setTimeout(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  }, [focusId]);

  const create = trpc.todos.create.useMutation({ onSuccess: () => utils.todos.list.invalidate() });
  const update = trpc.todos.update.useMutation({ onSuccess: () => utils.todos.list.invalidate() });
  const navigate = useNavigate();
  const toggle = trpc.todos.toggle.useMutation({ onSuccess: () => utils.todos.list.invalidate() });
  const remove = trpc.todos.remove.useMutation({ onSuccess: () => utils.todos.list.invalidate() });

  const filtered = useMemo(() => {
    if (!todos) return [];
    const today = todayStr();
    const d = new Date();
    const weekEnd = new Date(d); weekEnd.setDate(d.getDate() + (7 - d.getDay() || 7));
    const we = weekEnd.toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);
    let list = todos as TodoRow[];
    if (catFilter) list = list.filter((t) => (t.category ?? "").startsWith(catFilter));
    if (tab === "today") return list.filter((t) => t.status === "pending" && (t.dueDate === today || t.pinned || t.overdue));
    if (tab === "week") return list.filter((t) => t.status === "pending" && t.dueDate && t.dueDate <= we);
    if (tab === "month") return list.filter((t) => t.dueDate?.startsWith(monthPrefix));
    return list;
  }, [todos, tab, catFilter]);

  function save() {
    if (!editing?.title) return;
    if (editing.id) {
      update.mutate({
        id: editing.id, title: editing.title, description: editing.description ?? undefined,
        priority: editing.priority as "low" | "medium" | "high" | "urgent",
        dueDate: editing.dueDate || null, pinned: !!editing.pinned,
        leaderIds: editing.leaderIds ?? [], participantIds: editing.participantIds ?? [],
        attachmentFileIds: editing.attachmentFileIds ?? [],
        category: editing.category || null,
      });
    } else {
      create.mutate({
        title: editing.title, description: editing.description ?? undefined,
        priority: (editing.priority as "low" | "medium" | "high" | "urgent") ?? "medium",
        dueDate: editing.dueDate || undefined, pinned: !!editing.pinned,
        leaderIds: editing.leaderIds ?? [], participantIds: editing.participantIds ?? [],
        attachmentFileIds: editing.attachmentFileIds ?? [],
        category: editing.category || undefined,
      });
    }
    setEditing(null);
  }

  function toggleAssignee(key: "leaderIds" | "participantIds", id: number) {
    if (!editing) return;
    const cur = (editing[key] as number[] | undefined) ?? [];
    setEditing({ ...editing, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  }

  const nameOf = (id: number) => userOptions?.find((u) => u.id === id)?.name ?? `#${id}`;

  return (
    <div>
      <PageHeader
        title="待办事项"
        sub="按登录用户隔离：每人只见自己的待办；管理员可指派牵头人与参与人；其他模块任务自动流入"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportXlsx("待办事项", "待办", (todos ?? []).map((t) => ({ 标题: t.title, 优先级: PRIORITY_LABELS[t.priority], 截止: t.dueDate, 状态: t.status === "done" ? "已完成" : "待办", 来源: TODO_SOURCE_LABELS[t.source] })))}>
              <Download className="mr-1 h-3.5 w-3.5" /> 导出 Excel
            </Button>
            <Button size="sm" onClick={() => setEditing({ priority: "medium", leaderIds: [user!.id], participantIds: [] })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> 新建待办
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="today">今日待办</TabsTrigger>
          <TabsTrigger value="week">本周待办</TabsTrigger>
          <TabsTrigger value="month">本月待办</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* V5 需求 6：按属性（一级标题）筛选 */}
      <div className="mb-3 flex items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">属性筛选：</span>
        <Select value={catFilter || "__all"} onValueChange={(v) => setCatFilter(v === "__all" ? "" : v)}>
          <SelectTrigger className="h-7 w-44 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">全部属性</SelectItem>
            {TODO_CATEGORY_TREE.map((g) => <SelectItem key={g.first} value={g.first}>{g.first}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? <EmptyState text="当前视图下没有待办事项" /> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead>
              <tr><th className="w-10"></th><th>事项</th><th>属性</th><th>优先级</th><th>截止</th><th>牵头人</th><th>参与人</th><th>来源</th><th>状态</th><th className="w-20">操作</th></tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} ref={t.id === focusId ? focusRef : undefined}
                  className={`${t.status === "done" ? "opacity-50" : ""} ${t.id === focusId ? "bg-primary/10 ring-2 ring-inset ring-primary/40" : ""}`}>
                  <td>
                    <Checkbox checked={t.status === "done"} onCheckedChange={(v) => toggle.mutate({ id: t.id, done: !!v })} />
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {t.pinned && <Pin className="h-3 w-3 text-amber-700" />}
                      <span className={t.status === "done" ? "line-through" : "font-medium"}>{t.title}</span>
                    </div>
                    {t.description && <div className="mt-0.5 text-[12px] text-muted-foreground">{t.description}</div>}
                    {t.attachmentFileIds && t.attachmentFileIds.length > 0 && (
                      <div className="mt-1"><FileChips ids={t.attachmentFileIds} /></div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-[12px]">{t.category ? <Pill text={t.category} tone="purple" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td><Pill text={PRIORITY_LABELS[t.priority]} tone={t.priority === "urgent" ? "red" : t.priority === "high" ? "amber" : "gray"} /></td>
                  <td className="tabular-nums whitespace-nowrap">
                    {t.dueDate ?? "—"}
                    {t.overdue && <Pill text="逾期" tone="red" />}
                  </td>
                  <td className="whitespace-nowrap">{t.leaderIds.map(nameOf).join("、")}</td>
                  <td className="whitespace-nowrap">{t.participantIds.map(nameOf).join("、") || "—"}</td>
                  <td><Pill text={TODO_SOURCE_LABELS[t.source] ?? t.source} tone={t.source === "manual" ? "gray" : "blue"} /></td>
                  <td><Pill text={t.status === "done" ? "已完成" : "待办"} tone={t.status === "done" ? "green" : "amber"} /></td>
                  <td className="whitespace-nowrap">
                    {(t as { link?: string | null }).link && (
                      <button
                        title="前往处理（跳转到对应模块）"
                        className="mr-2 text-primary hover:text-primary/70"
                        onClick={() => navigate((t as { link?: string | null }).link!)}
                      >
                        <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></button>
                    {can("todo.list", "manage") && (
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => confirm("确认删除该待办？") && remove.mutate({ id: t.id })}><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑待办" : "新建待办"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="事项标题" required><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="详细描述"><Textarea value={editing?.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="优先级">
                <Select value={editing?.priority ?? "medium"} onValueChange={(v) => setEditing({ ...editing, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="截止日期"><Input type="date" value={editing?.dueDate ?? ""} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} /></Field>
            </div>
            {/* V5 需求 6：属性（一级标题/二级标题），可人工添加或修改 */}
            <Field label="属性（对应模块一级/二级标题）">
              <div className="flex gap-2">
                <Select
                  value={editing?.category?.split("/")[0] ?? "__none"}
                  onValueChange={(v) => setEditing({ ...editing, category: v === "__none" ? null : v })}
                >
                  <SelectTrigger className="w-36"><SelectValue placeholder="一级标题" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">（无属性）</SelectItem>
                    {TODO_CATEGORY_TREE.map((g) => <SelectItem key={g.first} value={g.first}>{g.first}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(() => {
                  const first = editing?.category?.split("/")[0] ?? "";
                  const seconds = TODO_CATEGORY_TREE.find((g) => g.first === first)?.seconds ?? [];
                  if (seconds.length === 0) return null;
                  return (
                    <Select
                      value={editing?.category?.includes("/") ? editing.category.split("/")[1] : "__none"}
                      onValueChange={(v) => setEditing({ ...editing, category: v === "__none" ? first : `${first}/${v}` })}
                    >
                      <SelectTrigger className="w-40"><SelectValue placeholder="二级标题" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">（仅一级）</SelectItem>
                        {seconds.map((sec) => <SelectItem key={sec} value={sec}>{sec}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={!!editing?.pinned} onCheckedChange={(v) => setEditing({ ...editing, pinned: !!v })} /> 置顶（始终出现在今日待办）
            </label>
            <Field label="附件">
              <FileUpload
                module="todo"
                compact
                onUploaded={(id) => setEditing((cur) => cur ? { ...cur, attachmentFileIds: [...(cur.attachmentFileIds ?? []), id] } : cur)}
              />
              {editing?.attachmentFileIds && editing.attachmentFileIds.length > 0 && (
                <div className="mt-1.5"><FileChips ids={editing.attachmentFileIds} /></div>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[12px] font-medium text-muted-foreground">牵头人</div>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
                  {userOptions?.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-[13px]">
                      <Checkbox checked={(editing?.leaderIds ?? []).includes(u.id)} onCheckedChange={() => toggleAssignee("leaderIds", u.id)} /> {u.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[12px] font-medium text-muted-foreground">参与人</div>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
                  {userOptions?.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-[13px]">
                      <Checkbox checked={(editing?.participantIds ?? []).includes(u.id)} onCheckedChange={() => toggleAssignee("participantIds", u.id)} /> {u.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
              <Button onClick={save}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
