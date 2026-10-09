/** 形式审查（W8）：对接 /api/review/*，与主应用 /api/* 互相独立。
 * 审查上传的指南与申请书是工作材料，不进入知识库、不参与检索。 */

export type ReviewMetadata = {
  application_budget?: number | null; organization_count?: number | null; patent_count?: number | null; university_present?: boolean | null; education?: string; submitted_at?: string;
  organizations?: string[]; total_budget?: number | null; plan_start?: string; plan_end?: string;
  title: string;
  fund: string;
  category: string;
  year: number | null;
  birth_date: string;
  budget: number | null;
  domain: string;
};
export type ReviewExtractionField = {
  status: "extracted" | "missing" | "conflict";
  candidates: { value: string | number; page: number; quote: string; reason: string }[];
};
export type ReviewExtraction = {
  status: "running" | "completed" | "partial" | "failed" | "unavailable";
  method?: string;
  model?: string;
  stage_label?: string;
  error?: string;
  fields?: Record<string, ReviewExtractionField>;
  notes?: string[];
  coverage_pages?: number[];
};
export type ReviewDoc = {
  id: string;
  filename: string;
  kind: "pdf" | "doc" | "docx" | "md" | "txt";
  page_count: number;
  metadata: ReviewMetadata;
  metadata_extraction?: ReviewExtraction & { suggested_metadata?: Partial<ReviewMetadata> };
  metadata_revision?: number;
  warnings: string[];
  created_at: string;
  confirmed_at?: string;
};
export type ReviewExecution = {
  field: string; operator: string; value: string; unit: string; section?: string; end?: string; counting?: string;
};
export type ReviewCheck = {
  id: string;
  title: string;
  category: string;
  requirement: string;
  applicability: string;
  strength: "hard" | "advisory" | "uncertain";
  method: "model" | "calculation" | "manual";
  needed_materials: string[];
  source: string;
  source_id?: string;
  guideline_id?: string;
  quote: string;
  page: number | null;
  enabled: boolean;
  evidence_need?: "internal" | "comparison" | "policy";
  original?: { requirement?: string; execution?: ReviewExecution | null; source?: string; quote?: string; page?: number | null };
  revised?: boolean;
  execution?: ReviewExecution | null;
};
export type ReviewKind = "formal" | "professional";
export type ReviewRule = {
  kind?: ReviewKind | null;
  source_kind?: "builtin" | "manual" | "upload";
  archived?: boolean;
  id: string;
  name: string;
  fund: string;
  category: string;
  year: number | null;
  version: number;
  scope_note: string;
  budget_source?: string;
  engine: "guideline";
  checks: ReviewCheck[];
  missing_documents: string[];
  extraction_notes: string[];
  generation?: Record<string, unknown>;
  guideline_ids: string[];
  confirmed: boolean;
  scenario?: string;
};
export type ReviewBlock = { id: string; page: number; level: number; image: boolean; text: string };
export type ReviewRange = { block_ids: string[]; pages: number[]; heading: string; count: number; text: string; complete: boolean; unread_images: number };
export type ReviewMapping = {
  check_id: string; title: string; section: string; status: "found" | "ambiguous" | "not_found" | "confirmed";
  block_ids: string[]; missing: boolean; candidates?: ReviewRange[]; selected: ReviewRange | null;
};
export type ReviewMappingState = {
  rule_id: string; rule_version: number; revision: number; saved_at?: string | null; algorithm: string;
  mappings: ReviewMapping[]; blocks: ReviewBlock[];
};
export type ReviewEvidence = {
  kind?: string; doc_id?: string; corpus_id?: string; version?: string;
  id: string;
  title: string;
  published: string;
  url: string;
  summary: string;
  keywords: string[];
  origin: string;
  verified: boolean;
};
export type ReviewFinding = {
  id: string;
  group: string;
  title: string;
  status: string;
  detail: string;
  source: string;
  page: number | null;
  suggestion: string;
  quote: string;
  origin?: "program" | "model" | "coverage";
  clause_ids?: string[];
  actual?: number | string | null;
  requirement?: string;
  coverage?: "complete" | "partial" | "none";
  mapping?: string;
  location?: { pages?: number[]; block_ids?: string[] };
  counted_text?: string;
  stage_dates?: string[];
  verification_status?: string;
  calculations?: { expression: string; computed_yuan: number; stated_yuan: number; ok: boolean }[];
};
export type ReviewCard = {
  id: string; check_id?: string; topic?: string; title: string; assessment: string; suggestion: string; status: string;
  page: number | null; quote: string; evidence_ids: string[]; basis: string; other_pages?: number[];
};
export type ReviewReaderPoint = {
  id: string;
  title: string;
  status: string;
  detail: string;
  suggestion: string;
  page: number | null;
  quote: string;
};
export type ReviewRun = {
  id: string;
  source_locations?: Record<string, { file_id: string; source_page: number; kind: string; filename: string }>;
  information_sheet?: ReviewDoc | null;
  input_versions?: { file_id: string; sha256: string; metadata_revision: number }[];
  budget?: { rows?: { name: string; amount: number }[]; total?: number | null; sum?: number; page?: number };
  created_at: string;
  finished_at?: string;
  status: "running" | "completed" | "failed";
  stage: number;
  stage_label: string;
  error?: string;
  request: { kind?: ReviewKind; scenario?: string; mode: string; cutoff_date: string | null; rule_id?: string; rule_version?: number;
    corpus_ids?: string[]; evidence_ids?: string[]; reference_count?: number };
  mappings?: { revision: number; rows: ReviewMapping[] };
  document: ReviewDoc;
  rule: ReviewRule;
  findings: ReviewFinding[];
  technical?: {
    summary?: string;
    evidence: (Omit<ReviewEvidence, "published"> & { published: string | null; project_period?: (number | null)[] })[];
    local_matches?: number; excluded_count?: number;
    cards?: ReviewCard[];
    coverage?: { check_id: string; title: string; evidence_need: string; state: "evaluated" | "missing"; cards: number }[];
  };
  summary?: Record<string, number>;
  reader_report?: {
    summary: string;
    issues: ReviewReaderPoint[];
    technical: ReviewReaderPoint[];
    pending: ReviewReaderPoint[];
    missing_documents: string[];
  };
  calculation_findings?: ReviewFinding[];
  audit?: {
    model: string;
    calls: unknown[];
    coverage_pages: number[];
    checklist_count?: number;
    limitations: string[];
    verification?: { total: number; completed: number; pending: number };
  };
};
export type ReviewHealth = {
  ok: boolean;
  app_id: string;
  model_configured: boolean;
  model_name: string;
  provider: string;
  model_connection?: "untested" | "connected" | "failed";
};

