import type { Event, Message, Source, Options, Policy } from "./api.ts";

export type Attempt = {
  runId: string;
  steps: import("./api").Step[];
  telemetry?: import("./api").Telemetry;
  usage?: import("./api").Usage;
  options: Options;
  policy: Policy | null;
  answer: string;
  sources: Source[];
  complete: boolean;
  outcome: "running" | "completed" | "interrupted" | "failed";
  startedAt: string;
  firstTokenMs: number | null;
  totalMs: number | null;
  elapsedMs: number | null;
};
export type Turn = Attempt & {
  question: string;
  requestMessages: Message[];
  previousAttempts: Attempt[];
};

export function newAttempt(options: Options = { query_routing: "auto", evidence_level: "middle", allowed_doc_ids: null }): Attempt {
  return { runId: crypto.randomUUID(), steps: [], options: { ...options, allowed_doc_ids: options.allowed_doc_ids ? [...options.allowed_doc_ids] : null }, policy: null, answer: "", sources: [], complete: false, outcome: "running", startedAt: new Date().toISOString(), firstTokenMs: null, totalMs: null, elapsedMs: null };
}

export function newTurn(question: string, history: Turn[], options?: Options): Turn {
  const previous = history.filter(t => t.complete && t.outcome === "completed").slice(-9).flatMap(t => [
    { role: "user" as const, content: t.question },
    { role: "assistant" as const, content: t.answer },
  ]);
  return { ...newAttempt(options), question, requestMessages: [...previous, { role: "user", content: question }], previousAttempts: [] };
}

export function regenerateTurn(turn: Turn, history: Turn[]): Turn {
  const { question, requestMessages: _oldRequest, previousAttempts, ...attempt } = turn;
  const effective = turn.policy ?? turn.options;
  const options: Options = { ...(effective.execution_mode ? { execution_mode: effective.execution_mode } : {}), query_routing: effective.query_routing, evidence_level: effective.evidence_level, allowed_doc_ids: effective.allowed_doc_ids };
  return { ...newTurn(question, history, options), previousAttempts: [...previousAttempts, attempt] };
}

export function branchFromTurn(turns: Turn[], index: number) {
  const original = turns[index];
  const effective = original.policy ?? original.options;
  const options: Options = { execution_mode: effective.execution_mode, query_routing: effective.query_routing,
    evidence_level: effective.evidence_level, allowed_doc_ids: effective.allowed_doc_ids ? [...effective.allowed_doc_ids] : null };
  return { history: turns.slice(0, index).filter(turn => turn.complete && turn.outcome === "completed"), options };
}

export function receiveEvent(turn: Turn, event: Event, elapsedMs: number): Turn {
  if (turn.outcome !== "running") return turn;
  if (event.event === "step") {
    if (event.data.run_id !== turn.runId) return turn;
    const index = turn.steps.findIndex(step => step.id === event.data.id);
    const steps = index < 0 ? [...turn.steps, event.data] : turn.steps.map((step, i) => i === index ? event.data : step);
    return { ...turn, steps };
  }
  if (event.event === "telemetry") return { ...turn, telemetry: event.data };
  if (event.event === "usage") {
    if (event.data.run_id && event.data.run_id !== turn.runId) return turn;
    if (turn.usage && turn.usage.reported_calls > event.data.reported_calls) return turn;
    return { ...turn, usage: event.data };
  }
  if (event.event === "policy") return { ...turn, policy: event.data };
  if (event.event === "sources") return { ...turn, sources: event.data };
  if (event.event === "token" && event.data.text) {
    return { ...turn, answer: turn.answer + event.data.text, firstTokenMs: turn.firstTokenMs ?? elapsedMs };
  }
  if (event.event === "done" && event.data.ok) {
    return { ...turn, complete: true, outcome: "completed", totalMs: elapsedMs, elapsedMs };
  }
  return turn;
}

export function stopTurn(turn: Turn, cancelled: boolean, elapsedMs: number): Turn {
  if (turn.outcome !== "running") return turn;
  return { ...turn, steps: (turn.steps ?? []).map(step => step.status === "running" ? { ...step, status: "interrupted" as const } : step),
    complete: false, outcome: cancelled ? "interrupted" : "failed", totalMs: null, elapsedMs };
}

export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

export function restoreTurns(turns: Turn[]): Turn[] {
  return turns.map((stored, index) => {
    const turn = { ...stored, runId: stored.runId ?? `legacy-${index}-${stored.startedAt ?? "unknown"}`, steps: stored.steps ?? [],
      outcome: (stored.outcome as string) === "cancelled" ? "interrupted" as const : stored.outcome,
      previousAttempts: (stored.previousAttempts ?? []).map((attempt, version) => ({ ...attempt,
        runId: attempt.runId ?? `legacy-${index}-${version}`, steps: attempt.steps ?? [],
        outcome: (attempt.outcome as string) === "cancelled" ? "interrupted" as const : attempt.outcome })) };
    const settled = stopTurn(turn, true, turn.elapsedMs ?? 0);
    return { ...settled, previousAttempts: settled.previousAttempts.map(attempt => attempt.outcome === "running" ? stopTurn(attempt as Turn, true, attempt.elapsedMs ?? 0) : attempt) };
  });
}
