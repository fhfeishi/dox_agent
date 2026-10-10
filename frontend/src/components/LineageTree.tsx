import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fieldResolver, indicators, lineageOutline, TIERS, tierOf, UNDETERMINED_FIELD, UNDETERMINED_STAGE } from "../briefing";
import {
  buildLineage, CATEGORY_COLORS, hierarchyQuery, lineageQuery, locateItem, projectQuery,
  type HierarchyEvidence, type Lineage, withBlanks,
} from "../projects";
import { useApp } from "../store";
import { EvidenceList } from "./SceneHierarchy";
import { TechTimeline } from "./TechTimeline";
import { ZoomPan } from "./ZoomPan";
import { Button } from "./ui";
import { Chips, Tier, TierCounts, tierCounts } from "./StageMarks";

/** One colour per sub-library branch, stable by its place in the library list. */
export function branchColor(corpusIds: string[], corpusId: string) {
  const index = corpusIds.indexOf(corpusId);
  return CATEGORY_COLORS[(index < 0 ? 0 : index) % CATEGORY_COLORS.length];
}

/**
 * Levels (query 2026-1010 1530 / 1537): R2 library › R3 技术体系 › R4 技术方向 › R5 方法主题 ›
 * R6 项目技术, shown only as R2–R6. Each level adds a distinction. Application field and workflow
 * stage are filters, not tree levels.
 */
type TreeNode = { key: string; name: string; level: 0 | 1 | 2 | 3 | 4; summary?: string; plain?: string; foundation?: boolean;
  muted?: boolean; color: string; items: string[]; children: TreeNode[];
  /** A knowledge node no project covers (query 2026-1010 1642), with why it belongs here. */
  blank?: boolean; reason?: string; covered?: number };
/** Level marks (query 2026-1010 1537): R2 library › R3 体系 › R4 方向 › R5 主题 › R6 项目技术; the
 * boss prefers neutral marks over level names and counts. */
const LEVEL_NAMES = ["R2", "R3", "R4", "R5", "R6"];
const SELECTED = "#4f46e5";

function buildTree(lineage: Lineage): TreeNode {
  const byStage = (a: string, b: string) => (lineage.items[b]?.maturity ?? 0) - (lineage.items[a]?.maturity ?? 0);
  const categories = lineage.categories.map((category, c): TreeNode => {
    const color = category.unplaced ? "#9aa3b2" : CATEGORY_COLORS[c % CATEGORY_COLORS.length];
    const children = category.children.map((child, d): TreeNode => {
      const themes = child.themes.map((theme, t): TreeNode => ({
        key: `t:${c}:${d}:${t}`, name: theme.name, level: 3, plain: theme.plain, color, muted: category.unplaced, items: theme.items, blank: theme.blank, reason: theme.reason, covered: theme.covered,
        children: [...theme.items].sort(byStage).map((id): TreeNode => ({ key: `i:${id}`, level: 4, items: [id], children: [], color,
          name: lineage.items[id]?.name ?? id })),
      }));
      return { key: `d:${c}:${d}`, name: child.name, level: 2, plain: child.plain, foundation: child.foundation, color, blank: child.blank, reason: child.reason, covered: child.covered,
        muted: category.unplaced, items: themes.flatMap((t) => t.items), children: themes };
    });
    return { key: `c:${c}`, name: category.name, level: 1, summary: category.summary, plain: category.plain, color, blank: category.blank, reason: category.reason, covered: category.covered,
      muted: category.unplaced, items: children.flatMap((d) => d.items), children };
  });
  return { key: "root", name: lineage.branch.replace(/^自然科学基金-/, ""), level: 0, color: "#64748b",
    items: categories.flatMap((c) => c.items), children: categories };
}

function find(node: TreeNode, key: string, path: TreeNode[] = []): TreeNode[] | null {
  if (node.key === key) return [...path, node];
  for (const child of node.children) {
    const hit = find(child, key, [...path, node]);
    if (hit) return hit;
  }
  return null;
}