export class ReviewApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  const detail = payload?.detail;
  // FastAPI validation errors arrive as a list; show what was wrong instead of a bare status code.
  const fieldNames = (loc: unknown[]) => loc.filter((part) => typeof part === "string" && part !== "body")
    .map((part) => REVIEW_FIELD_LABEL[part as string] ?? part).join(" / ");
  const message = typeof detail === "string" ? detail
    : typeof detail?.message === "string" ? detail.message
      : Array.isArray(detail) && detail.length ? `${fallback}：` + detail.map((item: { loc?: unknown[]; msg?: string }) =>
        `${fieldNames(item.loc ?? [])}${item.msg ? " " + item.msg.replace(/^Value error, /, "") : ""}`).join("；")
        : `${fallback}（${response.status}）`;
  throw new ReviewApiError(message, response.status);
}

async function request<T>(path: string, init?: RequestInit, fallback = "请求未完成"): Promise<T> {
  const response = await fetch(`/api/review${path}`, init);
  if (!response.ok) await readError(response, fallback);
  return (await response.json()) as T;
}

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  pass: "通过",
  issue: "发现问题",
  warning: "建议调整",
  pending: "待核实",
  na: "不适用",
  advisory: "评议建议",
  completed: "已完成",
  running: "进行中",
  failed: "未完成",
};
export const REVIEW_STRENGTH_LABEL: Record<ReviewCheck["strength"], string> = {
  hard: "明确要求",
  advisory: "原则 / 建议",
  uncertain: "性质待确认",
};
export const REVIEW_METHOD_LABEL: Record<ReviewCheck["method"], string> = {
  model: "模型内容核查",
  calculation: "精确计量",
  manual: "外部材料 / 人工",
};
export const REVIEW_FIELD_LABEL: Record<string, string> = {
  organization_count: "申报单位数量（家）", patent_count: "专利数量（项）",
  education: "负责人学历", submitted_at: "正式申报时间", university_present: "是否含高校",
  title: "项目名称",
  fund: "基金名称",
  category: "项目类别",
  year: "申报年度",
  birth_date: "申请人出生年月",
  budget: "申请直接费用（万元）",
  total_budget: "项目总预算（万元）",
  organizations: "申报单位名单",
  plan_start: "计划开始日期",
  plan_end: "计划结束日期",
  application_budget: "申请总经费（万元）",
  domain: "研究领域",
};

