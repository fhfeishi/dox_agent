import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { FACETS, projectQuery, type Project } from "../projects";
import { Button } from "./ui";
import { ProjectGraph } from "./ProjectGraph";
import { SceneHierarchy } from "./SceneHierarchy";
import { YearDistribution } from "./YearDistribution";
import { useLayout } from "../layout";
import { IndexNotice } from "./IndexNotice";

const SCOPES: Record<string, string> = { awarded: "批准资助金额", direct: "直接费用", total: "总经费" };

export function ProjectOverview({ corpusId, corpusName }: { corpusId: string; corpusName?: string }) {
  const result = useQuery(projectQuery(corpusId));
  const { openPreview } = useLayout();
  const [search, setSearch] = useSearchParams();
  const view = ["timeline", "relations"].includes(search.get("projectView") ?? "") ? search.get("projectView")! : "";
  const year = search.get("startYear") ?? "";
  const set = (key: string, value: string) => setSearch((old) => {
    const next = new URLSearchParams(old);
    if (value) next.set(key, value); else next.delete(key);
    if (key === "startYear") next.delete("project");
    return next;
  });
  const data = result.data;
  if (result.isPending) return <p role="status" className="p-6">正在按项目整理资料…</p>;
  if (result.error || !data) return <IndexNotice error={result.error} retry={() => { void result.refetch(); }} />;
  const identified = data.projects.filter((p) => p.identity_status === "identified");
  const years = [...new Set(identified.map((p) => p.start_year).filter((y): y is number => y !== null))].sort();
  return <div className="mt-5 space-y-5" aria-label="项目归纳">
    <IndexNotice state={data.index} />
    {/* The library header switches views (query 2026-1013 2012); one is shown at a time. */}
    {!view ? <SceneHierarchy corpusId={corpusId} /> : null}
    {view === "timeline" ? <div aria-label="年度筛选" className="flex flex-wrap items-center gap-2">
      <select aria-label="立项年份" value={year} onChange={(e) => set("startYear", e.target.value)} className="rounded border border-[var(--hairline)] bg-[var(--canvas)] p-2 text-body"><option value="">全部立项年份</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
      {year ? <Button size="sm" variant="ghost" onClick={() => setSearch((old) => { const next = new URLSearchParams(old); ["startYear", "project"].forEach((key) => next.delete(key)); return next; })}>清除筛选</Button> : null}
      <span className="text-caption text-[var(--stone)]">本库已识别项目 {data.coverage.identified_projects} 个；选择年份或点柱子，两图同时标出</span>
    </div> : null}
    {/* query 2026-1013 1842 / 2026-1016 0919: projects per year beside funding, linked by year. Asking about
        the library moved to the chat in 资料管理, and the related-project list was removed. */}
    {view === "timeline" ? <YearDistribution corpusId={corpusId} year={year} onYear={(value) => set("startYear", value)} /> : null}
    {view === "relations" ? <ProjectGraph corpusId={corpusId} projects={identified} title={corpusName ?? ""} onOpen={(id) => set("project", id)} /> : null}
    {view === "timeline" ? <>
    {data.coverage.pending_identity_records ? <details className="rounded-xl border border-[var(--hairline)] p-4"><summary className="cursor-pointer text-body">身份待核对的资料 · {data.coverage.pending_identity_records}</summary>{data.projects.filter((p) => p.identity_status === "pending").map((p) => <button key={p.project_id} className="my-2 block text-left text-body text-[var(--primary)]" onClick={() => openPreview(p.files[0].document, null, corpusId)}>{p.title} · {p.identity_conflict ? "文件名与原文批准号冲突" : "基金体系或批准号待核对"} · 查看原文</button>)}</details> : null}
    </> : null}
  </div>;
}


export function ProjectDetail({ corpusId, projectId, facet }: { corpusId: string; projectId: string; facet: string }) {
  const { data, isPending, error } = useQuery(projectQuery(corpusId));
  const [, setSearch] = useSearchParams();
  const focus = data?.projects.find((p) => p.project_id === projectId);
  if (isPending) return <p role="status">正在读取项目…</p>;
  if (!focus) return <p role="alert">{error?.message ?? "当前项目已变化，请返回资料库重新选择。"}</p>;
  function evidence(project: Project, docId: string) {
    const file = project.files.find((f) => f.document.doc_id === docId);
    if (file) setSearch((old) => {
      const next = new URLSearchParams(old); next.set("doc", docId);
      next.set("facet", String(FACETS.indexOf(facet as typeof FACETS[number])));
      next.set("version", file.document.version); return next;
    });
  }
  return (    <section className="rounded-xl border border-[var(--primary)] bg-[var(--surface)] p-5" aria-label="项目详情">
      <div className="flex justify-between gap-3"><h3 className="font-semibold">{focus.title}</h3></div>
      <p className="my-2 text-caption text-[var(--steel)]">批准号 {focus.number || "待核对"} · 立项 {focus.start_year ?? "待核对"} · {focus.files.length} 份文件 · {focus.year_conflict ? "项目时间存在冲突" : "来源版本分别保留"}</p>
      {focus.funding.map((m, i) => <p key={i} className="my-1 text-caption">{SCOPES[m.scope]}：{m.amount_yuan === null ? "金额单位待核对" : Number(m.amount_yuan) / 10000 + " 万元"} · {m.quote}{focus.funding_conflicts.includes(m.scope) ? " · 存在冲突，未纳入经费统计" : ""}</p>)}
      <div className="mt-4 space-y-2">{focus.facets[facet].items.map((item, i) => <button key={i} type="button" onClick={() => evidence(focus, item.doc_id)} className="block w-full rounded-lg bg-[var(--canvas)] p-3 text-left text-body"><b>{item.name} {item.status ? "· " + item.status : ""}</b><p className="mt-1">{item.desc}</p><p className="mt-2 text-caption text-[var(--steel)]">来源：{focus.files.find((f) => f.document.doc_id === item.doc_id)?.document.title}</p><span className="text-caption text-[var(--primary)]">查看此文件的原文依据</span></button>)}</div>
      {focus.files.map((file) => <p key={file.document.doc_id} className="mt-2 text-caption text-[var(--steel)]">{file.document.title} · {file.completed ? "四维提取完成" : file.notice || "未完成整理，已有证据按来源展示"}</p>)}
    </section>
);
}
