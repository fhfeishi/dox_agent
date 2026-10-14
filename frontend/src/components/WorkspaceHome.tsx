import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth";
import { useApp } from "../store";
import { fetchReviewRuns } from "../reviewApi";
import { resultsSummaryQuery } from "../resultsSummary";
import type { ArtifactSummary } from "../api";
import { Icon, type IconName } from "./Icons";
import { GenerationProgress } from "./GenerationProgress";
import { MyWorkSection } from "./MyWorkSection";

const ACTIONS: { to: string; title: string; text: string; icon: IconName; accent: string }[] = [
  { to: "/library", title: "查阅资料", text: "从场景、问题、技术和成果了解一个领域。", icon: "library", accent: "#4f6554" },
  { to: "/tasks", title: "存量分析", text: "对比项目、研判趋势，形成有出处的报告。", icon: "tasks", accent: "#65569b" },
  { to: "/review/formal", title: "审查申请书", text: "上传材料，按模板核对规范或开展技术评议。", icon: "review", accent: "#356d8c" },
  { to: "/intelligence", title: "情报分析", text: "结合外部信息与库内资料，分析背景与可行性。", icon: "forecast", accent: "#997346" },
];

export function WorkspaceHome() {
  const { role } = useAuth();
  const { corpora, corporaError, showInspector, openCorpus, switchSession } = useApp();
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
    ...(recent.data?.reviews ?? []).slice(0, 8).map((r) => ({ id: "r:" + r.id,
      title: r.document?.metadata?.title || r.document?.filename || "申请书", date: r.created_at,
      status: r.status, type: r.request.kind === "professional" ? "专业审查" : "形式审查",
      stage: r.stage, stage_label: r.stage_label, kind: r.request.kind,
      open: () => void navigate("/review/runs/" + encodeURIComponent(r.id)) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const total = totals.data;
  const fields = [...corpora].filter((c) => !c.missing).sort((a, b) => (b.indexed_count ?? 0) - (a.indexed_count ?? 0)).slice(0, 5);
  const readDate = (text: string) => new Date(text).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  return <main className="min-h-0 flex-1 overflow-y-auto bg-[#f6f7f9]">
    <div className="mx-auto max-w-[1440px] space-y-7 px-5 py-7 lg:px-10 lg:py-9">
      <header className="relative overflow-hidden rounded-2xl border border-[#dce1e9] bg-[#182c46] px-6 py-7 text-white sm:px-9 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 size-80 rounded-full border-[45px] border-white/[0.025]" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs tracking-[0.16em] text-[#b7c5d6]">工作首页 · 资料 / 分析 / 审查</p>
            <h1 className="mt-4 text-2xl font-semibold tracking-wide sm:text-3xl">资料与研究工作台</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#c5d0dd]">查看领域资料，开展分析与审查，接续最新报告。<br className="hidden sm:block" />生成的报告自动收录到成果，相关人员可直接查看。</p>
          </div>
          <div className="min-w-[180px] border-l border-white/20 pl-6">
            <p className="text-xs text-[#b7c5d6]">一周内创建并完成的报告</p>
            <p className="mt-2 text-4xl font-medium tabular-nums">{total?.recent_completed ?? "—"}<span className="ml-2 text-sm text-[#b7c5d6]">份</span></p>
            <button onClick={() => showInspector({ kind: "results" })} className="mt-3 text-sm text-[#e3ebf6] hover:underline">查看成果 →</button>
          </div>
        </div>
      </header>

      <section aria-label="工作概况" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "资料库", value: corporaError ? "—" : corpora.length, note: "按已接入的资料库计数" },
          { label: "已完成报告", value: total?.completed.total ?? "—", note: "存量分析、情报分析与资料审查" },
          { label: "生成中", value: total?.active ?? "—", note: "含排队任务，可在成果中接续" },
          { label: "未完成", value: total?.failed ?? "—", note: "查看失败原因后可重新发起" },
        ].map((m) => <div key={m.label} className="rounded-xl border border-[#e3e7ec] bg-white px-5 py-4">
          <p className="text-xs text-[var(--steel)]">{m.label}</p><p className="my-2 text-3xl font-semibold tabular-nums text-[#24364c]">{m.value}</p>
          <p className="text-[11px] leading-5 text-[var(--steel)]">{m.note}</p>
        </div>)}
      </section>
      {totals.error || corporaError ? <p role="alert" className="text-sm text-[var(--red)]">{totals.error?.message || corporaError}</p> : null}

      <section aria-label="开始工作">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-base font-semibold text-[#24364c]">开始一项工作</h2>
          <button className="text-xs text-[var(--link)] hover:underline" onClick={() => void switchSession()}>也可以直接提问 →</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ACTIONS.map((a) => <Link key={a.to} to={a.to} className="group flex min-h-[160px] flex-col rounded-xl border border-[#e3e7ec] bg-white p-5 transition-colors hover:border-[#acb8c9] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
            <span className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-lg bg-[#f3f5f8]" style={{ color: a.accent }}><Icon name={a.icon} size={20} /></span>
              <span aria-hidden="true" className="text-[#b4bdc9] group-hover:text-[var(--primary)]">↗</span></span>
            <h3 className="mt-3 text-[15px] font-semibold">{a.title}</h3><p className="mt-2 text-xs leading-6 text-[var(--steel)]">{a.text}</p>
          </Link>)}
        </div>
      </section>

      <MyWorkSection />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section aria-label="最近报告" className="overflow-hidden rounded-xl border border-[#e3e7ec] bg-white">
          <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4"><h2 className="text-base font-semibold">最近报告</h2>
            <button onClick={() => showInspector({ kind: "results" })} className="text-xs text-[var(--link)] hover:underline">全部成果 →</button></div>
          {recent.error ? <p role="alert" className="p-5 text-sm text-[var(--red)]">{recent.error.message}</p>
            : !recent.data ? <p className="p-6 text-sm text-[var(--steel)]">正在读取最近工作…</p>
            : !records.length ? <p className="p-6 text-sm text-[var(--steel)]">还没有报告。选择上方任务即可开始。</p>
            : <ul className="divide-y divide-[#edf0f4]">{records.map((r) => <li key={r.id} className="px-5 py-4">
              <button onClick={r.open} className="flex w-full items-start gap-3 text-left hover:text-[var(--primary)]">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#f3f5f8] text-[#7a8ba0]"><Icon name="reports" size={16} /></span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium leading-6">{r.title}</span>
                  <span className="mt-1 block text-xs text-[var(--steel)]">{r.type} · {readDate(r.date)}</span></span>
                <span className={`mt-1 shrink-0 text-xs ${r.status === "completed" ? "text-[#397552]" : r.status === "failed" ? "text-[var(--red)]" : "text-[var(--steel)]"}`}>
                  {r.status === "completed" ? "已完成" : r.status === "failed" ? "未完成" : r.status === "draft" ? "草稿" : r.status === "queued" ? "排队中" : "生成中"}
                </span>
              </button>
              {["queued", "running", "generating"].includes(r.status) ? <GenerationProgress compact {...r} /> : null}
            </li>)}</ul>}
        </section>
        <section aria-label="领域资料" className="rounded-xl border border-[#e3e7ec] bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">领域资料</h2><Link to="/library" className="text-xs text-[var(--link)] hover:underline">全部资料库 →</Link></div>
          {!fields.length ? <p className="py-4 text-sm text-[var(--steel)]">尚无可浏览的资料库。</p> : <ul className="space-y-1">{fields.map((c) => <li key={c.id}>
            <button onClick={() => openCorpus(c.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm hover:bg-[#f6f7f9]">
              <span className="min-w-0 truncate">{c.name.replace(/^自然科学基金-/, "")}</span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--steel)]">{c.indexed_count?.toLocaleString() ?? "—"} 份</span>
            </button></li>)}</ul>}
          <div className="mt-4 border-t border-[#edf0f4] pt-4 text-xs leading-6 text-[var(--steel)]">按可检索文件份数展示，未作跨库去重。
            {role !== "user" ? <Link to="/overview/build" className="mt-2 block text-[var(--link)] hover:underline">进入概览，了解资料建设与领域分布 →</Link> : null}</div>
        </section>
      </div>
    </div>
  </main>;
}
