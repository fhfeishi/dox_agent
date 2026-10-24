import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ALL_YEARS, ANNUAL_METRICS, ANNUAL_NAMES, type AnnualMetric, type AtlasMeasure, type AtlasModel, type YearWindow } from "../../domainAtlas";
const fmt = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const known = (d: AtlasMeasure, metric: AnnualMetric) => metric === "funding" ? d.funded > 0 : metric === "outputs" ? d.listed > 0 : true;
export function YearBand({ model, ids, scope, years, window, metric, expanded, chosen, baseline, onWindow, onMetric, onExpanded, onPreview, onFix, onYearFix }: {
    model: AtlasModel;
    ids: string[];
    scope: string | null;
    years: number[];
    window: YearWindow;
    metric: AnnualMetric;
    expanded: boolean;
    chosen: string;
    baseline: string | null;
    onWindow: (w: YearWindow) => void;
    onMetric: (m: AnnualMetric) => void;
    onExpanded: (v: boolean) => void;
    onPreview: (id: string, year: number | null) => void;
    onFix: (id: string) => void;
    onYearFix: (id: string, y: number) => void;
}) {
    const drag = useRef<{
        index: number;
        x: number;
        moved: boolean;
        end: number;
    } | null>(null), pull = useRef<number | null>(null);
    const canvas=useRef<HTMLDivElement>(null),[viewport,setViewport]=useState({width:750,font:14}),[draft,setDraft]=useState<YearWindow|null>(null);
    useLayoutEffect(()=>{
        const el=canvas.current;if(!el)return;
        const read=()=>{const width=Math.max(750,el.clientWidth),font=parseFloat(getComputedStyle(el).getPropertyValue("--text-body"))||14;setViewport(old=>old.width===width&&old.font===font?old:{width,font});};
        const observer=new ResizeObserver(read);observer.observe(el);globalThis.addEventListener("resize",read);read();
        return()=>{observer.disconnect();globalThis.removeEventListener("resize",read);};
    },[years.length]);
    const activeWindow=draft??window,scale=viewport.font/12,bandHeight=130*scale;
    const focus = baseline ? [baseline, chosen] : [chosen];
    const all = (year: number) => scope ? model.measure(scope, { from: year, to: year }) : null;
    const sums = years.map(y => all(y)?.[metric] ?? ids.reduce((n, id) => n + model.measure(id, { from: y, to: y })[metric], 0));
    const peak = Math.max(1, ...sums), bandLeft = viewport.width*.15625, w = viewport.width*.78125 / Math.max(years.length, 1);
    const matrixPeak = Math.max(1, ...ids.flatMap(id => years.map(y => model.measure(id, { from: y, to: y })[metric])));
    const indexAt = (e: PointerEvent<SVGSVGElement>) => { const p = e.currentTarget.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const x = p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse()).x; return Math.max(0, Math.min(years.length - 1, Math.floor((x - bandLeft) / w))); };
    const selectYear = (y: number) => onWindow(window.from === y && window.to === y ? ALL_YEARS : { from: y, to: y });
    const inWindow = (y: number) => activeWindow.from === null || y >= activeWindow.from && y <= (activeWindow.to ?? activeWindow.from);
    const toggle = () => onExpanded(!expanded);
    if (!years.length)
        return <p className="lens-muted">暂无已确认的立项年份；当前显示累计数据。</p>;
    return <div className="lens-year-band">
    <div className="lens-year-head"><div><b>立项年度</b><span aria-live="polite">{activeWindow.from === null ? "全部年份" : activeWindow.from === activeWindow.to ? `${activeWindow.from} 年` : `${activeWindow.from}—${activeWindow.to} 年`}</span><small>{draft?"松开后应用年份范围":"点一年 · 拖动框选 · 再点恢复全部"}</small></div>
      <label className="lens-metric"><span>{ANNUAL_METRICS.map(m => <i key={m} data-active={m === metric}>{({ projects: "项目", funding: "资金", items: "技术", outputs: "成果" })[m]}</i>)}</span><input type="range" min="0" max="3" step="1" value={ANNUAL_METRICS.indexOf(metric)} aria-label="年度分布指标" aria-valuetext={ANNUAL_NAMES[metric]} onChange={e => onMetric(ANNUAL_METRICS[+e.target.value])}/></label>
    </div>
    <p className="lens-year-legend">灰条：当前范围去重合计 · {focus.map((id, i) => <span key={id} className={baseline ? (i ? "lens-b" : "lens-a") : "lens-b"}>{baseline ? (i ? " B / " : " A / ") : "绿条 / "}{model.nodes.get(id)?.name}</span>)} · {ANNUAL_NAMES[metric]}</p>
    <div ref={canvas} className="lens-year-scroll"><svg width={viewport.width} height={bandHeight} viewBox={`0 0 ${viewport.width} ${bandHeight}`} tabIndex={0} role="group" aria-label="选择立项年份，点选或拖动框选，Esc取消，方向键单年，Home恢复全部" className="lens-band-svg" data-selecting={draft !== null} onPointerDown={e => { if (e.button !== 0)
        return; const year=(e.target as Element).closest("[data-year]")?.getAttribute("data-year");if(!year)return;const index=years.indexOf(Number(year));if(index<0)return;e.currentTarget.focus({preventScroll:true});drag.current = { index, end:index,x: e.clientX, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const d = drag.current; if (!d)
        return; if (Math.abs(e.clientX - d.x) > 5)
        d.moved = true; if (!d.moved)
        return; const at = indexAt(e);d.end=at;setDraft({ from: years[Math.min(at, d.index)], to: years[Math.max(at, d.index)] }); }} onPointerUp={() => { const d = drag.current; drag.current = null;setDraft(null);if(!d)return;if(d.moved)onWindow({from:years[Math.min(d.index,d.end)],to:years[Math.max(d.index,d.end)]});else
        selectYear(years[d.index]); }} onPointerCancel={() => { drag.current = null;setDraft(null); }} onKeyDown={e => { if(e.key==="Escape"&&drag.current){e.preventDefault();e.stopPropagation();drag.current=null;setDraft(null);return;}if (e.key === "Home") {
        e.preventDefault();
        onWindow(ALL_YEARS);
    }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const left = e.key === "ArrowLeft", edge = left ? window.from : window.to;
        const i = Math.max(0, Math.min(years.length - 1, years.indexOf(edge ?? years[0]) + (left ? -1 : 1)));
        onWindow(e.shiftKey ? (left ? { from: years[i], to: window.to ?? years[i] } : { from: window.from ?? years[0], to: years[i] }) : { from: years[i], to: years[i] });
    } }}>
      <text x="5" y={89*scale} fill="var(--muted-cool)">{ANNUAL_NAMES[metric]}</text>
      {years.map((y, i) => {
            const x = bandLeft + i * w;
            return <g key={y} data-year={y}><rect x={x} y={3*scale} width={w} height={125*scale} fill={inWindow(y) ? "var(--terrain-empty)" : "transparent"}/><rect x={x + 12} y={(98 - sums[i] / peak * 52)*scale} width={w - 24} height={sums[i] / peak * 52*scale} fill="var(--track)"/>
        {focus.map((id, j) => { const d = model.measure(id, { from: y, to: y }), h = d[metric] / peak * 52*scale, bx = x + w / 2 + (focus.length > 1 ? (j ? 3*scale : -16*scale) : -8*scale), color = baseline ? (j ? "var(--terrain-dot-on)" : "var(--link)") : "var(--terrain-dot-on)"; return <g key={id}><text x={x + w / 2} y={(18 + j * 16)*scale} textAnchor="middle" fill={color}>{baseline ? (j ? "B " : "A ") : ""}{!d.projects ? "—" : known(d, metric) ? fmt(d[metric]) : "未记录"}</text>{d.projects && !known(d, metric) ? <circle cx={bx + 7*scale} cy={89*scale} r={5*scale} fill="none" stroke={color} strokeDasharray="2 3"/> : <rect x={bx} y={98*scale - h} width={14*scale} height={h} fill={color} opacity={inWindow(y) ? 1 : .4}/>}</g>; })}<text x={x + w / 2} y={121*scale} textAnchor="middle" fill="var(--muted-cool)">{y}</text></g>;
        })}
    </svg></div>
    <div className="lens-pull" role="separator" tabIndex={0} aria-label="点击或拖动展开年度明细，回车切换，Esc取消拖动" aria-controls="lens-annual-details" aria-valuemin={0} aria-valuemax={1} aria-valuenow={expanded ? 1 : 0} onPointerDown={e => { if(e.button!==0)return;e.currentTarget.focus({preventScroll:true});pull.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { if(pull.current!==null){if(Math.abs(e.clientY-pull.current)>24)onExpanded(e.clientY>pull.current);else toggle();}pull.current=null; }} onPointerCancel={() => { pull.current = null; }} onKeyDown={e => { if(e.key==="Escape"&&pull.current!==null){e.preventDefault();e.stopPropagation();pull.current=null;return;}if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
    } }}>
      <i />{expanded ? "点击或上推，收起年度明细" : "点击或下拉，展开各领域年度分布"}
    </div>
    {expanded ? <div id="lens-annual-details" className="lens-matrix"><table><colgroup><col style={{ width: "15.625%" }}/>{years.map(y => <col key={y} style={{ width: `${78.125 / years.length}%` }}/>)}<col style={{ width: "6.25%" }}/></colgroup><caption>{ANNUAL_NAMES[metric]} · 列与上方年份对齐，行尾为所选范围合计</caption><thead><tr><th>当前层</th>{years.map(y => <th key={y}>{y}</th>)}<th>合计</th></tr></thead><tbody>{ids.map(id => { const total = model.measure(id, window); return <tr key={id}><th tabIndex={0} onClick={() => onFix(id)} onKeyDown={e => { if (e.key === "Enter")
        onFix(id); }}>{model.nodes.get(id)?.name}</th>{years.map(y => { const d = model.measure(id, { from: y, to: y }); return <td key={y} data-selected={inWindow(y)} tabIndex={0} aria-label={`${model.nodes.get(id)?.name} ${y} 年`} onPointerEnter={() => { if (!baseline)
        onPreview(id, y); }} onPointerLeave={() => onPreview(id, null)} onClick={() => onYearFix(id, y)} onKeyDown={e => { if (e.key === "Enter")
        onYearFix(id, y); }}>{d.projects ? (known(d, metric) ? <span className="lens-cell-value"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r={Math.sqrt(d[metric] / matrixPeak) * 8} fill={id === baseline ? "var(--link)" : id === chosen ? "var(--terrain-dot-on)" : "var(--terrain-dot)"}/></svg>{fmt(d[metric])}</span> : <span title="有项目，但未记录该项">◌</span>) : ""}</td>; })}<td>{!total.projects ? "0" : known(total, metric) ? fmt(total[metric]) : "—"}</td></tr>; })}</tbody></table><p className="lens-muted">◌ 有项目但未记录；空白为没有立项。各行可能涉及同一项目，不能相加。</p></div> : null}
  </div>;
}
