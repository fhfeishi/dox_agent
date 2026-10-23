import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";
import { downloadText } from "../../exportFormat";
import { useApp } from "../../store";
import type { Domain, DomainsOverview } from "../../domains";
import { Hint } from "../Hint";
import { SlideOver } from "../SlideOver";

/**
 * 03 缺口与机会 (query 2026-1021 1629, 2026-1022 1606 / 1706, after the 研究地形图 demo).
 *
 * Left, 哪里有缺口: three tabs — 空白技术 (the lineage review found no project covering it), 待解问题
 * (a scene problem not yet solved), 未覆盖组合 (a system the domain uses in three or more scenes, missing
 * from this one) — with a distribution bar; each row opens to say why it is a gap and offers 加入候选池,
 * 在 01 定位 and 在 02 谱系中看; chips below narrow the tab to one library.
 * Right, 下一步可以先做什么: the tab's openings on two counted axes — 已有基础 (projects in the library
 * that already work on it) and 影响面 (projects in the scene it would serve) — as a quadrant or a ranked
 * list; a click puts it in the 候选池, whose two buttons open the export and proposal previews.
 * The pool is kept in this browser only.
 */
type Kind = "blank" | "issue" | "combo";
export type Opportunity = { key: string; kind: Kind; domain: string; domainId: string; title: string; detail: string; basis: string;
  base: number; reach: number; system?: string };
const KINDS: { key: Kind; label: string; reads: string; first: string }[] = [
  { key: "blank", label: "空白技术", reads: "谱系核对出、本库还没有项目覆盖",
    first: "先核对资料库里确实没有相关项目，再选一个已有场景做小规模引入验证" },
  { key: "issue", label: "待解问题", reads: "场景里尚未解决的问题",
    first: "梳理该场景已有项目对这个问题的尝试和未解原因，定出可验证的指标" },
  { key: "combo", label: "未覆盖组合", reads: "3 个以上场景用过、唯独这里没用的体系",
    first: "选一个已在其他场景用这个体系的项目，做向本场景的方法迁移试验" },
];
const STORE = "dox.atlas.opportunities";
const MAX_PROPOSAL = 8;

function load(): Opportunity[] {
  try { return (JSON.parse(localStorage.getItem(STORE) || "[]") as Opportunity[]).filter((o) => o.basis !== undefined && o.domainId !== undefined); } catch { return []; }
}

export function proposalQuestion(list: Opportunity[], note: string) {
  const lines = list.slice(0, MAX_PROPOSAL).map((o, i) =>
    `${i + 1}. 【${o.domain} · ${KINDS.find((k) => k.key === o.kind)!.label}】${o.title}${o.detail ? `——${o.detail}` : ""}`);
  return ["请基于资料库中的已有项目与技术，为下列机会逐条给出立项建议：研究目标、可依托的已有基础（列出相关项目）、需要补上的关键技术、预期成果与主要风险；区分资料依据与研判意见，资料不足的地方直接说明。",
    ...lines, note.trim() ? `补充要求：${note.trim()}` : ""].filter(Boolean).join("\n");
}

