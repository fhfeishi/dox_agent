import { useEffect, useMemo, useState, type ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import type { Source, Step } from "../api";
import { rehypeCitations } from "../citation";
import { formatDuration, type Attempt } from "../conversation";
import { stopLabels } from "../policy";
import { Icon } from "./Icons";
import { Button } from "./ui";

const STEP_STATUS: Record<Step["status"], { label: string; cls: string }> = {
  running: { label: "进行中", cls: "bg-[var(--primary-soft)] text-[var(--primary)] ring-[#d5cdf7]" },
  completed: { label: "完成", cls: "bg-[var(--canvas)] text-[var(--slate)] ring-[var(--hairline)]" },
  failed: { label: "失败", cls: "bg-[var(--tint-rose)] text-[#a02e6d] ring-[#f6cfe0]" },
  interrupted: { label: "已中断", cls: "bg-[var(--tint-peach)] text-[#8a3d00] ring-[#f6d8bd]" },
};

function StepBadge({ sequence, status }: { sequence: number; status: Step["status"] }) {
  const tone = STEP_STATUS[status].cls;
  return (
    <span
      className={`font-code mt-[2px] inline-flex h-[17px] shrink-0 items-center rounded-[4px] px-[5px] text-[9.5px] font-semibold tracking-[0.3px] ring-1 ring-inset ${tone}`}
    >
      STEP {sequence}
    </span>
  );
}

function Trace({ attempt, live, defaultOpen }: { attempt: Attempt; live: boolean; defaultOpen: boolean }) {
  const current = [...attempt.steps].reverse().find((s) => s.status === "running") ?? attempt.steps.at(-1);
  const finalLabel =
    attempt.outcome === "completed"
      ? "处理完成"
      : attempt.outcome === "interrupted"
        ? "已中断，结果未确认"
        : attempt.outcome === "failed"
          ? "处理失败"
          : current?.label ?? "准备处理";
  const [open, setOpen] = useState(defaultOpen || live);
  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);

  return (
    <div className="mb-[16px] overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-app flex w-full items-center gap-[8px] px-[12px] py-[9px] text-left hover:bg-[var(--surface)]"
      >
        <Icon
          name="chevronRight"
          size={13}
          strokeWidth={2}
          className={`text-[var(--stone)] transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        <span className="text-[12.5px] font-semibold text-[var(--slate)]">分析过程</span>
        {live ? (
          <span className="relative flex size-[7px] shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--primary)] opacity-60" />
            <span className="relative inline-flex size-[7px] rounded-full bg-[var(--primary)]" />
          </span>
        ) : null}
        <span className="flex-1 text-[11.5px] text-[var(--stone)]">
          {live ? `思考中 · ${current?.label ?? "准备"}` : finalLabel}
        </span>
        {!live && attempt.policy ? (
          <span className="shrink-0 text-[11px] text-[var(--stone)]">
            {attempt.policy.allowed_doc_ids ? "限定资料" : "全部资料"}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="border-t border-[var(--hairline-soft)] px-[12px] pt-[6px] pb-[12px]">
          {attempt.steps.length ? (
            attempt.steps.map((step) => (
              <div key={step.id} className="flex gap-[10px] py-[7px]">
                <StepBadge sequence={step.sequence} status={step.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-[8px]">
                    <span className="text-[13px] leading-[1.45] text-[var(--charcoal)]">
                      {step.label}
                    </span>
                    <span className="font-code ml-auto shrink-0 text-[11px] text-[var(--stone)] tabular-nums">
                      {step.duration_ms != null
                        ? formatDuration(step.duration_ms)
                        : STEP_STATUS[step.status].label}
                    </span>
                  </div>
                  {step.detail ? (
                    <div className="mt-[2px] text-[11.5px] text-[var(--stone)]">{step.detail}</div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="py-[7px] text-[12px] text-[var(--stone)]">
              {attempt.outcome === "running" ? "正在准备分析步骤…" : "旧回答没有记录详细步骤。"}
            </p>
          )}
          {attempt.policy ? (
            <p className="mt-[6px] border-t border-[var(--hairline-soft)] pt-[8px] text-[11.5px] text-[var(--stone)]">
              {attempt.policy.route === "research" ? "资料研究" : "需要澄清"} ·{" "}
              {stopLabels[attempt.policy.stop_reason] ?? "处理已更新"}
              {attempt.policy.notice ? ` · ${attempt.policy.notice}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metrics({ attempt, startedTick }: { attempt: Attempt; startedTick?: number }) {
  const [now, setNow] = useState(() => performance.now());
  const running = attempt.outcome === "running";
  useEffect(() => {
    if (!running) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [running, startedTick]);
  const elapsed =
    running && startedTick !== undefined ? Math.max(0, now - startedTick) : attempt.elapsedMs;
  const first =
    attempt.firstTokenMs === null
      ? running
        ? `等待中${elapsed === null ? "" : ` ${formatDuration(elapsed)}`}`
        : "未收到正文"
      : formatDuration(attempt.firstTokenMs);
  const usage = attempt.usage;
  const tokenText =
    usage?.complete && attempt.complete
      ? `${(usage.total_tokens ?? 0).toLocaleString()}（输入 ${(usage.input_tokens ?? 0).toLocaleString()} / 输出 ${(usage.output_tokens ?? 0).toLocaleString()}）`
      : usage?.reported_tokens != null
        ? `${usage.reported_tokens.toLocaleString()} · ${running ? "统计中" : "不完整"}`
        : running
          ? "统计中"
          : attempt.startedAt
            ? "未返回"
            : "—";
  // 思考 ≈ 总耗时 − 首 token（首 token 之后到收束的生成阶段）。仅当两者都有时显示。
  const thinking =
    attempt.complete && attempt.totalMs != null && attempt.firstTokenMs != null
      ? attempt.totalMs - attempt.firstTokenMs
      : null;

  return (
    <div className="mt-[10px] flex flex-wrap gap-x-[14px] gap-y-[4px] text-[11px] text-[var(--stone)]" aria-label="回答耗时">
      <span>
        首 token / Think 等待：<b className="font-code font-medium text-[var(--slate)] tabular-nums">{first}</b>
      </span>
      {thinking !== null ? (
        <span>
          思考{" "}
          <b className="font-code font-medium text-[var(--slate)] tabular-nums">
            {formatDuration(thinking)}
          </b>
        </span>
      ) : null}
      <span>
        {attempt.complete ? "总耗时" : running ? "已耗时" : "耗时"}{" "}
        <b className="font-code font-medium text-[var(--slate)] tabular-nums">
          {attempt.complete
            ? attempt.totalMs === null
              ? "未报告"
              : formatDuration(attempt.totalMs)
            : elapsed === null
              ? "未报告"
              : formatDuration(elapsed)}
        </b>
        {!attempt.complete ? (
          <span className="ml-[4px]">
            {running
              ? "进行中"
              : attempt.outcome === "interrupted"
                ? "已中断（结果未确认）"
                : "失败（未完成）"}
          </span>
        ) : null}
      </span>
      <span>
        本轮 Token{" "}
        <b className="font-code font-medium text-[var(--slate)] tabular-nums">{tokenText}</b>
      </span>
    </div>
  );
}

function Sources({ attempt, onOpenSource }: { attempt: Attempt; onOpenSource?: (s: Source, n: number) => void }) {
  if (!attempt.sources.length) return null;
  return (
    <div className="mt-[14px]">
      <div className="mb-[8px] flex items-center gap-[7px] text-[11.5px] font-semibold tracking-[0.4px] text-[var(--stone)] uppercase">
        <Icon name="library" size={12} strokeWidth={2} />
        引用来源 {attempt.sources.length} 处
      </div>
      <div className="flex flex-wrap gap-[7px]">
        {attempt.sources.map((s, j) => {
          const n = s.citation ?? j + 1;
          const label = `${s.title}${s.page ? ` · 第${s.page}页` : ""}`;
          return onOpenSource ? (
            <button
              key={j}
              type="button"
              onClick={() => onOpenSource(s, n)}
              title={s.snippet}
              className="font-app flex max-w-[320px] items-center gap-[7px] rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] px-[9px] py-[6px] text-left transition-colors hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-soft)]"
            >
              <span className="grid size-[15px] shrink-0 place-items-center rounded-[4px] bg-[var(--primary)] text-[10px] font-bold text-white">
                {n}
              </span>
              <span className="truncate text-[12px] text-[var(--charcoal)]">{label}</span>
            </button>
          ) : (
            <span
              key={j}
              className="flex max-w-[320px] items-center gap-[7px] rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] px-[9px] py-[6px]"
            >
              <span className="grid size-[15px] shrink-0 place-items-center rounded-[4px] bg-[var(--slate)] text-[10px] font-bold text-white">
                {n}
              </span>
              <span className="truncate text-[12px] text-[var(--charcoal)]">{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Telemetry({ attempt }: { attempt: Attempt }) {
  const t = attempt.telemetry;
  if (!t) return null;
  return (
    <details className="mt-[12px] text-[11.5px] text-[var(--stone)]">
      <summary className="cursor-pointer">运行记录</summary>
      <div className="mt-[6px] space-y-[2px]">
        <p>
          {{
            quick: "快速查证",
            quick_then_research: "快速查证后深入研究",
            research: "深入研究",
            direct: "直接交流",
          }[t.path ?? ""] ?? "旧版本未记录路径"}
        </p>
        <p>
          搜索 {t.searches} 次 · 已读 {t.reads} 段 · 已报告 {attempt.usage?.reported_calls ?? "?"} /{" "}
          {attempt.usage?.calls ?? "?"} 次模型调用
        </p>
        {Object.entries(t.stages_ms).map(([stage, ms]) => (
          <p key={stage}>
            {{
              understand: "理解问题",
              research: "查证",
              validate: "核验",
              answer: "组织回答",
              direct: "直接交流",
              finish: "完成",
            }[stage] ?? stage}
            ：{formatDuration(ms)}
          </p>
        ))}
      </div>
    </details>
  );
}

export function MessageView({
  attempt,
  startedTick,
  onRegenerate,
  onOpenSource,
  onDraft,
  defaultOpen = false,
  compact = false,
}: {
  attempt: Attempt;
  startedTick?: number;
  onRegenerate?: () => void;
  onOpenSource?: (source: Source, n: number) => void;
  onDraft?: () => void;
  defaultOpen?: boolean;
  compact?: boolean;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    setCopyState("idle");
  }, [attempt.answer]);
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 3000);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(attempt.answer);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const sourceByNumber = useMemo(() => {
    const map = new Map<number, Source>();
    attempt.sources.forEach((source, index) => {
      const n = source.citation ?? index + 1;
      if (!map.has(n)) map.set(n, source);
    });
    return map;
  }, [attempt.sources]);

  const rehypePlugins: PluggableList | undefined = useMemo(
    () =>
      onOpenSource
        ? [rehypeCitations({ sources: attempt.sources, onCite: (source, n) => onOpenSource(source, n) })]
        : undefined,
    [attempt.sources, onOpenSource],
  );

  const components = useMemo(
    () =>
      onOpenSource
        ? {
            a: (props: ComponentProps<"a">) => {
              const match = typeof props.href === "string" ? /^#cite-(\d+)$/.exec(props.href) : null;
              const source = match ? sourceByNumber.get(Number(match[1])) : undefined;
              if (!match || !source) return <a {...props} />;
              const n = Number(match[1]);
              return (
                <button
                  type="button"
                  title={source.title}
                  aria-label={`[${n}]`}
                  className="font-app mx-[2px] inline-block h-[16px] rounded-[4px] bg-[var(--primary-soft)] px-[4px] align-[1px] text-[10.5px] leading-[16px] font-semibold text-[var(--primary)] hover:bg-[#e3defa]"
                  onClick={() => onOpenSource(source, n)}
                >
                  {n}
                </button>
              );
            },
          }
        : undefined,
    [onOpenSource, sourceByNumber],
  );

  const running = attempt.outcome === "running";

  return (
    <>
      {!compact ? <Trace attempt={attempt} live={running} defaultOpen={defaultOpen} /> : null}
      {attempt.answer ? (
        <div className="markdown">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={components}>
            {attempt.answer}
          </Markdown>
        </div>
      ) : (
        <p className="text-[14.2px] leading-[1.72] text-[var(--charcoal)]">
          {running ? "正在检索并组织答案" : "未生成回答"}
          {running ? (
            <span className="animate-caret ml-[2px] inline-block h-[15px] w-[7px] translate-y-[2px] rounded-[1px] bg-[var(--primary)]" />
          ) : null}
        </p>
      )}

      {!compact ? <Sources attempt={attempt} onOpenSource={onOpenSource} /> : null}
      {!compact ? <Telemetry attempt={attempt} /> : null}
      {!compact ? <Metrics attempt={attempt} startedTick={startedTick} /> : null}

      {!compact ? (
        <div className="mt-[10px] flex flex-wrap items-center gap-[2px]">
          <button
            type="button"
            disabled={!attempt.answer || running}
            onClick={() => void copy()}
            className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-[12px] text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            <Icon name="copy" size={13} strokeWidth={1.9} />
            {copyState === "copied" ? "已复制" : "复制答案"}
          </button>
          {onRegenerate ? (
            <button
              type="button"
              disabled={running}
              onClick={onRegenerate}
              title="沿用此版本生效配置重新生成"
              className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-[12px] text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
            >
              <Icon name="refresh" size={13} strokeWidth={1.9} />
              重新生成
            </button>
          ) : null}
          {onDraft ? (
            <button
              type="button"
              disabled={!attempt.answer || running}
              onClick={onDraft}
              title="把这条回答载入输入框，改完作为新提问发送"
              className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-[12px] text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
            >
              <Icon name="edit" size={13} strokeWidth={1.9} />
              改后重发
            </button>
          ) : null}
          {copyState === "failed" ? (
            <span role="alert" className="text-[12px] text-[var(--red)]">
              复制失败，请手动选择答案复制。
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function BranchNote({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className="mb-[16px] flex justify-center">
      <button
        type="button"
        onClick={onOpen}
        className="font-app inline-flex items-center gap-[5px] rounded-full border border-[var(--primary-soft)] bg-[var(--primary-soft-2)] px-[11px] py-[4px] text-[11.5px] text-[var(--primary-pressed)] hover:bg-[var(--primary-soft)]"
      >
        <Icon name="history" size={12} strokeWidth={2} />
        {label}
      </button>
    </div>
  );
}

export function EmptyState({ onPick }: { onPick: (question: string) => void }) {
  const examples: [string, string][] = [
    ["精准问答", "请基于资料说明一个关键结论，并逐条给出出处。"],
    ["对比分析", "请对比资料中相近方案的主要差异与适用条件。"],
    ["趋势讨论", "基于现有资料，推测该领域可能的发展方向，并区分事实与推断。"],
  ];
  return (
    <div className="py-[56px]">
      <p className="text-[12.5px] font-semibold tracking-[0.3px] text-[var(--primary)]">
        你的知识，有据可循
      </p>
      <h1 className="mt-[14px] text-[30px] leading-[1.2] font-semibold tracking-[-0.6px] text-[var(--ink)]">
        从一个好问题开始。
      </h1>
      <p className="mt-[14px] max-w-[560px] text-[14px] leading-[1.7] text-[var(--steel)]">
        自然交流，需要时查阅知识库资料并逐条标注来源。选择一个任务模板，或直接输入你的问题。
      </p>
      <p className="mt-[28px] text-[11px] font-semibold tracking-[0.5px] text-[var(--stone)] uppercase">
        试试这些任务
      </p>
      <div className="mt-[10px] flex flex-wrap gap-[8px]">
        {examples.map(([label, question]) => (
          <Button key={label} variant="outline" onClick={() => onPick(question)}>
            {label}
            <Icon name="chevronRight" size={12} strokeWidth={2.2} />
          </Button>
        ))}
      </div>
    </div>
  );
}
