import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "chat"
  | "library"
  | "tasks"
  | "reports"
  | "panel"
  | "settings"
  | "plus"
  | "search"
  | "chevronRight"
  | "chevronLeft"
  | "history"
  | "forecast"
  | "checklist"
  | "competitors"
  | "upload"
  | "download"
  | "dots"
  | "close"
  | "send"
  | "doc"
  | "trash"
  | "external"
  | "grid"
  | "book"
  | "copy"
  | "refresh"
  | "edit"
  | "reload"
  | "power"
  | "warning"
  | "info"
  | "archive"
  | "list";

const PATHS: Record<IconName, ReactNode> = {
  chat: (
    <path d="M20 12a7.5 7.5 0 01-10.9 6.7L4.5 20l1.4-4.4A7.5 7.5 0 1120 12z" />
  ),
  library: (
    <>
      <path d="M4 5.5c0-1 .8-1.5 1.7-1.5H11v15H5.7c-.9 0-1.7-.6-1.7-1.5v-12z" />
      <path d="M20 5.5c0-1-.8-1.5-1.7-1.5H13v15h5.3c.9 0 1.7-.6 1.7-1.5v-12z" />
    </>
  ),
  tasks: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
      <path d="M8 9.5h8M8 13h5.5M8 16.5h3" />
    </>
  ),
  reports: (
    <>
      <path d="M13.5 3.5H7.2A1.7 1.7 0 005.5 5.2v13.6a1.7 1.7 0 001.7 1.7h9.6a1.7 1.7 0 001.7-1.7V8.5l-5-5z" />
      <path d="M13.5 3.5v5h5" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6M17.9 17.9l-1.6-1.6M7.7 7.7L6.1 6.1" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  chevronLeft: <path d="M14.5 6l-6 6 6 6" />,
  history: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  forecast: <path d="M4 16l5-5 4 3 7-8" />,
  checklist: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  competitors: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </>
  ),
  upload: <path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5M5 18.5h14" />,
  download: <path d="M12 4.5v11m0 0L7.5 11M12 15.5l4.5-4.5M5 19.5h14" />,
  dots: (
    <>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  send: <path d="M5 12h13M12.5 6l6 6-6 6" />,
  doc: (
    <>
      <path d="M13.5 3.5H7.2A1.7 1.7 0 005.5 5.2v13.6a1.7 1.7 0 001.7 1.7h9.6a1.7 1.7 0 001.7-1.7V8.5l-5-5z" />
      <path d="M13.5 3.5v5h5" />
    </>
  ),
  trash: <path d="M5 7h14M9.5 7V5.5h5V7M7 7l1 12.5h8L17 7" />,
  external: <path d="M14 4.5h5.5V10M19 5l-7.5 7.5M17 14v4.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 015 18.5v-9A1.5 1.5 0 016.5 8H11" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </>
  ),
  list: (
    <>
      <path d="M8 6.5h12M8 12h12M8 17.5h12" />
      <path d="M4 6.5h.01M4 12h.01M4 17.5h.01" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5v-13z" />
      <path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5v-13z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 11-2.4-5.7" />
      <path d="M20 4.5V10h-5.5" />
    </>
  ),
  reload: (
    <>
      <path d="M4.5 12a7.5 7.5 0 111.9 5" />
      <path d="M4.5 19.5V14h5.5" />
    </>
  ),
  edit: (
    <>
      <path d="M15.5 5.2l3.3 3.3L9.6 17.7l-4.1.8.8-4.1L15.5 5.2z" />
      <path d="M14 6.8l3.2 3.2" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5v8.5" />
      <path d="M6.8 7.2a7.5 7.5 0 1 0 10.4 0" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.5l8 14H4l8-14z" />
      <path d="M12 10v4M12 16.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  archive: (
    <>
      <rect x="4" y="4.5" width="16" height="4" rx="1.2" />
      <path d="M5.5 8.5V18a1.5 1.5 0 001.5 1.5h10A1.5 1.5 0 0018.5 18V8.5M10 12h4" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className = "",
  ...rest
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Brand mark, independent of the stroke icon set */
export function BrandMark({ size = 16, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7.5 13.2H4.5L12 3z" stroke={color} strokeWidth="1.9" strokeLinejoin="round" />
      <circle cx="12" cy="17.6" r="2.4" fill="var(--primary)" />
    </svg>
  );
}
