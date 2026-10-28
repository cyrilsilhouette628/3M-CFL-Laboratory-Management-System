// 仪器设备 · 设备台账（需求 7）
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
import { Checkbox } from "@/components/ui/checkbox";
import { exportXlsx } from "@/lib/helpers";
import { DEVICE_STATUS_LABELS } from "@contracts/constants";
import { Plus, Pencil, Trash2, Download } from "lucide-react";

type Device = {
  id: number; name: string; model: string | null; assetNo: string | null; vendor: string | null;
  purchaseDate: string | null; price: number; projectId: number | null; location: string | null;
  keeperId: number | null; keeperName: string | null; status: string; shared: boolean;
  note: string | null; fileIds: number[];
};

const STATUS_TONE: Record<string, "green" | "amber" | "gray" | "red"> = {
  in_use: "green", maintenance: "amber", idle: "gray", scrapped: "red",
};

export default function DeviceAssets() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.deviceAssets.list.useQuery();
  const { data: userOptions } = trpc.users.options.useQuery();
  const { data: projectList } = trpc.projects.list.useQuery(undefined, { retry: false });
  const [editing, setEditing] = useState<Partial<Device> | null>(null);
  const [keyword, setKeyword] = useState("");
  const editable = can("device.assets", "editable");

  const create = trpc.deviceAssets.create.useMutation({ onSuccess: () => utils.deviceAssets.list.invalidate() });
  const update = trpc.deviceAssets.update.useMutation({ onSuccess: () => utils.deviceAssets.list.invalidate() });
  const remove = trpc.deviceAssets.remove.useMutation({ onSuccess: () => utils.deviceAssets.list.invalidate() });

  function save() {
    if (!editing?.name) return;
    const payload = {
      name: editing.name, model: editing.model ?? "", assetNo: editing.assetNo ?? "",
      vendor: editing.vendor ?? "", purchaseDate: editing.purchaseDate ?? "",
      price: editing.price ?? 0, projectId: editing.projectId ?? null,
      location: editing.location ?? "", keeperId: editing.keeperId ?? null,
      status: (editing.status ?? "in_use") as "in_use",
      shared: editing.shared ?? true, note: editing.note ?? "", fileIds: editing.fileIds ?? [],
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  const filtered = (data ?? []).filter((d) => !keyword || `${d.name} ${d.model ?? ""} ${d.assetNo ?? ""} ${d.location ?? ""}`.includes(keyword));

  return (
    <div>
      <PageHeader
        title="设备台账"
        sub="设备资产档案：型号/资产编号/负责人/存放地点/共享状态；说明书与采购合同归档"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportXlsx("设备台账", "设备", filtered.map((d) => ({ 名称: d.name, 型号: d.model, 资产编号: d.assetNo, 厂商: d.vendor, 购置日期: d.purchaseDate, 价格: d.price, 地点: d.location, 负责人: d.keeperName, 状态: DEVICE_STATUS_LABELS[d.status] })))}>
              <Download className="mr-1 h-3.5 w-3.5" />导出
            </Button>
            {editable && <Button size="sm" onClick={() => setEditing({ status: "in_use", shared: true, price: 0, fileIds: [] })}><Plus className="mr-1 h-3.5 w-3.5" />新增设备</Button>}
          </>
        }
      />
      <div className="mb-3">
        <Input className="w-72" placeholder="检索名称 / 型号 / 资产编号 / 地点" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>

      {!filtered.length ? <EmptyState text="暂无设备" /> : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => (
            <div key={d.id} className="rounded-md border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[14px] font-semibold leading-5">{d.name}</div>
                <Pill text={DEVICE_STATUS_LABELS[d.status] ?? d.status} tone={STATUS_TONE[d.status] ?? "gray"} />
              </div>
              <div className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground">
                <div>{[d.model, d.assetNo ? `资产编号 ${d.assetNo}` : null].filter(Boolean).join(" · ") || "—"}</div>
                <div>负责人：{d.keeperName ?? "—"} · 地点：{d.location ?? "—"}</div>
                <div>购置：{d.purchaseDate ?? "—"} · <Money n={d.price} /> 元{d.shared ? " · 开放共享预约" : " · 不开放预约"}</div>
              </div>
              {d.note && <div className="mt-1.5 text-[12px] text-muted-foreground">备注：{d.note}</div>}
              {d.fileIds.length > 0 && <div className="mt-1.5"><FileChips ids={d.fileIds} /></div>}
              {editable && (
                <div className="mt-2 flex justify-end gap-1 border-t border-border pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {can("device.assets", "manage") && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除该设备及其预约/维保记录？") && remove.mutate({ id: d.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑设备" : "新增设备"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <div className="col-span-2"><Field label="设备名称" required><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field></div>
            <Field label="型号规格"><Input value={editing?.model ?? ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })} /></Field>
            <Field label="资产编号"><Input value={editing?.assetNo ?? ""} onChange={(e) => setEditing({ ...editing, assetNo: e.target.value })} /></Field>
            <Field label="厂商"><Input value={editing?.vendor ?? ""} onChange={(e) => setEditing({ ...editing, vendor: e.target.value })} /></Field>
            <Field label="购置日期"><Input type="date" value={editing?.purchaseDate ?? ""} onChange={(e) => setEditing({ ...editing, purchaseDate: e.target.value })} /></Field>
            <Field label="价格（元）"><Input type="number" value={editing?.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></Field>
            <Field label="存放地点"><Input value={editing?.location ?? ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
            <Field label="负责人">
              <Select value={editing?.keeperId ? String(editing.keeperId) : "none"} onValueChange={(v) => setEditing({ ...editing, keeperId: v === "none" ? null : Number(v) })}>
                <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未指定</SelectItem>
                  {userOptions?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="购置经费来源项目">
              <Select value={editing?.projectId ? String(editing.projectId) : "none"} onValueChange={(v) => setEditing({ ...editing, projectId: v === "none" ? null : Number(v) })}>
                <SelectTrigger><SelectValue placeholder="关联项目（可选）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联</SelectItem>
                  {projectList?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="状态">
              <Select value={editing?.status ?? "in_use"} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DEVICE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={editing?.shared ?? true} onCheckedChange={(v) => setEditing({ ...editing, shared: !!v })} /> 开放共享预约（课题组成员可在线预约使用）
              </label>
            </div>
            <div className="col-span-2"><Field label="备注"><Textarea rows={2} value={editing?.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></Field></div>
            <div className="col-span-2">
              <Field label="说明书 / 采购合同附件">
                <FileUpload module="device" compact onUploaded={(id) => setEditing((cur) => cur ? { ...cur, fileIds: [...(cur.fileIds ?? []), id] } : cur)} />
                {editing?.fileIds && editing.fileIds.length > 0 && <div className="mt-1.5"><FileChips ids={editing.fileIds} /></div>}
              </Field>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.name} onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
