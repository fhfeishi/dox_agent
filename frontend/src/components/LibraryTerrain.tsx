import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryOverview } from "../api";
import { DIMENSIONS } from "../libraryQueries";
import {
  CaliberPop, MATURITY, quadOf, shortPct,
  type PopSpec, type QuadKey, type TerrainTotals,
} from "./CaliberPop";
import { LibraryPreviewDrawer } from "./LibraryPreviewDrawer";

/**
 * 资料库概览, redrawn as an accumulation map (query 2026-1021).
 *
 *   x  log10 技术条目数   → how wide the library's technology record spreads
 *   y  mean maturity 0–5  → how far those items have travelled
 *   ○  area = covered projects
 *
 * Two axes: spreading and sinking. The banner above already ranks libraries by project count, so
 * repeating that here would say the same thing twice; maturity is what the banner never shows.
 *
 * Every value is counted from the same overview payload the rest of the page uses, including the
 * per-level spread the endpoint now returns. Nothing is a placeholder: a library without a lineage
 * is left out of the map rather than drawn at zero.
 */

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const QUAD_NAME: Record<QuadKey, string> = { tl: "小而精", bl: "少且浅", br: "铺得宽 · 沉不下去", tr: "量大且深" };

/** Libraries that share a technology system name with this one: a real overlap, not a suggestion. */
export function bridgesOf(row: LibraryOverview, rows: LibraryOverview[]) {
  const names = new Set((row.lineage.systems_detail ?? []).map((s) => s.name));
  return rows.filter((r) => r.corpus_id !== row.corpus_id)
    .map((r) => ({ row: r, shared: (r.lineage.systems_detail ?? []).map((s) => s.name).filter((n) => names.has(n)) }))
    .filter((b) => b.shared.length).sort((a, b) => b.shared.length - a.shared.length || b.row.projects - a.row.projects);
}
const fmt = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });

const W = 720;
const H = 434;
const PLOT = { left: 64, right: 700, top: 48, bottom: 374 };
const LEVELS = [0, 1, 2, 3, 4, 5];

type Point = { row: LibraryOverview; cx: number; cy: number; r: number; items: number; avg: number };

const log10 = (v: number) => Math.log(v) / Math.LN10;

/** How many projects the dimension speaks for: the count with content, not the fully-processed one. */
export const dimensionCoverage = (row: LibraryOverview, dimension: string) => (row.dimension_evidence ?? row.dimensions)[dimension] ?? 0;

/** Text width in the 12px label size: full width per CJK glyph, a little over half for Latin. */
const textWidth = (text: string) => [...text].reduce((width, ch) => width + (/[\u3400-\u9fff]/.test(ch) ? 12 : 6.8), 0);

/** The horizontal cut sits on the widest gap in item counts, rounded to the decade below it. */
function cutOf(sizes: number[]): number {
  const sorted = [...sizes].sort((a, b) => a - b);
  if (sorted.length < 2) return Math.max(1, sorted[0] ?? 100);
  let best = 0, at = -1;
  for (let i = 1; i < sorted.length; i += 1) {
    const ratio = sorted[i] / Math.max(1, sorted[i - 1]);
    if (ratio > best) { best = ratio; at = i; }
  }
  if (at < 1 || best < 2) return Math.max(1, Math.round(sorted[Math.floor(sorted.length / 2)]));
  return Math.max(10, 10 ** Math.round(log10(sorted[at - 1])));
}

function build(rows: LibraryOverview[]) {
  const live = rows.filter((r) => (r.lineage.items || 0) > 0);
  if (!live.length) {
    const nil = { x0: 1, x1: 3, y0: 0.5, y1: 3.5 };
    return { points: [] as Point[], cutX: 100, domain: nil, px: () => PLOT.left, py: () => PLOT.bottom };
  }
  const sizes = live.map((r) => r.lineage.items || 1);
  const avgs = live.map((r) => r.lineage.avg_maturity ?? 0);
  const projects = live.map((r) => Math.max(1, r.projects));
  const logs = sizes.map(log10);
  const domain = {
    // The axis is log10 of the item count, so the padding is added in log space, not to the counts.
    x0: Math.floor(Math.min(...logs) * 10) / 10 - 0.06,
    x1: Math.ceil(Math.max(...logs) * 10) / 10 + 0.06,
    // 2.5 must stay on the canvas: it is the only placement where the split between 算法验证 and
    // 原型样机 is visible for every library at once.
    y0: Math.min(2.3, Math.floor(Math.min(...avgs) * 2) / 2 - 0.15),
    y1: Math.max(2.9, Math.ceil(Math.max(...avgs) * 2) / 2 + 0.3),
  };
  const biggest = Math.max(...projects);
  const px = (items: number) => PLOT.left + (log10(items) - domain.x0) / (domain.x1 - domain.x0) * (PLOT.right - PLOT.left);
  const py = (avg: number) => PLOT.bottom - (avg - domain.y0) / (domain.y1 - domain.y0) * (PLOT.bottom - PLOT.top);
  const points: Point[] = live.map((row) => ({
    row, items: row.lineage.items, avg: row.lineage.avg_maturity ?? 0,
    cx: px(row.lineage.items), cy: py(row.lineage.avg_maturity ?? 0),
    r: 6.5 + Math.sqrt(Math.max(1, row.projects)) / Math.sqrt(biggest) * 11,
  }));
  return { points, cutX: cutOf(sizes), domain, px, py };
}

