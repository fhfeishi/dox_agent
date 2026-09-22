import type { ReactNode } from "react";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { Button, Pill } from "./ui";
import type { IconName } from "./Icons";

const TASK_STYLE: { tint: string; fg: string; icon: IconName }[] = [
  { tint: "var(--tint-mint)", fg: "#0e7a28", icon: "checklist" },
  { tint: "var(--tint-lavender)", fg: "#4a2a8f", icon: "competitors" },
  { tint: "var(--tint-sky)", fg: "#12609e", icon: "forecast" },
  { tint: "var(--tint-peach)", fg: "#8a3d00", icon: "reports" },
];

function ViewShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--hairline)] pr-[14px] pl-[18px]">
        <span className="text-[14px] font-semibold text-[var(--ink)]">{title}</span>
        <span className="flex-1" />
        {actions}
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1080px] px-[34px] pt-[26px]">
          <h1 className="mb-[6px] text-[26px] font-semibold tracking-[-0.6px] text-[var(--ink)]">
            {title}
          </h1>
          <p className="max-w-[680px] text-[13.5px] leading-[1.6] text-[var(--steel)]">{description}</p>
        </div>
        <div className="mx-auto grid w-full max-w-[1080px] grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-[14px] px-[34px] pt-[22px] pb-[40px]">
          {children}
        </div>
      </div>
    </section>
  );
}

export function TasksView() {
  const { tasks, tasksError, taskId, startTask, taskCapable } = useApp();

  return (
    <ViewShell
      title="任务模板"
      description="任务决定 system prompt 与输出契约。选中任务后会新建一个绑定该任务的会话；task4 专项报告走统一报告入口，不在聊天中生成正文。"
    >
      {!taskCapable ? (
        <div className="col-span-full rounded-[12px] border border-dashed border-[var(--hairline-strong)] bg-[var(--surface-soft)] p-[24px] text-center">
          <p className="text-[13.5px] font-medium text-[var(--ink)]">任务功能未启用</p>
          <p className="mx-auto mt-[8px] max-w-[520px] text-[12.5px] leading-[1.6] text-[var(--steel)]">
            设置 <code className="font-code">VITE_UI_TASKS=1</code> 后重新构建前端，即可启用任务选择与 chat <code className="font-code">task_id</code> 绑定。
          </p>
        </div>
      ) : null}
      {taskCapable && tasksError ? (
        <p role="alert" className="text-[13px] text-[var(--red)]">
          {tasksError}
        </p>
      ) : null}
      {taskCapable && !tasks.length && !tasksError ? (
        <p className="text-[13px] text-[var(--stone)]">正在读取任务列表…</p>
      ) : null}
      {taskCapable
        ? tasks.map((task, index) => {
            const style = TASK_STYLE[index % TASK_STYLE.length];
            const active = task.id === taskId;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => void startTask(task.id)}
                className="font-app flex flex-col gap-[10px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[16px] text-left transition-[border-color,box-shadow] hover:border-[var(--primary)] hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)]"
              >
                <span
                  className="grid size-[34px] place-items-center rounded-[8px]"
                  style={{ background: style.tint, color: style.fg }}
                >
                  <Icon name={style.icon} size={16} strokeWidth={1.9} />
                </span>
                <span className="flex items-center gap-[8px] text-[14px] font-semibold text-[var(--ink)]">
                  {task.name}
                  {active ? <Pill tone="lav">当前</Pill> : null}
                  {task.has_template ? <Pill tone="sky">含模板</Pill> : null}
                </span>
                <span className="flex-1 text-[12.3px] leading-[1.55] text-[var(--steel)]">
                  {task.description}
                </span>
                {task.output_hint ? (
                  <span className="rounded-[6px] bg-[var(--surface-soft)] px-[8px] py-[5px] text-[11.5px] leading-[1.5] text-[var(--slate)]">
                    输出：{task.output_hint}
                  </span>
                ) : null}
                <span className="mt-auto flex items-center gap-[6px] text-[11.5px] text-[var(--stone)]">
                  <Icon name="chevronRight" size={12} strokeWidth={2.2} />
                  {task.id === "task4" ? "报告入口未实现，暂在对话中提示" : "以此任务新建会话"}
                </span>
              </button>
            );
          })
        : null}
    </ViewShell>
  );
}

export function ReportsView() {
  const { showToast } = useApp();

  return (
    <ViewShell
      title="报告"
      description="专项报告按模板生成 Markdown，支持预览、复制与下载。该能力依赖后端 POST /api/reports（E 阶段），当前仅占位。"
      actions={<Button onClick={() => showToast("报告接口未实现（E 阶段）")}>生成报告</Button>}
    >
      <div className="col-span-full rounded-[12px] border border-dashed border-[var(--hairline-strong)] bg-[var(--surface-soft)] p-[28px] text-center">
        <p className="text-[13.5px] font-medium text-[var(--ink)]">报告入口尚未实现</p>
        <p className="mx-auto mt-[8px] max-w-[520px] text-[12.5px] leading-[1.6] text-[var(--steel)]">
          计划中的四类模板（成果 / 热点 / 未来方向 / 综合）依赖后端报告接口；接口就绪前不展示列表，也不提供导出。
        </p>
      </div>
    </ViewShell>
  );
}
