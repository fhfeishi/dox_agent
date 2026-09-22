import { Icon } from "./Icons";
import { useApp } from "../store";

/** Bottom-center transient toast. */
export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed bottom-[22px] left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[var(--navy)] px-[16px] py-[9px] text-[12.5px] text-white shadow-[0_12px_32px_-8px_rgba(15,15,15,0.4)]"
    >
      {toast}
    </div>
  );
}

/** Top banner: connection lost or the corpus is still preparing / failed. */
export function StatusBanner() {
  const { connected, ready, corpusReady, health, progress } = useApp();
  if (!connected || (ready && corpusReady)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[10px] z-[75] flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-[10px] rounded-[10px] border border-[var(--tint-peach)] bg-[var(--tint-cream)] px-[14px] py-[9px] text-[12.5px] text-[#8a3d00] shadow-[0_8px_24px_-12px_rgba(15,15,15,0.2)]"
      >
        <Icon name="warning" size={14} />
        <span>
          {health}
          {ready ? "" : " · 资料查证暂不可用"}
        </span>
        {progress?.stage === "loading_model" ? <span>· 正在加载 embedding 模型</span> : null}
        {progress && progress.total > 0 ? (
          <span>
            · 向量索引 {progress.completed}/{progress.total}
          </span>
        ) : null}
      </div>
    </div>
  );
}
