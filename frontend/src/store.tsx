import { scopeProblem } from "./scopeEligibility";
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
  fetchHealth,
  fetchTaskVersion,
  fetchTasks,
  ingestCorpus,
  routeCorpora,
  streamChat,
  followRun,
  cancelRun,
  type ChatRequestOptions,
  type CorpusInfo,
  type Options,
  type Source,
  type TaskInfo,
} from "./api";
import { useNavigate } from "react-router";
import { useLayout } from "./layout";
import type { Branch } from "./branches";
import { copyToClipboard } from "./clipboard";
import {
  newTurn,
  corpusRequestOptions,
  regenerateTurn,
  receiveEvent,
  stopTurn,
  turnScope,
  type Turn,
} from "./conversation";
import { useCorpora } from "./useCorpora";
import { fetchDocuments, useDocumentScope, useDocuments, type DocumentInfo } from "./useDocuments";
import { useWorkspace } from "./workspace";
import { useAuth } from "./auth";

export type EditState = { index: number; text: string } | null;

export type SendOverride = { question: string; history: Turn[]; options: Options };

export interface AppValue {

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


  /* corpora & documents */
  corpora: CorpusInfo[];
  corporaError: string;
  corporaLoaded: boolean;
  corpusId: string;
  effectiveCorpusId: string | undefined;
  corpusConfirmed: boolean;
  corpusIds: string[];
  setSearchCorpusIds: (ids: string[]) => void;
  /** Pick the library from each question (query 2026-1013 1520); a manual choice turns it off. */
  autoCorpus: boolean;
  setAutoCorpus: (on: boolean) => void;
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
  startResearch: (corpusId: string, docIds: string[] | null, taskId: string, question: string) => Promise<void>;
  askInTask: (taskId: string, question: string) => Promise<void>;
  targetJobs: Record<string, string>;
  rememberTargetJob: (corpusId: string, jobId: string) => void;

  /* tasks */
  tasks: TaskInfo[];
  tasksError: string;
  taskId: string;
  activeTask: TaskInfo | undefined;
  taskNames: Record<string, string>;
  taskVersionState: "ready" | "loading" | "missing" | "failed";
  taskVersionError: string;
  upgradeTaskVersion: () => Promise<void>;
  startTask: (taskId: string) => Promise<void>;
  refreshTasks: () => Promise<void>;
  /* 分析工作区: its conversation is an ordinary session marked origin "workspace" */
  openWorkspace: (corpus: string, docIds: string[], sessionId?: string, fresh?: boolean) => Promise<string[] | null>;
  setWorkspaceDocs: (docIds: string[]) => void;
  leaveWorkspace: () => void;
  askWorkspace: (question: string, task: string, corpus: string, docIds: string[]) => Promise<void>;

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
  setTurnReport: (index: number, report: import("./api").ReportInfo) => void;
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

  /* sources & preview */
  handleOpenSource: (source: Source, n: number) => void;
  openDocument: (docId: string, page?: number) => void;
  limitScope: (ids: string[] | null) => void;





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
 * The work context: libraries, tasks, the conversation and its session, and the handlers that change
 * them. Pages read it through `useApp()`; where things are shown on the page is layout.tsx's
 * (`useLayout()`, upgrade plan F2), which this provider sits inside.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const layout = useLayout();
  const { setNav, showToast, openPreview, showInspector } = layout;
  const [targetJobs, setTargetJobs] = useState<Record<string, string>>({});
  const rememberTargetJob = (corpus: string, job: string) => setTargetJobs((current) => ({ ...current, [corpus]: job }));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const returnFromWorkspace = useRef("");
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
  const [taskId, setTaskId] = useState("task1");
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [publishedTask, setPublishedTask] = useState<{ id: string; version: number; task: TaskInfo } | null>(null);
  const [taskVersionState, setTaskVersionState] = useState<AppValue["taskVersionState"]>("ready");
  const [taskVersionError, setTaskVersionError] = useState("");
  const [tasksError, setTasksError] = useState("");
  const [corpusId, setCorpusId] = useState("");
  const [corpusConfirmed, setCorpusConfirmed] = useState(false);
  const [corpusIds, setCorpusIds] = useState<string[]>([]);
  // query 2026-1013 2012: every new conversation chooses its library from the question; choosing one by
  // hand keeps it for this conversation only and is not remembered as a preference.
  const [autoCorpus, setAutoCorpus] = useState(true);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [options, setOptions] = useState<Options>({ allowed_doc_ids: null });
  const [progress, setProgress] = useState<{ stage: string; completed: number; total: number } | null>(null);


