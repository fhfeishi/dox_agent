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

const TOP = 40, GAP = 40, SHOWN = 12;
// A window taller than the drawing's natural height would otherwise just centre a small picture in
// a large frame (query 2026-11-04). Scaling the drawing's own units — boxes, gaps, type — spends the
// height on legibility instead. Bounded so a very tall window does not turn into giant boxes.
const MAX_SCALE = 2.4;
const clip = (text: string, width: number, size: number) => {
  const room = Math.max(3, Math.floor(width / size));
  return text.length > room ? text.slice(0, room - 1) + "…" : text;
};

export function BoxTree({ root, path, onPath, heads, widths, label, fill = false, height, widthScale = 1, font = 14 }: {
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
  /** Window height in px; the drawing scales its own units to use it. */
  height?: number;
  /** Column widths, so the caller can fit the drawing to the window's width. */
  widthScale?: number;
  /** The page's --text-body in px; the drawing's labels follow the same scale (2K/4K step it up). */
  font?: number;
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
  // The tallest column decides the drawing's natural height; a taller window lets the rows grow
  // (bounded), so the extra space becomes taller boxes and larger type rather than empty margin.
  const mostRows = Math.max(1, ...columns.map((_, c) => rows(c)));
  // Type is driven by the page's own type scale, not a hard-coded 13.5 px: at 2K/4K --text-body
  // steps to 15/17 px and the drawing's labels must step with it, or the chart looks finer than
  // everything around it. 0.9 × --text-body is the name size the design already used at 14 px.
  const body = font || 14;
  const type = body * 0.95, subType = body * 0.86, countType = body * 0.79, headType = body * 0.86;
  // The box is then as tall as its three bands plus equal padding, so the sub line can never be
  // pushed to the bottom edge (4K left only 5 px under it).
  // The box is a card with its own rows, never overlapping: name, sub line, then the level bar as
  // a footer strip with equal padding below it. The bar used to sit between the two lines, where it
  // read as a rule crossing the text (query 2026-11-04 follow-up).
  const padY = body * 0.62, nameH = body * 1.25, subH = body * 1.15, barBand = body * 0.55;
  const barH = body * 0.24;
  const boxWithSub = padY + nameH + subH + barBand + padY;
  const nameY = padY + nameH * 0.76;                       // baseline of the name line
  const subY = padY + nameH + subH * 0.78;                 // baseline of the sub line
  const barY = padY + nameH + subH + (barBand - barH) / 2; // bar centred in its footer band
  // Rows may breathe more than the box itself: the row pitch grows with the window so a tall screen
  // spreads the tree out, while the box keeps its content-driven height.
  const natural = TOP * (body / 14) + mostRows * (boxWithSub + body * 0.75);
  const target = height ? Math.max(240, height - 16) : 0;
  const pitch = target ? Math.min(MAX_SCALE, Math.max(1, target / natural)) : 1;
  const NODE = boxWithSub, STEP = (boxWithSub + body * 0.75) * pitch, TOPPAD = TOP * (body / 14) * pitch;
  const inner = 1;
  // Column gaps belong to the horizontal scale, not the row pitch: tying them to it made the
  // drawing wider than the window, so the fit shrank it by width and wasted the height.
  const SPACE = GAP * Math.min(1.5, Math.max(1, body / 14)) * Math.min(1.3, widthScale);
  // Column widths are set by the window's width, not by the row pitch.
  const w = (c: number) => width(c) * widthScale;
  // Each column centres on its chosen parent where it can, so the fan of lines stays short.
  const tops: number[] = [];
  columns.forEach((col, c) => {
    if (c === 0) { tops.push(TOPPAD); return; }
    const at = columns[c - 1].nodes.indexOf(col.parent!);
    const mid = tops[c - 1] + at * STEP + NODE / 2;
    tops.push(Math.max(TOPPAD, mid - (rows(c) * STEP - (STEP - NODE)) / 2));
  });
  const xs: number[] = [];
  columns.forEach((_, c) => xs.push(c ? xs[c - 1] + w(c - 1) + SPACE : 8));
  // The last column ends at the window's right edge: a drawing narrower than the window would be
  // centred by the fit and leave an empty band at both sides (4K showed this).
  const svgW = xs[columns.length - 1] + w(columns.length - 1) + 8;
  const svgH = Math.max(boxWithSub + 40, ...columns.map((_, c) => tops[c] + rows(c) * STEP)) + 8;
  const y = (c: number, i: number) => tops[c] + i * STEP;
  const onPathAt = (c: number, node: BoxNode) => c === 0 || path[c - 1] === node.key;
  const choose = (c: number, node: BoxNode) => { if (c > 0) onPath([...path.slice(0, c - 1), node.key]); };

  return <ZoomPan refit={path.join("|")} width={svgW} height={svgH} label={label}
    minHeight={height ?? 420} minFit={0.78} alignEnd fill={fill}>
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} role="group" aria-label={label} className="box-tree">
      {columns.map((_, c) => <text key={`h${c}`} x={xs[c] + 2} y={headType * 1.9} className="box-tree-head" style={{ fontSize: headType }}>{heads[c] ?? ""}</text>)}
      {columns.slice(1).map((col, c1) => {
        const c = c1 + 1, from = columns[c - 1].nodes.indexOf(col.parent!);
        const x1 = xs[c - 1] + w(c - 1), y1 = y(c - 1, from) + NODE / 2, x2 = xs[c], mid = (x1 + x2) / 2;
        return col.nodes.map((node, i) => {
          const y2 = y(c, i) + NODE / 2, on = onPathAt(c, node);
          return <path key={`e${node.key}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
            className={on ? "box-tree-edge is-on" : "box-tree-edge"} />;
        });
      })}
      {columns.map((col, c) => <g key={`c${c}`}>
        {col.nodes.map((node, i) => {
          const on = onPathAt(c, node), bw = w(c), nx = xs[c], ny = y(c, i);
          const total = node.levels?.reduce((s, v) => s + v, 0) ?? 0;
          let lx = nx + 14 * inner;
          return <g key={node.key} role="button" tabIndex={0} aria-pressed={on} aria-label={`${heads[c] ?? ""}：${node.name}`}
            className="box-tree-node" data-key={node.key} onClick={() => choose(c, node)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(c, node); } }}>
            <title>{[node.name, node.sub, node.count].filter(Boolean).join("\n")}</title>
            <rect x={nx} y={ny} width={bw} height={NODE} rx={8 * inner} className={on ? "box-tree-box is-on" : "box-tree-box"} />
            {node.color ? <rect x={nx} y={ny + padY} width={4 * inner} height={NODE - padY * 2} rx={2 * inner} fill={node.color} /> : null}
            <text x={nx + 14 * inner} y={ny + nameY} className="box-tree-name" style={{ fontSize: type }}>{clip(node.name, bw - (node.count ? 78 : 28) * inner, type)}</text>
            {node.count ? <text x={nx + bw - 12 * inner} y={ny + nameY} textAnchor="end" className="box-tree-count" style={{ fontSize: countType }}>{node.count}</text> : null}
            {node.tier !== undefined ? <g>
              <rect x={nx + 14 * inner} y={ny + barY} width={(bw - 28 * inner) * Math.max(0.02, (node.tier || 0) / 5)} height={barH} rx={barH / 2} fill={node.tier ? maturityVar(node.tier) : "var(--m-0)"} />
              <text x={nx + 14 * inner} y={ny + subY} className="box-tree-sub" style={{ fontSize: subType }}>{clip(`${node.tier ? `${node.tier} ` : ""}${MATURITY_NAMES[node.tier] ?? "未判定"}${node.sub ? ` · ${node.sub}` : ""}`, bw - 28 * inner, subType)}</text>
            </g> : total ? <g aria-hidden="true">
              {node.levels!.map((v, k) => { if (!v) return null; const seg = (v / total) * (bw - 28 * inner), x = lx; lx += seg;
                return <rect key={k} x={x} y={ny + barY} width={seg} height={barH} fill={`var(--m-${k})`} />; })}
              {node.sub ? <text x={nx + 14 * inner} y={ny + subY} className="box-tree-sub is-small" style={{ fontSize: countType }}>{clip(node.sub, bw - 28 * inner, countType)}</text> : null}
            </g> : node.sub ? <text x={nx + 14 * inner} y={ny + subY} className="box-tree-sub" style={{ fontSize: subType }}>{clip(node.sub, bw - 28 * inner, subType)}</text> : null}
          </g>;
        })}
        {col.loading ? <text x={xs[c] + 4} y={y(c, 0) + NODE / 2} className="box-tree-sub" role="status" style={{ fontSize: subType }}>正在读取…</text> : null}
        {col.more ? <g role="button" tabIndex={0} aria-label={`显示其余 ${col.more} 项`} className="box-tree-node"
          onClick={() => setOpen(new Set([...open, col.parent!.key]))}
          onKeyDown={(e) => { if (e.key === "Enter") setOpen(new Set([...open, col.parent!.key])); }}>
          <rect x={xs[c]} y={y(c, col.nodes.length)} width={w(c)} height={NODE - 16 * inner} rx={8 * inner} className="box-tree-box is-more" />
          <text x={xs[c] + w(c) / 2} y={y(c, col.nodes.length) + (NODE - 16 * inner) / 2 + 6 * inner} textAnchor="middle" className="box-tree-sub" style={{ fontSize: subType }}>还有 {col.more} 项 · 显示全部</text>
        </g> : null}
      </g>)}
    </svg>
  </ZoomPan>;
}
