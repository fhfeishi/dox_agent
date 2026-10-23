import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PanelSizeSwitch } from "./Panel";
import { panelWidth, usePanelSize } from "../panelSize";

export type SlideStat = { value: ReactNode; label: string; tone?: "warn" | "ok" };
type Content = { eyebrow: string; title: ReactNode; meta?: ReactNode; stats?: SlideStat[]; warn?: ReactNode; footer?: ReactNode;
  children: ReactNode; label?: string; actions?: ReactNode };

/**
 * The right-hand slide-out for 首页 and 领域分析 (query 2026-1022 1606), in the same frame and motion as
 * the preview panel and the 分析工作区 (query 2026-1023 1044): below the top bar, inset and rounded, sliding
 * in and out over 320 ms. It leaves the page as it is — no scrim, no blur — so what opened it stays
 * readable beside it; ✕ or Escape closes it and focus returns to what opened it.
 *
 * The head is always eyebrow → title → meta → up to four figures → an optional caution; the body
 * scrolls; actions sit in a fixed foot. A panel that holds something to read (`sizeKey`) can be set to
 * 20, 40 or 60 % of the window; the short detail cards keep one width. A page keeps a single piece of
 * "what is open" state, so opening another panel replaces the content instead of stacking a second one.
 */
export function SlideOver({ open, onClose, sizeKey, ...content }: Content & { open: boolean; onClose: () => void; sizeKey?: string }) {
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);
  const [size, setSize] = usePanelSize(sizeKey ?? "slide", 20);
  // The last content stays while the panel slides out, so it leaves as it came instead of emptying first.
  const shown = useRef<Content>(content);
  if (open) shown.current = content;
  const { eyebrow, title, meta, stats, warn, footer, children, label, actions } = shown.current;
  // Callers pass a fresh onClose each render; only opening and closing should move focus.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, [open]);
  return createPortal(
    <aside ref={panel} tabIndex={-1} role="dialog" aria-hidden={!open} inert={!open}
      aria-label={label ?? (typeof title === "string" ? title : eyebrow)} className={`slide-over${open ? " is-open" : ""}`}
      style={sizeKey ? { "--slide-width": panelWidth(size, 452) } as CSSProperties : undefined}>
      <header className="slide-head">
        <div className="slide-top">
          <div className="min-w-0">
            <p className="slide-eyebrow">{eyebrow}</p>
            <h2 className="slide-title">{title}</h2>
            {meta ? <p className="slide-meta">{meta}</p> : null}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {actions}
            {sizeKey ? <PanelSizeSwitch value={size} onChange={setSize} /> : null}
            <button type="button" className="slide-x" onClick={onClose} aria-label="关闭">×</button>
          </div>
        </div>
        {stats?.length ? <dl className="slide-stats">{stats.map((s) => <div key={s.label}>
          <dd className={s.tone ? `is-${s.tone}` : ""}>{s.value}</dd><dt>{s.label}</dt></div>)}</dl> : null}
        {warn ? <p className="slide-warn">{warn}</p> : null}
      </header>
      <div className="slide-body">{children}</div>
      {footer ? <footer className="slide-foot">{footer}</footer> : null}
    </aside>, document.body);
}