/** Fits text to a pixel width at a font size; CJK glyphs are about one em wide. */
function clip(text: string, width: number, size: number) {
  const room = Math.max(3, Math.floor(width / size));
  return text.length > room ? text.slice(0, room - 1) + "…" : text;
}

const COL_W = 262, GAP = 56, NODE_H = 54, ROW = 62, TOP = 52, SHOWN = 12;

/**
 * 技术谱系图 (query 2026-1010 1124 / 1530): one column per level. Every column keeps its
 * siblings for comparison; only the selected path opens the next column. Cards are two lines —
 * professional name and a plain line — with the matching project count; a project technique
 * carries its report-described stage instead. Filters dim branches without matches (count 0).
 */
function LineageColumns({ path, lineage, match, projects, onSelect }: {
  path: TreeNode[]; lineage: Lineage; match: Set<string>; projects: (ids: string[]) => number; onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const hits = (node: TreeNode) => node.items.filter((id) => match.has(id));
  // The library itself is the first column (R2), so all five levels R2–R6 are drawn.
  const columns: { parent: TreeNode; nodes: TreeNode[]; more: number }[] = [{ parent: { ...path[0], key: "", children: [path[0]] }, nodes: [path[0]], more: 0 }];
  for (let i = 0; i < path.length; i += 1) {
    const parent = path[i];
    if (!parent.children.length) break;
    // Branches by matching projects (the unplaced bucket last); techniques keep stage order.
    const sorted = parent.children[0].level === 4 ? parent.children
      : [...parent.children].sort((a, b) => Number(Boolean(a.muted)) - Number(Boolean(b.muted)) || projects(hits(b)) - projects(hits(a)));
    const chosen = path[i + 1];
    let nodes = open.has(parent.key) ? sorted : sorted.slice(0, SHOWN);
    if (chosen && !nodes.includes(chosen)) nodes = [...nodes, chosen];
    columns.push({ parent, nodes, more: sorted.length - nodes.length });
  }
  // Each column centres on its selected parent where it can, so the fan of edges stays short.
  const rowsOf = (c: number) => columns[c].nodes.length + (columns[c].more ? 1 : 0);
  const tops: number[] = [];
  columns.forEach((col, c) => {
    if (c === 0) { tops.push(TOP); return; }
    const parentMid = tops[c - 1] + columns[c - 1].nodes.indexOf(col.parent) * ROW + NODE_H / 2;
    tops.push(Math.max(TOP, parentMid - (rowsOf(c) * ROW - (ROW - NODE_H)) / 2));
  });
  const height = Math.max(260, ...columns.map((_, c) => tops[c] + rowsOf(c) * ROW)) + 10;
  const width = columns.length * (COL_W + GAP) - GAP + 24;
  const x = (c: number) => 12 + c * (COL_W + GAP);
  const y = (c: number, i: number) => tops[c] + i * ROW;

  return <ZoomPan key={columns.map((col) => col.parent.key).join("|")} width={width} height={height} label="技术谱系图谱" minHeight={360} minFit={0.72} alignEnd fill>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="技术谱系图谱">
      {columns.map((col, c) => <text key={`h${c}`} x={x(c)} y={36} fontSize={12} fontWeight={700} fill="#8a90a6">
        {LEVEL_NAMES[c]}</text>)}
      {columns.slice(1).map((col, c1) => {
        const c = c1 + 1;
        const x1 = x(c - 1) + COL_W, y1 = y(c - 1, columns[c - 1].nodes.indexOf(col.parent)) + NODE_H / 2;
        return col.nodes.map((node, i) => {
          const on = path.includes(node);
          const x2 = x(c), y2 = y(c, i) + NODE_H / 2, mid = (x1 + x2) / 2;
          return <path key={`e${node.key}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none"
            stroke={on ? SELECTED : "#cfd4de"} strokeWidth={on ? 2 : 1.1} />;
        });
      })}
      {columns.map((col, c) => <g key={`c${c}`}>
        {col.nodes.map((node, i) => {
          const selected = path.includes(node);
          const leaf = node.level === 4;
          const count = projects(hits(node));
          const item = leaf ? lineage.items[node.items[0]] : null;
          const dim = leaf ? !match.has(node.items[0]) : count === 0 && !node.blank;
          const nx = x(c), ny = y(c, i);
          const tier = item ? tierOf(item.maturity) : null;
          const sub = node.blank ? (node.covered ? `萌芽 · 另有 ${node.covered} 个项目零散涉及` : `空白 · ${node.plain ?? "本库项目未涉及"}`) : node.foundation ? `共性底座 · ${node.plain ?? ""}` : node.plain ?? "";
          return <g key={node.key} role="button" tabIndex={0} aria-label={`${LEVEL_NAMES[node.level]}：${node.name}`} aria-pressed={selected}
            className="cursor-pointer" opacity={dim ? 0.38 : 1}
            onClick={() => onSelect(node.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(node.key); } }}>
            <title>{[node.name, node.plain, leaf ? "" : `${count} 个项目`].filter(Boolean).join("\n")}</title>
            <rect x={nx} y={ny} width={COL_W} height={NODE_H} rx={10} fill={selected ? "#eef0ff" : node.blank ? "#f8f9fb" : "#fff"}
              stroke={selected ? SELECTED : node.blank ? "#b6bec8" : "#dde1ea"} strokeWidth={selected ? 2 : 1} strokeDasharray={node.blank && !selected ? "5 4" : undefined} />
            {node.blank ? null : <rect x={nx} y={ny + 9} width={4} height={NODE_H - 18} rx={2} fill={node.color} />}
            <text x={nx + 14} y={ny + 22} fontSize={13.5} fontWeight={700} fill={node.blank ? "#6b7280" : "#1f2937"}>{clip(node.name, COL_W - (leaf ? 30 : 92), 13.5)}</text>
            {leaf ? null : <text x={nx + COL_W - 12} y={ny + 21} textAnchor="end" fontSize={10.5} fill={count ? "#8a90a6" : "#b8bec9"}>{node.blank ? (node.covered ? "萌芽" : "空白") : `${count} 项目`}</text>}
            {leaf && tier ? <g>
              <rect x={nx + 14} y={ny + 31} width={tier.label.length * 11 + 12} height={16} rx={8} fill={tier.color} />
              <text x={nx + 20} y={ny + 43} fontSize={10.5} fontWeight={700} fill="#fff">{tier.label}</text>
            </g> : <text x={nx + 14} y={ny + 41} fontSize={11.5} fill="#6b7280">{clip(sub, COL_W - 28, 11.5)}</text>}
          </g>;
        })}
        {col.more ? <g role="button" tabIndex={0} aria-label={`显示其余 ${col.more} 项`} className="cursor-pointer"
          onClick={() => setOpen(new Set([...open, col.parent.key]))}
          onKeyDown={(e) => { if (e.key === "Enter") setOpen(new Set([...open, col.parent.key])); }}>
          <rect x={x(c)} y={y(c, col.nodes.length)} width={COL_W} height={NODE_H - 14} rx={10} fill="#fff" stroke="#cfd4de" strokeDasharray="5 4" />
          <text x={x(c) + COL_W / 2} y={y(c, col.nodes.length) + 25} textAnchor="middle" fontSize={12} fill="#6b7280">还有 {col.more} 项 · 显示全部</text>
        </g> : null}
      </g>)}
    </svg>
  </ZoomPan>;
}

type TargetRecord = {
  facets: { key: string; items: { id: string; name: string; evidence?: { quote: string; locator: HierarchyEvidence["locator"]; version?: string }[] }[] }[];
  relations?: { from: { dimension: string; item_id: string }; to: { dimension: string; item_id: string }; type: string;
    evidence?: { quote: string }[] }[];
};

/** Pane height: both panes share it on wide screens, so the lineage and its detail line up. */
const PANE_H = "max(600px, calc(100vh - 150px))";

/** Left/right panes of equal height with a draggable divider on wide screens; stacked on narrow ones. */
function SplitPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches);
  const [share, setShare] = useState(() => {
    try { return Math.min(75, Math.max(35, Number(localStorage.getItem("dox-lineage-split")) || 60)); } catch { return 60; }
  });
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const save = (value: number) => { try { localStorage.setItem("dox-lineage-split", String(value)); } catch { /* preference only */ } };
  const set = (value: number) => { const next = Math.min(75, Math.max(35, value)); setShare(next); return next; };
  if (!wide) return <div className="grid gap-4"><div style={{ height: PANE_H }}>{left}</div>{right}</div>;
  return <div ref={box} className="flex" style={{ height: PANE_H }}>
    <div className="h-full min-w-0" style={{ width: `${share}%` }}>{left}</div>
    <div role="separator" aria-orientation="vertical" aria-label="调整左右窗格宽度" aria-valuemin={35} aria-valuemax={75} aria-valuenow={Math.round(share)} tabIndex={0}
      className="group mx-1 flex w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center self-stretch rounded hover:bg-[var(--primary-soft)]"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId) || !box.current) return;
        const rect = box.current.getBoundingClientRect();
        set(((e.clientX - rect.left) / rect.width) * 100);
      }}
      onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); save(share); }}
      onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); save(set(share + (e.key === "ArrowLeft" ? -3 : 3))); } }}>
      <span className="h-12 w-1 rounded-full bg-[var(--hairline-strong)] group-hover:bg-[var(--primary)]" />
    </div>
    <div className="h-full min-w-0 flex-1">{right}</div>
  </div>;
}

/** A section of the detail panel: a small heading and its body. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-t border-[var(--hairline)] pt-3 first:border-t-0 first:pt-0">
    <h4 className="mb-1.5 text-[12px] font-semibold tracking-wide text-[var(--stone)]">{title}</h4>
    <div className="space-y-1.5 text-[13px] leading-6">{children}</div>
  </section>;
}

/**
 * 技术谱系 · 细节 (query 2026-1010 1124 / 1530): field and stage filters, the column diagram, and
 * a detail panel ordered 技术定位 → 应用任务 → 实现与配套 → 项目与成果 → 原文依据.
 */
export function LineageTree({ corpusId, focus, onFocus, onIssue }: {
  corpusId: string; focus: string; onFocus: (key: string) => void; onIssue: (scene: string) => void;
}) {
  const { corpora, showInspector } = useApp();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const { data, isPending, error } = useQuery({
    ...lineageQuery(corpusId),
    refetchInterval: (query) => query.state.data?.job ? 3000 : false,
  });
  const { data: library } = useQuery(projectQuery(corpusId));
  const { data: hierarchy } = useQuery(hierarchyQuery(corpusId));
  const run = useMutation({
    mutationFn: () => buildLineage(corpusId),
    onSuccess: (value) => { setNotice(""); client.setQueryData(["library", corpusId, "lineage"], value); },
    onError: (reason: Error) => setNotice(reason.message),
  });
  const root = useMemo(() => data ? buildTree(withBlanks(data)) : null, [data]);
  const path = root ? find(root, focus || "root") ?? [root] : [];
  const node = path[path.length - 1];
  const leafId = node?.level === 4 ? node.items[0] : "";
  const leaf = leafId && data ? data.items[leafId] : null;
  // The technique's own report record: original evidence and relations stated in the text.
  const source = useMemo(() => {
    const p = leaf ? library?.projects.find((project) => project.project_id === leaf.project_id) : undefined;
    const hit = p?.facets["技术"]?.items.find((it) => it.id === leaf?.item_id);
    return hit ? { docId: hit.doc_id, version: hit.version } : null;
  }, [leaf, library]);
  const target = useQuery({
    queryKey: ["library", corpusId, "target", source?.docId],
    enabled: Boolean(source),
    queryFn: async (): Promise<TargetRecord> => {
      const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/reports/${encodeURIComponent(source!.docId)}/target`);
      if (!response.ok) throw new Error("原文提取记录不可用");
      return response.json();
    },
  });

  if (isPending) return <p role="status" className="py-4 text-sm text-[var(--steel)]">正在读取技术谱系…</p>;
  if (error || !data || !root || !node) return <p role="alert" className="py-4 text-sm text-[var(--red)]">{error?.message ?? "技术谱系不可用"}</p>;

  const resolve = fieldResolver(data);
  const stageNames = (data.stages ?? []).map((s) => s.name);
  const stageOf = (id: string) => stageNames.includes(data.items[id]?.stage ?? "") ? data.items[id].stage! : UNDETERMINED_STAGE;
  const all = Object.keys(data.items);
  const match = new Set(all.filter((id) => (!fields.length || fields.includes(resolve.of(id))) && (!stages.length || stages.includes(stageOf(id)))));
  const projectCount = (items: string[]) => new Set(items.map((id) => data.items[id]?.project_id)).size;
  const matched = (items: string[]) => items.filter((id) => match.has(id));
  const filtered = fields.length > 0 || stages.length > 0;
  const color = branchColor(corpora.map((c) => c.id), corpusId);
  const projects = new Map((library?.projects ?? []).map((p) => [p.project_id, p]));
  const periods = new Map([...projects].map(([id, p]) => [id, { title: p.title, start: p.start_year, end: p.end_year }]));
  const open = (projectId: string) => showInspector({ kind: "project", corpusId, projectId, facet: "技术" });
  const running = data.job?.status === "进行中";
  const generate = <Button size="sm" variant={data.state === "missing" ? "primary" : "ghost"} disabled={run.isPending || running} onClick={() => run.mutate()}>
    {running ? "正在生成…" : data.state === "missing" ? "生成技术谱系" : "重新生成"}</Button>;
  const outline = async () => {
    const name = corpora.find((c) => c.id === corpusId)?.name.replace(/^自然科学基金-/, "") ?? root.name;
    try { await navigator.clipboard.writeText(lineageOutline(name, data)); setNotice("已复制谱系大纲（Markdown）"); }
    catch { setNotice("复制失败，请检查浏览器剪贴板权限"); }
  };
  const toggle = (list: string[], set: (v: string[]) => void, value: string) => set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const chip = (on: boolean) => `rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline)] bg-[var(--surface)] text-[var(--slate)] hover:bg-[var(--canvas)]"}`;
  const groupOf = (itemId: string) => {
    const at = locateItem(data, itemId);
    if (!at) return "未归入体系的条目";
    return node.level === 0 ? at.category.name : node.level === 1 ? at.child.name : at.theme.name;
  };
  const tally = (values: string[]) => [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  const record = target.data;
  const evidence: HierarchyEvidence[] = record && leaf && source
    ? (record.facets.find((f) => f.key === "技术")?.items.find((it) => it.id === leaf.item_id)?.evidence ?? [])
      .map((e) => ({ item_id: leaf.item_id, doc_id: source.docId, version: e.version ?? source.version, quote: e.quote, locator: e.locator }))
    : [];
  const nameOf = (dimension: string, itemId: string) => record?.facets.find((f) => f.key === dimension)?.items.find((it) => it.id === itemId)?.name ?? itemId;
  const stated = record && leaf ? (record.relations ?? []).filter((r) => r.type === "配套" && (r.from.item_id === leaf.item_id || r.to.item_id === leaf.item_id)) : [];
  const aimed = record && leaf ? (record.relations ?? []).filter((r) => r.type === "针对" && r.from.item_id === leaf.item_id) : [];
  const companions = leaf ? all.filter((id) => id !== leafId && data.items[id].project_id === leaf.project_id) : [];
  const typical = leaf ? (hierarchy?.scenes ?? []).flatMap((scene) => scene.issues.flatMap((issue) =>
    issue.routes.filter((route) => route.item_ids.includes(leaf.item_id) && route.project_ids.includes(leaf.project_id))
      .map(() => ({ scene: scene.name, issue: issue.name, state: issue.state })))) : [];
  const outcomes = leaf ? (projects.get(leaf.project_id)?.facets["成果"]?.items ?? []).filter((o) => o.status === "已取得").slice(0, 4) : [];
  const at = leaf ? locateItem(data, leafId) : null;
  const project = leaf ? projects.get(leaf.project_id) : undefined;

  return <SplitPane left={
    <div className="flex h-full flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: color }} />
        <b style={{ color }}>{root.name}</b>
        <span className="text-xs text-[var(--stone)] tabular-nums">{projectCount(root.items)} 项目 · {root.items.length} 条技术</span>
        <span className="flex-1" />
        {data.categories.length ? <Button size="sm" variant="ghost" onClick={() => void outline()}>复制谱系大纲</Button> : null}
        {generate}
      </div>
      {running ? <div role="status" className="mb-2 text-xs text-[var(--steel)]">正在归类与判定报告所述阶段 {data.job!.done}/{data.job!.total} 条（大库约需数分钟，可离开本页）
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--hairline)]"><span className="block h-full bg-[var(--primary)]" style={{ width: `${data.job!.done / Math.max(1, data.job!.total) * 100}%` }} /></span></div> : null}
      {notice ? <p role={notice.startsWith("已复制") ? "status" : "alert"} className={`mb-2 text-xs ${notice.startsWith("已复制") ? "text-[var(--steel)]" : "text-[var(--red)]"}`}>{notice}</p> : null}
      {data.error ? <p role="alert" className="mb-2 text-xs text-[var(--red)]">上次生成未完成：{data.error}{data.categories.length ? "，下方为之前的结果。" : ""}</p> : null}
      {data.state === "stale" && !running ? <p className="mb-2 text-xs text-[#9a6500]">{data.stale_reason || "四维技术条目已变化"}，谱系需要重新生成。</p> : null}
      {!data.categories.length ? <p className="text-sm text-[var(--steel)]">{running ? "生成完成后显示。" : "尚未生成。生成时由模型把本库全部项目的技术条目归入“体系 › 方向 › 主题”，并依据各项目报告判定所述阶段；条目名称保持原样。"}</p> : <>
        <div aria-label="谱系筛选" className="mb-3 space-y-1.5 rounded-lg bg-[var(--canvas)] px-3 py-2.5">
          {([["应用领域", [...resolve.names, UNDETERMINED_FIELD], fields, setFields, (v: string) => (id: string) => resolve.of(id) === v],
            ["业务环节", [...stageNames, UNDETERMINED_STAGE], stages, setStages, (v: string) => (id: string) => stageOf(id) === v]] as const).map(([label, values, list, set, test]) =>
            <div key={label} className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 shrink-0 text-xs text-[var(--steel)]">{label}</span>
              {values.map((v) => { const n = all.filter(test(v)).length; return n ? <button key={v} type="button" aria-pressed={list.includes(v)} className={chip(list.includes(v))}
                onClick={() => toggle(list, set, v)}>{v} <span className="tabular-nums opacity-70">{n}</span></button> : null; })}
            </div>)}
          {filtered ? <p role="status" className="pt-0.5 text-xs text-[var(--steel)]">已筛选 {[...fields, ...stages].join("、")} · 匹配 {projectCount([...match])} 个项目、{match.size} 条技术
            <button type="button" className="ml-2 text-[var(--link)] hover:underline" onClick={() => { setFields([]); setStages([]); }}>恢复全部</button></p> : null}
        </div>
        <nav aria-label="谱系位置" className="mb-2 flex flex-wrap items-center gap-1 text-xs">
          {path.map((n, i) => <span key={n.key} className="flex items-center gap-1">{i ? <span className="text-[var(--stone)]">›</span> : null}
            {i < path.length - 1 ? <button type="button" onClick={() => onFocus(n.key)} className="rounded px-1 text-[var(--link)] hover:bg-[var(--canvas)]">{n.name}</button>
              : <b className="px-1">{n.name}</b>}</span>)}
        </nav>
        <LineageColumns path={path} lineage={data} match={match} projects={projectCount} onSelect={onFocus} />
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--steel)]">项目技术的报告所述阶段：
          {TIERS.map((tier) => <span key={tier.label} className="inline-flex items-center gap-1"><Tier level={tier.min} />
            <span className="text-[var(--stone)]">{tier.min === 5 ? "5 级" : tier.min === 4 ? "4 级" : tier.min === 2 ? "2–3 级" : "0–1 级"}</span></span>)}</p>
      </>}
      {data.gaps.length ? <p className="mt-2 text-xs text-[var(--stone)]">{data.gaps.join("；")}</p> : null}
    </div>} right={
    <aside aria-label="技术详情" className="h-full space-y-3 overflow-y-auto rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      {!data.categories.length ? <p className="text-sm text-[var(--steel)]">生成后，点击左侧图谱中的任一节点查看技术定位、应用任务、项目与原文依据。</p> : leaf ? <>
        <Section title="技术定位">
          <h3 className="text-base font-semibold leading-6" style={{ color: node.color }}>{leaf.name}</h3>
          {at ? <p className="text-xs text-[var(--steel)]">{at.category.name} › {at.child.name} › {at.theme.name}</p> : null}
          {at?.theme.plain ? <p className="rounded-md bg-[var(--canvas)] px-2 py-1">{at.theme.plain}</p> : null}
          {leaf.desc ? <p className="text-[var(--slate)]">{leaf.desc}</p> : null}
        </Section>
        <Section title="应用任务">
          <p>应用领域：{resolve.of(leafId)}<span className="mx-1.5 text-[var(--stone)]">·</span>业务环节：{stageOf(leafId)}</p>
          {aimed.length ? <p>原文所述针对问题：{aimed.map((r) => nameOf("问题", r.to.item_id)).join("；")}</p> : null}
          {typical.map((t, i) => <p key={i}>典型技术：<button type="button" onClick={() => onIssue(t.scene)} className="text-[var(--link)] hover:underline">{t.issue}</button>
            <span className="text-xs text-[var(--stone)]"> · {t.scene} · {t.state}</span></p>)}
        </Section>
        <Section title="实现与配套">
          {stated.length ? stated.map((r, i) => { const other = r.from.item_id === leaf.item_id ? r.to.item_id : r.from.item_id;
            return <p key={i}>原文明示配套：<b>{nameOf("技术", other)}</b>{r.evidence?.[0] ? <span className="block text-xs leading-5 text-[var(--steel)]">“{r.evidence[0].quote}”</span> : null}</p>; })
            : <p className="text-xs text-[var(--stone)]">原文未明示与其他技术的配套关系。</p>}
          {companions.length ? <div><p className="text-xs text-[var(--stone)]">同项目还涉及的技术（同一报告中出现，不代表配套或依赖）</p>
            <div className="mt-1 flex flex-wrap gap-1.5">{companions.map((id) => <button key={id} type="button" onClick={() => onFocus(`i:${id}`)}
              className="rounded border border-[var(--hairline)] px-2 py-0.5 text-xs text-[var(--link)] hover:bg-[var(--canvas)]">{data.items[id].name}</button>)}</div></div> : null}
        </Section>
        <Section title="项目与成果">
          <p><button type="button" onClick={() => open(leaf.project_id)} className="text-left text-[var(--link)] hover:underline">{project?.title ?? leaf.project_id}</button>
            <span className="ml-1 text-xs text-[var(--stone)]">{project?.start_year ?? "?"}–{project?.end_year ?? "?"}</span></p>
          <p className="flex flex-wrap items-center gap-1.5">报告所述阶段：<Tier level={leaf.maturity} /><span>{leaf.maturity} {data.maturity_levels[leaf.maturity]}</span>
            <Chips list={indicators([leaf.basis, leaf.desc])} /></p>
          {leaf.basis ? <p className="text-xs text-[var(--steel)]">判定依据（本项目）：{leaf.basis}</p> : null}
          {outcomes.length ? <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-[var(--slate)]">{outcomes.map((o) => <li key={o.id}>{o.name}</li>)}</ul> : null}
        </Section>
        <Section title="原文依据">
          {source && target.isPending ? <p className="text-xs text-[var(--stone)]">正在读取原文依据…</p>
            : target.error ? <p className="text-xs text-[var(--red)]">{(target.error as Error).message}</p>
            : <EvidenceList corpusId={corpusId} evidence={evidence} limit={2} staleHint="请重新整理该文件" />}
        </Section>
      </> : node.blank ? <>
        <Section title="技术定位">
          <p className="text-xs text-[var(--stone)]">{LEVEL_NAMES[node.level]} · {node.covered ? "萌芽节点" : "空白节点"}</p>
          <h3 className="text-base font-semibold leading-6 text-[var(--slate)]">{node.name}</h3>
          {node.plain ? <p className="rounded-md bg-[var(--canvas)] px-2 py-1">{node.plain}</p> : null}
        </Section>
        <Section title="为什么列出">
          {node.reason ? <p>{node.reason}</p> : null}
          <p className="rounded-md border border-dashed border-[var(--hairline-strong)] px-2 py-1.5 text-xs leading-5 text-[var(--steel)]">
            {node.covered ? `本库没有以此为主的方向；按技术名称检索，约 ${node.covered} 个项目零散涉及，归在谱系的其他节点下。` : "本库项目均未涉及该方向。"}
            该节点依据领域通用知识补充，用来呈现谱系全貌与本库尚未覆盖的部分，不是本库原文的归纳，不计入任何统计。</p>
        </Section>
      </> : <>
        <Section title="技术定位">
          <p className="text-xs text-[var(--stone)]">{LEVEL_NAMES[node.level]}</p>
          <h3 className="text-base font-semibold leading-6" style={{ color: node.level ? node.color : color }}>{node.name}</h3>
          {node.plain ? <p className="rounded-md bg-[var(--canvas)] px-2 py-1">{node.plain}</p> : null}
          {node.summary ? <p className="text-xs text-[var(--steel)]">边界：{node.summary}</p> : null}
          {node.foundation ? <p className="text-xs text-[#4a2a8f]">共性底座：支撑其他技术的数据、协同与可信能力。</p> : null}
        </Section>
        <Section title="应用任务">
          {([["应用领域", tally(matched(node.items).map((id) => resolve.of(id))).slice(0, 8), fields, setFields],
            ["业务环节", tally(matched(node.items).map(stageOf)), stages, setStages]] as const).map(([label, rows, list, set]) =>
            <div key={label} className="flex flex-wrap items-center gap-1.5"><span className="w-14 shrink-0 text-xs text-[var(--steel)]">{label}</span>
              {rows.map(([v, n]) => <button key={v} type="button" aria-pressed={list.includes(v)} className={chip(list.includes(v))} onClick={() => toggle(list, set, v)}>
                {v} <span className="tabular-nums opacity-70">{n}</span></button>)}</div>)}
        </Section>
        <Section title="项目与成果">
          <p>{projectCount(matched(node.items))} 个项目（去重）· {matched(node.items).length} 条技术{filtered ? "（当前筛选）" : ""}</p>
          <TierCounts tiers={tierCounts(matched(node.items).map((id) => data.items[id]?.maturity ?? 0))} unit=" 条" />
          <p className="text-xs text-[var(--stone)]">阶段按条目统计；个别项目的最高阶段不代表整个分支。</p>
          <TechTimeline lineage={data} itemIds={matched(node.items)} projects={periods} groupOf={groupOf} onOpen={open} />
        </Section>
      </>}
    </aside>} />;
}
