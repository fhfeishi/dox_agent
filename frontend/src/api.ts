export type Source = { input_id?: string; locations?: { page?: number; heading: string; snippet: string; chunk_id: string }[]; title: string; url: string; snippet: string; page?: number; doc_id?: string; corpus_id?: string; version?: string; origin?: string; kind?: string; snapshot_id?: string; fetched_at?: string; start_line?: number; end_line?: number; captured_at?: string; truncated?: boolean; citation?: number };
export type Message = { role: "user" | "assistant"; content: string };
export type Usage = { run_id?: string; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; reported_tokens: number | null; calls: number; reported_calls: number; complete: boolean; missing_reasons?: Record<string, number>; calls_by_phase?: Record<string, number> };
export type Step = { run_id: string; id: string; sequence: number; phase: string; status: "running" | "completed" | "failed" | "interrupted"; label: string; detail?: string; duration_ms?: number };
export type Telemetry = { run_id?: string; path?: string; stages_ms: Record<string, number>; chunks_retrieved: number; reports_selected: number; context_tokens: number; invalid_citations?: number };
export type Options = { allowed_doc_ids: string[] | null; task_id?: string; task_version?: number; task_params?: Record<string, unknown>; corpus_id?: string; corpus_ids?: string[]; web_snapshot_ids?: string[] };
/** W3-A: client-visible run parameters recorded with the server-side snapshot. */
export type RunContext = { visible_params?: Record<string, unknown>; param_sources?: Record<string, string>; resource_policy?: "local_only" | "local_plus_urls"; output_intent?: string };
export type ChatRequestOptions = Options & { task_version?: number; session_key?: string; run_context?: RunContext;
  /** P10b (2026-11-06): this turn asks about one earlier answer; the server re-derives its text. */
  reply_to?: { run_id: string; index?: number; quote?: string } };
export class ApiError extends Error {
  readonly detail?: unknown;
  readonly status?: number;
  constructor(message: string, detail?: unknown, status?: number) {
    super(message);
    this.detail = detail;
    this.status = status;
  }
}
export type TaskParameter = { key: string; label: string; type: "text" | "integer" | "enum" | "boolean" | "year_range"; help?: string; required?: boolean; options?: string[]; default?: unknown };
export type TaskInfo = { id: string; name: string; description: string; prompt?: string; example?: string; output_hint?: string; has_template: boolean; templates?: string[]; artifacts?: { default: string; allowed: string[] }; kind?: "builtin" | "custom"; status?: "draft" | "published" | "archived"; archived?: boolean; engine_task_id?: string; version?: number; revision?: number; background?: string; goal?: string; requirements?: string; category?: string; boundaries?: string; clarification_conditions?: string; output_instructions?: string; outline?: string; parameter_defaults?: Record<string, string>; parameters?: TaskParameter[]; report_template_id?: string; report_template_version?: number; skill_id?: string; skill_version?: number };
export type CorpusJob = { status: string; total: number; completed: number; imported: number; changed: number; added?: number; updated?: number; skipped?: number; deleted?: number; forced?: boolean; errors: { source?: string; error: string }[];
  /** The persisted run behind it (card B1): status "interrupted" when a restart cut it off. */
  run_id?: string; started_at?: string; ended_at?: string | null };
export type CorpusInfo = {
  id: string; name: string; kind: string; domain: string; rel_path: string;
  docs_count: number; preparation: string; is_default: boolean; missing?: boolean;
  source_count?: number; indexed_count?: number; pending_count?: number; failed_count?: number;
  description?: string;
  index_progress: { stage: string; completed: number; total: number } | null;
  job: CorpusJob | null;
};

/** GET /api/corpora: corpus registry (H1). Read-only disk scan + config overrides. */
/** What each library holds and how far it is organised (`/api/overview/libraries`). */
export type IndexState = { state: "ready" | "refreshing"; revision: number; stale_docs: number };
export type LibraryOverview = {
  index?: IndexState;
  research_records?: { funded: number; funding_yuan: string; listed: number; outputs: number };
  corpus_id: string; name: string; files: number; projects: number; dimensions: Record<string, number>;
  /** One measure for all libraries, the one most projects state; label names it (批准资助金额 …). */
  funding: { total_yuan: string; projects: number; scope?: string; label?: string }; start_years: number[];
  hierarchy: { generated_at?: string | null; scenes: number; issues: number; state?: string };
  /** 技术谱系 record: how many technique items it holds and how far they have travelled.
   *  `maturity` is the six-level spread (0 未判定 … 5 示范转化), `avg_maturity` its mean including 0,
   *  `high_maturity`/`high_share` the items at 4 or 5, `top` the three highest with the basis they
   *  quoted, and `systems_detail` one row per technology system with its own item count. All of it
   *  is counted from the stored lineage record (query 2026-1021 首页地形图); a library without one
   *  leaves these out. */
  lineage: {
    generated_at?: string | null; items: number; systems: number; state?: string; stale_reason?: string; unplaced?: number;
    maturity?: number[]; avg_maturity?: number; high_maturity?: number; high_share?: number;
    top?: { name: string; field: string; maturity: number; basis: string }[];
    systems_detail?: { name: string; plain: string; items: number; sample: string }[];
  };
  /** Projects whose material yielded something in that dimension — the map asks whether the
   *  dimension is represented, not whether every file was processed. */
  dimension_evidence?: Record<string, number>;
  pending_identity?: number;
  /** Projects per application field, largest first. */
  fields?: [string, number][];
  /** Identified projects and known funding (yuan, the same measure as funding) per start year, keyed "2021". */
  by_year?: Record<string, number>; funding_by_year?: Record<string, number>;
};

export async function fetchLibraryOverview(signal?: AbortSignal): Promise<LibraryOverview[]> {
  return jsonOrThrow(await fetch("/api/overview/libraries", { signal }), "资料库概况暂不可读");
}

