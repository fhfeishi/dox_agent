export type Source = { title: string; url: string; snippet: string; page?: number; doc_id?: string; corpus_id?: string; version?: string; origin?: string; kind?: string; snapshot_id?: string; fetched_at?: string; start_line?: number; end_line?: number; captured_at?: string; truncated?: boolean; citation?: number };
export type Message = { role: "user" | "assistant"; content: string };
export type Usage = { run_id?: string; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; reported_tokens: number | null; calls: number; reported_calls: number; complete: boolean; missing_reasons?: Record<string, number>; calls_by_phase?: Record<string, number> };
export type Step = { run_id: string; id: string; sequence: number; phase: string; status: "running" | "completed" | "failed" | "interrupted"; label: string; detail?: string; duration_ms?: number };
export type Telemetry = { run_id?: string; path?: string; stages_ms: Record<string, number>; chunks_retrieved: number; reports_selected: number; context_tokens: number; invalid_citations?: number };
export type Options = { allowed_doc_ids: string[] | null; task_id?: string; task_version?: number; task_params?: Record<string, unknown>; corpus_id?: string; corpus_ids?: string[]; web_snapshot_ids?: string[] };
/** W3-A: client-visible run parameters recorded with the server-side snapshot. */
export type RunContext = { visible_params?: Record<string, unknown>; param_sources?: Record<string, string>; resource_policy?: "local_only" | "local_plus_urls"; output_intent?: string };
export type ChatRequestOptions = Options & { task_version?: number; session_key?: string; run_context?: RunContext };
export class ApiError extends Error {
  readonly detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.detail = detail;
  }
}
export type TaskParameter = { key: string; label: string; type: "text" | "integer" | "enum" | "boolean" | "year_range"; help?: string; required?: boolean; options?: string[]; default?: unknown };
export type TaskInfo = { id: string; name: string; description: string; example?: string; output_hint?: string; has_template: boolean; templates?: string[]; artifacts?: { default: string; allowed: string[] }; kind?: "builtin" | "custom"; status?: "draft" | "published" | "archived"; archived?: boolean; engine_task_id?: string; version?: number; revision?: number; background?: string; goal?: string; requirements?: string; category?: string; boundaries?: string; clarification_conditions?: string; output_instructions?: string; parameter_defaults?: Record<string, string>; parameters?: TaskParameter[]; report_template_id?: string; report_template_version?: number };
export type CorpusJob = { status: string; total: number; completed: number; imported: number; changed: number; added?: number; updated?: number; skipped?: number; deleted?: number; forced?: boolean; errors: { source?: string; error: string }[] };
export type CorpusInfo = {
  id: string; name: string; kind: string; domain: string; rel_path: string;
  docs_count: number; preparation: string; is_default: boolean; missing?: boolean;
  source_count?: number; indexed_count?: number; pending_count?: number; failed_count?: number;
  description?: string;
  index_progress: { stage: string; completed: number; total: number } | null;
  job: CorpusJob | null;
};

/** GET /api/corpora: corpus registry (H1). Read-only disk scan + config overrides. */
export async function fetchCorpora(signal?: AbortSignal): Promise<CorpusInfo[]> {
  const response = await fetch("/api/corpora", signal ? { signal } : undefined);
  if (!response.ok) throw new Error("知识库列表不可用（" + response.status + "）");
  return response.json();
}

/** POST /api/corpora/{id}/ingest (H2): import/refresh one corpus, bounded to its own root. */
export async function ingestCorpus(corpusId: string, force = false): Promise<CorpusJob> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/ingest${force ? "?force=true" : ""}`, { method: "POST" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : "导入请求失败（" + response.status + "）");
  return payload as CorpusJob;
}


export type CorpusFile = { rel_path: string; size: number; status: string; doc_id: string | null };
export type CorpusFileListing = { source_dir: string; files: CorpusFile[]; misplaced_files: string[] };

async function jsonOrThrow(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `${fallback}（${response.status}）`);
  return payload;
}

/** K6: corpus create / rename (display name) / delete (derived data only unless purging source). */
export async function createCorpus(name: string): Promise<CorpusInfo> {
  const response = await fetch("/api/corpora", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  return jsonOrThrow(response, "创建知识库失败") as Promise<CorpusInfo>;
}

export async function renameCorpus(corpusId: string, name: string): Promise<CorpusInfo> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  return jsonOrThrow(response, "重命名失败") as Promise<CorpusInfo>;
}

export async function reassociateCorpus(corpusId: string, directory: string): Promise<CorpusInfo> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/reassociate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ directory }),
  });
  return jsonOrThrow(response, "重新关联失败") as Promise<CorpusInfo>;
}

export async function setCorpusDescription(corpusId: string, description: string): Promise<CorpusInfo> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/description`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }),
  });
  return jsonOrThrow(response, "保存知识库说明失败") as Promise<CorpusInfo>;
}

