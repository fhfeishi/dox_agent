import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useApp } from "../store";
import { fetchArtifacts, type ArtifactSummary } from "../api";
import { fetchReviewRuns, REVIEW_STATUS_LABEL, type ReviewRun } from "../reviewApi";

export function HomeView() {
  const { corpora, corporaError, openCorpus, showInspector } = useApp();
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [tasks, results] = await Promise.all([fetchReviewRuns(), fetchArtifacts()]);
        if (active) { setRuns(tasks); setArtifacts(results); setError(""); }
      } catch (cause) { if (active) setError((cause as Error).message); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const working = runs.filter((r) => ["queued", "running"].includes(r.status));
  const failed = runs.filter((r) => r.status === "failed");
  const known = corpora.filter((c) => c.indexed_count != null);
  return <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
    <div className="mx-auto max-w-[1200px]">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-[var(--steel)]">资料与研究工作台</p><h1 className="mt-1 text-3xl font-semibold">工作总览</h1>
          <p className="mt-2 text-sm text-[var(--steel)]">从资料看现状，从报告看结论，随时接续正在进行的工作。</p></div>
        <Link to="/review/formal" className="rounded-lg bg-[var(--primary)] px-5 py-3 text-sm text-white">上传申请书 · 生成审查报告</Link>
      </header>
      {error || corporaError ? <p role="alert" className="mb-4 text-[var(--red)]">{error || corporaError}</p> : null}
      <section aria-label="工作概况" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["资料库", corpora.length, "按现有库计数"], ["可检索资料", known.reduce((n, c) => n + (c.indexed_count ?? 0), 0),
          known.length === corpora.length ? "文件份数，未跨库去重" : "部分资料库尚未统计"],
          ["正在处理", working.length, "含排队任务"], ["需处理任务", failed.length, "打开失败记录查看原因"]].map(([title, count, note]) =>
          <div key={title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
            <p className="text-sm text-[var(--steel)]">{title}</p><strong className="my-2 block text-3xl">{count}</strong><p className="text-xs text-[var(--stone)]">{note}</p>
          </div>)}
      </section>
      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">领域资料</h2><Link className="text-sm text-[var(--link)]" to="/library">全部资料与管理</Link></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{corpora.map((c) =>
          <button key={c.id} onClick={() => openCorpus(c.id)} className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 text-left hover:border-[var(--primary)]">
            <strong className="block text-base">{c.name}</strong><span className="mt-2 block text-xs text-[var(--steel)]">{c.missing ? "目录缺失" : `可检索 ${c.indexed_count ?? "未统计"} 份`}</span>
            <span className="mt-3 block text-sm text-[var(--primary)]">查看场景、问题、技术与成果 →</span>
          </button>)}</div>
      </section>
      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <section><h2 className="mb-3 text-lg font-semibold">最近分析成果</h2>
          {!artifacts.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-[var(--steel)]">尚无分析成果，可从资料库发起分析。</p> : null}
          {artifacts.slice(0, 6).map((a) => <button key={a.artifact_id} onClick={() => showInspector({ kind: "artifact", artifactId: a.artifact_id })}
            className="mb-2 block w-full rounded-xl border border-[var(--hairline)] p-4 text-left hover:border-[var(--primary)]">
            <b className="text-sm">{a.title}</b><span className="mt-1 block text-xs text-[var(--steel)]">{a.created_at?.slice(0, 10)} · {a.status === "completed" ? "已完成" : a.status === "draft" ? "草稿" : a.status === "failed" ? "未完成" : "生成中"}</span>
          </button>)}
        </section>
        <section><h2 className="mb-3 text-lg font-semibold">审查任务与报告</h2>
          {!runs.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-[var(--steel)]">还没有审查任务。上传申请书即可开始。</p> : null}
          {[...runs].sort((a, b) => Number(["queued", "running"].includes(b.status)) - Number(["queued", "running"].includes(a.status))).slice(0, 8).map((r) =>
            <Link key={r.id} to={`/review/runs/${r.id}`} className="mb-2 block rounded-xl border border-[var(--hairline)] p-4 hover:border-[var(--primary)]">
              <b className="text-sm">{r.document?.metadata.title || r.document?.filename || "申请书"}</b>
              <span className="mt-1 block text-xs text-[var(--steel)]">{r.request.kind === "formal" ? "形式审查" : "专业审查"} · {REVIEW_STATUS_LABEL[r.status] ?? r.status} · {r.status === "completed" ? "打开报告 →" : r.stage_label}</span>
            </Link>)}
        </section>
      </div>
    </div>
  </main>;
}
