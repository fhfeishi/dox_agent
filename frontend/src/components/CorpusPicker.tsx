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
  return <div className="corpus-picker">
    <div className="corpus-picker-top">
      <div className="flex items-center gap-[8px]"><input aria-label="搜索知识库范围" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索库名或领域" className="min-w-0 flex-1 rounded-[8px] border border-[var(--hairline-strong)] px-[12px] py-[9px]" />
        {query ? <button type="button" onClick={() => setQuery("")} className="text-[var(--link)]">清空</button> : null}</div>
      <div aria-label="已选资料库" className="mt-[10px] flex flex-wrap gap-[6px]">
        {selectedIds.map(id => <span key={id} className="inline-flex max-w-full items-center gap-[6px] rounded-[6px] bg-[var(--primary-soft)] px-[9px] py-[5px] text-body text-[var(--primary-pressed)]">
          <span className="min-w-0 break-words">{(corpora.find(c => c.id === id)?.name ?? `不可用（${id}）`).replace(/^自然科学基金-/, "")}</span>
          <button type="button" aria-label={`移除 ${corpora.find(c => c.id === id)?.name ?? id}`} disabled={disabled || selectedIds.length <= 1} onClick={() => onToggle(id, false)} className="size-[24px] shrink-0 rounded hover:bg-[var(--canvas)] disabled:opacity-30">×</button>
        </span>)}
      </div>
      <p className="mt-[8px] text-body text-[var(--steel)]">勾选多库 · 最多 6 个 · 仅影响后续提问</p>
    </div>
    <ul aria-label="知识库" className="corpus-picker-list">
      {visible.map(c => {
        const selected = selectedIds.includes(c.id);
        const blocked = disabled || Boolean(c.missing) || (selected ? selectedIds.length <= 1 : selectedIds.length >= 6);
        return <li key={c.id} className={`corpus-picker-row ${selected ? "is-selected" : ""}`}>
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-[12px] py-[12px]">
            <input type="checkbox" aria-label={`当前对话使用 ${c.name}`} checked={selected} disabled={blocked} onChange={e => onToggle(c.id, e.target.checked)} />
            <span className="min-w-0"><span className="block break-words font-medium" title={c.name}>{c.name.replace(/^自然科学基金-/, "")}</span><span className="text-caption text-[var(--steel)]">{c.missing ? "目录缺失" : c.preparation === "ready" ? "可检索" : "暂无已入库资料"} · {c.docs_count} 份资料</span></span>
          </label>
          <button type="button" onClick={() => onDetails(c.id)} className="corpus-detail-link">详情 ↗</button>
          <button type="button" disabled={disabled || c.missing || (selected && selectedIds.length === 1)} onClick={() => onUseOnly(c.id)} className="corpus-use-only">仅使用此库</button>
        </li>;
      })}
      {!visible.length && <li>没有匹配的知识库 <button onClick={() => setQuery("")}>清空搜索</button></li>}
    </ul>
  </div>;
}
