import {
  ALL_YEARS,
  ANNUAL_NAMES,
  type AnnualMetric,
  type AtlasMeasure,
  type AtlasModel,
  type YearWindow,
} from "../../domainAtlas";

/**
 * 年度投入's right column (query 2026-1030 1747): what the stacked years say, in sentences over the
 * same numbers — the peak, where most of it falls, which domain leads which years — then every row of
 * the current layer with its share and its own years. A row chooses that domain in the chart.
 */
const UNITS: Record<AnnualMetric, string> = { projects: "项", funding: "万元", items: "条", outputs: "项" };
const fmt = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const short = (name = "") => name.replace(/^AI与/, "");
const known = (d: AtlasMeasure, metric: AnnualMetric) =>
  metric === "funding" ? d.funded > 0 : metric === "outputs" ? d.listed > 0 : true;
const span = (a: number, b: number) => (a === b ? `${a} 年` : `${a}–${b} 年`);
const pct = (part: number, whole: number) => {
  const p = whole ? (part / whole) * 100 : 0;
  return p > 0 && p < 1 ? "不到 1%" : `${Math.round(p)}%`;
};

export function YearStory({ model, ids, scope, years, window, metric, chosen, hue, onChoose, onWindow }: {
  model: AtlasModel;
  ids: string[];
  scope: string | null;
  years: number[];
  window: YearWindow;
  metric: AnnualMetric;
  chosen: string | null;
  hue: (id: string) => string;
  onChoose: (id: string) => void;
  onWindow: (w: YearWindow) => void;
}) {
  const unit = UNITS[metric];
  // Inside a domain the systems share projects: their shares are not parts of one whole.
  const parts = !scope;
  const yearly = years.map((y) => scope
    ? model.measure(scope, { from: y, to: y })[metric]
    : ids.reduce((n, id) => n + model.measure(id, { from: y, to: y })[metric], 0));
  const inWindow = (y: number) => window.from === null || (y >= window.from && y <= (window.to ?? window.from));
  const shown = years.filter(inWindow);
  const total = years.reduce((n, y, i) => n + (inWindow(y) ? yearly[i] : 0), 0);
  const whole = yearly.reduce((n, v) => n + v, 0);
  const at = years.map((_, i) => i).filter((i) => inWindow(years[i]));
  const name = (id: string) => short(model.nodes.get(id)?.name);
  const lines: string[] = [];
  if (total > 0) {
    if (window.from !== null) lines.push(`占全部年份的 ${pct(total, whole)}`);
    if (chosen && ids.includes(chosen)) {
      const own = at.map((i) => model.measure(chosen, { from: years[i], to: years[i] })[metric]);
      const mine = own.reduce((n, v) => n + v, 0), best = own.indexOf(Math.max(...own));
      if (mine) lines.unshift(`${name(chosen)}：${fmt(mine)} ${unit}${parts ? `，占 ${pct(mine, total)}` : ""}${at.length > 1 ? `，${years[at[best]]} 年最多` : ""}`);
    }
    if (at.length > 1) {
      const peak = at.reduce((a, b) => (yearly[b] > yearly[a] ? b : a));
      lines.push(`高峰在 ${years[peak]} 年：${fmt(yearly[peak])} ${unit}，占${window.from === null ? "全部" : "所选"}年份的 ${pct(yearly[peak], total)}`);
    }
    if (window.from === null && years.length > 2) {
      // The shortest run of years that holds four fifths of the whole.
      let best: [number, number] | null = null;
      for (let a = 0; a < years.length; a++) for (let b = a, sum = 0; b < years.length; b++) {
        sum += yearly[b];
        if (sum >= whole * 0.8) { if (!best || b - a < best[1] - best[0]) best = [a, b]; break; }
      }
      if (best && best[1] > best[0]) lines.push(`八成集中在 ${span(years[best[0]], years[best[1]])}`);
    }
    if (at.length === 1 && at[0] > 0 && yearly[at[0] - 1] > 0) {
      const i = at[0], change = Math.round(((yearly[i] - yearly[i - 1]) / yearly[i - 1]) * 100);
      lines.push(`比 ${years[i - 1]} 年${change >= 0 ? "增加" : "减少"} ${Math.abs(change)}%`);
    }
    if (ids.length > 1) {
      // Which row leads which years; years with under a twentieth of the peak are too thin to lead.
      const floor = Math.max(...at.map((i) => yearly[i])) * 0.05;
      const runs: { id: string; from: number; to: number }[] = [];
      for (const i of at) {
        if (yearly[i] < floor || !yearly[i]) continue;
        const y = years[i], value = (id: string) => model.measure(id, { from: y, to: y })[metric];
        const lead = ids.reduce((a, b) => (value(b) > value(a) ? b : a));
        const last = runs.at(-1);
        if (last?.id === lead) last.to = y; else runs.push({ id: lead, from: y, to: y });
      }
      if (runs.length > 1) lines.push(`逐年领先：${runs.map((r) => `${span(r.from, r.to)} ${name(r.id)}`).join(" → ")}`);
      else if (runs.length === 1 && parts) {
        // Only a real lead is named: no tie, and not the row already described above.
        const [top, next] = ids.map((id) => ({ id, v: model.measure(id, window)[metric] })).sort((a, b) => b.v - a.v);
        if (top.v > (next?.v ?? 0) && top.id !== chosen)
          lines.push(`${name(top.id)}${at.length > 1 ? "每年都最多" : "最多"}，占 ${pct(top.v, total)}`);
      }
    }
  }
  const rows = ids.map((id) => ({ id, d: model.measure(id, window) }))
    .sort((a, b) => b.d[metric] - a.d[metric]);
  const missing = rows.reduce((n, r) => n + r.d.projects - (metric === "funding" ? r.d.funded : metric === "outputs" ? r.d.listed : r.d.projects), 0);
  return <aside className="lens-year-story" aria-label="年度分析">
    <header>
      <span>分析 · {ANNUAL_NAMES[metric]}</span>
      <h3>{window.from === null ? "全部年份" : span(window.from, window.to ?? window.from)}
        <b>{fmt(total)} <small>{unit}</small></b></h3>
      {window.from !== null ? <button type="button" className="lens-secondary" onClick={() => onWindow(ALL_YEARS)}>看全部年份</button> : null}
    </header>
    {lines.length ? <ul className="lens-year-lines">{lines.map((l) => <li key={l}>{l}</li>)}</ul> : null}
    {missing > 0 ? <p className="lens-year-missing">{missing} 个项目未记录{ANNUAL_NAMES[metric]}，未计入。</p> : null}
    <h4>{parts ? "各领域" : "各技术体系"}<span>{parts ? "占比 · 逐年" : "逐年（各体系可能涉及同一项目，不相加）"}</span></h4>
    <ol className="lens-year-rows">{rows.map(({ id, d }) => {
      const share = total && parts ? pct(d[metric], total).replace("不到 1%", "<1%") : null;
      // Each row's years against its own busiest year: the shape, not the size.
      const own = years.map((y) => model.measure(id, { from: y, to: y })[metric]), top = Math.max(1, ...own);
      return <li key={id}>
        <button type="button" aria-pressed={chosen === id} onClick={() => onChoose(id)}>
          <i style={{ background: parts ? hue(id) : "var(--terrain-dot-on)" }} />
          <span className="lens-year-row-name">{short(model.nodes.get(id)?.name)}</span>
          <span className="lens-year-row-value">{!d.projects ? "0" : known(d, metric) ? fmt(d[metric]) : "未记录"}{share !== null ? <small>{share}</small> : null}</span>
          <svg viewBox={`0 0 ${years.length * 6} 18`} preserveAspectRatio="none" aria-hidden="true">
            {years.map((y, i) => {
              const h = (own[i] / top) * 16;
              return <rect key={y} x={i * 6 + 0.5} y={18 - h} width={5} height={h}
                fill={parts ? hue(id) : "var(--terrain-dot-on)"} opacity={shown.includes(y) ? 1 : 0.3} />;
            })}
          </svg>
        </button>
      </li>;
    })}</ol>
  </aside>;
}
