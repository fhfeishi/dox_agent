/**
 * 成果周期总结 (query 2026-1013 1637; in 成果 since 2026-1015 1142): analysis reports and review tasks of a time period. The server
 * picks the items by their real dates over every record (节点审查 A5, `/api/summaries/facts`),
 * counts repeated reviews of one application once (A4), the same for every role (query 2026-1014
 * 1516); this module turns that into the lists, the one-line summary and the domain tally.
 */
// One set of rolling windows ending today (query 2026-1014 1716); the server counts them.
export type Period = "week" | "month" | "quarter" | "half" | "year";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "一周内" }, { key: "month", label: "一个月内" }, { key: "quarter", label: "一个季度内" },
  { key: "half", label: "半年内" }, { key: "year", label: "一年内" },
];

type FactState = "已完成" | "未完成" | "进行中";
export type Facts = {
  period: string; start: string; end: string;
  reports: { id: string; title: string; domains: string[]; date: string; state: FactState }[];
  reviews: { id: string; title: string; kind: string; domains: string[]; date: string; state: FactState; runs: number }[];
  summaries: { id: string; title: string; created_at: string }[];
};

export type WorkItem = {
  key: string; kind: "report" | "review"; id: string; title: string; type: string; date: string;
  state: "done" | "active" | "failed"; domains: string[]; runs: number;
};

export type WorkSummary = {
  items: WorkItem[]; done: WorkItem[]; active: WorkItem[]; failed: WorkItem[];
  reports: number; reviews: number; domains: { name: string; count: number }[];
};

const STATE = { 已完成: "done", 未完成: "failed", 进行中: "active" } as const;

/** The period's items newest first, with counts by kind, state and domain. */
export function fromFacts(facts: Facts): WorkSummary {
  const items: WorkItem[] = [
    ...facts.reports.map((r): WorkItem => ({ key: "a:" + r.id, kind: "report", id: r.id, title: r.title, type: "分析报告", date: r.date,
      state: STATE[r.state], domains: r.domains, runs: 1 })),
    ...facts.reviews.map((r): WorkItem => ({ key: "r:" + r.id, kind: "review", id: r.id, title: r.title, type: r.kind, date: r.date,
      state: STATE[r.state], domains: r.domains, runs: r.runs })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const tally = new Map<string, number>();
  for (const item of items) for (const domain of item.domains) tally.set(domain, (tally.get(domain) ?? 0) + 1);
  return {
    items, done: items.filter((i) => i.state === "done"), active: items.filter((i) => i.state === "active"),
    failed: items.filter((i) => i.state === "failed"),
    reports: items.filter((i) => i.kind === "report").length, reviews: items.filter((i) => i.kind === "review").length,
    domains: [...tally].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

/** One sentence for the period; it names counts and domains only, no judgement. */
export function headline(summary: WorkSummary, label: string): string {
  if (!summary.items.length) return `${label}没有新的成果报告或审查任务。`;
  const parts = [summary.reports ? `${summary.reports} 份分析报告` : "", summary.reviews ? `${summary.reviews} 份申请书的审查` : ""].filter(Boolean);
  const where = summary.domains.slice(0, 3).map((d) => d.name).join("、");
  const open = summary.active.length ? `，${summary.active.length} 项仍在处理` : "";
  return `${label}共 ${parts.join("、")}${where ? `，主要涉及${where}` : ""}${open}。`;
}

/** The period counted on the server over every report and review (src/period_summary.py). */
export async function fetchSummaryFacts(period: Period, signal?: AbortSignal): Promise<Facts> {
  const response = await fetch(`/api/summaries/facts?period=${period}`, { signal });
  if (!response.ok) throw new Error("周期总结暂不可读");
  return response.json();
}

/** Writes the period's summary as a report in 报告中心 and returns it. */
export async function createSummary(period: Period): Promise<{ artifact_id: string }> {
  const response = await fetch("/api/summaries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof value?.detail === "string" ? value.detail : "总结未生成");
  return value;
}
