import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { MATURITY_NAMES, domainTreeQuery, maturityVar, type DomainTree, type DomainsOverview, type TreeProject } from "../../domains";
import { atlasQuery } from "../../domainAtlas";
import { projectQuery } from "../../projects";
import { useLayout } from "../../layout";
import { Segmented } from "../ui";
import { BoxTree, type BoxNode } from "./BoxTree";
import { fitChart } from "./chartFrame";

const GAP = 40; // between columns, as BoxTree draws them

/**
 * 01 关键技术 (query 2026-1030 1624; named 技术落点 until 1747): from a domain down to its technologies — 技术体系 › 研究方向 › 主题 ›
 * 技术条目 — each with its maturity and the basis for it, and a technology's file: its project and that
 * project's 问题 / 技术 / 成果 / 场景. Those four are recorded per project, not per technology, so the file says
 * "同一项目"; linking one technology to the problem it solves is not in the data yet.
 * Two readings of the same tree: 逐层展开, a tree that opens to the right like 五级谱系 (query 2026-11-02 17:09,
 * it replaced four column panes), and 成熟度矩阵 (system × level).
 */
type Tree = DomainTree["systems"];
type Node = Tree[number] | Tree[number]["directions"][number] | Tree[number]["directions"][number]["themes"][number];
type Hit = { it: TreeProject["items"][number]; p: TreeProject; idx: number };
const LEVELS = ["未判定", "1 理论方法", "2 算法模型", "3 原型样机", "4 系统集成", "5 示范转化"];
const flat = (n: Node): Hit[] => "directions" in n ? n.directions.flatMap(flat) : "themes" in n ? n.themes.flatMap(flat)
  : n.projects.flatMap((p) => p.items.map((it, idx) => ({ it, p, idx })));
const levelsOf = (n: Node) => { const l = [0, 0, 0, 0, 0, 0]; flat(n).forEach(({ it }) => l[it.maturity >= 0 && it.maturity <= 5 ? it.maturity : 0]++); return l; };
const short = (name: string) => name.replace(/^自然科学基金-/, "").replace(/^AI与/, "");

export function TechLanding({ data }: { data: DomainsOverview }) {
  const [search, setSearch] = useSearchParams();
  const domains = [...data.domains].sort((a, b) => b.items - a.items);
  const domain = domains.find((d) => d.id === search.get("tech"))?.id ?? domains[0]?.id ?? "";
  const reading = search.get("reading") === "matrix" ? "matrix" : "columns";
  const set = (values: Record<string, string | null>) => setSearch((old) => {
    const next = new URLSearchParams(old);
    for (const [k, v] of Object.entries(values)) if (v === null) next.delete(k); else next.set(k, v);
    return next;
  }, { replace: true });
  const tree = useQuery({ ...domainTreeQuery(domain), enabled: Boolean(domain) });
  const [picked, setPicked] = useState<{ domain: string; pid: string; idx: number } | null>(null);
  const item = picked?.domain === domain ? picked : null;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div role="group" aria-label="选择领域" className="flex flex-wrap gap-1.5">
        {domains.map((d) => <button key={d.id} type="button" aria-pressed={d.id === domain} onClick={() => set({ tech: d.id })}
          className={`rounded-full border px-3 py-1 text-caption ${d.id === domain ? "border-[var(--primary)] bg-[var(--primary)] text-white"
            : "border-[var(--hairline-strong)] text-[var(--text-2)] hover:border-[var(--primary)]"}`}>
          {short(d.name)}<span className="ml-1 opacity-70">{d.items}</span></button>)}
      </div>
      <Segmented label="读法" value={reading} onChange={(v) => set({ reading: v === "matrix" ? "matrix" : null })}
        options={[["columns", "逐层展开"], ["matrix", "成熟度矩阵"]]} />
    </div>
    <p className="flex flex-wrap items-center gap-1.5 text-caption text-[var(--text-3)]" aria-label="信息层级">
      {["领域", "技术体系", "研究方向", "主题"].map((x) => <span key={x} className="flex items-center gap-1.5"><span className="rounded-full bg-[var(--surface-sink)] px-2.5 py-0.5 text-[var(--text-2)]">{x}</span>›</span>)}
      <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 font-semibold text-[var(--primary-pressed)]">技术条目 · 成熟度与依据</span>
      <span>⇢</span>
      {["问题", "成效与成果", "场景"].map((x) => <span key={x} className="rounded-full bg-[var(--terrain-amber-soft)] px-2.5 py-0.5 text-[var(--terrain-amber-ink)]">{x}</span>)}
      <span>虚线后为同一项目的记录，尚未逐条连到技术</span>
    </p>
    {tree.isLoading ? <p role="status" className="text-body text-[var(--steel)]">正在读取技术谱系…</p>
      : tree.error || !tree.data ? <p role="alert" className="text-body text-[var(--red)]">{(tree.error as Error)?.message ?? "技术谱系暂不可读"}</p>
      : !tree.data.systems.length ? <p className="rounded-xl border border-[var(--hairline)] p-6 text-body text-[var(--steel)]">该领域尚未生成技术谱系。</p>
      : <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {reading === "matrix" ? <Matrix key={domain} systems={tree.data.systems} item={item} onItem={(pid, idx) => setPicked({ domain, pid, idx })} />
          : <TechTree key={domain} name={short(tree.data.name)} items={tree.data.items} systems={tree.data.systems}
            onItem={(pid, idx) => setPicked({ domain, pid, idx })} />}
        <TechFile corpusId={domain} name={short(tree.data.name)} systems={tree.data.systems} item={item} reading={reading} />
      </div>}
  </div>;
}

