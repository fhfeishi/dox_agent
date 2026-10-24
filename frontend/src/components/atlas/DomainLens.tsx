import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { createPortal } from "react-dom";
import type { LibraryOverview } from "../../api";
import {
  ALL_YEARS,
  ANNUAL_METRICS,
  LENSES,
  NODE_KINDS,
  OUTPUT_MEANING,
  atlasLayout,
  constrainAtlasView,
  atlasQuery,
  buildAtlas,
  type AnnualMetric,
  type AtlasData,
  type Lens,
  type YearWindow,
} from "../../domainAtlas";
import { LibraryPreviewDrawer } from "../LibraryPreviewDrawer";
import { YearBand } from "./YearBand";
import { useAtlasMotion } from "./useAtlasMotion";
import { usePanZoom } from "./usePanZoom";
import { PanZoomControls } from "./PanZoomControls";
import "./domain-lens.css";
import { fmt, windowLabel } from "./lensFormat";
import { LensInspector } from "./LensInspector";
import { useLensGestures } from "./useLensGestures";
type Tip = {
  title: string;
  text: string;
  x: number;
  y: number;
};
export function DomainLens({
  libraries,
  reveal,
}: {
  libraries: LibraryOverview[];
  reveal?: {
    id: string;
    at: number;
  };
}) {
  const query = useQuery(atlasQuery);
  if (query.isLoading)
    return (
      <p role="status" className="lens-muted">
        正在读取领域项目、批准资助金额与成果记录…
      </p>
    );
  if (query.error || !query.data)
    return (
      <p role="alert" className="lens-error">
        {(query.error as Error)?.message ?? "领域记录暂不可读"}
      </p>
    );
  return (
    <LensMap
      key={query.data.domains.map((d) => d.id).join("|")}
      data={query.data}
      libraries={libraries}
      reveal={reveal}
    />
  );
}
function LensMap({
  data,
  libraries,
  reveal,
}: {
  data: AtlasData;
  libraries: LibraryOverview[];
  reveal?: {
    id: string;
    at: number;
  };
}) {
  const model = useMemo(() => buildAtlas(data), [data]),
    [search, setSearch] = useSearchParams();
  const scope = model.nodes.get(search.get("layer") ?? "")?.children.length
    ? search.get("layer")
    : null;
  const ids = scope ? model.nodes.get(scope)!.children : model.roots;
  const lens: Lens =
    search.get("lens") === "money" || search.get("lens") === "impact"
      ? (search.get("lens") as Lens)
      : "base";
  const from = Number(search.get("from")),
    to = Number(search.get("to"));
  const window: YearWindow =
    data.years.includes(from) && data.years.includes(to) && from <= to
      ? { from, to }
      : ALL_YEARS;
  const metric: AnnualMetric = ANNUAL_METRICS.includes(
    search.get("annual") as AnnualMetric,
  )
    ? (search.get("annual") as AnnualMetric)
    : "projects";
  const expanded = search.get("expanded") === "1";
  const fixed = ids.includes(search.get("pin") ?? "")
    ? search.get("pin")
    : null;
  const selected = ids.includes(search.get("node") ?? "")
    ? search.get("node")!
    : ids[0];
  const base =
    ids.includes(search.get("compare") ?? "") &&
    search.get("compare") !== selected
      ? search.get("compare")
      : null;
  const [hover, setHover] = useState<{
      id: string;
      year: number | null;
    } | null>(null),
    [guide, setGuide] = useState<string | null>(null),
    [tip, setTip] = useState<Tip | null>(null),
    [preview, setPreview] = useState<LibraryOverview | null>(null),
    [open, setOpen] = useState(() => globalThis.innerWidth > 850);
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  const blankSelection = useRef<{
    search: string;
    open: boolean;
    at: number;
  } | null>(null);
  const chosen =
    (!fixed && !base && hover && ids.includes(hover.id) ? hover.id : null) ??
    fixed ??
    selected;
  const peek = !fixed && !base && hover?.id === chosen ? hover.year : null;
  const d = model.measure(chosen, peek ? { from: peek, to: peek } : window);
  const wrap = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    tooltip = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    [size, setSize] = useState({ width: 760, height: 400, font: 16 }),
    [panelHeight, setPanelHeight] = useState(850);
  const dismissTip = () => setTip(null);
  const {
    drag,
    trace,
    setTrace,
    suppress,
    drawerDrag,
    previewTimer,
    cancelPreview,
  } = useLensGestures();
  const nextFocus = useRef<string | null>(null);
  const update = (values: Record<string, string | null>) => {
    cancelPreview();
    setCompareFrom(null);

    drag.current = null;
    setTrace(null);
    setHover(null);
    setGuide(null);
    setTip(null);
    setSearch(
      (old) => {
        const next = new URLSearchParams(old);
        for (const [k, v] of Object.entries(values)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  };
  const choose = (id: string) => {
    setOpen(true);
    if (compareFrom) {
      if (compareFrom !== id)
        update({ compare: compareFrom, node: id, pin: null });
      return;
    }
    update({ node: id, pin: fixed === id ? null : id, compare: null });
  };
  const back = (restoreFocus = false) => {
    if (base) update({ compare: null });
    else if (fixed) update({ pin: null });
    else if (scope) {
      if (restoreFocus) nextFocus.current = scope;
      update({ layer: model.nodes.get(scope)!.parent, node: scope, pin: null });
    } else setOpen(false);
  };
  function navigateTo(layer: string | null) {
    let node = scope;
    while (node && model.nodes.get(node)?.parent !== layer)
      node = model.nodes.get(node)?.parent ?? null;
    update({ layer, node: node ?? ids[0], pin: null, compare: null });
    setOpen(true);
  }
  function endPreview() {
    cancelPreview();
    previewTimer.current = setTimeout(() => setHover(null), 150);
  }
  function clearPreview() {
    cancelPreview();
    setHover(null);
  }
  const enter = (id: string, restoreFocus = false) => {
    const n = model.nodes.get(id)!;
    setOpen(true);
    if (n.children.length) {
      if (restoreFocus) nextFocus.current = n.children[0];
      update({ layer: id, node: n.children[0], pin: null, compare: null });
    } else update({ node: id, pin: id, compare: null });
  };
  useLayoutEffect(() => {
    const el = wrap.current,
      main = stage.current;
    if (!el || !main) return;
    const read = () => {
      const font =
        parseFloat(getComputedStyle(el).getPropertyValue("--text-emphasis")) ||
        16;
      const matrix = main.querySelector(".lens-matrix");
      const mainBox = main.getBoundingClientRect(),
        plotBox = el.getBoundingClientRect();
      const header = plotBox.top - mainBox.top;
      const footer =
        mainBox.bottom -
        plotBox.bottom -
        (matrix?.getBoundingClientRect().height ?? 0);
      const available =
        main.closest("main")?.clientHeight ?? globalThis.innerHeight - 60;
      const width = Math.max(660, Math.floor(plotBox.width));
      const height = Math.round(
        Math.max(414, Math.min(1000, available - header - footer)),
      );
      setSize((old) =>
        old.width === width && old.height === height && old.font === font
          ? old
          : { width, height, font },
      );
      const h = Math.ceil(
        main.getBoundingClientRect().height -
          (matrix?.getBoundingClientRect().height ?? 0),
      );
      setPanelHeight((old) => (Math.abs(old - h) < 1 ? old : Math.max(440, h)));
    };
    const observer = new ResizeObserver(read);
    observer.observe(el);
    observer.observe(main);
    globalThis.addEventListener("resize", read);
    read();
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", read);
    };
  }, []);
  useEffect(() => {
    setHover(null);
    setGuide(null);
    setTip(null);
  }, [search]);
  useLayoutEffect(() => {
    if (!tip || !tooltip.current) return;
    const h = tooltip.current.getBoundingClientRect().height;
    tooltip.current.style.top =
      Math.max(12, Math.min(tip.y, globalThis.innerHeight - h - 12)) + "px";
  }, [tip]);
  const lastReveal = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      reveal &&
      reveal.at !== lastReveal.current &&
      model.nodes.has(reveal.id)
    ) {
      lastReveal.current = reveal.at;
      setSearch(
        (old) => {
          const next = new URLSearchParams(old);
          next.delete("layer");
          next.delete("compare");
          next.set("node", reveal.id);
          next.set("pin", reveal.id);
          return next;
        },
        { replace: true },
      );
      setOpen(true);
    }
  }, [reveal, model, setSearch]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || preview) return;
      if (drag.current) {
        e.preventDefault();
        drag.current = null;
        setTrace(null);
        suppress.current = Date.now() + 350;
        return;
      }
      if (drawerDrag.current !== null) {
        drawerDrag.current = null;
        return;
      }
      if (compareFrom) {
        setCompareFrom(null);
        return;
      }
      if (helpOpen) {
        setHelpOpen(false);
        return;
      }
      if (tip) {
        setTip(null);
        return;
      }
      if (base || fixed) {
        setSearch(
          (old) => {
            const next = new URLSearchParams(old);
            next.delete(base ? "compare" : "pin");
            return next;
          },
          { replace: true },
        );
      } else setOpen(false);
      setTip(null);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [base, fixed, preview, tip, setSearch, compareFrom, helpOpen]);
  const rows = useMemo(
    () =>
      ids.map((id) => model.measure(id, { from: window.from, to: window.to })),
    [ids, model, window.from, window.to],
  );
  const home = useMemo(
    () => atlasLayout(rows, lens, size.width, size.height, size.font),
    [rows, lens, size],
  );
  const pan = usePanZoom(
    svg,
    home,
    `${lens}|${scope}|${window.from}|${window.to}`,
    (next) => constrainAtlasView(home, next),
  );
  const clip = useId();
  const target = useMemo(
    () => atlasLayout(rows, lens, size.width, size.height, size.font, pan.view),
    [rows, lens, size, pan.view],
  );
  const { layout, moving } = useAtlasMotion(
      target,
      `${lens}|${window.from}|${window.to}`,
      scope ?? "root",
    ),
    v = LENSES[lens];
  useLayoutEffect(() => {
    if (
      !nextFocus.current ||
      !svg.current ||
      layout.points.some((p) => !ids.includes(p.d.node.id))
    )
      return;
    const nodes = [...svg.current.querySelectorAll<SVGGElement>("[data-node]")];
    const node =
      nodes.find((n) => n.getAttribute("data-node") === nextFocus.current) ??
      nodes[0] ??
      svg.current;
    node.focus({ preventScroll: true });
    nextFocus.current = null;
  }, [layout, ids]);
  const focused = moving
    ? undefined
    : layout.points.find((p) => p.d.node.id === (guide ?? fixed));
  const absent = rows.filter((d) => !d.projects),
    insufficient = layout.missing.filter((p) => p.d.projects > 0);
  const ap = layout.points.find((p) => p.d.node.id === base),
    bp = layout.points.find((p) => p.d.node.id === selected);
  const explain = (el: Element, title: string, text: string) => {
    const r = el.getBoundingClientRect(),
      width = Math.min(
        globalThis.innerWidth - 24,
        Math.min(440, Math.max(300, globalThis.innerWidth * 0.2)),
      );
    setTip({
      title,
      text,
      x: Math.max(12, Math.min(globalThis.innerWidth - width - 12, r.left)),
      y: Math.max(12, r.bottom + 8),
    });
  };
  const standard = `中位数取自${windowLabel(window)}、当前层 ${layout.points.length} 个可绘制节点；横轴 ${fmt(layout.mx)}，纵轴 ${fmt(layout.my)}。随年份、视角和层级重算，恰好相等算“不高于”。`;
  const showMedian = (e: { currentTarget: Element }) =>
    explain(e.currentTarget, "四象限如何划分？", standard);
  const path: string[] = [];
  let ancestor = scope ? model.nodes.get(scope) : undefined;
  while (ancestor) {
    path.unshift(ancestor.id);
    ancestor = ancestor.parent ? model.nodes.get(ancestor.parent) : undefined;
  }
  const asPoint = (e: PointerEvent<SVGSVGElement>) => {
    const p = e.currentTarget.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
  };
  const showLibrary = () => {
    const row = libraries.find((r) => r.corpus_id === d.node.domain);
    if (row) {
      const full = model.measure(d.node.domain);
      setPreview({
        ...row,
        funding: {
          total_yuan: String(full.funding * 10000),
          projects: full.funded,
          scope: "awarded",
          label: "批准资助金额",
        },
      });
      setTip(null);
    }
  };
  const beginPlotPan: NonNullable<
    React.ComponentProps<"svg">["onPointerDown"]
  > = (e) => {
    suppress.current = 0;
    pan.down(e);
  };
  const resetFromBlank: NonNullable<
    React.ComponentProps<"svg">["onDoubleClick"]
  > = (e) => {
    if (!(e.target as Element).closest("[data-node],[data-explain]")) {
      if (
        blankSelection.current &&
        performance.now() - blankSelection.current.at < 450
      ) {
        setSearch(new URLSearchParams(blankSelection.current.search), {
          replace: true,
        });
        setOpen(blankSelection.current.open);
        blankSelection.current = null;
      }
      pan.reset();
    }
  };
  const clearBlankSelection: NonNullable<
    React.ComponentProps<"svg">["onClick"]
  > = (e) => {
    if (
      moving ||
      (e.target as Element).closest("[data-node],[data-explain]") ||
      Date.now() < suppress.current ||
      pan.suppressClick() ||
      e.detail !== 1
    )
      return;
    blankSelection.current = {
      search: search.toString(),
      open,
      at: performance.now(),
    };
    setCompareFrom(null);
    if (base) update({ compare: null });
    else if (fixed) update({ pin: null });
  };
  const moveComparison: NonNullable<
    React.ComponentProps<"svg">["onPointerMove"]
  > = (e) => {
    const a = drag.current;
    if (!a) return;
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 7) a.active = true;
    if (a.active) {
      const current = asPoint(e),
        start = e.currentTarget.createSVGPoint();
      start.x = a.x;
      start.y = a.y;
      const p = start.matrixTransform(
        e.currentTarget.getScreenCTM()!.inverse(),
      );
      setTrace({ x1: p.x, y1: p.y, x2: current.x, y2: current.y });
    }
  };
  const finishComparison: NonNullable<
    React.ComponentProps<"svg">["onPointerUp"]
  > = (e) => {
    const a = drag.current;
    drag.current = null;
    setTrace(null);
    if (!a?.active) return;
    suppress.current = Date.now() + 350;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-node]")
      ?.getAttribute("data-node");
    if (target && target !== a.id) {
      setOpen(true);
      update({ compare: a.id, node: target, pin: null });
    }
  };
  const cancelComparison: NonNullable<
    React.ComponentProps<"svg">["onPointerCancel"]
  > = () => {
    drag.current = null;
    setTrace(null);
  };
  const dismissMedian: NonNullable<
    React.ComponentProps<"g">["onPointerLeave"]
  > = () => setTip(null);
  const blurMedian: NonNullable<React.ComponentProps<"g">["onBlur"]> = () =>
    setTip(null);
  const keepMedianSelection: NonNullable<
    React.ComponentProps<"g">["onClick"]
  > = (e) => e.stopPropagation();
  const explainVerticalAxis: NonNullable<
    React.ComponentProps<"text">["onPointerEnter"]
  > = (e) =>
    explain(
      e.currentTarget,
      "指标口径",
      lens === "base"
        ? "平均成熟度只计已判定条目；未判定不按0计。"
        : OUTPUT_MEANING,
    );
  const dismissVerticalAxis: NonNullable<
    React.ComponentProps<"text">["onPointerLeave"]
  > = () => setTip(null);
  const explainHorizontalAxis: NonNullable<
    React.ComponentProps<"text">["onPointerEnter"]
  > = (e) =>
    explain(
      e.currentTarget,
      "指标口径",
      lens === "base"
        ? "技术条目数为对数刻度，圆面积表示项目数。"
        : "均值只除以有记录项目数；不足3项不计算。" + OUTPUT_MEANING,
    );
  const dismissHorizontalAxis: NonNullable<
    React.ComponentProps<"text">["onPointerLeave"]
  > = () => setTip(null);
  const explainAbsentNodes: NonNullable<
    React.ComponentProps<"span">["onPointerEnter"]
  > = (e) =>
    explain(
      e.currentTarget,
      "未绘入主图的节点",
      absent.map((d) => d.node.name).join("、"),
    );
  const dismissAbsentNodes: NonNullable<
    React.ComponentProps<"span">["onPointerLeave"]
  > = () => setTip(null);
  const selectYears: NonNullable<
    React.ComponentProps<typeof YearBand>["onWindow"]
  > = (w) =>
    update({
      from: w.from === null ? null : String(w.from),
      to: w.to === null ? null : String(w.to),
    });
  const selectAnnualMetric: NonNullable<
    React.ComponentProps<typeof YearBand>["onMetric"]
  > = (m) => update({ annual: m });
  const toggleAnnualDetails: NonNullable<
    React.ComponentProps<typeof YearBand>["onExpanded"]
  > = (e) => update({ expanded: e ? "1" : null });
  const previewAnnualNode: NonNullable<
    React.ComponentProps<typeof YearBand>["onPreview"]
  > = (id, year) => {
    if (year === null) {
      endPreview();
      return;
    }
    cancelPreview();
    if (!fixed && !base) {
      setHover({ id, year });
      setOpen(true);
    }
  };
  const fixAnnualNode: NonNullable<
    React.ComponentProps<typeof YearBand>["onFix"]
  > = (id) => {
    setOpen(true);
    update({ node: id, pin: id, compare: null });
  };
  const fixAnnualYear: NonNullable<
    React.ComponentProps<typeof YearBand>["onYearFix"]
  > = (id, y) => {
    setOpen(true);
    update({
      node: id,
      pin: id,
      compare: null,
      from: window.from === y && window.to === y ? null : String(y),
      to: window.from === y && window.to === y ? null : String(y),
    });
  };
  const closeLibraryPreview: NonNullable<
    React.ComponentProps<typeof LibraryPreviewDrawer>["onClose"]
  > = () => setPreview(null);
  if (!selected || !d) return <p role="status">此层暂无可浏览节点。</p>;
  return (
    <div
      className="domain-lens"
      data-testid="domain-lens"
      data-moving={moving}
      style={{ "--lens-stage-height": `${panelHeight}px` } as CSSProperties}
    >
      <div ref={stage} className="lens-main">
        <div className="lens-views">
          {(Object.keys(LENSES) as Lens[]).map((k) => {
            const selectLens: NonNullable<
              React.ComponentProps<"button">["onClick"]
            > = () =>
              update({
                lens: k,
                annual: {
                  base: "projects",
                  money: "funding",
                  impact: "outputs",
                }[k],
              });
            return (
              <button
                key={k}
                type="button"
                aria-pressed={lens === k}
                onClick={selectLens}
              >
                {LENSES[k].name}
              </button>
            );
          })}
        </div>
        <div className="lens-head">
          <nav aria-label="当前分析层级">
            <button
              type="button"
              aria-current={!scope ? "page" : undefined}
              onClick={() => navigateTo(null)}
            >
              全部领域
            </button>
            {path.map((id) => (
              <span key={id}>
                {" "}
                ›{" "}
                <button
                  type="button"
                  aria-current={scope === id ? "page" : undefined}
                  onClick={() => navigateTo(id)}
                >
                  {model.nodes.get(id)?.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="lens-command-bar">
            <div className="lens-command-title">
              {scope ? (
                <button
                  type="button"
                  className="lens-back"
                  onClick={() =>
                    navigateTo(model.nodes.get(scope)?.parent ?? null)
                  }
                >
                  ‹ 返回{" "}
                  {model.nodes.get(model.nodes.get(scope)?.parent ?? "")
                    ?.name ?? "全部领域"}
                </button>
              ) : null}
              <h3>{v.question}</h3>
            </div>
            <span className="lens-command-state" aria-live="polite">
              {compareFrom
                ? `选择要对比的${NODE_KINDS[d.node.kind]} · Esc 取消`
                : moving
                  ? "正在切换…"
                  : base
                    ? "蓝线对比中"
                    : fixed
                      ? "已固定 · 再点解除"
                      : "悬停预览 · 单击固定"}
            </span>
            <div className="lens-plot-tools">
              <PanZoomControls map={pan} className="lens-zoom" />
              <span className="lens-operation">
                <button
                  type="button"
                  aria-expanded={helpOpen}
                  aria-controls={helpId}
                  onClick={() => setHelpOpen(!helpOpen)}
                >
                  ? 操作
                </button>
                {helpOpen ? (
                  <span
                    id={helpId}
                    className="lens-operation-card"
                    role="tooltip"
                  >
                    单击固定，双击深入；拖动两点连线对比。
                    <br />
                    滚轮缩放，放大后空白拖动平移；双击空白或0复位。
                    <br />+ / − 缩放，↓ 深入，Backspace返回，Esc取消。
                    <br />
                    点空白只退出对比或解除固定；虚线为当前层中位数。
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </div>
        <div ref={wrap} className="lens-plot-scroll">
          <svg
            ref={svg}
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            tabIndex={0}
            role="group"
            aria-label="研究领域四象限图"
            onKeyDown={pan.key}
            onPointerDown={beginPlotPan}
            onDoubleClick={resetFromBlank}
            className="lens-plot"
            onClick={clearBlankSelection}
            onPointerMove={moveComparison}
            onPointerUp={finishComparison}
            onPointerCancel={cancelComparison}
          >
            <defs>
              <clipPath id={clip}>
                <rect
                  x={layout.left}
                  y={layout.top}
                  width={layout.right - layout.left}
                  height={layout.bottom - layout.top}
                />
              </clipPath>
            </defs>
            <rect
              data-plot-background="true"
              x={layout.left}
              y={layout.top}
              width={layout.right - layout.left}
              height={layout.bottom - layout.top}
              fill="var(--terrain-plot)"
            />
            {layout.points.length ? (
              <>
                <rect
                  x={layout.left}
                  y={layout.top}
                  width={Math.max(
                    0,
                    Math.min(layout.right, layout.medianX) - layout.left,
                  )}
                  height={Math.max(
                    0,
                    Math.min(layout.bottom, layout.medianY) - layout.top,
                  )}
                  fill="var(--terrain-empty)"
                />
                <rect
                  x={Math.max(layout.left, layout.medianX)}
                  y={layout.top}
                  width={Math.max(
                    0,
                    layout.right - Math.max(layout.left, layout.medianX),
                  )}
                  height={Math.max(
                    0,
                    Math.min(layout.bottom, layout.medianY) - layout.top,
                  )}
                  fill="var(--ok-bg)"
                />
                <rect
                  x={layout.left}
                  y={Math.max(layout.top, layout.medianY)}
                  width={Math.max(
                    0,
                    Math.min(layout.right, layout.medianX) - layout.left,
                  )}
                  height={Math.max(
                    0,
                    layout.bottom - Math.max(layout.top, layout.medianY),
                  )}
                  fill="var(--terrain-shallow)"
                />
                {Array.from({ length: 5 }, (_, i) => {
                  const y =
                    layout.yr[0] + ((layout.yr[1] - layout.yr[0]) * i) / 4;
                  return (
                    <g key={i}>
                      <path
                        d={`M${layout.left} ${layout.py(y)}H${layout.right}`}
                        stroke="var(--terrain-grid)"
                      />
                      <text
                        visibility={
                          Math.abs(layout.py(y) - layout.medianY) <
                          size.font * 1.6
                            ? "hidden"
                            : undefined
                        }
                        x={layout.left - 8}
                        y={layout.py(y) + 4}
                        textAnchor="end"
                        className="lens-axis"
                      >
                        {fmt(y)}
                      </text>
                    </g>
                  );
                })}
                {(lens === "base"
                  ? [1, 3, 10, 30, 100, 300, 1000, 3000].filter(
                      (x) =>
                        Math.log10(x) >= layout.xr[0] &&
                        Math.log10(x) <= layout.xr[1],
                    )
                  : Array.from(
                      { length: 4 },
                      (_, i) =>
                        layout.xr[0] + ((layout.xr[1] - layout.xr[0]) * i) / 3,
                    )
                ).map((x) => {
                  return (
                    <g key={x}>
                      <path
                        d={`M${layout.px(x)} ${layout.top}V${layout.bottom}`}
                        stroke="var(--terrain-grid)"
                      />
                      <text
                        visibility={
                          Math.abs(layout.px(x) - layout.medianX) <
                          (fmt(x).length + fmt(layout.mx).length + 3) *
                            size.font *
                            0.4
                            ? "hidden"
                            : undefined
                        }
                        x={layout.px(x)}
                        y={layout.bottom + 19}
                        textAnchor="middle"
                        className="lens-axis"
                      >
                        {fmt(x)}
                      </text>
                    </g>
                  );
                })}
                <g
                  data-explain="median"
                  tabIndex={0}
                  onPointerEnter={showMedian}
                  onPointerLeave={dismissMedian}
                  onFocus={showMedian}
                  onBlur={blurMedian}
                  onClick={keepMedianSelection}
                >
                  <path
                    clipPath={`url(#${clip})`}
                    d={`M${layout.medianX} ${layout.top}V${layout.bottom}M${layout.left} ${layout.medianY}H${layout.right}`}
                    stroke="var(--terrain-sep)"
                    strokeDasharray="5 6"
                  />
                  <path
                    clipPath={`url(#${clip})`}
                    d={`M${layout.medianX} ${layout.top}V${layout.bottom}M${layout.left} ${layout.medianY}H${layout.right}`}
                    stroke="transparent"
                    strokeWidth={16}
                    fill="none"
                  />
                  <text
                    className="lens-median"
                    x={layout.medianX}
                    y={layout.bottom + 19}
                    textAnchor="middle"
                  >
                    中位 {fmt(layout.mx)}
                  </text>
                  <text
                    className="lens-median"
                    x={layout.left + 8}
                    y={layout.medianY - 8}
                    textAnchor="start"
                  >
                    中位 {fmt(layout.my)}
                  </text>
                </g>
                {v.quads.map((name, i) => {
                  const explainQuadrant: NonNullable<
                    React.ComponentProps<"text">["onPointerEnter"]
                  > = (e) => explain(e.currentTarget, name, standard);
                  const dismissQuadrant: NonNullable<
                    React.ComponentProps<"text">["onPointerLeave"]
                  > = () => setTip(null);
                  const quad = layout.quadSeats.get(i);
                  if (!quad) return null;
                  return (
                    <text
                      key={name}
                      className="lens-quad"
                      x={quad.x}
                      y={quad.y}
                      textAnchor={quad.anchor}
                      data-explain="quad"
                      onPointerEnter={explainQuadrant}
                      onPointerLeave={dismissQuadrant}
                    >
                      {name}
                    </text>
                  );
                })}
              </>
            ) : (
              <text
                x={size.width / 2}
                y={size.height / 2}
                textAnchor="middle"
                className="lens-axis"
              >
                当前范围没有满足此视角统计条件的节点
              </text>
            )}
            <text
              x={layout.left}
              y="27"
              className="lens-axis-title"
              data-explain="axis"
              onPointerEnter={explainVerticalAxis}
              onPointerLeave={dismissVerticalAxis}
            >
              {v.y} ↑
            </text>
            <text
              x={layout.right}
              y={size.height - 10}
              textAnchor="end"
              className="lens-axis-title"
              data-explain="axis"
              onPointerEnter={explainHorizontalAxis}
              onPointerLeave={dismissHorizontalAxis}
            >
              {v.x} →
            </text>
            <g clipPath={`url(#${clip})`}>
              {ap && bp ? (
                <path
                  className="lens-compare-line"
                  d={`M${ap.cx} ${ap.cy}L${bp.cx} ${bp.cy}`}
                />
              ) : null}
              {layout.points.map((p) => {
                const previewNode: NonNullable<
                  React.ComponentProps<"g">["onPointerEnter"]
                > = () => {
                  cancelPreview();
                  setGuide(id);
                  if (!fixed && !base && !drag.current) {
                    setHover({ id, year: null });
                    setOpen(true);
                  }
                };
                const leaveNode: NonNullable<
                  React.ComponentProps<"g">["onPointerLeave"]
                > = () => {
                  setGuide(null);
                  endPreview();
                };
                const focusNode: NonNullable<
                  React.ComponentProps<"g">["onFocus"]
                > = () => {
                  cancelPreview();
                  setGuide(id);
                  if (!fixed && !base && !drag.current) {
                    setHover({ id, year: null });
                    setOpen(true);
                  }
                };
                const blurNode: NonNullable<
                  React.ComponentProps<"g">["onBlur"]
                > = () => setGuide(null);
                const beginComparison: NonNullable<
                  React.ComponentProps<"g">["onPointerDown"]
                > = (e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  suppress.current = 0;
                  drag.current = {
                    id,
                    x: e.clientX,
                    y: e.clientY,
                    active: false,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                };
                const selectNode: NonNullable<
                  React.ComponentProps<"g">["onClick"]
                > = (e) => {
                  e.stopPropagation();
                  if (Date.now() < suppress.current) return;

                  if (e.detail > 1) return;
                  choose(id);
                };
                const drillIntoNode: NonNullable<
                  React.ComponentProps<"g">["onDoubleClick"]
                > = (e) => {
                  e.stopPropagation();
                  if (!moving && Date.now() >= suppress.current) enter(id);
                };
                const navigateNode: NonNullable<
                  React.ComponentProps<"g">["onKeyDown"]
                > = (e) => {
                  if (moving) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choose(id);
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    enter(id, true);
                  }
                  if (e.key === "Backspace") {
                    e.preventDefault();
                    back(true);
                  }
                };
                const id = p.d.node.id,
                  seat = layout.seats.get(id);
                return (
                  <g
                    key={id}
                    data-node={id}
                    data-name={p.d.node.name}
                    tabIndex={0}
                    aria-label={`${p.d.node.name}，回车固定，向下展开`}
                    className="lens-node"
                    onPointerEnter={previewNode}
                    onPointerLeave={leaveNode}
                    onFocus={focusNode}
                    onBlur={blurNode}
                    onPointerDown={beginComparison}
                    onClick={selectNode}
                    onDoubleClick={drillIntoNode}
                    onKeyDown={navigateNode}
                  >
                    {seat?.leader ? (
                      <line
                        className="lens-label-leader"
                        {...seat.leader}
                        pointerEvents="none"
                      />
                    ) : null}
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={Math.max(12, p.r)}
                      fill="transparent"
                    />
                    <circle
                      className="lens-dot"
                      cx={p.cx}
                      cy={p.cy}
                      r={p.r}
                      fill={
                        id === base
                          ? "var(--link)"
                          : id === chosen
                            ? "var(--terrain-dot-on)"
                            : "var(--terrain-dot)"
                      }
                    />
                    {seat || guide === id || fixed === id ? (
                      <text
                        className="lens-node-name"
                        x={seat?.x ?? p.cx}
                        y={seat?.y ?? p.cy - p.r - size.font}
                        textAnchor="middle"
                      >
                        {p.d.node.name}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
            {focused ? (
              <g pointerEvents="none">
                <path
                  clipPath={`url(#${clip})`}
                  className="lens-guide"
                  d={`M${layout.left} ${focused.cy}H${focused.cx}V${layout.bottom}`}
                />
                <text
                  x={focused.cx}
                  y={layout.bottom + 18}
                  textAnchor="middle"
                  className="lens-guide-value"
                >
                  {fmt(focused.x)}
                </text>
                <text
                  x={layout.left - 9}
                  y={focused.cy + 4}
                  textAnchor="end"
                  className="lens-guide-value"
                >
                  {fmt(focused.y)}
                </text>
                <text
                  x={layout.left}
                  y={layout.top - 7}
                  className="lens-guide-value"
                >
                  {focused.d.node.name} · 横轴
                  {focused.x > layout.mx ? "高于" : "不高于"}中位 / 纵轴
                  {focused.y > layout.my ? "高于" : "不高于"}中位
                </text>
              </g>
            ) : null}
            {trace ? (
              <line
                clipPath={`url(#${clip})`}
                className="lens-compare-line"
                {...trace}
                strokeDasharray="4 5"
              />
            ) : null}
          </svg>
        </div>
        {absent.length || insufficient.length ? (
          <div className="lens-insufficient">
            {absent.length ? (
              <span
                className="lens-absent"
                tabIndex={0}
                onPointerEnter={explainAbsentNodes}
                onPointerLeave={dismissAbsentNodes}
              >
                {absent.length} 个{NODE_KINDS[rows[0]?.node.kind ?? "domain"]}
                {window.from === null ? "没有可确认项目" : "在所选年份无立项"}
              </span>
            ) : null}
            {insufficient.length ? (
              <>
                <span>数据不足</span>
                {insufficient.map(({ d, value }) => {
                  const explainInsufficient: NonNullable<
                    React.ComponentProps<"span">["onPointerEnter"]
                  > = (e) => {
                    cancelPreview();
                    explain(e.currentTarget, d.node.name, value.reason!);
                    if (!fixed && !base) {
                      setHover({ id: d.node.id, year: null });
                      setOpen(true);
                    }
                  };
                  const dismissInsufficient: NonNullable<
                    React.ComponentProps<"span">["onPointerLeave"]
                  > = () => {
                    setTip(null);
                    endPreview();
                  };
                  const focusInsufficient: NonNullable<
                    React.ComponentProps<"span">["onFocus"]
                  > = (e) =>
                    explain(e.currentTarget, d.node.name, value.reason!);
                  return (
                    <span
                      key={d.node.id}
                      tabIndex={0}
                      onPointerEnter={explainInsufficient}
                      onPointerLeave={dismissInsufficient}
                      onFocus={focusInsufficient}
                    >
                      ◌ {d.node.name}
                    </span>
                  );
                })}
              </>
            ) : null}
          </div>
        ) : null}
        <YearBand
          model={model}
          ids={ids}
          scope={scope}
          years={data.years}
          window={window}
          metric={metric}
          expanded={expanded}
          chosen={chosen}
          baseline={base}
          onWindow={selectYears}
          onMetric={selectAnnualMetric}
          onExpanded={toggleAnnualDetails}
          onPreview={previewAnnualNode}
          onFix={fixAnnualNode}
          onYearFix={fixAnnualYear}
        />
      </div>
      <LensInspector
        onEnter={() => enter(chosen)}
        onCompare={() => {
          clearPreview();
          setCompareFrom(chosen);
        }}
        comparePending={compareFrom !== null}
        onPreviewEnd={clearPreview}
        dismissTip={dismissTip}
        model={model}
        d={d}
        base={base}
        selected={selected}
        peek={peek}
        window={window}
        lens={lens}
        open={open}
        drawerDrag={drawerDrag}
        setOpen={setOpen}
        showLibrary={showLibrary}
        explain={explain}
        layout={layout}
      />
      {tip
        ? createPortal(
            <div
              ref={tooltip}
              className="lens-tooltip"
              role="tooltip"
              style={{ left: tip.x, top: tip.y }}
            >
              <b>{tip.title}</b>
              {tip.text}
            </div>,
            document.body,
          )
        : null}
      <LibraryPreviewDrawer
        row={preview}
        onClose={closeLibraryPreview}
        research={preview ? model.measure(preview.corpus_id) : undefined}
      />
    </div>
  );
}
