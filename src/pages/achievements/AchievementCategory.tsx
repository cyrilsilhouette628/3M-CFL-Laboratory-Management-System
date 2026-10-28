// 成果管理 · 类别子模块页（需求 11/12/13：六类成果各占一个左侧二级菜单项）
import { useState } from "react";
import { useParams, Navigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Sparkles, Loader2 } from "lucide-react";
import { FundingEditor, type Funding } from "@/components/FundingEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ACHIEVEMENT_SECTIONS } from "@contracts/constants";
import { exportXlsx, downloadText } from "@/lib/helpers";
import { Plus, Pencil, Trash2, Download } from "lucide-react";

type Row = {
  id: number; category: string; title: string; authors: string | null; year: number; date: string | null;
  detail: Record<string, string>; evidenceFileIds: number[]; isPublic: boolean; fromStudentName: string | null;
  createdBy: number | null; fundings: Funding[];
};
type EditRow = Partial<Row> & { fundingProjectIds?: number[] };

const DETAIL_FIELDS: Record<string, string[]> = {
  // V17 问题8：论文条目字段全栈统一——卷期页 / DOI号 / 摘要 三个字段独立（人工填报、AI 回填、列表显示一致）
  published_paper: ["期刊", "分区", "卷期页", "DOI号", "关键词", "摘要"],
  patent: ["专利号", "专利类型", "授权日", "维护代理", "专利保护期"],
  award: ["奖励名称", "等级", "颁奖单位"],
  student_work: ["类型", "级别", "指导教师"],
  book: ["出版社", "ISBN", "出版时间"],
  software_copyright: ["登记号", "类型(软著/标准)", "发证机构"],
};

// V13 问题4：明细字段的输入控件类型——日期类统一日历组件（存储统一 YYYY-MM-DD），专利类型固定四选一下拉
const DETAIL_FIELD_META: Record<string, { type: "date" } | { type: "select"; options: string[] } | { type: "textarea" }> = {
  授权日: { type: "date" },
  专利保护期: { type: "date" },
  出版时间: { type: "date" },
  专利类型: { type: "select", options: ["发明专利", "国防专利", "实用新型", "软件著作权"] },
  摘要: { type: "textarea" },
};

// 列表列布局（V18 问题9）：论文列表固定为 标题｜期刊｜完成人｜年度｜关键词｜佐证文件｜操作；
// 日期、DOI号、卷期页、摘要、分区、公开 均不在列表显示（数据仍保留在明细、编辑表单与 Excel 导出中）
const TABLE_LAYOUT: Record<string, { preAuthorCols?: string[]; postYearCols?: string[]; hideDate?: boolean; hideDetailCol?: boolean; hidePublicCol?: boolean }> = {
  published_paper: { preAuthorCols: ["期刊"], postYearCols: ["关键词"], hideDate: true, hideDetailCol: true, hidePublicCol: true },
};

