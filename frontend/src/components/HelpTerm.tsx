import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function HelpTerm({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const id = useId(),
    trigger = useRef<HTMLSpanElement>(null),
    tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open || !trigger.current || !tip.current) return;
    const anchor = trigger.current.getBoundingClientRect(),
      box = tip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12)),
      top:
        anchor.bottom + box.height + 8 <= innerHeight - 12
          ? anchor.bottom + 8
          : Math.max(12, anchor.top - box.height - 8),
    });
  }, [open, text]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <>
      <span
        ref={trigger}
        tabIndex={0}
        role="term"
        className="ui-help-term"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          if (document.activeElement !== trigger.current) setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              ref={tip}
              id={id}
              role="tooltip"
              className="ui-help-tooltip"
              style={position}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
