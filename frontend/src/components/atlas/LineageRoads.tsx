import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { domainTreeQuery, maturityVar, MATURITY_NAMES, type DomainsOverview, type DomainTree, type TreeProject } from "../../domains";
import { libraryOverviewQuery } from "../../libraryQueries";
import { libraryColor } from "../../libraryColors";
import { useLayout } from "../../layout";
import { Hint } from "../Hint";
import { SlideOver } from "../SlideOver";
import { usePanZoom } from "./usePanZoom";
import { PanZoomControls } from "./PanZoomControls";
import { Button } from "../ui";

/**
 * 02 技术谱系总览 as a radial road map (query 2026-1022 1606): 人工智能 at the centre, then each library,
 * its technology systems, research directions, themes and finally the projects, one ring further out
 * per level. A click grows a node's children out of it, a second click folds only that branch back. Roads are as wide as the technology they carry and take their library's colour (the
 * same hues as the 首页 banner); a node's fill is its mean maturity. Hovering lights the road back to
 * the centre; the path bar above names where you are and opens its details on the right.
 *
 * Nodes open independently. A blank-space double click explicitly enables/disables canvas input;
 * node clicks never enable wheel capture. A separate large viewport shares expansion and detail
 * routes while preserving the embedded camera and page position.
 */

type Kind = "root" | "library" | "system" | "direction" | "theme" | "project" | "more";
type Node = {
  id: string; parent: string | null; kind: Kind; name: string; plain: string; items: number; maturity: number | null;
  library: string; children: Node[]; expandable: boolean; project?: TreeProject; hidden?: TreeProject[]; unplaced?: boolean;
};
const PROJECTS_SHOWN = 12;
// Outer labels are cut to this many characters; the full name is in the hover card and the path bar.
const LABEL_CHARS = 10;
const short = (name: string) => name.replace(/^(自然科学基金-)?AI与/, "");

function build(data: DomainsOverview, trees: Map<string, DomainTree>, open: Set<string>, full: Set<string>): Node {
  const root: Node = { id: "root", parent: null, kind: "root", name: "人工智能", plain: "", items: data.totals.items, maturity: null,
    library: "", children: [], expandable: false };
  for (const domain of data.domains) {
    const lib: Node = { id: domain.id, parent: "root", kind: "library", name: short(domain.name), plain: "", items: domain.items,
      maturity: domain.maturity, library: domain.id, children: [], expandable: domain.systems.length > 0 };
    root.children.push(lib);
    if (!open.has(lib.id)) continue;
    const tree = trees.get(domain.id);
    for (const system of tree?.systems ?? domain.systems.map((s) => ({ ...s, directions: [] }))) {
      const sid = `${lib.id}/${system.name}`;
      const sys: Node = { id: sid, parent: lib.id, kind: "system", name: system.name, plain: system.plain, items: system.items,
        maturity: system.maturity, library: domain.id, children: [], expandable: true, unplaced: "unplaced" in system ? Boolean(system.unplaced) : false };
      lib.children.push(sys);
      if (!open.has(sid)) continue;
      for (const direction of system.directions) {
        const did = `${sid}/${direction.name}`;
        const dir: Node = { id: did, parent: sid, kind: "direction", name: direction.name, plain: direction.plain, items: direction.items,
          maturity: direction.maturity, library: domain.id, children: [], expandable: direction.themes.length > 0 };
        sys.children.push(dir);
        if (!open.has(did)) continue;
        for (const theme of direction.themes) {
          const tid = `${did}/${theme.name}`;
          const th: Node = { id: tid, parent: did, kind: "theme", name: theme.name, plain: theme.plain, items: theme.items,
            maturity: theme.maturity, library: domain.id, children: [], expandable: theme.projects.length > 0 };
          dir.children.push(th);
          if (!open.has(tid)) continue;
          // A theme shows its first projects; its 另 N 个 node opens the rest in place (query 2026-1022 1706).
          const all = full.has(tid);
          for (const project of all ? theme.projects : theme.projects.slice(0, PROJECTS_SHOWN)) {
            th.children.push({ id: `${tid}/${project.id}`, parent: tid, kind: "project", name: project.title, plain: "", items: 1,
              maturity: project.maturity || null, library: domain.id, children: [], expandable: false, project });
          }
          if (!all && theme.projects.length > PROJECTS_SHOWN) {
            th.children.push({ id: `${tid}/+`, parent: tid, kind: "more", name: `另 ${theme.projects.length - PROJECTS_SHOWN} 个项目，点开`, plain: "",
              items: 1, maturity: null, library: domain.id, children: [], expandable: true, hidden: theme.projects.slice(PROJECTS_SHOWN) });
          }
        }
      }
    }
  }
  return root;
}

type Placed = { node: Node; x: number; y: number; angle: number; r: number; span: number };
const DEPTH: Record<Kind, number> = { root: 0, library: 1, system: 2, direction: 3, theme: 4, project: 5, more: 5 };
// Screen pixels: from the centre to the libraries, and from the end of a name to its children's ring.
const FIRST_RING = 170, ROAD = 56;

