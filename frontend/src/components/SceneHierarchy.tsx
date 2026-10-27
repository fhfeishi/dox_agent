import { useAuth } from "../auth";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { outputsQuery,
  buildHierarchy, FACET_COLORS, hierarchyQuery, LINEAGE_COLOR, lineageQuery, locateItem, projectQuery,
  type Achievement, type HierarchyEvidence, type Scene,
} from "../projects";
import { useApp } from "../store";
import { LineageTree } from "./LineageTree";
import { ReportBoard } from "./ReportBoard";
import { LineageRoadmap } from "./LineageRoadmap";
import { Tier } from "./StageMarks";
import { OutputsPanel } from "./OutputsPanel";
import { SceneFlow } from "./SceneFlow";
import { Button, Segmented } from "./ui";
import { Chart } from "./Charts";
import { fetchDocuments } from "../useDocuments";
import { useLayout } from "../layout";

const ASPECTS = ["论文", "专利", "人才/团队", "平台/基地", "数据与样本", "指标达成", "标准/许可", "转化与应用"];
const STAGE_TONE: Record<string, string> = {
  已取得: "var(--primary-pressed)", 在研: "var(--steel)", 仅预期: "var(--steel)", 原文未提及: "var(--stone)",
};

/** The extracted topics a category groups; the category name itself is a summary. */
function Members({ names }: { names?: string[] }) {
  if (!names?.length || (names.length === 1)) return null;
  return <details className="mt-1 text-caption text-[var(--steel)]"><summary className="cursor-pointer">归并 {names.length} 个原提取条目</summary>
    <p className="mt-1 leading-5">{names.join("、")}</p></details>;
}

/** A collapsible section whose open state is remembered per viewer (query 2026-1010 1537). */
const LINEAGE_VIEWS = [["overview", "总览"], ["tree", "五级谱系"], ["roadmap", "路网"]] as const;

