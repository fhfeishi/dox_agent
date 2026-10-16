import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { LibraryOverview } from "./LeaderConstruction";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const wan = (yuan: number) => (yuan / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 0 });

type Slide = { key: string; kicker: string; title: string; text: string; action?: [string, string]; visual: ReactNode };

/**
 * Domains as circles whose area follows their project count (a circle's radius grows with the square
 * root), laid out in rows from the largest; the two largest carry their names.
 */
function Constellation({ rows }: { rows: LibraryOverview[] }) {
  const most = Math.max(1, ...rows.map((r) => r.projects));
  const radius = (n: number) => 6 + 40 * Math.sqrt(n / most);
  let x = 0;
  const placed = rows.slice(0, 11).map((r, i) => {
    const rad = radius(r.projects);
    const cx = x + rad; x += rad * 2 + 8;
    return { r, rad, cx, cy: 56 + (i % 2 ? 12 : -10) };
  });
  const width = Math.max(1, x);
  return <figure className="m-0 w-full">
  <svg role="img" aria-label="各领域项目数：圆的面积与项目数成正比" viewBox={`-4 0 ${width + 8} 120`} className="h-[104px] w-full">
    {placed.map(({ r, rad, cx, cy }, i) => <g key={r.corpus_id}>
      <circle cx={cx} cy={cy} r={rad} fill="#ffffff" fillOpacity={i < 2 ? 0.2 : 0.1} stroke="#ffffff" strokeOpacity=".35" />
      {i < 2 ? <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill="#e6edf5">{r.projects}</text> : null}
      <title>{short(r.name)}：{r.projects} 个项目</title>
    </g>)}
  </svg>
  <figcaption className="mt-1 text-[11px] text-[#9fb0c4]">圆面积与项目数成正比 · 最大：{placed.slice(0, 2).map(({ r }) => short(r.name)).join("、")}</figcaption>
  </figure>;
}

/**
 * The banner of the leader's 首页 (query 2026-1016 1613): the research landscape first, then one
 * slide for each part of the top bar — 领域分析, 资料库, 工作台, 成果 — with what it is for and a way
 * in. It turns every 7 seconds; hovering or focusing it pauses; the dots, the arrows and the arrow keys
 * switch by hand. With reduced motion it does not turn by itself.
 */