type Seat = { x: number; y: number; anchor: "start" | "middle" | "end" };

/** Labels take the cheapest free side, largest circle first: nine libraries sit within a few pixels
 * of each other, so a fixed four-position rule either stacks names or pushes them onto the axis. */
function seatLabels(points: Point[]) {
  const seats = new Map<string, Seat>();
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = points.map((p) => ({
    x0: p.cx - p.r - 6, y0: p.cy - p.r - 6, x1: p.cx + p.r + 6, y1: p.cy + p.r + 6,
  }));
  const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  [...points].sort((a, b) => b.r - a.r).forEach((p) => {
    const label = short(p.row.name);
    const width = textWidth(label);
    const boxOf = (x: number, y: number, anchor: Seat["anchor"]) => {
      const x0 = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
      return { x0, x1: x0 + width, y0: y - 11, y1: y + 3 };
    };
    const options: [number, number, Seat["anchor"]][] = [
      [p.cx + p.r + 10, p.cy + 4, "start"],
      [p.cx - p.r - 10, p.cy + 4, "end"],
      [p.cx, p.cy - p.r - 9, "middle"],
      [p.cx, p.cy + p.r + 16, "middle"],
      [p.cx + p.r + 10, p.cy - 11, "start"],
      [p.cx + p.r + 10, p.cy + 18, "start"],
      [p.cx - p.r - 10, p.cy - 11, "end"],
      [p.cx - p.r - 10, p.cy + 18, "end"],
    ];
    let best: Seat = { x: options[0][0], y: options[0][1], anchor: options[0][2] };
    let bestCost = Number.POSITIVE_INFINITY;
    for (const [x, y, anchor] of options) {
      // Keep the text inside the plot before measuring, so no name can land on the axis ticks.
      const raw = boxOf(x, y, anchor);
      const shift = raw.x0 < PLOT.left ? PLOT.left - raw.x0 : raw.x1 > PLOT.right ? PLOT.right - raw.x1 : 0;
      const box = boxOf(x + shift, y, anchor);
      const outside = box.y0 < PLOT.top + 2 || box.y1 > PLOT.bottom - 1 ? 500 : 0;
      const cost = outside + taken.reduce((sum, t) => sum + overlap(box, t), 0);
      if (cost < bestCost) { bestCost = cost; best = { x: x + shift, y, anchor }; }
      if (cost === 0) break;
    }
    seats.set(p.row.corpus_id, best);
    taken.push(boxOf(best.x, best.y, best.anchor));
  });
  return seats;
}

const needsWork = (row: LibraryOverview) => {
  const share = row.lineage.high_share ?? 0;
  const total = Math.max(1, row.projects);
  const least = Math.min(...DIMENSIONS.map((d) => dimensionCoverage(row, d) / total));
  return share < 20 || least < 0.95;
};

export function MaturityBars({ row, tall }: { row: LibraryOverview; tall?: boolean }) {
  const dist = row.lineage.maturity ?? [0, 0, 0, 0, 0, 0];
  const top = Math.max(1, ...dist);
  const total = Math.max(1, row.lineage.items || 0);
  return <>
    <div className="terrain-bars" style={{ height: tall ? 64 : 52 }}>
      {dist.map((count, level) => (
        <button key={level} type="button" data-level={level}
          className="terrain-bar" data-zero={count === 0}
          title={`${MATURITY[level].name} · ${fmt(count)} 条 · ${shortPct(count / total * 100)}`}
          style={{ height: count === 0 ? 2 : Math.max(4, Math.round(count / top * (tall ? 58 : 46))), background: count === 0 ? "var(--line-cool-soft)" : `var(--m-${level})`, animationDelay: `${level * 40}ms` }}
          aria-label={`${MATURITY[level].name} ${fmt(count)} 条`} />
      ))}
    </div>
    <div className="terrain-bar-axis mt-1 text-caption text-[var(--muted-cool-soft)]">
      {LEVELS.map((level) => <span key={level}>{level}</span>)}
    </div>
  </>;
}