export async function deleteCorpus(corpusId: string, purgeSource = false): Promise<void> {
  const query = purgeSource ? "?purge_source=true" : "";
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}${query}`, { method: "DELETE" });
  await jsonOrThrow(response, "删除失败");
}

/** K7: source-file list / upload / rename / delete. */
export async function fetchCorpusFiles(corpusId: string): Promise<CorpusFileListing> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files`);
  const payload = await jsonOrThrow(response, "文件列表不可用");
  return payload as CorpusFileListing;
}

export async function uploadCorpusFile(corpusId: string, file: File): Promise<{ errors: { source?: string; error: string }[] }> {
  const form = new FormData();
  form.append("upload", file);
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files`, { method: "POST", body: form });
  const result = await jsonOrThrow(response, "上传失败") as { errors?: { source?: string; error: string }[] };
  return { errors: result.errors ?? [] };
}

export async function deleteCorpusFile(corpusId: string, relPath: string): Promise<void> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files?rel_path=${encodeURIComponent(relPath)}`, { method: "DELETE" });
  await jsonOrThrow(response, "删除文件失败");
}

export async function renameCorpusFile(corpusId: string, relPath: string, newName: string): Promise<void> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rel_path: relPath, new_name: newName }) });
  await jsonOrThrow(response, "重命名文件失败");
}
export type ReportParams = { domain?: string; year_from?: number; year_to?: number; template_id?: string; template_version?: number; fund_type?: string; focus?: string; purpose?: string; audience?: string; length?: string; sources?: Record<string, string>; scope_fingerprint?: string; doc_ids?: string[]; session_key?: string; run_id?: string; parent_run_id?: string; task_id?: string; task_version?: number; task_params?: Record<string, unknown>; corpus_id?: string };
export type ReportPreflight = { total: number; corpus_total: number; excluded: { date: number; year: number; category: number }; date_hits: number; category_hits: number; eligible_count: number; eligible: { doc_id: string; version: string; title: string; corpus_id: string }[]; fingerprint: string };
export type WebPreview = { preview_id: string; expires_at: string; title: string; origin: string; pages: { number: number; text: string }[]; markdown?: string };
export type WebSnapshot = { web_snapshot_id: string; url: string; title: string; fetched_at: string; version: string; content_hash: string; parse_status: string; markdown: string };

