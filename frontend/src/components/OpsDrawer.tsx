import { useEffect, useState } from "react";
import { checkModel, fetchModelInfo, type ModelCheck, type ModelInfo } from "../api";
import { Drawer } from "./Drawer";
import { Icon } from "./Icons";
import { Button, Pill } from "./ui";
import { useApp } from "../store";

/**
 * Global settings opened from the rail's model button: model connection (details and a
 * reachability test) and the power action. Online document sources live in the corpus detail;
 * chat/session export lives in the chat top bar.
 */
export function OpsDrawer() {
  const { drawerOpen, setDrawerOpen, disconnect, connected } = useApp();
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<ModelCheck | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    setCheck(null);
    fetchModelInfo().then(setInfo, (e: Error) => setError(e.message));
  }, [drawerOpen]);

  async function runCheck() {
    setBusy(true); setError(""); setCheck(null);
    try { setCheck(await checkModel()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const row = "flex items-baseline justify-between gap-3 border-b border-[var(--hairline)] py-[8px] text-[12.5px]";
  return (
    <Drawer
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      title="模型与连接"
      headerAction={
        <button
          type="button"
          aria-label="断开连接"
          title={connected ? "断开连接" : "已断开"}
          disabled={!connected}
          className="grid size-[30px] place-items-center rounded-[6px] text-[var(--slate)] hover:bg-[var(--surface)] disabled:opacity-40"
          onClick={() => {
            setDrawerOpen(false);
            void disconnect();
          }}
        >
          <Icon name="power" size={16} />
        </button>
      }
    >
      {error ? <p role="alert" className="mb-3 text-[12.5px] text-[var(--red)]">{error}</p> : null}
      {!info && !error ? <p className="text-[12.5px] text-[var(--steel)]">正在读取模型信息…</p> : null}
      {info ? <>
        <section aria-label="模型信息">
          <h3 className="text-[13px] font-semibold text-[var(--ink)]">模型</h3>
          <div className={row}><span className="text-[var(--steel)]">名称</span><span className="font-code">{info.model}</span></div>
          <div className={row}><span className="text-[var(--steel)]">服务地址</span><span className="break-all font-code">{info.base_url}</span></div>
          <div className={row}><span className="text-[var(--steel)]">密钥</span>{info.api_key_configured ? <Pill tone="mint">已配置</Pill> : <Pill tone="yellow">未配置</Pill>}</div>
          {Object.keys(info.review_override).length ? <div className={row}><span className="text-[var(--steel)]">资料审查</span><span className="font-code">{Object.values(info.review_override).join(" · ")}</span></div> : null}
          <p className="mt-[8px] text-[11.5px] leading-[1.6] text-[var(--stone)]">问答、报告、四维提取与资料审查共用此模型；名称和地址在 .env 中配置，修改后重启服务生效。</p>
        </section>

        <section aria-label="连接测试" className="mt-[22px]">
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={busy || !info.api_key_configured} onClick={() => void runCheck()}>{busy ? "正在测试…" : "测试连接"}</Button>
            {check ? <span role="status" className={`text-[12.5px] ${check.ok ? "text-[#0e7a28]" : "text-[var(--red)]"}`}>
              {check.ok ? `连接正常 · ${check.latency_ms} ms` : `${check.error}${check.latency_ms != null ? ` · ${check.latency_ms} ms` : ""}`}
            </span> : null}
          </div>
          <p className="mt-[8px] text-[11.5px] leading-[1.6] text-[var(--stone)]">读取一次服务端模型列表，只验证网络与密钥，不产生生成费用。</p>
        </section>
      </> : null}
    </Drawer>
  );
}