export function LibraryTerrain({ rows, chosen, onChoose, onAnalyse }: {
  rows: LibraryOverview[]; chosen?: LibraryOverview; onChoose: (id: string) => void;
  /** 领域分析 offers the single-domain views from the panel; without it the panel only previews. */
  onAnalyse?: (id: string) => void;
}) {
  const [mode, setMode] = useState<"all" | "gap">("all");
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  const [pop, setPop] = useState<{ spec: PopSpec; anchor: Element } | null>(null);
  const [preview, setPreview] = useState<LibraryOverview | null>(null);
  // From the 研究地形图 demo (query 2026-1022): a quadrant filter, a pinned comparison, a bridge to a
  // library sharing technology systems, and zoom. Plain wheel keeps scrolling the page; Ctrl+wheel or
  // the buttons zoom, and dragging pans only once zoomed in.
  const [quad, setQuad] = useState<QuadKey | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [bridge, setBridge] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setBridge(null); }, [chosen?.corpus_id]);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const box = node.getBoundingClientRect();
      const mx = ((event.clientX - box.left) / box.width) * W, my = ((event.clientY - box.top) / box.height) * H;
      setView((v) => { const k = Math.max(1, Math.min(4, v.k * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
        return k === 1 ? { x: 0, y: 0, k } : { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }; });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  const zoom = (factor: number) => setView((v) => {
    const k = Math.max(1, Math.min(4, v.k * factor));
    return k === 1 ? { x: 0, y: 0, k } : { k, x: W / 2 - ((W / 2 - v.x) / v.k) * k, y: H / 2 - ((H / 2 - v.y) / v.k) * k };
  });

  const model = useMemo(() => build(rows), [rows]);
  const seats = useMemo(() => seatLabels(model.points), [model]);
  const totals = useMemo<TerrainTotals>(() => {
    const dist = rows.reduce<number[]>((acc, r) => {
      const own = r.lineage.maturity ?? [];
      return acc.map((n, i) => n + (own[i] ?? 0));
    }, [0, 0, 0, 0, 0, 0]);
    return {
      items: dist.reduce((a, b) => a + b, 0), dist, high: dist.slice(4).reduce((a, b) => a + b, 0),
      projects: rows.reduce((n, r) => n + r.projects, 0),
    };
  }, [rows]);

  const openPop = (spec: PopSpec, anchor: Element) => {
    setPop((old) => (old && old.anchor === anchor && JSON.stringify(old.spec) === JSON.stringify(spec) ? null : { spec, anchor }));
  };
  const xTicks = [30, 100, 300, 1000].filter((v) => log10(v) >= model.domain.x0 && log10(v) <= model.domain.x1);
  const yTicks: number[] = [];
  for (let v = Math.ceil(model.domain.y0 * 2) / 2; v <= model.domain.y1 + 0.001; v += 0.5) yTicks.push(Math.round(v * 10) / 10);
  const gapMode = mode === "gap";
  const hoverRow = hover ? model.points.find((p) => p.row.corpus_id === hover.id)?.row : undefined;
  const quadOccupied = (key: QuadKey) => rows.some((r) => quadOf(r, model.cutX) === key);
  const bridges = chosen ? bridgesOf(chosen, rows) : [];
  const isDim = (row: LibraryOverview) => (gapMode && !needsWork(row))
    || (quad !== null && quadOf(row, model.cutX) !== quad)
    || (bridge !== null && row.corpus_id !== bridge && row.corpus_id !== chosen?.corpus_id);
  const hoverPoint = hover ? model.points.find((p) => p.row.corpus_id === hover.id) : undefined;
  const pointOf = (id: string | null) => (id ? model.points.find((p) => p.row.corpus_id === id) : undefined);
  const basePoint = pointOf(base), chosenPoint = pointOf(chosen?.corpus_id ?? null), bridgePoint = pointOf(bridge);
  const pickQuad = (key: QuadKey) => setQuad((q) => (q === key ? null : key));

  // Its own container: the chart and the library panel sit side by side wherever it is placed.
  return <div className="@container overflow-hidden rounded-2xl border border-[var(--line-cool)] bg-[var(--canvas)]">
    <div className="flex flex-wrap items-start gap-3 border-b border-[var(--line-cool-soft)] px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-body font-semibold text-[var(--heading)]">资料库积累分布</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {([["x", "横轴", "技术条目数", "对数"], ["y", "纵轴", "平均成熟度", "0–5"], ["area", "圆面积", "覆盖项目数", ""]] as const).map(([axis, name, what, note]) => (
            <button key={axis} type="button"
              onClick={(event) => openPop({ kind: "axis", axis }, event.currentTarget)}
              className="inline-flex items-center gap-1 border-b border-dashed border-[var(--muted-cool-soft)] pb-px text-caption text-[var(--muted-cool)] transition-colors hover:border-[var(--terrain-dot-on)] hover:text-[var(--terrain-dot-on)]">
              {name} <b className="font-medium text-[var(--slate)]">{what}</b>
              {note ? <span className="text-[var(--muted-cool-soft)]">{note}</span> : null}
              <i className="grid size-3.5 place-items-center rounded-full bg-[var(--muted-cool-soft)] font-bold text-[var(--canvas)] not-italic" style={{ fontSize: 9 }}>i</i>
            </button>
          ))}
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setMode("all")} aria-pressed={!gapMode}
          className={`rounded-md border px-2.5 py-1 text-caption transition-colors ${gapMode ? "border-[var(--line-cool)] text-[var(--steel)] hover:border-[var(--line-cool-strong)]" : "border-[var(--terrain-dot-on)] bg-[var(--selected-cool)] font-medium text-[var(--terrain-dot-on)]"}`}>全部 {rows.length} 库</button>
        <button type="button" onClick={() => setMode("gap")} aria-pressed={gapMode}
          className={`rounded-md border px-2.5 py-1 text-caption transition-colors ${gapMode ? "border-[var(--terrain-warn)] bg-[var(--terrain-warn-soft)] font-medium text-[var(--terrain-warn-deep)]" : "border-[var(--line-cool)] text-[var(--steel)] hover:border-[var(--line-cool-strong)]"}`}>只看待补</button>
      </div>
    </div>

    <div className="grid items-stretch @3xl:grid-cols-[minmax(0,1fr)_336px]">
      <div ref={wrap} className="relative flex min-w-0 flex-col justify-center px-2 py-2">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={`block w-full ${view.k > 1 ? "cursor-grab active:cursor-grabbing" : ""}`} role="img"
          aria-label={`${rows.length} 个资料库按技术条目数与平均成熟度分布，圆大小代表覆盖项目数`}
          onPointerDown={(event) => { if (view.k > 1) drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }; }}
          onPointerMove={(event) => {
            const d = drag.current, node = svg.current;
            if (!d || !node) return;
            const unit = W / node.getBoundingClientRect().width;
            setView((v) => ({ ...v, x: d.vx + (event.clientX - d.x) * unit, y: d.vy + (event.clientY - d.y) * unit }));
          }}
          onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          <defs><clipPath id="terrain-clip"><rect x="0" y="0" width={W} height={H} /></clipPath></defs>
          <g clipPath="url(#terrain-clip)"><g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <rect x={PLOT.left} y={PLOT.top} width={PLOT.right - PLOT.left} height={PLOT.bottom - PLOT.top} fill="var(--terrain-plot)" />
          <rect x={PLOT.left} y={PLOT.top} width={model.px(model.cutX) - PLOT.left} height={model.py(2.5) - PLOT.top} fill="var(--terrain-empty)" />
          <rect x={PLOT.left} y={model.py(2.5)} width={model.px(model.cutX) - PLOT.left} height={PLOT.bottom - model.py(2.5)} fill="var(--terrain-shallow)" />

          {xTicks.map((value) => <g key={`x${value}`}>
            <line x1={model.px(value)} y1={PLOT.top} x2={model.px(value)} y2={PLOT.bottom} stroke="var(--terrain-grid)" strokeWidth=".7" />
            <text className="terrain-tick" x={model.px(value)} y={PLOT.bottom + 16} textAnchor="middle">{value}</text>
          </g>)}
          {yTicks.map((value) => <g key={`y${value}`}>
            <line x1={PLOT.left} y1={model.py(value)} x2={PLOT.right} y2={model.py(value)} stroke="var(--terrain-grid)" strokeWidth=".7" />
            <text className="terrain-tick" x={PLOT.left - 10} y={model.py(value) + 4} textAnchor="end">{value.toFixed(1)}</text>
          </g>)}

          <line x1={model.px(model.cutX)} y1={PLOT.top} x2={model.px(model.cutX)} y2={PLOT.bottom} stroke="var(--terrain-sep)" strokeWidth=".9" strokeDasharray="4 5" />
          <line x1={PLOT.left} y1={model.py(2.5)} x2={PLOT.right} y2={model.py(2.5)} stroke="var(--terrain-sep)" strokeWidth=".9" strokeDasharray="4 5" />

          {/* The empty quadrant is named once; the three occupied ones carry a clickable caption. */}
          {!quadOccupied("tr") ? <g className="terrain-quad" role="button" tabIndex={0}
            onClick={(event) => openPop({ kind: "quadrant", quad: "tr" }, event.currentTarget)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPop({ kind: "quadrant", quad: "tr" }, event.currentTarget); } }}>
            <rect x={model.px(model.cutX)} y={PLOT.top} width={PLOT.right - model.px(model.cutX)} height={model.py(2.5) - PLOT.top}
              fill="none" stroke="var(--line-cool-strong)" strokeDasharray="6 6" />
            <text className="terrain-quad-empty" x={(model.px(model.cutX) + PLOT.right) / 2} y={(PLOT.top + model.py(2.5)) / 2 - 2} textAnchor="middle">没有资料库</text>
            <text className="terrain-quad-empty" x={(model.px(model.cutX) + PLOT.right) / 2} y={(PLOT.top + model.py(2.5)) / 2 + 15} textAnchor="middle">既铺得开又沉得深</text>
          </g> : null}

          {([["tl", PLOT.left + 10, model.py(2.5) - 26, "小而精", "条目少 · 成熟高"],
            ["bl", PLOT.left + 10, PLOT.bottom - 6, "少且浅", "条目少 · 成熟低"],
            ["br", model.px(model.cutX) + 24, model.py(2.5) + 22, "铺得宽 · 沉不下去", "条目多 · 成熟低"],
            ["tr", model.px(model.cutX) + 24, PLOT.top + 20, "量大且深", "条目多 · 成熟高"]] as const).map(([key, x, y, title, sub]) =>
            quadOccupied(key) ? <g key={key} className="terrain-quad" role="button" tabIndex={0} aria-pressed={quad === key}
              opacity={quad === null || quad === key ? 1 : 0.35}
              onClick={() => pickQuad(key)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pickQuad(key); } }}>
              <text className="terrain-quad-label" x={x} y={y}>
                <tspan x={x} fontWeight="600">{title}</tspan>
                <tspan x={x} dy="15">{sub}</tspan>
              </text>
            </g> : null)}

          <text className="terrain-axis-title" x={PLOT.right} y={PLOT.bottom + 36} textAnchor="end">技术条目数（对数）→</text>
          <text className="terrain-axis-title" x={PLOT.left} y={PLOT.top - 18}>平均成熟度 ↑</text>

          {/* A pinned comparison or a bridge draws a dashed line between the two libraries. */}
          {[[basePoint, "var(--terrain-amber)"], [bridgePoint, "var(--terrain-halo)"]].map(([other, tone], index) =>
            other && chosenPoint && other !== chosenPoint ? <line key={index} className="terrain-link" x1={chosenPoint.cx} y1={chosenPoint.cy}
              x2={(other as Point).cx} y2={(other as Point).cy} style={{ stroke: tone as string }} /> : null)}
          {/* Crosshair: the hovered library read off both axes, as in the 研究地形图 demo. */}
          {hoverPoint ? <g className="terrain-cross" aria-hidden="true">
            <line x1={hoverPoint.cx} y1={hoverPoint.cy} x2={hoverPoint.cx} y2={PLOT.bottom} />
            <line x1={PLOT.left} y1={hoverPoint.cy} x2={hoverPoint.cx} y2={hoverPoint.cy} />
            <rect x={hoverPoint.cx - 30} y={PLOT.bottom - 18} width="60" height="16" rx="3" />
            <text x={hoverPoint.cx} y={PLOT.bottom - 6} textAnchor="middle">{fmt(hoverPoint.items)} 条</text>
            <rect x={PLOT.left + 3} y={hoverPoint.cy - 8} width="36" height="16" rx="3" />
            <text x={PLOT.left + 21} y={hoverPoint.cy + 4} textAnchor="middle">{hoverPoint.avg.toFixed(2)}</text>
          </g> : null}
          {model.points.map((point) => {
            const id = point.row.corpus_id;
            const on = id === chosen?.corpus_id;
            const dim = isDim(point.row);
            return <g key={id} className="terrain-hit" role="button" tabIndex={0}
              aria-label={`${short(point.row.name)}，${point.items} 条技术，平均成熟度 ${point.avg.toFixed(2)}`}
              onMouseEnter={(event) => {
                const box = wrap.current?.getBoundingClientRect();
                if (!box) return;
                setHover({ id, left: event.clientX - box.left + 14, top: event.clientY - box.top + 14 });
              }}
              onMouseMove={(event) => {
                const box = wrap.current?.getBoundingClientRect();
                if (!box) return;
                const left = event.clientX - box.left + 14;
                setHover({ id, left: left + 240 > box.width ? left - 254 : left, top: event.clientY - box.top + 14 });
              }}
              onMouseLeave={() => setHover(null)}
              onClick={() => { setHover(null); onChoose(id); }}
              onDoubleClick={() => { setHover(null); onChoose(id); setPreview(point.row); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onChoose(id); } }}>
              {on ? <circle cx={point.cx} cy={point.cy} r={point.r + 7} fill="var(--terrain-halo)" opacity={dim ? ".12" : ".24"} /> : null}
              {id === base && !on ? <circle cx={point.cx} cy={point.cy} r={point.r + 6} fill="none" stroke="var(--terrain-amber)" strokeWidth="2" strokeDasharray="3 3" /> : null}
              <circle className="terrain-dot" cx={point.cx} cy={point.cy} r={point.r}
                fill={on ? "var(--terrain-dot-on)" : "var(--terrain-dot)"} fillOpacity={dim ? ".26" : ".92"} />
            </g>;
          })}
          {model.points.map((point) => {
            const seat = seats.get(point.row.corpus_id);
            if (!seat) return null;
            const dim = isDim(point.row);
            return <text key={point.row.corpus_id} className="terrain-label" data-on={point.row.corpus_id === chosen?.corpus_id}
              x={seat.x} y={seat.y} textAnchor={seat.anchor} opacity={dim ? ".32" : "1"}>{short(point.row.name)}</text>;
          })}
          </g></g>
        </svg>

        <div className="terrain-zoom" role="group" aria-label="缩放">
          <button type="button" aria-label="缩小" onClick={() => zoom(1 / 1.3)} disabled={view.k <= 1}>−</button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, k: 1 })}>{view.k > 1 ? `${Math.round(view.k * 100)}%` : "全景"}</button>
          <button type="button" aria-label="放大" onClick={() => zoom(1.3)}>+</button>
        </div>
        <p className="terrain-hint" aria-live="polite">
          {quad ? <>已只看「{QUAD_NAME[quad]}」<button type="button" onClick={(event) => openPop({ kind: "quadrant", quad }, event.currentTarget)}>这类怎么看</button>
            <button type="button" onClick={() => setQuad(null)}>取消</button></>
            : bridge && chosen ? <>{short(chosen.name)} × {short(rows.find((r) => r.corpus_id === bridge)?.name ?? "")} 共用技术体系
              <button type="button" onClick={() => setBridge(null)}>取消</button></>
            : <>点象限只看该区 · 单击选库 · 双击预览 · Ctrl+滚轮缩放</>}
        </p>

        {hover && hoverRow ? <div className="terrain-tip" style={{ left: hover.left, top: hover.top }} aria-hidden="true">
          <b className="block text-caption font-semibold">{short(hoverRow.name)}</b>
          <span className="text-caption text-[var(--muted-cool-soft)]">技术条目</span> <b className="terrain-serif font-normal text-[var(--dim-tech)]">{fmt(hoverRow.lineage.items)}</b>
          <span className="text-caption text-[var(--muted-cool-soft)]"> · 覆盖项目</span> {hoverRow.projects}
          <br />
          <span className="text-caption text-[var(--muted-cool-soft)]">平均成熟度</span> <b className="terrain-serif font-normal text-[var(--dim-tech)]">{(hoverRow.lineage.avg_maturity ?? 0).toFixed(2)}</b>
          <span className="text-caption text-[var(--muted-cool-soft)]"> · 成熟 4 以上</span> {shortPct(hoverRow.lineage.high_share ?? 0)}
          <br />
          <span className="text-caption text-[var(--muted-cool-soft)]">技术体系</span> {hoverRow.lineage.systems} 个
          {(hoverRow.lineage.top ?? []).slice(0, 2).length ? <span className="terrain-tip-top">
            {(hoverRow.lineage.top ?? []).slice(0, 2).map((item) => <span key={item.name}>· {item.name.length > 18 ? `${item.name.slice(0, 17)}…` : item.name} <em>{item.maturity} 档</em></span>)}
          </span> : null}
          <span className="terrain-tip-hint">单击查看 · 双击预览</span>
        </div> : null}
      </div>

      <Detail row={chosen} pop={pop} setPop={setPop} onPreview={setPreview} onAnalyse={onAnalyse}
        base={rows.find((r) => r.corpus_id === base)} setBase={setBase} bridges={bridges} bridge={bridge} setBridge={setBridge} />
    </div>

    <Readout rows={rows} totals={totals} cutX={model.cutX} />

    <CaliberPop spec={pop?.spec ?? null} anchor={pop?.anchor ?? null} rows={rows} chosen={chosen}
      cutX={model.cutX} onClose={() => setPop(null)} />
    <LibraryPreviewDrawer row={preview} onClose={() => setPreview(null)} />
  </div>;
}

