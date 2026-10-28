// 整体布局：侧边栏（一级模块可折叠展开/收缩二级子模块）+ 顶栏（主题切换 + 网站更新）
// 需求 2：一级（模块）/二级（子模块）结构，一级点击折叠展开
// 需求 3：去除「模块壹/2.1」等编号，模块与子模块在字号/字重上区分
// 需求 5：【网站更新】仅超级管理员可激活，其他人灰色不可激活
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import FirstSetup from "@/pages/FirstSetup";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

import { WebsiteUpdateCenter } from "@/components/WebsiteUpdateCenter";
import { DataFeedbackButton } from "@/components/DataFeedback";
import { Switch } from "@/components/ui/switch";
import {
  LayoutDashboard, CheckSquare, FolderKanban, GraduationCap, Handshake, FileUp,
  FileSearch, BookMarked, LineChart, CalendarRange, Landmark,
  Trophy, HeartHandshake, ShieldCheck, ScrollText, LogOut, UserCog, FlaskConical,
  Users, Briefcase, Globe, Plug, Sun, Moon, ChevronDown, Wrench, CalendarClock,
  Settings2, Award, BookOpen, Code2, Medal, Microscope, ClipboardCheck, Sparkles, Type,
  Palette, Check, DatabaseBackup, MessageSquareReply, Menu, X,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type NavItem = { to: string; label: string; icon: React.ReactNode; perm: string; superOnly?: boolean };
// leaf=true：模块无二级标题，功能直接归并到一级标题（V5 需求 5）
type NavGroup = { key: string; title: string; icon: React.ReactNode; items: NavItem[]; leaf?: boolean };

const ic = (node: React.ReactNode) => node;

const NAV: NavGroup[] = [
  {
    key: "todo", title: "待办事项", icon: ic(<CheckSquare className="h-4 w-4" />), leaf: true,
    items: [{ to: "/todos", label: "待办事项", icon: <CheckSquare className="h-4 w-4" />, perm: "todo.list" }],
  },
  {
    key: "research", title: "科研管理", icon: ic(<FlaskConical className="h-4 w-4" />),
    items: [
      { to: "/research/projects", label: "科研项目管理", icon: <FolderKanban className="h-4 w-4" />, perm: "research.projects" },
      { to: "/research/collaborations", label: "合作者科研工作", icon: <Handshake className="h-4 w-4" />, perm: "research.collaborations" },
      { to: "/research/papers", label: "投稿论文进度", icon: <FileUp className="h-4 w-4" />, perm: "research.papers" },
      { to: "/research/ip", label: "申请知识产权进度", icon: <ShieldCheck className="h-4 w-4" />, perm: "research.ip" },
      { to: "/research/reviews", label: "审稿情况", icon: <FileSearch className="h-4 w-4" />, perm: "research.reviews" },
      { to: "/research/references", label: "重要参考文献", icon: <BookMarked className="h-4 w-4" />, perm: "research.references" },
      { to: "/research/citations", label: "WoS 引用次数", icon: <LineChart className="h-4 w-4" />, perm: "research.citations" },
      { to: "/research/activities", label: "学术活动管理", icon: <CalendarRange className="h-4 w-4" />, perm: "research.activities" },
      { to: "/research/visits", label: "专家来访管理", icon: <Landmark className="h-4 w-4" />, perm: "research.visits" },
    ],
  },
  {
    key: "training", title: "人才培养", icon: ic(<GraduationCap className="h-4 w-4" />),
    items: [
      { to: "/training/grads", label: "研究生培养", icon: <GraduationCap className="h-4 w-4" />, perm: "training.grads" },
      { to: "/training/mentoring", label: "传帮带", icon: <Handshake className="h-4 w-4" />, perm: "training.grads" },
      { to: "/training/undergrads", label: "本科生研修", icon: <Users className="h-4 w-4" />, perm: "training.undergrads" },
      { to: "/training/postdocs", label: "博士后管理", icon: <Briefcase className="h-4 w-4" />, perm: "training.postdocs" },
    ],
  },
  {
    key: "device", title: "仪器设备", icon: ic(<Microscope className="h-4 w-4" />),
    items: [
      { to: "/device/assets", label: "设备台账", icon: <Microscope className="h-4 w-4" />, perm: "device.assets" },
      { to: "/device/bookings", label: "预约使用", icon: <CalendarClock className="h-4 w-4" />, perm: "device.bookings" },
      { to: "/device/maintenance", label: "维护保养", icon: <Wrench className="h-4 w-4" />, perm: "device.maintenance" },
    ],
  },
  {
    key: "achievement", title: "成果管理", icon: ic(<Trophy className="h-4 w-4" />),
    items: [
      { to: "/achievements", label: "统计与年度盘点", icon: <LineChart className="h-4 w-4" />, perm: "achievement.list" },
      { to: "/achievements/papers", label: "已发表论文", icon: <FileUp className="h-4 w-4" />, perm: "achievement.papers" },
      { to: "/achievements/patents", label: "已获知识产权", icon: <ShieldCheck className="h-4 w-4" />, perm: "achievement.patents" },
      { to: "/achievements/awards", label: "科研奖励", icon: <Medal className="h-4 w-4" />, perm: "achievement.awards" },
      { to: "/achievements/student", label: "学生研究成果", icon: <Award className="h-4 w-4" />, perm: "achievement.student" },
      { to: "/achievements/books", label: "专著与教材", icon: <BookOpen className="h-4 w-4" />, perm: "achievement.books" },
      { to: "/achievements/software", label: "软件著作权与标准", icon: <Code2 className="h-4 w-4" />, perm: "achievement.software" },
    ],
  },
  {
    key: "social", title: "社会服务", icon: ic(<HeartHandshake className="h-4 w-4" />),
    items: [{ to: "/social", label: "社会服务", icon: <HeartHandshake className="h-4 w-4" />, perm: "social.list" }],
  },
  {
    key: "config", title: "系统配置", icon: ic(<Settings2 className="h-4 w-4" />),
    items: [
      { to: "/config/users", label: "用户与权限", icon: <ShieldCheck className="h-4 w-4" />, perm: "config.users" },
      { to: "/config/review", label: "内容审核", icon: <ClipboardCheck className="h-4 w-4" />, perm: "config.review" },
      { to: "/config/feedback", label: "数据纠错反馈", icon: <MessageSquareReply className="h-4 w-4" />, perm: "config.review" },
      { to: "/config/ai", label: "AI 解析确认", icon: <Sparkles className="h-4 w-4" />, perm: "config.review" },
      { to: "/config/integrations", label: "外部接口", icon: <Plug className="h-4 w-4" />, perm: "config.integrations" },
      { to: "/config/audit", label: "审计日志", icon: <ScrollText className="h-4 w-4" />, perm: "config.audit" },
      { to: "/config/backup", label: "数据备份", icon: <DatabaseBackup className="h-4 w-4" />, perm: "config.audit", superOnly: true },
    ],
  },
];

const COLLAPSE_KEY = "lab_nav_collapsed_v4";

// V7 标注 1：可选配色方案（swatch 仅作预览色点）
const PALETTES = [
  { key: "emerald", label: "翡翠绿（默认）", swatch: "hsl(162 62% 30%)" },
  { key: "blue", label: "藏青蓝", swatch: "hsl(217 70% 40%)" },
  { key: "violet", label: "黛紫", swatch: "hsl(262 55% 45%)" },
  { key: "amber", label: "赭石棕", swatch: "hsl(28 75% 38%)" },
] as const;

export default function Layout() {
  const { user, logout, can, loading } = useAuth();
  const { dark, toggle } = useTheme();
  // V6 需求 C-1：全局字号调节（根元素 font-size → rem 整体缩放；localStorage 持久化）
  const [fontSize, setFontSize] = useState<number>(() => {
    const v = Number(localStorage.getItem("lab-font-size"));
    return v >= 12 && v <= 20 ? v : 16;
  });
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
    localStorage.setItem("lab-font-size", String(fontSize));
  }, [fontSize]);
  // V7 标注 1：全局配色方案（data-palette → CSS 变量整套换色；localStorage 持久化）
  const [palette, setPalette] = useState<string>(() => {
    const v = localStorage.getItem("lab-palette");
    return PALETTES.some((x) => x.key === v) ? v! : "emerald";
  });
  useEffect(() => {
    if (palette === "emerald") document.documentElement.removeAttribute("data-palette");
    else document.documentElement.setAttribute("data-palette", palette);
    localStorage.setItem("lab-palette", palette);
  }, [palette]);
  const navigate = useNavigate();
  const location = useLocation();
  const [siteOpen, setSiteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // 折叠状态持久化；默认全部展开
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">加载中…</div>;
  }
  if (!user) return null;
  // V10：首次登录强制设置（改强密码 + 完善基本信息），完成前不进入系统
  if (user.mustChangePassword || user.mustCompleteProfile) {
    return <FirstSetup />;
  }

  const isSuper = user.role === "super_admin";

  return (
    <div className="flex min-h-screen">
      {mobileOpen && <button aria-label="关闭导航" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-black/40 lg:hidden" />}
      {/* 移动端抽屉 / 桌面端固定侧边栏 */}
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="border-b border-sidebar-border px-4 py-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-sidebar-foreground/90" />
            <div>
              <div className="text-[15px] font-semibold tracking-wide text-sidebar-primary">课题组管理系统</div>
              <div className="mt-0.5 text-[11px] tracking-widest text-sidebar-foreground/60">3M-CFL · LMS</div>
            </div>
            <button aria-label="关闭导航" onClick={() => setMobileOpen(false)} className="ml-auto rounded-sm p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <NavLink to="/" end onClick={() => setMobileOpen(false)} className={({ isActive }) => `mb-1 flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-primary" : "hover:bg-sidebar-accent/50"}`}>
            <LayoutDashboard className="h-4 w-4" /> 首页仪表盘
          </NavLink>
          {NAV.map((g) => {
            const visible = g.items.filter((i) => can(i.perm) && (!i.superOnly || user.role === "super_admin"));
            if (visible.length === 0) return null;
            // 无二级标题的模块：一级标题即入口，直接导航（V5 需求 5）
            if (g.leaf) {
              const it = visible[0];
              return (
                <NavLink key={g.key} to={it.to} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `mt-1.5 flex items-center gap-2 rounded-sm px-2.5 py-2 text-[13.5px] font-semibold tracking-wide transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/90 hover:bg-sidebar-accent/50"}`}>
                  {g.icon}
                  <span className="flex-1 truncate">{g.title}</span>
                </NavLink>
              );
            }
            const isCollapsed = !!collapsed[g.key];
            const groupActive = visible.some((i) => location.pathname === i.to || location.pathname.startsWith(i.to + "/"));
            return (
              <div key={g.key} className="mt-1.5">
                {/* 一级标题（模块）：更大字号 + 加粗 + 点击折叠/展开 */}
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                  className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-[13.5px] font-semibold tracking-wide transition-colors hover:bg-sidebar-accent/50 ${groupActive ? "text-sidebar-primary" : "text-sidebar-foreground/90"}`}
                  aria-expanded={!isCollapsed}
                >
                  {g.icon}
                  <span className="flex-1 truncate">{g.title}</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {/* 二级子模块：较小字号、常规字重、缩进 */}
                {!isCollapsed && (
                  <div className="ml-3 border-l border-sidebar-border/60 pl-1.5">
                    {visible.map((i) => (
                      <NavLink
                        key={i.to}
                        to={i.to}
                        end={i.to === "/achievements"}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] font-normal transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50"}`
                        }
                      >
                        {i.icon}
                        <span className="truncate">{i.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3 text-[12px] text-sidebar-foreground/70">
          <NavLink to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 hover:text-sidebar-primary">
            <UserCog className="h-4 w-4" /> 个人资料
          </NavLink>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col lg:ml-60">
        <header className="sticky top-0 z-20 flex h-13 items-center justify-between gap-2 border-b border-border bg-background/90 px-3 py-2.5 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground sm:gap-3">
            <button aria-label="打开导航" onClick={() => setMobileOpen(true)} className="rounded-sm border border-border p-1.5 text-primary lg:hidden"><Menu className="h-4 w-4" /></button>
            <span className="hidden xl:inline">3M-CFL · 内部信息共享 · 数据归集 · 科研过程监管</span><span className="rounded-sm border border-primary/25 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary">V34</span>
          </div>
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="hidden lg:block"><DataFeedbackButton /></div>
            {/* 白日/暗夜 滑动切换 */}
            <div className="hidden items-center gap-1.5 lg:flex" title="白日 / 暗夜模式">
              <Sun className="h-3.5 w-3.5 text-muted-foreground" />
              <Switch checked={dark} onCheckedChange={toggle} aria-label="切换暗夜模式" />
              <Moon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            {/* V6 需求 C-1：字号调节（全局生效，下拉滑动条） */}
            <div className="hidden lg:block"><Popover>
              <PopoverTrigger asChild>
                <button
                  title="调整整个页面的显示字号"
                  className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-accent"
                >
                  <Type className="h-3.5 w-3.5" /> 字号
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="mb-2 flex items-center justify-between text-[12px]">
                  <span className="font-medium">页面字号</span>
                  <span className="tabular-nums text-muted-foreground">{fontSize}px</span>
                </div>
                <Slider value={[fontSize]} min={12} max={20} step={1} onValueChange={([v]) => setFontSize(v)} />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>小 12</span><span>默认 16</span><span>20 大</span></div>
                <button className="mt-2 w-full rounded-sm border border-border py-1 text-[12px] text-muted-foreground hover:bg-accent" onClick={() => setFontSize(16)}>恢复默认</button>
              </PopoverContent>
            </Popover></div>
            {/* V7 标注 1：配色方案切换（整站色系，含侧边栏；记忆用户选择） */}
            <div className="hidden lg:block"><Popover>
              <PopoverTrigger asChild>
                <button
                  title="切换整个系统的显示配色方案"
                  className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-accent"
                >
                  <Palette className="h-3.5 w-3.5" /> 配色
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="end">
                <div className="mb-1.5 px-1 text-[12px] font-medium">显示配色方案</div>
                {PALETTES.map((pl) => (
                  <button
                    key={pl.key}
                    onClick={() => setPalette(pl.key)}
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] transition-colors hover:bg-accent ${palette === pl.key ? "bg-accent" : ""}`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: pl.swatch }} />
                    <span className="flex-1 text-left">{pl.label}</span>
                    {palette === pl.key && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
                <div className="mt-1 border-t border-border px-1 pt-1.5 text-[10.5px] text-muted-foreground">配色全站生效并自动记忆，可与暗夜模式叠加</div>
              </PopoverContent>
            </Popover></div>
            {/* 网站更新：仅超级管理员可激活，其他人灰色不可激活（需求 5） */}
            <button
              onClick={() => isSuper && setSiteOpen(true)}
              disabled={!isSuper}
              title={isSuper ? "打开网站更新中心" : "仅超级管理员可执行网站更新"}
              className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                isSuper
                  ? "border-border text-primary hover:bg-accent"
                  : "cursor-not-allowed border-border/60 text-muted-foreground/45"
              }`}
            >
              <Globe className="h-3.5 w-3.5" /> <span className="hidden sm:inline">网站更新</span>
            </button>
            <div className="hidden text-right sm:block">
              <div className="text-[13px] font-medium">{user.name}</div>
            </div>
            <button onClick={logout} title="退出登录" className="rounded-sm border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-3 py-4 sm:px-5 sm:py-5">
          {user.restricted && (
            <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">
              您的账号当前为受限状态（已毕业/离校）：可以浏览系统内信息，但不能进行数据添加、修改或删除操作。如需恢复，请联系超级管理员。
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <WebsiteUpdateCenter open={siteOpen} onClose={() => setSiteOpen(false)} />
    </div>
  );
}