/** Markdown written on the page as a real .docx (03 机会清单 and 立项建议, query 2026-1023 1156). */
export async function markdownToWord(markdown: string): Promise<Blob> {
  const response = await fetch("/api/export/docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown }) });
  if (!response.ok) await jsonOrThrow(response, "Word 文档未生成");
  return response.blob();
}

/** 资料库预览 → 导出报告: the preview's counted figures saved to 报告中心 as 专项报告 · 领域分析. */
export async function saveDomainReport(corpusId: string): Promise<ArtifactSummary> {
  const response = await fetch(`/api/domains/${encodeURIComponent(corpusId)}/report`, { method: "POST" });
  const saved = await jsonOrThrow(response, "报告未保存") as ArtifactSummary;
  window.dispatchEvent(new Event("dox-artifacts-changed"));
  return saved;
}

export async function fetchCorpora(signal?: AbortSignal): Promise<CorpusInfo[]> {
  const response = await fetch("/api/corpora", signal ? { signal } : undefined);
  if (!response.ok) throw new Error("资料库列表不可用（" + response.status + "）");
  return response.json();
}

/** POST /api/corpora/{id}/ingest (H2): import/refresh one corpus, bounded to its own root. */
/** The corpus' current import job (``corpus.job`` from ``GET /api/corpora``); null when none ran.
 *  R11c #5: the ingest endpoint returns when the run starts, so the caller polls this to see it end. */
export async function fetchCorpusJob(corpusId: string, signal?: AbortSignal): Promise<CorpusJob> {
  const listing = await fetchCorpora(signal);
  const corpus = listing.find((item) => item.id === corpusId);
  return corpus?.job ?? { status: "unknown", total: 0, completed: 0, imported: 0, changed: 0, errors: [] };
}

export async function ingestCorpus(corpusId: string, force = false): Promise<CorpusJob> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/ingest${force ? "?force=true" : ""}`, { method: "POST" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : "导入请求失败（" + response.status + "）");
  return payload as CorpusJob;
}


/** duplicate_of: the earlier file with exactly the same content, if any (query 2026-1016 1814). */
export type CorpusFile = { rel_path: string; size: number; status: string; doc_id: string | null; reason?: string; duplicate_of?: string };
export type CorpusFileListing = { source_dir: string; files: CorpusFile[]; misplaced_files: string[] };

export async function sendRunFeedback(runId: string, kind: "explicit_memory" | "comment",
  payload: Record<string, unknown> = {}, explicit = false): Promise<void> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/feedback`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload, explicit }),
  });
  if (!response.ok) await jsonOrThrow(response, "反馈未记录");
}

async function jsonOrThrow(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof payload?.detail === "string" ? payload.detail
    : typeof payload?.detail?.message === "string" ? payload.detail.message : `${fallback}（${response.status}）`, payload?.detail, response.status);
  return payload;
}

/**
 * Personal libraries (D-20261027-1, D-20261028-2): an account's own named set of documents — references to
 * system-library documents, and files the owner uploaded (library id `mine-<personal library id>`).
 * `library_missing` marks a reference whose library is gone.
 */
export const UPLOADS_PREFIX = "mine-";
export type PersonalRef = { corpus_id: string; doc_id: string; title: string; library_missing?: boolean };
/** An uploaded file not (yet) in the library: waiting, being parsed, or failed with the parser's reason. */
export type PendingUpload = { name: string; state: "queued" | "parsing" | "failed"; error: string };
/**
 * The task a personal library is for is an existing task template (2026-11-06): ``task_id`` /
 * ``task_version`` name it, ``report_template_id`` / ``report_template_version`` say which report
 * it writes. Built-in tasks are version 0; a custom task names its published version.
 */
export type PersonalTask = { task_id?: string; task_version?: number; report_template_id?: string; report_template_version?: number };
export type PersonalLibrary = PersonalTask & { id: string; name: string; description: string; revision: number; created_at: string; updated_at: string;
  corpus_ids: string[]; refs: PersonalRef[]; uploads?: PendingUpload[] };
export type PersonalLibrarySummary = Omit<PersonalLibrary, "refs" | "uploads"> & { count: number; uploads: number };

export async function fetchPersonalLibraries(signal?: AbortSignal): Promise<PersonalLibrarySummary[]> {
  return jsonOrThrow(await fetch("/api/personal-libraries", { signal }), "个人资料库读取失败");
}

export async function fetchPersonalLibrary(id: string, signal?: AbortSignal): Promise<PersonalLibrary> {
  return jsonOrThrow(await fetch(`/api/personal-libraries/${encodeURIComponent(id)}`, { signal }), "个人资料库读取失败");
}

export async function createPersonalLibrary(name: string, refs: PersonalRef[] = [], description = "", task: PersonalTask = {}): Promise<PersonalLibrary> {
  const response = await fetch("/api/personal-libraries", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, ...task, refs: refs.map(({ corpus_id, doc_id, title }) => ({ corpus_id, doc_id, title })) }) });
  return jsonOrThrow(response, "新建个人资料库失败");
}

export async function changePersonalLibrary(id: string, change: { revision: number; name?: string; description?: string;
  add?: PersonalRef[]; remove?: PersonalRef[] } & PersonalTask): Promise<PersonalLibrary> {
  const strip = (refs?: PersonalRef[]) => (refs ?? []).map(({ corpus_id, doc_id, title }) => ({ corpus_id, doc_id, title }));
  const response = await fetch(`/api/personal-libraries/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...change, add: strip(change.add), remove: strip(change.remove) }) });
  return jsonOrThrow(response, "保存个人资料库失败");
}

/** Upload one file into a personal library; it is queued, parsed in the background and then added. */
export async function uploadPersonalFile(id: string, file: File): Promise<{ name: string; state: "queued" }> {
  const body = new FormData();
  body.append("upload", file);
  return jsonOrThrow(await fetch(`/api/personal-libraries/${encodeURIComponent(id)}/files`, { method: "POST", body }), "上传失败");
}

export async function removeFailedUpload(id: string, name: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/personal-libraries/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`, { method: "DELETE" }), "删除失败");
}

/**
 * A personal library's task picture (2026-11-06), read from stored records only: each reference's
 * four-dimension record and project row from the system library it lives in, plus the library's own
 * uploads. Nothing here calls a model, and the counts are scope counts, not library-wide statistics.
 */
export type PersonalAnalysis = {
  library_id: string; name: string; revision: number;
  task_id: string; task_name: string; task_engine_id: string; task_version: number; report_template_id: string; report_template_version: number;
  sources: { corpus_id: string; kind: "system" | "upload" | "personal"; name: string; state: "ready" | "partial" | "missing";
    documents: number; readable: number }[];
  extraction: { documents: number; current: number; missing: number; stale: number; invalid: number;
    schema_version: number; prompt_version: number; unreadable: string[] };
  counts: { projects: number; pending_identity: number; documents: number; corpora: number; cross_library_projects: number; unreadable: number };
  years: { labels: number[]; by_year: Record<string, number>; reason: string };
  funding: { projects: number; total_yuan: string; reason: string };
  dimensions: Record<string, { evidence_projects: number; missing_projects: number;
    items: { name: string; project_ids: string[]; count: number }[] }>;
  projects: { project_id: string; number: string; title: string; identity_status: "identified" | "pending";
    start_year: number | null; end_year: number | null; year_conflict: boolean; corpus_ids: string[]; extracted_files: number;
    files: { corpus_id: string; doc_id: string; version: string; title: string; origin: string; state: string; notice: string }[] }[];
  relations: { nodes: { project_id: string; title: string; number: string; year: number | null }[];
    edges: { source: string; target: string; shared: string[]; count: number }[]; reason: string };
  upload_corpus: string; notes: string[];
};

