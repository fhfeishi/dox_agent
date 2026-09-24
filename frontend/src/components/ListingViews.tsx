import { useEffect, useState, type ReactNode } from "react";
import { archivePromptSkill, copyTask, createPromptSkill, fetchArtifacts, fetchPromptSkills, publishPromptSkill, savePromptSkill, setPromptSkillEnabled, testPromptSkill, type ArtifactSummary, type PromptSkill } from "../api";
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
  const { tasks, tasksError, taskId, showInspector, taskCapable, refreshTasks } = useApp();
  const [copyError, setCopyError] = useState("");
  async function makeCopy(source: string) {
    try {
      const task = await copyTask(source);
      await refreshTasks();
      showInspector({ kind: "task", taskId: task.id });
      setCopyError("");
    } catch (e) { setCopyError((e as Error).message); }
  }

  return (
    <ViewShell
      title="任务模板"
      description="任务决定 system prompt 与输出契约。选中任务后会新建一个绑定该任务的会话；task4 专项报告走统一报告入口，不在聊天中生成正文。"
      actions={<div className="flex gap-[6px]"><Button onClick={() => void makeCopy("task1")}>复制问答任务</Button><Button onClick={() => void makeCopy("task2")}>复制对比任务</Button><Button onClick={() => void makeCopy("task4")}>复制专项报告任务</Button></div>}
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
      {copyError ? <p role="alert" className="text-[13px] text-[var(--red)]">{copyError}</p> : null}
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
                  {task.kind === "custom" ? <Pill tone={task.status === "archived" || task.archived ? "yellow" : "lav"}>{task.status === "archived" || task.archived ? "已归档" : task.status === "published" ? `我的任务 · v${task.version}` : task.version ? `草稿 · 已发布 v${task.version}` : "草稿"}</Pill> : <Pill tone="sky">内置</Pill>}
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

const ARTIFACT_TYPE_LABEL: Record<string, string> = { answer_snapshot: "回答快照", report: "报告" };

export function ReportsView() {
  const { workspace, startTask, corpora, showInspector } = useApp();
  const [scope, setScope] = useState<"all" | "current">("all");
  const [artifactList, setArtifactList] = useState<{ key: string; items: ArtifactSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("dox-artifacts-changed", refresh);
    return () => window.removeEventListener("dox-artifacts-changed", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    const key = scope === "all" ? "all" : `current:${workspace.active ?? ""}`;
    setArtifactList(null);
    setError("");
    setLoading(true);
    // An omitted query means global; the current-session filter always sends its exact key.
    void fetchArtifacts(scope === "all" ? undefined : workspace.active ?? "").then(
      (items) => { if (active) setArtifactList({ key, items }); },
      (cause) => { if (active) setError(cause instanceof Error ? cause.message : "成果列表读取失败"); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, workspace.active, revision]);

  const key = scope === "all" ? "all" : `current:${workspace.active ?? ""}`;
  const artifacts = artifactList?.key === key ? artifactList.items : [];

  return (
    <ViewShell
      title="成果"
      description="查看已保存的回答快照与专项报告。可切换全部成果或当前会话。"
      actions={<Button onClick={() => void startTask("task4")}>新建专项报告</Button>}
    >
      <div className="col-span-full flex gap-[6px]">
        <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}
          className={`rounded-[7px] px-[11px] py-[6px] text-[12px] ${scope === "all" ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"}`}>全部成果</button>
        <button type="button" aria-pressed={scope === "current"} onClick={() => setScope("current")}
          className={`rounded-[7px] px-[11px] py-[6px] text-[12px] ${scope === "current" ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"}`}>当前会话</button>
      </div>
      {error ? <p role="alert" className="col-span-full text-[13px] text-[var(--red)]">{error}</p> : null}
      {loading ? <p className="col-span-full text-[13px] text-[var(--steel)]">正在读取成果…</p> : null}
      {!loading && !error && !artifacts.length ? (
        <p className="col-span-full text-[13px] text-[var(--steel)]">{scope === "current" ? "本会话还没有成果。" : "还没有成果。"}可在回答操作条选择“保存为成果”。</p>
      ) : null}
      {artifacts.map((item) => (
        <button key={item.artifact_id} type="button"
          onClick={() => showInspector({ kind: "artifact", artifactId: item.artifact_id })}
          className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-left hover:border-[var(--primary)]">
          <span className="block text-[14px] font-semibold text-[var(--ink)]">{item.title || "未命名成果"}</span>
          <span className="mt-[5px] block text-[12px] text-[var(--steel)]">
            {ARTIFACT_TYPE_LABEL[item.type] ?? item.type} · 版本 {item.current_version} · {item.status === "completed" ? "已完成" : item.status === "draft" ? "草稿" : item.status === "failed" ? "失败" : "生成中"} ·{" "}
            {item.corpus_ids.length
              ? item.corpus_ids.map((id) => corpora.find((corpus) => corpus.id === id)?.name ?? id).join("、")
              : "来源库未记录"} · {item.created_at?.slice(0, 10) || "时间未记录"}
          </span>
          <span className="mt-[4px] block text-[11.5px] text-[var(--stone)]">
            会话：{workspace.sessions.find((session) => session.id === item.session_key)?.title || item.session_key || "未记录"} · {item.run_available === true ? "来源运行可回读" : "来源运行未记录"}
            {item.type === "answer_snapshot" ? ` · ${item.source_verification === "verified" ? "原始回答已核验" : item.source_verification === "user_modified" ? "用户修订版本" : "原始输出未核验"}` : ""}
          </span>
          <span className="mt-[2px] block break-all text-[11px] text-[var(--stone)]">
            任务：{item.task_id || "未记录"} / {item.task_version ? `v${item.task_version}` : "未记录"} · 模板：{item.template_id || "未记录"} / {item.template_version != null ? `v${item.template_version}` : "未记录"}
          </span>
        </button>
      ))}
    </ViewShell>
  );
}

export function PromptSkillView() {
  const [items, setItems] = useState<PromptSkill[]>([]);
  const [selected, setSelected] = useState<PromptSkill | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [testResult, setTestResult] = useState("");
  async function reload(id?: string) {
    const next = await fetchPromptSkills(); setItems(next);
    if (id) setSelected(next.find((item) => item.id === id) ?? null);
  }
  useEffect(() => { void reload().catch((error) => setMessage((error as Error).message)); }, []);
  async function run(action: () => Promise<PromptSkill>) {
    try { const item = await action(); await reload(item.id); setMessage("已保存"); setTestResult(""); }
    catch (error) { setMessage((error as Error).message); }
  }
  const customPrompts = items.filter((item) => item.kind === "prompt" && item.version && item.enabled && !item.archived);
  return (
    <ViewShell title="Prompt / Skill" description="Prompt 是可复用指令；Skill 声明输入、资料范围与输出。静态检查只展示渲染结果，不运行模型。"
      actions={<div className="flex gap-[6px]"><Button onClick={() => void run(() => createPromptSkill("prompt"))}>新建 Prompt</Button><Button onClick={() => void run(() => createPromptSkill("skill"))}>新建 Skill</Button></div>}>
      <div className="col-span-full"><input aria-label="搜索 Prompt 或 Skill" placeholder="搜索名称或用途" value={query} onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded border border-[var(--hairline)] bg-[var(--surface)] p-[8px] text-[13px]" />
        {message ? <p role="status" className="mt-[7px] text-[12px]">{message}</p> : null}</div>
      <div className="col-span-full grid gap-[8px] sm:grid-cols-2">
        {items.filter((item) => `${item.name} ${item.purpose}`.toLowerCase().includes(query.toLowerCase())).map((item) =>
          <button key={item.id} type="button" onClick={() => { setSelected({ ...item }); setTestResult(""); setMessage(""); }}
            className="rounded border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-left text-[12px]">
            <strong>{item.name}</strong> · {item.kind === "prompt" ? "Prompt" : "Skill"} · {item.builtin ? "内置只读" : item.archived ? "已归档" : item.enabled ? `已启用 v${item.version}` : "草稿/停用"}
            <span className="mt-[4px] block text-[var(--steel)]">{item.purpose}</span>
          </button>)}
      </div>
      {selected ? <div className="col-span-full space-y-[9px] rounded border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-[12px]">
        <h2 className="text-[16px] font-semibold">{selected.kind === "prompt" ? "Prompt" : "Skill"} · {selected.name}</h2>
        {(["name", "purpose"] as const).map((key) => <label key={key} className="block">{key === "name" ? "名称" : "用途"}<input aria-label={key} disabled={selected.builtin || selected.archived} value={selected[key]}
          onChange={(event) => setSelected({ ...selected, [key]: event.target.value })} className="mt-[3px] block w-full rounded border p-[6px]" /></label>)}
        {selected.kind === "prompt" ? <>
          <label className="block">正文<textarea aria-label="Prompt 正文" disabled={selected.builtin || selected.archived} value={selected.body ?? ""} onChange={(event) => setSelected({ ...selected, body: event.target.value })} className="mt-[3px] block min-h-[130px] w-full rounded border p-[6px]" /></label>
          <label className="block">变量（逗号分隔）<input aria-label="Prompt 变量" disabled={selected.builtin || selected.archived} value={selected.variables?.join(", ") ?? ""} onChange={(event) => setSelected({ ...selected, variables: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} className="mt-[3px] block w-full rounded border p-[6px]" /></label>
          <label className="block">示例<input aria-label="Prompt 示例" disabled={selected.builtin || selected.archived} value={selected.example ?? ""} onChange={(event) => setSelected({ ...selected, example: event.target.value })} className="mt-[3px] block w-full rounded border p-[6px]" /></label>
        </> : <>
          <label className="block">执行规则<textarea aria-label="Skill 规则" disabled={selected.archived} value={selected.rules ?? ""} onChange={(event) => setSelected({ ...selected, rules: event.target.value })} className="mt-[3px] block min-h-[80px] w-full rounded border p-[6px]" /></label>
          <label className="block">输入参数（逗号分隔）<input aria-label="Skill 输入" disabled={selected.archived} value={selected.inputs?.join(", ") ?? ""} onChange={(event) => setSelected({ ...selected, inputs: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} className="mt-[3px] block w-full rounded border p-[6px]" /></label>
          <label className="block">使用 Prompt<select aria-label="Skill Prompt" disabled={selected.archived} value={selected.prompt_id ? `${selected.prompt_id}|${selected.prompt_version ?? 0}` : ""} onChange={(event) => { const [prompt_id, version] = event.target.value.split("|"); setSelected({ ...selected, prompt_id, prompt_version: Number(version) }); }} className="mt-[3px] block w-full rounded border p-[6px]"><option value="">选择已启用 Prompt</option>{customPrompts.map((item) => <option key={item.id} value={`${item.id}|${item.version}`}>{item.name} v{item.version}</option>)}</select></label>
          <label className="block">资料策略<select aria-label="Skill 资料策略" disabled={selected.archived} value={selected.resource_policy ?? "local_only"} onChange={(event) => setSelected({ ...selected, resource_policy: event.target.value as PromptSkill["resource_policy"] })} className="mt-[3px] block w-full rounded border p-[6px]"><option value="local_only">仅本地</option><option value="allow_selected_web">允许已选网页</option></select></label>
          <div>允许工具：{(["knowledge_search", "knowledge_read"] as const).map((tool) => <label key={tool} className="ml-[10px]"><input type="checkbox" disabled={selected.archived} checked={selected.tools?.includes(tool) ?? false} onChange={(event) => setSelected({ ...selected, tools: event.target.checked ? [...(selected.tools ?? []), tool] : (selected.tools ?? []).filter((value) => value !== tool) })} /> {tool}</label>)}</div>
          <label className="block">输出契约<textarea aria-label="Skill 输出" disabled={selected.archived} value={selected.output_contract ?? ""} onChange={(event) => setSelected({ ...selected, output_contract: event.target.value })} className="mt-[3px] block min-h-[70px] w-full rounded border p-[6px]" /></label>
          {(selected.inputs ?? []).map((key) => <label key={key} className="block">测试输入：{key}<input aria-label={`测试输入 ${key}`} value={selected.test_inputs?.[key] ?? ""}
            onChange={(event) => setSelected({ ...selected, test_inputs: { ...selected.test_inputs, [key]: event.target.value } })} className="mt-[3px] block w-full rounded border p-[6px]" /></label>)}
          <Button onClick={() => void testPromptSkill(selected, selected.test_inputs ?? {}).then((result) => setTestResult(`静态结构检查通过；未运行模型。阶段：${result.stages.join(" → ")}\n\n${result.rendered_prompt}`)).catch((error) => setMessage((error as Error).message))}>静态检查</Button>
          {testResult ? <pre className="whitespace-pre-wrap rounded bg-[var(--surface-soft)] p-[9px]">{testResult}</pre> : null}
          <p>被任务引用：{selected.referenced_by?.join("、") || "暂无"}</p>
        </>}
        <div className="flex flex-wrap gap-[6px]">{selected.builtin ? <Button onClick={() => void run(() => createPromptSkill("prompt", selected.id))}>复制为自定义</Button> : <>
          <Button onClick={() => void run(() => createPromptSkill(selected.kind, selected.id))}>复制</Button>
          <Button onClick={() => void run(() => savePromptSkill(selected))}>保存草稿</Button><Button onClick={() => void run(async () => publishPromptSkill(await savePromptSkill(selected)))}>保存并启用</Button>
          <Button onClick={() => void run(() => setPromptSkillEnabled(selected, !selected.enabled))}>{selected.enabled ? "停用" : "启用"}</Button>
          <Button onClick={() => void run(() => archivePromptSkill(selected))}>归档</Button></>}</div>
      </div> : null}
    </ViewShell>
  );
}
