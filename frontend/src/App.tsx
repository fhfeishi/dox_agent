import { Outlet } from "react-router";
import { TopNav } from "./components/TopNav";
import { StatusBanner, Toast } from "./components/Overlays";
import { Guide } from "./components/Guide";
import { SidePanel } from "./components/SidePanel";
import { useApp } from "./store";
import { lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import { useLayout } from "./layout";
import { panelWidth } from "./panelSize";

const DocumentPreview = lazy(() => import("./components/DocumentPreview").then((module) => ({ default: module.DocumentPreview })));
const Inspector = lazy(() => import("./components/Inspector").then((module) => ({ default: module.Inspector })));
const OpsDrawer = lazy(() => import("./components/OpsDrawer").then((module) => ({ default: module.OpsDrawer })));

/**
 * Layout composition only: top bar, then side panel → main view, plus the floating output
 * inspector and the overlays. No business logic lives here (see `store.tsx`).
 */
export function App() {
  const {
    effectiveCorpusId,
  } = useApp();
  const {
    inspectorOpen,
    chatDocked,
    inspectorSize,
    dockSize,
    previewDoc,
    previewFocus,
    closeFullPreview,
    nav,
  } = useLayout();

  return (
    <div style={{ "--inspector-width": panelWidth(inspectorSize, 400), "--dock-width": panelWidth(dockSize, 440) } as CSSProperties}
      className="font-app flex h-screen w-full flex-col overflow-hidden bg-[var(--canvas)] text-[var(--charcoal)]">
      <TopNav />
      <StatusBanner />
      <div className="flex min-h-0 flex-1">
      <SidePanel />

      {/*
        检查器是浮层，不是 flex 兄弟节点：它从右边缘滑入，主区宽度不变，
        只有内容区让出右侧空间，避免被盖住。1024 px 以下不让位，直接覆盖。
      */}
      <div
        className={`relative flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[var(--ease-panel)] ${
          // From 1024 px the page makes room instead of being covered (query 2026-1015 1639); below
          // 1280 px a preview opened beside the library chat lies over the chat. Widths are the panels'
          // 20 / 40 / 60 % choice (query 2026-1023 1044).
          inspectorOpen && chatDocked ? "lg:pr-[calc(var(--dock-width)+18px)] xl:pr-[calc(var(--inspector-width)+var(--dock-width)+28px)]"
            : inspectorOpen ? "lg:pr-[calc(var(--inspector-width)+28px)]" : chatDocked ? "lg:pr-[calc(var(--dock-width)+18px)]" : ""
        }`}
      >
        <Suspense fallback={<div className="p-6 text-body text-[var(--muted)]">正在加载…</div>}>
          <Outlet />
        </Suspense>
        <Guide area={nav} />
      </div>

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

      </Suspense>

      <Toast />
    </div>
  );
}
