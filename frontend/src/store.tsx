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
  fetchCorpora,
  fetchTasks,
  ingestCorpus,
  streamChat,
  type CorpusInfo,
  type Options,
  type Source,
  type TaskInfo,
} from "./api";
import type { Branch } from "./branches";
import { copyToClipboard } from "./clipboard";
import {
  newTurn,
  regenerateTurn,
  receiveEvent,
  stopTurn,
  type Turn,
} from "./conversation";
import { uiFlags } from "./uiFlags";
import { useCorpora } from "./useCorpora";
import { useDocuments, type DocumentInfo } from "./useDocuments";
import { useWorkspace } from "./workspace";

export type NavKey = "chat" | "tasks" | "library" | "reports";
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
  corpusId: string;
  effectiveCorpusId: string | undefined;
  currentCorpus: CorpusInfo | null;
  selectCorpus: (id: string) => void;
  refreshCorpora: () => void;
  refreshDocuments: () => void;
  documents: DocumentInfo[];
  documentsError: string;
  ingestBusy: boolean;
  runCorpusIngest: (id: string) => Promise<void>;

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
  // U9.1: sidebar collapse survives a reload.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("dox.sidebar.collapsed") === "1",
  );
  const [taskId, setTaskId] = useState("task1");
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [tasksError, setTasksError] = useState("");
  const [previewDoc, setPreviewDoc] = useState<PreviewTarget>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerDoc, setExplorerDoc] = useState<ExplorerTarget>(null);
  const [openCorpusId, setOpenCorpusId] = useState<string | null>(null);
  const [newCorpusOpen, setNewCorpusOpen] = useState(false);
  const [corpusId, setCorpusId] = useState("");
  const [ingestBusy, setIngestBusy] = useState(false);
  const [options, setOptions] = useState<Options>({ allowed_doc_ids: null });
  const [progress, setProgress] = useState<{ stage: string; completed: number; total: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
  );
  const { corpora, error: corporaError, refresh: refreshCorpora } = useCorpora(connected);
  const currentCorpus = corpora.find((c) => c.id === corpusId) ?? corpora.find((c) => c.is_default) ?? null;
  const effectiveCorpusId = currentCorpus?.id;
  const { documents, error: documentsError, refresh: refreshDocuments } = useDocuments(
    connected,
    effectiveCorpusId,
  );

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

  async function send(regenerate = false, override?: SendOverride) {
    const history = override?.history ?? turns;
    const scope = override?.options ?? options;
    // task_id is sent with chat; task4 goes through intake (parameter collection, no report body).
    // Bind the turn to the corpus the user is browsing, so the answer scope matches the library.
    const effectiveOptions: Options = {
      ...(uiFlags.tasks ? { ...scope, task_id: taskId } : { allowed_doc_ids: scope.allowed_doc_ids ?? null }),
      ...(effectiveCorpusId ? { corpus_id: effectiveCorpusId } : {}),
    };
    const question = override?.question ?? (regenerate ? history.at(-1)?.question : input.trim());
    if (!question || controller.current || !ready || !workspace.loaded || sessionBusy) return;
    const turn = regenerate
      ? regenerateTurn(history[history.length - 1], history.slice(0, -1))
      : newTurn(question, history, effectiveOptions);
    // `regenerateTurn` keeps only `allowed_doc_ids`; re-merge the session's task/corpus so a
    // regenerated answer is scoped to the same library and task as the original.
    const requestOptions: Options = {
      ...turn.options,
      ...(uiFlags.tasks ? { task_id: taskId } : {}),
      ...(effectiveCorpusId ? { corpus_id: effectiveCorpusId } : {}),
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

  async function switchSession(id?: string, task?: string) {
    setSessionBusy(true);
    await settleActiveRun();
    try {
      await workspace.saveNow(latestTurns.current, options);
      await workspace.select(id, task);
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
    setDrawerOpen(false);
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

  function openCorpus(id: string) {
    setOpenCorpusId(id);
  }

  function closeCorpus() {
    setOpenCorpusId(null);
  }

  function openExplorer() {
    setExplorerDoc(null);
    setExplorerOpen(true);
  }

  const handleOpenSource = (source: Source, n: number) => {
    if (!source.doc_id) {
      setError(`引用 [${n}] 缺少文档定位信息，无法跳转`);
      return;
    }
    // S8: compare the citation version with the current list; never pre-probe `/file`.
    const current = documents.find((item) => item.doc_id === source.doc_id);
    if (current && source.version && current.version !== source.version) {
      setError(`引用 [${n}] 对应的文档已更新，已停止打开；请重新提问或刷新文献库`);
      return;
    }
    openDocument(source.doc_id, source.page ?? undefined);
  };

  function selectCorpus(id: string) {
    if (id === effectiveCorpusId) return;
    setCorpusId(id);
    // allowed_doc_ids bound to the previous corpus must not silently cross over.
    if (options.allowed_doc_ids) {
      setOptions((o) => ({ ...o, allowed_doc_ids: null }));
      const name = corpora.find((c) => c.id === id)?.name ?? id;
      setStatus(`已切换到「${name}」；原限定资料不属于本库，已清空`);
    }
  }

  async function runCorpusIngest(id: string) {
    setIngestBusy(true);
    try {
      await ingestCorpus(id);
      setStatus("导入已开始，进度见文献库页");
      // Live job polling keeps the library header progress current (5s ticks, ≤5min).
      for (let i = 0; i < 60; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const list = await fetchCorpora();
        if (list.find((c) => c.id === id)?.job?.status !== "running") break;
      }
      await refreshCorpora();
      await refreshDocuments();
      setStatus("本库导入流程已结束（失败项见文献库页提示）");
    } catch (e) {
      setError(`导入失败：${(e as Error).message}`);
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
      corpusId,
      effectiveCorpusId,
      currentCorpus,
      selectCorpus,
      refreshCorpora,
      refreshDocuments,
      documents,
      documentsError,
      ingestBusy,
      runCorpusIngest,
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
      setOptions,
      send,
      regenerateAt,
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
      limitScope: (ids) => setOptions((o) => ({ ...o, allowed_doc_ids: ids })),
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
      toggleInspector: () => setInspectorOpen((v) => !v),
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
      documents,
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
