import { useEffect, useState, type ReactNode } from "react";
import { fetchReports, type ReportSummary } from "../api";
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
  const { tasks, tasksError, taskId, showInspector, taskCapable } = useApp();

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
                onClick={() => showInspector({ kind: "task", taskId: task.id })}
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
                  查看任务详情
                </span>
              </button>
            );
          })
        : null}
    </ViewShell>
  );
}

export function ReportsView() {
  const { workspace, startTask, corpora, showInspector } = useApp();
  const [reportList, setReportList] = useState<{ sessionKey: string; items: ReportSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setReportList(null);
    setError("");
    setLoading(true);
    // W0 deliberately stays within the active session. The global Artifact list belongs to W3.
    if (!workspace.active) {
      setLoading(false);
      return;
    }
    void fetchReports(workspace.active).then(
      (items) => { if (active) setReportList({ sessionKey: workspace.active, items }); },
      (cause) => { if (active) setError(cause instanceof Error ? cause.message : "报告列表读取失败"); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace.active]);

  const reports = reportList?.sessionKey === workspace.active ? reportList.items : [];

  return (
    <ViewShell
      title="本会话报告"
      description="查看当前会话生成的专项报告。选择“专项报告”任务、确认资料范围后，可在对话中生成新报告。"
      actions={<Button onClick={() => void startTask("task4")}>新建专项报告</Button>}
    >
      {error ? <p role="alert" className="col-span-full text-[13px] text-[var(--red)]">{error}</p> : null}
      {loading ? <p className="col-span-full text-[13px] text-[var(--steel)]">正在读取报告…</p> : null}
      {!loading && !error && !reports.length ? (
        <p className="col-span-full text-[13px] text-[var(--steel)]">本会话还没有报告。</p>
      ) : null}
      {reports.map((report) => (
        <button key={report.report_id} type="button" onClick={() => showInspector({ kind: "report", reportId: report.report_id, sessionKey: workspace.active })}
          className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-left hover:border-[var(--primary)]">
          <span className="block text-[14px] font-semibold text-[var(--ink)]">{report.domain || "未命名报告"}</span>
          <span className="mt-[5px] block text-[12px] text-[var(--steel)]">
            {report.template_id || "模板未记录"} · {report.corpus_id
              ? (corpora.find((corpus) => corpus.id === report.corpus_id)?.name ?? report.corpus_id)
              : "来源库未记录"} · {report.created_at?.slice(0, 10) || "时间未记录"}
          </span>
        </button>
      ))}
    </ViewShell>
  );
}

export function PromptSkillView() {
  const { setNav } = useApp();
  return (
    <ViewShell title="Prompt / Skill" description="这里将管理可复用指令和受控能力。当前版本的指令随内置任务发布，尚不支持在界面中查看、编辑或启用自定义 Skill。">
      <div className="col-span-full rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[20px]">
        <p className="text-[13px] text-[var(--steel)]">现有四个任务可以使用内置指令。选择任务后可查看用途与输出要求。</p>
        <Button className="mt-[12px]" onClick={() => setNav("tasks")}>查看任务</Button>
      </div>
    </ViewShell>
  );
}
