import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";

const TYPES = ["发明专利", "GF专利", "实用新型", "软件著作权"] as const;
const FLOW = [
  ["writing", "撰写中"], ["external_review", "外审中"], ["revision", "待修改"],
  ["new_external_review", "新一轮外审中"], ["accepted", "接收"], ["granted", "颁证"],
] as const;
type Status = (typeof FLOW)[number][0];
type Row = {
  id: number; title: string; ipType: (typeof TYPES)[number]; agency: string; applicationNo: string | null;
  status: Status; ownerId: number; participantIds: number[]; submitDate: string | null;
  protectionEnd: string | null; note: string | null; fileIds: number[]; daysLeft: number | null;
};
const statusLabel = (s: string) => FLOW.find(([k]) => k === s)?.[1] ?? s;

export default function IpApplications() {
  const { user, can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.ip.list.useQuery();
  const { data: users } = trpc.users.options.useQuery();
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [keyword, setKeyword] = useState("");
  const editable = can("research.ip", "editable");
  const create = trpc.ip.create.useMutation({ onSuccess: () => { utils.ip.list.invalidate(); setEditing(null); }, onError: (e) => alert(e.message) });
  const update = trpc.ip.update.useMutation({ onSuccess: () => { utils.ip.list.invalidate(); utils.achievements.list.invalidate(); setEditing(null); }, onError: (e) => alert(e.message) });
  const remove = trpc.ip.remove.useMutation({ onSuccess: () => utils.ip.list.invalidate(), onError: (e) => alert(e.message) });
  const rows = (data ?? []) as Row[];
  const filtered = rows.filter((r) => `${r.title} ${r.agency} ${r.applicationNo ?? ""}`.toLowerCase().includes(keyword.toLowerCase()));

  function save() {
    if (!editing?.title || !editing.ipType || !editing.agency) return;
    const payload = {
      title: editing.title, ipType: editing.ipType, agency: editing.agency,
      applicationNo: editing.applicationNo ?? "", status: editing.status ?? "writing",
      ownerId: editing.ownerId ?? user?.id, participantIds: editing.participantIds ?? [],
      submitDate: editing.submitDate ?? "", protectionEnd: editing.protectionEnd ?? "",
      note: editing.note ?? "", fileIds: editing.fileIds ?? [],
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
  }

  return <div>
    <PageHeader title="申请知识产权进度" sub="撰写 → 外审 → 修改/新一轮外审 → 接收 → 颁证；申报过程由代理公司操作，颁证后自动归入已获知识产权"
      actions={editable && <Button size="sm" onClick={() => setEditing({ ipType: "发明专利", status: "writing", ownerId: user?.id, participantIds: [], fileIds: [] })}><Plus className="mr-1 h-3.5 w-3.5" />新建申请</Button>} />
    <Input className="mb-3 w-80" placeholder="检索名称 / 代理公司 / 申请号" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
    {!filtered.length ? <EmptyState text="暂无知识产权申请" /> : <div className="space-y-3">
      {filtered.map((r) => <div key={r.id} className="rounded-md border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><span className="font-semibold">{r.title}</span><Pill text={r.ipType} tone="purple" /><Pill text={statusLabel(r.status)} tone={r.status === "granted" ? "green" : "amber"} /></div>
            <div className="mt-1 text-[12px] text-muted-foreground">代理公司：<span className="font-medium text-foreground">{r.agency}</span>{r.applicationNo ? ` · 申请号：${r.applicationNo}` : ""}{r.submitDate ? ` · 申报日：${r.submitDate}` : ""}</div>
            {r.status === "granted" && r.protectionEnd && <div className="mt-1 text-[12px]">保护期至 {r.protectionEnd}{r.daysLeft !== null && <Pill text={r.daysLeft < 0 ? "已到保护期" : `剩余 ${r.daysLeft} 天`} tone={r.daysLeft <= 180 ? "red" : "gray"} />}</div>}
            {r.note && <div className="mt-2 whitespace-pre-wrap text-[12px] text-muted-foreground">{r.note}</div>}
            {r.fileIds.length > 0 && <div className="mt-2"><FileChips ids={r.fileIds} /></div>}
          </div>
          {editable && <div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>{can("research.ip", "manage") && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除该申请？") && remove.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}</div>}
        </div>
      </div>)}
    </div>}

    <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editing?.id ? "编辑" : "新建"}知识产权申请</DialogTitle></DialogHeader>
        <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
          <div className="col-span-2"><Field label="知识产权名称" required><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field></div>
          <Field label="知识产权类型" required><Select value={editing?.ipType ?? "发明专利"} onValueChange={(v) => setEditing({ ...editing, ipType: v as (typeof TYPES)[number] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="代理公司" required><Input value={editing?.agency ?? ""} onChange={(e) => setEditing({ ...editing, agency: e.target.value })} placeholder="负责申报的代理机构全称" /></Field>
          <Field label="当前状态"><Select value={editing?.status ?? "writing"} onValueChange={(v) => setEditing({ ...editing, status: v as Status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FLOW.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="申请号"><Input value={editing?.applicationNo ?? ""} onChange={(e) => setEditing({ ...editing, applicationNo: e.target.value })} /></Field>
          <Field label="申报日期"><Input type="date" value={editing?.submitDate ?? ""} onChange={(e) => setEditing({ ...editing, submitDate: e.target.value })} /></Field>
          <Field label="专利保护期截止日期"><Input type="date" value={editing?.protectionEnd ?? ""} onChange={(e) => setEditing({ ...editing, protectionEnd: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="参与人（仅牵头人与参与人可见）"><div className="grid max-h-32 grid-cols-3 gap-2 overflow-y-auto rounded-sm border border-border p-2">{users?.filter((u) => u.id !== editing?.ownerId).map((u) => <label key={u.id} className="flex items-center gap-2 text-[12px]"><Checkbox checked={(editing?.participantIds ?? []).includes(u.id)} onCheckedChange={(ck) => setEditing({ ...editing, participantIds: ck ? [...(editing?.participantIds ?? []), u.id] : (editing?.participantIds ?? []).filter((id) => id !== u.id) })} />{u.name}</label>)}</div></Field></div>
          <div className="col-span-2"><Field label="进度说明"><Textarea rows={3} value={editing?.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></Field></div>
          <div className="col-span-2"><Field label="申请文书 / 证书"><FileUpload module="ip" compact onUploaded={(id) => setEditing((e) => ({ ...e, fileIds: [...(e?.fileIds ?? []), id] }))} /><FileChips ids={editing?.fileIds ?? []} /></Field></div>
        </div>
        <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.title || !editing.agency} onClick={save}>保存</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
