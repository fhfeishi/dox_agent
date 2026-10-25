/** Stored project facts for 01. Missing measurements stay null; layers deduplicate project IDs. */
export type AtlasProject = {
  id: string;
  title: string;
  year: number | null;
  amount: number | null;
  outputs: number | null;
};
export type AtlasItem = {
  id: string;
  project_id: string;
  maturity: number;
};
export type AtlasDirection = {
  id: string;
  name: string;
  item_ids: string[];
};
export type AtlasSystem = AtlasDirection & {
  directions: AtlasDirection[];
  unplaced: boolean;
};
export type AtlasDomain = {
  id: string;
  name: string;
  projects: AtlasProject[];
  items: AtlasItem[];
  systems: AtlasSystem[];
};
export type AtlasData = {
  funding_label: string;
  years: number[];
  domains: AtlasDomain[];
};
export type AtlasNode = {
  id: string;
  name: string;
  domain: string;
  parent: string | null;
  kind: "domain" | "system" | "direction";
  itemIds: string[];
  children: string[];
};
export type YearWindow = {
  from: number | null;
  to: number | null;
};
export type Lens = "base" | "money" | "impact";
export type AnnualMetric = "projects" | "funding" | "items" | "outputs";
export const ANNUAL_METRICS: AnnualMetric[] = [
  "projects",
  "funding",
  "items",
  "outputs",
];
export const ANNUAL_NAMES = {
  projects: "项目数量",
  funding: "批准资助金额",
  items: "技术条目",
  outputs: "成果条目",
};
export const ALL_YEARS: YearWindow = { from: null, to: null };
export const MIN_BASE = 3;
export const OUTPUT_MEANING =
  "按报告“成果列表”逐条计数期刊与会议论文、专利、奖励、专著；按项目立项年归属，不是成果发表年份，也不等于经济收益。";
