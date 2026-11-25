import { useEffect, useRef, useState } from "react";
import type { ContextBreakdown, Usage } from "../api";

/** How much of the model's window this turn used (2026-11-25).
 *
 * Two different kinds of number appear here and the interface must not blur them:
 *
 * - the ring's numerator is ``usage.input_tokens`` — what the provider reported, so it is true;
 * - the breakdown inside is estimated from text length by origin (system / material / history),
 *   because no provider reports a prompt's division. Those are shown in thousands and never as
 *   percentages: the estimator is uncalibrated, and two decimals of a guess read as precision.
 *
 * When the window is unknown (a model added without a verified figure) no ring is drawn — the used
 * count still shows. A wrong denominator is worse than no proportion.
 */
export function ContextRing({ usage, context }: { usage?: Usage; context?: ContextBreakdown }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const used = usage?.input_tokens ?? null;
  const window = context?.window ?? null;
  const model = context?.model ?? "";
  // Nothing to say before the first answer of the session.
  if (used === null && !model) return null;

  const ratio = used !== null && window ? Math.min(1, used / window) : null;
  const thousand = (value: number) => `${(value / 1000).toFixed(1)}k`;
  const total = context ? context.system + context.material + context.history : 0;

  return <div ref={box} className="relative">
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-label={model ? `模型上下文：${model}` : "模型上下文"}
      title={model ? `${model}${window ? ` · ${thousand(window)} 窗口` : ""}` : "模型上下文"}
      className="flex items-center gap-[6px] rounded-md px-[6px] py-[3px] text-caption text-[var(--steel)] hover:bg-[var(--surface)]"
    >
      {ratio !== null ? <Ring ratio={ratio} /> : null}
      {model ? <span className="max-w-[120px] truncate">{model}</span> : null}
      {used !== null ? <span className="tabular-nums">{window ? `${thousand(used)} / ${thousand(window)}` : thousand(used)}</span> : null}
    </button>

    {open ? <div role="dialog" aria-label="上下文占用"
      className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-[260px] rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-[12px] shadow-lg">
      <p className="mb-[8px] text-caption font-semibold text-[var(--ink)]">本轮上下文</p>
      {context ? <>
        <Row label="系统提示" value={thousand(context.system)} />
        <Row label="资料" value={thousand(context.material)} />
        <Row label="历史对话" value={thousand(context.history)} />
        <div className="my-[6px] border-t border-[var(--hairline)]" />
        <Row label="分段合计（估算）" value={thousand(total)} muted />
      </> : null}
      <Row label="模型回报输入" value={used !== null ? thousand(used) : "未回报"} />
      {window ? <Row label="窗口上限" value={thousand(window)} /> : null}
      <p className="mt-[8px] text-caption text-[var(--stone)]">
        {window ? "分段为估算，合计与输入以模型回报为准。" : "这个模型的窗口大小未核实，因此不画比例。"}
      </p>
    </div> : null}
  </div>;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 text-caption ${muted ? "text-[var(--stone)]" : "text-[var(--steel)]"}`}>
    <span>{label}</span>
    <span className="tabular-nums text-[var(--ink)]">{value}</span>
  </div>;
}

/** A 14px ring: grey track, navy arc for the used share. */
function Ring({ ratio }: { ratio: number }) {
  const size = 14, stroke = 2.5, radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--hairline-strong)" strokeWidth={stroke} />
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--navy)" strokeWidth={stroke}
      strokeDasharray={`${circumference * ratio} ${circumference}`} strokeLinecap="round"
      transform={`rotate(-90 ${size / 2} ${size / 2})`} />
  </svg>;
}
