import type { usePanZoom } from "./usePanZoom";

export function PanZoomControls({
  map,
  className = "",
}: {
  map: ReturnType<typeof usePanZoom>;
  className?: string;
}) {
  return (
    <span className={`roads-zoom ${className}`} role="group" aria-label="缩放">
      <button type="button" aria-label="缩小" onClick={() => map.zoom(1 / 1.3)}>
        −
      </button>
      <button type="button" onClick={map.reset}>
        {map.isHome ? "全景" : `${Math.round(map.view.k * 100)}% · 复位`}
      </button>
      <button type="button" aria-label="放大" onClick={() => map.zoom(1.3)}>
        +
      </button>
    </span>
  );
}
