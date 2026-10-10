import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { tierOf } from "../briefing";
import { CATEGORY_COLORS, type Lineage, type LineageCategory, withBlanks } from "../projects";

/**
 * 五级技术谱系 - 路网形式 (query 2026-1010 1642, after `.logsdev/tech_landscape_graph.html`): the
 * library is the hub, R3 systems, R4 directions, R5 themes and R6 project techniques sit on rings
 * around it, each branch is a road whose width follows its size. Deeper rings appear as you zoom
 * in; labels run along the radius and are dropped where they would collide. Hovering lights the
 * road from the hub; clicking a node selects it in the five-level lineage above and zooms to its
 * children. Only the lineage's own data is drawn; nothing is added to fill gaps.
 */

type Node = {
  key: string; name: string; level: 2 | 3 | 4 | 5 | 6; parent: number; x: number; y: number; deg: number;
  color: string; items: number; projects: number; size: number; stage?: string;
  /** A knowledge node no project is classified under: "gap" when none touches it, "emerging" when a few do. */
  blank?: "gap" | "emerging"; covered?: number;
};
type Edge = { child: number; d: string; width: number };

const RING: Record<number, number> = { 3: 300, 4: 430, 5: 560, 6: 680 };
const LEAF_STAGGER = 55;
const GAP = { 3: 2.4, 4: 0.8, 5: 0.25 };
const FONT: Record<number, number> = { 2: 13.5, 3: 12.5, 4: 11.5, 5: 10.5, 6: 10 };
const WEIGHT: Record<number, number> = { 2: 600, 3: 600, 4: 500, 5: 400, 6: 400 };
const FILL: Record<number, string> = { 2: "#3A2F9E", 3: "#1f2937", 4: "#2b3138", 5: "#525b65", 6: "#6e7883" };
/** Zoom (relative to the fitted view) from which each ring is drawn, and the view for each level button. */
const LOD_AT: [number, 3 | 4 | 5 | 6][] = [[3.2, 6], [2.2, 5], [1.3, 4], [0, 3]];
const LEVEL_VIEW: Record<number, { rel: number; r: number }> = { 3: { rel: 1, r: 0 }, 4: { rel: 1.7, r: 380 }, 5: { rel: 2.7, r: 500 }, 6: { rel: 3.8, r: 650 } };
const HIT = 12, LABELS = 340, MARGIN = 160, MAX_LEAF_CHARS = 14;
const SELECTED = "#4f46e5", UNPLACED = "#9aa3b2", BLANK_SLOTS = 4;

const polar = (r: number, deg: number) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)] as const;
const pt = (r: number, deg: number) => polar(r, deg).map((v) => v.toFixed(1)).join(",");
const textWidth = (text: string, size: number) => [...text].reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) > 255 ? size : size * 0.56), 8);
const roadWidth = (items: number) => Math.min(8, 0.9 + Math.sqrt(items) * 0.28);
const levelOf = (rel: number) => LOD_AT.find(([at]) => rel >= at)![1];
const clampRel = (rel: number) => Math.max(0.6, Math.min(16, rel));
const label = (node: Node) => (node.level === 6 && node.name.length > MAX_LEAF_CHARS ? node.name.slice(0, MAX_LEAF_CHARS - 1) + "…" : node.name);

