import { useRef, useState } from "react";
import type { YearWindow } from "../../domainAtlas";
export function useAnnualGestures() {
  const drag = useRef<{
    index: number;
    x: number;
    moved: boolean;
    end: number;
  } | null>(null);
  const [draft, setDraft] = useState<YearWindow | null>(null);
  return { drag, draft, setDraft };
}
