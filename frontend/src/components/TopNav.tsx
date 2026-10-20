import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../auth";
import { barFor, foldedFor, isCurrent, type NavEntry } from "../navigation";
import { useApp } from "../store";
import { BrandMark, Icon } from "./Icons";
import { UserMenu } from "./UserMenu";
import { useLayout } from "../layout";

type MenuSection = { to?: string; label: string; children?: { to: string; label: string }[] };

/**
 * A top-bar entry that opens a menu of its pages (概览, 存量分析, 资料审查, 工作台); a section with
 * `children` folds open in place. The menu closes on choice, outside click or Esc, and keeps one
 * fixed entry order on every page for a role (query 2026-1014 1516).
 */
function MenuTab({ label, sections, active, current }: { label: string; sections: MenuSection[]; active: boolean; current: (to: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 52, left: 8 });
  const trigger = useRef<HTMLButtonElement>(null);
  function reveal() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - 216)) });
    setOpen(true);
  }
  const box = useRef<HTMLDivElement>(null);
  const { pathname, search } = useLocation();
  useEffect(() => { setOpen(false); setExpanded(null); }, [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    const resize = () => setOpen(false);
    window.addEventListener("resize", resize);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); window.removeEventListener("resize", resize); };
  }, [open]);
  return <div ref={box} className="relative shrink-0">
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open}
      onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); reveal(); window.requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()); } }}
      onClick={() => open ? setOpen(false) : reveal()} className={tab(active)}>{label} ▾</button>
    {open ? <div role="menu" aria-label={label} style={position} onKeyDown={(e) => {
        const entries = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        const index = entries.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (index + 1) % entries.length : e.key === "ArrowUp" ? (index - 1 + entries.length) % entries.length
          : e.key === "Home" ? 0 : e.key === "End" ? entries.length - 1 : -1;
        if (next >= 0) { e.preventDefault(); entries[next]?.focus(); }
      }} className="fixed z-[90] max-h-[70vh] w-[208px] overflow-y-auto rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-1.5 shadow-xl">
      {sections.map((section) => section.children ? <div key={section.label}>
        <button type="button" role="menuitem" aria-expanded={expanded === section.label}
          onClick={() => setExpanded(expanded === section.label ? null : section.label)}
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-body text-[var(--ink)] hover:bg-[var(--surface)]">
          {section.label}<span aria-hidden="true" className="text-[var(--stone)]">{expanded === section.label ? "−" : "+"}</span>
        </button>
        {expanded === section.label ? <div className="mb-1 ml-3 space-y-0.5 border-l border-[var(--hairline)] pl-1.5">
          {section.children.map((page) => <Link key={page.to} role="menuitem" to={page.to}
            className={`block rounded-md px-3 py-1.5 text-body hover:bg-[var(--surface)] ${current(page.to) ? "font-semibold text-[var(--primary-pressed)]" : ""}`}>{page.label}</Link>)}
        </div> : null}
      </div> : <Link key={section.to} role="menuitem" to={section.to!}
        className={`block rounded-md px-3 py-2 text-body hover:bg-[var(--surface)] ${current(section.to!) ? "font-semibold text-[var(--primary-pressed)]" : ""}`}>{section.label}</Link>)}
    </div> : null}
  </div>;
}

function tab(active: boolean) {
  return `relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-body font-medium transition-colors ${active
    ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--slate)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`;
}

/**
 * The top navigation bar (query 2026-1013 1522, 2026-1014 1516, 2026-1019 2021): one row with the
 * main areas in a fixed order — 首页, 资料库, 对话工作台, then 存量分析 and 资料审查 as menus — and on
 * the right the analysis status, settings and the account; 成果 is the last main entry.
 */
