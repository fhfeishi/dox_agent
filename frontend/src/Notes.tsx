import { useEffect, useState } from "react";
import type { Source } from "./api";
import { workspaceRequest, type Saved } from "./workspace";

type NoteData = { body: string; reviewed: boolean; sources: Source[] };
export type NoteDraft = { title: string; body: string; sources: Source[] };
export function Notes({ draft, navigate }: { draft: NoteDraft | null; navigate: (ids: string[]) => void }) {
  const [notes, setNotes] = useState<Saved<NoteData>[]>([]);
  const [editing, setEditing] = useState<Saved<NoteData> | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function refresh() { try { setNotes(await workspaceRequest("/api/workspace/notes")); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (draft) setEditing({ id: crypto.randomUUID(), revision: 0, title: draft.title.slice(0, 200), data: { body: draft.body.slice(0, 20000), sources: draft.sources, reviewed: false } }); }, [draft]);
  async function save() {
    if (!editing) return;
    setSaving(true); setError("");
    try { await workspaceRequest(`/api/workspace/notes/${editing.id}`, editing); setEditing(null); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }
  return <details className="mt-4 text-sm" open={editing ? true : undefined} onToggle={e => { if (e.currentTarget.open) void refresh(); }}>
    <summary>领域笔记 · {notes.length}</summary>
    <p className="my-2 text-xs text-stone-500">从有引用的答案保存草稿，编辑并确认后用于导航原文。</p>
    {notes.map(note => <div key={note.id} className="my-3 border-t pt-2"><button onClick={() => setEditing(note)}>{note.title}</button><p className="text-xs">{{current: "原文版本一致", stale: "原文已更新，请重新查证", missing: "原文缺失", unverified: "未关联来源"}[note.source_status ?? "unverified"]} · {note.data.reviewed ? "已确认" : "草稿"}</p><button className="text-xs underline" onClick={() => navigate(note.data.sources.flatMap(s => s.doc_id ? [s.doc_id] : []))}>按这些资料提问</button></div>)}
    {editing && <div className="space-y-2"><input aria-label="笔记标题" maxLength={200} className="w-full p-2" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}/><textarea aria-label="笔记正文" maxLength={20000} rows={8} className="w-full p-2" value={editing.data.body} onChange={e => setEditing({ ...editing, data: { ...editing.data, body: e.target.value, reviewed: false } })}/><label className="block text-xs"><input type="checkbox" checked={editing.data.reviewed} onChange={e => setEditing({ ...editing, data: { ...editing.data, reviewed: e.target.checked } })}/> 我已核对笔记与原文</label>{editing.data.sources.map((s, i) => <a key={i} className="block text-xs underline" href={s.url.startsWith("/api/documents/") ? s.url : undefined} target="_blank" rel="noreferrer">{s.title} · {s.version}</a>)}<button disabled={saving || !editing.title.trim()} onClick={() => void save()}>保存笔记</button><button className="ml-3" onClick={() => setEditing(null)}>关闭</button></div>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
