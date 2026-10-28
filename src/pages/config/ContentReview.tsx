// 系统配置 · 内容审核（需求 10）：普通用户提交的文档需审核；超管/管理员免审；访客只浏览
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REVIEW_STATUS_LABELS } from "@contracts/constants";
import { fmtSize } from "@/lib/helpers";
import { Check, X } from "lucide-react";

type PendingFile = {
  id: number; fileName: string; mime: string; size: number; module: string | null;
  visibility: string; uploadedBy: number | null; uploaderName: string;
  reviewStatus: string; reviewNote: string | null; createdAt: Date;
};

const TONE: Record<string, "amber" | "green" | "red"> = { pending: "amber", approved: "green", rejected: "red" };

export default function ContentReview() {
  const utils = trpc.useUtils();
  const pendingQuery = trpc.review.pending.useQuery();
  const historyQuery = trpc.review.history.useQuery();
  const [deciding, setDeciding] = useState<{ f: PendingFile; approve: boolean } | null>(null);
  const [note, setNote] = useState("");

  const decide = trpc.review.decide.useMutation({
    onSuccess: () => {
      utils.review.pending.invalidate();
      utils.review.history.invalidate();
      setDeciding(null);
      setNote("");
    },
    onError: (e) => alert(e.message),
  });

  const renderTable = (rows: PendingFile[], actionable: boolean) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="data-table">
        <thead>
          <tr><th>文件</th><th>提交人</th><th>模块</th><th>大小</th><th>状态</th><th>备注</th>{actionable && <th className="w-24">操作</th>}</tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              <td className="max-w-72">
                <div className="font-medium">{f.fileName}</div>
                <div className="mt-0.5"><FileChips ids={[f.id]} /></div>
              </td>
              <td>{f.uploaderName}</td>
              <td className="text-[12px]">{f.module ?? "通用"}</td>
              <td className="tabular-nums text-[12px]">{fmtSize(f.size)}</td>
              <td><Pill text={REVIEW_STATUS_LABELS[f.reviewStatus] ?? f.reviewStatus} tone={TONE[f.reviewStatus] ?? "amber"} /></td>
              <td className="max-w-56 truncate text-[12px] text-muted-foreground">{f.reviewNote ?? "—"}</td>
              {actionable && (
                <td className="whitespace-nowrap">
                  <Button variant="ghost" size="sm" title="通过" onClick={() => { setDeciding({ f, approve: true }); setNote(""); }}>
                    <Check className="h-3.5 w-3.5 text-emerald-700" />
                  </Button>
                  <Button variant="ghost" size="sm" title="驳回" onClick={() => { setDeciding({ f, approve: false }); setNote(""); }}>
                    <X className="h-3.5 w-3.5 text-red-700" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="内容审核"
        sub="普通用户提交的文档需管理员审核后才对他人可见；超级管理员/管理员提交免审；访客只允许浏览"
      />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">待审核（{pendingQuery.data?.length ?? 0}）</TabsTrigger>
          <TabsTrigger value="history">审核历史</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          {!pendingQuery.data?.length ? <EmptyState text="审核队列已清空" /> : renderTable(pendingQuery.data as PendingFile[], true)}
        </TabsContent>
        <TabsContent value="history">
          {!historyQuery.data?.length ? <EmptyState text="暂无审核记录" /> : renderTable(historyQuery.data as PendingFile[], false)}
        </TabsContent>
      </Tabs>

      <Dialog open={!!deciding} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{deciding?.approve ? "通过" : "驳回"}：{deciding?.f.fileName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-[13px] text-muted-foreground">提交人：{deciding?.f.uploaderName}</div>
            <Field label={deciding?.approve ? "备注（可选）" : "驳回原因（必填，将通知提交者）"}>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeciding(null)}>取消</Button>
              <Button
                disabled={decide.isPending || (!deciding?.approve && !note)}
                onClick={() => deciding && decide.mutate({ id: deciding.f.id, approve: deciding.approve, note })}
              >
                确认{deciding?.approve ? "通过" : "驳回"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
