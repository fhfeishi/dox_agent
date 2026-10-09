import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FACET_COLORS, projectQuery, type Scene } from "../projects";
import { useApp } from "../store";

type Node = { key: string; column: 0 | 1 | 2 | 3; label: string; note: string; projects: string[]; color: string };
type Edge = [string, string];

const shares = (a: string[], b: string[]) => a.some((id) => b.includes(id));

/** Nodes and links of one scene: issue → its routes from the hierarchy; routes/issues → outcomes by shared projects. */
function build(scene: Scene) {
  const nodes: Node[] = [{ key: "s", column: 0, label: scene.name, note: `${scene.project_ids.length} 个项目`, projects: scene.project_ids, color: FACET_COLORS[0] }];
  const edges: Edge[] = [];
  scene.issues.forEach((issue, i) => {
    nodes.push({ key: `i${i}`, column: 1, label: issue.name, note: issue.state, projects: issue.project_ids, color: FACET_COLORS[1] });
    edges.push(["s", `i${i}`]);
    issue.routes.forEach((route, r) => {
      nodes.push({ key: `r${i}-${r}`, column: 2, label: route.title, note: `${route.project_ids.length} 个项目`, projects: route.project_ids, color: FACET_COLORS[2] });
      edges.push([`i${i}`, `r${i}-${r}`]);
    });
  });
  scene.achievements.forEach((item, a) => {
    nodes.push({ key: `a${a}`, column: 3, label: item.title, note: `${item.project_ids.length} 个项目`, projects: item.project_ids, color: FACET_COLORS[3] });
    const routes = nodes.filter((n) => n.column === 2 && shares(n.projects, item.project_ids));
    const from = routes.length ? routes : nodes.filter((n) => n.column === 1 && shares(n.projects, item.project_ids));
    from.forEach((n) => edges.push([n.key, `a${a}`]));
  });
  return { nodes, edges };
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
  const refs = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<{ key: string; d: string; on: boolean }[]>([]);
  const lit = chain(selected, edges);

  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current?.getBoundingClientRect();
      if (!root) return;
      setLines(edges.flatMap(([a, b]) => {
        const from = refs.current.get(a)?.getBoundingClientRect();
        const to = refs.current.get(b)?.getBoundingClientRect();
        if (!from || !to) return [];
        const x1 = from.right - root.left, y1 = from.top + from.height / 2 - root.top;
        const x2 = to.left - root.left, y2 = to.top + to.height / 2 - root.top;
        const mid = (x1 + x2) / 2;
        return [{ key: a + b, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, on: lit.has(a) && lit.has(b) }];
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [scene, selected]);

  const current = nodes.find((n) => n.key === selected)!;
  const titles = new Map((library?.projects ?? []).map((p) => [p.project_id, p.title]));
  const facet = ["场景", "问题", "技术", "成果"][current.column];
  return <section aria-label={scene.name + " 逻辑简图"} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
    <p className="text-sm font-semibold">逻辑简图 · {scene.name}</p>
    <p className="mt-1 text-xs text-[var(--steel)]">点击任一方框，高亮它所在的“场景 → 问题 → 技术 → 成果”链条，并在下方列出相关项目。成果与技术之间按共同项目连线，没有连线表示没有项目同时涉及二者。</p>
    <div ref={box} className="relative mt-3 grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-8">
      <svg aria-hidden className="pointer-events-none absolute inset-0 hidden h-full w-full md:block">
        {lines.map((line) => <path key={line.key} d={line.d} fill="none" stroke={line.on ? "#6b7280" : "#d6d9e0"} strokeWidth={line.on ? 1.8 : 1} />)}
      </svg>
      {(["场景", "问题", "技术", "成果"] as const).map((label, column) => <div key={label} className="relative flex flex-col justify-center gap-2">
        <p className="text-xs font-semibold" style={{ color: FACET_COLORS[column] }}>{label}</p>
        {nodes.filter((n) => n.column === column).map((node) => <button key={node.key} type="button"
          ref={(el) => { if (el) refs.current.set(node.key, el); else refs.current.delete(node.key); }}
          aria-pressed={selected === node.key} onClick={() => setSelected(node.key)}
          className="rounded-lg border bg-[var(--canvas)] px-2.5 py-1.5 text-left text-xs transition-opacity"
          style={{ borderColor: selected === node.key ? node.color : node.color + "55", borderLeftWidth: 3, opacity: lit.has(node.key) ? 1 : 0.35 }}>
          <span className="block font-medium text-[var(--ink)]">{node.label}</span>
          <span className="text-[11px] text-[var(--stone)]">{node.note}</span>
        </button>)}
        {!nodes.some((n) => n.column === column) ? <p className="text-xs text-[var(--stone)]">暂无条目</p> : null}
      </div>)}
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
