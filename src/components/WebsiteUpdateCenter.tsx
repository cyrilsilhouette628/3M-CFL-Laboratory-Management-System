// 网站一键更新中心：待推送队列（可删条目）→ 确认推送；含已推送历史与网站效果预览
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, EmptyState, Field } from "@/components/ui2";
import { WEBSITE_UPDATE_TYPES, WEBSITE_UPDATE_TYPE_LABELS } from "@contracts/constants";
import { Globe, Trash2, Send, Plus, Loader2 } from "lucide-react";

type Item = {
  id: number;
  type: string;
  title: string;
  payload: Record<string, string>;
  source: string | null;
  status: string;
  createdByName: string | null;
  pushedByName: string | null;
  pushedAt: Date | null;
  createdAt: Date;
};

export function WebsiteUpdateCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.website.list.useQuery(undefined, { enabled: open });
  const [pushResult, setPushResult] = useState("");
  const [manual, setManual] = useState<{ type: string; title: string; fields: Record<string, string> }>({
    type: "paper",
    title: "",
    fields: {},
  });

  const discard = trpc.website.discard.useMutation({ onSuccess: () => utils.website.list.invalidate() });
  const pushAll = trpc.website.pushAll.useMutation({
    onSuccess: (r) => {
      setPushResult(`已推送 ${r.count} 条。${r.channel}`);
      utils.website.list.invalidate();
    },
  });
  const create = trpc.website.create.useMutation({
    onSuccess: () => {
      setManual({ type: "paper", title: "", fields: {} });
      utils.website.list.invalidate();
    },
  });

  const pending = (data?.pending ?? []) as Item[];
  const pushed = (data?.pushed ?? []) as Item[];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> 网站一键更新 — 3M-CFL 课题组网站
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">待推送（{pending.length}）</TabsTrigger>
            <TabsTrigger value="pushed">已推送（{pushed.length}）</TabsTrigger>
            <TabsTrigger value="preview">网站效果预览</TabsTrigger>
            <TabsTrigger value="manual">手工补录</TabsTrigger>
          </TabsList>

          {/* 待推送队列 */}
          <TabsContent value="pending">
            {isLoading ? (
              <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />
            ) : pending.length === 0 ? (
              <EmptyState text="暂无待更新条目。论文上线、来访归档、获奖登记、人员变动等业务事件会自动进入本队列。" />
            ) : (
              <>
                <div className="mb-2 text-[12px] text-muted-foreground">
                  以下条目将更新到课题组网站，可逐条删除；确认后自动推送（网站经 Feed API 拉取 / Webhook 接收）。
                </div>
                <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                  {pending.map((it) => (
                    <div key={it.id} className="flex items-start justify-between gap-3 rounded-sm border border-border px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Pill text={WEBSITE_UPDATE_TYPE_LABELS[it.type] ?? it.type} tone="blue" />
                          <span className="truncate text-[13px] font-medium">{it.title}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                          {Object.entries(it.payload).filter(([, v]) => v).map(([k, v]) => `${k}：${v}`).join("　")}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">来源：{it.source ?? "手工"} · {it.createdByName}</div>
                      </div>
                      <button
                        title="从待推送中删除"
                        className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => discard.mutate({ id: it.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[12px] text-muted-foreground">共 {pending.length} 条待推送</span>
                  <Button
                    size="sm"
                    disabled={pushAll.isPending}
                    onClick={() => {
                      setPushResult("");
                      pushAll.mutate({ ids: pending.map((p) => p.id) });
                    }}
                  >
                    <Send className="mr-1 h-3.5 w-3.5" /> 确认更新到网站
                  </Button>
                </div>
              </>
            )}
            {pushResult && <div className="mt-2 rounded-sm border border-emerald-800/30 bg-emerald-900/10 px-3 py-2 text-[12px] text-emerald-900 dark:text-emerald-200">{pushResult}</div>}
          </TabsContent>

          {/* 已推送历史 */}
          <TabsContent value="pushed">
            {pushed.length === 0 ? <EmptyState text="暂无推送历史" /> : (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {pushed.map((it) => (
                  <div key={it.id} className="rounded-sm border border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Pill text={WEBSITE_UPDATE_TYPE_LABELS[it.type] ?? it.type} tone="green" />
                      <span className="truncate text-[13px] font-medium">{it.title}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      推送人：{it.pushedByName ?? "—"} · {it.pushedAt ? new Date(it.pushedAt).toLocaleString("zh-CN") : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 网站效果预览（模拟网站渲染 Feed） */}
          <TabsContent value="preview">
            <div className="rounded-md border border-border bg-secondary/40 p-4">
              <div className="border-b border-border pb-2 text-center">
                <div className="text-[15px] font-semibold tracking-wide">3M-CFL</div>
                <div className="text-[11px] tracking-widest text-muted-foreground">课题组网站 · 内容预览（数据来自已推送 Feed）</div>
              </div>
              <div className="mt-3 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
                {pushed.length === 0 && <EmptyState text="网站暂无内容：请先推送条目" />}
                {WEBSITE_UPDATE_TYPES.map((t) => {
                  const items = pushed.filter((p) => p.type === t);
                  if (items.length === 0) return null;
                  return (
                    <div key={t}>
                      <div className="mb-1 text-[12px] font-semibold text-primary">{WEBSITE_UPDATE_TYPE_LABELS[t]}</div>
                      <ul className="space-y-1">
                        {items.map((it) => (
                          <li key={it.id} className="rounded-sm bg-card px-2.5 py-1.5 text-[12px]">
                            <span className="font-medium">{it.title}</span>
                            <span className="ml-2 text-muted-foreground">
                              {Object.values(it.payload).filter(Boolean).slice(0, 3).join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* 手工补录 */}
          <TabsContent value="manual">
            <div className="grid grid-cols-2 gap-3">
              <Field label="更新类型">
                <Select value={manual.type} onValueChange={(v) => setManual({ ...manual, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEBSITE_UPDATE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{WEBSITE_UPDATE_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="条目标题" required>
                <Input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="如：论文发表：xxx" />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {["字段一", "字段二", "字段三"].map((ph, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`${ph}名（如 作者）`}
                    value={manual.fields[`k${i}`] ?? ""}
                    onChange={(e) => setManual({ ...manual, fields: { ...manual.fields, [`k${i}`]: e.target.value } })}
                  />
                  <Input
                    placeholder="内容"
                    value={manual.fields[`v${i}`] ?? ""}
                    onChange={(e) => setManual({ ...manual, fields: { ...manual.fields, [`v${i}`]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                disabled={!manual.title}
                onClick={() => {
                  const payload: Record<string, string> = {};
                  for (let i = 0; i < 3; i++) {
                    const k = manual.fields[`k${i}`], v = manual.fields[`v${i}`];
                    if (k && v) payload[k] = v;
                  }
                  create.mutate({ type: manual.type, title: manual.title, payload });
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> 加入待推送队列
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
