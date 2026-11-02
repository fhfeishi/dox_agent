import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { domainsOverviewQuery, money, type DomainsOverview } from "../../domains";
import { libraryOverviewQuery } from "../../libraryQueries";
import { useApp } from "../../store";
import { DomainLens } from "./DomainLens";
import { GapBoard } from "./GapBoard";
import { LineageRoads } from "./LineageRoads";
import { LineageBoxes } from "./LineageBoxes";
import { TechLanding } from "./TechLanding";
import { IndexNotice } from "../IndexNotice";

/**
 * 领域分析 · 全景 (query 2026-1021 1629, 2026-1022 1606): all libraries as research domains. Since query
 * 2026-1030 1624 it is one screen at a time, chosen from a fixed row of buttons instead of one long page:
 * 总览 (four figures, three conclusions, the domains), 01 领域格局 / 年度投入 / 关键技术, 02 技术谱系, 03 缺口与机会.
 * The screen is in the address (?screen=), so each one can be linked and the browser's back works.
 * The conclusions are sentences over the same numbers the screens draw, not a model's opinion.
 */
/** Each line names the library its evidence starts from, when there is one. */
function conclusions(data: DomainsOverview): { text: string; library?: string }[] {
  const byFunding = [...data.domains].sort((a, b) => b.funding - a.funding);
  const top2 = byFunding.slice(0, 2);
  const fundShare = Math.round((top2.reduce((s, d) => s + d.funding, 0) / Math.max(1, data.totals.funding)) * 100);
  const itemShare = Math.round((top2.reduce((s, d) => s + d.items, 0) / Math.max(1, data.totals.items)) * 100);
  const byDepth = [...data.domains].filter((d) => d.maturity !== null).sort((a, b) => (b.maturity ?? 0) - (a.maturity ?? 0));
  const richest = byFunding[0], rank = byDepth.findIndex((d) => d.id === richest.id) + 1;
  const short = (name: string) => name.replace(/^AI与/, "");
  if (!data.totals.funded_projects) return [
    { text: "批准资助金额尚未记录，暂不能比较各领域投入", library: byFunding[0]?.id },
    { text: `${data.totals.domains} 个领域共有 ${data.totals.items} 条技术记录`, library: data.domains[0]?.id },
    { text: `待解问题 ${data.totals.open_issues} 个、未覆盖组合 ${data.totals.combos} 个` },
  ];
  return [
    { text: `${top2.map((d) => short(d.name)).join("、")}占 ${fundShare}% 的资金、${itemShare}% 的技术`, library: top2[0].id },
    { text: `资金最多的${short(richest.name)}，平均成熟度只排第 ${rank}/${byDepth.length}`, library: richest.id },
    { text: `待解问题 ${data.totals.open_issues} 个、未覆盖组合 ${data.totals.combos} 个` },
  ];
}

export type AtlasScreen = "summary" | "landscape" | "years" | "tech" | "lineage" | "gaps";
// Buttons sit in groups (总览 · 研究领域 · 谱系 · 缺口); since 1747 the groups carry no 01/02/03 label.
const SCREENS: { group: string; items: [AtlasScreen, string, string][] }[] = [
  { group: "summary", items: [["summary", "总览", "M4 13h4v7H4zM10 4h4v16h-4zM16 9h4v11h-4z"]] },
  { group: "domains", items: [["landscape", "领域格局", "M4 20h16M4 20V4M9 15a2 2 0 1 0 0-.01M15 9a3 3 0 1 0 0-.01"],
    ["years", "年度投入", "M5 20V12M10 20V6M15 20v-9M20 20V9"], ["tech", "关键技术", "M12 4v5M12 9l-6 5M12 9l6 5M6 14v5M18 14v5M12 9v10"]] },
  { group: "lineage", items: [["lineage", "技术谱系", "M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3"]] },
  { group: "gaps", items: [["gaps", "缺口与机会", "M4 6h16M4 12h10M4 18h6M17 15l3 3-3 3"]] },
];
const RADIAL = "M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5";
const TREE = "M3 10h5v4H3zM14 3h7v4h-7zM14 10h7v4h-7zM14 17h7v4h-7zM8 12h3M11 5v14M11 5h3M11 12h3M11 19h3";
const SCREEN_KEYS = SCREENS.flatMap((g) => g.items.map(([k]) => k));
const HEADS: Record<AtlasScreen, [string, string]> = {
  summary: ["", ""],
  landscape: ["领域格局", "三个视角的四象限：分界线是各领域的中位数，圆面积是项目数。点一个领域看它落在哪一格，再点一次进入它的技术体系。"],
  years: ["年度投入", "按项目立项年归属，每根柱子由各领域叠成。点柱子或拖选几年，右侧分析与领域格局都只看这几年。"],
  tech: ["关键技术", "从领域落到具体技术：每条技术带成熟度与判定依据，以及它所在项目的问题、成果与场景。"],
  lineage: ["技术谱系", "人工智能 → 领域 → 技术体系 → 研究方向 → 主题 → 项目，逐级展开。"],
  gaps: ["缺口与机会", "空白技术、待解问题、未覆盖组合；挑出值得先做的，导出机会清单或生成立项建议。"],
};

