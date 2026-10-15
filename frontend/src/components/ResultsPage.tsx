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

type Group = "all" | "analysis" | "review" | "intelligence" | "trash";
type Kind = Exclude<Group, "all" | "trash">;
const GROUPS: [Group, string][] = [["all", "全部"], ["analysis", "存量分析"], ["review", "资料审查"], ["intelligence", "情报分析"], ["trash", "回收站"]];
const KIND_TONE = { analysis: "sky", review: "lav", intelligence: "mint" } as const;
const KIND_LABEL: Record<Kind, string> = { analysis: "存量分析", review: "资料审查", intelligence: "情报分析" };
const STATUS_LABEL: Record<string, string> = { completed: "已完成", draft: "草稿", failed: "未完成", generating: "生成中", running: "审查中", queued: "排队中" };

/** One report in the list, whichever tool produced it. */
type Row = {
  key: string; kind: Kind; title: string; detail: string; status: string; date: string;
  corpusIds: string[]; createdBy: string; artifact?: ArtifactSummary; runId?: string;
};

const artifactRow = (item: ArtifactSummary): Row => ({
  key: item.artifact_id, kind: item.task_id === "intelligence" ? "intelligence" : "analysis",
  title: item.title || "未命名报告", detail: item.type === "answer_snapshot" ? "回答快照" : `第 ${item.current_version} 版`,
  status: item.status, date: item.updated_at || item.created_at, corpusIds: item.corpus_ids, createdBy: item.created_by ?? "", artifact: item,
});
const reviewRow = (run: ReviewRun): Row => ({
  key: run.id, kind: "review", title: run.document?.metadata?.title || run.document?.filename || "未命名申请书",
  detail: run.request.kind === "professional" ? "专业审查" : "形式审查", status: run.status, date: run.finished_at || run.created_at,
  corpusIds: run.request.corpus_ids ?? [], createdBy: run.created_by ?? "", runId: run.id,
});

/**
 * 成果 (query 2026-1015 1553): a page of its own for every generated report, replacing the 成果 view
 * squeezed into the right-hand panel. Counts by kind first, then what is still being produced, the
 * report list (by kind, title, source library; recycle bin last) and the rolling period summary.
 * Every role sees the same reports (query 2026-1014 1516). Analysis and intelligence reports open in
 * the right-hand preview for reading, editing and export; a review report opens on its review page.
 */
