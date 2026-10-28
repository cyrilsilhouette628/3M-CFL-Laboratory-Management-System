// 登录页
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlaskConical } from "lucide-react";

export default function Login() {
  const remembered = (() => { try { return JSON.parse(localStorage.getItem("lab-login-remember") ?? "null") as { username: string; password: string } | null; } catch { return null; } })();
  const [username, setUsername] = useState(remembered?.username ?? "");
  const [password, setPassword] = useState(remembered?.password ?? "");
  const [remember, setRemember] = useState(!!remembered);
  const [error, setError] = useState("");
  const login = trpc.auth.login.useMutation();
  const { setSession } = useAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await login.mutateAsync({ username, password });
      if (remember) localStorage.setItem("lab-login-remember", JSON.stringify({ username, password }));
      else localStorage.removeItem("lab-login-remember");
      setSession(res.token, res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <FlaskConical className="mx-auto mb-3 h-9 w-9 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">课题组管理系统</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">3M-CFL · 内部信息共享 · 数据归集 · 科研过程监管</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-card p-6">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">用户名</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder="请输入用户名" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">密码</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="请输入密码" />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />记住用户名和密码（仅建议在本人设备使用）</label>
          {error && <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? "登录中…" : "登 录"}
          </Button>
          <div className="border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
            演示账号（初始密码均为 123456）：
            <br />admin（超级管理员·PI）· secretary（管理老师）· teacher1（教师·管理员）· postdoc1（博士后）
            <br />student1/2（研究生）· undergrad1（本科生）· intern1（实习生）· guest（访客）
          </div>
        </form>
      </div>
    </div>
  );
}
