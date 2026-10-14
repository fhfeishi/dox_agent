import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../auth";
import { useApp, type NavKey } from "../store";
import { BrandMark, Icon } from "./Icons";
import { UserMenu } from "./UserMenu";

const REVIEW_PAGES = [
  { to: "/review/formal", label: "形式审查" },
  { to: "/review/professional", label: "专业审查" },
  { to: "/review/templates", label: "审查模板" },
  { to: "/review/evidence", label: "技术证据库" },
];

const ITEMS: { key: NavKey; label: string; hint?: string }[] = [
  { key: "home", label: "首页", hint: "开始工作、我的工作、最近报告" },
  { key: "chat", label: "对话工作台" },
  { key: "library", label: "资料库" },
  { key: "tasks", label: "存量分析", hint: "分析已有资料：问答、对比、技术研判、专项报告" },
  { key: "review", label: "资料审查" },
  { key: "intelligence", label: "情报分析", hint: "上传外部材料进行分析" },
];

const OVERVIEW_PAGES = [
  { to: "/overview/build", label: "资料库建设" },
  { to: "/overview/domains", label: "领域分析" },
  { to: "/overview/recent", label: "近期工作" },
];

/**
 * A top-bar entry that opens a menu of its pages (资料审查, 概览); the menu closes on choice, outside
 * click or Esc. The bar keeps the same entries on every page (query 2026-1014 1516).
 */
function MenuTab({ label, pages, active, current }: { label: string; pages: { to: string; label: string }[]; active: boolean; current: (to: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 52, left: 8 });
  const trigger = useRef<HTMLButtonElement>(null);
  function reveal() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - 216)) });
    setOpen(true);
  }
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
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
      {pages.map((page) => <Link key={page.to} role="menuitem" to={page.to}
        className={`block rounded-md px-3 py-2 text-[13px] hover:bg-[var(--surface)] ${current(page.to) ? "font-semibold text-[var(--primary-pressed)]" : ""}`}>{page.label}</Link>)}
    </div> : null}
  </div>;
}

function tab(active: boolean) {
  return `relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors ${active
    ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--slate)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`;
}

/**
 * The top navigation bar (query 2026-1013 1522, 2026-1014 1516): one row with the main areas in a
 * fixed order — 首页, then 概览 for administrators and leaders and 资料审查 as menus of their pages — and on the
 * right the analysis status, 成果, settings and the account. The same bar on every page for a role.
 */
export function TopNav() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const { nav, setNav, sidebarCollapsed, toggleSidebar, showInspector, setDrawerOpen, llmTone, llmText, model } = useApp();
  const icon = "grid size-8 shrink-0 place-items-center rounded-lg text-[var(--slate)] hover:bg-[var(--surface)]";
  const links = [
    { to: "/home", label: "首页" },
    ...(role !== "user" ? OVERVIEW_PAGES.map((p) => ({ ...p, label: "概览 · " + p.label })) : []),
    { to: "/chat", label: "对话工作台" },
    { to: "/library", label: "资料库" }, { to: "/tasks", label: "存量分析" },
    ...REVIEW_PAGES, { to: "/intelligence", label: "情报分析" },
  ];
  return <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--canvas)] px-3">
    {nav !== "home" && nav !== "overview" && nav !== "library" && nav !== "review" && nav !== "tasks" && nav !== "intelligence" ? <button type="button" aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
      onClick={toggleSidebar} className={icon}><Icon name="list" size={18} /></button> : <span className="w-8 shrink-0" />}
    <Link to="/home" aria-label="回到工作首页" className="mr-2 flex shrink-0 items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-[var(--navy)]"><BrandMark size={14} /></span>
      <span className="hidden text-[15px] font-semibold text-[var(--ink)] md:inline">资料工作台</span>
    </Link>
    <nav aria-label="主导航" className="hidden min-w-0 flex-1 items-center gap-1 xl:flex">
      {ITEMS.slice(0, 1).map((item) => <button key={item.key} type="button" aria-current={nav === item.key ? "page" : undefined} onClick={() => setNav(item.key)} title={item.hint} className={tab(nav === item.key)}>{item.label}</button>)}
      {role !== "user" ? <MenuTab label="概览" pages={OVERVIEW_PAGES} active={nav === "overview"}
        current={(to) => pathname === to || (to === "/overview/build" && pathname.replace(/\/$/, "") === "/overview")} /> : null}
      {ITEMS.slice(1).map((item) => item.key === "review" ? <MenuTab key={item.key} label="资料审查" pages={REVIEW_PAGES} active={nav === "review"} current={(to) => pathname.startsWith(to)} />
        : <button key={item.key} type="button" aria-current={nav === item.key ? "page" : undefined} onClick={() => setNav(item.key)} title={item.hint} className={tab(nav === item.key)}>{item.label}</button>)}
    </nav>
    <nav aria-label="工作导航" className="min-w-0 flex-1 xl:hidden">
      <MenuTab label="工作导航" pages={links} active={false} current={(to) => pathname === to} />
    </nav>
    {/* Model name, address and connection test are the administrator's (节点审查 B2); others see whether analysis is available. */}
    {role === "admin" ? <button type="button" title={`模型：${model || "未知"} · ${llmText}`} aria-label={`模型状态：${llmText}`} onClick={() => setDrawerOpen(true)}
      className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-[var(--steel)] hover:bg-[var(--surface)] sm:flex">
      <span className={`size-2 rounded-full ${llmTone}`} />模型</button>
      : <span title={`分析服务：${llmText}`} aria-label={`分析服务：${llmText}`} className="hidden shrink-0 items-center gap-1.5 px-2.5 py-1 text-[12px] text-[var(--steel)] sm:flex">
        <span className={`size-2 rounded-full ${llmTone}`} />分析服务</span>}
    {/* 成果: every generated report with its counts and what is still being produced (query 2026-1014 1516). */}
    <button type="button" onClick={() => showInspector({ kind: "results" })} className="shrink-0 rounded-lg px-3 py-2 text-sm text-[var(--primary)] hover:bg-[var(--surface)]">成果</button>
    {role === "admin" ? <button type="button" aria-label="设置" title="设置" onClick={() => setDrawerOpen(true)} className={icon}><Icon name="settings" size={17} /></button> : null}
    <UserMenu />
  </header>;
}
