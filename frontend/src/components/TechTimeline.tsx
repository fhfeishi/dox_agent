import { useState } from "react";
import { CATEGORY_COLORS, MATURITY_COLORS, type Lineage } from "../projects";
import { ZoomPan } from "./ZoomPan";

/** One row per project: the highest level its techniques in this branch reached. */
type Row = { id: string; name: string; projectId: string; title: string; start: number; end: number; level: number; basis: string; group: string; count: number };

// Up to DENSE projects every bar carries its project name; beyond that the year grid shows numbers.
const W = 760, LEFT = 140, RIGHT = 16, TOP = 26, DENSE = 24, LANE = 20;

/**
 * 项目周期与报告所述验证阶段 (query 2026-1009 1111, wording per 1627): x = each project's years,
 * band = the stage its report describes at completion. A bar spans the whole project period but
 * the stage is its end state, not the level in each year, so no "first reached" curve is drawn:
 * reports give no event dates. Every bar or cell opens its project.
 */
export function TechTimeline({ lineage, itemIds, projects, groupOf, onOpen }: {
  lineage: Lineage; itemIds: string[];
  projects: Map<string, { title: string; start: number | null; end: number | null }>;
  groupOf: (itemId: string) => string; onOpen: (projectId: string) => void;
}) {
  const [cell, setCell] = useState<{ year: number; level: number } | null>(null);
  const levels = lineage.maturity_levels;
  const byProject = new Map<string, Row>();
  let undated = 0;
  for (const id of itemIds) {
    const item = lineage.items[id];
    const project = item && projects.get(item.project_id);
    if (!item || !project?.start) { undated += 1; continue; }
    const row = byProject.get(item.project_id);
    if (!row) {
      byProject.set(item.project_id, { id, name: item.name, projectId: item.project_id, title: project.title, start: project.start,
        end: Math.max(project.start, project.end ?? project.start), level: item.maturity, basis: item.basis, group: groupOf(id), count: 1 });
    } else {
      row.count += 1;
      if (item.maturity > row.level) Object.assign(row, { id, name: item.name, level: item.maturity, basis: item.basis, group: groupOf(id) });
      else row.name = row.level === item.maturity ? `${row.name}、${item.name}` : row.name;
    }
  }
  const rows = [...byProject.values()];
  if (!rows.length) return <p className="text-xs text-[var(--stone)]">该分支没有立项年份明确的项目，无法绘制项目周期图。</p>;

  const y0 = Math.min(...rows.map((r) => r.start)), y1 = Math.max(...rows.map((r) => r.end));
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  const x = (year: number) => LEFT + ((year - y0) / (y1 + 1 - y0)) * (W - LEFT - RIGHT);
  const groups = [...new Set(rows.map((r) => r.group))];
  const color = (group: string) => CATEGORY_COLORS[groups.indexOf(group) % CATEGORY_COLORS.length];
  const dense = rows.length > DENSE;

  // Bands from level 5 (top) to 0 (bottom); bars are packed into lanes so none overlap.
  const bands: { level: number; top: number; height: number; lanes: Map<string, number> }[] = [];
  let cursor = TOP;
  for (const level of [5, 4, 3, 2, 1, 0]) {
    const lanes = new Map<string, number>();
    const ends: number[] = [];
    for (const row of rows.filter((r) => r.level === level).sort((a, b) => a.start - b.start || a.end - b.end)) {
      const lane = ends.findIndex((end) => end < row.start);
      const index = lane < 0 ? ends.length : lane;
      ends[index] = row.end;
      lanes.set(row.id, index);
    }
    const height = dense ? 34 : Math.max(30, ends.length * LANE + 10);
    bands.push({ level, top: cursor, height, lanes });
    cursor += height;
  }
  const H = cursor + 24;
  const band = (level: number) => bands.find((b) => b.level === level)!;

  const active = (year: number, level: number) => rows.filter((r) => r.level === level && r.start <= year && year <= r.end);
  const maxCell = dense ? Math.max(1, ...years.flatMap((year) => [0, 1, 2, 3, 4, 5].map((l) => active(year, l).length))) : 1;
  const top = Math.max(...rows.map((r) => r.level));
  const picked = cell ? active(cell.year, cell.level) : [];

  return <div>
    <p className="text-xs text-[var(--steel)]">
      最早立项 <b>{y0}</b> · 最近结题 <b>{y1}</b> · {rows.length} 个项目、{itemIds.length - undated} 个技术条目 ·
      本分支已有项目报告达到 <b style={{ color: MATURITY_COLORS[top] }}>{levels[top]}</b>{undated ? ` · ${undated} 条无项目年份未画出` : ""}
    </p>
    <div className="mt-2">
      <ZoomPan width={W} height={H} label="项目周期图窗口" minHeight={300} minFit={0.5}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="项目周期与验证阶段图">
        {years.map((year) => <g key={year}>
          <line x1={x(year)} x2={x(year)} y1={TOP} y2={cursor} stroke="#e6e8ee" />
          <text x={(x(year) + x(year + 1)) / 2} y={TOP - 9} textAnchor="middle" fontSize={12.5} fill="#4b5563">{year}</text>
        </g>)}
        {bands.map((b) => <g key={b.level}>
          <rect x={LEFT} y={b.top} width={W - LEFT - RIGHT} height={b.height} fill={b.level % 2 ? "#fafafb" : "#f3f4f7"} />
          <text x={LEFT - 8} y={b.top + b.height / 2 + 4} textAnchor="end" fontSize={12.5} fill={MATURITY_COLORS[b.level]} fontWeight={600}>
            {b.level ? `${b.level} ${levels[b.level]}` : levels[0]}</text>
        </g>)}
        {dense ? bands.flatMap((b) => years.map((year) => {
          const n = active(year, b.level).length;
          if (!n) return null;
          const on = cell?.year === year && cell.level === b.level;
          return <g key={`${b.level}-${year}`} className="cursor-pointer" onClick={() => setCell(on ? null : { year, level: b.level })}>
            <title>{`${year} · ${levels[b.level]} · ${n} 个项目在研`}</title>
            <rect x={x(year) + 2} y={b.top + 3} width={x(year + 1) - x(year) - 4} height={b.height - 6} rx={4}
              fill={MATURITY_COLORS[b.level]} fillOpacity={0.15 + 0.85 * n / maxCell} stroke={on ? "#111" : "none"} />
            <text x={(x(year) + x(year + 1)) / 2} y={b.top + b.height / 2 + 4} textAnchor="middle" fontSize={12.5} fill="#1f2937">{n}</text>
          </g>;
        })) : rows.map((row) => {
          const b = band(row.level);
          return <g key={row.id} className="cursor-pointer" onClick={() => onOpen(row.projectId)}>
            <title>{`${row.title}（${row.start}–${row.end}）\n${row.name} · ${levels[row.level]}${row.basis ? `\n依据：${row.basis}` : ""}${row.count > 1 ? `\n本分支共 ${row.count} 个技术条目` : ""}`}</title>
            <rect x={x(row.start) + 2} y={b.top + 5 + (b.lanes.get(row.id) ?? 0) * LANE} width={x(row.end + 1) - x(row.start) - 4} height={15} rx={4}
              fill={color(row.group)} fillOpacity={0.85} />
            {(() => {
              // Every bar is named: inside when it fits a few characters, otherwise just after its end.
              const room = Math.floor((x(row.end + 1) - x(row.start) - 14) / 11.5);
              const inside = room >= 4;
              const label = inside ? (row.title.length > room ? row.title.slice(0, room - 1) + "…" : row.title)
                : row.title.slice(0, Math.max(4, Math.floor((W - RIGHT - x(row.end + 1)) / 11.5) - 1)) + (row.title.length > 12 ? "…" : "");
              return <text x={inside ? x(row.start) + 8 : x(row.end + 1) + 2} y={b.top + 16 + (b.lanes.get(row.id) ?? 0) * LANE}
                fontSize={11.5} fill={inside ? "#fff" : "#374151"} fontWeight={600}>{label}</text>;
            })()}
          </g>;
        })}
        <text x={LEFT} y={H - 6} fontSize={12} fill="#4b5563">{dense ? "格内数字：当年在研、且结题报告所述为该阶段的项目数；点击查看" : "每条横条是一个项目，长度为起止年，所在行是其结题报告所述阶段；点击打开"}</text>
      </svg>
      </ZoomPan>
    </div>
    {!dense && groups.length > 1 ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--steel)]">
      {groups.map((g) => <span key={g} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: color(g) }} />{g}</span>)}
    </div> : null}
    {picked.length ? <div className="mt-2 rounded-lg border border-[var(--hairline)] p-3 text-xs">
      <p className="font-semibold">{cell!.year} 年 · {levels[cell!.level]} · {picked.length} 个项目</p>
      <ul className="mt-1 max-h-[200px] space-y-1 overflow-y-auto">{picked.map((r) => <li key={r.id}>
        <button type="button" onClick={() => onOpen(r.projectId)} className="text-left text-[var(--link)] hover:underline">{r.title}</button>
        <span className="text-[var(--stone)]"> · {r.name}（{r.start}–{r.end}）</span></li>)}</ul>
    </div> : null}
    <p className="mt-2 text-xs leading-5 text-[var(--stone)]">阶段由模型依据各项目报告中的技术说明和已取得成果判定，计划和预期工作不计；它表示项目结题时报告所述的程度，不是每一年的水平，也不是正式的技术成熟度评定。报告中没有试验、部署等事件的日期，因此不推断某一年取得突破。点击项目可核对原文。</p>
  </div>;
}
