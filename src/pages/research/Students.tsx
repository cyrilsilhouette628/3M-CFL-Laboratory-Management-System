// 人才培养档案：研究生 / 本科生 / 博士后（共用组件，kind 区分；embedded 供研究生培养页内嵌）
import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportXlsx, readXlsx, downloadTemplate } from "@/lib/helpers";
import { Plus, Pencil, Trash2, Download, Upload, Trophy, CheckCircle2, FileSpreadsheet } from "lucide-react";

type Student = {
  id: number; kind: string; name: string; studentNo: string | null; gender: string | null;
  phone: string | null; wechat: string | null; email: string | null; hometown: string | null;
  bachelorSchool: string | null; advisor: string | null; direction: string | null;
  proposalStatus: string | null; midtermStatus: string | null; defenseStatus: string | null;
  files: { label: string; fileId: number }[]; detail: Record<string, string> | null; userId: number | null;
};
type SA = { id: number; studentId: number; type: string; title: string; detail: string | null; date: string | null; status: string };

const SA_TYPES: Record<string, string> = { paper: "发表论文", patent: "已获知识产权", competition: "科技作品竞赛奖励", conference_award: "会议论文奖" };
const FILE_LABELS = ["开题报告", "中期检查报告", "毕业论文", "毕业答辩PPT", "进站申报材料", "出站报告", "其他"];
const NODE_OPTS = ["未开始", "进行中", "已完成"];

const KIND_META = {
  grad: { title: "研究生档案", perm: "training.grads", role: "grad", template: "研究生导入模板", headers: ["姓名", "学号", "性别", "手机号", "微信号", "邮箱", "籍贯", "本科毕业学校", "负责导师", "研究方向"], example: ["张示例", "S2026001", "男", "13800000000", "wxid_demo", "demo@stu.edu.cn", "山东济南", "山东大学", "王教授", "机器学习"] },
  undergrad: { title: "本科生研修档案", perm: "training.undergrads", role: "benyan", template: "本科生导入模板", headers: ["姓名", "学号", "性别", "手机号", "微信号", "邮箱", "籍贯", "负责导师", "研究方向"], example: ["李示例", "B2023001", "女", "13800000000", "wxid_demo", "demo@stu.edu.cn", "江苏南京", "王教授", "数据挖掘"] },
  postdoc: { title: "博士后档案", perm: "training.postdocs", role: "postdoc", template: "博士后导入模板", headers: ["姓名", "性别", "手机号", "邮箱", "合作导师", "研究方向", "进站日期", "预计出站", "在站状态", "国家级课题"], example: ["钱示例", "男", "13800000000", "demo@lab.edu.cn", "王教授", "图神经网络", "2026-09-01", "2028-08-31", "在站", "中国博士后科学基金"] },
} as const;

