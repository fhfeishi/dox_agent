import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fieldResolver, indicators, lineageOutline, TIERS, tierOf, UNDETERMINED_FIELD } from "../briefing";
import {
  buildLineage, CATEGORY_COLORS, hierarchyQuery, lineageQuery, locateItem, projectQuery,
  type Lineage,
} from "../projects";
import { useApp } from "../store";
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
 * Tree levels follow Gemini scheme 2 (query 2026-1009 1720): L1 discipline system › L2 technical
 * direction › L3 method theme › L4 application carrier (the field an item serves) › L5 the
 * project's own technique, marked with its report-described stage and quoted metrics.
 */
type TreeNode = { key: string; name: string; level: 0 | 1 | 2 | 3 | 4 | 5; summary?: string; plain?: string; foundation?: boolean; muted?: boolean; items: string[]; children: TreeNode[] };
const LEVEL_NAMES = ["领域", "学科体系", "技术方向", "方法主题", "应用承载", "项目技术"];

function buildTree(lineage: Lineage, titles: Map<string, string>): TreeNode {
  const resolve = fieldResolver(lineage);
  const byStage = (a: string, b: string) => (lineage.items[b]?.maturity ?? 0) - (lineage.items[a]?.maturity ?? 0);
  const categories = lineage.categories.map((category, c): TreeNode => {
    const children = category.children.map((child, d): TreeNode => {
      const themes = child.themes.map((theme, t): TreeNode => {
        const carriers = new Map<string, string[]>();
        for (const id of theme.items) carriers.set(resolve.of(id), [...(carriers.get(resolve.of(id)) ?? []), id]);
        const fields = [...carriers].sort((x, y) => Number(x[0] === UNDETERMINED_FIELD) - Number(y[0] === UNDETERMINED_FIELD) || y[1].length - x[1].length).map(([field, ids]): TreeNode => ({
          key: `f:${c}:${d}:${t}:${field}`, name: field, level: 4, items: ids, muted: field === UNDETERMINED_FIELD,
          children: [...ids].sort(byStage).map((id): TreeNode => ({ key: `i:${id}`, level: 5, items: [id], children: [],
            name: lineage.items[id]?.name ?? id, summary: titles.get(lineage.items[id]?.project_id ?? "") })),
        }));
        return { key: `t:${c}:${d}:${t}`, name: theme.name, level: 3, items: theme.items, children: fields };
      });
      return { key: `d:${c}:${d}`, name: child.name, level: 2, plain: child.plain, foundation: child.foundation, muted: category.unplaced, items: themes.flatMap((t) => t.items), children: themes };
    });
    return { key: `c:${c}`, name: category.name, level: 1, summary: category.summary, plain: category.plain, muted: category.unplaced, items: children.flatMap((d) => d.items), children };
  });
  return { key: "root", name: lineage.branch.replace(/^自然科学基金-/, ""), level: 0, items: categories.flatMap((c) => c.items), children: categories };
}

function find(node: TreeNode, key: string, path: TreeNode[] = []): TreeNode[] | null {
  if (node.key === key) return [...path, node];
  for (const child of node.children) {
    const hit = find(child, key, [...path, node]);
    if (hit) return hit;
  }
  return null;
}

const ROW = 62, TOP = 34, GAP = 70;
const SHOWN = 14;

function clip(text: string, width: number, size: number) {
  const room = Math.max(4, Math.floor((width - 40) / size));
  return text.length > room ? text.slice(0, room - 1) + "…" : text;
}

