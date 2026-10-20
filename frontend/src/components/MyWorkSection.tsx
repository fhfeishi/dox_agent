import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useAuth } from "../auth";
import { REVIEW_STATUS_LABEL, fetchReviewRuns } from "../reviewApi";
import type { ArtifactSummary } from "../api";
import { useApp } from "../store";

const REPORT_STATE: Record<string, string> = { completed: "已完成", failed: "未完成", draft: "草稿", generating: "生成中" };
const ACTIVE = new Set(["queued", "running", "generating"]);

/**
 * 我的工作 on the home page (节点审查 D1, merged into 工作首页 by the user's choice on 2026-10-14):
 * what this account started — conversations, reports and reviews — so a person picks up where they
 * left off. Authorship is recorded from 2026-10-13 on; earlier items have no author and stay in 成果.
 * This is a view of one's own work, not a visibility rule: other accounts can still open them.
 */
export function MyWorkSection({ bare = false }: { bare?: boolean } = {}) {
  const { username } = useAuth();
  const { workspace, switchSession, showInspector } = useApp();
  const navigate = useNavigate();
  const reports = useQuery({
    queryKey: ["mine", "reports", username],
    queryFn: async ({ signal }): Promise<ArtifactSummary[]> => {
      const response = await fetch(`/api/artifacts?type=report&limit=20&created_by=${encodeURIComponent(username)}`, { signal });
      if (!response.ok) throw new Error("我的报告暂不可读");
      return response.json();
    },
    refetchInterval: (query) => query.state.data?.some((r) => ACTIVE.has(r.status)) ? 5000 : false,
  });
  const reviews = useQuery({
    queryKey: ["mine", "reviews", username],
    queryFn: async () => (await fetchReviewRuns()).filter((run) => run.created_by === username).slice(0, 20),
    refetchInterval: (query) => query.state.data?.some((r) => ACTIVE.has(r.status)) ? 5000 : false,
  });
  const sessions = workspace.sessions.filter((s) => s.created_by === username && !s.data.archived).slice(0, 8);
  const working = [...(reviews.data ?? []).filter((r) => ACTIVE.has(r.status)), ...(reports.data ?? []).filter((r) => ACTIVE.has(r.status))].length;
  const box = "rounded-xl border border-[#e3e7ec] bg-white p-4";
  const row = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-[#f6f7f9]";
  const empty = (text: string) => <p className="px-3 py-2 text-[13px] text-[var(--stone)]">{text}</p>;

  return <section aria-label="我的工作">
    {/* bare: the page supplies the heading (leader 首页) and only the progress line remains. */}
    {bare ? (working ? <p className="mb-2 text-xs text-[var(--steel)]">{working} 项正在处理，完成后在这里打开</p> : null)
      : <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-[#24364c]">我的工作</h2>
      <span className="text-xs text-[var(--steel)]">{working ? `${working} 项正在处理，完成后在这里打开` : "本账户发起的对话、报告与审查；更早的内容在“报告中心”中"}</span>
    </div>}
    <div className="grid gap-3 lg:grid-cols-3">
      <section aria-label="我的对话" className={box}>
        <h3 className="mb-2 text-sm font-semibold">我的对话</h3>
        {sessions.length ? sessions.map((s) => <button key={s.id} type="button" onClick={() => void switchSession(s.id)} className={row}>
          <span className="min-w-0 flex-1 truncate">{s.title}</span>
          <span className="shrink-0 text-xs text-[var(--stone)]">{s.updated_at?.slice(5, 10)}</span></button>) : empty("还没有对话。")}
      </section>
      <section aria-label="我的报告" className={box}>
        <h3 className="mb-2 text-sm font-semibold">我的报告</h3>
        {reports.error ? <p role="alert" className="px-3 text-[13px] text-[var(--red)]">{(reports.error as Error).message}</p> : null}
        {reports.data?.length ? reports.data.map((r) => <button key={r.artifact_id} type="button" onClick={() => showInspector({ kind: "artifact", artifactId: r.artifact_id })} className={row}>
          <span className="min-w-0 flex-1 truncate">{r.title || "分析报告"}</span>
          <span className="shrink-0 text-xs text-[var(--stone)]">{r.interrupted ? "已中断，可重试" : REPORT_STATE[r.status] ?? r.status}</span></button>)
          : reports.data ? empty("还没有报告。") : empty("正在读取…")}
      </section>
      <section aria-label="我的审查" className={box}>
        <h3 className="mb-2 text-sm font-semibold">我的审查</h3>
        {reviews.error ? <p role="alert" className="px-3 text-[13px] text-[var(--red)]">{(reviews.error as Error).message}</p> : null}
        {reviews.data?.length ? reviews.data.map((r) => <button key={r.id} type="button" onClick={() => void navigate(`/review/runs/${encodeURIComponent(r.id)}`)} className={row}>
          <span className="min-w-0 flex-1 truncate">{r.document?.metadata?.title || r.document?.filename || "申请书"}</span>
          <span className="shrink-0 text-xs text-[var(--stone)]">{REVIEW_STATUS_LABEL[r.status] ?? r.status}</span></button>)
          : reviews.data ? empty("还没有审查。") : empty("正在读取…")}
      </section>
    </div>
  </section>;
}
