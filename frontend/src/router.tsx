import { createBrowserRouter, Navigate, Outlet, useNavigate, useParams, useSearchParams } from "react-router";
import { lazy, Suspense, useEffect } from "react";
import { App } from "./App";
import { AuthGate, useAuth } from "./auth";
import { LeaderView } from "./components/LeaderView";
import { AppProvider, useApp } from "./store";
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

/** 资料库 opens straight into a library (query 2026-1013 1522): the one the chat uses, else the first. */
function LibraryIndex() {
  const { corpora, corporaLoaded, corpusIds } = useApp();
  const usable = corpora.filter((c) => !c.missing);
  const target = usable.find((c) => corpusIds.includes(c.id)) ?? usable[0];
  if (target) return <Navigate to={`/library/${encodeURIComponent(target.id)}/targets/four-facets`} replace />;
  return <p className="p-8 text-sm text-[var(--steel)]">{corporaLoaded ? "还没有资料库，可在左侧“新建资料库”。" : "正在读取资料库…"}</p>;
}

/** A leader account sees only the lean leader view; administrators and users get the full system. */
function Root() {
  const { role } = useAuth();
  // Leader accounts only ever see the leader view; nobody else can open it (query 2026-1013 1745).
  return <AppProvider>{role === "leader" ? <LeaderView /> : <App />}</AppProvider>;
}

/** Where each role starts: administrators in 管理视图 (query 1745), users in the workbench (1522). */
function RoleIndex() {
  const { role } = useAuth();
  return <Navigate to={role === "user" ? "/chat" : "/admin"} replace />;
}

/** Old 成果 pages now open the inspector's 成果 view over 存量分析. */
function ResultsRedirect() {
  const { showInspector } = useApp();
  useEffect(() => { showInspector({ kind: "results" }); }, []);
  return <Navigate to="/tasks" replace />;
}

export const router = createBrowserRouter([{
  Component: () => <AuthGate><Root /></AuthGate>,
  children: [
    { index: true, Component: RoleIndex },
    { path: "leader", element: <Navigate to="/" replace /> },
    { path: "admin", lazy: async () => ({ Component: (await import("./components/AdminView")).AdminView }) },
    { path: "home", lazy: async () => ({ Component: (await import("./components/HomeView")).HomeView }) },
    { path: "chat", lazy: async () => ({ Component: (await import("./components/ChatView")).ChatView }) },
    { path: "library", Component: Outlet, children: [
      { index: true, Component: LibraryIndex },
      { path: ":corpusId", Component: LibraryPage, children: [
        { path: "documents" }, { path: "documents/:docId" }, { path: "targets/four-facets" },
      ] },
    ] },
    { path: "tasks", Component: AnalysisShell, children: [
      { index: true, lazy: async () => ({ Component: (await import("./components/ListingViews")).TasksView }) },
      { path: "results", Component: ResultsRedirect },
    ] },
    { path: "intelligence", lazy: async () => ({ Component: (await import("./components/IntelligenceView")).IntelligenceView }) },
    { path: "artifacts", Component: ResultsRedirect },
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