export function HeroCarousel({ rows }: { rows: LibraryOverview[] }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const projects = rows.reduce((n, r) => n + r.projects, 0);
  const files = rows.reduce((n, r) => n + r.files, 0);
  const funded = rows.reduce((n, r) => n + r.funding.projects, 0);
  const fund = rows.reduce((n, r) => n + Number(r.funding.total_yuan), 0);
  const years = rows.flatMap((r) => r.start_years);
  const top = rows[0];
  const chip = "whitespace-nowrap rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs text-[#e6edf5]";
  const slides: Slide[] = [
    { key: "map", kicker: "研究版图", title: "从领域分布，看研究积累",
      text: `${rows.length} 个领域、${projects} 个项目，立项 ${years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "年份待核对"}；${funded} 个项目给出经费，合计 ${wan(fund)} 万元。`,
      visual: <Constellation rows={rows} /> },
    { key: "domains", kicker: "领域分析", title: "一个领域，一页看清", text: "场景与问题、技术谱系、年度资助与项目关系，同一页切换视角，证据在右侧打开。",
      action: ["打开领域分析", "/overview/domains"],
      visual: top ? <div className="w-full space-y-1.5">{(top.fields ?? []).slice(0, 4).map(([name, n]) =>
        <div key={name} className="flex items-center gap-2 text-xs text-[#dbe4ee]"><span className="w-28 truncate">{name}</span>
          <span className="h-1.5 flex-1 rounded-full bg-white/10"><span className="block h-full rounded-full bg-white/60" style={{ width: `${n / Math.max(1, top.projects) * 100}%` }} /></span>
          <span className="w-8 text-right tabular-nums">{n}</span></div>)}
        <p className="pt-1 text-[11px] text-[#9fb0c4]">{short(top.name)} · 各应用方向的项目数（共 {top.projects} 个）</p></div> : null },
    { key: "library", kicker: "资料库", title: "回到原文，有据可查", text: "按领域查阅项目资料，检索正文、预览原文，勾选几份资料即可直接对话。",
      action: ["浏览资料库", "/library"],
      visual: <div className="w-full"><p><b className="text-[40px] leading-none font-semibold tabular-nums text-white">{files}</b><span className="ml-2 text-sm text-[#c9d4e1]">份项目资料</span></p>
        <p className="mt-2 text-xs text-[#9fb0c4]">分属 {rows.length} 个领域资料库，可检索正文、预览原文</p></div> },
    { key: "work", kicker: "工作台", title: "提出问题，得到有出处的报告", text: "对话工作台、存量分析、资料审查与情报分析，都从库内资料出发，结论附原文依据。",
      action: ["进入存量分析", "/tasks"],
      visual: <div className="grid w-full grid-cols-2 gap-2">{["对话工作台", "存量分析", "资料审查", "情报分析"].map((t) =>
        <span key={t} className="rounded-lg border border-white/20 bg-white/[0.07] px-3 py-2.5 text-center text-[13px] text-[#e6edf5]">{t}</span>)}</div> },
    { key: "results", kicker: "成果", title: "所有报告，一处回看", text: "分析、审查与情报报告集中收录，可按一周至一年生成周期总结。",
      action: ["查看成果", "/results"],
      visual: <div className="w-full space-y-3">
        <div className="flex flex-nowrap justify-between gap-1.5">{["一周", "一个月", "一季度", "半年", "一年"].map((t) => <span key={t} className={chip}>{t}</span>)}</div>
        <p className="text-[11px] text-[#9fb0c4]">周期总结：按所选时间段汇总完成与进行中的工作</p></div> },
  ];
  const go = (next: number) => setIndex((next + slides.length) % slides.length);
  // Turn by itself unless paused or the reader prefers no motion; the timer restarts on every change.
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
    <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-10 size-80 rounded-full border-[46px] border-white/[0.04]" />
    <div key={slide.key} aria-roledescription="slide" aria-label={`${index + 1} / ${slides.length}：${slide.kicker}`} aria-live={paused ? "polite" : "off"}
      className="hero-slide relative grid min-h-[264px] items-center gap-8 px-6 pt-6 pb-16 sm:px-9 md:h-[264px] md:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col justify-center">
        <p className="flex items-center gap-2 text-xs tracking-[0.16em] text-[#aebdd0]"><span className="tabular-nums tracking-normal text-[#7f93ab]">{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>{slide.kicker}</p>
        <h1 className="mt-2.5 text-[26px] leading-tight font-semibold tracking-wide">{slide.title}</h1>
        <p className="mt-2.5 max-w-[46em] text-[13.5px] leading-6 text-pretty text-[#c9d4e1]">{slide.text}</p>
        {slide.action ? <div className="mt-4"><button type="button" onClick={() => navigate(slide.action![1])}
          className="rounded-lg bg-white px-4 py-1.5 text-[13px] font-medium text-[#172a40] hover:bg-[#e6edf5]">{slide.action[0]} →</button></div> : null}
      </div>
      {/* Every slide's picture sits in the same frame, so the layout does not shift between slides. */}
      <div className="hidden h-[156px] items-center rounded-xl border border-white/10 bg-white/[0.04] px-5 md:flex">{slide.visual}</div>
    </div>
    <div className="absolute inset-x-6 bottom-4 flex items-center gap-3 border-t border-white/10 pt-3 sm:inset-x-9">
      <div role="group" aria-label="切换导览" className="flex flex-1 flex-wrap gap-1.5">
        {slides.map((s, i) => <button key={s.key} type="button" aria-label={`第 ${i + 1} 张：${s.kicker}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${i === index ? "bg-white text-[#172a40]" : "bg-white/10 text-[#c9d4e1] hover:bg-white/20"}`}>{s.kicker}</button>)}
      </div>
      <button type="button" aria-label="上一张" onClick={() => go(index - 1)} className="grid size-7 place-items-center rounded-full bg-white/10 text-sm hover:bg-white/20">‹</button>
      <button type="button" aria-label="下一张" onClick={() => go(index + 1)} className="grid size-7 place-items-center rounded-full bg-white/10 text-sm hover:bg-white/20">›</button>
    </div>
  </section>;
}
