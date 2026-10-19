import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

// Shared layout has no data fetching or imports from review feature pages.
const TABS: { to: string; label: string; keep?: boolean }[] = [
  { to: "/review/formal", label: "形式审查", keep: true },
  { to: "/review/professional", label: "专业审查", keep: true },
  { to: "/review/templates", label: "审查模板" },
  { to: "/review/evidence", label: "技术证据库" },
];
export function ReviewPageShell({ title, description = "", children }: { title: string; description?: string; children: ReactNode }) {
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  // Materials travel between the two task entries; templates are per task type and do not.
  const materials = new URLSearchParams([...search].filter(([key]) => key === "proposal" || key === "sheet")).toString();
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-[10px] border-b border-[var(--hairline)] py-2 pr-[14px] pl-[18px]">
        <span className="text-[14px] font-semibold text-[var(--ink)]">资料审查</span>
        <span className="flex-1" />
        {TABS.map((tab) => (
          <Link key={tab.to} to={tab.keep && materials ? tab.to + "?" + materials : tab.to} aria-current={pathname.startsWith(tab.to) ? "page" : undefined}
            className={`rounded-[7px] px-[11px] py-[6px] text-[12px] hover:bg-[var(--surface)] ${pathname.startsWith(tab.to) ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-pressed)]" : "text-[var(--steel)]"}`}>
            {tab.label}
          </Link>
        ))}
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1080px] px-4 pt-[26px] sm:px-[34px]">
          <h1 className="mb-[6px] text-[26px] font-semibold tracking-[-0.6px] text-[var(--ink)]">{title}</h1>
          {description ? <p className="max-w-[720px] text-[13.5px] leading-[1.6] text-[var(--steel)]">{description}</p> : null}
        </div>
        <div className="mx-auto w-full max-w-[1080px] px-4 pt-[22px] pb-[40px] sm:px-[34px]">{children}</div>
      </div>
    </section>
  );
}
export function ReviewNotice({ text, error }: { text: string; error?: boolean }) {
  if (!text) return null;
  return <p role={error ? "alert" : "status"} className={`mb-[10px] text-[12.5px] ${error ? "text-[var(--red)]" : "text-[var(--steel)]"}`}>{text}</p>;
}