  const controller = useRef<AbortController | null>(null);
  const activeRun = useRef<Promise<void> | null>(null);
  const latestTurns = useRef<Turn[]>([]);
  const resumed = useRef(new Set<string>());  // answers already picked up again (card B1)
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
  useEffect(() => {
    const selected = tasks.find((task) => task.id === taskId);
    const version = workspace.taskVersion;
    if (selected?.kind !== "custom") {
      setPublishedTask(null);
      if (taskId.startsWith("custom-")) {
        setTaskVersionState("failed");
        setTaskVersionError("此会话绑定的自定义任务已不可用。");
      } else {
        setTaskVersionState("ready");
        setTaskVersionError("");
      }
      return;
    }
    if (!version) {
      setPublishedTask(null);
      setTaskVersionState("missing");
      setTaskVersionError("此旧会话未记录任务版本，已阻止发送。");
      return;
    }
    let active = true;
    setPublishedTask(null);
    setTaskVersionState("loading");
    setTaskVersionError("");
    void fetchTaskVersion(taskId, version)
      .then((task) => {
        if (!active) return;
        setPublishedTask({ id: taskId, version, task });
        setTaskVersionState("ready");
      })
      .catch((e) => {
        if (!active) return;
        setTaskVersionState("failed");
        setTaskVersionError(`此会话绑定的任务 v${version} 加载失败：${(e as Error).message}`);
      });
    return () => { active = false; };
  }, [taskId, workspace.taskVersion, tasks]);
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

  async function refreshTasks() {
    try { setTasks(await fetchTasks(undefined, true)); setTasksError(""); }
    catch (e) { setTasksError(e instanceof Error ? e.message : "任务列表不可用"); }
  }

