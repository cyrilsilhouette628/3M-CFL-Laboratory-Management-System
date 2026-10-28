// 成果管理 · 统计与年度盘点（V4 需求 11：成果管理改为左侧一级+二级菜单组织，本页为总览）
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadText } from "@/lib/helpers";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, Sparkles, UserSearch } from "lucide-react";

const PIE_COLORS = ["#165f49", "#b45309", "#1e40af", "#7c2d12", "#4c1d95", "#155e75"];

export default function Achievements() {
  const stats = trpc.achievements.stats.useQuery();
  const [trendCategory, setTrendCategory] = useState<"published_paper" | "patent" | "award">("published_paper");
  const trendLabels = { published_paper: "已发表论文", patent: "已获知识产权", award: "科研奖励" } as const;
  const [annualYear, setAnnualYear] = useState(String(new Date().getFullYear()));
  const annual = trpc.achievements.annualReview.useQuery({ year: Number(annualYear) });
  const [personName, setPersonName] = useState("");
  const [personQuery, setPersonQuery] = useState<{ year: number; name: string } | null>(null);
  const personal = trpc.achievements.personalReport.useQuery(personQuery!, { enabled: !!personQuery });

  return (
    <div>
      <PageHeader title="成果统计与年度盘点" sub="六类成果（论文/知识产权/奖励/学生成果/专著/软著）的年度趋势与分布；年度盘点自动生成《年度科研工作总结》草稿" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] font-medium">年度成果趋势</div>
            <div className="flex rounded-sm border border-border p-0.5">
              {(Object.keys(trendLabels) as (keyof typeof trendLabels)[]).map((key) => (
                <button key={key} type="button" onClick={() => setTrendCategory(key)} className={`rounded-sm px-2.5 py-1 text-[11.5px] transition-colors ${trendCategory === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>{trendLabels[key]}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.data?.byYearCategory ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e2da" />
              <XAxis dataKey="year" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip />
              <Bar dataKey={trendCategory} name={trendLabels[trendCategory]} fill="#165f49" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 text-[13px] font-medium">成果类型分布（共 {stats.data?.total ?? 0} 项）</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={stats.data?.byCategory ?? []} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} fontSize={11}>
                {(stats.data?.byCategory ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input className="w-28" type="number" value={annualYear} onChange={(e) => setAnnualYear(e.target.value)} />
          <span className="text-[13px] text-muted-foreground">选择年份后自动汇总该年度全部成果、学术活动与专家来访，并生成《年度科研工作总结》草稿</span>
        </div>
        {annual.data && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-card p-4">
              <div className="mb-2 text-[13px] font-medium">{annual.data.year} 年度汇总</div>
              <ul className="space-y-1 text-[13px]">
                <li>成果总数：<b>{annual.data.summary.achievements}</b></li>
                <li>论文：<b>{annual.data.summary.papers}</b> · 知识产权：<b>{annual.data.summary.patents}</b> · 奖励：<b>{annual.data.summary.awards}</b></li>
                <li>学术活动：<b>{annual.data.summary.activities}</b> · 专家来访：<b>{annual.data.summary.visits}</b></li>
              </ul>
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 text-[13px] font-medium">个人年度科研表现报告</div>
                <div className="flex gap-2">
                  <Input placeholder="学生姓名" value={personName} onChange={(e) => setPersonName(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={!personName} onClick={() => setPersonQuery({ year: Number(annualYear), name: personName })}><UserSearch className="mr-1 h-3.5 w-3.5" />生成</Button>
                </div>
                {personal.data && <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm bg-secondary/50 p-2 text-[11px]">{personal.data.report}</pre>}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-4 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium"><Sparkles className="h-4 w-4 text-amber-800" />《年度科研工作总结》草稿（可编辑后导出）</span>
                <Button size="sm" variant="outline" onClick={() => downloadText(`年度科研工作总结-${annual.data.year}.txt`, annual.data.report)}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
              </div>
              <pre className="max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-sm bg-secondary/50 p-3 text-[12px] leading-6">{annual.data.report}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
