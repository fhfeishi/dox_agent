import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";
import type { DocumentInfo } from "./useDocuments";
import { usePanelSize, type PanelSize } from "./panelSize";

export type NavKey = "home" | "overview" | "chat" | "tasks" | "library" | "review" | "intelligence" | "results";
/** What the right-hand panel shows. "answer" is the 对话工作台's own view of the latest answer and is shown only there. */
export type InspectorTarget = { kind: "answer" } | { kind: "task"; taskId: string; edit?: boolean } |
  { kind: "template"; templateId: string; edit?: boolean } |
  { kind: "web"; snapshotId: string } |
  { kind: "input"; inputId: string } |
  { kind: "project"; corpusId: string; projectId: string; facet: string } |
  { kind: "review-template"; templateId: string } |
  { kind: "review-source"; fileId: string; page: number; title?: string; evidence?: boolean } |
  { kind: "corpus"; corpusId: string } | { kind: "report"; reportId: string; sessionKey: string } |
  { kind: "artifact"; artifactId: string } |
  { kind: "document"; doc: DocumentInfo; page: number | null; corpusId: string } |
  { kind: "execution"; runId?: string }
  | { kind: "target"; corpusId: string; docId: string; index: number }
  | { kind: "year"; corpusId: string; year: number };

function inspectorIdentity(target: InspectorTarget): string {
  switch (target.kind) {
    case "answer": return "answer";
    case "task": return `task:${target.taskId}${target.edit ? ":edit" : ""}`;
    case "template": return `template:${target.templateId}${target.edit ? ":edit" : ""}`;
    case "review-template": return "review-template:" + target.templateId;
    case "review-source": return "review-source:" + (target.evidence ? "evidence:" : "") + target.fileId + ":" + target.page;
    case "project": return "project:" + target.corpusId + ":" + target.projectId + ":" + target.facet;
    case "input": return "input:" + target.inputId;
    case "web": return `web:${target.snapshotId}`;
    case "corpus": return `corpus:${target.corpusId}`;
    case "report": return `report:${target.sessionKey}:${target.reportId}`;
    case "artifact": return `artifact:${target.artifactId}`;
    case "document": return `document:${target.corpusId}:${target.doc.doc_id}:${target.doc.version}:${target.page ?? 0}`;
    case "execution": return `execution:${target.runId ?? "latest"}`;
    case "target": return `target:${target.corpusId}:${target.docId}:${target.index}`;
    case "year": return `year:${target.corpusId}:${target.year}`;
  }
}
export type PreviewTarget = { doc: DocumentInfo; page: number | null; corpusId?: string } | null;

/**
 * The page's layout (upgrade plan F2): which work area is shown, what the right-hand panel shows and its
 * way back, the enlarged preview, the settings drawer, the side bar and the passing notice. It holds no
 * data and no conversation; the work context (store.tsx) and the pages use it through `useLayout()`.
 */
