import { useQuery } from "@tanstack/react-query";
import { libraryOverviewQuery } from "../libraryQueries";
import type { LibraryOverview } from "../api";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const day = (value?: string | null) => value ? value.slice(0, 10) : "未生成";
const wan = (yuan: string | number) => (Number(yuan) / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 1 });

/**
 * 资料库建设 for administrators (query 2026-1013 1637; the leader's version became 首页 in 2026-1016
 * 0946 / 1551): what each library holds and how far it is organised, with every number's base stated.
 * Choosing a row previews the library on the right.
 */
export function LeaderConstruction({ onOpen }: { onOpen: (corpusId: string) => void }) {
  const result = useQuery({ ...libraryOverviewQuery() });
  // Waiting and failure sit in the same column as the page they stand in for.
  const column = "mx-auto max-w-[1200px] px-5 py-7 text-body sm:px-8";
  if (result.error) return <p role="alert" className={`${column} text-[var(--red)]`}>{(result.error as Error).message}</p>;
  if (!result.data) return <p role="status" className={`${column} text-[var(--steel)]`}>正在读取资料库概况…</p>;
  const rows = [...result.data].sort((a, b) => b.projects - a.projects);
  const sum = (pick: (row: LibraryOverview) => number) => rows.reduce((n, row) => n + pick(row), 0);
  const projects = sum((r) => r.projects);
  const funded = sum((r) => r.funding.projects);
  const kpis: [string, string, string][] = [
    ["资料", `${sum((r) => r.files)} 份`, "当前文件，未跨库去重"],
    ["经费记录", `${funded} 个项目`, `合计 ${wan(sum((r) => Number(r.funding.total_yuan)))} 万元；其余 ${projects - funded} 个项目报告未给出${rows[0]?.funding.label ?? "经费"}`],
  ];
  return <div className="mx-auto max-w-[1200px] space-y-6 px-5 py-7 sm:px-8">
    <header>
      <p className="text-caption text-[var(--steel)]">资料覆盖与归纳状态</p>
      <h1 className="mt-2 text-page font-semibold">资料库建设情况</h1>
    </header>
    <section aria-label="总体数字" className="grid gap-2 sm:grid-cols-2">
      {kpis.map(([title, value, note]) => <div key={title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <p className="text-body text-[var(--steel)]">{title}</p><p className="my-1 text-page font-semibold">{value}</p><p className="text-caption leading-5 text-[var(--stone)]">{note}</p>
      </div>)}
    </section>
    <section aria-label="各资料库" className="overflow-x-auto rounded-xl border border-[var(--hairline)]">
      <table className="w-full min-w-[760px] text-left text-body">
        <thead className="bg-[var(--surface)] text-body text-[var(--steel)]"><tr>
          {["领域", "资料 / 项目", "技术研判", "场景 / 问题", "技术条目", "立项年份", "最近归纳"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => {
          // Marginal facet counts do not establish their intersection; show each count directly.
          const facets = ["场景", "问题", "技术", "成果"].map(key => key + " " + (row.dimensions[key] ?? 0)).join(" · ");
          return <tr key={row.corpus_id} className="cursor-pointer border-t border-[var(--hairline)] hover:bg-[var(--surface)]" onClick={() => onOpen(row.corpus_id)}>
            <td className="px-4 py-2.5"><button type="button" className="text-left font-semibold text-[var(--link)] hover:underline">{short(row.name)}</button></td>
            <td className="px-4 py-2.5">{row.files} 份 / {row.projects} 个</td>
            <td className="px-4 py-2.5">{facets}</td>
            <td className="px-4 py-2.5">{row.hierarchy.scenes ? `${row.hierarchy.scenes} / ${row.hierarchy.issues}` : "未生成"}</td>
            <td className="px-4 py-2.5">{row.lineage.items ? `${row.lineage.items} 条 · ${row.lineage.systems} 个体系` : "未生成"}</td>
            <td className="px-4 py-2.5">{row.start_years.length ? `${row.start_years[0]}–${row.start_years.at(-1)}` : "待核对"}</td>
            <td className="px-4 py-2.5 text-[var(--steel)]">{day(row.lineage.generated_at ?? row.hierarchy.generated_at)}</td>

          </tr>;
        })}</tbody>
      </table>
    </section>
    <p className="text-caption leading-5 text-[var(--stone)]">项目在各库内按批准号去重；跨库合计未去重。“技术研判”分别列出四个维度的项目数，不代表四维同时齐备；场景、问题与技术条目由模型归纳，需人工核对。点一行在右侧查看详情。</p>
  </div>;
}