function Detail({ row, pop, setPop, onPreview, onAnalyse, base, setBase, bridges, bridge, setBridge }: {
  row?: LibraryOverview; pop: { spec: PopSpec; anchor: Element } | null;
  setPop: (value: { spec: PopSpec; anchor: Element } | null) => void;
  onPreview: (row: LibraryOverview) => void; onAnalyse?: (id: string) => void;
  base?: LibraryOverview; setBase: (id: string | null) => void;
  bridges: { row: LibraryOverview; shared: string[] }[]; bridge: string | null; setBridge: (id: string | null) => void;
}) {
  if (!row) return <aside className="border-t border-[var(--line-cool)] bg-[var(--terrain-panel)] px-4 py-8 text-body text-[var(--steel)] @3xl:border-t-0 @3xl:border-l">
    选择一个资料库，查看它的积累厚度。
  </aside>;
  const total = Math.max(1, row.projects);
  const highShare = row.lineage.high_share ?? 0;
  const share = row.lineage.high_maturity ?? 0;
  const values = DIMENSIONS.map((d) => dimensionCoverage(row, d) / total);
  const least = Math.min(...values);
  const leastIndex = values.indexOf(least);
  const notes: string[] = [];
  if (highShare < 10) notes.push(`${fmt(row.lineage.items)} 条技术里仅 ${fmt(share)} 条（${shortPct(highShare)}）进了场景试验或转化`);
  if (least < 0.95) notes.push(`${Math.round(total - dimensionCoverage(row, DIMENSIONS[leastIndex]))} 个项目的材料里没有归纳出「${DIMENSIONS[leastIndex]}」，覆盖 ${shortPct(least * 100)}`);

  const toggle = (spec: PopSpec, anchor: Element) => {
    setPop(pop && pop.anchor === anchor && JSON.stringify(pop.spec) === JSON.stringify(spec) ? null : { spec, anchor });
  };

  return <aside className="flex min-w-0 flex-col border-t border-[var(--line-cool)] bg-[var(--terrain-panel)] px-4 pb-4 pt-3.5 @3xl:border-t-0 @3xl:border-l" aria-live="polite">
    <div className="flex items-baseline justify-between gap-2">
      <p className="text-caption tracking-[1.5px] text-[var(--muted-cool)]">CURRENT LIBRARY</p>
      <span className="text-caption text-[var(--muted-cool-soft)]">{row.lineage.systems} 个体系</span>
    </div>
    <h3 className="mt-1 truncate text-group font-semibold leading-tight text-[var(--heading)]" title={short(row.name)}>{short(row.name)}</h3>

    {/* 规模先行：项目与资料是领导最先问的两个数，用衬线大字放在库名正下方。 */}
    <div className="mt-2.5 grid grid-cols-2 border-y border-[var(--line-cool)]">
      <div className="py-2">
        <b className="terrain-serif block text-page font-normal leading-none text-[var(--heading)]">{fmt(row.projects)}</b>
        <span className="mt-1 block text-caption text-[var(--muted-cool)]">个项目</span>
      </div>
      <div className="border-l border-[var(--line-cool-soft)] py-2 pl-3">
        <b className="terrain-serif block text-page font-normal leading-none text-[var(--heading)]">{fmt(row.files)}</b>
        <span className="mt-1 block text-caption text-[var(--muted-cool)]">份资料</span>
      </div>
    </div>

    {/* 积累：与上面的规模块同构——数字在上、标签在下，两行两列，读起来是一条基准线。 */}
    <div className="mt-3 grid grid-cols-2">
      <div>
        <b className="terrain-serif block text-stat font-normal leading-none text-[var(--heading)]">{fmt(row.lineage.items)}</b>
        <span className="mt-1 block text-caption text-[var(--muted-cool)]">条技术</span>
      </div>
      <div className="pl-3 text-right">
        <b className={`terrain-serif block text-page font-normal leading-none ${highShare >= 20 ? "text-[var(--terrain-dot-on)]" : "text-[var(--terrain-warn)]"}`}>{shortPct(highShare)}</b>
        <span className="mt-1.5 block text-caption text-[var(--muted-cool)]">成熟 4 以上</span>
      </div>
    </div>

    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-caption text-[var(--slate)]">成熟度分布</span>
        <button type="button" onClick={(event) => toggle({ kind: "maturity" }, event.currentTarget)}
          className="rounded-full border border-[var(--line-cool)] bg-[var(--canvas)] px-2 py-px text-caption text-[var(--muted-cool)] transition-colors hover:border-[var(--terrain-dot-on)] hover:text-[var(--terrain-dot-on)]">0–5 怎么分?</button>
      </div>
      <MaturityBars row={row} />
    </div>

    {/* 四维改成同一基线的四条：环要读弧度，横条直接比长度，哪一维短一眼就看出来。 */}
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-caption text-[var(--slate)]">四维覆盖</span>
        <span className="text-caption text-[var(--muted-cool-soft)]">点一项看口径</span>
      </div>
      <div className="space-y-0.5">
        {DIMENSIONS.map((dimension, index) => {
          const value = Math.min(1, values[index]);
          const low = value < 0.95;
          return <button key={dimension} type="button" onClick={(event) => toggle({ kind: "dimension", index }, event.currentTarget)}
            className="grid w-full grid-cols-[2.7em_minmax(0,1fr)_3.1em] items-center gap-2 rounded py-1.5 text-left transition-colors hover:bg-[var(--selected-cool)]">
            <span className="text-caption text-[var(--slate)]">{dimension}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-[var(--track)]">
              <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value * 100}%`, background: `var(--dim-${["scene", "issue", "tech", "outcome"][index]})` }} />
              {low ? <i className="terrain-gap absolute inset-y-0" style={{ left: `${value * 100}%`, right: 0 }} /> : null}
            </span>
            <b className={`terrain-serif text-right text-caption font-normal ${low ? "text-[var(--terrain-warn)]" : "text-[var(--slate)]"}`}>{shortPct(value * 100)}</b>
          </button>;
        })}
      </div>
    </div>

    {/* 对比：先把一个库设为基准，再点别的库，两组数字并排，图上连一条虚线。 */}
    {base && base.corpus_id !== row.corpus_id ? <div className="terrain-compare">
      <p><span>对比基准</span><b>{short(base.name)}</b><button type="button" onClick={() => setBase(null)}>取消</button></p>
      <table><tbody>
        {([["项目", row.projects, base.projects], ["技术条目", row.lineage.items, base.lineage.items],
          ["平均成熟度", (row.lineage.avg_maturity ?? 0).toFixed(2), (base.lineage.avg_maturity ?? 0).toFixed(2)],
          ["成熟 4 以上", shortPct(row.lineage.high_share ?? 0), shortPct(base.lineage.high_share ?? 0)]] as const).map(([label, a, b]) =>
          <tr key={label}><th>{label}</th><td>{typeof a === "number" ? fmt(a) : a}</td><td>{typeof b === "number" ? fmt(b) : b}</td></tr>)}
      </tbody></table>
    </div> : null}

    {bridges.length ? <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-caption text-[var(--slate)]">可以怎样连接</span>
        <span className="text-caption text-[var(--muted-cool-soft)]">共用同名技术体系</span>
      </div>
      {bridges.slice(0, 3).map((b) => <button key={b.row.corpus_id} type="button" aria-pressed={bridge === b.row.corpus_id}
        onClick={() => setBridge(bridge === b.row.corpus_id ? null : b.row.corpus_id)} className="terrain-bridge">
        <span>{short(b.row.name)} <i>{b.shared.join("、")}</i></span><b aria-hidden="true">{bridge === b.row.corpus_id ? "✓" : "↗"}</b>
      </button>)}
    </div> : null}

    {notes.slice(0, 2).map((note) => <p key={note} className="mt-2 flex gap-1.5 rounded-r border-l-2 border-[var(--terrain-warn)] bg-[var(--terrain-warn-soft)] px-2 py-1.5 text-caption leading-5 text-[var(--terrain-warn-deep)]">
      <span aria-hidden="true">⚑</span><span>{note}</span>
    </p>)}

    {/* 吸底，但与上面的诊断条至少留 12px：内容短时贴底，内容长时不被挤住。 */}
    <div className="mt-auto pt-3">
      <button type="button" onClick={() => setBase(base?.corpus_id === row.corpus_id ? null : row.corpus_id)}
        className="mb-1.5 w-full rounded-lg border border-dashed border-[var(--line-cool-strong)] px-3 py-1.5 text-caption text-[var(--slate)] transition-colors hover:border-[var(--terrain-amber)] hover:text-[var(--terrain-amber-ink)]">
        {base?.corpus_id === row.corpus_id ? "取消对比基准" : base ? `改为以「${short(row.name)}」为对比基准` : "设为对比基准，再点另一个库对比"}
      </button>
      <button type="button" onClick={() => onPreview(row)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--terrain-dot-on)] px-3 py-2 text-caption text-[var(--canvas)] transition-[background,transform] hover:-translate-y-px hover:bg-[var(--primary-pressed)]">
        预览资料库 <i className="not-italic" aria-hidden="true">→</i>
      </button>
      {onAnalyse ? <button type="button" onClick={() => onAnalyse(row.corpus_id)}
        className="mt-1.5 w-full rounded-lg border border-[var(--line-cool)] px-3 py-1.5 text-caption text-[var(--slate)] transition-colors hover:border-[var(--terrain-dot-on)] hover:text-[var(--terrain-dot-on)]">
        看该领域详细分析：谱系、项目关系、年度 →
      </button> : null}
    </div>
  </aside>;
}

function Readout({ rows, totals, cutX }: { rows: LibraryOverview[]; totals: TerrainTotals; cutX: number }) {
  const items = Math.max(1, totals.items);
  const shallow = (totals.dist[0] + totals.dist[1] + totals.dist[2]) / items;
  const proto = totals.dist[3] / items;
  const applied = (totals.dist[4] + totals.dist[5]) / items;
  const biggest = [...rows].sort((a, b) => b.lineage.items - a.lineage.items).slice(0, 2);
  const bulk = biggest.reduce((n, r) => n + r.lineage.items, 0);
  const bulkHigh = biggest.reduce((n, r) => n + (r.lineage.high_maturity ?? 0), 0);
  const worst = [...rows].filter((r) => r.lineage.items >= cutX).sort((a, b) => (a.lineage.high_share ?? 0) - (b.lineage.high_share ?? 0))[0]
    ?? [...rows].sort((a, b) => (a.lineage.high_share ?? 0) - (b.lineage.high_share ?? 0))[0];
  const worstLow = worst ? ((worst.lineage.maturity ?? [0, 0, 0, 0, 0, 0]).slice(0, 2).reduce((a, b) => a + b, 0)) / Math.max(1, worst.lineage.items) : 0;
  const worstShares = worst ? DIMENSIONS.map((d) => dimensionCoverage(worst, d) / Math.max(1, worst.projects)) : [1];
  const worstDim = Math.min(...worstShares);
  const worstDimName = worst ? DIMENSIONS[worstShares.indexOf(worstDim)] : "";

  return <div className="grid border-t border-[var(--line-cool)] bg-[var(--terrain-panel)] @3xl:grid-cols-3">
    <div className="border-t border-[var(--line-cool-soft)] px-4 py-2.5 first:border-t-0 @3xl:border-t-0 @3xl:border-l @3xl:first:border-l-0">
      <p className="mb-1 text-caption tracking-wider text-[var(--muted-cool-soft)]">全库成熟度</p>
      <p className="text-caption leading-5 text-[var(--slate)]">
        {fmt(totals.items)} 条技术中，<em className="not-italic text-[var(--terrain-warn)]">{shortPct(shallow * 100)} 停在算法验证及以下</em>，
        {shortPct(proto * 100)} 做出原型样机，<b className="terrain-serif font-normal text-[var(--heading)]">{shortPct(applied * 100)}</b>（{fmt(totals.high)} 条）进入真实场景或转化。
      </p>
    </div>
    <div className="border-t border-[var(--line-cool-soft)] px-4 py-2.5 @3xl:border-t-0 @3xl:border-l">
      <p className="mb-1 text-caption tracking-wider text-[var(--muted-cool-soft)]">体量与沉淀</p>
      <p className="text-caption leading-5 text-[var(--slate)]">
        {biggest.map((r) => short(r.name)).join(" + ")} 占 <b className="terrain-serif font-normal text-[var(--heading)]">{shortPct(bulk / items * 100)}</b> 技术条目，
        高成熟条目占 {shortPct(totals.high ? bulkHigh / totals.high * 100 : 0)}；
        {rows.some((r) => (r.lineage.items ?? 0) >= cutX && (r.lineage.avg_maturity ?? 0) >= 2.5)
          ? "其中已有库同时做到量大与深。"
          : <em className="not-italic text-[var(--terrain-warn)]">没有库同时做到量大与深</em>}。
      </p>
    </div>
    {worst ? <div className="border-t border-[var(--line-cool-soft)] px-4 py-2.5 @3xl:border-t-0 @3xl:border-l">
      <p className="mb-1 text-caption tracking-wider text-[var(--muted-cool-soft)]">最需注意</p>
      <p className="text-caption leading-5 text-[var(--slate)]">
        {short(worst.name)} <b className="terrain-serif font-normal text-[var(--heading)]">{fmt(worst.lineage.items)}</b> 条技术，
        <em className="not-italic text-[var(--terrain-warn)]">{shortPct(worstLow * 100)} 停在理论与未判定</em>；
        {worstDim < 0.95 ? `${worstDimName}维仅 ${shortPct(worstDim * 100)} 的项目有归纳。` : "四维覆盖齐全。"}
      </p>
    </div> : null}
  </div>;
}
