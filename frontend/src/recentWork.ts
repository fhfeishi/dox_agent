/**
 * 近期工作 (query 2026-1013 1637): analysis reports and review tasks of a time period. The server
 * picks the items by their real dates over every record (节点审查 A5, `/api/summaries/facts`),
 * counts repeated reviews of one application once (A4) and gives a leader only what was published
 * (Q2); this module turns that into the lists, the one-line summary and the domain tally.
 */
export type Period = "3d" | "7d" | "30d" | "week" | "month" | "quarter" | "year";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "3d", label: "近 3 天" }, { key: "7d", label: "近 7 天" }, { key: "30d", label: "近 30 天" },
  { key: "week", label: "本周" }, { key: "month", label: "本月" }, { key: "quarter", label: "本季度" }, { key: "year", label: "本年" },
];

type FactState = "已完成" | "未完成" | "进行中";
export type Facts = {
  period: string; start: string; end: string;
  reports: { id: string; title: string; domains: string[]; date: string; state: FactState; published: boolean }[];
  reviews: { id: string; title: string; kind: string; domains: string[]; date: string; state: FactState; published: boolean; runs: number }[];
  summaries: { id: string; title: string; created_at: string }[];
};

export type WorkItem = {
  key: string; kind: "report" | "review"; id: string; title: string; type: string; date: string;
  state: "done" | "active" | "failed"; domains: string[]; published: boolean; runs: number;
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
      state: STATE[r.state], domains: r.domains, published: r.published, runs: 1 })),
    ...facts.reviews.map((r): WorkItem => ({ key: "r:" + r.id, kind: "review", id: r.id, title: r.title, type: r.kind, date: r.date,
      state: STATE[r.state], domains: r.domains, published: r.published, runs: r.runs })),
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