// 常见手写日期（2022.10.28 / 2022/10/28 / 2022年10月28日）→ 统一 YYYY-MM-DD；无法识别返回空串
function toIsoDate(v?: string | null): string {
  if (!v) return "";
  const m = v.match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

const SECTION_HINTS: Record<string, string> = {
  published_paper: "正式发表/录用的学术论文；可人工多选后按指定参考文献格式导出",
  patent: "已授权知识产权；维护代理与专利保护期用于续费和到期提醒",
  award: "团队科研获奖；获奖信息将自动进入网站更新队列",
  student_work: "学生论文/竞赛/项目等成果；归属学生的成果将自动进入网站更新队列",
  book: "专著与教材；佐证文件建议上传封面与版权页",
  software_copyright: "软件著作权与标准；佐证文件建议上传登记证书",
};

type CitationStyle = "gbt7714" | "apa" | "ieee" | "bibtex";
function achievementCitation(a: Row, style: CitationStyle): string {
  const authors = a.authors ?? "";
  const venue = a.detail["期刊"] ?? "";
  const volumePages = a.detail["卷期页"] ?? "";
  const doi = a.detail["DOI号"] ?? "";
  if (style === "bibtex") {
    const key = `ref${a.year}${authors.split(/[,，]/)[0]?.trim().replace(/\s+/g, "") || a.id}`;
    return `@article{${key},\n  author = {${authors}},\n  title = {${a.title}},\n  journal = {${venue}},\n  year = {${a.year}},\n  volume = {${volumePages}},\n  doi = {${doi}}\n}`;
  }
  if (style === "apa") return `${authors} (${a.year}). ${a.title}. ${venue}${volumePages ? `, ${volumePages}` : ""}.${doi ? ` https://doi.org/${doi}` : ""}`;
  if (style === "ieee") return `${authors}, “${a.title},” ${venue}${volumePages ? `, ${volumePages}` : ""}, ${a.year}.${doi ? ` doi: ${doi}.` : ""}`;
  return `${authors}. ${a.title}[J]. ${venue}, ${a.year}${volumePages ? `, ${volumePages}` : ""}.${doi ? ` DOI: ${doi}.` : ""}`;
}

function protectionDays(date?: string): number | null {
  const iso = toIsoDate(date);
  if (!iso) return null;
  return Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / 86400000);
}