function opportunities(domain: Domain): Record<Kind, Opportunity[]> {
  const scene = (name: string) => domain.scenes.find((s) => s.name === name);
  const systemProjects = (name: string) => domain.systems.find((s) => s.name === name)?.projects ?? 0;
  return {
    blank: domain.blanks.map((b) => ({ key: `blank:${domain.id}:${b.name}`, kind: "blank", domain: domain.name, domainId: domain.id, title: b.name,
      detail: b.reason || b.plain, basis: `本库 ${domain.projects} 个项目都没有覆盖这项技术（谱系核对结果）`, base: 0, reach: domain.projects })),
    issue: domain.open_issues.map((i) => {
      const s = scene(i.scene);
      return { key: `issue:${domain.id}:${i.scene}:${i.name}`, kind: "issue" as const, domain: domain.name, domainId: domain.id, title: i.name,
        detail: `${i.scene}${i.state ? ` · ${i.state}` : ""}${i.summary ? `：${i.summary}` : ""}`,
        basis: s ? `场景「${s.name}」已有 ${s.projects} 个项目，其中 ${i.projects} 个写到了这个问题${s.systems.length ? `；用到 ${s.systems.slice(0, 3).join("、")}${s.systems.length > 3 ? " 等" : ""}` : ""}` : `所在场景「${i.scene}」`,
        base: i.projects, reach: s?.projects ?? 0 };
    }),
    combo: domain.combos.map((c) => {
      const users = domain.scenes.filter((s) => s.systems.includes(c.system)).map((s) => s.name);
      return { key: `combo:${domain.id}:${c.scene}:${c.system}`, kind: "combo" as const, domain: domain.name, domainId: domain.id, title: `${c.scene} × ${c.system}`,
        detail: `该体系已用于 ${c.used_in}/${c.scenes} 个场景，这个场景还没有`, system: c.system,
        basis: `「${c.system}」已有 ${systemProjects(c.system)} 个项目在用，分布在：${users.slice(0, 4).join("、")}${users.length > 4 ? ` 等 ${users.length} 个场景` : ""}`,
        base: systemProjects(c.system), reach: scene(c.scene)?.projects ?? 0 };
    }),
  };
}

function asMarkdown(list: Opportunity[]) {
  return ["# 机会清单", "", ...KINDS.flatMap((k) => {
    const items = list.filter((o) => o.kind === k.key);
    return items.length ? [`## ${k.label}`, "", "| 领域 | 机会 | 说明 | 已有基础 |", "|---|---|---|---|",
      ...items.map((o) => `| ${o.domain} | ${o.title} | ${o.detail.replace(/\|/g, "／")} | ${o.basis.replace(/\|/g, "／")} |`), ""] : [];
  })].join("\n");
}
function asCsv(list: Opportunity[]) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ["类型,领域,机会,说明,已有基础", ...list.map((o) => [KINDS.find((k) => k.key === o.kind)!.label, o.domain, o.title, o.detail, o.basis].map(cell).join(","))].join("\n");
}
function proposalMarkdown(list: Opportunity[]) {
  return ["# 立项建议（草稿）", "", "由机会清单生成，尚未做可行性与经费评估。", "", ...list.flatMap((o, i) => [
    `## ${i + 1}. ${o.title}（${o.domain} · ${KINDS.find((k) => k.key === o.kind)!.label}）`, "",
    `- 已有基础：${o.basis}`, `- 缺口：${o.detail || o.title}`, `- 首步验证：${KINDS.find((k) => k.key === o.kind)!.first}`, ""])].join("\n");
}

const median = (values: number[]) => {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
};

/** "High" means above the median; when everything ties at the median, the median itself counts as high. */
function splitter(values: number[]) {
  const mid = median(values);
  const above = values.some((v) => v > mid);
  return { mid, high: (v: number) => (above ? v > mid : v >= mid && mid > 0) };
}

const QUADS = [
  { key: "lift", label: "补基础", note: "影响大、已有基础少：先补上基础再做", hiBase: false, hiReach: true },
  { key: "first", label: "先做", note: "影响大、已有基础多：优先投入", hiBase: true, hiReach: true },
  { key: "later", label: "暂缓", note: "影响小、已有基础少", hiBase: false, hiReach: false },
  { key: "easy", label: "顺手做", note: "影响小、已有基础多：成本低，可顺带推进", hiBase: true, hiReach: false },
] as const;

type Group = { key: string; base: number; reach: number; items: Opportunity[]; cx: number; cy: number; r: number };
export type DragHandlers = { start: (items: Opportunity[]) => void; move: (x: number, y: number) => void; end: (x: number, y: number) => boolean };

/**
 * 下一步可以先做什么 as a static four-quadrant chart, like 01 (query 2026-1022 1809, after the 研究地形图
 * demo): x = 已有基础, y = 影响面, both project counts on square-root scales, split at their medians.
 * Openings with the same two counts share one point that shows how many it holds — equal counts used
 * to stack dots on one spot. A point is clicked (one opening: into the pool; several: a list to pick
 * from) or dragged onto the 候选池.
 *
 * Points carry no names on the chart (query 2026-1023 1044: dots and their titles together were too
 * busy): a name shows on hover or focus, the quadrants keep their two-to-three-character names and
 * counts, and the axes say only what they measure; the full wording is in the hover card and 怎么读.
 */
