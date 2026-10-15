import { useQuery } from "@tanstack/react-query";

export type LibraryOverview = {
  corpus_id: string; name: string; files: number; projects: number; dimensions: Record<string, number>;
  funding: { total_yuan: string; projects: number }; start_years: number[];
  hierarchy: { generated_at?: string | null; scenes: number; issues: number; state?: string };
  lineage: { generated_at?: string | null; items: number; systems: number; state?: string; stale_reason?: string; unplaced?: number };
  pending_identity?: number;
  /** Projects per application field, largest first. */
  fields?: [string, number][];
};

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const day = (value?: string | null) => value ? value.slice(0, 10) : "未生成";
const wan = (yuan: string | number) => (Number(yuan) / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 1 });

/**
 * 资料库建设 (query 2026-1013 1637): what each library holds, with every number's base stated next to
 * it. A leader sees the domains, their projects, years and where the projects concentrate; the
 * administrator also sees how far each library is organised (节点审查 D5:整理进度 is maintenance).
 * Choosing a library opens its domain analysis.
 */
export function LeaderConstruction({ onOpen, maintenance = false }: { onOpen: (corpusId: string) => void; maintenance?: boolean }) {
  const result = useQuery({ queryKey: ["overview", "libraries"], queryFn: async ({ signal }): Promise<LibraryOverview[]> => {
    const response = await fetch("/api/overview/libraries", { signal });
    if (!response.ok) throw new Error("资料库概况暂不可读");
    return response.json();
  } });
  if (result.error) return <p role="alert" className="p-8 text-sm text-[var(--red)]">{(result.error as Error).message}</p>;
  if (!result.data) return <p role="status" className="p-8 text-sm text-[var(--steel)]">正在读取资料库概况…</p>;
  const rows = [...result.data].sort((a, b) => b.projects - a.projects);
  const sum = (pick: (row: LibraryOverview) => number) => rows.reduce((n, row) => n + pick(row), 0);
  const projects = sum((r) => r.projects);
  const funded = sum((r) => r.funding.projects);
  const years = rows.flatMap((r) => r.start_years);
  const kpis: [string, string, string][] = [
    ...(!maintenance ? [["资料库", String(rows.length), "有已入库资料的资料库"] as [string, string, string]] : []),
    ...(maintenance ? [["资料", `${sum((r) => r.files)} 份`, "当前文件，未跨库去重"] as [string, string, string]] : []),
    ...(!maintenance ? [["项目", `${projects} 个`, years.length ? `立项 ${Math.min(...years)}–${Math.max(...years)} 年` : "立项年份待核对"] as [string, string, string]] : []),
    ["经费记录", `${funded} 个项目`, `合计 ${wan(sum((r) => Number(r.funding.total_yuan)))} 万元；其余 ${projects - funded} 个项目报告未给出直接经费`],
  ];
  const fields = (row: LibraryOverview) => (row.fields ?? []).slice(0, 3).map(([name, n]) => `${name} ${n}`).join("、") || "未归纳";
  return <div className="mx-auto max-w-[1180px] space-y-6 px-5 py-6">
    <header className={maintenance ? "" : "overview-hero"}>
      <p className={maintenance ? "text-xs text-[var(--steel)]" : "text-xs text-white/70"}>{maintenance ? "资料覆盖与归纳状态" : "研究版图 · 资料库建设"}</p>
      <h1 className="mt-2 text-2xl font-semibold">{maintenance ? "资料库建设情况" : "从领域分布，看研究积累"}</h1>
      {!maintenance ? <p className="mt-3 text-sm leading-6 text-white/75">查看各领域的项目覆盖、立项时间和应用方向，选择领域继续分析。</p> : null}
    </header>
    <section aria-label="总体数字" className={`grid gap-2 sm:grid-cols-2 ${maintenance ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
      {kpis.map(([title, value, note]) => <div key={title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <p className="text-[13px] text-[var(--steel)]">{title}</p><p className="my-1 text-2xl font-semibold">{value}</p><p className="text-xs leading-5 text-[var(--stone)]">{note}</p>
      </div>)}
    </section>
    {!maintenance ? <section aria-label="领域分布" className="grid gap-4 md:grid-cols-2">
      {rows.map((row, index) => <button key={row.corpus_id} onClick={() => onOpen(row.corpus_id)}
        className="domain-card group rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 text-left hover:border-[var(--primary)]">
        <span className="flex items-start justify-between gap-4"><span className="text-xs tabular-nums text-[var(--stone)]">{String(index + 1).padStart(2, "0")}</span>
          <span className="text-xs text-[var(--steel)]">立项 {row.start_years.length ? row.start_years[0] + "–" + row.start_years.at(-1) : "年份待核对"}</span></span>
        <span className="mt-4 flex items-baseline justify-between gap-3"><b className="text-lg">{short(row.name)}</b>
          <span className="shrink-0 text-sm"><b className="text-2xl tabular-nums">{row.projects}</b> 个项目</span></span>
        <span aria-hidden="true" className="my-4 block h-1.5 overflow-hidden rounded-full bg-[var(--canvas)]">
          <span className="block h-full rounded-full bg-[var(--primary)]" style={{width: (row.projects / Math.max(1, ...rows.map(r => r.projects)) * 100) + "%"}} /></span>
        <span className="block text-xs leading-6 text-[var(--steel)]">{fields(row)}</span>
        <span className="mt-3 block text-xs text-[var(--link)]">查看领域分析 →</span>
      </button>)}
      {!rows.length ? <p className="text-sm text-[var(--steel)]">尚无已入库资料。</p> : null}
    </section> : <section aria-label="各资料库" className="overflow-x-auto rounded-xl border border-[var(--hairline)]">
      <table className="w-full min-w-[760px] text-left text-[13.5px]">
        <thead className="bg-[var(--surface)] text-[12.5px] text-[var(--steel)]"><tr>
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
    </section>}
    <p className="text-xs leading-5 text-[var(--stone)]">项目在各库内按批准号去重；跨库合计未去重。{maintenance
      ? "“技术研判”分别列出四个维度的项目数，不代表四维同时齐备；场景、问题与技术条目由模型归纳，需人工核对。"
      : "主要应用领域按有技术服务于该领域的项目计，一个项目可计入多个领域；领域由模型归纳，需人工核对。"}{maintenance ? "点一行在右侧查看详情。" : "选择领域查看分析。"}</p>
  </div>;
}