/** One card of the diagram: name, a sub line and the stage badge, coloured and always labelled. */
function GraphNode({ x, y, w, h, title, sub, note, level, tag, accent, active, dashed, label, onClick }: {
  x: number; y: number; w: number; h: number; title: string; sub: string; note?: string; level?: number; tag?: string;
  accent: string; active?: boolean; dashed?: boolean; label: string; onClick?: () => void;
}) {
  const tier = level === undefined ? null : tierOf(level);
  const badge = tier ? tier.label : "";
  const bw = badge.length * 12 + 14;
  return <g role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} aria-label={label} className={onClick ? "cursor-pointer" : undefined}
    onClick={onClick} onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}>
    <title>{label}</title>
    <rect x={x} y={y} width={w} height={h} rx={10} fill="#fff" stroke={active ? accent : "#d6dae4"} strokeWidth={active ? 2.5 : 1.2}
      strokeDasharray={dashed ? "5 4" : undefined} />
    <rect x={x} y={y} width={6} height={h} rx={3} fill={accent} />
    <text x={x + 16} y={y + 22} fontSize={active ? 15 : 13.5} fontWeight={700} fill="#1f2937">{clip(title, w - (badge ? bw : 0), active ? 15 : 13.5)}</text>
    <text x={x + 16} y={y + 41} fontSize={11.5} fill="#6b7280">{clip(sub, w, 11.5)}</text>
    {note ? <text x={x + 16} y={y + 60} fontSize={11.5} fill="#6b7280">{clip(note, w, 11.5)}</text> : null}
    {tag ? <text x={x + w - 10} y={y + h - 9} textAnchor="end" fontSize={10.5} fontWeight={700} fill="#4a2a8f">{tag}</text> : null}
    {tier ? <g><rect x={x + w - bw - 8} y={y + 8} width={bw} height={19} rx={9.5} fill={tier.color} />
      <text x={x + w - bw / 2 - 8} y={y + 21.5} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#fff">{badge}</text></g> : null}
  </g>;
}

/**
 * 细节视图的谱系图 (query 2026-1010 1124): a node-link diagram of three levels only — the parent,
 * the current node and its children — inside a zoomable window. Clicking a child goes down,
 * clicking the parent goes up; edge width follows how many items a child holds. A technique (L5)
 * shows the other techniques of the same project as dashed neighbours.
 */
function LineageGraph({ path, lineage, color, titles, projects, onSelect }: {
  path: TreeNode[]; lineage: Lineage; color: string; titles: Map<string, string>;
  projects: (ids: string[]) => number; onSelect: (key: string) => void;
}) {
  const [all, setAll] = useState(false);
  const node = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const best = (ids: string[]) => Math.max(0, ...ids.map((id) => lineage.items[id]?.maturity ?? 0));
  const companions = node.level === 5
    ? Object.keys(lineage.items).filter((id) => id !== node.items[0] && lineage.items[id].project_id === lineage.items[node.items[0]]?.project_id)
    : [];
  const kids = node.level === 5 ? [] : node.level === 4 ? node.children : [...node.children].sort((a, b) => projects(b.items) - projects(a.items));
  const neighbours = node.level === 5 ? companions : kids.map((k) => k.key);
  const shown = all ? neighbours : neighbours.slice(0, SHOWN);
  const more = neighbours.length - shown.length;
  const rows = shown.length + (more ? 1 : 0);
  const H = Math.max(300, TOP + rows * ROW + 24);
  // Technique names are long: the column of single techniques is wider than a column of branches.
  const PW = 190, CW = 240, KW = node.level >= 4 ? 340 : 260;
  const px = 16, cx = parent ? px + PW + GAP : 16, kx = cx + CW + GAP;
  const W = (rows ? kx + KW : cx + CW) + 16;
  const ch = 88, cy = Math.max(TOP, H / 2 - ch / 2);
  const counts = kids.map((k) => k.items.length);
  const widest = Math.max(1, ...counts);
  const edge = (x1: number, y1: number, x2: number, y2: number, weight: number, dashed = false, key = "") =>
    <path key={key} d={`M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`} fill="none" stroke={color} strokeOpacity={0.45}
      strokeWidth={weight} strokeDasharray={dashed ? "6 5" : undefined} />;
  const header = (x: number, text: string) => <text x={x} y={16} fontSize={12} fontWeight={700} fill="#8a90a6">{text}</text>;
  const kidLevel = node.level + 1;

  return <ZoomPan key={`${node.key}:${all}`} width={W} height={H} label="技术谱系图谱" minHeight={340}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`技术谱系图谱：${node.name}`}>
      {parent ? header(px, `上一级 · ${LEVEL_NAMES[parent.level]}`) : null}
      {header(cx, `当前 · ${LEVEL_NAMES[node.level]}`)}
      {rows ? header(kx, node.level === 5 ? "同项目还涉及的技术" : `下一级 · ${LEVEL_NAMES[kidLevel]}（${neighbours.length}）`) : null}
      {parent ? edge(px + PW, cy + ch / 2, cx, cy + ch / 2, 2.5, false, "up") : null}
      {shown.map((key, i) => edge(cx + CW, cy + ch / 2, kx, TOP + i * ROW + 26,
        node.level === 5 ? 1.5 : 1.2 + 6 * Math.sqrt((counts[i] ?? 1) / widest), node.level === 5, key))}
      {parent ? <GraphNode x={px} y={cy + 6} w={PW} h={ch - 12} title={parent.name} sub={`返回上一级 · ${projects(parent.items)} 个项目`}
        accent={color + "99"} label={`返回上一级：${parent.name}`} onClick={() => onSelect(parent.key)} /> : null}
      <GraphNode x={cx} y={cy} w={CW} h={ch} active accent={color} title={node.name}
        sub={node.level === 5 ? titles.get(lineage.items[node.items[0]]?.project_id ?? "") ?? "" : `${projects(node.items)} 个项目 · ${node.items.length} 个技术条目`}
        note={node.level === 5 ? lineage.items[node.items[0]]?.basis : node.plain} level={best(node.items)} tag={node.foundation ? "共性底座" : undefined}
        label={`当前：${node.name}`} />
      {shown.map((key, i) => {
        const y = TOP + i * ROW;
        if (node.level === 5) {
          const item = lineage.items[key];
          return <GraphNode key={key} x={kx} y={y} w={KW} h={52} dashed title={item.name} sub="同一项目报告中出现" level={item.maturity}
            accent={color + "66"} label={`同项目技术：${item.name}`} onClick={() => onSelect(`i:${key}`)} />;
        }
        const kid = kids.find((k) => k.key === key)!;
        const leaf = kid.level === 5;
        return <GraphNode key={key} x={kx} y={y} w={KW} h={52} title={kid.name}
          sub={leaf ? titles.get(lineage.items[kid.items[0]]?.project_id ?? "") ?? "" : `${projects(kid.items)} 个项目 · ${kid.items.length} 条`}
          level={best(kid.items)} tag={kid.foundation ? "共性底座" : undefined} accent={kid.muted ? "#b8bfcc" : color + "cc"}
          label={`${LEVEL_NAMES[kid.level]}：${kid.name}`} onClick={() => onSelect(kid.key)} />;
      })}
      {more ? <GraphNode x={kx} y={TOP + shown.length * ROW} w={KW} h={52} dashed title={`还有 ${more} 项`}
        sub={node.level === 4 ? "按报告所述阶段从高到低，点击显示全部" : "按项目数排序，点击显示全部"} accent="#b8bfcc"
        label={`显示其余 ${more} 项`} onClick={() => setAll(true)} /> : null}
    </svg>
  </ZoomPan>;
}

