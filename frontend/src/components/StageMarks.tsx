import { TIERS, tierOf } from "../briefing";

/**
 * One visual language for report-described stages: colour never appears without its words.
 * A badge names one stage; counts list the stages present with their numbers. No bare colour bars.
 */
export function Tier({ level, withLevel }: { level: number; withLevel?: boolean }) {
  const tier = tierOf(level);
  return <span title={tier.hint} className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[11px] font-semibold leading-4 text-white" style={{ background: tier.color }}>
    {withLevel ? `${level} · ` : ""}{tier.label}</span>;
}

/** Projects (or items) per stage, e.g. "● 示范应用 2 · ● 成型技术 5"; zero stages are left out. */
export function TierCounts({ tiers, unit = "" }: { tiers: number[]; unit?: string }) {
  const shown = TIERS.map((tier, i) => ({ tier, n: tiers[i] })).filter(({ n }) => n > 0);
  if (!shown.length) return null;
  return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--steel)]">
    {shown.map(({ tier, n }) => <span key={tier.label} title={tier.hint} className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: tier.color }} />{tier.label} <b className="tabular-nums text-[var(--ink)]">{n}</b>{unit}</span>)}
  </span>;
}

export function Chips({ list, large }: { list: string[]; large?: boolean }) {
  return list.length ? <span className="inline-flex flex-wrap gap-1">{list.map((chip) =>
    <span key={chip} className={`rounded border border-[#d9a92f66] bg-[#fdf6e3] font-semibold text-[#7a5a00] tabular-nums ${large ? "px-2 py-0.5 text-[13px]" : "px-1.5 py-px text-[11px]"}`}>{chip}</span>)}</span> : null;
}

/** Stage counts of a set of levels, as TierCounts input. */
export function tierCounts(levels: number[]) {
  const counts = [0, 0, 0, 0];
  for (const level of levels) counts[TIERS.indexOf(tierOf(level))] += 1;
  return counts;
}
