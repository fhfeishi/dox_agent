import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth";
import { workCards } from "../navigation";
import { useApp } from "../store";
import { fetchReviewRuns, type ReviewRun } from "../reviewApi";

/** The latest run of each application and review kind, newest first, with how many runs it had. */
function latestReviews(runs: ReviewRun[]) {
  const groups = new Map<string, { run: ReviewRun; count: number }>();
  for (const run of [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const key = `${run.request.kind}:${run.document?.metadata?.title || run.document?.filename || run.id}`;
    const group = groups.get(key);
    if (group) group.count += 1; else groups.set(key, { run, count: 1 });
  }
  return [...groups.values()];
}
import { resultsSummaryQuery } from "../resultsSummary";
import type { ArtifactSummary } from "../api";
import { Icon } from "./Icons";
import { GenerationProgress } from "./GenerationProgress";
import { MyWorkSection } from "./MyWorkSection";
import { LeaderHome } from "./LeaderHome";


export function WorkspaceHome() {
  const { role } = useAuth();
  return role === "leader" ? <LeaderHome /> : <WorkHome />;
}

/** 首页 for administrators and users: report counts, starting work, 我的工作 and recent reports. */
function WorkHome() {
  const { role } = useAuth();
  const { corpora, corporaError, showInspector, openCorpus } = useApp();
  const navigate = useNavigate();
  const totals = useQuery(resultsSummaryQuery);
  const recent = useQuery({
    queryKey: ["home", "recent"],
    queryFn: async ({ signal }) => {
      const [response, reviews] = await Promise.all([fetch("/api/artifacts?type=report&limit=8", { signal }), fetchReviewRuns()]);
      if (!response.ok) throw new Error("最近报告暂不可读");
      return { reports: await response.json() as ArtifactSummary[], reviews };
    },
    refetchOnWindowFocus: true,
    refetchInterval: totals.data?.active ? 5000 : 30000,
  });
  const records = [
    ...(recent.data?.reports ?? []).map((r) => ({ id: "a:" + r.artifact_id, title: r.title || "分析报告", date: r.created_at,
      status: r.status, type: r.task_id === "intelligence" ? "情报分析" : "存量分析", stage: undefined as number | undefined,
      stage_label: "", kind: "", open: () => showInspector({ kind: "artifact", artifactId: r.artifact_id }) })),
    // Repeated reviews of one application are one line with the latest run (as in 成果周期总结).
    ...latestReviews(recent.data?.reviews ?? []).slice(0, 8).map(({ run: r, count }) => ({ id: "r:" + r.id,
      title: (r.document?.metadata?.title || r.document?.filename || "申请书") + (count > 1 ? `（共审查 ${count} 次）` : ""), date: r.created_at,
      status: r.status, type: r.request.kind === "professional" ? "专业审查" : "形式审查",
      stage: r.stage, stage_label: r.stage_label, kind: r.request.kind,
      open: () => void navigate("/review/runs/" + encodeURIComponent(r.id)) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const total = totals.data;
  const fields = [...corpora].filter((c) => !c.missing).sort((a, b) => (b.indexed_count ?? 0) - (a.indexed_count ?? 0)).slice(0, 5);
  const readDate = (text: string) => new Date(text).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  return <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-cool)]">
    <div className="mx-auto max-w-[1200px] space-y-7 px-5 py-7 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline)] pb-5">
        <div><p className="text-xs text-[var(--steel)]">资料与研究工作台</p>
          <h1 className="mt-2 text-2xl font-semibold">今天，从哪项工作开始？</h1></div>
      </header>
      <section aria-label="工作概况" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--steel)]">
        <span>资料库 <b className="text-[var(--ink)]">{corporaError ? "—" : corpora.length}</b></span>
        <button onClick={() => navigate("/results")} className="hover:text-[var(--primary)]">已完成报告 <b>{total?.completed.total ?? "—"}</b></button>
        <button onClick={() => navigate("/results?status=active")} className="hover:text-[var(--primary)]">生成中 <b>{total?.active ?? "—"}</b></button>
        <button onClick={() => navigate("/results?status=failed")} className="hover:text-[var(--primary)]">未完成 <b>{total?.failed ?? "—"}</b></button>
      </section>
      {totals.error || corporaError ? <p role="alert" className="text-sm text-[var(--red)]">{totals.error?.message || corporaError}</p> : null}

      <section aria-label="开始工作">
        <div className="mb-3"><h2 className="text-base font-semibold text-[var(--heading)]">开始一项工作</h2></div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {workCards(role).map((a) => <Link key={a.to} to={a.to} className="group flex min-h-[140px] min-w-0 flex-col rounded-xl border border-[var(--line-cool)] bg-white p-4 sm:p-5 transition-colors hover:border-[var(--line-cool-strong)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
            <span className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-cool)]" style={{ color: a.accent }}><Icon name={a.icon} size={20} /></span>
              <span aria-hidden="true" className="text-[var(--muted-cool-soft)] group-hover:text-[var(--primary)]">↗</span></span>
            <h3 className="mt-3 text-emphasis font-semibold">{a.title}</h3><p className="mt-2 text-xs leading-6 text-[var(--steel)]">{a.text}</p>
          </Link>)}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section aria-label="最近报告" className="overflow-hidden rounded-xl border border-[var(--line-cool)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--line-cool-soft)] px-5 py-4"><h2 className="text-base font-semibold">最近报告</h2>
            <button onClick={() => navigate("/results")} className="text-xs text-[var(--link)] hover:underline">报告中心 →</button></div>
          {recent.error ? <p role="alert" className="p-5 text-sm text-[var(--red)]">{recent.error.message}</p>
            : !recent.data ? <p className="p-6 text-sm text-[var(--steel)]">正在读取最近工作…</p>
            : !records.length ? <p className="p-6 text-sm text-[var(--steel)]">还没有报告。选择上方任务即可开始。</p>
            : <ul className="divide-y divide-[var(--line-cool-soft)]">{records.map((r) => <li key={r.id} className="px-5 py-4">
              <button onClick={r.open} className="flex w-full items-start gap-3 text-left hover:text-[var(--primary)]">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-cool)] text-[var(--muted-cool)]"><Icon name="reports" size={16} /></span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium leading-6">{r.title}</span>
                  <span className="mt-1 block text-xs text-[var(--steel)]">{r.type} · {readDate(r.date)}</span></span>
                <span className={`mt-1 shrink-0 text-xs ${r.status === "completed" ? "text-[var(--ok-fg)]" : r.status === "failed" ? "text-[var(--red)]" : "text-[var(--steel)]"}`}>
                  {r.status === "completed" ? "已完成" : r.status === "failed" ? "未完成" : r.status === "draft" ? "草稿" : r.status === "queued" ? "排队中" : "生成中"}
                </span>
              </button>
              {["queued", "running", "generating"].includes(r.status) ? <GenerationProgress compact {...r} /> : null}
            </li>)}</ul>}
        </section>
        <section aria-label="领域资料" className="rounded-xl border border-[var(--line-cool)] bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">领域资料</h2><Link to="/library" className="text-xs text-[var(--link)] hover:underline">全部资料库 →</Link></div>
          {!fields.length ? <p className="py-4 text-sm text-[var(--steel)]">尚无可浏览的资料库。</p> : <ul className="space-y-1">{fields.map((c) => <li key={c.id}>
            <button onClick={() => openCorpus(c.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm hover:bg-[var(--surface-cool)]">
              <span className="min-w-0 truncate">{c.name.replace(/^自然科学基金-/, "")}</span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--steel)]">{c.indexed_count?.toLocaleString() ?? "—"} 份</span>
            </button></li>)}</ul>}
          <div className="mt-4 border-t border-[var(--line-cool-soft)] pt-4 text-xs leading-6 text-[var(--steel)]">按可检索文件份数展示，未作跨库去重。
            {role !== "user" ? <Link to="/overview/build" className="mt-2 block text-[var(--link)] hover:underline">进入概览，了解资料建设与领域分布 →</Link> : null}</div>
        </section>
      </div>
      <MyWorkSection />
    </div>
  </main>;
}
