import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ApiError,
  createArtifact,
  fetchCorpora,
  fetchTasks,
  ingestCorpus,
  streamChat,
  type ChatRequestOptions,
  type CorpusInfo,
  type Options,
  type Source,
  type TaskInfo,
} from "./api";
import type { Branch } from "./branches";
import { copyToClipboard } from "./clipboard";
import {
  newTurn,
  corpusRequestOptions,
  regenerateTurn,
  receiveEvent,
  stopTurn,
  type Turn,
} from "./conversation";
import { uiFlags } from "./uiFlags";
import { useCorpora } from "./useCorpora";
import { useDocumentScope, useDocuments, type DocumentInfo } from "./useDocuments";
import { useWorkspace } from "./workspace";

export type NavKey = "chat" | "tasks" | "library" | "reports" | "prompts";
export type InspectorTarget = { kind: "overview" } | { kind: "task"; taskId: string } |
  { kind: "template"; templateId: string } |
  { kind: "corpus"; corpusId: string } | { kind: "report"; reportId: string; sessionKey: string } |
  { kind: "artifact"; artifactId: string } |
  { kind: "document"; doc: DocumentInfo; page: number | null; corpusId: string } |
  { kind: "execution"; runId?: string };

function inspectorIdentity(target: InspectorTarget): string {
  switch (target.kind) {
    case "overview": return "overview";
    case "task": return `task:${target.taskId}`;
    case "template": return `template:${target.templateId}`;
    case "corpus": return `corpus:${target.corpusId}`;
    case "report": return `report:${target.sessionKey}:${target.reportId}`;
    case "artifact": return `artifact:${target.artifactId}`;
    case "document": return `document:${target.corpusId}:${target.doc.doc_id}:${target.doc.version}:${target.page ?? 0}`;
    case "execution": return `execution:${target.runId ?? "latest"}`;
  }
}
export type EditState = { index: number; text: string } | null;
export type PreviewTarget = { doc: DocumentInfo; page: number | null; corpusId?: string } | null;
export type ExplorerTarget = { docId: string; page: number | null; corpusId?: string } | null;
export type SendOverride = { question: string; history: Turn[]; options: Options };

export interface AppValue {
  /* navigation */
  nav: NavKey;
  setNav: (n: NavKey) => void;

  /* connection & model status */
  connected: boolean;
  setConnected: Dispatch<SetStateAction<boolean>>;
  ready: boolean;
  corpusReady: boolean;
  preparation: string;
  health: string;
  model: string;
  progress: { stage: string; completed: number; total: number } | null;
  llmTone: string;
  llmText: string;
  disconnect: () => Promise<void>;

  /* toast */
  toast: string | null;
  showToast: (message: string) => void;

  /* corpora & documents */
  corpora: CorpusInfo[];
  corporaError: string;
  corporaLoaded: boolean;
  corpusId: string;
  effectiveCorpusId: string | undefined;
  corpusConfirmed: boolean;
  corpusIds: string[];
  setSearchCorpusIds: (ids: string[]) => void;
  currentCorpus: CorpusInfo | null;
  selectCorpus: (id: string) => void;
  refreshCorpora: () => void;
  refreshAllCorpora: () => Promise<void>;
  refreshDocuments: () => void;
  documents: DocumentInfo[];
  scopeDocuments: DocumentInfo[];
  scopeDocumentsError: string;
  documentsError: string;
  ingestBusy: boolean;
  runCorpusIngest: (id: string) => Promise<void>;
  startCorpusChat: (id: string) => Promise<void>;

  /* tasks */
  tasks: TaskInfo[];
  tasksError: string;
  taskId: string;
  activeTask: TaskInfo | undefined;
  taskNames: Record<string, string>;
  startTask: (taskId: string) => Promise<void>;

  /* workspace / sessions */
  workspace: ReturnType<typeof useWorkspace>;
  activeTitle: string;
  sessionBusy: boolean;
  switchSession: (id?: string, task?: string) => Promise<void>;

  /* chat */
  turns: Turn[];
  busy: boolean;
  status: string;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  options: Options;
  setOptions: Dispatch<SetStateAction<Options>>;
  send: (regenerate?: boolean, override?: SendOverride) => Promise<void>;
  regenerateAt: (index: number) => Promise<void>;
  setTurnReport: (index: number, report: { report_id: string; markdown: string }) => void;
  /** W3-B: save a completed answer as a traceable artifact linked to its run. */
  saveAnswerArtifact: (runId: string, markdown: string, title?: string) => Promise<void>;
  stop: () => void;
  editing: EditState;
  setEditing: Dispatch<SetStateAction<EditState>>;
  beginEdit: (index: number) => Promise<void>;
  confirmEdit: () => Promise<void>;
  viewingBranch: Branch | null;
  setViewingBranch: Dispatch<SetStateAction<Branch | null>>;
  restoreSelectedBranch: () => Promise<void>;
  copyQuestion: (question: string) => Promise<void>;
  startedTick: number;

