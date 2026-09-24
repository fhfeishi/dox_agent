import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { Button, Card, Pill } from "./ui";
import { documentMeta } from "../documentMeta";
import { artifactExportUrl, createArtifactVersion, fetchArtifact, fetchArtifactVersions, fetchReport, fetchRun, fetchTemplate, fetchTemplates, publishTask, saveTaskDraft, type ArtifactInfo, type ArtifactVersion, type ReportInfo, type RunSnapshot, type TaskInfo, type TaskParameter, type TemplateInfo, type TemplateSummary } from "../api";
import { downloadText } from "../exportText";
import { formatDuration } from "../conversation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TextPreview } from "./DocumentPreview";

type InspTab = "out" | "cite" | "src";

const OUTCOME_LABEL: Record<string, string> = {
  running: "进行中", completed: "已完成", interrupted: "已中断", failed: "未完成", timed_out: "已超时",
};
const ARTIFACT_TYPE_LABEL: Record<string, string> = { answer_snapshot: "回答快照", report: "报告" };

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-[10px] flex items-center gap-[8px]">
      <span className="text-[11px] font-semibold tracking-[0.5px] text-[var(--stone)] uppercase">
        {children}
      </span>
      <span className="flex-1" />
      {aside}
    </div>
  );
}

export function Inspector() {
  const {
    inspectorOpen,
    toggleInspector,
    handleOpenSource,
    turns,
    currentCorpus,
    activeTask,
    tasks,
    taskCapable,
    documents,
    openDocument,
    corpusReady,
    workspace,
    options,
    setNav,
    drawerOpen,
    openCorpusId,
    previewDoc,
    explorerOpen,
    inspectorTarget,
    inspectorCanGoBack,
    inspectorPinned,
    backInspector,
    toggleInspectorPinned,
    inspectorWidth,
    setInspectorWidth,
    corpora,
    openCorpus,
    startTask,
    refreshTasks,
    openFullPreview,
    showInspector,
  } = useApp();
  const [tab, setTab] = useState<InspTab>("out");
  const [taskDraft, setTaskDraft] = useState<TaskInfo | null>(null);
  const [taskEditMessage, setTaskEditMessage] = useState("");
  const [taskEditBusy, setTaskEditBusy] = useState(false);
  const [report, setReport] = useState<ReportInfo | null>(null);
  const [reportError, setReportError] = useState("");
  const [artifact, setArtifact] = useState<ArtifactInfo | null>(null);
  const [artifactError, setArtifactError] = useState("");
  const [artifactVersions, setArtifactVersions] = useState<ArtifactVersion[]>([]);
  const [editingArtifact, setEditingArtifact] = useState(false);
  const [artifactDraft, setArtifactDraft] = useState("");
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [artifactSaveError, setArtifactSaveError] = useState("");
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [templateList, setTemplateList] = useState<TemplateSummary[]>([]);
  const [runSnapshot, setRunSnapshot] = useState<RunSnapshot | null>(null);
  const [runSnapshotMissing, setRunSnapshotMissing] = useState(false);

  useEffect(() => {
    if (inspectorTarget.kind !== "report") {
      setReport(null);
      setReportError("");
      return;
    }
    let active = true;
    setReport(null);
    setReportError("");
    void fetchReport(inspectorTarget.reportId).then(
      (item) => { if (active) setReport(item); },
      (error) => { if (active) setReportError(error instanceof Error ? error.message : "报告读取失败"); },
    );
    return () => { active = false; };
  }, [inspectorTarget.kind, inspectorTarget.kind === "report" ? inspectorTarget.reportId : ""]);

  useEffect(() => {
    if (inspectorTarget.kind !== "artifact") {
      setArtifact(null);
      setArtifactError("");
      setArtifactVersions([]);
      setEditingArtifact(false);
      return;
    }
    let active = true;
    setArtifact(null);
    setArtifactError("");
    setArtifactVersions([]);
    setEditingArtifact(false);
    setArtifactSaveError("");
    void fetchArtifact(inspectorTarget.artifactId).then(
      (item) => { if (active) setArtifact(item); },
      (error) => { if (active) setArtifactError(error instanceof Error ? error.message : "成果读取失败"); },
    );
    void fetchArtifactVersions(inspectorTarget.artifactId).then(
      (items) => { if (active) setArtifactVersions(items); },
      (error) => { if (active) setArtifactSaveError(error instanceof Error ? error.message : "版本列表读取失败"); },
    );
    return () => { active = false; };
  }, [inspectorTarget.kind, inspectorTarget.kind === "artifact" ? inspectorTarget.artifactId : ""]);

  async function saveArtifactVersion(status: "draft" | "completed") {
    if (inspectorTarget.kind !== "artifact" || !artifactDraft.trim()) return;
    setSavingArtifact(true);
    setArtifactSaveError("");
    try {
      const updated = await createArtifactVersion(inspectorTarget.artifactId, artifactDraft, status);
      setArtifact(updated);
      setArtifactVersions(await fetchArtifactVersions(inspectorTarget.artifactId));
      setEditingArtifact(false);
      window.dispatchEvent(new Event("dox-artifacts-changed"));
    } catch (error) {
      setArtifactSaveError(error instanceof Error ? error.message : "保存版本失败");
    } finally {
      setSavingArtifact(false);
    }
  }

  useEffect(() => {
    if (inspectorTarget.kind !== "template") {
      setTemplate(null);
      setTemplateError("");
      return;
    }
    let active = true;
    setTemplate(null);
    setTemplateError("");
    void fetchTemplate(inspectorTarget.templateId).then(
      (item) => { if (active) setTemplate(item); },
      (error) => { if (active) setTemplateError(error instanceof Error ? error.message : "输出模板读取失败"); },
    );
    return () => { active = false; };
  }, [inspectorTarget.kind, inspectorTarget.kind === "template" ? inspectorTarget.templateId : ""]);

  useEffect(() => {
    let active = true;
    void fetchTemplates().then(
      (items) => { if (active) setTemplateList(items); },
      () => { if (active) setTemplateList([]); },
    );
    return () => { active = false; };
  }, []);

  // B2: read the persisted run snapshot back for the execution summary; a legacy run without one
  // is shown as "运行信息未记录" instead of failing silently. An artifact can target its own run.
  const latestRunId = turns[turns.length - 1]?.runId ?? "";
  const executionRunId = inspectorTarget.kind === "execution" && inspectorTarget.runId
    ? inspectorTarget.runId : latestRunId;
  const isLatestRun = executionRunId === latestRunId;
  useEffect(() => {
    if (inspectorTarget.kind !== "execution" || !executionRunId) {
      setRunSnapshot(null);
      setRunSnapshotMissing(false);
      return;
    }
    let active = true;
    setRunSnapshot(null);
    setRunSnapshotMissing(false);
    void fetchRun(executionRunId).then(
      (item) => { if (active) setRunSnapshot(item); },
      () => { if (active) setRunSnapshotMissing(true); },
    );
    return () => { active = false; };
  }, [inspectorTarget.kind, executionRunId]);

  useEffect(() => {
    if (!inspectorOpen || drawerOpen || openCorpusId || previewDoc || explorerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        toggleInspector();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inspectorOpen, drawerOpen, openCorpusId, previewDoc, explorerOpen, toggleInspector]);

  const latest = turns[turns.length - 1];
  const answered = turns.filter((t) => t.outcome === "completed").length;
  const citations = latest?.sources ?? [];
  const selectedTask = inspectorTarget.kind === "task"
    ? tasks.find((item) => item.id === inspectorTarget.taskId) : null;
  useEffect(() => { setTaskDraft(selectedTask ? { ...selectedTask } : null); setTaskEditMessage(""); }, [selectedTask?.id, selectedTask?.revision]);
  async function persistTask(publish: boolean) {
    if (!taskDraft) return;
    setTaskEditBusy(true);
    try {
      const saved = await saveTaskDraft(taskDraft);
      const result = publish ? await publishTask(saved) : saved;
      setTaskDraft(result);
      await refreshTasks();
      setTaskEditMessage(publish ? `已发布 v${result.version}` : "草稿已保存");
    } catch (e) { setTaskEditMessage((e as Error).message); }
    finally { setTaskEditBusy(false); }
  }
  function changeTaskParameter(index: number, change: Partial<TaskParameter>) {
    if (!taskDraft) return;
    const parameters = [...(taskDraft.parameters ?? [])];
    parameters[index] = { ...parameters[index], ...change };
    setTaskDraft({ ...taskDraft, parameters });
  }
  const selectedTemplate = inspectorTarget.kind === "template"
    ? (template?.id === inspectorTarget.templateId ? template : templateList.find((item) => item.id === inspectorTarget.templateId) ?? null)
    : null;
  const corpus = inspectorTarget.kind === "corpus" ? corpora.find((item) => item.id === inspectorTarget.corpusId) : null;
  // A2/B2: prefer the persisted snapshot's authoritative scope; fall back to the live run event.
  const effectiveCorpusIds = runSnapshot?.effective_corpus_ids?.length
    ? runSnapshot.effective_corpus_ids
    : latest?.runInfo?.effective_corpus_ids ?? [];
  const effectiveScopeLabel = effectiveCorpusIds.length
    ? effectiveCorpusIds.map((id) => corpora.find((item) => item.id === id)?.name ?? id).join("、")
    : "";
  const runModel = runSnapshot?.model || latest?.runInfo?.model || "";
  const runPolicy = runSnapshot?.resource_policy || latest?.runInfo?.resource_policy || "";
  const runStatus = runSnapshot?.status || latest?.outcome || "";

  return (
    <aside
      aria-hidden={!inspectorOpen}
      aria-label="检查器"
      className={`fixed inset-y-0 right-0 z-[70] flex w-full flex-col overflow-hidden border border-[var(--hairline)] bg-[var(--surface-soft)] shadow-[-24px_8px_60px_-24px_rgba(15,15,15,0.28)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] sm:top-[10px] sm:right-[10px] sm:bottom-[10px] sm:w-[var(--inspector-width)] sm:rounded-[14px] ${
        inspectorOpen ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+20px)]"
      }`}
    >
      <div className="flex items-center gap-[8px] px-[18px] pt-[14px] pb-[12px]">
        {inspectorCanGoBack ? (
          <button type="button" aria-label="返回上一预览" onClick={backInspector}
            className="grid size-[26px] shrink-0 place-items-center rounded-[6px] text-[var(--steel)] hover:bg-[var(--surface)]">
            <Icon name="chevronLeft" size={14} />
          </button>
        ) : null}
        <span className="text-[13.5px] font-semibold tracking-[-0.1px] text-[var(--ink)]">
          {inspectorTarget.kind === "task" ? "任务预览"
            : inspectorTarget.kind === "template" ? "输出模板预览"
            : inspectorTarget.kind === "corpus" ? "知识库预览"
            : inspectorTarget.kind === "document" ? "资料预览"
            : inspectorTarget.kind === "report" ? "报告预览"
            : inspectorTarget.kind === "artifact" ? "成果预览"
            : inspectorTarget.kind === "execution" ? "执行摘要" : "检查器"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--stone)]">
          {selectedTask?.name ?? selectedTemplate?.name ?? corpus?.name ?? artifact?.title
            ?? (inspectorTarget.kind === "document" ? inspectorTarget.doc.title
            : inspectorTarget.kind === "report" ? "本会话报告"
            : inspectorTarget.kind === "execution" ? "最近一轮回答"
            : activeTask && taskCapable ? `· ${activeTask.name}` : "· 专业问答")}
        </span>
        <button type="button" aria-label={inspectorPinned ? "取消固定检查器" : "固定检查器"}
          title={inspectorPinned ? "取消固定" : "固定预览"} onClick={toggleInspectorPinned}
          className={`grid size-[26px] shrink-0 place-items-center rounded-[6px] text-[12px] ${inspectorPinned ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"}`}>
          {inspectorPinned ? "●" : "○"}
        </button>
        <input type="range" aria-label="检查器宽度" title="调整检查器宽度" min={400} max={520} step={20}
          value={inspectorWidth} onChange={(event) => setInspectorWidth(Number(event.target.value))}
          className="hidden w-[52px] accent-[var(--primary)] sm:block" />
        <button
          type="button"
          aria-label="关闭检查器"
          title="关闭检查器"
          onClick={toggleInspector}
          className="grid size-[26px] shrink-0 place-items-center rounded-[6px] text-[var(--steel)] hover:bg-[var(--surface)]"
        >
          <Icon name="close" size={14} strokeWidth={2} />
        </button>
      </div>

      {inspectorTarget.kind === "overview" ? <div className="flex gap-[4px] border-b border-[var(--hairline)] px-[14px]">
        {(
          [
            ["out", "概览"],
            ["cite", "引用"],
            ["src", "原文预览"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`font-app -mb-px rounded-t-[6px] border-b-2 px-[10px] py-[8px] text-[12.5px] transition-colors ${
              tab === key
                ? "border-b-[var(--ink)] font-semibold text-[var(--ink)]"
                : "border-b-transparent text-[var(--steel)] hover:text-[var(--charcoal)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div> : null}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-[18px] pt-[18px] pb-[20px]">
        {inspectorTarget.kind === "task" ? (
          <>
            <SectionTitle>任务模板</SectionTitle>
            {selectedTask ? (
              <Card>
                <h2 className="text-[15px] font-semibold text-[var(--ink)]">{selectedTask.name}</h2>
                <p className="mt-[8px] text-[12.5px] leading-[1.6] text-[var(--steel)]">{selectedTask.description}</p>
                {selectedTask.example ? <p className="mt-[10px] text-[12px] text-[var(--slate)]">示例：{selectedTask.example}</p> : null}
                {selectedTask.output_hint ? <p className="mt-[8px] text-[12px] text-[var(--slate)]">输出：{selectedTask.output_hint}</p> : null}
                {selectedTask.kind === "custom" && taskDraft ? (
                  <div className="mt-[12px] space-y-[8px]">
                    <p className="text-[12px] text-[var(--steel)]">基于 {selectedTask.engine_task_id} · {selectedTask.status === "published" ? `已发布 v${selectedTask.version}` : selectedTask.version ? `草稿 · 当前发布 v${selectedTask.version}` : "未发布草稿"}</p>
                    {([ ["name", "名称"], ["background", "背景"], ["goal", "目标"], ["requirements", "具体要求"] ] as const).map(([key, label]) => (
                      <label key={key} className="block text-[12px] text-[var(--slate)]">{label}
                        <textarea aria-label={label} value={taskDraft[key] ?? ""}
                          onChange={(event) => setTaskDraft({ ...taskDraft, [key]: event.target.value })}
                          className="mt-[4px] min-h-[44px] w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] p-[7px] text-[12px] text-[var(--ink)]" />
                      </label>
                    ))}
                    <label className="block text-[12px] text-[var(--slate)]">默认关注点
                      <input aria-label="默认关注点" value={taskDraft.parameter_defaults?.focus ?? ""}
                        onChange={(event) => setTaskDraft({ ...taskDraft, parameter_defaults: { ...taskDraft.parameter_defaults, focus: event.target.value } })}
                        className="mt-[4px] w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] p-[7px] text-[12px] text-[var(--ink)]" />
                    </label>
                    <div className="border-t border-[var(--hairline)] pt-[8px]">
                      <div className="mb-[6px] flex items-center justify-between text-[12px] text-[var(--slate)]"><span>输入参数</span>
                        <button type="button" className="text-[var(--link)]" onClick={() => setTaskDraft({ ...taskDraft, parameters: [
                          ...(taskDraft.parameters ?? []), { key: `input_${(taskDraft.parameters?.length ?? 0) + 1}`, label: "新参数", type: "text" },
                        ] })}>添加参数</button>
                      </div>
                      {(taskDraft.parameters ?? []).map((field, index) => <div key={index} className="mb-[8px] rounded-[6px] border border-[var(--hairline)] p-[7px] text-[11px]">
                        <div className="flex gap-[5px]">
                          <input aria-label={`参数${index + 1}名称`} value={field.key} onChange={(event) => changeTaskParameter(index, { key: event.target.value })}
                            placeholder="英文标识" className="min-w-0 flex-1 rounded border border-[var(--hairline)] p-[4px]" />
                          <input aria-label={`参数${index + 1}标签`} value={field.label} onChange={(event) => changeTaskParameter(index, { label: event.target.value })}
                            placeholder="显示名称" className="min-w-0 flex-1 rounded border border-[var(--hairline)] p-[4px]" />
                          <button type="button" className="text-[var(--red)]" onClick={() => setTaskDraft({ ...taskDraft, parameters: taskDraft.parameters?.filter((_, i) => i !== index) })}>删除</button>
                        </div>
                        <div className="mt-[5px] flex items-center gap-[6px]">
                          <select aria-label={`参数${index + 1}类型`} value={field.type} onChange={(event) => changeTaskParameter(index, { type: event.target.value as TaskParameter["type"], default: undefined, options: [] })}
                            className="rounded border border-[var(--hairline)] p-[4px]">
                            <option value="text">文本</option><option value="integer">整数</option><option value="enum">选项</option><option value="boolean">是/否</option><option value="year_range">年份区间</option>
                          </select>
                          <label><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => changeTaskParameter(index, { required: event.target.checked })} /> 必填</label>
                        </div>
                        <input aria-label={`参数${index + 1}帮助`} value={field.help ?? ""} onChange={(event) => changeTaskParameter(index, { help: event.target.value })}
                          placeholder="帮助说明（可选）" className="mt-[5px] w-full rounded border border-[var(--hairline)] p-[4px]" />
                        {field.type === "enum" ? <input aria-label={`参数${index + 1}选项`} value={field.options?.join("，") ?? ""}
                          onChange={(event) => changeTaskParameter(index, { options: event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean) })}
                          placeholder="用逗号分隔选项" className="mt-[5px] w-full rounded border border-[var(--hairline)] p-[4px]" /> : null}
                        {field.type === "boolean" ? <select aria-label={`参数${index + 1}默认`} value={field.default === true ? "true" : field.default === false ? "false" : ""}
                          onChange={(event) => changeTaskParameter(index, { default: event.target.value === "" ? undefined : event.target.value === "true" })}
                          className="mt-[5px] w-full rounded border border-[var(--hairline)] p-[4px]"><option value="">无默认</option><option value="true">默认是</option><option value="false">默认否</option></select>
                          : field.type === "year_range" ? <div className="mt-[5px] flex gap-[5px]">{(["from", "to"] as const).map((side) => <input key={side} aria-label={`参数${index + 1}默认${side === "from" ? "起" : "止"}`} type="number" placeholder={side === "from" ? "起始年" : "结束年"}
                            value={(field.default as { from?: number; to?: number } | undefined)?.[side] ?? ""}
                            onChange={(event) => changeTaskParameter(index, { default: { ...(field.default as object ?? {}), [side]: event.target.value ? Number(event.target.value) : undefined } })}
                            className="min-w-0 flex-1 rounded border border-[var(--hairline)] p-[4px]" />)}</div>
                          : <input aria-label={`参数${index + 1}默认`} type={field.type === "integer" ? "number" : "text"} value={field.default == null ? "" : String(field.default)}
                            onChange={(event) => changeTaskParameter(index, { default: event.target.value === "" ? undefined : field.type === "integer" ? Number(event.target.value) : event.target.value })}
                            placeholder="默认值（可选）" className="mt-[5px] w-full rounded border border-[var(--hairline)] p-[4px]" />}
                      </div>)}
                    </div>
                    <p className="text-[11px] text-[var(--stone)]">运行配置：当前会话知识库 · 本地资料 · 网络关闭 · {selectedTask.output_hint || "文本回答"}</p>
                    <div className="flex gap-[6px]"><Button disabled={taskEditBusy} onClick={() => void persistTask(false)}>保存草稿</Button><Button disabled={taskEditBusy} onClick={() => void persistTask(true)}>保存并发布</Button></div>
                    {taskEditMessage ? <p role="status" className="text-[12px] text-[var(--steel)]">{taskEditMessage}</p> : null}
                  </div>
                ) : null}
                {selectedTask.templates?.length ? (
                  <div className="mt-[12px]">
                    <div className="text-[11px] font-semibold tracking-[0.5px] text-[var(--stone)] uppercase">输出模板</div>
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {selectedTask.templates.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => showInspector({ kind: "template", templateId: id })}
                          className="rounded-[6px] border border-[var(--hairline)] px-[8px] py-[5px] text-[11.5px] text-[var(--link)] hover:bg-[var(--primary-soft)]"
                        >
                          {templateList.find((item) => item.id === id)?.name ?? id}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedTask.status !== "draft" || selectedTask.version ? <Button className="mt-[14px]" onClick={() => void startTask(selectedTask.id)}>{selectedTask.status === "draft" ? "使用已发布版本" : "使用此任务"}</Button> : null}
              </Card>
            ) : <Card>任务已不可用，请刷新任务列表。</Card>}
          </>
        ) : null}

        {inspectorTarget.kind === "corpus" ? (
          <>
            <SectionTitle>知识库</SectionTitle>
            {corpus ? (
              <Card>
                <h2 className="text-[15px] font-semibold text-[var(--ink)]">{corpus.name}</h2>
                <p className="mt-[8px] text-[12px] text-[var(--steel)]">
                  已入库 {corpus.indexed_count ?? corpus.docs_count} / 源文件 {corpus.source_count ?? "未记录"}
                  {corpus.failed_count ? ` · 失败 ${corpus.failed_count}` : ""}
                </p>
                <p className="mt-[5px] text-[12px] text-[var(--steel)]">{corpus.missing ? "目录缺失，请重新关联" : corpus.preparation === "ready" ? "可用于检索" : "待处理"}</p>
                {corpus.description ? <p className="mt-[8px] text-[12px] leading-[1.6] text-[var(--slate)]">{corpus.description}</p> : null}
                <Button className="mt-[14px]" onClick={() => openCorpus(corpus.id)}>打开详情</Button>
              </Card>
            ) : <Card>知识库已不可用，请刷新列表。</Card>}
          </>
        ) : null}

        {inspectorTarget.kind === "report" ? (
          <>
            <SectionTitle>报告</SectionTitle>
            {reportError ? <p role="alert" className="text-[12px] text-[var(--red)]">{reportError}</p> : null}
            {!report && !reportError ? <p className="text-[12px] text-[var(--steel)]">正在读取报告…</p> : null}
            {report?.report_id === inspectorTarget.reportId ? (
              <Card>
                <div className="mb-[12px] flex gap-[8px]">
                  <Button size="sm" onClick={() => void navigator.clipboard.writeText(report.markdown)}>复制</Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadText(report.markdown, `report-${report.report_id.slice(0, 8)}.md`)}>下载 .md</Button>
                </div>
                <div className="markdown"><Markdown remarkPlugins={[remarkGfm]}>{report.markdown}</Markdown></div>
              </Card>
            ) : null}
          </>
        ) : null}

        {inspectorTarget.kind === "artifact" ? (
          <>
            <SectionTitle aside={<span className="text-[11px] text-[var(--stone)]">{artifact ? ARTIFACT_TYPE_LABEL[artifact.type] ?? artifact.type : ""}</span>}>
              成果
            </SectionTitle>
            {artifactError ? <p role="alert" className="text-[12px] text-[var(--red)]">{artifactError}</p> : null}
            {!artifact && !artifactError ? <p className="text-[12px] text-[var(--steel)]">正在读取成果…</p> : null}
            {artifact?.artifact_id === inspectorTarget.artifactId ? (
              <Card>
                <h2 className="text-[15px] font-semibold text-[var(--ink)]">{artifact.title}</h2>
                <p className="mt-[6px] text-[11.5px] text-[var(--stone)]">
                  {ARTIFACT_TYPE_LABEL[artifact.type] ?? artifact.type} · 版本 {artifact.version} · {artifact.status === "draft" ? "草稿" : artifact.status === "completed" ? "已完成" : artifact.status === "failed" ? "失败" : "生成中"}
                  {artifact.legacy ? " · 历史报告（只读兼容）" : ""}
                </p>
                <p className="mt-[4px] break-all text-[11px] text-[var(--stone)]">
                  来源运行：{artifact.run_available === true ? artifact.run_id : "未记录"} · 会话：{artifact.session_key || "未记录"}
                </p>
                {artifact.status === "failed" && artifact.fail_reason ? <p role="alert" className="mt-[6px] text-[12px] text-[var(--red)]">{artifact.fail_reason}</p> : null}
                {artifact.type === "answer_snapshot" ? <p className="mt-[5px] text-[12px] text-[var(--steel)]">
                  {artifact.source_verification === "verified" ? "原始回答已核验"
                    : artifact.source_verification === "user_modified" ? "用户修订版本"
                    : "原始输出未核验"}
                </p> : null}
                {artifactVersions.length > 1 ? <label className="mt-[9px] flex items-center gap-[8px] text-[12px] text-[var(--steel)]">
                  查看版本
                  <select aria-label="成果版本" value={artifact.version} disabled={editingArtifact}
                    onChange={(event) => {
                      if (inspectorTarget.kind !== "artifact") return;
                      setArtifactSaveError("");
                      void fetchArtifact(inspectorTarget.artifactId, Number(event.target.value)).then(setArtifact,
                        (error) => setArtifactSaveError(error instanceof Error ? error.message : "版本读取失败"));
                    }}
                    className="rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] px-[7px] py-[4px]">
                    {artifactVersions.map((item) => <option key={item.version} value={item.version}>版本 {item.version} · {item.status === "draft" ? "草稿" : item.status === "failed" ? "失败" : "已完成"}</option>)}
                  </select>
                </label> : null}
                {artifactSaveError ? <p role="alert" className="mt-[7px] text-[12px] text-[var(--red)]">{artifactSaveError}</p> : null}
                <div className="mt-[12px] flex flex-wrap gap-[8px]">
                  <Button size="sm" onClick={() => void navigator.clipboard.writeText(artifact.markdown)}>复制</Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadText(artifact.markdown, `artifact-${artifact.artifact_id.slice(0, 8)}-v${artifact.version}.md`)}>下载 .md</Button>
                  <a href={artifactExportUrl(artifact.artifact_id, "docx", artifact.version)}
                     className="font-app inline-flex h-[26px] items-center rounded-[6px] px-[8px] text-[12px] text-[var(--slate)] hover:bg-[var(--surface)]">
                    导出 .docx
                  </a>
                  {!artifact.legacy ? <Button size="sm" variant="ghost" onClick={() => {
                    setArtifactDraft(artifact.markdown);
                    setArtifactSaveError("");
                    setEditingArtifact(true);
                  }}>编辑新版本</Button> : null}
                  {artifact.run_available === true ? (
                    <Button size="sm" variant="ghost" onClick={() => showInspector({ kind: "execution", runId: artifact.run_id })}>查看来源运行</Button>
                  ) : null}
                </div>
                {editingArtifact ? <div className="mt-[12px]">
                  <textarea aria-label="成果 Markdown" value={artifactDraft} onChange={(event) => setArtifactDraft(event.target.value)}
                    className="min-h-[260px] w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] p-[10px] text-[12px] leading-[1.6] text-[var(--ink)]" />
                  <div className="mt-[8px] flex flex-wrap gap-[7px]">
                    <Button size="sm" disabled={savingArtifact || !artifactDraft.trim()} onClick={() => void saveArtifactVersion("draft")}>保存草稿</Button>
                    <Button size="sm" variant="ghost" disabled={savingArtifact || !artifactDraft.trim()} onClick={() => void saveArtifactVersion("completed")}>完成新版本</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingArtifact(false)}>取消</Button>
                  </div>
                </div> : <div className="markdown mt-[12px]"><Markdown remarkPlugins={[remarkGfm]}>{artifact.markdown}</Markdown></div>}
              </Card>
            ) : null}
          </>
        ) : null}

        {inspectorTarget.kind === "template" ? (
          <>
            <SectionTitle>输出模板</SectionTitle>
            {templateError ? <p role="alert" className="text-[12px] text-[var(--red)]">{templateError}</p> : null}
            {!template && !templateError ? <p className="text-[12px] text-[var(--steel)]">正在读取输出模板…</p> : null}
            {template?.id === inspectorTarget.templateId ? (
              <Card>
                <h2 className="text-[15px] font-semibold text-[var(--ink)]">{template.name}</h2>
                <p className="mt-[4px] text-[11.5px] text-[var(--stone)]">内置只读模板 · 报告按此章节结构生成</p>
                <div className="markdown mt-[12px]"><Markdown remarkPlugins={[remarkGfm]}>{template.content}</Markdown></div>
              </Card>
            ) : null}
          </>
        ) : null}

        {inspectorTarget.kind === "execution" ? (
          <>
            <SectionTitle aside={<span className="text-[11px] text-[var(--stone)]">{runStatus ? OUTCOME_LABEL[runStatus] ?? runStatus : "无"}</span>}>
              运行概览
            </SectionTitle>
            {!isLatestRun && !runSnapshot ? (
              <Card>
                <p className="text-[12.5px] text-[var(--steel)]">运行信息未记录（历史运行或快照写入失败）。</p>
              </Card>
            ) : (
              <>
                <Card className="mb-[10px]">
                  <div className="text-[12.8px] font-medium text-[var(--ink)]">运行信息</div>
                  {runSnapshotMissing ? (
                    <p className="mt-[6px] text-[12px] text-[var(--steel)]">运行信息未记录（历史运行或快照写入失败）。</p>
                  ) : null}
                  <dl className="mt-[8px] grid grid-cols-[auto_1fr] gap-x-[10px] gap-y-[4px] text-[12px]">
                    <dt className="text-[var(--stone)]">运行 ID</dt><dd className="truncate font-code text-[var(--charcoal)]">{executionRunId || "未记录"}</dd>
                    <dt className="text-[var(--stone)]">状态</dt><dd className="text-[var(--charcoal)]">{(OUTCOME_LABEL[runStatus] ?? runStatus) || "未记录"}</dd>
                    <dt className="text-[var(--stone)]">总耗时</dt><dd className="text-[var(--charcoal)]">{isLatestRun && latest?.totalMs != null ? formatDuration(latest.totalMs) : isLatestRun ? "未提供" : "未记录（仅快照）"}</dd>
                    <dt className="text-[var(--stone)]">首 token</dt><dd className="text-[var(--charcoal)]">{isLatestRun && latest?.firstTokenMs != null ? formatDuration(latest.firstTokenMs) : isLatestRun ? "未收到正文" : "未记录（仅快照）"}</dd>
                    <dt className="text-[var(--stone)]">模型</dt><dd className="truncate text-[var(--charcoal)]">{runModel || "未记录"}</dd>
                    <dt className="text-[var(--stone)]">任务版本</dt><dd className="text-[var(--charcoal)]">{runSnapshot?.task_version ? `${tasks.find((task) => task.id === runSnapshot.task_id)?.name ?? runSnapshot.task_id} · v${runSnapshot.task_version}` : "未记录"}</dd>
                    <dt className="text-[var(--stone)]">参数来源</dt><dd className="text-[var(--charcoal)]">{runSnapshot?.param_sources ? Object.entries(runSnapshot.param_sources).map(([key, source]) => `${key}: ${source === "task_default" ? "任务默认" : source}`).join("；") : "未记录"}</dd>
                    <dt className="text-[var(--stone)]">实际参数</dt><dd className="break-all text-[var(--charcoal)]">{runSnapshot?.params ? Object.entries(runSnapshot.params).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("；") : "未记录"}</dd>
                    <dt className="text-[var(--stone)]">资源策略</dt><dd className="text-[var(--charcoal)]">{runPolicy || "未记录"}</dd>
                    <dt className="text-[var(--stone)]">服务端实际范围</dt><dd className="text-[var(--charcoal)]">{effectiveScopeLabel || "未记录"}</dd>
                  </dl>
                </Card>

                <Card className="mb-[10px]">
                  <div className="text-[12.8px] font-medium text-[var(--ink)]">执行阶段</div>
                  {isLatestRun && latest?.steps?.length ? (
                    <ol className="mt-[8px] space-y-[6px]">
                      {latest.steps.map((step) => (
                        <li key={`${step.id}-${step.sequence}-${step.status}`} className="flex items-center gap-[8px] text-[12px]">
                          <span className="min-w-0 flex-1 truncate text-[var(--charcoal)]">{step.label}</span>
                          <span className="shrink-0 text-[var(--stone)]">
                            {step.status === "running" ? "进行中" : step.duration_ms != null ? formatDuration(step.duration_ms) : "已完成"}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="mt-[6px] text-[12px] text-[var(--steel)]">{isLatestRun ? "没有阶段记录。" : "仅保留运行快照，阶段明细未记录。"}</p>}
                </Card>

                <Card>
                  <div className="text-[12.8px] font-medium text-[var(--ink)]">检索与用量</div>
                  {isLatestRun ? (
                    <>
                      <p className="mt-[6px] text-[12px] leading-[1.6] text-[var(--steel)]">
                        路径 {latest?.telemetry?.path ?? "未记录"} · 命中片段 {latest?.telemetry?.chunks_retrieved ?? "未记录"} · 选中报告 {latest?.telemetry?.reports_selected ?? "未记录"} · 上下文 {latest?.telemetry?.context_tokens ?? "未记录"} tokens
                      </p>
                      <p className="mt-[5px] text-[12px] leading-[1.6] text-[var(--steel)]">
                        输入 {latest?.usage?.input_tokens ?? "未提供"} · 输出 {latest?.usage?.output_tokens ?? "未提供"} · 总 {latest?.usage?.total_tokens ?? "未提供"} · 调用 {latest?.usage?.calls ?? 0} 次
                      </p>
                    </>
                  ) : <p className="mt-[6px] text-[12px] leading-[1.6] text-[var(--steel)]">{"实时阶段与用量仅对最近一轮可见；来源运行的快照指标通过 GET /api/runs/<id> 回读。"}</p>}
                </Card>
              </>
            )}
          </>
        ) : null}

        {inspectorTarget.kind === "document" ? (
          <>
            <SectionTitle>资料原文</SectionTitle>
            <p className="mb-[12px] break-all text-[11px] text-[var(--stone)]">{documentMeta(inspectorTarget.doc)}</p>
            <Button size="sm" className="mb-[14px]" onClick={() => openFullPreview(inspectorTarget.doc, inspectorTarget.page, inspectorTarget.corpusId, true)}>放大阅读</Button>
            <TextPreview doc={inspectorTarget.doc} corpus={inspectorTarget.corpusId} />
          </>
        ) : null}

        {inspectorTarget.kind === "overview" && tab === "out" ? (
          <>
            <SectionTitle
              aside={
                <span className="text-[11px] text-[var(--stone)]">本轮会话 · {answered} 轮已答</span>
              }
            >
              概览
            </SectionTitle>
            <Card className="mb-[10px]">
              <div className="text-[13px] font-medium text-[var(--ink)]">
                {currentCorpus?.name ?? "未选择知识库"}
              </div>
              <div className="mt-[6px] flex flex-wrap items-center gap-[8px] text-[11.5px] text-[var(--stone)]">
                <Pill tone={corpusReady ? "mint" : "yellow"}>
                  {corpusReady ? "已就绪" : "准备中"}
                </Pill>
                <span>{documents.length} 份文档</span>
                {options.allowed_doc_ids ? (
                  <span>限定 {options.allowed_doc_ids.length} 份</span>
                ) : (
                  <span>全部资料</span>
                )}
              </div>
            </Card>

            <Card className="mb-[10px]">
              <div className="text-[12.8px] font-medium text-[var(--ink)]">结构化报告</div>
              <p className="mt-[6px] text-[12px] leading-[1.6] text-[var(--steel)]">
                使用“专项报告”任务确认需求后，在对话中的报告卡生成；本会话报告可集中预览和下载。
              </p>
              <div className="mt-[10px] flex gap-[8px]">
                <Button size="sm" variant="ghost" onClick={() => setNav("reports")}>查看本会话报告</Button>
              </div>
            </Card>

            <SectionTitle>会话</SectionTitle>
            <Card>
              <div className="text-[12.5px] text-[var(--charcoal)]">{workspace.message}</div>
              <div className="mt-[6px] text-[11.5px] text-[var(--stone)]">
                共 {workspace.sessions.length} 个会话 · {workspace.branches.length} 个分支
              </div>
              <div className="mt-[10px] flex gap-[8px]">
                <Button size="sm" variant="ghost" onClick={() => showInspector({ kind: "execution" })}>查看执行摘要</Button>
              </div>
            </Card>
          </>
        ) : null}

        {inspectorTarget.kind === "overview" && tab === "cite" ? (
          <SectionTitle
            aside={<span className="text-[11px] text-[var(--stone)]">{citations.length} 处引用</span>}
          >
            本轮引用片段
          </SectionTitle>
        ) : null}

        {inspectorTarget.kind === "overview" && tab === "cite" && !citations.length ? (
          <Card>
            <p className="text-[12.5px] leading-[1.6] text-[var(--steel)]">
              本轮回答还没有引用。提问后，命中资料的来源会在这里逐条列出。
            </p>
          </Card>
        ) : null}

        {inspectorTarget.kind === "overview" && tab === "cite" ? (
          <div className="flex flex-col gap-[10px]">
            {citations.map((s, i) => {
              const n = s.citation ?? i + 1;
              return (
                <Card key={`${n}-${i}`}>
                  <div className="flex items-start gap-[8px]">
                    <span className="mt-[2px] grid size-[16px] shrink-0 place-items-center rounded-[4px] bg-[var(--primary)] text-[10px] font-bold text-white">
                      {n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.8px] leading-[1.45] font-medium text-[var(--ink)]">
                        {s.title}
                      </div>
                      <div className="mt-[3px] text-[11.5px] text-[var(--stone)]">
                        第 {s.page ?? 1} 页
                      </div>
                    </div>
                  </div>
                  <p className="mt-[10px] text-[12.5px] leading-[1.7] text-[var(--slate)]">
                    {s.snippet}
                  </p>
                  <div className="mt-[8px] flex items-center justify-between gap-2">
                    <span className="truncate text-[10.5px] text-[var(--stone)]">
                      版本 {s.version ?? "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenSource(s, n)}
                      className="font-app inline-flex shrink-0 items-center gap-[5px] text-[12px] text-[var(--link)] hover:underline"
                    >
                      查看原文
                      <Icon name="chevronRight" size={11} strokeWidth={2.4} />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {inspectorTarget.kind === "overview" && tab === "src" ? (
          <>
            <SectionTitle
              aside={
                <span className="text-[11px] text-[var(--stone)]">
                  {currentCorpus ? currentCorpus.name : "未选择"}
                </span>
              }
            >
              原文预览
            </SectionTitle>
            <p className="mb-[12px] text-[12px] leading-[1.6] text-[var(--steel)]">
              浏览不会改变检索范围；打开后为 PDF 原文或规范化正文。
            </p>
            {!corpusReady ? (
              <Card>
                <p className="text-[12.5px] text-[var(--steel)]">知识库就绪后即可浏览。</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {documents.slice(0, 60).map((doc) => (
                  <button
                    key={doc.doc_id}
                    type="button"
                    onClick={() => openDocument(doc.doc_id)}
                    className="flex items-center gap-[11px] rounded-[8px] px-[8px] py-[9px] text-left transition-colors hover:bg-[var(--surface)]"
                  >
                    <span className="grid size-[26px] shrink-0 place-items-center rounded-[5px] bg-[var(--tint-sky)] text-[var(--link)]">
                      <Icon name="doc" size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.8px] font-medium text-[var(--ink)]">
                        {doc.title}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--stone)]">
                        {documentMeta(doc)}
                      </span>
                    </span>
                  </button>
                ))}
                {!documents.length ? (
                  <Card>
                    <p className="text-[12.5px] text-[var(--steel)]">当前知识库还没有已入库文档。</p>
                  </Card>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}
