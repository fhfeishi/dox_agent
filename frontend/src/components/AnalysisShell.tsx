import { Link, Outlet, useLocation } from "react-router";
export function AnalysisShell() {
  const location = useLocation();
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap gap-2 border-b border-[var(--hairline)] bg-[var(--surface)] px-6 py-3">
      {[["/tasks", "分析任务"], ["/tasks/results", "分析成果与回收站"]].map(([to, label]) =>
        <Link key={to} to={to} aria-current={location.pathname === to ? "page" : undefined}
          className={"rounded-lg px-4 py-2 text-sm " + (location.pathname === to ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--steel)]")}>{label}</Link>)}
    </div><Outlet />
  </div>;
}