export interface LayoutValue {
  nav: NavKey;
  setNav: (n: NavKey) => void;
  toast: string | null;
  showToast: (message: string) => void;
  /** Open a preview for a specific corpus (browsing must not depend on the active corpus). */
  openPreview: (doc: DocumentInfo, page: number | null, corpusId: string) => void;
  openFullPreview: (doc: DocumentInfo, page: number | null, corpusId: string, returnToInspector?: boolean, focus?: string) => void;
  /** 四维证据：统一走放大预览（可靠页码 PDF 跳页，否则在解析正文中定位引文）。 */
  openEvidence: (doc: DocumentInfo, page: number | null, corpusId: string, focus?: string) => void;
  closeFullPreview: () => void;
  previewDoc: PreviewTarget;
  setPreviewDoc: Dispatch<SetStateAction<PreviewTarget>>;
  /** 放大预览承载的证据引文：命中时在解析正文中定位，为空表示按页码/普通预览打开。 */
  previewFocus: string | null;
  openCorpus: (id: string, view?: "files" | "target") => void;
  corpusView: "files" | "target";
  setCorpusView: (view: "files" | "target") => void;
  closeCorpus: () => void;
  newCorpusOpen: boolean;
  setNewCorpusOpen: Dispatch<SetStateAction<boolean>>;
  drawerOpen: boolean;
  setDrawerOpen: Dispatch<SetStateAction<boolean>>;
  inspectorOpen: boolean;
  /** The library chat is docked at the right; the page makes room for it as for the preview panel. */
  chatDocked: boolean;
  setChatDocked: (docked: boolean) => void;
  toggleInspector: () => void;
  inspectorTarget: InspectorTarget;
  inspectorCanGoBack: boolean;
  inspectorPinned: boolean;
  /** Share of the window the preview panel and the docked 分析工作区 take (query 2026-1023 1044). */
  inspectorSize: PanelSize;
  setInspectorSize: (size: PanelSize) => void;
  dockSize: PanelSize;
  setDockSize: (size: PanelSize) => void;
  showInspector: (target: InspectorTarget) => void;
  backInspector: () => void;
  toggleInspectorPinned: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const LayoutContext = createContext<LayoutValue | null>(null);

export function useLayout(): LayoutValue {
  const value = useContext(LayoutContext);
  if (!value) throw new Error("useLayout 必须在 <LayoutProvider> 内使用");
  return value;
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeParams: { corpusId?: string } = useMatch("/library/:corpusId/*")?.params ?? {};
  const navPaths: Record<NavKey, string> = { home: "/home", overview: "/overview", chat: "/chat", library: "/library", tasks: "/tasks", review: "/review", intelligence: "/intelligence", results: "/results" };
  const nav: NavKey = location.pathname === "/home" ? "home" : location.pathname.startsWith("/overview") ? "overview" : location.pathname.startsWith("/library") ? "library"
    : location.pathname.startsWith("/tasks") ? "tasks" : location.pathname.startsWith("/results") ? "results"
      : location.pathname.startsWith("/intelligence") ? "intelligence" : location.pathname.startsWith("/review") ? "review" : "chat";
  const setNav = (value: NavKey) => { void navigate(navPaths[value]); };
  const corpusView = location.pathname.includes("/documents") ? "files" : "target";
  const setCorpusView = (view: "files" | "target") => {
    if (routeParams.corpusId) openCorpus(routeParams.corpusId, view);
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [chatDocked, setChatDocked] = useState(false);
  const [inspectorStack, setInspectorStack] = useState<InspectorTarget[]>([{ kind: "answer" }]);
  const routeSearch = new URLSearchParams(location.search);
  const routeDoc = corpusView === "target" ? routeSearch.get("doc") : null;
  const routeFacet = Number(routeSearch.get("facet") ?? 0);
  const routeTarget: InspectorTarget | null = routeDoc && routeParams.corpusId
    ? { kind: "target", corpusId: routeParams.corpusId, docId: routeDoc,
        index: Number.isInteger(routeFacet) && routeFacet >= 0 && routeFacet < 4 ? routeFacet : 0 }
    : corpusView === "target" && routeParams.corpusId && routeSearch.get("project")
      ? { kind: "project", corpusId: routeParams.corpusId, projectId: routeSearch.get("project")!, facet: ["场景", "问题", "技术", "成果"].includes(routeSearch.get("dimension") ?? "") ? routeSearch.get("dimension")! : "场景" } : null;
  const routeTargetKey = routeTarget ? inspectorIdentity(routeTarget) : "";
  const previousRouteTarget = useRef("");
  useEffect(() => {
    if (routeTargetKey || previousRouteTarget.current) setInspectorOpen(Boolean(routeTargetKey));
    previousRouteTarget.current = routeTargetKey;
  }, [routeTargetKey]);
  function closeRouteTarget() {
    const search = new URLSearchParams(location.search);
    if (!search.has("doc")) search.delete("project");
    for (const key of ["doc", "facet", "version"]) search.delete(key);
    void navigate({ pathname: location.pathname, search: search.toString() });
  }

  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [inspectorSize, setInspectorSize] = usePanelSize("inspector");
  const [dockSize, setDockSize] = usePanelSize("workspace");
  const inspectorNav = useRef<NavKey>(nav);
  // U9.1: sidebar collapse survives a reload.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("dox.sidebar.collapsed") === "1",
  );
  const [previewDoc, setPreviewDoc] = useState<PreviewTarget>(null);
  const evidenceTrigger = useRef<HTMLElement | null>(null);
  const [previewFocus, setPreviewFocus] = useState<string | null>(null);
  const [fullPreviewReturnsToInspector, setFullPreviewReturnsToInspector] = useState(false);
  const [newCorpusOpen, setNewCorpusOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (drawerOpen) setInspectorOpen(false);
  }, [drawerOpen]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("dox.sidebar.collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (inspectorNav.current !== nav) {
      inspectorNav.current = nav;
      // A preview belongs to the page it was opened on (query 2026-1015 1553): leaving the page closes it.
      if (!inspectorPinned) { setInspectorStack([{ kind: "answer" }]); if (!routeTargetKey) setInspectorOpen(false); }
    }
  }, [nav, inspectorPinned]);

  const toastTimer = useRef<number | undefined>(undefined);
  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  /** Preview a document together with the corpus it belongs to, so `/file` never hits the wrong library. */
  function openPreview(doc: DocumentInfo, page: number | null, corpusId: string) {
    if (doc.kind !== "pdf") {
      showInspector({ kind: "document", doc, page, corpusId });
      return;
    }
    openFullPreview(doc, page, corpusId, inspectorOpen);
  }

  function openFullPreview(doc: DocumentInfo, page: number | null, corpusId: string, returnToInspector = false, focus?: string) {
    setDrawerOpen(false);
    setInspectorOpen(false);
    setFullPreviewReturnsToInspector(returnToInspector);
    setPreviewFocus(focus ?? null);
    // 库内视图是主区而非抽屉：预览时不关闭它，返回后仍保留筛选、选中报告与滚动位置。
    // 可靠页码在这里表现为 PDF 跳页，其余表现为正文定位。
    setPreviewDoc({ doc, page, corpusId });
  }

  /** 四维证据入口：放大预览承载正文定位，关闭后回到该报告的四维分区。 */
  function openEvidence(doc: DocumentInfo, page: number | null, corpusId: string, focus?: string) {
    evidenceTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openFullPreview(doc, page, corpusId, true, focus);
  }

  function closeFullPreview() {
    setPreviewDoc(null);
    setPreviewFocus(null);
    if (fullPreviewReturnsToInspector) setInspectorOpen(true);
    setFullPreviewReturnsToInspector(false);
    requestAnimationFrame(() => evidenceTrigger.current?.focus());
  }

  // A library opens on its files (query 2026-1014 1642), for a leader too (query 2026-1030 1117); 技术研判 is one click away.
  function openCorpus(id: string, view: "files" | "target" = "files") {
    setInspectorOpen(false);
    setDrawerOpen(false);
    setPreviewDoc(null);
    void navigate(`/library/${encodeURIComponent(id)}/${view === "target" ? "targets/four-facets" : "documents"}`);
  }

  // The latest-answer view is the 对话工作台's; elsewhere the panel shows only a preview that was asked for.
  const panelTarget = routeTarget ?? inspectorStack[inspectorStack.length - 1];
  const panelOpen = inspectorOpen && (panelTarget.kind !== "answer" || nav === "chat");

  function toggleInspector() {
    if (inspectorOpen && routeTarget) { closeRouteTarget(); return; }
    if (!inspectorOpen) {
      // W1 migration: legacy document/corpus surfaces still exist. Close them before
      // showing the shared inspector so two right-side layers cannot conflict.
      setDrawerOpen(false);
      setPreviewDoc(null);
    }
    setInspectorOpen((open) => !open);
  }

  function showInspector(target: InspectorTarget) {
    setDrawerOpen(false);
    setPreviewDoc(null);
    if (target.kind === "target") {
      const search = new URLSearchParams(location.search);
      search.set("doc", target.docId);
      search.set("facet", String(target.index));
      void navigate({ pathname: `/library/${encodeURIComponent(target.corpusId)}/targets/four-facets`, search: search.toString() });
      setInspectorOpen(true);
      return;
    }
    setInspectorStack((stack) => {
      const current = stack[stack.length - 1];
      if (inspectorIdentity(current) === inspectorIdentity(target)) return stack;
      // Another year replaces the year list on top instead of piling up (query 2026-1013 2012).
      if (current.kind === "year" && target.kind === "year") return [...stack.slice(0, -1), target];
      return [...stack.slice(-3), target];
    });
    setInspectorOpen(true);
  }

  function backInspector() {
    if (routeTarget) { closeRouteTarget(); return; }
    setInspectorStack((stack) => stack.length > 1 ? stack.slice(0, -1) : stack);
  }

  function closeCorpus() {
    void navigate("/library");
  }


  const value: LayoutValue = {
    nav, setNav, toast, showToast, openPreview, openFullPreview, openEvidence, closeFullPreview,
    previewDoc, setPreviewDoc, previewFocus, openCorpus, corpusView, setCorpusView, closeCorpus,
    newCorpusOpen, setNewCorpusOpen, drawerOpen, setDrawerOpen,
    inspectorOpen: panelOpen, chatDocked, setChatDocked, toggleInspector, inspectorTarget: panelTarget,
    inspectorCanGoBack: Boolean(routeTarget) || (inspectorStack.length > 1 && (nav === "chat" || inspectorStack[inspectorStack.length - 2].kind !== "answer")),
    inspectorPinned, inspectorSize, setInspectorSize, dockSize, setDockSize, showInspector, backInspector,
    toggleInspectorPinned: () => setInspectorPinned((pinned) => !pinned),
    sidebarCollapsed, toggleSidebar: () => setSidebarCollapsed((v) => !v),
  };
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
