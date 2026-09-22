import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { CorpusPicker } from "./CorpusPicker";
import { ScopeSelector } from "./ScopeSelector";

function PopItem({
  title,
  description,
  tone,
  onClick,
  icon,
}: {
  title: string;
  description: string;
  tone?: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-app flex w-full items-start gap-[10px] rounded-[6px] px-[9px] py-[8px] text-left hover:bg-[var(--surface)]"
    >
      <span
        className="grid size-[26px] shrink-0 place-items-center rounded-[6px] bg-[var(--tint-lavender)] text-[var(--purple)]"
        style={tone ? { background: tone } : undefined}
      >
        {icon ?? <Icon name="tasks" size={14} strokeWidth={1.9} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] leading-[1.35] font-medium text-[var(--ink)]">{title}</span>
        <span className="mt-[1px] block text-[11.5px] leading-[1.4] text-[var(--stone)]">
          {description}
        </span>
      </span>
    </button>
  );
}

export function Composer() {
  const {
    input,
    setInput,
    send,
    stop,
    busy,
    ready,
    connected,
    workspace,
    editing,
    setEditing,
    confirmEdit,
    options,
    setOptions,
    documents,
    corpora,
    effectiveCorpusId,
    selectCorpus,
    tasks,
    tasksError,
    taskId,
    startTask,
    taskCapable,
    currentCorpus,
    showToast,
    status,
  } = useApp();

  const [popOpen, setPopOpen] = useState(false);
  const [corpusOpen, setCorpusOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const corpusRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  // One dismiss handler for every composer popover: click outside closes that popover,
  // Escape closes all of them.
  useEffect(() => {
    if (!popOpen && !corpusOpen && !scopeOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popOpen && !popRef.current?.contains(target)) setPopOpen(false);
      if (corpusOpen && !corpusRef.current?.contains(target)) setCorpusOpen(false);
      if (scopeOpen && !scopeRef.current?.contains(target)) setScopeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPopOpen(false);
      setCorpusOpen(false);
      setScopeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popOpen, corpusOpen, scopeOpen]);

  const task4 = taskCapable && taskId === "task4";
  const canSend =
    input.trim().length > 0 && !busy && ready && workspace.loaded && connected && !task4;
  const scoped = options.allowed_doc_ids?.length ?? 0;

  return (
    <div className="shrink-0 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)] to-transparent px-[32px] pb-[20px]">
      <div className="mx-auto w-full max-w-[820px]">
        {editing ? (
          <div className="mb-[8px] flex items-center gap-[8px] rounded-[8px] border border-[#d5cdf7] bg-[var(--primary-soft)] px-[10px] py-[7px] text-[12px] text-[var(--primary-pressed)]">
            <Icon name="edit" size={13} strokeWidth={1.9} />
            <span className="flex-1">
              正在编辑第 {editing.index + 1} 轮的提问 · 确认后将从这条消息重新生成回答
            </span>
            <button
              type="button"
              className="font-app rounded-[5px] px-[7px] py-[2px] text-[11.5px] font-medium hover:bg-[#ddd5f8]"
              onClick={() => setEditing(null)}
            >
              取消
            </button>
          </div>
        ) : null}

        {/* corpus + scope chips */}
        <div className="mb-[8px] flex flex-wrap items-center gap-[6px]">
          {currentCorpus ? (
            <span className="inline-flex max-w-[280px] items-center gap-[6px] rounded-full border border-[#d5cdf7] bg-[var(--primary-soft)] px-[9px] py-[4px] text-[12px] font-medium text-[var(--primary-pressed)]">
              <Icon name="library" size={12} strokeWidth={2} />
              <span className="truncate">{currentCorpus.name}</span>
              <span className="text-[var(--primary)]">{currentCorpus.docs_count}</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-[var(--stone)]">未选择知识库</span>
          )}
          <button
            type="button"
            onClick={() => setCorpusOpen((v) => !v)}
            className="font-app inline-flex items-center gap-[6px] rounded-full border border-[var(--hairline)] bg-[var(--canvas)] px-[9px] py-[4px] text-[12px] text-[var(--slate)] hover:border-[var(--hairline-strong)]"
          >
            <Icon name="plus" size={12} strokeWidth={2.2} />
            切换知识库
          </button>
        </div>

        {corpusOpen ? (
          <div ref={corpusRef} className="mb-[8px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[8px] shadow-[0_8px_24px_-12px_rgba(15,15,15,0.2)]">
            <CorpusPicker
              corpora={corpora}
              current={effectiveCorpusId ?? ""}
              onSelect={(id) => {
                selectCorpus(id);
                setCorpusOpen(false);
              }}
            />
          </div>
        ) : null}

        {scopeOpen ? (
          <div ref={scopeRef} className="mb-[8px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[12px] shadow-[0_8px_24px_-12px_rgba(15,15,15,0.2)]">
            <ScopeSelector
              documents={documents}
              selected={options.allowed_doc_ids}
              change={(ids) => setOptions((o) => ({ ...o, allowed_doc_ids: ids }))}
              disabled={busy || !connected}
            />
          </div>
        ) : null}

        {/* input */}
        <div className="rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--canvas)] shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-[border-color,box-shadow] focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--primary-soft)]">
          {task4 ? (
            <div role="status" className="p-[15px] text-[13px] text-[var(--steel)]">
              当前任务为“专项报告”：结构化报告通过统一报告入口生成，不在聊天中发送正文；报告接口就绪前这里保持占位提示（PROJECT §2）。
            </div>
          ) : (
            <textarea
              ref={taRef}
              rows={1}
              aria-label={editing ? "编辑历史问题" : "问题"}
              value={editing ? editing.text : input}
              disabled={!connected}
              maxLength={12000}
              onChange={(e) =>
                editing
                  ? setEditing((cur) => (cur ? { ...cur, text: e.target.value } : cur))
                  : setInput(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editing) void confirmEdit();
                  else if (canSend) void send();
                }
                if (e.key === "Escape" && editing) setEditing(null);
              }}
              placeholder={editing ? "修改后按 Enter 重新发送…" : "基于当前知识库提问，或点击 + 选择一项任务…"}
              className="font-app max-h-[180px] w-full resize-none border-0 bg-transparent px-[15px] pt-[13px] pb-[4px] text-[14px] leading-[1.6] text-[var(--ink)] outline-none placeholder:text-[var(--stone)] disabled:bg-white"
            />
          )}

          <div className="flex items-center gap-[6px] px-[9px] pt-[7px] pb-[9px]">
            <div ref={popRef} className="relative">
              <button
                type="button"
                title="任务 / 附件"
                aria-expanded={popOpen}
                onClick={() => setPopOpen((v) => !v)}
                className="grid size-[30px] place-items-center rounded-[6px] border border-[var(--hairline)] text-[var(--slate)] hover:bg-[var(--surface)]"
              >
                <Icon name="plus" size={16} strokeWidth={1.9} />
              </button>
              {popOpen ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-[60] w-[296px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[6px] shadow-[0_16px_48px_-8px_rgba(15,15,15,0.16)]">
                  <div className="px-[9px] pt-[8px] pb-[5px] text-[10.5px] font-semibold tracking-[0.6px] text-[var(--stone)] uppercase">
                    分析任务
                  </div>
                  {tasksError ? (
                    <p role="alert" className="px-[9px] py-[6px] text-[11.5px] text-[var(--red)]">
                      {tasksError}
                    </p>
                  ) : null}
                  {taskCapable && tasks.length ? (
                    tasks.map((task) => (
                      <PopItem
                        key={task.id}
                        title={task.name}
                        description={task.output_hint || task.description}
                        onClick={() => {
                          setPopOpen(false);
                          void startTask(task.id);
                        }}
                      />
                    ))
                  ) : (
                    <PopItem
                      title="新的问答"
                      description="直接提问，由服务端按固定专业流程作答"
                      icon={<Icon name="chat" size={14} strokeWidth={1.9} />}
                      onClick={() => {
                        setPopOpen(false);
                        void startTask("task1");
                      }}
                    />
                  )}
                  <span className="mx-[2px] my-[5px] block h-px bg-[var(--hairline-soft)]" />
                  <PopItem
                    title="导入文件"
                    description="PDF / Word / Markdown / TXT"
                    icon={<Icon name="upload" size={14} strokeWidth={1.9} />}
                    onClick={() => {
                      setPopOpen(false);
                      showToast("请在“设置与运维”中导入文件");
                    }}
                  />
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setScopeOpen((v) => !v)}
              className="font-app inline-flex h-[30px] items-center gap-[6px] rounded-[6px] px-[9px] text-[12.5px] text-[var(--slate)] transition-colors hover:bg-[var(--surface)]"
            >
              <Icon name="list" size={15} />
              资料范围：
              <b className="font-semibold text-[var(--primary)]">{scoped ? `${scoped} 份` : "全部"}</b>
            </button>

            <span className="flex-1" />

            <span
              className="font-app hidden h-[30px] items-center gap-[6px] rounded-[6px] px-[9px] text-[12.5px] text-[var(--stone)] sm:inline-flex"
              title="首期为服务端固定单一模型，暂不支持切换"
            >
              <Icon name="info" size={14} />
              {taskCapable ? tasks.find((t) => t.id === taskId)?.name ?? "任务" : "专业问答"}
            </span>

            {busy ? (
              <button
                type="button"
                title="停止"
                aria-label="停止"
                onClick={stop}
                className="grid size-[32px] place-items-center rounded-[8px] bg-[var(--charcoal)] text-white transition-colors hover:bg-[var(--ink)]"
              >
                <Icon name="close" size={15} strokeWidth={2.2} />
              </button>
            ) : editing ? (
              <button
                type="button"
                title="确认修改并重新询问"
                aria-label="确认修改并重新询问"
                disabled={!editing.text.trim()}
                onClick={() => void confirmEdit()}
                className="grid size-[32px] place-items-center rounded-[8px] bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:bg-[var(--hairline)] disabled:text-[var(--muted)]"
              >
                <Icon name="send" size={15} strokeWidth={2.1} />
              </button>
            ) : (
              <button
                type="button"
                title="发送 (Enter)"
                aria-label="发送 ↑"
                disabled={!canSend}
                onClick={() => void send()}
                className="grid size-[32px] place-items-center rounded-[8px] bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:bg-[var(--hairline)] disabled:text-[var(--muted)]"
              >
                <Icon name="send" size={15} strokeWidth={2.1} />
              </button>
            )}
          </div>
        </div>

        <p className="mt-[9px] text-center text-[11px] text-[var(--stone)]" role="status">
          {status ? `${status} · ` : ""}
          DoxAgent 会基于当前知识库作答并标注来源；重要结论建议核对原文
        </p>
      </div>
    </div>
  );
}
