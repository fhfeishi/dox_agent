import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FACET_COLORS, projectQuery, type Scene } from "../projects";
import { useApp } from "../store";

type Node = { key: string; column: 0 | 1 | 2 | 3; label: string; note: string; projects: string[]; color: string };
/** `primary`: drawn always; other result links appear (dashed) only inside a selected chain. */
type Edge = [string, string, boolean];

const shares = (a: string[], b: string[]) => a.some((id) => b.includes(id));

/** Nodes and links of one scene: issue → its routes from the hierarchy; routes/issues → outcomes by shared projects. */
function build(scene: Scene) {
  const nodes: Node[] = [{ key: "s", column: 0, label: scene.name, note: `${scene.project_ids.length} 个项目`, projects: scene.project_ids, color: FACET_COLORS[0] }];
  const edges: Edge[] = [];
  scene.issues.forEach((issue, i) => {
    nodes.push({ key: `i${i}`, column: 1, label: issue.name, note: issue.state, projects: issue.project_ids, color: FACET_COLORS[1] });
    edges.push(["s", `i${i}`, true]);
    issue.routes.forEach((route, r) => {
      nodes.push({ key: `r${i}-${r}`, column: 2, label: route.title, note: `${route.project_ids.length} 个项目`, projects: route.project_ids, color: FACET_COLORS[2] });
      edges.push([`i${i}`, `r${i}-${r}`, true]);
    });
  });
  scene.achievements.forEach((item, a) => {
    nodes.push({ key: `a${a}`, column: 3, label: item.title, note: `${item.project_ids.length} 个项目`, projects: item.project_ids, color: FACET_COLORS[3] });
    const routes = nodes.filter((n) => n.column === 2 && shares(n.projects, item.project_ids));
    const from = routes.length ? routes : nodes.filter((n) => n.column === 1 && shares(n.projects, item.project_ids));
    // The route sharing the most projects is the result's main link; ties keep the first.
    const overlap = (n: Node) => n.projects.filter((id) => item.project_ids.includes(id)).length;
    const main = from.reduce<Node | null>((best, n) => !best || overlap(n) > overlap(best) ? n : best, null);
    from.forEach((n) => edges.push([n.key, `a${a}`, n === main]));
    // A result tied only to issues would need a line across the technique column; say it on the card.
    if (!routes.length && from.length) nodes[nodes.length - 1].note += ` · 直接对应问题：${from.map((n) => n.label).join("、")}`;
  });
  return { nodes, edges };
}

const NODE_H = 54, ROW = 64, GROUP_GAP = 14, HEAD = 26;

/**
 * Fixed positions (top of each node): routes stacked under their issue, each issue centred on its
 * routes, the scene centred on all, and each result placed at the mean height of its linked
 * nodes, pushed down only as far as needed to avoid overlap — so lines mostly run straight.
 */
function layout(nodes: Node[], edges: Edge[]) {
  const top = new Map<string, number>();
  let y = HEAD;
  for (const issue of nodes.filter((n) => n.column === 1)) {
    const routes = nodes.filter((n) => n.column === 2 && edges.some(([a, b]) => a === issue.key && b === n.key));
    if (!routes.length) { top.set(issue.key, y); y += ROW + GROUP_GAP; continue; }
    routes.forEach((r, i) => top.set(r.key, y + i * ROW));
    top.set(issue.key, y + ((routes.length - 1) * ROW) / 2);
    y += routes.length * ROW + GROUP_GAP;
  }
  const height = Math.max(y - GROUP_GAP, HEAD + ROW);
  top.set("s", HEAD + (height - HEAD - NODE_H) / 2);
  const wanted = nodes.filter((n) => n.column === 3).map((n) => {
    const from = edges.filter(([, b]) => b === n.key).map(([a]) => top.get(a) ?? HEAD);
    // Results without any link go last rather than to the top.
    return { key: n.key, at: from.length ? from.reduce((s, v) => s + v, 0) / from.length : Infinity };
  }).sort((a, b) => a.at - b.at);
  let last = -Infinity;
  for (const w of wanted) { const at = Math.max(Number.isFinite(w.at) ? w.at : HEAD, last + ROW); top.set(w.key, at); last = at; }
  return { top, height: Math.max(height, last + NODE_H) + 8 };
}

/** Everything reachable from the selected node along the chain, in both directions. */
function chain(selected: string, edges: Edge[]) {
  const seen = new Set([selected]);
  for (const forward of [true, false]) {
    let frontier = [selected];
    while (frontier.length) {
      const next = edges.filter(([a, b]) => frontier.includes(forward ? a : b)).map(([a, b]) => forward ? b : a).filter((k) => !seen.has(k));
      next.forEach((k) => seen.add(k));
      frontier = next;
    }
  }
  return seen;
}

/**
 * 逻辑简图 (query 2026-1009 ④): one scene's 场景 → 问题 → 技术 → 成果 chain. Clicking any node
 * lights up its chain and lists the projects behind it, so readers follow the logic by clicking.
 * Outcome links come from shared projects; a missing line means no project connects them.
 */
