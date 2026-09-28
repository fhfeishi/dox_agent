import { IconRail } from "./components/IconRail";
import { StatusBanner, Toast } from "./components/Overlays";
import { SidePanel } from "./components/SidePanel";
import { useApp } from "./store";
import { lazy, Suspense } from "react";
import type { CSSProperties } from "react";

const ChatView = lazy(() => import("./components/ChatView").then((module) => ({ default: module.ChatView })));
const CorpusDetail = lazy(() => import("./components/CorpusDetail").then((module) => ({ default: module.CorpusDetail })));
const CorpusGrid = lazy(() => import("./components/CorpusGrid").then((module) => ({ default: module.CorpusGrid })));
const DocumentExplorer = lazy(() => import("./components/DocumentExplorer").then((module) => ({ default: module.DocumentExplorer })));
const DocumentPreview = lazy(() => import("./components/DocumentPreview").then((module) => ({ default: module.DocumentPreview })));
const Inspector = lazy(() => import("./components/Inspector").then((module) => ({ default: module.Inspector })));
const OpsDrawer = lazy(() => import("./components/OpsDrawer").then((module) => ({ default: module.OpsDrawer })));
const TasksView = lazy(() => import("./components/ListingViews").then((module) => ({ default: module.TasksView })));
const ReportsView = lazy(() => import("./components/ListingViews").then((module) => ({ default: module.ReportsView })));
const PromptSkillView = lazy(() => import("./components/ListingViews").then((module) => ({ default: module.PromptSkillView })));

/**
 * Layout composition only: rail → side panel → main view, plus the floating output
 * inspector and the overlays. No business logic lives here (see `store.tsx`).
 */
export function App() {
  const {
    nav,
    inspectorOpen,
    inspectorWidth,
    uiDocPanel,
    corpusReady,
    effectiveCorpusId,
    openCorpusId,
    closeCorpus,
    options,
    setOptions,
    previewDoc,
    previewFocus,
    closeFullPreview,
    explorerOpen,
    setExplorerOpen,
    explorerDoc,
    setExplorerDoc,
  } = useApp();

  return (
    <div style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
      className="font-app flex h-screen w-full overflow-hidden bg-[var(--canvas)] text-[var(--charcoal)]">
      <IconRail />
      <SidePanel />

      {/*
        检查器是浮层，不是 flex 兄弟节点：它从右边缘滑入，主区宽度不变，
        只有内容区让出右侧空间，避免被盖住。窄屏下不让位，直接覆盖。
      */}
      <div
        className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          inspectorOpen ? "xl:pr-[calc(var(--inspector-width)+28px)]" : ""
        }`}
      >
        <Suspense fallback={<div className="p-6 text-sm text-[var(--muted)]">正在加载…</div>}>
          {nav === "chat" ? <ChatView /> : null}
          {nav === "tasks" ? <TasksView /> : null}
          {nav === "library" ? (openCorpusId
            ? <CorpusDetail key={openCorpusId} corpusId={openCorpusId} onClose={closeCorpus} />
            : <CorpusGrid />) : null}
          {nav === "reports" ? <ReportsView /> : null}
          {nav === "prompts" ? <PromptSkillView /> : null}
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <Inspector />
        <OpsDrawer />

        <DocumentPreview
          doc={previewDoc?.doc ?? null}
          page={previewDoc?.page ?? null}
          corpus={previewDoc?.corpusId ?? effectiveCorpusId}
          focus={previewFocus}
          onClose={closeFullPreview}
        />

        {uiDocPanel ? (
          <DocumentExplorer
            open={explorerOpen}
            onClose={() => setExplorerOpen(false)}
            corpusReady={corpusReady}
            corpus={explorerDoc?.corpusId ?? effectiveCorpusId}
            docId={explorerDoc?.docId ?? null}
            page={explorerDoc?.page ?? null}
            onNavigate={(docId, page) => setExplorerDoc(docId ? { docId, page } : null)}
            allowedDocIds={options.allowed_doc_ids}
            onLimitScope={(ids) => setOptions((o) => ({ ...o, allowed_doc_ids: ids }))}
          />
        ) : null}
      </Suspense>

      <Toast />
      <StatusBanner />
    </div>
  );
}