export async function fetchPersonalAnalysis(id: string, signal?: AbortSignal): Promise<PersonalAnalysis> {
  return jsonOrThrow(await fetch(`/api/personal-libraries/${encodeURIComponent(id)}/analysis`, { signal }), "任务分析读取失败");
}

export async function deletePersonalLibrary(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/personal-libraries/${encodeURIComponent(id)}`, { method: "DELETE" }), "删除个人资料库失败");
}

/** K6: corpus create / rename (display name) / delete (derived data only unless purging source). */
export async function createCorpus(name: string): Promise<CorpusInfo> {
  const response = await fetch("/api/corpora", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  return jsonOrThrow(response, "创建资料库失败") as Promise<CorpusInfo>;
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
  return jsonOrThrow(response, "保存资料库说明失败") as Promise<CorpusInfo>;
}

export async function deleteCorpus(corpusId: string, purgeSource = false): Promise<void> {
  const query = purgeSource ? "?purge_source=true" : "";
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}${query}`, { method: "DELETE" });
  await jsonOrThrow(response, "删除失败");
}

/** K7: source-file list / upload / rename / delete. */
export async function fetchCorpusFiles(corpusId: string, signal?: AbortSignal): Promise<CorpusFileListing> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files`, { signal });
  const payload = await jsonOrThrow(response, "文件列表不可用");
  return payload as CorpusFileListing;
}

export async function uploadCorpusFile(corpusId: string, file: File, relativePath?: string): Promise<{ errors: { source?: string; error: string }[] }> {
  const form = new FormData();
  form.append("upload", file);
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files${relativePath ? "?relative_path=" + encodeURIComponent(relativePath) : ""}`, { method: "POST", body: form });
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
export type ReportParams = { visible_sources?: Source[]; domain?: string; year_from?: number; year_to?: number; template_id?: string; template_version?: number; fund_type?: string; focus?: string; purpose?: string; audience?: string; length?: string; illustrated?: boolean; report_mode?: "theme" | "review"; sources?: Record<string, string>; scope_fingerprint?: string; doc_ids?: string[]; session_key?: string; run_id?: string; parent_run_id?: string; task_id?: string; task_version?: number; task_params?: Record<string, unknown>; corpus_id?: string };
export type ReportPreflight = { total: number; corpus_total: number; excluded: { period: number; year: number; category: number; stale?: number }; period_hits: number; category_hits: number; eligible_count: number; eligible: { doc_id: string; version: string; title: string; corpus_id: string; project_year_from: number; project_year_to: number }[]; fingerprint: string; reasons?: { doc_id: string; title: string; reason: string; period?: string }[]; observed_years?: number[]; hint?: string };
export type WebPreview = { preview_id: string; expires_at: string; title: string; origin: string; pages: { number: number; text: string }[]; markdown?: string };
export type WebSnapshot = { web_snapshot_id: string; url: string; title: string; fetched_at: string; version: string; content_hash: string; parse_status: string; markdown: string; search_query?: string; search_domains?: string[]; search_time_filter?: string; search_provider?: string };
export type WebSearchResult = { result_id: string; url: string; title: string; snippet: string };
export type WebSearch = { search_id: string; expires_at: string; query: string; domains: string[]; time_filter: string; provider: string; results: WebSearchResult[] };

export type TargetJob = { job_id: string; corpus_id: string; status: "running" | "done" | "partial" | "error" | "interrupted"; completed: number; total: number; errors: { doc_id: string; error: string }[] };
export type TargetEvidence = { version: string; locator: { basis: string; page?: number; chunk_id?: string; heading?: string; start_char?: number; end_char?: number }; quote: string };
export type TargetItem = {
  id: string; name: string; desc: string;
  status?: string;
  evidence: TargetEvidence[];
};
export type TargetFacet = { key: string; state: "has" | "未提及" | "异常"; items: TargetItem[] };
export type TargetRelation = { from: { dimension: string; item_id: string }; to: { dimension: string; item_id: string }; type: string; basis: string; evidence?: TargetEvidence[] };
export type TargetReport = {
  doc_id: string; version: string; schema_version: number; prompt_version: number;
  title: string; source_name: string; index_status: string;
  process: { status: string; coverage: { processed: number; total: number } };
  facets: Record<string, { state: "has" | "未提及" | "异常" | "未处理"; items: Omit<TargetItem, "evidence">[] }>;
  stale: boolean; message: string;
};
export type TargetDocument = {
  doc_id: string; title: string; origin: string; version: string; captured_at: string;
  kind: string; parser: string; pages: number;
};
/** Project identity and funding facts (2026-11-09): every value carries its own quote. */
export type FactField = { value: string; source: "content" | "filename" | "manual" | "unknown";
  confidence: "high" | "medium" | "low"; precision?: "year" | "month" | "day";
  evidence: { quote: string; locator: { basis: string; page?: number; start_char?: number; end_char?: number } }[] };
export type FundingFact = { term: "total" | "awarded" | "direct" | "indirect"; term_raw: string;
  amount: string; unit: string; currency: string; tax: string; source: string; status: string;
  confidence: string; evidence: { quote: string; locator: { basis: string; page?: number; start_char?: number; end_char?: number } }[] };
export type ProjectFacts = {
  status: "completed" | "partial" | "failed";
  schema_version: number; dictionary_id: string; dictionary_version: number; prompt_version: number;
  project: { identity?: string; project_name?: FactField; project_no?: FactField; project_scheme?: FactField;
    project_category?: FactField; lead_unit?: FactField; participant_units?: FactField[];
    principal_investigator?: FactField; start_date?: FactField; end_date?: FactField };
  funding: FundingFact[];
  candidates: Record<string, unknown>;
  missing: string[];
  rejected: { field: string; reason: string }[];
  process: { model: string; started_at: string; ended_at: string; error: string };
};
export type ParseFacts = { status: string; parsed_rel: string; profile: string; parser: string;
  text_sha256: string; corrections_hash: string; corrections_invalidated: boolean;
  quality: { pages: number; coverage: number; sparse_pages: number; unreadable_chars: number } | null;
  grade: string | null; parsed_at: string; error: string };

export type TargetDetail = {
  doc_id: string; version: string; source_hash: string;
  schema_version: number; prompt_version: number;
  model: string; generated_at: string;
  process: { status: string; coverage: { processed: number; total: number } };
  facets: TargetFacet[];
  relations: TargetRelation[];
  title: string; source_name: string;
  document: TargetDocument;
  metadata?: ProjectFacts | null;
  parse?: ParseFacts | null;
  error?: string;
};

