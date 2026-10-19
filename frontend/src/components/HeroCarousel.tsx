import { useEffect, useState, type ReactNode } from "react";
import type { LibraryOverview } from "./LeaderConstruction";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const wan = (yuan: number) => (yuan / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 0 });

/**
 * One colour per library, kept on every slide (query 2026-1019 1458). Eight distinct hues is the most a
 * reader separates, so the seven largest libraries get the validated dark-surface categorical slots in
 * fixed order and the rest share a neutral “其他领域”. Checked with the dataviz palette validator on the
 * banner surface #1f3a57: all checks pass; magenta and green sit under 3:1, so every chart also names
 * its series in text (legend, labels, hover).
 */
const HUES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
const OTHER = "#8597ab";
type Group = { key: string; name: string; color: string; ids: string[] };

function groups(rows: LibraryOverview[]): Group[] {
  // Card B4: hues follow project count with ties broken by library id, computed once for all slides, so
  // re-sorting a slide (e.g. by funding) or equal counts never repaint a library. Binding hues to ids
  // alphabetically was tried and rejected: it put the palette's weakest pair (orange/yellow) on the two
  // largest libraries; by size, the two dominant ones get the clearest pair (blue/orange).
  const ranked = [...rows].sort((a, b) => b.projects - a.projects || a.corpus_id.localeCompare(b.corpus_id));
  const named = ranked.slice(0, HUES.length).map((r, i) => ({ key: r.corpus_id, name: short(r.name), color: HUES[i], ids: [r.corpus_id] }));
  const rest = ranked.slice(HUES.length);
  return rest.length ? [...named, { key: "other", name: `其他领域（${rest.map((r) => short(r.name)).join("、")}）`, color: OTHER, ids: rest.map((r) => r.corpus_id) }] : named;
}

/** Horizontal bars, one per library, value written at the end of each bar. */
function LibraryBars({ rows, value, label, colorOf }: { rows: LibraryOverview[]; value: (r: LibraryOverview) => number; label: (r: LibraryOverview) => string; colorOf: (id: string) => string }) {
  const max = Math.max(1, ...rows.map(value)) * 1.25;  // room for the value written after the longest bar
  // Sized to the slide's chart frame: eleven rows fit its height at the frame's width.
  const height = 13, gap = 3;
  return <svg role="img" aria-label="各资料库数值横条图" viewBox={`0 0 640 ${rows.length * (height + gap)}`} className="max-h-full w-full">
    {rows.map((r, i) => { const y = i * (height + gap); const w = Math.max(value(r) ? 3 : 0, value(r) / max * 420);
      return <g key={r.corpus_id}><title>{short(r.name)}：{label(r)}</title>
        <text x="118" y={y + 10.5} textAnchor="end" fontSize="11" fill="#dbe4ee">{short(r.name)}</text>
        <rect x="126" y={y} width={w} height={height} rx="3" fill={colorOf(r.corpus_id)} />
        <text x={126 + w + 6} y={y + 10.5} fontSize="11" fill="#c9d4e1">{label(r)}</text></g>; })}
  </svg>;
}

