import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { workCards } from "../navigation";
import { RadarChart } from "./Charts";
import { Icon } from "./Icons";
import { MyWorkSection } from "./MyWorkSection";
import { HeroCarousel } from "./HeroCarousel";
import { libraryOverviewQuery } from "../libraryQueries";
import { LibraryPreviewDrawer } from "./LibraryPreviewDrawer";
import { useState } from "react";
import type { LibraryOverview } from "../api";
import { MATURITY_NAMES } from "../domains";
import { HelpTerm } from "./HelpTerm";
import { IndexNotice } from "./IndexNotice";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const wan = (yuan: string | number) => (Number(yuan) / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
const span = (years: number[]) => years.length ? `${years[0]}–${years.at(-1)}` : "年份待核对";
const pct = (n: number) => `${n.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}%`;
const MATURITY_TIP = `技术条目按成熟度 0–5 档计：${MATURITY_NAMES.map((n, i) => `${i} ${n}`).join("、")}。`
  + "条带是各档条目的占比；数字是「成熟 4 以上」，即已进入场景试验或示范转化的条目占比——按比例计，条目多的大库不吃亏。";


function SectionHead({ index, title, note }: { index: string; title: string; note?: string }) {
  return <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <span className="text-caption font-semibold tabular-nums text-[var(--muted-cool)]">{index}</span>
    <h2 className="text-group font-semibold text-[var(--heading)]">{title}</h2>
    {note ? <span className="text-caption text-[var(--steel)]">{note}</span> : null}
  </div>;
}

/** Six-level maturity spread as one thin bar, with the share at level 4 or above beside it. */
function MaturityStrip({ row }: { row: LibraryOverview }) {
  const dist = row.lineage.maturity ?? [];
  if (!dist.some(Boolean)) return <span className="w-[6.5rem] text-right text-caption text-[var(--muted-cool-soft)]">未建谱系</span>;
  return <span className="flex w-[6.5rem] items-center justify-end gap-2" title={dist.map((c, i) => `${i} ${MATURITY_NAMES[i]}：${c} 条`).join("\n")}>
    <span aria-hidden="true" className="flex h-1.5 w-14 overflow-hidden rounded-full bg-[var(--track)]">
      {dist.map((c, i) => c ? <i key={i} className="block h-full" style={{ flex: c, background: `var(--m-${i})` }} /> : null)}
    </span>
    <span className="w-9 text-right text-caption tabular-nums text-[var(--text-2)]">{pct(row.lineage.high_share ?? 0)}</span>
  </span>;
}

/**
 * §02 资料库概览 (query 2026-11-02 首页02): one quiet surface instead of a chart box plus a card grid.
 * Choosing a domain on the left only redraws the radar and its eyebrow — it never opens anything. The
 * eyebrow carries the domain's years and known funding, so the rows below do not repeat them. A row
 * (its 预览 ›) opens the right-hand 资料库预览; the page itself never navigates.
 */
function LibraryOverviewPanel({ rows, chosen, choose, open, previewing }: {
  rows: LibraryOverview[]; chosen: LibraryOverview; choose: (id: string) => void; open: (id: string) => void; previewing: string;
}) {
  const most = Math.max(1, ...rows.map((r) => r.projects));
  const fields = (chosen.fields ?? []).slice(0, 8);
  return <div className="overflow-hidden rounded-2xl border border-[var(--line-cool)] bg-white">
    <div className="grid @3xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div role="group" aria-label="各领域项目数" className="p-5">
        <h3 className="text-body font-semibold text-[var(--heading)]">各领域项目数</h3>
        <p className="mb-3 text-caption text-[var(--text-3)]">按库内识别的项目计；选一个领域看它的应用方向</p>
        <ul className="space-y-0.5">{rows.map((r) => {
          const on = r.corpus_id === chosen.corpus_id;
          return <li key={r.corpus_id}>
            <button type="button" aria-pressed={on} onClick={() => choose(r.corpus_id)}
              className={`relative grid w-full grid-cols-[minmax(84px,9em)_1fr_auto] items-center gap-3 rounded-lg py-1.5 pr-2 pl-3 text-left text-body transition-colors focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${on ? "bg-[var(--selected-cool)]" : "hover:bg-[var(--surface-cool)]"}`}>
              <span aria-hidden="true" className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-colors ${on ? "bg-[var(--primary)]" : "bg-transparent"}`} />
              <span className={`truncate ${on ? "font-semibold text-[var(--heading)]" : "text-[var(--text-2)]"}`} title={short(r.name)}>{short(r.name)}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]"><span className="block h-full rounded-full transition-[width,background-color] duration-300"
                style={{ width: `${Math.max(2, r.projects / most * 100)}%`, background: on ? "var(--banner-3)" : "var(--bar-soft)" }} /></span>
              <span className={`w-10 text-right tabular-nums ${on ? "text-[var(--heading)]" : "text-[var(--text-3)]"}`}>{r.projects}</span>
            </button></li>;
        })}</ul>
      </div>
      <div aria-label="所选领域" role="group" aria-live="polite" className="flex flex-col border-t border-[var(--line-cool-soft)] p-5 @3xl:border-t-0 @3xl:border-l">
        <p className="text-caption text-[var(--text-3)]">
          <b className="font-semibold tabular-nums text-[var(--heading)]">{chosen.projects}</b> 个项目 · 立项 {span(chosen.start_years)}
          {chosen.funding.projects
            ? <> · 已知{chosen.funding.label ?? "经费"} <b className="font-semibold tabular-nums text-[var(--heading)]">{wan(chosen.funding.total_yuan)}</b> 万元（{chosen.funding.projects} 个项目给出）</>
            : " · 报告未给出经费"}
        </p>
        <h3 className="mt-1 text-group font-semibold text-[var(--heading)]">{short(chosen.name)}<span className="font-normal text-[var(--text-3)]"> · 应用方向</span></h3>
        <div className="flex-1 pt-2">
          {fields.length ? <RadarChart spec={{ type: "radar", title: `${short(chosen.name)}应用方向分布`, labels: fields.map(([n]) => n), values: fields.map(([, v]) => v), unit: " 个项目", max: chosen.projects,
            note: "有技术服务于该方向的项目数，一个项目可计入多个方向；方向由模型归纳，需人工核对" }} />
            : <p className="py-10 text-center text-body text-[var(--text-3)]">该领域尚未归纳应用方向。</p>}
        </div>
      </div>
    </div>

    {/* Light preview rows, not a card grid: name over its technology count, projects, maturity, 预览 ›.
        Units sit in the cells, so the two columns need no header row. */}
    <div className="border-t border-[var(--line-cool-soft)] bg-[var(--surface-cool)]/40 px-3 pt-3 pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 pb-2">
        <h3 className="text-body font-semibold text-[var(--heading)]">资料库预览</h3>
        <p className="text-caption text-[var(--muted-cool)]">条带为成熟度 0–5 档占比，数字为 <HelpTerm text={MATURITY_TIP}>成熟 4 以上</HelpTerm> 的条目比例</p>
      </div>
      <ul aria-label="资料库预览" className="grid gap-x-6 gap-y-px @4xl:grid-cols-2">{rows.map((r) => {
        const on = r.corpus_id === previewing;
        const tech = r.lineage.items ? `${r.lineage.items.toLocaleString("zh-CN")} 条技术 · ${r.lineage.systems} 个体系` : "未建谱系";
        return <li key={r.corpus_id}>
          <button type="button" onClick={() => open(r.corpus_id)} aria-label={`预览 ${short(r.name)}：${r.projects} 个项目，${tech}`}
            className={`group grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--primary)] @md:grid-cols-[minmax(0,1fr)_auto_auto_auto] ${on ? "bg-[var(--selected-cool)]" : "hover:bg-white"}`}>
            <span className="min-w-0">
              <b className="block truncate text-body font-medium text-[var(--heading)]" title={short(r.name)}>{short(r.name)}</b>
              <span className="block truncate text-caption tabular-nums text-[var(--text-3)]">{tech}</span>
            </span>
            <span className="text-right text-caption text-[var(--text-3)]"><b className="text-body font-semibold tabular-nums text-[var(--text-2)]">{r.projects}</b> 项目</span>
            <MaturityStrip row={r} />
            <span aria-hidden="true" className={`hidden w-12 text-right text-caption text-[var(--link)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 @md:block ${on ? "opacity-100" : "opacity-40"}`}>预览 ›</span>
          </button>
        </li>;
      })}</ul>
    </div>
  </div>;
}

/**
 * 首页 for leaders (query 2026-1016 1551 / 2026-1019 1458, after 1518 and the 0946 merge with 资料库建设):
 * the landscape banner, then 工作台, the libraries at a glance and 我的工作. The overview
 * pairs projects per domain (ranked bars: two domains hold most projects, so a radar across domains
 * would show only two spikes) with a radar of the chosen domain's application directions. Choosing a
 * domain stays on this page and only moves the chart; a preview row slides the library out on the right
 * (query 2026-1022 1606, 2026-11-02 首页02). No report or library counts and no recent progress (1142 / 1518); every number
 * names its basis (机关界面设计语言 “口径可信”).
 */
export function LeaderHome() {
  // Preview rows open the same right-hand slide-out as 领域分析 (query 2026-1022 1606), not the docked panel.
  const [preview, setPreview] = useState("");
  const [search, setSearch] = useSearchParams();
  const overview = useQuery({ ...libraryOverviewQuery() });
  const rows = [...(overview.data ?? [])].filter((r) => r.projects > 0).sort((a, b) => b.projects - a.projects);
  const chosen = rows.find((r) => r.corpus_id === search.get("domain")) ?? rows[0];
  // The choice lives in the address, replaced rather than added, so a refresh keeps it and Back leaves the page.
  const choose = (id: string) => setSearch((old) => { const next = new URLSearchParams(old); next.set("domain", id); return next; }, { replace: true });
  const openLibrary = (id: string) => { choose(id); setPreview(id); };

  return <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--page-cool)]">
    <div className="mx-auto max-w-[var(--page-max)] space-y-9 px-5 py-7 sm:px-8">
      {overview.data ? <HeroCarousel rows={rows} />
        : <div className="h-[300px] rounded-2xl bg-gradient-to-br from-[var(--banner-1)] via-[var(--banner-2)] to-[var(--banner-3)]" aria-hidden="true" />}
      <p className="-mt-6 text-caption text-[var(--stone)]">项目在各库内按批准号去重，跨库合计未去重；经费按各报告所述金额统计，未给出的不补零。</p>

      {/* 工作台 (query 2026-1019 1458, formerly “开始今天的工作”): four large, square-ish entries. */}
      <section aria-label="工作台" className="@container">
        <SectionHead index="01" title="工作台" />
        <div className="grid grid-cols-2 gap-4 @5xl:grid-cols-4">
          {workCards("leader").map((w) => <Link key={w.to} to={w.to}
            className="group relative flex min-h-[158px] flex-col overflow-hidden rounded-2xl border border-[var(--line-cool)] bg-white p-5 transition-[border-color,box-shadow] hover:border-[var(--line-cool-strong)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
            <span aria-hidden="true" className="pointer-events-none absolute -right-3 -bottom-4 opacity-[0.06]" style={{ color: w.accent }}><Icon name={w.icon} size={112} /></span>
            <span className="relative flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl" style={{ color: w.accent, background: `color-mix(in srgb, ${w.accent} 8%, transparent)` }}><Icon name={w.icon} size={22} /></span>
              <b className="text-group text-[var(--heading)]">{w.title}</b>
            </span>
            <span className="relative mt-3 text-body leading-5 text-[var(--steel)]">{w.text}</span>
            <span className="relative mt-auto text-caption text-[var(--link)] opacity-60 transition-opacity group-hover:opacity-100">进入 →</span>
          </Link>)}
        </div>
      </section>

      {/* Columns follow the section's own width, so the layout holds when the right-hand panel is open. */}
      <section aria-label="资料库概览" className="@container">
        <SectionHead index="02" title="资料库概览" note="点领域切换图表；点资料库行在右侧预览" />
        {overview.error ? <IndexNotice error={overview.error} retry={() => { void overview.refetch(); }} />
          : !overview.data ? <p role="status" className="text-body text-[var(--steel)]">正在读取资料库概况…</p>
          : !chosen ? <p className="text-body text-[var(--steel)]">尚无已入库资料。</p>
          : <><IndexNotice state={rows.find(r => r.index?.state === "refreshing")?.index} />
            <LibraryOverviewPanel rows={rows} chosen={chosen} choose={choose} open={openLibrary} previewing={preview} />
          </>}
      </section>

      <LibraryPreviewDrawer row={rows.find((r) => r.corpus_id === preview) ?? null} onClose={() => setPreview("")} />

      <div>
        <SectionHead index="03" title="我的工作" note="本账户发起的对话、报告与审查" />
        <MyWorkSection bare />
      </div>
    </div>
  </main>;
}
