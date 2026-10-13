import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";

/**
 * 发布 (节点审查 Q2): the leader view and the period summaries read only published reports and
 * reviews. The author or an administrator publishes a finished one, or withdraws it; others see
 * whether it is published.
 */
export function PublishButton({ createdBy, publishedAt, completed, publish }: {
  createdBy?: string; publishedAt?: string | null; completed: boolean; publish: (published: boolean) => Promise<unknown>;
}) {
  const { username, role } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = role === "admin" || (!!createdBy && createdBy === username);
  const state = publishedAt ? `已发布 · ${publishedAt.slice(0, 10)}` : "未发布，领导视图不显示";
  if (!allowed || (!publishedAt && !completed)) return <span className="text-xs text-[var(--stone)]">{state}</span>;
  async function run() {
    setBusy(true); setError("");
    // Lists that show the published state read it again.
    try { await publish(!publishedAt); await Promise.all([client.invalidateQueries({ queryKey: ["recent"] }), client.invalidateQueries({ queryKey: ["mine"] })]); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <span className="inline-flex flex-wrap items-center gap-2 text-xs">
    <span className={publishedAt ? "text-[#0e7a28]" : "text-[var(--stone)]"}>{state}</span>
    <button type="button" disabled={busy} onClick={() => void run()}
      className="rounded-md border border-[var(--hairline-strong)] px-2 py-0.5 text-[var(--slate)] hover:bg-[var(--surface)] disabled:opacity-50">
      {busy ? "正在处理…" : publishedAt ? "撤回发布" : "发布给领导"}</button>
    {error ? <span role="alert" className="text-[var(--red)]">{error}</span> : null}
  </span>;
}