  /* sources, preview & explorer */
  handleOpenSource: (source: Source, n: number) => void;
  openDocument: (docId: string, page?: number) => void;
  /** Open a preview for a specific corpus (browsing must not depend on the active corpus). */
  openPreview: (doc: DocumentInfo, page: number | null, corpusId: string) => void;
  openFullPreview: (doc: DocumentInfo, page: number | null, corpusId: string, returnToInspector?: boolean) => void;
  closeFullPreview: () => void;
  limitScope: (ids: string[] | null) => void;
  previewDoc: PreviewTarget;
  setPreviewDoc: Dispatch<SetStateAction<PreviewTarget>>;
  explorerOpen: boolean;
  setExplorerOpen: Dispatch<SetStateAction<boolean>>;
  explorerDoc: ExplorerTarget;
  setExplorerDoc: Dispatch<SetStateAction<ExplorerTarget>>;

  /* corpus detail drawer */
  openCorpusId: string | null;
  openCorpus: (id: string) => void;
  closeCorpus: () => void;
  newCorpusOpen: boolean;
  setNewCorpusOpen: Dispatch<SetStateAction<boolean>>;

  /* settings & ops drawer */
  drawerOpen: boolean;
  setDrawerOpen: Dispatch<SetStateAction<boolean>>;

  /* output inspector */
  inspectorOpen: boolean;
  toggleInspector: () => void;
  inspectorTarget: InspectorTarget;
  inspectorCanGoBack: boolean;
  inspectorPinned: boolean;
  inspectorWidth: number;
  setInspectorWidth: (width: number) => void;
  showInspector: (target: InspectorTarget) => void;
  backInspector: () => void;
  toggleInspectorPinned: () => void;

  /* sidebar collapse (U9.1) */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  /* feature switches */
  taskCapable: boolean;
  uiDocPanel: boolean;

  /* local document explorer */
  openExplorer: () => void;

  /* export */
  exportChat: () => void;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp 必须在 <AppProvider> 内使用");
  return value;
}

