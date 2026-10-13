import { useQuery } from "@tanstack/react-query";
import { projectQuery, type Project } from "../projects";

/** A project's direct funding in 万元, or null when its reports give none or conflict. */
function directWan(p: Project): number | null {
  if (p.funding_conflicts.includes("direct")) return null;
  const money = p.funding.find((m) => m.scope === "direct" && m.amount_yuan !== null && m.currency === "CNY");
  return money ? Number(money.amount_yuan) / 10000 : null;
}

const W = 760, H = 260, L = 56, R = 16, T = 16, B = 34;
const fmt = (v: number) => v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });

/**
 * 年度分布 (query 2026-1013 1745): projects per start year, and each project's direct funding by
 * start year as a scatter with the yearly average as a line. Projects without a stated amount are
 * counted, never plotted as zero.
 */
export function YearDistribution({ corpusId }: { corpusId: string }) {
  const result = useQuery(projectQuery(corpusId));
  if (result.error) return <p role="alert" className="text-sm text-[var(--red)]">{(result.error as Error).message}</p>;
  if (!result.data) return <p role="status" className="text-sm text-[var(--steel)]">正在读取项目…</p>;
  const projects = result.data.projects.filter((p) => p.identity_status === "identified");
  const dated = projects.filter((p) => p.start_year !== null);
  const known = dated.flatMap((p) => { const v = directWan(p); return v === null ? [] : [{ p, year: p.start_year!, wan: v }]; });
  const allYears = dated.map((p) => p.start_year!);
  const years = allYears.length ? Array.from({ length: Math.max(...allYears) - Math.min(...allYears) + 1 }, (_, i) => Math.min(...allYears) + i) : [];
  const counts = years.map((year) => ({ year, count: dated.filter((p) => p.start_year === year).length }));
  const averages = years.flatMap((year) => {
    const values = known.filter((k) => k.year === year).map((k) => k.wan);
    return values.length ? [{ year, avg: values.reduce((a, b) => a + b, 0) / values.length, n: values.length }] : [];
  });
  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const maxWan = Math.max(1, ...known.map((k) => k.wan));
  // Each year owns an equal slot; marks sit at the slot centre so the first and last stay inside the axes.
  const step = years.length ? (W - L - R) / years.length : 0;
  const x = (year: number) => L + step * (year - years[0] + 0.5);
  const bar = Math.min(40, step * 0.6);
  const yCount = (v: number) => T + (H - T - B) * (1 - v / maxCount);
  const yWan = (v: number) => T + (H - T - B) * (1 - v / maxWan);
  const axis = (label: (v: number) => string, scale: (v: number) => number, max: number) => <>
    {[0, 0.5, 1].map((r) => <g key={r}><line x1={L} x2={W - R} y1={scale(max * r)} y2={scale(max * r)} stroke="var(--hairline)" />
      <text x={L - 6} y={scale(max * r) + 4} textAnchor="end" fontSize="11" fill="var(--steel)">{label(max * r)}</text></g>)}
    {years.map((year) => <text key={year} x={x(year)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--steel)">{year}</text>)}
  </>;
  if (!years.length) return <p className="text-sm text-[var(--steel)]">本领域项目的立项年份均待核对。</p>;
  return <div className="space-y-6">
    <section aria-label="年度分布-项目数量" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <h3 className="font-semibold">年度分布 · 项目数量</h3>
      <p className="mb-2 text-xs text-[var(--steel)]">按立项年份统计 {dated.length} 个项目；立项年份待核对 {projects.length - dated.length} 个。</p>
      <svg role="img" aria-label="各立项年份的项目数量柱状图" viewBox={`0 0 ${W} ${H}`} className="w-full">
        {axis((v) => String(Math.round(v)), yCount, maxCount)}
        {counts.map((c) => <g key={c.year}>
          <rect x={x(c.year) - bar / 2} y={yCount(c.count)} width={bar} height={yCount(0) - yCount(c.count)} rx="3" fill="var(--primary)" fillOpacity=".8"><title>{c.year} 年：{c.count} 个项目</title></rect>
          {c.count ? <text x={x(c.year)} y={yCount(c.count) - 4} textAnchor="middle" fontSize="11" fill="var(--slate)">{c.count}</text> : null}
        </g>)}
      </svg>
    </section>
    <section aria-label="年度分布-项目资金" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <h3 className="font-semibold">年度分布 · 项目资金</h3>
      <p className="mb-2 text-xs text-[var(--steel)]">每个点是一个项目的直接经费（万元），折线为当年有金额项目的平均经费；{known.length} 个项目给出金额，{dated.length - known.length} 个未给出或口径冲突，不计为零。</p>
      {known.length ? <svg role="img" aria-label="各立项年份项目直接经费散点与年度平均折线" viewBox={`0 0 ${W} ${H}`} className="w-full">
        {axis((v) => fmt(v), yWan, maxWan)}
        {known.map((k, i) => <circle key={k.p.project_id} cx={x(k.year) + ((i % 5) - 2) * 3} cy={yWan(k.wan)} r="4" fill="var(--primary)" fillOpacity=".45">
          <title>{k.p.title} · {k.year} 年 · {fmt(k.wan)} 万元</title></circle>)}
        {averages.length > 1 ? <polyline fill="none" stroke="#d97706" strokeWidth="2" points={averages.map((a) => `${x(a.year)},${yWan(a.avg)}`).join(" ")} /> : null}
        {averages.map((a) => <circle key={a.year} cx={x(a.year)} cy={yWan(a.avg)} r="3.5" fill="#d97706"><title>{a.year} 年平均 {fmt(a.avg)} 万元（{a.n} 个项目）</title></circle>)}
      </svg> : <p className="py-6 text-center text-sm text-[var(--steel)]">本领域项目报告均未给出可确认的直接经费。</p>}
      <p className="mt-1 text-xs text-[var(--stone)]">● 项目经费　<span className="text-[#d97706]">—●— 年度平均</span>　经费多少不代表项目质量；有金额的项目少时平均值波动大。</p>
    </section>
  </div>;
}
