import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  archiveCustomTemplate, archiveTask, copyTask, copyTemplate, deleteCustomTemplate, deleteTask, fetchCustomTask,
  fetchCustomTemplate, fetchTemplate, fetchTemplates, publishTask, publishTemplate, restoreCustomTemplate, restoreTask,
  saveTaskDraft, saveTemplateDraft, type TaskInfo, type TaskParameter, type TemplateInfo, type TemplateSummary,
} from "../api";
import { useApp } from "../store";
import { Button, Card, Pill } from "./ui";

/**
 * Task and report templates (query 2026-1009 1541): one view that reads as an outline and turns
 * into an editor in place. Built-ins stay read-only; saving an edit of a built-in creates "my"
 * copy only at that moment, so browsing never leaves empty drafts behind.
 */

export const TEMPLATES_CHANGED = "dox-templates-changed";
const announce = () => window.dispatchEvent(new Event(TEMPLATES_CHANGED));

const field = "mt-[4px] w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] p-[7px] text-[12px] text-[var(--ink)]";
const outlineBox = "font-code mt-[4px] w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] p-[8px] text-[12px] leading-[1.6] text-[var(--ink)]";
const VARIABLES = ["domain", "year_range", "year_from", "year_to", "fund_type", "focus"];

const archivedOf = (item: { status?: string; archived?: boolean }) => item.status === "archived" || Boolean(item.archived);

export function statusLabel(item: { kind?: string; status?: string; archived?: boolean; version?: number }) {
  if (item.kind !== "custom") return "内置";
  if (archivedOf(item)) return "已归档";
  if (item.status === "published") return `已发布 v${item.version}`;
  return item.version ? `草稿 · 已发布 v${item.version}` : "未发布草稿";
}

/** Older custom tasks kept their text in separate fields; the editor shows them as one outline. */
function outlineOf(task: TaskInfo) {
  if (task.outline?.trim()) return task.outline;
  const parts = ([["背景", task.background], ["目标", task.goal], ["具体要求", task.requirements], ["任务类别", task.category],
    ["适用边界", task.boundaries], ["需要澄清的条件", task.clarification_conditions], ["输出要求", task.output_instructions]] as const)
    .filter(([, text]) => text?.trim()).map(([label, text]) => `## ${label}\n${text}`);
  return parts.join("\n\n");
}

