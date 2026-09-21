import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Right-side modal drawer. Children (and their polling) unmount when closed. */
export function SettingsDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length < 2) return;
      const first = list[0], last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-30 flex justify-end">
    <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={onClose}/>
    <div ref={panel} role="dialog" aria-modal="true" aria-label="设置与运维" className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">设置与运维</h2>
        <button className="rounded-lg border px-3 py-1 text-xs" onClick={onClose}>关闭 ✕</button>
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  </div>;
}
