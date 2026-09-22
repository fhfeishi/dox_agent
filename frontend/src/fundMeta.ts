/**
 * Display-only fund report metadata parsed from the filename convention
 * `<year_from>_<year_to>_<project_no>_<pi>_<title>.pdf` (see corpus_management §3.3).
 * H9 will replace this with server-side meta extraction; until then cards show
 * filename-derived fields and unparseable names simply render nothing extra.
 */
export type FundMeta = { yearFrom: number; yearTo: number; projectNo: string; pi: string; title: string };

const FUND_NAME = /^(\d{4})_(\d{4})_([A-Za-z0-9]+)_([^_]+)_(.+)\.pdf$/i;

export function fundMetaFromPath(relPath: string): FundMeta | null {
  const base = relPath.split("/").pop() ?? relPath;
  const match = FUND_NAME.exec(base);
  if (!match) return null;
  return { yearFrom: Number(match[1]), yearTo: Number(match[2]), projectNo: match[3], pi: match[4], title: match[5] };
}
