import { useState } from "react";
import type { CorpusInfo } from "../api";

function statusDot(corpus: CorpusInfo): { tone: string; label: string } {
  if (corpus.missing) return { tone: "bg-[var(--red)]", label: "目录缺失" };
  if (corpus.job?.status === "running") return { tone: "bg-[#e0a000] animate-pulse", label: "正在导入" };
  if (corpus.job?.status === "error") return { tone: "bg-[var(--red)]", label: "导入失败" };
  if (corpus.preparation === "ready") return { tone: "bg-[var(--green)]", label: "就绪" };
  if (corpus.preparation === "empty") return { tone: "bg-[#e0a000]", label: "空库" };
  return { tone: "bg-[#e0a000]", label: "空库" };
}

/**
 * Corpus selector rows, shared by the sidebar list and the composer popover.
 * Selecting a corpus never touches sessions; the document list and library count
 * simply re-scope.
 */
export function CorpusPicker({
  corpora,
  current,
  onSelect,
  selectedIds,
  onToggle,
  onUseOnly,
  disabled = false,
}: {
  corpora: CorpusInfo[];
  current: string;
  onSelect: (id: string) => void;
  selectedIds: string[];
  onToggle: (id: string, selected: boolean) => void;
  onUseOnly: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = corpora.filter((corpus) => `${corpus.name} ${corpus.domain} ${corpus.kind}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div>
      <label className="mb-[7px] flex items-center gap-[7px] rounded-[7px] border border-[var(--hairline)] px-[8px] py-[5px] text-[var(--stone)]">
        <span aria-hidden="true">⌕</span>
        <input aria-label="搜索知识库范围" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识库" className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink)] outline-none" />
        <span className="shrink-0 text-[10.5px]">最多 6 个</span>
      </label>
      <ul className="space-y-[4px]" aria-label="知识库">
      {visible.map((corpus) => {
        const dot = statusDot(corpus);
        const active = corpus.id === current;
        const inSearch = selectedIds.includes(corpus.id);
        const canAdd = !corpus.missing;
        return (
          <li key={corpus.id} id={`corpus-${corpus.id}`} className="flex items-center gap-[6px]">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(corpus.id)}
              className={`flex min-w-0 flex-1 items-center gap-[10px] rounded-[8px] border px-[10px] py-[8px] text-left transition-colors ${
                active
                  ? "border-[#d5cdf7] bg-[var(--primary-soft)] text-[var(--primary-pressed)]"
                  : "border-[var(--hairline)] bg-[var(--canvas)] text-[var(--charcoal)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <span className={`size-[7px] shrink-0 rounded-full ${dot.tone}`} title={dot.label} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{corpus.name}</span>
                <span className="block text-[11px] text-[var(--stone)]">
                  {dot.label} · {corpus.docs_count} 份{corpus.kind === "fund" ? " · 基金报告" : ""}
                </span>
              </span>
              {active ? <span className="shrink-0 text-[11px] text-[var(--primary)]">上传目标</span> : null}
            </button>
            <label className="flex shrink-0 items-center gap-[5px] px-[5px] text-[10.5px] text-[var(--steel)]" title="加入当前对话">
              <input
                type="checkbox"
                aria-label={`当前对话使用 ${corpus.name}`}
                checked={inSearch}
                disabled={disabled || (!canAdd && !inSearch) || (!inSearch && selectedIds.length >= 6) || (inSearch && selectedIds.length <= 1)}
                onChange={(event) => onToggle(corpus.id, event.target.checked)}
              />
              对话
            </label>
            {!inSearch && !corpus.missing ? <button type="button" disabled={disabled} onClick={() => onUseOnly(corpus.id)} className="shrink-0 rounded-[6px] px-[7px] py-[5px] text-[10.5px] text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-50">仅使用此库</button> : null}
          </li>
        );
      })}
        {!visible.length ? <li className="px-[8px] py-[12px] text-center text-[12px] text-[var(--stone)]">没有匹配的知识库</li> : null}
      </ul>
    </div>
  );
}