/** Drawn radius of a node (map units): the centre, project dots, or by technology count. */
function nodeRadius(n: Node, maxItems: number) {
  return n.kind === "root" ? 34 : n.kind === "project" || n.kind === "more" ? 4.5 : 5 + Math.sqrt(n.items / maxItems) * 22;
}
const textWidth = (text: string, size: number) => [...text].reduce((w, c) => w + (c.charCodeAt(0) < 128 ? 0.58 : 1), 0) * size;
/** An open node keeps its whole name; a leaf is cut to LABEL_CHARS (hover card and path bar show it whole). */
const nameOf = (n: Node) => n.children.length || n.name.length <= LABEL_CHARS ? n.name : `${n.name.slice(0, LABEL_CHARS - 1)}…`;
const nameSize = (n: Node, font: number) => (n.kind === "library" ? font * 1.05 : font);

/**
 * Ring radii by depth, in screen pixels at zoom 1. Every name runs outwards along its spoke, and a
 * ring starts where the longest name of the open nodes on the ring inside it ends, plus a road: an
 * open branch continues after its parent's last character. `push` moves every ring further out.
 */
function ringRadii(root: Node, font: number, maxItems: number, push: number) {
  const rings = [0, FIRST_RING + push];
  for (let level = root.children, d = 1; ; d++) {
    const open = level.filter((n) => n.children.length);
    if (!open.length) return rings;
    rings[d + 1] = rings[d] + ROAD + Math.max(...open.map((n) => nodeRadius(n, maxItems) + 6 + textWidth(nameOf(n), nameSize(n, font))));
    level = open.flatMap((n) => n.children);
  }
}

/** The arc a subtree's names need: one line of text over its radius per shown name. */
function need(n: Node, rings: number[], line: number): number {
  const own = n.kind === "root" ? 0 : line / rings[DEPTH[n.kind]];
  return Math.max(own, n.children.reduce((s, c) => s + need(c, rings, line), 0));
}

/**
 * Radial layout: a branch's arc is the sum of its names' needs, scaled so the whole tree fills the
 * circle, so each name gets the same clearance from its neighbours whichever branches are open.
 */
function place(root: Node, rings: number[], line: number) {
  const out = new Map<string, Placed>();
  const walk = (n: Node, from: number, to: number) => {
    const angle = (from + to) / 2, r = rings[DEPTH[n.kind]];
    out.set(n.id, { node: n, angle, r, span: to - from, x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    let at = from;
    const total = need(n, rings, line);
    for (const child of n.children) {
      const span = (to - from) * need(child, rings, line) / total;
      walk(child, at, at + span);
      at += span;
    }
  };
  walk(root, -Math.PI / 2, Math.PI * 1.5);
  return out;
}

/**
 * Spreads outwards rather than shrinking or hiding (query 2026-10-26): the map keeps one screen
 * scale, so opening a branch never makes what is already there smaller. Rings move further out
 * until the names' arcs fit the circle and every name can be placed apart; the frame then grows to
 * hold the drawing. Selection does not take part, so a click never moves the map.
 */
function arrange(root: Node, font: number, maxItems: number) {
  const line = font * 1.3;
  let count = 0;
  const walk = (n: Node) => { count++; n.children.forEach(walk); };
  walk(root);
  let push = 0, rings = ringRadii(root, font, maxItems, 0);
  for (let i = 0; i < 80 && need(root, rings, line) > 2 * Math.PI * 0.92; i++) rings = ringRadii(root, font, maxItems, (push += 16));
  let layout = place(root, rings, line);
  for (let i = 0; i < 30 && fitLabels(layout, maxItems, font, new Set(), "").size < count - 1; i++) {
    rings = ringRadii(root, font, maxItems, (push += 16));
    layout = place(root, rings, line);
  }
  return { rings, layout };
}

/** The part of the map a layout draws on, names included. */
function extent(layout: Map<string, Placed>, maxItems: number, font: number) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of layout.values()) {
    const n = p.node, r = nodeRadius(n, maxItems);
    const reach = n.kind === "root" ? 0 : r + 6 + textWidth(nameOf(n), nameSize(n, font));
    const tx = p.x + Math.cos(p.angle) * reach, ty = p.y + Math.sin(p.angle) * reach;
    left = Math.min(left, p.x - r - font, tx); right = Math.max(right, p.x + r + font, tx);
    top = Math.min(top, p.y - r - font, ty); bottom = Math.max(bottom, p.y + r + font, ty);
  }
  return { left, right, top, bottom };
}

type Label = { text: string; bold: boolean };
type Box = { x: number; y: number; w: number; h: number; a: number };
/** Separating-axis test for two rotated rectangles (centre, half sizes, angle). */
function overlaps(p: Box, q: Box) {
  for (const a of [p.a, p.a + Math.PI / 2, q.a, q.a + Math.PI / 2]) {
    const ux = Math.cos(a), uy = Math.sin(a);
    const reach = (b: Box) => Math.abs(b.w * Math.cos(b.a - a)) + Math.abs(b.h * Math.sin(b.a - a));
    if (Math.abs((p.x - q.x) * ux + (p.y - q.y) * uy) >= reach(p) + reach(q)) return false;
  }
  return true;
}

/**
 * Checks that names stay apart, like a map: they go down in priority order (the active path,
 * libraries, open nodes, the active node's children, then inner rings first) along their spokes, and
 * a leaf whose name would cover another tries a short form. The layout spreads until all fit at zoom
 * 1, so dropping a name is only a safeguard; `size` is the text size in map units.
 */
