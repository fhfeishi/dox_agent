import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../auth";
import { useApp, type NavKey } from "../store";
import { BrandMark, Icon } from "./Icons";
import { UserMenu } from "./UserMenu";

type MenuSection = { to?: string; label: string; children?: { to: string; label: string }[] };

const REVIEW_PAGES = [
  { to: "/review/formal", label: "形式审查" },
  { to: "/review/professional", label: "专业审查" },
  { to: "/review/templates", label: "审查模板" },
  { to: "/review/evidence", label: "技术证据库" },
];

const ITEMS: { key: NavKey; label: string; hint?: string }[] = [
  { key: "home", label: "首页", hint: "开始工作、我的工作、最近报告" },
  // 资料库 before 对话工作台 (query 2026-1019 2021).
  { key: "library", label: "资料库" },
  { key: "chat", label: "对话工作台" },
  { key: "tasks", label: "存量分析", hint: "任务模版：精准问答、对比分析、技术研判、专项报告" },
  { key: "review", label: "资料审查" },
  { key: "intelligence", label: "情报分析", hint: "上传外部材料进行分析" },
  // 报告中心 (named 成果 until query 2026-1019 2021: it holds reports and period summaries) is a page of its own, so it sits in the main bar after the work areas (query 2026-1019 1458).
  { key: "results", label: "报告中心", hint: "全部报告、周期总结与回收站" },
];

// 存量分析 opens on the 任务模版 page, and the four built-in tasks are one click away
// (query 2026-1019 2021). `?task=` opens that task's start form with the library picker in place.
const TASK_PAGES = [
  { to: "/tasks", label: "任务模版" },
  { to: "/tasks?task=task1", label: "精准问答" },
  { to: "/tasks?task=task2", label: "对比分析" },
  { to: "/tasks?task=task3", label: "技术研判" },
  { to: "/tasks?task=task4", label: "专项报告" },
];

// A leader's bar stays short (query 2026-1014 1703): the work pages sit in one 工作台 menu, where
// 存量分析 and 资料审查 fold open in place (query 2026-1019 2021).
const WORKBENCH_SECTIONS: MenuSection[] = [
  { to: "/chat", label: "对话工作台" },
  { label: "存量分析", children: TASK_PAGES },
  { label: "资料审查", children: REVIEW_PAGES },
  { to: "/intelligence", label: "情报分析" },
];

const OVERVIEW_PAGES = [
  { to: "/overview/build", label: "资料库建设" },
  { to: "/overview/domains", label: "领域分析" },
];

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
  const { nav, setNav, sidebarCollapsed, toggleSidebar, setDrawerOpen, llmTone, llmText, model } = useApp();
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
  const links: MenuSection[] = [
    { to: "/home", label: "首页" },
    ...(role === "admin" ? OVERVIEW_PAGES.map((p) => ({ to: p.to, label: "概览 · " + p.label })) : role === "leader" ? [{ to: "/overview/domains", label: "领域分析" }] : []),
    { to: "/library", label: "资料库" },
    { to: "/chat", label: "对话工作台" },
    { label: "存量分析", children: TASK_PAGES },
    { label: "资料审查", children: REVIEW_PAGES },
    { to: "/intelligence", label: "情报分析" },
    { to: "/results", label: "报告中心" },
  ];
  const tasksActive = nav === "tasks" || pathname.startsWith("/tasks");
  const reviewActive = nav === "review" || pathname.startsWith("/review");
  return <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--canvas)] px-3">
    {nav !== "home" && nav !== "overview" && nav !== "library" && nav !== "review" && nav !== "tasks" && nav !== "intelligence" && nav !== "results" ? <button type="button" aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
      onClick={toggleSidebar} className={icon}><Icon name="list" size={18} /></button> : <span className="w-8 shrink-0" />}
    <Link to="/home" aria-label="回到工作首页" className="mr-2 flex shrink-0 items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-[var(--navy)]"><BrandMark size={14} /></span>
      <span className="hidden text-emphasis font-semibold text-[var(--ink)] md:inline">资料工作台</span>
    </Link>
    <nav ref={navRef} aria-label="主导航" className={`min-w-0 flex-1 items-center gap-1 overflow-hidden ${folded ? "hidden" : "flex"}`}>
      {ITEMS.slice(0, 1).map((item) => <button key={item.key} type="button" aria-current={nav === item.key ? "page" : undefined} onClick={() => setNav(item.key)} title={item.hint} className={tab(nav === item.key)}>{item.label}</button>)}
      {role === "admin" ? <MenuTab label="概览" sections={OVERVIEW_PAGES} active={nav === "overview"}
        current={(to) => pathname === to || (to === "/overview/build" && pathname.replace(/\/$/, "") === "/overview")} />
        // A leader's 资料库建设 is on 首页, so their 概览 is the one page 领域分析 (query 2026-1016).
        : role === "leader" ? <Link to="/overview/domains" aria-current={nav === "overview" ? "page" : undefined} className={tab(nav === "overview")}>领域分析</Link> : null}
      {role === "leader" ? <>
        <button type="button" aria-current={nav === "library" ? "page" : undefined} onClick={() => setNav("library")} className={tab(nav === "library")}>资料库</button>
        <MenuTab label="工作台" sections={WORKBENCH_SECTIONS} active={["chat", "tasks", "review", "intelligence"].includes(nav)}
          current={(to) => pathname.startsWith(to.replace(/\/formal$/, ""))} />
        <button type="button" aria-current={nav === "results" ? "page" : undefined} onClick={() => setNav("results")} className={tab(nav === "results")}>报告中心</button>
      </> : <>
        <button type="button" aria-current={nav === "library" ? "page" : undefined} onClick={() => setNav("library")} className={tab(nav === "library")}>资料库</button>
        <button type="button" aria-current={nav === "chat" ? "page" : undefined} onClick={() => setNav("chat")} className={tab(nav === "chat")}>对话工作台</button>
        <MenuTab label="存量分析" sections={TASK_PAGES} active={tasksActive} current={(to) => pathname === new URL(to, "http://x").pathname} />
        <MenuTab label="资料审查" sections={REVIEW_PAGES} active={reviewActive} current={(to) => pathname.startsWith(to)} />
        <button type="button" aria-current={nav === "intelligence" ? "page" : undefined} onClick={() => setNav("intelligence")} title="上传外部材料进行分析" className={tab(nav === "intelligence")}>情报分析</button>
        <button type="button" aria-current={nav === "results" ? "page" : undefined} onClick={() => setNav("results")} className={tab(nav === "results")}>报告中心</button>
      </>}
    </nav>
    {folded ? <nav aria-label="工作导航" className="min-w-0 flex-1">
      <MenuTab label="工作导航" sections={links} active={false} current={(to) => pathname === to} />
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
