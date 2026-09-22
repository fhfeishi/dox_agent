import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icons";

/** Shared right slide-over shell for document preview / explorer. */
export function DocumentPanel({
  open,
  onClose,
  header,
  meta,
  children,
}: {
  open: boolean;
  onClose: () => void;
  header: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // >=1024px the panel squeezes (no overlay) so the chat stays scrollable and clickable;
  // narrower viewports keep the mask drawer. pointer-events pass through on the fixed root.
  // Width is fluid: full on phones, ~92vw on tablets, and a viewport-scaled clamp on desktop
  // (min 36rem, max 76rem) so large PDFs get a usable reading surface without covering everything.
  return (
    <div className="fixed inset-0 z-[75] flex justify-end lg:pointer-events-none">
      <div className="absolute inset-0 bg-black/30 lg:hidden" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={"文档预览：" + header}
        className="relative flex h-full w-full flex-col border-l border-[var(--hairline)] bg-[var(--surface-soft)] shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)] md:w-[min(760px,92vw)] lg:pointer-events-auto lg:m-4 lg:h-[calc(100dvh-2rem)] lg:w-[clamp(36rem,66vw,76rem)] lg:rounded-[14px] lg:border lg:shadow-[-24px_8px_60px_-24px_rgba(15,15,15,0.28)]"
      >
        <div className="flex items-start gap-[12px] border-b border-[var(--hairline)] px-[18px] pt-[14px] pb-[12px]">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-semibold text-[var(--ink)]">{header}</h2>
            {meta}
          </div>
          <button
            type="button"
            aria-label="关闭 ✕"
            onClick={onClose}
            className="grid size-[30px] shrink-0 place-items-center rounded-[6px] text-[var(--slate)] hover:bg-[var(--surface)]"
          >
            <Icon name="close" size={16} strokeWidth={1.9} />
          </button>
        </div>
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-auto p-[18px]">{children}</div>
      </div>
    </div>
  );
}
