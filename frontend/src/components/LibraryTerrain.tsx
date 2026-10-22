import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryOverview } from "../api";
import { DIMENSIONS } from "../libraryQueries";
import {
  CaliberPop, MATURITY, quadOf, shortPct,
  type PopSpec, type QuadKey,
} from "./CaliberPop";
import { Hint } from "./Hint";
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
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  const [pop, setPop] = useState<{ spec: PopSpec; anchor: Element } | null>(null);
  const [preview, setPreview] = useState<LibraryOverview | null>(null);
  // From the 研究地形图 demo (query 2026-1022): a quadrant filter, a pinned comparison, a bridge to a
  // library sharing technology systems, and zoom. The wheel zooms at the pointer and a drag pans, as the
  // user asked; a drag never counts as a click on a library.
  const [quad, setQuad] = useState<QuadKey | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [bridge, setBridge] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setBridge(null); }, [chosen?.corpus_id]);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = node.getBoundingClientRect();
      const mx = ((event.clientX - box.left) / box.width) * W, my = ((event.clientY - box.top) / box.height) * H;
      setView((v) => { const k = Math.max(0.8, Math.min(5, v.k * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }; });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  const zoom = (factor: number) => setView((v) => {
    const k = Math.max(0.8, Math.min(5, v.k * factor));
    return { k, x: W / 2 - ((W / 2 - v.x) / v.k) * k, y: H / 2 - ((H / 2 - v.y) / v.k) * k };
  });
  const fitted = Math.abs(view.k - 1) < 0.01 && Math.abs(view.x) < 0.5 && Math.abs(view.y) < 0.5;

  const model = useMemo(() => build(rows), [rows]);
  const seats = useMemo(() => seatLabels(model.points), [model]);

  const openPop = (spec: PopSpec, anchor: Element) => {
    setPop((old) => (old && old.anchor === anchor && JSON.stringify(old.spec) === JSON.stringify(spec) ? null : { spec, anchor }));
  };
  const xTicks = [30, 100, 300, 1000].filter((v) => log10(v) >= model.domain.x0 && log10(v) <= model.domain.x1);
  const yTicks: number[] = [];
  for (let v = Math.ceil(model.domain.y0 * 2) / 2; v <= model.domain.y1 + 0.001; v += 0.5) yTicks.push(Math.round(v * 10) / 10);
  const hoverRow = hover ? model.points.find((p) => p.row.corpus_id === hover.id)?.row : undefined;
  const quadOccupied = (key: QuadKey) => rows.some((r) => quadOf(r, model.cutX) === key);
  const bridges = chosen ? bridgesOf(chosen, rows) : [];
  // The quadrants carry their own reading, so they are the only filter (query 2026-1022: no 全部 / 只看待补 buttons).
  const isDim = (row: LibraryOverview) => (quad !== null && quadOf(row, model.cutX) !== quad)
    || (bridge !== null && row.corpus_id !== bridge && row.corpus_id !== chosen?.corpus_id);
  const hoverPoint = hover ? model.points.find((p) => p.row.corpus_id === hover.id) : undefined;
  const pointOf = (id: string | null) => (id ? model.points.find((p) => p.row.corpus_id === id) : undefined);
  const basePoint = pointOf(base), chosenPoint = pointOf(chosen?.corpus_id ?? null), bridgePoint = pointOf(bridge);
  const pickQuad = (key: QuadKey) => setQuad((q) => (q === key ? null : key));

  // Its own container: the chart and the library panel sit side by side wherever it is placed.
  return <div className="@container overflow-hidden rounded-2xl border border-[var(--line-cool)] bg-[var(--canvas)]">
    {/* One fixed-height row (query 2026-1022): choosing another library changes what the panel says, never
        how tall the page is; the panel scrolls inside itself. */}
    <div className="terrain-body">
      <div ref={wrap} className="terrain-chart">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing" role="img"
          aria-label={`${rows.length} 个资料库按技术条目数与平均成熟度分布，圆大小代表覆盖项目数`}
          onPointerDown={(event) => { dragged.current = false; drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false }; }}
          onPointerMove={(event) => {
            const d = drag.current, node = svg.current;
            if (!d || !node) return;
            if (!d.moved && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 4) return;
            if (!d.moved) { d.moved = true; dragged.current = true; setHover(null); node.setPointerCapture(event.pointerId); }
            const unit = W / node.getBoundingClientRect().width;
            setView((v) => ({ ...v, x: d.vx + (event.clientX - d.x) * unit, y: d.vy + (event.clientY - d.y) * unit }));
          }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onClick={(event) => { if (!dragged.current && !(event.target as Element).closest(".terrain-hit, .terrain-quad")) { setQuad(null); setBridge(null); } }}
          onDoubleClick={(event) => { if (!(event.target as Element).closest(".terrain-hit, .terrain-quad")) { setQuad(null); setBridge(null); setView({ x: 0, y: 0, k: 1 }); } }}>
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
            <title>没有资料库既铺得开又沉得深</title>
            <text className="terrain-quad-empty" x={(model.px(model.cutX) + PLOT.right) / 2} y={(PLOT.top + model.py(2.5)) / 2 + 4} textAnchor="middle">量大且深 · 暂无</text>
          </g> : null}

          {([["tl", PLOT.left + 10, model.py(2.5) - 26, "小而精", "条目少 · 成熟高"],
            ["bl", PLOT.left + 10, PLOT.bottom - 6, "少且浅", "条目少 · 成熟低"],
            ["br", model.px(model.cutX) + 24, model.py(2.5) + 22, "铺得宽 · 沉不下去", "条目多 · 成熟低"],
            ["tr", model.px(model.cutX) + 24, PLOT.top + 20, "量大且深", "条目多 · 成熟高"]] as const).map(([key, x, y, title, sub]) =>
            quadOccupied(key) ? <g key={key} className="terrain-quad" role="button" tabIndex={0} aria-pressed={quad === key}
              opacity={quad === null || quad === key ? 1 : 0.35}
              onClick={() => { if (!dragged.current) pickQuad(key); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pickQuad(key); } }}>
              <title>{`${title}：${sub}。点一下只看这一区，再点还原`}</title>
              <text className="terrain-quad-label" x={x} y={key === "bl" ? y - 4 : y + 8} fontWeight="600">{title}</text>
            </g> : null)}

          {/* Axis names are the keywords: a click opens how the axis is counted. */}
          <text className="terrain-axis-title is-key" x={PLOT.right} y={PLOT.bottom + 36} textAnchor="end" role="button" tabIndex={0}
            onClick={(event) => openPop({ kind: "axis", axis: "x" }, event.currentTarget)}>技术条目数（对数）→</text>
          <text className="terrain-axis-title is-key" x={PLOT.left} y={PLOT.top - 18} role="button" tabIndex={0}
            onClick={(event) => openPop({ kind: "axis", axis: "y" }, event.currentTarget)}>平均成熟度 ↑</text>

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
                if (!box || drag.current?.moved) return;
                setHover({ id, left: event.clientX - box.left + 14, top: event.clientY - box.top + 14 });
              }}
              onMouseMove={(event) => {
                const box = wrap.current?.getBoundingClientRect();
                if (!box) return;
                const left = event.clientX - box.left + 14;
                setHover({ id, left: left + 240 > box.width ? left - 254 : left, top: event.clientY - box.top + 14 });
              }}
              onMouseLeave={() => setHover(null)}
              onClick={() => { if (dragged.current) return; setHover(null); onChoose(id); }}
              onDoubleClick={() => { if (dragged.current) return; setHover(null); onChoose(id); setPreview(point.row); }}
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

        {/* State and help sit on the chart as overlays, so nothing below moves. */}
        <div className="terrain-overlay">
          {quad ? <span className="terrain-state">只看「{QUAD_NAME[quad]}」<button type="button" onClick={() => setQuad(null)} aria-label="显示全部">×</button></span>
            : bridge && chosen ? <span className="terrain-state">{short(chosen.name)} × {short(rows.find((r) => r.corpus_id === bridge)?.name ?? "")}<button type="button" onClick={() => setBridge(null)} aria-label="取消连接">×</button></span>
            : null}
          <span className="flex-1" />
          <div className="terrain-zoom" role="group" aria-label="缩放">
          <button type="button" aria-label="缩小" onClick={() => zoom(1 / 1.3)} disabled={view.k <= 0.8}>−</button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, k: 1 })} title="回到全景">{fitted ? "全景" : `${Math.round(view.k * 100)}% · 复位`}</button>
          <button type="button" aria-label="放大" onClick={() => zoom(1.3)}>+</button>
          </div>
          <Hint align="end" text={<>圆面积 = 覆盖项目数。<button type="button" className="hint-link" onClick={(event) => openPop({ kind: "axis", axis: "area" }, event.currentTarget)}>怎么算</button></>}>○ 项目数</Hint>
          <Hint align="end" text={<>点一个圆：右侧看这个库<br />双击圆：预览资料库<br />点象限名：只看这一区<br />点空白：还原 · 双击空白：复位<br />拖动平移 · 滚轮缩放</>}>操作</Hint>
        </div>

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
        </div> : null}
      </div>

      <Detail row={chosen} pop={pop} setPop={setPop} onPreview={setPreview} onAnalyse={onAnalyse}
        base={rows.find((r) => r.corpus_id === base)} setBase={setBase} bridges={bridges} bridge={bridge} setBridge={setBridge} />
    </div>

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
  if (!row) return <aside className="terrain-panel"><p className="p-4 text-body text-[var(--steel)]">点图上一个库。</p></aside>;
  const total = Math.max(1, row.projects);
  const highShare = row.lineage.high_share ?? 0;
  const values = DIMENSIONS.map((d) => dimensionCoverage(row, d) / total);
  const toggle = (spec: PopSpec, anchor: Element) => {
    setPop(pop && pop.anchor === anchor && JSON.stringify(pop.spec) === JSON.stringify(spec) ? null : { spec, anchor });
  };
  const isBase = base?.corpus_id === row.corpus_id;
  const compare = base && !isBase ? base : undefined;

  /* Compact by design (query 2026-1022): a name, four figures, two small charts, the links; every
     explanation sits behind its keyword. The actions are pinned at the foot, the rest scrolls. */
  return <aside className="terrain-panel" aria-live="polite">
    <div className="terrain-panel-scroll">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-group font-semibold text-[var(--heading)]" title={short(row.name)}>{short(row.name)}</h3>
        <span className="shrink-0 text-caption text-[var(--muted-cool)]">{row.lineage.systems} 个体系</span>
      </div>

      <dl className="terrain-stats">
        <div><dt>项目</dt><dd>{fmt(row.projects)}</dd>{compare ? <small>{fmt(compare.projects)}</small> : null}</div>
        <div><dt>技术</dt><dd>{fmt(row.lineage.items)}</dd>{compare ? <small>{fmt(compare.lineage.items)}</small> : null}</div>
        <div><dt>平均成熟度</dt><dd>{(row.lineage.avg_maturity ?? 0).toFixed(2)}</dd>{compare ? <small>{(compare.lineage.avg_maturity ?? 0).toFixed(2)}</small> : null}</div>
        <div><dt><Hint text="成熟度 4–5 档（系统集成与场景试验、示范应用与转化）的技术条目占比">4 档以上</Hint></dt>
          <dd className={highShare >= 20 ? "is-ok" : "is-warn"}>{shortPct(highShare)}</dd>{compare ? <small>{shortPct(compare.lineage.high_share ?? 0)}</small> : null}</div>
      </dl>
      {compare ? <p className="terrain-vs">灰色小字为对比基准 {short(compare.name)}<button type="button" onClick={() => setBase(null)}>取消</button></p> : null}

      <div className="terrain-block">
        <button type="button" className="terrain-key" onClick={(event) => toggle({ kind: "maturity" }, event.currentTarget)}>成熟度分布</button>
        <MaturityBars row={row} />
      </div>

      <div className="terrain-block">
        <Hint text="项目材料里有没有归纳出场景、问题、技术、成果四类内容；低于 95% 标橙，点一项看口径。">四维覆盖</Hint>
        <div className="terrain-dims">
          {DIMENSIONS.map((dimension, index) => {
            const value = Math.min(1, values[index]);
            const low = value < 0.95;
            return <button key={dimension} type="button" onClick={(event) => toggle({ kind: "dimension", index }, event.currentTarget)}
              title={low ? `${Math.round(total - dimensionCoverage(row, dimension))} 个项目的材料里没有归纳出「${dimension}」` : undefined}>
              <span>{dimension}</span>
              <i><i style={{ width: `${value * 100}%`, background: low ? "var(--terrain-warn)" : `var(--dim-${["scene", "issue", "tech", "outcome"][index]})` }} /></i>
              <b className={low ? "is-warn" : ""}>{shortPct(value * 100)}</b>
            </button>;
          })}
        </div>
      </div>

      {bridges.length ? <div className="terrain-block">
        <Hint text="和这个库有同名技术体系的库；点一个，图上只亮这一对。">共用体系</Hint>
        <div className="terrain-chips">
          {bridges.slice(0, 4).map((b) => <button key={b.row.corpus_id} type="button" aria-pressed={bridge === b.row.corpus_id}
            title={`共用：${b.shared.join("、")}`} onClick={() => setBridge(bridge === b.row.corpus_id ? null : b.row.corpus_id)}>
            {short(b.row.name).replace(/^AI与/, "")}<i>{b.shared.length}</i></button>)}
        </div>
      </div> : null}
    </div>

    <div className="terrain-actions">
      <button type="button" className="primary" onClick={() => onPreview(row)}>预览资料库</button>
      {onAnalyse ? <button type="button" onClick={() => onAnalyse(row.corpus_id)} title="谱系、项目关系、年度分布">详细分析</button> : null}
      <button type="button" aria-pressed={isBase} onClick={() => setBase(isBase ? null : row.corpus_id)}
        title={isBase ? "取消对比基准" : "设为对比基准，再点另一个库，数字下方出现基准值"}>{isBase ? "基准 ✓" : "对比"}</button>
    </div>
  </aside>;
}
