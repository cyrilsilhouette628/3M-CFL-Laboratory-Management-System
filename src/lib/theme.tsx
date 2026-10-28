// 白日/暗夜模式：本地记忆 + <html> class 切换
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeCtx = { dark: boolean; toggle: () => void };
const Ctx = createContext<ThemeCtx>({ dark: false, toggle: () => {} });

function initial(): boolean {
  const saved = localStorage.getItem("lab_theme");
  if (saved) return saved === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(initial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("lab_theme", dark ? "dark" : "light");
  }, [dark]);

  return <Ctx.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
