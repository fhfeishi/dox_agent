import { useEffect, useRef, useState } from "react";
import type { YearWindow } from "../../domainAtlas";

/** Transient gestures never become URL selection until the gesture is committed. */
export function useLensGestures() {
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const [trace, setTrace] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const suppress = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerDrag = useRef<number | null>(null);
  function cancelPreview() {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
  }
  useEffect(() => cancelPreview, []);
  return {
    drag,
    trace,
    setTrace,
    suppress,
    previewTimer,
    drawerDrag,
    cancelPreview,
  };
}

export function useAnnualGestures() {
  const drag = useRef<{
    index: number;
    x: number;
    moved: boolean;
    end: number;
  } | null>(null);
  const pull = useRef<number | null>(null);
  const [draft, setDraft] = useState<YearWindow | null>(null);
  return { drag, pull, draft, setDraft };
}
