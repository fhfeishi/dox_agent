import { useQuery } from "@tanstack/react-query";

export type LibraryOverview = {
  corpus_id: string; name: string; files: number; projects: number; dimensions: Record<string, number>;
  funding: { total_yuan: string; projects: number }; start_years: number[];
  hierarchy: { generated_at?: string | null; scenes: number; issues: number; state?: string };
  lineage: { generated_at?: string | null; items: number; systems: number; state?: string; stale_reason?: string; unplaced?: number };
  pending_identity?: number;
};

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const day = (value?: string | null) => value ? value.slice(0, 10) : "未生成";
const wan = (yuan: string | number) => (Number(yuan) / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 1 });

/**
 * 资料库建设 (query 2026-1013 1637): how far each library has been built — material, projects,
 * four-dimension coverage, generated scene and technology structure — with every number's base
 * stated next to it. Choosing a library opens its domain analysis.
 */
export function LeaderConstruction({ onOpen }: { onOpen: (corpusId: string) => void }) {
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
  const covered = sum((r) => Math.min(...Object.values(r.dimensions)));
  const funded = sum((r) => r.funding.projects);
  const years = rows.flatMap((r) => r.start_years);
  const kpis: [string, string, string][] = [
    ["资料库", String(rows.length), "有已入库资料的资料库"],
    ["资料", `${sum((r) => r.files)} 份`, "当前文件，未跨库去重"],
    ["项目", `${projects} 个`, years.length ? `立项 ${Math.min(...years)}–${Math.max(...years)} 年` : "立项年份待核对"],
    ["四维整理", `${covered} / ${projects}`, "场景、问题、技术、成果均已整理的项目"],
    ["经费记录", `${funded} 个项目`, `合计 ${wan(sum((r) => Number(r.funding.total_yuan)))} 万元；其余项目报告未给出直接经费`],
  ];
  return <div className="mx-auto max-w-[1180px] space-y-6 px-5 py-6">
    <h1 className="text-xl font-semibold">资料库建设情况</h1>
    <section aria-label="总体数字" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {kpis.map(([title, value, note]) => <div key={title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <p className="text-[13px] text-[var(--steel)]">{title}</p><p className="my-1 text-2xl font-semibold">{value}</p><p className="text-xs leading-5 text-[var(--stone)]">{note}</p>
      </div>)}
    </section>
    <section aria-label="各资料库" className="overflow-x-auto rounded-xl border border-[var(--hairline)]">
      <table className="w-full min-w-[760px] text-left text-[13.5px]">
        <thead className="bg-[var(--surface)] text-[12.5px] text-[var(--steel)]"><tr>
          {["领域", "资料 / 项目", "四维整理", "场景 / 问题", "技术条目", "立项年份", "最近归纳"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const full = Math.min(...Object.values(row.dimensions));
          return <tr key={row.corpus_id} className="cursor-pointer border-t border-[var(--hairline)] hover:bg-[var(--surface)]" onClick={() => onOpen(row.corpus_id)}>
            <td className="px-4 py-2.5"><button type="button" className="text-left font-semibold text-[var(--link)] hover:underline">{short(row.name)}</button></td>
            <td className="px-4 py-2.5">{row.files} 份 / {row.projects} 个</td>
            <td className="px-4 py-2.5">{full === row.projects ? "全部完成" : `${full} / ${row.projects}`}</td>
            <td className="px-4 py-2.5">{row.hierarchy.scenes ? `${row.hierarchy.scenes} / ${row.hierarchy.issues}` : "未生成"}</td>
            <td className="px-4 py-2.5">{row.lineage.items ? `${row.lineage.items} 条 · ${row.lineage.systems} 个体系` : "未生成"}</td>
            <td className="px-4 py-2.5">{row.start_years.length ? `${row.start_years[0]}–${row.start_years.at(-1)}` : "待核对"}</td>
            <td className="px-4 py-2.5 text-[var(--steel)]">{day(row.lineage.generated_at ?? row.hierarchy.generated_at)}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>
    <p className="text-xs leading-5 text-[var(--stone)]">项目按批准号去重；“四维整理”指场景、问题、技术、成果四个维度都已从报告中整理的项目数；场景、问题与技术条目由模型归纳，需人工核对。点一行查看该领域分析。</p>
  </div>;
}
