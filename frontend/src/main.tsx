import { Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { fetchCorpora, fetchTasks, ingestCorpus, streamChat, type CorpusInfo, type Options, type Source, type TaskInfo } from "./api";
import { Answer } from "./Answer";
import { newTurn, regenerateTurn, receiveEvent, stopTurn, type Turn } from "./conversation";
import type { Branch } from "./branches";
import "./style.css";
import { CorpusPicker } from "./CorpusPicker";
import { IngestTools } from "./IngestTools";
import { LibraryView } from "./LibraryView";
import { DocumentExplorer } from "./DocumentExplorer";
import { DocumentPreview } from "./DocumentPreview";
import { OfficialDocs } from "./OfficialDocs";
import { ScopeSelector } from "./ScopeSelector";
import { SessionList } from "./SessionList";
import { SettingsDrawer } from "./SettingsDrawer";
import { TaskPicker } from "./TaskPicker";
import { uiFlags } from "./uiFlags";
import { useCorpora } from "./useCorpora";
import { useDocuments, type DocumentInfo } from "./useDocuments";
import { useWorkspace } from "./workspace";

type EditState = { index: number; text: string } | null;
/** U9.1: sidebar collapse state survives a reload; only the >=md two column layout uses it. */
const SIDEBAR_KEY = "dox.sidebar.collapsed";
type MainView = "chat" | "library" | "news";

function PowerIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3v9"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/></svg>;
}

