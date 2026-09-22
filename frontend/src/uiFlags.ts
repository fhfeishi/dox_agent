/**
 * Feature switches for capabilities that still depend on backend contracts.
 *
 * All switches default to off: `ChatRequest` is `extra="forbid"`, so sending a field the
 * backend does not know yet answers 422. Read at module load; `node --test` sees no env
 * and therefore the same defaults.
 */

function enabled(name: string): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const value = env[name];
  return value === "1" || value === "true" || value === "on";
}

export const uiFlags = {
  /** Task picker, session `task_id` and task badges (U1; needs `GET /api/tasks` + chat `task_id`). */
  tasks: enabled("VITE_UI_TASKS"),
  /** Retrieval filter UI: domain / year range / fund types (needs chat `filters`, stage B). */
  filters: enabled("VITE_UI_FILTERS"),
  /** Directory tree, raw PDF viewer and citation jumps (U2; needs D1 `rel_path` and D2 `/file`). */
  docPanel: enabled("VITE_UI_DOC_PANEL"),
  /** task4 report form and report cards (U3; needs `POST /api/reports`). */
  reports: enabled("VITE_UI_REPORTS"),
  /** Research headline placeholder (U9.3; backend undetermined, rendering only). */
  news: enabled("VITE_UI_NEWS"),
  /** Model selector (U9.4 second step; needs `GET /api/models` and request-level `model`). */
  models: enabled("VITE_UI_MODELS"),
  /** Session-bound corpus in chat requests and the session header (H8; needs chat `corpus_id`, H4). */
  corpus: enabled("VITE_UI_CORPUS"),
} as const;