export async function previewWeb(url: string): Promise<WebPreview> {
  const response = await fetch("/api/web/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
  return await jsonOrThrow(response, "网页预览失败") as WebPreview;
}

export async function confirmWeb(previewId: string, target: { target_corpus_id?: string; save_for_run?: boolean }): Promise<{ web_snapshot_id: string; doc_id?: string }> {
  const response = await fetch(`/api/web/confirm/${encodeURIComponent(previewId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target),
  });
  return await jsonOrThrow(response, "网页确认失败") as { web_snapshot_id: string; doc_id?: string };
}

export async function fetchWebSnapshot(snapshotId: string): Promise<WebSnapshot> {
  const response = await fetch(`/api/web/snapshots/${encodeURIComponent(snapshotId)}`);
  return await jsonOrThrow(response, "网页快照读取失败") as WebSnapshot;
}
export type ReportSummary = { report_id: string; created_at?: string; session_key?: string; run_id?: string; corpus_id?: string; template_id?: string; domain?: string; year_from?: number; year_to?: number };
export type ReportInfo = { report_id: string; created_at?: string; params?: ReportParams; markdown: string; idempotent?: boolean };
export type ReportMetadataCoverage = {
  corpus_id: string; total: number;
  date: { hits: number; missing: number };
  category: { hits: number; missing: number };
  unmatched: { doc_id: string; title: string; corpus_id: string; date: string; category: string }[];
};
export type Policy = Options & { route: "research" | "clarify"; stop_reason: string; notice?: string; report_params?: ReportParams };

export async function preflightReport(params: ReportParams): Promise<ReportPreflight> {
  const response = await fetch("/api/reports/preflight", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
  });
  return await jsonOrThrow(response, "报告资料预检失败") as ReportPreflight;
}

/** POST /api/reports (#10): generate an immutable markdown report; idempotent per run_id. */
export async function createReport(params: ReportParams): Promise<ReportInfo> {
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return jsonOrThrow(response, "生成报告失败") as Promise<ReportInfo>;
}

/** GET /api/reports?session_key=: report metadata for one session (no markdown). */
export async function fetchReports(sessionKey: string, signal?: AbortSignal): Promise<ReportSummary[]> {
  const response = await fetch(`/api/reports?session_key=${encodeURIComponent(sessionKey)}`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error("报告列表不可用（" + response.status + "）");
  return response.json();
}

/** GET /api/reports/{id}: one report with its markdown body. */
export async function fetchReport(reportId: string): Promise<ReportInfo> {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`);
  return jsonOrThrow(response, "报告不可用") as Promise<ReportInfo>;
}

export type ArtifactSummary = {
  artifact_id: string; type: string; status: string; title: string; current_version: number;
  created_at: string; updated_at: string; session_key: string; run_id: string; corpus_ids: string[];
  task_id: string; task_version?: number | null; template_id: string; template_version?: number | null; export_format: string; export_status: string;
  fail_reason: string; legacy?: boolean;
  source_verification?: "verified" | "unverified" | "user_modified";
  run_available?: boolean;
};
export type ArtifactInfo = ArtifactSummary & {
  version: number; markdown: string; citations: { doc_id: string; version: string; page?: number | null }[];
};
export type ArtifactVersion = { version: number; created_at: string; status: string; source_verification: string };

/** W3-B: artifacts for one session (undefined = global list; "" filters empty session). */
export async function fetchArtifacts(sessionKey?: string, signal?: AbortSignal): Promise<ArtifactSummary[]> {
  const query = sessionKey === undefined ? "" : `?session_key=${encodeURIComponent(sessionKey)}`;
  const response = await fetch(`/api/artifacts${query}`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error("成果列表不可用（" + response.status + "）");
  return response.json();
}

export async function fetchArtifact(artifactId: string, version?: number): Promise<ArtifactInfo> {
  const suffix = version === undefined ? "" : `?version=${version}`;
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}${suffix}`);
  return jsonOrThrow(response, "成果不可用") as Promise<ArtifactInfo>;
}

export async function fetchArtifactVersions(artifactId: string): Promise<ArtifactVersion[]> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/versions`);
  return jsonOrThrow(response, "成果版本不可用") as Promise<ArtifactVersion[]>;
}

export async function createArtifactVersion(artifactId: string, markdown: string, status: "draft" | "completed"): Promise<ArtifactInfo> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/versions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown, status }),
  });
  return jsonOrThrow(response, "保存版本失败") as Promise<ArtifactInfo>;
}

export async function createArtifact(params: {
  type?: string; run_id: string; markdown: string; title?: string; session_key?: string; corpus_ids?: string[];
}): Promise<ArtifactInfo> {
  const response = await fetch("/api/artifacts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
  });
  return jsonOrThrow(response, "保存成果失败") as Promise<ArtifactInfo>;
}

