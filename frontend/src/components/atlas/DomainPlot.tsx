import { useRef, type CSSProperties, type RefObject } from "react";
import { LENSES, type atlasLayout, type Lens } from "../../domainAtlas";
import { fmt } from "./lensFormat";
import type { usePanZoom } from "./usePanZoom";
type Layout = ReturnType<typeof atlasLayout>;
type Props = {
  layout: Layout;
  home: Layout;
  lens: Lens;
  size: { width: number; height: number; font: number };
  svg: RefObject<SVGSVGElement | null>;
  wrap: RefObject<HTMLDivElement | null>;
  clip: string;
  selected: string | null;
  baseline: string | null;
  guide: string | null;
  moving: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onBlank: () => void;
  pan: ReturnType<typeof usePanZoom>;
};
function Tag({
  x,
  y,
  text,
  median = false,
  axis,
  font,
}: {
  x: number;
  y: number;
  text: string;
  median?: boolean;
  axis: "x" | "y";
  font: number;
}) {
  const width =
    [...text].reduce(
      (n, c) => n + (/[\u3400-\u9fff]/.test(c) ? font : font * 0.6),
      0,
    ) + 16;
  return (
    <g
      className={median ? "lens-median-tag" : "lens-axis-readout"}
      data-axis={axis}
      pointerEvents="none"
    >
      <rect
        x={x - width / 2}
        y={y - font - 2}
        width={width}
        height={font + 10}
        rx={4}
      />
      <text x={x} y={y + 1} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
export function DomainPlot({
  layout,
  home,
  lens,
  size,
  svg,
  wrap,
  clip,
  selected,
  baseline,
  guide,
  moving,
  onHover,
  onSelect,
  onBlank,
  pan,
}: Props) {
  const press = useRef<{ x: number; y: number } | null>(null);
  const hovered = layout.points.find((p) => !p.ghost && p.d.node.id === guide);
  const focused = moving
    ? undefined
    : layout.points.find(
        (p) => !p.ghost && p.d.node.id === (guide ?? selected),
      );
  const view = LENSES[lens],
    mx = layout.medianX,
    my = layout.medianY;
  const xUnit = lens === "base" ? " 条" : lens === "money" ? " 万元" : " 项",
    yUnit = lens === "base" ? " 档" : lens === "money" ? " 项" : "%";
  function nodeKey(e: React.KeyboardEvent<SVGGElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    e.preventDefault();
    const nodes = [
      ...svg.current!.querySelectorAll<SVGGElement>("[data-node]"),
    ];
    const i = nodes.findIndex((n) => n.dataset.node === id);
    const direction = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    nodes[(i + direction + nodes.length) % nodes.length]?.focus({
      preventScroll: true,
    });
  }
  const visible = layout.points.filter((p) => !p.ghost);
  const counts = [0, 0, 0, 0];
  for (const p of home.points)
    counts[(p.y > home.my ? 0 : 2) + (p.x > home.mx ? 1 : 0)]++;
  const standard = `当前层${home.points.length}个可绘制节点；中位 ${fmt(home.mx)}${xUnit} / ${fmt(home.my)}${yUnit}，恰好相等算不高于。`;
  return (
    <div className="lens-plot-scroll" ref={wrap}>
      <svg
        ref={svg}
        className="lens-plot"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        tabIndex={0}
        role="group"
        aria-label="研究领域四象限图"
        onKeyDown={(e) => {
          if (e.key === "0") {
            e.preventDefault();
            pan.reset();
          }
        }}
        onPointerDownCapture={(e) => {
          press.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerDown={(e) => {
          if (!(e.target as Element).closest("[data-node]")) pan.down(e);
        }}
        onClickCapture={(e) => {
          if (
            press.current &&
            Math.hypot(
              e.clientX - press.current.x,
              e.clientY - press.current.y,
            ) > 5
          ) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          if (
            !moving &&
            !pan.suppressClick() &&
            !(e.target as Element).closest("[data-node],[data-explain]")
          )
            onBlank();
        }}
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
        <g clipPath={`url(#${clip})`}>
          <rect
            x={layout.left}
            y={layout.top}
            width={Math.max(0, Math.min(layout.right, mx) - layout.left)}
            height={Math.max(0, Math.min(layout.bottom, my) - layout.top)}
            fill="var(--terrain-empty)"
          />
          <rect
            x={Math.max(layout.left, mx)}
            y={layout.top}
            width={Math.max(0, layout.right - Math.max(layout.left, mx))}
            height={Math.max(0, Math.min(layout.bottom, my) - layout.top)}
            fill="var(--ok-bg)"
          />
          <rect
            x={layout.left}
            y={Math.max(layout.top, my)}
            width={Math.max(0, Math.min(layout.right, mx) - layout.left)}
            height={Math.max(0, layout.bottom - Math.max(layout.top, my))}
            fill="var(--terrain-shallow)"
          />
          {Array.from({ length: 5 }, (_, i) => {
            const y = layout.yr[0] + ((layout.yr[1] - layout.yr[0]) * i) / 4;
            return (
              <path
                key={i}
                d={`M${layout.left} ${layout.py(y)}H${layout.right}`}
                stroke="var(--terrain-grid)"
              />
            );
          })}
          <path
            d={`M${mx} ${layout.top}V${layout.bottom}M${layout.left} ${my}H${layout.right}`}
            className="lens-median-line"
          />
          {baseline && selected
            ? (() => {
                const a = visible.find((p) => p.d.node.id === baseline),
                  b = visible.find((p) => p.d.node.id === selected);
                return a && b ? (
                  <path
                    className="lens-compare-line"
                    d={`M${a.cx} ${a.cy}L${b.cx} ${b.cy}`}
                  />
                ) : null;
              })()
            : null}
          {layout.points.map((p) => {
            const id = p.d.node.id,
              seat = layout.seats.get(id),
              active = guide === id || selected === id || baseline === id;
            return (
              <g
                key={`${p.ghost ? "ghost" : "node"}-${id}`}
                data-node={p.ghost ? undefined : id}
                data-name={p.d.node.name}
                data-selected={selected === id}
                data-active={active}
                data-baseline={baseline === id}
                data-comparing={!!baseline}
                className={p.ghost ? "lens-ghost" : "lens-node"}
                style={
                  {
                    opacity: p.opacity,
                    "--node-radius": `${p.r}px`,
                  } as CSSProperties
                }
                tabIndex={p.ghost ? -1 : 0}
                role={p.ghost ? undefined : "button"}
                aria-label={p.d.node.name}
                aria-pressed={selected === id}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerEnter={() => {
                  if (!p.ghost) onHover(id);
                }}
                onPointerLeave={() => onHover(null)}
                onFocus={() => onHover(id)}
                onBlur={() => onHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!moving && !p.ghost) onSelect(id);
                }}
                onKeyDown={(e) => nodeKey(e, id)}
              >
                {seat?.leader ? (
                  <line
                    className="lens-label-leader"
                    {...seat.leader}
                    pointerEvents="none"
                  />
                ) : null}
                <circle className="lens-halo" cx={p.cx} cy={p.cy} r={p.r} />
                <circle
                  className={p.ghost ? "lens-ghost-dot" : "lens-dot"}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                />
                {seat ? (
                  <text
                    className="lens-node-name"
                    x={seat.x}
                    y={seat.y}
                    textAnchor="middle"
                  >
                    {p.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {view.quads.map((name, i) => {
            const q = layout.quadSeats.get(i);
            return q ? (
              <text
                key={name}
                className="lens-quad"
                data-explain="quad"
                x={q.x}
                y={q.y}
                textAnchor={q.anchor}
              >
                <title>{standard}</title>
                {name} <tspan>{counts[i]}</tspan>
              </text>
            ) : null;
          })}
        </g>
        {Array.from({ length: 5 }, (_, i) => {
          const y = layout.yr[0] + ((layout.yr[1] - layout.yr[0]) * i) / 4;
          return Math.abs(layout.py(y) - my) > size.font * 1.7 ? (
            <text
              key={i}
              x={layout.left - 8}
              y={layout.py(y) + 4}
              textAnchor="end"
              className="lens-axis"
            >
              {fmt(y)}
            </text>
          ) : null;
        })}
        {(lens === "base"
          ? [1, 3, 10, 30, 100, 300, 1000, 3000].filter(
              (x) =>
                Math.log10(x) >= layout.xr[0] && Math.log10(x) <= layout.xr[1],
            )
          : Array.from(
              { length: 4 },
              (_, i) => layout.xr[0] + ((layout.xr[1] - layout.xr[0]) * i) / 3,
            )
        ).map((x) =>
          Math.abs(layout.px(x) - mx) > 70 ? (
            <text
              key={x}
              x={layout.px(x)}
              y={layout.bottom + 19}
              textAnchor="middle"
              className="lens-axis"
            >
              {fmt(x)}
            </text>
          ) : null,
        )}
        <text className="lens-axis-title" x={layout.left} y={20}>
          {view.y} ↑
        </text>
        <text
          className="lens-axis-title"
          x={layout.right}
          y={size.height - 8}
          textAnchor="end"
        >
          {view.x} →
        </text>
        {mx >= layout.left && mx <= layout.right ? (
          <Tag
            font={size.font * 0.9}
            median
            axis="x"
            x={mx}
            y={layout.bottom + 18}
            text={`中位 ${fmt(home.mx)}${xUnit}`}
          />
        ) : null}
        {my >= layout.top && my <= layout.bottom ? (
          <Tag
            font={size.font * 0.9}
            median
            axis="y"
            x={layout.left + 52}
            y={my - 11}
            text={`中位 ${fmt(home.my)}${yUnit}`}
          />
        ) : null}
        {focused ? (
          <>
            <path
              className="lens-guide"
              clipPath={`url(#${clip})`}
              d={`M${layout.left} ${focused.cy}H${focused.cx}V${layout.bottom}`}
            />
            <Tag
              font={size.font * 0.9}
              axis="x"
              x={Math.max(
                layout.left + 35,
                Math.min(layout.right - 35, focused.cx),
              )}
              y={layout.bottom + 18}
              text={`${fmt(focused.x)}${xUnit}`}
            />
            <Tag
              font={size.font * 0.9}
              axis="y"
              x={layout.left + 10}
              y={focused.cy + 4}
              text={`${fmt(focused.y)}${yUnit}`}
            />
          </>
        ) : null}
      </svg>
      {hovered && !moving ? (
        <div
          className="lens-node-tooltip"
          role="tooltip"
          style={{
            left: Math.max(
              8,
              Math.min(
                globalThis.innerWidth - 320,
                (svg.current?.getBoundingClientRect().left ?? 0) +
                  hovered.cx +
                  20,
              ),
            ),
            top: Math.max(
              8,
              Math.min(
                globalThis.innerHeight - 250,
                (svg.current?.getBoundingClientRect().top ?? 0) +
                  hovered.cy +
                  20,
              ),
            ),
          }}
        >
          <b>{hovered.d.node.name}</b>
          <span>
            {view.x} {fmt(hovered.x)}
            {xUnit}，{hovered.x > home.mx ? "高于" : "不高于"}中位{" "}
            {fmt(home.mx)}
            {xUnit}
          </span>
          <span>
            {view.y} {fmt(hovered.y)}
            {yUnit}，{hovered.y > home.my ? "高于" : "不高于"}中位{" "}
            {fmt(home.my)}
            {yUnit}
          </span>
          <span>
            {hovered.d.projects} 个项目 · 在「
            {
              view.quads[
                (hovered.y > home.my ? 0 : 2) + (hovered.x > home.mx ? 1 : 0)
              ]
            }
            」
          </span>
          <strong>
            {selected === hovered.d.node.id
              ? hovered.d.node.children.length
                ? `再点进入（${hovered.d.node.children.length} 个${NODE_KIND(hovered.d.node.kind)}）`
                : "研究方向层到此为止"
              : "点击选中"}
          </strong>
        </div>
      ) : null}
    </div>
  );
}
const NODE_KIND = (kind: string) =>
  kind === "domain" ? "技术体系" : "研究方向";
