// V10：首次登录强制设置 —— 修改强密码 + 完善基本信息，未完成前不进入系统
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, UserRound } from "lucide-react";

// 与后端 isStrongPassword 一致
function isStrongPwd(pwd: string, username?: string): boolean {
  return pwd.length >= 8 && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)
    && (!username || pwd.toLowerCase() !== username.toLowerCase());
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}

export default function FirstSetup() {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const [err, setErr] = useState("");
  const [pwd, setPwd] = useState({ oldPassword: "", newPassword: "", confirm: "" });
  const [form, setForm] = useState<Record<string, string>>({});

  const needPwd = !!user?.mustChangePassword;
  const needProfile = !!user?.mustCompleteProfile;

  const val = (k: string) => form[k] ?? String((me.data as Record<string, unknown> | undefined)?.[k] ?? "");
  const setV = (k: string, v: string) => setForm({ ...form, [k]: v });

  const changePassword = trpc.auth.changePassword.useMutation();
  const updateProfile = trpc.users.updateProfile.useMutation();

  const pwdOk = !needPwd || (isStrongPwd(pwd.newPassword, user?.username) && pwd.newPassword === pwd.confirm && pwd.oldPassword.length > 0);
  const profileOk = !needProfile || ["name", "gender", "phone", "email", "idCard"].every((k) => val(k).trim().length > 0);

  async function submit() {
    setErr("");
    try {
      if (needPwd) {
        if (!isStrongPwd(pwd.newPassword, user?.username)) {
          setErr("新密码不符合强密码要求：至少 8 位，含大写字母、小写字母和数字，且不能等于用户名。");
          return;
        }
        if (pwd.newPassword !== pwd.confirm) { setErr("两次输入的新密码不一致。"); return; }
        await changePassword.mutateAsync({ oldPassword: pwd.oldPassword, newPassword: pwd.newPassword });
      }
      if (needProfile) {
        const keys = ["name", "gender", "birthDate", "staffNo", "idCard", "email", "phone", "degree", "almaMater", "politicalStatus", "joinDate", "researchDirection", "mainCampus", "campus", "building", "room"];
        const payload: Record<string, string> = {};
        for (const k of keys) payload[k] = val(k);
        await updateProfile.mutateAsync(payload);
      }
      await utils.auth.me.invalidate();
      await utils.users.me.invalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败，请重试");
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl space-y-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">欢迎，{user?.name}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            本系统为课题组内部管理信息系统。首次登录需要完成以下设置后才能进入系统
            {needPwd && "：① 将初始密码修改为强密码"}{needProfile && "；② 完善个人基本信息"}。
          </p>
        </div>

        {needPwd && (
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> 设置强密码
            </div>
            <div className="space-y-3">
              <Field label="当前密码（初始密码为 123456）" required>
                <Input type="password" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} />
              </Field>
              <Field label="新密码" required>
                <Input type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
              </Field>
              <Field label="确认新密码" required>
                <Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
              </Field>
              <p className="text-[12px] text-muted-foreground">
                强密码要求：至少 8 位，同时包含大写字母、小写字母和数字，且不能等于用户名（{user?.username}）。
              </p>
            </div>
          </div>
        )}

        {needProfile && (
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
              <UserRound className="h-4 w-4 text-primary" /> 完善基本信息
            </div>
            <p className="mb-4 text-[12px] text-muted-foreground">带 * 为必填项，其余可稍后在「个人资料」中补充。</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="姓名" required><Input value={val("name")} onChange={(e) => setV("name", e.target.value)} /></Field>
              <Field label="性别" required>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]" value={val("gender")} onChange={(e) => setV("gender", e.target.value)}>
                  <option value="">请选择</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </Field>
              <Field label="手机号" required><Input value={val("phone")} onChange={(e) => setV("phone", e.target.value)} /></Field>
              <Field label="邮箱" required><Input type="email" value={val("email")} onChange={(e) => setV("email", e.target.value)} /></Field>
              <Field label="身份证号" required><Input value={val("idCard")} onChange={(e) => setV("idCard", e.target.value)} placeholder="用于出差购票等" /></Field>
              <Field label="出生日期"><Input type="date" value={val("birthDate")} onChange={(e) => setV("birthDate", e.target.value)} /></Field>
              <Field label="学号/工号"><Input value={val("staffNo")} onChange={(e) => setV("staffNo", e.target.value)} /></Field>
              <Field label="学位/学历"><Input value={val("degree")} onChange={(e) => setV("degree", e.target.value)} placeholder="如：博士/硕士/学士" /></Field>
              <Field label="毕业院校"><Input value={val("almaMater")} onChange={(e) => setV("almaMater", e.target.value)} /></Field>
              <Field label="政治面貌"><Input value={val("politicalStatus")} onChange={(e) => setV("politicalStatus", e.target.value)} placeholder="如：中共党员/群众" /></Field>
              <Field label="进组日期"><Input type="date" value={val("joinDate")} onChange={(e) => setV("joinDate", e.target.value)} /></Field>
              <Field label="研究方向"><Input value={val("researchDirection")} onChange={(e) => setV("researchDirection", e.target.value)} /></Field>
            </div>
          </div>
        )}

        {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{err}</div>}

        <div className="flex items-center justify-between">
          <button className="text-[12.5px] text-muted-foreground hover:text-foreground" onClick={logout}>退出登录</button>
          <Button disabled={!pwdOk || !profileOk || changePassword.isPending || updateProfile.isPending} onClick={submit}>
            {changePassword.isPending || updateProfile.isPending ? "保存中…" : "完成设置，进入系统"}
          </Button>
        </div>
      </div>
    </div>
  );
}
