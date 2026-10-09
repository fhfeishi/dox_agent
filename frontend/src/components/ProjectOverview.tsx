import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { FACETS, FACET_COLORS, projectQuery, type Project } from "../projects";
import { useApp } from "../store";
import { Button } from "./ui";
import { ProjectGraph } from "./ProjectGraph";
import { SceneHierarchy } from "./SceneHierarchy";

const PURPOSES = [
  ["场景、问题和应用对象有哪些共性？", "task1"],
  ["比较这些项目的数据、方法和已取得成果。", "task2"],
  ["这些项目体现了哪些走向？区分事实与推断并说明资料范围。", "task3"],
] as const;
const SCOPES: Record<string, string> = { awarded: "批准资助金额", direct: "直接费用", total: "总经费" };

export function ProjectOverview({ corpusId, corpusName }: { corpusId: string; corpusName?: string }) {
  const result = useQuery(projectQuery(corpusId));
  const { startResearch, sessionBusy, openPreview } = useApp();
  const [search, setSearch] = useSearchParams();
  // The four-dimension hierarchy is always on top; these secondary views open on demand below it.
  const view = ["timeline", "relations"].includes(search.get("projectView") ?? "") ? search.get("projectView")! : "";
  const facet = FACETS.includes(search.get("dimension") as typeof FACETS[number]) ? search.get("dimension")! : "场景";
  const color = FACET_COLORS[FACETS.indexOf(facet as typeof FACETS[number])];
  const year = search.get("startYear") ?? "";
  const scope = search.get("money") ?? "direct";
  const selected = search.get("project") ?? "";
  const [message, setMessage] = useState("");
  const workbenchRef = useRef<HTMLDivElement>(null);
  const [projectLimit, setProjectLimit] = useState(24);
  const set = (key: string, value: string) => setSearch((old) => {
    const next = new URLSearchParams(old);
    if (value) next.set(key, value); else next.delete(key);
    if (["startYear", "dimension"].includes(key)) next.delete("project");
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
  const fullyProcessed = yearProjects.filter((p) => p.facets[facet].covered_files === p.files.length).length;
  const metric = search.get("metric") ?? "count";
  // 年度数量按项目计数；金额缺失不应把项目从数量图中排除。
  const annualProjects = identified.filter((p) => p.facets[facet].items.length);
  const knownYears = annualProjects.flatMap((p) => p.start_year === null ? [] : [p.start_year]);
  const annualYears = knownYears.length ? Array.from({ length: Math.max(...knownYears) - Math.min(...knownYears) + 1 }, (_, i) => Math.min(...knownYears) + i) : [];
  const annual = annualYears.map((value) => ({ year: value, count: annualProjects.filter((p) => p.start_year === value).length }));
  const annualMax = Math.max(1, ...annual.map((row) => row.count));
  const amount = (p: Project) => !p.funding_conflicts.includes(scope)
    ? p.funding.find((m) => m.scope === scope && m.amount_yuan !== null && m.currency === "CNY") : undefined;
  const plotted = visible.filter((p) => p.start_year !== null && p.facets[facet].items.length > 0 && amount(p));
  const max = Math.max(1, ...plotted.map((p) => Number(amount(p)!.amount_yuan) / 10000));
  const plotYears = [...new Set(plotted.map((p) => p.start_year!))].sort();
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
    {view === "timeline" ? <>
    <div className="flex flex-wrap gap-2">{FACETS.map((key, i) => <button key={key} type="button" aria-pressed={facet === key} onClick={() => set("dimension", key)}
      className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: FACET_COLORS[i], background: facet === key ? FACET_COLORS[i] + "18" : "transparent" }}>{key === "成果" ? "研究成果" : key}</button>)}</div>
    <p className="text-xs leading-6 text-[var(--steel)]">共 {data.coverage.files} 份当前文件，按已识别项目去重；{facet}完全整理 {fullyProcessed} / {yearProjects.length} 个当前年份范围项目。有有效证据不代表该项目全部文件已经整理。</p>
    </> : null}
    {view === "timeline" ? <div className="flex gap-2"><Button size="sm" variant={metric === "count" ? "primary" : "ghost"} onClick={() => set("metric", "count")}>项目数量</Button><Button size="sm" variant={metric === "funding" ? "primary" : "ghost"} onClick={() => set("metric", "funding")}>时间与经费</Button></div> : null}
    {view === "timeline" && metric === "count" ? <section aria-label="年度项目数量" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h3 className="font-semibold">{facet} · 按立项年查看项目数量</h3>
      <p className="my-3 text-sm text-[var(--steel)]">当前主题跨年比较，点击年份筛选项目。同项目多份文件计一次；年份待核对 {annualProjects.filter((p) => p.start_year === null).length} 项。不同主题可包含同一项目。</p>
      <div className="max-h-96 space-y-2 overflow-y-auto">{annual.map((row) => <button key={row.year} type="button" aria-label={row.year + "年：" + row.count + "个项目"} onClick={() => set("startYear", String(row.year))}
        className="flex w-full items-center gap-3 rounded p-2 text-sm hover:bg-[var(--canvas)]" aria-pressed={year === String(row.year)}>
        <span>{row.year}</span><span className="h-4 flex-1 rounded bg-[var(--canvas)]"><span className="block h-4 rounded" style={{ width: (100 * row.count / annualMax) + "%", background: color }} /></span><span className="w-12 text-right">{row.count} 项</span>
      </button>)}</div>
      {!annual.length ? <p className="py-6 text-sm">暂无起始年可确认的项目。</p> : null}
    </section> : null}
    {view === "timeline" && metric === "funding" ? <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">按立项年与经费查看项目</h3><select aria-label="经费口径" value={scope} onChange={(e) => set("money", e.target.value)} className="rounded border p-2">{Object.entries(SCOPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <p className="my-3 text-xs text-[var(--steel)]">纵轴：{SCOPES[scope]}（万元）；未绘图 {visible.length - plotted.length} 个项目。缺当前维度证据、金额缺失、单位不明或同口径冲突均不计为零。点高不代表质量更高。</p>
      {plotted.length ? <svg role="img" aria-label="立项年经费分布，可点击项目点" viewBox="0 0 920 320" className="w-full">
        {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1="65" x2="900" y1={265 - ratio * 225} y2={265 - ratio * 225} stroke="var(--hairline)" /><text x="5" y={270 - ratio * 225} fontSize="11" fill="var(--steel)">{(max * ratio).toFixed(1)}</text></g>)}
        {plotYears.map((y, index) => <text key={y} x={plotYears.length === 1 ? 470 : 85 + index * 795 / (plotYears.length - 1)} y="300" fontSize="12" textAnchor="middle" fill="var(--steel)">{y}</text>)}
        {plotted.map((project, index) => <circle key={project.project_id} role="button" tabIndex={0} aria-label={project.title}
          cx={(plotYears.length === 1 ? 470 : 85 + plotYears.indexOf(project.start_year!) * 795 / (plotYears.length - 1)) + ((index % 5) - 2) * 3}
          cy={265 - Number(amount(project)!.amount_yuan) / 10000 / max * 225} r={selected === project.project_id ? 7 : 4} fill={color} fillOpacity=".8"
          onClick={() => set("project", project.project_id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set("project", project.project_id); } }}>
          <title>{project.title} · {project.start_year} · {Number(amount(project)!.amount_yuan) / 10000} 万元 · {SCOPES[scope]}</title>
        </circle>)}
      </svg> : <p className="py-8 text-center text-sm text-[var(--steel)]">当前没有经费口径可确认的项目，先在项目详情核对来源。</p>}
    </section> : null}
    {view === "timeline" && metric === "funding" && visible.length > plotted.length ? <details className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <summary className="cursor-pointer text-sm">未绘图项目与原因 · {visible.length - plotted.length}</summary>
      {visible.filter((p) => !plotted.includes(p)).map((p) => <button key={p.project_id} onClick={() => set("project", p.project_id)} className="mt-3 block w-full border-t border-[var(--hairline)] pt-3 text-left text-sm">
        <strong>{p.title}</strong><p className="mt-1 text-xs text-[var(--steel)]">{[
          p.start_year === null ? "立项年待核对" : "",
          !p.facets[facet].items.length ? "当前维度无有效证据" : "",
          p.funding_conflicts.includes(scope) ? "同口径金额冲突" : !amount(p) ? "此经费口径缺失或单位未明确" : "",
        ].filter(Boolean).join("；")}</p></button>)}
    </details> : null}
    {view === "relations" ? <ProjectGraph corpusId={corpusId} projects={identified} title={corpusName ?? ""} onOpen={(id) => set("project", id)} /> : null}
    {view === "timeline" ? <>
    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4"><h3 className="mb-3 font-semibold">{focus ? "分析当前项目：" + focus.title : year ? "选择一个问题，分析当前筛选项目" : "选择一个问题，分析本资料库"}</h3><div className="flex flex-wrap gap-2">{PURPOSES.map(([question, task]) => <Button key={task} size="sm" variant="ghost" disabled={sessionBusy} onClick={() => void analyze(question, task)}>{question}</Button>)}</div>{message ? <p role="alert" className="mt-3 text-sm">{message}</p> : null}</section>
    <section><h3 className="mb-3 font-semibold">关联项目 · {visible.length}</h3><div className="grid gap-3 md:grid-cols-2">{visible.slice(0, projectLimit).map((project) => <button key={project.project_id} type="button" onClick={() => set("project", project.project_id)}
      className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 text-left hover:border-[var(--primary)]"><b className="text-sm">{project.title}</b><p className="mt-2 text-xs text-[var(--steel)]">{project.number} · {project.start_year ?? "年份待核对"} · {project.files.length} 份来源 · {project.facets[facet].items.length} 条{facet}证据</p></button>)}</div></section>
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