export function ResultsPage() {
  const { showInspector, corpora } = useApp();
  const navigate = useNavigate();
  const totals = useQuery(resultsSummaryQuery);
  const client = useQueryClient();
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState("");
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

  const working = [...(runs ?? []).filter((r) => r.status === "queued" || r.status === "running").map(reviewRow),
    ...(artifacts ?? []).filter((a) => a.status === "generating").map(artifactRow)];
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

  async function lifecycle(item: ArtifactSummary, action: "trash" | "restore" | "purge") {
    if (action === "purge" && !window.confirm("永久删除全部版本与独占附件，不可恢复？")) return;
    try {
      const result = await changeArtifactLifecycle(item, action);
      setLastTrash(action === "trash" ? result : null);
    } catch (e) { setError((e as Error).message); }
  }

  const reports = [...(artifacts ?? []).map(artifactRow), ...(runs ?? []).map(reviewRow)].sort((a, b) => b.date.localeCompare(a.date));
  const trashed = (trash ?? []).map(artifactRow);
  const count = (key: Group) => key === "trash" ? trash && trash.length
    : !artifacts || !runs ? null : key === "all" ? reports.length : reports.filter((r) => r.kind === key).length;
  const needle = query.trim().toLowerCase();
  const shown = (group === "trash" ? trashed : reports.filter((r) => group === "all" || r.kind === group))
    .filter((r) => !needle || r.title.toLowerCase().includes(needle))
    .filter((r) => !library || r.corpusIds.includes(library));
  const loaded = group === "trash" ? trash !== null : artifacts !== null && runs !== null;
  const libraries = corpora.filter((c) => reports.some((r) => r.corpusIds.includes(c.id)));
  const corpusNames = (ids: string[]) => ids.map((id) => corpora.find((c) => c.id === id)?.name ?? id).join("、");
  const open = (row: Row) => row.runId ? void navigate(`/review/runs/${encodeURIComponent(row.runId)}`)
    : showInspector({ kind: "artifact", artifactId: row.key });
  const link = "text-[12.5px] text-[var(--link)] hover:underline disabled:opacity-40";
  const stat = (label: string, value: number | undefined, note?: string) => <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] px-4 py-3">
    <p className="text-[12px] text-[var(--steel)]">{label}</p>
    <p className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--ink)]">{value ?? "…"}</p>
    {note ? <p className="text-[11.5px] text-[var(--stone)]">{note}</p> : null}
  </div>;

  return <main className="mx-auto w-full max-w-[1120px] space-y-6 px-4 py-6 sm:px-8">
    <header className="flex flex-wrap items-end gap-x-4 gap-y-1">
      <h1 className="text-[22px] font-semibold text-[var(--ink)]">成果</h1>
      <p className="text-[13px] text-[var(--steel)]">存量分析、资料审查、情报分析生成的全部报告；各角色看到的相同。</p>
    </header>

    <section aria-label="成果统计" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stat("已完成报告", totals.data?.completed.total, totals.data ? `一周内新完成 ${totals.data.recent_completed}` : undefined)}
      {stat("存量分析", totals.data?.completed.analysis)}
      {stat("资料审查", totals.data?.completed.review)}
      {stat("情报分析", totals.data?.completed.intelligence)}
    </section>
    {totals.error ? <p role="alert" className="text-xs text-[var(--red)]">成果统计暂不可读</p> : null}
    {totals.data && (totals.data.active || totals.data.failed) ? <p className="-mt-3 text-[12.5px] text-[var(--steel)]">
      另有生成中 {totals.data.active} 份、未完成 {totals.data.failed} 份，未计入已完成。</p> : null}

    {working.length ? <section aria-label="处理中" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <h2 className="mb-2 text-[14px] font-semibold">处理中 · {working.length}<span className="ml-2 text-[12px] font-normal text-[var(--stone)]">可离开本页，完成后在下方列表打开</span></h2>
      <ul className="grid gap-2 md:grid-cols-2">{working.map((row) => <li key={row.key} className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2">
        <button type="button" onClick={() => open(row)} className="flex w-full items-center gap-2 text-left text-[13px] hover:text-[var(--primary)]">
          <span className="min-w-0 flex-1 truncate">{row.title}</span><span className="shrink-0 text-[12px] text-[var(--stone)]">{KIND_LABEL[row.kind]}</span></button>
        {row.runId ? (() => { const run = runs!.find((r) => r.id === row.runId)!;
          return <GenerationProgress compact status={run.status} stage={run.stage} stage_label={run.stage_label} kind={run.request.kind} />; })()
          : <GenerationProgress compact status="generating" />}
      </li>)}</ul>
    </section> : null}

    <section aria-label="报告列表" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="成果分类" className="flex flex-wrap gap-1 rounded-xl bg-[var(--surface)] p-1">
          {GROUPS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => setGroup(key)}
            className={`rounded-lg px-3 py-1.5 text-[13px] ${group === key ? "bg-[var(--canvas)] font-semibold text-[var(--ink)] shadow-sm" : "text-[var(--steel)] hover:text-[var(--ink)]"}`}>
            {label} <span className="tabular-nums text-[11.5px] text-[var(--stone)]">{count(key) ?? "…"}</span></button>)}
        </div>
        <span className="flex-1" />
        <input aria-label="按标题搜索成果" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="按标题搜索"
          className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--primary)] sm:w-[200px]" />
        <select aria-label="来源资料库" value={library} onChange={(e) => setLibrary(e.target.value)}
          className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-[13px] sm:w-auto sm:max-w-[220px]">
          <option value="">全部资料库</option>
          {libraries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {error ? <p role="alert" className="text-[12px] text-[var(--red)]">{error}</p> : null}
      {lastTrash ? <p role="status" className="text-[12.5px] text-[var(--steel)]">已移入回收站
        <button type="button" className="ml-2 text-[var(--link)]" onClick={() => void lifecycle(lastTrash, "restore")}>撤销</button></p> : null}
      {group === "trash" ? <p className="text-[12px] text-[var(--stone)]">删除后保留 7 天，到期自动清理且不可恢复。资料审查记录不进入回收站。</p> : null}
      {artifacts && artifacts.length >= 200 ? <p className="text-[12px] text-[var(--stone)]">分析与情报报告显示最近 200 份，顶部统计包含全部报告。</p> : null}
      {!loaded ? <p role="status" className="py-6 text-center text-[13px] text-[var(--steel)]">正在读取成果…</p>
        : !shown.length ? <p className="rounded-xl border border-dashed border-[var(--hairline-strong)] py-8 text-center text-[13px] text-[var(--steel)]">
          {needle || library ? "没有符合条件的报告。" : group === "trash" ? "回收站为空。" : "还没有报告。可在存量分析、资料审查或情报分析中生成。"}</p>
        : <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--canvas)]">
          {shown.map((row) => <li key={row.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-[var(--surface)]">
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => open(row)} className="block max-w-full truncate text-left text-[14px] font-medium text-[var(--ink)] hover:text-[var(--primary)]">{row.title}</button>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--steel)]">
                <Pill tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Pill>
                <span>{row.detail}</span>
                {row.corpusIds.length ? <span className="max-w-[320px] truncate">{corpusNames(row.corpusIds)}</span> : null}
                {row.createdBy ? <span>{row.createdBy}</span> : null}
              </p>
            </div>
            <span className={`shrink-0 text-[12.5px] ${row.status === "failed" ? "text-[var(--red)]" : "text-[var(--steel)]"}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
            <span className="w-[84px] shrink-0 text-right text-[12.5px] tabular-nums text-[var(--stone)]">{row.date.slice(0, 10)}</span>
            <span className="flex w-[150px] shrink-0 justify-end gap-3">
              {group === "trash" && row.artifact ? <>
                <button type="button" className={link} onClick={() => void lifecycle(row.artifact!, "restore")}>还原</button>
                <button type="button" className="text-[12.5px] text-[var(--red)] hover:underline" onClick={() => void lifecycle(row.artifact!, "purge")}>彻底删除</button>
              </> : <>
                <button type="button" className={link} onClick={() => open(row)}>打开</button>
                {row.artifact ? <button type="button" className={link} disabled={row.status === "generating"} onClick={() => void lifecycle(row.artifact!, "trash")}>移入回收站</button> : null}
              </>}
            </span>
          </li>)}
        </ul>}
    </section>

    <PeriodSummary />
  </main>;
}
