// 2.3 合作者科研工作（仅项目管理员可见）
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportXlsx } from "@/lib/helpers";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Download } from "lucide-react";

type Row = { id: number; title: string; partner: string; partnerOrg: string | null; division: string | null; outputs: string | null; status: string; startDate: string | null; ownerId: number | null; participantIds: number[] };
const STATUS: Record<string, string> = { ongoing: "进行中", done: "已完成", paused: "已暂停" };

export default function Collaborations() {
  const { can, user } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.collabs.list.useQuery();
  const { data: userOptions } = trpc.users.options.useQuery();
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const editable = can("research.collaborations", "editable");
  const create = trpc.collabs.create.useMutation({ onSuccess: () => utils.collabs.list.invalidate() });
  const update = trpc.collabs.update.useMutation({ onSuccess: () => utils.collabs.list.invalidate() });
  const remove = trpc.collabs.remove.useMutation({ onSuccess: () => utils.collabs.list.invalidate() });

  function save() {
    if (!editing?.title || !editing?.partner) return;
    const payload = { title: editing.title, partner: editing.partner, partnerOrg: editing.partnerOrg ?? "", division: editing.division ?? "", outputs: editing.outputs ?? "", status: (editing.status ?? "ongoing") as "ongoing", startDate: editing.startDate ?? "", ownerId: editing.ownerId ?? user?.id, participantIds: editing.participantIds ?? [] };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader title="合作者科研工作" sub="合作课题、合作方、分工、产出跟踪（仅项目管理员可见）"
        actions={<>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("合作者科研工作", "合作", (data ?? []).map((r) => ({ 课题: r.title, 合作人: r.partner, 单位: r.partnerOrg, 分工: r.division, 产出: r.outputs, 状态: STATUS[r.status] })))}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
          {editable && <Button size="sm" onClick={() => setEditing({ status: "ongoing", ownerId: user?.id, participantIds: [] })}><Plus className="mr-1 h-3.5 w-3.5" />新建合作</Button>}
        </>} />
      {!data?.length ? <EmptyState /> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead><tr><th>合作课题</th><th>合作人</th><th>合作单位</th><th>分工</th><th>产出跟踪</th><th>开始时间</th><th>状态</th>{editable && <th className="w-20">操作</th>}</tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.title}</td><td>{r.partner}</td><td>{r.partnerOrg}</td>
                  <td className="max-w-52"><div className="whitespace-pre-wrap">{r.division}</div></td>
                  <td className="max-w-52"><div className="whitespace-pre-wrap">{r.outputs}</div></td>
                  <td className="tabular-nums">{r.startDate}</td>
                  <td><Pill text={STATUS[r.status] ?? r.status} tone={r.status === "done" ? "green" : r.status === "paused" ? "gray" : "blue"} /></td>
                  {editable && <td className="whitespace-nowrap">
                    <button className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></button>
                    {can("research.collaborations", "manage") && <button className="text-muted-foreground hover:text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5" /></button>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑合作课题" : "新建合作课题"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="合作课题" required><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field></div>
            <Field label="合作人" required><Input value={editing?.partner ?? ""} onChange={(e) => setEditing({ ...editing, partner: e.target.value })} /></Field>
            <Field label="合作单位"><Input value={editing?.partnerOrg ?? ""} onChange={(e) => setEditing({ ...editing, partnerOrg: e.target.value })} /></Field>
            <Field label="牵头人" required><Select value={editing?.ownerId ? String(editing.ownerId) : ""} onValueChange={(v) => setEditing({ ...editing, ownerId: Number(v) })}><SelectTrigger><SelectValue placeholder="选择牵头人" /></SelectTrigger><SelectContent>{userOptions?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="开始时间"><Input type="date" value={editing?.startDate ?? ""} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} /></Field>
            <Field label="状态"><Select value={editing?.status ?? "ongoing"} onValueChange={(v) => setEditing({ ...editing, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></Field>
            <div className="col-span-2"><Field label="分工"><Textarea rows={2} value={editing?.division ?? ""} onChange={(e) => setEditing({ ...editing, division: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="产出跟踪"><Textarea rows={2} value={editing?.outputs ?? ""} onChange={(e) => setEditing({ ...editing, outputs: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="参与人（仅牵头人与参与人可见）"><div className="grid max-h-32 grid-cols-3 gap-2 overflow-y-auto rounded-sm border border-border p-2">{userOptions?.filter((u) => u.id !== editing?.ownerId).map((u) => <label key={u.id} className="flex items-center gap-2 text-[12px]"><Checkbox checked={(editing?.participantIds ?? []).includes(u.id)} onCheckedChange={(ck) => setEditing({ ...editing, participantIds: ck ? [...(editing?.participantIds ?? []), u.id] : (editing?.participantIds ?? []).filter((id) => id !== u.id) })} />{u.name}</label>)}</div></Field></div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
