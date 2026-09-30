import { useState } from "react";
import type { CorpusInfo } from "../api";

/** Selection is the conversation scope; details never change it. */
export function CorpusPicker({ corpora, selectedIds, onToggle, onUseOnly, onDetails, disabled = false }: {
  corpora: CorpusInfo[]; selectedIds: string[];
  onToggle: (id: string, selected: boolean) => void;
  onUseOnly: (id: string) => void; onDetails: (id: string) => void; disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = corpora.filter(c => `${c.name} ${c.domain} ${c.kind}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div>
    <h3 className="font-semibold">管理对话知识库 · {selectedIds.length}/6</h3>
    <p className="my-2 text-xs">修改对后续新提问生效；至少 1 个、最多 6 个。失效范围可用“仅使用此库”一次替换。</p>
    <p className="my-2 text-xs">已选：{selectedIds.map(id => corpora.find(c => c.id === id)?.name ?? `知识库不可用（${id}）`).join("、") || "未选择"}</p>
    <input aria-label="搜索知识库范围" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索知识库" className="mb-2 w-full rounded border p-2" />
    <ul aria-label="知识库" className="max-h-64 space-y-2 overflow-auto">
      {visible.map(c => {
        const selected = selectedIds.includes(c.id);
        const blocked = disabled || Boolean(c.missing) || (selected ? selectedIds.length <= 1 : selectedIds.length >= 6);
        return <li key={c.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${selected ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : ""}`}>
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
            <input type="checkbox" aria-label={`当前对话使用 ${c.name}`} checked={selected} disabled={blocked} onChange={e => onToggle(c.id, e.target.checked)} />
            <span className="min-w-0"><span className="block truncate" title={c.name}>{c.name}</span><span className="text-xs">{c.missing ? "目录缺失" : c.preparation === "ready" ? "可检索" : "暂无已入库资料"} · 已入库 {c.docs_count} 份</span></span>
          </label>
          <button type="button" onClick={() => onDetails(c.id)}>详情</button>
          <button type="button" disabled={disabled || c.missing || (selected && selectedIds.length === 1)} onClick={() => onUseOnly(c.id)} className="text-xs disabled:opacity-40">仅使用此库</button>
        </li>;
      })}
      {!visible.length && <li>没有匹配的知识库 <button onClick={() => setQuery("")}>清空搜索</button></li>}
    </ul>
  </div>;
}
