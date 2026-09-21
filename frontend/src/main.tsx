import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { streamChat, type Options } from "./api";
import { Answer } from "./Answer";
import { branchFromTurn, newTurn, regenerateTurn, receiveEvent, stopTurn, type Turn } from "./conversation";
import "./style.css";
import { KnowledgePanel } from "./KnowledgePanel";
import { OfficialDocs } from "./OfficialDocs";
import { useWorkspace } from "./workspace";
import { SourceManager, type DocumentInfo } from "./SourceManager";

type EditState = { index: number; text: string } | null;

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
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [options, setOptions] = useState<Options>({ query_routing: "auto", evidence_level: "middle", allowed_doc_ids: null });
  const optionsInitialized = useRef(false);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
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
  const workspace = useWorkspace(turns, options, setTurnsTracked, value => { optionsInitialized.current = true; setOptions(value); });
  useEffect(() => { setSessionTitle(workspace.sessions.find(s => s.id === workspace.active)?.title ?? ""); }, [workspace.active, workspace.sessions]);
  function refreshDocuments() { void fetch("/api/documents").then(r => r.json()).then(setDocuments).catch(() => {}); }
  function exportChat() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), service: health, turns }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "dox-agent-comparison.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    if (!connected) { setReady(false); setHealth("已主动断开，本地历史仍可查看"); return; }
    const refresh = () => fetch("/api/health", { signal: AbortSignal.timeout(5000) }).then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        setReady(Boolean(data.api_key_configured));
        setCorpusReady(data.preparation === "ready");
        if (!optionsInitialized.current && data.defaults) {
          setOptions({ ...data.defaults, allowed_doc_ids: null }); optionsInitialized.current = true;
        }
        setProgress(data.index_progress ?? null);
        setHealth(!data.api_key_configured ? "请在 .env 配置模型密钥后重启" : data.preparation === "running" ? "知识库正在加载，一般交流可发送" : data.preparation === "error" ? "知识库加载失败，一般交流可发送" : "服务已连接 · " + data.model + " · 密钥已配置，模型连通性以实际请求为准");
      })
      .catch(() => { setReady(false); setHealth("服务暂时未连接，正在自动重连…"); });
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => { clearInterval(timer); controller.current?.abort(); };
  }, [connected]);
  useEffect(() => { void fetch("/api/documents").then(r => r.json()).then(setDocuments).catch(() => {}); }, [corpusReady]);
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
  return <div className="min-h-screen bg-stone-50 text-stone-800 md:grid md:grid-cols-[250px_1fr]">
    <aside className="border-r border-stone-200 bg-stone-100 p-6 md:sticky md:top-0 md:h-screen md:overflow-y-auto">
      <div className="text-xs font-semibold tracking-[0.2em] text-stone-500">DOX_AGENT / 01</div>
      <button className="mt-6 w-full rounded-xl border border-stone-300 bg-white p-3 text-left disabled:opacity-40" disabled={!workspace.loaded || sessionBusy} onClick={() => void switchSession()}>＋ 新的问答</button>
      <p className="mt-3 text-xs" role="status">{workspace.message}</p>
      <select aria-label="历史会话" className="mt-2 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm" disabled={!workspace.loaded || sessionBusy} value={workspace.active} onChange={e => void switchSession(e.target.value)}>{workspace.sessions.filter(s => !s.data.archived).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}{!workspace.sessions.some(s => s.id === workspace.active) && <option value={workspace.active}>当前新会话</option>}</select>
      <div className="mt-2 flex gap-2"><input aria-label="会话标题" className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1 text-xs" value={sessionTitle} onChange={e => setSessionTitle(e.target.value)} placeholder="会话标题"/><button className="text-xs underline" onClick={() => void workspace.rename(sessionTitle)}>重命名</button><button className="text-xs underline" disabled={!workspace.sessions.some(s => s.id === workspace.active)} onClick={() => void workspace.setArchived(workspace.active, true)}>归档</button></div>
      {!!workspace.sessions.some(s => s.data.archived) && <details className="mt-3 text-xs"><summary>已归档会话</summary>{workspace.sessions.filter(s => s.data.archived).map(s => <div key={s.id} className="mt-2 flex justify-between gap-2"><span className="truncate">{s.title}</span><button className="underline" onClick={() => void workspace.setArchived(s.id, false)}>恢复</button></div>)}</details>}
      <fieldset disabled={!connected} className="disabled:opacity-50"><SourceManager documents={documents} selected={options.allowed_doc_ids} change={ids => setOptions(o => ({ ...o, allowed_doc_ids: ids }))} refresh={refreshDocuments} disabled={busy || !connected}/><KnowledgePanel connected={connected}/><OfficialDocs connected={connected}/></fieldset>
      <button disabled={busy || !turns.length} className="mt-4 text-sm underline disabled:opacity-40" onClick={exportChat}>导出对话与证据版本</button>
      <div className={`mt-8 rounded-xl border p-3 text-xs leading-5 ${ready && connected ? "border-teal-300 bg-teal-50 text-teal-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}><b>LLM / 服务状态</b><p>{health}</p><p>知识库：{corpusReady ? "可用" : "准备中或不可用"}</p></div>
      {connected ? <button className="mt-3 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm" onClick={() => void disconnect()}>断开连接并退出</button> : <button className="mt-3 w-full rounded-lg bg-teal-800 p-2 text-sm text-white" onClick={() => setConnected(true)}>重新连接</button>}
    </aside>
    <main className="mx-auto flex min-h-screen min-w-0 w-full max-w-4xl flex-col px-5 md:px-12">
      <header className="border-b border-stone-200 py-6 text-right text-sm text-stone-500">理解问题，按需查证</header>
      {(!ready || !corpusReady) && <section role="status" aria-live="polite" className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6">
        <h2 className="text-lg font-semibold text-teal-900">{health}</h2>
        <p className="mt-2 text-sm text-teal-800">{ready ? "一般交流可以发送；需要资料查证的问题要等待知识库就绪。" : "可以先输入问题，连接并配置模型后可发送。"}</p>
        {progress?.stage === "loading_model" && <p className="mt-3 text-sm">正在加载本地 embedding 模型，首次使用需要一些时间。</p>}
        {progress && progress.total > 0 && <div className="mt-3"><progress className="w-full" value={progress.completed} max={progress.total}/><p className="text-xs">向量索引：{progress.completed} / {progress.total} 个片段</p></div>}
      </section>}
      <section className="flex-1 py-8" aria-label="对话">
        {!turns.length && <div className="py-16"><p className="text-sm text-teal-700">你的知识，有据可循。</p><h1 className="mt-4 text-4xl font-semibold leading-tight">从一个好问题开始。</h1><p className="mt-5 leading-7 text-stone-500">自然交流，需要时查阅资料并给出依据。</p>{!!documents.length && <div className="mt-8"><p className="text-xs text-stone-400">从资料中选择一个开始：</p><div className="mt-2 flex flex-wrap gap-2">{documents.slice(0, 3).map(d => <button key={d.doc_id} className="rounded-xl border border-stone-200 bg-white p-3 text-left text-sm hover:bg-stone-100" onClick={() => setInput(`请概括《${d.title}》的主要内容与关键结论。`)}>《{d.title}》 ↗</button>)}</div></div>}</div>}
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
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-3 text-xs shadow-sm">
          <label className="grid gap-1 text-stone-500">回答范围<select className="h-9 rounded-lg border border-stone-300 bg-stone-50 px-2 text-stone-700" aria-label="回答范围" disabled={busy || !connected} value={options.query_routing} onChange={e => setOptions(o => ({ ...o, query_routing: e.target.value as Options["query_routing"] }))}><option value="auto">自动判断</option><option value="knowledge_only">仅按资料</option></select></label>
          <label className="grid gap-1 text-stone-500">证据要求<select className="h-9 rounded-lg border border-stone-300 bg-stone-50 px-2 text-stone-700" aria-label="证据要求" disabled={busy || !connected} value={options.evidence_level} onChange={e => setOptions(o => ({ ...o, evidence_level: e.target.value as Options["evidence_level"] }))}><option value="low">自由讨论</option><option value="middle">有据分析</option><option value="high">严格依据</option></select></label>
          <label className="grid gap-1 text-stone-500">查证方式<select className="h-9 rounded-lg border border-stone-300 bg-stone-50 px-2 text-stone-700" aria-label="查证方式" disabled={busy || !connected} value={options.execution_mode ?? "auto"} onChange={e => setOptions(o => ({ ...o, execution_mode: e.target.value as Options["execution_mode"] }))}><option value="auto">按需查证</option><option value="quick">先快速查证</option><option value="research">深入研究</option></select></label>
          <div className="h-9 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-600">资料范围：{options.allowed_doc_ids ? `${options.allowed_doc_ids.length} 份` : "全部"}</div>
          <span className="pb-2 text-stone-400">仅影响新问题；重新生成沿用原配置</span>
        </div>
        <div className="rounded-2xl border border-stone-300 bg-white p-3 shadow-sm">
          <textarea aria-label="问题" disabled={!connected} maxLength={12000} rows={3} className="w-full resize-none p-2 outline-none disabled:bg-white" placeholder="提问、讨论，或指定资料查证…" value={input} onChange={e => setInput(e.target.value)}/>
          <div className="flex items-center justify-between"><span className="text-xs text-stone-400">{connected ? "会话自动保存" : "已断开；历史仍可查看"}</span>{busy ? <button type="button" className="rounded-lg bg-stone-800 px-5 py-2 text-sm text-white" onClick={e => { e.preventDefault(); controller.current?.abort(); }}>停止</button> : <button type="submit" disabled={!input.trim() || !ready || !workspace.loaded || !connected} className="rounded-lg bg-teal-800 px-5 py-2 text-sm text-white disabled:opacity-40">{connected && ready ? "发送 ↑" : "等待连接"}</button>}</div>
        </div>
      </form>
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