function ItemButton({ hit, on, onItem, level = true }: { hit: Hit; on: boolean; onItem: (pid: string, idx: number) => void; level?: boolean }) {
  return <button type="button" aria-pressed={on} onClick={() => onItem(hit.p.id, hit.idx)}
    className={`flex w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left ${on ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface)]"}`}>
    <span className="text-body leading-[19px] text-[var(--ink)]">{hit.it.name}</span>
    {level ? <span className="flex items-center gap-1 text-caption text-[var(--text-2)]"><i className="size-[9px] rounded-xs" style={{ background: `var(--m-${hit.it.maturity})` }} />{LEVELS[hit.it.maturity] ?? LEVELS[0]}</span> : null}
    <span className="truncate text-caption text-[var(--text-3)]">{hit.p.title} · {hit.p.year ?? "—"}</span>
  </button>;
}

/** 领域 › 技术体系 › 研究方向 › 主题 › 技术条目, each level largest first. */
function TechTree({ name, items, systems, onItem }: { name: string; items: number; systems: Tree; onItem: (pid: string, idx: number) => void }) {
  const byItems = <T extends Node>(nodes: T[]) => nodes.map((n, i) => ({ n, i })).sort((a, b) => flat(b.n).length - flat(a.n).length);
  const root: BoxNode = { key: "root", name, count: `${items} 条`, children: byItems(systems).map(({ n: s, i: si }) => ({
    key: `s${si}`, name: s.name, sub: s.plain, count: `${flat(s).length} 条`, levels: levelsOf(s),
    children: byItems(s.directions).map(({ n: d, i: di }) => ({
      key: `s${si}d${di}`, name: d.name, sub: d.plain, count: `${flat(d).length} 条`, levels: levelsOf(d),
      children: byItems(d.themes).map(({ n: t, i: ti }) => ({
        key: `s${si}d${di}t${ti}`, name: t.name, sub: t.plain, count: `${flat(t).length} 条`, levels: levelsOf(t),
        children: flat(t).sort((a, b) => b.it.maturity - a.it.maturity).map((hit) => ({
          key: `i:${hit.p.id}:${hit.idx}`, name: hit.it.name, tier: hit.it.maturity, sub: `${hit.p.title}${hit.p.year ? ` · ${hit.p.year}` : ""}` })),
      })),
    })),
  })) };
  // As 五级谱系: the first visit opens the largest branch down to its 主题 (four columns); the
  // technologies of a 主题 are the explicit next step.
  const widths = [180, 240, 240, 240, 300];
  const first: string[] = [];
  for (let n: BoxNode | undefined = root.children?.[0]; n && first.length < 2; n = n.children?.[0]) first.push(n.key);
  const [path, setPath] = useState(first);
  // The window takes the room the page has left (query 2026-11-04): it used to be a fixed 420 px in
  // a 1020 px window, which left the drawing small and most of the screen empty.
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(520);
  // Column widths follow the window's width; the height only decides how tall the rows are.
  const [widthScale, setWidthScale] = useState(1);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const read = () => {
      const box = el.querySelector<HTMLElement>('[role="region"]') ?? el;
      const next = fitChart(el, box);
      setHeight((old) => (Math.abs(old - next) < 1 ? old : next));
      // Only the columns actually shown count: 领域 + the levels the path has opened (at least 主题),
      // and 技术条目 once a 主题 is opened. Counting all five made the base too wide, so the columns
      // shrank while the type grew — which is what truncated the names.
      const shown = Math.min(widths.length, 4 + (path[3]?.startsWith("i:") ? 1 : 0));
      // Fit the columns to the room exactly (minus ZoomPan's 16 px padding): when the drawing is
      // wider than the window the fit scales by width and the height goes unused — which is what
      // left the tree at 94% with empty space below it.
      // Fit the drawing to the window's width exactly: BoxTree pads 8 px each side and ZoomPan
      // another 16, so the drawing must be that much narrower than the window. When the drawing is
      // wider the fit scales by width and the height goes unused (the tree stayed at 95%).
      // The drawing's own width is `8 + Σ(column widths + gaps) + 8` (BoxTree), and ZoomPan fits it
      // into `clientWidth - 16`. Solve for the column scale directly instead of approximating: any
      // overshoot makes the fit scale by width, which wastes the height (the tree sat at 95%).
      const room = Math.max(320, box.clientWidth - 16);
      const gaps = GAP * (shown - 1);
      const nextScale = Math.min(1.5, Math.max(0.85,
        (room - 16 - gaps) / widths.slice(0, shown).reduce((sum, w) => sum + w, 0)));
      setWidthScale((old) => (Math.abs(old - nextScale) < 0.01 ? old : nextScale));
    };
    const observer = new ResizeObserver(read);
    observer.observe(el);
    const viewport = el.closest("main");
    if (viewport) observer.observe(viewport);
    read();
    return () => observer.disconnect();
  }, [path.join("|")]);
  return <div ref={frame} className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--canvas)]">
    <BoxTree root={root} path={path} label="关键技术谱系" height={height} widthScale={widthScale}
      heads={["领域", "技术体系", "研究方向", "主题", "技术条目"]} widths={widths}
      onPath={(next) => { setPath(next); const leaf = next[3]; if (leaf?.startsWith("i:")) { const cut = leaf.lastIndexOf(":"); onItem(leaf.slice(2, cut), Number(leaf.slice(cut + 1))); } }} />
  </div>;
}

