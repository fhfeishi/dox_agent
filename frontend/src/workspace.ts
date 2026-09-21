import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { restoreTurns, type Turn } from "./conversation";
import type { Options } from "./api";

export type Saved<T = Record<string, unknown>> = { id: string; revision: number; title: string; data: T; updated_at?: string; source_status?: string };
export type SessionData = { turns: Turn[]; options: Options; archived?: boolean; source_session_id?: string; source_turn_index?: number };

export async function workspaceRequest(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "保存失败");
  return data;
}

export function useWorkspace(turns: Turn[], options: Options, setTurns: Dispatch<SetStateAction<Turn[]>>, setOptions: (options: Options) => void) {
  const [sessions, setSessions] = useState<Saved<SessionData>[]>([]);
  const [active, setActive] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("正在恢复会话…");
  const revisions = useRef<Record<string, number>>({});
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<Saved<SessionData> | null>(null);
  const activeRef = useRef("");
  const sessionsRef = useRef<Saved<SessionData>[]>([]);
  const turnsRef = useRef(turns);
  const optionsRef = useRef(options);
  const hydrated = useRef(false);

  function updateSessions(value: Saved<SessionData>[]) { sessionsRef.current = value; setSessions(value); }
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { optionsRef.current = options; }, [options]);
  useEffect(() => {
    void workspaceRequest("/api/workspace/sessions").then((items: Saved<SessionData>[]) => {
      updateSessions(items);
      for (const item of items) revisions.current[item.id] = item.revision;
      const visible = items.filter(item => !item.data.archived);
      const selected = visible.find(item => item.id === localStorage.getItem("dox-agent-session")) ?? visible[0];
      const id = selected?.id ?? crypto.randomUUID();
      activeRef.current = id; setActive(id);
      if (selected) { setTurns(restoreTurns(selected.data.turns)); setOptions(selected.data.options); }
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
  async function saveNow(snapshot = turnsRef.current, effectiveOptions = optionsRef.current) {
    if (!snapshot.length) return;
    pending.current = null;
    const existing = sessionsRef.current.find(item => item.id === activeRef.current);
    await enqueue({ id: activeRef.current, revision: revisions.current[activeRef.current] ?? 0,
      title: existing?.title ?? snapshot[0].question.slice(0, 100),
      data: { ...existing?.data, turns: snapshot, options: effectiveOptions } });
  }
  useEffect(() => {
    if (!loaded || !hydrated.current || !active || !turns.length) return;
    localStorage.setItem("dox-agent-session", active);
    const existing = sessionsRef.current.find(item => item.id === active);
    pending.current = { id: active, revision: revisions.current[active] ?? 0,
      title: existing?.title ?? turns[0].question.slice(0, 100), data: { ...existing?.data, turns, options } };
    const timer = setTimeout(() => { void flush().catch(() => undefined); }, 500);
    return () => clearTimeout(timer);
  }, [turns, options, active, loaded]);
  async function select(id?: string) {
    await flush();
    const item = sessionsRef.current.find(session => session.id === id);
    const next = item?.id ?? crypto.randomUUID();
    activeRef.current = next; setActive(next); localStorage.setItem("dox-agent-session", next);
    setTurns(item ? restoreTurns(item.data.turns) : []);
    if (item) setOptions(item.data.options);
  }
  async function createBranch(baseTurns: Turn[], effectiveOptions: Options, sourceTurnIndex: number) {
    await saveNow();
    const source = activeRef.current;
    const id = crypto.randomUUID();
    activeRef.current = id; setActive(id); localStorage.setItem("dox-agent-session", id);
    const record: Saved<SessionData> = { id, revision: 0, title: "编辑后的分支",
      data: { turns: baseTurns, options: effectiveOptions, source_session_id: source, source_turn_index: sourceTurnIndex } };
    await enqueue(record); setOptions(effectiveOptions); return id;
  }
  async function rename(title: string) {
    const item = sessionsRef.current.find(session => session.id === activeRef.current);
    if (item && title.trim()) await enqueue({ ...item, title: title.trim().slice(0, 200) });
  }
  async function setArchived(id: string, archived: boolean) {
    const item = sessionsRef.current.find(session => session.id === id);
    if (!item) return;
    await enqueue({ ...item, data: { ...item.data, archived } });
    if (archived && id === activeRef.current) await select();
  }
  return { sessions, active, loaded, message, select, flush, saveNow, createBranch, rename, setArchived };
}