function build(source: Lineage) {
  const lineage = withBlanks(source);
  const projectsOf = (ids: string[]) => new Set(ids.map((id) => lineage.items[id]?.project_id).filter(Boolean)).size;
  const all = Object.keys(lineage.items);
  const nodes: Node[] = [{ key: "root", name: lineage.branch.replace(/^自然科学基金-/, ""), level: 2, parent: -1, x: 0, y: 0, deg: -90,
    color: "#6558DA", items: all.length, projects: projectsOf(all), size: 22 }];
  const edges: Edge[] = [];
  // Real systems first, then blank ones, then the unplaced bucket.
  const rank = (c: LineageCategory) => (c.unplaced ? 2 : c.blank ? 1 : 0);
  const cats = lineage.categories.map((category, c) => ({ category, c })).sort((a, b) => rank(a.category) - rank(b.category));
  type Theme = LineageCategory["children"][number]["themes"][number];
  type Direction = LineageCategory["children"][number];
  // Angular room: one slot per project technique; a blank node with nothing under it still gets a few.
  const themeSlots = (t: Theme) => (t.blank ? BLANK_SLOTS : t.items.length);
  const directionSlots = (d: Direction) => d.themes.reduce((n, t) => n + themeSlots(t), 0) || (d.blank ? BLANK_SLOTS : 0);
  const categorySlots = (c: LineageCategory) => c.children.reduce((n, d) => n + directionSlots(d), 0) || (c.blank ? BLANK_SLOTS : 0);
  const slots = cats.reduce((n, { category }) => n + categorySlots(category), 0);
  const directions = cats.reduce((n, { category }) => n + category.children.length, 0);
  const themes = cats.reduce((n, { category }) => n + category.children.reduce((m, d) => m + d.themes.length, 0), 0);
  const per = Math.max(0.05, (360 - cats.length * GAP[3] - directions * GAP[4] - themes * GAP[5]) / Math.max(1, slots));
  const itemsOf = (list: Theme[]) => list.flatMap((t) => t.items);
  const blankOf = (n: { blank?: boolean; covered?: number }) => (n.blank ? { blank: n.covered ? "emerging" as const : "gap" as const, covered: n.covered ?? 0 } : {});
  const add = (node: Omit<Node, "x" | "y">, ring: number) => {
    const [x, y] = polar(ring, node.deg);
    const index = nodes.push({ ...node, x, y }) - 1;
    const parent = nodes[node.parent];
    const pr = Math.hypot(parent.x, parent.y), mid = (pr + ring) / 2;
    const d = node.parent === 0 ? `M0,0 C0,0 ${pt(ring / 2, node.deg)} ${pt(ring, node.deg)}`
      : `M${pt(pr, parent.deg)} C${pt(mid, parent.deg)} ${pt(mid, node.deg)} ${pt(ring, node.deg)}`;
    edges.push({ child: index, d, width: node.blank ? 1.4 : roadWidth(node.items) });
    return index;
  };
  const real = { 3: 0, 4: 0, 5: 0, 6: 0 }, blanks = { gap: 0, emerging: 0 };
  let angle = -90, leafIndex = 0;
  for (const { category, c } of cats) {
    angle += GAP[3] / 2;
    const color = category.unplaced ? UNPLACED : CATEGORY_COLORS[c % CATEGORY_COLORS.length];
    const catItems = itemsOf(category.children.flatMap((d) => d.themes));
    const catThemes = category.children.reduce((n, d) => n + d.themes.length, 0);
    const span = categorySlots(category) * per + category.children.length * GAP[4] + catThemes * GAP[5];
    const ci = add({ key: `c:${c}`, name: category.name, level: 3, parent: 0, color, items: catItems.length, projects: projectsOf(catItems),
      deg: angle + span / 2, size: 7 + Math.min(7, Math.sqrt(projectsOf(catItems)) * 0.45), ...blankOf(category) }, RING[3]);
    if (!category.children.length) angle += span;
    category.children.forEach((direction, d) => {
      angle += GAP[4] / 2;
      const dItems = itemsOf(direction.themes);
      const dSpan = directionSlots(direction) * per + direction.themes.length * GAP[5];
      const di = add({ key: `d:${c}:${d}`, name: direction.name, level: 4, parent: ci, color, items: dItems.length, projects: projectsOf(dItems),
        deg: angle + dSpan / 2, size: 4.5 + Math.min(4, Math.sqrt(projectsOf(dItems)) * 0.3), ...blankOf(direction) }, RING[4]);
      if (!direction.themes.length) angle += dSpan;
      direction.themes.forEach((theme, t) => {
        angle += GAP[5] / 2;
        add({ key: `t:${c}:${d}:${t}`, name: theme.name, level: 5, parent: di, color, items: theme.items.length, projects: projectsOf(theme.items),
          deg: angle + themeSlots(theme) * per / 2, size: 3 + Math.min(3, Math.sqrt(projectsOf(theme.items)) * 0.25), ...blankOf(theme) }, RING[5]);
        const ti = nodes.length - 1;
        if (theme.blank) angle += themeSlots(theme) * per;
        for (const id of theme.items) {
          const item = lineage.items[id];
          // Leaves alternate between three radii so neighbouring labels have room.
          add({ key: `i:${id}`, name: item?.name ?? id, level: 6, parent: ti, deg: angle + per / 2, color, items: 1, projects: 1, size: 2.2,
            stage: item ? tierOf(item.maturity).label : undefined }, RING[6] + (leafIndex % 3) * LEAF_STAGGER);
          angle += per; leafIndex += 1; real[6] += 1;
        }
        angle += GAP[5] / 2;
      });
      angle += GAP[4] / 2;
    });
    angle += GAP[3] / 2;
  }
  for (const n of nodes) {
    if (n.blank) blanks[n.blank] += 1;
    else if ((n.level === 3 || n.level === 4 || n.level === 5) && n.color !== UNPLACED) real[n.level] += 1;
  }
  return { nodes, edges, counts: real, blanks };
}

