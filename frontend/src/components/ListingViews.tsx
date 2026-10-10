import { useEffect, useRef, useState, type ReactNode } from "react";
import { archiveCustomTemplate, archiveTask, copyTask, copyTemplate, deleteCustomTemplate, deleteTask, fetchTemplates, restoreCustomTemplate, restoreTask, saveTaskDraft, saveTemplateDraft, type TaskInfo, type TemplateSummary } from "../api";
import { TEMPLATES_CHANGED, sectionsOf, statusLabel } from "./TemplatePanels";
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

const UPLOAD_LIMIT = { task: 8000, template: 20000 };
const fileName = (file: File, fallback: string) => file.name.replace(/\.(md|markdown|txt)$/i, "").slice(0, 80) || fallback;

/**
 * 存量分析 (query 2026-1009 1541): task cards and the report template library. Preview and
 * modify open the same outline view (modify starts in edit mode); unpublished drafts can be
 * deleted, published ones archived and restored from the archived list.
 */
export function TasksView() {
  const { tasks, tasksError, taskId, showInspector, taskCapable, refreshTasks, startTask } = useApp();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<{ kind: "task"; task: TaskInfo } | { kind: "template" } | null>(null);

  const loadTemplates = () => fetchTemplates(undefined, true).then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => {
    void loadTemplates();
    const reload = () => void loadTemplates();
    window.addEventListener(TEMPLATES_CHANGED, reload);
    return () => window.removeEventListener(TEMPLATES_CHANGED, reload);
  }, []);

  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  const removeTask = (task: TaskInfo) => run(async () => {
    if (task.version) { await archiveTask(task.id); setMessage(`已归档“${task.name}”，可在“已归档”中恢复`); }
    else if (window.confirm(`删除未发布的草稿“${task.name}”？`)) { await deleteTask(task.id); setMessage(`已删除草稿“${task.name}”`); }
    await refreshTasks();
  });
  const removeTemplate = (template: TemplateSummary) => run(async () => {
    if (template.version) { await archiveCustomTemplate(template.id); setMessage(`已归档模板“${template.name}”`); }
    else if (window.confirm(`删除未发布的模板草稿“${template.name}”？`)) { await deleteCustomTemplate(template.id); setMessage(`已删除模板草稿“${template.name}”`); }
    await loadTemplates();
  });
  const restore = (item: TaskInfo | TemplateSummary, kind: "task" | "template") => run(async () => {
    if (kind === "task") { await restoreTask(item.id); await refreshTasks(); }
    else { await restoreCustomTemplate(item.id); await loadTemplates(); }
    setMessage(`已恢复“${item.name}”`);
  });

  async function uploaded(file: File) {
    const target = uploadFor.current;
    if (!target) return;
    const text = (await file.text()).trim();
    const report = target.kind === "template" || (target.task.engine_task_id ?? target.task.id) === "task4";
    const limit = report ? UPLOAD_LIMIT.template : UPLOAD_LIMIT.task;
    if (!text) { setMessage("上传的文件没有文字内容"); return; }
    if (text.length > limit) { setMessage(`文件约 ${text.length} 字，超过 ${limit} 字上限，请精简后上传`); return; }
    await run(async () => {
      if (report) {
        // Report structure lives in the template library; an upload becomes "my template".
        const copy = await copyTemplate("comprehensive");
        const variables = [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];
        const saved = await saveTemplateDraft(copy.id, copy.revision, { name: fileName(file, "上传的模板"), content: text, purpose: `上传自 ${file.name}`, variables });
        await loadTemplates();
        showInspector({ kind: "template", templateId: saved.id, edit: true });
        setMessage(`已上传为模板库草稿“${saved.name}”，请在右侧核对后发布`);
        return;
      }
      const task = target.task;
      const copy = task.kind === "custom" ? task : await copyTask(task.id);
      await saveTaskDraft({ ...copy, name: task.kind === "custom" ? copy.name : fileName(file, copy.name), outline: text });
      await refreshTasks();
      showInspector({ kind: "task", taskId: copy.id, edit: true });
      setMessage(`已将“${file.name}”作为任务大纲写入草稿，请在右侧核对后发布`);
    });
  }

  const action = "rounded-[6px] border border-[var(--hairline)] px-[9px] py-[4px] text-[12px] text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-45";
  const danger = "rounded-[6px] px-[7px] py-[4px] text-[12px] text-[var(--stone)] hover:text-[var(--red)] disabled:opacity-45";
  // The store keeps archived tasks so old sessions still resolve their names; the page splits them.
  const isArchived = (item: { archived?: boolean; status?: string }) => Boolean(item.archived) || item.status === "archived";
  const liveTasks = tasks.filter((t) => !isArchived(t));
  const archivedTasks = tasks.filter(isArchived);
  const live = templates.filter((t) => !t.archived && t.status !== "archived");
  const archivedTemplates = templates.filter((t) => t.archived || t.status === "archived");
  return (
    <ViewShell
      title="存量分析"
      description="选择任务开始分析。预览与修改打开同一个大纲视图：内置任务和模板只读，修改后保存为“我的任务/我的模板”，发布后使用。未发布的草稿可直接删除，已发布的可归档。生成的报告在右侧检查器的“成果”中查看。"
      actions={<>
        <Button variant="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "隐藏已归档" : "已归档"}</Button>
        <Button onClick={() => showInspector({ kind: "results" })}>成果与回收站</Button>
      </>}
    >
      <input ref={upload} type="file" accept=".md,.markdown,.txt" className="hidden" aria-label="上传模板文件"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploaded(file); }} />
      {!taskCapable ? (
        <div className="col-span-full rounded-[12px] border border-dashed border-[var(--hairline-strong)] bg-[var(--surface-soft)] p-[24px] text-center">
          <p className="text-[13.5px] font-medium text-[var(--ink)]">任务功能未启用</p>
          <p className="mx-auto mt-[8px] max-w-[520px] text-[12.5px] leading-[1.6] text-[var(--steel)]">
            设置 <code className="font-code">VITE_UI_TASKS=1</code> 后重新构建前端，即可启用任务选择与 chat <code className="font-code">task_id</code> 绑定。
          </p>
        </div>
      ) : null}
      {taskCapable && tasksError ? <p role="alert" className="col-span-full text-[13px] text-[var(--red)]">{tasksError}</p> : null}
      {message ? <p role="status" className="col-span-full text-[13px] text-[var(--steel)]">{message}</p> : null}
      {taskCapable && !tasks.length && !tasksError ? (
        <p className="text-[13px] text-[var(--stone)]">正在读取任务列表…</p>
      ) : null}
      {taskCapable
        ? liveTasks.map((task, index) => {
            const style = TASK_STYLE[index % TASK_STYLE.length];
            const usable = task.status !== "draft" || Boolean(task.version);
            return (
              <article key={task.id}
                className="font-app flex flex-col gap-[10px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[16px] transition-[border-color,box-shadow] hover:border-[var(--primary)] hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)]">
                <button type="button" onClick={() => showInspector({ kind: "task", taskId: task.id })} className="flex flex-col gap-[10px] text-left">
                  <span className="grid size-[34px] place-items-center rounded-[8px]" style={{ background: style.tint, color: style.fg }}>
                    <Icon name={style.icon} size={16} strokeWidth={1.9} />
                  </span>
                  <span className="flex flex-wrap items-center gap-[8px] text-[14px] font-semibold text-[var(--ink)]">
                    {task.name}
                    {task.id === taskId ? <Pill tone="lav">当前</Pill> : null}
                    <Pill tone={task.kind === "custom" ? "lav" : "sky"}>{task.kind === "custom" ? `我的任务 · ${statusLabel(task)}` : "内置"}</Pill>
                  </span>
                  <span className="text-[12.3px] leading-[1.55] text-[var(--steel)]">{task.description}</span>
                  {task.output_hint ? <span className="rounded-[6px] bg-[var(--surface-soft)] px-[8px] py-[5px] text-[11.5px] leading-[1.5] text-[var(--slate)]">输出：{task.output_hint}</span> : null}
                </button>
                <div className="mt-auto flex flex-wrap items-center gap-[6px] border-t border-[var(--hairline)] pt-[10px]">
                  <button type="button" className={action} onClick={() => showInspector({ kind: "task", taskId: task.id })}>预览</button>
                  <button type="button" className={action} onClick={() => showInspector({ kind: "task", taskId: task.id, edit: true })}>修改</button>
                  <button type="button" className={action} disabled={busy} onClick={() => { uploadFor.current = { kind: "task", task }; upload.current?.click(); }}>上传</button>
                  {task.kind === "custom" ? <button type="button" className={danger} disabled={busy} onClick={() => void removeTask(task)}>{task.version ? "归档" : "删除"}</button> : null}
                  <span className="flex-1" />
                  <button type="button" disabled={!usable || busy} onClick={() => void startTask(task.id)} title={usable ? "" : "草稿发布后才能使用"}
                    className="rounded-[6px] bg-[var(--primary)] px-[10px] py-[4px] text-[12px] text-white disabled:opacity-45">开始分析</button>
                </div>
              </article>
            );
          })
        : null}
      {taskCapable ? (
        <section aria-label="报告模板库" className="col-span-full border-t border-[var(--hairline)] pt-[16px]">
          <div className="flex flex-wrap items-baseline gap-[10px]">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">报告模板库</h2>
            <span className="text-[12px] text-[var(--stone)]">专项报告按所选模板的章节大纲生成；报告型任务在修改时从这里选择模板</span>
            <span className="flex-1" />
            <button type="button" className={action} disabled={busy} onClick={() => { uploadFor.current = { kind: "template" }; upload.current?.click(); }}>上传模板</button>
          </div>
          <div className="mt-[10px] grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[10px]">
            {live.map((t) => {
              const sections = sectionsOf(t.content);
              return <article key={t.id} className="flex flex-col gap-[6px] rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-[12px]">
                <button type="button" onClick={() => showInspector({ kind: "template", templateId: t.id })} className="flex flex-col gap-[6px] text-left">
                  <span className="flex flex-wrap items-center gap-[6px] text-[13px] font-semibold text-[var(--ink)]">{t.name}<Pill tone={t.kind === "custom" ? "lav" : "sky"}>{statusLabel(t)}</Pill></span>
                  <span className="line-clamp-2 text-[11.5px] leading-[1.5] text-[var(--steel)]">{sections.length ? `${sections.length} 节：${sections.join(" · ")}` : t.purpose || "无章节"}</span>
                </button>
                <div className="mt-auto flex flex-wrap gap-[6px] pt-[4px]">
                  <button type="button" className={action} onClick={() => showInspector({ kind: "template", templateId: t.id })}>预览</button>
                  <button type="button" className={action} onClick={() => showInspector({ kind: "template", templateId: t.id, edit: true })}>修改</button>
                  {t.kind === "custom" ? <button type="button" className={danger} disabled={busy} onClick={() => void removeTemplate(t)}>{t.version ? "归档" : "删除"}</button> : null}
                </div>
              </article>;
            })}
          </div>
        </section>
      ) : null}
      {taskCapable && showArchived ? (
        <section aria-label="已归档" className="col-span-full rounded-[10px] border border-dashed border-[var(--hairline-strong)] p-[14px]">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">已归档 <span className="font-normal text-[var(--stone)]">· 不能用于新的分析，已绑定的历史版本仍可回看</span></h2>
          {!archivedTasks.length && !archivedTemplates.length ? <p className="mt-[8px] text-[12px] text-[var(--stone)]">没有已归档的任务或模板。</p> : null}
          <ul className="mt-[8px] space-y-[6px] text-[12.5px]">
            {[...archivedTasks.map((item) => ({ item, kind: "task" as const })), ...archivedTemplates.map((item) => ({ item, kind: "template" as const }))].map(({ item, kind }) =>
              <li key={item.id} className="flex items-center gap-[8px]">
                <Pill tone="yellow">{kind === "task" ? "任务" : "模板"}</Pill>
                <button type="button" className="text-left text-[var(--link)] hover:underline"
                  onClick={() => showInspector(kind === "task" ? { kind: "task", taskId: item.id } : { kind: "template", templateId: item.id })}>{item.name}</button>
                <span className="text-[var(--stone)]">v{item.version}</span>
                <button type="button" className={action} disabled={busy} onClick={() => void restore(item, kind)}>恢复</button>
              </li>)}
          </ul>
        </section>
      ) : null}
    </ViewShell>
  );
}
