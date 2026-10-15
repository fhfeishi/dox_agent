import { PeriodSummary } from "./PeriodSummary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resultsSummaryQuery } from "../resultsSummary";
import { GenerationProgress } from "./GenerationProgress";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { changeArtifactLifecycle, type ArtifactInfo, type ArtifactSummary } from "../api";
import { fetchReviewRuns, type ReviewRun } from "../reviewApi";
import { useApp } from "../store";
import { Pill } from "./ui";

type Group = "analysis" | "review" | "intelligence" | "trash";
const GROUPS: [Group, string][] = [["analysis", "存量分析报告"], ["review", "资料审查报告"], ["intelligence", "情报分析报告"], ["trash", "回收站"]];
const TYPE_LABEL: Record<string, string> = { answer_snapshot: "回答快照", report: "报告" };
const STATUS_LABEL: Record<string, string> = { completed: "已完成", draft: "草稿", failed: "失败", generating: "生成中", running: "进行中" };

/**
 * 成果 — one entry for every generated report (query 2026-1009 ②, 2026-1014 1516): how many there
 * are by kind and how many were added this week, what is still being produced, then analysis,
 * review and intelligence reports by group, plus the recycle bin. Every role sees the same reports.
 * Opening an artifact goes to the artifact view, which keeps the edit/save/export actions. It
 * replaces the separate 任务进度 panel; lists refresh while something is in progress.
 */