/** W3-B: direct export URL (real .docx or .md); opening it triggers the download. */
export function artifactExportUrl(artifactId: string, format: "md" | "docx", version?: number): string {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/export?format=${format}${version === undefined ? "" : `&version=${version}`}`;
}

export type RunSnapshot = {
  contract_version: number; run_id: string; created_at: string; updated_at: string;
  session_key: string; parent_run_id: string; run_type: string; status: string;
  task_id: string; task_version?: number | null; engine_task_id?: string; model: string; resource_policy: string;
  requested_corpus_ids: string[]; effective_corpus_ids: string[]; allowed_doc_ids: string[] | null;
  params: Record<string, unknown>; param_sources: Record<string, string>; output_intent: string;
  ended_at: string; metrics: Record<string, unknown>; citations: { doc_id: string; version: string; page?: number | null }[];
};

/** W3-A: read a persisted run snapshot; legacy runs without one return 404. */
export async function fetchRun(runId: string): Promise<RunSnapshot> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  return jsonOrThrow(response, "运行信息不可用") as Promise<RunSnapshot>;
}

/** GET /api/corpora/{id}/report-metadata: field coverage without document contents. */
export async function fetchReportMetadata(corpusId: string): Promise<ReportMetadataCoverage> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/report-metadata`);
  return jsonOrThrow(response, "元数据覆盖不可用") as Promise<ReportMetadataCoverage>;
}
export type RunInfo = { run_id: string; session_key?: string; task_id?: string; task_version?: number | null; model?: string; resource_policy?: string; effective_corpus_ids?: string[]; allowed_doc_ids?: string[] | null; web_snapshot_ids?: string[] };
export type Event =
  | { event: "run"; data: RunInfo }
  | { event: "usage"; data: Usage }
  | { event: "step"; data: Step }
  | { event: "telemetry"; data: Telemetry }
  | { event: "policy"; data: Policy }
  | { event: "status"; data: { message: string } }
  | { event: "sources"; data: Source[] }
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { ok: boolean } }
  | { event: "error"; data: { message: string } };

/** Built-in tasks and user-owned draft/published definitions. */
export async function fetchTasks(signal?: AbortSignal, includeArchived = false): Promise<TaskInfo[]> {
  const query = includeArchived ? "?include_archived=true" : "";
  const response = await fetch(`/api/tasks${query}`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error("任务列表不可用（" + response.status + "）");
  return response.json();
}

export async function copyTask(source_task_id: string): Promise<TaskInfo> {
  const response = await fetch("/api/tasks/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_task_id }) });
  return jsonOrThrow(response, "复制任务失败") as Promise<TaskInfo>;
}

export async function saveTaskDraft(task: TaskInfo): Promise<TaskInfo> {
  const { revision, name, description, background, goal, requirements, category, boundaries,
    clarification_conditions, output_instructions, parameter_defaults, report_template_id,
    report_template_version } = task;
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(task.id)}/draft`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, name, description, background, goal, requirements, category, boundaries,
      clarification_conditions, output_instructions, parameter_defaults, parameters: task.parameters,
      report_template_id, report_template_version }),
  });
  return jsonOrThrow(response, "保存草稿失败") as Promise<TaskInfo>;
}

export async function fetchTaskVersion(taskId: string, version: number): Promise<TaskInfo> {
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(taskId)}/versions/${version}`);
  return jsonOrThrow(response, "任务版本不可用") as Promise<TaskInfo>;
}

export async function publishTask(task: TaskInfo): Promise<TaskInfo> {
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(task.id)}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: task.revision }),
  });
  return jsonOrThrow(response, "发布任务失败") as Promise<TaskInfo>;
}

