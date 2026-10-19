import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useApp } from "../store";
import { RadarChart } from "./Charts";
import { Icon, type IconName } from "./Icons";
import type { LibraryOverview } from "./LeaderConstruction";
import { MyWorkSection } from "./MyWorkSection";
import { HeroCarousel } from "./HeroCarousel";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const wan = (yuan: string | number) => (Number(yuan) / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
const span = (years: number[]) => years.length ? `${years[0]}–${years.at(-1)}` : "年份待核对";

const WORK: { to: string; title: string; text: string; icon: IconName; accent: string }[] = [
  { to: "/library", title: "资料查阅", text: "按领域浏览项目资料与原文", icon: "library", accent: "#4f6554" },
  { to: "/tasks", title: "存量分析", text: "对比项目、研判趋势、形成报告", icon: "tasks", accent: "#65569b" },
  { to: "/review/formal", title: "资料审查", text: "核对申请书规范，开展技术评议", icon: "review", accent: "#356d8c" },
  { to: "/intelligence", title: "情报分析", text: "结合外部材料分析背景与可行性", icon: "forecast", accent: "#997346" },
];

function SectionHead({ index, title, note }: { index: string; title: string; note?: string }) {
  return <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <span className="text-xs font-semibold tabular-nums text-[#8a98aa]">{index}</span>
    <h2 className="text-[17px] font-semibold text-[#1f3147]">{title}</h2>
    {note ? <span className="text-xs text-[var(--steel)]">{note}</span> : null}
  </div>;
}

/**
 * 首页 for leaders (query 2026-1016 1551 / 2026-1019 1458, after 1518 and the 0946 merge with 资料库建设):
 * the landscape banner, then 工作台, the libraries at a glance and 我的工作. The overview
 * pairs projects per domain (ranked bars: two domains hold most projects, so a radar across domains
 * would show only two spikes) with a radar of the chosen domain's application directions. Choosing a
 * domain or a library card stays on this page: the panel follows the choice and the library opens
 * on the right. No report or library counts and no recent progress (1142 / 1518); every number
 * names its basis (机关界面设计语言 “口径可信”).
 */
export function LeaderHome() {
  const { showInspector } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const overview = useQuery({ queryKey: ["overview", "libraries"], queryFn: async ({ signal }): Promise<LibraryOverview[]> => {
    const response = await fetch("/api/overview/libraries", { signal });
    if (!response.ok) throw new Error("资料库概况暂不可读");
    return response.json();
  } });
  const rows = [...(overview.data ?? [])].filter((r) => r.projects > 0).sort((a, b) => b.projects - a.projects);
  const chosen = rows.find((r) => r.corpus_id === search.get("domain")) ?? rows[0];
  // The choice lives in the address, replaced rather than added, so a refresh keeps it and Back leaves the page.
  const choose = (id: string) => setSearch((old) => { const next = new URLSearchParams(old); next.set("domain", id); return next; }, { replace: true });
  const openLibrary = (id: string) => { choose(id); showInspector({ kind: "corpus", corpusId: id }); };
  const most = Math.max(1, ...rows.map((r) => r.projects));
  const fields = (chosen?.fields ?? []).slice(0, 8);

  return <main className="min-h-0 flex-1 overflow-y-auto bg-[#f5f7fa]">
    <div className="mx-auto max-w-[1240px] space-y-9 px-5 py-7 lg:px-8">
      {overview.data ? <HeroCarousel rows={rows} />
        : <div className="h-[300px] rounded-2xl bg-gradient-to-br from-[#172a40] via-[#1f3a57] to-[#2c5373]" aria-hidden="true" />}
      <p className="-mt-6 text-xs text-[var(--stone)]">项目在各库内按批准号去重，跨库合计未去重；经费按各报告所述金额统计，未给出的不补零。</p>

      {/* 工作台 (query 2026-1019 1458, formerly “开始今天的工作”): four large, square-ish entries. */}
      <section aria-label="工作台" className="@container">
        <SectionHead index="01" title="工作台" />
        <div className="grid grid-cols-2 gap-4 @5xl:grid-cols-4">
          {WORK.map((w) => <Link key={w.to} to={w.to}
            className="group flex aspect-[5/4] flex-col rounded-2xl border border-[#e2e7ee] bg-white p-5 transition-[border-color,box-shadow] hover:border-[#b4c1d2] hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
            <span className="grid size-12 place-items-center rounded-xl" style={{ color: w.accent, background: w.accent + "14" }}><Icon name={w.icon} size={24} /></span>
            <b className="mt-auto text-[18px] text-[#1f3147]">{w.title}</b>
            <span className="mt-1 text-[12.5px] leading-5 text-[var(--steel)]">{w.text}</span>
            <span className="mt-3 text-xs text-[var(--link)] opacity-60 transition-opacity group-hover:opacity-100">进入 →</span>
          </Link>)}
        </div>
      </section>

      {/* Columns follow the section's own width, so the layout holds when the right-hand panel is open. */}
      <section aria-label="资料库概览" className="@container">
        <SectionHead index="02" title="资料库概览" note="点领域切换图表；点卡片在右侧查看资料库" />
        {overview.error ? <p role="alert" className="text-sm text-[var(--red)]">{(overview.error as Error).message}</p>
          : !overview.data ? <p role="status" className="text-sm text-[var(--steel)]">正在读取资料库概况…</p>
          : !chosen ? <p className="text-sm text-[var(--steel)]">尚无已入库资料。</p>
          : <>
            <div className="grid gap-4 rounded-2xl border border-[#e2e7ee] bg-white p-5 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div aria-label="各领域项目数" role="group">
                <h3 className="text-sm font-semibold text-[#1f3147]">各领域项目数</h3>
                <p className="mb-3 text-xs text-[var(--stone)]">按库内识别的项目计；点一个领域查看其应用方向</p>
                <ul className="space-y-1">{rows.map((r) => <li key={r.corpus_id}>
                  <button type="button" aria-pressed={r.corpus_id === chosen.corpus_id} onClick={() => choose(r.corpus_id)}
                    className={`grid w-full grid-cols-[minmax(96px,9.5em)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${r.corpus_id === chosen.corpus_id ? "bg-[#eef3f9]" : "hover:bg-[#f6f8fb]"}`}>
                    <span className={`truncate ${r.corpus_id === chosen.corpus_id ? "font-semibold text-[#1f3147]" : "text-[var(--slate)]"}`} title={short(r.name)}>{short(r.name)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-[#edf1f5]"><span className="block h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.max(2, r.projects / most * 100)}%`, background: r.corpus_id === chosen.corpus_id ? "#2c5373" : "#9fb3c8" }} /></span>
                    <span className="w-10 text-right tabular-nums text-[var(--steel)]">{r.projects}</span>
                  </button></li>)}</ul>
              </div>
              <div aria-label="所选领域" className="flex flex-col rounded-xl bg-[#f8fafc] p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[17px] font-semibold text-[#1f3147]">{short(chosen.name)}</h3>
                  <span className="text-xs text-[var(--steel)]">{chosen.projects} 个项目 · 立项 {span(chosen.start_years)}{chosen.funding.projects ? ` · 已知经费 ${wan(chosen.funding.total_yuan)} 万元（${chosen.funding.projects} 个项目）` : ""}</span>
                </div>
                <div className="flex-1 py-2">
                  {fields.length ? <RadarChart spec={{ type: "radar", title: "应用方向分布", labels: fields.map(([n]) => n), values: fields.map(([, v]) => v), unit: " 个项目", max: chosen.projects,
                    note: "有技术服务于该方向的项目数，一个项目可计入多个方向；方向由模型归纳，需人工核对" }} />
                    : <p className="py-10 text-center text-sm text-[var(--steel)]">该领域尚未归纳应用方向。</p>}
                </div>
                <div className="border-t border-[#e6ebf1] pt-3">
                  <button type="button" onClick={() => navigate(`/overview/domains?domain=${encodeURIComponent(chosen.corpus_id)}`)}
                    className="rounded-lg bg-[#1f3a57] px-3 py-1.5 text-[13px] text-white hover:bg-[#172a40]">领域分析</button>
                </div>
              </div>
            </div>

            {/* Small library cards (query 2026-1019 1458): name and size, then years and funding; no directions. */}
            <div aria-label="资料库卡片" className="mt-4 grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @5xl:grid-cols-6">
              {rows.map((r) => <button key={r.corpus_id} type="button" onClick={() => openLibrary(r.corpus_id)} aria-pressed={r.corpus_id === chosen.corpus_id}
                className={`flex flex-col rounded-xl border bg-white px-3 py-2.5 text-left transition-[border-color,box-shadow] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${r.corpus_id === chosen.corpus_id ? "border-[#7f97b1]" : "border-[#e2e7ee] hover:border-[#b4c1d2]"}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-[13.5px] text-[#1f3147]" title={short(r.name)}>{short(r.name)}</b>
                  <b className="shrink-0 text-[15px] font-semibold tabular-nums text-[#1f3147]">{r.projects}</b>
                </span>
                <span aria-hidden="true" className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[#edf1f5]"><span className="block h-full rounded-full bg-[#7f97b1]" style={{ width: `${Math.max(2, r.projects / most * 100)}%` }} /></span>
                <span className="mt-1.5 truncate text-[11px] text-[var(--stone)]">{span(r.start_years)}{r.funding.projects ? ` · ${wan(r.funding.total_yuan)} 万元` : ""}</span>
              </button>)}
            </div>
          </>}
      </section>

      <div>
        <SectionHead index="03" title="我的工作" note="本账户发起的对话、报告与审查" />
        <MyWorkSection bare />
      </div>
    </div>
  </main>;
}