/** Declared variables follow the outline text, so authors never keep a second list in sync. */
const variablesIn = (content: string) => [...new Set([...content.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];

const hasHeading = (content: string) => /^#{1,6}\s+\S/m.test(content);

/** Chapter titles for cards (the level-1 line is the template's own title). */
export function sectionsOf(content = "") {
  return [...content.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim()).filter((title) => !title.includes("{{"));
}

function Outline({ text }: { text: string }) {
  return text.trim()
    ? <div className="markdown mt-[10px] rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[12px] py-[8px]"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
    : <p className="mt-[10px] text-[12px] text-[var(--stone)]">还没有大纲。</p>;
}

/** Same editor for every outline: write it, or flip to see how it reads. */
function OutlineEditor({ label, value, onChange, rows = 14 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  const [preview, setPreview] = useState(false);
  return <div>
    <div className="flex items-center justify-between text-[12px] text-[var(--slate)]">
      <span>{label}</span>
      <button type="button" className="text-[var(--link)]" onClick={() => setPreview(!preview)}>{preview ? "继续编辑" : "预览效果"}</button>
    </div>
    {preview ? <Outline text={value} /> : <textarea aria-label={label} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={outlineBox} />}
  </div>;
}

function Lifecycle({ item, busy, onDelete, onArchive }: {
  item: { kind?: string; status?: string; archived?: boolean; version?: number }; busy: boolean;
  onDelete: () => void; onArchive: (archived: boolean) => void;
}) {
  if (item.kind !== "custom") return null;
  if (!item.version) return <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete}>删除草稿</Button>;
  return <Button size="sm" variant="ghost" disabled={busy} onClick={() => onArchive(!archivedOf(item))}>{archivedOf(item) ? "恢复" : "归档"}</Button>;
}

function ParameterEditor({ parameters, onChange }: { parameters: TaskParameter[]; onChange: (next: TaskParameter[]) => void }) {
  const change = (index: number, value: Partial<TaskParameter>) => onChange(parameters.map((item, i) => i === index ? { ...item, ...value } : item));
  return <details className="rounded-[8px] border border-[var(--hairline)] px-[10px] py-[7px] text-[12px] text-[var(--slate)]">
    <summary className="cursor-pointer">高级：运行时输入参数（{parameters.length}）</summary>
    <p className="mt-[6px] text-[11px] text-[var(--stone)]">需要用户每次运行时填写的值，例如关注的技术方向。大多数任务不需要。</p>
    {parameters.map((item, index) => <div key={index} className="mt-[8px] rounded-[6px] border border-[var(--hairline)] p-[7px] text-[11px]">
      <div className="flex gap-[5px]">
        <input aria-label={`参数${index + 1}名称`} value={item.key} onChange={(e) => change(index, { key: e.target.value })} placeholder="英文标识" className="min-w-0 flex-1 rounded border border-[var(--hairline)] p-[4px]" />
        <input aria-label={`参数${index + 1}标签`} value={item.label} onChange={(e) => change(index, { label: e.target.value })} placeholder="显示名称" className="min-w-0 flex-1 rounded border border-[var(--hairline)] p-[4px]" />
        <button type="button" className="text-[var(--red)]" onClick={() => onChange(parameters.filter((_, i) => i !== index))}>删除</button>
      </div>
      <div className="mt-[5px] flex items-center gap-[6px]">
        <select aria-label={`参数${index + 1}类型`} value={item.type} onChange={(e) => change(index, { type: e.target.value as TaskParameter["type"], default: undefined, options: [] })} className="rounded border border-[var(--hairline)] p-[4px]">
          <option value="text">文本</option><option value="integer">整数</option><option value="enum">选项</option><option value="boolean">是/否</option><option value="year_range">年份区间</option>
        </select>
        <label><input type="checkbox" checked={Boolean(item.required)} onChange={(e) => change(index, { required: e.target.checked })} /> 必填</label>
      </div>
      {item.type === "enum" ? <input aria-label={`参数${index + 1}选项`} value={item.options?.join("，") ?? ""} placeholder="用逗号分隔选项"
        onChange={(e) => change(index, { options: e.target.value.split(/[，,]/).map((v) => v.trim()).filter(Boolean) })} className="mt-[5px] w-full rounded border border-[var(--hairline)] p-[4px]" /> : null}
      {item.type === "text" || item.type === "integer" ? <input aria-label={`参数${index + 1}默认`} type={item.type === "integer" ? "number" : "text"} value={item.default == null ? "" : String(item.default)} placeholder="默认值（可选）"
        onChange={(e) => change(index, { default: e.target.value === "" ? undefined : item.type === "integer" ? Number(e.target.value) : e.target.value })} className="mt-[5px] w-full rounded border border-[var(--hairline)] p-[4px]" /> : null}
    </div>)}
    <button type="button" className="mt-[8px] text-[var(--link)]" onClick={() => onChange([...parameters, { key: `input_${parameters.length + 1}`, label: "新参数", type: "text" }])}>添加参数</button>
  </details>;
}

export function TaskTemplatePanel({ taskId, edit }: { taskId: string; edit: boolean }) {
  const { tasks, refreshTasks, startTask, showInspector, toggleInspector } = useApp();
  const [task, setTask] = useState<TaskInfo | null>(() => tasks.find((t) => t.id === taskId) ?? null);
  const [draft, setDraft] = useState<TaskInfo | null>(null);
  const [library, setLibrary] = useState<TemplateSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const listed = tasks.find((t) => t.id === taskId);
    if (listed) setTask(listed);
    else if (taskId.startsWith("custom-")) void fetchCustomTask(taskId).then(setTask, (e: Error) => setMessage(e.message));
  }, [taskId, tasks]);
  useEffect(() => { void fetchTemplates(undefined, true).then(setLibrary, () => setLibrary([])); }, []);
  useEffect(() => {
    if (edit && task && !draft) setDraft({ ...task, name: task.kind === "custom" ? task.name : `${task.name}（我的）`, outline: outlineOf(task) });
  }, [edit, task, draft]);

  if (!task) return <Card>{message || "正在读取任务…"}</Card>;
  const engine = task.engine_task_id ?? task.id;
  const report = engine === "task4";
  const archived = archivedOf(task);

  async function act(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  const save = (publish: boolean) => act(async () => {
    if (!draft) return;
    // Editing a built-in creates the user's copy now; the outline replaces the older field set.
    const target = task.kind === "custom" ? task : await copyTask(task.id);
    const saved = await saveTaskDraft({ ...draft, id: target.id, revision: target.revision,
      background: "", goal: "", requirements: "", category: "", boundaries: "", clarification_conditions: "", output_instructions: "" });
    const result = publish ? await publishTask(saved) : saved;
    await refreshTasks();
    setDraft(null);
    showInspector({ kind: "task", taskId: result.id });
    setMessage(publish ? `已发布 v${result.version}，可在任务卡片中开始分析` : "草稿已保存，发布后可用于分析");
  });

  const remove = () => act(async () => {
    if (!window.confirm(`删除未发布的草稿“${task.name}”？`)) return;
    await deleteTask(task.id);
    await refreshTasks();
    toggleInspector();  // the deleted item has nothing left to show
  });

  const archive = (value: boolean) => act(async () => {
    setTask(value ? await archiveTask(task.id) : await restoreTask(task.id));
    await refreshTasks();
  });

  const published = library.filter((t) => !archivedOf(t) && (t.kind !== "custom" || Boolean(t.version)));
  const bound = library.find((t) => t.id === task.report_template_id);

  if (edit && draft) return <Card>
    <p className="text-[11.5px] text-[var(--stone)]">{task.kind === "custom" ? `编辑“${task.name}”· 保存为新草稿，发布后生效` : `基于内置“${task.name}”编辑 · 保存后生成“我的任务”`}</p>
    <div className="mt-[10px] space-y-[10px]">
      <label className="block text-[12px] text-[var(--slate)]">名称<input aria-label="任务名称" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} /></label>
      <label className="block text-[12px] text-[var(--slate)]">一句话用途<input aria-label="任务用途" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={field} /></label>
      <OutlineEditor label="任务大纲" value={draft.outline ?? ""} onChange={(outline) => setDraft({ ...draft, outline })} />
      <p className="text-[11px] leading-[1.6] text-[var(--stone)]">用“## 标题 + 要点”写清目标、输出结构和要求即可。引用来源、资料不足时说明缺口等内置规则始终生效，大纲只能细化不能放宽。</p>
      {report ? <label className="block text-[12px] text-[var(--slate)]">报告模板（来自模板库）
        <select aria-label="报告模板" value={draft.report_template_id ? `${draft.report_template_id}|${draft.report_template_version ?? 0}` : ""} className={field}
          onChange={(e) => { const [id, version] = e.target.value.split("|"); setDraft({ ...draft, report_template_id: id || undefined, report_template_version: id ? Number(version) || 0 : undefined }); }}>
          <option value="">请选择已发布模板</option>
          {published.map((t) => { const version = t.kind === "custom" ? t.version ?? 0 : 0;
            return <option key={`${t.id}|${version}`} value={`${t.id}|${version}`}>{t.name} · {t.kind === "custom" ? `我的 v${version}` : "内置"}</option>; })}
        </select>
      </label> : null}
      <ParameterEditor parameters={draft.parameters ?? []} onChange={(parameters) => setDraft({ ...draft, parameters })} />
      <div className="flex flex-wrap gap-[6px]">
        <Button disabled={busy || !draft.name.trim() || !draft.outline?.trim()} onClick={() => void save(false)}>保存草稿</Button>
        <Button disabled={busy || !draft.name.trim() || !draft.outline?.trim()} onClick={() => void save(true)}>保存并发布</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setDraft(null); showInspector({ kind: "task", taskId: task.id }); }}>取消</Button>
      </div>
      {message ? <p role="status" className="text-[12px] text-[var(--steel)]">{message}</p> : null}
    </div>
  </Card>;

  const outline = task.kind === "custom" ? outlineOf(task) : task.outline ?? "";
  const usable = !archived && (task.status !== "draft" || Boolean(task.version));
  return <Card>
    <div className="flex flex-wrap items-center gap-[8px]">
      <h2 className="text-[15px] font-semibold text-[var(--ink)]">{task.name}</h2>
      <Pill tone={task.kind === "custom" ? (archived ? "yellow" : "lav") : "sky"}>{statusLabel(task)}</Pill>
    </div>
    <p className="mt-[6px] text-[12.5px] leading-[1.6] text-[var(--steel)]">{task.description}</p>
    {archived ? <p className="mt-[6px] text-[12px] text-[#8a3d00]">已归档，不能用于新的分析；恢复后可继续使用。</p> : null}
    <div className="mt-[10px] flex flex-wrap gap-[6px]">
      {!archived ? <Button size="sm" disabled={busy} onClick={() => showInspector({ kind: "task", taskId: task.id, edit: true })}>{task.kind === "custom" ? "编辑大纲" : "编辑（保存为我的任务）"}</Button> : null}
      {usable ? <Button size="sm" disabled={busy} onClick={() => void startTask(task.id)}>{task.status === "draft" ? "用已发布版本分析" : "开始分析"}</Button> : null}
      <Lifecycle item={task} busy={busy} onDelete={() => void remove()} onArchive={(value) => void archive(value)} />
    </div>
    {message ? <p role="status" className="mt-[6px] text-[12px] text-[var(--steel)]">{message}</p> : null}
    <div className="mt-[14px] text-[11px] font-semibold tracking-[0.5px] text-[var(--stone)]">任务大纲</div>
    <Outline text={outline} />
    {report ? <div className="mt-[12px] text-[12px] text-[var(--slate)]">
      <div className="text-[11px] font-semibold tracking-[0.5px] text-[var(--stone)]">报告模板</div>
      <div className="mt-[6px] flex flex-wrap gap-[6px]">
        {(task.kind === "custom" ? (bound ? [bound] : []) : library.filter((t) => t.kind !== "custom")).map((t) =>
          <button key={t.id} type="button" onClick={() => showInspector({ kind: "template", templateId: t.id })}
            className="rounded-[6px] border border-[var(--hairline)] px-[8px] py-[5px] text-[11.5px] text-[var(--link)] hover:bg-[var(--primary-soft)]">{t.name}</button>)}
        {task.kind === "custom" && !bound ? <span className="text-[var(--stone)]">未绑定，编辑时从模板库选择</span> : null}
      </div>
    </div> : null}
    {task.parameters?.length ? <p className="mt-[10px] text-[12px] text-[var(--slate)]">运行时填写：{task.parameters.map((p) => p.label).join("、")}</p> : null}
    {task.kind !== "custom" && task.prompt ? <details className="mt-[12px] text-[12px] text-[var(--slate)]">
      <summary className="cursor-pointer">内置执行规则（只读）</summary>
      <pre className="font-code mt-[6px] max-h-[260px] overflow-auto whitespace-pre-wrap rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] p-[8px] text-[11.5px] leading-[1.6] text-[var(--ink)]">{task.prompt}</pre>
    </details> : null}
    {task.kind === "custom" ? <p className="mt-[10px] text-[11px] text-[var(--stone)]">执行方式沿用内置“{tasks.find((t) => t.id === engine)?.name ?? engine}”，大纲在其规则之上细化。</p> : null}
  </Card>;
}