export default function Students({ kind, embedded }: { kind: "grad" | "undergrad" | "postdoc"; embedded?: boolean }) {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const meta = KIND_META[kind];
  const { data } = trpc.students.list.useQuery({ kind });
  const { data: userOptions } = trpc.users.options.useQuery();
  const [editing, setEditing] = useState<Partial<Student> | null>(null);
  const [achFor, setAchFor] = useState<Student | null>(null);
  const [newAch, setNewAch] = useState<{ type: string; title: string; detail: string; date: string }>({ type: "paper", title: "", detail: "", date: "" });
  const [fileLabel, setFileLabel] = useState<Record<number, string>>({});
  const importRef = useRef<HTMLInputElement>(null);
  const editable = can(meta.perm, "editable") || can("training.grads", "manage");
  const isGrad = kind === "grad";
  const isPostdoc = kind === "postdoc";
  const canCreate = editable && !isPostdoc;

  const list = trpc.students.listAchievements.useQuery({ studentId: achFor?.id ?? -1 }, { enabled: !!achFor });
  const create = trpc.students.create.useMutation({ onSuccess: () => utils.students.list.invalidate() });
  const update = trpc.students.update.useMutation({ onSuccess: () => utils.students.list.invalidate() });
  const remove = trpc.students.remove.useMutation({ onSuccess: () => utils.students.list.invalidate() });
  const batchImport = trpc.students.batchImport.useMutation({ onSuccess: (r) => { utils.students.list.invalidate(); alert(`成功导入 ${r.imported} 条（缺失字段可后期手动补全）`); } });
  const addAch = trpc.students.addAchievement.useMutation({ onSuccess: () => list.refetch() });
  const confirmAch = trpc.students.confirmAchievement.useMutation({ onSuccess: () => { list.refetch(); alert("已确认并自动转入【成果管理】。"); } });

  async function handleImport(f: File) {
    const rows = await readXlsx(f);
    const payload = rows.map((r) => ({
      kind,
      name: String(r["姓名"] ?? "").trim(),
      studentNo: String(r["学号"] ?? ""), gender: String(r["性别"] ?? ""), phone: String(r["手机号"] ?? ""),
      wechat: String(r["微信号"] ?? ""), email: String(r["邮箱"] ?? ""), hometown: String(r["籍贯"] ?? ""),
      bachelorSchool: String(r["本科毕业学校"] ?? ""), advisor: String(r["负责导师"] ?? r["合作导师"] ?? ""), direction: String(r["研究方向"] ?? ""),
      detail: isPostdoc ? { 进站日期: String(r["进站日期"] ?? ""), 预计出站: String(r["预计出站"] ?? ""), 在站状态: String(r["在站状态"] ?? "在站"), 国家级课题: String(r["国家级课题"] ?? "") } : undefined,
    })).filter((r) => r.name);
    if (payload.length === 0) { alert(`未解析到有效行，请使用【下载导入模板】填写后再上传`); return; }
    batchImport.mutate(payload);
  }

  function save() {
    if (!editing?.name) return;
    const payload = {
      kind, name: editing.name, studentNo: editing.studentNo ?? "", gender: editing.gender ?? "",
      phone: editing.phone ?? "", wechat: editing.wechat ?? "", email: editing.email ?? "",
      hometown: editing.hometown ?? "", bachelorSchool: editing.bachelorSchool ?? "", advisor: editing.advisor ?? "",
      direction: editing.direction ?? "", proposalStatus: editing.proposalStatus ?? "未开始",
      midtermStatus: editing.midtermStatus ?? "未开始", defenseStatus: editing.defenseStatus ?? "未开始",
      detail: editing.detail ?? undefined,
      userId: editing.userId ?? undefined,
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  const header = embedded ? null : (
    <PageHeader
      title={kind === "grad" ? "3.1 研究生培养" : kind === "undergrad" ? "3.2 本科生研修" : "3.3 博士后管理"}
      sub={isPostdoc ? "在【用户与权限】新建博士后账号并指定合作导师后自动入册；此处仅维护档案，避免重复建档" : "档案、开题/中期/答辩节点、文件归档、研究成果（确认后自动转入成果管理）；支持模板批量导入"}
      actions={<>
        <Button variant="outline" size="sm" onClick={() => exportXlsx(meta.title, "学生", (data ?? []).map((s) => ({ 姓名: s.name, 学号: s.studentNo, 性别: s.gender, 手机号: s.phone, 邮箱: s.email, 负责导师: s.advisor, 研究方向: s.direction })))}><Download className="mr-1 h-3.5 w-3.5" />导出 Excel</Button>
        {canCreate && <>
          <Button variant="outline" size="sm" onClick={() => downloadTemplate(meta.template, [...meta.headers], [...meta.example])}><FileSpreadsheet className="mr-1 h-3.5 w-3.5" />下载导入模板</Button>
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" />Excel 导入</Button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          <Button size="sm" onClick={() => setEditing({})}><Plus className="mr-1 h-3.5 w-3.5" />新增</Button>
        </>}
      </>} />
  );

  return (
    <div>
      {header}
      {embedded && canCreate && (
        <div className="mb-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate(meta.template, [...meta.headers], [...meta.example])}><FileSpreadsheet className="mr-1 h-3.5 w-3.5" />下载导入模板</Button>
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" />Excel 导入</Button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          <Button size="sm" onClick={() => setEditing({})}><Plus className="mr-1 h-3.5 w-3.5" />新增档案</Button>
        </div>
      )}
      {!data?.length ? <EmptyState /> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead>
              <tr>
                <th>姓名</th>{!isPostdoc && <th>学号</th>}<th>联系方式</th><th>{isPostdoc ? "合作导师" : "负责导师"}</th><th>研究方向</th>
                {isGrad && <><th>开题</th><th>中期</th><th>答辩</th></>}
                {isPostdoc && <><th>进站日期</th><th>预计出站</th><th>在站状态</th><th>国家级课题</th></>}
                <th>文件归档</th><th>研究成果</th>{editable && <th className="w-20">操作</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((s: Student) => (
                <tr key={s.id}>
                  <td className="font-medium whitespace-nowrap">{s.name}<div className="text-[11px] text-muted-foreground">{s.gender}{s.hometown ? ` · ${s.hometown}` : ""}</div></td>
                  {!isPostdoc && <td className="whitespace-nowrap">{s.studentNo}</td>}
                  <td className="text-[12px]">{s.phone}{s.wechat && <div>微信：{s.wechat}</div>}{s.email && <div>{s.email}</div>}</td>
                  <td className="whitespace-nowrap">{s.advisor}</td>
                  <td>{s.direction}</td>
                  {isGrad && <>
                    <td><Pill text={s.proposalStatus ?? "未开始"} tone={s.proposalStatus === "已完成" ? "green" : s.proposalStatus === "进行中" ? "amber" : "gray"} /></td>
                    <td><Pill text={s.midtermStatus ?? "未开始"} tone={s.midtermStatus === "已完成" ? "green" : s.midtermStatus === "进行中" ? "amber" : "gray"} /></td>
                    <td><Pill text={s.defenseStatus ?? "未开始"} tone={s.defenseStatus === "已完成" ? "green" : s.defenseStatus === "进行中" ? "amber" : "gray"} /></td>
                  </>}
                  {isPostdoc && <>
                    <td className="whitespace-nowrap tabular-nums">{s.detail?.["进站日期"]}</td>
                    <td className="whitespace-nowrap tabular-nums">{s.detail?.["预计出站"]}</td>
                    <td><Pill text={s.detail?.["在站状态"] ?? "在站"} tone={s.detail?.["在站状态"] === "已出站" ? "gray" : "green"} /></td>
                    <td className="text-[12px]">{s.detail?.["国家级课题"]}</td>
                  </>}
                  <td className="min-w-48">
                    {s.files.length > 0 && <FileChips ids={s.files.map((f) => f.fileId)} />}
                    {editable && (
                      <div className="mt-1 flex items-center gap-1">
                        <Select value={fileLabel[s.id] ?? FILE_LABELS[0]} onValueChange={(v) => setFileLabel({ ...fileLabel, [s.id]: v })}>
                          <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{FILE_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="w-28">
                          <FileUpload module="training" compact onUploaded={(fid) => update.mutate({ id: s.id, files: [...s.files, { label: fileLabel[s.id] ?? FILE_LABELS[0], fileId: fid }] })} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    <Button variant="outline" size="sm" onClick={() => { setAchFor(s); setNewAch({ type: "paper", title: "", detail: "", date: "" }); }}><Trophy className="mr-1 h-3.5 w-3.5" />成果</Button>
                  </td>
                  {editable && <td className="whitespace-nowrap">
                    <button className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing(s)}><Pencil className="h-3.5 w-3.5" /></button>
                    {can(meta.perm, "manage") && <button className="text-muted-foreground hover:text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: s.id })}><Trash2 className="h-3.5 w-3.5" /></button>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 编辑 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑档案" : `新增${kind === "grad" ? "研究生" : kind === "undergrad" ? "本科生" : "博士后"}`}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
            <Field label="姓名" required><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            {!isPostdoc && <Field label="学号"><Input value={editing?.studentNo ?? ""} onChange={(e) => setEditing({ ...editing, studentNo: e.target.value })} /></Field>}
            <Field label="性别"><Input value={editing?.gender ?? ""} onChange={(e) => setEditing({ ...editing, gender: e.target.value })} /></Field>
            <Field label="手机号"><Input value={editing?.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label="微信号"><Input value={editing?.wechat ?? ""} onChange={(e) => setEditing({ ...editing, wechat: e.target.value })} /></Field>
            <Field label="邮箱"><Input value={editing?.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="籍贯"><Input value={editing?.hometown ?? ""} onChange={(e) => setEditing({ ...editing, hometown: e.target.value })} /></Field>
            {isGrad && <Field label="本科毕业学校"><Input value={editing?.bachelorSchool ?? ""} onChange={(e) => setEditing({ ...editing, bachelorSchool: e.target.value })} /></Field>}
            <Field label={isPostdoc ? "合作导师" : "负责导师"}><Input value={editing?.advisor ?? ""} onChange={(e) => setEditing({ ...editing, advisor: e.target.value })} /></Field>
            <Field label="研究方向"><Input value={editing?.direction ?? ""} onChange={(e) => setEditing({ ...editing, direction: e.target.value })} /></Field>
            <Field label="关联登录账号">
              <Select value={editing?.userId ? String(editing.userId) : ""} onValueChange={(v) => setEditing({ ...editing, userId: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="可选" /></SelectTrigger>
                <SelectContent>{userOptions?.filter((u) => u.role === meta.role).map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {isGrad && (["proposalStatus", "midtermStatus", "defenseStatus"] as const).map((k) => (
              <Field key={k} label={k === "proposalStatus" ? "开题情况" : k === "midtermStatus" ? "中期情况" : "答辩情况"}>
                <Select value={(editing?.[k] as string) ?? "未开始"} onValueChange={(v) => setEditing({ ...editing, [k]: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NODE_OPTS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            ))}
            {isPostdoc && (["进站日期", "预计出站", "在站状态", "国家级课题"] as const).map((k) => (
              <Field key={k} label={k}>
                <Input
                  type={k.includes("日期") || k === "预计出站" ? "date" : "text"}
                  value={editing?.detail?.[k] ?? ""}
                  onChange={(e) => setEditing({ ...editing, detail: { ...(editing?.detail ?? {}), [k]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.name} onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>

      {/* 研究成果 */}
      <Dialog open={!!achFor} onOpenChange={(o) => !o && setAchFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>研究成果 — {achFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {list.data?.length === 0 && <div className="py-4 text-center text-[12px] text-muted-foreground">暂无成果记录</div>}
            {list.data?.map((a: SA) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-sm border border-border px-3 py-2 text-[13px]">
                <div>
                  <span className="mr-2"><Pill text={SA_TYPES[a.type]} tone="blue" /></span>
                  <span className="font-medium">{a.title}</span>
                  <span className="ml-2 text-[12px] text-muted-foreground">{a.date}</span>
                </div>
                {a.status === "confirmed" ? <Pill text="已转入成果管理" tone="green" /> : (
                  can(meta.perm, "manage") && <Button size="sm" variant="outline" onClick={() => confirmAch.mutate({ id: a.id })}><CheckCircle2 className="mr-1 h-3 w-3" />确认并转入成果管理</Button>
                )}
              </div>
            ))}
            {editable && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="text-[12px] font-medium text-muted-foreground">登记新成果（管理员确认后自动转入成果管理）</div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newAch.type} onValueChange={(v) => setNewAch({ ...newAch, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(SA_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="date" value={newAch.date} onChange={(e) => setNewAch({ ...newAch, date: e.target.value })} />
                </div>
                <Input placeholder="成果名称" value={newAch.title} onChange={(e) => setNewAch({ ...newAch, title: e.target.value })} />
                <Input placeholder="说明（可选）" value={newAch.detail} onChange={(e) => setNewAch({ ...newAch, detail: e.target.value })} />
                <div className="flex justify-end">
                  <Button size="sm" disabled={!newAch.title} onClick={() => { addAch.mutate({ studentId: achFor!.id, type: newAch.type as "paper", title: newAch.title, detail: newAch.detail, date: newAch.date }); setNewAch({ type: "paper", title: "", detail: "", date: "" }); }}>登记</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
