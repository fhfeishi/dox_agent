import type { CorpusInfo } from "./api";

function statusDot(corpus: CorpusInfo): { tone: string; label: string } {
  if (corpus.job?.status === "running") return { tone: "bg-amber-500 animate-pulse", label: "正在导入" };
  if (corpus.job?.status === "error") return { tone: "bg-red-500", label: "导入失败" };
  if (corpus.preparation === "ready") return { tone: "bg-teal-600", label: "就绪" };
  if (corpus.preparation === "empty") return { tone: "bg-amber-500", label: "空库" };
  return { tone: "bg-amber-500", label: "未初始化" };
}

/**
 * H5 corpus selector rows, shared by the expanded sidebar block and the collapsed
 * rail flyover. Selecting a corpus never touches sessions; the documents list and
 * library count simply re-scope (see main.tsx).
 */
export function CorpusPicker({ corpora, current, onSelect }: {
  corpora: CorpusInfo[]; current: string; onSelect: (id: string) => void;
}) {
  return <ul className="space-y-1" role="listbox" aria-label="知识库" aria-activedescendant={`corpus-${current}`}>
    {corpora.map(corpus => {
      const dot = statusDot(corpus);
      const active = corpus.id === current;
      return <li key={corpus.id} id={`corpus-${corpus.id}`} role="option" aria-selected={active}>
        <button type="button" onClick={() => onSelect(corpus.id)}
          className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${active ? "border-teal-300 bg-teal-50 text-teal-900" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot.tone}`} title={dot.label}/>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{corpus.name}</span>
            <span className="block text-xs text-stone-400">{dot.label} · {corpus.docs_count} 份{corpus.kind === "fund" ? " · 基金报告" : ""}</span>
          </span>
          {active && <span className="shrink-0 text-xs text-teal-700">当前</span>}
        </button>
      </li>;
    })}
  </ul>;
}
