import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { createPortal } from "react-dom";
import type { LibraryOverview } from "../../api";
import { ALL_YEARS, ANNUAL_METRICS, LENSES, NODE_KINDS, OUTPUT_MEANING, atlasLayout, atlasQuery, buildAtlas, lensValue, type AnnualMetric, type AtlasData, type AtlasMeasure, type Lens, type YearWindow } from "../../domainAtlas";
import { LibraryPreviewDrawer } from "../LibraryPreviewDrawer";
import { YearBand } from "./YearBand";
import { useAtlasMotion } from "./useAtlasMotion";
import { money } from "../../domains";
import type { AtlasModel } from "../../domainAtlas";
import "./domain-lens.css";
const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const cash = (d: AtlasMeasure) => d.funded ? (d.funding>=10000?money(d.funding):`${fmt(d.funding)} 万`) : d.projects ? "未记录" : "0 万";
const windowLabel = (w: YearWindow) => w.from === null ? "全部立项年份" : w.from === w.to ? `${w.from} 年立项` : `${w.from}—${w.to} 年立项`;
type Tip = {
    title: string;
    text: string;
    x: number;
    y: number;
};
export function DomainLens({ libraries, reveal }: {
    libraries: LibraryOverview[];
    reveal?: {
        id: string;
        at: number;
    };
}) {
    const query = useQuery(atlasQuery);
    if (query.isLoading)
        return <p role="status" className="lens-muted">正在读取领域项目、批准资助金额与成果记录…</p>;
    if (query.error || !query.data)
        return <p role="alert" className="lens-error">{(query.error as Error)?.message ?? "领域记录暂不可读"}</p>;
    return <LensMap key={query.data.domains.map(d => d.id).join("|")} data={query.data} libraries={libraries} reveal={reveal}/>;
}
function LensMap({ data, libraries, reveal }: {
    data: AtlasData;
    libraries: LibraryOverview[];
    reveal?: {
        id: string;
        at: number;
    };
}) {
    const model = useMemo(() => buildAtlas(data), [data]), [search, setSearch] = useSearchParams();
    const scope = model.nodes.get(search.get("layer") ?? "")?.children.length ? search.get("layer") : null;
    const ids = scope ? model.nodes.get(scope)!.children : model.roots;
    const lens: Lens = search.get("lens") === "money" || search.get("lens") === "impact" ? search.get("lens") as Lens : "base";
    const from = Number(search.get("from")), to = Number(search.get("to"));
    const window: YearWindow = data.years.includes(from) && data.years.includes(to) && from <= to ? { from, to } : ALL_YEARS;
    const metric: AnnualMetric = ANNUAL_METRICS.includes(search.get("annual") as AnnualMetric) ? search.get("annual") as AnnualMetric : "projects";
    const expanded = search.get("expanded") === "1";
    const fixed = ids.includes(search.get("pin") ?? "") ? search.get("pin") : null;
    const selected = ids.includes(search.get("node") ?? "") ? search.get("node")! : ids[0];
    const base = ids.includes(search.get("compare") ?? "") && search.get("compare") !== selected ? search.get("compare") : null;
    const [hover, setHover] = useState<{
        id: string;
        year: number | null;
    } | null>(null), [guide, setGuide] = useState<string | null>(null), [tip, setTip] = useState<Tip | null>(null), [preview, setPreview] = useState<LibraryOverview | null>(null), [open, setOpen] = useState(() => globalThis.innerWidth > 850);
    const chosen = (!fixed && !base && hover && ids.includes(hover.id) ? hover.id : null) ?? fixed ?? selected;
    const peek = !fixed && !base && hover?.id === chosen ? hover.year : null;
    const d = model.measure(chosen, peek ? { from: peek, to: peek } : window);
    const wrap = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), tooltip=useRef<HTMLDivElement>(null),svg = useRef<SVGSVGElement>(null), [size, setSize] = useState({ width: 760, height: 400, font:16 }), [panelHeight,setPanelHeight]=useState(850);
    const drag = useRef<{
        id: string;
        x: number;
        y: number;
        active: boolean;
    } | null>(null), [trace, setTrace] = useState<{
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    } | null>(null), suppress = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null), drawerDrag = useRef<number | null>(null), nextFocus=useRef<string|null>(null);
    const cancelClick = () => { if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
    } };
    const update = (values: Record<string, string | null>) => { cancelClick();drag.current=null;setTrace(null); setHover(null); setGuide(null); setTip(null); setSearch(old => { const next = new URLSearchParams(old); if (hover && !fixed && !base && !("node" in values))
        next.set("node", hover.id); for (const [k, v] of Object.entries(values)) {
        if (v === null)
            next.delete(k);
        else
            next.set(k, v);
    } return next; }, { replace: true }); };
    const choose = (id: string) => { setOpen(true); update({ node: id, pin: fixed === id ? null : id, compare: null }); };
    const back = (restoreFocus=false) => { if (base)
        update({ compare: null });
    else if (fixed)
        update({ pin: null });
    else if (scope){
        if(restoreFocus)nextFocus.current=scope;update({ layer: model.nodes.get(scope)!.parent, node: scope, pin: null });}
    else
        setOpen(false); };
    const enter = (id: string,restoreFocus=false) => { cancelClick(); const n = model.nodes.get(id)!; setOpen(true); if (n.children.length){
        if(restoreFocus)nextFocus.current=n.children[0];update({ layer: id, node: n.children[0], pin: null, compare: null });}
    else
        update({ node: id, pin: id, compare: null }); };
    useLayoutEffect(() => {
        const el=wrap.current,main=stage.current;if(!el||!main)return;
        const read=()=>{
            const font=parseFloat(getComputedStyle(el).getPropertyValue("--text-emphasis"))||16;
            const width=Math.max(660,Math.floor(el.getBoundingClientRect().width)),height=Math.round(Math.max(340,Math.min(960,globalThis.innerHeight*.43)));
            setSize(old=>old.width===width&&old.height===height&&old.font===font?old:{width,height,font});
            const matrix=main.querySelector(".lens-matrix"),h=Math.ceil(main.getBoundingClientRect().height-(matrix?.getBoundingClientRect().height??0));
            setPanelHeight(old=>Math.abs(old-h)<1?old:Math.max(440,h));
        };
        const observer=new ResizeObserver(read);observer.observe(el);observer.observe(main);globalThis.addEventListener("resize",read);read();
        return()=>{observer.disconnect();globalThis.removeEventListener("resize",read);};
    }, []);
    useEffect(() => () => { if (timer.current)
        clearTimeout(timer.current); }, []);
    useEffect(() => { setHover(null); setGuide(null); setTip(null); }, [search]);
    useLayoutEffect(()=>{if(!tip||!tooltip.current)return;const h=tooltip.current.getBoundingClientRect().height;tooltip.current.style.top=Math.max(12,Math.min(tip.y,globalThis.innerHeight-h-12))+"px";},[tip]);
    const lastReveal = useRef<number | undefined>(undefined);
    useEffect(() => { if (reveal && reveal.at !== lastReveal.current && model.nodes.has(reveal.id)) {
        lastReveal.current = reveal.at;
        setSearch(old => { const next = new URLSearchParams(old); next.delete("layer"); next.delete("compare"); next.set("node", reveal.id); next.set("pin", reveal.id); return next; }, { replace: true });
        setOpen(true);
    } }, [reveal, model, setSearch]);
    useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key !== "Escape" || preview)
        return; if(drag.current){e.preventDefault();drag.current=null;setTrace(null);suppress.current=Date.now()+350;return;}if(drawerDrag.current!==null){drawerDrag.current=null;return;}if (tip) { setTip(null); return; } if (base || fixed) {
        setSearch(old => { const next = new URLSearchParams(old); next.delete(base ? "compare" : "pin"); return next; }, { replace: true });
    }
    else
        setOpen(false); setTip(null); }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [base, fixed, preview, tip, setSearch]);
    const rows = useMemo(()=>ids.map(id=>model.measure(id,{from:window.from,to:window.to})),[ids,model,window.from,window.to]);
    const target = useMemo(()=>atlasLayout(rows,lens,size.width,size.height,size.font),[rows,lens,size]);
    const {layout,moving}=useAtlasMotion(target,`${lens}|${window.from}|${window.to}`,scope??"root"),v=LENSES[lens];
    useLayoutEffect(()=>{if(!nextFocus.current||!svg.current||layout.points.some(p=>!ids.includes(p.d.node.id)))return;const nodes=[...svg.current.querySelectorAll<SVGGElement>("[data-node]")];const node=nodes.find(n=>n.getAttribute("data-node")===nextFocus.current)??nodes[0]??svg.current;node.focus({preventScroll:true});nextFocus.current=null;},[layout,ids]);
    const focused = moving?undefined:layout.points.find(p => p.d.node.id === (guide ?? fixed));
    const absent=rows.filter(d=>!d.projects),insufficient=layout.missing.filter(p=>p.d.projects>0);
    const ap = layout.points.find(p => p.d.node.id === base), bp = layout.points.find(p => p.d.node.id === selected);
    const explain = (el: Element, title: string, text: string) => { const r = el.getBoundingClientRect(),width=Math.min(globalThis.innerWidth-24,Math.min(440,Math.max(300,globalThis.innerWidth*.2))); setTip({ title, text, x: Math.max(12, Math.min(globalThis.innerWidth-width-12, r.left)), y: Math.max(12, r.bottom+8) }); };
    const standard = `中位数取自${windowLabel(window)}、当前层 ${layout.points.length} 个可绘制节点；横轴 ${fmt(layout.mx)}，纵轴 ${fmt(layout.my)}。随年份、视角和层级重算，恰好相等算“不高于”。`;
    const showMedian = (e: {
        currentTarget: Element;
    }) => explain(e.currentTarget, "四象限如何划分？", standard);
    const path: string[] = [];
    let ancestor = scope ? model.nodes.get(scope) : undefined;
    while (ancestor) {
        path.unshift(ancestor.name);
        ancestor = ancestor.parent ? model.nodes.get(ancestor.parent) : undefined;
    }
    const asPoint = (e: PointerEvent<SVGSVGElement>) => { const p = e.currentTarget.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse()); };
    const showLibrary = () => { const row = libraries.find(r => r.corpus_id === d.node.domain); if (row) {
        const full = model.measure(d.node.domain);
        setPreview({ ...row, funding: { total_yuan: String(full.funding * 10000), projects: full.funded, scope: "awarded", label: "批准资助金额" } });
        setTip(null);
    } };
    if (!selected || !d)
        return <p role="status">此层暂无可浏览节点。</p>;
    return <div className="domain-lens" data-testid="domain-lens" data-moving={moving} style={{"--lens-stage-height":`${panelHeight}px` } as CSSProperties}><div ref={stage} className="lens-main"><div className="lens-views">{(Object.keys(LENSES) as Lens[]).map(k => <button key={k} type="button" aria-pressed={lens === k} onClick={() => update({ lens: k })}>{LENSES[k].name}</button>)}</div>
    <div className="lens-head"><div><nav aria-label="当前分析层级">全部领域{path.map((name, i) => <span key={i}> › {name}</span>)}</nav><h3>{v.question}</h3></div><span>{windowLabel(window)}</span></div>
    <div className="lens-status"><span>圆面积＝项目数 · 虚线＝本层中位数</span><span aria-live="polite">{moving?"正在切换视角与年份…":base ? "蓝线对比中 · 点空白退出" : fixed ? "已固定 · 再点解除" : "悬停预览 · 单击固定"}</span></div>
    <div ref={wrap} className="lens-plot-scroll"><svg ref={svg} width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} tabIndex={-1} role="group" aria-label="研究领域四象限图" className="lens-plot" onClick={e => { if (!moving&&!(e.target as Element).closest("[data-node],[data-explain]") && Date.now() > suppress.current)
        back(); }} onPointerMove={e => { const a = drag.current; if (!a)
        return; if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 7)
        a.active = true; if (a.active) {
        cancelClick();
        const current = asPoint(e), start = e.currentTarget.createSVGPoint();
        start.x = a.x;
        start.y = a.y;
        const p = start.matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
        setTrace({ x1: p.x, y1: p.y, x2: current.x, y2: current.y });
    } }} onPointerUp={e => { const a = drag.current; drag.current = null; setTrace(null); if (!a?.active)
        return; suppress.current = Date.now() + 350; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node]")?.getAttribute("data-node"); if (target && target !== a.id) {
        setOpen(true);
        update({ compare: a.id, node: target, pin: null });
    } }} onPointerCancel={() => { drag.current = null; setTrace(null); }}>
      <rect x={layout.left} y={layout.top} width={layout.right - layout.left} height={layout.bottom - layout.top} fill="var(--terrain-plot)"/>
      {layout.points.length ? <>
        <rect x={layout.left} y={layout.top} width={layout.medianX - layout.left} height={layout.medianY - layout.top} fill="var(--terrain-empty)"/><rect x={layout.medianX} y={layout.top} width={layout.right - layout.medianX} height={layout.medianY - layout.top} fill="var(--ok-bg)"/><rect x={layout.left} y={layout.medianY} width={layout.medianX - layout.left} height={layout.bottom - layout.medianY} fill="var(--terrain-shallow)"/>
        {Array.from({ length: 5 }, (_, i) => { const y = layout.yr[0] + (layout.yr[1] - layout.yr[0]) * i / 4; return <g key={i}><path d={`M${layout.left} ${layout.py(y)}H${layout.right}`} stroke="var(--terrain-grid)"/><text x={layout.left - 12} y={layout.py(y) + 4} textAnchor="end" className="lens-axis">{fmt(y)}</text></g>; })}
        {(lens === "base" ? [1, 3, 10, 30, 100, 300, 1000, 3000].filter(x => Math.log10(x) >= layout.xr[0] && Math.log10(x) <= layout.xr[1]) : Array.from({ length: 4 }, (_, i) => layout.xr[0] + (layout.xr[1] - layout.xr[0]) * i / 3)).map(x => <g key={x}><path d={`M${layout.px(x)} ${layout.top}V${layout.bottom}`} stroke="var(--terrain-grid)"/><text x={layout.px(x)} y={layout.bottom + 19} textAnchor="middle" className="lens-axis">{fmt(x)}</text></g>)}
        <g data-explain="median" tabIndex={0} onPointerEnter={showMedian} onPointerLeave={() => setTip(null)} onFocus={showMedian} onBlur={() => setTip(null)} onClick={e => e.stopPropagation()}>
          <path d={`M${layout.medianX} ${layout.top}V${layout.bottom}M${layout.left} ${layout.medianY}H${layout.right}`} stroke="var(--terrain-sep)" strokeDasharray="5 6"/><path d={`M${layout.medianX} ${layout.top}V${layout.bottom}M${layout.left} ${layout.medianY}H${layout.right}`} stroke="transparent" strokeWidth={16} fill="none"/>
          <text className="lens-median" x={layout.medianX} y={layout.bottom + 38} textAnchor="middle">中位 {fmt(layout.mx)}</text><text className="lens-median" x={layout.left - 7} y={layout.medianY - 8} textAnchor="end">中位 {fmt(layout.my)}</text>
        </g>
        {v.quads.map((name, i) => <text key={name} className="lens-quad" x={i % 2 ? layout.right - 9 : layout.left + 9} y={i < 2 ? layout.top + 16 : layout.bottom - 12} textAnchor={i % 2 ? "end" : "start"} data-explain="quad" onPointerEnter={e => explain(e.currentTarget, name, `${i % 2 ? "横轴高于" : "横轴不高于"}中位，${i < 2 ? "纵轴高于" : "纵轴不高于"}中位。${standard}`)} onPointerLeave={() => setTip(null)}>{name}</text>)}
      </> : <text x={size.width / 2} y={size.height / 2} textAnchor="middle" className="lens-axis">当前范围没有满足此视角统计条件的节点</text>}
      <text x={layout.left} y="27" className="lens-axis-title" data-explain="axis" onPointerEnter={e => explain(e.currentTarget, "指标口径", lens === "base" ? "平均成熟度只计已判定条目；未判定不按0计。" : OUTPUT_MEANING)} onPointerLeave={() => setTip(null)}>{v.y} ↑</text>
      <text x={layout.right} y={size.height - 10} textAnchor="end" className="lens-axis-title" data-explain="axis" onPointerEnter={e => explain(e.currentTarget, "指标口径", lens === "base" ? "技术条目数为对数刻度，圆面积表示项目数。" : "均值只除以有记录项目数；不足3项不计算。" + OUTPUT_MEANING)} onPointerLeave={() => setTip(null)}>{v.x} →</text>
      {ap && bp ? <path className="lens-compare-line" d={`M${ap.cx} ${ap.cy}L${bp.cx} ${bp.cy}`}/> : null}
      {layout.points.map(p => {
            const id = p.d.node.id, seat = layout.seats.get(id)!;
            return <g key={id} data-node={id} tabIndex={0} aria-label={`${p.d.node.name}，回车固定，向下展开`} className="lens-node" onPointerEnter={() => { setGuide(id); if (!fixed && !base && !drag.current) {
                setHover({ id, year: null });
                setOpen(true);
            } }} onPointerLeave={() => { setGuide(null); }} onFocus={()=>{setGuide(id);if(!fixed&&!base&&!drag.current){setHover({id,year:null});setOpen(true);}}} onBlur={()=>setGuide(null)} onPointerDown={e => { if (e.button !== 0)
                return; drag.current = { id, x: e.clientX, y: e.clientY, active: false }; e.currentTarget.setPointerCapture(e.pointerId); }} onClick={e => { e.stopPropagation(); if (Date.now() < suppress.current)
                return; cancelClick(); if (e.detail > 1)
                return; timer.current = setTimeout(() => choose(id), 230); }} onDoubleClick={e => { e.stopPropagation(); if (!moving && Date.now() >= suppress.current)
                enter(id); }} onKeyDown={e => { if(moving)return; if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(id);
            } if (e.key === "ArrowDown") {
                e.preventDefault();
                enter(id,true);
            } if (e.key === "Backspace") {
                e.preventDefault();
                back(true);
            } }}>
        <circle cx={p.cx} cy={p.cy} r={Math.max(12, p.r)} fill="transparent"/><circle className="lens-dot" cx={p.cx} cy={p.cy} r={p.r} fill={id === base ? "var(--link)" : id === chosen ? "var(--terrain-dot-on)" : "var(--terrain-dot)"}/><text className="lens-node-name" x={seat.x} y={seat.y} textAnchor="middle">{p.d.node.name}</text>
      </g>;
        })}
      {focused ? <g pointerEvents="none"><path className="lens-guide" d={`M${layout.left} ${focused.cy}H${focused.cx}V${layout.bottom}`}/><text x={focused.cx} y={layout.bottom + 18} textAnchor="middle" className="lens-guide-value">{fmt(focused.x)}</text><text x={layout.left - 9} y={focused.cy + 4} textAnchor="end" className="lens-guide-value">{fmt(focused.y)}</text><text x={layout.left} y={layout.top - 7} className="lens-guide-value">{focused.d.node.name} · 横轴{focused.x > layout.mx ? "高于" : "不高于"}中位 / 纵轴{focused.y > layout.my ? "高于" : "不高于"}中位</text></g> : null}
      {trace ? <line className="lens-compare-line" {...trace} strokeDasharray="4 5"/> : null}
    </svg></div>
    <div className="lens-insufficient">{absent.length?<span className="lens-absent" tabIndex={0} onPointerEnter={e=>explain(e.currentTarget,"未绘入主图的节点",absent.map(d=>d.node.name).join("、"))} onPointerLeave={()=>setTip(null)}>{absent.length} 个{NODE_KINDS[rows[0]?.node.kind??"domain"]}{window.from===null?"没有可确认项目":"在所选年份无立项"}</span>:null}{insufficient.length ? <><span>数据不足</span>{insufficient.map(({ d, value }) => <span key={d.node.id} tabIndex={0} onPointerEnter={e => { explain(e.currentTarget, d.node.name, value.reason!); if (!fixed && !base) {
        setHover({ id: d.node.id, year: null });
        setOpen(true);
    } }} onPointerLeave={() => setTip(null)} onFocus={e => explain(e.currentTarget, d.node.name, value.reason!)}>◌ {d.node.name}</span>)}</> : !absent.length?<span>本层节点均可绘制</span>:null}</div>
    <div className="lens-gestures"><span>◎ 双击深入</span><span>○—○ 拖动两点对比</span><span>↶ 点空白逐步返回</span><span>┆ 悬停虚线看标准</span></div>
    <YearBand model={model} ids={ids} scope={scope} years={data.years} window={window} metric={metric} expanded={expanded} chosen={chosen} baseline={base} onWindow={w => update({ from: w.from === null ? null : String(w.from), to: w.to === null ? null : String(w.to) })} onMetric={m => update({ annual: m })} onExpanded={e => update({ expanded: e ? "1" : null })} onPreview={(id, year) => { if (!fixed && !base) {
        setHover({ id, year });
        setOpen(true);
    } }} onFix={id => { setOpen(true); update({ node: id, pin: id, compare: null }); }} onYearFix={(id, y) => { setOpen(true); update({ node: id, pin: id, compare: null, from: window.from === y && window.to === y ? null : String(y), to: window.from === y && window.to === y ? null : String(y) }); }}/>
  </div>
  <aside className={`lens-inspector ${open ? "is-open" : ""}`} aria-label="研究详情" aria-hidden={!open} inert={!open}>
    <div className="lens-drawer-grip" onPointerDown={e => { drawerDrag.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { if (drawerDrag.current !== null) {
        const dx = e.clientX - drawerDrag.current;
        if (dx > 60)
            setOpen(false);
        else if (dx < -60)
            showLibrary();
    } drawerDrag.current = null; }} onPointerCancel={() => { drawerDrag.current = null; }}><span>{base ? "蓝线对比" : peek ? `${peek} 年预览` : windowLabel(window)}</span><span>← 预览资料库 · 收起 →</span></div>
    <div className="lens-detail-body">{base ? <><h3>并排看两个{NODE_KINDS[d.node.kind]}</h3><div className="lens-pair-names"><span className="lens-a">A / {model.nodes.get(base)!.name}</span><span className="lens-b">B / {model.nodes.get(selected)!.name}</span></div><Compare a={model.measure(base, window)} b={model.measure(selected, window)}/><ProjectYears model={model} ids={[base,selected]} years={data.years} window={window}/><Coverage d={model.measure(base, window)}/><Coverage d={model.measure(selected, window)}/></> : <>
      <h3 tabIndex={0} className="lens-preview-name" onDoubleClick={showLibrary} onKeyDown={e => { if (e.key === "Enter")
            showLibrary(); }} title="双击或回车预览资料库">{d.node.name}</h3><p className="lens-muted">向左拉动顶栏，预览资料库全库概况</p>
      <div className="lens-four"><div><b>{fmt(d.projects)}</b><span>项目</span></div><div><b>{cash(d)}</b><span>批准资助金额</span><small>{d.funded}/{d.projects} 项记录金额</small></div><div><b>{fmt(d.items)}</b><span>技术条目</span><small>{d.items - d.levels[0]} 条已判定</small></div><div><b>{d.listed ? fmt(d.outputs) : "未记录"}</b><span>成果条目 <span tabIndex={0} className="lens-info" onPointerEnter={e => explain(e.currentTarget, "成果统计口径", OUTPUT_MEANING)} onPointerLeave={() => setTip(null)} onFocus={e => explain(e.currentTarget, "成果统计口径", OUTPUT_MEANING)} onBlur={() => setTip(null)}>ⓘ</span></span><small>{d.listed}/{d.projects} 项列有成果</small></div></div>
      <div className="lens-why">{(() => { const p = lensValue(d, lens); if (peek)
            return "年度单元格预览；主图仍按上方年份范围绘制。"; if (p.reason)
            return p.reason; const q = (p.y! > layout.my ? 0 : 2) + (p.x! > layout.mx ? 1 : 0); return <><b>「{v.quads[q]}」</b><span>{v.x} {fmt(p.x!)}，{p.x! > layout.mx ? "高于" : "不高于"}中位 {fmt(layout.mx)}</span><span>{v.y} {fmt(p.y!)}，{p.y! > layout.my ? "高于" : "不高于"}中位 {fmt(layout.my)}</span></>; })()}</div><ProjectYears model={model} ids={[chosen]} years={data.years} window={peek?{from:peek,to:peek}:window}/><Coverage d={d}/>
      {d.node.children.length ? <><h4>{NODE_KINDS[model.nodes.get(d.node.children[0])!.kind]}构成</h4><table className="lens-read-table"><thead><tr><th>名称</th><th>项目</th><th>资助/万</th><th>成果</th></tr></thead><tbody>{d.node.children.map(id => model.measure(id, peek ? { from: peek, to: peek } : window)).map(c => <tr key={c.node.id}><td>{c.node.name}</td><td>{c.projects}</td><td>{c.funded ? fmt(c.funding) : "—"}</td><td>{c.listed ? fmt(c.outputs) : "—"}</td></tr>)}</tbody></table><p className="lens-muted">双击图中节点展开。涉及项目可能重复，各行不可相加。</p></> : <><h4>涉及项目 · 研究方向层到此为止</h4>{d.records.slice(0, 20).map(p => <article key={p.id} className="lens-project">{p.title}<small>{p.year ?? "年份待核对"} · {p.amount === null ? "金额未记录" : `${fmt(p.amount)} 万元`} · {p.outputs === null ? "成果未记录" : `${p.outputs} 项成果`}</small></article>)}</>}
      {d.undated ? <p className="lens-muted">累计含 {d.undated} 个立项年份未确认项目，选择年份时不计入。</p> : null}
    </>}</div>
  </aside>
  {tip ? createPortal(<div ref={tooltip} className="lens-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}><b>{tip.title}</b>{tip.text}</div>, document.body) : null}
  <LibraryPreviewDrawer row={preview} onClose={() => setPreview(null)} research={preview ? model.measure(preview.corpus_id) : undefined}/>
  </div>;
}
function ProjectYears({model,ids,years,window}:{model:AtlasModel;ids:string[];years:number[];window:YearWindow}) {
    const values=ids.map(id=>years.map(y=>model.measure(id,{from:y,to:y}).projects)),peak=Math.max(1,...values.flat());
    if(!years.length)return null;
    return <section className="lens-year-summary" aria-label="各年立项项目分布"><h4>各年立项项目 <small>{years[0]}—{years.at(-1)}</small></h4><div className="lens-spark" style={{gridTemplateColumns:`repeat(${years.length},minmax(0,1fr))`}}>{years.map((y,i)=><div key={y} title={ids.map((id,j)=>`${model.nodes.get(id)?.name} ${y}年 ${values[j][i]} 项目`).join("；")} data-active={window.from===null||y>=window.from&&y<=(window.to??window.from)}><div className="lens-spark-bars">{ids.map((id,j)=><i key={id} style={{height:`${values[j][i]/peak*100}%`,background:ids.length===1||j?"var(--terrain-dot-on)":"var(--link)"}}/>)}</div><span>{String(y).slice(-2)}</span></div>)}</div></section>;
}
function Coverage({ d }: {
    d: AtlasMeasure;
}) { if (d.projects < 3)
    return <p className="lens-muted">{d.projects ? `节点本身只有 ${d.projects} 个项目，不能形成 3 项目均值。` : "所选年份没有立项。"}</p>; const a = d.projects - d.funded, b = d.projects - d.listed; return a || b ? <p className="lens-coverage"><b>{d.node.name} · 资料待补充</b>{a ? `${a} 项未记录批准资助金额。` : ""}{b ? `${b} 项未提供成果列表。` : ""}已列入资料管理员的补录待办。</p> : null; }
function Compare({ a, b }: {
    a: AtlasMeasure;
    b: AtlasMeasure;
}) { const rows = [["项目", fmt(a.projects), fmt(b.projects)], ["批准资助金额", cash(a), cash(b)], ["技术条目", fmt(a.items), fmt(b.items)], ["成果条目", a.listed ? fmt(a.outputs) : "未记录", b.listed ? fmt(b.outputs) : "未记录"], ["平均成熟度", fmt(a.maturity), fmt(b.maturity)], ["4–5档占比", a.landed === null ? "—" : fmt(a.landed) + "%", b.landed === null ? "—" : fmt(b.landed) + "%"], ["均资助/万", a.avgFunding === null ? "不足3项" : fmt(a.avgFunding), b.avgFunding === null ? "不足3项" : fmt(b.avgFunding)], ["均成果/项", a.avgOutputs === null ? "不足3项" : fmt(a.avgOutputs), b.avgOutputs === null ? "不足3项" : fmt(b.avgOutputs)], ["金额覆盖", `${a.funded}/${a.projects}`, `${b.funded}/${b.projects}`], ["成果覆盖", `${a.listed}/${a.projects}`, `${b.listed}/${b.projects}`]]; return <table className="lens-read-table"><thead><tr><th>指标</th><th>A</th><th>B</th></tr></thead><tbody>{rows.map(([k, x, y]) => <tr key={k}><td>{k}</td><td className="lens-a">{x}</td><td className="lens-b">{y}</td></tr>)}</tbody></table>; }
