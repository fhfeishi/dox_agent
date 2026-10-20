import { generationProgress, type GenerationState } from "../generationProgress";

export function GenerationProgress(props: GenerationState & { compact?: boolean }) {
  const state = generationProgress(props);
  return <div className={props.compact ? "mt-2" : "my-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3"}>
    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--steel)]">
      <span className="truncate">{state.label}</span>
      {state.percent !== undefined ? <span className="shrink-0 tabular-nums">{state.percent}%{state.active && props.status !== "queued" ? " · 阶段进度" : ""}</span> : null}
    </div>
    <div role="progressbar" aria-label="报告生成进度" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={state.percent} aria-valuetext={state.label}
      className="relative h-1.5 overflow-hidden rounded-full bg-[var(--hairline)]">
      {state.percent !== undefined ? <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${state.percent}%` }} /> : state.active
        ? <div className="h-full w-full animate-pulse bg-[var(--primary-soft)] motion-reduce:animate-none"><div className="h-full w-1/3 rounded-full bg-[var(--primary)]" /></div>
        : <div className="h-full w-full bg-[var(--stone)]" />}
    </div>
    {!props.compact && state.active ? <p className="mt-2 text-caption text-[var(--stone)]">
      {state.percent == null ? "正在处理，尚无法估算完成比例。" : "按已完成阶段显示，实际耗时因材料而异。"}可继续其他工作，在“报告中心”中打开结果。
    </p> : null}
  </div>;
}