/** Roads in world units with a soft casing; redrawn only when the visible ring or the lit road changes. */
const Roads = memo(function Roads({ nodes, edges, level, lit }: { nodes: Node[]; edges: Edge[]; level: number; lit: Set<number> | null }) {
  return <>
    <g>{[RING[3], RING[4], RING[5], RING[6], RING[6] + LEAF_STAGGER, RING[6] + 2 * LEAF_STAGGER].map((r, i) =>
      <circle key={r} r={r} fill="none" stroke={i % 2 ? "rgba(20,30,50,.045)" : "rgba(20,30,50,.08)"} strokeDasharray="2 7" vectorEffect="non-scaling-stroke" />)}</g>
    {[false, true].map((fill) => <g key={String(fill)}>{edges.map((edge) => {
      const node = nodes[edge.child];
      if (node.level > level) return null;
      // Gaps are dashed grey roads without casing; emerging nodes keep their colour, faded.
      if (!fill && node.blank) return null;
      const gap = node.blank === "gap";
      return <path key={edge.child} d={edge.d} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        stroke={!fill ? "rgba(22,30,44,.11)" : gap ? "#c3c9d1" : node.color} strokeWidth={fill ? edge.width : edge.width + 2.2}
        strokeDasharray={gap ? "5 4" : undefined}
        opacity={lit && !lit.has(edge.child) ? 0.08 : node.blank === "emerging" ? 0.5 : 1} style={{ transition: "opacity .2s" }} />;
    })}</g>)}
  </>;
});

