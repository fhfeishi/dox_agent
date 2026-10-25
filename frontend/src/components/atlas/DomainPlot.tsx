import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type PointerEvent,
} from "react";
import { LENSES, type atlasLayout, type Lens } from "../../domainAtlas";
import { fmt } from "./lensFormat";
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
  onCompare: (from: string, to: string) => void;
  onBlank: () => void;
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
  onCompare,
  onBlank,
}: Props) {
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const drag = useRef<{
    id: string;
    pointer: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const suppressDragClick = useRef(false);
  const [wire, setWire] = useState<{
    from: string;
    x: number;
    y: number;
    to: string | null;
  } | null>(null);
  function clearDrag() {
    const d = drag.current;
    drag.current = null;
    setWire(null);
    if (d && svg.current?.hasPointerCapture(d.pointer))
      svg.current.releasePointerCapture(d.pointer);
  }
  useEffect(() => {
    window.addEventListener("blur", clearDrag);
    return () => window.removeEventListener("blur", clearDrag);
  }, []);
  function pointerPoint(e: PointerEvent<SVGSVGElement>) {
    const node = svg.current!;
    const point = node.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(node.getScreenCTM()!.inverse());
  }
  function dropTarget(x: number, y: number, from: string) {
    return layout.points
      .filter(
        (p) =>
          !p.ghost &&
          p.d.node.id !== from &&
          Math.hypot(p.cx - x, p.cy - y) <= p.r + 10,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y),
      )[0];
  }
  function moveWire(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 5) return;
    if (!d.active) {
      d.active = true;
      suppressDragClick.current = true;
      svg.current!.setPointerCapture(e.pointerId);
      onHover(null);
    }
    const point = pointerPoint(e),
      target = dropTarget(point.x, point.y, d.id);
    setWire({
      from: d.id,
      x: target?.cx ?? point.x,
      y: target?.cy ?? point.y,
      to: target?.d.node.id ?? null,
    });
  }
  function finishWire(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const point = pointerPoint(e),
      target = d.active ? dropTarget(point.x, point.y, d.id) : undefined;
    clearDrag();
    if (d.active) {
      e.preventDefault();
      e.stopPropagation();
      onHover(null);
      if (target) onCompare(d.id, target.d.node.id);
    }
  }
  const hovered = layout.points.find((p) => !p.ghost && p.d.node.id === guide);
  const focused =
    moving || wire
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
      if (moving) return;
      e.preventDefault();
      if (e.shiftKey && selected && selected !== id) {
        onCompare(selected, id);
        return;
      }
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
  const hasData = home.points.length > 0;
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
        data-linking={!!wire}
        onKeyDown={(e) => {
          if (e.key === "Escape" && drag.current) {
            e.preventDefault();
            e.stopPropagation();
            clearDrag();
            return;
          }
        }}
        onPointerDownCapture={(e) => {
          press.current = { x: e.clientX, y: e.clientY, moved: false };
          suppressDragClick.current = false;
        }}
        onPointerMove={(e) => {
          if (
            press.current &&
            Math.hypot(
              e.clientX - press.current.x,
              e.clientY - press.current.y,
            ) > 5
          )
            press.current.moved = true;
          moveWire(e);
        }}
        onPointerUp={finishWire}
        onPointerCancel={clearDrag}
        onLostPointerCapture={() => {
          if (drag.current) clearDrag();
        }}
        onClickCapture={(e) => {
          const moved = press.current?.moved;
          press.current = null;
          if (suppressDragClick.current || moved) {
            suppressDragClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          if (!(e.target as Element).closest("[data-node],[data-explain]"))
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
          {hasData ? (
            <>
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
            </>
          ) : null}
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
          {hasData ? (
            <path
              d={`M${mx} ${layout.top}V${layout.bottom}M${layout.left} ${my}H${layout.right}`}
              className="lens-median-line"
            />
          ) : null}
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
          {wire
            ? (() => {
                const from = layout.points.find(
                  (p) => !p.ghost && p.d.node.id === wire.from,
                );
                return from ? (
                  <path
                    className="lens-compare-draft"
                    pointerEvents="none"
                    d={`M${from.cx} ${from.cy}L${wire.x} ${wire.y}`}
                  />
                ) : null;
              })()
            : null}
          {layout.points.map((p) => {
            const id = p.d.node.id,
              seat = layout.seats.get(id),
              active =
                guide === id ||
                selected === id ||
                baseline === id ||
                wire?.from === id ||
                wire?.to === id;
            return (
              <g
                key={`${p.ghost ? "ghost" : "node"}-${id}`}
                data-node={p.ghost ? undefined : id}
                data-name={p.d.node.name}
                data-selected={selected === id}
                data-active={active}
                data-baseline={baseline === id}
                data-comparing={!!baseline}
                data-drop-target={wire?.to === id}
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
                aria-description="点选查看，拖到另一圆对比；键盘可用 Shift 与 Enter 对比已选圆"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (!moving && !p.ghost && e.button === 0)
                    drag.current = {
                      id,
                      pointer: e.pointerId,
                      x: e.clientX,
                      y: e.clientY,
                      active: false,
                    };
                }}
                onPointerEnter={() => {
                  if (!p.ghost && !drag.current?.active) onHover(id);
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
          {wire ? (
            <g
              className="lens-wire-hint"
              pointerEvents="none"
              transform={`translate(${(layout.left + layout.right) / 2} ${layout.top + 24})`}
            >
              <rect x={-112} y={-18} width={224} height={28} rx={14} />
              <text textAnchor="middle">
                {wire.to ? "松开，即可并排对比" : "拖向另一圆，松开对比"}
              </text>
            </g>
          ) : null}
          {view.quads.map((name, i) => {
            const q = layout.quadSeats.get(i);
            return hasData && q ? (
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
        {hasData && mx >= layout.left && mx <= layout.right ? (
          <Tag
            font={size.font * 0.9}
            median
            axis="x"
            x={mx}
            y={layout.bottom + 18}
            text={`中位 ${fmt(home.mx)}${xUnit}`}
          />
        ) : null}
        {hasData && my >= layout.top && my <= layout.bottom ? (
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
        {!hasData ? (
          <text
            className="lens-empty"
            x={(layout.left + layout.right) / 2}
            y={(layout.top + layout.bottom) / 2}
            textAnchor="middle"
          >
            所选范围没有满足此视角统计条件的节点
          </text>
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
                : "当前分支已到最底层"
              : "点击选中"}
          </strong>
          <span>拖向另一圆，连线对比</span>
        </div>
      ) : null}
    </div>
  );
}
const NODE_KIND = (kind: string) =>
  kind === "domain" ? "技术体系" : "研究方向";
