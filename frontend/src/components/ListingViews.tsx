import { useRef, useState, type ReactNode } from "react";
import { archiveTask, copyTask, deleteTask, restoreTask, saveTaskDraft, type TaskInfo } from "../api";
import { statusLabel } from "./TemplatePanels";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { Button, Pill } from "./ui";
import type { IconName } from "./Icons";
import { useAuth } from "../auth";
import { useNavigate } from "react-router";
import { TemplateLibrary, readText } from "./TemplateLibrary";
import { useLayout } from "../layout";

const TASK_STYLE: { tint: string; fg: string; icon: IconName }[] = [
  { tint: "var(--tint-mint)", fg: "var(--ok-fg)", icon: "checklist" },
  { tint: "var(--tint-lavender)", fg: "var(--lav-fg)", icon: "competitors" },
  { tint: "var(--tint-sky)", fg: "var(--info-fg)", icon: "forecast" },
  { tint: "var(--tint-peach)", fg: "var(--orange-fg)", icon: "reports" },
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
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-5 pt-7 sm:px-8">
          <div className="mb-[6px] flex flex-wrap items-center gap-[10px]">
            <h1 className="text-page font-semibold tracking-[-0.6px] text-[var(--ink)]">{title}</h1>
            <span className="flex-1" />
            {actions}
          </div>
          <p className="max-w-[680px] text-body leading-[1.6] text-[var(--steel)]">{description}</p>
        </div>
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 md:grid-cols-2 gap-[16px] px-5 sm:px-8 pt-[20px] pb-[40px]">
          {children}
        </div>
      </div>
    </section>
  );
}

const TASK_LIMIT = 8000;
const fileName = (file: File, fallback: string) => file.name.replace(/\.(md|markdown|txt|docx|doc|pdf)$/i, "").slice(0, 80) || fallback;


/**
 * 存量分析 (query 2026-1009 1541): task cards and the report template library. Preview and
 * modify open the same outline view (modify starts in edit mode); unpublished drafts can be
 * deleted, published ones archived and restored from the archived list.
 */
