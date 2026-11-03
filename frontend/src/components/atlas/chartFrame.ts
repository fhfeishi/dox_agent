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
