import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth";
import { REVIEW_STATUS_LABEL, fetchReviewRuns } from "../reviewApi";
import type { ArtifactSummary } from "../api";
import { useApp } from "../store";

const REPORT_STATE: Record<string, string> = { completed: "已完成", failed: "未完成", draft: "草稿", generating: "生成中" };
const ACTIVE = new Set(["queued", "running", "generating"]);

/**
 * 我的工作 (节点审查 D1/Q5): replaces 首页. What this account started — conversations, reports and
 * reviews — with the unfinished ones first, so a person picks up where they left off. Authorship is
 * recorded from now on; earlier items have no author and stay in 报告中心 and the review records.
 * This is a view of one's own work, not a visibility rule: other accounts can still open them.
 */
export function MyWork() {
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
  const box = "rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4";
  const row = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-[var(--canvas)]";
  const empty = (text: string) => <p className="px-3 py-2 text-[13px] text-[var(--stone)]">{text}</p>;

  return <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
    <div className="mx-auto max-w-[1080px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">我的工作</h1>
          <p className="mt-1 text-sm text-[var(--steel)]">{working ? `${working} 项正在处理，可离开本页，完成后在这里打开。` : "继续上次的对话、报告与审查，或开始一项新工作。"}</p></div>
        <nav aria-label="开始新工作" className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void switchSession()} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-[13px] text-white">新建对话</button>
          <Link to="/review/formal" className="rounded-lg border border-[var(--hairline-strong)] px-3 py-2 text-[13px]">审查申请书</Link>
          <Link to="/tasks" className="rounded-lg border border-[var(--hairline-strong)] px-3 py-2 text-[13px]">生成分析报告</Link>
          <Link to="/intelligence" className="rounded-lg border border-[var(--hairline-strong)] px-3 py-2 text-[13px]">情报分析</Link>
        </nav>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="我的对话" className={box}>
          <h2 className="mb-2 text-sm font-semibold">我的对话</h2>
          {sessions.length ? sessions.map((s) => <button key={s.id} type="button" onClick={() => void switchSession(s.id)} className={row}>
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            <span className="shrink-0 text-xs text-[var(--stone)]">{s.updated_at?.slice(5, 10)}</span></button>) : empty("还没有对话。")}
        </section>
        <section aria-label="我的报告" className={box}>
          <h2 className="mb-2 text-sm font-semibold">我的报告</h2>
          {reports.error ? <p role="alert" className="px-3 text-[13px] text-[var(--red)]">{(reports.error as Error).message}</p> : null}
          {reports.data?.length ? reports.data.map((r) => <button key={r.artifact_id} type="button" onClick={() => showInspector({ kind: "artifact", artifactId: r.artifact_id })} className={row}>
            <span className="min-w-0 flex-1 truncate">{r.title || "分析报告"}</span>
            <span className="shrink-0 text-xs text-[var(--stone)]">{REPORT_STATE[r.status] ?? r.status}{r.published_at ? " · 已发布" : ""}</span></button>)
            : reports.data ? empty("还没有报告。") : empty("正在读取…")}
        </section>
        <section aria-label="我的审查" className={box}>
          <h2 className="mb-2 text-sm font-semibold">我的审查</h2>
          {reviews.error ? <p role="alert" className="px-3 text-[13px] text-[var(--red)]">{(reviews.error as Error).message}</p> : null}
          {reviews.data?.length ? reviews.data.map((r) => <button key={r.id} type="button" onClick={() => void navigate(`/review/runs/${encodeURIComponent(r.id)}`)} className={row}>
            <span className="min-w-0 flex-1 truncate">{r.document?.metadata?.title || r.document?.filename || "申请书"}</span>
            <span className="shrink-0 text-xs text-[var(--stone)]">{REVIEW_STATUS_LABEL[r.status] ?? r.status}{r.published_at ? " · 已发布" : ""}</span></button>)
            : reviews.data ? empty("还没有审查。") : empty("正在读取…")}
        </section>
      </div>
      <p className="text-xs text-[var(--stone)]">这里列出本账户发起的工作；创建人记录启用之前的内容不在此列，可在右上角“报告中心”和各审查页的记录中查看。</p>
    </div>
  </main>;
}
