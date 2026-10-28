// 首页仪表盘：按当前登录用户聚合展示
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState } from "@/components/ui2";
import { TODO_SOURCE_LABELS, PRIORITY_LABELS } from "@contracts/constants";
import { Link } from "react-router";
import { useState } from "react";
import { AlertTriangle, CalendarClock, Inbox, FolderKanban, FileUp, Trophy, GraduationCap, Sparkles, FileCheck2, MessageSquareText, Globe, Link2, Plus, Pencil, X, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
      <span className={`flex h-9 w-9 items-center justify-center rounded-sm ${tone}`}>{icon}</span>
      <div>
        <div className="text-2xl font-semibold tabular-nums leading-7">{value}</div>
        <div className="text-[12px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data } = trpc.dashboard.summary.useQuery();

  if (!data) return <div className="py-20 text-center text-muted-foreground">加载中…</div>;
  const c = data.counts;

  return (
    <div>
      <PageHeader title={`${user?.name}，欢迎回来`} sub="按当前登录用户聚合：逾期提醒、本周事项、来源待办、在研项目与成果动态" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-red-800" />} label="逾期待办" value={c.overdue} tone="bg-red-700/10" />
        <StatCard icon={<CalendarClock className="h-4 w-4 text-amber-800" />} label="今日到期" value={c.today} tone="bg-amber-600/10" />
        <StatCard icon={<Inbox className="h-4 w-4 text-sky-900" />} label="来源待办（自动流入）" value={c.source} tone="bg-sky-700/10" />
        <StatCard icon={<FolderKanban className="h-4 w-4 text-emerald-900" />} label="在研项目" value={c.ongoingProjects} tone="bg-emerald-900/10" />
        <StatCard icon={<FileUp className="h-4 w-4 text-purple-900" />} label="在审论文" value={c.inReviewPapers} tone="bg-purple-700/10" />
        <StatCard icon={<Trophy className="h-4 w-4 text-amber-800" />} label="本年成果" value={c.monthNewAchievements} tone="bg-amber-600/10" />
        <StatCard icon={<GraduationCap className="h-4 w-4 text-sky-900" />} label="学生节点提醒" value={data.nodeAlerts.length} tone="bg-sky-700/10" />
        <StatCard icon={<Sparkles className="h-4 w-4 text-emerald-900" />} label="待确认 AI 解析" value={c.aiPending} tone="bg-emerald-900/10" />
        <StatCard icon={<FileCheck2 className="h-4 w-4 text-indigo-900" />} label="待我批阅的文档" value={c.docToReview ?? 0} tone="bg-indigo-700/10" />
        <StatCard icon={<MessageSquareText className="h-4 w-4 text-teal-900" />} label="导师新反馈" value={c.docFeedback ?? 0} tone="bg-teal-700/10" />
        <StatCard icon={<Globe className="h-4 w-4 text-cyan-900" />} label="待推送网站更新" value={c.websitePending ?? 0} tone="bg-cyan-700/10" />
        {(c.weeklyToReview ?? 0) > 0 && (
          <StatCard icon={<FileCheck2 className="h-4 w-4 text-purple-900" />} label="待批阅周报" value={c.weeklyToReview ?? 0} tone="bg-purple-700/10" />
        )}
      </div>
      {user?.role === "grad" && data.myWeekSubmitted === false && (
        <div className="mt-3 rounded-md border border-amber-700/30 bg-amber-600/5 px-4 py-2.5 text-[13px] text-amber-800">
          本周周报尚未提交，<Link to="/training/grads?tab=weekly" className="font-medium text-primary hover:underline">前往提交 →</Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center justify-between text-[14px] font-semibold">
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-red-800" /> 逾期与今日到期</span>
            <Link to="/todos" className="text-[12px] font-normal text-primary hover:underline">进入待办 →</Link>
          </h3>
          {data.overdue.length === 0 && data.todayTodos.length === 0 ? <EmptyState text="没有逾期或今日到期的待办" /> : (
            <ul className="divide-y divide-border">
              {data.overdue.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                  {/* V6 需求 C-3：条目必可点 —— 有来源链接跳来源页，否则跳待办页并高亮定位 */}
                  <Link to={(t as { link?: string | null }).link ?? `/todos?focus=${t.id}`} className="truncate text-primary hover:underline">{t.title}</Link>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Pill text="已逾期" tone="red" /><Pill text={PRIORITY_LABELS[t.priority]} tone="amber" />
                  </span>
                </li>
              ))}
              {data.todayTodos.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                  <Link to={(t as { link?: string | null }).link ?? `/todos?focus=${t.id}`} className="truncate text-primary hover:underline">{t.pinned ? "📌 " : ""}{t.title}</Link>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Pill text="今日" tone="blue" /><Pill text={TODO_SOURCE_LABELS[t.source] ?? t.source} tone="gray" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold"><CalendarClock className="h-4 w-4 text-amber-800" /> 本周关键事项</h3>
          {data.weekTodos.length === 0 ? <EmptyState text="本周暂无到期事项" /> : (
            <ul className="divide-y divide-border">
              {data.weekTodos.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                  <Link to={(t as { link?: string | null }).link ?? `/todos?focus=${t.id}`} className="truncate text-primary hover:underline">{t.title}</Link>
                  <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">{t.dueDate}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold"><Inbox className="h-4 w-4 text-sky-900" /> 来源待办（审稿 / 文献 / 接待 / 评审）</h3>
          {data.sourceTodos.length === 0 ? <EmptyState text="暂无自动流入的来源待办" /> : (
            <ul className="divide-y divide-border">
              {data.sourceTodos.map((t) => {
                const link = (t as { link?: string | null }).link;
                return (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                  {link ? (
                    <Link to={link} className="truncate text-primary hover:underline">{t.title}</Link>
                  ) : (
                    <span className="truncate">{t.title}</span>
                  )}
                  <Pill text={TODO_SOURCE_LABELS[t.source] ?? t.source} tone="blue" />
                </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold"><GraduationCap className="h-4 w-4 text-sky-900" /> 学生培养关键节点</h3>
          {data.nodeAlerts.length === 0 ? <EmptyState text="所有学生节点均已完成" /> : (
            <ul className="divide-y divide-border">
              {data.nodeAlerts.map((n, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-[13px]">
                  {/* V5 需求 2：点击学生姓名 → 人才培养·研究生培养 学生个人页 */}
                  {n.userId ? (
                    <Link to={`/training/grads?studentId=${n.userId}`} className="font-medium text-primary hover:underline" title="查看该学生的个人培养页">
                      {n.name}
                    </Link>
                  ) : (
                    <span>{n.name}</span>
                  )}
                  <Pill text={`${n.node}待完成`} tone="amber" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* V8 标注 1：常用网站链接（每用户自管，仅自己可见） */}
        <section className="rounded-md border border-border bg-card p-4 lg:col-span-2">
          <QuickLinks />
        </section>
      </div>

      {data.aiTasks.length > 0 && (
        <section className="mt-4 rounded-md border border-amber-700/30 bg-amber-600/5 p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold"><Sparkles className="h-4 w-4 text-amber-800" /> AI 解析建议 · 等待人工确认</h3>
          {/* V5 需求 1：条目化列出，点击跳转到对应功能页面由人工确认 */}
          <ul className="divide-y divide-border">
            {data.aiTasks.map((t) => (
              <li key={t.id}>
                <Link
                  to={t.link ?? "/config/review"}
                  className="flex items-center justify-between gap-3 py-2 text-[13px] transition-colors hover:bg-amber-600/10 rounded-sm px-1 -mx-1"
                  title={`前往【${t.moduleLabel ?? t.module}】人工确认该解析建议`}
                >
                  <span className="min-w-0">
                    <span className="font-medium text-primary hover:underline">{t.fileName}</span>
                    <span className="ml-2 text-muted-foreground">建议字段 {Object.keys(t.suggested).length} 项，请人工确认入库</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Pill text={t.moduleLabel ?? t.module} tone="amber" />
                    <span className="text-[12px] text-primary">前往确认 →</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ===================== V8 标注 1：常用网站链接 =====================
// 每个登录用户维护自己的常用网站清单：添加 / 编辑 / 删除，点击新标签页打开
type QLink = { id: number; title: string; url: string };

function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

function QuickLinks() {
  const utils = trpc.useUtils();
  const { data } = trpc.quickLinks.list.useQuery();
  const [editing, setEditing] = useState<Partial<QLink> | null>(null);

  const invalidate = { onSuccess: () => utils.quickLinks.list.invalidate() };
  const create = trpc.quickLinks.create.useMutation(invalidate);
  const update = trpc.quickLinks.update.useMutation(invalidate);
  const remove = trpc.quickLinks.remove.useMutation(invalidate);

  function save() {
    if (!editing?.title?.trim() || !editing?.url?.trim()) return;
    if (editing.id) update.mutate({ id: editing.id, title: editing.title, url: editing.url });
    else create.mutate({ title: editing.title, url: editing.url });
    setEditing(null);
  }

  return (
    <div>
      <h3 className="mb-3 flex items-center justify-between text-[14px] font-semibold">
        <span className="flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-emerald-900" /> 常用网站链接
          <span className="text-[11px] font-normal text-muted-foreground">仅自己可见，点击新标签页打开</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => setEditing({ title: "", url: "" })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 添加链接
        </Button>
      </h3>
      {(data ?? []).length === 0 ? (
        <EmptyState text="尚未添加常用网站，点击右上角「添加链接」开始" />
      ) : (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {(data ?? []).map((l) => (
            <li key={l.id} className="group relative">
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                title={`${l.title}\n${l.url}`}
                className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-primary">{l.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{hostOf(l.url)}</span>
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              </a>
              <span className="absolute -right-1.5 -top-1.5 hidden gap-1 group-hover:flex">
                <button
                  title="编辑该链接"
                  className="rounded-full border border-border bg-card p-1 text-muted-foreground shadow-sm hover:text-primary"
                  onClick={() => setEditing(l)}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  title="删除该链接"
                  className="rounded-full border border-border bg-card p-1 text-muted-foreground shadow-sm hover:text-destructive"
                  onClick={() => confirm(`确认删除链接「${l.title}」？`) && remove.mutate({ id: l.id })}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑链接" : "添加常用网站链接"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[12px] text-muted-foreground">名称</div>
              <Input placeholder="如：Web of Science" value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div>
              <div className="mb-1 text-[12px] text-muted-foreground">网址（未带协议时自动补 https://）</div>
              <Input placeholder="如：https://www.webofscience.com" value={editing?.url ?? ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
