import { useEffect, useState, type ReactNode } from "react";
import type { LibraryOverview } from "../api";
import { LIBRARY_HUES, OTHER_LIBRARIES, rankLibraries } from "../libraryColors";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const wan = (yuan: number) => (yuan / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 0 });

type Group = { key: string; name: string; color: string; ids: string[] };

function groups(rows: LibraryOverview[]): Group[] {
  // Hues are computed once for all slides (libraryColors.ts), so re-sorting a slide never repaints a library.
  const ranked = rankLibraries(rows);
  const named = ranked.slice(0, LIBRARY_HUES.length).map((r, i) => ({ key: r.corpus_id, name: short(r.name), color: LIBRARY_HUES[i], ids: [r.corpus_id] }));
  const rest = ranked.slice(LIBRARY_HUES.length);
  return rest.length ? [...named, { key: "other", name: `其他领域（${rest.map((r) => short(r.name)).join("、")}）`, color: OTHER_LIBRARIES, ids: rest.map((r) => r.corpus_id) }] : named;
}

const fmt = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });

/**
 * Horizontal bars, one per library, in HTML so the text stays crisp at 12px whatever the banner width.
 * Libraries without a value are named once under the bars instead of taking a row each; bars grow in
 * left to right, a row at a time, when the slide appears.
 */
function LibraryBars({ rows, value, label, colorOf, nameOf, missing }: { rows: LibraryOverview[]; value: (r: LibraryOverview) => number; label: (r: LibraryOverview) => string;
  colorOf: (id: string) => string; nameOf: (r: LibraryOverview) => string; missing?: string }) {
  const shown = rows.filter((r) => value(r) > 0);
  const absent = rows.filter((r) => !(value(r) > 0));
  const max = Math.max(1, ...shown.map(value));
  return <figure role="img" aria-label="各资料库数值横条图" className="m-0 flex h-full w-full flex-col justify-center">
    <ul className="space-y-[5px]">{shown.map((r, i) => <li key={r.corpus_id} title={`${short(r.name)}：${label(r)}`} className="grid grid-cols-[6.5em_minmax(0,1fr)] items-center gap-3 text-caption leading-[14px]">
      <span className="truncate text-right text-[#dbe4ee]">{nameOf(r)}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="hero-bar h-[11px] shrink-0 rounded-[3px]" style={{ width: `calc((100% - 8.5em) * ${value(r) / max})`, minWidth: 3, background: colorOf(r.corpus_id), animationDelay: `${i * 45}ms` }} />
        <span className="shrink-0 whitespace-nowrap tabular-nums text-[#c9d4e1]">{label(r)}</span>
      </span>
    </li>)}</ul>
    {absent.length && missing ? <figcaption className="mt-2.5 pl-[calc(6.5em+12px)] text-caption text-[#8fa3ba]">{missing}：{absent.map(nameOf).join("、")}</figcaption> : null}
  </figure>;
}

/**
 * Stacked columns per year for the last ten years, one segment per library group with a 1px seam;
 * columns rise from the axis when the slide appears and the busiest year's total is set in bold.
 */
