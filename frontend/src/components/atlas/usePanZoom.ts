import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

export type MapView = { x: number; y: number; k: number };
type Bounds = { left: number; right: number; top: number; bottom: number };
const HOME: MapView = { x: 0, y: 0, k: 1 };

/** Display coordinates only: callers keep their data, statistics and hit targets. */
export function usePanZoom(
  svg: RefObject<SVGSVGElement | null>,
  bounds: Bounds,
  interactive: boolean,
) {
  const [view, render] = useState(HOME);
  const current = useRef(view);
  const enabled = useRef(interactive);
  enabled.current = interactive;
  const limits = useRef(bounds);
  limits.current = bounds;
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const suppressed = useRef(false);
  const animation = useRef(0);
  const reduced = useRef(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      reduced.current = media.matches;
    };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const setView = useCallback((next: MapView) => {
    const clamped = { ...next, k: Math.max(1, Math.min(8, next.k)) };
    current.current = clamped;
    render(current.current);
  }, []);
  const stop = useCallback(() => cancelAnimationFrame(animation.current), []);
  const reset = useCallback(() => {
    stop();
    setView(HOME);
  }, [setView, stop]);
  const cancelDrag = useCallback(() => {
    const d = drag.current;
    if (d?.moved) suppressed.current = true;
    if (d && svg.current?.hasPointerCapture(d.pointerId)) svg.current.releasePointerCapture(d.pointerId);
    drag.current = null;
  }, [svg]);
  useLayoutEffect(() => { if (!interactive) cancelDrag(); }, [interactive, cancelDrag]);
  useEffect(() => stop, [stop]);
  function point(clientX: number, clientY: number) {
    const node = svg.current;
    if (!node) return { x: 0, y: 0 };
    const p = node.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    return p.matrixTransform(node.getScreenCTM()!.inverse());
  }
  const zoom = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      stop();
      const before = current.current;
      const b = limits.current;
      const p = anchor ?? {
        x: (b.left + b.right) / 2,
        y: (b.top + b.bottom) / 2,
      };
      const k = Math.max(1, Math.min(8, before.k * factor));
      setView({
        k,
        x: p.x - ((p.x - before.x) * k) / before.k,
        y: p.y - ((p.y - before.y) * k) / before.k,
      });
    },
    [setView, stop],
  );
  function glideTo(target: MapView) {
    stop();
    if (reduced.current) {
      setView(target);
      return;
    }
    const start = performance.now(),
      from = current.current;
    function frame(now: number) {
      if (reduced.current) {
        setView(target);
        return;
      }
      const t = Math.min(1, (now - start) / 420),
        e = 1 - (1 - t) ** 3;
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        k: from.k + (target.k - from.k) * e,
      });
      if (t < 1) animation.current = requestAnimationFrame(frame);
    }
    animation.current = requestAnimationFrame(frame);
  }
  function down(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    suppressed.current = false;
    if (!enabled.current) return;
    stop();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
  }
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d || !enabled.current) return;
      if (
        !d.moved &&
        Math.hypot(event.clientX - d.startX, event.clientY - d.startY) <= 5
      )
        return;
      // Capture only a confirmed pan. Capturing on down retargets a node's click
      // to the SVG and prevents 02's click-to-expand gesture.
      if (!d.moved) svg.current?.setPointerCapture(event.pointerId);
      d.moved = true;
      const a = point(d.x, d.y),
        b = point(event.clientX, event.clientY);
      d.x = event.clientX;
      d.y = event.clientY;
      setView({
        ...current.current,
        x: current.current.x + b.x - a.x,
        y: current.current.y + b.y - a.y,
      });
    };
    const up = () => cancelDrag();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cancelDrag();
    };
  }, [svg, setView, cancelDrag]);
  useEffect(() => {
    if (!interactive) return;
    const node = svg.current;
    function wheel(event: WheelEvent) {
      if (!enabled.current || event.ctrlKey) return;
      const p = point(event.clientX, event.clientY);
      event.preventDefault();
      zoom(Math.exp(-Math.max(-400, Math.min(400, event.deltaY)) * 0.002), p);
    }
    node?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node?.removeEventListener("wheel", wheel);
    };
  }, [svg, zoom, interactive]);
  function key(event: React.KeyboardEvent<SVGSVGElement>) {
    if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") reset();
      else zoom(event.key === "-" ? 1 / 1.3 : 1.3);
    }
  }
  const isHome =
    Math.abs(view.k - 1) < 0.001 &&
    Math.abs(view.x) < 0.1 &&
    Math.abs(view.y) < 0.1;
  return {
    view: isHome ? HOME : view,
    zoom,
    reset,
    glideTo,
    down,
    key,
    setView,
    stop,
    suppressClick: () => suppressed.current,
    isDragging: () => Boolean(drag.current?.moved),
    isHome,
  };
}
