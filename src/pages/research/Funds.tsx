// 经费管理（V4 起并入【科研项目管理】页，作为内嵌页签；科研与财务助理视角）
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field, Money } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUND_SUBJECTS } from "@contracts/constants";
import { exportXlsx } from "@/lib/helpers";
import { Plus, Pencil, Trash2, Download, AlertTriangle, Banknote, Receipt, Users, ArrowRightLeft } from "lucide-react";

type Fund = {
  id: number; projectId: number | null; projectCode: string | null; projectName: string; source: string | null; totalAmount: number;
  budgets: { subject: string; amount: number }[];
  arrivals: { plannedDate: string; plannedAmount: number; actualDate?: string; actualAmount?: number }[];
  expenses: { date: string; subject: string; amount: number; description: string; fileIds?: number[] }[];
  laborPayments: { payee: string; month: string; amount: number; receiptFileId?: number }[];
  transfers: { targetOrg: string; amount: number; date: string; docFileId?: number }[];
  spent: number; arrived: number; budgetTotal: number;
  subjectExec: { subject: string; budget: number; used: number; rate: number }[];
  warnings: string[];
};

export default function Funds({ embedded }: { embedded?: boolean } = {}) {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.funds.list.useQuery();
  const { data: projectList } = trpc.projects.list.useQuery(undefined, { retry: false });
  const editable = can("research.projects", "editable");
  const [editing, setEditing] = useState<Partial<Fund> | null>(null);
  const [flowFor, setFlowFor] = useState<{ fund: Fund; kind: "arrival" | "expense" | "labor" | "transfer" } | null>(null);
  const [flow, setFlow] = useState<Record<string, string | number | undefined>>({});
  const [flowFileId, setFlowFileId] = useState<number | undefined>();

  const create = trpc.funds.create.useMutation({ onSuccess: () => utils.funds.list.invalidate() });
  const update = trpc.funds.update.useMutation({ onSuccess: () => utils.funds.list.invalidate() });
  const remove = trpc.funds.remove.useMutation({ onSuccess: () => utils.funds.list.invalidate() });
  const addArrival = trpc.funds.addArrival.useMutation({ onSuccess: () => utils.funds.list.invalidate() });
  const addExpense = trpc.funds.addExpense.useMutation({ onSuccess: () => utils.funds.list.invalidate() });
  const addLabor = trpc.funds.addLabor.useMutation({ onSuccess: () => utils.funds.list.invalidate() });
  const addTransfer = trpc.funds.addTransfer.useMutation({ onSuccess: () => utils.funds.list.invalidate() });

  function saveCard() {
    if (!editing?.projectName) return;
    const payload = {
      projectName: editing.projectName, projectCode: editing.projectCode ?? "", source: editing.source ?? "",
      totalAmount: editing.totalAmount ?? 0, budgets: editing.budgets ?? FUND_SUBJECTS.map((s) => ({ subject: s, amount: 0 })),
      projectId: editing.projectId ?? undefined,
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  function saveFlow() {
    if (!flowFor) return;
    const id = flowFor.fund.id;
    if (flowFor.kind === "arrival") {
      if (!flow.plannedDate || !flow.plannedAmount) return;
      addArrival.mutate({ id, plannedDate: String(flow.plannedDate), plannedAmount: Number(flow.plannedAmount), actualDate: flow.actualDate ? String(flow.actualDate) : undefined, actualAmount: flow.actualAmount ? Number(flow.actualAmount) : undefined });
    } else if (flowFor.kind === "expense") {
      if (!flow.date || !flow.subject || !flow.amount) return;
      addExpense.mutate({ id, date: String(flow.date), subject: String(flow.subject), amount: Number(flow.amount), description: String(flow.description ?? ""), fileIds: flowFileId ? [flowFileId] : [] });
    } else if (flowFor.kind === "labor") {
      if (!flow.payee || !flow.month || !flow.amount) return;
      addLabor.mutate({ id, payee: String(flow.payee), month: String(flow.month), amount: Number(flow.amount), receiptFileId: flowFileId });
    } else {
      if (!flow.targetOrg || !flow.amount || !flow.date) return;
      addTransfer.mutate({ id, targetOrg: String(flow.targetOrg), amount: Number(flow.amount), date: String(flow.date), docFileId: flowFileId });
    }
    setFlowFor(null); setFlow({}); setFlowFileId(undefined);
  }

  function exportFund(f: Fund) {
    const rows = [
      ...f.expenses.map((e) => ({ 类型: "报销", 日期: e.date, 科目: e.subject, 金额: e.amount, 说明: e.description })),
      ...f.laborPayments.map((l) => ({ 类型: "劳务费", 日期: l.month, 科目: "劳务费", 金额: l.amount, 说明: `发放给 ${l.payee}` })),
      ...f.transfers.map((t) => ({ 类型: "外拨", 日期: t.date, 科目: "外拨经费", 金额: t.amount, 说明: `拨往 ${t.targetOrg}` })),
      ...f.arrivals.map((a) => ({ 类型: "到账", 日期: a.actualDate ?? a.plannedDate, 科目: "到账", 金额: a.actualAmount ?? a.plannedAmount, 说明: a.actualDate ? "实际到账" : "计划到账" })),
    ];
    exportXlsx(`经费执行-${f.projectName}`, "经费执行", rows);
  }

  return (
    <div>
      {!embedded && <PageHeader title="经费管理" sub="经费台账 · 预算科目执行率 · 到账管理 · 报销票据归档 · 劳务费 · 外拨经费 · 自动预警 · 审计导出" />}
      {editable && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setEditing({ totalAmount: 0, budgets: FUND_SUBJECTS.map((s) => ({ subject: s, amount: 0 })) })}><Plus className="mr-1 h-3.5 w-3.5" />新建经费卡</Button>
        </div>
      )}
      {!data?.length ? <EmptyState text="暂无经费卡" /> : (
        <div className="space-y-4">
          {data.map((f) => (
            <div key={f.id} className="rounded-md border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold">{f.projectName}</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">项目号：{f.projectCode || "—"} · 来源：{f.source || "—"} · 总经费 <Money n={f.totalAmount} /> 元</div>
                </div>
                <div className="flex gap-1.5">
                  {editable && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => { setFlowFor({ fund: f, kind: "arrival" }); setFlow({}); setFlowFileId(undefined); }}><Banknote className="mr-1 h-3.5 w-3.5" />到账</Button>
                      <Button variant="outline" size="sm" onClick={() => { setFlowFor({ fund: f, kind: "expense" }); setFlow({}); setFlowFileId(undefined); }}><Receipt className="mr-1 h-3.5 w-3.5" />报销</Button>
                      <Button variant="outline" size="sm" onClick={() => { setFlowFor({ fund: f, kind: "labor" }); setFlow({}); setFlowFileId(undefined); }}><Users className="mr-1 h-3.5 w-3.5" />劳务费</Button>
                      <Button variant="outline" size="sm" onClick={() => { setFlowFor({ fund: f, kind: "transfer" }); setFlow({}); setFlowFileId(undefined); }}><ArrowRightLeft className="mr-1 h-3.5 w-3.5" />外拨</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(f)}><Pencil className="h-3.5 w-3.5" /></Button>
                      {can("research.projects", "manage") && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("确认删除该经费卡？") && remove.mutate({ id: f.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => exportFund(f)}><Download className="mr-1 h-3.5 w-3.5" />导出执行表</Button>
                </div>
              </div>

              {f.warnings.length > 0 && (
                <div className="mt-3 rounded-sm border border-amber-700/30 bg-amber-600/5 px-3 py-2">
                  {f.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[12px] text-amber-900"><AlertTriangle className="h-3 w-3" />{w}</div>
                  ))}
                </div>
              )}

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {/* 预算科目执行 */}
                <div>
                  <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">预算科目执行（已执行 <Money n={f.spent} /> / 预算 <Money n={f.budgetTotal} /> 元）</div>
                  <div className="space-y-1.5">
                    {f.subjectExec.map((s) => (
                      <div key={s.subject} className="grid grid-cols-[130px_1fr_86px] items-center gap-2 text-[12px]">
                        <span className="truncate">{s.subject}</span>
                        <div className="h-1.5 rounded-full bg-secondary"><div className={`h-full rounded-full ${s.rate > 90 ? "bg-red-700/80" : s.rate < 20 ? "bg-amber-600/80" : "bg-primary/80"}`} style={{ width: `${Math.min(100, s.rate)}%` }} /></div>
                        <span className="text-right tabular-nums text-muted-foreground"><Money n={s.used} /> / {s.rate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 到账与流水 */}
                <div className="space-y-2">
                  <div className="text-[12px] font-medium text-muted-foreground">到账记录（实际 <Money n={f.arrived} /> 元）</div>
                  {f.arrivals.map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12px]">
                      <span>计划 {a.plannedDate} · <Money n={a.plannedAmount} /> 元</span>
                      {a.actualDate ? <Pill text={`已到账 ${a.actualDate}`} tone="green" /> : <Pill text="未到账" tone="amber" />}
                    </div>
                  ))}
                  <div className="text-[12px] font-medium text-muted-foreground">报销 / 劳务 / 外拨流水</div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto">
                    {f.expenses.map((e, i) => (
                      <div key={`e${i}`} className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12px]">
                        <div className="flex justify-between"><span>{e.date} · {e.subject} · {e.description}</span><span className="tabular-nums"><Money n={e.amount} /> 元</span></div>
                        {e.fileIds && e.fileIds.length > 0 && <div className="mt-1"><FileChips ids={e.fileIds} /></div>}
                      </div>
                    ))}
                    {f.laborPayments.map((l, i) => (
                      <div key={`l${i}`} className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12px]">
                        <div className="flex justify-between"><span>劳务费 · {l.payee} · {l.month}</span><span className="tabular-nums"><Money n={l.amount} /> 元</span></div>
                        {l.receiptFileId && <div className="mt-1"><FileChips ids={[l.receiptFileId]} /></div>}
                      </div>
                    ))}
                    {f.transfers.map((t, i) => (
                      <div key={`t${i}`} className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12px]">
                        <div className="flex justify-between"><span>外拨 · {t.targetOrg} · {t.date}</span><span className="tabular-nums"><Money n={t.amount} /> 元</span></div>
                        {t.docFileId && <div className="mt-1"><FileChips ids={[t.docFileId]} /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 经费卡编辑 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑经费卡" : "新建经费卡"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <div className="col-span-2"><Field label="项目名称" required><Input value={editing?.projectName ?? ""} onChange={(e) => setEditing({ ...editing, projectName: e.target.value })} /></Field></div>
            <Field label="项目号"><Input value={editing?.projectCode ?? ""} onChange={(e) => setEditing({ ...editing, projectCode: e.target.value })} /></Field>
            <Field label="经费来源"><Input value={editing?.source ?? ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} /></Field>
            <Field label="总经费（元）"><Input type="number" value={editing?.totalAmount ?? 0} onChange={(e) => setEditing({ ...editing, totalAmount: Number(e.target.value) })} /></Field>
            <Field label="关联项目">
              <Select value={editing?.projectId ? String(editing.projectId) : ""} onValueChange={(v) => setEditing({ ...editing, projectId: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="选择项目（可选）" /></SelectTrigger>
                <SelectContent>{projectList?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="col-span-2">
              <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">预算科目（金额：元）</div>
              {(editing?.budgets ?? []).map((b, i) => (
                <div key={i} className="mb-1.5 flex items-center gap-2">
                  <Input className="flex-1" value={b.subject} onChange={(e) => setEditing({ ...editing, budgets: editing!.budgets!.map((x, j) => j === i ? { ...x, subject: e.target.value } : x) })} />
                  <Input type="number" className="w-36" value={b.amount} onChange={(e) => setEditing({ ...editing, budgets: editing!.budgets!.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x) })} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setEditing({ ...editing, budgets: [...(editing?.budgets ?? []), { subject: "自定义科目", amount: 0 }] })}><Plus className="mr-1 h-3 w-3" />添加科目</Button>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.projectName} onClick={saveCard}>保存</Button></div>
        </DialogContent>
      </Dialog>

      {/* 流水登记 */}
      <Dialog open={!!flowFor} onOpenChange={(o) => !o && setFlowFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>
            {flowFor?.kind === "arrival" ? "登记到账" : flowFor?.kind === "expense" ? "登记报销" : flowFor?.kind === "labor" ? "劳务费发放" : "外拨经费"} — {flowFor?.fund.projectName}
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            {flowFor?.kind === "arrival" && (<>
              <Field label="计划到账日期" required><Input type="date" value={flow.plannedDate ?? ""} onChange={(e) => setFlow({ ...flow, plannedDate: e.target.value })} /></Field>
              <Field label="计划金额（元）" required><Input type="number" value={flow.plannedAmount ?? ""} onChange={(e) => setFlow({ ...flow, plannedAmount: Number(e.target.value) })} /></Field>
              <Field label="实际到账日期"><Input type="date" value={flow.actualDate ?? ""} onChange={(e) => setFlow({ ...flow, actualDate: e.target.value })} /></Field>
              <Field label="实际金额（元）"><Input type="number" value={flow.actualAmount ?? ""} onChange={(e) => setFlow({ ...flow, actualAmount: Number(e.target.value) })} /></Field>
            </>)}
            {flowFor?.kind === "expense" && (<>
              <Field label="报销日期" required><Input type="date" value={flow.date ?? ""} onChange={(e) => setFlow({ ...flow, date: e.target.value })} /></Field>
              <Field label="预算科目" required>
                <Select value={flow.subject ? String(flow.subject) : ""} onValueChange={(v) => setFlow({ ...flow, subject: v })}>
                  <SelectTrigger><SelectValue placeholder="选择科目" /></SelectTrigger>
                  <SelectContent>{flowFor.fund.budgets.map((b) => <SelectItem key={b.subject} value={b.subject}>{b.subject}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="金额（元）" required><Input type="number" value={flow.amount ?? ""} onChange={(e) => setFlow({ ...flow, amount: Number(e.target.value) })} /></Field>
              <Field label="说明"><Input value={flow.description ?? ""} onChange={(e) => setFlow({ ...flow, description: e.target.value })} /></Field>
              <Field label="票据 / 合同扫描件">{flowFileId ? <FileChips ids={[flowFileId]} /> : <FileUpload module="fund" compact onUploaded={(fid) => setFlowFileId(fid)} />}</Field>
            </>)}
            {flowFor?.kind === "labor" && (<>
              <Field label="发放对象" required><Input value={flow.payee ?? ""} onChange={(e) => setFlow({ ...flow, payee: e.target.value })} /></Field>
              <Field label="所属月份" required><Input type="month" value={flow.month ?? ""} onChange={(e) => setFlow({ ...flow, month: e.target.value })} /></Field>
              <Field label="金额（元）" required><Input type="number" value={flow.amount ?? ""} onChange={(e) => setFlow({ ...flow, amount: Number(e.target.value) })} /></Field>
              <Field label="签收凭证">{flowFileId ? <FileChips ids={[flowFileId]} /> : <FileUpload module="fund" compact onUploaded={(fid) => setFlowFileId(fid)} />}</Field>
            </>)}
            {flowFor?.kind === "transfer" && (<>
              <Field label="拨出单位" required><Input value={flow.targetOrg ?? ""} onChange={(e) => setFlow({ ...flow, targetOrg: e.target.value })} /></Field>
              <Field label="金额（元）" required><Input type="number" value={flow.amount ?? ""} onChange={(e) => setFlow({ ...flow, amount: Number(e.target.value) })} /></Field>
              <Field label="日期" required><Input type="date" value={flow.date ?? ""} onChange={(e) => setFlow({ ...flow, date: e.target.value })} /></Field>
              <Field label="依据文件">{flowFileId ? <FileChips ids={[flowFileId]} /> : <FileUpload module="fund" compact onUploaded={(fid) => setFlowFileId(fid)} />}</Field>
            </>)}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setFlowFor(null)}>取消</Button><Button onClick={saveFlow}>保存</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