export function fetchReviewHealth(): Promise<ReviewHealth> {
  return request("/health", undefined, "审查服务不可用");
}
export function testReviewModel(): Promise<{ ok: boolean; message?: string; model_connection?: string }> {
  return request("/model/test", { method: "POST" }, "模型连接测试失败");
}
export function fetchReviewDocuments(): Promise<ReviewDoc[]> {
  return request("/documents", undefined, "申请书列表读取失败");
}
export async function uploadReviewDocument(file: File): Promise<ReviewDoc> {
  const form = new FormData();
  form.append("file", file);
  return request("/documents", { method: "POST", body: form }, "申请书上传失败");
}
export async function uploadReviewGuidelines(files: File[], kind: ReviewKind): Promise<ReviewRule> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  form.append("kind", kind);
  return request("/guidelines/plan", { method: "POST", body: form }, "指南检查清单生成失败");
}
export function saveReviewRule(rule: ReviewRule): Promise<ReviewRule> {
  return request("/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  }, "模板保存失败");
}
export function fetchReviewRules(): Promise<ReviewRule[]> {
  return request("/rules", undefined, "模板列表读取失败");
}
export function fetchReviewMappings(documentId: string, ruleId: string): Promise<ReviewMappingState> {
  return request(`/documents/${encodeURIComponent(documentId)}/mappings?rule_id=${encodeURIComponent(ruleId)}`, undefined, "章节对应读取失败");
}
export function saveReviewMappings(documentId: string, body: {
  rule_id: string; rule_version: number; revision: number; mappings: { check_id: string; block_ids: string[]; missing: boolean }[];
}): Promise<ReviewMappingState> {
  return request(`/documents/${encodeURIComponent(documentId)}/mappings`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, "章节对应保存失败");
}
export function patchReviewDocument(id: string, metadata: Partial<ReviewMetadata>): Promise<ReviewDoc> {
  return request(`/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  }, "基本信息保存失败");
}
export function reextractReviewDocument(id: string): Promise<ReviewDoc> {
  return request(`/documents/${encodeURIComponent(id)}/extract`, { method: "POST" }, "重新提取失败");
}
export function fetchReviewEvidence(): Promise<ReviewEvidence[]> {
  return request("/evidence", undefined, "证据列表读取失败");
}
export function addReviewEvidence(input: {
  title: string; published: string; url: string; summary: string; keywords: string[];
}): Promise<ReviewEvidence> {
  return request("/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }, "证据保存失败");
}
export function searchReviewEvidence(query: string, cutoff: string): Promise<ReviewEvidence[]> {
  return request("/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, cutoff }),
  }, "公开文献检索失败");
}
export function createReviewRun(input: { kind: ReviewKind; information_sheet_id?: string; corpus_ids?: string[];
  document_id: string; rule_id: string; rule_version: number; cutoff_date?: string; mode: "historical" | "update";
  evidence_ids?: string[]; reference_count?: number;
}): Promise<ReviewRun> {
  return request("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }, "审核任务创建失败");
}
export function fetchReviewRuns(): Promise<ReviewRun[]> {
  return request("/runs", undefined, "审核记录读取失败");
}
export function fetchReviewRun(id: string): Promise<ReviewRun> {
  return request(`/runs/${encodeURIComponent(id)}`, undefined, "报告读取失败");
}
export const reviewDocumentFileUrl = (id: string) => `/api/review/documents/${encodeURIComponent(id)}/file`;
export const reviewGuidelineFileUrl = (id: string) => `/api/review/guidelines/${encodeURIComponent(id)}/file`;
export const reviewExportUrl = (id: string, kind: "docx" | "json") =>
  `/api/review/runs/${encodeURIComponent(id)}/export/${kind}`;

export const REVIEW_SOURCE_LABEL: Record<string, string> = { builtin: "内置示例", manual: "网页建立", upload: "上传提取" };
export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = { formal: "形式审查", professional: "专业审查" };
/** Executable measures a template item can bind; the server re-validates every value. */
export const REVIEW_MEASURES: { field: string; label: string; unit: string; kind: "section" | "number" | "interval" | "text" }[] = [
  { field: "section_characters", label: "章节字符数", unit: "字符", kind: "section" },
  { field: "organizations", label: "申报单位数（按名单去重）", unit: "家", kind: "number" },
  { field: "total_budget", label: "项目总预算", unit: "万元", kind: "number" },
  { field: "application_budget", label: "申请资助总额", unit: "万元", kind: "number" },
  { field: "budget", label: "申请直接费用", unit: "万元", kind: "number" },
  { field: "plan_interval", label: "项目计划日期区间", unit: "日期", kind: "interval" },
  { field: "docx_font", label: "正文字体（仅 DOCX）", unit: "字体", kind: "text" },
  { field: "docx_font_size", label: "正文字号（仅 DOCX，磅）", unit: "磅", kind: "number" },
];
export const REVIEW_EVIDENCE_NEED_LABEL: Record<string, string> = {
  internal: "申请书内部论证", comparison: "需对照资料", policy: "需政策材料",
};
