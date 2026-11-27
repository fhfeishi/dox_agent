import { Drawer } from "./Drawer";
import { Icon } from "./Icons";
import { useApp } from "../store";
import { AccountsPanel } from "./AccountsPanel";
import { useLayout } from "../layout";

/**
 * Administrator settings: who may sign in, and the power action.
 *
 * It used to open with a 模型 section — name, endpoint, whether the key was set, a reachability
 * button. All of that moved to the composer's model block (2026-11-26): the person who switches
 * models is not necessarily the administrator, and one model surface beats a read-only copy of it
 * in a drawer only admins can open. Online document sources live in the corpus detail; chat/session
 * export lives in the chat top bar.
 */
export function OpsDrawer() {
  const { disconnect, connected } = useApp();
  const { drawerOpen, setDrawerOpen } = useLayout();

  return (
    <Drawer
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      title="设置"
      headerAction={
        <button
          type="button"
          aria-label="断开连接"
          title={connected ? "断开连接" : "已断开"}
          disabled={!connected}
          className="grid size-[30px] place-items-center rounded-md text-[var(--slate)] hover:bg-[var(--surface)] disabled:opacity-40"
          onClick={() => {
            setDrawerOpen(false);
            void disconnect();
          }}
        >
          <Icon name="power" size={16} />
        </button>
      }
    >
      <AccountsPanel />
    </Drawer>
  );
}
