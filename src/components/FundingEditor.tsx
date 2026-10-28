// V6 需求 2：资助项目编辑器 —— 有序勾选已入库科研项目（第一位=第一资助），获批号自动带出项目编号
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { useState } from "react";

export type Funding = { projectId: number; projectName: string; projectCode: string | null; ord: number };

export function FundingEditor({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { data: projects } = trpc.projects.list.useQuery();
  const [pick, setPick] = useState("");
  const options = (projects ?? []).filter((p) => !value.includes(p.id));
  const byId = new Map((projects ?? []).map((p) => [p.id, p]));

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {value.length === 0 && <div className="text-[12px] text-muted-foreground">未标注资助项目</div>}
      {value.map((id, i) => {
        const pr = byId.get(id);
        return (
          <div key={id} className="flex items-center gap-2 rounded-sm border border-border bg-secondary/30 px-2 py-1.5 text-[12px]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{pr?.name ?? `#${id}`}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">获批号：{pr?.code || "—"}</span>
            <button title="上移（排名靠前）" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button title="下移" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button title="移除" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(value.filter((x) => x !== id))}><X className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="选择已入库的科研项目…" /></SelectTrigger>
          <SelectContent>
            {options.length === 0 && <div className="px-2 py-1.5 text-[12px] text-muted-foreground">无可选项目</div>}
            {options.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.code ? `（${p.code}）` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" disabled={!pick}
          onClick={() => { if (pick) { onChange([...value, Number(pick)]); setPick(""); } }}>
          <Plus className="mr-1 h-3.5 w-3.5" />添加
        </Button>
      </div>
      {value.length > 0 && <div className="text-[11px] text-muted-foreground">排序即资助排名：第 1 位为第一资助项目</div>}
    </div>
  );
}

// 列表只读展示：资助：项目A（1st）· 项目B（2nd）
export function FundingChips({ fundings }: { fundings: Funding[] }) {
  if (!fundings?.length) return null;
  return (
    <span className="text-[12px] text-muted-foreground">
      资助：{fundings.map((f) => `${f.ord}.${f.projectName}${f.projectCode ? `（${f.projectCode}）` : ""}`).join("；")}
    </span>
  );
}
