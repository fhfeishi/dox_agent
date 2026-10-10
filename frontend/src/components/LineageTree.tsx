import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fieldResolver, indicators, lineageOutline, TIERS, UNDETERMINED_FIELD } from "../briefing";
import {
  buildLineage, CATEGORY_COLORS, hierarchyQuery, lineageQuery, locateItem, projectQuery,
  type Lineage,
} from "../projects";
import { useApp } from "../store";
import { TechTimeline } from "./TechTimeline";
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
const LEAVES_SHOWN = 5;

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

function keysAbove(node: TreeNode, level: number): string[] {
  return node.level < level ? [node.key, ...node.children.flatMap((child) => keysAbove(child, level))] : [];
}

function Branch({ node, lineage, color, selected, onSelect, open, toggle, projects }: {
  node: TreeNode; lineage: Lineage; color: string; selected: string; onSelect: (key: string) => void;
  open: Set<string>; toggle: (key: string) => void; projects: (ids: string[]) => number;
}) {
  const [all, setAll] = useState(false);
  const expanded = open.has(node.key);
  const leaf = node.level === 5;
  const item = leaf ? lineage.items[node.items[0]] : null;
  const size = ["text-[15px] font-semibold", "text-[14px] font-semibold", "text-[13.5px] font-medium", "text-[13px]", "text-[12.5px]", "text-[12.5px]"][node.level];
  const children = node.level === 4 && !all ? node.children.slice(0, LEAVES_SHOWN) : node.children;
  const nested = (list: TreeNode[]) => <>
    {list.map((child) => <Branch key={child.key} node={child} lineage={lineage} color={color} selected={selected}
      onSelect={onSelect} open={open} toggle={toggle} projects={projects} />)}
  </>;
  const toggleButton = <button type="button" aria-label={`${expanded ? "折叠" : "展开"} ${node.name}`} aria-expanded={expanded} onClick={() => toggle(node.key)}
    className="grid size-6 shrink-0 place-items-center rounded text-[11px] text-[var(--steel)] hover:bg-[var(--hairline)]">{expanded ? "▾" : "▸"}</button>;
  // L1 and L2 read as headings (query 2026-1009 1743): a section per discipline system, a
  // subheading per direction, each with its plain explanation; the tree lines start at L3.
  if (node.level === 1) return <li className={`rounded-xl border ${node.muted ? "border-dashed border-[var(--hairline-strong)]" : "border-[var(--hairline)]"} bg-[var(--surface)]`}>
    <div className={`flex items-start gap-2 rounded-t-xl border-l-4 px-3 py-2.5 ${selected === node.key ? "bg-[var(--primary-soft)]" : ""}`} style={{ borderLeftColor: node.muted ? "var(--hairline-strong)" : color, background: selected === node.key ? undefined : (node.muted ? undefined : color + "0d") }}>
      {toggleButton}
      <button type="button" onClick={() => onSelect(node.key)} className="min-w-0 flex-1 text-left">
        <span className="block text-[10.5px] font-semibold tracking-wide text-[var(--stone)]">L1 学科体系</span>
        <span className="block text-[16px] font-semibold leading-snug" style={{ color: node.muted ? "var(--steel)" : color }}>{node.name}</span>
        {node.plain ? <span className="mt-0.5 block text-[12.5px] leading-5 text-[var(--steel)]">{node.plain}</span> : null}
        <span className="mt-1 block"><TierCounts tiers={tierCounts(node.items.map((id) => lineage.items[id]?.maturity ?? 0))} unit=" 条" /></span>
      </button>
      <span className="mt-1 shrink-0 text-[12px] text-[var(--stone)] tabular-nums">{projects(node.items)} 项目</span>
    </div>
    {expanded ? <ul className="space-y-0.5 px-2 pb-2">{nested(node.children)}</ul> : null}
  </li>;
  if (node.level === 2) return <li>
    <div className={`flex items-start gap-1.5 rounded-md px-1 py-1.5 ${selected === node.key ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--canvas)]"}`}>
      {toggleButton}
      <button type="button" onClick={() => onSelect(node.key)} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-1.5"><span className="text-[10.5px] font-semibold text-[var(--stone)]">L2</span>
          <b className="text-[14px] font-semibold" style={{ color: node.muted ? "var(--steel)" : undefined }}>{node.name}</b>
          {node.foundation ? <span className="rounded bg-[#7c5cd61a] px-1 text-[10.5px] font-semibold text-[#4a2a8f]">共性底座</span> : null}</span>
        {node.plain ? <span className="block text-[12px] leading-5 text-[var(--steel)] line-clamp-1">{node.plain}</span> : null}
      </button>
      <span className="mt-0.5 shrink-0 text-[11.5px] text-[var(--stone)] tabular-nums">{projects(node.items)} 项目</span>
    </div>
    {expanded ? <ul className="ml-[11px] border-l pl-3" style={{ borderColor: color + "40" }}>{nested(node.children)}</ul> : null}
  </li>;
  return <li className="relative">
    <div className={`group flex items-start gap-1.5 rounded-md py-1 pr-2 ${selected === node.key ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--canvas)]"}`}>
      {leaf ? <span className="mt-[7px] ml-1.5 size-1.5 shrink-0 rounded-full bg-[var(--stone)]" />
        : <button type="button" aria-label={`${expanded ? "折叠" : "展开"} ${node.name}`} aria-expanded={expanded} onClick={() => toggle(node.key)}
          className="mt-px grid size-5 shrink-0 place-items-center rounded text-[10px] text-[var(--steel)] hover:bg-[var(--hairline)]">{expanded ? "▾" : "▸"}</button>}
      {node.level ? <span className="mt-[3px] w-5 shrink-0 text-[10px] font-semibold text-[var(--stone)]">L{node.level}</span> : null}
      <button type="button" onClick={() => onSelect(node.key)}
        className={`min-w-0 flex-1 text-left leading-snug ${size}`} style={node.level === 0 ? { color } : node.muted ? { color: "var(--steel)" } : undefined}
        title={leaf ? `${node.name} · ${node.summary ?? ""}` : node.summary}>
        <span className="line-clamp-2">{node.level === 4 ? <span className="text-[var(--stone)]">承载 · </span> : null}{node.name}
</span>
        {leaf && item ? <span className="mt-0.5 flex flex-wrap items-center gap-1"><Tier level={item.maturity} /><Chips list={indicators([item.basis, item.desc], 2)} /></span> : null}
      </button>
      {node.level === 4 ? <Tier level={Math.max(0, ...node.items.map((id) => lineage.items[id]?.maturity ?? 0))} /> : null}
      {!leaf ? <span className="mt-[2px] shrink-0 text-[11.5px] text-[var(--stone)] tabular-nums">{projects(node.items)} 项目</span> : null}
    </div>
    {!leaf && expanded ? <ul className={node.level === 0 ? "mt-2 space-y-2" : "ml-[9px] border-l pl-3"} style={node.level === 0 ? undefined : { borderColor: color + "33" }}>
      {children.map((child) => <Branch key={child.key} node={child} lineage={lineage} color={color} selected={selected}
        onSelect={onSelect} open={open} toggle={toggle} projects={projects} />)}
      {children.length < node.children.length ? <li><button type="button" onClick={() => setAll(true)} className="ml-6 py-0.5 text-xs text-[var(--link)] hover:underline">
        展开其余 {node.children.length - children.length} 条（按阶段从高到低）</button></li> : null}
    </ul> : null}
  </li>;
}