/**
 * 技术谱系 · 细节 (query 2026-1009 ④ / 1111 / 2026-1010 1124): the five-level lineage as a
 * three-level diagram in a zoomable window on the left; the selected node's project-period chart
 * (or a technique's detail) on the right.
 */
export function LineageTree({ corpusId, focus, onFocus, onIssue }: {
  corpusId: string; focus: string; onFocus: (key: string) => void; onIssue: (scene: string) => void;
}) {
  const { corpora, showInspector } = useApp();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
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
  if (isPending) return <p role="status" className="py-4 text-sm text-[var(--steel)]">正在读取技术谱系…</p>;
  if (error) return <p role="alert" className="py-4 text-sm text-[var(--red)]">{error.message}</p>;

  const ids = corpora.map((item) => item.id);
  const color = branchColor(ids, corpusId);
  const projects = new Map((library?.projects ?? []).map((p) => [p.project_id, { title: p.title, start: p.start_year, end: p.end_year }]));
  const titles = new Map([...projects].map(([id, p]) => [id, p.title]));
  const root = buildTree(data, titles);
  const resolve = fieldResolver(data);
  const outline = async () => {
    const name = corpora.find((c) => c.id === corpusId)?.name.replace(/^自然科学基金-/, "") ?? root.name;
    try { await navigator.clipboard.writeText(lineageOutline(name, data)); setNotice("已复制谱系大纲（L1–L5，Markdown）"); }
    catch { setNotice("复制失败，请检查浏览器剪贴板权限"); }
  };
  const projectCount = (items: string[]) => new Set(items.map((id) => data.items[id]?.project_id)).size;
  const path = find(root, focus || "root") ?? [root];
  const node = path[path.length - 1];
  const open = (projectId: string) => showInspector({ kind: "project", corpusId, projectId, facet: "技术" });
  const running = data.job?.status === "进行中";
  const generate = <Button size="sm" variant={data.state === "missing" ? "primary" : "ghost"} disabled={run.isPending || running} onClick={() => run.mutate()}>
    {running ? "正在生成…" : data.state === "missing" ? "生成技术谱系" : "重新生成"}</Button>;
  const select = (key: string) => onFocus(key);

  // Children of the selected node become the timeline's colour groups.
  const groupOf = (itemId: string) => {
    const at = locateItem(data, itemId);
    if (!at) return "未归入体系的条目";
    return node.level === 0 ? at.category.name : node.level === 1 ? at.child.name : node.level === 2 ? at.theme.name : resolve.of(itemId);
  };
  const item = node.level === 5 ? data.items[node.items[0]] : null;
  const companions = item ? Object.entries(data.items).filter(([id, other]) => other.project_id === item.project_id && id !== node.items[0]) : [];
  const typical = item ? (hierarchy?.scenes ?? []).flatMap((scene) => scene.issues.flatMap((issue) =>
    issue.routes.filter((route) => route.item_ids.includes(item.item_id) && route.project_ids.includes(item.project_id)).map(() => ({ scene: scene.name, issue: issue.name, state: issue.state })))) : [];

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: color }} />
        <b style={{ color }}>{root.name}</b>
        <span className="text-xs text-[var(--stone)] tabular-nums">{projectCount(root.items)} 项目</span>
        <span className="text-xs text-[var(--stone)]">{LEVEL_NAMES.slice(1).map((name, i) => `L${i + 1} ${name}`).join(" › ")}</span>
        <span className="flex-1" />
        {data.categories.length ? <Button size="sm" variant="ghost" onClick={() => void outline()}>复制谱系大纲</Button> : null}
        {generate}
      </div>
      {running ? <div role="status" className="mb-2 text-xs text-[var(--steel)]">正在归类与判定报告所述阶段 {data.job!.done}/{data.job!.total} 条（大库约需数分钟，可离开本页）
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--hairline)]"><span className="block h-full bg-[var(--primary)]" style={{ width: `${data.job!.done / Math.max(1, data.job!.total) * 100}%` }} /></span></div> : null}
      {notice && !notice.startsWith("已复制") ? null : notice ? <p role="status" className="mb-2 text-xs text-[var(--steel)]">{notice}</p> : null}
      {(notice && !notice.startsWith("已复制")) || data.error ? <p role="alert" className="mb-2 text-xs text-[var(--red)]">{notice && !notice.startsWith("已复制") ? notice : `上次生成未完成：${data.error}${data.categories.length ? "，下方为之前的结果。" : ""}`}</p> : null}
      {data.state === "stale" && !running ? <p className="mb-2 text-xs text-[#9a6500]">{data.stale_reason || "四维技术条目已变化"}，谱系需要重新生成。</p> : null}
      {!data.categories.length ? <p className="text-sm text-[var(--steel)]">{running ? "生成完成后显示。" : "尚未生成。生成时由模型把本库全部项目的技术条目归入“体系 › 方向 › 主题”，并依据各项目报告判定所述阶段；条目名称保持原样。"}</p> : <>
        <nav aria-label="谱系位置" className="mb-2 flex flex-wrap items-center gap-1 text-xs">
          {path.map((n, i) => <span key={n.key} className="flex items-center gap-1">{i ? <span className="text-[var(--stone)]">›</span> : null}
            {i < path.length - 1 ? <button type="button" onClick={() => select(n.key)} className="rounded px-1 text-[var(--link)] hover:bg-[var(--canvas)]">{n.name}</button>
              : <b className="px-1">{n.name}</b>}</span>)}
        </nav>
        <LineageGraph key={node.key} path={path} lineage={data} color={color} titles={titles} projects={projectCount} onSelect={select} />
        <p className="mt-2 text-[11.5px] leading-5 text-[var(--stone)]">点击右列节点进入下一级，点击左列节点返回上一级；连线越粗，该分支的技术条目越多。分类标准：学科体系为方法所属学科，技术方向为学科内按方法原理的细分，方法主题为方向内一类具体做法，应用承载为条目服务的领域；每个条目只归一处。</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--steel)]">报告所述阶段：
          {TIERS.map((tier) => <span key={tier.label} className="inline-flex items-center gap-1"><Tier level={tier.min} />
            <span className="text-[var(--stone)]">{tier.min === 5 ? "5 级" : tier.min === 4 ? "4 级" : tier.min === 2 ? "2–3 级" : "0–1 级"}</span></span>)}</p>
      </>}
      {data.gaps.length ? <p className="mt-2 text-xs text-[var(--stone)]">{data.gaps.join("；")}</p> : null}
    </div>

    <aside aria-label="技术详情" className="h-fit rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      {!data.categories.length ? <p className="text-sm text-[var(--steel)]">生成后，点击左侧图谱中的任一节点查看项目周期与报告所述阶段：哪年开始研究、各项目做到什么程度、关联哪些项目。</p> : <>
        <p className="text-xs text-[var(--stone)]">{LEVEL_NAMES[node.level]}</p>
        {item ? <>
          <h3 className="mt-1 text-base font-semibold" style={{ color }}>{item.name}</h3>
          {item.desc ? <p className="mt-1 text-sm leading-6">{item.desc}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">报告所述阶段：<Tier level={item.maturity} /><b>{item.maturity} {data.maturity_levels[item.maturity]}</b>
            <Chips list={indicators([item.basis, item.desc])} /></p>
          {item.basis ? <p className="mt-1 text-xs text-[var(--steel)]">判定依据：{item.basis}</p> : null}
          <p className="mt-1 text-xs text-[var(--steel)]">应用承载：{resolve.of(node.items[0])}</p>
          <p className="mt-3 text-xs font-semibold text-[var(--steel)]">所属项目</p>
          <button type="button" onClick={() => open(item.project_id)} className="text-left text-sm text-[var(--link)] hover:underline">
            {projects.get(item.project_id)?.title ?? item.project_id}</button>
          <span className="ml-1 text-xs text-[var(--stone)]">{projects.get(item.project_id)?.start ?? "?"}–{projects.get(item.project_id)?.end ?? "?"}</span>
          {typical.length ? <>
            <p className="mt-3 text-xs font-semibold text-[var(--steel)]">典型技术 · 针对的问题</p>
            <ul className="mt-1 space-y-1">{typical.map((t, i) => <li key={i}><button type="button" onClick={() => onIssue(t.scene)} className="text-left text-sm text-[var(--link)] hover:underline">{t.issue}</button>
              <span className="ml-1 text-xs text-[var(--stone)]">· {t.scene} · {t.state}</span></li>)}</ul>
          </> : null}
          <p className="mt-3 text-xs font-semibold text-[var(--steel)]">同项目还涉及的技术 <span className="font-normal text-[var(--stone)]">（同一报告中出现，不代表配套或依赖）</span></p>
          {companions.length ? <ul className="mt-1 space-y-1">{companions.map(([id, other]) => <li key={id}>
            <button type="button" onClick={() => select(`i:${id}`)} className="text-left text-xs text-[var(--link)] hover:underline">{other.name}</button>
            <span className="text-[11px] text-[var(--stone)]"> · {(() => { const at = locateItem(data, id); return at ? `${at.category.name} › ${at.child.name}` : "未归入体系的条目"; })()}</span></li>)}</ul>
            : <p className="mt-1 text-xs text-[var(--stone)]">该项目报告中没有其他技术条目。</p>}
        </> : <>
          <h3 className="mt-1 text-base font-semibold" style={{ color }}>{node.name} · 项目周期与报告所述验证阶段</h3>
          <p className="mt-1 text-xs text-[var(--steel)]">{node.items.length} 个技术条目 · {projectCount(node.items)} 个项目</p>
          <p className="mt-1"><TierCounts tiers={tierCounts(node.items.map((id) => data.items[id]?.maturity ?? 0))} unit=" 条" /></p>
          {node.plain ? <p className="mt-1 rounded-md bg-[var(--canvas)] px-2 py-1 text-sm">通俗地说：{node.plain}</p> : null}
          {node.summary ? <p className="mt-1 text-sm text-[var(--steel)]">{node.summary}</p> : null}
          <div className="mt-2"><TechTimeline lineage={data} itemIds={node.items} projects={projects} groupOf={groupOf} onOpen={open} /></div>
        </>}
      </>}
    </aside>
  </div>;
}
