import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { FACETS, projectQuery, type Project } from "../projects";
import { useApp } from "../store";
import { Button } from "./ui";
import { ProjectGraph } from "./ProjectGraph";
import { SceneHierarchy } from "./SceneHierarchy";
import { YearDistribution } from "./YearDistribution";

const SCOPES: Record<string, string> = { awarded: "批准资助金额", direct: "直接费用", total: "总经费" };
const PURPOSES = [
  ["场景、问题和应用对象有哪些共性？", "task1"],
  ["比较这些项目的数据、方法和已取得成果。", "task2"],
  ["这些项目体现了哪些走向？区分事实与推断并说明资料范围。", "task3"],
] as const;

export function ProjectOverview({ corpusId, corpusName }: { corpusId: string; corpusName?: string }) {
  const result = useQuery(projectQuery(corpusId));
  const { startResearch, sessionBusy, openPreview } = useApp();
  const [search, setSearch] = useSearchParams();
  // The four-dimension hierarchy is always on top; these secondary views open on demand below it.
  const view = ["timeline", "relations"].includes(search.get("projectView") ?? "") ? search.get("projectView")! : "";
  const year = search.get("startYear") ?? "";
  const selected = search.get("project") ?? "";
  const [message, setMessage] = useState("");
  const workbenchRef = useRef<HTMLDivElement>(null);
  const [projectLimit, setProjectLimit] = useState(24);
  const set = (key: string, value: string) => setSearch((old) => {
    const next = new URLSearchParams(old);
    if (value) next.set(key, value); else next.delete(key);
    if (key === "startYear") next.delete("project");
    return next;
  });
  const data = result.data;
  if (result.isPending) return <p role="status" className="p-6">正在按项目整理资料…</p>;
  if (result.error || !data) return <p role="alert" className="p-6">{result.error?.message}</p>;
  const identified = data.projects.filter((p) => p.identity_status === "identified");
  const yearProjects = identified.filter((p) => !year || p.start_year === Number(year));
  const visible = yearProjects;
  const years = [...new Set(identified.map((p) => p.start_year).filter((y): y is number => y !== null))].sort();
  const focus = data.projects.find((p) => p.project_id === selected);
  async function analyze(question: string, task: string) {
    if (!focus && !year) {
      try { await startResearch(corpusId, null, task, question); } catch (error) { setMessage((error as Error).message); }
      return;
    }
    const projects = focus ? [focus] : visible;
    const ids = [...new Set(projects.flatMap((p) => p.files.map((f) => f.document.doc_id)))];
    if (!ids.length) { setMessage("请选择可读取的项目"); return; }
    if (ids.length > 20) { setMessage(`当前范围包含 ${ids.length} 份资料。逐项目阅读最多选择 20 份，请缩小范围；项目统计仍覆盖当前全部项目。`); return; }
    try { await startResearch(corpusId, ids, task, question + (year ? `
资料已按立项年 ${year} 选择。` : "")); }
    catch (error) { setMessage((error as Error).message); }
  }
  return <div className="mt-5 space-y-5" aria-label="项目归纳">
    <SceneHierarchy corpusId={corpusId} />
    <div ref={workbenchRef} aria-label="更多视图" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3">
      <span className="mr-1 text-xs font-semibold text-[var(--steel)]">更多视图</span>
      {[["timeline", "年度分布"], ["relations", "项目关系"]].map(([key, label]) =>
        <Button key={key} size="sm" variant={view === key ? "primary" : "ghost"} onClick={() => set("projectView", view === key ? "" : key)}>{label}</Button>)}
      <span className="flex-1" />
      {!view ? <span className="text-xs text-[var(--stone)]"><span>本库已识别项目</span> {data.coverage.identified_projects}</span> : null}
      {view === "timeline" ? <>
      <select aria-label="立项年份" value={year} onChange={(e) => set("startYear", e.target.value)} className="rounded border border-[var(--hairline)] bg-[var(--canvas)] p-2"><option value="">全部立项年份</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
      <Button size="sm" variant="ghost" onClick={() => setSearch((old) => { const next = new URLSearchParams(old); ["startYear", "project"].forEach((key) => next.delete(key)); return next; })}>重置筛选</Button>
      </> : null}
    </div>
    {/* query 2026-1013 1842: reports per year and funding scatter, no dimension filter; a bar picks a year. */}
    {view === "timeline" ? <YearDistribution corpusId={corpusId} year={year} onYear={(value) => set("startYear", value)} /> : null}
    {view === "relations" ? <ProjectGraph corpusId={corpusId} projects={identified} title={corpusName ?? ""} onOpen={(id) => set("project", id)} /> : null}
    {view === "timeline" ? <>
    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4"><h3 className="mb-3 font-semibold">{focus ? "分析当前项目：" + focus.title : year ? "选择一个问题，分析当前筛选项目" : "选择一个问题，分析本资料库"}</h3><div className="flex flex-wrap gap-2">{PURPOSES.map(([question, task]) => <Button key={task} size="sm" variant="ghost" disabled={sessionBusy} onClick={() => void analyze(question, task)}>{question}</Button>)}</div>{message ? <p role="alert" className="mt-3 text-sm">{message}</p> : null}</section>
    <section><h3 className="mb-3 font-semibold">关联项目 · {visible.length}</h3><div className="grid gap-3 md:grid-cols-2">{visible.slice(0, projectLimit).map((project) => <button key={project.project_id} type="button" onClick={() => set("project", project.project_id)}
      className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 text-left hover:border-[var(--primary)]"><b className="text-sm">{project.title}</b><p className="mt-2 text-xs text-[var(--steel)]">{project.number} · {project.start_year ?? "年份待核对"} · {project.files.length} 份报告</p></button>)}</div></section>
    {visible.length > projectLimit ? <Button size="sm" variant="ghost" onClick={() => setProjectLimit((value) => value + 24)}>继续查看项目（已显示 {projectLimit} / {visible.length}）</Button> : null}
    {data.coverage.pending_identity_records ? <details className="rounded-xl border border-[var(--hairline)] p-4"><summary className="cursor-pointer text-sm">身份待核对的资料 · {data.coverage.pending_identity_records}</summary>{data.projects.filter((p) => p.identity_status === "pending").map((p) => <button key={p.project_id} className="my-2 block text-left text-sm text-[var(--primary)]" onClick={() => openPreview(p.files[0].document, null, corpusId)}>{p.title} · {p.identity_conflict ? "文件名与原文批准号冲突" : "基金体系或批准号待核对"} · 查看原文</button>)}</details> : null}
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
      <p className="my-2 text-xs text-[var(--steel)]">批准号 {focus.number || "待核对"} · 立项 {focus.start_year ?? "待核对"} · {focus.files.length} 份文件 · {focus.year_conflict ? "项目时间存在冲突" : "来源版本分别保留"}</p>
      {focus.funding.map((m, i) => <p key={i} className="my-1 text-xs">{SCOPES[m.scope]}：{m.amount_yuan === null ? "金额单位待核对" : Number(m.amount_yuan) / 10000 + " 万元"} · {m.quote}{focus.funding_conflicts.includes(m.scope) ? " · 存在冲突，未纳入经费统计" : ""}</p>)}
      <div className="mt-4 space-y-2">{focus.facets[facet].items.map((item, i) => <button key={i} type="button" onClick={() => evidence(focus, item.doc_id)} className="block w-full rounded-lg bg-[var(--canvas)] p-3 text-left text-sm"><b>{item.name} {item.status ? "· " + item.status : ""}</b><p className="mt-1">{item.desc}</p><p className="mt-2 text-xs text-[var(--steel)]">来源：{focus.files.find((f) => f.document.doc_id === item.doc_id)?.document.title}</p><span className="text-xs text-[var(--primary)]">查看此文件的原文依据</span></button>)}</div>
      {focus.files.map((file) => <p key={file.document.doc_id} className="mt-2 text-xs text-[var(--steel)]">{file.document.title} · {file.completed ? "四维整理完成" : file.notice || "未完成整理，已有证据按来源展示"}</p>)}
    </section>
);
}