export function EvidenceList({ corpusId, evidence, limit = 2, staleHint = "请重新生成层级" }: { corpusId: string; evidence: HierarchyEvidence[]; limit?: number; staleHint?: string }) {
  const { openPreview } = useLayout();
  const [error, setError] = useState("");
  // Open the exact cited file version; a re-uploaded report must not silently answer for it.
  async function open(item: HierarchyEvidence) {
    setError("");
    try {
      const docs = await fetchDocuments(corpusId, { failure: "无法读取该库文件列表" });
      const doc = docs.find((value) => value.doc_id === item.doc_id);
      if (!doc) throw new Error("引用文件已移除或尚未完成索引");
      if (doc.version !== item.version) throw new Error("引用文件已更新，" + staleHint);
      openPreview(doc, item.locator.basis === "pdf_page" ? item.locator.page ?? null : null, corpusId);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  if (!evidence.length) return <p className="mt-2 text-caption text-[var(--stone)]">本次归纳没有可回读的原文证据。</p>;
  return <div className="mt-2 space-y-2">{evidence.slice(0, limit).map((item, index) => <button key={index} type="button"
    onClick={() => void open(item)}
    className="block w-full rounded-lg bg-[var(--canvas)] p-2 text-left text-caption hover:border-[var(--primary)]">
    <span className="text-[var(--primary)]">{item.locator.basis === "pdf_page" ? `第 ${item.locator.page} 页` : "解析正文位置"} · 查看原文</span>
    <span className="mt-1 block leading-5 text-[var(--ink)]">{item.quote}</span>
  </button>)}
  {error ? <p className="text-caption text-[var(--red)]">{error}</p> : null}
  {evidence.length > limit ? <p className="text-caption text-[var(--stone)]">另有 {evidence.length - limit} 条证据，可在项目详情查看。</p> : null}</div>;
}

function AspectTable({ corpusId, achievements }: { corpusId: string; achievements: Achievement[] }) {
  return <div className="space-y-4">{achievements.map((item) => <section key={item.title} aria-label={item.title + " 相关分析"}
    className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
    <div className="flex flex-wrap items-baseline gap-2"><h4 className="font-semibold">{item.title}</h4>
      <span className="text-caption text-[var(--steel)]">覆盖 {item.marker_basis.projects} 个去重项目
        {item.marker_basis.representative ? ` · 代表项目 ${item.marker_basis.representative}` : ""}</span></div>
    {item.summary ? <p className="mt-1 text-body text-[var(--steel)]">{item.summary}</p> : null}
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-body">
        <caption className="sr-only">{item.title} 的成果方面完成度</caption>
        <thead><tr>{["方面", "完成度", "说明"].map((head) => <th key={head} scope="col" className="border-b border-[var(--hairline)] py-2 text-left text-caption text-[var(--steel)]">{head}</th>)}</tr></thead>
        <tbody>{ASPECTS.map((aspect) => {
          const found = item.aspects.find((value) => value.aspect === aspect);
          const stage = found?.stage ?? "原文未提及";
          return <tr key={aspect} className="align-top">
            <th scope="row" className="border-b border-[var(--hairline)] py-2 text-left font-normal">{aspect}</th>
            <td className="border-b border-[var(--hairline)] py-2 text-caption" style={{ color: STAGE_TONE[stage] }}>{stage}</td>
            <td className="border-b border-[var(--hairline)] py-2 text-caption leading-5">{found?.note
              || (found?.answered ? "" : "本次综合未给出该方面结论")}</td></tr>;
        })}</tbody>
      </table>
    </div>
    <EvidenceList corpusId={corpusId} evidence={item.aspects.flatMap((aspect) => aspect.evidence)} limit={3} />
  </section>)}</div>;
}

const DIMS = ["技术谱系", "场景", "问题", "技术", "成果"] as const;
/** query 2026-1010 0914: each view answers one question; the line under the tabs says which. */
const PURPOSE: Record<string, string> = {
  技术谱系: "技术谱系 · 由上到下：技术谱系总览（本库要点与各应用领域）、五级技术谱系（逐层查看技术与详情）、路网形式（全库谱系一张图）。",
  场景: "场景 · 为谁做：本库按服务对象归纳的应用领域；点开查看“问题 → 技术 → 成果”逻辑简图。",
  问题: "问题 · 解决什么：各领域的核心问题，报告所述已解决与待解决的问题，以及对应的典型技术。",
  技术: "技术 · 怎么做：解决各核心问题的典型技术路线及其在技术谱系中的位置；全部技术见技术谱系。",
  成果: "成果 · 做到什么程度：各领域的标志性成果、成果各方面完成度与项目成果清单。",
};
type Dim = typeof DIMS[number];
const DIM_COLOR: Record<Dim, string> = { 技术谱系: LINEAGE_COLOR, 场景: FACET_COLORS[0], 问题: FACET_COLORS[1], 技术: FACET_COLORS[2], 成果: FACET_COLORS[3] };

function Pill({ text, color }: { text: string; color: string }) {
  return <span className="rounded-full px-2 py-0.5 text-caption" style={{ color, background: color + "18" }}>{text}</span>;
}

// 成果分析 dimensions (query 2026-1015 1518). Papers, patents, monographs and awards are counted from
// each report's own 成果列表; the rest from the flagship achievements judged 已取得.
const LISTED: [string, string[]][] = [["论文", ["期刊论文", "会议论文"]], ["专利", ["专利"]], ["专著", ["专著"]], ["奖励", ["奖励"]]];
const JUDGED = ["人才/团队", "平台/基地", "数据与样本", "标准/许可", "转化与应用"];

/**
 * Per-scene 成果分析 (query 2026-1015 1518): one radar of how many of the scene's projects show each
 * kind of outcome, a sentence naming the strongest, and — folded — the per-achievement aspect table
 * and the full 成果清单. Every axis says where its count comes from, so a paper-rich scene no longer
 * reads “论文 · 原文未提及” above hundreds of listed papers.
 */
function OutcomeAnalysis({ corpusId, scene }: { corpusId: string; scene: Scene }) {
  const { data: outputs } = useQuery(outputsQuery(corpusId));
  const projects = scene.project_ids;
  const listedValues = LISTED.map(([label, types]) => [label, projects.filter((id) =>
    (outputs?.projects[id]?.items ?? []).some((item) => types.includes(item.type))).length] as [string, number]);
  const judgedValues = JUDGED.map((aspect) => [aspect, new Set(scene.achievements.flatMap((item) =>
    item.aspects.some((a) => a.aspect === aspect && a.stage === "已取得") ? item.project_ids : [])).size] as [string, number]);
  const values = [...listedValues, ...judgedValues];
  const listed = projects.filter((id) => outputs?.projects[id]).length;
  const entries = projects.reduce((n, id) => n + (outputs?.projects[id]?.items.length ?? 0), 0);
  const leading = values.filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, 3);
  return <div className="mt-3 space-y-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4" aria-label={scene.name + " 成果分析"}>
    <div className="flex flex-wrap items-baseline gap-2">
      <p className="text-body font-semibold">成果分析</p>
      <span className="text-caption text-[var(--steel)]">{scene.name} · {projects.length} 个项目</span>
    </div>
    {!outputs ? <p role="status" className="text-caption text-[var(--stone)]">正在读取成果列表…</p> : <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[420px]"><Chart spec={{ type: "radar", title: "各类成果覆盖的项目数", labels: values.map(([l]) => l), values: values.map(([, n]) => n), unit: " 个项目", max: projects.length,
        note: `论文、专利、专著、奖励取自 ${listed}/${projects.length} 个项目报告的“成果列表”；其余取自标志性成果中判定为“已取得”的方面` }} /></div>
      <div className="space-y-2 text-body leading-6">
        <p>{leading.length ? <>成果集中在 <b>{leading.map(([l, n]) => `${l}（${n} 个项目）`).join("、")}</b>。</> : "本场景报告中暂未整理出可计数的成果。"}</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption text-[var(--steel)]">{values.map(([l, n]) =>
          <li key={l} className="flex justify-between gap-2"><span>{l}</span><span className="tabular-nums">{n ? `${n} 个项目` : "—"}</span></li>)}</ul>
        <p className="text-caption text-[var(--stone)]">“—”表示本场景资料中没有对应记录，不等于没有该类成果。</p>
      </div>
    </div>}
    {scene.achievements.length ? <details className="text-body"><summary className="cursor-pointer text-caption text-[var(--primary)]">按标志性成果查看各方面完成度与原文</summary>
      <div className="mt-3"><AspectTable corpusId={corpusId} achievements={scene.achievements} /></div></details> : null}
    {/* The full list is long; it opens on demand (query 2026-1015 1518). */}
    <details className="text-body"><summary className="cursor-pointer text-caption text-[var(--primary)]">展开成果清单 · {entries} 项（取自报告原文的“成果列表”）</summary>
      <div className="mt-3"><OutputsPanel corpusId={corpusId} projectIds={projects} label={scene.name} /></div></details>
  </div>;
}