export function TopNav() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const { llmTone, llmText, model } = useApp();
  const { nav, sidebarCollapsed, toggleSidebar, setDrawerOpen } = useLayout();
  const icon = "grid size-8 shrink-0 place-items-center rounded-lg text-[var(--slate)] hover:bg-[var(--surface)]";
  // The full bar folds into one menu only when its entries do not fit (query 2026-1016: a laptop
  // screen folded it at the old fixed 1280 px although the entries fit in about 950 px).
  const navRef = useRef<HTMLElement>(null);
  const [folded, setFolded] = useState(false);
  const needed = useRef(0);
  useLayoutEffect(() => {
    const check = () => {
      const bar = navRef.current;
      if (bar && !folded && bar.scrollWidth > bar.clientWidth + 1) {
        needed.current = window.innerWidth + bar.scrollWidth - bar.clientWidth;
        setFolded(true);
      } else if (folded && window.innerWidth >= needed.current) setFolded(false);
    };
    check();
    window.addEventListener("resize", check);
    // Entries can grow after the first layout (web fonts, the account's role arriving): measure again
    // whenever one of them changes size, or 报告中心 is clipped off the end of an unfolded bar.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    for (const entry of Array.from(navRef.current?.children ?? [])) observer?.observe(entry);
    void document.fonts?.ready.then(check);
    return () => { window.removeEventListener("resize", check); observer?.disconnect(); };
  }, [folded, role]);
  useEffect(() => { setFolded(false); }, [role]);
  const { search } = useLocation();
  const current = (to: string) => isCurrent(to, pathname, search);
  const isOn = (entry: NavEntry) => nav === entry.key || Boolean(entry.pages?.some((page) => pathname.startsWith(new URL(page.to, "http://local").pathname)));
  // One entry, whatever the role: a link, or a menu of its pages.
  const entryTab = (entry: NavEntry) => entry.pages
    ? <MenuTab key={entry.label} label={entry.label} sections={entry.pages} active={isOn(entry)} current={current} />
    : <Link key={entry.label} to={entry.to!} title={entry.hint} aria-current={isOn(entry) ? "page" : undefined} className={tab(isOn(entry))}>{entry.label}</Link>;
  return <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--canvas)] px-3">
    {nav !== "home" && nav !== "overview" && nav !== "library" && nav !== "review" && nav !== "tasks" && nav !== "intelligence" && nav !== "results" ? <button type="button" aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
      onClick={toggleSidebar} className={icon}><Icon name="list" size={18} /></button> : <span className="w-8 shrink-0" />}
    <Link to="/home" aria-label="回到工作首页" className="mr-2 flex shrink-0 items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-[var(--navy)]"><BrandMark size={14} /></span>
      <span className="hidden text-emphasis font-semibold text-[var(--ink)] md:inline">资料工作台</span>
    </Link>
    <nav ref={navRef} aria-label="主导航" className={`min-w-0 flex-1 items-center gap-1 overflow-hidden ${folded ? "hidden" : "flex"}`}>
      {barFor(role).map((item) => item.kind === "entry" ? entryTab(item.entry)
        : <MenuTab key={item.label} label={item.label} active={item.entries.some(isOn)} current={current}
            sections={item.entries.map((entry) => entry.pages ? { label: entry.label, children: entry.pages } : { to: entry.to!, label: entry.label })} />)}
    </nav>
    {folded ? <nav aria-label="工作导航" className="min-w-0 flex-1">
      <MenuTab label="工作导航" sections={foldedFor(role)} active={false} current={current} />
    </nav> : null}
    {/* Model name, address and connection test are the administrator's (节点审查 B2); others see whether analysis is available. */}
    {role === "admin" ? <button type="button" title={`模型：${model || "未知"} · ${llmText}`} aria-label={`模型状态：${llmText}`} onClick={() => setDrawerOpen(true)}
      className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-caption text-[var(--steel)] hover:bg-[var(--surface)] sm:flex">
      <span className={`size-2 rounded-full ${llmTone}`} />模型</button>
      // Others are told about the analysis service only when it is not available.
      : llmText !== "正常" ? <span title={`分析服务：${llmText}`} aria-label={`分析服务：${llmText}`} className="hidden shrink-0 items-center gap-1.5 px-2.5 py-1 text-caption text-[var(--steel)] sm:flex">
        <span className={`size-2 rounded-full ${llmTone}`} />分析服务{llmText}</span> : null}
    {role === "admin" ? <button type="button" aria-label="设置" title="设置" onClick={() => setDrawerOpen(true)} className={icon}><Icon name="settings" size={17} /></button> : null}
    <UserMenu />
  </header>;
}
