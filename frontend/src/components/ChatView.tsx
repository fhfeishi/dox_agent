import { Fragment, useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth";
import { CoachMarks, taskGuide } from "./CoachMarks";
import { Composer } from "./Composer";
import { DEFAULTS } from "./QuickAsk";
import { BranchNote, EmptyState, MessageView } from "./MessageView";
import { BrandMark, Icon } from "./Icons";
import { Button, ToolButton } from "./ui";
import { downloadSessionMarkdown } from "../sessionExport";
import { downloadTurn } from "../turnExport";
import { useLayout } from "../layout";

function UserRow({
  index,
  question,
  time,
  editing,
  onCopy,
  onEdit,
}: {
  index: number;
  question: string;
  time: string;
  editing: boolean;
  onCopy: () => void;
  onEdit: () => void;
}) {
  return (
    <article className="chat-question group mb-[28px] flex justify-end gap-[12px]">
      <div className="min-w-0 max-w-[88%]">
        <div className="mb-[6px] flex items-center justify-end gap-[8px] text-body font-semibold text-[var(--ink)]">
          <span className="text-caption font-normal text-[var(--stone)]">{time}</span>
          我
          {editing ? (
            <span className="rounded-[4px] bg-[var(--primary-soft)] px-[5px] py-[1px] text-caption font-semibold text-[var(--primary)]">
              编辑中
            </span>
          ) : null}
        </div>
        <div
          className={`question-text rounded-[12px] border bg-[var(--primary-soft-2)] px-[18px] py-[14px] text-emphasis leading-[1.75] whitespace-pre-wrap break-words text-[var(--ink)] ${
            editing
              ? "border-[var(--primary)] ring-3 ring-[var(--primary-soft)]"
              : "border-[var(--hairline-soft)]"
          }`}
        >
          {question}
        </div>
        <div
          className={`mt-[4px] flex justify-end gap-[2px] transition-opacity duration-150 ${
            editing ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={onCopy}
            className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption text-[var(--slate)] hover:bg-[var(--surface)]"
          >
            <Icon name="copy" size={13} strokeWidth={1.9} />
            复制
          </button>
          <button
            type="button"
            onClick={onEdit}
            title={`编辑第 ${index + 1} 轮提问，将从这条消息重新生成回答`}
            className={`font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption ${
              editing
                ? "bg-[var(--primary-soft)] font-medium text-[var(--primary-pressed)]"
                : "text-[var(--slate)] hover:bg-[var(--surface)]"
            }`}
          >
            <Icon name="edit" size={13} strokeWidth={1.9} />
            编辑并重问
          </button>
        </div>
      </div>
      <span className="font-app grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-[var(--tint-gray)] text-caption font-semibold text-[var(--slate)]">
        我
      </span>
    </article>
  );
}

const GUIDE_OFF = "dox-task-guide-off:";
function guideMuted(task: string) {
  try { return localStorage.getItem(GUIDE_OFF + task) === "1"; } catch { return false; }
}
function muteGuide(task: string) {
  try { localStorage.setItem(GUIDE_OFF + task, "1"); } catch { /* the guide simply shows again */ }
}

export function ChatView() {
  const {
    turns,
    workspace,
    busy,
    ready,
    connected,
    setConnected,
    error,
    editing,
    beginEdit,
    viewingBranch,
    setViewingBranch,
    restoreSelectedBranch,
    copyQuestion,
    handleOpenSource,
    regenerateAt,
    startedTick,
    sessionBusy,
    activeTitle,
    activeTask,
    tasks,
    startTask,
    corpusIds,
    corpora,
    setInput,
    setTurnReport,
    saveAnswerArtifact,
    exportChat,
  } = useApp();
  const {
    inspectorOpen,
    toggleInspector,
    showToast,
  } = useLayout();

  const scrollRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  // 存量分析 ▾ and 任务模版 open a task here (/chat?task=task2, query 2026-1020 1719): a new session with
  // that task and its 点选提问 presets, then its walkthrough. An empty session of the same task is
  // reused, and the parameter is dropped so a reload does not open yet another session.
  const [search, setSearch] = useSearchParams();
  const wanted = search.get("task");
  const [guideTask, setGuideTask] = useState<string | null>(null);
  const [guideTarget, setGuideTarget] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!wanted || !workspace.loaded || !tasks.length) return;
    setSearch((old) => { const next = new URLSearchParams(old); next.delete("task"); return next; }, { replace: true });
    if (!tasks.some((item) => item.id === wanted)) return;
    const reuse = activeTask?.id === wanted && !turns.length;
    // An untouched session left behind (no question asked) would only add another “新会话” to the list.
    const previous = workspace.sessions.find((item) => item.id === workspace.active);
    const untouched = previous && !previous.data.turns?.length && !turns.length ? previous.id : null;
    void (reuse ? Promise.resolve() : startTask(wanted)).then(async () => {
      // Only once the task's own session is the active one (startTask can refuse, e.g. an archived task).
      let now: string | null = null;
      try { now = localStorage.getItem("dox-agent-session"); } catch { /* keep the old session */ }
      if (!reuse && untouched && now && now !== untouched) await workspace.remove(untouched).catch(() => undefined);
      if (!guideMuted(wanted)) setGuideTask(wanted);
    });
  }, [wanted, workspace.loaded, tasks.length]);
  const guided = guideTask ? tasks.find((item) => item.id === guideTask) : undefined;
  // Only the four built-in tasks have a walkthrough; a custom task opens without one.
  const guideSteps = guided ? taskGuide(guided, DEFAULTS[guided.id]?.elements) : [];
  const [mute, setMute] = useState(false);
  const { guidesSeen, seeGuide } = useAuth();  // the walkthrough covers the area's three-step card

  // Follow a streaming answer only while the reader is at the bottom (query 2026-1020 1719: the
  // page used to jump back down on every token, so nothing above could be read until it finished).
  const following = useRef(true);
  const [behind, setBehind] = useState(false);
  const turnCount = turns.length;
  function atBottom(el: HTMLElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    following.current = atBottom(el);
    setBehind(!following.current);
  }
  function toLatest() {
    const el = scrollRef.current;
    if (!el) return;
    following.current = true;
    setBehind(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }
  useEffect(() => {
    following.current = true;  // a new question (or another session) follows its answer again
    setBehind(false);
  }, [turnCount, workspace.active]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [turns, error]);

  const visibleBranches = workspace.branches;

  return (
    <section className="chat-workspace flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--hairline)] pr-[14px] pl-[18px]">
        <span className="max-w-[32%] truncate text-body font-semibold tracking-[-0.1px] text-[var(--ink)]">
          {activeTitle || "新对话"}
        </span>
        {activeTask ? (
          <span data-guide="chat-task" className="shrink-0 rounded-full bg-[var(--primary-soft)] px-[7px] py-[2px] text-caption font-semibold text-[var(--primary)]">
            {activeTask.name}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-[var(--tint-mint)] px-[7px] py-[2px] text-caption font-semibold text-[var(--green)]">
            专业问答
          </span>
        )}
        {corpusIds.length ? (
          <span className="hidden shrink-0 items-center gap-[5px] text-caption text-[var(--stone)] md:inline-flex">
            <Icon name="library" size={12} strokeWidth={2} />
            对话库：{corpusIds.map(id => corpora.find(c => c.id === id)?.name ?? id).join("、")}
          </span>
        ) : null}

        <span className="flex-1" />

        <div ref={exportRef} className="relative">
          <ToolButton
            icon="download"
            label="导出"
            active={exportOpen}
            onClick={() => setExportOpen((v) => !v)}
            title="导出当前会话"
          />
          {exportOpen ? (
            <div className="absolute top-[calc(100%+6px)] right-0 z-[60] w-[230px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[6px] shadow-[0_16px_48px_-8px_rgba(15,15,15,0.16)]">
              <button
                type="button"
                aria-label="导出会话为 Markdown"
                disabled={!turns.some((turn) => turn.outcome === "completed" && turn.answer)}
                onClick={() => {
                  setExportOpen(false);
                  downloadSessionMarkdown(
                    { title: activeTitle, corpusName: corpusIds.map(id => corpora.find(c => c.id === id)?.name ?? id).join("、"), taskName: activeTask?.name },
                    turns,
                  );
                  showToast("已导出会话 Markdown");
                }}
                className="font-app block w-full rounded-[6px] px-[9px] py-[8px] text-left text-body text-[var(--charcoal)] hover:bg-[var(--surface)] disabled:opacity-40"
              >
                导出会话为 Markdown
              </button>
              <button
                type="button"
                aria-label="导出诊断 JSON"
                onClick={() => {
                  setExportOpen(false);
                  exportChat();
                }}
                className="font-app block w-full rounded-[6px] px-[9px] py-[8px] text-left text-body text-[var(--charcoal)] hover:bg-[var(--surface)]"
              >
                导出诊断 JSON
              </button>
            </div>
          ) : null}
        </div>
        <ToolButton
          icon="panel"
          label="本轮回答"
          active={inspectorOpen}
          onClick={toggleInspector}
          title="本轮回答的引用、资料与会话"
        />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <section ref={scrollRef} onScroll={onScroll} aria-label="对话" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="chat-reading mx-auto w-full max-w-[1008px] px-[24px] pt-[28px] pb-[8px]">
          {!connected ? (
            <section
              role="alert"
              className="mb-[18px] flex items-center justify-between gap-3 rounded-[12px] border border-[var(--tint-peach)] bg-[var(--tint-peach)]/40 px-[14px] py-[11px] text-body text-[var(--orange-fg)]"
            >
              <span>已断开连接；历史仍可查看，未完成的回答不会作为上下文。</span>
              <button
                type="button"
                onClick={() => setConnected(true)}
                className="font-app shrink-0 rounded-[6px] bg-[var(--primary)] px-[10px] py-[5px] text-caption font-medium text-white hover:bg-[var(--primary-pressed)]"
              >
                重新连接
              </button>
            </section>
          ) : null}

          {!turns.length ? (
            <EmptyState task={activeTask} onPick={(question) => setInput(question)} />
          ) : null}

          {turns.map((turn, i) => {
            const branchesBefore = visibleBranches.filter((b) => b.fromIndex === i);
            const turnCorpusIds = turn.runInfo?.effective_corpus_ids ?? turn.options.corpus_ids ??
              (turn.options.corpus_id ? [turn.options.corpus_id] : []);
            const turnCorpusName = turnCorpusIds.map((id) => corpora.find((corpus) => corpus.id === id)?.name ?? id).join("、");
            return (
              <Fragment key={`${turn.runId}-${i}`}>
                {branchesBefore.map((b) => (
                  <BranchNote
                    key={b.id}
                    label={`${b.label} · 从第 ${b.fromIndex + 1} 轮起`}
                    onOpen={() => setViewingBranch(b)}
                  />
                ))}
                <UserRow
                  index={i}
                  question={turn.question}
                  time={
                    turn.startedAt
                      ? new Date(turn.startedAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : ""
                  }
                  editing={editing?.index === i}
                  onCopy={() => void copyQuestion(turn.question)}
                  onEdit={() => void beginEdit(i)}
                />
                <article className="chat-answer mb-[40px] flex gap-[14px]">
                  <span className="grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-[var(--navy)]">
                    <BrandMark size={14} />
                  </span>
                  <div className="min-w-0 flex-1 pt-[2px]">
                    <div className="mb-[6px] text-body font-semibold text-[var(--ink)]">
                      DoxAgent
                      <span className="ml-[8px] text-caption font-normal text-[var(--stone)]">
                        · {turnCorpusName ? `检索「${turnCorpusName}」` : "检索范围未记录"}
                      </span>
                    </div>
                    <MessageView
                      attempt={turn}
                      startedTick={i === turns.length - 1 ? startedTick : undefined}
                      onRegenerate={
                        connected && ready ? () => void regenerateAt(i) : undefined
                      }
                      onReport={(report) => setTurnReport(i, report)}
                      onSaveArtifact={turn.outcome === "completed" ? () => void saveAnswerArtifact(turn.runId, turn.answer) : undefined}
                      onDraft={() => setInput(turn.answer)}
                      onExport={(format) =>
                        void downloadTurn(
                          {
                            question: turn.question,
                            corpusName: turnCorpusName || undefined,
                            taskName: activeTask?.name,
                          },
                          turn,
                          format,
                        )
                      }
                      onOpenSource={handleOpenSource}
                    />
                    {!!turn.previousAttempts.length ? (
                      <details className="mt-[16px] rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[14px] py-[11px]">
                        <summary className="cursor-pointer text-body text-[var(--steel)]">
                          之前的回答 · {turn.previousAttempts.length} 个版本
                        </summary>
                        {turn.previousAttempts.map((attempt, version) => (
                          <div
                            key={version}
                            className="mt-[14px] border-t border-[var(--hairline-soft)] pt-[14px]"
                          >
                            <p className="mb-[10px] text-caption text-[var(--stone)]">
                              版本 {version + 1}
                            </p>
                            <MessageView attempt={attempt} onOpenSource={handleOpenSource} />
                          </div>
                        ))}
                      </details>
                    ) : null}
                  </div>
                </article>
              </Fragment>
            );
          })}

          {visibleBranches
            .filter((b) => b.fromIndex >= turns.length)
            .map((b) => (
              <BranchNote
                key={b.id}
                label={`${b.label} · 从第 ${b.fromIndex + 1} 轮起`}
                onOpen={() => setViewingBranch(b)}
              />
            ))}

          {viewingBranch ? (
            <section aria-label="分支查看" className="mb-[26px] rounded-[12px] border border-[var(--lav-line)] bg-[var(--canvas)] p-[18px]">
              <div className="mb-[14px] flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-body font-semibold text-[var(--ink)]">
                  {viewingBranch.label} · 从第 {viewingBranch.fromIndex + 1} 轮起
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={sessionBusy}
                    onClick={() => void restoreSelectedBranch()}
                  >
                    设为主时间线
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setViewingBranch(null)}>
                    关闭
                  </Button>
                </div>
              </div>
              {viewingBranch.turns.map((turn, i) => (
                <div key={`${turn.runId}-${i}`} className="mb-[20px]">
                  <div className="mb-[10px] ml-auto max-w-[85%] rounded-[12px] bg-[var(--surface)] px-[14px] py-[9px] text-body whitespace-pre-wrap text-[var(--ink)]">
                    {turn.question}
                  </div>
                  <MessageView attempt={turn} compact />
                </div>
              ))}
            </section>
          ) : null}

          {error ? (
            <p role="alert" className="mt-[6px] rounded-[8px] bg-[var(--tint-rose)]/40 px-[12px] py-[8px] text-body text-[var(--rose-fg)]">
              {error}
            </p>
          ) : null}
        </div>
      </section>
      {behind ? (
        <button type="button" onClick={toLatest}
          className="absolute bottom-[14px] left-1/2 -translate-x-1/2 rounded-full border border-[var(--hairline)] bg-[var(--canvas)] px-[14px] py-[6px] text-caption text-[var(--slate)] shadow-md hover:bg-[var(--surface)]">
          {busy ? "回答仍在生成 · 回到最新 ↓" : "回到最新 ↓"}
        </button>
      ) : null}
      </div>

      <Composer guideTarget={guided ? guideTarget : undefined} />
      {guided && guideSteps.length ? (
        <CoachMarks label={`${guided.name}使用指引`} steps={guideSteps} onStepChange={setGuideTarget}
          onClose={() => { if (mute) muteGuide(guided.id); setGuideTask(null); setMute(false); if (!guidesSeen.includes("chat")) seeGuide("chat"); }}
          footer={<label className="flex items-center gap-[6px]"><input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} />以后进入“{guided.name}”时不再自动显示</label>} />
      ) : null}
    </section>
  );
}