function Matrix({ systems, item, onItem }: { systems: Tree; item: { pid: string; idx: number } | null; onItem: (pid: string, idx: number) => void }) {
  // The card takes the room the page has left, as the tree does (query 2026-11-04); the table inside
  // grows with it and its rows keep a comfortable height.
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(480);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const read = () => {
      const next = fitChart(el, el.querySelector("table") ?? el);
      setHeight((old) => (Math.abs(old - next) < 1 ? old : next));
    };
    const observer = new ResizeObserver(read);
    observer.observe(el);
    const viewport = el.closest("main");
    if (viewport) observer.observe(viewport);
    read();
    return () => observer.disconnect();
  }, []);
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const [cell, setCell] = useState<{ si: number; di: number | null; lv: number } | null>(null);
  const rows = systems.flatMap((s, si) => [{ n: s as Node, si, di: null as number | null },
    ...(open.has(si) ? s.directions.map((d, di) => ({ n: d as Node, si, di })) : [])]);
  const levels = rows.map((r) => levelsOf(r.n)), max = Math.max(1, ...levels.flat());
  const chosen = cell ? (cell.di === null ? systems[cell.si] : systems[cell.si]?.directions[cell.di]) : undefined;
  const list = chosen ? flat(chosen).filter(({ it }) => it.maturity === cell!.lv) : [];
  // Head row, caption line and the 3 px gaps: what is left is shared by the rows, within a readable
  // range, so the matrix fills the window without turning into slabs when a domain has few systems.
  const rowH = Math.round(Math.max(34, Math.min(64, (height - 74) / Math.max(1, rows.length))));
  return <div ref={frame} className="overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3">
    <table className="w-full border-separate border-spacing-[3px] text-body" aria-label="技术体系 × 成熟度">
      <thead><tr className="text-caption">{["技术体系 / 研究方向", ...LEVELS, "合计", "4–5 档"].map((l, i) =>
        <th key={l} className={`font-medium text-[var(--text-3)] ${i === 0 ? "px-2 text-left" : i < LEVELS.length + 1 ? "px-1 whitespace-nowrap" : ""}`}>{l}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => {
        const l = levels[i], total = l.reduce((s, v) => s + v, 0), high = total ? Math.round(((l[4] + l[5]) / total) * 100) : 0;
        return <tr key={`${r.si}-${r.di}`}>
          <td className={`max-w-[220px] truncate py-1.5 pr-2 ${r.di === null ? "font-semibold text-[var(--heading)]" : "pl-6 text-[var(--text-2)]"}`} title={r.n.name}>
            {r.di === null ? <button type="button" aria-expanded={open.has(r.si)} onClick={() => setOpen((old) => { const next = new Set(old); if (next.has(r.si)) next.delete(r.si); else next.add(r.si); return next; })}
              className="max-w-full truncate text-left">{open.has(r.si) ? "▾ " : "▸ "}{r.n.name}</button> : r.n.name}</td>
          {l.map((v, lv) => {
            const on = cell?.si === r.si && cell.di === r.di && cell.lv === lv;
            if (!v) return <td key={lv} style={{ height: rowH }} className="min-w-[52px] rounded-md bg-[var(--surface-soft)] text-center text-[var(--text-3)]">·</td>;
            const share = Math.round(12 + 78 * Math.sqrt(v / max)), base = lv === 0 ? "var(--terrain-dot)" : lv >= 4 ? "var(--m-5)" : "var(--primary)";
            return <td key={lv} className="p-0"><button type="button" aria-pressed={on} title={`${r.n.name} · ${LEVELS[lv]}：${v} 条`} onClick={() => setCell({ si: r.si, di: r.di, lv })}
              style={{ background: `color-mix(in srgb, ${base} ${share}%, white)`, color: share > 50 ? "#fff" : "var(--ink)", height: rowH }}
              className={`w-full min-w-[52px] rounded-md tabular-nums ${on ? "outline-2 -outline-offset-2 outline-[var(--ink)]" : ""}`}
              >{v}</button></td>;
          })}
          <td className="pr-2 text-right tabular-nums text-[var(--text-3)]">{total}</td>
          <td className="pr-1"><span className="flex items-center justify-end gap-1.5 text-[var(--text-2)]"><span className="h-[6px] w-[44px] overflow-hidden rounded-full bg-[var(--surface-sink)]"><i className="block h-full bg-[var(--m-5)]" style={{ width: `${high}%` }} /></span>{high}%</span></td>
        </tr>;
      })}</tbody>
    </table>
    <p className="mx-1 mt-2 text-caption text-[var(--text-3)]">格子深浅为条目数；绿色列是已到系统集成、示范转化的技术。点格子列出这些技术。</p>
    {chosen ? <section aria-label="所选格子的技术" className="mt-3">
      <h4 className="mb-1.5 text-body font-semibold text-[var(--heading)]">{chosen.name} · {LEVELS[cell!.lv]} · {list.length} 条</h4>
      <ul className="grid max-h-[300px] gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{list.map((hit) => <li key={hit.p.id + hit.idx}>
        <ItemButton hit={hit} level={false} on={item?.pid === hit.p.id && item.idx === hit.idx} onItem={onItem} /></li>)}</ul>
    </section> : null}
  </div>;
}

