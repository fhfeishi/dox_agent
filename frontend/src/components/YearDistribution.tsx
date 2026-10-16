import { useState, type KeyboardEvent } from "react";
import { useApp } from "../store";
import { useQuery } from "@tanstack/react-query";
import { projectQuery, type Project } from "../projects";

/** A project's funding in the selected scope in 万元, or null when its reports give none or conflict. */
function fundingWan(p: Project, scope: string): number | null {
  if (p.funding_conflicts.includes(scope)) return null;
  const money = p.funding.find((m) => m.scope === scope && m.amount_yuan !== null && m.currency === "CNY");
  return money ? Number(money.amount_yuan) / 10000 : null;
}

const W = 760, H = 280, L = 56, R = 52, T = 22, B = 34;
const fmt = (v: number) => v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });

/**
 * 年度分布 (query 2026-1013 1745 / 1842 / 2026-1016 0919): projects per start year beside each
 * project's funding by start year, as two equal charts on one year axis. Hovering or choosing a year
 * marks it in both, and the line above them reads that year across both. Funding: known annual totals
 * as bars with a line (left axis) and each project as a point on its year's bar (right axis, query
 * 2026-1015 1142). Projects without a stated amount are counted, never plotted as zero. A bar opens
 * that year's projects on the right; a point opens its project.
 */
