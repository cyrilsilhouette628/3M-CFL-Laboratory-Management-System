// 认证上下文：token 持久化 + 当前用户 + 权限矩阵
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import type { PermLevel } from "@contracts/constants";

export type CurrentUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  isAdmin: boolean;
  title: string | null;
  email: string | null;
  researchDirection: string | null;
  // V10：首次登录强制流程标记
  mustChangePassword?: boolean;
  mustCompleteProfile?: boolean;
  // V11：受限状态（毕业/离校）：仅可浏览
  restricted?: boolean;
};

type AuthCtx = {
  user: CurrentUser | null;
  perms: Record<string, PermLevel>;
  loading: boolean;
  setSession: (token: string, user: CurrentUser) => void;
  logout: () => void;
  can: (key: string, min?: PermLevel) => boolean;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  perms: {},
  loading: true,
  setSession: () => {},
  logout: () => {},
  can: () => false,
});

const RANK: Record<string, number> = { hidden: 0, readonly: 1, editable: 2, manage: 3 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [perms, setPerms] = useState<Record<string, PermLevel>>({});
  const [loading, setLoading] = useState(true);
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !!localStorage.getItem("lab_token"),
    retry: false,
  });
  const permsQuery = trpc.users.myPermissions.useQuery(undefined, {
    enabled: !!meQuery.data,
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data as CurrentUser);
      setLoading(false);
    } else if (meQuery.isError || !localStorage.getItem("lab_token")) {
      setUser(null);
      setLoading(false);
    }
  }, [meQuery.data, meQuery.isError]);

  useEffect(() => {
    if (permsQuery.data) setPerms(permsQuery.data as Record<string, PermLevel>);
  }, [permsQuery.data]);

  const setSession = (token: string, u: CurrentUser) => {
    localStorage.setItem("lab_token", token);
    setUser(u);
    setLoading(false);
    window.location.href = "/";
  };

  const logout = () => {
    localStorage.removeItem("lab_token");
    setUser(null);
    window.location.href = "/login";
  };

  const can = (key: string, min: PermLevel = "readonly") =>
    RANK[perms[key] ?? "hidden"] >= RANK[min];

  return (
    <Ctx.Provider value={{ user, perms, loading, setSession, logout, can }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
