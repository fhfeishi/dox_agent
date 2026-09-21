import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDuration, type Attempt } from "./conversation";
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
  return <details className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3" open={attempt.outcome === "running"}>
    <summary className="cursor-pointer text-sm font-medium text-stone-700">处理过程 · {finalLabel}</summary>
    <ol className="mt-3 space-y-2 text-xs text-stone-500">
      {attempt.steps.length ? attempt.steps.map(step => <li key={step.id} className="flex gap-3"><span className="w-12 shrink-0">step {step.sequence}</span><span><b className="font-medium text-stone-700">{step.label}</b>{step.detail ? ` · ${step.detail}` : ""} · {{running: "进行中", completed: "完成", failed: "失败", interrupted: "已中断"}[step.status]}</span></li>) : <li>旧回答没有记录详细步骤。</li>}
    </ol>
    {attempt.policy && <p className="mt-3 border-t border-stone-100 pt-2 text-xs text-stone-400" aria-label="生效策略">{{ direct: "直接交流", research: "资料研究", clarify: "需要澄清" }[attempt.policy.route]} · {{ low: "自由讨论", middle: "有据分析", high: "严格依据" }[attempt.policy.evidence_level]} · {attempt.policy.query_routing === "knowledge_only" ? "仅按资料" : "自动判断"} · {attempt.policy.allowed_doc_ids ? "限定资料" : "全部资料"} · {stopLabels[attempt.policy.stop_reason] ?? "处理已更新"}</p>}
  </details>;
}

export function Answer({ attempt, startedTick, onRegenerate }: { attempt: Attempt; startedTick?: number; onRegenerate?: () => void }) {
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
    {!!attempt.sources.length && <details className="mt-5 rounded-xl border border-stone-200 bg-white p-4"><summary className="cursor-pointer text-sm">已读证据 · {attempt.sources.length}</summary><div className="mt-3 flex flex-wrap gap-2">{attempt.sources.map((s, j) => <a key={j} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs text-teal-800" href={s.url.startsWith('/api/documents/') ? s.url : undefined} target="_blank" rel="noreferrer">[{j + 1}] {s.title}</a>)}</div><div className="mt-4 grid gap-3">{attempt.sources.map((s, j) => <div key={j} className="border-t border-stone-100 pt-3"><p className="text-xs font-medium">[{j + 1}] {s.title} · 第{s.page ?? 1}页</p><p className="mt-1 text-xs text-stone-500">{s.snippet}</p><p className="text-xs text-stone-400">版本 {s.version} · 采集 {s.captured_at ?? "未记录"}{s.truncated ? " · 仅部分原文" : ""}</p></div>)}</div></details>}
  </>;
}
