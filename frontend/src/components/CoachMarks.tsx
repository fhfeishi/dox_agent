import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

export type CoachStep = { target?: string; title: string; body: ReactNode };

/**
 * A step-by-step walkthrough over the page (query 2026-1020 1719): the page dims, the element a step is
 * about stays lit and outlined, and a card next to it explains it with 上一步 / 下一步. Elements are
 * found by their `data-guide` name; a step without one, or whose element is not on screen, centres
 * its card. ← and → move, Esc closes.
 */
export function CoachMarks({ steps, label, onClose, footer }: { steps: CoachStep[]; label: string; onClose: () => void; footer?: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useLayoutEffect(() => {
    const element = step.target ? document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`) : null;
    element?.scrollIntoView({ block: "nearest" });
    const measure = () => setRect(element && element.offsetParent !== null ? element.getBoundingClientRect() : null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step.target, index]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [steps.length, onClose]);

  const pad = 6;
  const width = 340;
  // The card sits below the lit element when there is room, otherwise above it.
  const below = rect ? window.innerHeight - rect.bottom > 230 : false;
  const card = rect
    ? { left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: below ? rect.bottom + pad + 12 : undefined,
        bottom: below ? undefined : window.innerHeight - rect.top + pad + 12 }
    : null;

  return (
    <div className="fixed inset-0 z-[200]" aria-live="polite">
      {rect ? (
        <div aria-hidden="true" className="pointer-events-none fixed rounded-[12px] ring-2 ring-[var(--primary)] transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)" }} />
      ) : <div aria-hidden="true" className="fixed inset-0 bg-[rgba(15,23,42,0.55)]" />}
      <div role="dialog" aria-label={label} aria-modal="true"
        className="fixed w-[340px] max-w-[calc(100vw-24px)] rounded-[14px] bg-[var(--canvas)] p-[16px] shadow-2xl"
        style={card ?? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <div className="flex items-center gap-[6px]">
          {steps.map((_, i) => <span key={i} aria-hidden="true" className={`h-[4px] rounded-full transition-all ${i === index ? "w-[18px] bg-[var(--primary)]" : "w-[6px] bg-[var(--hairline-strong)]"}`} />)}
          <span className="ml-auto text-caption text-[var(--stone)]">第 {index + 1}/{steps.length} 步</span>
        </div>
        <h2 className="mt-[10px] text-emphasis font-semibold text-[var(--ink)]">{step.title}</h2>
        <div className="mt-[6px] space-y-[6px] text-body leading-[1.65] text-[var(--slate)]">{step.body}</div>
        {last && footer ? <div className="mt-[10px] text-caption text-[var(--steel)]">{footer}</div> : null}
        <div className="mt-[14px] flex items-center gap-[8px]">
          <button type="button" onClick={onClose} className="text-caption text-[var(--steel)] hover:underline">跳过</button>
          <span className="flex-1" />
          {index > 0 ? <button type="button" onClick={() => setIndex(index - 1)}
            className="rounded-[8px] border border-[var(--hairline-strong)] px-[12px] py-[5px] text-body hover:bg-[var(--surface)]">上一步</button> : null}
          <button type="button" autoFocus onClick={() => last ? onClose() : setIndex(index + 1)}
            className="rounded-[8px] bg-[var(--primary)] px-[14px] py-[5px] text-body text-white hover:bg-[var(--primary-pressed)]">{last ? "开始使用" : "下一步"}</button>
        </div>
      </div>
    </div>
  );
}

/** What each built-in task asks of the reader, step by step (精准问答 / 对比分析 / 技术研判 / 专项报告). */
const TASK_TIPS: Record<string, { does: string; scope: string; ask: string; after: string }> = {
  task1: { does: "回答一个具体问题：先给结论，再逐条列出依据 [n]，不推测。",
    scope: "问题越具体越好；只想查某几份资料时，点下方“资料范围”限定它们。",
    ask: "例如：“这批项目采用了哪些关键方法？”",
    after: "回答上方“资料检索”列出用了哪些报告、为什么选它们；回答下方可复制、导出 Word / Markdown、保存到报告中心。" },
  task2: { does: "把项目、方法或时期放在一起比较：给出对比维度表、差异结论和可比的前提。",
    scope: "对比通常需要两份以上资料：可多选资料库，或在“资料范围”里勾选要比较的项目。",
    ask: "说清比较的对象和角度，例如：“比较这些项目的研究对象、方法和应用。”",
    after: "先看对比表，再看差异结论；口径不同的指标会注明，不直接比较。结果同样可导出或保存到报告中心。" },
  task3: { does: "研判技术路线：已经做到哪一步、还有哪些工作可以做；事实与研判意见分段写，并注明样本范围。",
    scope: "研判看的是一个领域的整体，建议选整个资料库，不必限定少数资料。",
    ask: "例如：“这个领域有哪些研究路线，已经实现了哪些工作，还有哪些工作可以做？”",
    after: "研判意见会标注把握程度和依据的资料范围；需要成文时，可在“专项报告”里按模板生成。" },
  task4: { does: "按模板生成一份可保存、可编辑的报告。先在对话里说明需求，系统整理成报告要求，确认后再生成。",
    scope: "报告只针对一个资料库：先在上方选好；年份范围、资助类别等可在需求里写明。",
    ask: "例如：“生成一份 2021 至 2025 年面上项目成果报告。”",
    after: "确认报告要求后点“生成报告”；生成过程可以离开，完成后在报告中心打开、修订和导出。" },
};

export function taskGuide(task: { id: string; name: string; output_hint?: string }, presets?: string[]): CoachStep[] {
  const tips = TASK_TIPS[task.id];
  if (!tips) return [];
  return [
    { target: "chat-task", title: `这是“${task.name}”`, body: <><p>{tips.does}</p>{task.output_hint ? <p className="text-caption text-[var(--steel)]">输出：{task.output_hint}</p> : null}</> },
    { target: "chat-scope", title: "选择资料范围", body: <><p>默认按问题自动选择最相关的资料库；点这个按钮可以手动选择，最多 6 个。</p><p>{tips.scope}</p></> },
    { target: "chat-quick", title: "点选提问", body: <><p>已为“{task.name}”预选常用的关注要素{presets?.length ? `（${presets.join("、")}）` : ""}。点“生成问题”，系统把点选内容写成问题填进输入框，你可以再改。</p></> },
    { target: "chat-input", title: "提问并发送", body: <><p>{tips.ask}</p><p className="text-caption text-[var(--steel)]">Enter 发送，Shift+Enter 换行；回答生成时可以离开页面，回来接着看。</p></> },
    { title: "查看与保存结果", body: <p>{tips.after}</p> },
  ];
}
