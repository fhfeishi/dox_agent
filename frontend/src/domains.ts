import type { DocumentInfo } from "./useDocuments";
import type { IndexState } from "./api";
import { queryOptions } from "@tanstack/react-query";
/**
 * 领域分析 · 全景 (query 2026-1021 1629): every library as one research domain, read in one call from
 * /api/domains/overview. See src/api/domains.py for what each number counts.
 */

export type YearRow = { year: number; projects: number; funding: number; funded: number; items: number;
  maturity: number | null; levels: number[] };
export type Direction = { name: string; items: number; maturity: number | null; levels: number[] };
export type TechSystem = { name: string; plain: string; items: number; projects: number; maturity: number | null;
  levels: number[]; directions: Direction[] };
export type OpenIssue = { scene: string; name: string; state: string; summary: string; projects: number };
export type Blank = { name: string; plain: string; reason: string };
export type Combo = { scene: string; system: string; used_in: number; scenes: number };
export type Domain = {
  index?: IndexState;
  id: string; name: string; projects: number; items: number; levels: number[]; maturity: number | null;
  achievements: number; achievements_per_project: number; funding: number; funded_projects: number;
  by_year: YearRow[]; systems: TechSystem[];
  scenes: { name: string; projects: number; systems: string[]; achievements: number }[];
  dimension_evidence: Record<string, number>; open_issues: OpenIssue[]; solved_issues: number;
  blanks: Blank[]; blanks_checked: boolean; combos: Combo[];
  top_funded: { title: string; number: string; unit: string; year: number | null; amount: number }[];
};
export type DomainsOverview = {
  maturity_levels: Record<string, string>; funding_label: string; years: number[];
  totals: { domains: number; projects: number; items: number; funding: number; funded_projects: number; high: number;
    open_issues: number; blanks: number; combos: number };
  domains: Domain[];
};

export const domainsOverviewQuery = queryOptions({
  queryKey: ["domains", "overview"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<DomainsOverview> => {
    const response = await fetch("/api/domains/overview", { signal });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "研究领域全景暂不可读");
    return response.json();
  },
  staleTime: 60_000,
  refetchInterval: (query) => query.state.data?.domains.some(r => r.index?.state === "refreshing") ? 2000 : false,
});

/** 万元 → the way a leader reads money: 亿 above ten thousand 万. */
export function money(wan: number): string {
  if (wan >= 10000) return `${(wan / 10000).toFixed(wan >= 100000 ? 1 : 2)} 亿`;
  return `${Math.round(wan).toLocaleString("zh-CN")} 万`;
}

export const MATURITY_NAMES = ["未判定", "理论与方法研究", "算法与模型验证", "原型与样机验证", "系统集成与场景试验", "示范应用与转化"];

/** The six-level colour role for a mean maturity (未判定 counts as no colour). */
export const maturityVar = (level: number | null) => `var(--m-${level === null ? 0 : Math.max(1, Math.min(5, Math.round(level)))})`;

/** 02 技术谱系路网: one library's lineage down to projects, read when that library is opened. */
/** A project under a theme: the items it contributed there and its first document, to open the source. */
export type TreeProject = { id: string; title: string; number: string; unit: string; admin: string; year: number | null; maturity: number;
  items: { name: string; maturity: number; basis: string }[]; document: DocumentInfo | null };
export type TreeNode = { name: string; plain: string; items: number; maturity: number | null };
export type DomainTree = { id: string; name: string; items: number;
  systems: (TreeNode & { unplaced?: boolean; directions: (TreeNode & { themes: (TreeNode & { projects: TreeProject[] })[] })[] })[] };
export const domainTreeQuery = (corpusId: string) => ({
  queryKey: ["domains", "tree", corpusId],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<DomainTree> => {
    const response = await fetch(`/api/domains/${encodeURIComponent(corpusId)}/tree`, { signal });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "技术谱系暂不可读");
    return response.json();
  },
  staleTime: 60_000,
});
