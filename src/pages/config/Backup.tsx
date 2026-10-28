// V9：数据备份与恢复（仅超级管理员可见/可用）
// 导出：全表打包下载（可选口令加密）；导入：上传备份 → 预览元信息 → 输入确认语 → 清空式恢复
import { useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatabaseBackup, Download, Upload, ShieldAlert, FileJson } from "lucide-react";

export default function Backup() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const statsQuery = trpc.backup.stats.useQuery(undefined, { enabled: isSuper });
  const [exportPwd, setExportPwd] = useState("");
  const [exportMsg, setExportMsg] = useState("");

  const exportAll = trpc.backup.exportAll.useMutation({
    onSuccess: (r) => {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const blob = new Blob([JSON.stringify(r.file)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `课题组系统备份-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportMsg(`已导出：${r.meta.totalRows} 行记录${r.meta.encrypted ? "（已加密）" : "（未加密）"}`);
    },
    onError: (e) => setExportMsg(`导出失败：${e.message}`),
  });

  // ---- 导入 ----
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [importPwd, setImportPwd] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const fileMeta = useMemo(() => {
    if (!fileContent) return null;
    try {
      const parsed = JSON.parse(fileContent);
      if (parsed?.encrypted) return { encrypted: true as const, exportedAt: "（加密，导入后可见）", totalRows: "—" as const };
      if (parsed?.app === "lab-lms-backup") return { encrypted: false as const, exportedAt: parsed.exportedAt, totalRows: parsed.totalRows as number };
      return null;
    } catch { return null; }
  }, [fileContent]);

  const importAll = trpc.backup.importAll.useMutation({
    onSuccess: (r) => {
      setImportMsg(`导入成功：备份时间 ${r.exportedAt}，共 ${r.results.reduce((n, x) => n + x.rows, 0)} 行。3 秒后自动刷新页面…`);
      statsQuery.refetch();
      setTimeout(() => window.location.reload(), 3000);
    },
    onError: (e) => setImportMsg(`导入失败：${e.message}`),
  });

  if (!isSuper) {
    return (
      <div>
        <PageHeader title="数据备份与恢复" sub="仅超级管理员可用" />
        <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">当前账号无权访问本页面</div>
      </div>
    );
  }

  const stats = statsQuery.data ?? [];
  const totalRows = stats.reduce((n, x) => n + x.rows, 0);

  return (
    <div>
      <PageHeader
        title="数据备份与恢复"
        sub="正式部署与迁移专用：全量导出/导入所有数据表（含文件附件）。仅超级管理员可操作。"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== 导出 ===== */}
        <section className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-[14px] font-semibold">
            <Download className="h-4 w-4 text-emerald-900" /> 导出全量数据
          </h3>
          <p className="mb-3 text-[12px] leading-5 text-muted-foreground">
            打包全部数据表（用户、项目、论文、成果、经费、培养、设备、附件等）为一个 JSON 备份文件。
            建议设置备份口令：设置后文件将以 AES-256 加密，导入时需输入同一口令。
          </p>
          <div className="mb-3">
            <div className="mb-1 text-[12px] text-muted-foreground">备份口令（可选，4~64 位；留空则不加密）</div>
            <Input type="password" value={exportPwd} onChange={(e) => setExportPwd(e.target.value)} placeholder="留空则不加密" />
          </div>
          <Button
            disabled={exportAll.isPending || (!!exportPwd && exportPwd.length < 4)}
            onClick={() => exportAll.mutate({ passphrase: exportPwd || undefined })}
          >
            <DatabaseBackup className="mr-1 h-4 w-4" />
            {exportAll.isPending ? "正在打包…" : `导出全部数据（当前共 ${totalRows} 行）`}
          </Button>
          {exportMsg && <div className="mt-2 text-[12px] text-muted-foreground">{exportMsg}</div>}
        </section>

        {/* ===== 导入 ===== */}
        <section className="rounded-md border border-destructive/30 bg-card p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-[14px] font-semibold">
            <Upload className="h-4 w-4 text-red-800" /> 从备份恢复
          </h3>
          <p className="mb-3 flex items-start gap-1 text-[12px] leading-5 text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
            导入将<span className="mx-0.5 font-medium text-destructive">清空备份所涉及的现有数据</span>并以备份内容整体替换，操作不可撤销，请务必先导出当前数据。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name); setImportMsg(""); setConfirmText("");
              const reader = new FileReader();
              reader.onload = () => setFileContent(String(reader.result ?? ""));
              reader.readAsText(f);
            }}
          />
          <div className="mb-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileJson className="mr-1 h-3.5 w-3.5" /> 选择备份文件
            </Button>
            {fileName && <span className="truncate text-[12px] text-muted-foreground">{fileName}</span>}
          </div>
          {fileContent && (
            <div className="mb-3 rounded-sm border border-border bg-secondary/40 p-2.5 text-[12px]">
              {!fileMeta ? (
                <span className="text-destructive">无法识别：这不是本系统生成的备份文件</span>
              ) : (
                <div className="space-y-0.5">
                  <div>加密状态：{fileMeta.encrypted ? <Pill text="已加密" tone="amber" /> : <Pill text="未加密" tone="gray" />}</div>
                  <div>导出时间：{fileMeta.exportedAt}</div>
                  <div>总记录数：{fileMeta.totalRows}</div>
                </div>
              )}
            </div>
          )}
          {fileMeta?.encrypted && (
            <div className="mb-3">
              <div className="mb-1 text-[12px] text-muted-foreground">备份口令</div>
              <Input type="password" value={importPwd} onChange={(e) => setImportPwd(e.target.value)} placeholder="输入导出时设置的口令" />
            </div>
          )}
          {fileMeta && (
            <div className="mb-3">
              <div className="mb-1 text-[12px] text-muted-foreground">请输入「清空并导入」以确认操作</div>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="清空并导入" />
            </div>
          )}
          <Button
            variant="destructive"
            disabled={!fileMeta || confirmText !== "清空并导入" || importAll.isPending}
            onClick={() => fileContent && importAll.mutate({ fileContent, passphrase: importPwd || undefined, confirm: "清空并导入" })}
          >
            {importAll.isPending ? "正在导入…" : "执行恢复"}
          </Button>
          {importMsg && <div className="mt-2 text-[12px] text-muted-foreground">{importMsg}</div>}
        </section>
      </div>

      {/* ===== 当前数据概况 ===== */}
      <section className="mt-4 rounded-md border border-border bg-card p-4">
        <h3 className="mb-3 text-[14px] font-semibold">当前数据概况（{stats.length} 张表，共 {totalRows} 行）</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] md:grid-cols-3 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.table} className="flex items-center justify-between border-b border-border/50 py-1">
              <span className="font-mono text-[12px] text-muted-foreground">{s.table}</span>
              <span className={`tabular-nums ${s.rows === 0 ? "text-muted-foreground/50" : "font-medium"}`}>{s.rows}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
