import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { atlasLayout } from "../../domainAtlas";
type Layout = ReturnType<typeof atlasLayout>;
export type LayerMotion = {
  kind: "enter" | "back";
  anchor: { cx: number; cy: number; r: number };
};
const ease = (x: number) => {
  if (x <= 0 || x >= 1) return x;
  let lo = 0,
    hi = 1,
    t = x;
  for (let i = 0; i < 16; i++) {
    const u = 1 - t,
      bx = 3 * u * u * t * 0.16 + 3 * u * t * t * 0.3 + t * t * t;
    if (bx < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return 1 - Math.pow(1 - t, 3);
};
/** Display geometry only; counts and medians always belong to the destination. */
export function useAtlasMotion(
  target: Layout,
  selectionKey: string,
  layerKey: string,
  navigation: LayerMotion | null = null,
) {
  const [layout, setLayout] = useState(target),
    [moving, setMoving] = useState(false);
  const shown = useRef(target),
    previous = useRef({ selectionKey, layerKey });
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => setReduced(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { selectionKey, layerKey };
    const start = shown.current;
    if (
      reduced ||
      (old.layerKey === layerKey && old.selectionKey === selectionKey) ||
      !start.points.length ||
      !target.points.length
    ) {
      shown.current = target;
      setLayout(target);
      setMoving(false);
      return;
    }
    const changed = old.layerKey !== layerKey,
      back = changed && navigation?.kind === "back",
      anchor = navigation?.anchor ?? {
        cx: (target.left + target.right) / 2,
        cy: (target.top + target.bottom) / 2,
        r: 8,
      };
    const before = new Map(
      start.points.filter((p) => !p.ghost).map((p) => [p.d.node.id, p]),
    );
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    let frame = 0,
      begin: number | null = null;
    setMoving(true);
    function draw(now: number) {
      begin ??= now;
      const elapsed = Math.min(1, (now - begin) / 420),
        t = ease(elapsed);
      const points = target.points.map((p) => {
        const a = before.get(p.d.node.id);
        return {
          ...p,
          cx:
            changed && !back
              ? mix(anchor.cx, p.cx, t)
              : mix(a?.cx ?? p.cx, p.cx, t),
          cy:
            changed && !back
              ? mix(anchor.cy, p.cy, t)
              : mix(a?.cy ?? p.cy, p.cy, t),
          r: mix(changed ? 0 : (a?.r ?? 0), p.r, t),
          opacity: changed ? t : 1,
        };
      });
      const seats = new Map(
        [...target.seats].map(([id, b]) => {
          const a = start.seats.get(id) ?? b;
          return [
            id,
            {
              ...b,
              x: mix(changed && !back ? anchor.cx : a.x, b.x, t),
              y: mix(changed && !back ? anchor.cy : a.y, b.y, t),
            },
          ];
        }),
      );
      if (back) {
        for (const p of start.points.filter((p) => !p.ghost)) {
          points.push({
            ...p,
            ghost: true,
            cx: mix(p.cx, anchor.cx, t),
            cy: mix(p.cy, anchor.cy, t),
            r: p.r * (1 - t),
            opacity: 1 - t,
          });
          const a = start.seats.get(p.d.node.id);
          if (a)
            seats.set(p.d.node.id, {
              ...a,
              x: mix(a.x, anchor.cx, t),
              y: mix(a.y, anchor.cy, t),
            });
        }
      }
      const current = {
        ...target,
        points,
        seats,
        medianX: mix(start.medianX, target.medianX, t),
        medianY: mix(start.medianY, target.medianY, t),
      };
      shown.current = current;
      setLayout(current);
      if (elapsed < 1) frame = requestAnimationFrame(draw);
      else {
        shown.current = target;
        setLayout(target);
        setMoving(false);
      }
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [target, selectionKey, layerKey, reduced]);
  return { layout, moving };
}
