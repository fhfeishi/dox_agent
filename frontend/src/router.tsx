import { createBrowserRouter, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
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


const WORKBENCH = ["/mine", "/chat", "/library", "/tasks", "/review", "/intelligence"];

/** A leader lands on the leader view and reaches the workbench through its 工作台 menu (query 2026-1013 1842); administrators and users get the full system. */
function Root() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  // Leader accounts start in the leader view, which nobody else can open (query 1745); from its
  // 工作台 button they use the workbench pages like any user (query 2026-1013 1842).
  const workbench = WORKBENCH.some((prefix) => pathname.startsWith(prefix));
  return <AppProvider>{role === "leader" && !workbench ? <LeaderView /> : <App />}</AppProvider>;
}

/** Where each role starts: administrators in 管理视图 (query 1745), users in 我的工作 (节点审查 Q5). */
function RoleIndex() {
  const { role } = useAuth();
  return <Navigate to={role === "user" ? "/mine" : "/admin"} replace />;
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
    { path: "mine", lazy: async () => ({ Component: (await import("./components/MyWork")).MyWork }) },
    { path: "chat", lazy: async () => ({ Component: (await import("./components/ChatView")).ChatView }) },
    { path: "library", Component: Outlet, children: [
      // 资料库 opens on the library cards (query 2026-1013 2012); a card opens one in the same workspace.
      { index: true, lazy: async () => ({ Component: (await import("./components/LibraryHome")).LibraryHome }) },
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
