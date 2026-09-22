import { useEffect, useMemo, useState, type ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { rehypeCitations } from "./citation";
import { formatDuration, type Attempt } from "./conversation";
import type { Source } from "./api";
import { stopLabels } from "./policy";

function Timing({ attempt, startedTick }: { attempt: Attempt; startedTick?: number }) {
  const [now, setNow] = useState(() => performance.now());
  const running = attempt.outcome === "running";
  useEffect(() => {
    if (!running) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [running, startedTick]);
  const elapsed = running && startedTick !== undefined ? Math.max(0, now - startedTick) : attempt.elapsedMs;
  const first = attempt.firstTokenMs === null
    ? running ? `等待中${elapsed === null ? "" : ` ${formatDuration(elapsed)}`}` : "未收到正文"
    : formatDuration(attempt.firstTokenMs);
  const usage = attempt.usage;
  const tokenText = usage?.complete && attempt.complete
    ? `${usage.total_tokens?.toLocaleString()}（输入 ${usage.input_tokens?.toLocaleString()} / 输出 ${usage.output_tokens?.toLocaleString()}）`
    : usage?.reported_tokens != null
      ? `已报告 ${usage.reported_tokens.toLocaleString()} · ${running ? "统计中" : "不完整"}`
      : running ? "统计中" : attempt.startedAt ? "供应商未返回或请求已中断" : "历史记录未采集";
  const missing = usage?.missing_reasons ? Object.entries(usage.missing_reasons).map(([reason, count]) => `${{
    waiting_for_provider: "等待供应商", provider_did_not_report: "供应商未返回", model_error: "模型调用失败",
  }[reason] ?? reason} ${count} 次`).join("；") : "";
  return <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-500" aria-label="回答耗时">
    <span title="从发送到收到第一段非空正文，包含检索、阅读、模型响应及网络等待；不是模型内部推理耗时。">首 token / Think 等待：{first}</span>
    {attempt.complete
      ? <span>总时间：{attempt.totalMs === null ? "未报告" : formatDuration(attempt.totalMs)}</span>
      : <span>{running ? "总时间" : "已耗时"}：{elapsed === null ? "未报告" : formatDuration(elapsed)} · {running ? "进行中" : attempt.outcome === "interrupted" ? "已中断（结果未确认）" : "失败（未完成）"}</span>}
    <span aria-label="本轮 Token 用量" title={`本轮所有模型调用的输入和输出合计。缺失数据不估算。${missing}`}>本轮 Token：{tokenText}</span>
  </div>;
}

function Process({ attempt }: { attempt: Attempt }) {
  const current = [...attempt.steps].reverse().find(step => step.status === "running") ?? attempt.steps.at(-1);
  const finalLabel = attempt.outcome === "completed" ? "处理完成" : attempt.outcome === "interrupted" ? "已中断，结果未确认" : attempt.outcome === "failed" ? "处理失败" : current?.label ?? "准备处理";
  const [open, setOpen] = useState(attempt.outcome === "running");
  return <details className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium text-stone-700">处理过程 · {finalLabel}</summary>
    <ol className="mt-3 space-y-2 text-xs text-stone-500">
      {attempt.steps.length ? attempt.steps.map(step => <li key={step.id} className="flex gap-3"><span className="w-12 shrink-0">step {step.sequence}</span><span><b className="font-medium text-stone-700">{step.label}</b>{step.detail ? ` · ${step.detail}` : ""} · {{running: "进行中", completed: "完成", failed: "失败", interrupted: "已中断"}[step.status]}</span></li>) : <li>旧回答没有记录详细步骤。</li>}
    </ol>
    {attempt.policy && <p className="mt-3 border-t border-stone-100 pt-2 text-xs text-stone-400" aria-label="生效策略">{{ research: "资料研究", clarify: "需要澄清" }[attempt.policy.route]} · {attempt.policy.allowed_doc_ids ? "限定资料" : "全部资料"} · {stopLabels[attempt.policy.stop_reason] ?? "处理已更新"}</p>}
  </details>;
}

export function Answer({ attempt, startedTick, onRegenerate, onOpenSource }: {
  attempt: Attempt; startedTick?: number; onRegenerate?: () => void; onOpenSource?: (source: Source, n: number) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => { setCopyState("idle"); }, [attempt.answer]);
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
  // U2.4: server-provided citation numbers with an index fallback; sources precede tokens so
  // citations are clickable during streaming. Never rewrites the Markdown source text.
  const sourceByNumber = useMemo(() => {
    const map = new Map<number, Source>();
    attempt.sources.forEach((source, index) => {
      const n = source.citation ?? index + 1;
      if (!map.has(n)) map.set(n, source);
    });
    return map;
  }, [attempt.sources]);
  const rehypePlugins: PluggableList | undefined = useMemo(() => onOpenSource
    ? [rehypeCitations({ sources: attempt.sources, onCite: (source, n) => onOpenSource(source, n) })]
    : undefined, [attempt.sources, onOpenSource]);
  const components = useMemo(() => onOpenSource ? {
    a: (props: ComponentProps<"a">) => {
      const match = typeof props.href === "string" ? /^#cite-(\d+)$/.exec(props.href) : null;
      const source = match ? sourceByNumber.get(Number(match[1])) : undefined;
      if (!match || !source) return <a {...props}/>;
      const n = Number(match[1]);
      return <button type="button" title={source.title}
        className="rounded px-0.5 font-medium text-teal-700 hover:bg-teal-100"
        onClick={() => onOpenSource(source, n)}>[{n}]</button>;
    },
  } : undefined, [onOpenSource, sourceByNumber]);
  return <>
    <Process attempt={attempt}/>
    <div className="markdown"><Markdown remarkPlugins={[remarkGfm]}>{attempt.answer || (attempt.outcome === "running" ? "正在回应…" : "未生成回答")}</Markdown></div>
    {attempt.telemetry && <details className="mt-3 text-xs text-stone-500"><summary>运行记录</summary><p>{{quick: "快速查证", quick_then_research: "快速查证后深入研究", research: "深入研究", direct: "直接交流"}[attempt.telemetry.path ?? ""] ?? "旧版本未记录路径"}</p><p>搜索 {attempt.telemetry.searches} 次 · 已读 {attempt.telemetry.reads} 段 · 用量已报告 {attempt.usage?.reported_calls ?? "未知"} / {attempt.usage?.calls ?? "未知"} 次模型调用</p>{attempt.usage?.calls_by_phase && <p>调用阶段：{Object.entries(attempt.usage.calls_by_phase).map(([phase, count]) => `${{understand: "理解", research: "研究", answer: "回答", direct: "直接回答"}[phase] ?? phase} ${count}`).join(" · ")}</p>}{Object.entries(attempt.telemetry.stages_ms).map(([stage, ms]) => <p key={stage}>{{understand: "理解问题", research: "查证", validate: "核验", answer: "组织回答", direct: "直接交流", finish: "完成"}[stage] ?? stage}：{formatDuration(ms)}</p>)}</details>}
    <Timing attempt={attempt} startedTick={startedTick}/>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
      <button type="button" disabled={!attempt.answer || attempt.outcome === "running"} onClick={() => void copy()} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-40">{copyState === "copied" ? "已复制" : "复制答案"}</button>
      {onRegenerate && <button type="button" title="沿用此版本生效配置" disabled={attempt.outcome === "running"} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-40" onClick={onRegenerate}>重新生成</button>}
      {copyState === "failed" && <span role="alert" className="text-red-700">复制失败，请手动选择答案复制。</span>}
      <span className="sr-only" role="status">{copyState === "copied" ? "答案已复制" : ""}</span>
    </div>
    {!!attempt.sources.length && <details className="mt-5 rounded-xl border border-stone-200 bg-white p-4"><summary className="cursor-pointer text-sm">已读证据 · {attempt.sources.length}</summary><div className="mt-3 flex flex-wrap gap-2">{attempt.sources.map((s, j) => { const n = s.citation ?? j + 1; return <a key={j} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs text-teal-800" href={s.url.startsWith('/api/documents/') ? s.url : undefined} target="_blank" rel="noreferrer">[{n}] {s.title}</a>; })}</div><div className="mt-4 grid gap-3">{attempt.sources.map((s, j) => { const n = s.citation ?? j + 1; return <div key={j} className="border-t border-stone-100 pt-3"><p className="text-xs font-medium">[{n}] {s.title} · 第{s.page ?? 1}页</p><p className="mt-1 text-xs text-stone-500">{s.snippet}</p><p className="text-xs text-stone-400">版本 {s.version} · 采集 {s.captured_at ?? "未记录"}{s.truncated ? " · 仅部分原文" : ""}</p></div>; })}</div></details>}
  </>;
}