  useEffect(() => {
    void refreshTasks();
  }, []);

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
        const data = await fetchHealth(AbortSignal.timeout(5000));
        state.ready = Boolean(data.api_key_configured);
        state.corpus = data.preparation === "ready";
        setReady(state.ready);
        setCorpusReady(state.corpus);
        setProgress(data.index_progress ?? null);
        setModel(typeof data.model === "string" ? data.model : "");
        setPreparation(typeof data.preparation === "string" ? data.preparation : "running");
        setHealth(
          !state.ready
            ? (role === "admin" ? "请在 .env 配置模型密钥后重启" : "分析服务暂不可用，请联系管理员")
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

  function setTurnReport(index: number, report: import("./api").ReportInfo) {
    replaceTurns((current) => {
      const next = [...current];
      if (next[index]) next[index] = { ...next[index], report: { report_id: report.report_id, artifact_id: report.artifact_id } };
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
      showToast(`已保存到报告中心「${artifact.title}」`);
    } catch (e) {
      setError(`保存到报告中心失败：${(e as Error).message}`);
    }
  }

  async function send(regenerate = false, override?: SendOverride) {
    // Auto library: rank libraries by the question, switch on a clear match, then send there.
    if (autoCorpus && !regenerate && !override && options.allowed_doc_ids === null && input.trim() && !controller.current && workspace.isSaved()) {
      const question = input.trim();
      try {
        const ranked = await routeCorpora(question);
        const best = ranked.find((row) => row.clear && corpora.some((c) => c.id === row.corpus_id && !c.missing));
        const current = corpora.find((c) => c.id === corpusIds[0])?.name ?? "当前资料库";
        if (best && !(corpusIds.length === 1 && corpusIds[0] === best.corpus_id)) {
          await workspace.saveCorpusSelection(best.corpus_id, true, [best.corpus_id], options);
          showToast(`已按问题自动选择资料库：${best.name}`);
          return send(false, { question, history: turns, options: { ...options, corpus_ids: [best.corpus_id] } });
        }
        if (!best) showToast(`未能判断问题对应的资料库，沿用${current}`);
      } catch {
        // Routing is a convenience; the answer still comes from the current scope, which is said plainly.
        showToast(`自动选择资料库暂不可用，本次沿用${corpora.find((c) => c.id === corpusIds[0])?.name ?? "当前资料库"}`);
      }
    }
    const history = override?.history ?? turns;
    const scope = override?.options ?? options;
    const requestTaskId = scope.task_id ?? taskId;
    const requestTaskVersion = scope.task_version ?? workspace.taskVersion;
    const requestCorpusIds = [...new Set(scope.corpus_ids ?? corpusIds)];
    const problem = scopeProblem(requestCorpusIds, corpora, scope, corporaLoaded, corporaError, scopeDocumentsError);
    if (problem || !workspace.isSaved()) { setError(problem || "范围尚未保存，请等待或重试保存"); return; }
    const corpusOptions = corpusRequestOptions(effectiveCorpusId ?? "", requestCorpusIds);
    if (!corpusOptions) return;
    const listed = tasks.find((task) => task.id === requestTaskId);
    if (!listed && requestTaskId.startsWith("custom-")) {
      setError("此会话绑定的自定义任务已不可用。请从成组状态备份恢复，或新建最新版会话。");
      return;
    }
    if (listed?.kind === "custom" && !requestTaskVersion) {
      setError("此旧会话未记录任务版本，已阻止发送。请确认升级到最新版，或从成组状态备份恢复 / 新建最新版会话。");
      return;
    }
    if (listed?.kind === "custom" && !activeTask && requestTaskVersion === workspace.taskVersion) {
      setError(taskVersionState === "failed"
        ? `${taskVersionError} 请从成组状态备份恢复，或新建最新版会话。`
        : "正在读取此会话固定的任务版本，完成前不能发送。");
      return;
    }
    if (scope.allowed_doc_ids && scopeDocumentsError) {
      setError(`限定资料列表不可用：${scopeDocumentsError}`);
      return;
    }
    if (scope.allowed_doc_ids?.length === 0) {
      setError("原限定范围中已没有所选资料；请重新选择资料，或明确选择全部文档。");
      return;
    }
    // task_id is sent with chat; task4 goes through intake (parameter collection, no report body).
    // Requests use the explicit conversation scope, independently of browsing.
    const effectiveOptions: Options = {
      ...scope, task_id: requestTaskId, task_version: requestTaskVersion,
      web_snapshot_ids: scope.web_snapshot_ids ?? [],
      ...corpusOptions,
    };
    const question = override?.question ?? (regenerate ? history.at(-1)?.question : input.trim());
    if (!question || controller.current || !ready || !workspace.loaded || sessionBusy) return;
    const turn = regenerate
      ? regenerateTurn(history[history.length - 1], history.slice(0, -1))
      : newTurn(question, history, effectiveOptions);
    // A replay carries its original turn scope; ordinary sends use the current session scope.
    const requestOptions: ChatRequestOptions = {
      ...turn.options,
      task_id: requestTaskId,
      ...(requestTaskVersion ? { task_version: requestTaskVersion } : {}),
      task_params: scope.task_params ?? {},
      corpus_id: corpusOptions.corpus_id,
      corpus_ids: corpusOptions.corpus_ids,
      web_snapshot_ids: scope.web_snapshot_ids ?? [],
      // W3-A: the snapshot records the session and the client-visible defaults; the server still
      // resolves and stores the authoritative effective corpus/doc scope.
      session_key: workspace.active || undefined,
      run_context: {
        resource_policy: scope.web_snapshot_ids?.length ? "local_plus_urls" : "local_only",
        output_intent: activeTask?.artifacts?.default ?? "text",
        visible_params: { task_id: requestTaskId, corpus_ids: requestCorpusIds, allowed_doc_ids: scope.allowed_doc_ids ?? null, web_snapshot_ids: scope.web_snapshot_ids ?? [] },
        param_sources: { task_id: "user", corpus_ids: "session", allowed_doc_ids: "user", web_snapshot_ids: "user" },
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
    // The question is kept at once: the answer now outlives the page (card B1), and a page closed a
    // moment after 发送 must not lose the question the server is answering.
    void workspace.saveNow(latestTurns.current, options).catch(() => undefined);
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
        await workspace.saveNow(latestTurns.current, options);
      } catch (saveError) {
        setError(`回答已收束，但保存失败：${(saveError as Error).message}`);
      }
    })();
    activeRun.current = run;
    await run;
    if (activeRun.current === run) activeRun.current = null;
  }

  function stop() {
    // Leaving the page no longer stops an answer (card B1), so 停止 has to tell the server.
    const turn = latestTurns.current.at(-1);
    if (turn && turn.outcome === "running") {
      resumed.current.add(turn.runId);  // stopped on purpose: not picked up again
      void cancelRun(turn.runId);
    }
    controller.current?.abort();
  }

  /**
   * An answer keeps being written after its page closes (user, 2026-10-20). Opening the session again
   * picks it up: live if it is still being written, complete if it finished meanwhile. The turn is
   * only replaced once the server sends something, so an answer it no longer has stays as it was.
   */
  async function resumeAnswer(target: Turn) {
    if (controller.current || resumed.current.has(target.runId)) return;
    resumed.current.add(target.runId);
    const request = new AbortController();
    controller.current = request;
    const start = performance.now();
    let started = false;
    const update = (apply: (turn: Turn) => Turn) =>
      replaceTurns((old) => old.map((t, i) => (i === old.length - 1 && t.runId === target.runId ? apply(t) : t)));
    setBusy(true);
    try {
      const found = await followRun(target.runId, request.signal, (event) => {
        if (request.signal.aborted) return;
        if (!started) {
          started = true;
          setStatus("正在接上之前的回答");
          update((t) => ({ ...t, steps: [], trace: [], answer: "", sources: [], policy: null, complete: false,
            outcome: "running", firstTokenMs: null, totalMs: null }));
        }
        update((t) => receiveEvent(t, event, performance.now() - start));
      });
      if (found) setStatus("回答完成");
    } catch {
      if (started) update((t) => stopTurn(t, request.signal.aborted, performance.now() - start));
      setStatus("");
    } finally {
      if (controller.current === request) controller.current = null;
      setBusy(false);
    }
    if (started) await workspace.saveNow(latestTurns.current, options).catch(() => undefined);
  }
  // Keyed on the session's last turn: a session's turns arrive after the session itself is chosen.
  const lastTurn = turns.at(-1);
  useEffect(() => {
    if (!workspace.loaded || !lastTurn || lastTurn.complete || lastTurn.outcome !== "interrupted" || lastTurn.runId.startsWith("legacy-")) return;
    void resumeAnswer(lastTurn);
  }, [workspace.active, workspace.loaded, lastTurn?.runId, lastTurn?.outcome]);

  /** Regenerate the answer at `index`; later turns are dropped (they depended on it). */
  async function regenerateAt(index: number) {
    const current = latestTurns.current;
    const target = current[index];
    if (!target) return;
    await send(true, {
      question: target.question,
      history: current.slice(0, index + 1),
      options: turnScope(target),
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

  async function switchSession(id?: string, task?: string, corpus?: string, version?: number) {
    // A conversation held in 分析工作区 reopens there, with the materials it was asked about.
    const saved = id ? workspace.sessions.find((s) => s.id === id) : undefined;
    if (saved?.data.origin === "workspace" && saved.data.corpus_id) {
      void navigate(`/library/${encodeURIComponent(saved.data.corpus_id)}/documents?workspace=1&session=${encodeURIComponent(saved.id)}`);
      return;
    }
    setSessionBusy(true);
    if (!id) setAutoCorpus(true);
    await settleActiveRun();
    try {
      await workspace.saveNow(latestTurns.current, options);
      await workspace.select(id, task, corpus, version);
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
    const selected = tasks.find((item) => item.id === nextTaskId);
    if (selected?.status === "archived" || selected?.archived) {
      setError("已归档任务不能用于新会话，请先恢复。");
      return;
    }
    if (selected?.kind === "custom" && !selected.version) {
      setError("请先发布任务，再创建会话");
      return;
    }
    setTaskId(nextTaskId);
    await switchSession(undefined, nextTaskId, undefined, selected?.kind === "custom" ? selected.version : undefined);
    setStatus("已切换到新任务并新建会话；原会话保留在会话列表");
  }

  async function upgradeTaskVersion() {
    const latest = tasks.find((item) => item.id === taskId)?.version;
    if (!latest) {
      setError("此任务尚无已发布版本，无法升级。");
      return;
    }
    try {
      const definition = await fetchTaskVersion(taskId, latest);
      const definitions = new Map((definition.parameters ?? []).map((field) => [field.key, field]));
      const legacy = new Set(Object.keys(definition.parameter_defaults ?? {}));
      const nextParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(options.task_params ?? {})) {
        if (legacy.has(key) && typeof value === "string" && value.length <= 500) {
          nextParams[key] = value;
          continue;
        }
        const field = definitions.get(key);
        if (!field) continue;
        const valid = field.type === "text" && typeof value === "string" && value.length <= 500
          || field.type === "integer" && Number.isInteger(value) && Math.abs(Number(value)) <= 1_000_000
          || field.type === "enum" && typeof value === "string" && Boolean(field.options?.includes(value))
          || field.type === "boolean" && typeof value === "boolean"
          || field.type === "year_range" && typeof value === "object" && value !== null
            && Object.keys(value).length === 2
            && Number.isInteger((value as { from?: unknown }).from) && Number.isInteger((value as { to?: unknown }).to)
            && Number((value as { from: number }).from) >= 1900 && Number((value as { from: number }).from) <= 2100
            && Number((value as { to: number }).to) >= 1900 && Number((value as { to: number }).to) <= 2100
            && Number((value as { from: number; to: number }).from) <= Number((value as { from: number; to: number }).to);
        if (valid) nextParams[key] = value;
      }
      const nextOptions = { ...options, task_params: nextParams };
      await workspace.setTaskVersion(latest, nextOptions);
      setError("");
      setStatus(`此会话已升级到任务 v${latest}；不兼容的旧参数已清除`);
    } catch (e) {
      setError(`升级任务版本失败：${(e as Error).message}`);
    }
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

  /** Click-to-ask: fill the composer; a different task starts a new session on the same corpora. */
  async function askInTask(task: string, question: string) {
    if (task === taskId) { setInput(question); return; }
    const keep = corpusIds;
    setSessionBusy(true);
    try {
      await settleActiveRun();
      await workspace.saveNow(latestTurns.current, options);
      await workspace.select(undefined, task, keep[0]);
      // With no library chosen yet the new conversation chooses one from the question as usual.
      if (keep.length) await workspace.saveCorpusSelection(keep[0], true, keep, { allowed_doc_ids: null });
      setEditing(null);
      setInput(question);
      setError("");
      setStatus("已按所选任务新建会话并填入问题；可修改后发送，原会话保留在会话列表");
      setNav("chat");
    } finally {
      setSessionBusy(false);
    }
  }

  /**
   * Make the analysis workspace's conversation the active session (query 2026-1020 1719): the one named
   * by `sessionId`, the current one if it is an untouched workspace conversation on this library, or a
   * new one. Returns the materials a reopened conversation was asked about, null otherwise.
   */
  async function openWorkspace(corpus: string, docIds: string[], sessionId?: string, fresh = false) {
    const saved = sessionId ? workspace.sessions.find((s) => s.id === sessionId && s.data.origin === "workspace") : undefined;
    const current = workspace.sessions.find((s) => s.id === workspace.active);
    if (sessionId && sessionId === workspace.active) return saved?.data.options.allowed_doc_ids ?? options.allowed_doc_ids ?? [];
    if (!saved && !fresh && !turns.length && current?.data.origin === "workspace" && corpusIds[0] === corpus) {
      setWorkspaceDocs(docIds);
      return null;
    }
    setSessionBusy(true);
    try {
      await settleActiveRun();
      await workspace.saveNow(latestTurns.current, options);
      if (saved) {
        await workspace.select(saved.id);
        return saved.data.options.allowed_doc_ids ?? [];
      }
      returnFromWorkspace.current = latestTurns.current.length ? workspace.active : "";
      await workspace.select(undefined, "task1", corpus, undefined, "workspace");
      // Not saved until the first question: opening the panel must not leave empty conversations behind.
      setOptions({ allowed_doc_ids: docIds.length ? docIds : null });
      setError("");
      return null;
    } finally {
      setSessionBusy(false);
    }
  }

  /** Closing the panel without asking anything puts back the conversation 对话工作台 had before. */
  function leaveWorkspace() {
    const previous = returnFromWorkspace.current;
    returnFromWorkspace.current = "";
    if (previous && !latestTurns.current.length && !controller.current) void workspace.select(previous);
  }

  /** The ticked materials are the scope of the next question; earlier turns keep their own. */
  function setWorkspaceDocs(docIds: string[]) {
    setOptions((old) => ({ ...old, allowed_doc_ids: docIds.length ? [...new Set(docIds)] : null }));
  }

  async function askWorkspace(question: string, task: string, corpus: string, docIds: string[]) {
    await send(false, { question, history: turns,
      options: { ...options, task_id: task, corpus_ids: [corpus], allowed_doc_ids: docIds.length ? [...new Set(docIds)] : null } });
  }

  async function startResearch(corpus: string, docIds: string[] | null, task: string, question: string) {
    if ((docIds !== null && !docIds.length) || !question.trim()) throw new Error("请选择资料并填写研究问题");
    setSessionBusy(true);
    try {
      await settleActiveRun();
      await workspace.saveNow(latestTurns.current, options);
      await workspace.select(undefined, task, corpus);
      await workspace.saveCorpusSelection(corpus, true, [corpus], { allowed_doc_ids: docIds === null ? null : [...new Set(docIds)] });
      setEditing(null);
      setInput(question.trim());
      setError("");
      setStatus(docIds === null ? "已新建本资料库分析；结论仅对应实际读取资料，请确认问题后发送" : `已新建研究会话，限定 ${new Set(docIds).size} 份资料；请确认问题后发送`);
      setNav("chat");
    } finally {
      setSessionBusy(false);
    }
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

  const handleOpenSource = async (source: Source, n: number) => {
    if (source.kind === "external" && source.input_id) { showInspector({ kind: "input", inputId: source.input_id }); return; }
    if (source.kind === "web" && source.snapshot_id) {
      showInspector({ kind: "web", snapshotId: source.snapshot_id });
      return;
    }
    if (!source.doc_id) {
      setError(`引用 [${n}] 缺少文档定位信息，无法跳转`);
      return;
    }
    const corpusId = source.corpus_id || effectiveCorpusId || "";
    try {
      // Citation identity belongs to its source corpus; never infer kind or reuse another library's list.
      const items = await fetchDocuments(corpusId, { failure: "无法读取引用所属知识库" });
      const doc = items.find((item) => item.doc_id === source.doc_id);
      if (!doc) throw new Error("引用文档已移除或尚未完成索引");
      if (source.version && doc.version !== source.version) throw new Error("引用文档已更新，请重新提问");
      openPreview(doc, source.page ?? null, corpusId);
    } catch (error) {
      setError(`引用 [${n}]：${(error as Error).message}`);
    }
  };

  function selectCorpus(id: string) {
    setCorpusId(id);
  }

  function setSearchCorpusIds(ids: string[]) {
    setAutoCorpus(false);
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
        return !doc?.corpus_id || (selected.includes(doc.corpus_id) && !removed.includes(doc.corpus_id));
      }),
    };
    setOptions(nextOptions);
    if (options.allowed_doc_ids && nextOptions.allowed_doc_ids) {
      const count = options.allowed_doc_ids.length - nextOptions.allowed_doc_ids.length;
      setStatus(count ? `已移除 ${count} 份指定资料，剩余 ${nextOptions.allowed_doc_ids.length} 份` : "下一次提问将使用新的知识库范围；限定模式不自动加入新资料");
    }
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
  const listedTask = tasks.find((task) => task.id === taskId);
  const activeTask = listedTask?.kind === "custom" && workspace.taskVersion
    ? publishedTask?.id === taskId && publishedTask.version === workspace.taskVersion ? publishedTask.task : undefined
    : listedTask;
  const taskNames: Record<string, string> = {};
  for (const task of tasks) taskNames[task.id] = task.name;

  const llm = !connected
    ? { tone: "bg-stone-400", text: "已断开" }
    : !ready || preparation === "error"
      ? { tone: "bg-[var(--red)]", text: "异常" }
      : preparation === "ready"
        ? { tone: "bg-[var(--green)]", text: "正常" }
        : { tone: "bg-[var(--warn-dot)]", text: "知识库准备中" };

  const value = useMemo<AppValue>(
    () => ({
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
      corpora,
      corporaError,
      corporaLoaded,
      corpusId,
      effectiveCorpusId,
      corpusConfirmed,
      corpusIds,
      setSearchCorpusIds,
      autoCorpus,
      setAutoCorpus,
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
      startResearch,
      askInTask,
      targetJobs,
      rememberTargetJob,
      tasks,
      tasksError,
      taskId,
      activeTask,
      taskNames,
      taskVersionState,
      taskVersionError,
      upgradeTaskVersion,
      startTask,
      refreshTasks,
      openWorkspace,
      setWorkspaceDocs,
      leaveWorkspace,
      askWorkspace,
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
      limitScope: (ids) => updateOptions((o) => ({ ...o, allowed_doc_ids: ids })),
      exportChat,
    }),
    // The handlers close over the latest state on every render; rebuilding the value
    // keeps consumers in sync (the app is small enough that this is cheap).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      layout,
      connected,
      ready,
      corpusReady,
      preparation,
      health,
      model,
      progress,
      corpora,
      corporaError,
      corpusId,
      effectiveCorpusId,
      corpusConfirmed,
      corpusIds,
      setSearchCorpusIds,
      autoCorpus,
      documents,
      scopeDocuments,
      scopeDocumentsError,
      documentsError,
      ingestBusy,
      tasks,
      tasksError,
      taskId,
      taskVersionState,
      taskVersionError,
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
      location,
      targetJobs,
      workspace,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
