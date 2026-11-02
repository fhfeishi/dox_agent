import { useState } from "react";
import { MATURITY_NAMES, maturityVar } from "../../domains";
import { ZoomPan } from "../ZoomPan";

/**
 * 向右展开的框线图 (query 2026-11-02 17:09), drawn like 资料库 › 技术研判 › 五级谱系: one column per level,
 * every column keeps its siblings for comparison, and only the chosen path opens the next column.
 * Used by 关键技术 (领域 › 体系 › 方向 › 主题 › 技术条目) and 技术谱系 B (人工智能 › 领域 › … › 项目).
 */
export type BoxNode = {
  key: string; name: string;
  /** Second line: a plain description, or the project behind a technology. */
  sub?: string;
  /** Top-right figure, e.g. "120 条". */
  count?: string;
  /** Domain colour: a thin bar at the box's left edge. */
  color?: string;
  /** Maturity distribution (未判定, 1–5) drawn as a thin bar. */
  levels?: number[];
  /** A single maturity level, for a technology or a project. */
  tier?: number;
  children?: BoxNode[];
  /** Children are being read. */
  loading?: boolean;
};

const NODE_H = 58, ROW = 66, TOP = 40, GAP = 40, SHOWN = 12;
const clip = (text: string, width: number, size: number) => {
  const room = Math.max(3, Math.floor(width / size));
  return text.length > room ? text.slice(0, room - 1) + "…" : text;
};

