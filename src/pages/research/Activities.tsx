// 2.8 学术活动管理：会议 + 参会人员指派（自动待办）+ 报告记录
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { exportXlsx } from "@/lib/helpers";
import { Plus, Pencil, Trash2, Download, Mic } from "lucide-react";

type Report = { type: string; titleCn: string; titleEn?: string; session?: string; speakers?: string; abstract?: string; paperNo?: string; evidenceFileIds?: number[]; travel?: { transport?: string; hotel?: string; cost?: string } };
type Row = {
  id: number; nameCn: string; nameEn: string | null; startDate: string | null; endDate: string | null;
  location: string | null; url: string | null; submitDeadline: string | null; regDeadline: string | null;
  attendeeIds: number[]; attendeeNames: string[]; abstracts: string | null; submissionRecord: string | null; reports: Report[];
};
const REPORT_TYPES = ["大会邀请报告", "分会邀请报告", "口头报告", "海报"];

export default function Activities() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.activities.list.useQuery();
  const { data: userOptions } = trpc.users.options.useQuery();
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [reportFor, setReportFor] = useState<Row | null>(null);
  const [report, setReport] = useState<Report>({ type: "口头报告", titleCn: "" });
  const editable = can("research.activities", "editable");

  const create = trpc.activities.create.useMutation({ onSuccess: () => { utils.activities.list.invalidate(); alert("已保存；参会人员看板已自动生成参会待办。"); } });
  const update = trpc.activities.update.useMutation({ onSuccess: () => utils.activities.list.invalidate() });
  const remove = trpc.activities.remove.useMutation({ onSuccess: () => utils.activities.list.invalidate() });
  const addReport = trpc.activities.addReport.useMutation({ onSuccess: () => { utils.activities.list.invalidate(); setReportFor(null); } });

  function save() {
    if (!editing?.nameCn) return;
    const payload = {
      nameCn: editing.nameCn, nameEn: editing.nameEn ?? "", startDate: editing.startDate ?? "", endDate: editing.endDate ?? "",
      location: editing.location ?? "", url: editing.url ?? "", submitDeadline: editing.submitDeadline ?? "", regDeadline: editing.regDeadline ?? "",
      attendeeIds: editing.attendeeIds ?? [], abstracts: editing.abstracts ?? "", submissionRecord: editing.submissionRecord ?? "",
      reports: (editing.reports ?? []) as Report[],
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader title="学术活动管理" sub="学术会议信息与投稿/注册节点；指定参会人员自动生成待办；保存会议摘要与学术报告记录"
        actions={<>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("学术活动", "活动", (data ?? []).map((a) => ({ 会议: a.nameCn, 时间: a.startDate, 地点: a.location, 投稿截止: a.submitDeadline, 注册截止: a.regDeadline, 参会: a.attendeeNames.join("、"), 报告数: a.reports.length })))}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
          {editable && <Button size="sm" onClick={() => setEditing({ attendeeIds: [], reports: [] })}><Plus className="mr-1 h-3.5 w-3.5" />新增活动</Button>}
        </>} />
      {!data?.length ? <EmptyState /> : (
        <div className="space-y-3">
          {data.map((a) => (
            <div key={a.id} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">{a.nameCn}{a.nameEn && <span className="ml-2 text-[13px] font-normal text-muted-foreground">{a.nameEn}</span>}</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">
                    {a.startDate} ~ {a.endDate} · {a.location}
                    {a.url && <> · <a className="text-primary hover:underline" href={a.url} target="_blank" rel="noreferrer">官网</a></>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.submitDeadline && <Pill text={`投稿截止 ${a.submitDeadline}`} tone="amber" />}
                    {a.regDeadline && <Pill text={`注册截止 ${a.regDeadline}`} tone="blue" />}
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted-foreground">参会人员：{a.attendeeNames.join("、") || "未指定"}</div>
                  {a.submissionRecord && <div className="mt-1 text-[12px]">投稿记录：{a.submissionRecord}</div>}
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" onClick={() => { setReportFor(a); setReport({ type: "口头报告", titleCn: "" }); }}><Mic className="mr-1 h-3.5 w-3.5" />添加报告</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    {can("research.activities", "manage") && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: a.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                )}
              </div>
              {a.reports.length > 0 && (
                <div className="mt-3 border-t border-border pt-2.5">
                  <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">学术报告记录（{a.reports.length}）</div>
                  {a.reports.map((r, i) => (
                    <div key={i} className="mb-1.5 rounded-sm border border-border bg-background px-2.5 py-2 text-[12px]">
                      <span className="mr-2"><Pill text={r.type} tone="purple" /></span>
                      <span className="font-medium">{r.titleCn}</span>
                      {r.speakers && <span className="ml-2 text-muted-foreground">报告人：{r.speakers}</span>}
                      {r.paperNo && <span className="ml-2 text-muted-foreground">编号：{r.paperNo}</span>}
                      {r.travel && (r.travel.transport || r.travel.hotel || r.travel.cost) && (
                        <div className="mt-1 text-muted-foreground">差旅：{[r.travel.transport, r.travel.hotel, r.travel.cost].filter(Boolean).join(" / ")}</div>
                      )}
                      {r.evidenceFileIds && r.evidenceFileIds.length > 0 && <div className="mt-1"><FileChips ids={r.evidenceFileIds} /></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 活动编辑 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑学术活动" : "新增学术活动"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <Field label="会议名称（中）" required><Input value={editing?.nameCn ?? ""} onChange={(e) => setEditing({ ...editing, nameCn: e.target.value })} /></Field>
            <Field label="会议名称（英）"><Input value={editing?.nameEn ?? ""} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} /></Field>
            <Field label="开始日期"><Input type="date" value={editing?.startDate ?? ""} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} /></Field>
            <Field label="结束日期"><Input type="date" value={editing?.endDate ?? ""} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} /></Field>
            <Field label="地点"><Input value={editing?.location ?? ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
            <Field label="网址"><Input value={editing?.url ?? ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} /></Field>
            <Field label="投稿截止日期"><Input type="date" value={editing?.submitDeadline ?? ""} onChange={(e) => setEditing({ ...editing, submitDeadline: e.target.value })} /></Field>
            <Field label="注册截止日期"><Input type="date" value={editing?.regDeadline ?? ""} onChange={(e) => setEditing({ ...editing, regDeadline: e.target.value })} /></Field>
            <div className="col-span-2">
              <div className="mb-1 text-[12px] font-medium text-muted-foreground">参会人员（指定后自动生成待办）</div>
              <div className="flex max-h-28 flex-wrap gap-x-3 gap-y-1 overflow-y-auto rounded-sm border border-border p-2">
                {userOptions?.map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-[12px]">
                    <Checkbox checked={(editing?.attendeeIds ?? []).includes(u.id)} onCheckedChange={() => {
                      const cur = editing?.attendeeIds ?? [];
                      setEditing({ ...editing, attendeeIds: cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id] });
                    }} /> {u.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="col-span-2"><Field label="会议摘要"><Textarea rows={2} value={editing?.abstracts ?? ""} onChange={(e) => setEditing({ ...editing, abstracts: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="论文投稿记录"><Textarea rows={2} value={editing?.submissionRecord ?? ""} onChange={(e) => setEditing({ ...editing, submissionRecord: e.target.value })} /></Field></div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.nameCn} onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>

      {/* 报告记录 */}
      <Dialog open={!!reportFor} onOpenChange={(o) => !o && setReportFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>添加学术报告 — {reportFor?.nameCn}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <Field label="报告类型">
              <Select value={report.type} onValueChange={(v) => setReport({ ...report, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REPORT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="报告人及共同作者"><Input value={report.speakers ?? ""} onChange={(e) => setReport({ ...report, speakers: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="报告题目（中）" required><Input value={report.titleCn} onChange={(e) => setReport({ ...report, titleCn: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="报告题目（英）"><Input value={report.titleEn ?? ""} onChange={(e) => setReport({ ...report, titleEn: e.target.value })} /></Field></div>
            <Field label="分会名称"><Input value={report.session ?? ""} onChange={(e) => setReport({ ...report, session: e.target.value })} /></Field>
            <Field label="论文编号 / DOI"><Input value={report.paperNo ?? ""} onChange={(e) => setReport({ ...report, paperNo: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="报告摘要"><Textarea rows={2} value={report.abstract ?? ""} onChange={(e) => setReport({ ...report, abstract: e.target.value })} /></Field></div>
            <Field label="差旅·交通"><Input value={report.travel?.transport ?? ""} onChange={(e) => setReport({ ...report, travel: { ...report.travel, transport: e.target.value } })} /></Field>
            <Field label="差旅·住宿"><Input value={report.travel?.hotel ?? ""} onChange={(e) => setReport({ ...report, travel: { ...report.travel, hotel: e.target.value } })} /></Field>
            <Field label="差旅·费用"><Input value={report.travel?.cost ?? ""} onChange={(e) => setReport({ ...report, travel: { ...report.travel, cost: e.target.value } })} /></Field>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReportFor(null)}>取消</Button>
            <Button disabled={!report.titleCn} onClick={() => addReport.mutate({ id: reportFor!.id, report })}>保存报告记录</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
