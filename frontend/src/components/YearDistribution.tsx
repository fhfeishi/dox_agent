import { useState } from "react";
import { useApp } from "../store";
import { useQuery } from "@tanstack/react-query";
import { projectQuery, type Project } from "../projects";

/** A project's funding in the selected scope in 万元, or null when its reports give none or conflict. */
function fundingWan(p: Project, scope: string): number | null {
  if (p.funding_conflicts.includes(scope)) return null;
  const money = p.funding.find((m) => m.scope === scope && m.amount_yuan !== null && m.currency === "CNY");
  return money ? Number(money.amount_yuan) / 10000 : null;
}

const W = 760, H = 260, L = 56, R = 16, T = 16, B = 34;
const fmt = (v: number) => v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });

/**
 * 年度分布 (query 2026-1013 1745 / 1842): reports per start year, and each project's direct funding
 * by start year: known annual totals as bars with a line (left axis) and each project as a point on
 * its year's bar (right axis), in one chart (query 2026-1015 1142). Projects without a stated amount are
 * counted, never plotted as zero. A bar opens that year's reports on the right (and, where the page
 * lists projects, selects the year there); a point opens its project on the right.
 */
export function YearDistribution({ corpusId, year, onYear }: { corpusId: string; year?: string; onYear?: (year: string) => void }) {
  const { showInspector } = useApp();
  const [chosenScope, setScope] = useState("");
  const result = useQuery(projectQuery(corpusId));
  // query 2026-1013 2012: a bar opens the year's reports on the right, by mouse or keyboard.
  const pick = (value: number, count: number) => {
    if (!count) return;
    onYear?.(String(value));
    showInspector({ kind: "year", corpusId, year: value });
  };
  if (result.error) return <p role="alert" className="text-sm text-[var(--red)]">{(result.error as Error).message}</p>;
  if (!result.data) return <p role="status" className="text-sm text-[var(--steel)]">正在读取项目…</p>;
  const projects = result.data.projects.filter((p) => p.identity_status === "identified");
  const dated = projects.filter((p) => p.start_year !== null);
  // Open on the amount type most projects state (a library may have only 直接经费), never an empty chart.
  const stated = (key: string) => dated.filter((p) => fundingWan(p, key) !== null).length;
  const scope = chosenScope || ["awarded", "direct", "total"].reduce((best, key) => stated(key) > stated(best) ? key : best, "awarded");
  const scopeName = scope === "awarded" ? "批准资助金额" : scope === "direct" ? "直接经费" : "总经费";
  const known = dated.flatMap((p) => { const v = fundingWan(p, scope); return v === null ? [] : [{ p, year: p.start_year!, wan: v }]; });
  const allYears = dated.map((p) => p.start_year!);
  const years = allYears.length ? Array.from({ length: Math.max(...allYears) - Math.min(...allYears) + 1 }, (_, i) => Math.min(...allYears) + i) : [];
  // Report files per start year (query 1842: the count is the number of reports, no dimensions).
  const counts = years.map((y) => ({ year: y, count: dated.filter((p) => p.start_year === y).reduce((n, p) => n + p.files.length, 0) }));
  const totals = years.flatMap((y) => {
    const values = known.filter((k) => k.year === y).map((k) => k.wan);
    return values.length ? [{ year: y, sum: values.reduce((a, b) => a + b, 0), n: values.length }] : [];
  });
  const maxTotal = Math.max(1, ...totals.map((v) => v.sum));
  const yTotal = (v: number) => T + (H - T - B) * (1 - v / maxTotal);
  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const maxWan = Math.max(1, ...known.map((k) => k.wan));
  // Each year owns an equal slot; marks sit at the slot centre so the first and last stay inside the axes.
  const step = years.length ? (W - L - R) / years.length : 0;
  const x = (y: number) => L + step * (y - years[0] + 0.5);
  const bar = Math.min(40, step * 0.6);
  const yCount = (v: number) => T + (H - T - B) * (1 - v / maxCount);
  const yWan = (v: number) => T + (H - T - B) * (1 - v / maxWan);
  // The funding chart keeps a right margin for its second axis (individual projects).
  const RR = 52;
  const stepF = years.length ? (W - L - RR) / years.length : 0;
  const xf = (y: number) => L + stepF * (y - years[0] + 0.5);
  const barF = Math.min(56, stepF * 0.7);
  const axis = (label: (v: number) => string, scale: (v: number) => number, max: number) => <>
    {[0, 0.5, 1].map((r) => <g key={r}><line x1={L} x2={W - R} y1={scale(max * r)} y2={scale(max * r)} stroke="var(--hairline)" />
      <text x={L - 6} y={scale(max * r) + 4} textAnchor="end" fontSize="11" fill="var(--steel)">{label(max * r)}</text></g>)}
    {years.map((y) => <text key={y} x={x(y)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--steel)">{y}</text>)}
  </>;
  if (!years.length) return <p className="text-sm text-[var(--steel)]">本领域项目的立项年份均待核对。</p>;
  return <div className="grid items-start gap-5 xl:grid-cols-2">
    <section aria-label="年度分布-报告数量" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <h3 className="font-semibold">年度分布 · 报告数量</h3>
      <p className="mb-2 text-xs text-[var(--steel)]">按项目立项年份统计 {counts.reduce((n, c) => n + c.count, 0)} 份报告；立项年份待核对的项目 {projects.length - dated.length} 个。点击柱子在右侧查看当年的报告。</p>
      <svg role="img" aria-label="各立项年份的报告数量柱状图" viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[760px]">
        {axis((v) => String(Math.round(v)), yCount, maxCount)}
        {counts.map((c) => <g key={c.year} role={c.count ? "button" : undefined} tabIndex={c.count ? 0 : undefined}
          aria-label={c.count ? `${c.year} 年：${c.count} 份报告，查看清单` : undefined} className={c.count ? "cursor-pointer outline-none focus-visible:opacity-70" : ""}
          onClick={() => pick(c.year, c.count)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(c.year, c.count); } }}>
          <rect x={x(c.year) - bar / 2} y={yCount(c.count)} width={bar} height={yCount(0) - yCount(c.count)} rx="3" fill="var(--primary)"
            fillOpacity={!year || year === String(c.year) ? .8 : .3}><title>{c.year} 年：{c.count} 份报告</title></rect>
          {c.count ? <text x={x(c.year)} y={yCount(c.count) - 4} textAnchor="middle" fontSize="11" fill="var(--slate)">{c.count}</text> : null}
        </g>)}
      </svg>
    </section>
    <section aria-label="年度分布-项目资金" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <h3 className="font-semibold">年度分布 · 项目资金</h3>
      <label className="my-3 flex items-center gap-2 text-sm">金额口径
        <select aria-label="金额口径" value={scope} onChange={(e) => setScope(e.target.value)} className="cursor-pointer rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2">
          <option value="awarded">批准资助金额</option><option value="direct">直接经费</option><option value="total">总经费</option>
        </select>
      </label>
      <p className="mb-2 text-xs text-[var(--steel)]">{scopeName}（万元），按项目立项年归属。{known.length} 个项目给出金额，{dated.length - known.length} 个缺失或冲突；部分覆盖时合计不代表完整年度总额。</p>
      {/* One chart (query 2026-1015 1142): the yearly total as bars with a line on the left axis, and
          each project's amount as a point over its year's bar on the right axis. */}
      {known.length ? <svg role="img" aria-label="年度资助合计柱状图、总金额折线与各项目金额" viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[760px]">
        {[0, 0.5, 1].map((r) => <g key={r}><line x1={L} x2={W - RR} y1={yTotal(maxTotal * r)} y2={yTotal(maxTotal * r)} stroke="var(--hairline)" />
          <text x={L - 6} y={yTotal(maxTotal * r) + 4} textAnchor="end" fontSize="11" fill="var(--primary)">{fmt(maxTotal * r)}</text>
          <text x={W - RR + 6} y={yWan(maxWan * r) + 4} textAnchor="start" fontSize="11" fill="#0f766e">{fmt(maxWan * r)}</text></g>)}
        {years.map((y) => <text key={y} x={xf(y)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--steel)">{y}</text>)}
        {totals.map((a) => <g key={a.year} role="button" tabIndex={0} aria-label={`${a.year} 年已知${scopeName}合计 ${fmt(a.sum)} 万元，${a.n} 个项目`}
          className="cursor-pointer" onClick={() => pick(a.year, a.n)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(a.year, a.n); } }}>
          <rect x={xf(a.year) - barF / 2} y={yTotal(a.sum)} width={barF} height={yTotal(0) - yTotal(a.sum)} rx="3" fill="var(--primary)" fillOpacity=".28" />
          <title>{a.year} 年已知{scopeName}合计 {fmt(a.sum)} 万元（{a.n} 个项目）</title>
        </g>)}
        {totals.slice(1).map((a, i) => a.year === totals[i].year + 1 ? <line key={a.year} x1={xf(totals[i].year)} y1={yTotal(totals[i].sum)} x2={xf(a.year)} y2={yTotal(a.sum)} stroke="var(--orange)" strokeWidth="2" /> : null)}
        {totals.map((a) => <g key={a.year}><circle cx={xf(a.year)} cy={yTotal(a.sum)} r="3.5" fill="var(--orange)" />
          <text x={xf(a.year)} y={yTotal(a.sum) - 7} fontSize="10" textAnchor="middle" fill="var(--orange)">{fmt(a.sum)}</text></g>)}
        {known.map((k, i) => <circle key={k.p.project_id} role="button" tabIndex={0} aria-label={`${k.p.title}：${fmt(k.wan)} 万元`} className="cursor-pointer"
          cx={xf(k.year) + ((i % 7) - 3) * (barF / 8)} cy={yWan(k.wan)} r="4.5" fill="#0f766e" fillOpacity=".6" stroke="#fff" strokeWidth="1"
          onClick={() => showInspector({ kind: "project", corpusId, projectId: k.p.project_id, facet: "成果" })}
          onKeyDown={(e) => { if (e.key === "Enter") showInspector({ kind: "project", corpusId, projectId: k.p.project_id, facet: "成果" }); }}>
          <title>{k.p.title} · {k.year} 年 · {fmt(k.wan)} 万元</title></circle>)}
      </svg> : <p className="py-6 text-center text-sm text-[var(--steel)]">当前口径没有可确认的金额，未以其他口径替代。</p>}
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--stone)]">
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-[var(--primary)] opacity-40" />年度合计（柱，左轴）</span>
        <span className="text-[var(--orange)]">—●— 合计走势（缺失年份不连线）</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full bg-[#0f766e] opacity-70" />单个项目（点，右轴，点击查看项目）</span>
      </p>
      <p className="mt-1 text-xs text-[var(--stone)]">未知金额不补成零；金额不代表项目质量。</p>
    </section>
  </div>;
}