/** Projects behind an issue or route, opened in the inspector with one click. */
function ProjectLinks({ corpusId, ids, facet }: { corpusId: string; ids: string[]; facet: string }) {
  const { showInspector } = useLayout();
  const { data } = useQuery(projectQuery(corpusId));
  const titles = new Map((data?.projects ?? []).map((p) => [p.project_id, p.title]));
  if (!ids.length) return null;
  return <details className="mt-2 text-caption"><summary className="cursor-pointer text-[var(--primary)]">查看 {ids.length} 个项目</summary>
    <ul className="mt-1 space-y-1">{ids.map((id) => <li key={id}><button type="button" onClick={() => showInspector({ kind: "project", corpusId, projectId: id, facet })}
      className="text-left text-[var(--link)] hover:underline">{titles.get(id) ?? id}</button></li>)}</ul></details>;
}

/**
 * Corpus-level browsing by 技术谱系 / 场景 / 问题 / 技术 / 成果 (query 2026-1009 ④). Every card leads
 * somewhere: scenes open their logic diagram, issues and routes open projects and the lineage.
 */
export function SceneHierarchy({ corpusId }: { corpusId: string }) {
  const { role } = useAuth();
  const [search, setSearch] = useSearchParams();
  const [notice, setNotice] = useState("");
  const client = useQueryClient();
  const { data, isPending, error } = useQuery(hierarchyQuery(corpusId));
  const { data: lineage } = useQuery(lineageQuery(corpusId));
  const run = useMutation({
    mutationFn: (force: boolean) => buildHierarchy(corpusId, force),
    onSuccess: () => { setNotice(""); void client.invalidateQueries({ queryKey: ["library", corpusId, "hierarchy"] }); },
    onError: (reason: Error) => setNotice(reason.message),
  });
  const dim: Dim = DIMS.includes(search.get("dim") as Dim) ? search.get("dim") as Dim : "技术谱系";
  const sceneName = search.get("scene") ?? "";
  const node = search.get("node") ?? "";
  const lineageView = LINEAGE_VIEWS.some(([key]) => key === search.get("lineage")) ? search.get("lineage")! : "overview";
  // 技术谱系 opens on the report view; the technology view is the expert's full tree.
  const { corpora } = useApp();
  const libraryName = corpora.find((c) => c.id === corpusId)?.name ?? corpusId;
  // Overview cards and road-map stations open the node in the detail section and bring it into view.
  const toDetail = (key: string) => go({ node: key, lineage: "tree" });
  const go = (next: Record<string, string>) => setSearch((old) => {
    const value = new URLSearchParams(old);
    for (const [key, v] of Object.entries(next)) { if (v) value.set(key, v); else value.delete(key); }
    return value;
  });
  if (isPending) return <p role="status" className="py-4 text-body text-[var(--steel)]">正在读取四维归纳…</p>;
  if (error) return <p role="alert" className="py-4 text-body text-[var(--red)]">{error.message}</p>;
  if (!data) return null;
  const busy = run.isPending;
  const coverage = data.coverage ?? {};
  const scenes = sceneName ? data.scenes.filter((item) => item.name === sceneName) : data.scenes;
  const issues = data.scenes.flatMap((scene) => scene.issues);
  // A typical route opens its own technique item in the lineage tree.
  const routeItem = (title: string) => {
    const route = data.scenes.flatMap((s) => s.issues.flatMap((i) => i.routes)).find((r) => r.title === title);
    return route && Object.entries(lineage?.items ?? {}).find(([, item]) =>
      route.item_ids.includes(item.item_id) && route.project_ids.includes(item.project_id))?.[0];
  };
  const showRoute = (title: string) => { const id = routeItem(title); go({ dim: "", node: id ? `i:${id}` : "", scene: "" }); };
  const lineageClasses = lineage?.categories.filter((c) => !c.unplaced).length ?? 0;
  const lineageItems = Object.keys(lineage?.items ?? {}).length;
  const counts: Record<Dim, number> = {
    技术谱系: lineageItems,
    场景: data.scenes.length, 问题: issues.length,
    技术: issues.reduce((n, issue) => n + issue.routes.length, 0),
    成果: data.scenes.reduce((n, scene) => n + scene.achievements.length, 0),
  };
  const regenerate = role !== "admin" ? null : <Button size="sm" variant="ghost" disabled={busy} onClick={() => run.mutate(data.state !== "missing")}>
    {busy ? "生成中…" : data.state === "missing" ? "生成四维归纳" : "重新生成"}</Button>;
  return <section aria-label="场景层级" className="mt-5 space-y-4">
    {/* One row of switches (前端审查 O3, V1): the five dimensions as tabs on a neutral track, each with its
        chart colour as a dot, and the lineage's own views beside them, instead of five coloured cards
        over a second row of tabs. */}
    <div className="flex flex-wrap items-center gap-2">
    <div role="tablist" aria-label="技术研判" className="flex max-w-full gap-[2px] overflow-x-auto rounded-[10px] bg-[var(--line-cool-soft)] p-[3px]">
      {DIMS.map((key) => <button key={key} role="tab" type="button" aria-selected={dim === key}
        onClick={() => go({ dim: key === "技术谱系" ? "" : key, scene: key === "技术谱系" ? "" : sceneName, node: "" })}
        className={`flex shrink-0 items-center gap-[7px] rounded-[8px] px-[12px] py-[6px] text-left transition-[background-color,box-shadow] duration-[var(--dur-quick)] ${dim === key ? "bg-[var(--canvas)] shadow-sm" : "hover:bg-[var(--canvas)]/60"}`}>
        <span aria-hidden="true" className="size-[8px] shrink-0 rounded-full" style={{ background: DIM_COLOR[key] }} />
        <span className={`text-body ${dim === key ? "font-semibold text-[var(--heading)]" : "text-[var(--text-2)]"}`}>{key}</span>{" "}
        <span className="hidden text-caption text-[var(--text-3)] md:inline">{key === "技术谱系" ? (lineageClasses ? `${lineageClasses} 个技术体系 · ${lineageItems} 个技术条目` : "尚未生成")
          : data.scenes.length ? `${counts[key]} ${key === "场景" ? "类" : key === "问题" ? "个核心问题" : key === "技术" ? "条技术路线" : "项标志性成果"}` : "尚未归纳"}</span>
      </button>)}
    </div>
    {dim === "技术谱系" ? <Segmented tabs label="技术谱系视图" value={lineageView} onChange={(key) => go({ lineage: key === "overview" ? "" : key })}
      options={LINEAGE_VIEWS} className="ml-auto" /> : null}
    </div>
    <p className="text-body text-[var(--steel)]">{PURPOSE[dim]}</p>
    {notice ? <p role="alert" className="text-body text-[var(--red)]">{notice}</p> : null}
    {data.process?.status === "未完成" ? <p role="alert" className="rounded-lg bg-[var(--canvas)] p-3 text-body">本次生成未完成：{data.process.error}{coverage.update_error ? "，下方为上一次成功生成的结果。" : ""}</p> : null}
    {/* 总览, the five-level lineage and the road map one at a time, so the chosen one has the whole
        page (query 2026-1013 2012); a technique picked in one is selected in the others. */}
    {dim === "技术谱系" ? <>
      {lineageView === "overview" ? <ReportBoard corpusId={corpusId} hierarchy={data} onTech={toDetail}
        onDim={(d, scene) => go({ dim: d, scene, node: "" })} /> : null}
      {lineageView === "tree" ? <LineageTree corpusId={corpusId} focus={node} onFocus={(key) => go({ node: key })}
        onIssue={(scene) => go({ dim: "问题", scene, node: "" })} /> : null}
      {lineageView === "roadmap" ? lineage?.categories.length ? <LineageRoadmap lineage={lineage} title={libraryName} selected={node} onSelect={(key) => go({ node: key })} />
        : <p className="text-body text-[var(--steel)]">生成技术谱系后显示路网图。</p> : null}
    </> : null}
    {dim === "技术谱系" ? null : !data.scenes.length ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 text-body text-[var(--steel)]">
      <span className="flex-1">{data.state === "missing" ? "本库尚未生成四维归纳。" : "本库还没有场景维度的整理条目，请先完成文件级四维提取。"}</span>{data.state === "missing" ? regenerate : null}
    </div> : <>
      {dim !== "场景" ? <div className="flex flex-wrap gap-2" aria-label="按场景筛选">
        <button type="button" aria-pressed={!sceneName} onClick={() => go({ scene: "" })} className={`rounded-full border px-3 py-1 text-caption ${!sceneName ? "border-[var(--ink)] font-semibold" : "border-[var(--hairline)]"}`}>全部场景</button>
        {data.scenes.map((scene) => <button key={scene.name} type="button" aria-pressed={sceneName === scene.name} onClick={() => go({ scene: sceneName === scene.name ? "" : scene.name })}
          className={`rounded-full border px-3 py-1 text-caption ${sceneName === scene.name ? "font-semibold" : ""}`} style={{ borderColor: sceneName === scene.name ? FACET_COLORS[0] : "var(--hairline)" }}>{scene.name}</button>)}
      </div> : null}

      {dim === "场景" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.scenes.map((item) => <button key={item.name} type="button" aria-label={"查看场景 " + item.name} aria-pressed={sceneName === item.name}
          onClick={() => go({ scene: sceneName === item.name ? "" : item.name })}
          className="rounded-xl border bg-[var(--surface)] p-4 text-left hover:shadow-md"
          style={{ borderLeft: `4px solid ${FACET_COLORS[0]}`, borderColor: sceneName === item.name ? FACET_COLORS[0] : "var(--hairline)" }}>
          <b>{item.name}</b>
          {item.summary ? <p className="mt-2 text-caption leading-5 text-[var(--steel)]">{item.summary}</p> : null}
          <p className="mt-3 text-caption text-[var(--steel)]">{item.project_ids.length} 个项目 · 问题 {item.issues.length} 个 · 成果 {item.achievements.length} 项</p>
          <span className="mt-2 block text-caption text-[var(--primary)]">{sceneName === item.name ? "收起逻辑简图" : "查看场景 → 问题 → 技术 → 成果 逻辑简图 →"}</span>
        </button>)}
      </div> : null}
      {dim === "场景" && scenes.length === 1 ? <SceneFlow corpusId={corpusId} scene={scenes[0]} onRoute={showRoute} /> : null}

      {dim === "问题" ? scenes.map((scene) => <div key={scene.name} className="space-y-2">
        <p className="text-body font-semibold" style={{ color: FACET_COLORS[0] }}>{scene.name}</p>
        <div className="grid gap-3 md:grid-cols-3">{scene.issues.map((issue) => <article key={issue.name} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4" style={{ borderTop: `3px solid ${FACET_COLORS[1]}` }}>
          <div className="flex flex-wrap items-baseline gap-2"><b>{issue.name}</b><Pill text={issue.state} color={issue.state === "已解决" ? FACET_COLORS[2] : FACET_COLORS[1]} /></div>
          {issue.summary ? <p className="mt-2 text-body leading-6">{issue.summary}</p> : null}
          <p className="mt-2 text-caption text-[var(--steel)]">{issue.project_ids.length} 个项目 · {issue.routes.length ? "解决该问题的典型技术：" : "本库暂无对应技术路线"}</p>
          {issue.routes.length ? <div className="mt-1 flex flex-wrap gap-1.5">{issue.routes.map((r) => <button key={r.title} type="button" onClick={() => showRoute(r.title)}
            title="在技术谱系中查看" className="rounded-full border px-2 py-0.5 text-caption hover:bg-[var(--canvas)]" style={{ borderColor: FACET_COLORS[2] + "88", color: FACET_COLORS[2] }}>{r.title}</button>)}</div> : null}
          <ProjectLinks corpusId={corpusId} ids={issue.project_ids} facet="问题" />
          <Members names={issue.members} />
        </article>)}</div>
      </div>) : null}

      {dim === "技术" ? scenes.map((scene) => <div key={scene.name} className="space-y-2">
        <p className="text-body font-semibold" style={{ color: FACET_COLORS[0] }}>{scene.name}</p>
        {scene.issues.filter((issue) => issue.routes.length).map((issue) => <div key={issue.name} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
          <p className="text-caption text-[var(--steel)]">针对问题：<b style={{ color: FACET_COLORS[1] }}>{issue.name}</b></p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">{issue.routes.map((route) => <article key={route.title} className="rounded-lg bg-[var(--canvas)] p-3" style={{ borderLeft: `3px solid ${FACET_COLORS[2]}` }}>
            <div className="flex flex-wrap items-baseline gap-2"><b className="text-body">{route.title}</b><span className="text-caption text-[var(--steel)]">{route.project_ids.length} 个项目</span></div>
            <p className="mt-1 text-body leading-6">{route.summary}</p>
            {(() => {
              const id = routeItem(route.title); const at = id ? locateItem(lineage, id) : null; const level = id ? lineage?.items[id]?.maturity ?? 0 : 0;
              return at ? <p className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-[var(--steel)]">技术谱系位置：<span style={{ color: LINEAGE_COLOR }}>{at.category.name} › {at.child.name} › {at.theme.name}</span>
                <Tier level={level} /></p> : null;
            })()}
            <button type="button" onClick={() => showRoute(route.title)} className="mt-1 text-caption text-[var(--link)] hover:underline">在技术谱系中查看 →</button>
            <ProjectLinks corpusId={corpusId} ids={route.project_ids} facet="技术" />
            <EvidenceList corpusId={corpusId} evidence={route.evidence} limit={1} />
          </article>)}</div>
        </div>)}
        {!scene.issues.some((issue) => issue.routes.length) ? <p className="text-caption text-[var(--stone)]">该场景暂无可对应的技术路线条目。</p> : null}
      </div>) : null}

      {dim === "成果" ? scenes.map((scene) => <div key={scene.name} className="space-y-2">
        <p className="text-body font-semibold" style={{ color: FACET_COLORS[0] }}>{scene.name}</p>
        {scene.achievements.length ? <div className="grid gap-3 md:grid-cols-3">{scene.achievements.map((item) => <article key={item.title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4" style={{ borderTop: `3px solid ${FACET_COLORS[3]}` }}>
          <b>{item.title}</b>
          {item.summary ? <p className="mt-2 text-body leading-6">{item.summary}</p> : null}
          <p className="mt-2 text-caption text-[var(--steel)]">覆盖 {item.marker_basis.projects} 个项目{item.marker_basis.representative ? ` · 代表项目 ${item.marker_basis.representative}` : ""}</p>
          <EvidenceList corpusId={corpusId} evidence={item.evidence} limit={1} />
        </article>)}</div> : <p className="text-caption text-[var(--stone)]">该场景暂无可对应的成果条目。</p>}
        <OutcomeAnalysis corpusId={corpusId} scene={scene} />
      </div>) : null}

      <div className="flex flex-wrap items-center gap-2 text-caption text-[var(--stone)]">
        <span>{data.state === "stale" ? "四维提取结果已变化，需重新生成。" : data.generated_at ? `生成于 ${new Date(data.generated_at).toLocaleString("zh-CN")}` : ""}</span>
        {coverage.gaps?.length ? <details><summary className="cursor-pointer">未采用的条目 {coverage.gaps.length} 项</summary>
          <ul className="mt-1 space-y-1">{coverage.gaps.map((gap, index) => <li key={index}>{gap.detail}</li>)}</ul></details> : null}
        <span className="flex-1" />{regenerate}
      </div>
    </>}
  </section>;
}
