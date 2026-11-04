/** The drawing height of 领域分析's interactive charts, resolved to pixels (query 2026-11-03 1630).

 四象限、年度投入 and 技术谱系 used to size themselves by three different rules, so switching screens
 made the chart jump (555 → 680 → 721 px at 1920×1080). The height now lives in one place —
 `--atlas-chart-h` in globals.css — and this resolves it to pixels.

 A custom property read from JS comes back as its unresolved token stream
 (`clamp(520px, calc(100vh - 350px), 800px)`), so it cannot be parsed here; measuring a probe element
 is what resolves it, and it keeps the formula in CSS only. The probe is fixed, so it neither joins
 the layout nor extends any scroll area — a growing scroll height would re-trigger the
 ResizeObserver that calls this.
 */
let probe: HTMLDivElement | null = null;

export function chartHeight(host: Element): number {
  if (!host.isConnected) return 0;
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:-9999px;top:0;width:0;height:var(--atlas-chart-h);pointer-events:none";
  }
  host.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

/** The height a chart inside `frame` may take without pushing the page below the window.

 关键技术's two readings sat in a column with the domain chips and the level legend above them, and
 that column left most of the window empty: the tree was 420 px in a 1020 px window, the matrix 479
 (query 2026-11-04). This returns the room actually left, so a chart can fill it instead of picking
 a fixed number. The cap only stops a chart from growing past legibility on a very tall window; at
 4K (2160 px) a 900 px cap left two thirds of the screen empty.

 The chrome is measured from siblings (`frame`'s height minus the chart's own), never from the
 chart's height, so the result cannot feed back into its own inputs and the ResizeObserver settles.
 */
export function fitChart(frame: Element, content: Element, floor = 520, cap = 1600): number {
  const viewport = frame.closest("main");
  const viewportBox = viewport?.getBoundingClientRect();
  const box = frame.getBoundingClientRect();
  const contentBox = content.getBoundingClientRect();
  const chrome = Math.max(0, box.height - contentBox.height);
  const available =
    (viewport?.clientHeight ?? globalThis.innerHeight) -
    (box.top - (viewportBox?.top ?? 0) + (viewport?.scrollTop ?? globalThis.scrollY)) -
    12;
  return Math.round(Math.max(floor, Math.min(cap, available - chrome)));
}