export const NODE_KINDS = {
  domain: "领域",
  system: "技术体系",
  direction: "研究方向",
};
export const LENSES = {
  base: {
    name: "家底与深度",
    question: "做了多少，做得多深？",
    x: "技术条目数（对数）",
    y: "平均成熟度",
    quads: ["小而精", "量大且深", "少且浅", "铺得宽 · 沉不下去"],
  },
  money: {
    name: "投入与产出",
    question: "钱投在哪，换来多少成果？",
    x: "项目平均批准资助（万元）",
    y: "项目平均成果（项）",
    quads: ["少投多产", "多投多产", "少投少产", "多投少产"],
  },
  impact: {
    name: "成果与落地",
    question: "成果多不多，有没有走到场景？",
    x: "项目平均成果（项）",
    y: "4–5 档技术占比（%）",
    quads: ["少而落地", "多产且落地", "两头都弱", "论文多 · 落地少"],
  },
} as const;
export type AtlasMeasure = {
  node: AtlasNode;
  projects: number;
  items: number;
  levels: number[];
  maturity: number | null;
  funding: number;
  funded: number;
  outputs: number;
  listed: number;
  avgFunding: number | null;
  avgOutputs: number | null;
  landed: number | null;
  records: AtlasProject[];
  undated: number;
};
export function buildAtlas(data: AtlasData) {
  const nodes = new Map<string, AtlasNode>(),
    domains = new Map(data.domains.map((d) => [d.id, d]));
  const projectMaps = new Map(
    data.domains.map((d) => [d.id, new Map(d.projects.map((p) => [p.id, p]))]),
  );
  const itemMaps = new Map(
    data.domains.map((d) => [d.id, new Map(d.items.map((i) => [i.id, i]))]),
  );
  for (const d of data.domains) {
    nodes.set(d.id, {
      id: d.id,
      name: d.name,
      domain: d.id,
      parent: null,
      kind: "domain",
      itemIds: d.items.map((i) => i.id),
      children: d.systems.map((s) => s.id),
    });
    for (const s of d.systems) {
      nodes.set(s.id, {
        id: s.id,
        name: s.name,
        domain: d.id,
        parent: d.id,
        kind: "system",
        itemIds: [...new Set(s.item_ids)],
        children: s.directions.map((c) => c.id),
      });
      for (const c of s.directions)
        nodes.set(c.id, {
          id: c.id,
          name: c.name,
          domain: d.id,
          parent: s.id,
          kind: "direction",
          itemIds: [...new Set(c.item_ids)],
          children: [],
        });
    }
  }
  const cache = new Map<string, AtlasMeasure>();
  function measure(id: string, window: YearWindow = ALL_YEARS): AtlasMeasure {
    const key = `${id}|${window.from}|${window.to}`,
      cached = cache.get(key);
    if (cached) return cached;
    const node = nodes.get(id)!;
    const pm = projectMaps.get(node.domain)!,
      im = itemMaps.get(node.domain)!;
    const inWindow = (p: AtlasProject | undefined) =>
      window.from === null ||
      Boolean(
        p?.year &&
          p.year >= window.from &&
          p.year <= (window.to ?? window.from),
      );
    const items = node.itemIds
      .map((k) => im.get(k))
      .filter((i): i is AtlasItem =>
        Boolean(i && inWindow(pm.get(i.project_id))),
      );
    const pids =
      node.kind === "domain"
        ? [...pm.keys()]
        : [...new Set(items.map((i) => i.project_id))];
    const records = pids
      .map((k) => pm.get(k))
      .filter((p): p is AtlasProject => Boolean(p && inWindow(p)));
    const levels = [0, 0, 0, 0, 0, 0];
    items.forEach(
      (i) => levels[i.maturity >= 0 && i.maturity <= 5 ? i.maturity : 0]++,
    );
    const funded = records.filter((p) => p.amount !== null),
      listed = records.filter((p) => p.outputs !== null),
      judged = items.length - levels[0];
    const funding =
        Math.round(funded.reduce((s, p) => s + p.amount!, 0) * 10) / 10,
      outputs = listed.reduce((s, p) => s + p.outputs!, 0);
    const value = {
      node,
      records,
      projects: records.length,
      items: items.length,
      levels,
      funding,
      funded: funded.length,
      outputs,
      listed: listed.length,
      maturity: judged
        ? Math.round(
            (levels.reduce((s, v, i) => s + v * i, 0) / judged) * 100,
          ) / 100
        : null,
      avgFunding: funded.length >= MIN_BASE ? funding / funded.length : null,
      avgOutputs: listed.length >= MIN_BASE ? outputs / listed.length : null,
      landed: items.length
        ? ((levels[4] + levels[5]) / items.length) * 100
        : null,
      undated: records.filter((p) => !p.year).length,
    };
    cache.set(key, value);
    return value;
  }
  return {
    nodes,
    domains,
    roots: data.domains
      .slice()
      .sort((a, b) => b.items.length - a.items.length)
      .map((d) => d.id),
    measure,
  };
}
export type AtlasModel = ReturnType<typeof buildAtlas>;
export function lensValue(
  d: AtlasMeasure,
  lens: Lens,
):
  | {
      x: number;
      y: number;
      reason?: undefined;
    }
  | {
      reason: string;
      x?: undefined;
      y?: undefined;
    } {
  if (!d.projects) return { reason: "所选年份没有立项" };
  if (lens === "base")
    return d.items && d.maturity !== null
      ? { x: d.items, y: d.maturity }
      : { reason: "没有可判定的技术条目" };
  if (d.projects < MIN_BASE)
    return { reason: `节点本身只有 ${d.projects} 个项目，少于 ${MIN_BASE} 项` };
  if (lens === "money" && d.avgFunding === null)
    return {
      reason: `${d.funded} 个项目记录批准资助金额，不足 ${MIN_BASE} 项`,
    };
  if (d.avgOutputs === null)
    return { reason: `${d.listed} 个项目列有成果，不足 ${MIN_BASE} 项` };
  if (lens === "impact" && d.landed === null)
    return { reason: "没有关联技术条目" };
  return lens === "money"
    ? { x: d.avgFunding!, y: d.avgOutputs! }
    : { x: d.avgOutputs!, y: d.landed! };
}
export const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return s.length
    ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2
    : 0;
};
export function atlasLayout(
  rows: AtlasMeasure[],
  lens: Lens,
  width: number,
  height: number,
  fontSize = 14,
) {
  const measured = rows.map((d) => ({ d, value: lensValue(d, lens) }));
  const valid = measured
    .filter((p) => p.value.reason === undefined)
    .map((p) => ({ d: p.d, x: p.value.x!, y: p.value.y! }));
  const extent = (v: number[], log = false) => {
    const vs = log ? v.map(Math.log10) : v,
      min = Math.min(...vs),
      max = Math.max(...vs),
      pad = Math.max((max - min) * 0.14, log ? 0.08 : 0.2);
    return [log ? min - pad : Math.max(0, min - pad), max + pad];
  };
  const fullX = valid.length
      ? extent(
          valid.map((p) => p.x),
          lens === "base",
        )
      : [0, 1],
    fullY = valid.length ? extent(valid.map((p) => p.y)) : [0, 1];
  if (lens === "base") fullY[1] = Math.min(5, fullY[1]);
  if (lens === "impact") fullY[1] = Math.min(100, fullY[1]);
  const left = Math.ceil(fontSize * 3.5),
    right = width - fontSize,
    top = fontSize * 2.1,
    bottom = height - fontSize * 3.3;
  const xr = fullX,
    yr = fullY;
  const px = (x: number) =>
    left +
    (((lens === "base" ? Math.log10(x) : x) - fullX[0]) /
      (fullX[1] - fullX[0])) *
      (right - left);
  const py = (y: number) =>
    bottom - ((y - fullY[0]) / (fullY[1] - fullY[0])) * (bottom - top);
  const mx = median(valid.map((p) => p.x)),
    my = median(valid.map((p) => p.y)),
    max = Math.max(1, ...valid.map((p) => p.d.projects));
  const shorten =
    valid.length > 0 && valid.every((p) => p.d.node.name.startsWith("AI与"));
  const points = valid.map((p) => ({
    ...p,
    cx: px(p.x),
    cy: py(p.y),
    r: Math.max(8, Math.sqrt(p.d.projects / max) * 30),
    ghost: false,
    opacity: 1,
    label: shorten ? p.d.node.name.slice(3) : p.d.node.name,
  }));
  type Box = { x: number; y: number; w: number; h: number };
  const intersects = (a: Box, b: Box) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const visible = points.filter(
    (p) =>
      p.cx + p.r >= left &&
      p.cx - p.r <= right &&
      p.cy + p.r >= top &&
      p.cy - p.r <= bottom,
  );
  const boxes: Box[] = visible.map((p) => ({
    x: p.cx - p.r - 3,
    y: p.cy - p.r - 3,
    w: p.r * 2 + 6,
    h: p.r * 2 + 6,
  }));
  const medianX = valid.length ? px(mx) : left,
    medianY = py(my);
  if (medianY >= top && medianY <= bottom) {
    boxes.push({
      x: left + 4,
      y: medianY - fontSize * 1.7,
      w: fontSize * 8,
      h: fontSize * 1.7,
    });
  }
  const quadSeats = new Map<
    number,
    { x: number; y: number; anchor: "start" | "end" }
  >();
  LENSES[lens].quads.forEach((name, i) => {
    const x0 = i % 2 ? Math.max(left, medianX) : left,
      x1 = i % 2 ? right : Math.min(right, medianX);
    const y0 = i < 2 ? top : Math.max(top, medianY),
      y1 = i < 2 ? Math.min(bottom, medianY) : bottom;
    const w = (name.length + 3) * fontSize * 0.9 + 8,
      h = fontSize * 1.3;
    if (x1 - x0 < w + 12 || y1 - y0 < h + 12) return;
    const candidates = [
      { x: x0 + 6, y: i < 2 ? y0 + 4 : y1 - h - 4 },
      { x: x1 - w - 6, y: i < 2 ? y0 + 4 : y1 - h - 4 },
      { x: x0 + 6, y: i < 2 ? y1 - h - 4 : y0 + 4 },
      { x: x1 - w - 6, y: i < 2 ? y1 - h - 4 : y0 + 4 },
    ];
    const seat = candidates.find(
      (b) => !boxes.some((a) => intersects(a, { ...b, w, h })),
    );
    if (seat) {
      quadSeats.set(i, { x: seat.x, y: seat.y + fontSize, anchor: "start" });
      boxes.push({ ...seat, w, h });
    }
  });
  const seats = new Map<
    string,
    {
      x: number;
      y: number;
      leader?: { x1: number; y1: number; x2: number; y2: number };
    }
  >();
  let outOfSeats = false;
  [...visible]
    .sort((a, b) => b.d.projects - a.d.projects)
    .forEach((p) => {
      if (outOfSeats) return;
      const w =
          [...p.label].reduce(
            (n, c) =>
              n + (/[\u3400-\u9fff]/.test(c) ? fontSize : fontSize * 0.64),
            0,
          ) + 8,
        h = fontSize * 1.35,
        gap = fontSize * 0.6;
      const candidates = [
        { x: p.cx + p.r + gap, y: p.cy - h / 2 },
        { x: p.cx - p.r - w - gap, y: p.cy - h / 2 },
        { x: p.cx - w / 2, y: p.cy - p.r - h - gap },
        { x: p.cx - w / 2, y: p.cy + p.r + gap },
      ];
      for (const delta of [-36, -24, -12, 12, 24, 36]) {
        candidates.push(
          { x: p.cx + p.r + gap, y: p.cy - h / 2 + delta },
          { x: p.cx - p.r - w - gap, y: p.cy - h / 2 + delta },
          { x: p.cx - w / 2 + delta, y: p.cy - p.r - h - gap },
          { x: p.cx - w / 2 + delta, y: p.cy + p.r + gap },
        );
      }
      const opts = candidates.map((b) => ({
        x: Math.max(left + 4, Math.min(right - w - 4, b.x)),
        y: Math.max(top + 4, Math.min(bottom - h - 4, b.y)),
        w,
        h,
      }));
      opts.sort(
        (a, b) =>
          Math.hypot(a.x + w / 2 - p.cx, a.y + h / 2 - p.cy) -
          Math.hypot(b.x + w / 2 - p.cx, b.y + h / 2 - p.cy),
      );
      const seat = opts.find(
        (b) =>
          Math.hypot(
            p.cx - Math.max(b.x, Math.min(b.x + b.w, p.cx)),
            p.cy - Math.max(b.y, Math.min(b.y + b.h, p.cy)),
          ) -
            p.r <=
            30 &&
          !boxes.some((a) =>
            intersects(a, { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 }),
          ),
      );
      if (!seat) {
        outOfSeats = true;
        return;
      }
      boxes.push(seat);
      const ex = Math.max(seat.x, Math.min(seat.x + w, p.cx)),
        ey = Math.max(seat.y, Math.min(seat.y + h, p.cy));
      const distance = Math.hypot(ex - p.cx, ey - p.cy),
        ratio = p.r / Math.max(1, distance);
      seats.set(p.d.node.id, {
        x: seat.x + w / 2,
        y: seat.y + fontSize,
        leader:
          distance > p.r + fontSize
            ? {
                x1: p.cx + (ex - p.cx) * ratio,
                y1: p.cy + (ey - p.cy) * ratio,
                x2: ex,
                y2: ey,
              }
            : undefined,
      });
    });
  return {
    points,
    missing: measured.filter((p) => p.value.reason !== undefined),
    px,
    py,
    mx,
    my,
    medianX,
    medianY,
    xr,
    yr,
    seats,
    quadSeats,
    left,
    right,
    top,
    bottom,
  };
}

