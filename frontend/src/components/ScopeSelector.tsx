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
        {visible.map((d) => (
          <label key={d.doc_id} className="my-[6px] flex gap-[8px]">
            <input
              type="checkbox"
              className="mt-[3px]"
              disabled={disabled || (!selected?.includes(d.doc_id) && (selected?.length ?? 0) >= MAX_SCOPE)}
              checked={selected?.includes(d.doc_id) ?? false}
              onChange={(e) => {
                const ids = e.target.checked
                  ? [...(selected ?? []), d.doc_id]
                  : selected!.filter((id) => id !== d.doc_id);
                change(ids.length ? ids : null);
              }}
            />
            <span className="min-w-0">
              <span className="block text-[var(--charcoal)]">{d.title}</span>
              <span className="block break-all text-[11px] text-[var(--stone)]">
                {d.origin}
                <br />
                版本 {d.version}
                <br />
                {d.captured_at}
              </span>
            </span>
          </label>
        ))}
        {!visible.length ? <p className="text-[12px] text-[var(--stone)]">没有匹配的资料。</p> : null}
      </div>
    </div>
  );
}
