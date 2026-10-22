import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { domainTreeQuery, maturityVar, MATURITY_NAMES, type DomainsOverview, type DomainTree, type TreeProject } from "../../domains";
import { libraryOverviewQuery } from "../../libraryQueries";
import { libraryColor } from "../../libraryColors";
import { useLayout } from "../../layout";
import { Hint } from "../Hint";
import { SlideOver } from "../SlideOver";

/**
 * 02 技术谱系总览 as a radial road map (query 2026-1022 1606): 人工智能 at the centre, then each library,
 * its technology systems, research directions, themes and finally the projects, one ring further out
 * per level. It opens one node at a time: a click grows that node's children out of it, a second click
 * folds them back. Roads are as wide as the technology they carry and take their library's colour (the
 * same hues as the 首页 banner); a node's fill is its mean maturity. Hovering lights the road back to
 * the centre; the path bar above names where you are and opens its details on the right.
 */

type Kind = "root" | "library" | "system" | "direction" | "theme" | "project" | "more";
type Node = {
  id: string; parent: string | null; kind: Kind; name: string; plain: string; items: number; maturity: number | null;
  library: string; children: Node[]; expandable: boolean; project?: TreeProject; hidden?: TreeProject[]; unplaced?: boolean;
};
const RADII: Record<Kind, number> = { root: 0, library: 140, system: 250, direction: 360, theme: 465, project: 570, more: 570 };
const PROJECTS_SHOWN = 12;
const short = (name: string) => name.replace(/^(自然科学基金-)?AI与/, "");

