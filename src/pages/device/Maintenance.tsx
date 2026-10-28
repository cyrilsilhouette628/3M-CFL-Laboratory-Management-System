// 仪器设备 · 维护保养（需求 7）：例行保养 / 维修 / 校准；维修登记后设备自动置为维护中
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field, Money } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportXlsx } from "@/lib/helpers";
import { MAINTENANCE_TYPE_LABELS } from "@contracts/constants";
import { Plus, Trash2, Download } from "lucide-react";

type Record_ = {
  id: number; deviceId: number; deviceName: string; type: string; date: string; cost: number;
  operator: string | null; note: string | null; fileIds: number[]; createdByName: string | null;
};

const TONE: Record<string, "gray" | "red" | "blue"> = { routine: "gray", repair: "red", calibration: "blue" };

export default function DeviceMaintenance() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.deviceMaintenance.list.useQuery();
  const { data: devices } = trpc.deviceAssets.list.useQuery();
  const [editing, setEditing] = useState<{ deviceId: number; type: string; date: string; cost: number; operator: string; note: string; fileIds: number[] } | null>(null);
  const editable = can("device.maintenance", "editable");

  const create = trpc.deviceMaintenance.create.useMutation({
    onSuccess: () => { utils.deviceMaintenance.list.invalidate(); utils.deviceAssets.list.invalidate(); setEditing(null); },
    onError: (e) => alert(e.message),
  });
  const remove = trpc.deviceMaintenance.remove.useMutation({ onSuccess: () => utils.deviceMaintenance.list.invalidate() });

  return (
    <div>
      <PageHeader
        title="维护保养"
        sub="例行保养 / 维修 / 校准记录；登记维修后设备状态自动置为「维护中」，恢复请在设备台账中改回"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportXlsx("设备维保", "维保", (data ?? []).map((m) => ({ 设备: m.deviceName, 类型: MAINTENANCE_TYPE_LABELS[m.type], 日期: m.date, 费用: m.cost, 经办: m.operator, 备注: m.note })))}>
              <Download className="mr-1 h-3.5 w-3.5" />导出
            </Button>
            {editable && <Button size="sm" onClick={() => setEditing({ deviceId: 0, type: "routine", date: new Date().toISOString().slice(0, 10), cost: 0, operator: "", note: "", fileIds: [] })}><Plus className="mr-1 h-3.5 w-3.5" />登记维保</Button>}
          </>
        }
      />

      {!data?.length ? <EmptyState text="暂无维保记录" /> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead>
              <tr><th>设备</th><th>类型</th><th>日期</th><th>费用</th><th>经办人/单位</th><th>备注</th><th>附件</th><th className="w-14"></th></tr>
            </thead>
            <tbody>
              {(data as Record_[]).map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.deviceName}</td>
                  <td><Pill text={MAINTENANCE_TYPE_LABELS[m.type] ?? m.type} tone={TONE[m.type] ?? "gray"} /></td>
                  <td className="tabular-nums">{m.date}</td>
                  <td className="tabular-nums"><Money n={m.cost} /> 元</td>
                  <td>{m.operator ?? "—"}</td>
                  <td className="max-w-56 truncate">{m.note ?? "—"}</td>
                  <td>{m.fileIds.length > 0 ? <FileChips ids={m.fileIds} /> : "—"}</td>
                  <td>
                    {can("device.maintenance", "manage") && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除该记录？") && remove.mutate({ id: m.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>登记维保记录</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="设备" required>
              <Select value={editing?.deviceId ? String(editing.deviceId) : ""} onValueChange={(v) => setEditing((e) => e && { ...e, deviceId: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="选择设备" /></SelectTrigger>
                <SelectContent>{devices?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="类型" required>
                <Select value={editing?.type ?? "routine"} onValueChange={(v) => setEditing((e) => e && { ...e, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MAINTENANCE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="日期" required><Input type="date" value={editing?.date ?? ""} onChange={(e) => setEditing((x) => x && { ...x, date: e.target.value })} /></Field>
              <Field label="费用（元）"><Input type="number" value={editing?.cost ?? 0} onChange={(e) => setEditing((x) => x && { ...x, cost: Number(e.target.value) })} /></Field>
              <Field label="经办人 / 维保单位"><Input value={editing?.operator ?? ""} onChange={(e) => setEditing((x) => x && { ...x, operator: e.target.value })} /></Field>
            </div>
            <Field label="备注"><Textarea rows={2} value={editing?.note ?? ""} onChange={(e) => setEditing((x) => x && { ...x, note: e.target.value })} /></Field>
            <Field label="票据 / 报告附件">
              <FileUpload module="device" compact onUploaded={(id) => setEditing((x) => x && { ...x, fileIds: [...x.fileIds, id] })} />
              {editing?.fileIds.length ? <div className="mt-1.5"><FileChips ids={editing.fileIds} /></div> : null}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
              <Button disabled={!editing?.deviceId || create.isPending} onClick={() => editing && create.mutate({ ...editing, type: editing.type as "routine" })}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
