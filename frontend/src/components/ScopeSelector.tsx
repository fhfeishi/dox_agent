import { useState } from "react";
import type { DocumentInfo } from "../useDocuments";

const MAX_SCOPE = 20;

export function ScopeSelector({
  documents,
  selected,
  change,
  disabled,
}: {
  documents: DocumentInfo[];
  selected: string[] | null;
  change: (ids: string[] | null) => void;
  disabled: boolean;
}) {
  const [filter, setFilter] = useState("");
  const visible = documents.filter((d) =>
    `${d.title} ${d.origin}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const owners = new Map<string, number>();
  for (const document of documents) owners.set(document.doc_id, (owners.get(document.doc_id) ?? 0) + 1);
  const groups = new Map<string, { name: string; items: DocumentInfo[] }>();
  for (const document of visible) {
    const key = document.corpus_id ?? document.corpus_name ?? "default";
    const group = groups.get(key) ?? { name: document.corpus_name ?? "知识库", items: [] };
    group.items.push(document);
    groups.set(key, group);
  }
  return (
    <div className="text-[12.5px]">
      <div className="mb-[8px] flex items-center justify-between gap-2">
        <span className="text-[var(--steel)]">
          {selected ? `已选 ${selected.length} 份（最多 ${MAX_SCOPE} 份）` : "全部资料"}
        </span>
        <button
          type="button"
          className="text-[var(--link)] hover:underline disabled:opacity-40"
          disabled={disabled || !selected}
          onClick={() => change(null)}
        >
          使用全部资料
        </button>
      </div>
      <input
        aria-label="筛选资料"
        className="font-app mb-[8px] w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-[10px] py-[7px] text-[12.5px] outline-none focus:border-[var(--primary)]"
        placeholder="按标题或来源筛选"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="max-h-[200px] overflow-auto">
        {[...groups].map(([corpusId, group]) => (
          <section key={corpusId} className="mb-[8px]">
            <h4 className="sticky top-0 bg-[var(--canvas)] py-[3px] text-[11px] font-medium text-[var(--steel)]">{group.name}</h4>
            {group.items.map((d) => {
              const ambiguous = (owners.get(d.doc_id) ?? 0) > 1;
              return (
                <label key={`${d.corpus_id ?? ""}:${d.doc_id}`} className="my-[6px] flex gap-[8px]">
                  <input
                    type="checkbox"
                    className="mt-[3px]"
                    disabled={disabled || ambiguous || (!selected?.includes(d.doc_id) && (selected?.length ?? 0) >= MAX_SCOPE)}
                    checked={selected?.includes(d.doc_id) ?? false}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...(selected ?? []), d.doc_id]
                        : selected!.filter((id) => id !== d.doc_id);
                      change(ids);
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[var(--charcoal)]">{d.title}</span>
                    <span className="block break-all text-[11px] text-[var(--stone)]">
                      {ambiguous ? "文档归属不唯一，不能限定选择" : d.origin}
                      {!ambiguous ? <><br />版本 {d.version}<br />{d.captured_at}</> : null}
                    </span>
                  </span>
                </label>
              );
            })}
          </section>
        ))}
        {!visible.length ? <p className="text-[12px] text-[var(--stone)]">没有匹配的资料。</p> : null}
      </div>
    </div>
  );
}
