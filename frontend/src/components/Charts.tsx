/**
 * Small SVG charts for the leader and admin views and for period-summary reports
 * (query 2026-1013 1801). Every value comes from counted data; a chart always says what it
 * counts in its note.
 */
export type ChartSpec = { type: "radar" | "bar"; title: string; labels: string[]; values: number[]; unit?: string; note?: string };

const clip = (text: string, n: number) => (text.length > n ? text.slice(0, n - 1) + "…" : text);

export function RadarChart({ spec }: { spec: ChartSpec }) {
  const n = spec.labels.length;
  if (n < 3) return <BarChart spec={spec} />;
  const size = 300, c = size / 2, r = 100, max = Math.max(1, ...spec.values);
  const point = (i: number, v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const ring = (f: number) => spec.labels.map((_, i) => point(i, f).join(",")).join(" ");
  return <figure className="m-0">
    {/* Side margins leave room for the labels left and right of the web. */}
    <svg role="img" aria-label={spec.title} viewBox={`-90 -6 ${size + 180} ${size + 12}`} className="mx-auto w-full max-w-[460px]">
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} fill="none" stroke="var(--hairline)" />)}
      {spec.labels.map((_, i) => { const [x, y] = point(i, 1); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--hairline)" />; })}
      <polygon points={spec.values.map((v, i) => point(i, v / max).join(",")).join(" ")} fill="var(--primary)" fillOpacity=".22" stroke="var(--primary)" strokeWidth="2" />
      {spec.values.map((v, i) => { const [x, y] = point(i, v / max); return <circle key={i} cx={x} cy={y} r="3" fill="var(--primary)"><title>{spec.labels[i]}：{v}{spec.unit ?? ""}</title></circle>; })}
      {spec.labels.map((label, i) => {
        const [x, y] = point(i, 1.22);
        return <text key={label} x={x} y={y} textAnchor={Math.abs(x - c) < 8 ? "middle" : x > c ? "start" : "end"} dominantBaseline="middle" fontSize="11" fill="var(--slate)">
          {clip(label, 10)} {spec.values[i]}</text>;
      })}
    </svg>
    <Caption spec={spec} />
  </figure>;
}

export function BarChart({ spec }: { spec: ChartSpec }) {
  const max = Math.max(1, ...spec.values);
  return <figure className="m-0">
    <div role="img" aria-label={spec.title} className="space-y-1.5">
      {spec.labels.map((label, i) => <div key={label} className="flex items-center gap-2 text-[13px]">
        <span className="w-28 shrink-0 truncate text-right" title={label}>{label}</span>
        <span className="h-4 flex-1 rounded bg-[var(--hairline)]"><span className="block h-4 rounded bg-[var(--primary)]" style={{ width: `${100 * spec.values[i] / max}%` }} /></span>
        <span className="w-14 shrink-0 tabular-nums">{spec.values[i]}{spec.unit ?? ""}</span>
      </div>)}
    </div>
    <Caption spec={spec} />
  </figure>;
}

function Caption({ spec }: { spec: ChartSpec }) {
  return <figcaption className="mt-2 text-center text-xs text-[var(--steel)]"><b className="font-semibold text-[var(--slate)]">{spec.title}</b>
    {spec.note ? <span className="block text-[var(--stone)]">{spec.note}</span> : null}</figcaption>;
}

export function Chart({ spec }: { spec: ChartSpec }) {
  return spec.type === "radar" ? <RadarChart spec={spec} /> : <BarChart spec={spec} />;
}

/** A ```dox-chart block in a report: JSON {type, title, labels, values, unit?, note?}. */
export function ChartBlock({ source }: { source: string }) {
  try {
    const spec = JSON.parse(source) as ChartSpec;
    if (!Array.isArray(spec.labels) || !Array.isArray(spec.values) || spec.labels.length !== spec.values.length) throw new Error();
    return <div className="my-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4"><Chart spec={spec} /></div>;
  } catch {
    return <p role="alert" className="text-xs text-[var(--red)]">图表数据不完整，无法绘制。</p>;
  }
}

/**
 * Where a domain's projects concentrate, by application field and by workflow stage. Both count
 * the lineage's technique items (unique projects), the same base as the overview cards, so the
 * numbers on one page agree.
 */
export function FocusRadars({ fields, items, stages }: {
  fields: { name: string }[];
  items: Record<string, { project_id: string; field?: string; stage?: string }>;
  stages: { name: string }[];
}) {
  const count = (key: "field" | "stage", name: string) => new Set(Object.values(items).filter((i) => i[key] === name).map((i) => i.project_id)).size;
  // Projects left out of a chart are counted next to it, never silently dropped (节点审查 A3).
  const all = new Set(Object.values(items).map((i) => i.project_id));
  const outside = (key: "field" | "stage", names: { name: string }[]) => {
    const known = new Set(names.map((n) => n.name));
    const placed = new Set(Object.values(items).filter((i) => i[key] && known.has(i[key]!)).map((i) => i.project_id));
    return [...all].filter((id) => !placed.has(id)).length;
  };
  const note = (what: string, key: "field" | "stage", names: { name: string }[]) =>
    `有技术${what}的项目数，一个项目可计入多处；${outside(key, names)} 个项目的技术都未判定${key === "field" ? "领域" : "环节"}，不在图中（共 ${all.size} 个项目）`;
  const charts: ChartSpec[] = [
    ...(fields.length ? [{ type: "radar" as const, title: "应用领域分布", labels: fields.map((f) => f.name), values: fields.map((f) => count("field", f.name)), unit: " 项",
      note: note("服务于该领域", "field", fields) }] : []),
    ...(stages.length ? [{ type: "radar" as const, title: "业务环节分布", labels: stages.map((s) => s.name), values: stages.map((s) => count("stage", s.name)), unit: " 项",
      note: note("落在该环节", "stage", stages) }] : []),
  ];
  // Two side by side only where the container is wide enough, e.g. not in the right-hand panel.
  return <section aria-label="聚焦分布" className="@container">
    <div className="grid gap-3 @2xl:grid-cols-2">
      {charts.map((spec) => <div key={spec.title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4"><Chart spec={spec} /></div>)}
    </div>
  </section>;
}
