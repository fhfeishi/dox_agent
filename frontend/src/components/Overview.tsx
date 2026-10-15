import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { fetchArtifacts } from "../api";
import { resultsSummaryQuery } from "../resultsSummary";
import { buildBoard, buildMatrix, libraryInsights, tierOf } from "../briefing";
import { hierarchyQuery, lineageQuery, projectQuery } from "../projects";
import { fetchReviewRuns } from "../reviewApi";
import { useApp } from "../store";
import { FocusRadars } from "./Charts";
import { LeaderConstruction, type LibraryOverview } from "./LeaderConstruction";
import { LineageRoadmap } from "./LineageRoadmap";
import { LineageTree } from "./LineageTree";
import { ProjectGraph } from "./ProjectGraph";
import { YearDistribution } from "./YearDistribution";

const short = (name: string) => name.replace(/^自然科学基金-/, "");

export type OverviewArea = "build" | "domains";
export const OVERVIEW_AREAS: { key: OverviewArea; label: string }[] = [
  { key: "build", label: "资料库建设" }, { key: "domains", label: "领域分析" }];
type View = "overview" | "lineage" | "roadmap" | "relations" | "years" | "tech";
const VIEWS: { key: View; label: string; admin?: boolean }[] = [{ key: "overview", label: "总览" }, { key: "lineage", label: "技术谱系" },
  { key: "roadmap", label: "路网形式" }, { key: "relations", label: "项目关系" }, { key: "years", label: "年度分布" },
  { key: "tech", label: "关键技术", admin: true }];

/**
 * 概览 (query 2026-1014 1516): one overview for leaders and administrators under the same top bar as
 * the rest of the system, replacing the separate 领导视图 and 管理视图. Its three parts are chosen
 * from the top bar's 概览 menu, so the bar itself never changes: 资料库建设 (an administrator also sees
 * what needs handling and each library's organisation), 领域分析 (a domain from a dropdown, one view
 * at a time; 关键技术 for administrators). Period summaries of reports live in 成果 (query 2026-1015
 * 1142). Everything is counted from the libraries and the saved reports; nothing here is judged by a model.
 */
export function Overview() {
  const { area: requestedArea = "build" } = useParams();
  const { role } = useAuth();
  const { corpora, showInspector } = useApp();
  const [search, setSearch] = useSearchParams();
  const admin = role === "admin";
  // 近期工作 left 概览 (query 2026-1015 1142); period summaries of reports are in 成果.
  const area = requestedArea === "domains" ? "domains" : "build";
  const domains = corpora.filter((c) => !c.missing && (c.indexed_count ?? 0) > 0)
    .sort((a, b) => (b.indexed_count ?? 0) - (a.indexed_count ?? 0));
  const current = domains.find((c) => c.id === search.get("domain")) ?? domains[0];
  const views = VIEWS.filter((v) => !v.admin || admin);
  const view = views.find((v) => v.key === search.get("view"))?.key ?? "overview";
  const set = (next: Record<string, string>) => setSearch((old) => {
    const value = new URLSearchParams(old);
    for (const [key, v] of Object.entries(next)) { if (v) value.set(key, v); else value.delete(key); }
    return value;
  }, { replace: true });
  const navigate = useNavigate();
  const openDomain = (id: string) => void navigate(`/overview/domains?domain=${encodeURIComponent(id)}`);
  return <main className="min-h-0 flex-1 overflow-y-auto">
    {area === "domains" ? <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] bg-[var(--canvas)] px-5 py-2.5">
      <label className="flex items-center gap-2 text-[13px] text-[var(--steel)]">领域
        <select aria-label="选择领域" value={current?.id ?? ""} onChange={(e) => set({ domain: e.target.value })}
          className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-[14px] font-semibold text-[var(--ink)]">
          {domains.map((c) => <option key={c.id} value={c.id}>{short(c.name)}</option>)}
        </select></label>
      <label className="flex items-center gap-2 text-[13px] text-[var(--steel)]">分析视角
        <select aria-label="分析视角" value={view} onChange={(e) => set({ view: e.target.value === "overview" ? "" : e.target.value })}
          className="max-w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-1.5 text-sm text-[var(--ink)]">
          {views.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
      </label>
    </div> : null}
    {area === "build" ? <>
      {admin ? <Work /> : null}
      {/* A leader opens the domain in 领域分析; an administrator previews the library on the right. */}
      <LeaderConstruction maintenance={admin} onOpen={(id) => admin ? showInspector({ kind: "corpus", corpusId: id }) : openDomain(id)} />
    </>
      : !current ? <p className="p-8 text-sm text-[var(--steel)]">还没有可浏览的领域资料。</p>
      : view === "overview" ? <Domain key={current.id} corpusId={current.id} name={short(current.name)} />
      : view === "tech" ? <KeyTechnology key={current.id} corpusId={current.id} name={short(current.name)} />
      // The lineage takes the full width (query 2026-1014 1642); other views keep a reading width.
      : <div className={view === "lineage" ? "px-5 py-4" : "mx-auto max-w-[1280px] px-5 py-5"}><DomainView key={current.id + view} corpusId={current.id} name={short(current.name)} view={view} /></div>}
  </main>;
}

