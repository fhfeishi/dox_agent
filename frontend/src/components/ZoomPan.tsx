import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * An interactive window for a large drawing (query 2026-1010 1124): wheel to zoom around the
 * cursor, drag to move, buttons to zoom, fit and enlarge the window. A drag never counts as a
 * click on the drawing, so nodes inside stay clickable. The drawing is `width` × `height` in its
 * own units and starts fitted to the window.
 */
export function ZoomPan({ width, height, label, minHeight = 320, minFit = 0.7, alignEnd = false, fill = false, children }: {
  width: number; height: number; label: string; minHeight?: number; minFit?: number;
  /** Take the remaining height of a flex column instead of sizing from the drawing; refit on resize. */
  fill?: boolean;
  /** When the drawing is wider than the window, start at its right edge (the deepest column). */
  alignEnd?: boolean; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [large, setLarge] = useState(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const moved = useRef(false);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    // Fit, but never below a readable scale: a wider drawing starts at its top-left and is panned.
    const k = Math.max(minFit, Math.min(1.2, (el.clientWidth - 16) / width, (el.clientHeight - 16) / height));
    const over = width * k > el.clientWidth - 16;
    setView({ k, x: over ? (alignEnd ? el.clientWidth - width * k - 8 : 8) : (el.clientWidth - width * k) / 2,
      y: Math.max(8, (el.clientHeight - height * k) / 2) });
  }, [width, height, minFit, alignEnd]);
  useLayoutEffect(() => { fit(); }, [fit, large]);
  useEffect(() => {
    const el = box.current;
    if (!fill || !el) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill, fit]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const el = box.current;
    setView((v) => {
      const k = Math.min(6, Math.max(0.15, v.k * factor));
      const cx = px ?? (el ? el.clientWidth / 2 : 0), cy = py ?? (el ? el.clientHeight / 2 : 0);
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
    });
  }, []);

  // React's wheel listener is passive; zooming must stop the page from scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    if (!large) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLarge(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [large]);

  const button = "grid size-7 place-items-center rounded-md border border-[var(--hairline)] bg-[var(--surface)] text-[13px] text-[var(--slate)] hover:bg-[var(--canvas)]";
  return <div className={large ? "fixed inset-3 z-[80] flex flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-2 shadow-2xl" : fill ? "relative flex min-h-0 flex-1 flex-col" : "relative"}>
    <div ref={box} role="region" aria-label={label}
      className={`relative touch-none select-none overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] ${large || fill ? "min-h-0 flex-1" : ""} ${drag.current?.moved ? "cursor-grabbing" : "cursor-grab"}`}
      style={large || fill ? undefined : { height: Math.max(minHeight, Math.min(640, height * 0.85 + 40)) }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Dragging must not start a text selection (query 2026-1010 1537); clicks still fire.
        e.preventDefault();
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        if (!d.moved) { d.moved = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
        moved.current = true;
        setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      // A drag ends with a click on whatever is under the pointer; swallow that one.
      onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } }}>
      <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0", width, height }}>{children}</div>
      <div className="absolute top-2 right-2 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="放大" title="放大" className={button} onClick={() => zoomAt(1.25)}>＋</button>
        <button type="button" aria-label="缩小" title="缩小" className={button} onClick={() => zoomAt(0.8)}>－</button>
        <button type="button" aria-label="适应窗口" title="适应窗口" className={button} onClick={fit}>⤢</button>
        <button type="button" aria-label={large ? "退出大窗口" : "大窗口查看"} title={large ? "退出大窗口（Esc）" : "大窗口查看"} className={button}
          onClick={() => setLarge(!large)}>{large ? "✕" : "⛶"}</button>
      </div>
      <span className="pointer-events-none absolute bottom-1.5 left-2 text-[11px] text-[var(--stone)]">滚轮缩放 · 拖动平移 · {Math.round(view.k * 100)}%</span>
    </div>
  </div>;
}
