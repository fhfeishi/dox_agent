import type { IconName } from "./components/Icons";
import { TERMS } from "./copy.ts";
import type { NavKey } from "./layout";

/**
 * Every way into the work areas, in one table (upgrade plan U2, design/界面.md §2): the top bar, the
 * folded 工作导航 menu on narrow screens and the work cards on 首页 are all made from it, so an entry is
 * named, ordered and shown to the same roles everywhere. Order follows query 2026-1019 2021.
 */
export type Role = "admin" | "leader" | "user";
export type NavPage = { to: string; label: string };
export type NavEntry = {
  key: NavKey;
  label: string;
  /** A plain entry opens this page; an entry with `pages` opens a menu of them instead. */
  to?: string;
  pages?: NavPage[];
  hint?: string;
  roles: Role[];
  /** A leader's bar stays short (query 2026-1014 1703): these sit together in one 工作台 menu. */
  workbench?: boolean;
  /** The work card on 首页, for the four work areas. */
  card?: { title: string; text: string; to: string; icon: IconName; accent: string };
};

const ALL: Role[] = ["admin", "leader", "user"];

// 存量分析 opens on 任务模版 and the four built-in tasks are one click away: each opens 对话工作台 on that
// task with its walkthrough (query 2026-1020 1719).
export const TASK_PAGES: NavPage[] = [
  { to: "/tasks", label: TERMS.taskTemplates.name },
  { to: "/chat?task=task1", label: "精准问答" },
  { to: "/chat?task=task2", label: "对比分析" },
  { to: "/chat?task=task3", label: "技术研判" },
  { to: "/chat?task=task4", label: "专项报告" },
];
export const REVIEW_PAGES: NavPage[] = [
  { to: "/review/formal", label: "形式审查" },
  { to: "/review/professional", label: "专业审查" },
  { to: "/review/templates", label: "审查模版" },
  { to: "/review/evidence", label: "技术证据库" },
];

export const NAV: NavEntry[] = [
  { key: "home", label: TERMS.home.name, to: "/home", hint: "开始工作、我的工作、最近报告", roles: ALL },
  { key: "overview", label: TERMS.overview.name, roles: ["admin"],
    pages: [{ to: "/overview/build", label: TERMS.build.name }, { to: "/overview/domains", label: TERMS.domains.name }] },
  // A leader's 资料库建设 is on 首页, so their 概览 is the one page 领域分析 (query 2026-1016).
  { key: "overview", label: TERMS.domains.name, to: "/overview/domains", roles: ["leader"] },
  { key: "library", label: TERMS.library.name, to: "/library", roles: ALL,
    card: { title: TERMS.libraryBrowse.name, text: "按领域浏览项目资料与原文", to: "/library", icon: "library", accent: "var(--area-library)" } },
  { key: "chat", label: TERMS.chat.name, to: "/chat", roles: ALL, workbench: true },
  { key: "tasks", label: TERMS.tasks.name, pages: TASK_PAGES, hint: "任务模版：精准问答、对比分析、技术研判、专项报告", roles: ALL, workbench: true,
    card: { title: TERMS.tasks.name, text: "对比项目、研判趋势、形成报告", to: "/tasks", icon: "tasks", accent: "var(--area-analysis)" } },
  { key: "review", label: TERMS.review.name, pages: REVIEW_PAGES, roles: ALL, workbench: true,
    card: { title: TERMS.review.name, text: "按模版核对申请书、开展技术评议", to: "/review/formal", icon: "review", accent: "var(--area-review)" } },
  { key: "intelligence", label: TERMS.intelligence.name, to: "/intelligence", hint: "上传外部材料进行分析", roles: ALL, workbench: true,
    card: { title: TERMS.intelligence.name, text: "结合外部材料分析背景与可行性", to: "/intelligence", icon: "forecast", accent: "var(--area-intelligence)" } },
  // 报告中心 (named 成果 until query 2026-1019 2021) is a page of its own after the work areas.
  { key: "results", label: TERMS.results.name, to: "/results", hint: "我的报告、周期总结与回收站", roles: ALL },
];

/** A bar item: an entry, or for a leader the one 工作台 menu that holds the work areas. */
export type BarItem = { kind: "entry"; entry: NavEntry } | { kind: "workbench"; label: string; entries: NavEntry[] };

export function barFor(role: Role): BarItem[] {
  const visible = NAV.filter((entry) => entry.roles.includes(role));
  if (role !== "leader") return visible.map((entry) => ({ kind: "entry", entry }));
  const items: BarItem[] = [];
  const bench = visible.filter((entry) => entry.workbench);
  for (const entry of visible) {
    if (!entry.workbench) items.push({ kind: "entry", entry });
    else if (entry === bench[0]) items.push({ kind: "workbench", label: TERMS.workbench.name, entries: bench });
  }
  return items;
}

/** The folded 工作导航 menu: every entry a role has, menus as sections that open in place. */
export function foldedFor(role: Role) {
  return NAV.filter((entry) => entry.roles.includes(role))
    .map((entry) => entry.pages ? { label: entry.label, children: entry.pages } : { to: entry.to!, label: entry.label });
}

/** The work cards on 首页, in bar order. */
export function workCards(role: Role) {
  return NAV.filter((entry) => entry.card && entry.roles.includes(role)).map((entry) => ({ key: entry.key, ...entry.card! }));
}

/** Whether a menu page is the one shown: the query must match too, so on /chat?task=task2 only 对比分析
 * is marked, not 任务模版 as well. */
export function isCurrent(to: string, pathname: string, search: string) {
  const target = new URL(to, "http://local");
  const path = pathname.replace(/\/$/, "");
  // /overview opens 资料库建设.
  const same = path === target.pathname || (target.pathname === "/overview/build" && path === "/overview");
  return same && target.search === search;
}
