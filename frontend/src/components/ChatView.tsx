import { Fragment, useEffect, useRef } from "react";
import { useApp } from "../store";
import { Composer } from "./Composer";
import { BranchNote, EmptyState, MessageView } from "./MessageView";
import { BrandMark, Icon } from "./Icons";
import { Button, ToolButton } from "./ui";

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
    <article className="group mb-[26px] flex justify-end gap-[12px]">
      <div className="max-w-[82%]">
        <div className="mb-[6px] flex items-center justify-end gap-[8px] text-[12.5px] font-semibold text-[var(--ink)]">
          <span className="text-[11.5px] font-normal text-[var(--stone)]">{time}</span>
          我
          {editing ? (
            <span className="rounded-[4px] bg-[var(--primary-soft)] px-[5px] py-[1px] text-[10px] font-semibold text-[var(--primary)]">
              编辑中
            </span>
          ) : null}
        </div>
        <div
          className={`rounded-[12px] border bg-[var(--surface)] px-[14px] py-[11px] text-[14px] whitespace-pre-wrap text-[var(--ink)] ${
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
            className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-[12px] text-[var(--slate)] hover:bg-[var(--surface)]"
          >
            <Icon name="copy" size={13} strokeWidth={1.9} />
            复制
          </button>
          <button
            type="button"
            onClick={onEdit}
            title={`编辑第 ${index + 1} 轮提问，将从这条消息重新生成回答`}
            className={`font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-[12px] ${
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
      <span className="font-app grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-[var(--tint-gray)] text-[10.5px] font-semibold text-[var(--slate)]">
        我
      </span>
    </article>
  );
}

export function ChatView() {
  const {
    turns,
    workspace,
    ready,
    connected,
    setConnected,
    error,
    editing,
    beginEdit,
    setEditing,
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
    currentCorpus,
    taskCapable,
    setInput,
    uiDocPanel,
    openExplorer,
    inspectorOpen,
    toggleInspector,
  } = useApp();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, error]);

  const visibleBranches = workspace.branches;

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--hairline)] pr-[14px] pl-[18px]">
        <span className="max-w-[32%] truncate text-[14px] font-semibold tracking-[-0.1px] text-[var(--ink)]">
          {activeTitle || "新对话"}
        </span>
        {activeTask && taskCapable ? (
          <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-[7px] py-[2px] text-[10.5px] font-semibold text-[var(--primary)]">
            {activeTask.name}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-[var(--tint-mint)] px-[7px] py-[2px] text-[10.5px] font-semibold text-[var(--green)]">
            专业问答
          </span>
        )}
        {currentCorpus ? (
          <span className="hidden shrink-0 items-center gap-[5px] text-[11.5px] text-[var(--stone)] md:inline-flex">
            <Icon name="library" size={12} strokeWidth={2} />
            库：{currentCorpus.name} · {currentCorpus.docs_count} 份
          </span>
        ) : null}

        <span className="flex-1" />

        {uiDocPanel ? (
          <ToolButton icon="book" label="本地文档" onClick={openExplorer} title="浏览本地文档原文" />
        ) : null}
        <ToolButton
          icon="panel"
          label="产出"
          active={inspectorOpen}
          onClick={toggleInspector}
          title="打开产出面板（引用与原文）"
        />
      </header>

      <section ref={scrollRef} aria-label="对话" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[820px] px-[32px] pt-[28px] pb-[8px]">
          {!connected ? (
            <section
              role="alert"
              className="mb-[18px] flex items-center justify-between gap-3 rounded-[12px] border border-[var(--tint-peach)] bg-[var(--tint-peach)]/40 px-[14px] py-[11px] text-[12.5px] text-[#8a3d00]"
            >
              <span>已断开连接；历史仍可查看，未完成的回答不会作为上下文。</span>
              <button
                type="button"
                onClick={() => setConnected(true)}
                className="font-app shrink-0 rounded-[6px] bg-[var(--primary)] px-[10px] py-[5px] text-[11.5px] font-medium text-white hover:bg-[var(--primary-pressed)]"
              >
                重新连接
              </button>
            </section>
          ) : null}

          {!turns.length ? (
            <EmptyState onPick={(question) => setInput(question)} />
          ) : null}

          {turns.map((turn, i) => {
            const branchesBefore = visibleBranches.filter((b) => b.fromIndex === i);
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
                <article className="mb-[26px] flex gap-[12px]">
                  <span className="grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-[var(--navy)]">
                    <BrandMark size={14} />
                  </span>
                  <div className="min-w-0 flex-1 pt-[2px]">
                    <div className="mb-[6px] text-[12.5px] font-semibold text-[var(--ink)]">
                      DoxAgent
                      <span className="ml-[8px] text-[11.5px] font-normal text-[var(--stone)]">
                        · {currentCorpus ? `检索「${currentCorpus.name}」` : "未选择知识库"}
                      </span>
                    </div>
                    <MessageView
                      attempt={turn}
                      startedTick={i === turns.length - 1 ? startedTick : undefined}
                      defaultOpen={i <= 1}
                      onRegenerate={
                        connected && ready ? () => void regenerateAt(i) : undefined
                      }
                      onDraft={() => setInput(turn.answer)}
                      onOpenSource={handleOpenSource}
                    />
                    {!!turn.previousAttempts.length ? (
                      <details className="mt-[16px] rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[14px] py-[11px]">
                        <summary className="cursor-pointer text-[12.5px] text-[var(--steel)]">
                          之前的回答 · {turn.previousAttempts.length} 个版本
                        </summary>
                        {turn.previousAttempts.map((attempt, version) => (
                          <div
                            key={version}
                            className="mt-[14px] border-t border-[var(--hairline-soft)] pt-[14px]"
                          >
                            <p className="mb-[10px] text-[11px] text-[var(--stone)]">
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
            <section aria-label="分支查看" className="mb-[26px] rounded-[12px] border border-[#d5cdf7] bg-[var(--canvas)] p-[18px]">
              <div className="mb-[14px] flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13.5px] font-semibold text-[var(--ink)]">
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
                  <div className="mb-[10px] ml-auto max-w-[85%] rounded-[12px] bg-[var(--surface)] px-[14px] py-[9px] text-[13px] whitespace-pre-wrap text-[var(--ink)]">
                    {turn.question}
                  </div>
                  <MessageView attempt={turn} compact />
                </div>
              ))}
            </section>
          ) : null}

          {error ? (
            <p role="alert" className="mt-[6px] rounded-[8px] bg-[var(--tint-rose)]/40 px-[12px] py-[8px] text-[12.5px] text-[#a02e6d]">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <Composer />
    </section>
  );
}
