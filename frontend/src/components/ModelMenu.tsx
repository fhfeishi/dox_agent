import { useEffect, useRef, useState } from "react";
import { fetchModel, saveModel, type ModelInfo } from "../api";

/** Pick which model answers (2026-11-25).
 *
 * Every role gets this: the model is the account's own choice, like its expert memory. What the
 * account may pick is a fixed catalogue served by the backend — the panel only sends back a
 * provider and a model name, never an endpoint or a credential.
 */
export function ModelMenu({ label, tone }: { label: string; tone: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // Which models this session has proven: switch a model and its light tells whether it answered.
  // Persisted nowhere — a provider can go down between sessions, and a stale green light is worse
  // than none.
  const [reachable, setReachable] = useState<Record<string, boolean>>({});
  const [lastError, setLastError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    void fetchModel()
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
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
    setBusy(`${provider}/${model}`);
    setError("");
    setLastError("");
    try {
      const next = await saveModel(provider, model);
      setInfo(next);
      setReachable((current) => ({ ...current, [`${provider}/${model}`]: next.reachable !== false }));
      if (next.reachable === false) setLastError(next.check_error || "这个模型没有响应");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setReachable((current) => ({ ...current, [`${provider}/${model}`]: false }));
    } finally { setBusy(""); }
  };

  const current = info?.current;

  return <div ref={box} className="relative shrink-0">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
      title={current ? `当前模型：${current.model}` : "选择模型"}
      aria-label={current ? `模型：${current.model}` : "模型"}
      className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-caption text-[var(--steel)] hover:bg-[var(--surface)] sm:flex">
      <span className={`size-2 rounded-full ${tone}`} />{label}
    </button>

    {open ? <div role="dialog" aria-label="选择模型"
      className="absolute right-0 top-[calc(100%+8px)] z-30 w-[300px] rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-[12px] shadow-lg">
      <p className="mb-[8px] text-caption font-semibold text-[var(--ink)]">选择模型</p>
      {error ? <p role="alert" className="mb-[8px] text-caption text-[var(--red)]">{error}</p> : null}
      {lastError ? <p role="alert" className="mb-[8px] text-caption text-[var(--red)]">{lastError}</p> : null}
      {info?.available ? info.available.map((provider) => <div key={provider.id} className="mb-[10px]">
        <p className="mb-[4px] text-caption text-[var(--stone)]">{provider.label}</p>
        {provider.models.map((model) => {
          const picked = current?.provider === provider.id && current?.model === model.name;
          return <button key={model.name} type="button" disabled={Boolean(busy)} onClick={() => void choose(provider.id, model.name)}
            className={`flex w-full items-baseline justify-between gap-2 rounded px-[6px] py-[4px] text-left text-caption ${picked ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"} disabled:opacity-50`}>
            <span className="flex items-center gap-[5px]">
              <Light state={reachable[`${provider.id}/${model.name}`]} />
              {model.label}{picked ? " ✓" : ""}
            </span>
            <span className="tabular-nums text-[var(--stone)]">{model.context ? `${Math.round(model.context / 1000)}k` : "窗口未知"}</span>
          </button>;
        })}
      </div>) : <p role="status" className="text-caption text-[var(--steel)]">正在读取……</p>}
      {info ? <p className="mt-[4px] border-t border-[var(--hairline)] pt-[8px] text-caption text-[var(--stone)]">
        默认模型 {info.model} 仍用于后台任务（资料审查、事实抽取）。切换只影响你的问答与报告。
      </p> : null}
    </div> : null}
  </div>;
}

/** A connection light: unknown (hollow), answered (green), refused (red). */
function Light({ state }: { state?: boolean }) {
  if (state === undefined) return <span aria-hidden="true" className="size-[6px] shrink-0 rounded-full border border-[var(--hairline-strong)]" />;
  return <span aria-hidden="true" title={state ? "连通" : "无响应"}
    className={`size-[6px] shrink-0 rounded-full ${state ? "bg-[var(--ok-fg)]" : "bg-[var(--red)]"}`} />;
}