/** Current corpus summaries for filtering; evidence is fetched only when opened. */
export async function fetchTargetReports(corpusId: string, signal?: AbortSignal): Promise<TargetReport[]> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/reports`, { signal });
  return await jsonOrThrow(response, "四维列表不可用") as Promise<TargetReport[]>;
}

export async function fetchTargetDetail(corpusId: string, docId: string, signal?: AbortSignal): Promise<TargetDetail> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/reports/${encodeURIComponent(docId)}/target`, { signal });
  return await jsonOrThrow(response, "四维信息不可用") as Promise<TargetDetail>;
}

/** Project identity and funding extraction: its own job, independent from the four dimensions. */
export async function extractFacts(corpusId: string, docIds: string[], force = false): Promise<TargetJob> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/facts`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc_ids: docIds, force }) });
  return await jsonOrThrow(response, "项目事实抽取未开始") as Promise<TargetJob>;
}

export async function fetchFactsJob(corpusId: string, jobId: string, signal?: AbortSignal): Promise<TargetJob> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/facts/jobs/${encodeURIComponent(jobId)}`, { signal });
  return await jsonOrThrow(response, "项目事实任务不可读") as Promise<TargetJob>;
}

export async function extractTargets(corpusId: string, docIds: string[], force = false): Promise<TargetJob> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/target`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc_ids: docIds, force }),
  });
  return await jsonOrThrow(response, "生成四维信息失败") as Promise<TargetJob>;
}

export async function fetchTargetJob(corpusId: string, jobId: string, signal?: AbortSignal): Promise<TargetJob> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/target/jobs/${encodeURIComponent(jobId)}`, { signal });
  return await jsonOrThrow(response, "四维任务状态不可用") as Promise<TargetJob>;
}

export async function webSearchCapability(): Promise<{ available: boolean; provider: string; max_selected: number }> {
  const response = await fetch("/api/web/search/capability");
  return await jsonOrThrow(response, "搜索配置读取失败") as { available: boolean; provider: string; max_selected: number };
}

export async function searchWeb(query: string, domains: string[], timeFilter: "any" | "month" | "year", limit = 5): Promise<WebSearch> {
  const response = await fetch("/api/web/search", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, domains, time_filter: timeFilter, limit }) });
  return await jsonOrThrow(response, "网络搜索失败") as WebSearch;
}

export async function previewSearchResult(searchId: string, resultId: string): Promise<WebPreview> {
  const response = await fetch(`/api/web/search/${encodeURIComponent(searchId)}/preview/${encodeURIComponent(resultId)}`, { method: "POST" });
  return await jsonOrThrow(response, "所选结果预览失败") as WebPreview;
}

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
export type ReportInfo = { report_id: string; artifact_id?: string; created_at?: string; params?: ReportParams; markdown: string; idempotent?: boolean; figures?: import("./components/ReportMarkdown").ReportFigure[] };
export type ReportMetadataCoverage = {
  corpus_id: string; total: number;
  period: { hits: number; missing: number };
  category: { hits: number; missing: number };
  unmatched: { doc_id: string; title: string; corpus_id: string; period: string; category: string }[];
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

/**
 * POST /api/artifacts/{id}/retry: run a failed report again with the settings it was started with
 * (card B1). Generation takes minutes and carries on at the server if the page closes, so this settles
 * as "started" after a short wait unless the server turned the attempt down straight away.
 */
export async function retryReport(artifactId: string, wait = 2500): Promise<"started" | ReportInfo> {
  const request = fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/retry`, { method: "POST" })
    .then((response) => jsonOrThrow(response, "重新生成失败") as Promise<ReportInfo>);
  request.catch(() => undefined);  // a late failure shows on the report itself, not as an unhandled error
  return Promise.race([request, new Promise<"started">((resolve) => window.setTimeout(() => resolve("started"), wait))]);
}

/** GET /api/reports/{id}: one report with its markdown body. */
export async function fetchReport(reportId: string): Promise<ReportInfo> {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`);
  return jsonOrThrow(response, "报告不可用") as Promise<ReportInfo>;
}

export type ArtifactSummary = {
  cursor?: string; revision: number; lifecycle: "active" | "trashed"; trashed_at?: string; purge_after?: string;
  artifact_id: string; type: string; status: string; title: string; current_version: number;
  created_at: string; updated_at: string; session_key: string; run_id: string; corpus_ids: string[];
  task_id: string; task_version?: number | null; template_id: string; template_version?: number | null; export_format: string; export_status: string;
  fail_reason: string; legacy?: boolean;
  /** Failed because the service restarted under it: running it again is the whole remedy. */
  interrupted?: boolean;
  /** The account that created it ("" for older reports); 首页的“我的工作” lists one's own. */
  created_by?: string;
  source_verification?: "verified" | "unverified" | "user_modified";
  run_available?: boolean;
};
/** Moving a report to the recycle bin or purging it is for its author or an administrator (user,
 * 2026-10-20; the server enforces it). Reports from before authorship was recorded are the administrator's. */
export const canDeleteArtifact = (item: Pick<ArtifactSummary, "created_by">, username: string, role: string) =>
  role === "admin" || (Boolean(item.created_by) && item.created_by === username);
export type ArtifactInfo = ArtifactSummary & {
  version: number; markdown: string; citations: ({ input_id?: string; citation?: number; doc_id?: string; corpus_id?: string; version?: string; title?: string;
    page?: number | null; kind?: string; snapshot_id?: string; url?: string; fetched_at?: string })[];
  figures?: import("./components/ReportMarkdown").ReportFigure[];
};
export type ArtifactVersion = { version: number; created_at: string; status: string; source_verification: string };

export async function fetchFigureCandidates(artifactId: string): Promise<import("./components/ReportMarkdown").ReportFigure[]> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/figure-candidates`);
  return jsonOrThrow(response, "可替换图片读取失败") as Promise<import("./components/ReportMarkdown").ReportFigure[]>;
}

export async function changeArtifactFigure(artifactId: string, figureId: string, replacementId?: string, revision?: number): Promise<ArtifactInfo> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/figures/${encodeURIComponent(figureId)}${replacementId ? "/replace" : ""}`,
    replacementId ? { method: "POST", headers: { "Content-Type": "application/json", "If-Match": `"${revision}"` }, body: JSON.stringify({ figure_id: replacementId }) }
      : { method: "DELETE", headers: { "If-Match": `"${revision}"` } });
  return jsonOrThrow(response, "修改图片失败") as Promise<ArtifactInfo>;
}

