import { useEffect, type ReactNode } from "react";

/** Shared right slide-over shell. U7 renders stored text; U2 will render the raw file/PDF inside it. */
export function DocumentPanel({ open, onClose, header, meta, children }: {
  open: boolean; onClose: () => void; header: string; meta?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // D11: >=1024px the panel squeezes (no overlay) so the chat stays scrollable and clickable;
  // narrower viewports keep the U7 mask drawer. pointer-events pass through on the fixed root.
  return <div className="fixed inset-0 z-40 flex justify-end lg:pointer-events-none">
    <div className="absolute inset-0 bg-black/30 lg:hidden" aria-hidden="true" onClick={onClose}/>
    <div role="dialog" aria-modal="true" aria-label={"文档预览：" + header} className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-xl lg:pointer-events-auto lg:w-[36rem] lg:max-w-none lg:shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
        <div className="min-w-0"><h2 className="truncate font-semibold">{header}</h2>{meta}</div>
        <button className="shrink-0 rounded-lg border px-3 py-1 text-xs" onClick={onClose}>关闭 ✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </div>
  </div>;
}
