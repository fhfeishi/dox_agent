/**
 * Project-relation sectors by NSFC department, then by application code (query 2026-10-10).
 *
 * Every department that has projects keeps its own sector, however small; only a large
 * department is subdivided by its leading codes, and its small codes merge within that
 * department, never across departments. A code whose first letter is no NSFC department is kept
 * apart for checking, and projects without a code are counted, not hidden.
 */
export const DEPARTMENTS: Record<string, [string, string]> = {
  A: ["数理科学部", "#b45309"], B: ["化学科学部", "#a21caf"], C: ["生命科学部", "#047857"], D: ["地球科学部", "#4d7c0f"],
  E: ["工程与材料科学部", "#c2410c"], F: ["信息科学部", "#0e7490"], G: ["管理科学部", "#1d4ed8"], H: ["医学科学部", "#be123c"],
  T: ["交叉科学部", "#6d28d9"],
};
export const UNKNOWN = "代码未知";
export const UNCHECKED = "代码待核对";

/** A department with at least this many projects is split into its leading codes. */
const SPLIT_AT = 24;
/** At most this many code sectors per department; a code needs this share of its department. */
const MAX_CODES = 5;
const MIN_SHARE = 0.08;
const MIN_CODE = 6;

export type Sector = { key: string; dept: string; label: string; color: string; count: number; codes: string[] };
export type DepartmentCount = { dept: string; name: string; color: string; count: number; codes: string[] };

const CODE = /^([A-Z])(\d{2})/;

/** "H27" for a recognised code, UNCHECKED for an unknown department letter, UNKNOWN without a code. */
export function codeOf(code?: string | null): { dept: string; code: string } {
  const match = CODE.exec(code ?? "");
  if (!match) return { dept: UNKNOWN, code: UNKNOWN };
  return DEPARTMENTS[match[1]] ? { dept: match[1], code: match[1] + match[2] } : { dept: UNCHECKED, code: match[0] };
}

const short = (dept: string) => DEPARTMENTS[dept][0].replace(/科学部$/, "");

export function buildSectors(codes: (string | null | undefined)[]) {
  const byDept = new Map<string, Map<string, number>>();
  for (const raw of codes) {
    const { dept, code } = codeOf(raw);
    const inner = byDept.get(dept) ?? new Map<string, number>();
    inner.set(code, (inner.get(code) ?? 0) + 1);
    byDept.set(dept, inner);
  }
  const total = (dept: string) => [...(byDept.get(dept)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const real = [...byDept.keys()].filter((d) => DEPARTMENTS[d]).sort((a, b) => total(b) - total(a) || a.localeCompare(b));

  const sectors: Sector[] = [];
  const sectorOfCode = new Map<string, string>();
  for (const dept of real) {
    const [name, color] = DEPARTMENTS[dept];
    const ranked = [...byDept.get(dept)!].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const size = total(dept);
    const leading = size >= SPLIT_AT && ranked.length > 1
      ? ranked.filter(([, n]) => n >= Math.max(MIN_CODE, size * MIN_SHARE)).slice(0, MAX_CODES) : [];
    if (leading.length < 2) {
      sectors.push({ key: dept, dept, label: name, color, count: size, codes: ranked.map(([c]) => c) });
      for (const [c] of ranked) sectorOfCode.set(c, dept);
      continue;
    }
    for (const [c, n] of leading) {
      sectors.push({ key: c, dept, label: `${c} · ${short(dept)}`, color, count: n, codes: [c] });
      sectorOfCode.set(c, c);
    }
    const rest = ranked.filter(([c]) => !leading.some(([l]) => l === c));
    if (rest.length) {
      sectors.push({ key: `${dept}*`, dept, label: `${short(dept)} · 其他代码`, color, count: rest.reduce((a, [, n]) => a + n, 0), codes: rest.map(([c]) => c) });
      for (const [c] of rest) sectorOfCode.set(c, `${dept}*`);
    }
  }
  for (const [dept, label, color] of [[UNCHECKED, UNCHECKED, "#64748b"], [UNKNOWN, UNKNOWN, "#94a3b8"]] as const) {
    const inner = byDept.get(dept);
    if (!inner) continue;
    sectors.push({ key: dept, dept, label, color, count: total(dept), codes: [...inner.keys()].filter((c) => c !== UNKNOWN) });
    for (const c of inner.keys()) sectorOfCode.set(c, dept);
  }
  const departments: DepartmentCount[] = [
    ...real.map((d) => ({ dept: d, name: DEPARTMENTS[d][0], color: DEPARTMENTS[d][1], count: total(d), codes: [...byDept.get(d)!.keys()] })),
    ...[UNCHECKED, UNKNOWN].filter((d) => byDept.has(d)).map((d) => ({ dept: d, name: d, color: d === UNKNOWN ? "#94a3b8" : "#64748b",
      count: total(d), codes: [...byDept.get(d)!.keys()].filter((c) => c !== UNKNOWN) })),
  ];
  const keyOf = (raw?: string | null) => sectorOfCode.get(codeOf(raw).code) ?? UNKNOWN;
  return { sectors, departments, keyOf };
}