/** W3-B: artifacts for one session (undefined = global list; "" filters empty session). */
/**
 * Whose records a list shows (query 2026-1023 1044): "mine" is the signed-in account's own (the
 * administrator's also the older ones with no recorded author); "all", for the administrator, everyone's.
 */
export type Scope = "mine" | "all";
/** 报告中心 records; `view: "trash"` lists the recycle bin, `created_by` one account's own. */
export type ArtifactFilter = { session_key?: string; type?: string; limit?: number; view?: "trash"; created_by?: string; scope?: Scope };

export async function fetchArtifacts(filter: ArtifactFilter = {}, signal?: AbortSignal): Promise<ArtifactSummary[]> {
  // "mine" is the server's default, so only "all" goes on the address.
  const query = new URLSearchParams(Object.entries(filter).flatMap(([key, value]) => value === undefined || (key === "scope" && value === "mine") ? [] : [[key, String(value)]]));
  const response = await fetch(`/api/artifacts${query.size ? `?${query}` : ""}`, { signal });
  if (!response.ok) throw new Error(`${filter.view === "trash" ? "回收站读取失败" : "报告列表不可用"}（${response.status}）`);
  return response.json();
}

export async function fetchArtifact(artifactId: string, version?: number, includeTrashed = false): Promise<ArtifactInfo> {
  const suffix = `?include_trashed=${includeTrashed}${version === undefined ? "" : `&version=${version}`}`;
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}${suffix}`);
  return jsonOrThrow(response, "报告不可用") as Promise<ArtifactInfo>;
}

export async function fetchArtifactVersions(artifactId: string, includeTrashed = false): Promise<ArtifactVersion[]> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/versions?include_trashed=${includeTrashed}`);
  return jsonOrThrow(response, "成果版本不可用") as Promise<ArtifactVersion[]>;
}

export async function createArtifactVersion(artifactId: string, markdown: string, status: "draft" | "completed", revision?: number): Promise<ArtifactInfo> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/versions`, {
    method: "POST", headers: { "Content-Type": "application/json", "If-Match": `"${revision}"` }, body: JSON.stringify({ markdown, status }),
  });
  return jsonOrThrow(response, "保存版本失败") as Promise<ArtifactInfo>;
}

export async function createArtifact(params: {
  type?: string; run_id: string; markdown: string; title?: string; session_key?: string; corpus_ids?: string[];
}): Promise<ArtifactInfo> {
  const response = await fetch("/api/artifacts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
  });
  const saved = await jsonOrThrow(response, "保存成果失败") as ArtifactInfo;
  window.dispatchEvent(new Event("dox-artifacts-changed"));
  return saved;
}

/** W3-B: direct export URL (real .docx or .md); opening it triggers the download. */
export function artifactExportUrl(artifactId: string, format: "md" | "docx" | "zip", version?: number): string {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/export?format=${format}${version === undefined ? "" : `&version=${version}`}`;
}

export type RunSnapshot = {
  contract_version: number; run_id: string; created_at: string; updated_at: string;
  session_key: string; parent_run_id: string; run_type: string; status: string;
  task_id: string; task_version?: number | null; engine_task_id?: string; skill_id?: string | null; skill_version?: number | null; model: string; resource_policy: string;
  requested_corpus_ids: string[]; effective_corpus_ids: string[]; allowed_doc_ids: string[] | null;
  params: Record<string, unknown>; param_sources: Record<string, string>; output_intent: string;
  ended_at: string; metrics: Record<string, unknown>; citations: ({ doc_id?: string; corpus_id?: string; version?: string; title?: string;
    page?: number | null; kind?: string; snapshot_id?: string; url?: string; fetched_at?: string })[];
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
/**
 * What the search did, in the reader's terms (user, 2026-10-20): the terms it looked for, how much it
 * looked through, which reports it chose and why, what it could not cover, and what the answer rests on.
 */
export type TraceReport = { doc_id: string; corpus_id: string; title: string; project_no: string; pi: string; years: string;
  matched: string[]; cover: number; where: { page: number; heading: string }[] };
export type TraceItem =
  | { kind: "search"; round: number; terms: string[]; considered: number; limited: number | null; year_window: number[] | null;
      /** The picked window held no project, so the search ran over every year instead (query 2026-1021). */
      year_relaxed?: boolean; reports: TraceReport[]; partial: boolean; reason: string }
  | { kind: "coverage"; missing: string[]; retry: boolean }
  | { kind: "answer"; basis: string; sources: number; web: number; characters: number };

export type Event =
  | { event: "run"; data: RunInfo }
  | { event: "trace"; data: TraceItem }
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
    clarification_conditions, output_instructions, outline, parameter_defaults, report_template_id,
    report_template_version, skill_id, skill_version } = task;
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(task.id)}/draft`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, name, description, background, goal, requirements, category, boundaries,
      clarification_conditions, output_instructions, outline, parameter_defaults, parameters: task.parameters,
      report_template_id, report_template_version, skill_id, skill_version }),
  });
  return jsonOrThrow(response, "保存草稿失败") as Promise<TaskInfo>;
}

export async function fetchCustomTask(taskId: string): Promise<TaskInfo> {
  return jsonOrThrow(await fetch(`/api/tasks/custom/${encodeURIComponent(taskId)}`), "任务不可用") as Promise<TaskInfo>;
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

/** Never-published drafts only; the server answers 409 for a published task (archive it instead). */
export async function deleteTask(taskId: string): Promise<void> {
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  if (!response.ok) await jsonOrThrow(response, "删除任务失败");
}

export async function archiveTask(taskId: string): Promise<TaskInfo> {
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(taskId)}/archive`, { method: "POST" });
  return jsonOrThrow(response, "归档任务失败") as Promise<TaskInfo>;
}

