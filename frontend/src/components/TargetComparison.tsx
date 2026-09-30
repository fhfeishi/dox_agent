import { useQueries } from "@tanstack/react-query";
import { type TargetReport } from "../api";
import { DIMENSIONS, targetDetailQuery, usableTarget } from "../libraryQueries";

/** Read-only material comparison; opening an entry uses the shared evidence reader. */
export function TargetComparison({ corpusId, reports, onOpen }: {
  corpusId: string; reports: TargetReport[]; onOpen: (doc: string, facet: number) => void;
}) {
  const details = useQueries({ queries: reports.map((item) => ({ ...targetDetailQuery(corpusId, item.doc_id, item.version), enabled: usableTarget(item) })) });
  return <div className="my-3 overflow-x-auto" aria-label="四维只读对照">
    <p className="mb-2 text-xs">按原文限定核对材料；点击条目查看引文。此表不调用模型，不生成优劣结论。</p>
    <table className="w-full border-collapse text-xs"><thead><tr><th className="border p-2">维度</th>{reports.map((item) => <th key={item.doc_id} className="min-w-56 border p-2">{item.title}</th>)}</tr></thead>
      <tbody>{DIMENSIONS.map((key, index) => <tr key={key}><th className="border p-2">{key === "成果" ? "文献成果" : key}</th>{reports.map((item, position) => {
        const detail = details[position];
        const facet = detail.data?.facets.find((entry) => entry.key === key);
        return <td key={item.doc_id} className="border p-2 align-top">
          {!usableTarget(item) ? item.stale ? "待更新，不能作为当前对照" : `${item.process.status}，无法判断是否提及`
            : detail.error ? <span role="alert">{detail.error.message}</span> : !facet ? "正在读取…"
            : facet.state === "异常" ? "提取异常，无法判断是否提及" : facet.state === "未提及" ? "原文未提及"
            : facet.items.map((entry) => <button key={entry.id} onClick={() => onOpen(item.doc_id, index)} className="mb-2 block text-left text-[var(--link)]">
              <strong>{entry.name}{entry.status ? ` · ${entry.status}` : ""}</strong><p>{entry.desc}</p><span>查看原文证据</span>
            </button>)}
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}
