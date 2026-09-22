import { ChatView } from "./components/ChatView";
import { CorpusDetail } from "./components/CorpusDetail";
import { CorpusGrid } from "./components/CorpusGrid";
import { DocumentExplorer } from "./components/DocumentExplorer";
import { DocumentPreview } from "./components/DocumentPreview";
import { IconRail } from "./components/IconRail";
import { Inspector } from "./components/Inspector";
import { ReportsView, TasksView } from "./components/ListingViews";
import { OpsDrawer } from "./components/OpsDrawer";
import { StatusBanner, Toast } from "./components/Overlays";
import { SidePanel } from "./components/SidePanel";
import { useApp } from "./store";

/**
 * Layout composition only: rail → side panel → main view, plus the floating output
 * inspector and the overlays. No business logic lives here (see `store.tsx`).
 */
export function App() {
  const {
    nav,
    inspectorOpen,
    uiDocPanel,
    corpusReady,
    effectiveCorpusId,
    openCorpusId,
    closeCorpus,
    options,
    setOptions,
    previewDoc,
    setPreviewDoc,
    explorerOpen,
    setExplorerOpen,
    explorerDoc,
    setExplorerDoc,
  } = useApp();

  return (
    <div className="font-app flex h-screen w-full overflow-hidden bg-[var(--canvas)] text-[var(--charcoal)]">
      <IconRail />
      <SidePanel />

      {/*
        产出面板是浮层，不是 flex 兄弟节点：它从右边缘滑入，主区宽度不变，
        只有内容区让出右侧空间，避免被盖住。窄屏下不让位，直接覆盖。
      */}
      <div
        className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          inspectorOpen ? "xl:pr-[432px]" : ""
        }`}
      >
        {nav === "chat" ? <ChatView /> : null}
        {nav === "tasks" ? <TasksView /> : null}
        {nav === "library" ? <CorpusGrid /> : null}
        {nav === "reports" ? <ReportsView /> : null}
      </div>

      <Inspector />
      <OpsDrawer />

      {openCorpusId ? <CorpusDetail key={openCorpusId} corpusId={openCorpusId} onClose={closeCorpus} /> : null}

      <DocumentPreview
        doc={previewDoc?.doc ?? null}
        page={previewDoc?.page ?? null}
        corpus={previewDoc?.corpusId ?? effectiveCorpusId}
        onClose={() => setPreviewDoc(null)}
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

      <Toast />
      <StatusBanner />
    </div>
  );
}