export async function restoreTask(taskId: string): Promise<TaskInfo> {
  const response = await fetch(`/api/tasks/custom/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
  return jsonOrThrow(response, "恢复任务失败") as Promise<TaskInfo>;
}


export type TemplateSummary = { id: string; name: string; kind?: string; status?: string; archived?: boolean; version?: number; content?: string; purpose?: string;
  /** The built-in template a custom one was copied from (kept through further copies). */
  source_template_id?: string };
export type TemplateInfo = TemplateSummary & { content: string; variables?: string[]; purpose?: string; revision?: number; source_template_id?: string };

export type TemplateArea = "analysis" | "intelligence";
/** 情报分析 templates are the built-in `intelligence` one and its copies; the rest belong to 存量分析 (query 2026-1014 1820). */
export const templateArea = (t: TemplateSummary): TemplateArea =>
  // 情报分析 has one built-in template per purpose (query 2026-1020 1653): intelligence, intelligence_background …
  /^intelligence(_|$)/.test(t.id) || /^intelligence(_|$)/.test(t.source_template_id ?? "") ? "intelligence" : "analysis";

/** One label wherever a report template is chosen: a custom template's name is its current draft's,
 * so the label names the published version a report will use and says when a newer draft is open. */
export const templateLabel = (t: Pick<TemplateSummary, "name" | "kind" | "status" | "version">): string =>
  t.kind === "custom" ? `${t.name}（已发布 v${t.version}${t.status === "draft" ? "，另有草稿" : ""}）` : t.name;

/** W1: read-only built-in output templates for the shared inspector preview. */
export async function fetchTemplates(signal?: AbortSignal, includeArchived = false): Promise<TemplateSummary[]> {
  const query = includeArchived ? "?include_archived=true" : "";
  const response = await fetch(`/api/templates${query}`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error("输出模版列表不可用（" + response.status + "）");
  return response.json();
}

export async function fetchTemplate(templateId: string, version?: number): Promise<TemplateInfo> {
  const query = version === undefined ? "" : `?version=${version}`;
  const response = await fetch(`/api/templates/${encodeURIComponent(templateId)}${query}`);
  return jsonOrThrow(response, "输出模版不可用") as Promise<TemplateInfo>;
}

export type CustomTemplate = { id: string; kind: string; status: string; archived?: boolean; revision: number; version: number;
  name: string; purpose: string; content: string; variables: string[]; source_template_id?: string };

/** W4-B: custom output templates (copy a built-in, edit a draft, publish immutable versions). */
export async function copyTemplate(sourceTemplateId: string): Promise<CustomTemplate> {
  const response = await fetch("/api/templates/custom", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_template_id: sourceTemplateId }),
  });
  return jsonOrThrow(response, "复制模版失败") as Promise<CustomTemplate>;
}

export async function fetchCustomTemplate(templateId: string): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}`);
  return jsonOrThrow(response, "模版不可用") as Promise<CustomTemplate>;
}

export async function saveTemplateDraft(templateId: string, revision: number,
  changes: { name?: string; purpose?: string; content?: string; variables?: string[] }): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/draft`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, ...changes }),
  });
  return jsonOrThrow(response, "保存模版草稿失败") as Promise<CustomTemplate>;
}

export async function publishTemplate(templateId: string, revision: number): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }),
  });
  return jsonOrThrow(response, "发布模版失败") as Promise<CustomTemplate>;
}

export async function deleteCustomTemplate(templateId: string): Promise<void> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}`, { method: "DELETE" });
  if (!response.ok) await jsonOrThrow(response, "删除模版失败");
}

export async function archiveCustomTemplate(templateId: string): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/archive`, { method: "POST" });
  return jsonOrThrow(response, "归档模版失败") as Promise<CustomTemplate>;
}

export async function restoreCustomTemplate(templateId: string): Promise<CustomTemplate> {
  const response = await fetch(`/api/templates/custom/${encodeURIComponent(templateId)}/restore`, { method: "POST" });
  return jsonOrThrow(response, "恢复模版失败") as Promise<CustomTemplate>;
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
        ? "此会话绑定的资料库目录已缺失，请重新选择后重试"
        : "请求失败（" + response.status + "）";
    throw new ApiError(message, detail);
  }
  await readEvents(response, receive);
}

/** Read an answer's server-sent events until it ends; an answer that stops short throws. */
async function readEvents(response: Response, receive: (event: Event) => void) {
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
        if (["status", "sources", "token", "done", "policy", "telemetry", "usage", "step", "run", "trace"].includes(event)) {
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

/**
 * GET /api/runs/{id}/events: an answer from its first event, live while it is still being written,
 * or as kept with the run once done (card B1). Resolves to false when the server has nothing to show.
 */
export async function followRun(runId: string, signal: AbortSignal, receive: (event: Event) => void): Promise<boolean> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/events`, { signal });
  if (response.status === 404 || response.status === 409) return false;
  if (!response.ok) throw new ApiError("请求失败（" + response.status + "）", null);
  await readEvents(response, receive);
  return true;
}

/** POST /api/runs/{id}/cancel: stop an answer on purpose (leaving the page no longer stops it). */
export async function cancelRun(runId: string) {
  await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }).catch(() => undefined);
}

