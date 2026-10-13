import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchArtifacts } from "../api";
import { fetchReviewRuns } from "../reviewApi";
import { headline, PERIODS, summarize, type Period, type WorkItem } from "../recentWork";
import { useApp } from "../store";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
const STATE = { done: "已完成", active: "处理中", failed: "未完成" } as const;

/**
 * 近期工作 (query 2026-1013 1637): analysis reports and review tasks in a chosen period — a one-line
 * summary first, then finished and unfinished work. Reports open in the right-hand panel.
 * Connections between conclusions need the model and are the next step.
 */
export function LeaderRecent() {
  const { corpora, showInspector } = useApp();
  const [period, setPeriod] = useState<Period>("7d");
  const reports = useQuery({ queryKey: ["leader", "artifacts"], queryFn: () => fetchArtifacts() });
  const reviews = useQuery({ queryKey: ["leader", "reviews"], queryFn: fetchReviewRuns });
  if (reports.error || reviews.error) return <p role="alert" className="p-8 text-sm text-[var(--red)]">近期工作暂不可读，请稍后重试。</p>;
  if (!reports.data || !reviews.data) return <p role="status" className="p-8 text-sm text-[var(--steel)]">正在读取近期工作…</p>;
  const name = (id: string) => short(corpora.find((c) => c.id === id)?.name ?? id);
  const all: WorkItem[] = [
    ...reports.data.filter((a) => a.lifecycle === "active").map((a): WorkItem => ({
      key: "a:" + a.artifact_id, kind: "report", title: a.title || "分析报告", type: "分析报告", date: a.updated_at || a.created_at,
      state: a.status === "completed" ? "done" : a.status === "failed" ? "failed" : "active", domains: a.corpus_ids.map(name) })),
    ...reviews.data.map((r): WorkItem => ({
      key: "r:" + r.id, kind: "review", title: r.document?.metadata?.title || r.document?.filename || "申请书",
      type: r.request?.kind === "professional" ? "专业审查" : "形式审查", date: r.finished_at || r.created_at,
      state: r.status === "completed" ? "done" : r.status === "failed" ? "failed" : "active", domains: (r.request?.corpus_ids ?? []).map(name) })),
  ];
  const label = PERIODS.find((p) => p.key === period)!.label;
  const summary = summarize(all, period, new Date());
  const open = (item: WorkItem) => {
    if (item.kind === "report") showInspector({ kind: "artifact", artifactId: item.key.slice(2) });
  };
  const list = (title: string, items: WorkItem[]) => items.length ? <section aria-label={title}>
    <h2 className="mb-2 text-sm font-semibold text-[var(--steel)]">{title} · {items.length}</h2>
    <div className="space-y-1.5">{items.map((item) => <button key={item.key} type="button" onClick={() => open(item)} disabled={item.kind !== "report"}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-2.5 text-left enabled:hover:border-[var(--primary)]">
      <span className="w-16 shrink-0 text-xs text-[var(--stone)]">{item.type}</span>
      <span className="min-w-0 flex-1"><b className="block truncate text-[14px] font-medium">{item.title}</b>
        {item.domains.length ? <span className="block truncate text-xs text-[var(--steel)]">{item.domains.join("、")}</span> : null}</span>
      <span className="shrink-0 text-xs text-[var(--steel)]">{STATE[item.state]} · {item.date.slice(0, 10)}</span>
    </button>)}</div>
  </section> : null;
  return <div className="mx-auto max-w-[960px] space-y-5 px-5 py-6">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold">近期工作</h1>
      <div role="group" aria-label="时间段" className="flex flex-wrap gap-1">{PERIODS.map((p) =>
        <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}
          className={`rounded-full border px-3 py-1 text-[13px] ${period === p.key ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline)] hover:bg-[var(--surface)]"}`}>{p.label}</button>)}</div>
    </div>
    <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-[15px] leading-7">{headline(summary, label)}</p>
    {summary.domains.length ? <p className="flex flex-wrap gap-1.5 text-[13px]">{summary.domains.map((d) =>
      <span key={d.name} className="rounded-md border border-[var(--hairline)] px-2 py-0.5">{d.name} <span className="text-[var(--stone)]">{d.count}</span></span>)}</p> : null}
    {list("进行中", summary.active)}
    {list("已完成", summary.done)}
    {list("未完成", summary.failed)}
    <p className="text-xs leading-5 text-[var(--stone)]">按报告更新时间与审查完成时间统计；形式审查不关联资料库，故不计入领域。各报告结论之间的联系与综合判断需调用模型，将在下一步提供。</p>
  </div>;
}
