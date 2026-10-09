import type { DocumentInfo } from "./useDocuments";
import type { TargetItem } from "./api";

export const FACETS = ["场景", "问题", "技术", "成果"] as const;
export const FACET_COLORS = ["#dc5b62", "#478bdb", "#2d9d7e", "#d9a92f"];
export type Project = {
  project_id: string; number: string; title: string; identity_status: "identified" | "pending"; identity_conflict?: boolean;
  start_year: number | null; end_year: number | null; year_conflict: boolean;
  code?: string; admin?: string; unit?: string;
  files: { document: DocumentInfo; state: string; notice: string; completed: boolean }[];
  facets: Record<string, { items: (TargetItem & { doc_id: string; version: string; original_name?: string })[]; covered_files: number; evidence_files: number }>;
  funding: { scope: string; amount_yuan: string | null; currency: string | null; quote: string; doc_id: string; version: string }[];
  funding_conflicts: string[];
};
export type ProjectLibrary = {
  corpus_id: string; projects: Project[];
  coverage: { files: number; identified_projects: number; pending_identity_records: number;
    dimensions: Record<string, { evidence_projects: number; fully_processed_projects: number; items: { name: string; count: number; project_ids: string[]; item_ids: string[]; members?: string[] }[] }>;
    funding: Record<string, { eligible_projects: number; excluded_projects: number; total_yuan: string }> };
};
export type HierarchyEvidence = { item_id: string; doc_id: string; version: string; quote: string; locator: { basis?: string; page?: number; start_char?: number; end_char?: number } };
export type TechRoute = { title: string; summary: string; project_ids: string[]; item_ids: string[]; evidence: HierarchyEvidence[] };
export type CoreIssue = { name: string; members?: string[]; state: "已解决" | "待解决"; summary: string; project_ids: string[]; item_ids: string[]; evidence: HierarchyEvidence[]; routes: TechRoute[] };
export type AchievementAspect = { aspect: string; stage: "已取得" | "在研" | "仅预期" | "原文未提及"; note: string; answered: boolean; item_ids: string[]; evidence: HierarchyEvidence[] };
export type Achievement = { title: string; summary: string; marker_basis: { projects: number; representative: string; note: string }; project_ids: string[]; item_ids: string[]; evidence: HierarchyEvidence[]; aspects: AchievementAspect[] };
export type Scene = { name: string; members?: string[]; summary: string; project_ids: string[]; item_ids: string[]; evidence: HierarchyEvidence[]; issues: CoreIssue[]; achievements: Achievement[] };
export type Hierarchy = {
  corpus_id: string; state: "missing" | "invalid" | "stale" | "ready"; message: string;
  generated_at?: string; model?: string; fingerprint: string;
  process: { status: string; error?: string };
  scenes: Scene[];
  topics: Record<string, number>;
  coverage: {
    targets?: { scenes: number; issues_per_scene: number; routes_per_issue: number; achievements_per_scene: number };
    scenes?: number; issues?: number; solved_issues?: number; open_issues?: number; routes?: number; achievements?: number;
    available_topics?: Record<string, number>;
    gaps?: { kind: string; detail: string }[];
    update_error?: string;
  };
};
export const projectQuery = (corpus: string) => ({
  queryKey: ["library", corpus, "projects"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ProjectLibrary> => {
    const response = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/projects`, { signal });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "无法读取项目归纳");
    return response.json();
  },
});
export const hierarchyQuery = (corpus: string) => ({
  queryKey: ["library", corpus, "hierarchy"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Hierarchy> => {
    const response = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/hierarchy`, { signal });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "无法读取场景层级");
    return response.json();
  },
});
export async function buildHierarchy(corpus: string, force: boolean): Promise<Hierarchy> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/hierarchy`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "无法生成场景层级");
  return response.json();
}

/** G1: manual grouping log over extracted topic names; undo restores the extracted label. */
export type TopicMerge = { id: string; dimension: string; name: string; members: string[]; replaces: string[]; created: string; undone: string | null; active: boolean };
export const topicsQuery = (corpus: string) => ({
  queryKey: ["library", corpus, "topics"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TopicMerge[]> => {
    const response = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/topics`, { signal });
    if (!response.ok) throw new Error("无法读取条目整理记录");
    return (await response.json()).merges;
  },
});
async function topicRequest(path: string, body?: unknown): Promise<TopicMerge[]> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "条目整理未保存");
  return (await response.json()).merges;
}
export const mergeTopics = (corpus: string, dimension: string, names: string[], name: string) =>
  topicRequest(`/api/corpora/${encodeURIComponent(corpus)}/topics`, { dimension, names, name });
