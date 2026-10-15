import type { ReactNode } from "react";
import { Icon } from "./Icons";

/**
 * The shared look of the right-hand panels (query 2026-1015 1553): the preview panel and the library
 * chat use the same shell, header (back, title over a one-line subtitle, actions) and tabs.
 */
export const PANEL_SHELL = "flex flex-col overflow-hidden border border-[var(--hairline)] bg-[var(--surface-soft)] shadow-[-24px_8px_60px_-24px_rgba(15,15,15,0.28)] sm:rounded-[14px]";

export function PanelButton({ label, onClick, active, disabled, children }: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode;
}) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
    className={`grid size-[28px] shrink-0 place-items-center rounded-[7px] text-[12.5px] transition-colors disabled:opacity-40 ${active
      ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--steel)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`}>{children}</button>;
}

export function PanelHeader({ title, subtitle, onBack, backLabel = "返回上一预览", actions }: {
  title: ReactNode; subtitle?: ReactNode; onBack?: () => void; backLabel?: string; actions?: ReactNode;
}) {
  return <div className="flex items-start gap-[8px] border-b border-[var(--hairline)] bg-[var(--canvas)] px-[14px] py-[11px]">
    {onBack ? <PanelButton label={backLabel} onClick={onBack}><Icon name="chevronLeft" size={14} /></PanelButton> : null}
    <div className="min-w-0 flex-1 py-[1px]">
      <h2 className="truncate text-[14px] font-semibold tracking-[-0.1px] text-[var(--ink)]">{title}</h2>
      {subtitle ? <p className="mt-[1px] truncate text-[11.5px] text-[var(--stone)]">{subtitle}</p> : null}
    </div>
    <div className="flex shrink-0 items-center gap-[2px]">{actions}</div>
  </div>;
}

export function PanelTabs<K extends string>({ tabs, value, onChange, label }: {
  tabs: readonly (readonly [K, string])[]; value: K; onChange: (key: K) => void; label: string;
}) {
  return <div role="tablist" aria-label={label} className="flex gap-[2px] border-b border-[var(--hairline)] bg-[var(--canvas)] px-[10px]">
    {tabs.map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}
      className={`font-app -mb-px border-b-2 px-[10px] py-[8px] text-[12.5px] transition-colors ${value === key
        ? "border-b-[var(--primary)] font-semibold text-[var(--ink)]" : "border-b-transparent text-[var(--steel)] hover:text-[var(--charcoal)]"}`}>{text}</button>)}
  </div>;
}
