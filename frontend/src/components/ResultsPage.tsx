import { PeriodSummary } from "./PeriodSummary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resultsSummaryQuery } from "../resultsSummary";
import { GenerationProgress } from "./GenerationProgress";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { canDeleteArtifact, changeArtifactLifecycle, fetchArtifacts, type ArtifactInfo, type ArtifactSummary, type Scope } from "../api";
import { useAuth } from "../auth";
import { fetchReviewRuns, type ReviewRun } from "../reviewApi";
import { useApp } from "../store";
import { Button, Pill, Segmented } from "./ui";
import { useLayout } from "../layout";

type Group = "all" | "analysis" | "review" | "intelligence" | "trash";
type Kind = Exclude<Group, "all" | "trash">;
const GROUPS: [Group, string][] = [["all", "全部"], ["analysis", "存量分析"], ["review", "资料审查"], ["intelligence", "情报分析"], ["trash", "回收站"]];
const STATES = [["all", "全部状态"], ["active", "生成中"], ["completed", "已完成"], ["failed", "未完成"], ["draft", "草稿"]] as const;
type State = typeof STATES[number][0];
const KIND_TONE = { analysis: "sky", review: "lav", intelligence: "mint" } as const;
const KIND_LABEL: Record<Kind, string> = { analysis: "存量分析", review: "资料审查", intelligence: "情报分析" };
const STATUS_LABEL: Record<string, string> = { completed: "已完成", draft: "草稿", failed: "未完成", generating: "生成中", running: "审查中", queued: "排队中" };
// What produced a report, in 存量分析's task names; 领域分析 is a 专项报告 exported from 资料库预览 (query 2026-1023 1044).
const TASK_LABEL: Record<string, string> = { task1: "精准问答", task2: "对比分析", task3: "技术研判", task4: "专项报告", period_summary: "工作总结" };
const TEMPLATE_TAG: Record<string, string> = { domain_analysis: "领域分析" };
export function reportTag(item: Pick<ArtifactSummary, "type" | "task_id" | "template_id">): string {
  if (item.type === "answer_snapshot") return `保存的回答${TASK_LABEL[item.task_id] ? ` · ${TASK_LABEL[item.task_id]}` : ""}`;
  return [TASK_LABEL[item.task_id], TEMPLATE_TAG[item.template_id]].filter(Boolean).join(" · ");
}

/** One report in the list, whichever tool produced it. */
type Row = {
  key: string; kind: Kind; title: string; detail: string; status: string; date: string;
  corpusIds: string[]; artifact?: ArtifactSummary; runId?: string; author?: string;
};

const artifactRow = (item: ArtifactSummary): Row => ({
  key: item.artifact_id, kind: item.task_id === "intelligence" ? "intelligence" : "analysis",
  title: item.title || "未命名报告", detail: [reportTag(item), item.type === "answer_snapshot" ? "" : `第 ${item.current_version} 版`].filter(Boolean).join(" · "),
  status: item.status, date: item.updated_at || item.created_at, corpusIds: item.corpus_ids, artifact: item, author: item.created_by,
});
const reviewRow = (run: ReviewRun): Row => ({
  key: run.id, kind: "review", title: run.document?.metadata?.title || run.document?.filename || "未命名申请书",
  detail: run.request.kind === "professional" ? "专业审查" : "形式审查", status: run.status, date: run.finished_at || run.created_at,
  corpusIds: run.request.corpus_ids ?? [], runId: run.id, author: run.created_by,
});

/**
 * 成果 (query 2026-1015 1553): a page of its own for every generated report, replacing the 成果 view
 * squeezed into the right-hand panel. Counts by kind first, then what is still being produced, the
 * report list (by kind, title, source library; recycle bin last). The rolling period summary is the
 * page's second view, so it no longer trails every list (query 2026-1015 1639); both fit any width.
 * Each account sees the reports it generated and the answers it saved (query 2026-1023 1044, replacing
 * 2026-1014 1516's one list for everyone); the administrator can switch to every account's. Analysis and
 * intelligence reports open in the right-hand preview for reading, editing and export; a review report
 * opens on its review page.
 */
