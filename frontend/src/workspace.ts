import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { restoreTurns, type Turn } from "./conversation";
import type { Options } from "./api";
import { createBranch as makeBranch, deepCopy, trimBranches, type Branch } from "./branches";

export type Saved<T = Record<string, unknown>> = { id: string; revision: number; title: string; data: T; updated_at?: string; source_status?: string };
/** U1.2: `task_id` binds a session to one task; it lives next to `options`, not inside it. */
export type SessionData = { turns: Turn[]; options: Options; archived?: boolean; branches?: Branch[]; task_id?: string; corpus_id?: string; source_session_id?: string; source_turn_index?: number };
export const DEFAULT_TASK_ID = "task1";

export async function workspaceRequest(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "保存失败");
  return data;
}

export function useWorkspace(turns: Turn[], options: Options, setTurns: Dispatch<SetStateAction<Turn[]>>, setOptions: (options: Options) => void,
  taskId: string = DEFAULT_TASK_ID, setTaskId?: (taskId: string) => void,
  corpusId: string = "", setCorpusId?: (corpusId: string) => void) {
  const [sessions, setSessions] = useState<Saved<SessionData>[]>([]);
  const [active, setActive] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("正在恢复会话…");
  const [branches, setBranches] = useState<Branch[]>([]);
  const revisions = useRef<Record<string, number>>({});
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<Saved<SessionData> | null>(null);
  const activeRef = useRef("");
  const sessionsRef = useRef<Saved<SessionData>[]>([]);
  const turnsRef = useRef(turns);
  const optionsRef = useRef(options);
  const branchesRef = useRef(branches);
  const taskIdRef = useRef(taskId);
  const corpusIdRef = useRef(corpusId);
  const hydrated = useRef(false);

  function updateSessions(value: Saved<SessionData>[]) { sessionsRef.current = value; setSessions(value); }
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { optionsRef.current = options; }, [options]);
  useEffect(() => { branchesRef.current = branches; }, [branches]);
  useEffect(() => { taskIdRef.current = taskId; }, [taskId]);
  useEffect(() => { corpusIdRef.current = corpusId; }, [corpusId]);
  useEffect(() => {
    void workspaceRequest("/api/workspace/sessions").then((items: Saved<SessionData>[]) => {
      updateSessions(items);
      for (const item of items) revisions.current[item.id] = item.revision;
      const visible = items.filter(item => !item.data.archived);
      const selected = visible.find(item => item.id === localStorage.getItem("dox-agent-session")) ?? visible[0];
      const id = selected?.id ?? crypto.randomUUID();
      activeRef.current = id; setActive(id);
      if (selected) {
        const task = selected.data.task_id ?? DEFAULT_TASK_ID;
        taskIdRef.current = task; setTaskId?.(task);
        if (selected.data.corpus_id) { corpusIdRef.current = selected.data.corpus_id; setCorpusId?.(selected.data.corpus_id); }
        setTurns(restoreTurns(selected.data.turns)); setOptions(selected.data.options); setBranches(selected.data.branches ?? []);
      }
      hydrated.current = true; setLoaded(true); setMessage(selected ? "会话已恢复" : "可以开始新会话");
    }).catch(e => setMessage("会话恢复失败：" + e.message));
  }, []);

  function enqueue(record: Saved<SessionData>) {
    chain.current = chain.current.catch(() => undefined).then(async () => {
      setMessage("正在保存…");
      const saved = await workspaceRequest(`/api/workspace/sessions/${record.id}`, {
        title: record.title, data: record.data, revision: revisions.current[record.id] ?? 0,
      });
      revisions.current[record.id] = saved.revision;
      updateSessions([saved, ...sessionsRef.current.filter(item => item.id !== saved.id)]);
      setMessage("已保存到本地服务");
    }).catch(error => {
      setMessage((error as Error).message + "；当前内容仍保留，请重试或导出");
      throw error;
    });
    return chain.current;
  }
  function flush() { const snapshot = pending.current; pending.current = null; return snapshot ? enqueue(snapshot) : chain.current; }
  async function saveNow(snapshot = turnsRef.current, effectiveOptions = optionsRef.current, branchSnapshot = branchesRef.current, taskSnapshot = taskIdRef.current, corpusSnapshot = corpusIdRef.current) {
    if (!snapshot.length) return;
    pending.current = null;
    const existing = sessionsRef.current.find(item => item.id === activeRef.current);
    await enqueue({ id: activeRef.current, revision: revisions.current[activeRef.current] ?? 0,
      title: existing?.title ?? snapshot[0].question.slice(0, 100),
      // H8: keep the stored corpus binding when the selector has not resolved one yet.
      data: { ...existing?.data, turns: snapshot, options: effectiveOptions, branches: branchSnapshot, task_id: taskSnapshot, corpus_id: corpusSnapshot || existing?.data.corpus_id } });
  }
  useEffect(() => {
    if (!loaded || !hydrated.current || !active || !turns.length) return;
    localStorage.setItem("dox-agent-session", active);
    const existing = sessionsRef.current.find(item => item.id === active);
    pending.current = { id: active, revision: revisions.current[active] ?? 0,
      title: existing?.title ?? turns[0].question.slice(0, 100), data: { ...existing?.data, turns, options, branches, task_id: taskIdRef.current, corpus_id: corpusIdRef.current || existing?.data.corpus_id } };
    const timer = setTimeout(() => { void flush().catch(() => undefined); }, 500);
    return () => clearTimeout(timer);
  }, [turns, options, branches, active, loaded]);
  /** `task` binds the session created from the task picker (U1.2); omitted means keep the stored one. */
  async function select(id?: string, task?: string, corpus?: string) {
    await flush();
    const item = sessionsRef.current.find(session => session.id === id);
    const next = item?.id ?? crypto.randomUUID();
    const nextTask = task ?? item?.data.task_id ?? DEFAULT_TASK_ID;
    taskIdRef.current = nextTask; setTaskId?.(nextTask);
    // H8: an existing session restores its bound corpus; a new one inherits the current selection.
    const nextCorpus = corpus ?? item?.data.corpus_id ?? corpusIdRef.current;
    corpusIdRef.current = nextCorpus; setCorpusId?.(nextCorpus);
    activeRef.current = next; setActive(next); localStorage.setItem("dox-agent-session", next);
    setTurns(item ? restoreTurns(item.data.turns) : []);
    setBranches(item?.data.branches ?? []);
    if (item) setOptions(item.data.options);
  }
  /** U5: snapshot the tail as a branch and hand back the truncated history; no new session. */
  async function branchInPlace(index: number) {
    const snapshot = makeBranch(turnsRef.current, index, branchesRef.current, optionsRef.current);
    const { branches: kept, trimmed } = trimBranches([...branchesRef.current, snapshot]);
    branchesRef.current = kept; setBranches(kept);
    return { history: deepCopy(turnsRef.current.slice(0, index)), options: optionsRef.current, branch: snapshot, trimmed };
  }
  function viewBranch(id: string) { return branchesRef.current.find(branch => branch.id === id) ?? null; }
  /** Make a branch the main timeline; save the current main back as a branch unless it is empty. */
  async function restoreBranch(id: string) {
    const target = branchesRef.current.find(branch => branch.id === id);
    if (!target) return null;
    const currentMain = turnsRef.current;
    let next = branchesRef.current.filter(branch => branch.id !== id);
    if (currentMain.length) next = trimBranches([...next, makeBranch(currentMain, target.fromIndex, next, optionsRef.current)]).branches;
    next = trimBranches(next).branches;
    branchesRef.current = next; setBranches(next);
    const restored = restoreTurns(deepCopy(target.turns));
    setTurns(restored);
    await saveNow(restored, target.options ?? optionsRef.current, next);
    return restored;
  }
  async function rename(title: string, id?: string) {
    const item = sessionsRef.current.find(session => session.id === (id ?? activeRef.current));
    if (item && title.trim()) await enqueue({ ...item, title: title.trim().slice(0, 200) });
  }
  async function setArchived(id: string, archived: boolean) {
    const item = sessionsRef.current.find(session => session.id === id);
    if (!item) return;
    await enqueue({ ...item, data: { ...item.data, archived } });
    if (archived && id === activeRef.current) await select();
  }
  return { sessions, active, loaded, message, branches, select, flush, saveNow, branchInPlace, viewBranch, restoreBranch, rename, setArchived };
}
