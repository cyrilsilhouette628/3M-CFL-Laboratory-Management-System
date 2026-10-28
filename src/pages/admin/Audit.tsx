// 审计日志 + 个人资料/密码
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui2";
import { useAuth } from "@/lib/auth";
import { PROFILE_EDITABLE_FIELDS, ROLE_LABELS, type Role } from "@contracts/constants";

export default function Audit() {
  const { data } = trpc.users.auditLogs.useQuery({ limit: 300 });
  return (
    <div>
      <PageHeader title="审计日志" sub="全站登录与操作审计（最近 300 条）" />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="data-table">
          <thead><tr><th>时间</th><th>用户</th><th>操作</th><th>模块</th><th>详情</th></tr></thead>
          <tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap tabular-nums text-[12px]">{new Date(l.createdAt).toLocaleString("zh-CN")}</td>
                <td className="whitespace-nowrap">{l.userName}</td>
                <td className="whitespace-nowrap">{l.action}</td>
                <td className="font-mono text-[12px]">{l.module}</td>
                <td className="max-w-96 text-[12px]">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// V5 需求 7/9：【个人资料】（原「个人资料与密码」更名）——可编辑字段由 PROFILE_EDITABLE_FIELDS 单点常量驱动，
// 与【系统配置·用户与权限】新增/编辑/导入模板字段保持一致
// V10：与后端 isStrongPassword 一致的强密码校验
function isStrongPwd(pwd: string, username?: string): boolean {
  return pwd.length >= 8 && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)
    && (!username || pwd.toLowerCase() !== username.toLowerCase());
}

export function ProfilePage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [pwd, setPwd] = useState({ oldPassword: "", newPassword: "" });
  const updateProfile = trpc.users.updateProfile.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); utils.users.me.invalidate(); alert("个人资料已更新"); },
    onError: (e) => alert(e.message),
  });
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => { alert("密码修改成功"); setPwd({ oldPassword: "", newPassword: "" }); },
    onError: (e) => alert(e.message),
  });

  const val = (k: string) => String(form[k] ?? (me.data as Record<string, unknown> | undefined)?.[k] ?? "");
  const setV = (k: string, v: string | number) => setForm({ ...form, [k]: v });

  function save() {
    const payload: Record<string, unknown> = {};
    for (const k of PROFILE_EDITABLE_FIELDS) {
      const v = form[k] ?? (me.data as Record<string, unknown> | undefined)?.[k];
      if (k === "expectedGradYear") payload[k] = v ? Number(v) : null;
      else payload[k] = v ?? "";
    }
    updateProfile.mutate(payload as Parameters<typeof updateProfile.mutate>[0]);
  }

  return (
    <div>
      <PageHeader title="个人资料" sub="可自行维护的字段与【系统配置 · 用户与权限】保持一致；身份类信息（角色/导师/入学年份）由管理员维护" />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 text-[14px] font-semibold">基本信息（只读）</div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div><span className="text-muted-foreground">用户名：</span>{user?.username}</div>
              <div><span className="text-muted-foreground">姓名：</span>{user?.name}</div>
              <div><span className="text-muted-foreground">角色：</span>{user ? ROLE_LABELS[user.role as Role] : ""}</div>
              <div><span className="text-muted-foreground">入学年份：</span>{me.data?.enrollYear ?? "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">指导教师：</span>{me.data?.advisorNames?.length ? me.data.advisorNames.join("、") : "—"}</div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 text-[14px] font-semibold">联系方式与学术资料</div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="姓名"><Input value={val("name")} onChange={(e) => setV("name", e.target.value)} /></Field>
                <Field label="性别">
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]" value={val("gender")} onChange={(e) => setV("gender", e.target.value)}>
                    <option value="">请选择</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="出生日期"><Input type="date" value={val("birthDate")} onChange={(e) => setV("birthDate", e.target.value)} /></Field>
                <Field label="学号/工号"><Input value={val("staffNo")} onChange={(e) => setV("staffNo", e.target.value)} /></Field>
              </div>
              <Field label="邮箱"><Input value={val("email")} onChange={(e) => setV("email", e.target.value)} /></Field>
              <Field label="电话"><Input value={val("phone")} onChange={(e) => setV("phone", e.target.value)} /></Field>
              <Field label="科研方向"><Input value={val("researchDirection")} onChange={(e) => setV("researchDirection", e.target.value)} placeholder="如：机器学习, 数据挖掘" /></Field>
              <Field label="ORCID"><Input value={val("orcid")} onChange={(e) => setV("orcid", e.target.value)} /></Field>
              <Field label="个人学术主页"><Input value={val("homepage")} onChange={(e) => setV("homepage", e.target.value)} /></Field>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 text-[14px] font-semibold">行政信息</div>
            <div className="space-y-3">
              <Field label="身份证号（出差购票）"><Input value={val("idCard")} onChange={(e) => setV("idCard", e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="学位/学历"><Input value={val("degree")} onChange={(e) => setV("degree", e.target.value)} placeholder="如：博士/硕士/学士" /></Field>
                <Field label="政治面貌"><Input value={val("politicalStatus")} onChange={(e) => setV("politicalStatus", e.target.value)} placeholder="如：中共党员/群众" /></Field>
              </div>
              <Field label="毕业院校"><Input value={val("almaMater")} onChange={(e) => setV("almaMater", e.target.value)} /></Field>
              <Field label="进组日期"><Input type="date" value={val("joinDate")} onChange={(e) => setV("joinDate", e.target.value)} /></Field>
              <Field label="人事关系所在校区"><Input value={val("mainCampus")} onChange={(e) => setV("mainCampus", e.target.value)} /></Field>
              <Field label="当前所在校区"><Input value={val("campus")} onChange={(e) => setV("campus", e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="楼宇"><Input value={val("building")} onChange={(e) => setV("building", e.target.value)} /></Field>
                <Field label="房间号"><Input value={val("room")} onChange={(e) => setV("room", e.target.value)} /></Field>
              </div>
              <Field label="预计毕业年份（学生）"><Input type="number" value={val("expectedGradYear")} onChange={(e) => setV("expectedGradYear", e.target.value)} /></Field>
              <Button onClick={save}>保存资料</Button>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 text-[14px] font-semibold">修改密码</div>
            <div className="space-y-3">
              <Field label="原密码"><Input type="password" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} /></Field>
              <Field label="新密码（强密码）"><Input type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} /></Field>
              <div className="text-[12px] text-muted-foreground">强密码要求：至少 8 位，同时包含大写字母、小写字母和数字，且不能等于用户名。</div>
              <Button disabled={!isStrongPwd(pwd.newPassword, user?.username)} onClick={() => changePassword.mutate(pwd)}>修改密码</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