function build(data: DomainsOverview, trees: Map<string, DomainTree>, open: Set<string>, full: Set<string>): Node {
  const root: Node = { id: "root", parent: null, kind: "root", name: "人工智能", plain: "", items: data.totals.items, maturity: null,
    library: "", children: [], expandable: true };
  if (!open.has("root")) return root;
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

type Placed = { node: Node; x: number; y: number; angle: number; r: number };
/**
 * Radial layout: each node gets an arc by the leaves it shows and sits mid-arc on its ring. Leaves are
 * damped (power 0.8) so one opened branch widens without squeezing its folded siblings to a line.
 * The branch on the path to the active node gets 1.5× per level, which compounds along the path.
 */
function place(root: Node, focus: Set<string>) {
  const out = new Map<string, Placed>();
  // The branch being explored gets 1.5× per level on the path (it compounds), so drilling in makes room without crushing the rest.
  const leaves = (n: Node): number => (n.children.length ? Math.pow(n.children.reduce((s, c) => s + leaves(c), 0), 0.8) : 1)
    * (focus.has(n.id) && n.kind !== "root" ? 1.5 : 1);
  const walk = (n: Node, from: number, to: number) => {
    const angle = (from + to) / 2, r = RADII[n.kind];
    out.set(n.id, { node: n, angle, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    let at = from;
    // Siblings share the parent's arc by their own weights, which are damped and so need not add up to it.
    const total = n.children.reduce((sum, c) => sum + leaves(c), 0);
    for (const child of n.children) {
      const span = ((to - from) * leaves(child)) / total;
      walk(child, at, at + span);
      at += span;
    }
  };
  walk(root, -Math.PI / 2, Math.PI * 1.5);
  return out;
}

/** A curved road between rings: leaves the parent along its own angle, arrives along the child's. */
function road(a: Placed, b: Placed) {
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
  const [active, setActive] = useState("root");
  const [hover, setHover] = useState("");
  const [detail, setDetail] = useState<Node | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
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
  const focusPath = useMemo(() => {
    // Parent links from the tree itself: a technology name may contain "/", so ids are not split.
    const parent = new Map<string, string | null>();
    const walk = (n: Node) => { parent.set(n.id, n.parent); n.children.forEach(walk); };
    walk(root);
    const out = new Set<string>();
    for (let at: string | null = active; at; at = parent.get(at) ?? null) out.add(at);
    return out;
  }, [active, root]);
  const layout = useMemo(() => place(root, focusPath), [root, focusPath]);
  const hue = (library: string) => (overview.data && library ? libraryColor(overview.data, library) : "var(--terrain-dot)");
  const maxItems = Math.max(...data.domains.map((d) => d.items));

  // New nodes are drawn first at their parent's spot, then moved out on the next frame: they grow outwards.
  const [shown, setShown] = useState<Map<string, { x: number; y: number }>>(new Map());
  useLayoutEffect(() => {
    const start = new Map<string, { x: number; y: number }>();
    for (const [id, p] of layout) {
      const before = shown.get(id);
      const parent = p.node.parent ? (shown.get(p.node.parent) ?? layout.get(p.node.parent)) : null;
      start.set(id, before ?? (parent ? { x: parent.x, y: parent.y } : { x: p.x, y: p.y }));
    }
    setShown(start);
    const frame = requestAnimationFrame(() => setShown(new Map([...layout].map(([id, p]) => [id, { x: p.x, y: p.y }]))));
    return () => cancelAnimationFrame(frame);
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * A click opens one branch and folds its siblings' (query 2026-1022: the map was hard to work), then
   * the view glides to the opened node; a second click folds it and steps back to its parent.
   */
  function toggle(node: Node) {
    setActive(node.id);
    if (node.kind === "project") { setDetail(node); return; }
    if (node.kind === "more") { setFull((old) => new Set([...old, node.parent!])); setActive(node.parent!); focusOn.current = node.parent!; return; }
    if (!node.expandable) return;
    const closing = open.has(node.id) && node.kind !== "root";
    const siblings = [...layout.values()].filter((p) => p.node.parent === node.parent && p.node.id !== node.id).map((p) => p.node.id);
    setOpen((old) => {
      const next = new Set(old);
      const fold = (id: string) => { for (const k of [...next]) if (k === id || k.startsWith(id + "/")) next.delete(k); };
      if (closing) fold(node.id);
      else { next.add(node.id); siblings.forEach(fold); }
      next.add("root");
      return next;
    });
    focusOn.current = closing ? (node.parent ?? "root") : node.id;
  }

  const lineage = (id: string) => { const out = new Set<string>(); let at: string | null = id; while (at) { out.add(at); at = layout.get(at)?.node.parent ?? null; } return out; };
  const lit = hover ? lineage(hover) : null;
  const path = [...lineage(active)].reverse().map((id) => layout.get(id)?.node).filter(Boolean) as Node[];

  // Drag pans, the wheel zooms at the pointer; a double click on the background recentres.
  const svg = useRef<SVGSVGElement>(null);
  const focusOn = useRef("");
  const glide = useRef(0);
  const [pixels, setPixels] = useState(1100);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setPixels(node.getBoundingClientRect().width || 1100));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  function glideTo(target: { x: number; y: number; k: number }) {
    cancelAnimationFrame(glide.current);
    const from = view, start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 480), e = 1 - Math.pow(1 - t, 3);
      setView({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e });
      if (t < 1) glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
  }
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // The view fits the outermost ring on show, plus room for its spoke labels; it grows as levels open.
  const outermost = Math.max(...[...layout.values()].map((p) => p.r));
  const SIZE = 2 * (outermost + (outermost > 300 ? 170 : 110));
  const sizeRef = useRef(SIZE);
  sizeRef.current = SIZE;
  const unit = () => sizeRef.current / (svg.current?.getBoundingClientRect().width || sizeRef.current);
  // Labels and hit areas keep the same size on screen at any zoom.
  const px = SIZE / pixels / view.k;
  // After a click, centre the opened node at a zoom that suits its level.
  useEffect(() => {
    const id = focusOn.current;
    if (!id) return;
    focusOn.current = "";
    const p = layout.get(id);
    if (!p || p.node.kind === "root") { glideTo({ x: 0, y: 0, k: 1 }); return; }
    const k = { library: 1.25, system: 1.6, direction: 2, theme: 2.4, project: 2.4, more: 2.4, root: 1 }[p.node.kind];
    // Centre between the node and the ring of its children, so the new fan is in view.
    const reach = (p.r + Math.min(p.r + 110, 600)) / 2;
    glideTo({ x: -Math.cos(p.angle) * reach * k, y: -Math.sin(p.angle) * reach * k, k });
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps
  function down(event: ReactPointerEvent<SVGSVGElement>) { drag.current = { x: event.clientX, y: event.clientY, moved: false }; }
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = event.clientX - d.x, dy = event.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true; d.x = event.clientX; d.y = event.clientY;
      setView((v) => ({ ...v, x: v.x + dx * unit(), y: v.y + dy * unit() }));
    };
    const up = () => { setTimeout(() => { drag.current = null; }, 0); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = node.getBoundingClientRect();
      const px = ((event.clientX - box.left) / box.width - 0.5) * sizeRef.current, py = ((event.clientY - box.top) / box.height - 0.5) * sizeRef.current;
      setView((v) => { const k = Math.max(0.5, Math.min(4, v.k * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k }; });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);

  function expandSystems() {
    setOpen(new Set(["root", ...data.domains.map((d) => d.id)]));
  }
  const loading = queries.some((q) => q.isLoading);
  const nodes = [...layout.values()];
  // Past a few dozen projects their names would overlap; they then show on hover and along the active path.
  const crowded = nodes.filter((p) => p.node.kind === "project").length > 36;
  const onPath = new Set(path.map((n) => n.id));

  const activeNode = layout.get(active)?.node;
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  function moveCard(event: { clientX: number; clientY: number }) {
    const frame = box.current?.getBoundingClientRect();
    if (!frame || drag.current?.moved) return;
    const left = event.clientX - frame.left + 16;
    setCard({ left: left + 260 > frame.width ? left - 290 : left, top: event.clientY - frame.top + 14 });
  }
  const hovered = hover ? layout.get(hover)?.node : undefined;
  const KIND_NAME: Record<Kind, string> = { root: "全部领域", library: "资料库", system: "技术体系", direction: "研究方向", theme: "主题", project: "项目", more: "其余项目" };
  return <div className="roads" ref={box}>
    <div className="roads-bar">
      <nav aria-label="当前位置" className="roads-path">
        {path.map((n, i) => <span key={n.id}>{i ? <i aria-hidden="true">›</i> : null}
          <button type="button" onClick={() => setActive(n.id)} aria-current={n.id === active ? "true" : undefined}>{n.name}</button></span>)}
        {active !== "root" ? <button type="button" className="roads-detail" onClick={() => setDetail(layout.get(active)?.node ?? null)}>详情 →</button> : null}
        {activeNode && ["system", "direction", "theme"].includes(activeNode.kind) && trees.has(activeNode.library)
          ? <button type="button" className="roads-detail" onClick={() => expandBranch(active)}>{activeNode.kind === "system" ? "展开到主题"
            : activeNode.kind === "direction" ? "展开到项目" : "显示全部项目"}</button> : null}
      </nav>
      <div className="roads-tools">
        {loading ? <span role="status">读取中…</span> : null}
        <Hint align="end" text={<>点节点展开（同级其他分支自动收起），再点收起；双击看详情<br />路宽 = 技术条目数 · 路色 = 资料库<br />节点颜色 = 平均成熟度：
          {MATURITY_NAMES.slice(1).map((name, i) => <span key={name} className="hint-swatch"><i style={{ background: `var(--m-${i + 1})` }} />{i + 1} {name}</span>)}
          <br />拖动平移 · 滚轮缩放 · 双击空白复位</>}>图例与操作</Hint>
        <button type="button" onClick={expandSystems}>展开全部技术体系</button>
        <button type="button" onClick={() => { setOpen(new Set(["root"])); setActive("root"); }}>全部收起</button>
        <span className="roads-zoom" role="group" aria-label="缩放">
          <button type="button" aria-label="缩小" onClick={() => glideTo({ ...view, k: Math.max(0.5, view.k / 1.3), x: view.x / 1.3, y: view.y / 1.3 })}>−</button>
          <button type="button" onClick={() => glideTo({ x: 0, y: 0, k: 1 })}>{Math.abs(view.k - 1) < 0.02 && !view.x && !view.y ? "全景" : `${Math.round(view.k * 100)}% · 复位`}</button>
          <button type="button" aria-label="放大" onClick={() => glideTo({ k: Math.min(4, view.k * 1.3), x: view.x * 1.3, y: view.y * 1.3 })}>+</button>
        </span>
      </div>
    </div>
    <svg ref={svg} className="roads-svg" viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`} role="group"
      aria-label="技术谱系路网：人工智能 → 资料库 → 技术体系 → 研究方向 → 主题 → 项目"
      onPointerDown={down} onDoubleClick={(e) => { if (e.target === svg.current) glideTo({ x: 0, y: 0, k: 1 }); }}>
      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        {(["library", "system", "direction", "theme", "project"] as Kind[]).map((k) => nodes.some((p) => p.node.kind === k)
          ? <circle key={k} r={RADII[k]} className="roads-ring" /> : null)}
        {nodes.filter((p) => p.node.parent).map((p) => {
          const parent = layout.get(p.node.parent!)!;
          const a = shown.get(parent.node.id) ?? parent, b = shown.get(p.node.id) ?? p;
          const width = 1 + Math.sqrt(p.node.items / maxItems) * 16;
          return <path key={`r${p.node.id}`} d={road({ ...parent, ...a }, { ...p, ...b })}
            className={`roads-road${lit && !lit.has(p.node.id) ? " is-dim" : ""}${lit?.has(p.node.id) ? " is-lit" : ""}`}
            style={{ stroke: hue(p.node.library), strokeWidth: width }} />;
        })}
        {nodes.map((p) => {
          const at = shown.get(p.node.id) ?? p, n = p.node;
          const r = n.kind === "root" ? 34 : n.kind === "project" || n.kind === "more" ? 4.5 : 5 + Math.sqrt(n.items / maxItems) * 22;
          // Only the centre and the libraries read horizontally; every ring further out labels along its spoke.
          const outer = n.kind !== "root" && n.kind !== "library";
          const deg = (p.angle * 180) / Math.PI, flip = deg > 90 && deg < 270;
          const isOpen = open.has(n.id);
          return <g key={n.id} className={`roads-node is-${n.kind}${n.unplaced ? " is-unplaced" : ""}${lit && !lit.has(n.id) ? " is-dim" : ""}${active === n.id ? " is-active" : ""}`}
            style={{ transform: `translate(${at.x}px,${at.y}px)` }} role="button" tabIndex={0}
            aria-label={`${n.name}${n.kind === "project" ? "" : `，${n.items} 条技术`}${n.expandable ? (isOpen ? "，已展开" : "，可展开") : ""}`}
            aria-expanded={n.expandable ? isOpen : undefined}
            onClick={(e) => { e.stopPropagation(); if (!drag.current?.moved) toggle(n); }}
            onKeyDown={(e) => { if (e.key === "Enter") toggle(n); }}
            onDoubleClick={(e) => { e.stopPropagation(); if (n.kind !== "root") setDetail(n); }}
            onMouseEnter={(e) => { setHover(n.id); moveCard(e); }} onMouseMove={moveCard} onMouseLeave={() => { setHover(""); setCard(null); }}>
            <circle r={Math.max(r, 11 * px)} className="roads-hit" />
            {n.kind === "root" ? <circle r={r} className="roads-core" />
              : <circle r={r} style={{ fill: n.kind === "library" ? hue(n.library) : maturityVar(n.maturity), stroke: hue(n.library) }}
                className={n.expandable && !isOpen ? "is-closed" : ""} />}
            {n.kind === "root" ? <text className="roads-core-text" textAnchor="middle" dy="5">人工智能</text>
              : outer && crowded && n.kind === "project" && !lit?.has(n.id) && !onPath.has(n.id) ? null
              : outer ? <text className="roads-label" transform={`rotate(${flip ? deg - 180 : deg})`} x={flip ? -(r + 5 * px) : r + 5 * px} dy={4 * px}
                textAnchor={flip ? "end" : "start"} style={{ fontSize: 11.5 * px, strokeWidth: 3 * px }}>{n.name.length > 16 ? `${n.name.slice(0, 15)}…` : n.name}</text>
              : <text className={`roads-label is-${n.kind}`} textAnchor="middle" y={-(r + 6 * px)} style={{ fontSize: 13.5 * px, strokeWidth: 3.5 * px }}>{n.name}</text>}
            {n.expandable && !isOpen && n.kind !== "root" && r > 6 * px ? <text className="roads-plus" textAnchor="middle" dy={3.5 * px} style={{ fontSize: 11 * px }}>+</text> : null}
          </g>;
        })}
      </g>
    </svg>
    {hovered && card ? <div className="roads-card" style={{ left: card.left, top: card.top }} aria-hidden="true">
      <small>{hovered.unplaced ? "未归入体系" : KIND_NAME[hovered.kind]}{hovered.kind !== "root" && hovered.kind !== "library" ? ` · ${short(data.domains.find((d) => d.id === hovered.library)?.name ?? "")}` : ""}</small>
      <b>{hovered.name}</b>
      {hovered.project ? <span>{[hovered.project.number, hovered.project.unit, hovered.project.year].filter(Boolean).join(" · ")}<br />本主题 {hovered.project.items.length} 条技术 · 最高 {hovered.project.maturity || "—"} 档</span>
        : hovered.kind === "more" ? <span>点一下，在原处展开其余项目</span>
        : <span>{hovered.items} 条技术 · 平均 {hovered.maturity ?? "—"} 档{hovered.plain ? <><br />{hovered.plain}</> : null}</span>}
      <em>{hovered.kind === "project" ? "点击看技术条目与原文" : hovered.expandable ? (open.has(hovered.id) ? "点击收起 · 双击看详情" : "点击展开 · 双击看详情") : "双击看详情"}</em>
    </div> : null}
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
      {detail?.project ? <ul className="roads-list">{detail.project.items.map((item, i) => <li key={`${item.name}-${i}`}>
          <b>{item.name || "（未命名条目）"}</b>
          <small><i className="roads-swatch" style={{ background: `var(--m-${item.maturity})` }} />{item.maturity} 档 · {MATURITY_NAMES[item.maturity] ?? "未判定"}{item.basis ? `：${item.basis}` : ""}</small></li>)}</ul>
        : detail && detail.children.length ? <ul className="roads-list">{detail.children.map((c) => <li key={c.id}>
          <b>{c.name}</b><small>{c.kind === "project" ? [c.project?.number, c.project?.year].filter(Boolean).join(" · ") : `${c.items} 条技术 · 平均 ${c.maturity ?? "—"} 档`}</small></li>)}</ul>
        : <p className="text-body text-[var(--slate)]">在图上点这个节点展开下一级，这里会列出它们。</p>}
    </SlideOver>
  </div>;
}
