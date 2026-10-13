import { ROLE_LABEL, useAuth } from "../auth";
import { GUIDE_EVENT } from "./Guide";
import { useApp } from "../store";
import type { NavKey } from "../store";
import { BrandMark, Icon, type IconName } from "./Icons";

const NAV_ITEMS: { key: NavKey; icon: IconName; label: string }[] = [
  { key: "chat", icon: "chat", label: "对话" },
  { key: "library", icon: "library", label: "资料库" },
  { key: "tasks", icon: "tasks", label: "存量分析" },
  { key: "review", icon: "review", label: "资料审查" },
  { key: "intelligence", icon: "forecast", label: "情报分析" },
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
      className={`relative flex min-h-[60px] w-full flex-col items-center justify-center gap-1 rounded-[8px] transition-colors ${
        active
          ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]"
          : "text-[var(--steel)] hover:bg-[#eceae7] hover:text-[var(--charcoal)]"
      }`}
    >
      {active ? (
        <span className="absolute top-[9px] -left-[10px] h-[18px] w-[3px] rounded-r-[3px] bg-[var(--navy)]" />
      ) : null}
      <Icon name={icon} size={22} /><span className="text-[12px] leading-tight">{label}</span>
    </button>
  );
}

export function IconRail() {
  const { logout, username, role } = useAuth();
  const {
    nav,
    setNav,
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
    <nav className="flex w-[88px] shrink-0 flex-col items-center gap-[4px] overflow-y-auto px-1 border-r border-[var(--hairline)] bg-[var(--surface)] py-[10px] pb-[12px]">
      <button type="button" aria-label="首页" onClick={() => setNav("home")} className="mb-2 flex flex-col items-center gap-1 rounded-lg bg-[var(--navy)] p-2 text-white">
        <BrandMark size={16} /><span className="text-xs">首页</span>
      </button>

      {NAV_ITEMS.map((item) => (
        <RailButton
          key={item.key}
          icon={item.icon}
          label={item.label}
          active={nav === item.key}
          onClick={() => setNav(item.key)}
        />
      ))}

      <span className="flex-1" />
      <button type="button" onClick={() => window.dispatchEvent(new Event(GUIDE_EVENT))} aria-label="指南" title="查看本页操作指南"
        className="py-1.5 text-xs text-[var(--steel)] hover:text-[var(--charcoal)]">指南</button>
      <span className="max-w-full truncate px-1 text-center text-[11px] leading-4 text-[var(--stone)]" title={`${username}（${ROLE_LABEL[role]}）`}>
        {username}<br />{ROLE_LABEL[role]}</span>
      <button type="button" onClick={() => void logout()} className="py-1.5 text-xs text-[var(--steel)] hover:text-[var(--charcoal)]">退出登录</button>
      <div className={sidebarCollapsed ? "w-full" : "w-full lg:hidden"}>
      <RailButton
        icon="plus"
        label="新建对话"
        onClick={() => {
          if (!workspace.loaded || sessionBusy) return;
          void switchSession();
        }}
      />

      </div>
      <RailButton
        icon="panel"
        label="检查器"
        onClick={toggleInspector}
      />
      <RailButton icon="settings" label="设置" onClick={() => setDrawerOpen(true)} />

      {sidebarCollapsed ? (
        <RailButton icon="chevronRight" label="展开侧栏" onClick={toggleSidebar} />
      ) : null}

      <button
        type="button"
        title={`模型：${model || "未知"} · ${llmText}`}
        onClick={() => setDrawerOpen(true)}
        className="relative grid size-[30px] place-items-center rounded-full border border-black/[0.04] bg-[var(--tint-gray)]"
      >
        <span className={`absolute -top-[1px] -right-[1px] size-[9px] rounded-full ring-2 ring-[var(--surface)] ${llmTone}`} />
        <span className="text-[10px] font-semibold text-[var(--slate)]">模型</span>
      </button>
    </nav>
  );
}