export function ResultsPage() {
  const { username, role } = useAuth();
  const { corpora } = useApp();
  const { showInspector } = useLayout();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const scope: Scope = role === "admin" && search.get("scope") === "all" ? "all" : "mine";
  const totals = useQuery(resultsSummaryQuery(scope));
  // Reports and the period summary are two views of the page (query 2026-1015 1639).
  const view = search.get("view") === "period" ? "period" : "reports";
  // URL filters are committed synchronously so rapid typing/selection cannot overwrite a pending filter.
  const filter = (values: Record<string, string>) => setSearch((old) => {
    const next = new URLSearchParams(old);
    for (const [key, value] of Object.entries(values)) {
      if (value && value !== "reports" && (value !== "all" || key === "scope")) next.set(key, value);
      else next.delete(key);
    }
    return next;
  }, { replace: true, flushSync: true });
  const setView = (next: "reports" | "period") => filter({ view: next });
  const group = GROUPS.find(([key]) => key === search.get("group"))?.[0] ?? "all";
  const query = search.get("q") ?? "";
  const library = search.get("library") ?? "";
  const state: State = STATES.find(([key]) => key === search.get("status"))?.[0] ?? "all";
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
    const fail = (cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "报告读取失败"); };
    fetchArtifacts({ limit: 200, scope }).then((items) => { if (active) setArtifacts(items); }, fail);
    fetchArtifacts({ view: "trash", limit: 50, scope }).then((items) => { if (active) setTrash(items); }, fail);
    fetchReviewRuns(scope).then((items) => { if (active) setRuns(items); }, fail);
    return () => { active = false; };
  }, [revision, scope]);

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
    .filter((r) => !library || r.corpusIds.includes(library))
    .filter((r) => state === "all" || (state === "active" ? ["queued", "running", "generating"].includes(r.status) : r.status === state));
  const loaded = group === "trash" ? trash !== null : artifacts !== null && runs !== null;
  const libraries = corpora.filter((c) => c.id === library || [...reports, ...trashed].some((r) => r.corpusIds.includes(c.id)));
  const corpusNames = (ids: string[]) => ids.map((id) => corpora.find((c) => c.id === id)?.name ?? id).join("、");
  const open = (row: Row) => row.runId ? void navigate(`/review/runs/${encodeURIComponent(row.runId)}?return=${encodeURIComponent("/results?" + search.toString())}`)
    : showInspector({ kind: "artifact", artifactId: row.key });
  const link = "text-body text-[var(--link)] hover:underline disabled:opacity-40";

  // The page scrolls on its own, like the other pages: the app frame is one screen high (query 2026-1015 1700).
  return <main className="min-h-0 flex-1 overflow-y-auto">
  <div className="@container mx-auto w-full max-w-[var(--page-max)] space-y-5 px-5 py-7 sm:px-8">
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-page font-semibold text-[var(--ink)]">报告中心</h1>
      <Segmented tabs label="报告中心视图" value={view} onChange={setView} options={[["reports", "报告"], ["period", "周期总结"]]} />
      {role === "admin" ? <Segmented label="查看范围" value={scope} onChange={(key) => filter({ scope: key === "all" ? "all" : "" })}
        options={[["mine", "我的"], ["all", "全部账户"]]} /> : null}
      <p className="basis-full text-body text-[var(--steel)] @3xl:basis-auto">{scope === "all" ? "全部账户" : `账户 ${username}`}{view === "period"
        ? "：按一周至一年汇总期内完成与进行中的工作，可生成总结报告。" : `：生成的报告与保存到报告中心的回答${role === "admin" && scope === "mine" ? "（含未记录生成人的早期报告）" : ""}。`}</p>
    </header>

    {view === "period" ? <PeriodSummary scope={scope} /> : <>
    {/* One line instead of four number cards: the counts per kind are on the tabs below (前端审查 R3). */}
    <p role="region" aria-label="报告统计" className="text-body text-[var(--steel)]">
      {totals.error ? <span role="alert" className="text-[var(--red)]">报告统计暂不可读</span> : totals.data ? <>
        已完成 <b className="tabular-nums text-[var(--ink)]">{totals.data.completed.total}</b> 份 · 一周内新完成 <span className="tabular-nums">{totals.data.recent_completed}</span> 份
        {totals.data.active || totals.data.failed ? `；另有生成中 ${totals.data.active} 份、未完成 ${totals.data.failed} 份，未计入已完成` : ""}
      </> : "正在读取报告统计…"}
    </p>

    {working.length ? <section aria-label="处理中" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <h2 className="mb-2 text-body font-semibold">处理中 · {working.length}<span className="ml-2 text-caption font-normal text-[var(--stone)]">可离开本页，完成后在下方列表打开</span></h2>
      <ul className="grid gap-2 @2xl:grid-cols-2">{working.map((row) => <li key={row.key} className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2">
        <button type="button" onClick={() => open(row)} className="flex w-full items-center gap-2 text-left text-body hover:text-[var(--primary)]">
          <span className="min-w-0 flex-1 truncate">{row.title}</span><span className="shrink-0 text-caption text-[var(--stone)]">{KIND_LABEL[row.kind]}</span></button>
        {row.runId ? (() => { const run = runs!.find((r) => r.id === row.runId)!;
          return <GenerationProgress compact status={run.status} stage={run.stage} stage_label={run.stage_label} kind={run.request.kind} />; })()
          : <GenerationProgress compact status="generating" />}
      </li>)}</ul>
    </section> : null}

    <section aria-label="报告列表" className="space-y-3">
      {/* Categories and search stay in view while a long list scrolls. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-[var(--canvas)]/95 px-1 py-2 backdrop-blur">
        <Segmented tabs label="报告分类" value={group} onChange={(key) => filter({ group: key })}
          options={GROUPS.map(([key, label]) => [key, <>{label} <span className="tabular-nums text-caption text-[var(--muted-cool)]">{count(key) ?? "…"}</span></>] as const)} />
        <div className="flex min-w-[260px] flex-1 flex-wrap justify-end gap-2">
        <input aria-label="按标题搜索报告" value={query} onChange={(e) => filter({ q: e.target.value })} placeholder="按标题搜索"
          className="min-w-[140px] flex-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-1.5 text-body outline-none focus:border-[var(--primary)] @3xl:max-w-[220px]" />
        <select aria-label="来源资料库" value={library} onChange={(e) => filter({ library: e.target.value })}
          className="min-w-0 max-w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-body @3xl:max-w-[220px]">
          <option value="">全部资料库</option>
          {libraries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {library && !libraries.some(c => c.id === library) ? <option value={library}>已移除的资料库</option> : null}
        </select>
        <select aria-label="报告状态" value={state} onChange={(e) => filter({ status: e.target.value })}
          className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-body">
          {STATES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        </div>
      </div>
      {query || library || state !== "all" || group !== "all" ? <div className="flex items-center justify-between gap-3 text-caption text-[var(--steel)]">
        <span>{loaded ? "当前显示 " + shown.length + " 份" : "正在读取筛选结果"}</span>
        <button type="button" className={link} onClick={() => filter({ q: "", library: "", status: "", group: "" })}>清除筛选</button>
      </div> : null}
      {error ? <p role="alert" className="text-caption text-[var(--red)]">{error}
        <button type="button" className={link + " ml-3"} onClick={() => setRevision(value => value + 1)}>重新加载</button></p> : null}
      {lastTrash ? <p role="status" className="text-body text-[var(--steel)]">已移入回收站
        <button type="button" className="ml-2 text-[var(--link)]" onClick={() => void lifecycle(lastTrash, "restore")}>撤销</button></p> : null}
      {group === "trash" ? <p className="text-caption text-[var(--stone)]">删除后保留 7 天，到期自动清理且不可恢复。资料审查记录不进入回收站。</p> : null}
      {artifacts && artifacts.length >= 200 ? <p className="text-caption text-[var(--stone)]">分析与情报报告显示最近 200 份，顶部统计包含全部报告。</p> : null}
      {!loaded && error ? null : !loaded ? <p role="status" className="py-6 text-center text-body text-[var(--steel)]">正在读取报告…</p>
        : !shown.length ? <div className="rounded-xl border border-dashed border-[var(--line-cool-strong)] py-8 text-center text-body text-[var(--text-3)]">
          <p>{needle || library || state !== "all" ? "没有符合条件的报告。" : group === "trash" ? "回收站为空。" : "还没有报告。可在存量分析、资料审查或情报分析中生成，或把对话中的回答保存到报告中心。"}</p>
          {/* An empty list says where the first report comes from, one click away (前端审查 V3). */}
          {!needle && !library && state === "all" && group !== "trash" ? <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => navigate("/tasks")}>去存量分析</Button>
            <Button size="sm" onClick={() => navigate("/review/formal")}>去资料审查</Button>
            <Button size="sm" onClick={() => navigate("/intelligence")}>去情报分析</Button>
          </div> : null}
        </div>
        : <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--canvas)]">
          {shown.map((row) => <li key={row.key} className="px-4 py-3 hover:bg-[var(--surface)]">
            {/* Two lines that fit any width: title and actions, then what it is and when (query 2026-1015 1639). */}
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => open(row)} className="min-w-0 flex-1 truncate text-left text-body font-medium text-[var(--ink)] hover:text-[var(--primary)]" title={row.title}>{row.title}</button>
              <span className="flex shrink-0 gap-3">
                {group === "trash" && row.artifact ? <>
                  <button type="button" className={link} onClick={() => void lifecycle(row.artifact!, "restore")}>还原</button>
                  {canDeleteArtifact(row.artifact, username, role) ? <button type="button" className="text-body text-[var(--red)] hover:underline" onClick={() => void lifecycle(row.artifact!, "purge")}>彻底删除</button> : null}
                </> : <>
                  <button type="button" className={link} onClick={() => open(row)}>打开</button>
                  {row.artifact && canDeleteArtifact(row.artifact, username, role) ? <button type="button" className={link} disabled={row.status === "generating"} onClick={() => void lifecycle(row.artifact!, "trash")}>移入回收站</button> : null}
                </>}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-[var(--steel)]">
              <Pill tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Pill>
              <span className={row.status === "failed" ? "text-[var(--red)]" : ""}>{row.artifact?.interrupted ? "已中断，可重试" : STATUS_LABEL[row.status] ?? row.status}</span>
              <span className="tabular-nums text-[var(--stone)]">{row.date.slice(0, 10)}</span>
              <span>{row.detail}</span>
              {row.corpusIds.length ? <span className="min-w-0 max-w-full truncate">{corpusNames(row.corpusIds)}</span> : null}
              {scope === "all" ? <span className="text-[var(--stone)]">生成人 {row.author || "未记录"}</span> : null}
            </p>
          </li>)}
        </ul>}
    </section>
    </>}
  </div>
  </main>;
}