export function SceneFlow({ corpusId, scene, onRoute }: { corpusId: string; scene: Scene; onRoute: (title: string) => void }) {
  const { showInspector } = useApp();
  const { data: library } = useQuery(projectQuery(corpusId));
  const { nodes, edges } = build(scene);
  const [selected, setSelected] = useState("s");
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const lit = chain(selected, edges);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const wide = width >= 720;
  const gap = 44, colW = (width - gap * 3) / 4;
  const { top, height } = layout(nodes, edges);
  const x = (column: number) => column * (colW + gap);
  const nodeButton = (node: Node, style?: React.CSSProperties) => <button key={node.key} type="button" aria-pressed={selected === node.key} onClick={() => setSelected(node.key)}
    title={`${node.label}\n${node.note}`}
    className={`rounded-lg border bg-[var(--canvas)] px-2.5 py-1.5 text-left text-xs transition-opacity ${wide ? "absolute overflow-hidden" : ""}`}
    style={{ borderColor: selected === node.key ? node.color : node.color + "55", borderLeftWidth: 3, opacity: lit.has(node.key) ? 1 : 0.35, ...style }}>
    <span className="line-clamp-2 block font-medium leading-4 text-[var(--ink)]">{node.label}</span>
    <span className="line-clamp-1 block text-[11px] text-[var(--stone)]">{node.note}</span>
  </button>;

  const current = nodes.find((n) => n.key === selected)!;
  const titles = new Map((library?.projects ?? []).map((p) => [p.project_id, p.title]));
  const facet = ["场景", "问题", "技术", "成果"][current.column];
  return <section aria-label={scene.name + " 逻辑简图"} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
    <p className="text-sm font-semibold">逻辑简图 · {scene.name}</p>
    <p className="mt-1 text-xs text-[var(--steel)]">箭头方向为“场景 → 问题 → 技术 → 成果”。点击任一方框，高亮它所在的链条并在下方列出相关项目。每项成果默认只连到与它共同项目最多的技术（实线）；选中链条时，其余有共同项目的连线以虚线补充显示。</p>
    <div ref={box} className="relative mt-3" style={wide ? { height } : undefined}>
      {wide ? <>
        <svg aria-hidden className="pointer-events-none absolute inset-0" width={width} height={height}>
          <defs>{["on", "off"].map((k) => <marker key={k} id={`flow-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={k === "on" ? "#6b7280" : "#c9cdd6"} /></marker>)}</defs>
          {edges.map(([a, b, primary]) => {
            const on = lit.has(a) && lit.has(b);
            // Secondary result links only appear inside a selected chain, dashed.
            if (!primary && !(on && selected !== "s")) return null;
            const from = nodes.find((n) => n.key === a)!, to = nodes.find((n) => n.key === b)!;
            if (to.column - from.column > 1) return null;  // issue → result: noted on the result card instead
            const x1 = x(from.column) + colW, y1 = (top.get(a) ?? 0) + NODE_H / 2;
            const x2 = x(to.column) - 3, y2 = (top.get(b) ?? 0) + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return <path key={a + b} d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none"
              stroke={on ? "#6b7280" : "#d6d9e0"} strokeWidth={on ? 1.8 : 1.1} strokeDasharray={primary ? undefined : "4 4"}
              markerEnd={`url(#flow-arrow-${on ? "on" : "off"})`} />;
          })}
        </svg>
        {(["场景", "问题", "技术", "成果"] as const).map((label, column) => <p key={label} className="absolute top-0 text-xs font-semibold"
          style={{ left: x(column), color: FACET_COLORS[column] }}>{label}{column === 3 && !nodes.some((n) => n.column === 3) ? " · 暂无条目" : ""}</p>)}
        {nodes.map((node) => nodeButton(node, { left: x(node.column), top: top.get(node.key), width: colW, height: NODE_H }))}
      </> : <div className="grid gap-3">{(["场景", "问题", "技术", "成果"] as const).map((label, column) => <div key={label} className="flex flex-col gap-2">
        <p className="text-xs font-semibold" style={{ color: FACET_COLORS[column] }}>{label}</p>
        {nodes.filter((n) => n.column === column).map((node) => nodeButton(node))}
        {!nodes.some((n) => n.column === column) ? <p className="text-xs text-[var(--stone)]">暂无条目</p> : null}
      </div>)}</div>}
    </div>
    <div className="mt-4 border-t border-[var(--hairline)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm" style={{ color: current.color }}>{current.label}</b>
        <span className="text-xs text-[var(--steel)]">{facet} · {current.projects.length} 个项目</span>
        {current.column === 2 ? <button type="button" onClick={() => onRoute(current.label)} className="text-xs text-[var(--link)] hover:underline">在技术谱系中查看 →</button> : null}
      </div>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">{current.projects.slice(0, 12).map((id) => <li key={id}>
        <button type="button" onClick={() => showInspector({ kind: "project", corpusId, projectId: id, facet })}
          className="text-left text-xs text-[var(--link)] hover:underline">{titles.get(id) ?? id}</button></li>)}</ul>
      {current.projects.length > 12 ? <p className="mt-1 text-xs text-[var(--stone)]">另有 {current.projects.length - 12} 个项目，可在资料列表中按场景筛选。</p> : null}
    </div>
  </section>;
}
