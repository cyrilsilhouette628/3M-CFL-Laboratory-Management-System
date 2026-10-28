// 6.1 用户与权限：身份角色 + 管理标志、启停、密码重置、模板批量导入、权限档×子模块矩阵
import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, Field } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ROLES, ROLE_LABELS, PERMISSION_TREE, PERM_LEVELS, PERM_LEVEL_LABELS,
  PERM_PROFILES, PROFILE_LABELS, USER_IMPORT_COLUMNS, USER_FIELD_LABELS, type Role, type PermLevel,
} from "@contracts/constants";
import { exportXlsx, readXlsx, downloadTemplate } from "@/lib/helpers";
import { Plus, Pencil, Trash2, KeyRound, Upload, Download, FileSpreadsheet } from "lucide-react";

type UserRow = {
  id: number; username: string; name: string; role: string; isAdmin: boolean; title: string | null;
  email: string | null; phone: string | null; password?: string;
  researchDirection: string | null; orcid: string | null; homepage: string | null; active: boolean;
  idCard?: string | null; mainCampus?: string | null; campus?: string | null;
  building?: string | null; room?: string | null;
  enrollYear?: number | null; expectedGradYear?: number | null;
  restricted?: boolean;
  gender?: string | null; birthDate?: string | null; staffNo?: string | null;
  degree?: string | null; almaMater?: string | null; politicalStatus?: string | null; joinDate?: string | null;
  advisorIds?: number[]; advisorNames?: string[]; menteeNames?: string[];
};

// V5 需求 7/8：模板表头由 USER_IMPORT_COLUMNS 单点常量驱动（与创建表单、个人资料字段保持一致）
const HEADER_OF: Record<string, string> = {
  username: "用户名", password: "初始密码", name: "姓名", role: "角色", isAdmin: "是否管理员",
  advisorIds: "指导教师（多个用、分隔，第一为主负责导师）",
};
const IMPORT_HEADERS = USER_IMPORT_COLUMNS.map((c) => HEADER_OF[c] ?? USER_FIELD_LABELS[c] ?? c);
const IMPORT_EXAMPLE = ["zhangsan", "", "张示例", "研究生", "否", "", "demo@stu.edu.cn", "13800000000", "机器学习",
  "110101200001011234", "男", "2000-01-01", "2026123456", "学士", "某某大学", "共青团员", "2026-09-01",
  "主校区", "主校区", "逸夫楼", "301", "2026", "2029", "王导师、李导师"];

function maskIdCard(v?: string | null) {
  if (!v) return "—";
  return v.length > 8 ? `${v.slice(0, 4)}${"*".repeat(v.length - 8)}${v.slice(-4)}` : "****";
}

