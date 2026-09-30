import { queryOptions } from "@tanstack/react-query";
import { fetchTargetDetail, fetchTargetReports, type TargetReport } from "./api";

export const DIMENSIONS = ["场景", "问题", "技术", "成果"] as const;
export const FILTER_KEYS = ["scenario", "problem", "technology", "outcome"] as const;
export const normalizeFacetName = (name: string) => name.trim().replace(/\s+/g, " ");
export function usableTarget(item: TargetReport) {
  return !item.stale && item.process.status === "已完成"
    && item.process.coverage.total > 0
    && item.process.coverage.processed === item.process.coverage.total
    && DIMENSIONS.every((key) => ["has", "未提及"].includes(item.facets[key]?.state));
}
export const targetReportsQuery = (corpus: string) => queryOptions({
  queryKey: ["library", corpus, "targets", "four-facets"],
  queryFn: ({ signal }) => fetchTargetReports(corpus, signal),
  staleTime: 15_000,
});
export const targetDetailQuery = (corpus: string, doc: string, version?: string) => queryOptions({
  queryKey: ["library", corpus, "target", doc, version ?? "current"],
  queryFn: async ({ signal }) => {
    const detail = await fetchTargetDetail(corpus, doc, signal);
    if (version && detail.version !== version) throw new Error("资料已更新，请返回列表重新选择");
    return detail;
  },
  staleTime: 0,
});
