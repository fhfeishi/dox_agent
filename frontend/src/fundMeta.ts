/**
 * Display-only project metadata parsed from the filename convention
 * `<year_from>_<year_to>_<project_no>_<pi>_<title>.pdf` (see corpus_management §3.3);
 * project-metadata archives reuse the same convention as Markdown.
 * The filename's year bounds are project bounds, not report years. Cards show
 * filename-derived fields and unparseable names simply render nothing extra.
 */
export type FundMeta = { yearFrom: number; yearTo: number; projectNo: string; pi: string; title: string };

const FUND_NAME = /^(\d{4})_(\d{4})_([A-Za-z0-9]+)_([^_]+)_(.+)\.(?:pdf|md|markdown)$/i;

export function fundMetaFromPath(relPath: string): FundMeta | null {
  const base = relPath.split("/").pop() ?? relPath;
  const match = FUND_NAME.exec(base);
  if (!match) return null;
  return { yearFrom: Number(match[1]), yearTo: Number(match[2]), projectNo: match[3], pi: match[4], title: match[5] };
}
