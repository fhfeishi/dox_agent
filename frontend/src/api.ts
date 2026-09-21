export type Source = { title: string; url: string; snippet: string; page?: number; doc_id?: string; version?: string; origin?: string; kind?: string; start_line?: number; end_line?: number; captured_at?: string; truncated?: boolean };
export type Message = { role: "user" | "assistant"; content: string };
export type Usage = { run_id?: string; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; reported_tokens: number | null; calls: number; reported_calls: number; complete: boolean; missing_reasons?: Record<string, number>; calls_by_phase?: Record<string, number> };
export type Step = { run_id: string; id: string; sequence: number; phase: string; status: "running" | "completed" | "failed" | "interrupted"; label: string; detail?: string };
export type Telemetry = { run_id?: string; path?: string; stages_ms: Record<string, number>; searches: number; reads: number; tokens: number | null };
export type Options = { execution_mode?: "auto" | "quick" | "research"; query_routing: "auto" | "knowledge_only"; evidence_level: "low" | "middle" | "high"; allowed_doc_ids: string[] | null };
export type Policy = Options & { route: "direct" | "research" | "clarify"; stop_reason: string; notice?: string };
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
