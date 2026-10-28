// 6.2 外部接口：LLM / WoS / 课题组网站 / CalDAV 集中配置 + 移动办公说明
import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sparkles, LineChart, Globe, CalendarSync, Smartphone, Loader2, PlugZap } from "lucide-react";

type Cfg = {
  key: string;
  name: string;
  fields: { key: string; label: string; secret?: boolean }[];
  config: Record<string, string>;
  enabled: boolean;
};

const ICONS: Record<string, React.ReactNode> = {
  llm: <Sparkles className="h-4 w-4 text-purple-900 dark:text-purple-300" />,
  wos: <LineChart className="h-4 w-4 text-sky-900 dark:text-sky-300" />,
  website: <Globe className="h-4 w-4 text-emerald-900 dark:text-emerald-300" />,
  caldav: <CalendarSync className="h-4 w-4 text-amber-800 dark:text-amber-300" />,
};

const DESC: Record<string, string> = {
  llm: "扫描条目附件（论文/稿件/过程文档），自动辨识关键字段并回填。模型与凭证由平台按站点供给，无需在此填写；解析结果必须人工确认后入库。",
  wos: "通过 Web of Science API 自动更新本组论文他引次数（2.7 模块「全部刷新」使用）。",
  website: "一键网站更新的推送通道：网站经 Feed API（/api/public/website-feed?token=***）拉取，或填写 Webhook 地址接收推送。",
  caldav: "将系统待办推送/更新到用户手机日历，与手机共享日程（iOS/安卓均支持 CalDAV）。",
};

export default function Integrations() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.config.list.useQuery();
  const [forms, setForms] = useState<Record<string, Cfg>>({});
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});
  const editable = can("config.integrations", "manage");

  useEffect(() => {
    if (data) setForms(Object.fromEntries((data as Cfg[]).map((c) => [c.key, { ...c, config: { ...c.config } }])));
  }, [data]);

  const save = trpc.config.save.useMutation({
    onSuccess: (_r, v) => { utils.config.list.invalidate(); setTestMsg((m) => ({ ...m, [v.key]: "已保存。" })); },
  });
  const test = trpc.config.test.useMutation({
    onSuccess: (r, v) => setTestMsg((m) => ({ ...m, [v.key]: r.message ?? "" })),
  });

  if (!data) return <Loader2 className="mx-auto mt-20 h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div>
      <PageHeader title="外部接口" sub="平台 AI 文档解析由站点统一供给；在此配置 WoS 他引更新、课题组网站同步与 CalDAV 手机日历" />
      <div className="grid gap-4 lg:grid-cols-2">
        {(Object.values(forms) as Cfg[]).map((c) => {
          const platformManaged = c.key === "llm";
          return (
          <section key={c.key} className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">{ICONS[c.key]} {c.name}</h3>
              <div className="flex items-center gap-2">
                <Pill text={platformManaged ? "平台供给" : (c.enabled ? "已启用" : "未启用")} tone={c.enabled ? "green" : "gray"} />
                {editable && !platformManaged && (
                  <Switch
                    checked={c.enabled}
                    onCheckedChange={(v) => setForms((f) => ({ ...f, [c.key]: { ...c, enabled: v } }))}
                  />
                )}
              </div>
            </div>
            <p className="mb-3 text-[12px] leading-5 text-muted-foreground">{DESC[c.key]}</p>
            <div className="space-y-2">
              {c.fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{f.label}</span>
                  <Input
                    type={f.secret ? "password" : "text"}
                    disabled={!editable}
                    value={c.config[f.key] ?? ""}
                    onChange={(e) => setForms((prev) => ({ ...prev, [c.key]: { ...c, config: { ...c.config, [f.key]: e.target.value } } }))}
                  />
                </label>
              ))}
            </div>
            {editable && !platformManaged && (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={() => save.mutate({ key: c.key as "llm", config: c.config, enabled: c.enabled })}>保存</Button>
                <Button size="sm" variant="outline" onClick={() => test.mutate({ key: c.key as "llm" })}>
                  <PlugZap className="mr-1 h-3.5 w-3.5" />测试连接
                </Button>
              </div>
            )}
            {testMsg[c.key] && <div className="mt-2 rounded-sm bg-secondary/60 px-3 py-1.5 text-[12px]">{testMsg[c.key]}</div>}
          </section>
          );
        })}
      </div>

      {/* 移动办公需求 */}
      <section className="mt-4 rounded-md border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><Smartphone className="h-4 w-4 text-primary" /> 移动办公场景（手机使用本系统）</h3>
        <ul className="grid gap-1.5 text-[13px] leading-6 md:grid-cols-2">
          <li>· <b>待办推送</b>：评审截止、导师反馈、经费预警等待办经 CalDAV 进入手机日历提醒；</li>
          <li>· <b>文档审批</b>：导师在手机上查看学生提交的过程文档并填写文字反馈；</li>
          <li>· <b>周报随手提交</b>：学生手机端拍照/上传周报与过程文档附件；</li>
          <li>· <b>日程同步</b>：学术活动、专家报告时间自动进入手机日历；</li>
          <li>· <b>管理提醒</b>：AI 解析待确认、网站更新待推送等管理类事项提醒；</li>
          <li>· <b>实现路径</b>：系统为响应式 Web（手机浏览器直接使用），提醒走 CalDAV 标准协议，无需自研 App。</li>
        </ul>
      </section>
    </div>
  );
}
