// 仪器设备 · 预约使用（需求 7）：在线预约 → 负责人审批 → 使用完成；时段冲突自动拦截
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOOKING_STATUS_LABELS } from "@contracts/constants";
import { Plus, Check, X, FlagTriangleRight } from "lucide-react";

type Booking = {
  id: number; deviceId: number; deviceName: string; userId: number; userName: string | null;
  startTime: string; endTime: string; purpose: string | null; status: string;
  reviewedByName: string | null; reviewNote: string | null;
  canReview: boolean; canFinish: boolean;
};

const TONE: Record<string, "amber" | "green" | "red" | "gray" | "blue"> = {
  pending: "amber", approved: "green", rejected: "red", done: "gray", cancelled: "gray",
};

export default function DeviceBookings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.deviceBookings.list.useQuery();
  const { data: devices } = trpc.deviceAssets.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ deviceId: 0, startTime: "", endTime: "", purpose: "" });
  const [reviewing, setReviewing] = useState<{ b: Booking; approve: boolean } | null>(null);
  const [note, setNote] = useState("");

  const invalidate = () => utils.deviceBookings.list.invalidate();
  const create = trpc.deviceBookings.create.useMutation({
    onSuccess: () => { invalidate(); setCreating(false); setForm({ deviceId: 0, startTime: "", endTime: "", purpose: "" }); alert("预约已提交，设备负责人将收到审批待办。"); },
    onError: (e) => alert(e.message),
  });
  const review = trpc.deviceBookings.review.useMutation({ onSuccess: () => { invalidate(); setReviewing(null); setNote(""); }, onError: (e) => alert(e.message) });
  const finish = trpc.deviceBookings.finish.useMutation({ onSuccess: invalidate, onError: (e) => alert(e.message) });

  const bookable = (devices ?? []).filter((d) => d.shared && d.status !== "scrapped" && d.status !== "maintenance");

  return (
    <div>
      <PageHeader
        title="预约使用"
        sub="设备共享预约：提交时段 → 负责人审批 → 使用完成；冲突时段自动拦截"
        actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-3.5 w-3.5" />预约设备</Button>}
      />

      {!data?.length ? <EmptyState text="暂无预约记录" /> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead>
              <tr><th>设备</th><th>预约人</th><th>时段</th><th>用途</th><th>状态</th><th>审批</th><th className="w-40">操作</th></tr>
            </thead>
            <tbody>
              {(data as Booking[]).map((b) => (
                <tr key={b.id}>
                  <td className="font-medium">{b.deviceName}</td>
                  <td>{b.userName}</td>
                  <td className="whitespace-nowrap tabular-nums text-[12px]">{b.startTime} ~ {b.endTime.slice(11)}</td>
                  <td className="max-w-56 truncate">{b.purpose ?? "—"}</td>
                  <td><Pill text={BOOKING_STATUS_LABELS[b.status] ?? b.status} tone={TONE[b.status] ?? "gray"} /></td>
                  <td className="text-[12px] text-muted-foreground">{b.reviewedByName ? `${b.reviewedByName}${b.reviewNote ? `：${b.reviewNote}` : ""}` : "—"}</td>
                  <td className="whitespace-nowrap">
                    {b.status === "pending" && b.canReview && (
                      <>
                        <Button variant="ghost" size="sm" title="通过" onClick={() => { setReviewing({ b, approve: true }); setNote(""); }}><Check className="h-3.5 w-3.5 text-emerald-700" /></Button>
                        <Button variant="ghost" size="sm" title="驳回" onClick={() => { setReviewing({ b, approve: false }); setNote(""); }}><X className="h-3.5 w-3.5 text-red-700" /></Button>
                      </>
                    )}
                    {b.status === "approved" && b.canFinish && (
                      <Button variant="ghost" size="sm" title="使用完成" onClick={() => finish.mutate({ id: b.id, action: "done" })}><FlagTriangleRight className="h-3.5 w-3.5 text-sky-800" /></Button>
                    )}
                    {["pending", "approved"].includes(b.status) && b.userId === user?.id && (
                      <Button variant="ghost" size="sm" title="取消预约" onClick={() => confirm("确认取消该预约？") && finish.mutate({ id: b.id, action: "cancelled" })}><X className="h-3.5 w-3.5" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新建预约 */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>预约设备</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="设备" required>
              <Select value={form.deviceId ? String(form.deviceId) : ""} onValueChange={(v) => setForm({ ...form, deviceId: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="选择可预约设备" /></SelectTrigger>
                <SelectContent>{bookable.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}（{d.location ?? "地点未定"}）</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="开始时间" required><Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
              <Field label="结束时间" required><Input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
            </div>
            <Field label="用途"><Textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="实验内容、样品数量…" /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)}>取消</Button>
              <Button disabled={!form.deviceId || !form.startTime || !form.endTime || create.isPending}
                onClick={() => create.mutate({ ...form, startTime: form.startTime.replace("T", " "), endTime: form.endTime.replace("T", " ") })}>提交预约</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 审批 */}
      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{reviewing?.approve ? "通过预约" : "驳回预约"} —— {reviewing?.b.deviceName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-[13px] text-muted-foreground">{reviewing?.b.userName} · {reviewing?.b.startTime} ~ {reviewing?.b.endTime}</div>
            <Field label={reviewing?.approve ? "备注（可选）" : "驳回原因"}>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReviewing(null)}>取消</Button>
              <Button disabled={review.isPending || (!reviewing?.approve && !note)} onClick={() => reviewing && review.mutate({ id: reviewing.b.id, approve: reviewing.approve, note })}>
                确认{reviewing?.approve ? "通过" : "驳回"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
