import { useState } from "react";
import type { DocumentInfo } from "./useDocuments";

const MAX_SCOPE = 20;

export function ScopeSelector({ documents, selected, change, disabled }: {
  documents: DocumentInfo[];
  selected: string[] | null;
  change: (ids: string[] | null) => void;
  disabled: boolean;
}) {
  const [filter, setFilter] = useState("");
  const visible = documents.filter(d => `${d.title} ${d.origin}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="text-xs">
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-stone-500">{selected ? `已选 ${selected.length} 份（最多 ${MAX_SCOPE} 份）` : "全部资料"}</span>
      <button type="button" className="underline disabled:opacity-40" disabled={disabled || !selected} onClick={() => change(null)}>使用全部资料</button>
    </div>
    <input aria-label="筛选资料" className="mb-2 w-full rounded-lg border border-stone-300 px-2 py-1" placeholder="按标题或来源筛选" value={filter} onChange={e => setFilter(e.target.value)}/>
    <div className="max-h-40 overflow-auto">
      {visible.map(d => <label key={d.doc_id} className="my-2 block">
        <input type="checkbox" disabled={disabled || (!selected?.includes(d.doc_id) && (selected?.length ?? 0) >= MAX_SCOPE)} checked={selected?.includes(d.doc_id) ?? false} onChange={e => { const ids = e.target.checked ? [...(selected ?? []), d.doc_id] : selected!.filter(id => id !== d.doc_id); change(ids.length ? ids : null); }}/>{" "}{d.title}
        <span className="block break-all text-stone-500">{d.origin}<br/>版本 {d.version}<br/>{d.captured_at}</span>
      </label>)}
      {!visible.length && <p className="text-stone-400">没有匹配的资料。</p>}
    </div>
  </div>;
}
