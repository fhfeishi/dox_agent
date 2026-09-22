/**
 * Feature switches for capabilities that still depend on backend contracts.
 *
 * Defaults reflect the verified backend state: `GET /api/tasks` and `ChatRequest.task_id`
 * exist, so task selection is on by default (opt out with `VITE_UI_TASKS=0`). The document
 * explorer (`/file` + `rel_path`) stays opt-in until its browser acceptance passes. Read at
 * module load; `node --test` sees no env and therefore the same defaults.
 */

function envValue(name: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[name];
}

function enabled(name: string): boolean {
  const value = envValue(name);
  return value === "1" || value === "true" || value === "on";
}

/** Default-on switch: only an explicit falsy env value disables it. */
function defaultOn(name: string): boolean {
  const value = envValue(name);
  return !(value === "0" || value === "false" || value === "off");
}

export const uiFlags = {
  /** Task picker, session `task_id`, task badges and the task views (backend contract ready). */
  tasks: defaultOn("VITE_UI_TASKS"),
  /** Directory tree, raw PDF viewer and citation jumps (U2; needs D1 `rel_path` and D2 `/file`). */
  docPanel: enabled("VITE_UI_DOC_PANEL"),
} as const;
