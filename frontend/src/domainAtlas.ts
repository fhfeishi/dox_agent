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
export const ANNUAL_METRICS: AnnualMetric[] = ["projects", "funding", "items", "outputs"];
export const ANNUAL_NAMES = { projects: "项目数量", funding: "批准资助金额", items: "技术条目", outputs: "成果条目" };
export const ALL_YEARS: YearWindow = { from: null, to: null };
export const MIN_BASE = 3;
export const OUTPUT_MEANING = "按报告“成果列表”逐条计数期刊与会议论文、专利、奖励、专著；按项目立项年归属，不是成果发表年份，也不等于经济收益。";
export const NODE_KINDS = { domain: "领域", system: "技术体系", direction: "研究方向" };
export const LENSES = {
    base: { name: "家底与深度", question: "做了多少，做得多深？", x: "技术条目数（对数）", y: "平均成熟度", quads: ["小而精", "量大且深", "少且浅", "铺得宽 · 沉不下去"] },
    money: { name: "投入与产出", question: "钱投在哪，换来多少成果？", x: "项目平均批准资助（万元）", y: "项目平均成果（项）", quads: ["少投多产", "多投多产", "少投少产", "多投少产"] },
    impact: { name: "成果与落地", question: "成果多不多，有没有走到场景？", x: "项目平均成果（项）", y: "4–5 档技术占比（%）", quads: ["少而落地", "多产且落地", "两头都弱", "论文多 · 落地少"] },
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
    const nodes = new Map<string, AtlasNode>(), domains = new Map(data.domains.map(d => [d.id, d]));
    const projectMaps = new Map(data.domains.map(d => [d.id, new Map(d.projects.map(p => [p.id, p]))]));
    const itemMaps = new Map(data.domains.map(d => [d.id, new Map(d.items.map(i => [i.id, i]))]));
    for (const d of data.domains) {
        nodes.set(d.id, { id: d.id, name: d.name, domain: d.id, parent: null, kind: "domain", itemIds: d.items.map(i => i.id), children: d.systems.map(s => s.id) });
        for (const s of d.systems) {
            nodes.set(s.id, { id: s.id, name: s.name, domain: d.id, parent: d.id, kind: "system", itemIds: [...new Set(s.item_ids)], children: s.directions.map(c => c.id) });
            for (const c of s.directions)
                nodes.set(c.id, { id: c.id, name: c.name, domain: d.id, parent: s.id, kind: "direction", itemIds: [...new Set(c.item_ids)], children: [] });
        }
    }
    const cache = new Map<string, AtlasMeasure>();
    function measure(id: string, window: YearWindow = ALL_YEARS): AtlasMeasure {
        const key = `${id}|${window.from}|${window.to}`, cached = cache.get(key);
        if (cached)
            return cached;
        const node = nodes.get(id)!;
        const pm = projectMaps.get(node.domain)!, im = itemMaps.get(node.domain)!;
        const inWindow = (p: AtlasProject | undefined) => window.from === null || Boolean(p?.year && p.year >= window.from && p.year <= (window.to ?? window.from));
        const items = node.itemIds.map(k => im.get(k)).filter((i): i is AtlasItem => Boolean(i && inWindow(pm.get(i.project_id))));
        const pids = node.kind === "domain" ? [...pm.keys()] : [...new Set(items.map(i => i.project_id))];
        const records = pids.map(k => pm.get(k)).filter((p): p is AtlasProject => Boolean(p && inWindow(p)));
        const levels = [0, 0, 0, 0, 0, 0];
        items.forEach(i => levels[i.maturity >= 0 && i.maturity <= 5 ? i.maturity : 0]++);
        const funded = records.filter(p => p.amount !== null), listed = records.filter(p => p.outputs !== null), judged = items.length - levels[0];
        const funding = Math.round(funded.reduce((s, p) => s + p.amount!, 0) * 10) / 10, outputs = listed.reduce((s, p) => s + p.outputs!, 0);
        const value = { node, records, projects: records.length, items: items.length, levels, funding, funded: funded.length, outputs, listed: listed.length,
            maturity: judged ? Math.round(levels.reduce((s, v, i) => s + v * i, 0) / judged * 100) / 100 : null,
            avgFunding: funded.length >= MIN_BASE ? funding / funded.length : null, avgOutputs: listed.length >= MIN_BASE ? outputs / listed.length : null,
            landed: items.length ? (levels[4] + levels[5]) / items.length * 100 : null, undated: records.filter(p => !p.year).length };
        cache.set(key, value);
        return value;
    }
    return { nodes, domains, roots: data.domains.slice().sort((a,b)=>b.items.length-a.items.length).map(d => d.id), measure };
}
export type AtlasModel = ReturnType<typeof buildAtlas>;
export function lensValue(d: AtlasMeasure, lens: Lens): {
    x: number;
    y: number;
    reason?: undefined;
} | {
    reason: string;
    x?: undefined;
    y?: undefined;
} {
    if (!d.projects)
        return { reason: "所选年份没有立项" };
    if (lens === "base")
        return d.items && d.maturity !== null ? { x: d.items, y: d.maturity } : { reason: "没有可判定的技术条目" };
    if (d.projects < MIN_BASE)
        return { reason: `节点本身只有 ${d.projects} 个项目，少于 ${MIN_BASE} 项` };
    if (lens === "money" && d.avgFunding === null)
        return { reason: `${d.funded} 个项目记录批准资助金额，不足 ${MIN_BASE} 项` };
    if (d.avgOutputs === null)
        return { reason: `${d.listed} 个项目列有成果，不足 ${MIN_BASE} 项` };
    if (lens === "impact" && d.landed === null)
        return { reason: "没有关联技术条目" };
    return lens === "money" ? { x: d.avgFunding!, y: d.avgOutputs! } : { x: d.avgOutputs!, y: d.landed! };
}
export const median = (values: number[]) => { const s = values.slice().sort((a, b) => a - b); return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2 : 0; };
export function atlasLayout(rows: AtlasMeasure[], lens: Lens, width: number, height: number, fontSize = 14,
    view = { x: 0, y: 0, k: 1 }) {
    const measured = rows.map(d => ({ d, value: lensValue(d, lens) }));
    const valid = measured.filter(p => p.value.reason === undefined).map(p => ({ d: p.d, x: p.value.x!, y: p.value.y! }));
    const extent = (v: number[], log = false) => { const vs = log ? v.map(Math.log10) : v, min = Math.min(...vs), max = Math.max(...vs), pad = Math.max((max - min) * .14, log ? .08 : .2); return [log ? min - pad : Math.max(0, min - pad), max + pad]; };
    const fullX = valid.length ? extent(valid.map(p => p.x), lens === "base") : [0, 1], fullY = valid.length ? extent(valid.map(p => p.y)) : [0, 1];
    if (lens === "base")
        fullY[1] = Math.min(5, fullY[1]);
    if (lens === "impact")
        fullY[1] = Math.min(100, fullY[1]);
    const left = Math.ceil(fontSize * 7.5), right = width - fontSize * 1.8, top = fontSize * 3.4, bottom = height - fontSize * 5.6;
    const xr = [left, right].map(x => fullX[0] + ((x - view.x) / view.k - left) / (right - left) * (fullX[1] - fullX[0]));
    const yr = [bottom, top].map(y => fullY[0] + (bottom - (y - view.y) / view.k) / (bottom - top) * (fullY[1] - fullY[0]));
    const px = (x: number) => view.x + view.k * (left + ((lens === "base" ? Math.log10(x) : x) - fullX[0]) / (fullX[1] - fullX[0]) * (right - left));
    const py = (y: number) => view.y + view.k * (bottom - (y - fullY[0]) / (fullY[1] - fullY[0]) * (bottom - top));
    const mx = median(valid.map(p => p.x)), my = median(valid.map(p => p.y)), max = Math.max(1, ...valid.map(p => p.d.projects));
    const points = valid.map(p => ({ ...p, cx: px(p.x), cy: py(p.y), r: Math.sqrt(p.d.projects / max) * fontSize * 1.65 }));
    const boxes = points.map(p => ({ x: p.cx - p.r - 3, y: p.cy - p.r - 3, w: p.r * 2 + 6, h: p.r * 2 + 6 }));
    LENSES[lens].quads.forEach((name,i)=>{const w=[...name].length*fontSize*.9+fontSize;boxes.push({x:i%2?right-w:left,y:i<2?top:bottom-fontSize*1.8,w,h:fontSize*1.8});});
    const overlap = (a: typeof boxes[number], b: typeof boxes[number]) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const seats = new Map<string, {
        x: number;
        y: number;
    }>();
    [...points].sort((a, b) => b.r - a.r).forEach(p => {
        if (p.cx < left || p.cx > right || p.cy < top || p.cy > bottom) return;
        const w = [...p.d.node.name].reduce((s, c) => s + (/[\u3400-\u9fff]/.test(c) ? fontSize : fontSize * .58), 0), gap=fontSize*.65;
        const opts = [{ x: p.cx + p.r + gap, y: p.cy - fontSize*.6 }, { x: p.cx - p.r - w - gap, y: p.cy - fontSize*.6 }, { x: p.cx - w / 2, y: p.cy - p.r - fontSize*1.8 }, { x: p.cx - w / 2, y: p.cy + p.r + gap }, { x: p.cx - w / 2, y: p.cy - p.r - fontSize*3.2 }, { x: p.cx - w / 2, y: p.cy + p.r + fontSize*2 }].map(b => ({ ...b, x: Math.max(left, Math.min(right - w, b.x)), w, h: fontSize*1.3 }));
        const cost = (b: typeof boxes[number]) => boxes.reduce((s, a) => s + overlap(a, {x:b.x-4,y:b.y-4,w:b.w+8,h:b.h+8}), 0) + (b.y < top + fontSize*1.5 || b.y > bottom - fontSize*1.3 ? 10000 : 0);
        opts.sort((a, b) => cost(a) - cost(b));
        if (cost(opts[0]) > 0) return;
        boxes.push(opts[0]);
        seats.set(p.d.node.id, { x: opts[0].x + w / 2, y: opts[0].y + fontSize });
    });
    return { points, missing: measured.filter(p => p.value.reason !== undefined), px, py, mx, my, medianX:px(mx||1),medianY:py(my), xr, yr, seats, left, right, top, bottom };
}
export const atlasQuery = { queryKey: ["domains", "atlas"], staleTime: 60000,
    queryFn: async ({ signal }: {
        signal: AbortSignal;
    }): Promise<AtlasData> => {
        const r = await fetch("/api/domains/atlas", { signal });
        if (!r.ok)
            throw new Error((await r.json().catch(() => null))?.detail ?? "领域记录暂不可读");
        return r.json();
    } };
