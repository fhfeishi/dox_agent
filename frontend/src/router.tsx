import { createBrowserRouter, Navigate, Outlet, useNavigate, useParams, useSearchParams } from "react-router";
import { lazy, Suspense } from "react";
import { App } from "./App";
import { AppProvider } from "./store";
import { AnalysisShell } from "./components/AnalysisShell";
import { ReviewShell } from "./components/ReviewViews";
import { useDocuments } from "./useDocuments";

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

export const router = createBrowserRouter([{
  Component: () => <AppProvider><App /></AppProvider>,
  children: [
    { index: true, element: <Navigate to="/chat" replace /> },
    { path: "chat", lazy: async () => ({ Component: (await import("./components/ChatView")).ChatView }) },
    { path: "library", Component: Outlet, children: [
      { index: true, lazy: async () => ({ Component: (await import("./components/CorpusGrid")).CorpusGrid }) },
      { path: ":corpusId", Component: LibraryPage, children: [
        { path: "documents" }, { path: "documents/:docId" }, { path: "targets/four-facets" },
      ] },
    ] },
    { path: "tasks", Component: AnalysisShell, children: [
      { index: true, lazy: async () => ({ Component: (await import("./components/ListingViews")).TasksView }) },
      { path: "results", lazy: async () => ({ Component: (await import("./components/ListingViews")).ReportsView }) },
    ] },
    { path: "intelligence", lazy: async () => ({ Component: (await import("./components/IntelligenceView")).IntelligenceView }) },
    { path: "artifacts", Component: () => { const [search] = useSearchParams(); return <Navigate to={"/tasks/results?" + search.toString()} replace />; } },
    { path: "prompts", element: <Navigate to="/tasks" replace /> },
    { path: "review", Component: ReviewShell, children: [
      { index: true, element: <Navigate to="/review/formal" replace /> },
      { path: ":kind", lazy: async () => ({ Component: (await import("./components/ReviewViews")).ReviewWorkbench }) },
      { path: "templates", lazy: async () => ({ Component: (await import("./components/ReviewTemplates")).ReviewTemplates }) },
      { path: "templates/:id", lazy: async () => ({ Component: (await import("./components/ReviewTemplates")).ReviewTemplateDetail }) },
      { path: "guidelines", element: <Navigate to="/review/templates" replace /> },
      { path: "evidence", lazy: async () => ({ Component: (await import("./components/ReviewViews")).ReviewEvidence }) },
      { path: "runs/:id", lazy: async () => ({ Component: (await import("./components/ReviewViews")).ReviewRunPage }) },
    ] },
    { path: "*", Component: () => <p className="p-6">页面不存在。<a href="/library">返回知识库</a></p> },
  ],
}]);
