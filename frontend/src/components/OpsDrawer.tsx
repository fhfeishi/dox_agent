import { Drawer } from "./Drawer";
import { Icon } from "./Icons";
import { useApp } from "../store";

/**
 * Global settings: connection (power) and read-only model info.
 * Online document sources live in the default corpus detail (they only write the default
 * library); chat/session export lives in the chat top bar.
 */
export function OpsDrawer() {
  const { drawerOpen, setDrawerOpen, disconnect, connected, model } = useApp();

  return (
    <Drawer
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      title="设置与运维"
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
      <section className="text-[13px]" aria-label="模型信息">
        <h3 className="font-semibold text-[var(--ink)]">模型</h3>
        <p className="mt-[6px] text-[12px] text-[var(--steel)]" role="status">
          当前模型：{model || "未知"}（来源 /api/health）
        </p>
        <p className="mt-[4px] text-[12px] leading-[1.6] text-[var(--stone)]">
          首期为服务端固定单一模型，界面如实展示，暂不支持切换；多模型切换需后端提供可用模型列表与请求级模型字段。
        </p>
      </section>
    </Drawer>
  );
}