export function BoxTree({ root, path, onPath, heads, widths, label, fill = false }: {
  root: BoxNode;
  /** Chosen keys below the root, one per column. */
  path: string[];
  onPath: (path: string[]) => void;
  /** Column titles, the root's first. */
  heads: string[];
  /** Column widths; the last one repeats. */
  widths?: number[];
  label: string;
  /** Take the height of the surrounding flex column. */
  fill?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const width = (c: number) => widths?.[Math.min(c, widths.length - 1)] ?? 190;
  // Columns: the root, then the children of each chosen node, as far as the path goes.
  const columns: { parent: BoxNode | null; nodes: BoxNode[]; more: number; loading?: boolean }[] = [{ parent: null, nodes: [root], more: 0 }];
  let parent: BoxNode | undefined = root;
  for (let depth = 0; parent; depth += 1) {
    if (parent.loading) { columns.push({ parent, nodes: [], more: 0, loading: true }); break; }
    if (!parent.children?.length) break;
    const chosen: BoxNode | undefined = parent.children.find((n) => n.key === path[depth]);
    let nodes: BoxNode[] = open.has(parent.key) ? parent.children : parent.children.slice(0, SHOWN);
    if (chosen && !nodes.includes(chosen)) nodes = [...nodes, chosen];
    columns.push({ parent, nodes, more: parent.children.length - nodes.length });
    parent = chosen;
  }
  const rows = (c: number) => columns[c].nodes.length + (columns[c].more || columns[c].loading ? 1 : 0);
  // Each column centres on its chosen parent where it can, so the fan of lines stays short.
  const tops: number[] = [];
  columns.forEach((col, c) => {
    if (c === 0) { tops.push(TOP); return; }
    const at = columns[c - 1].nodes.indexOf(col.parent!);
    const mid = tops[c - 1] + at * ROW + NODE_H / 2;
    tops.push(Math.max(TOP, mid - (rows(c) * ROW - (ROW - NODE_H)) / 2));
  });
  const xs: number[] = [];
  columns.forEach((_, c) => xs.push(c ? xs[c - 1] + width(c - 1) + GAP : 8));
  const svgW = xs[columns.length - 1] + width(columns.length - 1) + 8;
  const svgH = Math.max(240, ...columns.map((_, c) => tops[c] + rows(c) * ROW)) + 8;
  const y = (c: number, i: number) => tops[c] + i * ROW;
  const onPathAt = (c: number, node: BoxNode) => c === 0 || path[c - 1] === node.key;
  const choose = (c: number, node: BoxNode) => { if (c > 0) onPath([...path.slice(0, c - 1), node.key]); };

  return <ZoomPan refit={path.join("|")} width={svgW} height={svgH} label={label} minHeight={420} minFit={0.78} alignEnd fill={fill}>
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} role="group" aria-label={label} className="box-tree">
      {columns.map((_, c) => <text key={`h${c}`} x={xs[c] + 2} y={24} className="box-tree-head">{heads[c] ?? ""}</text>)}
      {columns.slice(1).map((col, c1) => {
        const c = c1 + 1, from = columns[c - 1].nodes.indexOf(col.parent!);
        const x1 = xs[c - 1] + width(c - 1), y1 = y(c - 1, from) + NODE_H / 2, x2 = xs[c], mid = (x1 + x2) / 2;
        return col.nodes.map((node, i) => {
          const y2 = y(c, i) + NODE_H / 2, on = onPathAt(c, node);
          return <path key={`e${node.key}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
            className={on ? "box-tree-edge is-on" : "box-tree-edge"} />;
        });
      })}
      {columns.map((col, c) => <g key={`c${c}`}>
        {col.nodes.map((node, i) => {
          const on = onPathAt(c, node), w = width(c), nx = xs[c], ny = y(c, i);
          const total = node.levels?.reduce((s, v) => s + v, 0) ?? 0;
          let lx = nx + 14;
          return <g key={node.key} role="button" tabIndex={0} aria-pressed={on} aria-label={`${heads[c] ?? ""}：${node.name}`}
            className="box-tree-node" data-key={node.key} onClick={() => choose(c, node)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(c, node); } }}>
            <title>{[node.name, node.sub, node.count].filter(Boolean).join("\n")}</title>
            <rect x={nx} y={ny} width={w} height={NODE_H} rx={8} className={on ? "box-tree-box is-on" : "box-tree-box"} />
            {node.color ? <rect x={nx} y={ny + 10} width={4} height={NODE_H - 20} rx={2} fill={node.color} /> : null}
            <text x={nx + 14} y={ny + 22} className="box-tree-name">{clip(node.name, w - (node.count ? 78 : 28), 13.5)}</text>
            {node.count ? <text x={nx + w - 12} y={ny + 22} textAnchor="end" className="box-tree-count">{node.count}</text> : null}
            {node.tier !== undefined ? <g>
              <rect x={nx + 14} y={ny + 33} width={10} height={10} rx={2} fill={node.tier ? maturityVar(node.tier) : "var(--m-0)"} />
              <text x={nx + 30} y={ny + 42} className="box-tree-sub">{clip(`${node.tier ? `${node.tier} ` : ""}${MATURITY_NAMES[node.tier] ?? "未判定"}${node.sub ? ` · ${node.sub}` : ""}`, w - 44, 12)}</text>
            </g> : total ? <g aria-hidden="true">
              {node.levels!.map((v, k) => { if (!v) return null; const bw = (v / total) * (w - 28), x = lx; lx += bw;
                return <rect key={k} x={x} y={ny + 37} width={bw} height={5} fill={`var(--m-${k})`} />; })}
              {node.sub ? <text x={nx + 14} y={ny + 52} className="box-tree-sub is-small">{clip(node.sub, w - 28, 11)}</text> : null}
            </g> : node.sub ? <text x={nx + 14} y={ny + 42} className="box-tree-sub">{clip(node.sub, w - 28, 12)}</text> : null}
          </g>;
        })}
        {col.loading ? <text x={xs[c] + 4} y={y(c, 0) + NODE_H / 2} className="box-tree-sub" role="status">正在读取…</text> : null}
        {col.more ? <g role="button" tabIndex={0} aria-label={`显示其余 ${col.more} 项`} className="box-tree-node"
          onClick={() => setOpen(new Set([...open, col.parent!.key]))}
          onKeyDown={(e) => { if (e.key === "Enter") setOpen(new Set([...open, col.parent!.key])); }}>
          <rect x={xs[c]} y={y(c, col.nodes.length)} width={width(c)} height={NODE_H - 16} rx={8} className="box-tree-box is-more" />
          <text x={xs[c] + width(c) / 2} y={y(c, col.nodes.length) + 26} textAnchor="middle" className="box-tree-sub">还有 {col.more} 项 · 显示全部</text>
        </g> : null}
      </g>)}
    </svg>
  </ZoomPan>;
}
