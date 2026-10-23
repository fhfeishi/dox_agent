import type { IndexState } from "../api";
import { INDEX_COPY } from "../copy";
import { Button } from "./ui";

export function IndexNotice({ state, error, retry }: { state?: IndexState; error?: Error | null; retry?: () => void }) {
  if (error) return <div role="alert" className="flex items-center gap-3 py-3 text-body text-[var(--red)]">
    <span>{error.message}</span>{retry ? <Button size="sm" variant="ghost" onClick={retry}>{INDEX_COPY.retry}</Button> : null}
  </div>;
  return state?.state === "refreshing" ? <p role="status" className="py-3 text-body text-[var(--steel)]">{INDEX_COPY.updating}</p> : null;
}