function YearStack({ rows, groups: gs, years, value, unit, nameOf }: { rows: LibraryOverview[]; groups: Group[]; years: number[]; value: (r: LibraryOverview, year: number) => number;
  unit: (v: number) => string; nameOf: (g: Group) => string }) {
  const of = (g: Group, y: number) => g.ids.reduce((n, id) => { const r = rows.find((x) => x.corpus_id === id); return n + (r ? value(r, y) : 0); }, 0);
  const totals = years.map((y) => gs.reduce((n, g) => n + of(g, y), 0));
  const max = Math.max(1, ...totals);
  const peak = totals.indexOf(Math.max(...totals));
  const present = gs.filter((g) => years.some((y) => of(g, y) > 0));
  const W = 640, H = 196, base = 172, top = 22, step = W / years.length, bar = Math.min(40, step * 0.58);
  return <figure className="m-0 flex h-full w-full flex-col justify-center">
    <svg role="img" aria-label="近十年各领域堆叠柱状图" viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {[0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={base - (base - top) * f + 0.5} y2={base - (base - top) * f + 0.5} stroke="#ffffff" strokeOpacity=".07" strokeDasharray="3 4" />)}
      <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} stroke="#ffffff" strokeOpacity=".25" />
      {years.map((y, i) => { let cursor = base; const x = i * step + (step - bar) / 2;
        return <g key={y}>
          <g className="hero-col" style={{ animationDelay: `${i * 40}ms` }}>
            {present.map((g) => { const v = of(g, y); if (!v) return null; const h = Math.max(1.5, v / max * (base - top)); cursor -= h;
              return <rect key={g.key} x={x} y={cursor} width={bar} height={Math.max(1, h - 1)} rx="1.5" fill={g.color}><title>{y} 年 · {g.name}：{unit(v)}</title></rect>; })}
          </g>
          {totals[i] ? <text x={x + bar / 2} y={cursor - 6} textAnchor="middle" fontSize={i === peak ? 12.5 : 11} fontWeight={i === peak ? 700 : 500} fill={i === peak ? "#ffffff" : "#c9d4e1"}>{fmt(totals[i])}</text> : null}
          <text x={x + bar / 2} y={H - 4} textAnchor="middle" fontSize="11" fill={i === peak ? "#e6edf5" : "#8fa3ba"}>{y}</text>
        </g>; })}
    </svg>
    <figcaption className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-caption text-[#c9d4e1]">
      {present.map((g) => <span key={g.key} title={g.name} className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-[2px]" style={{ background: g.color }} />{nameOf(g)}</span>)}
    </figcaption>
  </figure>;
}

/** Counts a figure up from zero when a slide appears; a still screen shows the final value at once. */
function useCountUp(target: number, still: boolean) {
  const [shown, setShown] = useState(still ? target : 0);
  useEffect(() => {
    if (still) { setShown(target); return; }
    let frame = 0; const start = performance.now();
    const tick = (now: number) => { const t = Math.min(1, (now - start) / 650); setShown(target * (1 - (1 - t) ** 3)); if (t < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, still]);
  return shown;
}

type Slide = { key: string; label: string; title: string; value: number; unit: string; insight: string; note: string; chart: ReactNode };

/**
 * The banner of the leader's 首页 (query 2026-1019 1458, replacing 1613's guide to the top bar): four
 * slides of the research landscape — projects and known funding by library, then both by start year over
 * the last ten years, each library in its own colour. Each slide leads with its total and one takeaway
 * computed from the same numbers as the chart. It turns every 7 seconds; hovering or focusing pauses it, and
 * the pause button stops it until pressed again (touch and keyboard readers, card U4a); the labels, the
 * arrows and the arrow keys switch by hand; reduced motion stops the turning and the
 * count-up. Funding is the one measure most reports state (funding.label, e.g. 批准资助金额); how many
 * projects state it is written on the slide.
 */
export function HeroCarousel({ rows }: { rows: LibraryOverview[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [still] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const gs = groups(rows);
  const colorOf = (id: string) => gs.find((g) => g.ids.includes(id))?.color ?? OTHER_LIBRARIES;
  // Every library here is “AI与…”: the shared prefix moves to the eyebrow so the labels say what differs.
  const prefix = rows.length && rows.every((r) => short(r.name).startsWith("AI与")) ? "AI与" : "";
  const bare = (name: string) => prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
  const nameOf = (r: LibraryOverview) => bare(short(r.name));
  const groupName = (g: Group) => g.key === "other" ? `其他 ${g.ids.length} 个领域` : bare(g.name);
  const projects = rows.reduce((n, r) => n + r.projects, 0);
  const funded = rows.reduce((n, r) => n + r.funding.projects, 0);
  const measure = rows[0]?.funding.label ?? "经费";
  const fund = rows.reduce((n, r) => n + Number(r.funding.total_yuan), 0);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => thisYear - 9 + i);
  const yearSum = (pick: (r: LibraryOverview, y: number) => number) => years.map((y) => rows.reduce((n, r) => n + pick(r, y), 0));
  const perYear = yearSum((r, y) => r.by_year?.[y] ?? 0);
  const fundPerYear = yearSum((r, y) => r.funding_by_year?.[y] ?? 0);
  const peakOf = (values: number[]) => values.indexOf(Math.max(...values));
  const byProjects = [...rows].sort((a, b) => b.projects - a.projects);
  const byFunding = [...rows].sort((a, b) => Number(b.funding.total_yuan) - Number(a.funding.total_yuan));
  const share = (n: number, of: number) => of ? Math.round(n / of * 100) : 0;
  const pct = (n: number, of: number) => n && share(n, of) < 1 ? "<1%" : `${share(n, of)}%`;
  const lead = byProjects.slice(0, 2);
  const slides: Slide[] = [
    { key: "projects", label: "领域项目分布", title: "领域项目分布", value: projects, unit: "个项目",
      insight: lead.length > 1 ? `${lead.map(nameOf).join("、")}两个领域占 ${share(lead[0].projects + lead[1].projects, projects)}%` : "",
      note: `${rows.length} 个领域资料库；项目在各库内按批准号去重，跨库合计未去重。`,
      chart: <LibraryBars rows={byProjects} value={(r) => r.projects} label={(r) => `${fmt(r.projects)} · ${pct(r.projects, projects)}`} colorOf={colorOf} nameOf={nameOf} /> },
    { key: "funding", label: "领域经费分布", title: "领域经费分布", value: fund / 10000, unit: "万元",
      insight: funded && byFunding[0] ? `${nameOf(byFunding[0])}最多：${wan(Number(byFunding[0].funding.total_yuan))} 万元，占 ${share(Number(byFunding[0].funding.total_yuan), fund)}%` : "报告尚未给出经费金额",
      note: `已知${measure}合计：${funded} / ${projects} 个项目报告给出金额，其余未给出，不按零计。`,
      chart: <LibraryBars rows={byFunding} value={(r) => Number(r.funding.total_yuan)} label={(r) => `${wan(Number(r.funding.total_yuan))} 万元 · ${r.funding.projects} 项`}
        colorOf={colorOf} nameOf={nameOf} missing="报告未给出金额" /> },
    { key: "years", label: "年度项目分布", title: "年度项目分布", value: perYear.reduce((a, b) => a + b, 0), unit: "个项目",
      insight: Math.max(...perYear) ? `${years[peakOf(perYear)]} 年立项最多：${fmt(perYear[peakOf(perYear)])} 个项目` : "",
      note: `${years[0]}–${years.at(-1)} 年按立项年份统计，颜色区分领域；柱顶为当年合计。`,
      chart: <YearStack rows={rows} groups={gs} years={years} value={(r, y) => r.by_year?.[y] ?? 0} unit={(v) => `${fmt(v)} 个项目`} nameOf={groupName} /> },
    { key: "year-funding", label: "年度项目经费分布", title: "年度项目经费分布", value: fundPerYear.reduce((a, b) => a + b, 0) / 10000, unit: "万元",
      insight: Math.max(...fundPerYear) ? `${years[peakOf(fundPerYear)]} 年立项项目经费最多：${wan(fundPerYear[peakOf(fundPerYear)])} 万元` : "报告尚未给出经费金额",
      note: `${years[0]}–${years.at(-1)} 年已知${measure}，按项目立项年份归入，柱顶单位万元；只含给出金额的 ${funded} 个项目。`,
      chart: <YearStack rows={rows} groups={gs} years={years} value={(r, y) => (r.funding_by_year?.[y] ?? 0) / 10000} unit={(v) => `${fmt(v)} 万元`} nameOf={groupName} /> },
  ];
  const go = (next: number) => setIndex((next + slides.length) % slides.length);
  useEffect(() => {
    if (paused || held || still) return;
    const timer = window.setTimeout(() => go(index + 1), 7000);
    return () => window.clearTimeout(timer);
  }, [index, paused, held, still]);
  const slide = slides[index];
  const counted = useCountUp(slide.value, still);

  return <section aria-roledescription="carousel" aria-label="首页导览" tabIndex={0}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false); }}
    onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); } }}
    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--banner-1)] via-[var(--banner-2)] to-[var(--banner-3)] text-white outline-none focus-visible:ring-2 focus-visible:ring-[#9fb3c8]">
    <span aria-hidden="true" className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-[#3987e5]/10 blur-3xl" />
    <div key={slide.key} aria-roledescription="slide" aria-label={`${index + 1} / ${slides.length}：${slide.label}`} aria-live={paused ? "polite" : "off"}
      className="hero-slide relative grid min-h-[300px] items-stretch gap-8 px-6 pt-6 pb-16 sm:px-9 md:h-[300px] md:grid-cols-[minmax(0,0.78fr)_minmax(0,1.42fr)]">
      <div className="flex flex-col justify-center">
        <p className="flex items-center gap-2 text-caption text-[#aebdd0]">
          <span className="tabular-nums text-[#7f93ab]">{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
          <span className="h-3 w-px bg-white/20" />研究版图{prefix ? ` · ${prefix.replace("与", "")} 与各领域` : ""}
        </p>
        <h1 className="mt-2 text-page leading-tight font-semibold tracking-wide">{slide.title}</h1>
        <p className="mt-3 flex items-baseline gap-2"><b className="text-display leading-none font-semibold tabular-nums">{fmt(counted)}</b><span className="text-body text-[#c9d4e1]">{slide.unit}</span></p>
        {slide.insight ? <p className="mt-3.5 inline-flex max-w-full items-center gap-2 self-start rounded-2xl bg-white/[0.08] px-3 py-1 text-body text-[#eef3f8] ring-1 ring-white/10">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#7cc4ff]" /><span>{slide.insight}</span></p> : null}
        <p className="mt-3 max-w-[30em] text-caption leading-[18px] text-pretty text-[#8fa3ba]">{slide.note}</p>
      </div>
      <div className="relative hidden min-w-0 items-center border-l border-white/10 pl-8 md:flex">{slide.chart}</div>
    </div>
    <div className="absolute inset-x-6 bottom-4 flex items-center gap-3 border-t border-white/10 pt-3 sm:inset-x-9">
      <div role="group" aria-label="切换导览" className="flex flex-1 flex-wrap gap-1.5">
        {slides.map((s, i) => <button key={s.key} type="button" aria-label={`第 ${i + 1} 张：${s.label}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)}
          className={`relative overflow-hidden rounded-full px-2.5 py-0.5 text-caption transition-colors ${i === index ? "bg-white text-[#172a40]" : "bg-white/10 text-[#c9d4e1] hover:bg-white/20"}`}>
          {s.label}
          {i === index && !paused && !held && !still ? <span aria-hidden="true" key={index} className="hero-timer absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[#3987e5]" /> : null}
        </button>)}
      </div>
      {still ? null : <button type="button" aria-label={held ? "继续播放" : "暂停播放"} aria-pressed={held} onClick={() => setHeld(!held)}
        className="grid size-7 place-items-center rounded-full bg-white/10 text-caption hover:bg-white/20">{held ? "▶" : "❚❚"}</button>}
      <button type="button" aria-label="上一张" onClick={() => go(index - 1)} className="grid size-7 place-items-center rounded-full bg-white/10 text-body hover:bg-white/20">‹</button>
      <button type="button" aria-label="下一张" onClick={() => go(index + 1)} className="grid size-7 place-items-center rounded-full bg-white/10 text-body hover:bg-white/20">›</button>
    </div>
  </section>;
}
