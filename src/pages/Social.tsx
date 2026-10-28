// 模块四：社会服务（6 个子模块，必填校验 / 查重 / 附件佐证 / 可公开标记）
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, Pill, EmptyState, Field } from "@/components/ui2";
import { FileUpload, FileChips } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SOCIAL_TYPES, SOCIAL_TYPE_LABELS } from "@contracts/constants";
import { exportXlsx } from "@/lib/helpers";
import { Plus, Pencil, Trash2, Download } from "lucide-react";

type Row = {
  id: number; type: string; orgName: string; position: string | null;
  startDate: string | null; endDate: string | null; deadline: string | null;
  confidential: boolean; detail: Record<string, string>; attachmentFileIds: number[]; isPublic: boolean;
};

// 各类型的扩展字段
const DETAIL_FIELDS: Record<string, string[]> = {
  parttime: ["聘期", "备注"],
  academic_org: ["任期", "备注"],
  conference_host: ["时间地点", "规模", "经费来源", "议程摘要"],
  review: ["评审类型", "评审内容", "备注"],
  advisory: ["题目", "采纳情况", "备注"],
  popularization: ["平台", "链接", "备注"],
};

export default function Social() {
  const { can } = useAuth();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<string>("parttime");
  const { data } = trpc.social.list.useQuery({ type: tab });
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const editable = can("social.list", "editable");

  const create = trpc.social.create.useMutation({
    onSuccess: (r) => {
      if (r.ok) { utils.social.list.invalidate(); setEditing(null); }
      else alert(r.message);
    },
  });
  const update = trpc.social.update.useMutation({ onSuccess: () => { utils.social.list.invalidate(); setEditing(null); } });
  const remove = trpc.social.remove.useMutation({ onSuccess: () => utils.social.list.invalidate() });

  function save() {
    if (!editing?.orgName) return;
    const payload = {
      type: (editing.type ?? tab) as "parttime",
      orgName: editing.orgName, position: editing.position ?? "",
      startDate: editing.startDate ?? "", endDate: editing.endDate ?? "",
      deadline: editing.deadline ?? "", confidential: !!editing.confidential,
      detail: editing.detail ?? {}, attachmentFileIds: editing.attachmentFileIds ?? [], isPublic: !!editing.isPublic,
    };
    if (editing.id) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
  }

  const isReview = (editing?.type ?? tab) === "review";

  return (
    <div>
      <PageHeader title="社会服务" sub="事项记录与数据收集：必填校验、时间格式统一、附件佐证、查重拦截、可公开标记"
        actions={<>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("社会服务", "社会服务", (data ?? []).map((r) => ({ 类型: SOCIAL_TYPE_LABELS[r.type], 名称: r.orgName, 职务: r.position, 起: r.startDate, 止: r.endDate, 截止: r.deadline, 保密: r.confidential ? "是" : "否", 公开: r.isPublic ? "是" : "否" })))}><Download className="mr-1 h-3.5 w-3.5" />导出 Excel</Button>
          {editable && <Button size="sm" onClick={() => setEditing({ type: tab, detail: {}, attachmentFileIds: [] })}><Plus className="mr-1 h-3.5 w-3.5" />新增记录</Button>}
        </>} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          {SOCIAL_TYPES.map((t) => <TabsTrigger key={t} value={t} className="text-[12px]">{SOCIAL_TYPE_LABELS[t]}</TabsTrigger>)}
        </TabsList>
        {SOCIAL_TYPES.map((t) => (
          <TabsContent key={t} value={t}>
            {!data?.length ? <EmptyState /> : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="data-table">
                  <thead><tr><th>名称</th><th>职务 / 角色</th><th>时间</th><th>扩展信息</th><th>附件佐证</th><th>标记</th>{editable && <th className="w-20">操作</th>}</tr></thead>
                  <tbody>
                    {data.map((r) => (
                      <tr key={r.id}>
                        <td className="max-w-56 font-medium">{r.orgName}</td>
                        <td className="whitespace-nowrap">{r.position ?? "—"}</td>
                        <td className="whitespace-nowrap tabular-nums text-[12px]">
                          {r.startDate}{r.endDate && ` ~ ${r.endDate}`}
                          {r.deadline && <div className="text-amber-800">截止 {r.deadline}</div>}
                        </td>
                        <td className="max-w-56 text-[12px]">{Object.entries(r.detail).filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="text-muted-foreground">{k}：</span>{v}</div>)}</td>
                        <td className="min-w-40"><FileChips ids={r.attachmentFileIds} /></td>
                        <td className="whitespace-nowrap">
                          {r.confidential && <Pill text="保密" tone="red" />} {r.isPublic && <Pill text="可公开" tone="purple" />}
                        </td>
                        {editable && <td className="whitespace-nowrap">
                          <button className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></button>
                          {can("social.list", "manage") && <button className="text-muted-foreground hover:text-destructive" onClick={() => confirm("确认删除？") && remove.mutate({ id: r.id })}><Trash2 className="h-3.5 w-3.5" /></button>}
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.id ? "编辑记录" : `新增 · ${SOCIAL_TYPE_LABELS[tab]}`}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            <div className="col-span-2"><Field label="组织 / 单位 / 活动名称" required><Input value={editing?.orgName ?? ""} onChange={(e) => setEditing({ ...editing, orgName: e.target.value })} /></Field></div>
            <Field label="职务 / 角色"><Input value={editing?.position ?? ""} onChange={(e) => setEditing({ ...editing, position: e.target.value })} placeholder={tab === "conference_host" ? "主办/承办/协办" : "如 理事、编委"} /></Field>
            <Field label="开始时间"><Input type="date" value={editing?.startDate ?? ""} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} /></Field>
            <Field label="结束时间"><Input type="date" value={editing?.endDate ?? ""} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} /></Field>
            {isReview && <Field label="评审截止日期（自动进入本人待办）"><Input type="date" value={editing?.deadline ?? ""} onChange={(e) => setEditing({ ...editing, deadline: e.target.value })} /></Field>}
            {(DETAIL_FIELDS[editing?.type ?? tab] ?? []).map((f) => (
              <Field key={f} label={f}>
                <Input value={editing?.detail?.[f] ?? ""} onChange={(e) => setEditing({ ...editing, detail: { ...(editing?.detail ?? {}), [f]: e.target.value } })} />
              </Field>
            ))}
            <div className="col-span-2">
              <Field label="附件佐证（聘书 / 证明 / 截图等）">
                <FileChips ids={editing?.attachmentFileIds ?? []} />
                <div className="mt-1.5"><FileUpload module="social" compact onUploaded={(fid) => setEditing((e) => ({ ...e, attachmentFileIds: [...(e?.attachmentFileIds ?? []), fid] }))} /></div>
              </Field>
            </div>
            <Field label="保密标记"><div className="pt-1.5"><Switch checked={!!editing?.confidential} onCheckedChange={(v) => setEditing({ ...editing, confidential: v })} /></div></Field>
            <Field label="可公开"><div className="pt-1.5"><Switch checked={!!editing?.isPublic} onCheckedChange={(v) => setEditing({ ...editing, isPublic: v })} /></div></Field>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!editing?.orgName} onClick={save}>保存（自动查重）</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
