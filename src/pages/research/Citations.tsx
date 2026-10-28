// 2.7 论文 Web of Science 引用次数
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { RefreshCw, Link2 } from "lucide-react";

const COLORS = ["#165f49", "#b45309", "#1e40af", "#7c2d12", "#4c1d95", "#155e75"];

export default function Citations() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.citations.list.useQuery();
  const editable = can("research.citations", "editable");
  const link = trpc.citations.link.useMutation({ onSuccess: () => utils.citations.list.invalidate() });
  const refresh = trpc.citations.refreshAll.useMutation({ onSuccess: (r) => { utils.citations.list.invalidate(); alert(`已通过预留接口更新 ${r.updated} 条引用记录（原型为模拟数据）`); } });
  const updateCount = trpc.citations.updateCount.useMutation({ onSuccess: () => utils.citations.list.invalidate() });
  const [editCell, setEditCell] = useState<{ id: number; year: string } | null>(null);
  const [countVal, setCountVal] = useState("");

  const rows = data?.rows ?? [];
  const unlinked = data?.unlinked ?? [];

  // 合并曲线数据：年份为 x 轴
  const years = [...new Set(rows.flatMap((r) => Object.keys(r.counts)))].sort();
  const chartData = years.map((y) => {
    const point: Record<string, string | number> = { year: y };
    rows.forEach((r, i) => { point[`p${i}`] = r.counts[y] ?? null as unknown as number; });
    return point;
  });

  return (
    <div>
      <PageHeader title="论文 Web of Science 引用次数" sub="对接成果管理中已发表论文，通过预留 API 定期自动更新（支持手动补录），按年度展示变化曲线"
        actions={editable && <Button size="sm" onClick={() => refresh.mutate()}><RefreshCw className="mr-1 h-3.5 w-3.5" />对接接口更新</Button>} />

      {unlinked.length > 0 && editable && (
        <div className="mb-4 rounded-md border border-amber-700/30 bg-amber-600/5 p-3 text-[13px]">
          <div className="mb-2 font-medium text-amber-900">以下已发表论文尚未关联引用追踪：</div>
          {unlinked.map((u) => (
            <div key={u.id} className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate">{u.title}（{u.authors}）</span>
              <Button size="sm" variant="outline" onClick={() => link.mutate({ achievementId: u.id })}><Link2 className="mr-1 h-3 w-3" />关联追踪</Button>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? <EmptyState text="暂无引用追踪记录，请先关联已发表论文" /> : (
        <>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="mb-2 text-[13px] font-medium">年度引用变化曲线</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e2da" />
                <XAxis dataKey="year" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Legend formatter={(v: string) => rows[Number(v.slice(1))]?.title.slice(0, 18) + "…"} />
                {rows.map((_, i) => (
                  <Line key={i} type="monotone" dataKey={`p${i}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border border-border">
            <table className="data-table">
              <thead><tr><th>论文</th><th>作者</th>{years.map((y) => <th key={y} className="text-center">{y}</th>)}<th>最后更新</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-64 font-medium">{r.title}</td>
                    <td>{r.authors}</td>
                    {years.map((y) => (
                      <td key={y} className="text-center tabular-nums">
                        {editCell?.id === r.id && editCell.year === y ? (
                          <span className="inline-flex items-center gap-1">
                            <Input className="h-6 w-16 px-1 text-[12px]" value={countVal} onChange={(e) => setCountVal(e.target.value)} />
                            <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => { updateCount.mutate({ id: r.id, year: y, count: Number(countVal) || 0 }); setEditCell(null); }}>存</Button>
                          </span>
                        ) : (
                          <span className={editable ? "cursor-pointer hover:text-primary" : ""} title={editable ? "点击手动补录" : ""}
                            onClick={() => { if (editable) { setEditCell({ id: r.id, year: y }); setCountVal(String(r.counts[y] ?? "")); } }}>
                            {r.counts[y] ?? (editable ? "＋" : "—")}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="text-[12px] text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString("zh-CN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
