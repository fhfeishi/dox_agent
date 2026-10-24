import { useAnnualGestures } from "./useLensGestures";
import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import {
  ALL_YEARS,
  ANNUAL_METRICS,
  ANNUAL_NAMES,
  type AnnualMetric,
  type AtlasMeasure,
  type AtlasModel,
  type YearWindow,
} from "../../domainAtlas";
const fmt = (n: number) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const known = (d: AtlasMeasure, metric: AnnualMetric) =>
  metric === "funding"
    ? d.funded > 0
    : metric === "outputs"
      ? d.listed > 0
      : true;
export function YearBand({
  model,
  ids,
  scope,
  years,
  window,
  metric,
  expanded,
  chosen,
  baseline,
  onWindow,
  onMetric,
  onExpanded,
  onPreview,
  onFix,
  onYearFix,
}: {
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
  const { drag, pull, draft, setDraft } = useAnnualGestures();
  const controls = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    year: number;
    x: number;
    y: number;
  } | null>(null);
  const canvas = useRef<HTMLDivElement>(null),
    [viewport, setViewport] = useState({ width: 750, font: 14 });
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const read = () => {
      const width = Math.max(750, el.clientWidth),
        font =
          parseFloat(getComputedStyle(el).getPropertyValue("--text-body")) ||
          14;
      setViewport((old) =>
        old.width === width && old.font === font ? old : { width, font },
      );
    };
    const observer = new ResizeObserver(read);
    observer.observe(el);
    globalThis.addEventListener("resize", read);
    read();
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", read);
    };
  }, [years.length]);
  const activeWindow = draft ?? window,
    scale = viewport.font / 12,
    bandHeight = 180 * scale;
  const focus = baseline ? [baseline, chosen] : [chosen];
  const all = (year: number) =>
    scope ? model.measure(scope, { from: year, to: year }) : null;
  const totals = years.map((y) =>
    (scope ? [scope] : ids).map((id) => model.measure(id, { from: y, to: y })),
  );
  const sumText = (i: number) =>
    !totals[i].some((d) => d.projects)
      ? "0"
      : totals[i].some((d) => known(d, metric))
        ? fmt(sums[i])
        : "未记录";
  const sums = years.map(
    (y) =>
      all(y)?.[metric] ??
      ids.reduce(
        (n, id) => n + model.measure(id, { from: y, to: y })[metric],
        0,
      ),
  );
  const peak = Math.max(1, ...sums),
    bandLeft = viewport.width * 0.15625,
    w = (viewport.width * 0.78125) / Math.max(years.length, 1);
  const matrixPeak = Math.max(
    1,
    ...ids.flatMap((id) =>
      years.map((y) => model.measure(id, { from: y, to: y })[metric]),
    ),
  );
  const indexAt = (e: PointerEvent<SVGSVGElement>) => {
    const p = e.currentTarget.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const x = p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse()).x;
    return Math.max(
      0,
      Math.min(years.length - 1, Math.floor((x - bandLeft) / w)),
    );
  };
  const selectYear = (y: number) =>
    onWindow(
      window.from === y && window.to === y ? ALL_YEARS : { from: y, to: y },
    );
  const inWindow = (y: number) =>
    activeWindow.from === null ||
    (y >= activeWindow.from && y <= (activeWindow.to ?? activeWindow.from));
  const toggle = () => onExpanded(!expanded);
  function metricKey(e: React.KeyboardEvent, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const at =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 3
          : (index + (e.key === "ArrowLeft" ? 3 : 1)) % 4;
    onMetric(ANNUAL_METRICS[at]);
    controls.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [at]?.focus();
  }
  const beginYearSelection: NonNullable<
    React.ComponentProps<"svg">["onPointerDown"]
  > = (e) => {
    if (e.button !== 0) return;
    const year = (e.target as Element)
      .closest("[data-year]")
      ?.getAttribute("data-year");
    if (!year) return;
    const index = years.indexOf(Number(year));
    if (index < 0) return;
    e.currentTarget.focus({ preventScroll: true });
    drag.current = { index, end: index, x: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const previewYearRange: NonNullable<
    React.ComponentProps<"svg">["onPointerMove"]
  > = (e) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > 5) d.moved = true;
    if (!d.moved) return;
    const at = indexAt(e);
    d.end = at;
    setDraft({
      from: years[Math.min(at, d.index)],
      to: years[Math.max(at, d.index)],
    });
  };
  const commitYearSelection: NonNullable<
    React.ComponentProps<"svg">["onPointerUp"]
  > = () => {
    const d = drag.current;
    drag.current = null;
    setDraft(null);
    if (!d) return;
    if (d.moved)
      onWindow({
        from: years[Math.min(d.index, d.end)],
        to: years[Math.max(d.index, d.end)],
      });
    else selectYear(years[d.index]);
  };
  const cancelYearSelection: NonNullable<
    React.ComponentProps<"svg">["onPointerCancel"]
  > = () => {
    drag.current = null;
    setDraft(null);
  };
  const navigateYears: NonNullable<React.ComponentProps<"svg">["onKeyDown"]> = (
    e,
  ) => {
    if (e.key === "Escape" && drag.current) {
      e.preventDefault();
      e.stopPropagation();
      drag.current = null;
      setDraft(null);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      onWindow(ALL_YEARS);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const left = e.key === "ArrowLeft",
        edge = left ? window.from : window.to;
      const i = Math.max(
        0,
        Math.min(
          years.length - 1,
          years.indexOf(edge ?? years[0]) + (left ? -1 : 1),
        ),
      );
      onWindow(
        e.shiftKey
          ? left
            ? { from: years[i], to: window.to ?? years[i] }
            : { from: window.from ?? years[0], to: years[i] }
          : { from: years[i], to: years[i] },
      );
    }
  };
  const beginDetailsPull: NonNullable<
    React.ComponentProps<"div">["onPointerDown"]
  > = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.focus({ preventScroll: true });
    pull.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const commitDetailsPull: NonNullable<
    React.ComponentProps<"div">["onPointerUp"]
  > = (e) => {
    if (pull.current !== null) {
      if (Math.abs(e.clientY - pull.current) > 24)
        onExpanded(e.clientY > pull.current);
      else toggle();
    }
    pull.current = null;
  };
  const cancelDetailsPull: NonNullable<
    React.ComponentProps<"div">["onPointerCancel"]
  > = () => {
    pull.current = null;
  };
  const navigateDetails: NonNullable<
    React.ComponentProps<"div">["onKeyDown"]
  > = (e) => {
    if (e.key === "Escape" && pull.current !== null) {
      e.preventDefault();
      e.stopPropagation();
      pull.current = null;
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  if (!years.length)
    return (
      <p className="lens-muted">暂无已确认的立项年份；当前显示累计数据。</p>
    );
  return (
    <div className="lens-year-band">
      <div className="lens-year-head">
        <div>
          <b>立项年度</b>
          <span aria-live="polite">
            {activeWindow.from === null
              ? "全部年份"
              : activeWindow.from === activeWindow.to
                ? `${activeWindow.from} 年`
                : `${activeWindow.from}—${activeWindow.to} 年`}
          </span>
          <small>
            {draft ? "松开后应用年份范围" : "点一年 · 拖动框选 · 再点恢复全部"}
          </small>
        </div>
        <div
          ref={controls}
          className="lens-metrics lens-views"
          role="radiogroup"
          aria-label="年度分布指标"
        >
          {ANNUAL_METRICS.map((m, index) => {
            const selectMetric: NonNullable<
              React.ComponentProps<"button">["onClick"]
            > = () => onMetric(m);
            const navigateMetrics: NonNullable<
              React.ComponentProps<"button">["onKeyDown"]
            > = (e) => metricKey(e, index);
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={metric === m}
                tabIndex={metric === m ? 0 : -1}
                onClick={selectMetric}
                onKeyDown={navigateMetrics}
              >
                {
                  {
                    projects: "项目（项）",
                    funding: "资金（万元）",
                    items: "技术（条）",
                    outputs: "成果（项）",
                  }[m]
                }
              </button>
            );
          })}
        </div>
      </div>
      <p className="lens-year-legend">
        灰条：当前范围去重合计 ·{" "}
        {focus.map((id, i) => {
          return (
            <span
              key={id}
              className={baseline ? (i ? "lens-b" : "lens-a") : "lens-b"}
            >
              {baseline ? (i ? " B / " : " A / ") : "绿条 / "}
              {model.nodes.get(id)?.name}
            </span>
          );
        })}{" "}
        · {ANNUAL_NAMES[metric]}
      </p>
      <div ref={canvas} className="lens-year-scroll">
        <svg
          width={viewport.width}
          height={bandHeight}
          viewBox={`0 0 ${viewport.width} ${bandHeight}`}
          tabIndex={0}
          role="group"
          aria-label="选择立项年份，点选或拖动框选，Esc取消，方向键单年，Home恢复全部"
          className="lens-band-svg"
          data-selecting={draft !== null}
          onPointerDown={beginYearSelection}
          onPointerMove={previewYearRange}
          onPointerUp={commitYearSelection}
          onPointerCancel={cancelYearSelection}
          onKeyDown={navigateYears}
        >
          {years.map((y, i) => {
            const previewYearValues: NonNullable<
              React.ComponentProps<"g">["onPointerEnter"]
            > = (e) => {
              if (!drag.current)
                setTip({
                  year: y,
                  x: Math.max(
                    12,
                    Math.min(globalThis.innerWidth - 300, e.clientX + 14),
                  ),
                  y: Math.max(
                    12,
                    Math.min(globalThis.innerHeight - 200, e.clientY - 180),
                  ),
                });
            };
            const dismissYearValues: NonNullable<
              React.ComponentProps<"g">["onPointerLeave"]
            > = () => setTip(null);
            const x = bandLeft + i * w;
            return (
              <g
                key={y}
                data-year={y}
                onPointerEnter={previewYearValues}
                onPointerLeave={dismissYearValues}
              >
                <rect
                  x={x}
                  y={3 * scale}
                  width={w}
                  height={180 * scale}
                  fill={inWindow(y) ? "var(--terrain-empty)" : "transparent"}
                />
                <rect
                  className="lens-year-bar"
                  x={x + 12}
                  y={(160 - (sums[i] / peak) * 128) * scale}
                  width={w - 24}
                  height={(sums[i] / peak) * 128 * scale}
                  fill="var(--track)"
                />
                <text
                  className="lens-year-total"
                  x={x + w / 2}
                  y={14 * scale}
                  textAnchor="middle"
                  fill="var(--muted-cool)"
                >
                  {sumText(i)}
                </text>
                {focus.map((id, j) => {
                  const d = model.measure(id, { from: y, to: y }),
                    h = (d[metric] / peak) * 128 * scale,
                    bx =
                      x +
                      w / 2 +
                      (focus.length > 1
                        ? j
                          ? 3 * scale
                          : -16 * scale
                        : -8 * scale),
                    color = baseline
                      ? j
                        ? "var(--terrain-amber)"
                        : "var(--link)"
                      : "var(--terrain-dot-on)";
                  return (
                    <g key={id}>
                      <text
                        x={bx + 7 * scale}
                        y={160 * scale - h - 6 * scale}
                        textAnchor="middle"
                        fill={color}
                      >
                        {baseline ? (j ? "B " : "A ") : ""}
                        {!d.projects
                          ? ""
                          : known(d, metric)
                            ? fmt(d[metric])
                            : "未记录"}
                      </text>
                      {d.projects && !known(d, metric) ? (
                        <circle
                          cx={bx + 7 * scale}
                          cy={152 * scale}
                          r={5 * scale}
                          fill="none"
                          stroke={color}
                          strokeDasharray="2 3"
                        />
                      ) : (
                        <rect
                          className="lens-year-bar"
                          x={bx}
                          y={160 * scale - h}
                          width={14 * scale}
                          height={h}
                          fill={color}
                          opacity={inWindow(y) ? 1 : 0.4}
                        />
                      )}
                    </g>
                  );
                })}
                <text
                  x={x + w / 2}
                  y={178 * scale}
                  textAnchor="middle"
                  fill="var(--muted-cool)"
                >
                  {y}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {tip ? (
        <div
          role="tooltip"
          className="lens-year-tooltip"
          style={{ left: tip.x, top: tip.y }}
        >
          <b>
            {tip.year}年 · {ANNUAL_NAMES[metric]}
          </b>
          <span>当年合计 {sumText(years.indexOf(tip.year))}</span>
          {focus.map((id) => {
            const d = model.measure(id, { from: tip.year, to: tip.year });
            return (
              <span key={id}>
                {model.nodes.get(id)?.name}：
                {!d.projects
                  ? "无立项"
                  : known(d, metric)
                    ? fmt(d[metric])
                    : "未记录"}
              </span>
            );
          })}
          <span>
            {totals[years.indexOf(tip.year)].reduce(
              (n, d) =>
                n +
                (metric === "funding"
                  ? d.funded
                  : metric === "outputs"
                    ? d.listed
                    : d.projects),
              0,
            )}
            /
            {totals[years.indexOf(tip.year)].reduce(
              (n, d) => n + d.projects,
              0,
            )}{" "}
            项有记录
          </span>
        </div>
      ) : null}
      <div
        className="lens-pull"
        role="separator"
        tabIndex={0}
        aria-label="点击或拖动展开年度明细，回车切换，Esc取消拖动"
        aria-controls="lens-annual-details"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={expanded ? 1 : 0}
        onPointerDown={beginDetailsPull}
        onPointerUp={commitDetailsPull}
        onPointerCancel={cancelDetailsPull}
        onKeyDown={navigateDetails}
      >
        <i />
        {expanded
          ? "点击或上推，收起年度明细"
          : "点击或下拉，展开各领域年度分布"}
      </div>
      {expanded ? (
        <div id="lens-annual-details" className="lens-matrix">
          <table>
            <colgroup>
              <col style={{ width: "15.625%" }} />
              {years.map((y) => {
                return (
                  <col key={y} style={{ width: `${78.125 / years.length}%` }} />
                );
              })}
              <col style={{ width: "6.25%" }} />
            </colgroup>
            <caption>
              {ANNUAL_NAMES[metric]} · 列与上方年份对齐，行尾为所选范围合计
            </caption>
            <thead>
              <tr>
                <th>当前层</th>
                {years.map((y) => {
                  return <th key={y}>{y}</th>;
                })}
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const fixMatrixNode: NonNullable<
                  React.ComponentProps<"th">["onClick"]
                > = () => onFix(id);
                const navigateMatrixNode: NonNullable<
                  React.ComponentProps<"th">["onKeyDown"]
                > = (e) => {
                  if (e.key === "Enter") onFix(id);
                };
                const total = model.measure(id, window);
                return (
                  <tr key={id}>
                    <th
                      tabIndex={0}
                      onClick={fixMatrixNode}
                      onKeyDown={navigateMatrixNode}
                    >
                      {model.nodes.get(id)?.name}
                    </th>
                    {years.map((y) => {
                      const previewMatrixYear: NonNullable<
                        React.ComponentProps<"td">["onPointerEnter"]
                      > = () => {
                        if (!baseline) onPreview(id, y);
                      };
                      const leaveMatrixYear: NonNullable<
                        React.ComponentProps<"td">["onPointerLeave"]
                      > = () => onPreview(id, null);
                      const fixMatrixYear: NonNullable<
                        React.ComponentProps<"td">["onClick"]
                      > = () => onYearFix(id, y);
                      const navigateMatrixYear: NonNullable<
                        React.ComponentProps<"td">["onKeyDown"]
                      > = (e) => {
                        if (e.key === "Enter") onYearFix(id, y);
                      };
                      const d = model.measure(id, { from: y, to: y });
                      return (
                        <td
                          key={y}
                          data-selected={inWindow(y)}
                          tabIndex={0}
                          aria-label={`${model.nodes.get(id)?.name} ${y} 年`}
                          onPointerEnter={previewMatrixYear}
                          onPointerLeave={leaveMatrixYear}
                          onClick={fixMatrixYear}
                          onKeyDown={navigateMatrixYear}
                        >
                          {d.projects ? (
                            known(d, metric) ? (
                              <span className="lens-cell-value">
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 18 18"
                                  aria-hidden="true"
                                >
                                  <circle
                                    cx="9"
                                    cy="9"
                                    r={Math.sqrt(d[metric] / matrixPeak) * 8}
                                    fill={
                                      id === baseline
                                        ? "var(--link)"
                                        : id === chosen
                                          ? "var(--terrain-dot-on)"
                                          : "var(--terrain-dot)"
                                    }
                                  />
                                </svg>
                                {fmt(d[metric])}
                              </span>
                            ) : (
                              <span title="有项目，但未记录该项">◌</span>
                            )
                          ) : (
                            ""
                          )}
                        </td>
                      );
                    })}
                    <td>
                      {!total.projects
                        ? "0"
                        : known(total, metric)
                          ? fmt(total[metric])
                          : "未记录"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="lens-muted">
            ◌ 有项目但未记录；空白为没有立项。各行可能涉及同一项目，不能相加。
          </p>
        </div>
      ) : null}
    </div>
  );
}
