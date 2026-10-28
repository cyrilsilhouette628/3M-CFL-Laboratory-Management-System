import { useState } from "react";
import { useLocation } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui2";
import { MessageSquareWarning } from "lucide-react";

const MODULE_LABELS: [string, string][] = [
  ["/research/projects", "科研项目管理"],
  ["/research/papers", "投稿论文进度"],
  ["/research/ip", "申请知识产权进度"],
  ["/research/references", "重要参考文献"],
  ["/training", "人才培养"],
  ["/achievements/papers", "已发表论文"],
  ["/achievements/patents", "已获知识产权"],
  ["/achievements", "成果管理"],
  ["/social", "社会服务"],
  ["/device", "仪器设备"],
];

export function DataFeedbackButton() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const moduleName = MODULE_LABELS.find(([path]) => location.pathname.startsWith(path))?.[1] ?? "系统数据";
  const [recordId, setRecordId] = useState("");
  const [recordTitle, setRecordTitle] = useState("");
  const [content, setContent] = useState("");
  const submit = trpc.feedback.create.useMutation({
    onSuccess: () => {
      setOpen(false);
      setRecordId("");
      setRecordTitle("");
      setContent("");
      alert("纠错反馈已提交，管理员会在系统内处理。");
    },
    onError: (e) => alert(e.message),
  });

  return (
    <>
      <button
        type="button"
        title="反馈论文年份、成果信息或本人无权直接修改的数据错误"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageSquareWarning className="h-3.5 w-3.5" />数据纠错
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>提交数据纠错反馈</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-sm bg-secondary/60 px-3 py-2 text-[12px] text-muted-foreground">当前模块：{moduleName}。请写明正确数据和依据；非本人数据不会因此直接开放修改权限。</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1"><Field label="记录 ID（选填）"><Input type="number" min={1} value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="如 128" /></Field></div>
              <div className="sm:col-span-2"><Field label="记录标题（选填）"><Input value={recordTitle} onChange={(e) => setRecordTitle(e.target.value)} placeholder="论文、成果或学生姓名" /></Field></div>
            </div>
            <Field label="错误说明与正确内容" required>
              <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="例如：论文《……》的发表年份误录为 2024，应为 2025；依据为期刊官网或论文首页。" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button disabled={content.trim().length < 2 || submit.isPending} onClick={() => submit.mutate({ module: moduleName, recordId: recordId ? Number(recordId) : undefined, recordTitle: recordTitle || undefined, content: content.trim() })}>提交反馈</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
