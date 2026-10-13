import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth";
import { useQuery } from "@tanstack/react-query";
import { fetchArtifacts } from "../api";
import { buildBoard, tierOf } from "../briefing";
import { hierarchyQuery, lineageQuery } from "../projects";
import { fetchReviewRuns } from "../reviewApi";
import { useApp } from "../store";
import { LeaderConstruction, type LibraryOverview } from "./LeaderConstruction";
import { LeaderRecent } from "./LeaderRecent";
import { YearDistribution } from "./YearDistribution";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
type Area = "work" | "tech" | "years" | "recent";
const AREAS: { key: Area; label: string }[] = [{ key: "work", label: "工作概况" }, { key: "tech", label: "关键技术" },
  { key: "years", label: "年度分布" }, { key: "recent", label: "近期工作" }];

/**
 * 管理视图 (query 2026-1013 1637 / 1745; .logsdev/机关界面设计语言.md): one level below the leader
 * view — what needs handling (stale structure, unplaced items, failed tasks), the key and
 * supporting technologies and open problems per domain, the year distribution and recent work.
 * Everything is counted from the libraries and the saved reports; nothing is judged by a model here.
 */
export function AdminView() {
  const { corpora } = useApp();
  const { role } = useAuth();
  const [area, setArea] = useState<Area>("work");
  const domains = corpora.filter((c) => !c.missing && (c.indexed_count ?? 0) > 0).sort((a, b) => (b.indexed_count ?? 0) - (a.indexed_count ?? 0));
  const [chosen, setChosen] = useState("");
  const current = domains.find((c) => c.id === chosen) ?? domains[0];
  if (role !== "admin") return <Navigate to="/" replace />;
  const pill = (on: boolean) => `rounded-full border px-3 py-1 text-[13px] ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline)] hover:bg-[var(--surface)]"}`;
  return <main className="min-h-0 flex-1 overflow-y-auto">
    <div className="sticky top-0 z-10 space-y-2 border-b border-[var(--hairline)] bg-[var(--canvas)] px-5 py-2.5">
      <nav aria-label="管理视图" className="flex flex-wrap gap-1 rounded-lg bg-[var(--surface)] p-1 sm:inline-flex">
        {AREAS.map((a) => <button key={a.key} type="button" aria-pressed={area === a.key} onClick={() => setArea(a.key)}
          className={`rounded-md px-3 py-1 text-[14px] ${area === a.key ? "bg-[var(--canvas)] font-semibold shadow-sm" : "text-[var(--steel)] hover:text-[var(--ink)]"}`}>{a.label}</button>)}
      </nav>
      {area === "tech" || area === "years" ? <nav aria-label="选择领域" className="flex flex-wrap gap-1.5">
        {domains.map((c) => <button key={c.id} type="button" aria-pressed={c.id === current?.id} onClick={() => setChosen(c.id)} className={pill(c.id === current?.id)}>{short(c.name)}</button>)}
      </nav> : null}
    </div>
    {area === "work" ? <Work />
      : area === "recent" ? <LeaderRecent />
      : !current ? <p className="p-8 text-sm text-[var(--steel)]">还没有资料库。</p>
      : area === "tech" ? <KeyTechnology key={current.id} corpusId={current.id} name={short(current.name)} />
      : <div className="mx-auto max-w-[1080px] px-5 py-6"><YearDistribution key={current.id} corpusId={current.id} /></div>}
  </main>;
}

type Todo = { key: string; what: string; detail: string; action: string; go: () => void };

/** What needs the administrator: library structure to refresh and tasks that did not finish. */
function Work() {
  const { openCorpus, showInspector } = useApp();
  const navigate = useNavigate();
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
    ...libs.filter((l) => l.lineage.state === "stale").map((l) => ({ key: "ls" + l.corpus_id, what: `${short(l.name)} 技术谱系需要重新生成`,
      detail: l.lineage.stale_reason || "四维条目已变化", action: "查看", go: () => showInspector({ kind: "corpus", corpusId: l.corpus_id }) })),
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
  const active = runs.filter((r) => r.status === "queued" || r.status === "running").length + arts.filter((a) => a.status === "generating").length;
  const kpis: [string, string][] = [["资料库", String(libs.length)], ["项目", String(libs.reduce((n, l) => n + l.projects, 0))],
    ["处理中的任务", String(active)], ["需要处理", String(todos.length)]];
  return <div className="mx-auto max-w-[1180px] space-y-6 px-5 py-6">
    <h1 className="text-xl font-semibold">工作概况</h1>
    <section aria-label="总体数字" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {kpis.map(([title, value]) => <div key={title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <p className="text-[13px] text-[var(--steel)]">{title}</p><p className="mt-1 text-2xl font-semibold">{overview.data ? value : "…"}</p></div>)}
    </section>
    <section aria-label="需要处理">
      <h2 className="mb-2 text-base font-semibold">需要处理 · {todos.length}</h2>
      {!todos.length && overview.data ? <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--steel)]">暂无需要处理的事项。</p> : null}
      <div className="space-y-1.5">{todos.map((t) => <div key={t.key} className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-2.5">
        <span className="min-w-0 flex-1"><b className="block text-[14px] font-medium">{t.what}</b><span className="block truncate text-xs text-[var(--steel)]">{t.detail}</span></span>
        <button type="button" onClick={t.go} className="shrink-0 rounded-md border border-[var(--hairline-strong)] px-3 py-1 text-[13px] hover:bg-[var(--canvas)]">{t.action}</button>
      </div>)}</div>
    </section>
    {/* Choosing a library previews it on the right instead of leaving the page (query 2026-1013 1842). */}
    <div className="-mx-5"><LeaderConstruction maintenance onOpen={(id) => showInspector({ kind: "corpus", corpusId: id })} /></div>
    <p className="text-xs leading-5 text-[var(--stone)]">依据资料库与成果库中的报告统计；对当前业务的客观评价、正反两方面的意见与建议需要调用模型，将在下一步提供，由管理员主动生成。</p>
  </div>;
}

/** Key and supporting technologies and open problems of one domain, counted from its lineage and scenes. */
function KeyTechnology({ corpusId, name }: { corpusId: string; name: string }) {
  const { openCorpus } = useApp();
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
      <button type="button" className="text-sm text-[var(--link)]" onClick={() => openCorpus(corpusId)}>在资料库中查看技术谱系 →</button></div>
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
