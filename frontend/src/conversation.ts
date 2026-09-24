import type { Event, Message, Source, Options, Policy, RunInfo } from "./api.ts";

export type Attempt = {
  runId: string;
  steps: import("./api").Step[];
  telemetry?: import("./api").Telemetry;
  usage?: import("./api").Usage;
  runInfo?: RunInfo;
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
  report?: { report_id: string; markdown: string };
};
export type Turn = Attempt & {
  question: string;
  requestMessages: Message[];
  previousAttempts: Attempt[];
};

function copyOptions(options: Options): Options {
  const normalized = { ...options, allowed_doc_ids: options.allowed_doc_ids ? [...options.allowed_doc_ids] : null };
  if (options.corpus_ids) normalized.corpus_ids = [...options.corpus_ids];
  else if (options.corpus_id) normalized.corpus_ids = [options.corpus_id];
  if (options.web_snapshot_ids) normalized.web_snapshot_ids = [...options.web_snapshot_ids];
  return normalized;
}

/** Preserve the scope that produced a turn when revisiting it after session settings change. */
export function turnScope(turn: Turn): Options {
  const scope = copyOptions(turn.options);
  if (turn.policy) scope.allowed_doc_ids = turn.policy.allowed_doc_ids ? [...turn.policy.allowed_doc_ids] : null;
  if (turn.runInfo?.effective_corpus_ids?.length) scope.corpus_ids = [...turn.runInfo.effective_corpus_ids];
  if (turn.runInfo?.allowed_doc_ids !== undefined) scope.allowed_doc_ids = turn.runInfo.allowed_doc_ids ? [...turn.runInfo.allowed_doc_ids] : null;
  if (turn.runInfo?.web_snapshot_ids) scope.web_snapshot_ids = [...turn.runInfo.web_snapshot_ids];
  if (turn.runInfo?.task_id) scope.task_id = turn.runInfo.task_id;
  if (turn.runInfo?.task_version) scope.task_version = turn.runInfo.task_version;
  return scope;
}

/** Build the explicit retrieval set used by every new chat request. */
export function corpusRequestOptions(_baseId: string, corpusIds: string[]): Pick<Options, "corpus_id" | "corpus_ids"> | null {
  const ids = [...new Set(corpusIds)];
  if (ids.length === 0 || ids.length > 6) return null;
  return { corpus_ids: ids };
}

/** Restore legacy and malformed persisted bindings conservatively before a session can send. */
export function restoreCorpusSelection(baseValue: unknown, idsValue: unknown, _confirmedValue: unknown) {
  const baseId = typeof baseValue === "string" ? baseValue : "";
  const rawIds = idsValue === undefined ? (baseId ? [baseId] : []) : idsValue;
  const isStringList = Array.isArray(rawIds) && rawIds.every((id) => typeof id === "string" && id.length > 0);
  // Keep over-limit and unknown ids visible so the user can repair the original range.
  // A malformed non-string payload remains unbound and cannot silently select a different set.
  const ids = isStringList ? [...rawIds as string[]] : baseId ? [baseId] : [];
  return { corpusId: baseId || ids[0] || "", corpusIds: ids,
    confirmed: true };
}

export function newAttempt(options: Options = { allowed_doc_ids: null }): Attempt {
  return { runId: crypto.randomUUID(), steps: [], options: copyOptions(options), policy: null, answer: "", sources: [], complete: false, outcome: "running", startedAt: new Date().toISOString(), firstTokenMs: null, totalMs: null, elapsedMs: null };
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
  const options = turnScope(turn);
  return { ...newTurn(question, history, options), previousAttempts: [...previousAttempts, attempt] };
}

export function branchFromTurn(turns: Turn[], index: number) {
  const original = turns[index];
  const options = turnScope(original);
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
  if (event.event === "run") {
    if (event.data.run_id && event.data.run_id !== turn.runId) return turn;
    return { ...turn, runInfo: event.data };
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
    const turn = { ...stored, options: copyOptions(stored.options ?? { allowed_doc_ids: null }),
      policy: stored.policy ? copyOptions(stored.policy) as Policy : null,
      runId: stored.runId ?? `legacy-${index}-${stored.startedAt ?? "unknown"}`, steps: stored.steps ?? [],
      outcome: (stored.outcome as string) === "cancelled" ? "interrupted" as const : stored.outcome,
      previousAttempts: (stored.previousAttempts ?? []).map((attempt, version) => ({ ...attempt,
        options: copyOptions(attempt.options ?? { allowed_doc_ids: null }),
        policy: attempt.policy ? copyOptions(attempt.policy) as Policy : null,
        runId: attempt.runId ?? `legacy-${index}-${version}`, steps: attempt.steps ?? [],
        outcome: (attempt.outcome as string) === "cancelled" ? "interrupted" as const : attempt.outcome })) };
    const settled = stopTurn(turn, true, turn.elapsedMs ?? 0);
    return { ...settled, previousAttempts: settled.previousAttempts.map(attempt => attempt.outcome === "running" ? stopTurn(attempt as Turn, true, attempt.elapsedMs ?? 0) : attempt) };
  });
}
