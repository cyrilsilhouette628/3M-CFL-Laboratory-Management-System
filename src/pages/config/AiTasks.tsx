// V6 需求 C-4：AI 解析确认专页 —— 待确认建议逐条列出、字段可编辑、确认入库或拒绝
// 仪表盘【AI 解析建议·等待人工确认】条目统一跳转 /config/ai?task=<id> 定位到此页
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Pill, EmptyState } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_MODULE_LABELS, ACHIEVEMENT_CATEGORY_LABELS, ACHIEVEMENT_CATEGORIES } from "@contracts/constants";
import { Sparkles, Check, X, ChevronDown, ChevronUp, FileText } from "lucide-react";

type Task = {
  id: number; module: string; fileName: string; fileId: number | null;
  suggested: Record<string, string>; status: string; createdBy: number; createdAt: string | Date;
};

export default function AiTasks() {
  const utils = trpc.useUtils();
  const { data } = trpc.ai.pending.useQuery();
  const [params] = useSearchParams();
  const focusId = Number(params.get("task") ?? 0);
  const [openId, setOpenId] = useState<number | null>(focusId || null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [achCat, setAchCat] = useState("published_paper");
  const focusRef = useRef<HTMLLIElement | null>(null);

  const confirmTask = trpc.ai.confirm.useMutation({
    onSuccess: (r) => { utils.ai.pending.invalidate(); utils.dashboard.summary.invalidate(); setOpenId(null); alert(r.createdInfo ? `已确认入库：${r.createdInfo}` : "已确认"); },
    onError: (e) => alert(e.message),
  });
  const resolve = trpc.ai.resolve.useMutation({
    onSuccess: () => { utils.ai.pending.invalidate(); utils.dashboard.summary.invalidate(); setOpenId(null); },
    onError: (e) => alert(e.message),
  });

  // ?task=<id> 定位并展开
  useEffect(() => {
    if (focusId && data?.some((t) => t.id === focusId)) {
      setOpenId(focusId);
      const t = data.find((x) => x.id === focusId)!;
      setFields({ ...t.suggested });
      setTimeout(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [focusId, data]);

  const toggle = (t: Task) => {
    if (openId === t.id) { setOpenId(null); return; }
    setOpenId(t.id);
    setFields({ ...t.suggested });
    setAchCat("published_paper");
  };

  return (
    <div>
      <PageHeader
        title="AI 解析确认"
        sub="文件上传后由 AI 扫描生成的填写建议在此等待人工确认：可编辑字段后【确认入库】（自动写入对应模块），或【拒绝】该建议"
      />
      {!data?.length ? (
        <EmptyState text="没有待确认的 AI 解析建议" />
      ) : (
        <ul className="space-y-2">
          {data.map((t) => {
            const open = openId === t.id;
            return (
              <li
                key={t.id}
                ref={t.id === focusId ? focusRef : undefined}
                className={`rounded-md border bg-card transition-colors ${t.id === focusId ? "border-amber-700/60 ring-2 ring-amber-600/30" : "border-border"}`}
              >
                <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => toggle(t)}>
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-[13.5px] font-medium">{t.fileName}</span>
                    <Pill text={AI_MODULE_LABELS[t.module] ?? t.module} tone="amber" />
                    <span className="text-[12px] text-muted-foreground">建议字段 {Object.keys(t.suggested).length} 项</span>
                  </span>
                  {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                {open && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[12px] text-amber-800"><Sparkles className="h-3.5 w-3.5" />以下为 AI 建议，请逐项核对/修订后确认入库：</div>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(fields).map(([k, v]) => (
                        <div key={k} className={v.length > 60 ? "col-span-2" : ""}>
                          <div className="mb-1 text-[12px] font-medium text-muted-foreground">{k}</div>
                          <Input value={v} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} />
                        </div>
                      ))}
                      {t.module === "achievement" && (
                        <div>
                          <div className="mb-1 text-[12px] font-medium text-muted-foreground">入库成果类别</div>
                          <Select value={achCat} onValueChange={setAchCat}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ACHIEVEMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ACHIEVEMENT_CATEGORY_LABELS[c]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-[12px] text-muted-foreground">
                        {["paper", "achievement", "review"].includes(t.module)
                          ? "确认后将自动写入对应模块条目"
                          : "该模块暂不支持自动入库，确认仅标记建议有效"}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="text-destructive" disabled={resolve.isPending}
                          onClick={() => { if (confirm("确认拒绝该 AI 建议？")) resolve.mutate({ id: t.id, action: "rejected" }); }}>
                          <X className="mr-1 h-3.5 w-3.5" />拒绝
                        </Button>
                        <Button size="sm" disabled={confirmTask.isPending}
                          onClick={() => confirmTask.mutate({ id: t.id, fields, achievementCategory: t.module === "achievement" ? achCat : undefined })}>
                          <Check className="mr-1 h-3.5 w-3.5" />确认入库
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
