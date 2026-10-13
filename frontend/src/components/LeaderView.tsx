import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { buildBoard, buildMatrix, libraryInsights } from "../briefing";
import { hierarchyQuery, lineageQuery, projectQuery } from "../projects";
import { useApp } from "../store";
import { Guide, GUIDE_EVENT } from "./Guide";
import { LineageRoadmap } from "./LineageRoadmap";

const short = (name: string) => name.replace(/^自然科学基金-/, "");

/**
 * 领导视图 (query 2026-1013 1133): the whole interface for a leader account. One domain at a time,
 * read top-down — key conclusions, scenes with their core problems and technical routes, the
 * technology systems — without project lists or technique details. Everything beyond a headline
 * opens on click.
 */
export function LeaderView() {
  const { corpora } = useApp();
  const { username, logout } = useAuth();
  const domains = corpora.filter((c) => !c.missing && (c.indexed_count ?? 0) > 0)
    .sort((a, b) => (b.indexed_count ?? 0) - (a.indexed_count ?? 0));
  const [chosen, setChosen] = useState("");
  const current = domains.find((c) => c.id === chosen) ?? domains[0];
  return <div className="font-app relative flex h-screen flex-col bg-[var(--canvas)] text-[var(--charcoal)]">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-5 py-3">
      <b className="text-[15px]">领域全景</b>
      <nav aria-label="选择领域" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {domains.map((c) => <button key={c.id} type="button" aria-pressed={c.id === current?.id} onClick={() => setChosen(c.id)}
          className={`rounded-full border px-3 py-1 text-[12.5px] ${c.id === current?.id ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline)] hover:bg-[var(--surface)]"}`}>
          {short(c.name)}</button>)}
      </nav>
      <button type="button" className="text-xs text-[var(--steel)]" onClick={() => window.dispatchEvent(new Event(GUIDE_EVENT))}>指南</button>
      <span className="text-xs text-[var(--stone)]">{username} · 领导</span>
      <button type="button" className="text-xs text-[var(--steel)]" onClick={() => void logout()}>退出登录</button>
    </header>
    <Guide area="leader" />
    <main className="min-h-0 flex-1 overflow-y-auto">
      {current ? <Domain key={current.id} corpusId={current.id} name={short(current.name)} />
        : <p className="p-8 text-sm text-[var(--steel)]">还没有可浏览的领域资料。</p>}
    </main>
  </div>;
}

function Domain({ corpusId, name }: { corpusId: string; name: string }) {
  const { data: hierarchy, error } = useQuery(hierarchyQuery(corpusId));
  const { data: lineage } = useQuery(lineageQuery(corpusId));
  const { data: library } = useQuery(projectQuery(corpusId));
  const [open, setOpen] = useState<string>("");
  const [map, setMap] = useState(false);
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
      <p className="mt-1 text-sm text-[var(--steel)]">{board.projects} 个项目 · {hierarchy.scenes.length} 个应用场景 · {systems.length} 个技术体系 · 本期突破 {board.solved} 项、待突破 {board.open} 项</p>
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
            <span className="text-xs text-[#0e7a28]">✔ 已突破 {solved}</span>
            <span className="text-xs text-[var(--steel)]">➜ 待突破 {scene.issues.length - solved}</span>
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
        <button type="button" className="text-xs text-[var(--link)]" onClick={() => setMap(!map)}>{map ? "收起路网全景" : "查看路网全景"}</button>
      </div>
      {map ? <div className="mb-3"><LineageRoadmap lineage={lineage} title={name} selected="" onSelect={() => undefined} /></div> : null}
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