export function DomainAtlas() {
  const { data, error, isLoading, refetch } = useQuery(domainsOverviewQuery);
  const libraries = useQuery({ ...libraryOverviewQuery() });
  const [search, setSearch] = useSearchParams();
  const corpora = useApp().corpora.filter((c) => !c.missing && (c.indexed_count ?? 0) > 0);
  const rows = [...(libraries.data ?? [])].filter((r) => r.projects > 0).sort((a, b) => b.projects - a.projects);
  const screen = SCREEN_KEYS.find((k) => k === search.get("screen")) ?? "summary";
  const [location, setLocation] = useState<{ id: string; at: number }>();
  const [reveal, setReveal] = useState<{ library: string; system?: string; at: number }>();
  // The single-domain views (谱系、项目关系、年度…) open from a library's panel in 领域格局.
  const analyse = (id: string) => setSearch({ view: "overview", domain: id });
  // A screen change is a step the browser's back can undo; what each screen holds stays in the address.
  const show = (next: AtlasScreen, values: Record<string, string> = {}) => {
    setLocation(undefined); setReveal(undefined);
    setSearch((old) => { const p = new URLSearchParams(old); if (next === "summary") p.delete("screen"); else p.set("screen", next);
      for (const [k, v] of Object.entries(values)) p.set(k, v); return p; });
    document.querySelector("main")?.scrollTo({ top: 0 });
  };
  // 定位: open 领域格局 with that library chosen (from the conclusions, the domain cards and 03's gaps).
  const locate = (id: string, lens?: string) => { show("landscape", lens ? { lens } : {}); setLocation({ id, at: Date.now() }); };
  if (isLoading) return <p role="status" className="p-8 text-body text-[var(--steel)]">正在汇总各领域资料…</p>;
  // Without any lineage there is no 全景 yet, but each library's own views still open from here.
  if (error || !data) return <div className="mx-auto max-w-[var(--page-max)] space-y-3 px-5 py-7 sm:px-8">
    <IndexNotice error={error ?? new Error("研究领域全景暂不可读")} retry={() => { void refetch(); }} />
    {corpora.length ? <p className="flex flex-wrap items-center gap-2 text-body text-[var(--steel)]">按资料库查看：
      {corpora.map((c) => <button key={c.id} type="button" onClick={() => analyse(c.id)}
        className="rounded-full border border-[var(--hairline-strong)] px-3 py-1 text-caption text-[var(--slate)] hover:border-[var(--primary)]">{c.name.replace(/^自然科学基金-/, "")}</button>)}</p> : null}
  </div>;
  const [title, lead] = HEADS[screen];
  // 技术谱系: 放射图 | 向右展开的树 (query 2026-11-02 17:09), icons only; the choice stays in the address.
  const treeView = search.get("roads") === "tree";
  const setView = (tree: boolean) => setSearch((old) => { const p = new URLSearchParams(old); if (tree) p.set("roads", "tree"); else p.delete("roads"); return p; }, { replace: true });
  let body: ReactNode;
  if (screen === "summary") body = <Summary data={data} onLocate={locate} onShow={show} />;
  else if (screen === "landscape" || screen === "years")
    body = <DomainLens key={screen} part={screen === "landscape" ? "map" : "years"} libraries={rows} reveal={location} />;
  else if (screen === "tech") body = <TechLanding data={data} />;
  else if (screen === "lineage") body = treeView ? <LineageBoxes data={data} reveal={reveal} /> : <LineageRoads data={data} reveal={reveal} />;
  else body = <GapBoard data={data} onLocate={(id) => locate(id)}
    onReveal={(library, system) => { show("lineage"); setReveal({ library, system, at: Date.now() }); }} />;
  return <div className="atlas-page w-full">
    <div className="atlas-bar">
      <div className="atlas-bar-in">
        <h1>领域分析<small>{data.totals.domains} 个领域 · {data.totals.projects.toLocaleString("zh-CN")} 个项目</small></h1>
        <nav aria-label="领域分析分屏" className="atlas-screens">
          {SCREENS.map((g) => <div key={g.group} className="atlas-screen-group">
            <div>{g.items.map(([key, label, d]) => <button key={key} type="button" aria-pressed={screen === key} onClick={() => show(key)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>{label}</button>)}</div>
          </div>)}
        </nav>
      </div>
    </div>
    <div className="mx-auto w-full max-w-[var(--page-max)] space-y-4 px-5 pt-5 pb-10 sm:px-8">
      <IndexNotice state={data.domains.find(r => r.index?.state === "refreshing")?.index} />
      {title ? <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-page font-semibold text-[var(--heading)]">{title}</h2>
        <p className="mt-1 text-body text-[var(--steel)]">{lead}</p></div>
        {screen === "lineage" ? <div role="group" aria-label="谱系视图" className="atlas-screen-group"><div>
          {([[false, "放射图", RADIAL], [true, "树状图", TREE]] as const).map(([tree, name, d]) =>
            <button key={name} type="button" aria-pressed={treeView === tree} aria-label={name} title={name} onClick={() => setView(tree)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg></button>)}
        </div></div> : null}</header> : null}
      {body}
    </div>
  </div>;
}

/** 总览: the four figures, the three conclusions each with a small picture of its evidence, and every domain. */
function Summary({ data, onLocate, onShow }: { data: DomainsOverview; onLocate: (id: string, lens?: string) => void; onShow: (s: AtlasScreen, v?: Record<string, string>) => void }) {
  const T = data.totals, lines = conclusions(data), funded = T.funded_projects > 0;
  const byFunding = [...data.domains].sort((a, b) => b.funding - a.funding), top2 = byFunding.slice(0, 2);
  const byDepth = [...data.domains].filter((d) => d.maturity !== null).sort((a, b) => (a.maturity ?? 0) - (b.maturity ?? 0));
  const domains = [...data.domains].sort((a, b) => b.items - a.items);
  const short = (name: string) => name.replace(/^AI与/, "");
  const share = (key: "funding" | "items", label: string) => {
    const total = data.domains.reduce((s, d) => s + d[key], 0) || 1;
    return <div className="grid grid-cols-[3em_1fr] items-center gap-2 text-caption text-[var(--steel)]">{label}
      <span className="flex h-3.5 overflow-hidden rounded-sm bg-[var(--surface-sink)]">{[...data.domains].sort((a, b) => b[key] - a[key]).map((d) => {
        const i = top2.findIndex((t) => t.id === d.id);
        return <i key={d.id} title={`${short(d.name)} ${Math.round((d[key] / total) * 100)}%`} className="block h-full border-r border-white"
          style={{ width: `${(d[key] / total) * 100}%`, background: i === 0 ? "var(--primary)" : i === 1 ? "var(--m-4)" : "var(--hairline-strong)" }} />;
      })}</span></div>;
  };
  const strip = () => {
    const xs = byDepth.map((d) => d.maturity!), lo = Math.min(...xs) - 0.2, hi = Math.max(...xs) + 0.2, w = 300, me = byFunding[0]?.id;
    return <svg viewBox={`0 0 ${w} 48`} className="h-12 w-full" aria-hidden="true">
      <line x1="6" x2={w - 6} y1="22" y2="22" stroke="var(--hairline-strong)" />
      {byDepth.map((d) => { const x = 6 + ((d.maturity! - lo) / (hi - lo)) * (w - 12), on = d.id === me;
        return <g key={d.id}><circle cx={x} cy="22" r={on ? 7 : 4.5} fill={on ? "var(--terrain-warn)" : "var(--terrain-dot)"} opacity={on ? 1 : 0.55} />
          {on ? <text x={x} y="44" textAnchor={x < w / 3 ? "start" : x > (w * 2) / 3 ? "end" : "middle"} fontSize="11" fill="var(--terrain-warn)">{short(d.name)} {d.maturity!.toFixed(2)}</text> : null}</g>; })}
      <text x="6" y="10" fontSize="10" fill="var(--steel)">平均成熟度低</text><text x={w - 6} y="10" textAnchor="end" fontSize="10" fill="var(--steel)">高</text>
    </svg>;
  };
  const gaps: [string, number, string][] = [["空白技术", T.blanks, "var(--terrain-warn)"], ["待解问题", T.open_issues, "var(--terrain-amber)"], ["未覆盖组合", T.combos, "var(--primary)"]];
  const cards: { kind: string; go: string; act: () => void; picture: ReactNode }[] = [
    { kind: "集中度", go: funded ? "在领域格局 · 投入与产出中看 →" : "在领域格局中看 →", act: () => onLocate(lines[0].library ?? "", funded ? "money" : undefined),
      picture: <div className="space-y-1.5">{funded ? share("funding", "资金") : null}{share("items", "技术")}
        <p className="flex flex-wrap gap-3 text-caption text-[var(--steel)]">{top2.map((d, i) => <span key={d.id} className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-xs" style={{ background: i ? "var(--m-4)" : "var(--primary)" }} />{short(d.name)}</span>)}
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-xs bg-[var(--hairline-strong)]" />其他</span></p></div> },
    { kind: "深度", go: "在关键技术中看它停在哪一档 →", act: () => onShow("tech", { tech: lines[1].library ?? "" }), picture: byDepth.length > 1 ? strip() : null },
    { kind: "缺口", go: "在缺口与机会中看 →", act: () => onShow("gaps"),
      picture: <div className="flex gap-2.5">{gaps.map(([label, value, color]) => <div key={label} className="flex-1 border-t-[3px] pt-1.5" style={{ borderColor: color }}>
        <div className="text-group font-semibold tabular-nums text-[var(--heading)]">{value}</div><div className="text-caption text-[var(--steel)]">{label}</div></div>)}</div> },
  ];
  return <div className="space-y-5">
    <header className="atlas-summary-hero">
      <div><h2>{T.domains} 个领域的家底、深度与缺口</h2><p>{data.years[0]}–{data.years.at(-1)} 立项 · 只计已入库的项目 · 不含模型评价</p></div>
      <dl>
        <div><dt>项目</dt><dd>{T.projects.toLocaleString("zh-CN")}</dd></div>
        <div><dt>技术条目</dt><dd>{T.items.toLocaleString("zh-CN")}</dd></div>
        <div><dt>{data.funding_label}</dt><dd>{funded ? money(T.funding) : "未记录"}</dd></div>
        <div><dt>4–5 档技术</dt><dd>{T.high}</dd></div>
      </dl>
    </header>
    <ul aria-label="先给结论" className="grid gap-3.5 lg:grid-cols-3">{lines.map((line, i) => <li key={line.text}>
      <button type="button" onClick={cards[i].act} className="atlas-finding">
        <span className="text-caption tracking-wide text-[var(--steel)]">结论{"一二三"[i]} · {cards[i].kind}</span>
        <b>{line.text}</b>
        {cards[i].picture}
        <span className="mt-auto text-caption text-[var(--link)]">{cards[i].go}</span>
      </button></li>)}</ul>
    <section aria-label="各领域">
      <h3 className="mb-2.5 flex flex-wrap items-baseline gap-2.5 text-emphasis font-semibold text-[var(--heading)]">{T.domains} 个领域
        <span className="text-caption font-normal text-[var(--steel)]">色条是技术条目的成熟度分布（未判定 → 5 档）；点卡片在领域格局中定位</span></h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-2.5">{domains.map((d) => {
        const total = d.levels.reduce((s, v) => s + v, 0) || 1;
        return <li key={d.id}><button type="button" onClick={() => onLocate(d.id)} aria-label={`在领域格局中定位 ${d.name}`}
          className="flex w-full flex-col gap-1.5 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] px-3.5 py-3 text-left hover:border-[var(--primary)]">
          <strong className="text-body text-[var(--heading)]">{short(d.name)}</strong>
          <span className="flex justify-between text-caption text-[var(--steel)]"><span>项目 <b className="font-semibold text-[var(--ink)] tabular-nums">{d.projects.toLocaleString("zh-CN")}</b></span>
            <span>资助 <b className="font-semibold text-[var(--ink)] tabular-nums">{d.funded_projects ? money(d.funding) : "未记录"}</b></span></span>
          <span className="flex h-2 overflow-hidden rounded bg-[var(--surface-sink)]" aria-hidden="true">{d.levels.map((v, i) => v ? <i key={i} className="block h-full" style={{ width: `${(v / total) * 100}%`, background: `var(--m-${i})` }} /> : null)}</span>
          <span className="flex justify-between text-caption text-[var(--steel)]"><span>技术 <b className="font-semibold text-[var(--ink)] tabular-nums">{d.items.toLocaleString("zh-CN")}</b> 条</span>
            <span>平均 <b className="font-semibold text-[var(--ink)] tabular-nums">{d.maturity === null ? "—" : d.maturity.toFixed(2)}</b> 档</span></span>
        </button></li>;
      })}</ul>
    </section>
  </div>;
}