/** Stacked bars per year for the last ten years, one segment per library group, 2px gaps between segments. */
function YearStack({ rows, groups: gs, years, value, unit }: { rows: LibraryOverview[]; groups: Group[]; years: number[]; value: (r: LibraryOverview, year: number) => number; unit: (v: number) => string }) {
  const totals = years.map((y) => rows.reduce((n, r) => n + value(r, y), 0));
  const max = Math.max(1, ...totals);
  const W = 640, H = 150, base = 128, step = W / years.length, bar = Math.min(32, step * 0.55);
  return <figure className="m-0 w-full">
    <svg role="img" aria-label="近十年各领域堆叠柱状图" viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} stroke="#ffffff" strokeOpacity=".2" />
      {years.map((y, i) => { let top = base; const x = i * step + (step - bar) / 2;
        return <g key={y}>
          {gs.map((g) => { const v = g.ids.reduce((n, id) => n + value(rows.find((r) => r.corpus_id === id)!, y), 0);
            if (!v) return null; const h = Math.max(1.5, v / max * 100); top -= h;
            return <rect key={g.key} x={x} y={top} width={bar} height={Math.max(0.5, h - 2)} rx="2" fill={g.color}><title>{y} 年 · {g.name}：{unit(v)}</title></rect>; })}
          {totals[i] ? <text x={x + bar / 2} y={Math.max(10, top - 4)} textAnchor="middle" fontSize="10" fill="#e6edf5">{unit(totals[i]).replace(/ .*/, "")}</text> : null}
          <text x={x + bar / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#aebdd0">{y}</text>
        </g>; })}
    </svg>
    <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-[#c9d4e1]">
      {gs.map((g) => <span key={g.key} className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm" style={{ background: g.color }} />{g.name}</span>)}
    </figcaption>
  </figure>;
}

type Slide = { key: string; label: string; title: string; figure: string; note: string; chart: ReactNode };

/**
 * The banner of the leader's 首页 (query 2026-1019 1458, replacing 1613's guide to the top bar): four
 * slides of the research landscape — projects and known funding by library, then both by start year over
 * the last ten years, each library in its own colour. It turns every 7 seconds; hovering or focusing
 * pauses it; the labels, the arrows and the arrow keys switch by hand; reduced motion stops the turning.
 * Funding is the 直接经费 the reports state; how many projects state it is written on the slide.
 */
export function HeroCarousel({ rows }: { rows: LibraryOverview[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const gs = groups(rows);
  const colorOf = (id: string) => gs.find((g) => g.ids.includes(id))?.color ?? OTHER;
  const projects = rows.reduce((n, r) => n + r.projects, 0);
  const funded = rows.reduce((n, r) => n + r.funding.projects, 0);
  const fund = rows.reduce((n, r) => n + Number(r.funding.total_yuan), 0);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => thisYear - 9 + i);
  const inWindow = rows.reduce((n, r) => n + years.reduce((m, y) => m + (r.by_year?.[y] ?? 0), 0), 0);
  const byFunding = [...rows].sort((a, b) => Number(b.funding.total_yuan) - Number(a.funding.total_yuan));
  const slides: Slide[] = [
    { key: "projects", label: "领域项目分布", title: "领域项目分布", figure: `${projects} 个项目`,
      note: `${rows.length} 个领域资料库；项目在各库内按批准号去重，跨库合计未去重。`,
      chart: <LibraryBars rows={rows} value={(r) => r.projects} label={(r) => `${r.projects}`} colorOf={colorOf} /> },
    { key: "funding", label: "领域经费分布", title: "领域经费分布", figure: `${wan(fund)} 万元`,
      note: `已知直接经费合计；${funded} / ${projects} 个项目报告给出金额，其余未给出，不按零计。`,
      chart: <LibraryBars rows={byFunding} value={(r) => Number(r.funding.total_yuan)} label={(r) => r.funding.projects ? `${wan(Number(r.funding.total_yuan))} 万元 · ${r.funding.projects} 项` : "未给出"} colorOf={colorOf} /> },
    { key: "years", label: "年度项目分布", title: "年度项目分布", figure: `${inWindow} 个项目`,
      note: `${years[0]}–${years.at(-1)} 年按立项年份统计，颜色区分领域；柱顶为当年合计。`,
      chart: <YearStack rows={rows} groups={gs} years={years} value={(r, y) => r.by_year?.[y] ?? 0} unit={(v) => `${v} 个项目`} /> },
    { key: "year-funding", label: "年度项目经费分布", title: "年度项目经费分布", figure: `${wan(years.reduce((n, y) => n + rows.reduce((m, r) => m + (r.funding_by_year?.[y] ?? 0), 0), 0))} 万元`,
      note: `${years[0]}–${years.at(-1)} 年已知直接经费，按项目立项年份归入；只含给出金额的 ${funded} 个项目。`,
      chart: <YearStack rows={rows} groups={gs} years={years} value={(r, y) => r.funding_by_year?.[y] ?? 0} unit={(v) => `${wan(v)} 万元`} /> },
  ];
  const go = (next: number) => setIndex((next + slides.length) % slides.length);
  useEffect(() => {
    if (paused || still) return;
    const timer = window.setTimeout(() => go(index + 1), 7000);
    return () => window.clearTimeout(timer);
  }, [index, paused, still]);
  const slide = slides[index];

  return <section aria-roledescription="carousel" aria-label="首页导览" tabIndex={0}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false); }}
    onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); } }}
    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#172a40] via-[#1f3a57] to-[#2c5373] text-white outline-none focus-visible:ring-2 focus-visible:ring-[#9fb3c8]">
    <div key={slide.key} aria-roledescription="slide" aria-label={`${index + 1} / ${slides.length}：${slide.label}`} aria-live={paused ? "polite" : "off"}
      className="hero-slide relative grid min-h-[300px] items-center gap-6 px-6 pt-6 pb-16 sm:px-9 md:h-[300px] md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col justify-center">
        <p className="flex items-center gap-2 text-xs tracking-[0.16em] text-[#aebdd0]"><span className="tabular-nums tracking-normal text-[#7f93ab]">{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>研究版图</p>
        <h1 className="mt-2.5 text-[24px] leading-tight font-semibold tracking-wide">{slide.title}</h1>
        <p className="mt-3"><b className="text-[34px] leading-none font-semibold tabular-nums">{slide.figure.split(" ")[0]}</b><span className="ml-2 text-sm text-[#c9d4e1]">{slide.figure.split(" ").slice(1).join(" ")}</span></p>
        <p className="mt-3 max-w-[30em] text-[12.5px] leading-5 text-pretty text-[#aebdd0]">{slide.note}</p>
      </div>
      <div className="hidden h-[220px] items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 md:flex">{slide.chart}</div>
    </div>
    <div className="absolute inset-x-6 bottom-4 flex items-center gap-3 border-t border-white/10 pt-3 sm:inset-x-9">
      <div role="group" aria-label="切换导览" className="flex flex-1 flex-wrap gap-1.5">
        {slides.map((s, i) => <button key={s.key} type="button" aria-label={`第 ${i + 1} 张：${s.label}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${i === index ? "bg-white text-[#172a40]" : "bg-white/10 text-[#c9d4e1] hover:bg-white/20"}`}>{s.label}</button>)}
      </div>
      <button type="button" aria-label="上一张" onClick={() => go(index - 1)} className="grid size-7 place-items-center rounded-full bg-white/10 text-sm hover:bg-white/20">‹</button>
      <button type="button" aria-label="下一张" onClick={() => go(index + 1)} className="grid size-7 place-items-center rounded-full bg-white/10 text-sm hover:bg-white/20">›</button>
    </div>
  </section>;
}
