import { useEffect, useState } from "react";

/**
 * Right-hand panels that hold something to read or work in — a report preview, the 分析工作区, a library
 * preview — can take 20, 40 or 60 % of the window (query 2026-1023 1044), never less than their readable
 * minimum. Each kind of panel remembers its choice in this browser.
 */
export type PanelSize = 20 | 40 | 60;
export const PANEL_SIZES: readonly PanelSize[] = [20, 40, 60];
export const panelWidth = (size: PanelSize, min: number) => `max(${min}px, ${size}vw)`;

export function usePanelSize(key: string, fallback: PanelSize = 20): [PanelSize, (size: PanelSize) => void] {
  const read = (): PanelSize => {
    try {
      const saved = Number(localStorage.getItem(`dox.panel.${key}`));
      return (PANEL_SIZES as readonly number[]).includes(saved) ? saved as PanelSize : fallback;
    } catch { return fallback; }
  };
  const [size, setSize] = useState<PanelSize>(read);
  // Panels that share a key (03's two previews) follow each other's choice while both are on the page.
  useEffect(() => {
    const follow = (event: Event) => { if ((event as CustomEvent<string>).detail === key) setSize(read()); };
    window.addEventListener("dox-panel-size", follow);
    return () => window.removeEventListener("dox-panel-size", follow);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [size, (next) => {
    setSize(next);
    try { localStorage.setItem(`dox.panel.${key}`, String(next)); } catch { /* kept for this visit */ }
    window.dispatchEvent(new CustomEvent("dox-panel-size", { detail: key }));
  }];
}