type Todo = { key: string; what: string; detail: string; action: string; go: () => void };

/** What needs the administrator: library structure to refresh and tasks that did not finish. */
function Work() {
  const { openCorpus, showInspector } = useApp();
  const navigate = useNavigate();
  const totals = useQuery(resultsSummaryQuery);
  const overview = useQuery({ queryKey: ["overview", "libraries"], queryFn: async ({ signal }): Promise<LibraryOverview[]> => {
    const response = await fetch("/api/overview/libraries", { signal });
    if (!response.ok) throw new Error("资料库概况暂不可读");
    return response.json();
  } });
  const reviews = useQuery({ queryKey: ["admin", "reviews"], queryFn: fetchReviewRuns });
  const reports = useQuery({ queryKey: ["admin", "artifacts"], queryFn: () => fetchArtifacts() });
  const libs = overview.data ?? [];
  const runs = reviews.data ?? [];
  const arts = (reports.data ?? []).filter((a) => a.lifecycle === "active");
  const todos: Todo[] = [
    ...libs.filter((l) => l.lineage.state === "stale" || l.lineage.state === "missing").map((l) => ({ key: "ls" + l.corpus_id, what: `${short(l.name)} 技术谱系${l.lineage.state === "missing" ? "尚未生成" : "需要重新生成"}`,
      detail: l.lineage.state === "missing" ? "已有资料尚未生成技术谱系" : l.lineage.stale_reason || "四维条目已变化", action: "查看", go: () => showInspector({ kind: "corpus", corpusId: l.corpus_id }) })),
    ...libs.filter((l) => l.hierarchy.state && l.hierarchy.state !== "ready").map((l) => ({ key: "hs" + l.corpus_id, what: `${short(l.name)} 场景归纳${l.hierarchy.state === "missing" ? "尚未生成" : "需要更新"}`,
      detail: "场景、问题、技术路线与成果的归纳", action: "查看", go: () => showInspector({ kind: "corpus", corpusId: l.corpus_id }) })),
    ...libs.filter((l) => l.lineage.unplaced).map((l) => ({ key: "lu" + l.corpus_id, what: `${short(l.name)} 有 ${l.lineage.unplaced} 条技术未归入体系`,
      detail: "在技术谱系的“未归入体系的条目”中逐条查看", action: "查看", go: () => showInspector({ kind: "corpus", corpusId: l.corpus_id }) })),
    ...libs.filter((l) => l.pending_identity).map((l) => ({ key: "pi" + l.corpus_id, what: `${short(l.name)} 有 ${l.pending_identity} 份资料项目身份待核对`,
      detail: "批准号或基金体系不明，未计入项目统计", action: "打开资料文件", go: () => openCorpus(l.corpus_id, "files") })),
    ...runs.filter((r) => r.status === "failed").slice(0, 10).map((r) => ({ key: "rf" + r.id, what: `审查未完成：${r.document?.metadata?.title || r.document?.filename || "申请书"}`,
      detail: r.error || "原因未记录", action: "查看", go: () => navigate("/review/runs/" + r.id) })),
    ...arts.filter((a) => a.status === "failed").slice(0, 10).map((a) => ({ key: "af" + a.artifact_id, what: `报告未完成：${a.title || "分析报告"}`,
      detail: a.fail_reason || "原因未记录", action: "查看", go: () => showInspector({ kind: "artifact", artifactId: a.artifact_id }) })),
  ];
  const ready = Boolean(overview.data && reviews.data && reports.data && totals.data);
  const errors = [overview.error, reviews.error, reports.error, totals.error].filter(Boolean);
  const kpis: [string, string][] = [["资料库", overview.data ? String(libs.length) : "—"],
    ["项目（各库合计）", overview.data ? String(libs.reduce((n, l) => n + l.projects, 0)) : "—"],
    ["处理中的任务", totals.data ? String(totals.data.active) : "—"],
    ["未完成任务", totals.data ? String(totals.data.failed) : "—"]];
  return <div className="mx-auto max-w-[1180px] space-y-6 px-5 pt-6">
    <header><p className="text-xs text-[var(--steel)]">管理员概览</p><h1 className="mt-2 text-2xl font-semibold">资料建设与运行维护</h1><p className="mt-2 text-sm text-[var(--steel)]">先处理待办，再查看各库覆盖与归纳状态。</p></header>
    <section aria-label="总体数字" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {kpis.map(([title, value]) => <div key={title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <p className="text-[13px] text-[var(--steel)]">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
    </section>
    <section aria-label="需要处理">
      <h2 className="mb-2 text-base font-semibold">需要处理{ready ? " · " + todos.length : ""}</h2>
      {errors.length ? <p role="alert" className="mb-3 text-sm text-[var(--red)]">部分数据读取失败：{errors.map(e => (e as Error).message).join("；")}。以下仅展示已读取事项。</p> : !ready ? <p role="status" className="mb-3 text-sm text-[var(--steel)]">正在读取维护事项…</p> : null}
      <p className="mb-3 text-xs text-[var(--steel)]">库内项目分别计数，跨库未去重。下方列出当前可读取的维护事项；失败任务完整列表见成果。</p>
      {!todos.length && ready && !errors.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--steel)]">暂无需要处理的事项。</p> : null}
      <div className="max-h-[360px] space-y-1.5 overflow-y-auto">{todos.map((t) => <div key={t.key} className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-2.5">
        <span className="min-w-0 flex-1"><b className="block text-[14px] font-medium">{t.what}</b><span className="block truncate text-xs text-[var(--steel)]">{t.detail}</span></span>
        <button type="button" onClick={t.go} className="shrink-0 rounded-md border border-[var(--hairline-strong)] px-3 py-1 text-[13px] hover:bg-[var(--canvas)]">{t.action}</button>
      </div>)}</div>
    </section>
  </div>;
}

/** The four views beyond the overview, each the library workspace's own component, read only. */
function DomainView({ corpusId, name, view }: { corpusId: string; name: string; view: Exclude<View, "overview" | "tech"> }) {
  const { showInspector } = useApp();
  const [node, setNode] = useState("");
  const { data: lineage } = useQuery({ ...lineageQuery(corpusId), enabled: view === "roadmap" });
  const { data: library } = useQuery({ ...projectQuery(corpusId), enabled: view === "relations" });
  if (view === "lineage") return <LineageTree corpusId={corpusId} focus={node} onFocus={setNode} onIssue={() => undefined} />;
  if (view === "years") return <YearDistribution corpusId={corpusId} />;
  if (view === "roadmap") return lineage?.categories.length ? <LineageRoadmap lineage={lineage} title={name} selected={node} onSelect={setNode} />
    : <p role="status" className="text-sm text-[var(--steel)]">{lineage ? "该领域尚未生成技术谱系。" : "正在读取…"}</p>;
  return library ? <ProjectGraph corpusId={corpusId} projects={library.projects.filter((p) => p.identity_status === "identified")} title={name}
    onOpen={(id) => showInspector({ kind: "project", corpusId, projectId: id, facet: "成果" })} />
    : <p role="status" className="text-sm text-[var(--steel)]">正在读取…</p>;
}

function Domain({ corpusId, name }: { corpusId: string; name: string }) {
  const { data: hierarchy, error } = useQuery(hierarchyQuery(corpusId));
  const { data: lineage } = useQuery(lineageQuery(corpusId));
  const { data: library } = useQuery(projectQuery(corpusId));
  const [open, setOpen] = useState<string>("");
  const toggle = (key: string) => setOpen(open === key ? "" : key);
  if (error) return <p role="alert" className="p-8 text-sm text-[var(--red)]">{(error as Error).message}</p>;
  if (!hierarchy || !lineage) return <p role="status" className="p-8 text-sm text-[var(--steel)]">正在读取…</p>;
  if (!hierarchy.scenes.length || !lineage.categories.length) return <p className="p-8 text-sm text-[var(--steel)]">该领域尚未完成场景与技术谱系归纳。</p>;
  const board = buildBoard(hierarchy, lineage);
  const insights = libraryInsights(board, buildMatrix(lineage), lineage, (library?.projects ?? []).map((p) => ({ start: p.start_year, end: p.end_year })));
  const projectsOf = (ids: string[]) => new Set(ids.map((id) => lineage.items[id]?.project_id).filter(Boolean)).size;
  const systems = lineage.categories.filter((c) => !c.unplaced).map((c) => ({ ...c,
    projects: projectsOf(c.children.flatMap((d) => d.themes.flatMap((t) => t.items))) })).sort((a, b) => b.projects - a.projects);
  const card = (on: boolean) => `w-full rounded-xl border text-left ${on ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--surface)] hover:border-[var(--primary)]"}`;

  return <div className="mx-auto max-w-[1180px] space-y-7 px-5 py-6">
    <div>
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-1 text-sm text-[var(--steel)]">{board.projects} 个项目 · {hierarchy.scenes.length} 个应用场景 · {systems.length} 个技术体系</p>
    </div>

    <FocusRadars fields={lineage.fields ?? []} items={lineage.items} stages={lineage.stages ?? []} />

    <section aria-label="要点结论">
      <h2 className="mb-2 text-sm font-semibold text-[var(--steel)]">要点结论</h2>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">{insights.map((i) => {
        const key = "i:" + i.title;
        return <button key={i.title} type="button" aria-expanded={open === key} onClick={() => toggle(key)} className={`${card(open === key)} p-3`}>
          <span className="block text-xs text-[var(--stone)]">{i.title}</span>
          <span className="mt-1 block text-[14px] font-semibold leading-6">{i.headline}</span>
          {open === key ? <span className="mt-1.5 block space-y-0.5 text-xs leading-5 text-[var(--steel)]">{i.points.map((p) => <span key={p} className="block">{p}</span>)}</span> : null}
        </button>;
      })}</div>
    </section>

    <section aria-label="场景与问题">
      <h2 className="mb-2 text-sm font-semibold text-[var(--steel)]">场景与核心问题</h2>
      <div className="grid gap-2 md:grid-cols-2">{hierarchy.scenes.map((scene) => {
        const key = "s:" + scene.name;
        return <div key={scene.name} className={card(open === key)}>
          <button type="button" aria-expanded={open === key} onClick={() => toggle(key)} className="flex w-full items-center gap-3 p-3 text-left">
            <b className="min-w-0 flex-1 text-[14px]">{scene.name}</b>
            <span className="text-xs text-[var(--stone)]">{scene.project_ids.length} 个项目 · 问题 {scene.issues.length} 个</span>
          </button>
          {open === key ? <ul className="space-y-2 border-t border-[var(--hairline)] px-3 py-3">{scene.issues.map((issue) =>
            <li key={issue.name} className="text-[13px]">
              <span className="flex gap-1.5"><span className={issue.state === "已解决" ? "text-[#0e7a28]" : "text-[var(--steel)]"}>{issue.state === "已解决" ? "✔" : "➜"}</span><b className="font-medium">{issue.name}</b></span>
              {issue.routes.length ? <span className="mt-1 flex flex-wrap gap-1 pl-5">{issue.routes.map((r) =>
                <span key={r.title} className="rounded-md bg-[var(--canvas)] px-2 py-0.5 text-xs text-[var(--slate)]">{r.title}</span>)}</span>
                : <span className="block pl-5 text-xs text-[var(--stone)]">本库暂无对应技术路线</span>}
            </li>)}</ul> : null}
        </div>;
      })}</div>
    </section>

    <section aria-label="技术路线">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-[var(--steel)]">技术体系与路线</h2>
      </div>
      <div className="grid gap-2 md:grid-cols-2">{systems.map((system) => {
        const key = "t:" + system.name;
        return <div key={system.name} className={card(open === key)}>
          <button type="button" aria-expanded={open === key} onClick={() => toggle(key)} className="flex w-full items-center gap-3 p-3 text-left">
            <span className="min-w-0 flex-1"><b className="block text-[14px]">{system.name}</b>
              {system.plain ? <span className="block truncate text-xs text-[var(--steel)]">{system.plain}</span> : null}</span>
            <span className="text-xs text-[var(--stone)]">{system.projects} 个项目</span>
          </button>
          {open === key ? <div className="flex flex-wrap gap-1.5 border-t border-[var(--hairline)] px-3 py-3">{system.children.map((d) =>
            <span key={d.name} className="rounded-md bg-[var(--canvas)] px-2 py-0.5 text-xs" title={d.plain}>{d.name}
              <span className="ml-1 text-[var(--stone)]">{projectsOf(d.themes.flatMap((t) => t.items))}</span></span>)}</div> : null}
        </div>;
      })}</div>
    </section>
    <p className="text-[11px] text-[var(--stone)]">结论由本库项目报告归纳计算；阶段为报告所述，不是正式技术成熟度评定。</p>
  </div>;
}
/** Key and supporting technologies and open problems of one domain, counted from its lineage and scenes. */
function KeyTechnology({ corpusId, name }: { corpusId: string; name: string }) {
  const [, setSearch] = useSearchParams();
  const { data: lineage } = useQuery(lineageQuery(corpusId));
  const { data: hierarchy } = useQuery(hierarchyQuery(corpusId));
  if (!lineage || !hierarchy) return <p role="status" className="p-8 text-sm text-[var(--steel)]">正在读取…</p>;
  if (!lineage.categories.length) return <p className="p-8 text-sm text-[var(--steel)]">该领域尚未生成技术谱系。</p>;
  const projectsOf = (ids: string[]) => new Set(ids.map((id) => lineage.items[id]?.project_id).filter(Boolean)).size;
  const directions = lineage.categories.filter((c) => !c.unplaced).flatMap((c) => c.children.map((d) => {
    const ids = d.themes.flatMap((t) => t.items);
    const shaped = ids.filter((id) => (lineage.items[id]?.maturity ?? 0) >= 4);
    return { system: c.name, name: d.name, plain: d.plain ?? "", foundation: Boolean(d.foundation), projects: projectsOf(ids), shaped: projectsOf(shaped),
      themes: [...d.themes].sort((a, b) => b.items.length - a.items.length).slice(0, 3).map((t) => t.name) };
  })).sort((a, b) => b.projects - a.projects);
  const board = hierarchy.scenes.length ? buildBoard(hierarchy, lineage) : null;
  const issues = hierarchy.scenes.flatMap((s) => s.issues.map((i) => ({ scene: s.name, ...i })));
  const noRoute = issues.filter((i) => !i.routes.length);
  return <div className="mx-auto max-w-[1180px] space-y-6 px-5 py-6">
    <div className="flex flex-wrap items-baseline gap-3"><h1 className="text-xl font-semibold">{name} · 关键技术</h1>
      <button type="button" className="text-sm text-[var(--link)]" onClick={() => setSearch({ domain: corpusId, view: "lineage" }, { replace: true })}>查看技术谱系 →</button></div>
    <section aria-label="关键技术方向" className="overflow-x-auto rounded-xl border border-[var(--hairline)]">
      <table className="w-full min-w-[720px] text-left text-[13.5px]">
        <thead className="bg-[var(--surface)] text-[12.5px] text-[var(--steel)]"><tr>
          {["技术方向", "所属体系", "项目", `${tierOf(4).label}及以上`, "主要主题"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody>{directions.slice(0, 12).map((d) => <tr key={d.system + d.name} className="border-t border-[var(--hairline)]">
          <td className="px-4 py-2.5"><b className="font-medium">{d.name}</b>{d.foundation ? <span className="ml-2 rounded bg-[#7c5cd61a] px-1.5 text-xs text-[#4a2a8f]">共性</span> : null}
            {d.plain ? <span className="block text-xs text-[var(--steel)]">{d.plain}</span> : null}</td>
          <td className="px-4 py-2.5">{d.system}</td><td className="px-4 py-2.5">{d.projects}</td>
          <td className="px-4 py-2.5">{d.shaped} 个项目</td><td className="px-4 py-2.5 text-[var(--steel)]">{d.themes.join("、")}</td>
        </tr>)}</tbody>
      </table>
    </section>
    {board?.foundations.length ? <section aria-label="共性与配套技术">
      <h2 className="mb-2 text-base font-semibold">共性与配套技术</h2>
      <div className="grid gap-2 sm:grid-cols-2">{board.foundations.map((f) => <div key={f.key} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3 text-[13.5px]">
        <b>{f.name}</b><span className="ml-2 text-xs text-[var(--steel)]">{f.projects} 个项目 · 覆盖 {f.scenes.length}/{board.scenes.length} 个场景</span>
        {f.plain ? <p className="mt-1 text-xs text-[var(--steel)]">{f.plain}</p> : null}</div>)}</div>
    </section> : null}
    <section aria-label="问题与技术路线">
      <h2 className="mb-2 text-base font-semibold">问题与技术路线 · {issues.length} 个问题{noRoute.length ? `，${noRoute.length} 个缺少对应技术路线` : ""}</h2>
      <div className="space-y-1.5">{issues.map((i) => <div key={i.scene + i.name} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-2 text-[13.5px]">
        <span className={i.state === "已解决" ? "text-[#0e7a28]" : "text-[var(--steel)]"}>{i.state === "已解决" ? "✔ 报告所述已解决" : "➜ 待研究"}</span>
        <b className="font-medium">{i.name}</b><span className="text-xs text-[var(--stone)]">{i.scene}</span>
        <span className="flex-1" />
        {i.routes.length ? <span className="text-xs text-[var(--steel)]">{i.routes.map((r) => r.title).slice(0, 3).join("、")}{i.routes.length > 3 ? ` 等 ${i.routes.length} 条` : ""}</span>
          : <span className="text-xs text-[#9a6500]">本库暂无对应技术路线</span>}
      </div>)}</div>
    </section>
    <p className="text-xs leading-5 text-[var(--stone)]">方向按项目数排序；“{tierOf(4).label}及以上”为至少有一条技术报告达到该阶段的项目数；技术方向与问题由模型归纳，需人工核对。</p>
  </div>;
}