export function YearDistribution({ corpusId, year, onYear }: { corpusId: string; year?: string; onYear?: (year: string) => void }) {
  const { showInspector } = useApp();
  const [chosenScope, setScope] = useState("");
  const [hover, setHover] = useState<number | null>(null);
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
  // Projects per start year (query 2026-1016 0919: 项目数量, no longer report files).
  const counts = years.map((y) => ({ year: y, count: dated.filter((p) => p.start_year === y).length }));
  const totals = years.flatMap((y) => {
    const values = known.filter((k) => k.year === y).map((k) => k.wan);
    return values.length ? [{ year: y, sum: values.reduce((a, b) => a + b, 0), n: values.length }] : [];
  });
  // Both charts share one frame and one year axis, so a year sits at the same place in each.
  const step = years.length ? (W - L - R) / years.length : 0;
  const x = (y: number) => L + step * (y - years[0] + 0.5);
  const bar = Math.min(48, step * 0.62);
  const scale = (max: number) => (v: number) => T + (H - T - B) * (1 - v / Math.max(1, max));
  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const maxTotal = Math.max(1, ...totals.map((v) => v.sum));
  const maxWan = Math.max(1, ...known.map((k) => k.wan));
  const yCount = scale(maxCount), yTotal = scale(maxTotal), yWan = scale(maxWan);
  const focus = hover ?? (year ? Number(year) : null);
  const dim = (y: number) => focus !== null && focus !== y;
  const marked = focus !== null && years.includes(focus);
  const band = marked ? <rect x={x(focus!) - step / 2} y={T - 8} width={step} height={H - T - B + 8} rx="4" fill="var(--primary)" fillOpacity=".07" /> : null;
  const yearAxis = years.map((y) => <text key={y} x={x(y)} y={H - 12} textAnchor="middle" fontSize="11"
    fill={focus === y ? "var(--ink)" : "var(--steel)"} fontWeight={focus === y ? 600 : 400}>{y}</text>);
  const yearHandlers = (y: number, count: number) => ({
    role: count ? "button" as const : undefined, tabIndex: count ? 0 : undefined, className: count ? "cursor-pointer outline-none" : "",
    onMouseEnter: () => setHover(y), onMouseLeave: () => setHover(null), onFocus: () => setHover(y), onBlur: () => setHover(null),
    onClick: () => pick(y, count), onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(y, count); } },
  });
  if (!years.length) return <p className="text-sm text-[var(--steel)]">本领域项目的立项年份均待核对。</p>;
  const focusCount = marked ? counts.find((c) => c.year === focus)!.count : 0;
  const focusTotal = marked ? totals.find((t) => t.year === focus) : undefined;
  const card = "flex flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4";
  return <div className="space-y-3">
    <p role="status" aria-live="polite" className="min-h-[36px] rounded-lg bg-[var(--surface)] px-4 py-2 text-[13px] text-[var(--slate)]">
      {marked ? <><b className="text-[var(--ink)]">{focus} 年</b>：{focusCount} 个项目立项；{focusTotal ? `已知${scopeName}合计 ${fmt(focusTotal.sum)} 万元（${focusTotal.n} 个项目给出金额）` : `没有项目给出${scopeName}`}。点击柱子在右侧查看当年项目。</>
        : <>共 {dated.length} 个项目按立项年份分布，{known.length} 个给出{scopeName}；把鼠标移到任一年份，两图同时标出。</>}
    </p>
    <div className="grid items-stretch gap-4 xl:grid-cols-2">
      <section aria-label="年度分布-项目数量" className={card}>
        <div className="flex min-h-[38px] flex-wrap items-center gap-2"><h3 className="font-semibold">年度分布 · 项目数量</h3></div>
        <p className="mt-1 min-h-[36px] text-xs leading-[18px] text-[var(--steel)]">按立项年份统计 {dated.length} 个项目；立项年份待核对的项目 {projects.length - dated.length} 个。</p>
        <svg role="img" aria-label="各立项年份的项目数量柱状图" viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full">
          {band}
          {[0, 0.5, 1].map((r) => <g key={r}><line x1={L} x2={W - R} y1={yCount(maxCount * r)} y2={yCount(maxCount * r)} stroke="var(--hairline)" />
            <text x={L - 6} y={yCount(maxCount * r) + 4} textAnchor="end" fontSize="11" fill="var(--steel)">{Math.round(maxCount * r)}</text></g>)}
          {yearAxis}
          {counts.map((c) => <g key={c.year} {...yearHandlers(c.year, c.count)} aria-label={c.count ? `${c.year} 年：${c.count} 个项目，查看清单` : undefined}>
            <rect x={x(c.year) - step / 2} y={T} width={step} height={H - T - B} fill="transparent" />
            <rect x={x(c.year) - bar / 2} y={yCount(c.count)} width={bar} height={yCount(0) - yCount(c.count)} rx="3" fill="var(--primary)"
              fillOpacity={dim(c.year) ? .28 : .8}><title>{c.year} 年：{c.count} 个项目</title></rect>
            {c.count ? <text x={x(c.year)} y={yCount(c.count) - 5} textAnchor="middle" fontSize="11" fill="var(--slate)">{c.count}</text> : null}
          </g>)}
        </svg>
        <p className="mt-auto pt-1 text-xs text-[var(--stone)]"><span className="mr-1 inline-block size-2.5 rounded-sm bg-[var(--primary)] opacity-80" />立项项目数（柱，点击查看当年项目）</p>
      </section>
      <section aria-label="年度分布-项目资金" className={card}>
        <div className="flex min-h-[38px] flex-wrap items-center gap-2"><h3 className="font-semibold">年度分布 · 项目资金</h3>
          <span className="flex-1" />
          <select aria-label="金额口径" value={scope} onChange={(e) => setScope(e.target.value)} className="cursor-pointer rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1 text-[13px]">
            <option value="awarded">批准资助金额</option><option value="direct">直接经费</option><option value="total">总经费</option>
          </select></div>
        <p className="mt-1 min-h-[36px] text-xs leading-[18px] text-[var(--steel)]">{scopeName}（万元），按立项年归属。{known.length} 个项目给出金额，{dated.length - known.length} 个缺失或冲突；部分覆盖时合计不代表完整年度总额。</p>
        {/* One chart (query 2026-1015 1142): the yearly total as bars with a line on the left axis, and
            each project's amount as a point over its year's bar on the right axis. */}
        {known.length ? <svg role="img" aria-label="年度资助合计柱状图、总金额折线与各项目金额" viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full">
          {band}
          {[0, 0.5, 1].map((r) => <g key={r}><line x1={L} x2={W - R} y1={yTotal(maxTotal * r)} y2={yTotal(maxTotal * r)} stroke="var(--hairline)" />
            <text x={L - 6} y={yTotal(maxTotal * r) + 4} textAnchor="end" fontSize="11" fill="var(--primary)">{fmt(maxTotal * r)}</text>
            <text x={W - R + 6} y={yWan(maxWan * r) + 4} textAnchor="start" fontSize="11" fill="#0f766e">{fmt(maxWan * r)}</text></g>)}
          {yearAxis}
          {years.map((y) => { const a = totals.find((t) => t.year === y);
            return <g key={y} {...yearHandlers(y, a?.n ?? 0)} aria-label={a ? `${a.year} 年已知${scopeName}合计 ${fmt(a.sum)} 万元，${a.n} 个项目` : undefined}>
              <rect x={x(y) - step / 2} y={T} width={step} height={H - T - B} fill="transparent" />
              {a ? <rect x={x(y) - bar / 2} y={yTotal(a.sum)} width={bar} height={yTotal(0) - yTotal(a.sum)} rx="3" fill="var(--primary)" fillOpacity={dim(y) ? .12 : .3}>
                <title>{a.year} 年已知{scopeName}合计 {fmt(a.sum)} 万元（{a.n} 个项目）</title></rect> : null}
            </g>; })}
          {totals.slice(1).map((a, i) => a.year === totals[i].year + 1 ? <line key={a.year} x1={x(totals[i].year)} y1={yTotal(totals[i].sum)} x2={x(a.year)} y2={yTotal(a.sum)} stroke="var(--orange)" strokeWidth="2" /> : null)}
          {totals.map((a) => <g key={a.year} opacity={dim(a.year) ? .35 : 1}><circle cx={x(a.year)} cy={yTotal(a.sum)} r="3.5" fill="var(--orange)" />
            <text x={x(a.year)} y={yTotal(a.sum) - 7} fontSize="10" textAnchor="middle" fill="var(--orange)">{fmt(a.sum)}</text></g>)}
          {known.map((k, i) => <circle key={k.p.project_id} role="button" tabIndex={0} aria-label={`${k.p.title}：${fmt(k.wan)} 万元`} className="cursor-pointer"
            cx={x(k.year) + ((i % 7) - 3) * (bar / 8)} cy={yWan(k.wan)} r="4.5" fill="#0f766e" fillOpacity={dim(k.year) ? .2 : .65} stroke="#fff" strokeWidth="1"
            onMouseEnter={() => setHover(k.year)} onMouseLeave={() => setHover(null)}
            onClick={() => showInspector({ kind: "project", corpusId, projectId: k.p.project_id, facet: "成果" })}
            onKeyDown={(e) => { if (e.key === "Enter") showInspector({ kind: "project", corpusId, projectId: k.p.project_id, facet: "成果" }); }}>
            <title>{k.p.title} · {k.year} 年 · {fmt(k.wan)} 万元</title></circle>)}
        </svg> : <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-[var(--steel)]">当前口径没有可确认的金额，未以其他口径替代。</p>}
        <p className="mt-auto flex flex-wrap gap-x-4 pt-1 text-xs text-[var(--stone)]">
          <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-[var(--primary)] opacity-40" />年度合计（柱，左轴）</span>
          <span className="text-[var(--orange)]">—●— 合计走势（缺失年份不连线）</span>
          <span><span className="mr-1 inline-block size-2.5 rounded-full bg-[#0f766e] opacity-70" />单个项目（点，右轴）</span>
          <span>未知金额不补成零</span>
        </p>
      </section>
    </div>
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

