import { Fragment, useState } from "react";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { Button, GroupLabel, PanelRow, SearchField } from "./ui";
import { ReviewRunPanel } from "./review/ReviewRunPanel";
import type { Saved, SessionData } from "../workspace";
import { TERMS } from "../copy";
import { useLayout } from "../layout";

function sessionTime(session: Saved<SessionData>): string | undefined {
  return session.updated_at ?? session.data.turns?.[0]?.startedAt;
}

function groupOf(iso: string | undefined): "今天" | "昨天" | "更早" {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "今天";
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(start);
  yesterday.setDate(start.getDate() - 1);
  if (date >= start) return "今天";
  if (date >= yesterday) return "昨天";
  return "更早";
}

export function SidePanel() {
  const {
    workspace,
    switchSession,
    sessionBusy,
    activeTitle,
    taskNames,
    tasks,
    tasksError,
    taskId,
    progress,
  } = useApp();
  const {
    nav,
    showInspector,
    sidebarCollapsed,
  } = useLayout();

  const [localQuery, setLocalQuery] = useState("");
  const query = localQuery;
  const setQuery = setLocalQuery;
  const [sessionFilter, setSessionFilter] = useState<"all" | "pinned">("all");
  // The top bar keeps the primary entries reachable while the panel is hidden.
  // Task pages keep their context in the main flow; a second task list obscures that flow.
  if (sidebarCollapsed || ["home", "overview", "library", "review", "tasks", "intelligence", "results"].includes(nav)) return null;

  const q = query.trim().toLowerCase();
  const allSessions = workspace.sessions;
  const sourceIds = new Set(allSessions.map((s) => s.id));
  // Legacy branch sessions (created by the old edit flow) nest under their source session.
  const isLegacyBranch = (s: Saved<SessionData>) =>
    Boolean(s.data.source_session_id && sourceIds.has(s.data.source_session_id));
  const childrenOf = (id: string) =>
    allSessions.filter(
      (s) =>
        !s.data.archived &&
        s.data.source_session_id === id &&
        s.title.toLowerCase().includes(q),
    );
  const sessions = allSessions.filter(
    (s) => !s.data.archived && !isLegacyBranch(s) && s.title.toLowerCase().includes(q)
      && (sessionFilter === "all" || s.data.pinned),
  );
  const archived = allSessions.filter((s) => s.data.archived);
  const visibleTasks = tasks.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(q));

  const unsaved = !allSessions.some((s) => s.id === workspace.active) && !q && sessionFilter === "all";
  const sessionEntry = (session: Saved<SessionData>) => (
    <Fragment key={session.id}>
      <SessionRow
        id={session.id} title={session.title} active={session.id === workspace.active}
        pinned={Boolean(session.data.pinned)}
        taskName={session.data.origin === "workspace" ? TERMS.workspaceAnalysis.name : session.data.task_id ? taskNames[session.data.task_id] : undefined}
        disabled={!workspace.loaded || sessionBusy}
        onSelect={() => void switchSession(session.id)}
        onRename={(title) => void workspace.rename(title, session.id)}
        onArchive={() => void workspace.setArchived(session.id, true)}
        onPin={() => void workspace.setPinned(session.id, !session.data.pinned)}
        onDelete={() => void workspace.remove(session.id)}
      />
      {childrenOf(session.id).length ? (
        <ul className="mb-[2px] ml-[14px] space-y-[1px] border-l border-[var(--hairline)] pl-[8px]">
          {childrenOf(session.id).map((child) => (
            <li key={child.id}><button type="button" disabled={!workspace.loaded || sessionBusy}
              onClick={() => void switchSession(child.id)}
              className="w-full truncate rounded-[6px] px-[8px] py-[6px] text-left text-caption text-[var(--steel)] transition-colors hover:bg-[var(--surface-sink)] disabled:opacity-40">
              {child.title} <span className="text-[var(--stone)]">· 历史分支</span>
            </button></li>
          ))}
        </ul>
      ) : null}
    </Fragment>
  );

  return (
    <aside className="flex w-[240px] hidden lg:flex shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--surface-soft)]">
      {/* Context action: a new conversation where conversations are the work. */}
      {nav === "chat" || nav === "tasks" ? <div className="px-[14px] pt-[14px] pb-[12px]">
        <button
          type="button"
          aria-label="＋ 新的问答"
          disabled={!workspace.loaded || sessionBusy}
          onClick={() => void switchSession()}
          className="font-app flex w-full items-center justify-center gap-[7px] rounded-[8px] bg-[var(--primary)] px-[14px] py-[9px] text-body font-medium text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:opacity-50"
        >
          <Icon name="plus" size={15} strokeWidth={2} />
          新建对话
        </button>
      </div> : <div className="h-[12px]" />}

      {nav !== "review" ? <SearchField
        value={query}
        onChange={setQuery}
        ariaLabel="搜索会话"
        placeholder="搜索会话"
      /> : null}

      {/* scrollable list */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-[8px] pb-[12px]">
        {/* Chat chooses its libraries above the input box only; the library list lives on 资料库 (节点审查 D3). */}
        {nav === "chat" && (
          <>
            <div className="flex gap-[6px] px-[8px] pt-[4px]">
              <button type="button" aria-label="全部会话" onClick={() => setSessionFilter("all")}
                className={`rounded-full px-[9px] py-[4px] text-caption ${sessionFilter === "all" ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)]"}`}>全部</button>
              <button type="button" aria-label="仅看置顶" onClick={() => setSessionFilter("pinned")}
                className={`rounded-full px-[9px] py-[4px] text-caption ${sessionFilter === "pinned" ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)]"}`}>置顶</button>
            </div>
            {unsaved && (
              <div>
                <GroupLabel className="pt-[2px]">今天</GroupLabel>
                <PanelRow
                  icon="chat"
                  title={activeTitle || "当前新会话"}
                  active
                  onClick={() => void switchSession(workspace.active)}
                />
              </div>
            )}
            {sessions.some((session) => session.data.pinned) ? (
              <div><GroupLabel className="pt-[2px]">置顶会话</GroupLabel>
                {sessions.filter((session) => session.data.pinned).map(sessionEntry)}
              </div>
            ) : null}
            {(["今天", "昨天", "更早"] as const).map((group) => {
              const items = sessions.filter((s) => !s.data.pinned && groupOf(sessionTime(s)) === group);
              if (!items.length) return null;
              return (
                <div key={group}>
                  <GroupLabel className={unsaved || group !== "今天" ? "" : "pt-[2px]"}>
                    {group}
                  </GroupLabel>
                  {items.map(sessionEntry)}
                </div>
              );
            })}
            {!unsaved && !sessions.length && (
              <p className="px-[10px] py-4 text-body text-[var(--stone)]">
                {q ? "没有匹配的会话。" : "还没有会话。"}
              </p>
            )}
            {sessionFilter === "all" && !!archived.length && (
              <details className="px-[8px] pt-[10px] text-caption">
                <summary className="cursor-pointer text-[var(--steel)]">
                  已归档会话 · {archived.length}
                </summary>
                {archived.map((session) => (
                  <div key={session.id} className="mt-2 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[var(--steel)]" title={session.title}>
                      {session.title}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[var(--link)] hover:underline"
                      onClick={() => void workspace.setArchived(session.id, false)}
                    >
                      恢复
                    </button>
                  </div>
                ))}
              </details>
            )}
          </>
        )}

        {nav === "review" ? <ReviewRunPanel /> : null}

        {nav === "tasks" && (
          <>
            <GroupLabel className="pt-[2px]">任务模版</GroupLabel>
            {tasksError ? (
              <p role="alert" className="px-[10px] py-2 text-caption text-[var(--red)]">
                {tasksError}
              </p>
            ) : null}
            {visibleTasks.map((task) => (
                  <PanelRow
                    key={task.id}
                    dot={task.id === taskId ? "var(--purple)" : "var(--stone)"}
                    title={task.name}
                    meta={task.id === taskId ? "当前" : undefined}
                    active={task.id === taskId}
                    onClick={() => showInspector({ kind: "task", taskId: task.id })}
                  />
                ))}
            {!tasks.length && !tasksError ? (
              <p className="px-[10px] py-3 text-body text-[var(--stone)]">正在读取任务…</p>
            ) : null}
            {!!tasks.length && !visibleTasks.length ? (
              <p className="px-[10px] py-3 text-body text-[var(--stone)]">没有匹配的任务。</p>
            ) : null}
            <div className="px-[8px] pt-[10px]">
              <Button
                variant="quiet"
                size="md"
                icon="plus"
                className="w-full justify-center"
                onClick={() => void switchSession()}
              >
                新的问答
              </Button>
            </div>
          </>
        )}


      </div>

      {/* footer */}
      <div className="flex flex-col gap-[9px] border-t border-[var(--hairline)] px-[12px] py-[10px]">
        {progress && progress.total > 0 ? (
          <div className="flex flex-col gap-[5px]">
            <div className="flex justify-between text-caption text-[var(--steel)]">
              <span>向量索引</span>
              <b className="font-code font-semibold text-[var(--slate)] tabular-nums">
                {progress.completed} / {progress.total}
              </b>
            </div>
            <div className="h-[4px] overflow-hidden rounded-[3px] bg-[var(--hairline)]">
              <i
                className="block h-full rounded-[3px] bg-[var(--primary)]"
                style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function SessionRow({
  id,
  title,
  active,
  pinned,
  taskName,
  disabled,
  onSelect,
  onRename,
  onArchive,
  onPin,
  onDelete,
}: {
  id: string;
  title: string;
  active: boolean;
  pinned: boolean;
  taskName?: string;
  disabled: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(title);
  const [confirming, setConfirming] = useState(false);

  if (editing === id) {
    return (
      <form
        className="flex items-center gap-[4px] px-[4px] py-[2px]"
        onSubmit={(e) => {
          e.preventDefault();
          onRename(draft);
          setEditing(null);
        }}
      >
        <input
          autoFocus
          aria-label="会话标题"
          className="font-app min-w-0 flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[6px] text-body text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="rounded-[6px] px-[6px] py-[5px] text-caption text-[var(--link)]">
          保存
        </button>
        <button type="button" className="px-[4px] text-caption text-[var(--steel)]" onClick={() => setEditing(null)}>
          取消
        </button>
      </form>
    );
  }

  return (
    <div className="group flex items-center gap-[4px]">
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`font-app flex min-w-0 flex-1 items-center gap-[9px] rounded-[6px] px-[8px] py-[8px] text-left transition-colors disabled:opacity-40 ${
          active ? "bg-[var(--surface-press)] font-medium text-[var(--ink)]" : "text-[var(--slate)] hover:bg-[var(--surface-sink)]"
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-body">{title || "未命名会话"}</span>
        {pinned ? <span className="shrink-0 text-caption text-[var(--primary)]">置顶</span> : null}
        {taskName && (
          <span className="shrink-0 rounded-[4px] bg-[var(--tint-lavender)] px-[5px] py-[1px] text-caption font-semibold text-[var(--purple)]">
            {taskName}
          </span>
        )}
      </button>
      <span className="hidden shrink-0 items-center gap-[2px] group-hover:flex">
        <button type="button" aria-label={pinned ? "取消置顶会话" : "置顶会话"}
          title={pinned ? "取消置顶" : "置顶"}
          className="rounded-[5px] px-[3px] py-[2px] text-caption text-[var(--steel)] hover:bg-[var(--surface)]"
          onClick={onPin}>{pinned ? "取消" : "置顶"}</button>
        <button
          type="button"
          aria-label="重命名会话"
          title="重命名"
          className="grid size-[22px] place-items-center rounded-[5px] text-[var(--steel)] hover:bg-[var(--surface)]"
          onClick={() => {
            setDraft(title);
            setEditing(id);
          }}
        >
          <Icon name="edit" size={12} />
        </button>
        {confirming ? (
          <>
            <button type="button" aria-label="确认删除会话"
              className="rounded-[5px] px-[4px] py-[2px] text-caption text-[var(--red)] hover:bg-[var(--surface)]"
              onClick={() => { setConfirming(false); onDelete(); }}>确认删除</button>
            <button type="button" aria-label="取消删除会话"
              className="rounded-[5px] px-[4px] py-[2px] text-caption text-[var(--steel)] hover:bg-[var(--surface)]"
              onClick={() => setConfirming(false)}>取消</button>
          </>
        ) : (
          <button type="button" aria-label="删除会话" title="删除会话"
            className="rounded-[5px] px-[3px] py-[2px] text-caption text-[var(--steel)] hover:bg-[var(--surface)]"
            onClick={() => setConfirming(true)}>删除</button>
        )}
        <button
          type="button"
          aria-label="归档会话"
          title="归档"
          className="grid size-[22px] place-items-center rounded-[5px] text-[var(--steel)] hover:bg-[var(--surface)]"
          onClick={onArchive}
        >
          <Icon name="archive" size={12} />
        </button>
      </span>
    </div>
  );
}