export async function changeArtifactLifecycle(item: ArtifactSummary, action: "trash" | "restore" | "purge") {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(item.artifact_id)}${action === "trash" ? "" : `/${action}`}`, {method: action === "restore" ? "POST" : "DELETE", headers: {"If-Match": `"${item.revision}"`}});
  const result = await jsonOrThrow(response, "成果状态修改失败");
  window.dispatchEvent(new Event("dox-artifacts-changed"));
  return result as ArtifactInfo;
}

export type ModelInfo = { model: string; base_url: string; api_key_configured: boolean; review_override: Record<string, string> };
export type ModelStatus = { status: "untested" | "connected" | "failed"; checked_at: string | null;
  latency_ms: number | null; error: string; source?: string | null };
export const MODEL_STATUS_EVENT = "dox-model-status-changed";
export type ModelCheck = { ok: boolean; latency_ms?: number; error?: string; model_status?: ModelStatus };

export async function fetchModelInfo(): Promise<ModelInfo> {
  return jsonOrThrow(await fetch("/api/model"), "模型信息读取失败") as Promise<ModelInfo>;
}

export async function checkModel(): Promise<ModelCheck> {
  try { return await jsonOrThrow(await fetch("/api/model/check", { method: "POST" }), "连接测试失败") as ModelCheck; }
  finally { window.dispatchEvent(new Event(MODEL_STATUS_EVENT)); }
}

/**
 * 点选提问: `period` is the picked year span as "2021—2026" — the same phrase the retriever filters on;
 * `note` is what is already typed in the input box; `avoid` lists earlier drafts for the same picks, so
 * the next one takes another angle (query 2026-1021 1619).
 */
export type ComposeInput = { task: string; elements: string[]; intents: string[]; corpus_ids: string[]; scene?: string; note?: string;
  period?: string; avoid?: string[] };
/** The question, and the library's own scene / problem / system names it took up to be specific. */
export type ComposedQuestion = { question: string; added: string[] };

/** Click-to-ask: the model turns clicked keywords into one editable question. */
export async function composeQuestion(input: ComposeInput): Promise<ComposedQuestion> {
  const payload = await jsonOrThrow(await fetch("/api/compose-question", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "生成问题失败");
  const { question, added } = payload as Partial<ComposedQuestion> & { question: string };
  return { question, added: added ?? [] };
}


/* 情报分析: external material is saved as an input first, then analysed with a library (intelligence.py). */
export type IntelligenceInput = { input_id: string; filename: string; version: string; text: string };
/** A purpose of the analysis, what it answers and its own built-in template (query 2026-1020 1653). */
export type IntelligencePurpose = { key: string; label: string; focus: string; template_id: string };
export type IntelligenceRequest = { input_ids: string[]; corpus_id: string; purpose: string; template: string; template_id: string | null;
  template_version: number | null; input_template_id: string | null; session_key: string };

export async function fetchIntelligencePurposes(signal?: AbortSignal): Promise<IntelligencePurpose[]> {
  return jsonOrThrow(await fetch("/api/intelligence/purposes", { signal }), "分析目的暂不可读");
}

/** Saves one file as external material, or as a template when `template` is set; the server reads Word and PDF. */
export async function uploadIntelligenceInput(file: File, template = false): Promise<IntelligenceInput> {
  const form = new FormData(); form.append("file", file); if (template) form.append("template", "true");
  return jsonOrThrow(await fetch("/api/intelligence/inputs", { method: "POST", body: form }), "文件读取失败");
}

export async function fetchIntelligenceInput(inputId: string, signal?: AbortSignal): Promise<IntelligenceInput> {
  return jsonOrThrow(await fetch("/api/intelligence/inputs/" + encodeURIComponent(inputId), { signal }), "原输入暂不可读");
}

export async function analyzeIntelligence(request: IntelligenceRequest): Promise<ArtifactSummary> {
  return jsonOrThrow(await fetch("/api/intelligence/analyze", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request) }), "情报分析未完成");
}

/** Library groups on 资料库 (src/corpus_groups.py); a change carries the revision it was made against. */
export type CorpusGroup = { id: string; name: string; members: string[] };
export type CorpusGroups = { revision: number; groups: CorpusGroup[] };
export async function fetchCorpusGroups(): Promise<CorpusGroups> {
  return jsonOrThrow(await fetch("/api/corpus-groups"), "分组读取失败");
}
export async function postCorpusGroups(change: { revision: number; action: string; group_id: string; name: string; corpus_id: string }): Promise<CorpusGroups> {
  return jsonOrThrow(await fetch("/api/corpus-groups", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change) }), "分组修改失败，请刷新后重试");
}

/** Full-text search within one library; at most `limit` documents come back. */
export async function searchCorpus(corpusId: string, q: string, signal?: AbortSignal): Promise<{ hits: { doc_id: string; snippet: string }[]; limit: number }> {
  return jsonOrThrow(await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/search?q=${encodeURIComponent(q)}`, { signal }), "正文检索失败，请稍后重试");
}

/** Libraries ranked for a question; `clear` marks a match strong enough to switch to. */
export async function routeCorpora(q: string): Promise<{ corpus_id: string; name: string; clear: boolean }[]> {
  const response = await fetch("/api/corpora/route?" + new URLSearchParams({ q }));
  return response.ok ? response.json() : [];
}

export type Health = { api_key_configured?: boolean; model_status?: ModelStatus; preparation?: string; index_progress?: { stage: string; completed: number; total: number } | null; model?: string; docs_count?: number;
  web_provider?: string; [key: string]: unknown };
export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch("/api/health", { signal });
  if (!response.ok) throw new Error("服务暂不可用");
  return response.json();
}

/** HTTP status of a file without downloading it (200 when it can be shown). */
export async function fileStatus(url: string, signal?: AbortSignal): Promise<number> {
  return (await fetch(url, { method: "HEAD", signal })).status;
}

/* 资料入库工作台 (2026-11-04): read-only parse dossier / page comparison / stage view. */
export type ParseQuality = { pages: number; parsed_pages: number; pages_with_text: number; coverage: number;
  chars: number; unreadable_chars: number; sparse_pages: number; page_count_checked: boolean };
export type ParseAnchor = { anchor: string; kind: string; page?: number | null; found?: boolean };
export type ParseAnchors = { checked: ParseAnchor[]; matched: number; missing: ParseAnchor[]; page_count: number };
export type ParseCorrections = { active: boolean; invalidated: boolean; pages: number[] };
export type ParseCorrection = { before: string; after: string; by?: string; at?: string;
  blocks?: Record<string, ParseBlockCorrection> } | null;
export type ParseBlockCorrection = { before: string; after: string; by?: string; at?: string; bbox?: number[] };
/** ``text`` is Markdown the reader can render (pipe tables, ``$…$``); ``raw_text`` is the parser's own
 *  string (HTML table, ``<eq>``) and is what JSON view and a correction record show (2026-11-12). */
export type ParseBlock = { id: string; type: string; bbox: number[] | null; text: string; raw_text?: string;
  /** The alignment read from the block's own box, so the pane lines up with the source page. */
  align?: "left" | "center" | "right";
  /** True when this block starts on the previous page (MinerU's ``continues_prev``). */
  continues_prev?: boolean;
  /** The first page of a run that spans pages: where this paragraph actually begins. */
  continues_from?: number | null;
  no_text: boolean; images?: string[]; caption?: string; attached_to?: string; page?: number };
export type ParseBlocks = { page: number; page_count: number; blocks: ParseBlock[] };
export type ParseArchive = { rel: string; exists: boolean; cache: Record<string, unknown> | null; legacy: boolean;
  profile: string; pages: number; attempts: Record<string, unknown>[]; quality: ParseQuality | null;
  quality_grade?: string | null; anchors?: ParseAnchors; corrections?: ParseCorrections;
  markdown_chars: number; images: string[]; page_lengths: number[]; has_middle_json: boolean };
export type ParsePage = { rel: string; page: number; pages: number; text: string;
  corrected_text?: string; corrections?: ParseCorrection; images: string[] };
export type ParseStages = { corpus_id: string; name: string; documents: number;
  counts: Record<string, Record<string, number>>;
  rows: { rel_path: string; doc_id: string; status: string; last_error: string; source: string;
    parse: string; parse_reason: string; search: string; extract: string;
    lifecycle?: "处理中" | "待核对" | "已入库" | "失败"; lifecycle_reasons?: string[] }[] };

