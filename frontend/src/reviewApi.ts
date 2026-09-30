/** 形式审查（W8）：对接 /api/review/*，与主应用 /api/* 互相独立。
 * 审查上传的指南与申请书是工作材料，不进入知识库、不参与检索。 */

export type ReviewMetadata = {
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
  kind: "pdf" | "doc" | "docx";
  page_count: number;
  metadata: ReviewMetadata;
  metadata_extraction?: ReviewExtraction;
  warnings: string[];
  created_at: string;
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
  quote: string;
  page: number;
  enabled: boolean;
};
export type ReviewRule = {
  id: string;
  name: string;
  fund: string;
  category: string;
  year: number;
  version: number;
  scope_note: string;
  engine: "guideline";
  checks: ReviewCheck[];
  missing_documents: string[];
  extraction_notes: string[];
  guideline_ids: string[];
  confirmed: boolean;
};
export type ReviewEvidence = {
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
  created_at: string;
  finished_at?: string;
  status: "running" | "completed" | "failed";
  stage: number;
  stage_label: string;
  error?: string;
  request: { mode: string; cutoff_date: string };
  document: ReviewDoc;
  rule: ReviewRule;
  findings: ReviewFinding[];
  summary?: Record<string, number>;
  reader_report?: {
    summary: string;
    issues: ReviewReaderPoint[];
    technical: ReviewReaderPoint[];
    pending: ReviewReaderPoint[];
    missing_documents: string[];
  };
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
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  const detail = payload?.detail;
  const message = typeof detail === "string" ? detail
    : typeof detail?.message === "string" ? detail.message
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
  title: "项目名称",
  fund: "基金名称",
  category: "项目类别",
  year: "申报年度",
  birth_date: "申请人出生年月",
  budget: "申请直接费用",
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
export async function uploadReviewGuidelines(files: File[]): Promise<ReviewRule> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return request("/guidelines/plan", { method: "POST", body: form }, "指南检查清单生成失败");
}
export function saveReviewRule(rule: ReviewRule): Promise<ReviewRule> {
  return request("/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  }, "检查清单保存失败");
}
export function fetchReviewRules(): Promise<ReviewRule[]> {
  return request("/rules", undefined, "检查清单列表读取失败");
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
export function createReviewRun(input: {
  document_id: string; rule_id: string; cutoff_date: string; mode: "historical" | "update";
  evidence_ids?: string[];
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