function icon(children: ReactNode) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return icon(<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>{collapsed ? <path d="M15 9l3 3-3 3"/> : <path d="M18 9l-3 3 3 3"/>}</>);
}
function BookIcon() {
  return icon(<><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 3v18"/></>);
}
function SearchIcon() {
  return icon(<><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></>);
}
function GearIcon() {
  return icon(<><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3"/></>);
}
function NewspaperIcon() {
  return icon(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h10"/></>);
}
function LayersIcon() {
  return icon(<><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></>);
}
function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label}
    className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 hover:bg-stone-200"
    onClick={onClick}>{children}</button>;
}

const EXAMPLES: [string, string][] = [
  ["精准问答", "请基于资料说明一个关键结论，并逐条给出出处。"],
  ["对比分析", "请对比资料中相近方案的主要差异与适用条件。"],
  ["趋势讨论", "基于现有资料，推测该领域可能的发展方向，并区分事实与推断。"],
];

function App() {
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");
  const [view, setView] = useState<MainView>("chat");
  const [taskId, setTaskId] = useState("task1");
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [tasksError, setTasksError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentInfo | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerDoc, setExplorerDoc] = useState<{ docId: string; page: number | null } | null>(null);
  const [corpusId, setCorpusId] = useState("");
  const [corpusFlyover, setCorpusFlyover] = useState(false);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [options, setOptions] = useState<Options>({ allowed_doc_ids: null });
  const [progress, setProgress] = useState<{ stage: string; completed: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const activeRun = useRef<Promise<void> | null>(null);
  const latestTurns = useRef<Turn[]>([]);
  const startedTick = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const chatScroll = useRef(0);
  const setTurnsTracked: Dispatch<SetStateAction<Turn[]>> = value => setTurns(current => {
    const next = typeof value === "function" ? value(current) : value;
    latestTurns.current = next;
    return next;
  });
  const workspace = useWorkspace(turns, options, setTurnsTracked, setOptions, taskId, setTaskId);
  const { corpora, error: corporaError, refresh: refreshCorpora } = useCorpora(connected);
  // H5: the selected corpus scopes the document list; unset falls back to the default corpus.
  const currentCorpus: CorpusInfo | null = corpora.find(c => c.id === corpusId) ?? corpora.find(c => c.is_default) ?? null;
  const effectiveCorpusId = currentCorpus?.id;
  const { documents, error: documentsError, refresh: refreshDocuments } = useDocuments(connected, effectiveCorpusId);
  useEffect(() => { if (corpusReady) void refreshDocuments(); }, [corpusReady, refreshDocuments]);
  function exportChat() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), service: health, turns }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "dox-agent-comparison.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => {
    if (!uiFlags.tasks) return;
    void fetchTasks().then(setTasks).catch(e => setTasksError(e instanceof Error ? e.message : "任务列表不可用"));
  }, []);
  /** U9.2b: only the chat <section> unmounts; turns and the stream controller live in App. */
  function showView(next: MainView) {
    if (view === "chat") chatScroll.current = window.scrollY;
    setView(next);
  }
  function backToChat() {
    if (view === "chat") return;
    setView("chat");
    requestAnimationFrame(() => window.scrollTo({ top: chatScroll.current }));
  }
  useEffect(() => {
    if (!connected) { setReady(false); setHealth("已主动断开，本地历史仍可查看"); return; }
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
        setReady(state.ready); setCorpusReady(state.corpus); setProgress(data.index_progress ?? null);
        setModel(typeof data.model === "string" ? data.model : "");
        setPreparation(typeof data.preparation === "string" ? data.preparation : "running");
        setHealth(!state.ready ? "请在 .env 配置模型密钥后重启" : data.preparation === "running" ? "知识库正在加载" : data.preparation === "error" ? "知识库加载失败" : "服务已连接 · " + data.model);
      } catch {
        state.ready = false; state.corpus = false;
        setReady(false); setPreparation("offline"); setHealth("服务暂时未连接，正在自动重连…");
      }
    };
    const schedule = () => { timer = window.setTimeout(async () => { if (stopped) return; await refresh(); if (!stopped) schedule(); }, state.ready && state.corpus ? 15000 : 3000); };
    void refresh().then(() => { if (!stopped) schedule(); });
    return () => { stopped = true; if (timer) clearTimeout(timer); controller.current?.abort(); };
  }, [connected]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, status]);
  function replaceTurns(apply: (current: Turn[]) => Turn[]) {
    const next = apply(latestTurns.current);
    latestTurns.current = next;
    setTurns(next);
  }
  async function settleActiveRun() {
    controller.current?.abort();
    await activeRun.current?.catch(() => undefined);
  }
  async function send(regenerate = false, override?: { question: string; history: Turn[]; options: Options }) {
    const history = override?.history ?? turns;
    const scope = override?.options ?? options;
    // U1.3: task_id is only sent once the backend accepts the field; task4 never goes through chat.
    const effectiveOptions: Options = uiFlags.tasks
      ? { ...scope, task_id: taskId }
      : { allowed_doc_ids: scope.allowed_doc_ids ?? null };
    const question = override?.question ?? (regenerate ? history.at(-1)?.question : input.trim());
    if (!question || controller.current || !ready || !workspace.loaded || sessionBusy) return;
    const turn = regenerate ? regenerateTurn(history[history.length - 1], history.slice(0, -1)) : newTurn(question, history, effectiveOptions);
    const request = new AbortController();
    controller.current = request;
    const start = performance.now();
    startedTick.current = start;
    if (!regenerate) setInput("");
    setBusy(true); setError(""); setStatus("正在理解问题");
    replaceTurns(old => override ? [...history, turn] : regenerate ? [...old.slice(0, -1), turn] : [...old, turn]);
    const update = (apply: (turn: Turn) => Turn) => replaceTurns(old => old.map((t, i) => i === old.length - 1 ? apply(t) : t));
    const run = (async () => { try {
      await streamChat(turn.requestMessages, turn.runId, request.signal, event => {
        if (request.signal.aborted || controller.current !== request) return;
        if (event.event === "status") setStatus(event.data.message);
        const elapsedMs = performance.now() - start;
        update(t => receiveEvent(t, event, elapsedMs));
      }, turn.options);
      setStatus("回答完成");
    } catch (e) {
      const elapsedMs = performance.now() - start;
      update(t => stopTurn(t, request.signal.aborted, elapsedMs));
      setError(request.signal.aborted ? "已停止，未完成的回答不会作为下一轮上下文。" : e instanceof Error ? e.message : "请求失败");
      setStatus("");
    } finally { if (controller.current === request) controller.current = null; setBusy(false); }
      try { await workspace.saveNow(latestTurns.current, scope); }
      catch (saveError) { setError(`回答已收束，但保存失败：${(saveError as Error).message}`); }
    })();
    activeRun.current = run;
    await run;
    if (activeRun.current === run) activeRun.current = null;
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
      const question = editing.text.trim(); setEditing(null); setSessionBusy(false);
      await send(false, { question, history: result.history, options: result.options });
    } catch (e) { setSessionBusy(false); setError(`建立编辑分支失败：${(e as Error).message}`); }
  }
  async function restoreSelectedBranch() {
    if (!viewingBranch) return;
    setSessionBusy(true);
    try {
      await settleActiveRun();
      const restored = await workspace.restoreBranch(viewingBranch.id);
      if (restored) replaceTurns(() => restored);
      setViewingBranch(null); setStatus("已切换到分支");
    } catch (e) { setError(`切换分支失败：${(e as Error).message}`); }
    finally { setSessionBusy(false); }
  }
  async function disconnect() {
    setError("");
    await settleActiveRun();
    try { await workspace.saveNow(latestTurns.current, options); setConnected(false); setStatus("已停止并保存，连接已断开"); }
    catch (e) { setError(`未能保存，尚未断开：${(e as Error).message}`); }
  }
  async function switchSession(id?: string, task?: string) {
    setSessionBusy(true);
    await settleActiveRun();
    try { await workspace.saveNow(latestTurns.current, options); await workspace.select(id, task); setEditing(null); setError(""); setStatus(""); setView("chat"); }
    catch (e) { setError(`切换前保存失败：${(e as Error).message}`); }
    finally { setSessionBusy(false); }
  }
  async function copyQuestion(question: string) {
    try { await navigator.clipboard.writeText(question); setStatus("问题已复制"); }
    catch { setError("复制失败，请手动选择问题"); }
  }
  function openDocument(docId: string, page?: number) {
    const doc = documents.find(item => item.doc_id === docId);
    if (!doc) { setError("引用的文档不在当前列表中，请刷新文献库后重试"); return; }
    setDrawerOpen(false);
    // U2: with the doc-panel flag on, citations and library entries open the explorer
    // (tree + raw file viewer); otherwise fall back to the U7 text-only preview.
    if (uiFlags.docPanel) { setExplorerDoc({ docId, page: page ?? null }); setExplorerOpen(true); return; }
    setPreviewDoc(doc);
  }
  const handleOpenSource = uiFlags.docPanel
    ? (source: Source, n: number) => {
        if (!source.doc_id) { setError(`引用 [${n}] 缺少文档定位信息，无法跳转`); return; }
        openDocument(source.doc_id, source.page ?? undefined);
      }
    : undefined;
  function selectCorpus(id: string) {
    setCorpusFlyover(false);
    if (id === effectiveCorpusId) return;
    setCorpusId(id);
    // §4.4: allowed_doc_ids bound to the previous corpus must not silently cross over.
    if (options.allowed_doc_ids) {
      setOptions(o => ({ ...o, allowed_doc_ids: null }));
      const name = corpora.find(c => c.id === id)?.name ?? id;
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
        await new Promise(resolve => setTimeout(resolve, 5000));
        const list = await fetchCorpora();
        if (list.find(c => c.id === id)?.job?.status !== "running") break;
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
  const activeTitle = workspace.sessions.find(s => s.id === workspace.active)?.title ?? turns[0]?.question?.slice(0, 100) ?? "";
  const activeTask = tasks.find(task => task.id === taskId);
  const taskNames: Record<string, string> = {};
  for (const task of tasks) taskNames[task.id] = task.name;
  const llmStatus = !connected ? { tone: "bg-stone-400", text: "已断开" }
    : !ready || preparation === "error" ? { tone: "bg-red-500", text: "异常" }
    : preparation === "ready" ? { tone: "bg-teal-600", text: "正常" }
    : { tone: "bg-amber-500", text: "知识库准备中" };
  return <div className={`min-h-screen bg-stone-50 text-stone-800 md:grid ${collapsed ? "md:grid-cols-[56px_1fr]" : "md:grid-cols-[260px_1fr]"}`}>
    <aside className={`flex h-full flex-col border-r border-stone-200 bg-stone-100 md:sticky md:top-0 md:h-screen ${collapsed ? "p-2" : "p-5"}`}>
      <div className={`flex shrink-0 items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
        {!collapsed && <div className="text-xs font-semibold tracking-[0.2em] text-stone-500">DOX_AGENT / 01</div>}
        <button type="button" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} aria-expanded={!collapsed}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className="rounded-lg border border-stone-300 bg-white p-1.5 text-stone-600 hover:bg-stone-200"
          onClick={() => setCollapsed(value => !value)}><PanelIcon collapsed={collapsed}/></button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {collapsed
          ? <div className="relative flex flex-col items-center gap-2">
              <RailButton label="新的问答" onClick={() => void switchSession()}><span className="text-base leading-none">＋</span></RailButton>
              <RailButton label="文献库" onClick={() => showView("library")}><BookIcon/></RailButton>
              <RailButton label="知识库" onClick={() => setCorpusFlyover(value => !value)}><LayersIcon/></RailButton>
              {corpusFlyover && <div className="absolute left-12 top-10 z-30 w-64 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
                <p className="mb-2 text-xs font-medium text-stone-500">知识库</p>
                <CorpusPicker corpora={corpora} current={effectiveCorpusId ?? ""} onSelect={selectCorpus}/>
              </div>}
              <RailButton label="搜索会话（展开侧栏）" onClick={() => setCollapsed(false)}><SearchIcon/></RailButton>
              {uiFlags.news && <RailButton label="科研头条" onClick={() => showView("news")}><NewspaperIcon/></RailButton>}
              <RailButton label="设置与运维" onClick={() => setDrawerOpen(true)}><GearIcon/></RailButton>
            </div>
          : <>
              <button className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 text-left text-sm disabled:opacity-40" disabled={!workspace.loaded || sessionBusy} onClick={() => uiFlags.tasks ? setPickerOpen(open => !open) : void switchSession()}>＋ 新的问答</button>
              {pickerOpen && <TaskPicker tasks={tasks} active={taskId} error={tasksError} onPick={id => { setPickerOpen(false); void switchSession(undefined, id); }} onClose={() => setPickerOpen(false)}/>}
              {!!corpora.length && <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-stone-500">知识库</p>
                <CorpusPicker corpora={corpora} current={effectiveCorpusId ?? ""} onSelect={selectCorpus}/>
                <p className="mt-1 text-xs text-stone-400">新语料目录放入 knowledge/ 后自动出现</p>
              </div>}
              {corporaError && <p role="alert" className="mt-1 text-xs text-red-700">{corporaError}</p>}
              <button className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-2 text-left text-sm hover:bg-stone-200" onClick={() => showView("library")}>文献库 · {documents.length} 份</button>
              {uiFlags.news && <button className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-2 text-left text-sm hover:bg-stone-200" onClick={() => showView("news")}>科研头条</button>}
              <p className="mt-2 text-xs text-stone-500" role="status">{workspace.message}</p>
              <SessionList sessions={workspace.sessions} active={workspace.active} activeTitle={activeTitle} loaded={workspace.loaded} busy={sessionBusy} activeTask={activeTask?.name} tasks={taskNames} onSelect={id => void switchSession(id)} onRename={(id, title) => void workspace.rename(title, id)} onArchive={id => void workspace.setArchived(id, true)} onRestore={id => void workspace.setArchived(id, false)}/>
            </>}
      </div>
      <div className="mt-4 shrink-0 border-t border-stone-200 pt-3">
        <div role="status" aria-live="polite" aria-label={`LLM ${model || "未知"}，状态：${llmStatus.text}`}>
          <button className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs hover:bg-stone-200 ${collapsed ? "justify-center" : "gap-2"}`} title={health} onClick={() => setDrawerOpen(true)}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${llmStatus.tone}`}/>
            {!collapsed && <>
              <span className="truncate text-stone-700">LLM: {model || "未知"}</span>
              <span className="ml-auto shrink-0 text-stone-500">{llmStatus.text}</span>
            </>}
          </button>
        </div>
        {!collapsed && <button className="mt-2 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm" onClick={() => setDrawerOpen(true)}>设置与运维</button>}
      </div>
    </aside>
    <main className={`mx-auto flex min-h-screen min-w-0 w-full flex-col px-5 md:px-12 ${collapsed ? "max-w-5xl md:max-w-6xl" : "max-w-5xl"}`}>
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 py-6 text-sm text-stone-500">
        <span>理解问题，按需查证</span>
        {uiFlags.docPanel && <button type="button" className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600 hover:bg-stone-100"
          onClick={() => { setExplorerDoc(null); setExplorerOpen(true); }}>本地文档</button>}
      </header>
      {!connected && <section role="alert" className="mt-4 flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <span>已断开连接；历史仍可查看，未完成的回答不会作为上下文。</span>
        <button className="rounded-lg bg-teal-800 px-3 py-1 text-xs text-white" onClick={() => setConnected(true)}>重新连接</button>
      </section>}
      {connected && (!ready || !corpusReady) && <section role="status" aria-live="polite" className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6">
        <h2 className="text-lg font-semibold text-teal-900">{health}</h2>
        <p className="mt-2 text-sm text-teal-800">{ready ? "知识库就绪前，需要资料查证的问题暂不可用。" : "可以先输入问题，配置模型密钥后即可发送。"}</p>
        {progress?.stage === "loading_model" && <p className="mt-3 text-sm">正在加载本地 embedding 模型，首次使用需要一些时间。</p>}
        {progress && progress.total > 0 && <div className="mt-3"><progress className="w-full" value={progress.completed} max={progress.total}/><p className="text-xs">向量索引：{progress.completed} / {progress.total} 个片段</p></div>}
      </section>}
      {view === "chat" && <>
      {activeTask && <p className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs text-stone-600">任务：{activeTask.name} · {activeTask.description}</p>}
      <section className="flex-1 py-8" aria-label="对话">
        {!turns.length && <div className="py-16">
          <p className="text-sm text-teal-700">你的知识，有据可循。</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">从一个好问题开始。</h1>
          <p className="mt-5 leading-7 text-stone-500">自然交流，需要时查阅资料并给出依据。</p>
          <div className="mt-8"><p className="text-xs text-stone-400">试试这些任务：</p><div className="mt-2 flex flex-wrap gap-2">{EXAMPLES.map(([label, question]) => <button key={label} className="rounded-xl border border-stone-200 bg-white p-3 text-left text-sm hover:bg-stone-100" onClick={() => setInput(question)}>{label} ↗</button>)}</div></div>
        </div>}
        {turns.map((turn, i) => <Fragment key={`${turn.runId}-${i}`}>
          {workspace.branches.filter(b => b.fromIndex === i).map(b => <div key={b.id} className="mb-4 flex justify-center"><button className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs text-teal-800 hover:bg-teal-100" onClick={() => setViewingBranch(b)}>{b.label} ↗</button></div>)}
          <article className="mb-10">
          <div className="mb-6 ml-auto max-w-[85%] rounded-2xl bg-stone-200/70 px-5 py-3"><div className="whitespace-pre-wrap">{turn.question}</div><div className="mt-2 flex justify-end gap-3 text-xs text-stone-500"><button className="hover:underline" onClick={() => void copyQuestion(turn.question)}>复制问题</button><button className="hover:underline" onClick={() => void beginEdit(i)}>编辑并重问</button></div></div>
          {editing?.index === i && <div className="mb-5 ml-auto max-w-[90%] rounded-2xl border border-teal-300 bg-white p-3"><textarea aria-label="编辑历史问题" className="w-full resize-y p-2 text-sm outline-none" rows={4} value={editing.text} onChange={e => setEditing({...editing, text: e.target.value})}/><div className="mt-2 flex justify-end gap-2"><button className="rounded-lg border px-3 py-1 text-xs" onClick={() => setEditing(null)}>取消</button><button className="rounded-lg bg-teal-800 px-3 py-1 text-xs text-white" onClick={() => void confirmEdit()}>确认修改并重新询问</button></div></div>}
          <Answer attempt={turn} startedTick={i === turns.length - 1 ? startedTick.current : undefined} onRegenerate={i === turns.length - 1 && connected && ready ? () => void send(true) : undefined} onOpenSource={handleOpenSource}/>
          {!!turn.previousAttempts.length && <details className="mt-4 rounded-xl border border-stone-200 p-4">
            <summary className="cursor-pointer text-sm text-stone-500">之前的回答 · {turn.previousAttempts.length} 个版本</summary>
            {turn.previousAttempts.map((attempt, version) => <div key={version} className="mt-4 border-t border-stone-200 pt-4"><p className="mb-3 text-xs text-stone-500">版本 {version + 1}</p><Answer attempt={attempt}/></div>)}
          </details>}
        </article></Fragment>)}
        {workspace.branches.filter(b => b.fromIndex >= turns.length).map(b => <div key={b.id} className="mb-4 flex justify-center"><button className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs text-teal-800 hover:bg-teal-100" onClick={() => setViewingBranch(b)}>{b.label} ↗</button></div>)}
        {viewingBranch && <section className="mb-8 rounded-2xl border border-teal-300 bg-white p-5" aria-label="分支查看">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{viewingBranch.label} · 从第 {viewingBranch.fromIndex + 1} 轮起</h2>
            <div className="flex gap-3 text-xs">
              <button className="rounded-lg bg-teal-800 px-3 py-1 text-white disabled:opacity-40" disabled={sessionBusy} onClick={() => void restoreSelectedBranch()}>设为主时间线</button>
              <button className="underline" onClick={() => setViewingBranch(null)}>关闭</button>
            </div>
          </div>
          {viewingBranch.turns.map((turn, i) => <div key={`${turn.runId}-${i}`} className="mb-6">
            <div className="mb-3 ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stone-200/70 px-4 py-2">{turn.question}</div>
            <Answer attempt={turn}/>
          </div>)}
        </section>}
        <div role="status" className="text-sm text-teal-700">{status}</div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div ref={bottom}/>
      </section>
      <form className="sticky bottom-0 bg-stone-50 pb-6 pt-3" onSubmit={e => { e.preventDefault(); void send(); }}>
        <details className="mb-3 rounded-xl border border-stone-200 bg-white p-3 text-xs shadow-sm">
          <summary className="cursor-pointer text-stone-600">资料范围：{options.allowed_doc_ids ? `${options.allowed_doc_ids.length} 份` : "全部"} <span className="text-stone-400">· 仅影响新问题</span></summary>
          <div className="mt-3"><ScopeSelector documents={documents} selected={options.allowed_doc_ids} change={ids => setOptions(o => ({ ...o, allowed_doc_ids: ids }))} disabled={busy || !connected}/></div>
        </details>
        <div className="rounded-2xl border border-stone-300 bg-white p-3 shadow-sm">
          {uiFlags.tasks && taskId === "task4"
            ? <div role="status" className="p-2 text-sm text-stone-600">当前任务为“专项报告”：结构化报告通过统一报告入口生成，不在聊天中发送正文；报告接口就绪前这里保持占位提示（demand §9.3）。</div>
            : <textarea aria-label="问题" disabled={!connected} maxLength={12000} rows={3} className="w-full resize-none p-2 outline-none disabled:bg-white" placeholder="提问、讨论，或指定资料查证…" value={input} onChange={e => setInput(e.target.value)}/>}
          <div className="flex items-center justify-between"><span className="text-xs text-stone-400">{connected ? "会话自动保存" : "已断开；历史仍可查看"}</span>{busy ? <button type="button" className="rounded-lg bg-stone-800 px-5 py-2 text-sm text-white" onClick={e => { e.preventDefault(); controller.current?.abort(); }}>停止</button> : <button type="submit" disabled={!input.trim() || !ready || !workspace.loaded || !connected || (uiFlags.tasks && taskId === "task4")} className="rounded-lg bg-teal-800 px-5 py-2 text-sm text-white disabled:opacity-40">{connected && ready ? "发送 ↑" : "等待连接"}</button>}</div>
        </div>
      </form>
      </>}
      {view === "library" && <LibraryView documents={documents} corpusReady={corpusReady} onOpenDocument={openDocument} onBack={backToChat}
        corpus={currentCorpus} ingestBusy={ingestBusy}
        onIngestCorpus={currentCorpus ? () => void runCorpusIngest(currentCorpus.id) : undefined}/>}
      {view === "news" && <section className="flex-1 py-8" aria-label="科研头条">
        <h1 className="text-2xl font-semibold">科研头条</h1>
        <p role="status" className="mt-3 text-sm text-stone-500">占位板块：资讯数据源、板块口径与合规方式未定，首期不实现抓取，也不参与检索与引用（demand §9.7）。</p>
      </section>}
    </main>
    <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} headerAction={
      <button aria-label="断开连接" title={connected ? "断开连接" : "已断开"} disabled={!connected}
        className="rounded-lg border p-1.5 text-stone-600 disabled:opacity-40"
        onClick={() => { setDrawerOpen(false); void disconnect(); }}><PowerIcon/></button>
    }>
      {documentsError && <p role="alert" className="text-xs text-red-700">{documentsError}</p>}
      <IngestTools documents={documents} refresh={refreshDocuments} connected={connected} onOpenDocument={openDocument}/>
      <OfficialDocs connected={connected}/>
      <section className="border-t border-stone-200 pt-4 text-sm" aria-label="模型信息">
        <h3 className="font-semibold">模型</h3>
        <p className="mt-1 text-xs text-stone-500" role="status">当前模型：{model || "未知"}（来源 /api/health）</p>
        <p className="mt-1 text-xs text-stone-500">首期为服务端固定单一模型，界面如实展示，暂不支持切换；多模型切换需后端提供可用模型列表与请求级模型字段（demand §9.6 后续项）。</p>
      </section>
      <div className="border-t border-stone-200 pt-4">
        <button disabled={busy || !turns.length} className="w-full rounded-lg border bg-white p-2 text-sm disabled:opacity-40" onClick={exportChat}>导出对话与证据版本</button>
      </div>
    </SettingsDrawer>
    <DocumentPreview doc={previewDoc} onClose={() => setPreviewDoc(null)}/>
    {uiFlags.docPanel && <DocumentExplorer open={explorerOpen} onClose={() => setExplorerOpen(false)}
      documents={documents} corpusReady={corpusReady} corpusName={currentCorpus?.name}
      docId={explorerDoc?.docId ?? null} page={explorerDoc?.page ?? null}
      onNavigate={(docId, page) => setExplorerDoc(docId ? { docId, page } : null)}
      allowedDocIds={options.allowed_doc_ids}
      onLimitScope={ids => setOptions(o => ({ ...o, allowed_doc_ids: ids }))}/>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