export const undoTopicMerge = (corpus: string, id: string) =>
  topicRequest(`/api/corpora/${encodeURIComponent(corpus)}/topics/${encodeURIComponent(id)}/undo`);

/** G2: grounded per-topic summary; every point cites numbered source snapshots. */
export type TopicSummary = {
  dimension: string; name: string; state: "missing" | "ready" | "stale"; project_count: number;
  status?: string; error?: string; update_error?: string; generated_at?: string; overview?: string;
  common?: { text: string; refs: string[]; project_ids: string[] }[];
  differences?: { text: string; refs: string[]; project_ids: string[] }[];
  representatives?: { project_id: string; title: string; items: number }[];
  gaps?: string[]; unsupported_items?: number;
  sources?: (HierarchyEvidence & { ref: string; project: string; project_id: string; status: string })[];
};
const summaryPath = (corpus: string) => `/api/corpora/${encodeURIComponent(corpus)}/topic-summary`;
export const topicSummaryQuery = (corpus: string, dimension: string, name: string) => ({
  queryKey: ["library", corpus, "topic-summary", dimension, name],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TopicSummary> => {
    const response = await fetch(`${summaryPath(corpus)}?dimension=${encodeURIComponent(dimension)}&name=${encodeURIComponent(name)}`, { signal });
    if (!response.ok) throw new Error("无法读取主题归纳");
    return response.json();
  },
});
export async function generateTopicSummary(corpus: string, dimension: string, name: string): Promise<TopicSummary> {
  const response = await fetch(summaryPath(corpus), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dimension, name }) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "主题归纳未生成");
  return response.json();
}

/** Technology lineage (query 2026-1009 ④): category → direction → route, per corpus branch. */
export type LineageCategory = { name: string; summary: string; children: { name: string; routes: string[] }[] };
export type Lineage = {
  corpus_id: string; state: "missing" | "stale" | "ready"; branch: string; generated_at?: string; error?: string;
  categories: LineageCategory[]; gaps: string[];
  routes: Record<string, { summary: string; project_ids: string[]; issues: { scene: string; issue: string; state: string }[] }>;
  supporting: Record<string, { name: string; project_ids: string[] }[]>;
};
export const lineageQuery = (corpus: string) => ({
  queryKey: ["library", corpus, "lineage"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Lineage> => {
    const response = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/lineage`, { signal });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "无法读取技术谱系");
    return response.json();
  },
});
export async function buildLineage(corpus: string): Promise<Lineage> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/lineage`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "技术谱系生成失败");
  return response.json();
}
/** Position of a route in the tree, for parent / sibling navigation. */
export function locateRoute(lineage: Lineage | undefined, title: string) {
  for (const category of lineage?.categories ?? []) {
    for (const child of category.children) {
      if (child.routes.includes(title)) return { category, child };
    }
  }
  return null;
}

/** Each report's own 成果列表 (papers, patents, awards…), keyed by project. */
export type ProjectOutputs = { declared: number; counts: Record<string, number>; items: { type: string; title: string }[]; doc_id: string; version: string };
export type CorpusOutputs = { corpus_id: string; projects: Record<string, ProjectOutputs>; coverage: { files: number; with_list: number } };
export const outputsQuery = (corpus: string) => ({
  queryKey: ["library", corpus, "outputs"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<CorpusOutputs> => {
    const response = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/outputs`, { signal });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "无法读取成果列表");
    return response.json();
  },
});

/** Distinct hues for categories (scenes, issues, lineage classes) and corpus branches. */
export const CATEGORY_COLORS = ["#dc5b62", "#478bdb", "#2d9d7e", "#d9a92f", "#7c5cd6", "#e07b39", "#1f9fb4", "#b5508f", "#6b8e23", "#8d6e63"];
export const LINEAGE_COLOR = "#7c5cd6";
