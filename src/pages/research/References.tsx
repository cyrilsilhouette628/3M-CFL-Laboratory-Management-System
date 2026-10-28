// 重要参考文献：多级研究方向、文章/书籍、PDF AI 解析、检索推送与紧凑折叠卡片
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { exportXlsx, downloadText } from "@/lib/helpers";
import {
  Plus, Pencil, Trash2, Download, Send, Quote, Upload, FolderOpen, FolderPlus,
  Sparkles, Folder, ChevronDown, ChevronUp, BookOpen, FileText, Loader2,
} from "lucide-react";

type Row = {
  id: number;
  authors: string;
  year: number | null;
  title: string;
  referenceType: "article" | "book";
  venue: string | null;
  publisher: string | null;
  isbn: string | null;
  volume: string | null;
  pages: string | null;
  doi: string | null;
  abstract: string | null;
  keywords: string | null;
  category: string | null;
  tags: string | null;
  importance: number;
  notes: string | null;
  fileId: number | null;
  directionId: number | null;
  directionName: string | null;
};
type Direction = { id: number; name: string; description: string | null; parentId: number | null; path: string; count: number };
type DirectionDraft = { name: string; description: string; parentId: number | null };

const CITE_STYLES = [
  { key: "gbt7714", label: "GB/T 7714" },
  { key: "apa", label: "APA" },
  { key: "ieee", label: "IEEE" },
  { key: "bibtex", label: "BibTeX" },
] as const;
type CiteStyle = (typeof CITE_STYLES)[number]["key"];

