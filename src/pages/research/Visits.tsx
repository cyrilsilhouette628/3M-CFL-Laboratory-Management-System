// 2.9 学术报告和专家来访管理：海报生成 / 履历检索 / 新闻稿 / 照片归档（≥2张）
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
import { Switch } from "@/components/ui/switch";
import { exportXlsx, downloadText } from "@/lib/helpers";
import { Plus, Pencil, Trash2, Download, ImageIcon, Newspaper, Search, Archive } from "lucide-react";

type Row = {
  id: number; expertName: string; expertOrg: string | null; expertTitle: string | null;
  reportTitle: string; abstract: string | null; reportTime: string | null; location: string | null;
  reception: string | null; hostId: number; hostName: string; photoFileIds: number[];
  posterContent: string | null; newsDraft: string | null; expertBio: string | null;
  isPublic: boolean; status: string;
};
const VISIT_STATUS: Record<string, string> = { planned: "已计划", held: "已举办", archived: "已归档" };

export default function Visits() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.visits.list.useQuery();
  const { data: userOptions } = trpc.users.options.useQuery();
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [viewDoc, setViewDoc] = useState<{ title: string; content: string; filename: string } | null>(null);
  const editable = can("research.visits", "editable");

  const create = trpc.visits.create.useMutation({ onSuccess: () => { utils.visits.list.invalidate(); alert("已保存；接待负责人看板已自动生成接待待办。"); } });
  const update = trpc.visits.update.useMutation({ onSuccess: () => utils.visits.list.invalidate() });
  const remove = trpc.visits.remove.useMutation({ onSuccess: () => utils.visits.list.invalidate() });
  const genPoster = trpc.visits.generatePoster.useMutation({ onSuccess: () => utils.visits.list.invalidate() });
  const genNews = trpc.visits.generateNews.useMutation({ onSuccess: () => utils.visits.list.invalidate() });
  const lookup = trpc.visits.lookupExpert.useMutation({ onSuccess: () => utils.visits.list.invalidate() });
  const archive = trpc.visits.archive.useMutation({
    onSuccess: (r) => { if (r.ok) { utils.visits.list.invalidate(); } else alert(r.message); },
  });

  function save() {
    if (!editing?.expertName || !editing?.reportTitle || !editing?.hostId) return;
    const payload = {
      expertName: editing.expertName, expertOrg: editing.expertOrg ?? "", expertTitle: editing.expertTitle ?? "",
      reportTitle: editing.reportTitle, abstract: editing.abstract ?? "", reportTime: editing.reportTime ?? "",
      location: editing.location ?? "", reception: editing.reception ?? "", hostId: editing.hostId,
      isPublic: !!editing.isPublic,
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader title="学术报告和专家来访管理" sub="接待负责人自动接收待办；海报与新闻稿自动生成（人工确认）；现场照片 ≥2 张方可归档；可公开内容可同步网站"
        actions={<>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("专家来访", "来访", (data ?? []).map((v) => ({ 专家: v.expertName, 单位: v.expertOrg, 报告: v.reportTitle, 时间: v.reportTime, 接待: v.hostName, 状态: VISIT_STATUS[v.status], 公开: v.isPublic ? "是" : "否" })))}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
          {editable && <Button size="sm" onClick={() => setEditing({ isPublic: false })}><Plus className="mr-1 h-3.5 w-3.5" />新增来访</Button>}
        </>} />
      {!data?.length ? <EmptyState /> : (
        <div className="space-y-3">
          {data.map((v) => (
            <div key={v.id} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">{v.expertName}</span>
                    <span className="text-[13px] text-muted-foreground">{v.expertTitle} · {v.expertOrg}</span>
                    <Pill text={VISIT_STATUS[v.status] ?? v.status} tone={v.status === "archived" ? "green" : v.status === "held" ? "blue" : "amber"} />
                    {v.isPublic && <Pill text="可公开" tone="purple" />}
                  </div>
                  <div className="mt-1 text-[13px]">报告题目：{v.reportTitle}</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">时间：{v.reportTime ?? "待定"} · 地点：{v.location ?? "待定"} · 接待负责人：{v.hostName}</div>
                  {v.reception && <div className="mt-1 text-[12px] text-muted-foreground">接待安排：{v.reception}</div>}
                </div>
                {editable && (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => genPoster.mutate({ id: v.id })}><ImageIcon className="mr-1 h-3.5 w-3.5" />生成海报</Button>
                    <Button variant="outline" size="sm" onClick={() => genNews.mutate({ id: v.id })}><Newspaper className="mr-1 h-3.5 w-3.5" />生成新闻稿</Button>
                    <Button variant="outline" size="sm" onClick={() => lookup.mutate({ id: v.id })}><Search className="mr-1 h-3.5 w-3.5" />检索履历</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                    {can("research.visits", "manage") && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: v.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                )}
              </div>
              {v.expertBio && (
                <div className="mt-2 rounded-sm bg-secondary/50 px-3 py-2 text-[12px] whitespace-pre-wrap">{v.expertBio}</div>
              )}
              <div className="mt-3 grid gap-2 border-t border-border pt-3 md:grid-cols-2">
                {v.posterContent && (
                  <div className="rounded-sm border border-border bg-background p-2.5">
                    <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted-foreground">
                      学术海报（自动模板）
                      <span className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setViewDoc({ title: "学术海报", content: v.posterContent!, filename: `海报-${v.expertName}.txt` })}>查看/编辑</Button>
                      </span>
                    </div>
                  </div>
                )}
                {v.newsDraft && (
                  <div className="rounded-sm border border-border bg-background p-2.5">
                    <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted-foreground">
                      新闻稿草稿
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setViewDoc({ title: "新闻稿", content: v.newsDraft!, filename: `新闻稿-${v.expertName}.txt` })}>查看/编辑</Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div>
                  <div className="mb-1 text-[12px] text-muted-foreground">现场照片（{v.photoFileIds.length} 张，归档需 ≥2 张）：</div>
                  <FileChips ids={v.photoFileIds} />
                </div>
                {editable && v.status !== "archived" && (
                  <div className="flex items-center gap-2">
                    <div className="w-56">
                      <FileUpload module="visit" compact onUploaded={(fid) => update.mutate({ id: v.id, photoFileIds: [...v.photoFileIds, fid] })} />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => archive.mutate({ id: v.id })}><Archive className="mr-1 h-3.5 w-3.5" />归档</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑来访记录" : "新增专家来访"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <Field label="专家姓名" required><Input value={editing?.expertName ?? ""} onChange={(e) => setEditing({ ...editing, expertName: e.target.value })} /></Field>
            <Field label="职称"><Input value={editing?.expertTitle ?? ""} onChange={(e) => setEditing({ ...editing, expertTitle: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="单位"><Input value={editing?.expertOrg ?? ""} onChange={(e) => setEditing({ ...editing, expertOrg: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="报告题目" required><Input value={editing?.reportTitle ?? ""} onChange={(e) => setEditing({ ...editing, reportTitle: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="报告摘要"><Textarea rows={3} value={editing?.abstract ?? ""} onChange={(e) => setEditing({ ...editing, abstract: e.target.value })} /></Field></div>
            <Field label="报告时间"><Input type="datetime-local" value={(editing?.reportTime ?? "").replace(" ", "T")} onChange={(e) => setEditing({ ...editing, reportTime: e.target.value.replace("T", " ") })} /></Field>
            <Field label="地点"><Input value={editing?.location ?? ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
            <Field label="接待负责人" required>
              <Select value={editing?.hostId ? String(editing.hostId) : ""} onValueChange={(v) => setEditing({ ...editing, hostId: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
                <SelectContent>{userOptions?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="可公开（同步网站）">
              <div className="pt-1.5"><Switch checked={!!editing?.isPublic} onCheckedChange={(v) => setEditing({ ...editing, isPublic: v })} /></div>
            </Field>
            <div className="col-span-2"><Field label="接待安排 / 新闻稿素材"><Textarea rows={2} value={editing?.reception ?? ""} onChange={(e) => setEditing({ ...editing, reception: e.target.value })} /></Field></div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.expertName || !editing?.reportTitle || !editing?.hostId} onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>

      {/* 文档查看/编辑/导出 */}
      <Dialog open={!!viewDoc} onOpenChange={(o) => !o && setViewDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{viewDoc?.title}</DialogTitle></DialogHeader>
          <Textarea rows={16} value={viewDoc?.content ?? ""} onChange={(e) => setViewDoc(viewDoc && { ...viewDoc, content: e.target.value })} className="font-mono text-[12px]" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => viewDoc && downloadText(viewDoc.filename, viewDoc.content)}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
            <Button onClick={() => { setViewDoc(null); }}>确认</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
