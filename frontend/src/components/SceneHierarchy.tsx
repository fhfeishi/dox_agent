import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  buildHierarchy, FACET_COLORS, hierarchyQuery, LINEAGE_COLOR, lineageQuery, locateItem, projectQuery,
  type Achievement, type HierarchyEvidence, type Scene,
} from "../projects";
import { useApp } from "../store";
import { LineageTree } from "./LineageTree";
import { ReportBoard } from "./ReportBoard";
import { Icon } from "./Icons";
import { Tier } from "./StageMarks";
import { OutputsPanel } from "./OutputsPanel";
import { SceneFlow } from "./SceneFlow";
import { Button } from "./ui";

const ASPECTS = ["论文", "专利", "人才/团队", "平台/基地", "数据与样本", "指标达成", "标准/许可", "转化与应用"];
const STAGE_TONE: Record<string, string> = {
  已取得: "var(--primary-pressed)", 在研: "var(--steel)", 仅预期: "var(--steel)", 原文未提及: "var(--stone)",
};

/** The extracted topics a category groups; the category name itself is a summary. */
function Members({ names }: { names?: string[] }) {
  if (!names?.length || (names.length === 1)) return null;
  return <details className="mt-1 text-xs text-[var(--steel)]"><summary className="cursor-pointer">归并 {names.length} 个原提取条目</summary>
    <p className="mt-1 leading-5">{names.join("、")}</p></details>;
}