function fitLabels(layout: Map<string, Placed>, maxItems: number, size: number, path: Set<string>, active: string) {
  const out = new Map<string, Label>(), placed: Box[] = [];
  const nodes = [...layout.values()].filter((p) => p.node.kind !== "root");
  const obstacles = [...layout.values()].map((p) => ({ id: p.node.id, box: { x: p.x, y: p.y, w: nodeRadius(p.node, maxItems), h: nodeRadius(p.node, maxItems), a: 0 } }));
  const rank = (p: Placed) => path.has(p.node.id) ? 0 : p.node.kind === "library" ? 1 : p.node.children.length ? 2 : p.node.parent === active ? 3 : 4 + p.r / 10000;
  const free = (id: string, box: Box) => !placed.some((q) => overlaps(box, q)) && !obstacles.some((o) => o.id !== id && overlaps(box, o.box));
  for (const p of nodes.sort((a, b) => rank(a) - rank(b))) {
    const n = p.node, r = nodeRadius(n, maxItems), ux = Math.cos(p.angle), uy = Math.sin(p.angle);
    const em = n.kind === "library" ? size * 1.05 : size, start = r + 0.4 * size;
    const option = (text: string): [Label, Box] => {
      const w = textWidth(text, em);
      return [{ text, bold: n.kind === "library" }, { x: p.x + ux * (start + w / 2), y: p.y + uy * (start + w / 2), w: w / 2, h: em * 0.58, a: p.angle }];
    };
    const options = [option(nameOf(n))];
    if (!n.children.length && n.name.length > 5) options.push(option(`${n.name.slice(0, 4)}…`));
    const pick = options.find(([, box]) => free(n.id, box));
    if (!pick) continue;
    placed.push(pick[1]);
    out.set(n.id, pick[0]);
  }
  return out;
}

