import { useEffect, useRef, useState } from "react";
import {
  checkModel, fetchModel, saveModel, type ContextBreakdown, type ModelInfo, type Usage,
} from "../api";

/** The one model control: what is answering, how full its window is, and switching (2026-11-26).
 *
 * This used to be two things — a ring beside the send button and a 模型 entry in the top bar. Both
 * were about the model, so they are one block now: the bar loses an entry and the person has one
 * place to look. It is the whole model surface, so it stays small.
 *
 * Two kinds of number appear and must not blur: the ring's numerator is the provider's reported
 * input tokens (true), while the breakdown is estimated by origin and shown in thousands only —
 * the estimator is uncalibrated and a percentage would read as precision it does not have. A model
 * with no verified window draws no ring at all.
 */
export function ModelStatus({ usage, context }: { usage?: Usage; context?: ContextBreakdown }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // This session's probe results. Not persisted: a provider can go down between sessions, and a
  // stale green light is worse than none.
  const [lights, setLights] = useState<Record<string, boolean>>({});
  const box = useRef<HTMLDivElement>(null);

  // Fetch once on mount so the block shows the model even before any answer: it is the model entry,
  // and an entry that says "选择模型" while a model is already in use is misleading.
  useEffect(() => {
    let cancelled = false;
    void fetchModel().then((data) => { if (!cancelled) setInfo(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    void (async () => {
      try {
        const data = await fetchModel();
        if (cancelled) return;
        setInfo(data);
        // Probe the model in use as the menu opens, so "is my model working?" is answered before
        // it is asked rather than discovered mid-answer.
        if (data.current) {
          const key = `${data.current.provider}/${data.current.model}`;
          const check = await checkModel(data.current.provider, data.current.model);
          if (!cancelled) setLights((current) => ({ ...current, [key]: Boolean(check.ok) }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const choose = async (provider: string, model: string) => {
    const key = `${provider}/${model}`;
    setBusy(key);
    setError("");
    try {
      const next = await saveModel(provider, model);
      setInfo(next);
      setLights((current) => ({ ...current, [key]: next.reachable !== false }));
      if (next.reachable === false) setError(next.check_error || "这个模型没有响应");
    } catch (e) {
      setLights((current) => ({ ...current, [key]: false }));
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };

  const current = info?.current;
  const modelName = context?.model ?? current?.model ?? "";
  const window = context?.window ?? current?.context ?? null;
  const used = usage?.input_tokens ?? null;
  const ratio = used !== null && window ? Math.min(1, used / window) : null;
  const thousand = (value: number) => `${(value / 1000).toFixed(1)}k`;
  const total = context ? context.system + context.material + context.history : 0;

  return <div ref={box} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
      aria-label={modelName ? `模型与上下文：${modelName}` : "模型与上下文"}
      title={modelName ? `${modelName}${window ? ` · ${thousand(window)} 窗口` : " · 窗口未知"}` : "选择模型"}
      className="flex h-[30px] items-center gap-[6px] rounded-md px-[8px] text-body text-[var(--text-2)] transition-colors duration-[var(--dur-quick)] hover:bg-[var(--surface)]">
      {ratio !== null ? <Ring ratio={ratio} /> : <span aria-hidden="true" className="size-[10px] rounded-full border border-[var(--line-cool-strong)]" />}
      <span className="max-w-[150px] truncate">{modelName || "选择模型"}</span>
      {used !== null ? <span className="tabular-nums text-[var(--text-3)]">{window ? `${thousand(used)} / ${thousand(window)}` : thousand(used)}</span> : null}
      <span aria-hidden="true" className="text-caption text-[var(--text-3)]">{open ? "▴" : "▾"}</span>
    </button>

    {open ? <div role="dialog" aria-label="模型与上下文"
      className="absolute bottom-[calc(100%+8px)] right-0 z-30 w-[290px] rounded-xl border border-[var(--line-cool)] bg-[var(--canvas)] p-[14px] shadow-lg">
      {context ? <>
        <p className="mb-[6px] text-caption font-semibold text-[var(--heading)]">本轮上下文</p>
        <Row label="系统提示" value={thousand(context.system)} />
        <Row label="资料" value={thousand(context.material)} />
        <Row label="历史对话" value={thousand(context.history)} />
        <Row label="分段合计（估算）" value={thousand(total)} muted />
        <div className="my-[8px] border-t border-[var(--line-cool-soft)]" />
      </> : null}
      {used !== null ? <Row label="模型回报输入" value={thousand(used)} /> : null}
      {window ? <Row label="窗口上限" value={thousand(window)} /> : null}
      {context ? <p className="mt-[6px] text-caption text-[var(--text-3)]">
        {window ? "分段为估算，合计与输入以模型回报为准。" : "这个模型的窗口大小未核实，因此不画比例。"}
      </p> : null}

      <p className="mb-[6px] mt-[10px] text-caption font-semibold text-[var(--heading)]">切换模型</p>
      {error ? <p role="alert" className="mb-[6px] text-caption text-[var(--danger-fg)]">{error}</p> : null}
      {info?.available ? info.available.map((provider) => <div key={provider.id} className="mb-[8px]">
        <p className="mb-[3px] text-caption text-[var(--text-3)]">{provider.label}</p>
        {provider.models.map((model) => {
          const key = `${provider.id}/${model.name}`;
          const picked = current?.provider === provider.id && current?.model === model.name;
          return <button key={model.name} type="button" disabled={Boolean(busy)} onClick={() => void choose(provider.id, model.name)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg px-[8px] py-[5px] text-left text-body transition-colors duration-[var(--dur-quick)] ${picked ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-2)] hover:bg-[var(--surface)]"} disabled:opacity-50`}>
            <span className="flex min-w-0 items-center gap-[6px]">
              <Light state={busy === key ? "busy" : lights[key]} />
              <span className="truncate">{model.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-caption text-[var(--text-3)]">{model.context ? `${Math.round(model.context / 1000)}k` : "未知"}</span>
          </button>;
        })}
      </div>) : <p role="status" className="text-caption text-[var(--text-3)]">正在读取……</p>}
      {info ? <p className="mt-[2px] border-t border-[var(--line-cool-soft)] pt-[8px] text-caption text-[var(--text-3)]">
        后台任务（资料审查、事实抽取）固定用 {info.model}，切换只影响你的问答与报告。
      </p> : null}
    </div> : null}
  </div>;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 text-caption ${muted ? "text-[var(--text-3)]" : "text-[var(--text-2)]"}`}>
    <span>{label}</span>
    <span className="tabular-nums text-[var(--heading)]">{value}</span>
  </div>;
}

/** Grey hollow = untested, green = answered, red = refused, pulsing = testing. */
function Light({ state }: { state?: boolean | "busy" }) {
  if (state === "busy") return <span aria-hidden="true" className="size-[6px] shrink-0 animate-pulse rounded-full bg-[var(--text-3)]" />;
  if (state === undefined) return <span aria-hidden="true" title="未测试" className="size-[6px] shrink-0 rounded-full border border-[var(--line-cool-strong)]" />;
  return <span aria-hidden="true" title={state ? "连通" : "无响应"}
    className={`size-[6px] shrink-0 rounded-full ${state ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />;
}

/** A 12px ring: grey track, primary arc for the used share. */
function Ring({ ratio }: { ratio: number }) {
  const size = 12, stroke = 2.5, radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line-cool-strong)" strokeWidth={stroke} />
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--primary)" strokeWidth={stroke}
      strokeDasharray={`${circumference * ratio} ${circumference}`} strokeLinecap="round"
      transform={`rotate(-90 ${size / 2} ${size / 2})`} />
  </svg>;
}