export default function UsersAdmin() {
  const { user: me, can } = useAuth();
  const isSuperAdmin = me?.role === "super_admin"; // V11：非超管管理员仅能添加/管理自己名下的学生
  const utils = trpc.useUtils();
  const { data } = trpc.users.list.useQuery();
  const permsQuery = trpc.users.getPermissions.useQuery();
  const [editing, setEditing] = useState<Partial<UserRow> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const manageable = can("config.users", "manage");

  const create = trpc.users.create.useMutation({ onSuccess: () => utils.users.list.invalidate() });
  const update = trpc.users.update.useMutation({ onSuccess: () => utils.users.list.invalidate() });
  const toggleActive = trpc.users.toggleActive.useMutation({ onSuccess: () => utils.users.list.invalidate() });
  const setRestricted = trpc.users.setRestricted.useMutation({ onSuccess: () => utils.users.list.invalidate() });
  const remove = trpc.users.remove.useMutation({ onSuccess: () => utils.users.list.invalidate() });
  const resetPwd = trpc.users.resetPassword.useMutation({ onSuccess: () => alert("已重置为初始密码 123456") });
  const batchImport = trpc.users.batchImport.useMutation({ onSuccess: (r) => { utils.users.list.invalidate(); alert(`导入完成：新增 ${r.created} / 共 ${r.total} 条（重复用户名已跳过，缺失字段可后期补全）`); } });
  const setPerm = trpc.users.setPermission.useMutation({ onSuccess: () => { permsQuery.refetch(); utils.users.myPermissions.invalidate(); } });

  async function handleImport(f: File) {
    const rows = await readXlsx(f);
    const payload = rows.map((r) => ({
      username: String(r["用户名"] ?? "").trim(),
      name: String(r["姓名"] ?? "").trim(),
      role: String(r["角色"] ?? "访客").trim() || "访客",
      isAdmin: ["是", "true", "1", "Y"].includes(String(r["是否管理员"] ?? "").trim()),
      title: String(r["职称"] ?? ""),
      email: String(r["邮箱"] ?? ""), phone: String(r["手机号"] ?? ""),
      researchDirection: String(r["科研方向"] ?? ""),
      idCard: String(r["身份证号"] ?? "") || undefined,
      gender: String(r["性别"] ?? "") || undefined,
      birthDate: String(r["出生日期"] ?? "") || undefined,
      staffNo: String(r["学号/工号"] ?? "") || undefined,
      degree: String(r["学位/学历"] ?? "") || undefined,
      almaMater: String(r["毕业院校"] ?? "") || undefined,
      politicalStatus: String(r["政治面貌"] ?? "") || undefined,
      joinDate: String(r["进组日期"] ?? "") || undefined,
      mainCampus: String(r["人事关系所在校区"] ?? "") || undefined,
      campus: String(r["当前所在校区"] ?? "") || undefined,
      building: String(r["楼宇"] ?? "") || undefined,
      room: String(r["房间号"] ?? "") || undefined,
      enrollYear: Number(r["入学年份"]) || undefined,
      expectedGradYear: Number(r["预计毕业年份"]) || undefined,
      // 指导教师列：按姓名解析为 ID（与系统内用户一致性检查）
      advisorIds: String(r[HEADER_OF.advisorIds] ?? "")
        .split(/[、,，;；]/).map((x) => x.trim()).filter(Boolean)
        .map((n) => (data ?? []).find((u: UserRow) => u.name === n)?.id).filter((x): x is number => !!x),
      password: String(r["初始密码"] ?? "") || undefined,
    })).filter((r) => r.username && r.name);
    if (payload.length === 0) { alert("未解析到有效行，请使用【下载导入模板】填写后再上传"); return; }
    batchImport.mutate(payload);
  }

  function save() {
    if (!editing?.name || !editing?.username || !editing?.role) return;
    const payload = {
      username: editing.username, name: editing.name, role: editing.role as Role,
      isAdmin: editing.isAdmin ?? false, title: editing.title ?? "",
      email: editing.email ?? "", phone: editing.phone ?? "",
      researchDirection: editing.researchDirection ?? "", orcid: editing.orcid ?? "", homepage: editing.homepage ?? "",
      idCard: editing.idCard ?? "", mainCampus: editing.mainCampus ?? "",
      campus: editing.campus ?? "", building: editing.building ?? "", room: editing.room ?? "",
      enrollYear: editing.enrollYear ?? null, expectedGradYear: editing.expectedGradYear ?? null,
      gender: editing.gender ?? "", birthDate: editing.birthDate ?? "", staffNo: editing.staffNo ?? "",
      degree: editing.degree ?? "", almaMater: editing.almaMater ?? "",
      politicalStatus: editing.politicalStatus ?? "", joinDate: editing.joinDate ?? "",
      advisorIds: editing.advisorIds ?? [],
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate({ ...payload, password: editing.password || "123456" });
    setEditing(null);
  }

  const matrixProfiles = PERM_PROFILES.filter((p) => p !== "super_admin");

  return (
    <div>
      <PageHeader title="用户与权限" sub="身份角色（教师/博士后/研究生/本科生/实习生/访客）× 管理标志 正交模型；人员变动自动进入网站更新队列"
        actions={manageable && <>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("用户清单", "用户", (data ?? []).map((u) => ({ 用户名: u.username, 姓名: u.name, 角色: ROLE_LABELS[u.role as Role], 管理员: u.isAdmin ? "是" : "否", 职称: u.title, 邮箱: u.email, 手机号: u.phone, 科研方向: u.researchDirection, 状态: `${u.active ? "启用" : "停用"}${u.restricted ? "·受限" : ""}` })))}><Download className="mr-1 h-3.5 w-3.5" />导出</Button>
          <Button variant="outline" size="sm" onClick={() => downloadTemplate("用户导入模板", IMPORT_HEADERS, IMPORT_EXAMPLE)}><FileSpreadsheet className="mr-1 h-3.5 w-3.5" />下载导入模板</Button>
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" />批量导入</Button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          <Button size="sm" onClick={() => setEditing({ role: "grad", isAdmin: false })}><Plus className="mr-1 h-3.5 w-3.5" />新增用户</Button>
        </>} />

      <Tabs defaultValue="users">
        <TabsList className="mb-4"><TabsTrigger value="users">用户列表</TabsTrigger><TabsTrigger value="perms">权限矩阵</TabsTrigger></TabsList>

        <TabsContent value="users">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="data-table">
              <thead><tr><th>用户名</th><th>姓名</th><th>身份角色</th><th>管理标志</th><th>指导教师 / 名下学生</th><th>校区 / 楼宇 / 房间</th><th>入学 / 预计毕业</th><th>身份证号</th><th>状态</th>{manageable && <th className="w-44">操作</th>}</tr></thead>
              <tbody>
                {(data ?? []).map((u: UserRow) => (
                  <tr key={u.id}>
                    <td className="font-mono text-[12px]">{u.username}</td>
                    <td className="font-medium">{u.name}</td>
                    <td><Pill text={ROLE_LABELS[u.role as Role] ?? u.role} tone={u.role === "super_admin" ? "red" : u.role === "teacher" ? "amber" : u.role === "postdoc" ? "purple" : "gray"} /></td>
                    <td>{u.isAdmin ? <Pill text="管理员" tone="blue" /> : <span className="text-[12px] text-muted-foreground">—</span>}</td>
                    <td className="max-w-52 text-[12px]">
                      {u.advisorNames && u.advisorNames.length > 0 && <div>导师：{u.advisorNames.join("、")}</div>}
                      {u.menteeNames && u.menteeNames.length > 0 && <div className="text-muted-foreground">名下：{u.menteeNames.join("、")}</div>}
                      {(!u.advisorNames?.length && !u.menteeNames?.length) && "—"}
                    </td>
                    <td className="max-w-40 text-[12px]">{[u.campus, u.building, u.room].filter(Boolean).join("/") || "—"}</td>
                    <td className="text-[12px]">{u.enrollYear ?? "—"} / {u.expectedGradYear ?? "—"}</td>
                    <td className="font-mono text-[11px]">{maskIdCard(u.idCard)}</td>
                    <td>
                      <Pill text={u.active ? "启用" : "停用"} tone={u.active ? "green" : "red"} />
                      {!!u.restricted && <span className="ml-1"><Pill text="受限" tone="amber" /></span>}
                    </td>
                    {manageable && <td className="whitespace-nowrap">
                      <button title="编辑" className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing(u)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button title="重置密码" className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => confirm(`确认将 ${u.name} 的密码重置为 123456？`) && resetPwd.mutate({ id: u.id })}><KeyRound className="h-3.5 w-3.5" /></button>
                      <button title={u.active ? "停用（离职/离校/出站 → 网站更新队列）" : "启用"} className="mr-2 text-[12px] text-muted-foreground hover:text-foreground" onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}>{u.active ? "停用" : "启用"}</button>
                      {u.id !== me?.id && (
                        <button
                          title={u.restricted ? "解除受限（恢复数据操作权限）" : "设为受限（毕业/离校：可浏览，禁止增删改）"}
                          className="mr-2 text-[12px] text-muted-foreground hover:text-foreground"
                          onClick={() => setRestricted.mutate({ id: u.id, restricted: !u.restricted })}
                        >{u.restricted ? "解除受限" : "受限"}</button>
                      )}
                      {u.id !== me?.id && <button title="删除" className="text-muted-foreground hover:text-destructive" onClick={() => confirm("确认删除该用户？") && remove.mutate({ id: u.id })}><Trash2 className="h-3.5 w-3.5" /></button>}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="perms">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="data-table">
              <thead>
                <tr><th>子模块</th>{matrixProfiles.map((p) => <th key={p} className="text-center">{PROFILE_LABELS[p]}</th>)}</tr>
              </thead>
              <tbody>
                {PERMISSION_TREE.flatMap((m) => [
                  <tr key={m.module} className="bg-secondary/50"><td colSpan={matrixProfiles.length + 1} className="font-semibold">{m.label}</td></tr>,
                  ...m.subs.map((s) => (
                    <tr key={s.key}>
                      <td className="pl-5">{s.label}</td>
                      {matrixProfiles.map((p) => {
                        const cur = permsQuery.data?.[p]?.[s.key];
                        return (
                          <td key={p} className="text-center">
                            <Select
                              value={cur ?? "__default"}
                              onValueChange={(v) => setPerm.mutate({ role: p, permKey: s.key, level: v as PermLevel })}
                              disabled={!manageable}
                            >
                              <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue placeholder="默认" /></SelectTrigger>
                              <SelectContent>
                                {PERM_LEVELS.map((l) => <SelectItem key={l} value={l}>{PERM_LEVEL_LABELS[l]}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            权限档说明：超级管理员恒有全部权限；勾选「管理标志」的用户走「管理员」档；其余按身份档。未显式配置的项使用默认权限，修改即时生效。
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑用户" : "新增用户"}</DialogTitle></DialogHeader>
          {!isSuperAdmin && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[12px] text-blue-700 dark:text-blue-400">
              您可以添加/管理<b>自己名下指导的学生</b>（研究生/本科生/实习生），学生的主负责导师默认为您本人；添加教师、博士后或指定其他导师，请联系超级管理员。
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Field label="用户名" required><Input value={editing?.username ?? ""} onChange={(e) => setEditing({ ...editing, username: e.target.value.toLowerCase() })} placeholder="姓名拼音，如 zhangsan" /></Field>
              {!editing?.id && <div className="mt-1 text-[11px] text-muted-foreground">命名规范：姓名全拼小写；拼音相同时，第二位用户在拼音后加入学年份，如 zhangsan2026。初始密码均为 123456，用户首次登录将被强制修改强密码并完善个人信息。</div>}
            </div>
            <Field label="姓名" required><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="身份角色" required>
              <Select value={editing?.role ?? "grad"} onValueChange={(v) => setEditing({ ...editing, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(isSuperAdmin ? ROLES : ROLES.filter((r) => ["grad", "benyan", "intern"].includes(r))).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="职称/身份说明"><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="教授/副教授/讲师/博士后…" /></Field>
            <div className="col-span-2" style={{ display: isSuperAdmin ? undefined : "none" }}>
              <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-2 text-[13px]">
                <Checkbox checked={editing?.isAdmin ?? false} onCheckedChange={(ck) => setEditing({ ...editing, isAdmin: !!ck })} />
                授予管理标志（教师默认勾选；部分博士后/高年级博士生按需勾选 → 权限提升为管理员档）
              </label>
            </div>
            {!editing?.id && <Field label="初始密码"><Input value={editing?.password ?? ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="默认 123456" /></Field>}
            <Field label="邮箱"><Input value={editing?.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="手机号"><Input value={editing?.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label="科研方向（供审稿人推荐 / 文献匹配）"><Input value={editing?.researchDirection ?? ""} onChange={(e) => setEditing({ ...editing, researchDirection: e.target.value })} /></Field>
            <Field label="ORCID"><Input value={editing?.orcid ?? ""} onChange={(e) => setEditing({ ...editing, orcid: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="个人学术主页"><Input value={editing?.homepage ?? ""} onChange={(e) => setEditing({ ...editing, homepage: e.target.value })} /></Field></div>
            {/* V5 需求 7：全局用户字段（与个人资料页、导入模板保持一致） */}
            <Field label="身份证号（出差购票）"><Input value={editing?.idCard ?? ""} onChange={(e) => setEditing({ ...editing, idCard: e.target.value })} /></Field>
            <Field label="性别">
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]" value={editing?.gender ?? ""} onChange={(e) => setEditing({ ...editing, gender: e.target.value })}>
                <option value="">请选择</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </Field>
            <Field label="出生日期"><Input type="date" value={editing?.birthDate ?? ""} onChange={(e) => setEditing({ ...editing, birthDate: e.target.value })} /></Field>
            <Field label="学号/工号"><Input value={editing?.staffNo ?? ""} onChange={(e) => setEditing({ ...editing, staffNo: e.target.value })} /></Field>
            <Field label="学位/学历"><Input value={editing?.degree ?? ""} onChange={(e) => setEditing({ ...editing, degree: e.target.value })} placeholder="博士/硕士/学士" /></Field>
            <Field label="毕业院校"><Input value={editing?.almaMater ?? ""} onChange={(e) => setEditing({ ...editing, almaMater: e.target.value })} /></Field>
            <Field label="政治面貌"><Input value={editing?.politicalStatus ?? ""} onChange={(e) => setEditing({ ...editing, politicalStatus: e.target.value })} /></Field>
            <Field label="进组日期"><Input type="date" value={editing?.joinDate ?? ""} onChange={(e) => setEditing({ ...editing, joinDate: e.target.value })} /></Field>
            <Field label="人事关系所在校区"><Input value={editing?.mainCampus ?? ""} onChange={(e) => setEditing({ ...editing, mainCampus: e.target.value })} /></Field>
            <Field label="当前所在校区"><Input value={editing?.campus ?? ""} onChange={(e) => setEditing({ ...editing, campus: e.target.value })} /></Field>
            <Field label="楼宇 / 房间">
              <div className="flex gap-2">
                <Input value={editing?.building ?? ""} onChange={(e) => setEditing({ ...editing, building: e.target.value })} placeholder="楼宇" />
                <Input value={editing?.room ?? ""} onChange={(e) => setEditing({ ...editing, room: e.target.value })} placeholder="房间号" />
              </div>
            </Field>
            {["grad", "benyan", "intern", "postdoc"].includes(editing?.role ?? "") && <>
              <Field label="入学年份"><Input type="number" value={editing?.enrollYear ?? ""} onChange={(e) => setEditing({ ...editing, enrollYear: e.target.value ? Number(e.target.value) : null })} /></Field>
              <Field label="预计毕业年份"><Input type="number" value={editing?.expectedGradYear ?? ""} onChange={(e) => setEditing({ ...editing, expectedGradYear: e.target.value ? Number(e.target.value) : null })} /></Field>
            </>}
            {/* 需求 1 + V6 需求 1：指导教师映射（可多人、有序；第一位为主负责导师）；V11：管理员添加的学生主导师固定为本人 */}
            {!isSuperAdmin && ["grad", "benyan", "intern"].includes(editing?.role ?? "") && (
              <div className="col-span-2 rounded-md border border-border bg-secondary/30 px-3 py-2 text-[12.5px]">
                指导教师：<span className="font-semibold">{me?.name}</span>
                <span className="ml-1.5 rounded-sm bg-amber-600/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-400">主负责导师</span>
                <span className="ml-2 text-muted-foreground">（管理员添加的学生主导师默认为本人）</span>
              </div>
            )}
            {isSuperAdmin && ["grad", "benyan", "intern", "postdoc"].includes(editing?.role ?? "") && (
              <div className="col-span-2">
                <div className="mb-1 text-[12px] font-medium text-muted-foreground">指导教师（可多选、有序；勾选顺序即排名，<span className="font-semibold text-foreground">第一位为主负责导师</span>）</div>
                {/* 已选导师：有序展示 + 排序调整 */}
                {(editing?.advisorIds ?? []).length > 0 && (
                  <div className="mb-1.5 space-y-1">
                    {(editing?.advisorIds ?? []).map((id, i) => {
                      const name = (data ?? []).find((u: UserRow) => u.id === id)?.name ?? `#${id}`;
                      return (
                        <div key={id} className="flex items-center gap-2 rounded-sm border border-border bg-secondary/30 px-2 py-1 text-[12px]">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary tabular-nums">{i + 1}</span>
                          <span className="font-medium">{name}</span>
                          {i === 0 && <span className="rounded-sm bg-amber-600/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">主负责导师</span>}
                          <span className="flex-1" />
                          <button type="button" title="上移" disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            onClick={() => { const cur = [...(editing?.advisorIds ?? [])]; [cur[i - 1], cur[i]] = [cur[i], cur[i - 1]]; setEditing({ ...editing, advisorIds: cur }); }}>↑</button>
                          <button type="button" title="下移" disabled={i === (editing?.advisorIds ?? []).length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            onClick={() => { const cur = [...(editing?.advisorIds ?? [])]; [cur[i + 1], cur[i]] = [cur[i], cur[i + 1]]; setEditing({ ...editing, advisorIds: cur }); }}>↓</button>
                          <button type="button" title="移除" className="text-muted-foreground hover:text-destructive"
                            onClick={() => setEditing({ ...editing, advisorIds: (editing?.advisorIds ?? []).filter((x) => x !== id) })}>×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex max-h-28 flex-wrap gap-x-3 gap-y-1 overflow-y-auto rounded-sm border border-border p-2">
                  {(data ?? [])
                    .filter((u: UserRow) => u.active && (u.role === "super_admin" || u.role === "teacher" || u.role === "postdoc" || u.isAdmin) && u.id !== editing?.id)
                    .map((u: UserRow) => (
                      <label key={u.id} className="flex items-center gap-1.5 text-[12px]">
                        <Checkbox
                          checked={(editing?.advisorIds ?? []).includes(u.id)}
                          onCheckedChange={() => {
                            const cur = editing?.advisorIds ?? [];
                            setEditing({ ...editing, advisorIds: cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id] });
                          }}
                        />
                        {u.name}
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.username || !editing?.name} onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