export async function archiveTask(taskId: string): Promise<TaskInfo> {
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(taskId)}/archive`, { method: "POST" });
  return jsonOrThrow(response, "归档任务失败") as Promise<TaskInfo>;
}

export async function restoreTask(taskId: string): Promise<TaskInfo> {
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
  return jsonOrThrow(response, "恢复任务失败") as Promise<TaskInfo>;
}

export type TemplateSummary = { id: string; name: string; kind?: string; status?: string; archived?: boolean; version?: number };
export type TemplateInfo = TemplateSummary & { content: string; variables?: string[]; purpose?: string; revision?: number; source_template_id?: string };

/** W1: read-only built-in output templates for the shared inspector preview. */
export async function fetchTemplates(signal?: AbortSignal, includeArchived = false): Promise<TemplateSummary[]> {
  const query = includeArchived ? "?include_archived=true" : "";
  const response = await fetch(`/api/templates${query}`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error("输出模板列表不可用（" + response.status + "）");
  return response.json();
}

export async function fetchTemplate(templateId: string, version?: number): Promise<TemplateInfo> {
  const query = version === undefined ? "" : `?version=${version}`;
  const response = await fetch(`/api/templates/${encodeURIComponent(templateId)}${query}`);
  return jsonOrThrow(response, "输出模板不可用") as Promise<TemplateInfo>;
}

export type CustomTemplate = { id: string; kind: string; status: string; archived?: boolean; revision: number; version: number;
  name: string; purpose: string; content: string; variables: string[]; source_template_id?: string };

/** W4-B: custom output templates (copy a built-in, edit a draft, publish immutable versions). */
export async function copyTemplate(sourceTemplateId: string): Promise<CustomTemplate> {
  const response = await fetch("/api/templates/custom", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_template_id: sourceTemplateId }),
  });
  return jsonOrThrow(response, "复制模板失败") as Promise<CustomTemplate>;
}

export async function fetchCustomTemplate(templateId: string): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}`);
  return jsonOrThrow(response, "模板不可用") as Promise<CustomTemplate>;
}

export async function saveTemplateDraft(templateId: string, revision: number,
  changes: { name?: string; purpose?: string; content?: string; variables?: string[] }): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/draft`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, ...changes }),
  });
  return jsonOrThrow(response, "保存模板草稿失败") as Promise<CustomTemplate>;
}

export async function publishTemplate(templateId: string, revision: number): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }),
  });
  return jsonOrThrow(response, "发布模板失败") as Promise<CustomTemplate>;
}

export async function archiveCustomTemplate(templateId: string): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/archive`, { method: "POST" });
  return jsonOrThrow(response, "归档模板失败") as Promise<CustomTemplate>;
}

export async function restoreCustomTemplate(templateId: string): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/restore`, { method: "POST" });
  return jsonOrThrow(response, "恢复模板失败") as Promise<CustomTemplate>;
}

export function streamChat(messages: Message[], signal: AbortSignal, receive: (event: Event) => void, options?: ChatRequestOptions): Promise<void>;
export function streamChat(messages: Message[], runId: string, signal: AbortSignal, receive: (event: Event) => void, options?: ChatRequestOptions): Promise<void>;
export async function streamChat(messages: Message[], runIdOrSignal: string | AbortSignal,
  signalOrReceive: AbortSignal | ((event: Event) => void), receiveOrOptions?: ((event: Event) => void) | ChatRequestOptions,
  explicitOptions?: ChatRequestOptions) {
  const hasRunId = typeof runIdOrSignal === "string";
  const runId = hasRunId ? runIdOrSignal : undefined;
  const signal = (hasRunId ? signalOrReceive : runIdOrSignal) as AbortSignal;
  const receive = (hasRunId ? receiveOrOptions : signalOrReceive) as (event: Event) => void;
  const options = (hasRunId ? explicitOptions : receiveOrOptions) as ChatRequestOptions | undefined;
  const response = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...(runId ? { run_id: runId } : {}), ...options }), signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    const message = typeof detail === "string"
      ? detail
      : detail?.missing === true
        ? "此会话绑定的知识库目录已缺失，请重新选择后重试"
        : "请求失败（" + response.status + "）";
    throw new ApiError(message, detail);
  }
  if (!response.body) throw new Error("浏览器未收到响应流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = frame.split("\n").find(line => line.startsWith("event:"))?.slice(6).trim();
        const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (!event || !data) continue;
        const payload = JSON.parse(data);
        if (event === "error") throw new Error(payload.message);
        if (event === "done") {
          if (!payload.ok) throw new Error("回答未完成");
          finished = true;
        }
        if (["status", "sources", "token", "done", "policy", "telemetry", "usage", "step", "run"].includes(event)) {
          receive({ event, data: payload } as Event);
        }
        if (finished) return;
      }
      if (done) break;
    }
    if (!finished) throw new Error("连接中断，回答未完成");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