/** A curved road between rings: leaves the parent along its own angle, arrives along the child's. */
type Spot = { x: number; y: number; angle: number; r: number };
function road(a: Spot, b: Spot) {
  const mid = (a.r + b.r) / 2;
  const c1 = { x: Math.cos(a.angle) * mid, y: Math.sin(a.angle) * mid };
  const c2 = { x: Math.cos(b.angle) * mid, y: Math.sin(b.angle) * mid };
  return a.r === 0 ? `M0,0 L${b.x.toFixed(1)},${b.y.toFixed(1)}`
    : `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}

export function LineageRoads({ data, reveal }: { data: DomainsOverview; reveal?: { library: string; system?: string; at: number } }) {
  const { openCorpus, openPreview } = useLayout();
  const [open, setOpen] = useState<Set<string>>(() => new Set(["root"]));
  const [full, setFull] = useState<Set<string>>(() => new Set());
  const box = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const largeButton = useRef<HTMLSpanElement>(null);
  const restoreLargeFocus = useRef(true);
  const [engaged, setEngaged] = useState(false);
  const [large, setLarge] = useState(false);
  const scrollSnapshot = useRef<{ node: HTMLElement; top: number; windowTop: number } | null>(null);
  const modePress = useRef<{ id: number; x: number; y: number; scroll: number; engaged: boolean } | null>(null);
  const touchHandled = useRef(false);
  const blankClicks = useRef(0);
  const [active, setActive] = useState("root");
  const [hover, setHover] = useState("");
  const [detailTarget, setDetail] = useState<Node | null>(null);
  const detailContent = useRef<HTMLDivElement>(null);
  const overview = useQuery({ ...libraryOverviewQuery() });
  // A library's deeper levels are read only once it is opened.
  const libs = data.domains.filter((d) => open.has(d.id)).map((d) => d.id);
  const queries = useQueries({ queries: libs.map((id) => domainTreeQuery(id)) });
  const trees = new Map<string, DomainTree>();
  queries.forEach((q, i) => { if (q.data) trees.set(libs[i], q.data); });
  const treeKey = queries.map((q) => q.dataUpdatedAt).join(",");

  const root = useMemo(() => build(data, trees, open, full), [data, open, full, treeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 在 02 谱系中看 from 03: open that library (and system), make it the active branch, bring it into view.
  useEffect(() => {
    if (!reveal) return;
    const sid = reveal.system ? `${reveal.library}/${reveal.system}` : "";
    setOpen((old) => new Set([...old, "root", reveal.library, ...(sid ? [sid] : [])]));
    setActive(sid || reveal.library);
    focusOn.current = sid || reveal.library;
    box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [reveal?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Opens what sits under the active node, one step short of a wall of labels: a system shows its
   * directions and themes, a direction its themes and their first projects, a theme all its projects.
   */
  function expandBranch(id: string) {
    const node = layout.get(id)?.node;
    const tree = node ? trees.get(node.library) : undefined;
    if (!node || !tree || node.kind === "root" || node.kind === "library") return;
    const ids: string[] = [], themes: string[] = [];
    for (const system of tree.systems) {
      const sid = `${node.library}/${system.name}`;
      for (const direction of system.directions) {
        const did = `${sid}/${direction.name}`;
        for (const theme of direction.themes) {
          const tid = `${did}/${theme.name}`;
          if (id === sid) ids.push(sid, did);
          else if (id === did) ids.push(sid, did, tid);
          else if (id === tid) { ids.push(sid, did, tid); themes.push(tid); }
        }
      }
    }
    setOpen((old) => new Set([...old, ...ids]));
    setFull((old) => new Set([...old, ...themes]));
  }
  const [font, setFont] = useState(14);
  // The embedded frame: its width, and its default height (the CSS clamp(520px, 76vh, 1240px)).
  const [frame, setFrame] = useState({ width: 1100, height: 700 });
  const maxItems = Math.max(...data.domains.map((d) => d.items));
  const arranged = useMemo(() => arrange(root, font, maxItems), [root, font, maxItems]);
  const layout = arranged.layout;
  const detail = detailTarget ? layout.get(detailTarget.id)?.node ?? detailTarget : null;
  const hue = (library: string) => (overview.data && library ? libraryColor(overview.data, library) : "var(--terrain-dot)");


  // Expansion belongs to each node. Folding a parent hides, but remembers, its descendants.
  function toggle(node: Node) {
    setActive(node.id);
    if (node.kind === "project") { showDetail(node); return; }
    if (node.kind === "more") { setFull((old) => new Set([...old, node.parent!])); setActive(node.parent!); return; }
    if (!node.expandable) return;
    setOpen((old) => {
      const next = new Set(old);
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
      return next;
    });
  }

  const lineage = (id: string) => { const out = new Set<string>(); let at: string | null = id; while (at) { out.add(at); at = layout.get(at)?.node.parent ?? null; } return out; };
  const lit = hover ? lineage(hover) : null;
  const path = [...lineage(active)].reverse().map((id) => layout.get(id)?.node).filter(Boolean) as Node[];

  // The two viewports share data/expansion, but have independent display coordinates.
  const svg = useRef<SVGSVGElement>(null);
  const largeSvg = useRef<SVGSVGElement>(null);
  const focusOn = useRef("");
  // The square map is fitted to the shorter side of the frame: that side sets the scale.
  const [largeFrame, setLargeFrame] = useState({ width: 1100, height: 1100 });
  useEffect(() => {
    const measure = () => {
      if (svg.current) setFrame((old) => {
        const width = svg.current!.getBoundingClientRect().width || old.width;
        const height = Math.min(1240, Math.max(520, innerHeight * 0.76));
        return width === old.width && height === old.height ? old : { width, height };
      });
      if (largeSvg.current && large) {
        const { width, height } = largeSvg.current.getBoundingClientRect();
        if (width && height) setLargeFrame((old) => (old.width === width && old.height === height ? old : { width, height }));
      }
      setFont(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-body")) || 14);
    };
    const observer = new ResizeObserver(measure);
    if (svg.current) observer.observe(svg.current);
    if (largeSvg.current) observer.observe(largeSvg.current);
    addEventListener("resize", measure);
    return () => { observer.disconnect(); removeEventListener("resize", measure); };
  }, [large]);
  /**
   * The embedded frame keeps one screen scale and grows to hold the drawing. It stays centred on 人工智能
   * while the drawing fits around it, and otherwise follows the drawing; only a drawing wider than the
   * frame is scaled down, just enough to fit.
   */
  const target = useMemo(() => {
    const box = extent(layout, maxItems, font), pad = 24;
    const scale = Math.min(1, frame.width / (box.right - box.left + 2 * pad));
    const width = frame.width / scale, height = Math.max(frame.height / scale, box.bottom - box.top + 2 * pad);
    const from = (lo: number, hi: number, size: number) => (lo - pad >= -size / 2 && hi + pad <= size / 2 ? -size / 2 : (lo + hi) / 2 - size / 2);
    return { left: from(box.left, box.right, width), top: from(box.top, box.bottom, height), width, height, scale };
  }, [layout, maxItems, font, frame]);

  /**
   * One motion for every change: nodes travel along their rings and outwards (polar), new ones from
   * their parent's spot, while rings, roads, the frame height and the view move with them, 520 ms with
   * an ease-out. An interrupted motion continues from where it is. Reduced motion jumps to the end.
   */
  type Drawn = { pos: Map<string, { r: number; a: number }>; rings: number[]; view: typeof target };
  const drawnRef = useRef<Drawn | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  useLayoutEffect(() => {
    const goal: Drawn = { pos: new Map([...layout].map(([id, p]) => [id, { r: p.r, a: p.angle }])), rings: arranged.rings, view: target };
    const from = drawnRef.current;
    const show = (next: Drawn) => { drawnRef.current = next; setDrawn(next); };
    if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) { show(goal); return; }
    const start = new Map<string, { r: number; a: number }>();
    for (const [id, p] of layout) {
      let at: string | null = id, was = from.pos.get(id);
      while (!was && at) { at = layout.get(at)?.node.parent ?? null; was = at ? from.pos.get(at) : undefined; }
      start.set(id, was ?? { r: 0, a: p.angle });
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 520), e = 1 - (1 - t) ** 3, mix = (a: number, b: number) => a + (b - a) * e;
      const pos = new Map<string, { r: number; a: number }>();
      for (const [id, to] of goal.pos) {
        const s0 = start.get(id)!;
        pos.set(id, { r: mix(s0.r, to.r), a: s0.a + Math.atan2(Math.sin(to.a - s0.a), Math.cos(to.a - s0.a)) * e });
      }
      const rings = goal.rings.map((r, i) => mix(from.rings[i] ?? from.rings[from.rings.length - 1] ?? r, r));
      const v = from.view, g = goal.view;
      show({ pos, rings, view: { left: mix(v.left, g.left), top: mix(v.top, g.top), width: mix(v.width, g.width), height: mix(v.height, g.height), scale: mix(v.scale, g.scale) } });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    step(t0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [layout, target]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = drawn ?? { pos: new Map([...layout].map(([id, p]) => [id, { r: p.r, a: p.angle }])), rings: arranged.rings, view: target };
  const spot = (id: string): Spot => {
    const q = now.pos.get(id) ?? { r: layout.get(id)?.r ?? 0, a: layout.get(id)?.angle ?? 0 };
    return { x: Math.cos(q.a) * q.r, y: Math.sin(q.a) * q.r, angle: q.a, r: q.r };
  };
  // The large view shows the same part of the map, fitted to the window.
  const largeScale = Math.min(largeFrame.width / now.view.width, largeFrame.height / now.view.height);
  const bounds = { left: target.left, right: target.left + target.width, top: target.top, bottom: target.top + target.height };
  const pan = usePanZoom(svg, bounds, engaged && !large);
  const largePan = usePanZoom(largeSvg, bounds, large);
  // Only an explicit reveal from 03 moves the camera; opening another branch keeps the context.
  useEffect(() => {
    const id = focusOn.current;
    if (!id) return;
    focusOn.current = "";
    const p = layout.get(id);
    const map = large ? largePan : pan;
    if (!p || p.node.kind === "root") { map.glideTo({ x: 0, y: 0, k: 1 }); return; }
    const k = { library: 1.25, system: 1.6, direction: 2, theme: 2.4, project: 2.4, more: 2.4, root: 1 }[p.node.kind];
    // Centre between the node and the ring of its children, so the new fan is in view.
    // A fitted frame is not centred on the map origin; its own centre is the target.
    const reach = (p.r + (arranged.rings[DEPTH[p.node.kind] + 1] ?? p.r + 150)) / 2;
    const cx = target.left + target.width / 2, cy = target.top + target.height / 2;
    map.glideTo({ x: cx - Math.cos(p.angle) * reach * k, y: cy - Math.sin(p.angle) * reach * k, k });
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  function expandSystems() {
    setOpen((old) => new Set([...old, "root", ...data.domains.map((d) => d.id)]));
  }
  function scroller() {
    let node: HTMLElement | null = box.current?.parentElement ?? null;
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
    return node ?? document.documentElement;
  }
  function pageTop() { return scroller().scrollTop + window.scrollY; }
  function changeMode(value: boolean) {
    setEngaged(value);
    if (value) svg.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!engaged) return;
    const outside = (e: globalThis.PointerEvent) => { if (!(e.target instanceof globalThis.Node) || !box.current?.contains(e.target)) setEngaged(false); };
    const wheel = (e: WheelEvent) => { if (!(e.target instanceof globalThis.Node) || !svg.current?.contains(e.target)) setEngaged(false); };
    const leave = () => setEngaged(false);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEngaged(false); } };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("wheel", wheel, { capture: true, passive: true });
    document.addEventListener("scroll", leave, { capture: true, passive: true });
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", leave);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("scroll", leave, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", leave);
    };
  }, [engaged]);
  function openLarge() {
    const node = scroller();
    scrollSnapshot.current = { node, top: node.scrollTop, windowTop: window.scrollY };
    restoreLargeFocus.current = true;
    pan.stop(); largePan.stop(); largePan.setView(pan.view);
    setEngaged(false); setHover(""); setCard(null); setLarge(true);
  }
  function closeLarge(focus = true) {
    restoreLargeFocus.current = focus;
    dialog.current?.close();
    largePan.stop(); setLarge(false); setHover(""); setCard(null);
  }
  useLayoutEffect(() => {
    if (!large || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    const root = document.documentElement, overflow = root.style.overflow;
    root.style.overflow = "hidden";
    largeSvg.current?.focus({ preventScroll: true });
    return () => {
      element.close(); root.style.overflow = overflow;
      const saved = scrollSnapshot.current;
      if (saved?.node.isConnected) {
        saved.node.scrollTo({ top: saved.top, behavior: "instant" });
        window.scrollTo({ top: saved.windowTop, behavior: "instant" });
      }
      if (restoreLargeFocus.current) largeButton.current?.querySelector("button")?.focus({ preventScroll: true });
    };
  }, [large]);
  function showDetail(node: Node | null) {
    setEngaged(false);
    if (large) closeLarge(false);
    setDetail(node);
  }
  useLayoutEffect(() => {
    if (!detailTarget || !detailContent.current) return;
    detailContent.current.parentElement?.scrollTo({ top: 0, behavior: "instant" });
    detailContent.current.focus({ preventScroll: true });
  }, [detailTarget?.id]);
  function modeDown(e: PointerEvent<HTMLButtonElement>) {
    touchHandled.current = false;
    modePress.current = e.pointerType === "touch" ? { id: e.pointerId, x: e.clientX, y: e.clientY, scroll: pageTop(), engaged } : null;
  }
  function modeUp(e: PointerEvent<HTMLButtonElement>) {
    const press = modePress.current; modePress.current = null;
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10 && Math.abs(pageTop() - press.scroll) < 2) {
      touchHandled.current = true; changeMode(!press.engaged);
    }
  }
  const loading = queries.some((q) => q.isLoading);
  const nodes = [...layout.values()];
  const onPath = new Set(path.map((n) => n.id));
  // Name placement depends on the scale only, so it is recomputed on zoom but not on hover.
  const embeddedNames = useMemo(() => fitLabels(layout, maxItems, font / target.scale / pan.view.k, onPath, active),
    [layout, font, target.scale, pan.view.k, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const largeNames = useMemo(() => large ? fitLabels(layout, maxItems, font / largeScale / largePan.view.k, onPath, active) : new Map<string, Label>(),
    [large, layout, font, largeScale, largePan.view.k, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeNode = layout.get(active)?.node;
  const [card, setCard] = useState<{ left: number; top: number; large: boolean } | null>(null);
  function moveCard(event: { clientX: number; clientY: number }, isLarge: boolean) {
    const frame = (isLarge ? dialog.current : box.current)?.getBoundingClientRect();
    if (!frame || (isLarge ? largePan : pan).isDragging()) return;
    const left = event.clientX - frame.left + 16;
    setCard({ left: left + 260 > frame.width ? left - 290 : left, top: event.clientY - frame.top + 14, large: isLarge });
  }
  const hovered = hover ? layout.get(hover)?.node : undefined;
  const KIND_NAME: Record<Kind, string> = { root: "全部领域", library: "资料库", system: "技术体系", direction: "研究方向", theme: "主题", project: "项目", more: "其余项目" };
  function pathBar() {
    return <nav aria-label="当前位置" className="roads-path">
        {path.map((n, i) => <span key={n.id}>{i ? <i aria-hidden="true">›</i> : null}
          <button type="button" onClick={() => setActive(n.id)} aria-current={n.id === active ? "true" : undefined}>{n.name}</button></span>)}
        {active !== "root" ? <button type="button" className="roads-detail" onClick={() => showDetail(layout.get(active)?.node ?? null)}>详情 →</button> : null}
        {activeNode && ["system", "direction", "theme"].includes(activeNode.kind) && trees.has(activeNode.library)
          ? <button type="button" className="roads-detail" onClick={() => expandBranch(active)}>{activeNode.kind === "system" ? "展开到主题"
            : activeNode.kind === "direction" ? "展开到项目" : "显示全部项目"}</button> : null}
        <span className="roads-open-count">{nodes.filter(p => p.node.kind === "library" && open.has(p.node.id)).length} 个领域展开</span>
      </nav>;
  }
  function mapSvg(isLarge: boolean) {
    const map = isLarge ? largePan : pan, view = map.view;
    const px = 1 / (isLarge ? largeScale : now.view.scale) / view.k;
    const line = font * px;
    const names = isLarge ? largeNames : embeddedNames;
    // An open node's children fork from the end of its name, so the name reads on a clear stretch of road.
    function fork(id: string): Spot {
      const at = spot(id), n = layout.get(id)?.node, chosen = names.get(id);
      if (!n || n.kind === "root" || !chosen) return at;
      const d = nodeRadius(n, maxItems) + 0.4 * line + textWidth(chosen.text, chosen.bold ? line * 1.05 : line) + 4 * px;
      return { x: at.x + Math.cos(at.angle) * d, y: at.y + Math.sin(at.angle) * d, angle: at.angle, r: at.r + d };
    }
    // Every name runs outwards along its spoke, turned upright on the left half.
    function label(n: Node, angle: number, r: number) {
      const chosen = names.get(n.id);
      if (!chosen) return null;
      const deg = (angle * 180) / Math.PI, flip = Math.cos(angle) < 0;
      return <text className={`roads-label${chosen.bold ? " is-library" : ""}`} transform={`rotate(${(flip ? deg - 180 : deg).toFixed(2)})`}
        x={flip ? -(r + 0.4 * line) : r + 0.4 * line} dy={0.32 * line} textAnchor={flip ? "end" : "start"}
        style={{ fontSize: `calc(var(--text-body) * ${px})`, strokeWidth: 3 * px }}>{chosen.text}</text>;
    }
    return <svg ref={isLarge ? largeSvg : svg} className="roads-svg" role="group"
      viewBox={`${now.view.left} ${now.view.top} ${now.view.width} ${now.view.height}`}
      style={isLarge ? undefined : { height: now.view.height * now.view.scale }}
      aria-label="技术谱系路网：人工智能 → 资料库 → 技术体系 → 研究方向 → 主题 → 项目"
      tabIndex={0} onKeyDown={e => {
        if (!isLarge && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); changeMode(!engaged); return; }
        map.key(e);
      }} onPointerDown={map.down}
      onClickCapture={e => { if (!isLarge) blankClicks.current = (e.target as Element).closest(".roads-node") ? 0 : Math.min(2, blankClicks.current + 1); }}
      onDoubleClick={e => { if (!isLarge && blankClicks.current === 2 && !(e.target as Element).closest(".roads-node")) { e.preventDefault(); changeMode(!engaged); } }}>
      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        {now.rings.slice(1).map((r, i) => <circle key={i} r={r} className="roads-ring" />)}
        {nodes.filter((p) => p.node.parent).map((p) => {
          const width = 1 + Math.sqrt(p.node.items / maxItems) * 16;
          return <path key={`r${p.node.id}`} d={road(fork(p.node.parent!), spot(p.node.id))}
            className={`roads-road${lit && !lit.has(p.node.id) ? " is-dim" : ""}${lit?.has(p.node.id) ? " is-lit" : ""}`}
            style={{ stroke: hue(p.node.library), strokeWidth: width }} />;
        })}
        {nodes.map((p) => {
          const at = spot(p.node.id), n = p.node;
          const r = nodeRadius(n, maxItems);
          const isOpen = open.has(n.id);
          return <g key={n.id} className={`roads-node is-${n.kind}${n.unplaced ? " is-unplaced" : ""}${lit && !lit.has(n.id) ? " is-dim" : ""}${active === n.id ? " is-active" : ""}`}
            style={{ transform: `translate(${at.x}px,${at.y}px)` }} role="button" tabIndex={0}
            data-node={n.id} data-parent={n.parent ?? ""}
            aria-label={`${n.name}${n.kind === "project" ? "" : `，${n.items} 条技术`}${n.expandable ? (isOpen ? "，已展开" : "，可展开") : ""}`}
            aria-expanded={n.expandable ? isOpen : undefined}
            onClick={(e) => { e.stopPropagation(); if (!map.suppressClick()) toggle(n); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(n); } }}
            onMouseEnter={(e) => { setHover(n.id); moveCard(e, isLarge); }} onMouseMove={e => moveCard(e, isLarge)} onMouseLeave={() => { setHover(""); setCard(null); }}>
            <circle r={Math.max(r, 11 * px)} className="roads-hit" />
            {n.kind === "root" ? <circle r={r} className="roads-core" />
              : <circle r={r} style={{ fill: n.kind === "library" ? hue(n.library) : maturityVar(n.maturity), stroke: hue(n.library) }}
                className={n.expandable && !isOpen ? "is-closed" : ""} />}
            {n.kind === "root" ? <text className="roads-core-text" textAnchor="middle" dy="5">人工智能</text> : label(n, at.angle, r)}
            {n.expandable && !isOpen && n.kind !== "root" && r > 6 * px ? <text className="roads-plus" textAnchor="middle" dy={3.5 * px} style={{ fontSize: 11 * px }}>+</text> : null}
            {active === n.id && n.kind !== "root" && n.kind !== "more" && n.kind !== "project" ? <g className="roads-chip" role="button" tabIndex={0} aria-label={`${n.name} 详情`}
              transform={`translate(${(-Math.cos(at.angle) * (r + 16 * px)).toFixed(2)},${(-Math.sin(at.angle) * (r + 16 * px)).toFixed(2)}) scale(${px})`}
              onClick={(e) => { e.stopPropagation(); if (!map.suppressClick()) showDetail(n); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); showDetail(n); } }}>
              <rect x={-22} y={-9.5} width={44} height={19} rx={9.5} /><text x={0} y={4} textAnchor="middle">详情 ›</text>
            </g> : null}
          </g>;
        })}
      </g>
    </svg>;
  }
  function hoverCard(isLarge: boolean) {
    return hovered && card && card.large === isLarge ? <div className="roads-card" style={{ left: card.left, top: card.top }} aria-hidden="true">
      <small>{hovered.unplaced ? "未归入体系" : KIND_NAME[hovered.kind]}{hovered.kind !== "root" && hovered.kind !== "library" ? ` · ${short(data.domains.find((d) => d.id === hovered.library)?.name ?? "")}` : ""}</small>
      <b>{hovered.name}</b>
      {hovered.project ? <span>{[hovered.project.number, hovered.project.unit, hovered.project.year].filter(Boolean).join(" · ")}<br />本主题 {hovered.project.items.length} 条技术 · 最高 {hovered.project.maturity || "—"} 档</span>
        : hovered.kind === "more" ? <span>点一下，在原处展开其余项目</span>
        : <span>{hovered.items} 条技术 · 平均 {hovered.maturity ?? "—"} 档{hovered.plain ? <><br />{hovered.plain}</> : null}</span>}
      <em>{hovered.kind === "root" ? "各资料库始终列出，点资料库展开" : hovered.kind === "project" ? "点击看技术条目与原文" : hovered.expandable ? (open.has(hovered.id) ? "点击收起" : "点击展开") + " · 详情在节点下方" : "点击后在节点下方看详情"}</em>
    </div> : null;
  }
  return <>
    <div className="roads" ref={box} data-engaged={engaged}>
      <div className="roads-bar">
        {pathBar()}
        <div className="roads-tools">
          {loading ? <span role="status">读取中…</span> : null}
          <button type="button" className="roads-mode" aria-label={engaged ? "退出图谱操作" : "进入图谱操作"} aria-pressed={engaged}
            onPointerDown={modeDown} onPointerUp={modeUp} onPointerCancel={() => { modePress.current = null; touchHandled.current = false; }}
            onClick={e => { if (e.detail && touchHandled.current) { touchHandled.current = false; return; } touchHandled.current = false; changeMode(!engaged); }}>
            {engaged ? "✓ 图谱操作中" : "↕ 浏览页面"}
          </button>
          <Hint align="end" text={<>单击节点展开 / 收起，可同时打开多支；详情在节点下方。展开只向外生长：子节点从名称末尾分叉，图框随之加高，名称不重叠。<br />默认滚轮浏览页面；双击图内空白进入 / 退出图谱操作，操作中可滚轮缩放、拖动平移；Esc 或点击图外退出。<br />路宽 = 技术条目数 · 路色 = 资料库；节点颜色 = 报告所述平均阶段：
            {MATURITY_NAMES.slice(1).map((name, i) => <span key={name} className="hint-swatch"><i style={{ background: `var(--m-${i + 1})` }} />{i + 1} {name}</span>)}
          </>}>图例与操作</Hint>
          <button type="button" onClick={expandSystems}>展开全部技术体系</button>
          <button type="button" onClick={() => { setOpen(new Set(["root"])); setFull(new Set()); setActive("root"); }}>全部收起</button>
          <PanZoomControls map={pan} />
          <span ref={largeButton}><Button size="sm" variant="outline" aria-label="放大查看技术谱系" onClick={openLarge}>⛶ 放大查看</Button></span>
        </div>
      </div>
      {mapSvg(false)}
      <div className="roads-interaction-hint" role="status">{engaged ? "图谱操作中 · 再双击空白 / Esc 退出" : "双击图内空白可操作 · 滚轮浏览页面"}</div>
      {hoverCard(false)}
    </div>
    {createPortal(<dialog ref={dialog} className="roads-large-dialog" aria-label="技术谱系大图"
      onCancel={e => { e.preventDefault(); closeLarge(); }} onKeyDown={e => { if (e.key === "Escape") e.stopPropagation(); }}>
      <header className="roads-large-head"><div><span>图内操作</span><h2>技术谱系总览</h2><small>滚轮缩放 · 拖动平移</small></div>
        <Button variant="outline" aria-label="返回页面" onClick={() => closeLarge()}>返回页面 <kbd>Esc</kbd></Button>
      </header>
      <div className="roads roads-large-content">
        <div className="roads-bar">{pathBar()}<div className="roads-tools"><PanZoomControls map={largePan} /></div></div>
        {large ? mapSvg(true) : null}
        {hoverCard(true)}
      </div>
    </dialog>, document.body)}
    <SlideOver open={Boolean(detail)} onClose={() => setDetail(null)}
      eyebrow={detail ? { root: "全部领域", library: "资料库", system: detail.unplaced ? "未归入体系" : "技术体系", direction: "研究方向", theme: "主题", project: "项目", more: "主题下的其他项目" }[detail.kind] : ""}
      title={detail?.name ?? ""}
      meta={detail?.project ? [detail.project.number, detail.project.unit, detail.project.admin, detail.project.year ? `${detail.project.year} 年立项` : ""].filter(Boolean).join(" · ") : detail?.plain}
      stats={detail && detail.kind !== "project" && detail.kind !== "more"
        ? [{ value: detail.items, label: "技术条目" }, { value: detail.maturity ?? "—", label: "平均成熟度" }, { value: detail.children.length || "—", label: "下一级（已展开）" }]
        : detail?.project ? [{ value: detail.project.items.length, label: "本主题内的技术条目" },
          { value: detail.project.maturity ? `${detail.project.maturity} 档` : "未判定", label: "其中最高成熟度" }] : undefined}
      footer={detail ? <>
        {detail.project?.document ? <button type="button" className="slide-action" onClick={() => {
          const doc = detail.project!.document!, lib = detail.library; setDetail(null); openPreview(doc, null, lib); }}>查看原文</button> : null}
        <button type="button" className="slide-action primary" onClick={() => { const lib = detail.library; setDetail(null); if (lib) openCorpus(lib); }}>进入资料库 →</button>
      </> : null}>
      <div ref={detailContent} tabIndex={-1} className="roads-detail-content">
      {detail?.project ? <ul className="roads-list">{detail.project.items.map((item, i) => <li key={`${item.name}-${i}`}>
          <b>{item.name || "（未命名条目）"}</b>
          <small><i className="roads-swatch" style={{ background: `var(--m-${item.maturity})` }} />{item.maturity} 档 · {MATURITY_NAMES[item.maturity] ?? "未判定"}{item.basis ? `：${item.basis}` : ""}</small></li>)}</ul>
        : detail && detail.children.length ? <ul className="roads-list">{detail.children.map((c) => <li key={c.id}>
          {c.kind === "project" ? <button type="button" className="roads-child-link" aria-label={`查看项目：${c.name}`} onClick={() => { setActive(c.id); showDetail(c); }}>{c.name}<span aria-hidden="true">›</span></button>
            : c.kind === "more" ? <button type="button" className="roads-child-link" onClick={() => toggle(c)}>{c.name}<span aria-hidden="true">›</span></button> : <b>{c.name}</b>}
          <small>{c.kind === "project" ? [c.project?.number, c.project?.year].filter(Boolean).join(" · ") : `${c.items} 条技术 · 平均 ${c.maturity ?? "—"} 档`}</small></li>)}</ul>
        : <p className="text-body text-[var(--slate)]">在图上点这个节点展开下一级，这里会列出它们。</p>}
      </div>
    </SlideOver>
  </>;
}