export function TasksView() {
  const { tasks, tasksError, taskId, refreshTasks } = useApp();
  const { showInspector } = useLayout();
  const navigate = useNavigate();
  // Every task starts in 对话工作台 with that task and its own 点选提问 presets (query 2026-1020 1719:
  // choosing a library and material and landing in the analysis workspace was the wrong way in).
  // Analysis tasks are shared, so administrators maintain them (节点审查 D2).
  const { role } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [manage, setManage] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<{ kind: "task"; task: TaskInfo } | null>(null);

  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  const removeTask = (task: TaskInfo) => run(async () => {
    if (task.version) { await archiveTask(task.id); setMessage(`已归档“${task.name}”，可在“已归档”中恢复`); }
    else if (window.confirm(`删除未发布的草稿“${task.name}”？`)) { await deleteTask(task.id); setMessage(`已删除草稿“${task.name}”`); }
    await refreshTasks();
  });
  const restore = (item: TaskInfo) => run(async () => {
    await restoreTask(item.id); await refreshTasks();
    setMessage(`已恢复“${item.name}”`);
  });

  async function uploaded(file: File) {
    const target = uploadFor.current;
    if (!target) return;
    await run(async () => {
      const raw = await readText(file);
      if (!raw) throw new Error("上传的文件没有可读取的文字");
      const text = raw;
      if (text.length > TASK_LIMIT) throw new Error(`文件约 ${text.length} 字，超过 ${TASK_LIMIT} 字上限，请精简后上传`);
      const task = target.task;
      const copy = task.kind === "custom" ? task : await copyTask(task.id);
      await saveTaskDraft({ ...copy, name: task.kind === "custom" ? copy.name : fileName(file, copy.name), outline: text });
      await refreshTasks();
      showInspector({ kind: "task", taskId: copy.id, edit: true });
      setMessage(`已将“${file.name}”作为任务大纲写入草稿，请在右侧核对后发布`);
    });
  }

  const action = "rounded-[6px] border border-[var(--hairline)] px-[9px] py-[4px] text-caption text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-45";
  const danger = "rounded-[6px] px-[7px] py-[4px] text-caption text-[var(--stone)] hover:text-[var(--red)] disabled:opacity-45";
  // The store keeps archived tasks so old sessions still resolve their names; the page splits them.
  const isArchived = (item: { archived?: boolean; status?: string }) => Boolean(item.archived) || item.status === "archived";
  const liveTasks = tasks.filter((t) => !isArchived(t));
  const archivedTasks = tasks.filter(isArchived);
  return (
    <ViewShell
      title="任务模版"
      description="存量分析从这里开始：选一个任务模版进入对话工作台，按指引选择资料范围并提问。生成的报告可在“报告中心”查看。"
      actions={<>
        {role === "admin" ? <Button variant="ghost" onClick={() => { setManage(!manage); setShowArchived(false); }}>{manage ? "结束任务管理" : "管理任务模版"}</Button> : null}
        {manage ? <Button variant="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "隐藏已归档" : "已归档"}</Button> : null}
        
      </>}
    >
      <input ref={upload} type="file" accept=".md,.markdown,.txt,.docx,.pdf" className="hidden" aria-label="上传模版文件"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploaded(file); }} />
      {tasksError ? <p role="alert" className="col-span-full text-body text-[var(--red)]">{tasksError}</p> : null}
      {message ? <p role="status" className="col-span-full text-body text-[var(--steel)]">{message}</p> : null}
      {!tasks.length && !tasksError ? (
        <p className="text-body text-[var(--stone)]">正在读取任务列表…</p>
      ) : null}
      {liveTasks.map((task, index) => {
            const style = TASK_STYLE[index % TASK_STYLE.length];
            const usable = task.status !== "draft" || Boolean(task.version);
            return (
              <article key={task.id}
                className="font-app flex flex-col gap-[10px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[16px] transition-[border-color,box-shadow] hover:border-[var(--primary)] hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)]">
                <button type="button" onClick={() => showInspector({ kind: "task", taskId: task.id })} className="flex flex-col gap-[10px] text-left">
                  <span className="grid size-[34px] place-items-center rounded-[8px]" style={{ background: style.tint, color: style.fg }}>
                    <Icon name={style.icon} size={16} strokeWidth={1.9} />
                  </span>
                  <span className="flex flex-wrap items-center gap-[8px] text-body font-semibold text-[var(--ink)]">
                    {task.name}
                    {task.id === taskId ? <Pill tone="lav">当前</Pill> : null}
                    <Pill tone={task.kind === "custom" ? "lav" : "sky"}>{task.kind === "custom" ? `我的任务 · ${statusLabel(task)}` : "内置"}</Pill>
                  </span>
                  <span className="text-body leading-[1.6] text-[var(--steel)]">{task.description}</span>
                  {manage && task.output_hint ? <span className="rounded-[6px] bg-[var(--surface-soft)] px-[8px] py-[5px] text-caption leading-[1.5] text-[var(--slate)]">输出：{task.output_hint}</span> : null}
                </button>
                <div className="mt-auto flex flex-wrap items-center gap-[6px] border-t border-[var(--hairline)] pt-[10px]">
                  <button type="button" className={action} onClick={() => showInspector({ kind: "task", taskId: task.id })}>预览</button>
                  {manage ? <>
                  <button type="button" className={action} onClick={() => showInspector({ kind: "task", taskId: task.id, edit: true })}>修改</button>
                  <button type="button" className={action} disabled={busy} onClick={() => { uploadFor.current = { kind: "task", task }; upload.current?.click(); }}>上传</button>
                  {task.kind === "custom" ? <button type="button" className={danger} disabled={busy} onClick={() => void removeTask(task)}>{task.version ? "归档" : "删除"}</button> : null}
                  </> : null}
                  <span className="flex-1" />
                  <button type="button" disabled={!usable || busy} title={usable ? "" : "草稿发布后才能使用"}
                    onClick={() => void navigate(`/chat?task=${encodeURIComponent(task.id)}`)}
                    className="rounded-[6px] bg-[var(--primary)] px-[10px] py-[4px] text-caption text-white disabled:opacity-45">开始分析</button>
                </div>
              </article>
            );
          })}
      {/* 存量分析's own report templates (query 2026-1014 1820); 情报分析's are on its page. */}
      <div className="col-span-full border-t border-[var(--hairline)] pt-[16px]"><TemplateLibrary area="analysis" /></div>
      {showArchived ? (
        <section aria-label="已归档" className="col-span-full rounded-[10px] border border-dashed border-[var(--hairline-strong)] p-[14px]">
          <h2 className="text-body font-semibold text-[var(--ink)]">已归档的任务模版 <span className="font-normal text-[var(--stone)]">· 不能用于新的分析，已绑定的历史版本仍可回看</span></h2>
          {!archivedTasks.length ? <p className="mt-[8px] text-caption text-[var(--stone)]">没有已归档的任务模版。</p> : null}
          <ul className="mt-[8px] space-y-[6px] text-body">
            {archivedTasks.map((item) =>
              <li key={item.id} className="flex items-center gap-[8px]">
                <button type="button" className="text-left text-[var(--link)] hover:underline"
                  onClick={() => showInspector({ kind: "task", taskId: item.id })}>{item.name}</button>
                <span className="text-[var(--stone)]">v{item.version}</span>
                <button type="button" className={action} disabled={busy} onClick={() => void restore(item)}>恢复</button>
              </li>)}
          </ul>
        </section>
      ) : null}
    </ViewShell>
  );
}
