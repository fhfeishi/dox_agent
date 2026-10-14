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
  { key: "mine", label: "我的工作", hint: "我发起的对话、报告与审查" },
  { key: "chat", label: "对话工作台" },
  { key: "library", label: "资料库" },
  { key: "tasks", label: "存量分析", hint: "分析已有资料：问答、对比、技术研判、专项报告" },
  { key: "review", label: "资料审查" },
  { key: "intelligence", label: "情报分析", hint: "上传外部材料进行分析" },
];

/** 资料审查 opens a menu of its four pages; the menu closes on choice, outside click or Esc. */
function ReviewMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={box} className="relative shrink-0">
    <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={tab(active)}>资料审查 ▾</button>
    {open ? <div role="menu" aria-label="资料审查" className="fixed top-[52px] z-[90] w-[160px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-1.5 shadow-xl">
      {REVIEW_PAGES.map((page) => <Link key={page.to} role="menuitem" to={page.to}
        className={`block rounded-md px-3 py-2 text-[13px] hover:bg-[var(--surface)] ${pathname.startsWith(page.to) ? "font-semibold text-[var(--primary-pressed)]" : ""}`}>{page.label}</Link>)}
    </div> : null}
  </div>;
}

function tab(active: boolean) {
  return `relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] transition-colors ${active
    ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-pressed)]" : "text-[var(--slate)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`;
}

/**
 * The top navigation bar (query 2026-1013 1522): one row with the main areas in a fixed order,
 * 资料审查 as a menu of its pages, and on the right the model status, inspector, settings and the
 * account. The sidebar toggle sits at the far left so the context panel opens and closes in one place.
 */
export function TopNav() {
  const { role } = useAuth();
  const { nav, setNav, sidebarCollapsed, toggleSidebar, showInspector, setDrawerOpen, llmTone, llmText, model } = useApp();
  const icon = "grid size-8 shrink-0 place-items-center rounded-lg text-[var(--slate)] hover:bg-[var(--surface)]";
  return <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--canvas)] px-3">
    {nav !== "admin" && nav !== "mine" && nav !== "library" && nav !== "review" && nav !== "tasks" && nav !== "intelligence" ? <button type="button" aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
      onClick={toggleSidebar} className={icon}><Icon name="list" size={18} /></button> : <span className="w-8 shrink-0" />}
    <Link to="/" className="mr-2 flex shrink-0 items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-[var(--navy)]"><BrandMark size={14} /></span>
      <span className="hidden text-[15px] font-semibold text-[var(--ink)] md:inline">资料工作台</span>
    </Link>
    <nav aria-label="主导航" className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {role === "leader" ? <Link to="/" className={tab(false)} title="回到领导视图">领导视图</Link> : null}
      {role === "admin" ? <button type="button" aria-current={nav === "admin" ? "page" : undefined} onClick={() => setNav("admin")} className={tab(nav === "admin")}
        title="关键技术、需要处理的事项与近期工作">管理视图</button> : null}
      {ITEMS.map((item) => item.key === "review" ? <ReviewMenu key={item.key} active={nav === "review"} />
        : <button key={item.key} type="button" aria-current={nav === item.key ? "page" : undefined} onClick={() => setNav(item.key)} title={item.hint} className={tab(nav === item.key)}>{item.label}</button>)}
    </nav>
    {/* Model name, address and connection test are the administrator's (节点审查 B2); others see whether analysis is available. */}
    {role === "admin" ? <button type="button" title={`模型：${model || "未知"} · ${llmText}`} aria-label={`模型状态：${llmText}`} onClick={() => setDrawerOpen(true)}
      className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-[var(--steel)] hover:bg-[var(--surface)] sm:flex">
      <span className={`size-2 rounded-full ${llmTone}`} />模型</button>
      : <span title={`分析服务：${llmText}`} aria-label={`分析服务：${llmText}`} className="hidden shrink-0 items-center gap-1.5 px-2.5 py-1 text-[12px] text-[var(--steel)] sm:flex">
        <span className={`size-2 rounded-full ${llmTone}`} />分析服务</span>}
    <button type="button" onClick={() => showInspector({ kind: "activity" })} className="shrink-0 rounded-lg px-2 py-2 text-sm text-[var(--slate)] hover:bg-[var(--surface)]">任务进度</button>
    <button type="button" onClick={() => showInspector({ kind: "results" })} className="shrink-0 rounded-lg px-2 py-2 text-sm text-[var(--primary)] hover:bg-[var(--surface)]">报告中心</button>
    {role === "admin" ? <button type="button" aria-label="设置" title="设置" onClick={() => setDrawerOpen(true)} className={icon}><Icon name="settings" size={17} /></button> : null}
    <UserMenu />
  </header>;
}