export function ReportTemplatePanel({ templateId, edit }: { templateId: string; edit: boolean }) {
  const { showInspector, toggleInspector } = useApp();
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [draft, setDraft] = useState<{ name: string; purpose: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const custom = templateId.startsWith("custom-");

  useEffect(() => {
    let active = true;
    setTemplate(null);
    void (custom ? fetchCustomTemplate(templateId) : fetchTemplate(templateId)).then(
      (item) => { if (active) setTemplate(item); }, (e: Error) => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [templateId, custom]);
  useEffect(() => {
    if (edit && template && !draft) setDraft({ name: custom ? template.name : `${template.name}（我的）`, purpose: template.purpose ?? "", content: template.content });
  }, [edit, template, draft, custom]);

  if (!template) return <Card>{message || "正在读取模板…"}</Card>;
  const archived = archivedOf(template);

  async function act(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  const save = (publish: boolean) => act(async () => {
    if (!draft) return;
    const target = custom ? { id: template.id, revision: template.revision ?? 1 } : await copyTemplate(template.id);
    const saved = await saveTemplateDraft(target.id, target.revision, { ...draft, variables: variablesIn(draft.content) });
    const result = publish ? await publishTemplate(saved.id, saved.revision) : saved;
    announce();
    setDraft(null);
    showInspector({ kind: "template", templateId: result.id });
  });

  const remove = () => act(async () => {
    if (!window.confirm(`删除未发布的模板草稿“${template.name}”？`)) return;
    await deleteCustomTemplate(template.id);
    announce();
    toggleInspector();  // the deleted item has nothing left to show
  });

  const archive = (value: boolean) => act(async () => {
    setTemplate(value ? await archiveCustomTemplate(template.id) : await restoreCustomTemplate(template.id));
    announce();
  });

  if (edit && draft) {
    const unknown = variablesIn(draft.content).filter((v) => !VARIABLES.includes(v));
    return <Card>
      <p className="text-[11.5px] text-[var(--stone)]">{custom ? `编辑“${template.name}”· 发布为新版本，旧报告不受影响` : `基于内置“${template.name}”编辑 · 保存后加入模板库“我的模板”`}</p>
      <div className="mt-[10px] space-y-[10px]">
        <label className="block text-[12px] text-[var(--slate)]">名称<input aria-label="模板名称" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} /></label>
        <label className="block text-[12px] text-[var(--slate)]">一句话用途<input aria-label="模板用途" value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} className={field} /></label>
        <OutlineEditor label="章节大纲" rows={16} value={draft.content} onChange={(content) => setDraft({ ...draft, content })} />
        <p className="text-[11px] leading-[1.6] text-[var(--stone)]">每个“## 章节”下用一两句写该节要写什么即可，报告按此顺序生成。可插入 {VARIABLES.map((v) => `{{${v}}}`).join(" ")}，生成时替换为本次参数。</p>
        {unknown.length ? <p role="alert" className="text-[12px] text-[var(--red)]">不支持的变量：{unknown.join("、")}</p> : null}
        <div className="flex flex-wrap gap-[6px]">
          <Button disabled={busy || !draft.name.trim() || !hasHeading(draft.content) || unknown.length > 0} onClick={() => void save(false)}>保存草稿</Button>
          <Button disabled={busy || !draft.name.trim() || !hasHeading(draft.content) || unknown.length > 0} onClick={() => void save(true)}>保存并发布</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { setDraft(null); showInspector({ kind: "template", templateId: template.id }); }}>取消</Button>
        </div>
        {message ? <p role="status" className="text-[12px] text-[var(--steel)]">{message}</p> : null}
      </div>
    </Card>;
  }

  return <Card>
    <div className="flex flex-wrap items-center gap-[8px]">
      <h2 className="text-[15px] font-semibold text-[var(--ink)]">{template.name}</h2>
      <Pill tone={custom ? (archived ? "yellow" : "lav") : "sky"}>{statusLabel(template)}</Pill>
    </div>
    {template.purpose ? <p className="mt-[6px] text-[12.5px] text-[var(--steel)]">{template.purpose}</p> : null}
    {archived ? <p className="mt-[6px] text-[12px] text-[#8a3d00]">已归档，不能绑定到新任务；已绑定的任务版本仍可运行。</p> : null}
    <div className="mt-[10px] flex flex-wrap gap-[6px]">
      {!archived ? <Button size="sm" disabled={busy} onClick={() => showInspector({ kind: "template", templateId: template.id, edit: true })}>{custom ? "编辑大纲" : "编辑（另存为我的模板）"}</Button> : null}
      <Lifecycle item={template} busy={busy} onDelete={() => void remove()} onArchive={(value) => void archive(value)} />
    </div>
    {message ? <p role="status" className="mt-[6px] text-[12px] text-[var(--steel)]">{message}</p> : null}
    <div className="mt-[14px] text-[11px] font-semibold tracking-[0.5px] text-[var(--stone)]">章节大纲</div>
    <Outline text={template.content} />
  </Card>;
}