export default function AchievementCategory() {
  const { category } = useParams();
  const section = ACHIEVEMENT_SECTIONS.find((s) => s.path === `/achievements/${category}`);
  const { can, user } = useAuth();
  const utils = trpc.useUtils();
  const [yearFilter, setYearFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<EditRow | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("gbt7714");

  const { data } = trpc.achievements.list.useQuery(
    { category: section?.category, year: yearFilter ? Number(yearFilter) : undefined, keyword: keyword || undefined },
    { enabled: !!section },
  );
  const create = trpc.achievements.create.useMutation({
    onSuccess: () => { utils.achievements.list.invalidate(); utils.achievements.stats.invalidate(); },
    onError: (e) => alert(e.message),
  });
  const update = trpc.achievements.update.useMutation({
    onSuccess: () => { utils.achievements.list.invalidate(); utils.achievements.stats.invalidate(); },
    onError: (e) => alert(e.message),
  });
  const remove = trpc.achievements.remove.useMutation({
    onSuccess: () => { utils.achievements.list.invalidate(); utils.achievements.stats.invalidate(); },
    onError: (e) => alert(e.message),
  });

  // V12 问题2b：AI 解析佐证文件 → 自动回填表单字段
  const [aiBusy, setAiBusy] = useState(false);
  const parseFile = trpc.ai.parseFileFields.useMutation();
  async function runAiParse() {
    const fid = editing?.evidenceFileIds?.[editing.evidenceFileIds.length - 1];
    if (!fid) { alert("请先上传佐证文件，再点击 AI 解析。"); return; }
    setAiBusy(true);
    try {
      const res = await parseFile.mutateAsync({ fileId: fid, module: "achievement" });
      if (!res.ok) { alert(res.message ?? "AI 解析失败"); return; }
      const f = res.fields ?? {};
      const filled: string[] = [];
      setEditing((e) => {
        if (!e) return e;
        const detail = { ...(e.detail ?? {}) };
        const next = { ...e, detail };
        const take = (keys: string[], apply: (v: string) => void, label: string) => {
          for (const k of keys) {
            const v = f[k];
            if (v) { apply(v); filled.push(label); return; }
          }
        };
        take(["标题", "论文题目"], (v) => { next.title = v; }, "标题");
        take(["作者", "完成人"], (v) => { next.authors = v; }, "完成人/作者");
        take(["年度"], (v) => { const y = Number(v.replace(/\D/g, "").slice(0, 4)); if (y) next.year = y; }, "年度");
        take(["日期", "发表时间"], (v) => { next.date = v; }, "日期");
        for (const k of (DETAIL_FIELDS[section?.category ?? ""] ?? [])) {
          const v = f[k] ?? (k === "DOI号" ? f["DOI"] : undefined); // DOI 为 DOI号 的模型别名
          if (v) { detail[k] = v; filled.push(k); }
        }
        // 其余模型返回的键也保留进 detail，便于人工参考（DOI 已并入 DOI号，跳过）
        for (const [k, v] of Object.entries(f)) {
          if (v && !(k in detail) && !["标题", "论文题目", "作者", "完成人", "年度", "日期", "发表时间", "DOI"].includes(k)) detail[k] = String(v);
        }
        return next;
      });
      alert(`AI 解析完成（模型：${res.model ?? "已配置模型"}），已回填：${filled.length ? filled.join("、") : "详见明细字段"}。请核对后确认入库。`);
    } catch (err) {
      alert(`AI 解析失败：${err instanceof Error ? err.message : "网络错误"}`);
    } finally {
      setAiBusy(false);
    }
  }

  if (!section) return <Navigate to="/achievements" replace />;
  const editable = can(section.perm, "editable");
  const manageable = can(section.perm, "manage");
  const layout = TABLE_LAYOUT[section.category] ?? {}; // 列表列布局（论文：期刊/关键词独立列，隐藏日期/关键信息/公开）
  const splitKeys = [...(layout.preAuthorCols ?? []), ...(layout.postYearCols ?? [])]; // 已拆为独立列、关键信息中不再重复展示的字段
  const selectable = section.category === "published_paper" || section.category === "patent";
  const rows = (data ?? []) as Row[];
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const expiring = section.category === "patent" ? rows.filter((row) => {
    const days = protectionDays(row.detail["专利保护期"]);
    return days !== null && days <= 90;
  }) : [];

  function toggleSelected(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportSelected() {
    if (!selectedRows.length) return;
    if (section!.category === "published_paper") {
      const extension = citationStyle === "bibtex" ? "bib" : "txt";
      downloadText(`已发表论文-${citationStyle}.${extension}`, selectedRows.map((row) => achievementCitation(row, citationStyle)).join("\n\n"));
      return;
    }
    exportXlsx("已获知识产权-选中导出", "知识产权", selectedRows.map((row) => ({
      标题: row.title, 完成人: row.authors, 年度: row.year, 授权日: row.detail["授权日"] ?? row.date,
      专利号: row.detail["专利号"] ?? "", 类型: row.detail["专利类型"] ?? "",
      维护代理: row.detail["维护代理"] ?? "", 专利保护期: row.detail["专利保护期"] ?? "",
      剩余天数: protectionDays(row.detail["专利保护期"]) ?? "",
    })));
  }

  function save() {
    if (!editing?.title || !editing?.year) return;
    const payload = {
      category: section!.category,
      title: editing.title, authors: editing.authors ?? "", year: editing.year,
      date: editing.date ?? "", detail: editing.detail ?? {}, evidenceFileIds: editing.evidenceFileIds ?? [],
      isPublic: !!editing.isPublic, fromStudentName: editing.fromStudentName ?? undefined,
      fundingProjectIds: editing.fundingProjectIds ?? editing.fundings?.map((f) => f.projectId) ?? [],
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title={section.label}
        sub={SECTION_HINTS[section.category] ?? ""}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportXlsx(section.label, section.label, (data ?? []).map((a) => ({ 标题: a.title, 完成人: a.authors, 年度: a.year, 日期: a.date, ...Object.fromEntries(Object.entries(a.detail).filter(([k]) => !k.startsWith("_"))), 公开: a.isPublic ? "是" : "否" })))}>
              <Download className="mr-1 h-3.5 w-3.5" />导出 Excel
            </Button>
            {section.category === "published_paper" && (
              <Select value={citationStyle} onValueChange={(value) => setCitationStyle(value as CitationStyle)}>
                <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="gbt7714">GB/T 7714</SelectItem><SelectItem value="apa">APA</SelectItem><SelectItem value="ieee">IEEE</SelectItem><SelectItem value="bibtex">BibTeX</SelectItem></SelectContent>
              </Select>
            )}
            {selectable && <Button variant="outline" size="sm" disabled={!selectedRows.length} onClick={exportSelected}><Download className="mr-1 h-3.5 w-3.5" />导出选中（{selectedRows.length}）</Button>}
            {editable && (
              <Button size="sm" onClick={() => setEditing({ category: section.category, year: new Date().getFullYear(), detail: {}, evidenceFileIds: [] })}>
                <Plus className="mr-1 h-3.5 w-3.5" />新增{section.label}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-full sm:w-64" placeholder="检索标题 / 完成人" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <Input className="w-28" type="number" placeholder="年度" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} />
      </div>

      {expiring.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12.5px] text-amber-800 dark:text-amber-300">
          <div className="font-medium">保护期到期提醒：{expiring.length} 项已到期或将在 90 天内到期，请及时联系维护代理办理续费或维护。</div>
          <div className="mt-1">{expiring.map((row) => `${row.title}（${row.detail["专利保护期"]}，${(protectionDays(row.detail["专利保护期"]) ?? 0) < 0 ? "已到期" : `剩余 ${protectionDays(row.detail["专利保护期"])} 天`}）`).join("；")}</div>
        </div>
      )}

      {!data?.length ? <EmptyState /> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="data-table">
            <thead><tr>
              {selectable && <th className="w-10"><Checkbox aria-label="选择当前列表全部成果" checked={rows.length > 0 && selectedRows.length === rows.length} onCheckedChange={(checked) => setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set())} /></th>}
              <th>标题</th>
              {(layout.preAuthorCols ?? []).map((k) => <th key={k}>{k}</th>)}
              <th>完成人</th><th>年度</th>
              {(layout.postYearCols ?? []).map((k) => <th key={k}>{k}</th>)}
              {!layout.hideDetailCol && <th>关键信息</th>}<th>佐证文件</th>
              {!layout.hidePublicCol && <th>公开</th>}
              {editable && <th className="w-20">操作</th>}
            </tr></thead>
            <tbody>
              {(data as Row[]).map((a) => (
                <tr key={a.id}>
                  {selectable && <td><Checkbox aria-label={`选择 ${a.title}`} checked={selected.has(a.id)} onCheckedChange={() => toggleSelected(a.id)} /></td>}
                  <td className="max-w-72 font-medium">{a.title}
                    {a.fromStudentName && <div className="text-[11px] text-muted-foreground">归属学生：{a.fromStudentName}</div>}
                    {a.fundings?.length > 0 && (
                      <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                        资助：{a.fundings.map((f) => `${f.ord}.${f.projectName}${f.projectCode ? `（${f.projectCode}）` : ""}`).join("；")}
                      </div>
                    )}
                  </td>
                  {(layout.preAuthorCols ?? []).map((k) => (
                    <td key={k} className="max-w-48 text-[12px]"><span className="break-all">{a.detail[k] ?? ""}</span></td>
                  ))}
                  <td className="max-w-44">{a.authors}</td>
                  <td className="tabular-nums">{a.year}{!layout.hideDate && a.date && <div className="text-[11px] text-muted-foreground">{a.date}</div>}</td>
                  {(layout.postYearCols ?? []).map((k) => (
                    <td key={k} className="max-w-64 text-[12px]"><span className="break-all">{a.detail[k] ?? ""}</span></td>
                  ))}
                  {!layout.hideDetailCol && (
                    <td className="max-w-56 text-[12px]">
                      {Object.entries(a.detail).filter(([k, v]) => v && !k.startsWith("_") && !splitKeys.includes(k)).map(([k, v]) => <div key={k}><span className="text-muted-foreground">{k}：</span>{v}</div>)}
                      {section.category === "patent" && protectionDays(a.detail["专利保护期"]) !== null && (
                        <div className={`mt-1 font-medium ${(protectionDays(a.detail["专利保护期"]) ?? 0) <= 90 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
                          {(protectionDays(a.detail["专利保护期"]) ?? 0) < 0 ? `已到期 ${Math.abs(protectionDays(a.detail["专利保护期"]) ?? 0)} 天` : `保护期剩余 ${protectionDays(a.detail["专利保护期"])} 天`}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="min-w-40"><FileChips ids={a.evidenceFileIds} /></td>
                  {!layout.hidePublicCol && (
                    <td>{a.isPublic ? <Pill text="可公开" tone="purple" /> : <span className="text-[12px] text-muted-foreground">内部</span>}</td>
                  )}
                  {editable && (
                    <td className="whitespace-nowrap">
                      {(manageable || a.createdBy === user?.id || a.fromStudentName === user?.name) && <button title="编辑本人成果" className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" /></button>}
                      {manageable && <button title="删除成果" className="text-muted-foreground hover:text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: a.id })}><Trash2 className="h-3.5 w-3.5" /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑" : "新增"}{section.label}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <Field label="年度" required><Input type="number" value={editing?.year ?? ""} onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })} /></Field>
            <Field label="日期"><Input type="date" value={toIsoDate(editing?.date)} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="标题" required><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field></div>
            <Field label="完成人 / 作者"><Input value={editing?.authors ?? ""} onChange={(e) => setEditing({ ...editing, authors: e.target.value })} /></Field>
            {section.category === "student_work" && (
              <Field label="归属学生"><Input value={editing?.fromStudentName ?? ""} onChange={(e) => setEditing({ ...editing, fromStudentName: e.target.value })} /></Field>
            )}
            {(DETAIL_FIELDS[section.category] ?? []).map((f) => {
              const meta = DETAIL_FIELD_META[f];
              const setVal = (v: string) => setEditing({ ...editing, detail: { ...(editing?.detail ?? {}), [f]: v } });
              const control = meta?.type === "date" ? (
                <Input type="date" value={toIsoDate(editing?.detail?.[f])} onChange={(e) => setVal(e.target.value)} />
              ) : meta?.type === "select" ? (
                <Select value={editing?.detail?.[f] ?? ""} onValueChange={setVal}>
                  <SelectTrigger><SelectValue placeholder={`请选择${f}`} /></SelectTrigger>
                  <SelectContent>{meta.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ) : meta?.type === "textarea" ? (
                <Textarea rows={4} value={editing?.detail?.[f] ?? ""} onChange={(e) => setVal(e.target.value)} />
              ) : (
                <Input value={editing?.detail?.[f] ?? ""} onChange={(e) => setVal(e.target.value)} />
              );
              return meta?.type === "textarea" ? (
                <div key={f} className="col-span-2"><Field label={f}>{control}</Field></div>
              ) : (
                <Field key={f} label={f}>{control}</Field>
              );
            })}
            <div className="col-span-2">
              <div className="mb-1 text-[12px] font-medium text-muted-foreground">资助项目（勾选已入库项目；获批号自动带出；排序即资助排名，第 1 位为第一资助）</div>
              <FundingEditor
                value={editing?.fundingProjectIds ?? editing?.fundings?.map((f) => f.projectId) ?? []}
                onChange={(ids) => setEditing({ ...editing, fundingProjectIds: ids, fundings: undefined })}
              />
            </div>
            <div className="col-span-2">
              <Field label="佐证文件（论文首页 / 证书扫描件等，可多个）">
                <FileChips ids={editing?.evidenceFileIds ?? []} />
                <div className="mt-1.5"><FileUpload module="achievement" compact onUploaded={(fid) => setEditing((e) => ({ ...e, evidenceFileIds: [...(e?.evidenceFileIds ?? []), fid] }))} /></div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={aiBusy || !(editing?.evidenceFileIds?.length)} onClick={runAiParse}>
                    {aiBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                    {aiBusy ? "AI 解析中…" : "AI 解析"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">对最新上传的佐证文件调用平台 AI，自动提取标题/作者/期刊/DOI 等填入本表单（解析结果需人工核对）</span>
                </div>
              </Field>
            </div>
            <Field label="可公开（同步课题组网站）">
              <div className="pt-1.5"><Switch checked={!!editing?.isPublic} onCheckedChange={(v) => setEditing({ ...editing, isPublic: v })} /></div>
            </Field>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.title || !editing?.year} onClick={save}>确认入库</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