function OppChart({ items, pool, onPick, onPickAll, drag }: {
  items: Opportunity[]; pool: Set<string>; onPick: (o: Opportunity) => void; onPickAll: (list: Opportunity[]) => void; drag: DragHandlers;
}) {
  // Drawn at the card's own size (one unit = one pixel), so it fills the space and text stays sharp.
  const [size, setSize] = useState({ w: 540, h: 380 });
  const W = size.w, H = size.h, L = 46, R = W - 12, T = 26, B = H - 34;
  const [hover, setHover] = useState<{ g: Group; left: number; top: number } | null>(null);
  const [menu, setMenu] = useState<{ g: Group; left: number; top: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) setSize({ w: Math.round(box.width), h: Math.round(box.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const press = useRef<{ g: Group; x: number; y: number; moved: boolean } | null>(null);
  const maxBase = Math.max(1, ...items.map((o) => o.base)), maxReach = Math.max(1, ...items.map((o) => o.reach));
  // 已有基础 is a handful of small whole numbers: one column per value reads better than a stretched axis.
  const columns = [...new Set(items.map((o) => o.base))].sort((a, b) => a - b);
  const colW = (R - L) / Math.max(1, columns.length);
  const sx = (v: number) => L + colW * (columns.indexOf(v) + 0.5);
  const sy = (v: number) => B - Math.sqrt(v / maxReach) * (B - T - 16) - 8;
  const base = splitter(items.map((o) => o.base)), reach = splitter(items.map((o) => o.reach));
  // The median lines sit between the highest "low" value and the lowest "high" one.
  const lowCols = columns.filter((v) => !base.high(v)).length;
  const cx = lowCols === 0 ? L : lowCols === columns.length ? R : L + colW * lowCols;
  const lows = items.map((o) => o.reach).filter((v) => !reach.high(v)), highs = items.map((o) => o.reach).filter(reach.high);
  const cy = !highs.length ? T : !lows.length ? B : (sy(Math.max(...lows)) + sy(Math.min(...highs))) / 2;
  const yTicks = [...new Set([0, maxReach])];

  const groups = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const o of items) map.set(`${o.base}|${o.reach}`, [...(map.get(`${o.base}|${o.reach}`) ?? []), o]);
    return [...map.entries()].map(([key, list]) => ({ key, base: list[0].base, reach: list[0].reach, items: list,
      cx: sx(list[0].base), cy: sy(list[0].reach), r: 7 + Math.sqrt(list.length) * 3.2 }))
      .sort((a, b) => (b.base / maxBase + b.reach / maxReach) - (a.base / maxBase + a.reach / maxReach));
  }, [items, W, H]); // eslint-disable-line react-hooks/exhaustive-deps
  // Within a column, points that would touch move sideways (a small swarm), never off their height.
  const placed = useMemo(() => {
    const done: Group[] = [];
    for (const g of [...groups].sort((a, b) => a.cy - b.cy)) {
      const home = g.cx, limit = colW / 2 - g.r - 2;
      let best = home;
      for (let step = 0; step < 40; step++) {
        const offset = Math.ceil(step / 2) * (g.r * 0.9) * (step % 2 ? 1 : -1);
        if (Math.abs(offset) > limit) break;
        const x = home + offset;
        if (!done.some((d) => Math.hypot(d.cx - x, d.cy - g.cy) < d.r + g.r + 2)) { best = x; break; }
        best = x;
      }
      done.push({ ...g, cx: best });
    }
    return done;
  }, [groups, colW]);

  const local = (event: { clientX: number; clientY: number }) => {
    const box = frame.current!.getBoundingClientRect();
    return { left: event.clientX - box.left, top: event.clientY - box.top, width: box.width };
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(event.clientX - p.x, event.clientY - p.y) < 6) return;
      if (!p.moved) { p.moved = true; setHover(null); setMenu(null); drag.start(p.g.items); }
      drag.move(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (p?.moved) drag.end(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!(event.target as Element).closest?.(".opp-menu, .opp-pt")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  function click(g: Group, event: { clientX: number; clientY: number }) {
    if (g.items.length === 1) { onPick(g.items[0]); return; }
    const at = local(event);
    setMenu({ g, left: Math.min(at.left, at.width - 280), top: at.top + 10 });
  }

  return <div ref={frame} className="opp-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="下一步可以先做什么：横轴已有基础，纵轴影响面">
      {QUADS.map((q) => {
        const x0 = q.hiBase ? cx : L, x1 = q.hiBase ? R : cx, y0 = q.hiReach ? T : cy, y1 = q.hiReach ? cy : B;
        const n = items.filter((o) => base.high(o.base) === q.hiBase && reach.high(o.reach) === q.hiReach).length;
        return <g key={q.key} className={`opp-quad is-${q.key}`}>
          <rect x={x0} y={y0} width={Math.max(0, x1 - x0)} height={Math.max(0, y1 - y0)} />
          <text x={q.hiBase ? x1 - 8 : x0 + 8} y={q.hiReach ? y0 + 17 : y1 - 8} textAnchor={q.hiBase ? "end" : "start"}>
            <title>{q.note}</title>{q.label}<tspan dx="5" className="n">{n}</tspan></text>
        </g>;
      })}
      <line x1={cx} y1={T} x2={cx} y2={B} className="opp-cut" /><line x1={L} y1={cy} x2={R} y2={cy} className="opp-cut" />
      {columns.map((v) => <text key={`x${v}`} x={sx(v)} y={B + 16} textAnchor="middle" className="opp-tick">{v}</text>)}
      {yTicks.map((v) => <g key={`y${v}`}><line x1={L} x2={R} y1={sy(v)} y2={sy(v)} className="opp-grid" />
        <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="opp-tick">{v}</text></g>)}
      <text x={R} y={B + 30} textAnchor="end" className="opp-axis"><title>已有基础：库中已在做这件事的项目数</title>已有基础 →</text>
      <text x={L} y={T - 10} className="opp-axis"><title>影响面：它所服务场景的项目数</title>影响面 ↑</text>
      {[...placed].reverse().map((g) => {
        const inside = g.items.filter((o) => pool.has(o.key)).length;
        return <g key={g.key} className={`opp-pt${inside === g.items.length ? " is-in" : inside ? " is-some" : ""}`} role="button" tabIndex={0}
          aria-label={`${g.items.length > 1 ? `${g.items.length} 项：` : ""}${g.items.map((o) => o.title).join("、")}，已有基础 ${g.base}，影响面 ${g.reach}`}
          onPointerDown={(e) => { press.current = { g, x: e.clientX, y: e.clientY, moved: false }; }}
          onClick={(e) => { if (!press.current?.moved) click(g, e); }}
          onKeyDown={(e) => { if (e.key === "Enter") { const box = (e.currentTarget as Element).getBoundingClientRect(); click(g, { clientX: box.left, clientY: box.bottom }); } }}
          onMouseEnter={(e) => { const at = local(e); setHover({ g, left: Math.min(at.left + 14, at.width - 250), top: at.top + 14 }); }}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover({ g, left: Math.min(g.cx + 14, W - 250), top: g.cy + 14 })} onBlur={() => setHover(null)}>
          <circle cx={g.cx} cy={g.cy} r={g.r + 6} className="halo" />
          <circle cx={g.cx} cy={g.cy} r={g.r} className="dot" />
          {g.items.length > 1 ? <text x={g.cx} y={g.cy + 4} textAnchor="middle" className="count">{g.items.length}</text>
            : inside ? <text x={g.cx} y={g.cy + 4} textAnchor="middle" className="count">✓</text> : null}
        </g>;
      })}
    </svg>
    {hover && !menu ? <div className="opp-tip" style={{ left: hover.left, top: hover.top }} aria-hidden="true">
      {hover.g.items.slice(0, 3).map((o) => <b key={o.key}>{o.title}<small>{o.domain.replace(/^AI与/, "")}</small></b>)}
      {hover.g.items.length > 3 ? <span>另 {hover.g.items.length - 3} 项</span> : null}
      <span>已有基础 {hover.g.base} 个项目 · 影响面 {hover.g.reach} 个项目</span>
      <em>{hover.g.items.length > 1 ? "点开逐项加入 · 拖到候选池加入全部" : "点击或拖到候选池加入"}</em>
    </div> : null}
    {menu ? <div className="opp-menu" style={{ left: Math.max(0, menu.left), top: menu.top }} role="dialog" aria-label="同一位置的机会">
      <header><b>{menu.g.items.length} 项 · 基础 {menu.g.base} · 影响 {menu.g.reach}</b>
        <button type="button" onClick={() => { onPickAll(menu.g.items); setMenu(null); }}>全部加入</button></header>
      <ul>{menu.g.items.map((o) => <li key={o.key}><span>{o.title}<small>{o.domain.replace(/^AI与/, "")}</small></span>
        <button type="button" aria-pressed={pool.has(o.key)} onClick={() => onPick(o)}>{pool.has(o.key) ? "✓" : "+"}</button></li>)}</ul>
    </div> : null}
  </div>;
}

export function GapBoard({ data, onLocate, onReveal }: {
  data: DomainsOverview; onLocate: (domainId: string) => void; onReveal: (domainId: string, system?: string) => void;
}) {
  const { askInTask } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Kind>("issue");
  const [domain, setDomain] = useState("");
  const [open, setOpen] = useState("");
  const [mode, setMode] = useState<"map" | "list">("map");
  // While a card or a gap row is being dragged, the 候选池 lights up as the place to drop it.
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const [pool, setPool] = useState<Opportunity[]>(load);
  const [panel, setPanel] = useState<"" | "export" | "proposal">("");
  const [format, setFormat] = useState<"md" | "csv">("md");
  const [note, setNote] = useState("");
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(pool)); } catch { /* private mode: the pool lives for this visit */ } }, [pool]);

  const all: Record<Kind, Opportunity[]> = { blank: [], issue: [], combo: [] };
  for (const d of data.domains) { const o = opportunities(d); for (const k of KINDS) all[k.key].push(...o[k.key]); }
  const total = all.blank.length + all.issue.length + all.combo.length || 1;
  const inTab = all[tab];
  const shown = inTab.filter((o) => !domain || o.domainId === domain);
  const perDomain = data.domains.map((d) => ({ d, n: inTab.filter((o) => o.domainId === d.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const unchecked = data.domains.filter((d) => !d.blanks_checked).length;
  const inPool = new Set(pool.map((o) => o.key));
  const flip = (item: Opportunity) => setPool(inPool.has(item.key) ? pool.filter((o) => o.key !== item.key) : [...pool, item]);
  const add = (item: Opportunity) => { if (!inPool.has(item.key)) setPool([...pool, item]); };
  // Both buttons always work (query 2026-1022 1809): with an empty pool the previews start from the best-ranked
  // openings of what is on screen, marked as a suggestion, and one click puts them in the pool.
  const suggested = [...shown].sort((a, b) => (b.base + b.reach) - (a.base + a.reach)).slice(0, 6);
  const fromPool = pool.length > 0;
  const subject = fromPool ? pool : suggested;
  const proposal = subject.slice(0, MAX_PROPOSAL);
  const [saved, setSaved] = useState("");
  const save = (text: string, name: string) => { downloadText(text, name); setSaved(name); window.setTimeout(() => setSaved(""), 2400); };
  const suggestion = fromPool ? null : <>候选池还是空的，下面是当前「{KINDS.find((k) => k.key === tab)!.label}」里已有基础与影响面最高的 {suggested.length} 项，可直接使用。
    <button type="button" className="slide-inline" onClick={() => addAll(suggested)}>全部加入候选池</button></>;
  const ranked = [...shown].sort((a, b) => (b.base + b.reach) - (a.base + a.reach));
  const byKey = new Map([...all.blank, ...all.issue, ...all.combo].map((o) => [o.key, o]));
  const toggleIn = (o: Opportunity) => (inPool.has(o.key) ? flip(o) : add(o));
  const addAll = (list: Opportunity[]) => setPool((old) => [...old, ...list.filter((o) => !old.some((p) => p.key === o.key))]);
  // Points in the chart are SVG, where native drag-and-drop is unreliable: they drag by pointer, with a ghost.
  const [ghost, setGhost] = useState<{ items: Opportunity[]; x: number; y: number } | null>(null);
  const carried = useRef<Opportunity[]>([]);
  const overTarget = (x: number, y: number) => Boolean(document.elementFromPoint(x, y)?.closest(".atlas-pool, .pool-dropbar"));
  const drag = useMemo<DragHandlers>(() => ({
    start: (items) => { carried.current = items; setDragging(true); setGhost({ items, x: -999, y: -999 }); },
    move: (x, y) => { setGhost((g) => (g ? { ...g, x, y } : g)); setOver(overTarget(x, y)); },
    end: (x, y) => {
      const hit = overTarget(x, y);
      if (hit) addAll(carried.current);
      carried.current = []; setGhost(null);
      setDragging(false); setOver(false);
      return hit;
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const dropProps = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); setDragging(false); const o = byKey.get(e.dataTransfer.getData("text/plain")); if (o) add(o); },
  };
  const maxBase = Math.max(1, ...shown.map((o) => o.base)), maxReach = Math.max(1, ...shown.map((o) => o.reach));

  return <div className="gap-board">
    <section className="gap-card" aria-label="哪里有缺口">
      <header><h3>哪里有缺口</h3><span>共 <b>{total}</b> 项</span></header>
      <div role="tablist" aria-label="缺口类型" className="gap-tabs">
        {KINDS.map((k) => <button key={k.key} role="tab" type="button" aria-selected={tab === k.key}
          onClick={() => { setTab(k.key); setOpen(""); setDomain(""); }}>
          <b>{all[k.key].length}</b><span title={k.reads}>{k.label}</span></button>)}
      </div>
      <div className="gap-dist" aria-hidden="true">{KINDS.map((k) => <i key={k.key} className={`is-${k.key}`} style={{ width: `${(all[k.key].length / total) * 100}%` }} />)}</div>
      <p className="gap-note"><Hint align="start" text={<>{KINDS.find((k) => k.key === tab)!.reads}。点一行看判断依据，也可以把它拖到右侧候选池。{tab === "blank" && unchecked ? <><br />{unchecked} 个领域还没做谱系核对，这一栏只来自做过核对的库。</> : null}</>}>
        {KINDS.find((k) => k.key === tab)!.label}是什么</Hint></p>
      <ul className="gap-list">
        {shown.slice(0, 60).map((o) => {
          const isOpen = open === o.key;
          return <li key={o.key} className={`${isOpen ? "is-open" : ""}${inPool.has(o.key) ? " is-in" : ""}`}>
            {/* The row's own button is the drag handle: Chrome starts no drag on a draggable parent from inside a button. */}
            <button type="button" className="gap-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : o.key)} draggable
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.key); e.dataTransfer.effectAllowed = "copy"; setDragging(true); }}
              onDragEnd={() => setDragging(false)}>
              <span className={`gap-kind is-${o.kind}`}>{KINDS.find((k) => k.key === o.kind)!.label.slice(0, 2)}</span>
              <b>{o.title}</b><small>{o.domain.replace(/^AI与/, "")}</small><i aria-hidden="true">{isOpen ? "▾" : "▸"}</i>
            </button>
            {isOpen ? <div className="gap-body">
              {o.detail ? <p>{o.detail}</p> : null}
              <p className="basis">已有基础：{o.basis}</p>
              <div className="gap-acts">
                <button type="button" className="primary" onClick={() => flip(o)}>{inPool.has(o.key) ? "移出候选池" : "加入候选池"}</button>
                <button type="button" onClick={() => onLocate(o.domainId)}>在 01 定位</button>
                <button type="button" onClick={() => onReveal(o.domainId, o.system)}>在 02 谱系中看</button>
              </div>
            </div> : null}
          </li>;
        })}
        {shown.length > 60 ? <li className="gap-more">另有 {shown.length - 60} 项，选一个领域缩小范围</li> : null}
        {!shown.length ? <li className="gap-more">这一类没有</li> : null}
      </ul>
      {perDomain.length > 1 ? <div className="gap-domains" role="group" aria-label="本类按领域">
        <span>按领域</span>
        {perDomain.map(({ d, n }) => <button key={d.id} type="button" aria-pressed={domain === d.id} onClick={() => setDomain(domain === d.id ? "" : d.id)}>
          {d.name.replace(/^AI与/, "")}<i>{n}</i></button>)}
      </div> : null}
    </section>

    <section className="gap-card" aria-label="下一步可以先做什么">
      <header><h3>下一步可以先做什么</h3>
        <span role="tablist" aria-label="展示方式" className="gap-mode">
          <button role="tab" type="button" aria-selected={mode === "map"} onClick={() => setMode("map")}>象限图</button>
          <button role="tab" type="button" aria-selected={mode === "list"} onClick={() => setMode("list")}>排序列表</button>
        </span></header>
      <p className="gap-note"><Hint align="start" text={<>横轴已有基础 = 已在做的相关项目数，纵轴影响面 = 所在场景的项目数，按各自中位数分成四区。两个数相同的机会合成一个点，点上的数字是项数。点一下加入候选池（多项时逐项选），或把点拖到候选池。</>}>怎么读</Hint>
        <span> · {KINDS.find((k) => k.key === tab)!.label}{domain ? ` · ${data.domains.find((d) => d.id === domain)?.name.replace(/^AI与/, "")}` : ""} {shown.length} 项</span></p>
      {mode === "map" ? (shown.length ? <OppChart items={shown} pool={inPool} onPick={toggleIn} onPickAll={addAll} drag={drag} /> : <p className="gap-more">这一类没有</p>)
        : <ol className="opp-list">{ranked.slice(0, 20).map((o, i) => <li key={o.key}>
          <span className="rank">{i + 1}</span>
          <span className="name"><b>{o.title}</b><small>{o.domain.replace(/^AI与/, "")}</small></span>
          <span className="bars"><span>基础<i><i style={{ width: `${(o.base / maxBase) * 100}%` }} /></i>{o.base}</span>
            <span>影响<i><i style={{ width: `${(o.reach / maxReach) * 100}%` }} /></i>{o.reach}</span></span>
          <button type="button" aria-pressed={inPool.has(o.key)} onClick={() => flip(o)}>{inPool.has(o.key) ? "已加入" : "加入"}</button>
        </li>)}</ol>}

      <div className={`atlas-pool${dragging ? " is-target" : ""}${over ? " is-over" : ""}`} aria-label="候选池" role="region" {...dropProps}>
        <div className="atlas-pool-head"><b>候选池</b><span>{pool.length} 项</span>
          {pool.length ? <button type="button" onClick={() => setPool([])}>清空</button> : null}</div>
        <div className="atlas-pool-items">
          {pool.length ? pool.map((o) => <span key={o.key}><small>{o.domain.replace(/^AI与/, "")}</small>{o.title}
            <button type="button" aria-label={`移出：${o.title}`} onClick={() => flip(o)}>×</button></span>)
            : <em>{dragging ? "松手加入" : "空"}</em>}
        </div>
        <div className="atlas-pool-actions">
          <button type="button" onClick={() => setPanel("export")}>导出机会清单</button>
          <button type="button" className="primary" onClick={() => setPanel("proposal")}>生成立项建议 →</button>
        </div>
      </div>
    </section>
    {ghost && ghost.x > -999 ? <div className="opp-ghost" style={{ left: ghost.x + 12, top: ghost.y + 12 }} aria-hidden="true">
      {ghost.items.length > 1 ? `${ghost.items.length} 项` : ghost.items[0].title}</div> : null}
    {/* While dragging, a drop bar stays at the bottom of the window: the pool itself may be scrolled out of view. */}
    {dragging ? <div className={`pool-dropbar${over ? " is-over" : ""}`} role="region" aria-label="拖到这里加入候选池" {...dropProps}>
      <b>拖到这里，加入候选池</b><span>已有 {pool.length} 项</span>
    </div> : null}

    <SlideOver open={panel === "export"} onClose={() => setPanel("")} eyebrow="导出预览" title="机会清单" label="导出机会清单"
      stats={KINDS.map((k) => ({ value: subject.filter((o) => o.kind === k.key).length, label: k.label }))}
      warn={suggestion}
      footer={<>
        <span role="radiogroup" aria-label="导出格式" className="slide-seg">
          {(["md", "csv"] as const).map((f) => <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}>{f === "md" ? "Markdown" : "CSV（Excel）"}</button>)}
        </span>
        {saved.startsWith("机会清单") ? <span role="status" className="slide-saved">已下载 {saved}</span> : null}
        <button type="button" className="slide-action primary" disabled={!subject.length}
          onClick={() => save(format === "md" ? asMarkdown(subject) : asCsv(subject), format === "md" ? "机会清单.md" : "机会清单.csv")}>下载 {subject.length} 项</button>
      </>}>
      {KINDS.map((k) => {
        const items = subject.filter((o) => o.kind === k.key);
        return items.length ? <section key={k.key} className="slide-group">
          <h3>{k.label}</h3>
          {items.map((o) => <article key={o.key} className="slide-card">
            <small>{o.domain}</small><b>{o.title}</b>{o.detail ? <p>{o.detail}</p> : null}<p className="basis">已有基础：{o.basis}</p>
          </article>)}
        </section> : null;
      })}
      {!subject.length ? <p className="text-body text-[var(--steel)]">这一类没有可导出的机会，换一个缺口类型试试。</p> : null}
    </SlideOver>

    <SlideOver open={panel === "proposal"} onClose={() => setPanel("")} eyebrow="立项建议 · 草稿" title="立项建议（草稿）" label="生成立项建议"
      stats={[{ value: proposal.length, label: "候选方向" }, { value: new Set(proposal.map((o) => o.domain)).size, label: "涉及领域" }]}
      warn={<>{suggestion ? <>{suggestion}<br /></> : null}“已有基础”由资料库计数得出；“首步验证”是按缺口类型给的起步建议，尚未做可行性与经费评估。{subject.length > MAX_PROPOSAL ? `一次最多 ${MAX_PROPOSAL} 条，其余请下次生成。` : ""}</>}
      footer={<>
        {saved.startsWith("立项建议") ? <span role="status" className="slide-saved">已下载 {saved}</span> : null}
        <button type="button" className="slide-action" disabled={!proposal.length} onClick={() => save(proposalMarkdown(proposal), "立项建议-草稿.md")}>导出草稿</button>
        <button type="button" className="slide-action primary" disabled={!proposal.length} onClick={() => {
          void askInTask("task3", proposalQuestion(proposal, note)).then(() => { setPanel(""); navigate("/chat"); });
        }}>交给对话工作台写完整建议 →</button>
      </>}>
      {proposal.map((o, i) => <article key={o.key} className="slide-card proposal">
        <div className="proposal-top"><span>PR-{i + 1}</span><small>{o.domain} · {KINDS.find((k) => k.key === o.kind)!.label}</small></div>
        <b>{o.title}</b>
        <dl>
          <div><dt>已有基础</dt><dd>{o.basis}</dd></div>
          <div><dt>缺口</dt><dd>{o.detail || o.title}</dd></div>
          <div><dt>首步验证</dt><dd>{KINDS.find((k) => k.key === o.kind)!.first}</dd></div>
        </dl>
      </article>)}
      {!proposal.length ? <p className="text-body text-[var(--steel)]">这一类没有可用的机会，换一个缺口类型试试。</p> : null}
      <label className="atlas-note">交给对话工作台时的补充要求（可选）
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：面向 2027 年度申报，经费 300 万元以内" />
      </label>
    </SlideOver>
  </div>;
}
