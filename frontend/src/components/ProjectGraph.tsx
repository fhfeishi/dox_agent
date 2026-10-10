import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CATEGORY_COLORS, FACET_COLORS, hierarchyQuery, lineageQuery, locateItem, type Project } from "../projects";
import { Button } from "./ui";
import { buildSectors, type Sector } from "../departments";

const SIZE = 1000;
const C = SIZE / 2;
const R0 = 130;
const RMAX = 415;
const LINKS = 12;

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

/** Projects placed by NSFC department and application code (angle) and start year (ring); links show shared topics. */
/** Relation types a project pair can share. 成果 is deliberately absent: two projects both having,
 * say, a prototype or papers does not relate them, and outcomes are nearly unique per project. */
const RELATIONS = {
  场景: { color: FACET_COLORS[0], note: "同属一个场景类别：应用对象相近，可横向比较。" },
  问题: { color: FACET_COLORS[1], note: "同属一个核心问题：面对同一类困难，可能互补或竞争。" },
  技术: { color: FACET_COLORS[2], note: "共用技术路线或同名技术条目：方法可相互借鉴。" },
} as const;
type Relation = keyof typeof RELATIONS;

export function ProjectGraph({ corpusId, projects, title, onOpen }: {
  corpusId: string; projects: Project[]; title: string; onOpen: (projectId: string) => void;
}) {
  const hierarchy = useQuery(hierarchyQuery(corpusId)).data;
  const lineage = useQuery(lineageQuery(corpusId)).data;
  const [year, setYear] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [relation, setRelation] = useState<Relation>("问题");
  // Graded relations by description similarity (server, local embeddings, cached per library).
  const similarity = useQuery({
    queryKey: ["library", corpusId, "relations", relation], retry: false, staleTime: Infinity,
    queryFn: async ({ signal }): Promise<{ threshold: number | null; degree: Record<string, number>; edges: Record<string, [string, number][]> }> => {
      const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/relations?dimension=${encodeURIComponent(relation)}`, { signal });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "相似关联计算失败");
      return response.json();
    },
  });
  const graded = similarity.data;
  const color = RELATIONS[relation].color;
  const dated = projects.filter((p) => p.start_year !== null);
  const undated = projects.length - dated.length;

  const layout = useMemo(() => {
    // Every department with projects keeps a sector; only large ones are split by code.
    const built = buildSectors(dated.map((p) => p.code));
    const sectors = built.sectors;
    const keyOf = (p: Project) => built.keyOf(p.code);
    const years = [...new Set(dated.map((p) => p.start_year!))].sort((a, b) => a - b);
    const ring = (y: number) => years.length < 2 ? (R0 + RMAX) / 2 : R0 + ((RMAX - R0) * years.indexOf(y)) / (years.length - 1);
    const band = years.length < 2 ? 60 : (RMAX - R0) / (years.length - 1);
    // Sector width follows project count (square-root damped) so a dominant code is not crushed.
    const weights = sectors.map((sector) => Math.sqrt(sector.count));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const spans = weights.map((w) => Math.max(18, (360 * w) / total));
    const scale = 360 / spans.reduce((a, b) => a + b, 0);
    const starts: number[] = [];
    spans.forEach((value, i) => { spans[i] = value * scale; starts.push(i ? starts[i - 1] + spans[i - 1] : 0); });
    const points = new Map<string, { x: number; y: number; r: number; sector: Sector }>();
    sectors.forEach((sector, si) => {
      for (const y of years) {
        const cell = dated.filter((p) => keyOf(p) === sector.key && p.start_year === y).sort((a, b) => a.number.localeCompare(b.number));
        if (!cell.length) continue;
        const r = ring(y);
        // Dots spread along the sector arc; a crowded cell stacks rows that stay inside its own
        // year band, and dots shrink rather than overlap a neighbouring year.
        const span = spans[si];
        const arc = ((span - 8) * Math.PI * r) / 180;
        const perRow = Math.max(1, Math.floor(arc / 9));
        const rows = Math.ceil(cell.length / perRow);
        const gap = Math.min(10, (band - 4) / rows);
        const dot = Math.max(1.6, Math.min(4.5, gap / 2.3, arc / Math.min(cell.length, perRow) / 2.3));
        cell.forEach((p, i) => {
          const row = Math.floor(i / perRow);
          const inRow = Math.min(perRow, cell.length - row * perRow);
          const deg = starts[si] + 4 + ((i % perRow) + 0.5) * ((span - 8) / inRow);
          const [x, yy] = polar(r + (row - (rows - 1) / 2) * gap, deg);
          points.set(p.project_id, { x, y: yy, r: dot, sector });
        });
      }
    });
    return { sectors, departments: built.departments, years, ring, spans, starts, points, keyOf };
  }, [dated]);

  const focus = dated.find((p) => p.project_id === selected) ?? null;
  // Groups per relation type: hierarchy categories, plus same-named technical topics for 技术.
  const groups = useMemo(() => {
    const byType: Record<Relation, Map<string, Set<string>>> = { 场景: new Map(), 问题: new Map(), 技术: new Map() };
    const add = (type: Relation, name: string, id: string) => byType[type].set(name, (byType[type].get(name) ?? new Set()).add(id));
    for (const scene of hierarchy?.state === "missing" ? [] : hierarchy?.scenes ?? []) {
      for (const id of scene.project_ids) add("场景", scene.name, id);
      for (const issue of scene.issues) {
        for (const id of issue.project_ids) add("问题", issue.name, id);
        for (const route of issue.routes) for (const id of route.project_ids) add("技术", route.title, id);
      }
    }
    for (const p of dated) for (const item of p.facets["技术"].items) add("技术", item.name, p.project_id);
    return byType;
  }, [hierarchy, dated]);
  const memberOf = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [name, ids] of groups[relation]) if (ids.size > 1) for (const id of ids) out.set(id, [...(out.get(id) ?? []), name]);
    return out;
  }, [groups, relation]);
  // Degree = distinct projects sharing at least one group of the current type; drives colour depth.
  const degree = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of dated) {
      const peers = new Set<string>();
      for (const name of memberOf.get(p.project_id) ?? []) for (const id of groups[relation].get(name) ?? []) if (id !== p.project_id) peers.add(id);
      out.set(p.project_id, peers.size);
    }
    return out;
  }, [dated, memberOf, groups, relation]);
  // Hue = the project's category under the current relation (scene, core issue, or lineage
  // system for 技术); depth = how many projects it relates to. Uncategorised projects stay grey.
  const categories = useMemo(() => {
    const of = new Map<string, string>();
    for (const scene of hierarchy?.state === "missing" ? [] : hierarchy?.scenes ?? []) {
      if (relation === "场景") for (const id of scene.project_ids) if (!of.has(id)) of.set(id, scene.name);
      for (const issue of scene.issues) {
        if (relation === "问题") for (const id of issue.project_ids) if (!of.has(id)) of.set(id, issue.name);
      }
    }
    // 技术: each project takes the lineage system of its first placed technique item.
    if (relation === "技术") for (const [itemId, item] of Object.entries(lineage?.items ?? {})) {
      const at = locateItem(lineage, itemId);
      if (at && !at.category.unplaced && !of.has(item.project_id)) of.set(item.project_id, at.category.name);
    }
    const names = [...new Set(of.values())];
    const hue = new Map(names.map((name, i) => [name, names.length <= CATEGORY_COLORS.length
      ? CATEGORY_COLORS[i] : `hsl(${Math.round(i * 360 / names.length)} 62% 48%)`]));
    return { of, hue, names };
  }, [hierarchy, lineage, relation]);
  const hueOf = (id: string) => categories.hue.get(categories.of.get(id) ?? "") ?? "#9aa3b5";
  const degreeOf = (id: string) => graded ? graded.degree[id] ?? 0 : degree.get(id) ?? 0;
  const maxDegree = Math.max(1, ...dated.map((p) => degreeOf(p.project_id)));
  const depth = (id: string) => { const d = degreeOf(id); return d ? 0.28 + 0.72 * Math.sqrt(d / maxDegree) : 0.1; };
  const related = useMemo((): { project: Project; shared: string[]; similarity?: number }[] => {
    if (!focus) return [];
    const mine = new Set(memberOf.get(focus.project_id) ?? []);
    if (graded) {
      const byId = new Map(dated.map((p) => [p.project_id, p]));
      return (graded.edges[focus.project_id] ?? []).filter(([id]) => byId.has(id)).map(([id, sim]) => ({
        project: byId.get(id)!, similarity: sim, shared: (memberOf.get(id) ?? []).filter((n) => mine.has(n)) }));
    }
    return dated.filter((p) => p.project_id !== focus.project_id)
      .map((p) => ({ project: p, shared: (memberOf.get(p.project_id) ?? []).filter((n) => mine.has(n)) }))
      .filter((row) => row.shared.length)
      .sort((a, b) => b.shared.length - a.shared.length || a.project.title.localeCompare(b.project.title));
  }, [focus, dated, memberOf, graded]);
  const linked = new Set(related.slice(0, LINKS).map((row) => row.project.project_id));
  const dim = (p: Project) => (year !== null && p.start_year !== year) || (focus && p.project_id !== focus.project_id && !linked.has(p.project_id));

  if (!dated.length) return <p className="rounded-xl border border-dashed p-5 text-sm text-[var(--steel)]">当前范围没有立项年份明确的项目，无法绘制关系图。</p>;
  return (
    <section aria-label="项目关系图" className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-4 py-3 text-sm">
        <b>项目关系图 · 申请代码 × 立项年份</b>
        <span className="flex-1" />
        <span className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-xs text-[var(--steel)]">角度 = 申请代码</span>
        <span className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-xs text-[var(--steel)]">半径 = 立项年份</span>
        <span className="text-xs text-[var(--steel)]">关联依据</span>
        <div role="group" aria-label="关联依据" className="flex gap-1">
          {(Object.keys(RELATIONS) as Relation[]).map((key) => <button key={key} type="button" aria-pressed={relation === key} onClick={() => setRelation(key)}
            className="rounded-full border px-3 py-0.5 text-xs" style={{ borderColor: RELATIONS[key].color, color: relation === key ? "#fff" : RELATIONS[key].color, background: relation === key ? RELATIONS[key].color : "transparent" }}>{key}</button>)}
        </div>
      </div>
      <div className="flex flex-col md:flex-row">
        <aside className="shrink-0 border-b border-[var(--hairline)] p-4 md:w-[150px] md:border-r md:border-b-0">
          <p className="text-[10.5px] font-bold tracking-[2px] text-[var(--stone)]">立项年份</p>
          <div className="mt-2 flex flex-wrap gap-1 md:flex-col">
            {layout.years.map((y) => (
              <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(year === y ? null : y)}
                className={`flex justify-between gap-3 rounded-lg border px-2 py-1 text-xs ${year === y ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold" : "border-[var(--hairline)]"}`}>
                <span>{y}</span><span className="text-[var(--steel)]">{dated.filter((p) => p.start_year === y).length} 个</span>
              </button>
            ))}
          </div>
          {undated ? <p className="mt-3 text-[11px] text-[var(--steel)]">另有 {undated} 个项目立项年待核对，未绘入。</p> : null}
          <p className="mt-3 text-[11px] leading-5 text-[var(--steel)]">{RELATIONS[relation].note}</p>
          <p className="mt-2 text-[11px] leading-5 text-[var(--steel)]">{graded
            ? `按各项目${relation}描述的语义相似度关联（相似度 ≥ ${graded.threshold}），并非仅看同名条目。`
            : similarity.isPending ? `正在计算${relation}相似关联，首次约需数分钟；暂按四维层级类别显示。`
              : `未能计算相似关联（${(similarity.error as Error | null)?.message ?? ""}），暂按四维层级类别显示。`}</p>
          <p className="mt-2 text-[11px] leading-5 text-[var(--stone)]">颜色越深，关联项目越多。成果不作关联依据：同有样机或论文不说明项目相关。关联只表示有同类描述，不判断继承或重复立项。</p>
          {!hierarchy?.scenes?.length ? <p className="mt-2 text-[11px] text-[#8a6a00]">尚未生成四维层级，场景、问题关联不可用，技术仅按同名条目。</p> : null}
        </aside>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <svg viewBox={`-110 0 ${SIZE + 220} ${SIZE}`} role="img" aria-label={`${title}项目关系图，${dated.length} 个项目`} className="mx-auto block w-full min-w-[560px] max-w-[1000px]">
            {layout.sectors.map((sector, i) => {
              const [x1, y1] = polar(R0 - 30, layout.starts[i]);
              const [x2, y2] = polar(RMAX + 22, layout.starts[i]);
              const mid = layout.starts[i] + layout.spans[i] / 2;
              const [lx, ly] = polar(RMAX + 36, mid);
              const anchor = Math.abs(lx - C) < 60 ? "middle" : lx > C ? "start" : "end";
              // A department boundary is drawn heavier than a code boundary inside a department.
              const deptStart = i === 0 || layout.sectors[i - 1].dept !== sector.dept;
              return <g key={sector.key}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={deptStart ? "#b9c0d0" : "#e8ebf2"} strokeWidth={deptStart ? 2.6 : 1.2} />
                <text x={lx} y={ly - 7} textAnchor={anchor} fontSize={13} fontWeight={700} fill={sector.color}>{sector.label}</text>
                <text x={lx} y={ly + 11} textAnchor={anchor} fontSize={11} fill="#8a90a6">{sector.count} 个项目</text>
              </g>;
            })}
            {layout.years.map((y) => {
              const r = layout.ring(y);
              return <g key={y} opacity={year !== null && year !== y ? 0.25 : 1}>
                <circle cx={C} cy={C} r={r} fill="none" stroke="#d7dcea" strokeWidth={1.4} strokeDasharray="6 8" />
                {/* Year tags sit on the top sector boundary, where no dots are drawn. */}
                <rect x={C - 22} y={C - r - 9} width={44} height={18} rx={9} fill="#fff" stroke="#d7dcea" />
                <text x={C} y={C - r + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#5a6278">{y}</text>
              </g>;
            })}
            {focus ? related.slice(0, LINKS).map((row) => {
              const a = layout.points.get(focus.project_id)!; const b = layout.points.get(row.project.project_id);
              if (!b) return null;
              return <path key={row.project.project_id} d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 * 0.8 + C * 0.2} ${(a.y + b.y) / 2 * 0.8 + C * 0.2} ${b.x} ${b.y}`}
                fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={row.similarity ? 1 + 6 * Math.max(0, row.similarity - (graded?.threshold ?? 0.6)) / 0.3 : 1 + Math.min(3, row.shared.length)} />;
            }) : null}
            <circle cx={C} cy={C} r={62} fill="url(#hub)" />
            <defs><linearGradient id="hub" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f46e5" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs>
            <text x={C} y={C - 6} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff">{title.replace(/^自然科学基金-/, "")}</text>
            <text x={C} y={C + 16} textAnchor="middle" fontSize={11} fill="#e5e3ff">{dated.length} 个项目</text>
            {dated.map((p) => {
              const point = layout.points.get(p.project_id);
              if (!point) return null;
              const active = focus?.project_id === p.project_id;
              return <g key={p.project_id} role="button" tabIndex={0} aria-label={`${p.title}，${p.start_year}，${p.code || "代码未知"}`}
                onClick={() => setSelected(active ? null : p.project_id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(active ? null : p.project_id); } }}
                opacity={dim(p) ? 0.15 : 1} className="cursor-pointer outline-none" data-degree={degreeOf(p.project_id)}>
                <title>{`${p.title} · ${p.number} · ${p.start_year} · ${categories.of.get(p.project_id) ?? `未归入${relation}类别`} · ${relation}关联 ${degreeOf(p.project_id)} 个项目`}</title>
                <circle cx={point.x} cy={point.y} r={active ? 8 : linked.has(p.project_id) ? Math.max(5, point.r) : point.r} fill={active ? "#fff" : hueOf(p.project_id)} fillOpacity={active ? 1 : depth(p.project_id)}
                  stroke={active ? hueOf(p.project_id) : (degreeOf(p.project_id) ? "#fff" : "#cbd2df")} strokeWidth={active ? 3 : 1} />
              </g>;
            })}
            {focus ? (() => {
              const point = layout.points.get(focus.project_id)!;
              const label = focus.title.length > 16 ? focus.title.slice(0, 16) + "…" : focus.title;
              const w = label.length * 13 + 24;
              const x = Math.min(SIZE - w - 4, Math.max(4, point.x - w / 2));
              return <g pointerEvents="none"><rect x={x} y={point.y - 40} width={w} height={26} rx={8} fill="#fff" stroke={point.sector.color} />
                <text x={x + w / 2} y={point.y - 22} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#151827">{label}</text></g>;
            })() : null}
          </svg>
        </div>
        {focus ? (
          <aside aria-label="项目关系详情" className="shrink-0 border-t border-[var(--hairline)] p-4 text-sm md:w-[300px] md:border-t-0 md:border-l">
            <div className="flex items-start gap-2"><b className="flex-1 leading-6">{focus.title}</b>
              <button type="button" aria-label="关闭项目关系详情" onClick={() => setSelected(null)} className="text-[var(--steel)]">✕</button></div>
            <dl className="mt-2 grid grid-cols-[64px_1fr] gap-y-1 text-xs">
              <dt className="text-[var(--steel)]">批准号</dt><dd>{focus.number}</dd>
              <dt className="text-[var(--steel)]">申请代码</dt><dd>{focus.code || "原文未注明"}</dd>
              <dt className="text-[var(--steel)]">起止年</dt><dd>{focus.start_year}{focus.end_year ? "–" + focus.end_year : ""}</dd>
              {focus.admin ? <><dt className="text-[var(--steel)]">负责人</dt><dd>{focus.admin}</dd></> : null}
              {focus.unit ? <><dt className="text-[var(--steel)]">依托单位</dt><dd>{focus.unit}</dd></> : null}
            </dl>
            <Button size="sm" className="mt-3" onClick={() => onOpen(focus.project_id)}>查看项目详情与原文</Button>
            {memberOf.get(focus.project_id)?.length ? <p className="mt-3 text-xs">所属{relation === "技术" ? "技术" : relation}：{memberOf.get(focus.project_id)!.slice(0, 6).join("、")}</p> : null}
            <p className="mt-4 text-xs font-semibold text-[var(--steel)]">{relation}关联项目 · {graded ? degreeOf(focus.project_id) : related.length}{(graded ? degreeOf(focus.project_id) : related.length) > LINKS ? `（列出并连线最相近 ${LINKS} 个）` : ""}</p>
            {!related.length ? <p className="mt-2 text-xs text-[var(--stone)]">当前范围内没有与该项目{RELATIONS[relation].note.split("：")[0]}的项目，可切换关联依据。</p> : null}
            <div className="mt-2 max-h-[360px] space-y-2 overflow-y-auto">
              {related.slice(0, 30).map((row) => (
                <button key={row.project.project_id} type="button" onClick={() => setSelected(row.project.project_id)}
                  className="block w-full rounded-lg border border-[var(--hairline)] p-2 text-left text-xs hover:border-[var(--primary)]">
                  <b className="block text-[12.5px]">{row.project.title}</b>
                  <span className="text-[var(--steel)]">{row.project.start_year} · {[
                    row.similarity !== undefined ? `${relation}相似度 ${Math.round(row.similarity * 100)}%` : "",
                    row.shared.length ? `共同${relation}：${row.shared.slice(0, 3).join("、")}${row.shared.length > 3 ? ` 等 ${row.shared.length} 项` : ""}` : "",
                  ].filter(Boolean).join("；")}</span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] px-4 py-2 text-xs text-[var(--steel)]">
        <span className="flex items-center gap-2" aria-label="颜色深浅图例">颜色深浅：关联少
          <span className="inline-block h-2.5 w-24 rounded-full" style={{ background: "linear-gradient(90deg, #6b728026, #6b7280)" }} />关联多（最多 {maxDegree} 个）</span>
        <span className="mx-1 h-3 w-px bg-[var(--hairline-strong)]" />扇区按学部（大学部再按申请代码细分）：
        {layout.departments.map((d) => (
          <span key={d.dept} className="flex items-center gap-1" title={d.codes.length ? `申请代码：${d.codes.join("、")}` : undefined}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name} {d.count}
            {d.name === "代码待核对" ? `（${d.codes.join("、")}，不属于已知学部字母，请核对原文）` : ""}</span>
        ))}
      </div>
      <div aria-label="颜色类别图例" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--hairline)] px-4 py-2 text-xs text-[var(--steel)]">
        <span>颜色 = {relation === "技术" ? "技术谱系体系" : relation === "场景" ? "场景类别" : "核心问题"}：</span>
        {categories.names.map((name) => <span key={name} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: categories.hue.get(name) }} />{name}</span>)}
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#9aa3b5" }} />未归入类别</span>
      </div>
    </section>
  );
}
