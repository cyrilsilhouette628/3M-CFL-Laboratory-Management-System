// 通用小组件
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function Pill({
  text,
  tone = "gray",
}: {
  text: string;
  tone?: "gray" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  const tones: Record<string, string> = {
    gray: "border-border bg-secondary text-secondary-foreground",
    green: "border-emerald-800/30 bg-emerald-900/10 text-emerald-900",
    amber: "border-amber-700/30 bg-amber-600/10 text-amber-800",
    red: "border-red-800/30 bg-red-700/10 text-red-800",
    blue: "border-sky-800/30 bg-sky-700/10 text-sky-900",
    purple: "border-purple-800/30 bg-purple-700/10 text-purple-900",
  };
  return <span className={cn("badge", tones[tone])}>{text}</span>;
}

export function EmptyState({ text = "暂无数据" }: { text?: string }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function Money({ n }: { n: number }) {
  return <span className="tabular-nums">{n.toLocaleString("zh-CN")}</span>;
}

// V5：统计卡（培养仪表盘等复用）
export function StatCard({ icon, label, value, tone }: { icon?: ReactNode; label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
      {icon && <span className={`flex h-9 w-9 items-center justify-center rounded-sm ${tone ?? "bg-primary/10 text-primary"}`}>{icon}</span>}
      <div>
        <div className="text-2xl font-semibold tabular-nums leading-7">{value}</div>
        <div className="text-[12px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
