import type { Scope } from "./api";
export type ResultsSummary = {
  completed: { analysis: number; review: number; intelligence: number; total: number };
  active: number; failed: number; recent_completed: number;
};
/** Totals of the reports the list shows: the account's own, or for the administrator everyone's. */
export const resultsSummaryQuery = (scope: Scope = "mine") => ({
  queryKey: ["results", "summary", scope],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ResultsSummary> => {
    const response = await fetch(`/api/results/summary${scope === "all" ? "?scope=all" : ""}`, { signal });
    if (!response.ok) throw new Error("成果统计暂不可读");
    return response.json();
  },
  staleTime: 10_000,
  refetchOnWindowFocus: true,
  refetchInterval: 30_000,
});
