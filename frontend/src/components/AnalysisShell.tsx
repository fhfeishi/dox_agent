import { Outlet } from "react-router";

/** 存量分析: task templates only; saved results live in the inspector's 成果 view. */
export function AnalysisShell() {
  return <div className="flex min-h-0 flex-1 flex-col"><Outlet /></div>;
}
