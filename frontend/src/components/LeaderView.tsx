import { lazy, Suspense, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { buildBoard, buildMatrix, libraryInsights } from "../briefing";
import { hierarchyQuery, lineageQuery, projectQuery } from "../projects";
import { useApp } from "../store";
import { Guide } from "./Guide";
import { BrandMark } from "./Icons";
import { UserMenu } from "./UserMenu";
import { LineageRoadmap } from "./LineageRoadmap";
import { LineageTree } from "./LineageTree";
import { ProjectGraph } from "./ProjectGraph";
import { LeaderConstruction } from "./LeaderConstruction";
import { LeaderFunding } from "./LeaderFunding";
import { LeaderRecent } from "./LeaderRecent";

const short = (name: string) => name.replace(/^自然科学基金-/, "");

const Inspector = lazy(() => import("./Inspector").then((m) => ({ default: m.Inspector })));

type Area = "construction" | "domains" | "recent";
const AREAS: { key: Area; label: string }[] = [{ key: "construction", label: "资料库建设" }, { key: "domains", label: "领域分析" }, { key: "recent", label: "近期工作" }];
type View = "overview" | "lineage" | "roadmap" | "relations" | "funding";
const VIEWS: { key: View; label: string }[] = [{ key: "overview", label: "总览" }, { key: "lineage", label: "技术谱系" },
  { key: "roadmap", label: "路网形式" }, { key: "relations", label: "项目关系" }, { key: "funding", label: "项目资金" }];

/**
 * 领导视图 (query 2026-1013 1133 / 1522 / 1637; design language in .logsdev/机关界面设计语言.md):
 * the whole interface for a leader account, previewed by administrators at /leader. Three areas —
 * 资料库建设 (how far each library is built), 领域分析 (one domain at a time through five views) and
 * 近期工作 (reports and reviews by period) — read only, overview first, evidence on demand.
 */
export function LeaderView() {
  const { corpora, inspectorWidth, inspectorOpen } = useApp();
  const { role } = useAuth();
  const [area, setArea] = useState<Area>("construction");
  const [view, setView] = useState<View>("overview");
  const domains = corpora.filter((c) => !c.missing && (c.indexed_count ?? 0) > 0)
    .sort((a, b) => (b.indexed_count ?? 0) - (a.indexed_count ?? 0));
  const [chosen, setChosen] = useState("");
  const current = domains.find((c) => c.id === chosen) ?? domains[0];
  const tab = (on: boolean) => `rounded-lg px-3 py-1.5 text-[14px] ${on ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-pressed)]" : "text-[var(--slate)] hover:bg-[var(--surface)]"}`;
  const pill = (on: boolean) => `rounded-full border px-3 py-1 text-[13px] ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline)] hover:bg-[var(--surface)]"}`;
  return <div style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
    className="font-app relative flex h-screen flex-col bg-[var(--canvas)] text-[var(--charcoal)]">
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-4">
      <span className="mr-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[var(--navy)]"><BrandMark size={14} /></span>
        <b className="text-[15px]">领导视图</b></span>
      <nav aria-label="领导视图导航" className="flex flex-1 items-center gap-1 overflow-x-auto">
        {AREAS.map((a) => <button key={a.key} type="button" aria-current={area === a.key ? "page" : undefined} className={tab(area === a.key)} onClick={() => setArea(a.key)}>{a.label}</button>)}
      </nav>
      {role === "admin" ? <Link to="/home" className="shrink-0 text-[13px] text-[var(--link)]">返回系统</Link> : null}
      <UserMenu />
    </header>
    {area === "domains" ? <div className="shrink-0 space-y-2 border-b border-[var(--hairline)] px-5 py-2.5">
      <nav aria-label="选择领域" className="flex flex-wrap gap-1.5">
        {domains.map((c) => <button key={c.id} type="button" aria-pressed={c.id === current?.id} onClick={() => setChosen(c.id)} className={pill(c.id === current?.id)}>{short(c.name)}</button>)}
      </nav>
      <nav aria-label="分析视角" className="flex flex-wrap gap-1 rounded-lg bg-[var(--surface)] p-1 sm:inline-flex">
        {VIEWS.map((v) => <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)}
          className={`rounded-md px-3 py-1 text-[13.5px] ${view === v.key ? "bg-[var(--canvas)] font-semibold shadow-sm" : "text-[var(--steel)] hover:text-[var(--ink)]"}`}>{v.label}</button>)}
      </nav>
    </div> : null}
    <Guide area="leader" />
    <main className={`min-h-0 flex-1 overflow-y-auto transition-[padding] ${inspectorOpen ? "xl:pr-[calc(var(--inspector-width)+28px)]" : ""}`}>
      {area === "construction" ? <LeaderConstruction onOpen={(id) => { setChosen(id); setView("overview"); setArea("domains"); }} />
        : area === "recent" ? <LeaderRecent />
        : !current ? <p className="p-8 text-sm text-[var(--steel)]">还没有可浏览的领域资料。</p>
        : view === "overview" ? <Domain key={current.id} corpusId={current.id} name={short(current.name)} />
        : <div className="mx-auto max-w-[1280px] px-5 py-5"><DomainView key={current.id + view} corpusId={current.id} name={short(current.name)} view={view} /></div>}
    </main>
    <Suspense fallback={null}><Inspector /></Suspense>
  </div>;
}

/** The four views beyond the overview, each the library workspace's own component, read only. */
function DomainView({ corpusId, name, view }: { corpusId: string; name: string; view: Exclude<View, "overview"> }) {
  const { showInspector } = useApp();
  const [node, setNode] = useState("");
  const { data: lineage } = useQuery({ ...lineageQuery(corpusId), enabled: view === "roadmap" });
  const { data: library } = useQuery({ ...projectQuery(corpusId), enabled: view === "relations" });
  if (view === "lineage") return <LineageTree corpusId={corpusId} focus={node} onFocus={setNode} onIssue={() => undefined} />;
  if (view === "funding") return <LeaderFunding corpusId={corpusId} />;
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
      <p className="mt-1 text-sm text-[var(--steel)]">{board.projects} 个项目 · {hierarchy.scenes.length} 个应用场景 · {systems.length} 个技术体系 · 报告所述已解决 {board.solved} 项、待研究 {board.open} 项</p>
    </div>

    <section aria-label="要点结论">
      <h2 className="mb-2 text-sm font-semibold text-[var(--steel)]">要点结论</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{insights.map((i) => {
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
        const solved = scene.issues.filter((i) => i.state === "已解决").length;
        return <div key={scene.name} className={card(open === key)}>
          <button type="button" aria-expanded={open === key} onClick={() => toggle(key)} className="flex w-full items-center gap-3 p-3 text-left">
            <b className="min-w-0 flex-1 text-[14px]">{scene.name}</b>
            <span className="text-xs text-[#0e7a28]">✔ 报告所述已解决 {solved}</span>
            <span className="text-xs text-[var(--steel)]">➜ 待研究 {scene.issues.length - solved}</span>
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