export function InspectorResults() {
  const { showInspector, corpora, workspace } = useApp();
  const navigate = useNavigate();
  const totals = useQuery(resultsSummaryQuery);
  const client = useQueryClient();
  const [group, setGroup] = useState<Group>("analysis");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null>(null);
  const [trash, setTrash] = useState<ArtifactSummary[] | null>(null);
  const [runs, setRuns] = useState<ReviewRun[] | null>(null);
  const [error, setError] = useState("");
  const [lastTrash, setLastTrash] = useState<ArtifactInfo | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => { setRevision((value) => value + 1); void client.invalidateQueries({ queryKey: ["results", "summary"] }); };
    window.addEventListener("dox-artifacts-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("dox-artifacts-changed", refresh); window.removeEventListener("focus", refresh); };
  }, []);

  const working = [...(runs ?? []).filter((r) => r.status === "queued" || r.status === "running"),
    ...(artifacts ?? []).filter((a) => a.status === "generating")];
  useEffect(() => {
    const timer = window.setTimeout(() => setRevision((value) => value + 1), working.length ? 5000 : 30000);
    return () => window.clearTimeout(timer);
  }, [working.length, revision]);

  useEffect(() => {
    let active = true;
    setError("");
    const fail = (cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "成果读取失败"); };
    fetch("/api/artifacts?limit=200")
      .then(async (r) => { if (!r.ok) throw new Error("成果列表不可用"); return await r.json() as ArtifactSummary[]; })
      .then((items) => { if (active) setArtifacts(items); }, fail);
    fetch("/api/artifacts?view=trash&limit=50")
      .then(async (r) => { if (!r.ok) throw new Error("回收站读取失败"); return await r.json() as ArtifactSummary[]; })
      .then((items) => { if (active) setTrash(items); }, fail);
    fetchReviewRuns().then((items) => { if (active) setRuns(items); }, fail);
    return () => { active = false; };
  }, [revision]);

  const inSession = (item: ArtifactSummary) => !currentOnly || item.session_key === workspace.active;
  const analysis = (artifacts ?? []).filter((item) => item.task_id !== "intelligence" && inSession(item));
  const intelligence = (artifacts ?? []).filter((item) => item.task_id === "intelligence");
  const count: Record<Group, number | null> = {
    analysis: artifacts && analysis.length, review: runs && runs.length,
    intelligence: artifacts && intelligence.length, trash: trash && trash.length,
  };

  async function lifecycle(item: ArtifactSummary, action: "trash" | "restore" | "purge") {
    if (action === "purge" && !window.confirm("永久删除全部版本与独占附件，不可恢复？")) return;
    try {
      const result = await changeArtifactLifecycle(item, action);
      setLastTrash(action === "trash" ? result : null);
    } catch (e) { setError((e as Error).message); }
  }

  const corpusNames = (ids: string[]) => ids.length ? ids.map((id) => corpora.find((c) => c.id === id)?.name ?? id).join("、") : "来源库未记录";
  const row = "rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-[11px]";
  const action = "text-[12px] text-[var(--link)] hover:underline disabled:opacity-40";

  function ArtifactRow({ item }: { item: ArtifactSummary }) {
    return <li className={row}>
      <button type="button" onClick={() => showInspector({ kind: "artifact", artifactId: item.artifact_id })}
        className="block text-left text-[13px] font-semibold text-[var(--ink)] hover:text-[var(--primary)]">{item.title || "未命名成果"}</button>
      <p className="mt-[3px] text-[11.5px] text-[var(--steel)]">
        {TYPE_LABEL[item.type] ?? item.type} · v{item.current_version} · {STATUS_LABEL[item.status] ?? item.status} · {corpusNames(item.corpus_ids)} · {item.created_at?.slice(0, 10) || "时间未记录"}
      </p>
      <div className="mt-[6px] flex flex-wrap gap-[12px]">
        {group === "trash" ? <>
          <span className="text-[11.5px] text-[var(--stone)]">到期 {item.purge_after ? new Date(item.purge_after).toLocaleDateString() : "未记录"}</span>
          <button type="button" className={action} onClick={() => void lifecycle(item, "restore")}>还原</button>
          <button type="button" className="text-[12px] text-[var(--red)] hover:underline" onClick={() => void lifecycle(item, "purge")}>彻底删除</button>
        </> : <>
          <button type="button" className={action} onClick={() => showInspector({ kind: "artifact", artifactId: item.artifact_id })}>查看与编辑</button>
          <button type="button" className={action} disabled={item.status === "generating"} onClick={() => void lifecycle(item, "trash")}>移入回收站</button>
        </>}
      </div>
    </li>;
  }

  const empty = (text: string) => <p className="py-[18px] text-center text-[12.5px] text-[var(--steel)]">{text}</p>;
  return (
    <div>
      <details className="mb-4 rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">成果周期总结</summary><PeriodSummary /></details>
      {totals.data ? <section aria-label="成果统计" className="mb-3 rounded-xl bg-[var(--surface)] p-3 text-xs leading-6">
        <p><b className="text-lg text-[var(--ink)]">{totals.data.completed.total}</b> 份已完成报告</p>
        <p>存量分析 {totals.data.completed.analysis} · 资料审查 {totals.data.completed.review} · 情报分析 {totals.data.completed.intelligence}</p>
        <p className="text-[var(--steel)]">生成中 {totals.data.active} · 未完成 {totals.data.failed} · 一周内创建并完成 {totals.data.recent_completed}</p>
      </section> : null}
      {totals.error ? <p role="alert" className="mb-2 text-xs text-[var(--red)]">成果统计暂不可读</p> : null}
      {artifacts && artifacts.length >= 200 ? <p className="mb-3 text-xs text-[var(--steel)]">分析与情报列表显示最近 200 条，顶部统计包含全部报告。</p> : null}
      {working.length ? <section aria-label="处理中" className="mb-[12px]">
        <p className="mb-[6px] text-[12px] font-semibold text-[var(--steel)]">处理中 · {working.length}<span className="ml-[6px] font-normal text-[var(--stone)]">可离开本页，完成后在这里打开</span></p>
        <ul className="space-y-[6px]">{working.map((item) => "artifact_id" in item
          ? <li key={item.artifact_id}><button type="button" onClick={() => showInspector({ kind: "artifact", artifactId: item.artifact_id })}
              className="flex w-full items-center gap-[8px] rounded-[8px] border border-[var(--hairline)] px-[10px] py-[7px] text-left text-[12.5px] hover:border-[var(--primary)]">
              <span className="min-w-0 flex-1 truncate">{item.title || "分析报告"}</span><span className="shrink-0 text-[var(--stone)]">生成中</span></button><GenerationProgress compact status="generating" /></li>
          : <li key={item.id}><button type="button" onClick={() => void navigate(`/review/runs/${encodeURIComponent(item.id)}`)}
              className="flex w-full items-center gap-[8px] rounded-[8px] border border-[var(--hairline)] px-[10px] py-[7px] text-left text-[12.5px] hover:border-[var(--primary)]">
              <span className="min-w-0 flex-1 truncate">{item.document?.metadata?.title || item.document?.filename || "申请书"}</span>
              <span className="shrink-0 text-[var(--stone)]">{item.status === "queued" ? "排队中" : item.stage_label || "审查中"}</span></button><GenerationProgress compact status={item.status} stage={item.stage} stage_label={item.stage_label} kind={item.request.kind} /></li>)}</ul>
      </section> : null}
      <div role="tablist" aria-label="成果分类" className="mb-[12px] grid grid-cols-2 gap-[6px]">
        {GROUPS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => setGroup(key)}
          className={`flex items-center justify-between rounded-[8px] border px-[10px] py-[7px] text-[12.5px] ${group === key
            ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--primary-pressed)]"
            : "border-[var(--hairline)] bg-[var(--canvas)] text-[var(--slate)] hover:border-[var(--primary)]"}`}>
          <span>{label}</span><span className="tabular-nums text-[11.5px] text-[var(--stone)]">{count[key] ?? "…"}</span>
        </button>)}
      </div>
      {error ? <p role="alert" className="mb-[8px] text-[12px] text-[var(--red)]">{error}</p> : null}
      {lastTrash ? <p role="status" className="mb-[8px] text-[12px] text-[var(--steel)]">已移入回收站
        <button type="button" className="ml-[8px] text-[var(--link)]" onClick={() => void lifecycle(lastTrash, "restore")}>撤销</button></p> : null}

      {group === "analysis" ? <>
        <label className="mb-[8px] flex items-center gap-[6px] text-[12px] text-[var(--steel)]">
          <input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} />只看当前会话
        </label>
        {artifacts && !analysis.length ? empty(currentOnly ? "本会话还没有成果。" : "还没有成果。可在回答下方选择“保存为成果”，或在存量分析中生成专项报告。") : null}
        <ul className="space-y-[8px]">{analysis.map((item) => <ArtifactRow key={item.artifact_id} item={item} />)}</ul>
      </> : null}

      {group === "intelligence" ? <>
        {artifacts && !intelligence.length ? empty("还没有情报分析报告。") : null}
        <ul className="space-y-[8px]">{intelligence.map((item) => <ArtifactRow key={item.artifact_id} item={item} />)}</ul>
      </> : null}

      {group === "review" ? <>
        {runs && !runs.length ? empty("还没有资料审查报告。") : null}
        <ul className="space-y-[8px]">{(runs ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((run) => <li key={run.id} className={row}>
          <button type="button" onClick={() => void navigate(`/review/runs/${encodeURIComponent(run.id)}`)}
            className="block text-left text-[13px] font-semibold text-[var(--ink)] hover:text-[var(--primary)]">
            {run.document?.filename || run.document?.metadata?.title || "未命名申请书"}
          </button>
          <p className="mt-[3px] flex flex-wrap items-center gap-[6px] text-[11.5px] text-[var(--steel)]">
            <Pill tone={run.request.kind === "professional" ? "lav" : "sky"}>{run.request.kind === "professional" ? "专业审查" : "形式审查"}</Pill>
            {STATUS_LABEL[run.status] ?? run.status} · {run.created_at?.slice(0, 10)}
          </p>
          <p className="mt-[5px] text-[11.5px] text-[var(--stone)]">审查报告在审查页面查看与导出；审查记录不进入回收站。</p>
        </li>)}</ul>
      </> : null}

      {group === "trash" ? <>
        <p className="mb-[8px] text-[11.5px] leading-[1.6] text-[var(--stone)]">删除后保留 7 天，到期自动清理且不可恢复。</p>
        {trash && !trash.length ? empty("回收站为空。") : null}
        <ul className="space-y-[8px]">{(trash ?? []).map((item) => <ArtifactRow key={item.artifact_id} item={item} />)}</ul>
      </> : null}
    </div>
  );
}
