import { trpc } from "@/providers/trpc";
import { PageHeader, EmptyState, Pill } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function Feedback() {
  const utils = trpc.useUtils();
  const list = trpc.feedback.list.useQuery();
  const resolve = trpc.feedback.resolve.useMutation({
    onSuccess: () => utils.feedback.list.invalidate(),
    onError: (e) => alert(e.message),
  });

  return (
    <div>
      <PageHeader title="数据纠错反馈" sub="处理全站用户提交的数据错误；处理前请回到原业务记录核实并修正" />
      {!list.data?.length ? <EmptyState text="暂无数据纠错反馈" /> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead><tr><th>提交时间</th><th>模块 / 记录</th><th>提交人</th><th>错误说明与正确内容</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {list.data.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-[12px]">{new Date(row.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="max-w-64"><div className="font-medium">{row.module}</div><div className="mt-0.5 text-[12px] text-muted-foreground">{row.recordId ? `#${row.recordId} ` : ""}{row.recordTitle ?? "未指定记录"}</div></td>
                  <td>{row.createdByName}</td>
                  <td className="max-w-xl whitespace-pre-wrap text-[12.5px] leading-5">{row.content}</td>
                  <td>{row.status === "resolved" ? <Pill text="已处理" tone="green" /> : <Pill text="待处理" tone="amber" />}{row.resolvedAt && <div className="mt-1 text-[11px] text-muted-foreground">{new Date(row.resolvedAt).toLocaleString("zh-CN")}</div>}</td>
                  <td>{row.status !== "resolved" && <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: row.id })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />标记已处理</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
