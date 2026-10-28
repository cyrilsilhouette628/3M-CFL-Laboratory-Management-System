// 统一文件上传组件：拖拽 / 点击上传 + 可见范围 + 可选 LLM 扫描 + 已上传文件列表（下载/预览）
import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fileToBase64, downloadBase64, fmtSize } from "@/lib/helpers";
import { FILE_VISIBILITIES, FILE_VISIBILITY_LABELS, type FileVisibility } from "@contracts/constants";
import { UploadCloud, FileText, Download, Eye, Loader2 } from "lucide-react";

export function FileUpload({
  module,
  onUploaded,
  compact,
  aiScanOption,
}: {
  module: string;
  onUploaded: (fileId: number, fileName: string) => void;
  compact?: boolean;
  aiScanOption?: boolean; // 是否提供"提交 LLM 扫描"勾选
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<FileVisibility>("private");
  const [sharedWithIds, setSharedWithIds] = useState<number[]>([]);
  const { data: userOptions } = trpc.users.options.useQuery();
  const [aiScan, setAiScan] = useState(true);
  const upload = trpc.files.upload.useMutation();
  const uploadBegin = trpc.files.uploadBegin.useMutation();
  const uploadPart = trpc.files.uploadPart.useMutation();
  const uploadFinish = trpc.files.uploadFinish.useMutation();
  const aiParse = trpc.ai.parseFileFields.useMutation();
  const createAiTask = trpc.ai.createTask.useMutation();
  const [progress, setProgress] = useState("");

  // V12：大文件分片上传（规避网关单请求体上限导致的"一直打转"）；小文件走单请求
  const PART_SIZE = 700_000; // base64 字符/片 ≈ 512KB 原始数据
  async function uploadOne(f: File): Promise<{ ok: boolean; fileId?: number; message?: string }> {
    const base64 = await fileToBase64(f);
    if (base64.length <= PART_SIZE) {
      return upload.mutateAsync({
        fileName: f.name, mime: f.type || "application/octet-stream", base64, module, visibility, sharedWithIds,
      });
    }
    const partCount = Math.ceil(base64.length / PART_SIZE);
    const begin = await uploadBegin.mutateAsync({
      fileName: f.name, mime: f.type || "application/octet-stream", module, visibility, sharedWithIds, partCount,
    });
    for (let i = 0; i < partCount; i++) {
      setProgress(`${f.name}：${i + 1}/${partCount}`);
      await uploadPart.mutateAsync({ uploadId: begin.uploadId, seq: i, data: base64.slice(i * PART_SIZE, (i + 1) * PART_SIZE) });
    }
    return uploadFinish.mutateAsync({ uploadId: begin.uploadId });
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setProgress("");
    try {
      for (const f of Array.from(list)) {
        // V5 需求 10：全局单文件 ≤ 50MB（前端本地预校验，超限即提示不上传）
        if (f.size > 50 * 1024 * 1024) {
          alert(`文件「${f.name}」超过 50MB（系统全局约束），请压缩或拆分后再上传。`);
          continue;
        }
        try {
          setProgress(`${f.name} 上传中…`);
          const res = await uploadOne(f);
          if (res.ok && res.fileId) {
            onUploaded(res.fileId, f.name);
            // 文档类上传后按用户选择提交 LLM 扫描（生成待确认建议；接口见 配置·外部接口）
            const docLike = /\.(pdf|docx?|DOCX?|PDF|txt|md|tex|zip)$/i.test(f.name);
            const autoModule = ["paper", "review", "achievement", "training"].includes(module);
            if (docLike && (aiScanOption ? aiScan : autoModule)) {
              try {
                setProgress(`${f.name} AI 解析中…`);
                const parsed = await aiParse.mutateAsync({ fileId: res.fileId, module });
                if (parsed.ok) {
                  await createAiTask.mutateAsync({ fileName: f.name, fileId: res.fileId, module, suggested: parsed.fields });
                } else {
                  alert(`文件已上传，AI 解析未完成：${parsed.message}`);
                }
              } catch (aiError) {
                alert(`文件已上传，AI 解析未完成：${aiError instanceof Error ? aiError.message : "网络错误"}`);
              }
            }
          } else {
            alert(`文件「${f.name}」上传失败：${res.message ?? "未知原因"}`);
          }
        } catch (err) {
          // V12：上传异常必须终止转圈并提示（此前异常会导致无限加载）
          alert(`文件「${f.name}」上传失败：${err instanceof Error ? err.message : "网络错误"}，请重试。`);
        }
      }
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-input bg-secondary/40 text-center transition-colors hover:bg-accent/60 ${dragging ? "border-primary bg-accent" : ""} ${compact ? "px-3 py-2" : "px-4 py-6"}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.wps,.png,.jpg,.jpeg,.gif,.mp4,.mov,.zip,.rar,.7z,.txt,.md,.tex,.bib,.ris,.csv"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {busy ? (
          <div className="flex flex-col items-center gap-1">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div className="text-[11px] text-muted-foreground">{progress || "上传中…"}</div>
          </div>
        ) : (
          <>
            <UploadCloud className="mb-1 h-5 w-5 text-muted-foreground" />
            <div className="text-[12px] text-muted-foreground">
              拖拽或点击上传（Office/WPS/PDF/图片/视频/LaTeX 压缩包等，单文件 ≤ 50MB）
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Select value={visibility} onValueChange={(v) => setVisibility(v as FileVisibility)}>
          <SelectTrigger className="h-6 w-32 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILE_VISIBILITIES.filter((v) => v === "private" || v === "admins").map((v) => (
              <SelectItem key={v} value={v} className="text-[12px]">{FILE_VISIBILITY_LABELS[v]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {visibility === "private" && (
          <details className="w-full text-left text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none">指定可见人员（已选 {sharedWithIds.length} 人；不选则仅本人和超管可见）</summary>
            <div className="mt-1 grid max-h-28 grid-cols-2 gap-1 overflow-y-auto rounded-sm border border-border p-2 sm:grid-cols-3">
              {userOptions?.map((u) => (
                <label key={u.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={sharedWithIds.includes(u.id)}
                    onChange={(e) => setSharedWithIds(e.target.checked ? [...sharedWithIds, u.id] : sharedWithIds.filter((id) => id !== u.id))}
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
            </div>
          </details>
        )}
        {aiScanOption && (
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={aiScan} onChange={(e) => setAiScan(e.target.checked)} className="h-3 w-3" />
            提交 LLM 扫描提取关键字段
          </label>
        )}
      </div>
    </div>
  );
}

// 已上传文件展示与操作
export function FileChips({ ids }: { ids: number[] }) {
  const meta = trpc.files.meta.useQuery({ ids }, { enabled: ids.length > 0 });
  const downloader = trpc.files.download.useQuery({ id: -1 }, { enabled: false });
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const utils = trpc.useUtils();

  if (!ids.length) return <span className="text-[12px] text-muted-foreground">无附件</span>;
  if (!meta.data) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  async function openFile(id: number, mode: "download" | "preview") {
    const stored = await utils.files.url.fetch({ id, download: mode === "download" });
    if (stored?.url) {
      if (mode === "preview") setPreview({ name: stored.fileName, url: stored.url });
      else window.open(stored.url, "_blank", "noopener,noreferrer");
      return;
    }
    // 历史分块/base64 附件回退；新文件统一走对象存储短期签名地址。
    const data = await utils.files.download.fetch({ id });
    if (!data || !data.base64) return;
    if (mode === "download") {
      downloadBase64(data.fileName, data.base64, data.mime || "application/octet-stream");
    } else {
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mime || "application/octet-stream" });
      setPreview({ name: data.fileName, url: URL.createObjectURL(blob) });
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {meta.data.map((f) => {
          const previewable = /pdf|image|png|jpg|jpeg/i.test(f.mime || "");
          return (
            <span key={f.id} className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary/60 px-1.5 py-0.5 text-[12px]">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-40 truncate">{f.fileName}</span>
              <span className="text-muted-foreground">{fmtSize(f.size)}</span>
              {previewable && (
                <button title="在线预览" onClick={() => openFile(f.id, "preview")} className="text-primary hover:opacity-70">
                  <Eye className="h-3 w-3" />
                </button>
              )}
              <button title="下载" onClick={() => openFile(f.id, "download")} className="text-primary hover:opacity-70">
                <Download className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setPreview(null)}>
          <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-md bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[13px]">
              <span className="truncate">{preview.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>关闭</Button>
            </div>
            <iframe src={preview.url} className="min-h-0 flex-1" title="文件预览" />
          </div>
        </div>
      )}
      {downloader.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
    </>
  );
}
