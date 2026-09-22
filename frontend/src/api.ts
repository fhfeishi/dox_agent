export type Source = { title: string; url: string; snippet: string; page?: number; doc_id?: string; version?: string; origin?: string; kind?: string; start_line?: number; end_line?: number; captured_at?: string; truncated?: boolean; citation?: number };
export type Message = { role: "user" | "assistant"; content: string };
export type Usage = { run_id?: string; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; reported_tokens: number | null; calls: number; reported_calls: number; complete: boolean; missing_reasons?: Record<string, number>; calls_by_phase?: Record<string, number> };
export type Step = { run_id: string; id: string; sequence: number; phase: string; status: "running" | "completed" | "failed" | "interrupted"; label: string; detail?: string };
export type Telemetry = { run_id?: string; path?: string; stages_ms: Record<string, number>; searches: number; reads: number; tokens: number | null };
export type Options = { allowed_doc_ids: string[] | null; task_id?: string; corpus_id?: string };
export type TaskInfo = { id: string; name: string; description: string; has_template: boolean };
export type CorpusJob = { status: string; total: number; completed: number; imported: number; changed: number; added?: number; updated?: number; skipped?: number; deleted?: number; forced?: boolean; errors: { source?: string; error: string }[] };
export type CorpusInfo = {
  id: string; name: string; kind: string; domain: string; rel_path: string;
  docs_count: number; preparation: string; is_default: boolean;
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

export async function deleteCorpus(corpusId: string, purgeSource = false): Promise<void> {
  const query = purgeSource ? "?purge_source=true" : "";
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}${query}`, { method: "DELETE" });
  await jsonOrThrow(response, "删除失败");
}

/** K7: source-file list / upload / rename / delete. */
export async function fetchCorpusFiles(corpusId: string): Promise<CorpusFile[]> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files`);
  const payload = await jsonOrThrow(response, "文件列表不可用");
  return (payload as { files: CorpusFile[] }).files;
}

export async function uploadCorpusFile(corpusId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("upload", file);
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files`, { method: "POST", body: form });
  await jsonOrThrow(response, "上传失败");
}

export async function deleteCorpusFile(corpusId: string, relPath: string): Promise<void> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files?rel_path=${encodeURIComponent(relPath)}`, { method: "DELETE" });
  await jsonOrThrow(response, "删除文件失败");
}

export async function renameCorpusFile(corpusId: string, relPath: string, newName: string): Promise<void> {
  const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/files`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rel_path: relPath, new_name: newName }) });
  await jsonOrThrow(response, "重命名文件失败");
}
export type Policy = Options & { route: "research" | "clarify"; stop_reason: string; notice?: string };
export type Event =
  | { event: "usage"; data: Usage }
  | { event: "step"; data: Step }
  | { event: "telemetry"; data: Telemetry }
  | { event: "policy"; data: Policy }
  | { event: "status"; data: { message: string } }
  | { event: "sources"; data: Source[] }
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { ok: boolean } }
  | { event: "error"; data: { message: string } };

/** GET /api/tasks: the fixed first-release task set. Only sent when the backend exposes it. */
export async function fetchTasks(signal?: AbortSignal): Promise<TaskInfo[]> {
  const response = await fetch("/api/tasks", signal ? { signal } : undefined);
  if (!response.ok) throw new Error("任务列表不可用（" + response.status + "）");
  return response.json();
}

export function streamChat(messages: Message[], signal: AbortSignal, receive: (event: Event) => void, options?: Options): Promise<void>;
export function streamChat(messages: Message[], runId: string, signal: AbortSignal, receive: (event: Event) => void, options?: Options): Promise<void>;
export async function streamChat(messages: Message[], runIdOrSignal: string | AbortSignal,
  signalOrReceive: AbortSignal | ((event: Event) => void), receiveOrOptions?: ((event: Event) => void) | Options,
  explicitOptions?: Options) {
  const hasRunId = typeof runIdOrSignal === "string";
  const runId = hasRunId ? runIdOrSignal : undefined;
  const signal = (hasRunId ? signalOrReceive : runIdOrSignal) as AbortSignal;
  const receive = (hasRunId ? receiveOrOptions : signalOrReceive) as (event: Event) => void;
  const options = (hasRunId ? explicitOptions : receiveOrOptions) as Options | undefined;
  const response = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...(runId ? { run_id: runId } : {}), ...options }), signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "请求失败（" + response.status + "）");
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
        if (["status", "sources", "token", "done", "policy", "telemetry", "usage", "step"].includes(event)) {
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
