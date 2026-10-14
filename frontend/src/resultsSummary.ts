export type ResultsSummary = {
  completed: { analysis: number; review: number; intelligence: number; total: number };
  active: number; failed: number; recent_completed: number;
};
export const resultsSummaryQuery = {
  queryKey: ["results", "summary"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ResultsSummary> => {
    const response = await fetch("/api/results/summary", { signal });
    if (!response.ok) throw new Error("成果统计暂不可读");
    return response.json();
  },
  staleTime: 10_000,
  refetchOnWindowFocus: true,
  refetchInterval: 30_000,
};
