import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icons";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-side modal drawer shell: overlay, Esc close, focus trap and focus restore.
 * Shared by the ops drawer and the corpus detail so the a11y behaviour lives in one place.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerAction,
  children,
  level = "z-[80]",
  width = "max-w-[480px]",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
  level?: string;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length < 2) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`fixed inset-0 flex justify-end ${level}`}>
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex h-full w-full ${width} flex-col overflow-hidden border-l border-[var(--hairline)] bg-[var(--canvas)] shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)]`}
      >
        <div className="flex items-center gap-[10px] border-b border-[var(--hairline)] px-[20px] py-[14px]">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.2px] text-[var(--ink)]">{title}</h2>
            {subtitle}
          </div>
          {headerAction}
          <button
            type="button"
            aria-label="关闭 ✕"
            onClick={onClose}
            className="grid size-[30px] shrink-0 place-items-center rounded-[6px] text-[var(--slate)] hover:bg-[var(--surface)]"
          >
            <Icon name="close" size={16} strokeWidth={1.9} />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 space-y-[24px] overflow-y-auto px-[20px] py-[18px]">
          {children}
        </div>
      </div>
    </div>
  );
}
