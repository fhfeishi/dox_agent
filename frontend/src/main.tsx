import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { streamChat, type Options } from "./api";
import { Answer } from "./Answer";
import { branchFromTurn, newTurn, regenerateTurn, receiveEvent, stopTurn, type Turn } from "./conversation";
import "./style.css";
import { IngestTools } from "./IngestTools";
import { OfficialDocs } from "./OfficialDocs";
import { ScopeSelector } from "./ScopeSelector";
import { SessionList } from "./SessionList";
import { SettingsDrawer } from "./SettingsDrawer";
import { useDocuments } from "./useDocuments";
import { useWorkspace } from "./workspace";

type EditState = { index: number; text: string } | null;

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
  const [connected, setConnected] = useState(true);
  const [editing, setEditing] = useState<EditState>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [options, setOptions] = useState<Options>({ allowed_doc_ids: null });
  const [progress, setProgress] = useState<{ stage: string; completed: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const activeRun = useRef<Promise<void> | null>(null);
  const latestTurns = useRef<Turn[]>([]);
  const startedTick = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const setTurnsTracked: Dispatch<SetStateAction<Turn[]>> = value => setTurns(current => {
    const next = typeof value === "function" ? value(current) : value;
    latestTurns.current = next;
    return next;
  });
  const workspace = useWorkspace(turns, options, setTurnsTracked, setOptions);
  const { documents, error: documentsError, refresh: refreshDocuments } = useDocuments(connected);
  useEffect(() => { if (corpusReady) void refreshDocuments(); }, [corpusReady, refreshDocuments]);
  function exportChat() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), service: health, turns }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "dox-agent-comparison.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        setHealth(!state.ready ? "请在 .env 配置模型密钥后重启" : data.preparation === "running" ? "知识库正在加载" : data.preparation === "error" ? "知识库加载失败" : "服务已连接 · " + data.model);
      } catch {
        state.ready = false; state.corpus = false;
        setReady(false); setHealth("服务暂时未连接，正在自动重连…");
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
    const effectiveOptions = override?.options ?? options;
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
      try { await workspace.saveNow(latestTurns.current, effectiveOptions); }
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
    const branch = branchFromTurn(latestTurns.current, editing.index);
    try {
      await workspace.createBranch(branch.history, branch.options, editing.index);
      replaceTurns(() => branch.history);
      const question = editing.text.trim(); setEditing(null); setSessionBusy(false);
      await send(false, { question, history: branch.history, options: branch.options });
    } catch (e) { setSessionBusy(false); setError(`建立编辑分支失败：${(e as Error).message}`); }
  }
  async function disconnect() {
    setError("");
    await settleActiveRun();
    try { await workspace.saveNow(latestTurns.current, options); setConnected(false); setStatus("已停止并保存，连接已断开"); }
    catch (e) { setError(`未能保存，尚未断开：${(e as Error).message}`); }
  }
  async function switchSession(id?: string) {
    setSessionBusy(true);
    await settleActiveRun();
    try { await workspace.saveNow(latestTurns.current, options); await workspace.select(id); setEditing(null); setError(""); setStatus(""); }
    catch (e) { setError(`切换前保存失败：${(e as Error).message}`); }
    finally { setSessionBusy(false); }
  }
  async function copyQuestion(question: string) {
    try { await navigator.clipboard.writeText(question); setStatus("问题已复制"); }
    catch { setError("复制失败，请手动选择问题"); }
  }
  const activeTitle = workspace.sessions.find(s => s.id === workspace.active)?.title ?? turns[0]?.question?.slice(0, 100) ?? "";
  const healthy = ready && connected && corpusReady;
  return <div className="min-h-screen bg-stone-50 text-stone-800 md:grid md:grid-cols-[260px_1fr]">
    <aside className="border-r border-stone-200 bg-stone-100 p-5 md:sticky md:top-0 md:h-screen md:overflow-y-auto">
      <div className="text-xs font-semibold tracking-[0.2em] text-stone-500">DOX_AGENT / 01</div>
      <button className="mt-5 w-full rounded-xl border border-stone-300 bg-white p-3 text-left text-sm disabled:opacity-40" disabled={!workspace.loaded || sessionBusy} onClick={() => void switchSession()}>＋ 新的问答</button>
      <p className="mt-2 text-xs text-stone-500" role="status">{workspace.message}</p>
      <SessionList sessions={workspace.sessions} active={workspace.active} activeTitle={activeTitle} loaded={workspace.loaded} busy={sessionBusy} onSelect={id => void switchSession(id)} onRename={(id, title) => void workspace.rename(title, id)} onArchive={id => void workspace.setArchived(id, true)} onRestore={id => void workspace.setArchived(id, false)}/>
      <div className="mt-6 text-xs text-stone-500">
        {healthy
          ? <span title={health} className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-teal-600"/>服务已连接</span>
          : <p className="leading-5">{connected ? health : "已主动断开"}<br/>知识库：{corpusReady ? "可用" : "准备中或不可用"}</p>}
      </div>
      <button className="mt-3 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm" onClick={() => setDrawerOpen(true)}>设置与运维</button>
    </aside>
    <main className="mx-auto flex min-h-screen min-w-0 w-full max-w-5xl flex-col px-5 md:px-12">
      <header className="border-b border-stone-200 py-6 text-right text-sm text-stone-500">理解问题，按需查证</header>
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
      <section className="flex-1 py-8" aria-label="对话">
        {!turns.length && <div className="py-16">
          <p className="text-sm text-teal-700">你的知识，有据可循。</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">从一个好问题开始。</h1>
          <p className="mt-5 leading-7 text-stone-500">自然交流，需要时查阅资料并给出依据。</p>
          <div className="mt-8"><p className="text-xs text-stone-400">试试这些任务：</p><div className="mt-2 flex flex-wrap gap-2">{EXAMPLES.map(([label, question]) => <button key={label} className="rounded-xl border border-stone-200 bg-white p-3 text-left text-sm hover:bg-stone-100" onClick={() => setInput(question)}>{label} ↗</button>)}</div></div>
        </div>}
        {turns.map((turn, i) => <article key={`${turn.runId}-${i}`} className="mb-10">
          <div className="mb-6 ml-auto max-w-[85%] rounded-2xl bg-stone-200/70 px-5 py-3"><div className="whitespace-pre-wrap">{turn.question}</div><div className="mt-2 flex justify-end gap-3 text-xs text-stone-500"><button className="hover:underline" onClick={() => void copyQuestion(turn.question)}>复制问题</button><button className="hover:underline" onClick={() => void beginEdit(i)}>编辑并重问</button></div></div>
          {editing?.index === i && <div className="mb-5 ml-auto max-w-[90%] rounded-2xl border border-teal-300 bg-white p-3"><textarea aria-label="编辑历史问题" className="w-full resize-y p-2 text-sm outline-none" rows={4} value={editing.text} onChange={e => setEditing({...editing, text: e.target.value})}/><div className="mt-2 flex justify-end gap-2"><button className="rounded-lg border px-3 py-1 text-xs" onClick={() => setEditing(null)}>取消</button><button className="rounded-lg bg-teal-800 px-3 py-1 text-xs text-white" onClick={() => void confirmEdit()}>确认修改并重新询问</button></div></div>}
          <Answer attempt={turn} startedTick={i === turns.length - 1 ? startedTick.current : undefined} onRegenerate={i === turns.length - 1 && connected && ready ? () => void send(true) : undefined}/>
          {!!turn.previousAttempts.length && <details className="mt-4 rounded-xl border border-stone-200 p-4">
            <summary className="cursor-pointer text-sm text-stone-500">之前的回答 · {turn.previousAttempts.length} 个版本</summary>
            {turn.previousAttempts.map((attempt, version) => <div key={version} className="mt-4 border-t border-stone-200 pt-4"><p className="mb-3 text-xs text-stone-500">版本 {version + 1}</p><Answer attempt={attempt}/></div>)}
          </details>}
        </article>)}
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
          <textarea aria-label="问题" disabled={!connected} maxLength={12000} rows={3} className="w-full resize-none p-2 outline-none disabled:bg-white" placeholder="提问、讨论，或指定资料查证…" value={input} onChange={e => setInput(e.target.value)}/>
          <div className="flex items-center justify-between"><span className="text-xs text-stone-400">{connected ? "会话自动保存" : "已断开；历史仍可查看"}</span>{busy ? <button type="button" className="rounded-lg bg-stone-800 px-5 py-2 text-sm text-white" onClick={e => { e.preventDefault(); controller.current?.abort(); }}>停止</button> : <button type="submit" disabled={!input.trim() || !ready || !workspace.loaded || !connected} className="rounded-lg bg-teal-800 px-5 py-2 text-sm text-white disabled:opacity-40">{connected && ready ? "发送 ↑" : "等待连接"}</button>}</div>
        </div>
      </form>
    </main>
    <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
      {documentsError && <p role="alert" className="text-xs text-red-700">{documentsError}</p>}
      <IngestTools documents={documents} refresh={refreshDocuments} connected={connected}/>
      <OfficialDocs connected={connected}/>
      <div className="space-y-2 border-t border-stone-200 pt-4">
        <button disabled={busy || !turns.length} className="w-full rounded-lg border bg-white p-2 text-sm disabled:opacity-40" onClick={exportChat}>导出对话与证据版本</button>
        {connected
          ? <button className="w-full rounded-lg border bg-white p-2 text-sm" onClick={() => { setDrawerOpen(false); void disconnect(); }}>断开连接并退出</button>
          : <button className="w-full rounded-lg bg-teal-800 p-2 text-sm text-white" onClick={() => { setDrawerOpen(false); setConnected(true); }}>重新连接</button>}
      </div>
    </SettingsDrawer>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
