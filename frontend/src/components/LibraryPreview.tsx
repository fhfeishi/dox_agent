import { useNavigate } from "react-router";
import { useAuth } from "../auth";
import { useQuery } from "@tanstack/react-query";
import { buildBoard, buildMatrix, libraryInsights } from "../briefing";
import { hierarchyQuery, lineageQuery, projectQuery } from "../projects";
import { useApp } from "../store";
import { FocusRadars } from "./Charts";
import { libraryOverviewQuery } from "../libraryQueries";
import { useLayout } from "../layout";

const short = (name: string) => name.replace(/^自然科学基金-/, "");

/**
 * A library seen from the right-hand panel (query 2026-1013 1842): its numbers, what needs
 * attention, the key conclusions and where its projects concentrate — so choosing a library in the
 * admin view does not leave the page. Entering the library is one explicit button.
 */
export function LibraryPreview({ corpusId }: { corpusId: string }) {
  const { corpora } = useApp();
  const { openCorpus } = useLayout();
  // A leader reads the library, not its upkeep (节点审查 角色表; query 2026-1016 1551).
  const leader = useAuth().role === "leader";
  const navigate = useNavigate();
  const corpus = corpora.find((c) => c.id === corpusId);
  const overview = useQuery({ ...libraryOverviewQuery() });
  const { data: hierarchy } = useQuery(hierarchyQuery(corpusId));
  const { data: lineage } = useQuery(lineageQuery(corpusId));
  const { data: library } = useQuery(projectQuery(corpusId));
  if (!corpus) return <p className="text-sm text-[var(--steel)]">资料库已不可用，请刷新列表。</p>;
  const row = overview.data?.find((r) => r.corpus_id === corpusId);
  const insights = hierarchy?.scenes.length && lineage?.categories.length
    ? libraryInsights(buildBoard(hierarchy, lineage), buildMatrix(lineage), lineage, (library?.projects ?? []).map((p) => ({ start: p.start_year, end: p.end_year })))
    : [];
  const attention = row && !leader ? [
    row.lineage.state === "stale" ? `技术谱系需要重新生成：${row.lineage.stale_reason || "四维条目已变化"}` : "",
    row.hierarchy.state && row.hierarchy.state !== "ready" ? "场景归纳需要更新" : "",
    row.lineage.unplaced ? `${row.lineage.unplaced} 条技术未归入体系` : "",
    row.pending_identity ? `${row.pending_identity} 份资料项目身份待核对` : "",
  ].filter(Boolean) : [];
  const facts: [string, string][] = row && leader ? [["项目", `${row.projects} 个`],
    ["立项年份", row.start_years.length ? `${row.start_years[0]}–${row.start_years.at(-1)}` : "待核对"],
    ["已知经费", row.funding.projects ? `${(Number(row.funding.total_yuan) / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 0 })} 万元（${row.funding.projects} 个项目给出金额）` : "报告未给出"]]
    : row ? [["资料 / 项目", `${row.files} 份 / ${row.projects} 个`],
    ["技术研判", ["场景", "问题", "技术", "成果"].map(key => key + " " + (row.dimensions[key] ?? 0)).join(" · ")],
    ["场景 / 问题", row.hierarchy.scenes ? `${row.hierarchy.scenes} / ${row.hierarchy.issues}` : "未生成"],
    ["技术条目", row.lineage.items ? `${row.lineage.items} 条 · ${row.lineage.systems} 个体系` : "未生成"],
    ["立项年份", row.start_years.length ? `${row.start_years[0]}–${row.start_years.at(-1)}` : "待核对"]] : [];
  return <div className="space-y-4 p-1">
    <div>
      <h2 className="text-group font-semibold">{short(corpus.name)}</h2>
      {corpus.description ? <p className="mt-1 text-body leading-6 text-[var(--steel)]">{corpus.description}</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      {leader ? <button type="button" onClick={() => navigate(`/overview/domains?domain=${encodeURIComponent(corpusId)}`)} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-body text-white">领域分析</button> : null}
      <button type="button" onClick={() => openCorpus(corpusId)} className={leader ? "rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-body" : "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-body text-white"}>进入资料库</button>
      <button type="button" onClick={() => openCorpus(corpusId, "target")} className="rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-body">技术研判</button>
    </div>
    {facts.length ? <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-[var(--surface)] p-3 text-body">
      {facts.map(([k, v]) => <div key={k} className="contents"><dt className="text-[var(--steel)]">{k}</dt><dd>{v}</dd></div>)}
    </dl> : <p role="status" className="text-sm text-[var(--steel)]">正在读取…</p>}
    {attention.length ? <section aria-label="需要处理" className="rounded-xl border border-[var(--warn-line)] bg-[var(--warn-bg)] p-3 text-body text-[var(--warn-fg)]">
      <p className="font-semibold">需要处理</p>{attention.map((a) => <p key={a} className="mt-1">· {a}</p>)}</section> : null}
    {insights.length ? <section aria-label="要点结论" className="space-y-1.5">{insights.map((i) =>
      <div key={i.title} className="rounded-lg border border-[var(--hairline)] px-3 py-2"><span className="block text-xs text-[var(--stone)]">{i.title}</span>
        <span className="block text-body font-medium leading-6">{i.headline}</span></div>)}</section> : null}
    {lineage?.fields?.length ? <FocusRadars fields={lineage.fields} items={lineage.items} stages={[]} /> : null}
  </div>;
}