function useTreeState(initial: string[]) {
  const [open, setOpen] = useState(() => new Set(initial));
  const toggle = (key: string) => setOpen((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const reveal = (keys: string[]) => setOpen((old) => new Set([...old, ...keys]));
  return { open, toggle, reveal, reset: (keys: string[]) => setOpen(new Set(keys)) };
}

/** Another library's branch, loaded only when expanded, browsable read-only. */
function OtherBranch({ corpusId, name, color }: { corpusId: string; name: string; color: string }) {
  const [show, setShow] = useState(false);
  const { data, error } = useQuery({ ...lineageQuery(corpusId), enabled: show });
  const tree = useTreeState(["root"]);
  const [selected, setSelected] = useState("");
  return <li>
    <button type="button" aria-expanded={show} onClick={() => setShow(!show)} className="flex items-center gap-2 py-1 text-sm">
      <span className="size-3 rounded-full" style={{ background: color }} />
      <span style={{ color }}>{name.replace(/^自然科学基金-/, "")}</span>
      <span className="text-xs text-[var(--stone)]">{show ? "收起" : "展开"}</span>
    </button>
    {show ? error ? <p className="ml-6 text-xs text-[var(--red)]">{error.message}</p>
      : !data ? <p className="ml-6 text-xs text-[var(--stone)]">正在读取…</p>
      : !data.categories.length ? <p className="ml-6 text-xs text-[var(--stone)]">本分支尚未生成技术谱系。</p>
      : <ul className="ml-1"><Branch node={buildTree(data, new Map())} lineage={data} color={color} selected={selected} onSelect={(key) => { setSelected(key); tree.reveal([key]); }}
        open={tree.open} toggle={tree.toggle} projects={(ids) => new Set(ids.map((id) => data.items[id]?.project_id)).size} /></ul> : null}
  </li>;
}

/**
 * 技术谱系 (query 2026-1009 ④ / 1111): each library as a five-level, collapsible tree —
 * library → technology system → direction → theme → each project's technique item. Selecting a
 * branch shows its development timeline; selecting an item shows its maturity, the project,
 * and the techniques the same project uses alongside it.
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
  const tree = useTreeState(["root"]);
  // Arriving from the report view or a route card: open the tree down to the focused node.
  // Opens to L2 at first (systems and their directions); a focus from elsewhere opens down to it.
  const { reveal } = tree;
  const loaded = Boolean(data?.categories.length);
  useEffect(() => { if (data && loaded) reveal(keysAbove(buildTree(data, new Map()), 2)); }, [loaded]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data?.categories.length || !focus) return;
    const path = find(buildTree(data, new Map()), focus);
    if (path) reveal(path.map((n) => n.key));
  }, [data, focus]);  // eslint-disable-line react-hooks/exhaustive-deps
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
  const select = (key: string) => { onFocus(key); tree.reveal((find(root, key) ?? []).map((n) => n.key)); };

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

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: color }} />
        <button type="button" onClick={() => select("root")} title="查看全领域的项目周期与阶段" className="font-semibold hover:underline" style={{ color }}>{root.name}</button>
        <span className="text-xs text-[var(--stone)] tabular-nums">{projectCount(root.items)} 项目</span>
        <span className="text-xs text-[var(--stone)]">{LEVEL_NAMES.slice(1).map((name, i) => `L${i + 1} ${name}`).join(" › ")}</span>
        <span className="flex-1" />{generate}
      </div>
      {data.categories.length ? <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[var(--stone)]">展开到</span>
        {[2, 3, 4, 5].map((level) => <button key={level} type="button" onClick={() => tree.reset(keysAbove(root, level))}
          className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[var(--slate)] hover:bg-[var(--canvas)]">L{level} {LEVEL_NAMES[level]}</button>)}
        <button type="button" onClick={() => tree.reset(["root"])} className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[var(--slate)] hover:bg-[var(--canvas)]">全部收起</button>
        <span className="flex-1" /><Button size="sm" variant="ghost" onClick={() => void outline()}>复制谱系大纲</Button>
      </div> : null}
      {running ? <div role="status" className="mb-2 text-xs text-[var(--steel)]">正在归类与判定报告所述阶段 {data.job!.done}/{data.job!.total} 条（大库约需数分钟，可离开本页）
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--hairline)]"><span className="block h-full bg-[var(--primary)]" style={{ width: `${data.job!.done / Math.max(1, data.job!.total) * 100}%` }} /></span></div> : null}
      {notice && !notice.startsWith("已复制") ? null : notice ? <p role="status" className="mb-2 text-xs text-[var(--steel)]">{notice}</p> : null}
      {(notice && !notice.startsWith("已复制")) || data.error ? <p role="alert" className="mb-2 text-xs text-[var(--red)]">{notice && !notice.startsWith("已复制") ? notice : `上次生成未完成：${data.error}${data.categories.length ? "，下方为之前的结果。" : ""}`}</p> : null}
      {data.state === "stale" && !running ? <p className="mb-2 text-xs text-[#9a6500]">{data.stale_reason || "四维技术条目已变化"}，谱系需要重新生成。</p> : null}
      {!data.categories.length ? <p className="text-sm text-[var(--steel)]">{running ? "生成完成后显示。" : "尚未生成。生成时由模型把本库全部项目的技术条目归入“体系 › 方向 › 主题”，并依据各项目报告判定所述阶段；条目名称保持原样。"}</p>
        : <ul aria-label="技术谱系树" className="space-y-2">{root.children.map((child) => <Branch key={child.key} node={child} lineage={data} color={color}
          selected={focus || "root"} onSelect={select} open={tree.open} toggle={tree.toggle} projects={projectCount} />)}</ul>}
      {data.categories.length ? <p className="mt-3 text-[11.5px] leading-5 text-[var(--stone)]">分类标准：学科体系为方法所属学科，技术方向为学科内按方法原理的细分，方法主题为方向内一类具体做法，应用承载为条目服务的领域；每个条目只归一处，承载内按报告所述阶段从高到低排列。</p> : null}
      {data.categories.length ? <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--steel)]">报告所述阶段：
        {TIERS.map((tier) => <span key={tier.label} className="inline-flex items-center gap-1"><Tier level={tier.min} />
          <span className="text-[var(--stone)]">{tier.min === 5 ? "5 级" : tier.min === 4 ? "4 级" : tier.min === 2 ? "2–3 级" : "0–1 级"}</span></span>)}</p> : null}
      {data.gaps.length ? <p className="mt-2 text-xs text-[var(--stone)]">{data.gaps.join("；")}</p> : null}
      {corpora.length > 1 ? <details className="mt-4 border-t border-[var(--hairline)] pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--steel)]">切换领域（{corpora.filter((c) => c.id !== corpusId && !c.missing).length} 个其他领域分支）</summary>
        <ul className="mt-1">{corpora.filter((c) => c.id !== corpusId && !c.missing).map((c) =>
          <OtherBranch key={c.id} corpusId={c.id} name={c.name} color={branchColor(ids, c.id)} />)}</ul>
      </details> : null}
    </div>

    <aside aria-label="技术详情" className="h-fit rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 lg:sticky lg:top-2">
      {!data.categories.length ? <p className="text-sm text-[var(--steel)]">生成后，点击左侧任一分支查看项目周期与报告所述阶段：哪年开始研究、各项目做到什么程度、关联哪些项目。</p> : <>
        <p className="text-xs text-[var(--stone)]">{path.map((n, i) => <span key={n.key}>{i ? " › " : ""}
          {i < path.length - 1 ? <button type="button" onClick={() => select(n.key)} className="hover:underline">{n.name}</button> : n.name}</span>)}</p>
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
