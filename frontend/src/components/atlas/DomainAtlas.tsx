import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { domainsOverviewQuery, money, type DomainsOverview } from "../../domains";
import { libraryOverviewQuery } from "../../libraryQueries";
import { useApp } from "../../store";
import { LibraryTerrain } from "../LibraryTerrain";
import { GapBoard } from "./GapBoard";
import { LineageRoads } from "./LineageRoads";

/**
 * 领域分析 · 全景 (query 2026-1021 1629, 2026-1022 1606): all libraries as research domains on one page —
 * 01 积累分布图, 02 技术谱系路网, 03 缺口与机会 — under three one-line conclusions a leader reads first
 * (2026-1022: the top carries a title, four figures and those lines, nothing more). The conclusions are
 * sentences over the same numbers the sections draw, not a model's opinion.
 */
/** Each line leads to its evidence: a library chosen in 01, or the gap list in 03. */
export function conclusions(data: DomainsOverview): { text: string; library?: string; section?: string }[] {
  const byFunding = [...data.domains].sort((a, b) => b.funding - a.funding);
  const top2 = byFunding.slice(0, 2);
  const fundShare = Math.round((top2.reduce((s, d) => s + d.funding, 0) / Math.max(1, data.totals.funding)) * 100);
  const itemShare = Math.round((top2.reduce((s, d) => s + d.items, 0) / Math.max(1, data.totals.items)) * 100);
  const byDepth = [...data.domains].filter((d) => d.maturity !== null).sort((a, b) => (b.maturity ?? 0) - (a.maturity ?? 0));
  const richest = byFunding[0], rank = byDepth.findIndex((d) => d.id === richest.id) + 1;
  const short = (name: string) => name.replace(/^AI与/, "");
  return [
    { text: `${top2.map((d) => short(d.name)).join("、")}占 ${fundShare}% 的资金、${itemShare}% 的技术`, library: top2[0].id },
    { text: `资金最多的${short(richest.name)}，平均成熟度只排第 ${rank}/${byDepth.length}`, library: richest.id },
    { text: `待解问题 ${data.totals.open_issues} 个、未覆盖组合 ${data.totals.combos} 个，见 03`, section: "atlas-03" },
  ];
}

export function DomainAtlas() {
  const { data, error, isLoading } = useQuery(domainsOverviewQuery);
  const libraries = useQuery({ ...libraryOverviewQuery() });
  const [, setSearch] = useSearchParams();
  const corpora = useApp().corpora.filter((c) => !c.missing && (c.indexed_count ?? 0) > 0);
  const rows = [...(libraries.data ?? [])].filter((r) => r.projects > 0).sort((a, b) => b.projects - a.projects);
  const [chosenId, setChosenId] = useState("");
  const [reveal, setReveal] = useState<{ library: string; system?: string; at: number }>();
  const chosen = rows.find((r) => r.corpus_id === chosenId) ?? rows[0];
  // The single-domain views (谱系、项目关系、年度…) open from a library's panel in 01.
  const analyse = (id: string) => setSearch({ view: "overview", domain: id });
  // 定位: choose the library in 01 and bring the map into view (from 先给结论 and from 03's gaps).
  const locate = (id: string) => { setChosenId(id); document.getElementById("atlas-01")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  if (isLoading) return <p role="status" className="p-8 text-body text-[var(--steel)]">正在汇总各领域资料…</p>;
  // Without any lineage there is no 全景 yet, but each library's own views still open from here.
  if (error || !data) return <div className="mx-auto max-w-[1200px] space-y-3 px-5 py-7 sm:px-8">
    <p role="alert" className="text-body text-[var(--red)]">{(error as Error)?.message ?? "研究领域全景暂不可读"}</p>
    {corpora.length ? <p className="flex flex-wrap items-center gap-2 text-body text-[var(--steel)]">按资料库查看：
      {corpora.map((c) => <button key={c.id} type="button" onClick={() => analyse(c.id)}
        className="rounded-full border border-[var(--hairline-strong)] px-3 py-1 text-caption text-[var(--slate)] hover:border-[var(--primary)]">{c.name.replace(/^自然科学基金-/, "")}</button>)}</p> : null}
  </div>;
  return <div className="atlas-page mx-auto w-full max-w-[1200px] space-y-10 px-5 py-7 sm:px-8">
    <header className="atlas-hero">
      <div>
        <h1>{data.totals.domains} 个领域的家底、深度与缺口</h1>
        <dl className="atlas-totals">
          <div><dt>项目</dt><dd>{data.totals.projects.toLocaleString("zh-CN")}</dd></div>
          <div><dt>技术条目</dt><dd>{data.totals.items.toLocaleString("zh-CN")}</dd></div>
          <div><dt>{data.funding_label}</dt><dd>{money(data.totals.funding)}</dd></div>
          <div><dt>4–5 档技术</dt><dd>{data.totals.high}</dd></div>
        </dl>
      </div>
      <ul aria-label="先给结论" className="atlas-findings">{conclusions(data).map((line) => <li key={line.text}>
        <button type="button" onClick={() => line.library ? locate(line.library) : document.getElementById(line.section!)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          {line.text}<i aria-hidden="true">→</i></button></li>)}</ul>
    </header>

    <section aria-labelledby="atlas-01">
      <h2 id="atlas-01" className="atlas-section"><span>01</span>研究领域总览<small>点一个库，右侧看它的结构与缺口</small></h2>
      {chosen ? <LibraryTerrain rows={rows} chosen={chosen} onChoose={setChosenId} onAnalyse={analyse} />
        : <p role="status" className="text-body text-[var(--steel)]">{libraries.error ? (libraries.error as Error).message : "正在读取资料库概况…"}</p>}
    </section>

    <section aria-labelledby="atlas-02">
      <h2 id="atlas-02" className="atlas-section"><span>02</span>技术谱系总览<small>点节点逐级展开</small></h2>
      <LineageRoads data={data} reveal={reveal} />
    </section>

    <section aria-labelledby="atlas-03">
      <h2 id="atlas-03" className="atlas-section"><span>03</span>缺口与机会<small>加入候选池，可导出清单、生成立项建议</small></h2>
      <GapBoard data={data} onLocate={locate} onReveal={(library, system) => setReveal({ library, system, at: Date.now() })} />
    </section>
  </div>;
}
