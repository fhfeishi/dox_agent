import { Fragment, useEffect, useState } from "react";
import { useApp } from "../store";
import { fetchReports, type ReportSummary } from "../api";
import { BrandMark, Icon } from "./Icons";
import { Button, GroupLabel, PanelRow, SearchField } from "./ui";
import type { Saved, SessionData } from "../workspace";

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

function corpusDot(preparation: string, jobStatus?: string, missing = false): string {
  if (missing) return "var(--red)";
  if (jobStatus === "running") return "#e0a000";
  if (jobStatus === "error" || preparation === "error") return "var(--red)";
  if (preparation === "ready") return "var(--green)";
  return "#e0a000";
}

export function SidePanel() {
  const {
    nav,
    setNav,
    workspace,
    switchSession,
    sessionBusy,
    activeTitle,
    taskNames,
    tasks,
    tasksError,
    taskId,
    taskCapable,
    showInspector,
    corpora,
    corporaError,
    effectiveCorpusId,
    selectCorpus,
    openCorpus,
    setNewCorpusOpen,
    setDrawerOpen,
    sidebarCollapsed,
    toggleSidebar,
    progress,
    documents,
    model,
    llmText,
    llmTone,
  } = useApp();

  const [query, setQuery] = useState("");
  const [reports, setReports] = useState<ReportSummary[]>([]);

  useEffect(() => {
    if (nav !== "reports" || !workspace.active) {
      setReports([]);
      return;
    }
    let stopped = false;
    void fetchReports(workspace.active)
      .then((items) => { if (!stopped) setReports(items); })
      .catch(() => { if (!stopped) setReports([]); });
    return () => { stopped = true; };
  }, [nav, workspace.active]);

  // U9.1: the IconRail keeps the primary entries reachable while the panel is hidden.
  if (sidebarCollapsed) return null;

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
    (s) => !s.data.archived && !isLegacyBranch(s) && s.title.toLowerCase().includes(q),
  );
  const archived = allSessions.filter((s) => s.data.archived);
  const visibleKbs = corpora.filter((c) => c.name.toLowerCase().includes(q));
  const visibleTasks = tasks.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(q));

  const unsaved = !allSessions.some((s) => s.id === workspace.active) && !q;

  return (
    <aside className="flex w-[276px] shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--surface-soft)]">
      {/* header */}
      <div className="flex items-center gap-[8px] px-[14px] pt-[14px] pb-[10px]">
        <div className="flex min-w-0 flex-1 items-center gap-[9px]">
          <div className="grid size-[24px] shrink-0 place-items-center rounded-[6px] bg-[var(--navy)]">
            <BrandMark size={13} />
          </div>
          <span className="text-[15px] leading-none font-semibold tracking-[-0.3px] text-[var(--ink)]">
            DoxAgent
          </span>
          <span className="rounded-full bg-[var(--primary-soft)] px-[6px] py-[2px] text-[10px] font-semibold tracking-[0.2px] text-[var(--primary)]">
            LOCAL
          </span>
        </div>
        <button
          type="button"
          title="收起侧栏"
          aria-label="收起侧栏"
          onClick={toggleSidebar}
          className="grid size-[30px] place-items-center rounded-[6px] text-[var(--slate)] hover:bg-[var(--surface)]"
        >
          <Icon name="chevronLeft" size={16} />
        </button>
      </div>

      {/* primary action */}
      <div className="flex flex-col gap-[8px] px-[14px] pb-[12px]">
        <button
          type="button"
          aria-label="＋ 新的问答"
          disabled={!workspace.loaded || sessionBusy}
          onClick={() => void switchSession()}
          className="font-app flex w-full items-center justify-center gap-[7px] rounded-[8px] bg-[var(--primary)] px-[14px] py-[9px] text-[13.5px] font-medium text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:opacity-50"
        >
          <Icon name="plus" size={15} strokeWidth={2} />
          新建对话
        </button>
        <button
          type="button"
          onClick={() => setNav("library")}
          className="font-app flex w-full items-center justify-center gap-[7px] rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[14px] py-[8px] text-[12.5px] text-[var(--slate)] transition-colors hover:bg-[var(--surface)]"
        >
          <Icon name="library" size={14} strokeWidth={1.9} />
          知识库 · {documents.length} 份
        </button>
      </div>

      {nav !== "prompts" ? <SearchField
        value={query}
        onChange={setQuery}
        ariaLabel="搜索会话"
        placeholder={nav === "library" ? "搜索知识库" : nav === "tasks" ? "搜索任务" : "搜索会话"}
      /> : null}

      {/* scrollable list */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-[8px] pb-[12px]">
        {/* Corpus selection stays reachable from the chat view; the library view owns the full list. */}
        {nav !== "library" && nav !== "prompts" && visibleKbs.length ? (
          <>
            <GroupLabel className="pt-[2px]">知识库</GroupLabel>
            {visibleKbs.map((corpus) => (
              <PanelRow
                key={corpus.id}
                dot={corpusDot(corpus.preparation, corpus.job?.status, corpus.missing)}
                title={corpus.name}
                meta={`${corpus.docs_count}`}
                active={corpus.id === effectiveCorpusId}
                onClick={() => selectCorpus(corpus.id)}
              />
            ))}
          </>
        ) : null}

        {nav === "chat" && (
          <>
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
            {(["今天", "昨天", "更早"] as const).map((group) => {
              const items = sessions.filter((s) => groupOf(sessionTime(s)) === group);
              if (!items.length) return null;
              return (
                <div key={group}>
                  <GroupLabel className={unsaved || group !== "今天" ? "" : "pt-[2px]"}>
                    {group}
                  </GroupLabel>
                  {items.map((session) => (
                    <Fragment key={session.id}>
                      <SessionRow
                        id={session.id}
                        title={session.title}
                        active={session.id === workspace.active}
                        taskName={session.data.task_id ? taskNames[session.data.task_id] : undefined}
                        disabled={!workspace.loaded || sessionBusy}
                        onSelect={() => void switchSession(session.id)}
                        onRename={(title) => void workspace.rename(title, session.id)}
                        onArchive={() => void workspace.setArchived(session.id, true)}
                      />
                      {childrenOf(session.id).length ? (
                        <ul className="mb-[2px] ml-[14px] space-y-[1px] border-l border-[var(--hairline)] pl-[8px]">
                          {childrenOf(session.id).map((child) => (
                            <li key={child.id}>
                              <button
                                type="button"
                                disabled={!workspace.loaded || sessionBusy}
                                onClick={() => void switchSession(child.id)}
                                className="w-full truncate rounded-[6px] px-[8px] py-[6px] text-left text-[12px] text-[var(--steel)] transition-colors hover:bg-[#f1efec] disabled:opacity-40"
                              >
                                {child.title} <span className="text-[var(--stone)]">· 历史分支</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Fragment>
                  ))}
                </div>
              );
            })}
            {!unsaved && !sessions.length && (
              <p className="px-[10px] py-4 text-[12.5px] text-[var(--stone)]">
                {q ? "没有匹配的会话。" : "还没有会话。"}
              </p>
            )}
            {!!archived.length && (
              <details className="px-[8px] pt-[10px] text-[12px]">
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

        {nav === "tasks" && (
          <>
            <GroupLabel className="pt-[2px]">任务模板</GroupLabel>
            {!taskCapable ? (
              <p className="px-[10px] py-3 text-[12.5px] leading-[1.6] text-[var(--stone)]">
                任务功能未启用（需 <code className="font-code">VITE_UI_TASKS=1</code>）。
              </p>
            ) : null}
            {tasksError ? (
              <p role="alert" className="px-[10px] py-2 text-[12px] text-[var(--red)]">
                {tasksError}
              </p>
            ) : null}
            {taskCapable
              ? visibleTasks.map((task) => (
                  <PanelRow
                    key={task.id}
                    dot={task.id === taskId ? "var(--purple)" : "var(--stone)"}
                    title={task.name}
                    meta={task.id === taskId ? "当前" : undefined}
                    active={task.id === taskId}
                    onClick={() => showInspector({ kind: "task", taskId: task.id })}
                  />
                ))
              : null}
            {taskCapable && !tasks.length && !tasksError ? (
              <p className="px-[10px] py-3 text-[12.5px] text-[var(--stone)]">正在读取任务…</p>
            ) : null}
            {taskCapable && !!tasks.length && !visibleTasks.length ? (
              <p className="px-[10px] py-3 text-[12.5px] text-[var(--stone)]">没有匹配的任务。</p>
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

        {nav === "library" && (
          <>
            <GroupLabel className="pt-[2px]">全部知识库</GroupLabel>
            {corporaError && (
              <p role="alert" className="px-[10px] py-2 text-[12px] text-[var(--red)]">
                {corporaError}
              </p>
            )}
            {visibleKbs.map((corpus) => (
              <PanelRow
                key={corpus.id}
                dot={corpusDot(corpus.preparation, corpus.job?.status, corpus.missing)}
                title={corpus.name}
                meta={`${corpus.docs_count}`}
                active={corpus.id === effectiveCorpusId}
                onClick={() => showInspector({ kind: "corpus", corpusId: corpus.id })}
              />
            ))}
            {!visibleKbs.length && (
              <p className="px-[10px] py-3 text-[12.5px] text-[var(--stone)]">
                {q ? "没有匹配的知识库。" : "还没有知识库。"}
              </p>
            )}
            <div className="px-[8px] pt-[10px]">
              <Button
                variant="quiet"
                size="md"
                icon="plus"
                className="w-full justify-center"
                onClick={() => {
                  setNav("library");
                  setNewCorpusOpen(true);
                }}
              >
                新建知识库
              </Button>
            </div>
          </>
        )}

        {nav === "reports" && (
          <>
            <GroupLabel className="pt-[2px]">本会话报告</GroupLabel>
            {reports.length ? (
              reports.map((report) => (
                <button
                  key={report.report_id}
                  type="button"
                  onClick={() => showInspector({ kind: "report", reportId: report.report_id, sessionKey: workspace.active })}
                  className="mx-[8px] flex flex-col gap-[2px] rounded-[8px] px-[10px] py-[8px] text-left hover:bg-[#f1efec]"
                >
                  <span className="truncate text-[12.5px] text-[var(--slate)]">
                    {report.domain || "未命名报告"} · {report.corpus_id
                      ? (corpora.find((corpus) => corpus.id === report.corpus_id)?.name ?? report.corpus_id)
                      : "来源库未记录"} · {report.year_from != null && report.year_to != null
                      ? `填表日期 ${report.year_from}–${report.year_to}`
                      : "填表日期年份未记录"}
                  </span>
                  <span className="text-[11px] text-[var(--stone)]">
                    {report.template_id || "模板未记录"} · {report.created_at?.slice(0, 10) ?? ""}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-[10px] py-3 text-[12.5px] leading-[1.6] text-[var(--steel)]">
                本会话还没有生成报告。切换到「专项报告」补充需求后即可生成。
              </div>
            )}
            <div className="px-[8px] pt-[4px]">
              <Button
                variant="quiet"
                size="md"
                icon="chat"
                className="w-full justify-center"
                onClick={() => setNav("chat")}
              >
                返回对话
              </Button>
            </div>
          </>
        )}
        {nav === "prompts" ? (
          <div className="px-[10px] pt-[8px] text-[12px] leading-[1.6] text-[var(--steel)]">
            内置指令随任务发布；自定义 Prompt 与 Skill 管理将在后续阶段提供。
          </div>
        ) : null}
      </div>

      {/* footer */}
      <div className="flex flex-col gap-[9px] border-t border-[var(--hairline)] px-[12px] py-[10px]">
        {progress && progress.total > 0 ? (
          <div className="flex flex-col gap-[5px]">
            <div className="flex justify-between text-[11.5px] text-[var(--steel)]">
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
        <div className="flex justify-between text-[11.5px] text-[var(--steel)]">
          <span>当前知识库</span>
          <b className="min-w-0 truncate font-semibold text-[var(--slate)]">
            {corpora.find((c) => c.id === effectiveCorpusId)?.name ?? "未选择"}
          </b>
        </div>
        <div role="status" aria-live="polite" aria-label={`LLM ${model || "未知"}`}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title={`LLM：${model || "未知"} · ${llmText}`}
            className="font-app flex w-full items-center gap-[8px] rounded-[6px] px-[6px] py-[5px] text-left text-[12px] hover:bg-[#f1efec]"
          >
            <span className={`size-[8px] shrink-0 rounded-full ${llmTone}`} />
            <span className="min-w-0 flex-1 truncate text-[var(--charcoal)]">
              LLM: {model || "未知"}
            </span>
            <span className="shrink-0 text-[var(--stone)]">{llmText}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="font-app w-full rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--canvas)] p-[8px] text-[12.5px] text-[var(--slate)] transition-colors hover:bg-[var(--surface)]"
        >
          设置
        </button>
      </div>
    </aside>
  );
}

function SessionRow({
  id,
  title,
  active,
  taskName,
  disabled,
  onSelect,
  onRename,
  onArchive,
}: {
  id: string;
  title: string;
  active: boolean;
  taskName?: string;
  disabled: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(title);

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
          className="font-app min-w-0 flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[6px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="rounded-[6px] px-[6px] py-[5px] text-[11.5px] text-[var(--link)]">
          保存
        </button>
        <button type="button" className="px-[4px] text-[11.5px] text-[var(--steel)]" onClick={() => setEditing(null)}>
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
          active ? "bg-[#eae7e3] font-medium text-[var(--ink)]" : "text-[var(--slate)] hover:bg-[#f1efec]"
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-[13px]">{title || "未命名会话"}</span>
        {taskName && (
          <span className="shrink-0 rounded-[4px] bg-[var(--tint-lavender)] px-[5px] py-[1px] text-[10px] font-semibold text-[var(--purple)]">
            {taskName}
          </span>
        )}
      </button>
      <span className="hidden shrink-0 items-center gap-[2px] group-hover:flex">
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
