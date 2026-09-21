import { useState } from "react";

export type DocumentInfo = { doc_id: string; title: string; origin: string; version: string; captured_at: string };
export function SourceManager({ documents, selected, change, refresh, disabled }: { documents: DocumentInfo[]; selected: string[] | null; change: (ids: string[] | null) => void; refresh: () => void; disabled: boolean }) {
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState("");
  const [origin, setOrigin] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function ingest() {
    setSaving(true); setMessage("");
    try {
      const r = await fetch("/api/ingest/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, origin, text }) });
      const data = await r.json();
      if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "补充失败");
      setMessage("正文已入库，可以重新提问"); setText(""); refresh();
    } catch (e) { setMessage((e as Error).message); }
    finally { setSaving(false); }
  }
  return <details className="mt-4 text-sm"><summary>资料范围与补充</summary><input aria-label="筛选资料" className="my-2 w-full p-2" placeholder="按标题或来源筛选" value={filter} onFocus={refresh} onChange={e => setFilter(e.target.value)}/><button disabled={disabled} className="text-xs underline" onClick={() => change(null)}>使用全部资料</button><p className="text-xs">{selected ? `已选 ${selected.length} 份（最多20份）` : "全部资料"}</p><div className="max-h-60 overflow-auto">{documents.filter(d => `${d.title} ${d.origin}`.toLowerCase().includes(filter.toLowerCase())).map(d => <label key={d.doc_id} className="my-2 block text-xs"><input type="checkbox" disabled={disabled || (!selected?.includes(d.doc_id) && (selected?.length ?? 0) >= 20)} checked={selected?.includes(d.doc_id) ?? false} onChange={e => { const ids = e.target.checked ? [...(selected ?? []), d.doc_id] : selected!.filter(id => id !== d.doc_id); change(ids.length ? ids : null); }}/>{d.title}<span className="block break-all text-stone-500">{d.origin}<br/>版本 {d.version}<br/>{d.captured_at}</span></label>)}</div><details className="mt-3"><summary>补充正文</summary><input className="my-1 w-full p-2" aria-label="补充标题" placeholder="标题" maxLength={200} value={title} onChange={e => setTitle(e.target.value)}/><input className="my-1 w-full p-2" aria-label="补充来源" placeholder="原始来源（相同来源会更新版本）" value={origin} onChange={e => setOrigin(e.target.value)}/><textarea className="my-1 w-full p-2" aria-label="补充正文" rows={6} maxLength={500000} value={text} onChange={e => setText(e.target.value)}/><button disabled={saving || !title.trim() || !text.trim()} onClick={() => void ingest()}>保存正文</button><p role="status">{message}</p></details></details>;
}
