/**
 * 近期工作 (query 2026-1013 1637): analysis reports and review tasks grouped by a time period,
 * always by their real dates. Calendar periods start at local midnight: a week on Monday, a
 * quarter on January, April, July or October.
 */
export type Period = "3d" | "7d" | "30d" | "week" | "month" | "quarter" | "year";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "3d", label: "近 3 天" }, { key: "7d", label: "近 7 天" }, { key: "30d", label: "近 30 天" },
  { key: "week", label: "本周" }, { key: "month", label: "本月" }, { key: "quarter", label: "本季度" }, { key: "year", label: "本年" },
];

export function periodStart(period: Period, now: Date): Date {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case "3d": return new Date(day.getTime() - 2 * 86400000);
    case "7d": return new Date(day.getTime() - 6 * 86400000);
    case "30d": return new Date(day.getTime() - 29 * 86400000);
    case "week": return new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
    case "month": return new Date(day.getFullYear(), day.getMonth(), 1);
    case "quarter": return new Date(day.getFullYear(), day.getMonth() - (day.getMonth() % 3), 1);
    case "year": return new Date(day.getFullYear(), 0, 1);
  }
}

export type WorkItem = {
  key: string; kind: "report" | "review"; title: string; type: string; date: string;
  state: "done" | "active" | "failed"; domains: string[];
};

export type WorkSummary = {
  items: WorkItem[]; done: WorkItem[]; active: WorkItem[]; failed: WorkItem[];
  reports: number; reviews: number; domains: { name: string; count: number }[];
};

/** Items whose date falls in the period, newest first, with counts by kind, state and domain. */
export function summarize(all: WorkItem[], period: Period, now: Date): WorkSummary {
  const start = periodStart(period, now).getTime();
  const items = all.filter((item) => { const t = Date.parse(item.date); return t >= start && t <= now.getTime(); })
    .sort((a, b) => b.date.localeCompare(a.date));
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
  const parts = [summary.reports ? `${summary.reports} 份分析报告` : "", summary.reviews ? `${summary.reviews} 项审查任务` : ""].filter(Boolean);
  const where = summary.domains.slice(0, 3).map((d) => d.name).join("、");
  const open = summary.active.length ? `，${summary.active.length} 项仍在处理` : "";
  return `${label}共 ${parts.join("、")}${where ? `，主要涉及${where}` : ""}${open}。`;
}
