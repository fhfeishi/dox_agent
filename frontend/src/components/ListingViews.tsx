import { useEffect, useRef, useState, type ReactNode } from "react";
import { copyTask, copyTemplate, fetchTemplates, saveTaskDraft, saveTemplateDraft, type TaskInfo, type TemplateSummary } from "../api";
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

const UPLOAD_LIMIT = { task: 4000, template: 20000 };

export function TasksView() {
  const { tasks, tasksError, taskId, showInspector, taskCapable, refreshTasks, startTask } = useApp();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<TaskInfo | null>(null);
  useEffect(() => { void fetchTemplates().then(setTemplates).catch(() => setTemplates([])); }, []);

  async function run(task: TaskInfo, work: () => Promise<void>) {
    setBusy(task.id); setMessage("");
    try { await work(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(""); }
  }

  // Built-in tasks are read-only; modifying one creates "my task" from it and opens the editor.
  const editable = async (task: TaskInfo) => task.kind === "custom" ? task : await copyTask(task.id);

  const modify = (task: TaskInfo) => run(task, async () => {
    const target = await editable(task);
    if (target.id !== task.id) await refreshTasks();
    showInspector({ kind: "task", taskId: target.id });
    if (target.id !== task.id) setMessage(`已复制为“${target.name}”草稿，可在右侧修改后发布`);
  });

  async function uploaded(file: File) {
    const task = uploadFor.current;
    if (!task) return;
    const text = (await file.text()).trim();
    const report = (task.engine_task_id ?? task.id) === "task4";
    const limit = report ? UPLOAD_LIMIT.template : UPLOAD_LIMIT.task;
    if (!text) { setMessage("上传的文件没有文字内容"); return; }
    if (text.length > limit) { setMessage(`文件约 ${text.length} 字，超过 ${limit} 字上限，请精简后上传`); return; }
    const name = file.name.replace(/\.(md|markdown|txt)$/i, "").slice(0, 80) || "上传的模板";
    await run(task, async () => {
      if (report) {
        // A report task's template is its section structure: uploads become a custom report template.
        const copy = await copyTemplate("comprehensive");
        const saved = await saveTemplateDraft(copy.id, copy.revision, { name, content: text, purpose: `上传自 ${file.name}` });
        setTemplates(await fetchTemplates());
        showInspector({ kind: "template", templateId: saved.id });
        setMessage(`已上传为报告模板“${saved.name}”草稿，请在右侧核对后发布`);
        return;
      }
      const target = await editable(task);
      await saveTaskDraft({ ...target, output_instructions: text });
      await refreshTasks();
      showInspector({ kind: "task", taskId: target.id });
      setMessage(`已将“${file.name}”写入“${target.name}”的输出说明草稿，请在右侧核对后发布`);
    });
  }

  const action = "rounded-[6px] border border-[var(--hairline)] px-[9px] py-[4px] text-[12px] text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-45";
  return (
    <ViewShell
      title="存量分析"
      description="选择一个任务模板开始分析。每张卡片可预览模板、修改模板或上传自己的模板；内置模板只读，修改和上传会生成“我的任务”草稿，发布后使用。生成的报告统一在右侧检查器的“成果”中查看、编辑和回收。"
      actions={<Button onClick={() => showInspector({ kind: "results" })}>成果与回收站</Button>}
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
        ? tasks.map((task, index) => {
            const style = TASK_STYLE[index % TASK_STYLE.length];
            const archived = task.status === "archived" || task.archived;
            const usable = !archived && (task.status !== "draft" || Boolean(task.version));
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
                    {task.kind === "custom" ? <Pill tone={archived ? "yellow" : "lav"}>{archived ? "已归档" : task.status === "published" ? `我的任务 · v${task.version}` : task.version ? `草稿 · 已发布 v${task.version}` : "草稿"}</Pill> : <Pill tone="sky">内置</Pill>}
                  </span>
                  <span className="text-[12.3px] leading-[1.55] text-[var(--steel)]">{task.description}</span>
                  {task.output_hint ? <span className="rounded-[6px] bg-[var(--surface-soft)] px-[8px] py-[5px] text-[11.5px] leading-[1.5] text-[var(--slate)]">输出：{task.output_hint}</span> : null}
                </button>
                <div className="mt-auto flex flex-wrap gap-[6px] border-t border-[var(--hairline)] pt-[10px]">
                  <button type="button" className={action} onClick={() => showInspector({ kind: "task", taskId: task.id })}>预览模板</button>
                  <button type="button" className={action} disabled={Boolean(busy)} onClick={() => void modify(task)}>修改模板</button>
                  <button type="button" className={action} disabled={Boolean(busy)} onClick={() => { uploadFor.current = task; upload.current?.click(); }}>上传模板</button>
                  <span className="flex-1" />
                  <button type="button" disabled={!usable || Boolean(busy)} onClick={() => void startTask(task.id)}
                    className="rounded-[6px] bg-[var(--primary)] px-[10px] py-[4px] text-[12px] text-white disabled:opacity-45">开始分析</button>
                </div>
              </article>
            );
          })
        : null}
      {taskCapable && templates.length ? (
        <section className="col-span-full border-t border-[var(--hairline)] pt-[14px]">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">报告模板 <span className="font-normal text-[var(--stone)]">· 专项报告按所选模板章节生成</span></h2>
          <div className="mt-[8px] flex flex-wrap gap-[6px]">
            {templates.map((t) => <button key={t.id} type="button" onClick={() => showInspector({ kind: "template", templateId: t.id })}
              className="rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] px-[10px] py-[5px] text-[12px] text-[var(--link)] hover:bg-[var(--primary-soft)]">
              {t.name}{t.kind === "custom" ? " · 自定义" : ""}
            </button>)}
          </div>
        </section>
      ) : null}
    </ViewShell>
  );
}