/**
 * One year's reports (query 2026-1013 2012), opened from a bar: the same set the bar counts — the
 * report files of projects that started that year — grouped by project. A file opens its text, a
 * project its detail; back returns here.
 */
export function YearReports({ corpusId, year }: { corpusId: string; year: number }) {
  const { corpora, showInspector, openPreview } = useApp();
  const result = useQuery(projectQuery(corpusId));
  const [query, setQuery] = useState("");
  if (result.error) return <p role="alert" className="text-sm text-[var(--red)]">{(result.error as Error).message}</p>;
  if (!result.data) return <p role="status" className="text-sm text-[var(--steel)]">正在读取…</p>;
  const name = (corpora.find((c) => c.id === corpusId)?.name ?? corpusId).replace(/^自然科学基金-/, "");
  const projects = result.data.projects.filter((p) => p.identity_status === "identified" && p.start_year === year);
  const files = projects.reduce((n, p) => n + p.files.length, 0);
  const q = query.trim().toLowerCase();
  const shown = q ? projects.filter((p) => `${p.title} ${p.number} ${p.files.map((f) => f.document.title).join(" ")}`.toLowerCase().includes(q)) : projects;
  return <div className="space-y-3 p-1">
    <div>
      <h2 className="text-[16px] font-semibold">{year} 年 · {name}</h2>
      <p className="mt-1 text-[12.5px] text-[var(--steel)]">报告 {files} 份 · 项目 {projects.length} 个。按项目立项年份归入，不是当年提交或发布的报告数。</p>
    </div>
    {projects.length > 6 ? <input type="search" aria-label="在本年报告中搜索" placeholder="搜索项目或报告" value={query} onChange={(e) => setQuery(e.target.value)}
      className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-1.5 text-[13px]" /> : null}
    {!projects.length ? <p className="text-sm text-[var(--steel)]">本年没有纳入的报告。</p> : null}
    <ul className="space-y-2">{shown.map((p) => <li key={p.project_id} className="rounded-lg border border-[var(--hairline)] p-3">
      <button type="button" onClick={() => showInspector({ kind: "project", corpusId, projectId: p.project_id, facet: "成果" })}
        className="block text-left text-[13.5px] font-medium leading-5 hover:text-[var(--primary)]">{p.title}</button>
      <p className="mt-0.5 text-xs text-[var(--stone)]">{p.number || "批准号待核对"} · {p.files.length} 份报告</p>
      <div className="mt-1.5 space-y-0.5">{p.files.map((f) => <button key={f.document.doc_id} type="button" onClick={() => openPreview(f.document, null, corpusId)}
        className="block w-full truncate text-left text-xs text-[var(--link)] hover:underline" title={f.document.title}>{f.document.title}</button>)}</div>
    </li>)}</ul>
    {q && !shown.length ? <p className="text-sm text-[var(--steel)]">没有匹配的项目或报告。</p> : null}
  </div>;
}

