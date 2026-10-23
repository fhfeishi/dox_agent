import { useRef, useState } from "react";
import { saveDomainReport, type ArtifactSummary, type LibraryOverview } from "../api";
import { useLayout } from "../layout";
import { MATURITY, shortPct } from "./CaliberPop";
import { SlideOver } from "./SlideOver";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const fmt = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
const clip = (text: string, length: number) => text.length > length ? `${text.slice(0, length)}…` : text;

/**
 * 资料库预览 (query 2026-1021, second pass), sliding over the page instead of navigating away.
 *
 * The head answers "how big is it": projects, files, technology items and the share that reached a
 * real scene — the four figures a leader reads first. The body is four white cards on the page tint,
 * ordered the way the questions come: when the work was funded, what it divides into, how far it
 * travelled, and what actually shipped.
 *
 * The four-dimension coverage left this drawer: it is an extraction-quality measure, kept beside the
 * map where a gap changes what you do next, not repeated here where it adds a chart without adding a
 * decision. Everything else is still stored fact — the system summaries are the model's own `plain`
 * lines and each high-maturity item keeps the basis it quoted.
 *
 * It is the same right-hand panel as everywhere else (query 2026-1023 1044): the page stays visible,
 * the width can be set to 20 / 40 / 60 %, and 导出报告 saves these figures to 报告中心 as a
 * 专项报告 · 领域分析 of the signed-in account.
 */
