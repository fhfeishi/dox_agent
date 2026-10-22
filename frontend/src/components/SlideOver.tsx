import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type SlideStat = { value: ReactNode; label: string; tone?: "warn" | "ok" };

/**
 * The one right-hand slide-out for 首页 and 领域分析 (query 2026-1022 1606: "右侧滑出的逻辑统一").
 *
 * Every panel that slides in from the right behaves the same way: 452 px wide, over a light scrim,
 * one at a time; it closes with ✕, Escape or a click on the scrim, and focus returns to what opened
 * it. The head is always eyebrow → title → meta → up to four figures → an optional caution; the body
 * scrolls; actions sit in a fixed foot. A page keeps a single piece of "what is open" state, so
 * opening another panel replaces the content instead of stacking a second drawer.
 */
export function SlideOver({ open, onClose, eyebrow, title, meta, stats, warn, footer, children, label }: {
  open: boolean; onClose: () => void; eyebrow: string; title: ReactNode; meta?: ReactNode; stats?: SlideStat[];
  warn?: ReactNode; footer?: ReactNode; children: ReactNode; label?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);
  // Callers pass a fresh onClose each render; only opening and closing should move focus.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);
  return createPortal(<>
    <div className={`slide-mask${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
    <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-hidden={!open}
      aria-label={label ?? (typeof title === "string" ? title : eyebrow)} className={`slide-over${open ? " is-open" : ""}`}>
      {open ? <>
        <header className="slide-head">
          <div className="slide-top">
            <div className="min-w-0">
              <p className="slide-eyebrow">{eyebrow}</p>
              <h2 className="slide-title">{title}</h2>
              {meta ? <p className="slide-meta">{meta}</p> : null}
            </div>
            <button type="button" className="slide-x" onClick={onClose} aria-label="关闭">×</button>
          </div>
          {stats?.length ? <dl className="slide-stats">{stats.map((s) => <div key={s.label}>
            <dd className={s.tone ? `is-${s.tone}` : ""}>{s.value}</dd><dt>{s.label}</dt></div>)}</dl> : null}
          {warn ? <p className="slide-warn">{warn}</p> : null}
        </header>
        <div className="slide-body">{children}</div>
        {footer ? <footer className="slide-foot">{footer}</footer> : null}
      </> : null}
    </aside>
  </>, document.body);
}