export default function References() {
  const { can, user } = useAuth();
  const utils = trpc.useUtils();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [directionId, setDirectionId] = useState<number | null | undefined>(undefined);
  const { data } = trpc.references.list.useQuery({ keyword: keyword || undefined, category: category || undefined, directionId });
  const dirsQuery = trpc.refDirections.list.useQuery();
  const dirs = (dirsQuery.data ?? []) as Direction[];
  const { data: userOptions } = trpc.users.options.useQuery();
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"bibtex" | "ris">("bibtex");
  const [pushing, setPushing] = useState<Row | null>(null);
  const [pushTargets, setPushTargets] = useState<number[]>([]);
  const [citing, setCiting] = useState<{ id: number; title: string } | null>(null);
  const [citeStyle, setCiteStyle] = useState<CiteStyle>("gbt7714");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dirEditing, setDirEditing] = useState<DirectionDraft | null>(null);
  const isAdmin = user?.role === "super_admin" || !!user?.isAdmin;
  const manageable = isAdmin && can("research.references", "manage");
  const editable = manageable && can("research.references", "editable");
  const canPush = can("research.references", "editable");

  const refresh = () => {
    utils.references.list.invalidate();
    utils.refDirections.list.invalidate();
  };
  const create = trpc.references.create.useMutation({ onSuccess: () => { refresh(); setEditing(null); }, onError: (e) => alert(e.message) });
  const update = trpc.references.update.useMutation({ onSuccess: () => { refresh(); setEditing(null); }, onError: (e) => alert(e.message) });
  const remove = trpc.references.remove.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const importMut = trpc.references.importText.useMutation({
    onSuccess: (r) => { refresh(); alert(`成功导入 ${r.imported} 条文献`); setImporting(false); setImportText(""); },
    onError: (e) => alert(e.message),
  });
  const push = trpc.references.push.useMutation({
    onSuccess: () => { alert("已推送，并在接收人的看板生成阅读待办。"); setPushing(null); setPushTargets([]); },
    onError: (e) => alert(e.message),
  });
  const citeQuery = trpc.references.cite.useQuery(
    { id: citing?.id ?? -1, style: citeStyle },
    { enabled: !!citing },
  );
  const createDir = trpc.refDirections.create.useMutation({
    onSuccess: () => { utils.refDirections.list.invalidate(); setDirEditing(null); },
    onError: (e) => alert(e.message),
  });
  const removeDir = trpc.refDirections.remove.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const classifyOne = trpc.refDirections.classify.useMutation({ onError: (e) => alert(e.message) });
  const parsePdf = trpc.ai.parseFileFields.useMutation({ onError: (e) => alert(e.message) });

  function save() {
    if (!editing?.title || !editing?.authors) return;
    const payload = {
      authors: editing.authors,
      title: editing.title,
      year: editing.year ?? undefined,
      referenceType: editing.referenceType ?? "article",
      venue: editing.venue ?? "",
      publisher: editing.publisher ?? "",
      isbn: editing.isbn ?? "",
      volume: editing.volume ?? "",
      pages: editing.pages ?? "",
      doi: editing.doi ?? "",
      abstract: editing.abstract ?? "",
      keywords: editing.keywords ?? "",
      category: editing.category ?? "",
      tags: editing.tags ?? "",
      importance: editing.importance ?? 3,
      notes: editing.notes ?? "",
      fileId: editing.fileId ?? undefined,
      directionId: editing.directionId ?? null,
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
  }

  async function parseAndFill() {
    if (!editing?.fileId) return;
    const result = await parsePdf.mutateAsync({ fileId: editing.fileId, module: "reference" });
    if (!result.ok) {
      alert(result.message);
      return;
    }
    const f = result.fields;
    const yearText = f["年度"] || f["发表时间"] || f["日期"] || "";
    const parsedYear = Number(yearText.slice(0, 4));
    const volumePages = f["卷期页"] ?? "";
    setEditing((current) => ({
      ...current,
      title: f["标题"] || current?.title,
      authors: f["作者"] || current?.authors,
      year: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : current?.year,
      referenceType: f["出版社"] || f["ISBN"] ? "book" : (current?.referenceType ?? "article"),
      venue: f["期刊"] || current?.venue,
      publisher: f["出版社"] || current?.publisher,
      isbn: f["ISBN"] || current?.isbn,
      volume: volumePages || current?.volume,
      doi: f["DOI号"] || f["DOI"] || current?.doi,
      keywords: f["关键词"] || current?.keywords,
      abstract: f["摘要"] || current?.abstract,
    }));
    alert(`AI 解析完成（${result.model}），请核对回填内容后保存。`);
  }

  function toggleExpanded(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const categories = [...new Set((data ?? []).map((r) => r.category).filter(Boolean))] as string[];
  const allExpanded = !!data?.length && expanded.size >= data.length;

  return (
    <div>
      <PageHeader
        title="重要参考文献管理"
        sub="多级研究方向 · 文章/书籍 · PDF AI 解析回填 · 检索与推送 · 新增和编辑仅管理员"
        actions={<>
          <Button variant="outline" size="sm" onClick={async () => { const r = await utils.references.exportText.fetch({ format: "bibtex" }); downloadText("references.bib", r.text); }}><Download className="mr-1 h-3.5 w-3.5" />导出 BibTeX</Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("参考文献", "文献", (data ?? []).map((r) => ({ 类型: r.referenceType === "book" ? "书籍" : "文章", 作者: r.authors, 年份: r.year, 标题: r.title, 期刊会议: r.venue, 出版社: r.publisher, ISBN: r.isbn, DOI: r.doi, 方向: r.directionName, 标签: r.tags, 重要性: r.importance })))}>导出 Excel</Button>
          {editable && <Button variant="outline" size="sm" onClick={() => setImporting(true)}><Upload className="mr-1 h-3.5 w-3.5" />导入</Button>}
          {editable && <Button size="sm" onClick={() => setEditing({ importance: 3, referenceType: "article", directionId: typeof directionId === "number" ? directionId : null })}><Plus className="mr-1 h-3.5 w-3.5" />新增文献</Button>}
        </>}
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-60">
          <div className="rounded-md border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[12.5px] font-semibold">研究方向</span>
              {manageable && (
                <button type="button" title="新增顶级方向" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDirEditing({ name: "", description: "", parentId: null })}>
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="p-1.5">
              <button type="button" onClick={() => setDirectionId(undefined)} className={`flex min-h-9 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12.5px] ${directionId === undefined ? "bg-accent text-primary" : "hover:bg-accent/50"}`}>
                <FolderOpen className="h-3.5 w-3.5" />全部文献
              </button>
              <button type="button" onClick={() => setDirectionId(null)} className={`flex min-h-9 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12.5px] ${directionId === null ? "bg-accent text-primary" : "hover:bg-accent/50"}`}>
                <Folder className="h-3.5 w-3.5" />未归入方向
              </button>
              {dirs.map((d) => {
                const depth = Math.max(0, d.path.split(" / ").length - 1);
                return (
                  <div key={d.id} className={`group flex items-center rounded-sm ${directionId === d.id ? "bg-accent" : "hover:bg-accent/50"}`} style={{ paddingLeft: `${Math.min(depth, 5) * 12}px` }}>
                    <button type="button" onClick={() => setDirectionId(d.id)} className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[12.5px] ${directionId === d.id ? "text-primary" : ""}`} title={d.path}>
                      <Folder className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="text-[11px] text-muted-foreground">{d.count}</span>
                    </button>
                    {manageable && (
                      <div className="flex shrink-0 items-center pr-1">
                        <button type="button" title={`在「${d.name}」下新增子方向`} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDirEditing({ name: "", description: "", parentId: d.id })}>
                          <FolderPlus className="h-3 w-3" />
                        </button>
                        <button type="button" title="删除方向" className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => confirm(`确认删除方向「${d.path}」？其中文献将改为未归入方向。`) && removeDir.mutate({ id: d.id })}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            <Input className="w-full sm:w-72" placeholder="检索标题 / 作者 / 关键词 / 标签" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="全部主题" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            {category && <Button variant="ghost" size="sm" onClick={() => setCategory("")}>清除筛选</Button>}
            {!!data?.length && <Button variant="ghost" size="sm" onClick={() => setExpanded(allExpanded ? new Set() : new Set(data.map((r) => r.id)))}>{allExpanded ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}{allExpanded ? "全部折叠" : "全部展开"}</Button>}
          </div>

          {!data?.length ? <EmptyState /> : (
            <div className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {data.map((r) => {
                const isExpanded = expanded.has(r.id);
                const isBook = r.referenceType === "book";
                return (
                  <article key={r.id} className="min-w-0 rounded-md border border-border bg-card p-3">
                    <div className="flex items-start gap-2">
                      {isBook ? <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                      <button type="button" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => toggleExpanded(r.id)} aria-expanded={isExpanded}>
                        <div className="line-clamp-2 text-[13.5px] font-medium leading-5">{r.title}</div>
                        <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                          {r.authors} · {r.year ?? "—"} · {(isBook ? r.publisher : r.venue) ?? "—"}
                        </div>
                      </button>
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-primary" title={isExpanded ? "折叠" : "展开"} onClick={() => toggleExpanded(r.id)}>{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="badge border-border bg-secondary">{isBook ? "书籍" : "文章"}</span>
                      {r.directionName && <span className="badge border-emerald-800/30 bg-emerald-800/10 text-emerald-900 dark:text-emerald-300">{r.directionName}</span>}
                      <span className="badge border-amber-700/30 bg-amber-600/10 text-amber-800 dark:text-amber-300">{"★".repeat(r.importance)}</span>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 space-y-2 border-t border-border pt-3 text-[12px] leading-5 text-muted-foreground">
                        {isBook ? <div>{r.publisher && <div>出版社：{r.publisher}</div>}{r.isbn && <div>ISBN：{r.isbn}</div>}</div> : <div>{r.volume && <span>卷期：{r.volume}　</span>}{r.pages && <span>页码：{r.pages}</span>}</div>}
                        {r.doi && <div className="break-all">DOI：{r.doi}</div>}
                        {r.keywords && <div>关键词：{r.keywords}</div>}
                        {r.tags && <div>标签：{r.tags}</div>}
                        {r.abstract && <div className="whitespace-pre-wrap">摘要：{r.abstract}</div>}
                        {r.notes && <div className="whitespace-pre-wrap">笔记：{r.notes}</div>}
                        {r.fileId && <FileChips ids={[r.fileId]} />}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-end gap-0.5 border-t border-border pt-2">
                      <Button variant="ghost" size="sm" title="生成引用格式" onClick={() => setCiting({ id: r.id, title: r.title })}><Quote className="h-3.5 w-3.5" /></Button>
                      {canPush && <Button variant="ghost" size="sm" title="推送给成员" onClick={() => { setPushing(r); setPushTargets([]); }}><Send className="h-3.5 w-3.5" /></Button>}
                      {editable && <Button variant="ghost" size="sm" title="编辑" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {manageable && <Button variant="ghost" size="sm" title="删除" className="text-destructive" onClick={() => confirm("确认删除这条文献？") && remove.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑文献" : "新增文献"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <Field label="文献类型" required>
              <Select value={editing?.referenceType ?? "article"} onValueChange={(v) => setEditing({ ...editing, referenceType: v as "article" | "book" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="article">文章</SelectItem><SelectItem value="book">书籍</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="年份"><Input type="number" value={editing?.year ?? ""} onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) || undefined })} /></Field>
            <div className="sm:col-span-2"><Field label="标题" required><Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field label="作者" required><Input value={editing?.authors ?? ""} onChange={(e) => setEditing({ ...editing, authors: e.target.value })} /></Field></div>
            {editing?.referenceType === "book" ? <>
              <Field label="出版社"><Input value={editing?.publisher ?? ""} onChange={(e) => setEditing({ ...editing, publisher: e.target.value })} /></Field>
              <Field label="ISBN"><Input value={editing?.isbn ?? ""} onChange={(e) => setEditing({ ...editing, isbn: e.target.value })} /></Field>
            </> : <>
              <Field label="期刊 / 会议"><Input value={editing?.venue ?? ""} onChange={(e) => setEditing({ ...editing, venue: e.target.value })} /></Field>
              <Field label="卷期"><Input value={editing?.volume ?? ""} onChange={(e) => setEditing({ ...editing, volume: e.target.value })} /></Field>
              <Field label="页码"><Input value={editing?.pages ?? ""} onChange={(e) => setEditing({ ...editing, pages: e.target.value })} /></Field>
              <Field label="DOI"><Input value={editing?.doi ?? ""} onChange={(e) => setEditing({ ...editing, doi: e.target.value })} /></Field>
            </>}
            <div className="sm:col-span-2">
              <Field label="研究方向文件夹">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={editing?.directionId ? String(editing.directionId) : "none"} onValueChange={(v) => setEditing({ ...editing, directionId: v === "none" ? null : Number(v) })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="未归入方向" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未归入方向</SelectItem>
                      {dirs.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.path}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" disabled={!editing?.title || classifyOne.isPending} onClick={async () => {
                    const r = await classifyOne.mutateAsync({ title: editing?.title ?? "", abstract: editing?.abstract ?? "", keywords: editing?.keywords ?? "" });
                    if (r.best) {
                      setEditing((current) => ({ ...current, directionId: r.best!.id }));
                      alert(`建议方向：${r.best.name}${r.suggestions.length > 1 ? `（候选：${r.suggestions.map((x) => x.name).join(" / ")}）` : ""}`);
                    } else alert("未能判别出合适方向，请手动选择或先创建研究方向。");
                  }}><Sparkles className="mr-1 h-3.5 w-3.5" />智能判别</Button>
                </div>
              </Field>
            </div>
            <Field label="领域 / 主题"><Input value={editing?.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="如 机器学习/基础模型" /></Field>
            <Field label="标签（逗号分隔）"><Input value={editing?.tags ?? ""} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} /></Field>
            <Field label="重要性评级（1—5）"><Input type="number" min={1} max={5} value={editing?.importance ?? 3} onChange={(e) => setEditing({ ...editing, importance: Number(e.target.value) })} /></Field>
            <Field label="关键词"><Input value={editing?.keywords ?? ""} onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="摘要"><Textarea rows={3} value={editing?.abstract ?? ""} onChange={(e) => setEditing({ ...editing, abstract: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field label="个人笔记"><Textarea rows={2} value={editing?.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field></div>
            <div className="sm:col-span-2">
              <Field label="PDF 附件与 AI 解析">
                <div className="space-y-2">
                  {editing?.fileId ? <FileChips ids={[editing.fileId]} /> : <FileUpload module="reference" compact onUploaded={(fid) => setEditing((current) => ({ ...current, fileId: fid }))} />}
                  <Button type="button" variant="outline" size="sm" disabled={!editing?.fileId || parsePdf.isPending} onClick={parseAndFill}>
                    {parsePdf.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                    {parsePdf.isPending ? "正在解析 PDF…" : "AI 解析并回填"}
                  </Button>
                  <div className="text-[11px] text-muted-foreground">解析结果必须人工核对；未配置或未启用大模型接口时会明确提示。</div>
                </div>
              </Field>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.title || !editing?.authors || create.isPending || update.isPending} onClick={save}>保存</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>导入文献（BibTeX / RIS）</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={importFormat} onValueChange={(v) => setImportFormat(v as "bibtex" | "ris")}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="bibtex">BibTeX</SelectItem><SelectItem value="ris">RIS（EndNote）</SelectItem></SelectContent>
            </Select>
            <Textarea rows={10} placeholder="粘贴 BibTeX 或 RIS 内容…" value={importText} onChange={(e) => setImportText(e.target.value)} className="font-mono text-[12px]" />
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setImporting(false)}>取消</Button><Button disabled={importText.length < 10 || importMut.isPending} onClick={() => importMut.mutate({ format: importFormat, content: importText })}>解析并导入</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pushing} onOpenChange={(open) => !open && setPushing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>推送文献：{pushing?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-[12px] text-muted-foreground">推送后自动在接收人的看板生成「阅读并反馈」待办：</div>
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
              {userOptions?.map((u) => (
                <label key={u.id} className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px]">
                  <Checkbox checked={pushTargets.includes(u.id)} onCheckedChange={() => setPushTargets((current) => current.includes(u.id) ? current.filter((x) => x !== u.id) : [...current, u.id])} />
                  {u.name}<span className="text-[11px] text-muted-foreground">{u.researchDirection}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPushing(null)}>取消</Button><Button disabled={pushTargets.length === 0 || push.isPending} onClick={() => push.mutate({ referenceId: pushing!.id, toUserIds: pushTargets })}>推送</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!citing} onOpenChange={(open) => !open && setCiting(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>生成标准引用 — {citing?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">{CITE_STYLES.map((style) => <Button key={style.key} size="sm" variant={citeStyle === style.key ? "default" : "outline"} onClick={() => setCiteStyle(style.key)}>{style.label}</Button>)}</div>
            <pre className="whitespace-pre-wrap rounded-sm border border-border bg-secondary/50 p-3 text-[12px]">{citeQuery.data?.text ?? "加载中…"}</pre>
            <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => citeQuery.data && navigator.clipboard.writeText(citeQuery.data.text)}>复制</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dirEditing} onOpenChange={(open) => !open && setDirEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{dirEditing?.parentId ? "新增子研究方向" : "新增研究方向"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {dirEditing?.parentId && <div className="text-[12px] text-muted-foreground">上级方向：{dirs.find((d) => d.id === dirEditing.parentId)?.path}</div>}
            <Field label="方向名称" required><Input value={dirEditing?.name ?? ""} onChange={(e) => setDirEditing((current) => current ? { ...current, name: e.target.value } : current)} placeholder="如 多模态机器学习" /></Field>
            <Field label="方向描述（供智能判别参考）"><Textarea rows={2} value={dirEditing?.description ?? ""} onChange={(e) => setDirEditing((current) => current ? { ...current, description: e.target.value } : current)} placeholder="关键词、典型主题…" /></Field>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDirEditing(null)}>取消</Button><Button disabled={!dirEditing?.name || createDir.isPending} onClick={() => dirEditing && createDir.mutate(dirEditing)}>创建</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