export function LibraryPreviewDrawer({ row: current, onClose }: { row: LibraryOverview | null; onClose: () => void }) {
  const { openCorpus, showInspector } = useLayout();
  // 八个体系全展开会把成熟度与高成熟条目推到首屏之外；先给前五个，其余一次点开。
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ corpus: string; report?: ArtifactSummary; error?: string } | null>(null);
  // The last library stays on the panel while it slides out.
  const last = useRef(current);
  if (current) last.current = current;
  const row = last.current;

  if (!row) return null;
  const outcome = saved?.corpus === row.corpus_id ? saved : null;
  async function exportReport(corpus: string) {
    setSaving(true);
    try { setSaved({ corpus, report: await saveDomainReport(corpus) }); }
    catch (e) { setSaved({ corpus, error: (e as Error).message }); }
    finally { setSaving(false); }
  }
  const systems = [...(row.lineage.systems_detail ?? [])];
  const top = row.lineage.top ?? [];
  const highest = systems.length ? systems[0].items : 1;
  const dist = row.lineage.maturity ?? [0, 0, 0, 0, 0, 0];
  const items = Math.max(1, row.lineage.items ?? 0);

  // 年度：只用已记录的立项年份，跨度内没有项目的年份画空柱，不插值。
  const years = row.start_years?.length
    ? Array.from({ length: row.start_years.at(-1)! - row.start_years[0] + 1 }, (_, index) => row.start_years[0] + index)
    : [];
  const counts = years.map((year) => row.by_year?.[String(year)] ?? 0);
  const peak = Math.max(1, ...counts);
  const peakIndex = counts.indexOf(Math.max(...counts));
  const money = Number(row.funding.total_yuan) / 10000;
  const peakShare = row.lineage.high_share ?? 0;

  return <SlideOver open={Boolean(current)} onClose={onClose} sizeKey="library-preview" eyebrow="资料库预览" title={short(row.name)} label={`${short(row.name)} 资料库预览`}
    meta={<>{row.start_years?.length ? `${row.start_years[0]}–${row.start_years.at(-1)} 年立项` : "立项年份待核对"} · {row.lineage.systems} 个技术体系</>}
    stats={[{ value: fmt(row.projects), label: "个项目" }, { value: fmt(row.files), label: "份资料" }, { value: fmt(row.lineage.items), label: "条技术" },
      { value: shortPct(peakShare), label: "成熟 4 以上", tone: peakShare >= 20 ? "ok" : "warn" }]}
    footer={<>
      {outcome?.report ? <span role="status" className="text-caption text-[var(--steel)]">已保存到报告中心 ·{" "}
        <button type="button" className="text-[var(--link)] hover:underline" onClick={() => { onClose(); showInspector({ kind: "artifact", artifactId: outcome.report!.artifact_id }); }}>打开</button></span>
        : outcome?.error ? <span role="alert" className="text-caption text-[var(--red)]">{outcome.error}</span>
        : <span className="text-caption text-[var(--muted-cool)]">数据取技术谱系与项目索引</span>}
      <button type="button" className="slide-action" disabled={saving} title="把这份预览的图表与数字保存到报告中心：专项报告 · 领域分析"
        onClick={() => void exportReport(row.corpus_id)}>{saving ? "正在保存…" : "导出报告"}</button>
      <button type="button" className="slide-action primary" onClick={() => { onClose(); openCorpus(row.corpus_id); }}>进入资料库 →</button>
    </>}>
      <div className="space-y-3">
        {years.length ? <section className="terrain-card p-4">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <b className="text-caption font-semibold text-[var(--heading)]">年度立项</b>
            <small className="text-caption text-[var(--muted-cool)]">
              {row.funding.projects
                ? `已知${row.funding.label ?? "经费"} ${fmt(money)} 万元（${row.funding.projects} 个项目给出金额）`
                : "报告未给出经费金额"}
            </small>
          </div>
          <div className="terrain-year">
            {years.map((year, index) => {
              const count = counts[index];
              return <div key={year} className="flex h-full flex-col justify-end" title={`${year} 年：${fmt(count)} 个项目`}>
                {index === peakIndex && count ? <span className="terrain-serif mb-0.5 text-center text-caption leading-none text-[var(--slate)]">{fmt(count)}</span> : null}
                <div className="terrain-year-fill" style={{ height: count ? Math.max(3, count / peak * 58) : 2, opacity: count ? 1 : 0.35, animationDelay: `${index * 26}ms` }} />
              </div>;
            })}
          </div>
          <div className="mt-1.5 flex gap-[3px]">
            {years.map((year, index) => <span key={year}
              className={`flex-1 text-center text-caption tabular-nums ${index === peakIndex ? "text-[var(--slate)]" : "text-[var(--muted-cool-soft)]"}`}>
              {years.length > 8 ? String(year).slice(2) : year}
            </span>)}
          </div>
          <p className="mt-2 text-caption leading-5 text-[var(--muted-cool)]">
            按项目立项年份计，跨库未去重；柱高为当年项目数，空柱表示该年没有立项记录。
          </p>
        </section> : null}

        {systems.length ? <section className="terrain-card p-4">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <b className="text-caption font-semibold text-[var(--heading)]">技术体系构成</b>
            <small className="text-caption text-[var(--muted-cool)]">共 {row.lineage.systems} 个体系 · 按条目数排序</small>
          </div>
          {(expanded ? systems : systems.slice(0, 5)).map((system, index) => <div key={`${system.name}-${index}`} className="mb-2.5 last:mb-0">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 truncate text-caption text-[var(--heading)]" title={system.name}>{system.name}</span>
              <b className="terrain-serif ml-auto font-normal text-caption text-[var(--slate)]">{fmt(system.items)}</b>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--track)]">
              <i className="terrain-sweep block h-full rounded-full"
                style={{ width: `${Math.max(2, system.items / highest * 100)}%`, background: index ? "var(--dim-scene)" : "var(--terrain-dot-on)", animationDelay: `${index * 45}ms` }} />
            </div>
            {system.plain ? <p className="mt-0.5 truncate text-caption text-[var(--muted-cool)]" title={system.plain}>{system.plain}</p> : null}
          </div>)}
          {systems.length > 5 ? <button type="button" onClick={() => setExpanded(!expanded)}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded border-t border-dashed border-[var(--line-cool)] pt-2 text-caption text-[var(--muted-cool)] transition-colors hover:text-[var(--terrain-dot-on)]">
            {expanded ? "收起" : `展开其余 ${systems.length - 5} 个体系`}
            <i className="not-italic" aria-hidden="true">{expanded ? "↑" : "↓"}</i>
          </button> : null}
        </section> : null}

        <section className="terrain-card p-4">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <b className="text-caption font-semibold text-[var(--heading)]">成熟度分布</b>
            <small className="text-caption text-[var(--muted-cool)]">0 未判定 → 5 示范转化 · 共 {fmt(row.lineage.items)} 条</small>
          </div>
          <div className="terrain-stack">
            {dist.map((count, level) => count ? <i key={level} style={{ flex: count, background: `var(--m-${level})` }}
              title={`${MATURITY[level].name}：${fmt(count)} 条`} /> : null)}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-1">
            {dist.map((count, level) => <div key={level} className="flex items-baseline gap-1.5 text-caption">
              <i className="size-2 shrink-0 self-center rounded-sm" style={{ background: `var(--m-${level})` }} />
              <span className="min-w-0 truncate text-[var(--slate)]" title={MATURITY[level].name}>{level} {MATURITY[level].name}</span>
              <b className="terrain-serif ml-auto font-normal text-[var(--slate)]">{fmt(count)}</b>
              <span className="w-9 shrink-0 text-right tabular-nums text-[var(--muted-cool)]">{shortPct(count / items * 100)}</span>
            </div>)}
          </div>
        </section>

        <section className="terrain-card p-4">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <b className="text-caption font-semibold text-[var(--heading)]">进入场景试验或转化的条目</b>
            <small className="text-caption text-[var(--muted-cool)]">
              共 {fmt(row.lineage.high_maturity ?? 0)} 条{top.length ? ` · 取前 ${top.length}` : ""}
            </small>
          </div>
          {top.length ? top.map((item, index) => <div key={`${item.name}-${index}`} className="border-b border-[var(--line-cool-soft)] py-2.5 last:border-b-0 last:pb-0">
            <p className="text-caption leading-5 text-[var(--heading)]">{clip(item.name, 40)}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-[var(--muted-cool)]">
              <span className="terrain-serif rounded bg-[var(--selected-cool)] px-1 text-[var(--terrain-dot-on)]">M{item.maturity}</span>
              {item.field ? <span className="text-[var(--muted-cool-soft)]">{item.field}</span> : null}
              {item.basis ? <span className="min-w-0 truncate">{clip(item.basis, 34)}</span> : null}
            </p>
          </div>) : <p className="py-3 text-center text-caption text-[var(--muted-cool)]">
            这个库还没有条目达到成熟度 4，全部停在理论与算法验证之间。
          </p>}
        </section>
      </div>

  </SlideOver>;
}
