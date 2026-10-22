import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A keyword that carries its own explanation (query 2026-1022: "小字说明尽可能隐藏起来，鼠标移动到关键词
 * 或点击关键词才显示"). The word is dotted-underlined; hovering or focusing shows a small card, a click
 * pins it until the next click elsewhere or Escape. The page keeps its words and loses its footnotes.
 */
export function Hint({ children, text, side = "bottom", align = "center", className = "" }: {
  children: ReactNode; text: ReactNode; side?: "top" | "bottom"; align?: "start" | "center" | "end"; className?: string;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pinned) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setPinned(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setPinned(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [pinned]);
  const open = hover || pinned;
  return <span ref={box} className={`hint ${className}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    <button type="button" className="hint-word" aria-describedby={open ? id : undefined} aria-expanded={open}
      onClick={(event) => { event.stopPropagation(); setPinned(!pinned); }} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      {children}
    </button>
    {open ? <span role="tooltip" id={id} className={`hint-card is-${side} is-${align}`}>{text}</span> : null}
  </span>;
}