export function EvidenceList({ corpusId, evidence, limit = 2, staleHint = "请重新生成层级" }: { corpusId: string; evidence: HierarchyEvidence[]; limit?: number; staleHint?: string }) {
  const { openPreview } = useApp();
  const [error, setError] = useState("");
  // Open the exact cited file version; a re-uploaded report must not silently answer for it.
  async function open(item: HierarchyEvidence) {
    setError("");
    try {
      const response = await fetch(`/api/documents?corpus=${encodeURIComponent(corpusId)}`);
      if (!response.ok) throw new Error("无法读取该库文件列表");
      const docs = (await response.json()) as { doc_id: string; version: string }[];
      const doc = docs.find((value) => value.doc_id === item.doc_id);
      if (!doc) throw new Error("引用文件已移除或尚未完成索引");
      if (doc.version !== item.version) throw new Error("引用文件已更新，" + staleHint);
      openPreview(doc as never, item.locator.basis === "pdf_page" ? item.locator.page ?? null : null, corpusId);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  if (!evidence.length) return <p className="mt-2 text-xs text-[var(--stone)]">本次归纳没有可回读的原文证据。</p>;
  return <div className="mt-2 space-y-2">{evidence.slice(0, limit).map((item, index) => <button key={index} type="button"
    onClick={() => void open(item)}
    className="block w-full rounded-lg bg-[var(--canvas)] p-2 text-left text-xs hover:border-[var(--primary)]">
    <span className="text-[var(--primary)]">{item.locator.basis === "pdf_page" ? `第 ${item.locator.page} 页` : "解析正文位置"} · 查看原文</span>
    <span className="mt-1 block leading-5 text-[var(--ink)]">{item.quote}</span>
  </button>)}
  {error ? <p className="text-xs text-[var(--red)]">{error}</p> : null}
  {evidence.length > limit ? <p className="text-xs text-[var(--stone)]">另有 {evidence.length - limit} 条证据，可在项目详情查看。</p> : null}</div>;
}

function AspectTable({ corpusId, achievements }: { corpusId: string; achievements: Achievement[] }) {
  return <div className="space-y-4">{achievements.map((item) => <section key={item.title} aria-label={item.title + " 相关分析"}
    className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
    <div className="flex flex-wrap items-baseline gap-2"><h4 className="font-semibold">{item.title}</h4>
      <span className="text-xs text-[var(--steel)]">覆盖 {item.marker_basis.projects} 个去重项目
        {item.marker_basis.representative ? ` · 代表项目 ${item.marker_basis.representative}` : ""}</span></div>
    {item.summary ? <p className="mt-1 text-sm text-[var(--steel)]">{item.summary}</p> : null}
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="sr-only">{item.title} 的成果方面完成度</caption>
        <thead><tr>{["方面", "完成度", "说明"].map((head) => <th key={head} scope="col" className="border-b border-[var(--hairline)] py-2 text-left text-xs text-[var(--steel)]">{head}</th>)}</tr></thead>
        <tbody>{ASPECTS.map((aspect) => {
          const found = item.aspects.find((value) => value.aspect === aspect);
          const stage = found?.stage ?? "原文未提及";
          return <tr key={aspect} className="align-top">
            <th scope="row" className="border-b border-[var(--hairline)] py-2 text-left font-normal">{aspect}</th>
            <td className="border-b border-[var(--hairline)] py-2 text-xs" style={{ color: STAGE_TONE[stage] }}>{stage}</td>
            <td className="border-b border-[var(--hairline)] py-2 text-xs leading-5">{found?.note
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
  技术谱系: "总览 · 全库一页：各应用领域的问题进展、报告所述阶段与代表指标，以及跨领域共用的技术底座；点开领域按环节查看全部技术。",
  细节: "细节 · 按学科体系的五级技术树：每项技术属于什么方法、服务哪个领域、报告所述做到哪一步，并可看项目周期。",
  场景: "场景 · 为谁做：本库按服务对象归纳的应用领域；点开查看“问题 → 技术 → 成果”逻辑简图。",
  问题: "问题 · 解决什么：各领域的核心问题，已解决（本期突破）与待解决（深化布局），以及对应的典型技术。",
  技术: "技术 · 怎么做：解决各核心问题的典型技术路线及其在技术谱系中的位置；全部技术见技术谱系。",
  成果: "成果 · 做到什么程度：各领域的标志性成果、成果各方面完成度与项目成果清单。",
};
type Dim = typeof DIMS[number];
const DIM_COLOR: Record<Dim, string> = { 技术谱系: LINEAGE_COLOR, 场景: FACET_COLORS[0], 问题: FACET_COLORS[1], 技术: FACET_COLORS[2], 成果: FACET_COLORS[3] };
const STAGE_RANK = ["已取得", "在研", "仅预期", "原文未提及"];

function Pill({ text, color }: { text: string; color: string }) {
  return <span className="rounded-full px-2 py-0.5 text-xs" style={{ color, background: color + "18" }}>{text}</span>;
}

/** Per-scene outcome analysis: the furthest stage each aspect reached across the flagship outcomes. */
function OutcomeAnalysis({ corpusId, scene }: { corpusId: string; scene: Scene }) {
  const rows = ASPECTS.map((aspect) => {
    const hits = scene.achievements.map((item) => ({ item, found: item.aspects.find((a) => a.aspect === aspect) }))
      .filter((row) => row.found && row.found.stage !== "原文未提及");
    const best = hits.map((row) => row.found!.stage).sort((x, y) => STAGE_RANK.indexOf(x) - STAGE_RANK.indexOf(y))[0] ?? "原文未提及";
    return { aspect, best, count: hits.length };
  });
  const reached = rows.filter((row) => row.best !== "原文未提及");
  return <div className="mt-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4" aria-label={scene.name + " 成果分析"}>
    <p className="text-sm font-semibold">成果分析</p>
    <p className="mt-1 text-xs text-[var(--steel)]">{reached.length
      ? `成果主要体现在${reached.map((row) => row.aspect).join("、")}；${rows.filter((row) => row.best === "已取得").length} 个方面已有取得的成果。`
      : "本场景成果条目中未见可判断的方面。"}没有依据的方面标“原文未提及”。</p>
    <div className="mt-3 flex flex-wrap gap-2">{rows.map((row) => <span key={row.aspect} className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-xs">
      {row.aspect} · <b style={{ color: STAGE_TONE[row.best] }}>{row.best}</b>{row.count ? `（${row.count} 项成果）` : ""}</span>)}</div>
    <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs text-[var(--primary)]">按成果查看各方面完成度与原文</summary>
      <div className="mt-3"><AspectTable corpusId={corpusId} achievements={scene.achievements} /></div></details>
  </div>;
}

/** Projects behind an issue or route, opened in the inspector with one click. */
function ProjectLinks({ corpusId, ids, facet }: { corpusId: string; ids: string[]; facet: string }) {
  const { showInspector } = useApp();
  const { data } = useQuery(projectQuery(corpusId));
  const titles = new Map((data?.projects ?? []).map((p) => [p.project_id, p.title]));
  if (!ids.length) return null;
  return <details className="mt-2 text-xs"><summary className="cursor-pointer text-[var(--primary)]">查看 {ids.length} 个项目</summary>
    <ul className="mt-1 space-y-1">{ids.map((id) => <li key={id}><button type="button" onClick={() => showInspector({ kind: "project", corpusId, projectId: id, facet })}
      className="text-left text-[var(--link)] hover:underline">{titles.get(id) ?? id}</button></li>)}</ul></details>;
}

/**
 * Corpus-level browsing by 技术谱系 / 场景 / 问题 / 技术 / 成果 (query 2026-1009 ④). Every card leads
 * somewhere: scenes open their logic diagram, issues and routes open projects and the lineage.
 */
export function SceneHierarchy({ corpusId }: { corpusId: string }) {
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
  // 技术谱系 opens on the report view; the technology view is the expert's full tree.
  const tech = search.get("view") === "tech";
  const go = (next: Record<string, string>) => setSearch((old) => {
    const value = new URLSearchParams(old);
    for (const [key, v] of Object.entries(next)) { if (v) value.set(key, v); else value.delete(key); }
    return value;
  });
  if (isPending) return <p role="status" className="py-4 text-sm text-[var(--steel)]">正在读取四维归纳…</p>;
  if (error) return <p role="alert" className="py-4 text-sm text-[var(--red)]">{error.message}</p>;
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
  const showRoute = (title: string) => { const id = routeItem(title); go({ dim: "", view: "tech", node: id ? `i:${id}` : "", scene: "" }); };
  const lineageClasses = lineage?.categories.filter((c) => !c.unplaced).length ?? 0;
  const lineageItems = Object.keys(lineage?.items ?? {}).length;
  const counts: Record<Dim, number> = {
    技术谱系: lineageItems,
    场景: data.scenes.length, 问题: issues.length,
    技术: issues.reduce((n, issue) => n + issue.routes.length, 0),
    成果: data.scenes.reduce((n, scene) => n + scene.achievements.length, 0),
  };
  const regenerate = <Button size="sm" variant="ghost" disabled={busy} onClick={() => run.mutate(data.state !== "missing")}>
    {busy ? "生成中…" : data.state === "missing" ? "生成四维归纳" : "重新生成"}</Button>;
  return <section aria-label="场景层级" className="mt-5 space-y-4">
    <div role="tablist" aria-label="四维浏览" className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:gap-3 md:pb-0">
      {DIMS.map((key) => <button key={key} role="tab" type="button" aria-selected={dim === key}
        onClick={() => go({ dim: key === "技术谱系" ? "" : key, scene: key === "技术谱系" ? "" : sceneName, node: "", view: "" })}
        className="shrink-0 rounded-xl border-2 bg-[var(--surface)] px-3 py-1.5 text-left transition-shadow hover:shadow-md md:rounded-2xl md:px-4 md:py-3"
        style={{ borderColor: dim === key ? DIM_COLOR[key] : "var(--hairline)", background: dim === key ? DIM_COLOR[key] + "12" : undefined }}>
        <span className="block text-[15px] font-semibold md:text-lg" style={{ color: DIM_COLOR[key] }}>{key}</span>
        <span className="hidden text-xs text-[var(--steel)] md:inline">{key === "技术谱系" ? (lineageClasses ? `${lineageClasses} 个技术体系 · ${lineageItems} 个技术条目` : "尚未生成")
          : data.scenes.length ? `${counts[key]} ${key === "场景" ? "类 · 目标 6" : key === "问题" ? `个核心问题 · 目标 ${6 * (coverage.targets?.issues_per_scene ?? 3)}` : key === "技术" ? "条技术路线" : "项标志性成果"}` : "尚未归纳"}</span>
      </button>)}
    </div>
    <p className="text-sm text-[var(--steel)]">{PURPOSE[dim === "技术谱系" && tech ? "细节" : dim]}</p>
    {notice ? <p role="alert" className="text-sm text-[var(--red)]">{notice}</p> : null}
    {data.process?.status === "未完成" ? <p role="alert" className="rounded-lg bg-[var(--canvas)] p-3 text-sm">本次生成未完成：{data.process.error}{coverage.update_error ? "，下方为上一次成功生成的结果。" : ""}</p> : null}
    {dim === "技术谱系" ? <div className="flex flex-wrap items-center gap-2">
      {/* query 2026-1009 1743: the two views as icons; the name and purpose stay in the tooltip and accessible name. */}
      <div role="radiogroup" aria-label="谱系视图" className="inline-flex overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--surface)]">
        {([["", "总览", "grid", "按应用领域：本期突破、深化布局、标志成果与共性底座"], ["tech", "细节", "tree", "按学科体系：五级技术谱系树与项目周期图，供专家核查"]] as const).map(([value, label, icon, hint]) =>
          <button key={label} type="button" role="radio" aria-label={label} aria-checked={(value === "tech") === tech} title={`${label}：${hint}`} onClick={() => go({ view: value, node: "" })}
            className={`grid h-8 w-10 place-items-center ${(value === "tech") === tech ? "bg-[var(--primary)] text-white" : "text-[var(--slate)] hover:bg-[var(--canvas)]"}`}>
            <Icon name={icon} size={17} /></button>)}
      </div>
    </div> : null}
    {dim === "技术谱系" && !tech ? <ReportBoard corpusId={corpusId} hierarchy={data} onTech={(key) => go({ view: "tech", node: key })}
      onDim={(d, scene) => go({ dim: d, scene, node: "", view: "" })} /> : null}
    {dim === "技术谱系" && tech ? <LineageTree corpusId={corpusId} focus={node} onFocus={(key) => go({ node: key })}
      onIssue={(scene) => go({ dim: "问题", scene, node: "" })} /> : null}
    {dim === "技术谱系" ? null : !data.scenes.length ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 text-sm text-[var(--steel)]">
      <span className="flex-1">{data.state === "missing" ? "本库尚未生成四维归纳。" : "本库还没有场景维度的整理条目，请先完成文件级四维整理。"}</span>{data.state === "missing" ? regenerate : null}
    </div> : <>
      {dim !== "场景" ? <div className="flex flex-wrap gap-2" aria-label="按场景筛选">
        <button type="button" aria-pressed={!sceneName} onClick={() => go({ scene: "" })} className={`rounded-full border px-3 py-1 text-xs ${!sceneName ? "border-[var(--ink)] font-semibold" : "border-[var(--hairline)]"}`}>全部场景</button>
        {data.scenes.map((scene) => <button key={scene.name} type="button" aria-pressed={sceneName === scene.name} onClick={() => go({ scene: sceneName === scene.name ? "" : scene.name })}
          className={`rounded-full border px-3 py-1 text-xs ${sceneName === scene.name ? "font-semibold" : ""}`} style={{ borderColor: sceneName === scene.name ? FACET_COLORS[0] : "var(--hairline)" }}>{scene.name}</button>)}
      </div> : null}

      {dim === "场景" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.scenes.map((item) => <button key={item.name} type="button" aria-label={"查看场景 " + item.name} aria-pressed={sceneName === item.name}
          onClick={() => go({ scene: sceneName === item.name ? "" : item.name })}
          className="rounded-xl border bg-[var(--surface)] p-4 text-left hover:shadow-md"
          style={{ borderLeft: `4px solid ${FACET_COLORS[0]}`, borderColor: sceneName === item.name ? FACET_COLORS[0] : "var(--hairline)" }}>
          <b>{item.name}</b>
          {item.summary ? <p className="mt-2 text-xs leading-5 text-[var(--steel)]">{item.summary}</p> : null}
          <p className="mt-3 text-xs text-[var(--steel)]">{item.project_ids.length} 个项目 · 问题 {item.issues.length} 个 · 成果 {item.achievements.length} 项</p>
          <span className="mt-2 block text-xs text-[var(--primary)]">{sceneName === item.name ? "收起逻辑简图" : "查看场景 → 问题 → 技术 → 成果 逻辑简图 →"}</span>
        </button>)}
      </div> : null}
      {dim === "场景" && scenes.length === 1 ? <SceneFlow corpusId={corpusId} scene={scenes[0]} onRoute={showRoute} /> : null}

      {dim === "问题" ? scenes.map((scene) => <div key={scene.name} className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: FACET_COLORS[0] }}>{scene.name}</p>
        <div className="grid gap-3 md:grid-cols-3">{scene.issues.map((issue) => <article key={issue.name} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4" style={{ borderTop: `3px solid ${FACET_COLORS[1]}` }}>
          <div className="flex flex-wrap items-baseline gap-2"><b>{issue.name}</b><Pill text={issue.state} color={issue.state === "已解决" ? FACET_COLORS[2] : FACET_COLORS[1]} /></div>
          {issue.summary ? <p className="mt-2 text-sm leading-6">{issue.summary}</p> : null}
          <p className="mt-2 text-xs text-[var(--steel)]">{issue.project_ids.length} 个项目 · {issue.routes.length ? "解决该问题的典型技术：" : "本库暂无对应技术路线"}</p>
          {issue.routes.length ? <div className="mt-1 flex flex-wrap gap-1.5">{issue.routes.map((r) => <button key={r.title} type="button" onClick={() => showRoute(r.title)}
            title="在技术谱系中查看" className="rounded-full border px-2 py-0.5 text-xs hover:bg-[var(--canvas)]" style={{ borderColor: FACET_COLORS[2] + "88", color: FACET_COLORS[2] }}>{r.title}</button>)}</div> : null}
          <ProjectLinks corpusId={corpusId} ids={issue.project_ids} facet="问题" />
          <Members names={issue.members} />
        </article>)}</div>
      </div>) : null}

      {dim === "技术" ? scenes.map((scene) => <div key={scene.name} className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: FACET_COLORS[0] }}>{scene.name}</p>
        {scene.issues.filter((issue) => issue.routes.length).map((issue) => <div key={issue.name} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--steel)]">针对问题：<b style={{ color: FACET_COLORS[1] }}>{issue.name}</b></p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">{issue.routes.map((route) => <article key={route.title} className="rounded-lg bg-[var(--canvas)] p-3" style={{ borderLeft: `3px solid ${FACET_COLORS[2]}` }}>
            <div className="flex flex-wrap items-baseline gap-2"><b className="text-sm">{route.title}</b><span className="text-xs text-[var(--steel)]">{route.project_ids.length} 个项目</span></div>
            <p className="mt-1 text-sm leading-6">{route.summary}</p>
            {(() => {
              const id = routeItem(route.title); const at = id ? locateItem(lineage, id) : null; const level = id ? lineage?.items[id]?.maturity ?? 0 : 0;
              return at ? <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--steel)]">技术谱系位置：<span style={{ color: LINEAGE_COLOR }}>{at.category.name} › {at.child.name} › {at.theme.name}</span>
                <Tier level={level} /></p> : null;
            })()}
            <button type="button" onClick={() => showRoute(route.title)} className="mt-1 text-xs text-[var(--link)] hover:underline">在技术谱系中查看 →</button>
            <ProjectLinks corpusId={corpusId} ids={route.project_ids} facet="技术" />
            <EvidenceList corpusId={corpusId} evidence={route.evidence} limit={1} />
          </article>)}</div>
        </div>)}
        {!scene.issues.some((issue) => issue.routes.length) ? <p className="text-xs text-[var(--stone)]">该场景暂无可对应的技术路线条目。</p> : null}
      </div>) : null}

      {dim === "成果" ? scenes.map((scene) => <div key={scene.name} className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: FACET_COLORS[0] }}>{scene.name}</p>
        {scene.achievements.length ? <div className="grid gap-3 md:grid-cols-3">{scene.achievements.map((item) => <article key={item.title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4" style={{ borderTop: `3px solid ${FACET_COLORS[3]}` }}>
          <b>{item.title}</b>
          {item.summary ? <p className="mt-2 text-sm leading-6">{item.summary}</p> : null}
          <p className="mt-2 text-xs text-[var(--steel)]">覆盖 {item.marker_basis.projects} 个项目{item.marker_basis.representative ? ` · 代表项目 ${item.marker_basis.representative}` : ""}</p>
          <EvidenceList corpusId={corpusId} evidence={item.evidence} limit={1} />
        </article>)}</div> : <p className="text-xs text-[var(--stone)]">该场景暂无可对应的成果条目。</p>}
        {scene.achievements.length ? <OutcomeAnalysis corpusId={corpusId} scene={scene} /> : null}
        <OutputsPanel corpusId={corpusId} projectIds={scene.project_ids} label={scene.name} />
      </div>) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--stone)]">
        <span>{data.state === "stale" ? "四维整理条目已变化，结果需更新。" : data.generated_at ? `生成于 ${new Date(data.generated_at).toLocaleString("zh-CN")}` : ""}</span>
        {coverage.gaps?.length ? <details><summary className="cursor-pointer">未达目标或未采用的条目 {coverage.gaps.length} 项</summary>
          <ul className="mt-1 space-y-1">{coverage.gaps.map((gap, index) => <li key={index}>{gap.detail}</li>)}</ul></details> : null}
        <span className="flex-1" />{regenerate}
      </div>
    </>}
  </section>;
}
