import { useApp } from "../store";
import type { NavKey } from "../store";
import { BrandMark, Icon, type IconName } from "./Icons";

const NAV_ITEMS: { key: NavKey; icon: IconName; label: string }[] = [
  { key: "chat", icon: "chat", label: "对话" },
  { key: "library", icon: "library", label: "知识库" },
  { key: "tasks", icon: "tasks", label: "任务" },
  { key: "reports", icon: "reports", label: "成果" },
  { key: "prompts", icon: "checklist", label: "Prompt / Skill" },
];

function RailButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`relative grid size-[36px] place-items-center rounded-[8px] transition-colors ${
        active
          ? "bg-[#e6e3df] text-[var(--ink)]"
          : "text-[var(--steel)] hover:bg-[#eceae7] hover:text-[var(--charcoal)]"
      }`}
    >
      {active ? (
        <span className="absolute top-[9px] -left-[10px] h-[18px] w-[3px] rounded-r-[3px] bg-[var(--navy)]" />
      ) : null}
      <Icon name={icon} size={19} />
    </button>
  );
}

export function IconRail() {
  const {
    nav,
    setNav,
    inspectorOpen,
    toggleInspector,
    setDrawerOpen,
    llmTone,
    llmText,
    model,
    sidebarCollapsed,
    toggleSidebar,
    switchSession,
    workspace,
    sessionBusy,
  } = useApp();

  return (
    <nav className="flex w-[56px] shrink-0 flex-col items-center gap-[4px] border-r border-[var(--hairline)] bg-[var(--surface)] py-[10px] pb-[12px]">
      <div className="mb-[10px] grid size-[30px] place-items-center rounded-[8px] bg-[var(--navy)]">
        <BrandMark size={16} />
      </div>

      {NAV_ITEMS.map((item) => (
        <RailButton
          key={item.key}
          icon={item.icon}
          label={item.label}
          active={nav === item.key}
          onClick={() => setNav(item.key)}
        />
      ))}

      <RailButton
        icon="plus"
        label="新建对话"
        onClick={() => {
          if (!workspace.loaded || sessionBusy) return;
          void switchSession();
        }}
      />

      <span className="my-[8px] h-px w-[20px] bg-[var(--hairline)]" />

      <RailButton
        icon="panel"
        label="检查器"
        active={inspectorOpen}
        onClick={toggleInspector}
      />
      <RailButton icon="settings" label="检索设置" onClick={() => setDrawerOpen(true)} />

      <span className="flex-1" />

      {sidebarCollapsed ? (
        <RailButton icon="chevronRight" label="展开侧栏" onClick={toggleSidebar} />
      ) : null}

      <button
        type="button"
        title={`LLM：${model || "未知"} · ${llmText}`}
        onClick={() => setDrawerOpen(true)}
        className="relative grid size-[30px] place-items-center rounded-full border border-black/[0.04] bg-[var(--tint-gray)]"
      >
        <span className={`absolute -top-[1px] -right-[1px] size-[9px] rounded-full ring-2 ring-[var(--surface)] ${llmTone}`} />
        <span className="text-[10px] font-semibold text-[var(--slate)]">LLM</span>
      </button>
    </nav>
  );
}