/**
 * Owns every piece of application state and the handlers that mutate it.
 * Presentational components consume this through `useApp()`; no business logic
 * lives in the components. This mirrors the reference template's `store.tsx`.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<NavKey>("chat");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState("正在连接");
  const [ready, setReady] = useState(false);
  const [corpusReady, setCorpusReady] = useState(false);
  const [model, setModel] = useState("");
  const [preparation, setPreparation] = useState("running");
  const [connected, setConnected] = useState(true);
  const [editing, setEditing] = useState<EditState>(null);
  const [viewingBranch, setViewingBranch] = useState<Branch | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorStack, setInspectorStack] = useState<InspectorTarget[]>([{ kind: "overview" }]);
  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const saved = Number(localStorage.getItem("dox.inspector.width"));
    return Number.isFinite(saved) && saved >= 400 && saved <= 520 ? saved : 404;
  });
  const inspectorNav = useRef<NavKey>(nav);
  // U9.1: sidebar collapse survives a reload.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("dox.sidebar.collapsed") === "1",
  );
  const [taskId, setTaskId] = useState("task1");
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [tasksError, setTasksError] = useState("");
  const [previewDoc, setPreviewDoc] = useState<PreviewTarget>(null);
  const [fullPreviewReturnsToInspector, setFullPreviewReturnsToInspector] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerDoc, setExplorerDoc] = useState<ExplorerTarget>(null);
  const [openCorpusId, setOpenCorpusId] = useState<string | null>(null);
  const [newCorpusOpen, setNewCorpusOpen] = useState(false);
  const [corpusId, setCorpusId] = useState("");
  const [corpusConfirmed, setCorpusConfirmed] = useState(false);
  const [corpusIds, setCorpusIds] = useState<string[]>([]);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [options, setOptions] = useState<Options>({ allowed_doc_ids: null });
  const [progress, setProgress] = useState<{ stage: string; completed: number; total: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (drawerOpen) setInspectorOpen(false);
  }, [drawerOpen]);

  useEffect(() => {
    localStorage.setItem("dox.inspector.width", String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    if (inspectorNav.current !== nav) {
      inspectorNav.current = nav;
      if (!inspectorPinned) setInspectorStack([{ kind: "overview" }]);
    }
  }, [nav, inspectorPinned]);

  const toastTimer = useRef<number | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);
  const activeRun = useRef<Promise<void> | null>(null);
  const latestTurns = useRef<Turn[]>([]);
  const startedTick = useRef(0);

  const setTurnsTracked: Dispatch<SetStateAction<Turn[]>> = (value) =>
    setTurns((current) => {
      const next = typeof value === "function" ? value(current) : value;
      latestTurns.current = next;
      return next;
    });

  const workspace = useWorkspace(
    turns,
    options,
    setTurnsTracked,
    setOptions,
    taskId,
    setTaskId,
    corpusId,
    setCorpusId,
    corpusConfirmed,
    setCorpusConfirmed,
    corpusIds,
    setCorpusIds,
  );
  function updateOptions(value: SetStateAction<Options>) {
    const next = typeof value === "function" ? value(options) : value;
    setOptions(next);
    if (workspace.loaded && (corpusId || corpusIds.length)) {
      void workspace.saveCorpusSelection(corpusId || corpusIds[0], true, corpusIds, next)
        .catch((error) => setError(`资料范围保存失败：${(error as Error).message}`));
    }
  }
  const { corpora, error: corporaError, loaded: corporaLoaded, refresh: refreshCorpora } = useCorpora(connected);
  const currentCorpus = corpusId
    ? corpora.find((c) => c.id === corpusId) ?? null
    : corpora.find((c) => !c.missing) ?? null;
  const effectiveCorpusId = currentCorpus?.id;
  const { documents, error: documentsError, refresh: refreshBaseDocuments } = useDocuments(
    connected,
    effectiveCorpusId,
  );
  const { documents: scopeDocuments, error: scopeDocumentsError, refresh: refreshScopeDocuments } =
    useDocumentScope(connected, corpusIds, corpora);

  useEffect(() => {
    if (!workspace.loaded || !corporaLoaded || corporaError || corpusIds.length || corpusId) return;
    const first = corpora.find((item) => !item.missing);
    if (first) void workspace.saveCorpusSelection(first.id, true, [first.id]);
  }, [workspace.loaded, corporaLoaded, corporaError, corpora, corpusIds.length, corpusId]);
  async function refreshDocuments() {
    await Promise.all([refreshBaseDocuments(), refreshScopeDocuments()]);
  }

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    if (!uiFlags.tasks) return;
    void fetchTasks()
      .then(setTasks)
      .catch((e) => setTasksError(e instanceof Error ? e.message : "任务列表不可用"));
  }, []);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("dox.sidebar.collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!connected) {
      setReady(false);
      setHealth("已主动断开，本地历史仍可查看");
      return;
    }
    let stopped = false;
    let timer: number | undefined;
    const state = { ready: false, corpus: false };
    const refresh = async () => {
      try {
        const response = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        state.ready = Boolean(data.api_key_configured);
        state.corpus = data.preparation === "ready";
        setReady(state.ready);
        setCorpusReady(state.corpus);
        setProgress(data.index_progress ?? null);
        setModel(typeof data.model === "string" ? data.model : "");
        setPreparation(typeof data.preparation === "string" ? data.preparation : "running");
        setHealth(
          !state.ready
            ? "请在 .env 配置模型密钥后重启"
            : data.preparation === "running"
              ? "知识库正在加载"
              : data.preparation === "error"
                ? "知识库加载失败"
                : "服务已连接 · " + data.model,
        );
      } catch {
        state.ready = false;
        state.corpus = false;
        setReady(false);
        setPreparation("offline");
        setHealth("服务暂时未连接，正在自动重连…");
      }
    };
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (stopped) return;
        await refresh();
        if (!stopped) schedule();
      }, state.ready && state.corpus ? 15000 : 3000);
    };
    void refresh().then(() => {
      if (!stopped) schedule();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller.current?.abort();
    };
  }, [connected]);

  function replaceTurns(apply: (current: Turn[]) => Turn[]) {
    const next = apply(latestTurns.current);
    latestTurns.current = next;
    setTurns(next);
  }

  async function settleActiveRun() {
    controller.current?.abort();
    await activeRun.current?.catch(() => undefined);
  }

  function setTurnReport(index: number, report: { report_id: string; markdown: string }) {
    replaceTurns((current) => {
      const next = [...current];
      if (next[index]) next[index] = { ...next[index], report };
      return next;
    });
    void workspace.saveNow(latestTurns.current, options);
  }

  async function saveAnswerArtifact(runId: string, markdown: string, title?: string) {
    try {
      const artifact = await createArtifact({
        type: "answer_snapshot", run_id: runId, markdown,
        session_key: workspace.active || undefined, title,
      });
      showToast(`已保存为成果「${artifact.title}」`);
    } catch (e) {
      setError(`保存成果失败：${(e as Error).message}`);
    }
  }

  async function send(regenerate = false, override?: SendOverride) {
    if (corporaError) {
      setError(`知识库列表读取失败：${corporaError}。请刷新后再发送。`);
      return;
    }
    const requestCorpusIds = [...new Set(corpusIds)];
    const corpusOptions = corpusRequestOptions(effectiveCorpusId ?? "", requestCorpusIds);
    if (!corpusOptions) {
      setError("请先选择 1 至 6 个知识库");
      return;
    }
    const unavailable = requestCorpusIds.find((id) => {
      const item = corpora.find((candidate) => candidate.id === id);
      return !item || item.missing || item.preparation !== "ready";
    });
    if (unavailable) {
      setError("会话中的知识库不可用或尚无已入库资料，请重新选择知识库");
      return;
    }
    const empty = requestCorpusIds.find((id) => corpora.find((item) => item.id === id)?.preparation !== "ready");
    if (empty) {
      const name = corpora.find((item) => item.id === empty)?.name ?? empty;
      setError(`「${name}」尚无已入库文档。请先添加文档或刷新知识库，再发送。`);
      return;
    }
    const history = override?.history ?? turns;
    const scope = override?.options ?? options;
    if (scope.allowed_doc_ids && scopeDocumentsError) {
      setError(`限定资料列表不可用：${scopeDocumentsError}`);
      return;
    }
    if (scope.allowed_doc_ids?.length === 0) {
      setError("原限定范围中已没有所选资料；请重新选择资料，或明确选择全部文档。");
      return;
    }
    // task_id is sent with chat; task4 goes through intake (parameter collection, no report body).
    // Bind the turn to the corpus the user is browsing, so the answer scope matches the library.
    const effectiveOptions: Options = {
      ...(uiFlags.tasks ? { ...scope, task_id: taskId } : { allowed_doc_ids: scope.allowed_doc_ids ?? null }),
      ...corpusOptions,
    };
    const question = override?.question ?? (regenerate ? history.at(-1)?.question : input.trim());
    if (!question || controller.current || !ready || !workspace.loaded || sessionBusy) return;
    const turn = regenerate
      ? regenerateTurn(history[history.length - 1], history.slice(0, -1))
      : newTurn(question, history, effectiveOptions);
    // `regenerateTurn` keeps only `allowed_doc_ids`; re-merge the session's task/corpus so a
    // regenerated answer is scoped to the same library and task as the original.
    const requestOptions: ChatRequestOptions = {
      ...turn.options,
      ...(uiFlags.tasks ? { task_id: taskId } : {}),
      corpus_id: corpusOptions.corpus_id,
      corpus_ids: corpusOptions.corpus_ids,
      // W3-A: the snapshot records the session and the client-visible defaults; the server still
      // resolves and stores the authoritative effective corpus/doc scope.
      session_key: workspace.active || undefined,
      run_context: {
        resource_policy: "local_only",
        output_intent: activeTask?.artifacts?.default ?? "text",
        visible_params: { task_id: taskId, corpus_ids: requestCorpusIds, allowed_doc_ids: scope.allowed_doc_ids ?? null },
        param_sources: { task_id: "user", corpus_ids: "session", allowed_doc_ids: "user" },
      },
    };
    const request = new AbortController();
    controller.current = request;
    const start = performance.now();
    startedTick.current = start;
    if (!regenerate) setInput("");
    setBusy(true);
    setError("");
    setStatus("正在理解问题");
    replaceTurns((old) =>
      regenerate
        ? override
          ? [...history.slice(0, -1), turn]
          : [...old.slice(0, -1), turn]
        : override
          ? [...history, turn]
          : [...old, turn],
    );
    const update = (apply: (turn: Turn) => Turn) =>
      replaceTurns((old) => old.map((t, i) => (i === old.length - 1 ? apply(t) : t)));
    const run = (async () => {
      try {
        await streamChat(
          turn.requestMessages,
          turn.runId,
          request.signal,
          (event) => {
            if (request.signal.aborted || controller.current !== request) return;
            if (event.event === "status") setStatus(event.data.message);
            const elapsedMs = performance.now() - start;
            update((t) => receiveEvent(t, event, elapsedMs));
          },
          requestOptions,
        );
        setStatus("回答完成");
      } catch (e) {
        const elapsedMs = performance.now() - start;
        update((t) => stopTurn(t, request.signal.aborted, elapsedMs));
        // B4: a run-conflict 409 (reused run_id) arrives as a plain string detail and is shown
        // verbatim; recovery is a fresh send, which always generates a new run_id (regenerateTurn).
        const missingCorpus = e instanceof ApiError && typeof e.detail === "object" && e.detail !== null &&
          "missing" in e.detail && e.detail.missing === true;
        if (missingCorpus) {
          void workspace.saveCorpusSelection(corpusId, false, corpusIds).catch(() => undefined);
          void refreshCorpora();
        }
        setError(
          request.signal.aborted
            ? "已停止，未完成的回答不会作为下一轮上下文。"
            : e instanceof Error
              ? e.message
              : "请求失败",
        );
        setStatus("");
      } finally {
        if (controller.current === request) controller.current = null;
        setBusy(false);
      }
      try {
        await workspace.saveNow(latestTurns.current, scope);
      } catch (saveError) {
        setError(`回答已收束，但保存失败：${(saveError as Error).message}`);
      }
    })();
    activeRun.current = run;
    await run;
    if (activeRun.current === run) activeRun.current = null;
  }

  function stop() {
    controller.current?.abort();
  }

  /** Regenerate the answer at `index`; later turns are dropped (they depended on it). */
  async function regenerateAt(index: number) {
    const current = latestTurns.current;
    const target = current[index];
    if (!target) return;
    const effective = target.policy ?? target.options;
    await send(true, {
      question: target.question,
      history: current.slice(0, index + 1),
      options: { allowed_doc_ids: effective.allowed_doc_ids ? [...effective.allowed_doc_ids] : null },
    });
  }

  async function beginEdit(index: number) {
    await settleActiveRun();
    setEditing({ index, text: latestTurns.current[index].question });
  }

  async function confirmEdit() {
    if (!editing?.text.trim()) return;
    setSessionBusy(true);
    try {
      const result = await workspace.branchInPlace(editing.index);
      replaceTurns(() => result.history);
      if (result.trimmed) setStatus("分支过多，已裁剪最旧分支");
      const question = editing.text.trim();
      setEditing(null);
      setSessionBusy(false);
      await send(false, { question, history: result.history, options: result.options });
    } catch (e) {
      setSessionBusy(false);
      setError(`建立编辑分支失败：${(e as Error).message}`);
    }
  }

  async function restoreSelectedBranch() {
    if (!viewingBranch) return;
    setSessionBusy(true);
    try {
      await settleActiveRun();
      const restored = await workspace.restoreBranch(viewingBranch.id);
      if (restored) replaceTurns(() => restored);
      setViewingBranch(null);
      setStatus("已切换到分支");
    } catch (e) {
      setError(`切换分支失败：${(e as Error).message}`);
    } finally {
      setSessionBusy(false);
    }
  }

  async function disconnect() {
    setError("");
    await settleActiveRun();
    try {
      await workspace.saveNow(latestTurns.current, options);
      setConnected(false);
      setStatus("已停止并保存，连接已断开");
    } catch (e) {
      setError(`未能保存，尚未断开：${(e as Error).message}`);
    }
  }

  async function switchSession(id?: string, task?: string, corpus?: string) {
    setSessionBusy(true);
    await settleActiveRun();
    try {
      await workspace.saveNow(latestTurns.current, options);
      await workspace.select(id, task, corpus);
      setEditing(null);
      setError("");
      setStatus("");
      setNav("chat");
    } catch (e) {
      setError(`切换前保存失败：${(e as Error).message}`);
    } finally {
      setSessionBusy(false);
    }
  }

  async function startTask(nextTaskId: string) {
    setTaskId(nextTaskId);
    await switchSession(undefined, nextTaskId);
    setStatus("已切换到新任务并新建会话；原会话保留在会话列表");
  }

  async function startCorpusChat(id: string) {
    const corpus = corpora.find((item) => item.id === id);
    if (!corpus || corpus.missing) {
      setError("该知识库目录不可用，请先重新关联");
      return;
    }
    // Card chat starts a separate session; changing the current scope would rewrite the existing conversation.
    await switchSession(undefined, undefined, id);
  }

  async function copyQuestion(question: string) {
    const ok = await copyToClipboard(question);
    if (ok) setStatus("问题已复制");
    else setError("复制失败，请手动选择问题");
  }

  function openDocument(docId: string, page?: number) {
    const doc = documents.find((item) => item.doc_id === docId);
    if (!doc) {
      setError("引用的文档不在当前列表中，请刷新文献库后重试");
      return;
    }
    openPreview(doc, page ?? null, effectiveCorpusId ?? "");
  }

  /** Preview a document together with the corpus it belongs to, so `/file` never hits the wrong library. */
  function openPreview(doc: DocumentInfo, page: number | null, corpusId: string) {
    if (!uiFlags.docPanel && doc.kind !== "pdf") {
      showInspector({ kind: "document", doc, page, corpusId });
      return;
    }
    openFullPreview(doc, page, corpusId, inspectorOpen);
  }

  function openFullPreview(doc: DocumentInfo, page: number | null, corpusId: string, returnToInspector = false) {
    setDrawerOpen(false);
    setInspectorOpen(false);
    setFullPreviewReturnsToInspector(returnToInspector);
    // The preview is a focused reading surface; close the corpus detail so the two drawers
    // never stack (and desktop click-through cannot dismiss the wrong layer).
    setOpenCorpusId(null);
    // With the doc-panel flag on, citations open the explorer (tree + raw file viewer);
    // otherwise fall back to the text-only / PDF preview.
    if (uiFlags.docPanel) {
      setExplorerDoc({ docId: doc.doc_id, page, corpusId });
      setExplorerOpen(true);
      return;
    }
    setPreviewDoc({ doc, page, corpusId });
  }

  function closeFullPreview() {
    setPreviewDoc(null);
    if (fullPreviewReturnsToInspector) setInspectorOpen(true);
    setFullPreviewReturnsToInspector(false);
  }

  function openCorpus(id: string) {
    setInspectorOpen(false);
    setDrawerOpen(false);
    setPreviewDoc(null);
    setExplorerOpen(false);
    setOpenCorpusId(id);
  }

  function toggleInspector() {
    if (!inspectorOpen) {
      // W1 migration: legacy document/corpus surfaces still exist. Close them before
      // showing the shared inspector so two right-side layers cannot conflict.
      setDrawerOpen(false);
      setOpenCorpusId(null);
      setPreviewDoc(null);
      setExplorerOpen(false);
    }
    setInspectorOpen((open) => !open);
  }

  function showInspector(target: InspectorTarget) {
    setDrawerOpen(false);
    setOpenCorpusId(null);
    setPreviewDoc(null);
    setExplorerOpen(false);
    setInspectorStack((stack) => {
      const current = stack[stack.length - 1];
      if (inspectorIdentity(current) === inspectorIdentity(target)) return stack;
      return [...stack.slice(-3), target];
    });
    setInspectorOpen(true);
  }

  function backInspector() {
    setInspectorStack((stack) => stack.length > 1 ? stack.slice(0, -1) : stack);
  }

  function closeCorpus() {
    setOpenCorpusId(null);
  }

  function openExplorer() {
    setInspectorOpen(false);
    setExplorerDoc(null);
    setExplorerOpen(true);
  }

  const handleOpenSource = (source: Source, n: number) => {
    if (!source.doc_id) {
      setError(`引用 [${n}] 缺少文档定位信息，无法跳转`);
      return;
    }
    const corpusId = source.corpus_id ?? effectiveCorpusId ?? "";
    // S8: compare the citation version with the current list; never pre-probe `/file`.
    const current = documents.find((item) => item.doc_id === source.doc_id);
    if (current && source.version && current.version !== source.version) {
      setError(`引用 [${n}] 对应的文档已更新，已停止打开；请重新提问或刷新文献库`);
      return;
    }
    if (current) {
      openPreview(current, source.page ?? null, corpusId);
      return;
    }
    // KB-4a: a citation from another corpus in the retrieval set; synthesize metadata so the
    // preview loads through `/api/...?corpus=` (PDF/txt served per corpus).
    if (source.corpus_id && source.corpus_id !== effectiveCorpusId) {
      openPreview({
        doc_id: source.doc_id, title: source.title, origin: source.origin ?? "",
        version: source.version ?? "", captured_at: source.captured_at ?? "",
        kind: source.kind ?? "pdf", parser: "", pages: 0,
      }, source.page ?? null, source.corpus_id);
      return;
    }
    openDocument(source.doc_id, source.page ?? undefined);
  };

  function selectCorpus(id: string) {
    if (controller.current) {
      setError("回答进行中，暂不能更改知识库范围");
      return;
    }
    setCorpusId(id);
  }

  function setSearchCorpusIds(ids: string[]) {
    if (controller.current) {
      setError("回答进行中，暂不能更改知识库范围");
      return;
    }
    const selected = [...new Set(ids)];
    if (selected.length < 1 || selected.length > 6) {
      setError("检索范围必须包含 1 至 6 个知识库");
      return;
    }
    const unavailable = selected.find((id) => {
      const item = corpora.find((candidate) => candidate.id === id);
      return !item || item.missing;
    });
    if (unavailable) {
      setError("目录缺失的知识库不能加入检索范围；请先移除或重新关联");
      return;
    }
    setCorpusIds(selected);
    const removed = corpusIds.filter((id) => !selected.includes(id));
    const nextOptions = options.allowed_doc_ids === null ? options : {
      ...options,
      allowed_doc_ids: options.allowed_doc_ids.filter((docId) => {
        const doc = scopeDocuments.find((item) => item.doc_id === docId);
        return Boolean(doc?.corpus_id && selected.includes(doc.corpus_id) && !removed.includes(doc.corpus_id));
      }),
    };
    setOptions(nextOptions);
    setCorpusConfirmed(true);
    void workspace.saveCorpusSelection(corpusId || selected[0], true, selected, nextOptions)
      .catch((error) => setError(`知识库范围保存失败：${(error as Error).message}`));
    setError("");
  }

  async function runCorpusIngest(id: string) {
    setIngestBusy(true);
    try {
      await ingestCorpus(id);
      setStatus("正在刷新并导入本库…");
      let result: CorpusInfo | undefined;
      for (let i = 0; i < 150; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const item = (await fetchCorpora()).find((c) => c.id === id);
        if (!item || item.job?.status !== "running") { result = item; break; }
      }
      await refreshCorpora();
      await refreshDocuments();
      setStatus(result?.job?.status === "partial"
        ? `本库刷新完成，${result.job.errors.length} 项失败`
        : result?.job?.status === "error" ? "本库刷新失败，现有索引已保留" : "本库刷新完成");
    } catch (e) {
      setError(`导入失败：${(e as Error).message}`);
    } finally {
      setIngestBusy(false);
    }
  }

  async function refreshAllCorpora() {
    setIngestBusy(true);
    const failed: string[] = [];
    try {
      const before = corpora;
      setStatus("正在扫描知识库目录…");
      await refreshCorpora();
      const discovered = await fetchCorpora();
      const previousIds = new Set(before.map((item) => item.id));
      const added = discovered.filter((item) => !previousIds.has(item.id) && !item.missing).length;
      const missing = discovered.filter((item) => item.missing).length;
      const targets = discovered.filter((corpus) => !corpus.missing);
      let newFiles = 0;
      let changedFiles = 0;
      let failures = 0;
      // Sequential by design: reuse the per-corpus server job and its lock; attach to a job that
      // is already running instead of starting a duplicate. Never widen scope on one failure.
      for (const [index, item] of targets.entries()) {
        setStatus(`正在处理 ${item.name}（${index + 1}/${targets.length}）…`);
        try {
          if (item.job?.status !== "running") await ingestCorpus(item.id);
          let completed: CorpusInfo | undefined;
          for (let i = 0; i < 150; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            completed = (await fetchCorpora()).find((corpus) => corpus.id === item.id);
            if (!completed || completed.job?.status !== "running") break;
          }
          if (!completed || completed.job?.status === "running" || completed.job?.status === "error") {
            failures += 1;
            failed.push(`${item.name}（${completed?.job?.status === "running" ? "超时未完成" : "导入失败"}）`);
          } else {
            newFiles += completed.job?.added ?? 0;
            changedFiles += completed.job?.updated ?? 0;
            if (completed.job?.errors.length) {
              failures += completed.job.errors.length;
              failed.push(`${item.name}（${completed.job.errors.length} 项解析失败）`);
            }
          }
        } catch (e) {
          failures += 1;
          failed.push(`${item.name}（${(e as Error).message}）`);
        }
      }
      await refreshCorpora();
      await refreshDocuments();
      setStatus(`刷新完成：发现 ${added} 个新库，新增 ${newFiles} 项，更新 ${changedFiles} 项，目录缺失 ${missing} 个，失败 ${failures} 项${failed.length ? `；${failed.join("、")}` : ""}`);
    } catch (e) {
      setError(`刷新失败：${(e as Error).message}；现有列表和索引仍保留`);
    } finally {
      setIngestBusy(false);
    }
  }

  function exportChat() {
    const blob = new Blob(
      [JSON.stringify({ exported_at: new Date().toISOString(), service: health, turns }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dox-agent-comparison.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const activeTitle =
    workspace.sessions.find((s) => s.id === workspace.active)?.title ??
    turns[0]?.question?.slice(0, 100) ??
    "";
  const activeTask = tasks.find((task) => task.id === taskId);
  const taskNames: Record<string, string> = {};
  for (const task of tasks) taskNames[task.id] = task.name;

  const llm = !connected
    ? { tone: "bg-stone-400", text: "已断开" }
    : !ready || preparation === "error"
      ? { tone: "bg-[var(--red)]", text: "异常" }
      : preparation === "ready"
        ? { tone: "bg-[var(--green)]", text: "正常" }
        : { tone: "bg-[#e0a000]", text: "知识库准备中" };

  const value = useMemo<AppValue>(
    () => ({
      nav,
      setNav,
      connected,
      setConnected,
      ready,
      corpusReady,
      preparation,
      health,
      model,
      progress,
      llmTone: llm.tone,
      llmText: llm.text,
      disconnect,
      toast,
      showToast,
      corpora,
      corporaError,
      corporaLoaded,
      corpusId,
      effectiveCorpusId,
      corpusConfirmed,
      corpusIds,
      setSearchCorpusIds,
      currentCorpus,
      selectCorpus,
      refreshCorpora,
      refreshAllCorpora,
      refreshDocuments,
      documents,
      scopeDocuments,
      scopeDocumentsError,
      documentsError,
      ingestBusy,
      runCorpusIngest,
      startCorpusChat,
      tasks,
      tasksError,
      taskId,
      activeTask,
      taskNames,
      startTask,
      workspace,
      activeTitle,
      sessionBusy,
      switchSession,
      turns,
      busy,
      status,
      error,
      setError,
      input,
      setInput,
      options,
      setOptions: updateOptions,
      send,
      regenerateAt,
      setTurnReport,
      saveAnswerArtifact,
      stop,
      editing,
      setEditing,
      beginEdit,
      confirmEdit,
      viewingBranch,
      setViewingBranch,
      restoreSelectedBranch,
      copyQuestion,
      startedTick: startedTick.current,
      handleOpenSource,
      openDocument,
      openPreview,
      openFullPreview,
      closeFullPreview,
      limitScope: (ids) => updateOptions((o) => ({ ...o, allowed_doc_ids: ids })),
      previewDoc,
      setPreviewDoc,
      explorerOpen,
      setExplorerOpen,
      explorerDoc,
      setExplorerDoc,
      openCorpusId,
      openCorpus,
      closeCorpus,
      newCorpusOpen,
      setNewCorpusOpen,
      drawerOpen,
      setDrawerOpen,
      inspectorOpen,
      toggleInspector,
      inspectorTarget: inspectorStack[inspectorStack.length - 1],
      inspectorCanGoBack: inspectorStack.length > 1,
      inspectorPinned,
      inspectorWidth,
      setInspectorWidth: (width) => setInspectorWidth(Math.max(400, Math.min(520, width))),
      showInspector,
      backInspector,
      toggleInspectorPinned: () => setInspectorPinned((pinned) => !pinned),
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      taskCapable: uiFlags.tasks,
      uiDocPanel: uiFlags.docPanel,
      openExplorer,
      exportChat,
    }),
    // The handlers close over the latest state on every render; rebuilding the value
    // keeps consumers in sync (the app is small enough that this is cheap).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      nav,
      inspectorStack,
      inspectorPinned,
      inspectorWidth,
      connected,
      ready,
      corpusReady,
      preparation,
      health,
      model,
      progress,
      toast,
      corpora,
      corporaError,
      corpusId,
      effectiveCorpusId,
      corpusConfirmed,
      corpusIds,
      setSearchCorpusIds,
      documents,
      scopeDocuments,
      scopeDocumentsError,
      documentsError,
      ingestBusy,
      tasks,
      tasksError,
      taskId,
      activeTitle,
      sessionBusy,
      turns,
      busy,
      status,
      error,
      input,
      options,
      editing,
      viewingBranch,
      previewDoc,
      explorerOpen,
      explorerDoc,
      drawerOpen,
      inspectorOpen,
      sidebarCollapsed,
      openCorpusId,
      newCorpusOpen,
      workspace,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
