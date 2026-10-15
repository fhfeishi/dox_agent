import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromFacts, headline, PERIODS, type Facts, type Period, type WorkItem } from "../recentWork";
import { useApp } from "../store";
import { Chart, type ChartSpec } from "./Charts";

const STATE = { done: "已完成", active: "处理中", failed: "未完成" } as const;

/**
 * 成果周期总结 (query 2026-1013 1637; a section of the 成果 page since 2026-1015 1142/1553): analysis reports and review tasks in a chosen period — a one-line
 * summary first, then finished and unfinished work. The server counts the period over every record,
 * merges repeated reviews of one application (节点审查 A4/A5); every role sees the same work
 * (query 2026-1014 1516). Reports open in the right-hand panel, reviews on their own page.
 */
export function PeriodSummary() {
  const { showInspector } = useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [period, setPeriod] = useState<Period>("week");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const facts = useQuery({ queryKey: ["recent", period], queryFn: async ({ signal }): Promise<Facts> => {
    const response = await fetch(`/api/summaries/facts?period=${period}`, { signal });
    if (!response.ok) throw new Error("成果周期总结暂不可读");
    return response.json();
  } });
  if (facts.error) return <p role="alert" className="p-8 text-sm text-[var(--red)]">成果周期总结暂不可读，请稍后重试。</p>;
  if (!facts.data) return <p role="status" className="p-8 text-sm text-[var(--steel)]">正在读取成果周期总结…</p>;
  const label = PERIODS.find((p) => p.key === period)!.label;
  const summary = fromFacts(facts.data);
  const summaries = facts.data.summaries;
  // Counted charts for the period; the year is shown by month, shorter periods by day. A chart with a
  // single bar says nothing the sentence above it does not, so it is left out (节点审查 A4).
  const buckets = new Map<string, number>();
  const monthly = period === "quarter" || period === "half" || period === "year";
  for (const item of summary.items) { const key = monthly ? item.date.slice(0, 7) : item.date.slice(5, 10); buckets.set(key, (buckets.get(key) ?? 0) + 1); }
  const timeline = [...buckets].sort((a, b) => a[0].localeCompare(b[0]));
  const charts: ChartSpec[] = [
    ...(summary.domains.length > 1 ? [{ type: "bar" as const, title: "各领域的工作量", labels: summary.domains.slice(0, 8).map((d) => d.name), values: summary.domains.slice(0, 8).map((d) => d.count), unit: " 项" }] : []),
    ...(timeline.length > 1 ? [{ type: "bar" as const, title: monthly ? "按月产出" : "按日产出", labels: timeline.map(([k]) => k), values: timeline.map(([, v]) => v), unit: " 项" }] : []),
  ];
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/summaries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof value?.detail === "string" ? value.detail : "总结未生成");
      await client.invalidateQueries({ queryKey: ["recent"] });
      showInspector({ kind: "artifact", artifactId: value.artifact_id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const open = (item: WorkItem) => {
    if (item.kind === "report") showInspector({ kind: "artifact", artifactId: item.id });
    else navigate(`/review/runs/${encodeURIComponent(item.id)}`);
  };
  const list = (title: string, items: WorkItem[]) => items.length ? <section aria-label={title}>
    <h3 className="mb-2 text-sm font-semibold text-[var(--steel)]">{title} · {items.length}</h3>
    <div className="space-y-1.5">{items.map((item) => <button key={item.key} type="button" onClick={() => open(item)}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-2.5 text-left hover:border-[var(--primary)]">
      <span className="w-16 shrink-0 text-xs text-[var(--stone)]">{item.type}</span>
      <span className="min-w-0 flex-1"><b className="block truncate text-[14px] font-medium">{item.title}</b>
        {item.domains.length ? <span className="block truncate text-xs text-[var(--steel)]">{item.domains.join("、")}</span> : null}</span>
      {item.runs > 1 ? <span className="shrink-0 text-xs text-[var(--stone)]">共审查 {item.runs} 次</span> : null}
      <span className="shrink-0 text-xs text-[var(--steel)]">{STATE[item.state]} · {item.date.slice(0, 10)}</span>
    </button>)}</div>
  </section> : null;
  const items = summary.active.length + summary.done.length + summary.failed.length;
  return <section aria-label="成果周期总结" className="space-y-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-[16px] font-semibold">成果周期总结</h2>
      <div role="group" aria-label="时间段" className="flex flex-wrap gap-1">{PERIODS.map((p) =>
        <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}
          className={`rounded-full border px-3 py-1 text-[13px] ${period === p.key ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline)] hover:bg-[var(--surface)]"}`}>{p.label}</button>)}</div>
    </div>
    <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-[15px] leading-7">{headline(summary, label)}</p>
    {charts.length ? <section aria-label="本期图表" className="grid gap-3 md:grid-cols-2">
      {charts.map((spec) => <div key={spec.title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4"><Chart spec={spec} /></div>)}
    </section> : null}
    <section aria-label="总结报告" className="rounded-xl border border-[var(--hairline)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">总结报告</h3>
        <span className="flex-1 text-xs text-[var(--stone)]">由模型依据本期的报告与审查撰写文字，图表数字由系统统计；生成约需一分钟。</span>
        <button type="button" disabled={busy} onClick={() => void generate()}
          className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[13px] text-white disabled:opacity-50">{busy ? "正在生成…" : `生成${label}总结`}</button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--red)]">{error}</p> : null}
      {summaries.length ? <div className="mt-3 space-y-1">{summaries.map((a) => <button key={a.id} type="button" onClick={() => showInspector({ kind: "artifact", artifactId: a.id })}
        className="block w-full truncate rounded-md px-2 py-1 text-left text-[13.5px] text-[var(--link)] hover:bg-[var(--surface)]">{a.title}</button>)}</div> : null}
    </section>
    {summary.domains.length ? <p className="flex flex-wrap gap-1.5 text-[13px]">{summary.domains.map((d) =>
      <span key={d.name} className="rounded-md border border-[var(--hairline)] px-2 py-0.5">{d.name} <span className="text-[var(--stone)]">{d.count}</span></span>)}</p> : null}
    {items ? <details className="group">
      <summary className="cursor-pointer text-[13px] text-[var(--link)]">查看{label}的 {items} 项工作</summary>
      <div className="mt-3 space-y-4">
        {list("进行中", summary.active)}
        {list("已完成", summary.done)}
        {list("未完成", summary.failed)}
      </div>
    </details> : null}
    <p className="text-xs leading-5 text-[var(--stone)]">按报告更新时间与审查完成时间统计；同一申请书的多次同类审查计为一项；形式审查不关联资料库，故不计入领域。</p>
  </section>;
}
