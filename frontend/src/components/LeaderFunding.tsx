import { useQuery } from "@tanstack/react-query";
import { projectQuery, type Project } from "../projects";

/** A project's direct funding in yuan, or null when its reports give none or conflict. */
function direct(p: Project): number | null {
  if (p.funding_conflicts.includes("direct")) return null;
  const money = p.funding.find((m) => m.scope === "direct" && m.amount_yuan !== null && m.currency === "CNY");
  return money ? Number(money.amount_yuan) : null;
}

/**
 * 项目资金 (query 2026-1013 1637): direct funding by start year for the projects whose reports state
 * it, with the count of projects behind each bar and those without an amount kept in view.
 */
export function LeaderFunding({ corpusId }: { corpusId: string }) {
  const result = useQuery(projectQuery(corpusId));
  if (result.error) return <p role="alert" className="text-sm text-[var(--red)]">{(result.error as Error).message}</p>;
  if (!result.data) return <p role="status" className="text-sm text-[var(--steel)]">正在读取项目…</p>;
  const projects = result.data.projects.filter((p) => p.identity_status === "identified");
  const known = projects.filter((p) => p.start_year !== null && direct(p) !== null);
  const years = [...new Set(known.map((p) => p.start_year!))].sort();
  const rows = years.map((year) => {
    const inYear = known.filter((p) => p.start_year === year);
    return { year, count: inYear.length, total: inYear.reduce((n, p) => n + direct(p)!, 0) / 10000 };
  });
  const max = Math.max(1, ...rows.map((r) => r.total));
  const total = rows.reduce((n, r) => n + r.total, 0);
  return <section aria-label="项目资金" className="space-y-4">
    <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-[15px] leading-7">
      {known.length ? `${known.length} 个项目的报告给出了直接经费，合计 ${total.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 万元；另有 ${projects.length - known.length} 个项目未给出或口径冲突，不计为零。`
        : `本领域 ${projects.length} 个项目的报告均未给出可确认的直接经费。`}</p>
    {rows.length ? <div className="space-y-2">{rows.map((row) => <div key={row.year} className="flex items-center gap-3 text-[13.5px]">
      <span className="w-12 shrink-0">{row.year}</span>
      <span className="h-5 flex-1 rounded bg-[var(--surface)]"><span className="block h-5 rounded bg-[var(--primary)]" style={{ width: `${100 * row.total / max}%` }} /></span>
      <span className="w-44 shrink-0 text-right">{row.total.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 万元 · {row.count} 个项目</span>
    </div>)}</div> : null}
    <p className="text-xs leading-5 text-[var(--stone)]">按立项年份汇总；金额取自各项目报告所述直接经费，人民币计；经费多少不代表项目质量。</p>
  </section>;
}
