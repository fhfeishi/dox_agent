import { Fragment, useState } from "react";
import type { Saved, SessionData } from "./workspace";

function sessionTime(session: Saved<SessionData>): string | undefined {
  return session.updated_at ?? session.data.turns?.[0]?.startedAt;
}

function groupOf(iso: string | undefined): "今天" | "昨天" | "更早" {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "今天";
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(start); yesterday.setDate(start.getDate() - 1);
  if (date >= start) return "今天";
  if (date >= yesterday) return "昨天";
  return "更早";
}

export function SessionList({ sessions, active, activeTitle, loaded, busy, onSelect, onRename, onArchive, onRestore }: {
  sessions: Saved<SessionData>[];
  active: string;
  activeTitle: string;
  loaded: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const matches = (title: string) => title.toLowerCase().includes(query.trim().toLowerCase());
  const sourceIds = new Set(sessions.map(session => session.id));
  const legacyBranch = (session: Saved<SessionData>) => Boolean(session.data.source_session_id && sourceIds.has(session.data.source_session_id));
  const childrenOf = (id: string) => sessions.filter(session => !session.data.archived && session.data.source_session_id === id && matches(session.title));
  const visible = sessions.filter(session => !session.data.archived && !legacyBranch(session) && matches(session.title));
  const archived = sessions.filter(session => session.data.archived);
  const unsaved = !sessions.some(session => session.id === active) && matches(activeTitle || "当前新会话");

  function itemTitle(title: string) { return title.length > 34 ? title.slice(0, 34) + "…" : title; }

  return <div className="mt-4 text-sm">
    <input aria-label="搜索会话" className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs" placeholder="搜索会话" value={query} onChange={e => setQuery(e.target.value)}/>
    <div className="mt-2 space-y-3">
      {unsaved && <div>
        <p className="mb-1 text-xs font-medium text-stone-500">今天</p>
        <button className="w-full truncate rounded-lg border border-teal-300 bg-teal-50 px-2 py-1 text-left text-xs text-teal-900" onClick={() => onSelect(active)}>{itemTitle(activeTitle || "当前新会话")}</button>
      </div>}
      {(["今天", "昨天", "更早"] as const).map(group => {
        const items = visible.filter(session => groupOf(sessionTime(session)) === group);
        if (!items.length) return null;
        return <div key={group}>
          <p className="mb-1 text-xs font-medium text-stone-500">{group}</p>
          <ul className="space-y-1">
            {items.map(session => <Fragment key={session.id}>
              {editing?.id === session.id
              ? <li><form className="flex gap-1" onSubmit={e => { e.preventDefault(); onRename(session.id, editing.title); setEditing(null); }}>
                  <input autoFocus aria-label="会话标题" className="min-w-0 flex-1 rounded border px-2 py-1 text-xs" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}/>
                  <button type="submit" className="rounded border px-2 text-xs">保存</button>
                  <button type="button" className="px-1 text-xs" onClick={() => setEditing(null)}>取消</button>
                </form></li>
              : <li className="group flex items-center gap-1">
                  <button disabled={!loaded || busy} className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-xs disabled:opacity-40 ${session.id === active ? "border border-teal-300 bg-teal-50 text-teal-900" : "hover:bg-stone-200"}`} onClick={() => onSelect(session.id)}>{itemTitle(session.title)}</button>
                  <span className="hidden shrink-0 gap-1 group-hover:flex">
                    <button aria-label="重命名会话" title="重命名" className="px-1 text-xs" onClick={() => setEditing({ id: session.id, title: session.title })}>重命名</button>
                    <button aria-label="归档会话" title="归档" className="px-1 text-xs" onClick={() => onArchive(session.id)}>归档</button>
                  </span>
                </li>}
              {!!childrenOf(session.id).length && <ul className="ml-3 mt-1 space-y-1 border-l border-stone-200 pl-2">
                {childrenOf(session.id).map(child => <li key={child.id}>
                  <button disabled={!loaded || busy} className="min-w-0 w-full truncate rounded-lg px-2 py-1 text-left text-xs text-stone-500 hover:bg-stone-200 disabled:opacity-40" onClick={() => onSelect(child.id)}>{itemTitle(child.title)} <span className="text-stone-400">· 历史分支</span></button>
                </li>)}
              </ul>}
            </Fragment>)}
          </ul>
        </div>;
      })}
      {!unsaved && !visible.length && <p className="text-xs text-stone-400">{query ? "没有匹配的会话。" : "还没有会话。"}</p>}
    </div>
    {!!archived.length && <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-stone-500">已归档会话 · {archived.length}</summary>
      {archived.map(session => <div key={session.id} className="mt-2 flex justify-between gap-2"><span className="truncate">{session.title}</span><button className="underline" onClick={() => onRestore(session.id)}>恢复</button></div>)}
    </details>}
  </div>;
}
