import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { PageHeader, EmptyState, Field } from "@/components/ui2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Handshake, Pencil, Search, Trash2 } from "lucide-react";

type Post = { id: number; userId: number; userName: string; topics: string; skills: string; research: string | null; contact: string | null };

export default function Mentoring() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(false);
  const list = trpc.mentoring.list.useQuery({ keyword: keyword || undefined });
  const rows = (list.data ?? []) as Post[];
  const mine = rows.find((r) => r.userId === user?.id);
  const [form, setForm] = useState({ topics: "", skills: "", research: "", contact: "" });
  const save = trpc.mentoring.save.useMutation({ onSuccess: () => { utils.mentoring.list.invalidate(); setEditing(false); }, onError: (e) => alert(e.message) });
  const remove = trpc.mentoring.remove.useMutation({ onSuccess: () => utils.mentoring.list.invalidate() });
  function open() {
    setForm({ topics: mine?.topics ?? "", skills: mine?.skills ?? "", research: mine?.research ?? "", contact: mine?.contact ?? user?.email ?? "" });
    setEditing(true);
  }
  return <div>
    <PageHeader title="传帮带" sub="按课题、技术与研究内容找到擅长的同门，主动交流、共享经验" actions={<Button size="sm" onClick={open}><Pencil className="mr-1 h-3.5 w-3.5" />{mine ? "更新我的擅长名片" : "登记我的擅长名片"}</Button>} />
    <div className="relative mb-4 w-full max-w-xl"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="搜索课题、软件、实验技术、研究方向或同门姓名" value={keyword} onChange={(e) => setKeyword(e.target.value)} /></div>
    {!rows.length ? <EmptyState text="暂无匹配名片。登记你的课题与擅长技术，方便同门找到你。" /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <div key={r.id} className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-2"><Handshake className="h-4 w-4 text-primary" /><span className="font-semibold">{r.userName}</span>{r.userId === user?.id && <span className="text-[11px] text-primary">我的名片</span>}</div>
      <div className="mt-3 text-[12px]"><span className="text-muted-foreground">相关课题：</span>{r.topics}</div>
      <div className="mt-1.5 text-[12px]"><span className="text-muted-foreground">擅长技术：</span><span className="font-medium text-primary">{r.skills}</span></div>
      {r.research && <div className="mt-1.5 whitespace-pre-wrap text-[12px]"><span className="text-muted-foreground">研究内容：</span>{r.research}</div>}
      {r.contact && <div className="mt-2 text-[12px] text-muted-foreground">交流方式：{r.contact}</div>}
      {r.userId === user?.id && <Button variant="ghost" size="sm" className="mt-2 text-destructive" onClick={() => confirm("删除我的传帮带名片？") && remove.mutate()}><Trash2 className="mr-1 h-3.5 w-3.5" />删除名片</Button>}
    </div>)}</div>}
    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>我的传帮带名片</DialogTitle></DialogHeader><div className="space-y-3">
      <Field label="相关课题（逗号分隔）" required><Input value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} placeholder="如：多模态感知、机器人控制" /></Field>
      <Field label="擅长技术 / 工具" required><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="如：COMSOL、Python、STM32、论文润色" /></Field>
      <Field label="研究内容与可交流经验"><Textarea rows={4} value={form.research} onChange={(e) => setForm({ ...form, research: e.target.value })} /></Field>
      <Field label="交流方式"><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="邮箱、办公室或联系方式" /></Field>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(false)}>取消</Button><Button disabled={!form.topics || !form.skills || save.isPending} onClick={() => save.mutate(form)}>保存名片</Button></div>
    </div></DialogContent></Dialog>
  </div>;
}
