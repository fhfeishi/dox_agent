import { Drawer } from "./Drawer";
import { OfficialDocs } from "./OfficialDocs";
import { Icon } from "./Icons";
import { useApp } from "../store";

/**
 * Global settings & operations: connection, read-only model info, online document sources
 * and chat export. Corpus CRUD, per-corpus import and source-file management now live in
 * the corpus grid / corpus detail so the knowledge base has a single home.
 */
export function OpsDrawer() {
  const { drawerOpen, setDrawerOpen, disconnect, connected, model, busy, turns, exportChat } = useApp();

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

      <OfficialDocs connected={connected} />

      <section className="border-t border-[var(--hairline)] pt-[18px]" aria-label="导出">
        <h3 className="mb-[8px] text-[13px] font-semibold text-[var(--ink)]">导出</h3>
        <button
          disabled={busy || !turns.length}
          className="w-full rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--canvas)] p-[9px] text-[13px] text-[var(--ink)] hover:bg-[var(--surface)] disabled:opacity-40"
          onClick={exportChat}
        >
          导出对话与证据版本
        </button>
        <p className="mt-[6px] text-[11.5px] leading-[1.6] text-[var(--stone)]">
          导出为 JSON（含每轮生效配置、耗时与证据版本），用于诊断与归档。
        </p>
      </section>
    </Drawer>
  );
}
