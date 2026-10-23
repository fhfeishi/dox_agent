import { useRef, type ReactNode } from "react";
import { Icon } from "./Icons";
import type { PanelSize } from "../panelSize";

// Left to right the stops read 60 %, 40 %, 20 %: pulling the knob towards the page widens the panel.
const STOPS: readonly PanelSize[] = [60, 40, 20];

/**
 * The panel width as one ○──○──○ slider (query 2026-1023 1156), the same in every right-hand panel and
 * always next to its ✕. Click a stop, drag along the line, or use ← → on the keyboard. Hidden on narrow
 * screens, where panels take the full width.
 */
export function PanelSizeSwitch({ value, onChange }: { value: PanelSize; onChange: (size: PanelSize) => void }) {
  const track = useRef<HTMLSpanElement>(null);
  const index = Math.max(0, STOPS.indexOf(value));
  const set = (next: number) => { const size = STOPS[Math.min(STOPS.length - 1, Math.max(0, next))]; if (size !== value) onChange(size); };
  const pick = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (box?.width) set(Math.round(((clientX - box.left) / box.width) * (STOPS.length - 1)));
  };
  return <span role="slider" tabIndex={0} aria-label="面板宽度" aria-valuemin={20} aria-valuemax={60} aria-valuenow={value}
    aria-valuetext={`窗口宽度的 ${value}%`} title={`面板宽度：窗口的 ${value}%（左宽右窄）`} className="panel-size"
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pick(event.clientX); }}
    onPointerMove={(event) => { if (event.buttons) pick(event.clientX); }}
    onKeyDown={(event) => {
      const step = { ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, Home: -9, End: 9 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      set(index + step);
    }}>
    <span ref={track} className="panel-size-track" aria-hidden="true">
      {STOPS.map((size, i) => <i key={size} className={i === index ? "is-on" : ""} style={{ left: `${(i / (STOPS.length - 1)) * 100}%` }} />)}
    </span>
    <span className="panel-size-value" aria-hidden="true">{value}%</span>
  </span>;
}

/**
 * The shared look of the right-hand panels (query 2026-1015 1553): the preview panel and the library
 * chat use the same shell, header (back, title over a one-line subtitle, actions) and tabs.
 */
export const PANEL_SHELL = "flex flex-col overflow-hidden border border-[var(--hairline)] bg-[var(--surface-soft)] shadow-[-8px_0_28px_-12px_rgba(15,23,42,0.18)] sm:rounded-[14px]";

export function PanelButton({ label, onClick, active, disabled, children }: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode;
}) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
    className={`grid size-[28px] shrink-0 place-items-center rounded-[7px] text-body transition-colors disabled:opacity-40 ${active
      ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--steel)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`}>{children}</button>;
}

export function PanelHeader({ title, subtitle, onBack, backLabel = "返回上一预览", actions }: {
  title: ReactNode; subtitle?: ReactNode; onBack?: () => void; backLabel?: string; actions?: ReactNode;
}) {
  return <div className="flex items-start gap-[8px] border-b border-[var(--hairline)] bg-[var(--canvas)] px-[14px] py-[11px]">
    {onBack ? <PanelButton label={backLabel} onClick={onBack}><Icon name="chevronLeft" size={14} /></PanelButton> : null}
    <div className="min-w-0 flex-1 py-[1px]">
      <h2 className="truncate text-body font-semibold tracking-[-0.1px] text-[var(--ink)]">{title}</h2>
      {subtitle ? <p className="mt-[1px] truncate text-caption text-[var(--stone)]">{subtitle}</p> : null}
    </div>
    <div className="flex shrink-0 items-center gap-[2px]">{actions}</div>
  </div>;
}

export function PanelTabs<K extends string>({ tabs, value, onChange, label }: {
  tabs: readonly (readonly [K, string])[]; value: K; onChange: (key: K) => void; label: string;
}) {
  return <div role="tablist" aria-label={label} className="flex gap-[2px] border-b border-[var(--hairline)] bg-[var(--canvas)] px-[10px]">
    {tabs.map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={value === key} tabIndex={value === key ? 0 : -1}
      onKeyDown={(event) => {
        const index = tabs.findIndex(([id]) => id === key);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
          : event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : -1;
        if (next < 0) return;
        event.preventDefault();
        onChange(tabs[next][0]);
        (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
      }} onClick={() => onChange(key)}
      className={`font-app -mb-px border-b-2 px-[10px] py-[8px] text-body transition-colors ${value === key
        ? "border-b-[var(--primary)] font-semibold text-[var(--ink)]" : "border-b-transparent text-[var(--steel)] hover:text-[var(--charcoal)]"}`}>{text}</button>)}
  </div>;
}