export async function fetchParseArchive(corpusId: string, rel: string, signal?: AbortSignal): Promise<ParseArchive> {
  return jsonOrThrow(await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/parse/archive?` +
    new URLSearchParams({ rel }), { signal }), "解析档案暂不可读");
}
export async function fetchParsePage(corpusId: string, rel: string, page: number, signal?: AbortSignal): Promise<ParsePage> {
  return jsonOrThrow(await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/parse/page/${page}?` +
    new URLSearchParams({ rel }), { signal }), "该页解析暂不可读");
}
export function parseImageUrl(corpusId: string, rel: string, name: string): string {
  return `/api/corpora/${encodeURIComponent(corpusId)}/parse/image?` + new URLSearchParams({ rel, name });
}
export async function fetchParseStages(corpusId: string, signal?: AbortSignal): Promise<ParseStages> {
  return jsonOrThrow(await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/parse/stages`, { signal }), "阶段视图暂不可读");
}
/** PUT .../parse/corrections: one page's human correction, saved next to cache.json (2026-11-04).
 *  It never republishes the document, so docs.version and cache.json stay as they were. */
export async function saveParseCorrection(corpusId: string, rel: string, page: number, before: string, after: string,
  block?: { block_id: string; bbox?: number[] | null }): Promise<ParseCorrections> {
  return jsonOrThrow(await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/parse/corrections`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel, page, before, after, ...(block ? { block_id: block.block_id, bbox: block.bbox } : {}) }),
  }), "校对保存失败");
}
/** GET .../parse/blocks: the parse's blocks of one page with their normalised bboxes (R10). */
export async function fetchParseBlocks(corpusId: string, rel: string, page: number, signal?: AbortSignal): Promise<ParseBlocks> {
  return jsonOrThrow(await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/parse/blocks?` +
    new URLSearchParams({ rel, page: String(page) }), { signal }), "逐块数据暂不可读");
}
/** GET .../parse/page-image: the original PDF page rendered as PNG (no MinerU, nothing written). */
export function parsePageImageUrl(corpusId: string, rel: string, page: number, scale = 1.5): string {
  return `/api/corpora/${encodeURIComponent(corpusId)}/parse/page-image?` +
    new URLSearchParams({ rel, page: String(page), scale: String(scale) });
}

/* --------------------------------------------------------------- 专家 (2026-11-05, P4)
 * One account's own expert layer: preferences (written, revoked, versioned), candidates proposed
 * from that account's explicit feedback, and approved skills. There is no cross-account view. */
export type ExpertSeatCounts = { seat: string; label: string; preferences: number; candidates: number; skills: number };
export type ExpertScope = { task_type: string | string[]; seat?: string; corpus_ids?: string[]; project_ids?: string[];
  excludes?: string[]; priority?: number };
export type ExpertPreference = { id: number; key: string; value: Record<string, unknown>; scope: ExpertScope;
  status: "active" | "revoked"; version: number; evidence: string; created_at: string; revoked_at: string };
export type ExpertPreferenceVersion = { version: number; value: Record<string, unknown>; scope: ExpertScope;
  status: "active" | "revoked"; evidence: string; changed_by: string; changed_at: string };
export type ExpertCandidate = { id: number; seat: string; source_run_id: string; source_artifact_id: string;
  source_artifact_version: number | null; source_hash: string; feedback_id: string; summary: string;
  steps: string[]; scope: ExpertScope; evidence_refs: string; fingerprint: string;
  status: "pending" | "approved" | "quarantined"; explicit: boolean; created_at: string;
  reviewed_by: string; reviewed_at: string; decision_reason: string };
export type ExpertSkill = { id: number; seat: string; candidate_id: number; version: number;
  content_path: string; content_hash: string; scope: ExpertScope; enabled: boolean;
  created_at: string; disabled_at: string };

export async function fetchExpertSeats(signal?: AbortSignal): Promise<ExpertSeatCounts[]> {
  return jsonOrThrow(await fetch("/api/experts", { signal }), "专家席位读取失败");
}
export async function fetchExpertPreferences(seat: string, signal?: AbortSignal): Promise<ExpertPreference[]> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/preferences`, { signal }), "偏好读取失败");
}
export async function saveExpertPreference(seat: string, key: string, value: Record<string, unknown>,
  scope: ExpertScope, evidence = ""): Promise<ExpertPreference> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/preferences/${encodeURIComponent(key)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, scope, evidence }),
  }), "偏好保存失败");
}
export async function revokeExpertPreference(seat: string, key: string): Promise<ExpertPreference> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/preferences/${encodeURIComponent(key)}/revoke`, {
    method: "POST",
  }), "偏好撤销失败");
}
export async function fetchExpertPreferenceVersions(seat: string, key: string,
  signal?: AbortSignal): Promise<ExpertPreferenceVersion[]> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/preferences/${encodeURIComponent(key)}/versions`,
    { signal }), "偏好历史读取失败");
}
export async function fetchExpertCandidates(seat: string, signal?: AbortSignal): Promise<ExpertCandidate[]> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/candidates`, { signal }), "候选读取失败");
}
export async function decideExpertCandidate(seat: string, candidateId: number, decision: "approve" | "reject",
  reason = ""): Promise<ExpertCandidate> {
  return jsonOrThrow(await fetch(
    `/api/experts/${encodeURIComponent(seat)}/candidates/${candidateId}/${decision}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }),
    decision === "approve" ? "候选批准失败" : "候选拒绝失败");
}
export async function fetchExpertSkills(seat: string, signal?: AbortSignal): Promise<ExpertSkill[]> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/skills`, { signal }), "技能读取失败");
}
export async function createExpertSkill(seat: string, candidateId: number, contentPath: string,
  contentHash: string, scope: ExpertScope): Promise<ExpertSkill> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/skills`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id: candidateId, content_path: contentPath, content_hash: contentHash, scope }),
  }), "技能生成失败");
}
export async function setExpertSkillEnabled(seat: string, skillId: number, enabled: boolean): Promise<ExpertSkill> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/skills/${skillId}/${enabled ? "enable" : "disable"}`,
    { method: "POST" }), enabled ? "技能启用失败" : "技能停用失败");
}

/* --------------------------------------------------------------- 专家审计 (P9, 2026-11-06)
 * The audit view of one seat: what a seat starts with (the built-in baseline), what the system has
 * learned, what a person wrote, and what is recorded but not loaded. Always the caller's own rows. */
export type ExpertAuditEntry = { key: string; summary: string; value: Record<string, unknown>;
  status: "active" | "revoked"; version: number; evidence: string; last_used_at: string;
  confidence?: number; loaded?: boolean };
export type ExpertAudit = { seat: string; label: string;
  baseline: { version: number; rules: string[] };
  learned: ExpertAuditEntry[]; manual: ExpertAuditEntry[];
  ignored: { key: string; reason: string }[];
  counts: { preferences: number; candidates: number; skills: number } };

export async function fetchExpertAudit(seat: string, signal?: AbortSignal): Promise<ExpertAudit> {
  return jsonOrThrow(await fetch(`/api/experts/${encodeURIComponent(seat)}/audit`, { signal }), "专家审计读取失败");
}