export const atlasQuery = {
  queryKey: ["domains", "atlas"],
  staleTime: 60000,
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<AtlasData> => {
    const r = await fetch("/api/domains/atlas", { signal });
    if (!r.ok)
      throw new Error(
        (await r.json().catch(() => null))?.detail ?? "领域记录暂不可读",
      );
    return r.json();
  },
};

export function levelMeasure(
  model: AtlasModel,
  ids: string[],
  scope: string | null,
  window: YearWindow,
): AtlasMeasure {
  if (scope) return model.measure(scope, window);
  const rows = ids.map((id) => model.measure(id, window));
  const levels = Array.from({ length: 6 }, (_, i) =>
    rows.reduce((n, d) => n + d.levels[i], 0),
  );
  const projects = rows.reduce((n, d) => n + d.projects, 0),
    items = rows.reduce((n, d) => n + d.items, 0),
    funding = rows.reduce((n, d) => n + d.funding, 0),
    funded = rows.reduce((n, d) => n + d.funded, 0),
    outputs = rows.reduce((n, d) => n + d.outputs, 0),
    listed = rows.reduce((n, d) => n + d.listed, 0),
    judged = items - levels[0];
  return {
    node: {
      id: "all",
      name: "全部领域",
      domain: "",
      parent: null,
      kind: "domain",
      children: ids,
      itemIds: [],
    },
    records: [],
    projects,
    items,
    levels,
    funding,
    funded,
    outputs,
    listed,
    maturity: judged ? levels.reduce((n, v, i) => n + v * i, 0) / judged : null,
    avgFunding: funded >= MIN_BASE ? funding / funded : null,
    avgOutputs: listed >= MIN_BASE ? outputs / listed : null,
    landed: items ? ((levels[4] + levels[5]) / items) * 100 : null,
    undated: rows.reduce((n, d) => n + d.undated, 0),
  };
}