function TechFile({ corpusId, name, systems, item, reading }: { corpusId: string; name: string; systems: Tree; item: { pid: string; idx: number } | null; reading: string }) {
  const { showInspector } = useLayout();
  const library = useQuery({ ...projectQuery(corpusId), enabled: Boolean(item) });
  const atlas = useQuery({ ...atlasQuery, enabled: Boolean(item) });
  const hit = useMemo(() => {
    if (!item) return null;
    for (const s of systems) for (const d of s.directions) for (const t of d.themes) for (const p of t.projects)
      if (p.id === item.pid && p.items[item.idx]) return { s, d, t, p, it: p.items[item.idx] };
    return null;
  }, [systems, item]);
  const shell = "rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 xl:sticky xl:top-[76px]";
  if (!hit) return <aside aria-label="技术档案" className={shell}>
    <p className="py-6 text-center text-body text-[var(--text-3)]">{reading === "matrix" ? "点矩阵中的格子，再点一项技术，这里显示它的档案。" : "逐层点到技术条目，这里显示这项技术的档案。"}</p>
    <p className="rounded-lg border border-[var(--warn-line)] bg-[var(--warn-bg)] px-3 py-2 text-caption text-[var(--warn-fg)]">问题、成果、场景目前按项目记录：一个项目往往有几项技术，所以档案里会标明“同一项目”。</p>
  </aside>;
  const { s, d, t, p, it } = hit;
  const project = library.data?.projects.find((x) => x.project_id === p.id);
  const fact = atlas.data?.domains.find((x) => x.id === corpusId)?.projects.find((x) => x.id === p.id);
  const facet = (key: string, label: string, color: string) => {
    const items = project?.facets[key]?.items ?? [];
    return <section className="border-t border-[var(--hairline)] pt-2.5">
      <h5 className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold text-[var(--text-2)]"><i className="size-2 rounded-full" style={{ background: color }} />{label}
        <span className="font-normal text-[var(--text-3)]">{library.isLoading ? "…" : `${items.length} 条`}</span></h5>
      {items.length ? <ul className="space-y-1.5">{items.map((x) => <li key={x.id}
        className={`text-caption leading-[19px] text-[var(--ink)] ${key === "技术" && x.name === it.name ? "-mx-2 rounded-md bg-[var(--primary-soft)] px-2 py-1" : ""}`}>
        {x.name}{x.status ? <span className="ml-1 rounded bg-[var(--surface-sink)] px-1 text-caption text-[var(--steel)]">{x.status}</span> : null}
        {x.desc ? <small className="block text-[var(--text-3)]">{x.desc}</small> : null}</li>)}</ul>
        : !library.isLoading ? <p className="text-caption text-[var(--text-3)]">未记录</p> : null}
    </section>;
  };
  return <aside aria-label="技术档案" className={`${shell} flex max-h-[calc(100vh-150px)] flex-col gap-3 overflow-y-auto`}>
    <p className="text-caption text-[var(--text-3)]">{name} › {s.name} › {d.name} › {t.name}</p>
    <h3 className="text-emphasis font-semibold text-[var(--heading)]">{it.name}</h3>
    <div>
      <div className="grid grid-cols-5 gap-[3px]" aria-hidden="true">{[1, 2, 3, 4, 5].map((k) =>
        <i key={k} className="h-2 rounded-xs" style={{ background: it.maturity >= k ? maturityVar(it.maturity) : "var(--surface-sink)" }} />)}</div>
      <p className="mt-2 text-body font-semibold text-[var(--ink)]">{it.maturity ? `第 ${it.maturity} 档 · ${MATURITY_NAMES[it.maturity]}` : "成熟度未判定"}</p>
      {it.basis ? <p className="text-caption text-[var(--text-3)]">依据：{it.basis}</p> : null}
    </div>
    <button type="button" onClick={() => showInspector({ kind: "project", corpusId, projectId: p.id, facet: "技术" })}
      className="rounded-lg bg-[var(--surface-cool)] px-3 py-2.5 text-left hover:bg-[var(--surface)]">
      <span className="block text-body font-semibold text-[var(--heading)]">{p.title}</span>
      <span className="block text-caption text-[var(--text-3)]">{[p.number, p.unit, p.admin, p.year ? `${p.year} 立项` : "",
        fact?.amount != null ? `资助 ${fact.amount} 万` : "", fact?.outputs != null ? `成果列表 ${fact.outputs} 项` : ""].filter(Boolean).join(" · ")}</span>
      <span className="mt-1 block text-caption text-[var(--link)]">查看项目 ›</span>
    </button>
    {library.error ? <p role="alert" className="text-caption text-[var(--red)]">项目记录暂不可读</p> : null}
    {facet("问题", "要解决的问题", "var(--dim-issue)")}
    {facet("技术", "本项目的技术（高亮为当前）", "var(--dim-tech)")}
    {facet("成果", "成效与成果", "var(--dim-outcome)")}
    {facet("场景", "应用场景", "var(--dim-scene)")}
    <p className="rounded-lg border border-[var(--warn-line)] bg-[var(--warn-bg)] px-3 py-2 text-caption text-[var(--warn-fg)]">问题、成果、场景是同一项目的记录，还没有逐条标明这项技术解决了哪个问题、带来哪项成果。</p>
  </aside>;
}
