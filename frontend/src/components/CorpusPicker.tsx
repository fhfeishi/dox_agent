import type { CorpusInfo } from "../api";

function statusDot(corpus: CorpusInfo): { tone: string; label: string } {
  if (corpus.job?.status === "running") return { tone: "bg-[#e0a000] animate-pulse", label: "正在导入" };
  if (corpus.job?.status === "error") return { tone: "bg-[var(--red)]", label: "导入失败" };
  if (corpus.preparation === "ready") return { tone: "bg-[var(--green)]", label: "就绪" };
  if (corpus.preparation === "empty") return { tone: "bg-[#e0a000]", label: "空库" };
  return { tone: "bg-[#e0a000]", label: "未初始化" };
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
}: {
  corpora: CorpusInfo[];
  current: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-[4px]" role="listbox" aria-label="知识库" aria-activedescendant={`corpus-${current}`}>
      {corpora.map((corpus) => {
        const dot = statusDot(corpus);
        const active = corpus.id === current;
        return (
          <li key={corpus.id} id={`corpus-${corpus.id}`} role="option" aria-selected={active}>
            <button
              type="button"
              onClick={() => onSelect(corpus.id)}
              className={`flex w-full items-center gap-[10px] rounded-[8px] border px-[10px] py-[8px] text-left transition-colors ${
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
              {active ? <span className="shrink-0 text-[11px] text-[var(--primary)]">当前</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