export function LineageRoadmap({ lineage, title, selected, onSelect }: { lineage: Lineage; title: string; selected: string; onSelect: (key: string) => void }) {
  const { nodes, edges, counts, blanks } = useMemo(() => build(lineage), [lineage]);
  const indexOf = useMemo(() => new Map(nodes.map((n, i) => [n.key, i])), [nodes]);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ rel: 1, cx: 0, cy: 0 });
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [large, setLarge] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean; node: number } | null>(null);
  const anim = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [large]);

  const base = 0.9 * Math.min(size.w, size.h) / (2 * (RING[3] + 26));
  const k = base * view.rel;
  const tx = size.w / 2 - view.cx * k, ty = size.h / 2 - view.cy * k;
  const level = levelOf(view.rel);

  const animTo = useCallback((rel: number, cx: number, cy: number) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current, start = performance.now();
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 430), e = ease(p);
      setView({ rel: from.rel + (rel - from.rel) * e, cx: from.cx + (cx - from.cx) * e, cy: from.cy + (cy - from.cy) * e });
      if (p < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  /** Zoom so the node's children ring is in view, centred between the node and its children. */
  const drill = useCallback((i: number) => {
    const node = nodes[i];
    setAnchor(i === 0 ? null : i);
    if (node.level === 2) return animTo(1, 0, 0);
    if (node.level === 6) return animTo(Math.max(viewRef.current.rel, LEVEL_VIEW[6].rel), node.x, node.y);
    const [cx, cy] = polar(LEVEL_VIEW[node.level + 1].r, node.deg);
    animTo(LEVEL_VIEW[node.level + 1].rel, cx, cy);
  }, [nodes, animTo]);

  // The five-level lineage above and this map share one selection: follow a choice made there.
  const followed = useRef(selected);
  useEffect(() => {
    if (followed.current === selected) return;
    followed.current = selected;
    const i = indexOf.get(selected);
    if (i !== undefined) drill(i);
  }, [selected, indexOf, drill]);
  const choose = (i: number) => { followed.current = nodes[i].key; onSelect(nodes[i].key); drill(i); };

  const zoomAt = useCallback((factor: number, ax?: number, ay?: number) => {
    cancelAnimationFrame(anim.current);
    setView((v) => {
      const k1 = base * v.rel, px = ax ?? size.w / 2, py = ay ?? size.h / 2;
      const wx = v.cx + (px - size.w / 2) / k1, wy = v.cy + (py - size.h / 2) / k1;
      const rel = clampRel(v.rel * factor), k2 = base * rel;
      return { rel, cx: wx - (px - size.w / 2) / k2, cy: wy - (py - size.h / 2) / k2 };
    });
  }, [base, size]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, large]);
  useEffect(() => {
    if (!large) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLarge(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [large]);

  const chainOf = useCallback((i: number) => { const s = new Set<number>(); for (let j = i; j >= 0; j = nodes[j].parent) s.add(j); return s; }, [nodes]);
  const hoverIndex = hover?.i ?? -1;
  const lit = useMemo(() => (hoverIndex >= 0 ? chainOf(hoverIndex) : null), [hoverIndex, chainOf]);
  const chosen = indexOf.get(selected);

  // Nodes and labels are drawn in screen space at a fixed size: cull outside the window, then
  // place labels greedily (upper levels and larger branches first), skipping any that collide.
  const shown: { i: number; sx: number; sy: number }[] = [];
  nodes.forEach((n, i) => {
    if (n.level > level) return;
    const sx = tx + n.x * k, sy = ty + n.y * k;
    if (sx < -MARGIN || sx > size.w + MARGIN || sy < -MARGIN || sy > size.h + MARGIN) return;
    shown.push({ i, sx, sy });
  });
  const labelled = new Set<number>();
  const overlap = (a: number[], b: number[]) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  const obstacles = shown.map(({ i, sx, sy }) => ({ i, box: [sx - nodes[i].size - 2, sy - nodes[i].size - 2, sx + nodes[i].size + 2, sy + nodes[i].size + 2] }));
  const placed: number[][] = [];
  for (const { i, sx, sy } of shown.filter(({ i }) => i !== 0).sort((a, b) => nodes[a.i].level - nodes[b.i].level || nodes[b.i].items - nodes[a.i].items).slice(0, LABELS)) {
    const n = nodes[i], fs = FONT[n.level], rad = n.deg * Math.PI / 180, sign = n.level === 3 ? -1 : 1;
    const dx = sign * Math.cos(rad), dy = sign * Math.sin(rad), off = n.size + (n.level === 3 ? 9 : 6), need = textWidth(label(n), fs);
    const ax = sx + dx * off, ay = sy + dy * off, bx = ax + dx * need, by = ay + dy * need, h = fs * 0.62 + 2;
    const xs = [ax - dy * h, ax + dy * h, bx - dy * h, bx + dy * h], ys = [ay + dx * h, ay - dx * h, by + dx * h, by - dx * h];
    const rect = [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1];
    if (obstacles.some((o) => o.i !== i && overlap(rect, o.box)) || placed.some((b) => overlap(rect, b))) continue;
    placed.push(rect); labelled.add(i);
  }

  const crumbAt = anchor ?? (chosen !== undefined && chosen > 0 ? chosen : null);
  const crumb = crumbAt !== null && view.rel >= 1.3 ? [...chainOf(crumbAt)].reverse() : [];
  const hovered = hover ? nodes[hover.i] : null;
  const card = "rounded-xl border border-black/10 bg-white/95 shadow-[0_3px_16px_rgba(20,30,60,.07)] backdrop-blur";
  const button = (on: boolean) => `rounded-lg px-3 py-1.5 text-xs ${on ? "bg-[#534AB7] font-medium text-white" : "text-[#57606a] hover:bg-[#eef0f5] hover:text-[#1f2328]"}`;
  const toLevel = (lv: 3 | 4 | 5 | 6) => {
    if (lv === 3) { setAnchor(null); return animTo(1, 0, 0); }
    const from = anchor ?? (chosen !== undefined && chosen > 0 ? chosen : -1);
    const deg = from > 0 ? nodes[from].deg : [...nodes].filter((n) => n.level === 3).sort((a, b) => b.items - a.items)[0]?.deg ?? -90;
    const [cx, cy] = polar(LEVEL_VIEW[lv].r, deg);
    animTo(LEVEL_VIEW[lv].rel, cx, cy);
  };

  return <div className={large ? "fixed inset-3 z-[80] rounded-xl bg-[#f4f5f8] shadow-2xl" : "relative"}>
    <div ref={box} role="region" aria-label="五级技术谱系路网图"
      className={`relative touch-none select-none overflow-hidden rounded-xl border border-[var(--hairline)] bg-[#f4f5f8] ${large ? "h-full" : "h-[max(560px,calc(100vh-160px))]"} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as Element).closest("[data-hud]")) return;
        e.preventDefault();
        cancelAnimationFrame(anim.current);
        const g = (e.target as Element).closest("[data-node]");
        drag.current = { x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, moved: false, node: g ? Number(g.getAttribute("data-node")) : -1 };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // A press on a node tolerates more jitter before it becomes a drag.
        if (!d.moved && Math.hypot(e.clientX - d.ox, e.clientY - d.oy) > (d.node >= 0 ? 9 : 5)) {
          d.moved = true; setDragging(true); setHover(null); e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (!d.moved) return;
        const k1 = base * viewRef.current.rel, dx = e.clientX - d.x, dy = e.clientY - d.y;
        d.x = e.clientX; d.y = e.clientY;
        setView((v) => ({ ...v, cx: v.cx - dx / k1, cy: v.cy - dy / k1 }));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null; setDragging(false);
        if (d && !d.moved && d.node >= 0) choose(d.node);
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
      onDoubleClick={(e) => { if (!(e.target as Element).closest("[data-node],[data-hud]")) animTo(clampRel(view.rel / 2.4), view.cx, view.cy); }}>
      <svg width={size.w} height={size.h} className="block" role="img" aria-label="五级技术谱系路网形式">
        <defs>
          <radialGradient id="roadmap-hub" cx="36%" cy="28%" r="84%">
            <stop offset="0%" stopColor="#A99EF5" /><stop offset="46%" stopColor="#6558DA" /><stop offset="100%" stopColor="#382C99" />
          </radialGradient>
          <radialGradient id="roadmap-halo" cx="50%" cy="50%" r="50%">
            <stop offset="52%" stopColor="rgba(101,88,218,0)" /><stop offset="100%" stopColor="rgba(101,88,218,.30)" />
          </radialGradient>
        </defs>
        <g transform={`translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${k.toFixed(4)})`}>
          <Roads nodes={nodes} edges={edges} level={level} lit={lit} />
        </g>
        {/* Deeper levels first, so a larger node's hit area is on top; labels never take the click. */}
        {[...shown].sort((a, b) => nodes[b.i].level - nodes[a.i].level).map(({ i, sx, sy }) => {
          const n = nodes[i], on = i === chosen, lighted = lit?.has(i) ?? false;
          const events = { "data-node": i, onMouseEnter: (e: React.MouseEvent) => { if (!drag.current?.moved) setHover({ i, x: e.clientX, y: e.clientY }); },
            onMouseLeave: () => setHover(null), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") choose(i); } };
          if (n.level === 2) return <g key={n.key} {...events} transform={`translate(${sx.toFixed(1)},${sy.toFixed(1)})`} className="cursor-pointer"
            role="button" tabIndex={0} aria-label={`R2：${n.name}`}>
            <circle r={n.size + 18} fill="url(#roadmap-halo)" />
            <circle r={n.size + 7} fill="none" stroke="#B9B0F2" strokeWidth={1.2} strokeDasharray="2.5 5" />
            <circle r={n.size} fill="url(#roadmap-hub)" stroke={on ? SELECTED : "#fff"} strokeWidth={on ? 3 : 2.4} />
            <circle r={n.size * 0.74} fill="none" stroke="rgba(255,255,255,.45)" />
            <text y={n.size + 22} textAnchor="middle" fontSize={FONT[2]} fontWeight={600} fill={FILL[2]} stroke="#fff" strokeWidth={3.8} paintOrder="stroke" pointerEvents="none">{n.name}</text>
          </g>;
          // Labels run outward along the radius (systems inward), flipped on the left half to stay upright.
          const flip = Math.cos(n.deg * Math.PI / 180) < 0, inward = n.level === 3, off = n.size + (inward ? 9 : 6);
          return <g key={n.key} {...events} transform={`translate(${sx.toFixed(1)},${sy.toFixed(1)}) rotate(${(flip ? n.deg + 180 : n.deg).toFixed(2)})`}
            className="cursor-pointer" opacity={lit && !lighted ? 0.15 : 1} role="button" tabIndex={n.level <= 4 ? 0 : -1} aria-label={`R${n.level}：${n.name}`}>
            <circle r={Math.max(n.size, HIT)} fill="transparent" />
            {n.blank === "gap" ? <circle r={n.size + (on ? 3 : 0)} fill="#fff" stroke={on ? SELECTED : "#b6bec8"} strokeWidth={1.5} strokeDasharray="2.2 2.2" />
              : <circle r={n.size + (on ? 3 : 0)} fill={n.color} fillOpacity={n.blank ? 0.36 : 1} stroke={on ? SELECTED : n.blank ? n.color : "#fff"} strokeWidth={on ? 2.5 : 1.2} />}
            {labelled.has(i) || on || lighted ? <text x={inward === flip ? off : -off} textAnchor={inward === flip ? "start" : "end"} dominantBaseline="central"
              fontSize={FONT[n.level]} fontWeight={on ? 700 : WEIGHT[n.level]} fill={on ? SELECTED : lighted ? "#1f2328" : n.blank ? "#8b949e" : FILL[n.level]}
              stroke="#fff" strokeWidth={2.8} strokeLinejoin="round" paintOrder="stroke" pointerEvents="none">{label(n)}</text> : null}
          </g>;
        })}
      </svg>

      <div data-hud className={`${card} absolute left-3 top-3 max-w-[340px] px-4 py-3`}>
        <p className="text-[14px] font-semibold">{title} · 路网</p>
        <p className="mt-0.5 text-[11.5px] leading-5 text-[#8b949e]">{nodes[0].projects} 个项目 · {nodes[0].items} 条技术<br />
          R3 {counts[3]} / R4 {counts[4]} / R5 {counts[5]} / R6 {counts[6]}</p>
        {blanks.gap + blanks.emerging ? <p className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] text-[#57606a]">
          <span className="flex items-center gap-1.5 rounded-md border border-black/10 px-2 py-0.5"><i className="size-2 rounded-full bg-[#57606a]" />本库已有</span>
          <span className="flex items-center gap-1.5 rounded-md border border-black/10 px-2 py-0.5"><i className="size-2 rounded-full bg-[#57606a] opacity-40" />萌芽 <b>{blanks.emerging}</b></span>
          <span className="flex items-center gap-1.5 rounded-md border border-black/10 px-2 py-0.5"><i className="size-2 rounded-full border border-dashed border-[#9AA2AC]" />空白 <b>{blanks.gap}</b></span>
        </p> : null}
      </div>
      <div data-hud className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className={`${card} flex gap-0.5 p-1`} role="group" aria-label="显示到哪一级">
          {([3, 4, 5, 6] as const).map((lv) => <button key={lv} type="button" aria-pressed={level === lv} className={button(level === lv)} onClick={() => toLevel(lv)}>R{lv}</button>)}
        </div>
        <div className={`${card} flex gap-0.5 p-1`}>
          <button type="button" aria-label="放大" title="放大" className={button(false)} onClick={() => zoomAt(1.6)}>＋</button>
          <button type="button" aria-label="缩小" title="缩小" className={button(false)} onClick={() => zoomAt(1 / 1.6)}>－</button>
          <button type="button" title="回到全貌" className={button(false)} onClick={() => { setAnchor(null); animTo(1, 0, 0); }}>复位</button>
          <button type="button" aria-label={large ? "退出全屏" : "全屏查看"} title={large ? "退出全屏（Esc）" : "全屏查看"} className={button(false)} onClick={() => setLarge(!large)}>{large ? "✕" : "⛶"}</button>
        </div>
      </div>
      {crumb.length > 1 ? <nav data-hud aria-label="路网位置" className={`${card} absolute left-1/2 top-3 hidden max-w-[40%] -translate-x-1/2 truncate px-4 py-2 text-[11.5px] xl:block`}>
        {crumb.map((j, x) => <span key={j}>{x ? <span className="mx-1 text-[#ced3da]">›</span> : null}
          {x < crumb.length - 1 ? <button type="button" className="text-[#534AB7] hover:underline" onClick={() => choose(j)}>{nodes[j].name}</button>
            : <b className="font-medium">{nodes[j].name}</b>}</span>)}
      </nav> : null}
      <div data-hud className={`${card} absolute bottom-3 left-3 hidden max-w-[420px] px-4 py-3 sm:block`}>
        <p className="mb-1.5 text-[10.5px] font-medium tracking-wider text-[#8b949e]">R3（点击定位）</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">{nodes.map((n, i) => n.level === 3 ? <button key={n.key} type="button"
          className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11.5px] text-[#57606a] hover:bg-[#f1f2f6] hover:text-[#1f2328]" onClick={() => choose(i)}>
          <i className={`size-2.5 shrink-0 rounded-[3px] ${n.blank ? "border border-dashed border-[#9AA2AC]" : ""}`} style={{ background: n.blank ? undefined : n.color }} />
          <span className="truncate">{n.name}</span>
          <em className="ml-auto not-italic tabular-nums text-[#8b949e]">{n.blank ? (n.blank === "gap" ? "空白" : "萌芽") : n.projects}</em></button> : null)}</div>
      </div>
      <p className="pointer-events-none absolute bottom-3 right-3 hidden text-right text-[11px] leading-5 text-[#8b949e] sm:block">滚轮缩放 · 拖动平移 · 双击空白退回<br />悬停看路径 · 点击在上方谱系中查看</p>
      {hovered && hover ? <div className="pointer-events-none fixed z-[90] max-w-[300px] rounded-lg bg-[rgba(26,30,38,.95)] px-3 py-2 text-[11.5px] leading-5 text-white shadow-xl"
        style={{ left: Math.min(hover.x + 16, window.innerWidth - 310), top: hover.y + 16 }}>
        <b className="font-semibold">{hovered.name}</b>
        <span className="block text-[#c3c9d4]">R{hovered.level} · {hovered.blank === "gap" ? "空白：本库项目未涉及（依据领域知识补充）"
          : hovered.blank ? `萌芽：约 ${hovered.covered} 个项目零散涉及（依据领域知识补充）`
          : hovered.level === 6 ? `报告所述阶段：${hovered.stage ?? "未判定"}` : `${hovered.projects} 个项目 · ${hovered.items} 条技术`}</span>
      </div> : null}
    </div>
  </div>;
}
