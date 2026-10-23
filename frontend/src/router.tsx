import { createBrowserRouter, Navigate, Outlet, useNavigate, useParams, useSearchParams } from "react-router";
import { lazy, Suspense } from "react";
import { App } from "./App";
import { AuthGate, useAuth } from "./auth";
import { LayoutProvider } from "./layout";
import { AppProvider } from "./store";
import { AnalysisShell } from "./components/AnalysisShell";
import { useDocuments } from "./useDocuments";

const Overview = lazy(() => import("./components/Overview").then((m) => ({ default: m.Overview })));
const CorpusDetail = lazy(() => import("./components/CorpusDetail").then((m) => ({ default: m.CorpusDetail })));
const DocumentPreview = lazy(() => import("./components/DocumentPreview").then((m) => ({ default: m.DocumentPreview })));
function LibraryPage() {
  const { corpusId = "", docId } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { documents, error } = useDocuments(Boolean(docId), corpusId);
  const doc = documents.find((item) => item.doc_id === docId);
  const version = search.get("version");
  const closeDocument = () => {
    const next = new URLSearchParams(search); next.delete("version");
    void navigate({ pathname: `/library/${encodeURIComponent(corpusId)}/documents`, search: next.toString() });
  };
  return <>
    <CorpusDetail key={corpusId} corpusId={corpusId} onClose={() => void navigate("/library")} />
    {docId ? <Suspense fallback={null}>
      {doc && (!version || version === doc.version)
        ? <DocumentPreview doc={doc} page={null} corpus={corpusId}
          onClose={closeDocument} />
        : <div role="alert" className="fixed inset-x-1/4 top-1/3 z-50 rounded-xl border bg-[var(--canvas)] p-6">
          {error || (doc ? "资料已更新，请返回列表重新选择" : "资料正在读取或已不可用")}
          <button className="ml-4 text-[var(--link)]" onClick={closeDocument}>返回资料列表</button>
        </div>}
    </Suspense> : null}
  </>;
}


/** Every role works under the same top bar (query 2026-1014 1516); only the landing page differs. */
function Root() {
  return <LayoutProvider><AppProvider><App /></AppProvider></LayoutProvider>;
}

/** Every role starts on 首页, which also holds 我的工作 (user's choice, 2026-10-14). */
function RoleIndex() {
  return <Navigate to="/home" replace />;
}

/** 概览 is for administrators and leaders; a user who follows a link to it goes to 首页. */
function OverviewPage() {
  const { role } = useAuth();
  if (role === "user") return <Navigate to="/home" replace />;
  return <Suspense fallback={null}><Overview /></Suspense>;
}

export const router = createBrowserRouter([{
  Component: () => <AuthGate><Root /></AuthGate>,
  children: [
    { index: true, Component: RoleIndex },
    { path: "home", lazy: async () => ({ Component: (await import("./components/WorkspaceHome")).WorkspaceHome }) },
    { path: "overview/:area?", Component: OverviewPage },
    { path: "results", lazy: async () => ({ Component: (await import("./components/ResultsPage")).ResultsPage }) },
    { path: "results/:artifactId", lazy: async () => ({ Component: (await import("./components/ReportPage")).ReportPage }) },
    { path: "chat", lazy: async () => ({ Component: (await import("./components/ChatView")).ChatView }) },
    { path: "library", Component: Outlet, children: [
      // 资料库 opens on the library cards (query 2026-1013 2012); a card opens one in the same workspace.
      { index: true, lazy: async () => ({ Component: (await import("./components/LibraryHome")).LibraryHome }) },
      // Server deep-link allowlist and existence check: src/main.py frontend().
      { path: ":corpusId", Component: LibraryPage, children: [
        { path: "documents" }, { path: "documents/:docId" }, { path: "targets/four-facets" },
      ] },
    ] },
    { path: "tasks", Component: AnalysisShell, children: [
      { index: true, lazy: async () => ({ Component: (await import("./components/ListingViews")).TasksView }) },
      { path: "results", element: <Navigate to="/results" replace /> },
    ] },
    { path: "intelligence", lazy: async () => ({ Component: (await import("./components/IntelligenceView")).IntelligenceView }) },
    { path: "artifacts", element: <Navigate to="/results" replace /> },
    { path: "prompts", element: <Navigate to="/tasks" replace /> },
    { path: "review", Component: Outlet, children: [
      { index: true, element: <Navigate to="/review/formal" replace /> },
      { path: ":kind", lazy: async () => ({ Component: (await import("./components/review/ReviewWorkbench")).ReviewWorkbench }) },
      { path: "templates", lazy: async () => ({ Component: (await import("./components/ReviewTemplates")).ReviewTemplates }) },
      { path: "templates/:id", lazy: async () => ({ Component: (await import("./components/ReviewTemplates")).ReviewTemplateDetail }) },
      { path: "guidelines", element: <Navigate to="/review/templates" replace /> },
      { path: "evidence", lazy: async () => ({ Component: (await import("./components/review/ReviewEvidence")).ReviewEvidence }) },
      { path: "runs/:id", lazy: async () => ({ Component: (await import("./components/review/ReviewReport")).ReviewRunPage }) },
    ] },
    { path: "*", Component: () => <p className="p-6">页面不存在。<a href="/library">返回知识库</a></p> },
  ],
}]);
