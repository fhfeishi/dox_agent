import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { fetchArtifacts, type CorpusInfo } from "../api";
import { fetchReviewRuns } from "../reviewApi";
import { useApp } from "../store";
import { libraryOverviewQuery } from "../libraryQueries";
import { useLayout } from "../layout";
import { Button } from "./ui";

const short = (name: string) => name.replace(/^自然科学基金-/, "");

export type TodoGroup = "资料处理" | "结构更新" | "身份核对" | "补录" | "未完成任务";
export type Todo = { key: string; group: TodoGroup; what: string; detail: string; action: string; go: () => void };
export const TODO_GROUPS: TodoGroup[] = ["资料处理", "结构更新", "身份核对", "补录", "未完成任务"];

/** Whether a library needs a look before its material can be read and searched as expected. */
export function libraryProblems(c: CorpusInfo): string[] {
  const problems: string[] = [];
  if (c.missing) problems.push("资料目录缺失");
  if (c.failed_count) problems.push(`${c.failed_count} 份读取失败`);
  if (c.pending_count) problems.push(`${c.pending_count} 份待处理`);
  if (c.job?.status === "interrupted") problems.push("上次刷新因服务重启中断");
  else if (c.job?.status === "error") problems.push("上次刷新失败");
  else if (c.job?.status === "partial") problems.push(`上次刷新 ${c.job.errors.length} 项失败`);
  return problems;
}

/**
 * Everything that needs the administrator, each with the way straight to it (upgrade plan U4b): material
 * that did not read, library structure to refresh, project identities to confirm and work that did not
 * finish. 首页 and 概览 · 资料库建设 show this one list.
 */
export function useAdminTodos(enabled = true) {
  const { corpora } = useApp();
  const { openCorpus, showInspector } = useLayout();
  const navigate = useNavigate();
  const overview = useQuery({ ...libraryOverviewQuery(), enabled });
  // The administrator's to-do list covers every account's unfinished work (query 2026-1023 1044).
  const reviews = useQuery({ queryKey: ["admin", "reviews"], queryFn: () => fetchReviewRuns("all"), enabled });
  const reports = useQuery({ queryKey: ["admin", "artifacts"], queryFn: () => fetchArtifacts({ scope: "all" }), enabled });
  const libs = overview.data ?? [];
  const todos: Todo[] = [
    ...libs.filter(l => l.research_records && (l.research_records.funded < l.projects || l.research_records.listed < l.projects)).map(l => ({
      key: "records" + l.corpus_id, group: "补录" as const, what: `${short(l.name)}：补录批准资助金额 / 成果列表`,
      detail: `${Math.max(0,l.projects-l.research_records!.funded)} 个项目未记录批准资助金额，${Math.max(0,l.projects-l.research_records!.listed)} 个项目未列成果`,
      action: "打开资料管理", go: () => openCorpus(l.corpus_id, "files") })),
    ...corpora.filter((c) => libraryProblems(c).length).map((c) => ({ key: "lib" + c.id, group: "资料处理" as const,
      what: `${short(c.name)}：${libraryProblems(c).join("、")}`,
      detail: c.missing ? "重新关联目录或移除失效记录" : "在资料管理中查看原因、重试或替换文件", action: "打开资料管理",
      go: () => openCorpus(c.id, "files") })),
    ...libs.filter((l) => l.lineage.state === "stale" || l.lineage.state === "missing").map((l) => ({ key: "ls" + l.corpus_id, group: "结构更新" as const,
      what: `${short(l.name)} 技术谱系${l.lineage.state === "missing" ? "尚未生成" : "需要重新生成"}`,
      detail: l.lineage.state === "missing" ? "已有资料尚未生成技术谱系" : l.lineage.stale_reason || "四维条目已变化", action: "查看",
      go: () => showInspector({ kind: "corpus", corpusId: l.corpus_id }) })),
    ...libs.filter((l) => l.hierarchy.state && l.hierarchy.state !== "ready").map((l) => ({ key: "hs" + l.corpus_id, group: "结构更新" as const,
      what: `${short(l.name)} 场景归纳${l.hierarchy.state === "missing" ? "尚未生成" : "需要更新"}`,
      detail: "场景、问题、技术路线与成果的归纳", action: "查看", go: () => showInspector({ kind: "corpus", corpusId: l.corpus_id }) })),
    ...libs.filter((l) => l.lineage.unplaced).map((l) => ({ key: "lu" + l.corpus_id, group: "结构更新" as const,
      what: `${short(l.name)} 有 ${l.lineage.unplaced} 条技术未归入体系`,
      detail: "在技术谱系的“未归入体系的条目”中逐条查看", action: "查看", go: () => showInspector({ kind: "corpus", corpusId: l.corpus_id }) })),
    ...libs.filter((l) => l.pending_identity).map((l) => ({ key: "pi" + l.corpus_id, group: "身份核对" as const,
      what: `${short(l.name)} 有 ${l.pending_identity} 份资料项目身份待核对`,
      detail: "批准号或基金体系不明，未计入项目统计", action: "打开资料管理", go: () => openCorpus(l.corpus_id, "files") })),
    ...(reviews.data ?? []).filter((r) => r.status === "failed").slice(0, 10).map((r) => ({ key: "rf" + r.id, group: "未完成任务" as const,
      what: `审查未完成：${r.document?.metadata?.title || r.document?.filename || "申请书"}`,
      detail: r.error || "原因未记录", action: "查看", go: () => navigate("/review/runs/" + r.id) })),
    ...(reports.data ?? []).filter((a) => a.lifecycle === "active" && a.status === "failed").slice(0, 10).map((a) => ({ key: "af" + a.artifact_id, group: "未完成任务" as const,
      what: `报告未完成：${a.title || "分析报告"}`, detail: a.interrupted ? "服务重启中断，可按原设置重新生成" : a.fail_reason || "原因未记录",
      action: "查看", go: () => showInspector({ kind: "artifact", artifactId: a.artifact_id }) })),
  ];
  const ready = Boolean(overview.data && reviews.data && reports.data);
  const errors = [overview.error, reviews.error, reports.error].filter(Boolean).map((e) => (e as Error).message);
  return { todos, ready, errors, libs };
}

/** The list itself: grouped, the first few shown, the rest one click away; an all-clear when empty. */
export function AdminTodoList({ todos, ready, errors, limit = 6 }: { todos: Todo[]; ready: boolean; errors: string[]; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? todos : todos.slice(0, limit);
  // A failure is said, and what did load still shows; the all-clear only when everything was read.
  const failure = errors.length ? <p role="alert" className="text-body text-[var(--red)]">部分数据读取失败：{errors.join("；")}。以下仅列出已读取的事项。</p> : null;
  if (!ready && !todos.length && !failure) return <p role="status" className="text-body text-[var(--steel)]">正在读取维护事项…</p>;
  if (!todos.length && failure) return failure;
  if (!todos.length) return <p className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--line-cool-strong)] bg-white px-4 py-3 text-body text-[var(--steel)]">
    <span aria-hidden="true" className="size-2 rounded-full bg-[var(--ok-fg)]" />暂无需要处理的事项：资料都已读取，结构是最新的，任务都已完成。</p>;
  return <div className="space-y-2">
    {failure}
    <ul className="space-y-1.5">{shown.map((t) => <li key={t.key} className="flex items-center gap-3 rounded-xl border border-[var(--line-cool)] bg-white px-4 py-2.5">
      <span className="shrink-0 rounded-md bg-[var(--surface-cool)] px-2 py-0.5 text-caption text-[var(--muted-cool)]">{t.group}</span>
      <span className="min-w-0 flex-1"><b className="block text-body font-medium">{t.what}</b><span className="block truncate text-caption text-[var(--steel)]">{t.detail}</span></span>
      <Button onClick={t.go}>{t.action}</Button>
    </li>)}</ul>
    {todos.length > limit ? <button type="button" onClick={() => setAll(!all)} className="text-caption text-[var(--link)] hover:underline">
      {all ? "收起" : `展开其余 ${todos.length - limit} 项`}</button> : null}
  </div>;
}

/** Each library's reading state for the administrator: libraries that need a look first, the rest folded. */
export function LibraryHealth() {
  const { corpora } = useApp();
  const { openCorpus } = useLayout();
  const rows = [...corpora].sort((a, b) => libraryProblems(b).length - libraryProblems(a).length || (b.indexed_count ?? 0) - (a.indexed_count ?? 0));
  const troubled = rows.filter((c) => libraryProblems(c).length);
  const healthy = rows.filter((c) => !libraryProblems(c).length);
  const refreshed = (c: CorpusInfo) => c.job?.ended_at ? new Date(c.job.ended_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const row = (c: CorpusInfo) => <tr key={c.id} className="border-t border-[var(--line-cool-soft)]">
    <td className="py-2 pr-3"><button type="button" onClick={() => openCorpus(c.id, "files")} className="text-left font-medium hover:text-[var(--primary)] hover:underline">{short(c.name)}</button>
      {libraryProblems(c).length ? <span className="block text-caption text-[var(--warn-fg)]">{libraryProblems(c).join("、")}</span> : null}</td>
    <td className="py-2 pr-3 text-right tabular-nums">{c.indexed_count?.toLocaleString() ?? "—"} / {c.source_count?.toLocaleString() ?? "—"}</td>
    <td className={`py-2 pr-3 text-right tabular-nums ${c.pending_count ? "text-[var(--warn-fg)]" : "text-[var(--stone)]"}`}>{c.pending_count ?? 0}</td>
    <td className={`py-2 pr-3 text-right tabular-nums ${c.failed_count ? "text-[var(--danger-fg)]" : "text-[var(--stone)]"}`}>{c.failed_count ?? 0}</td>
    <td className="py-2 text-right text-caption text-[var(--steel)] tabular-nums">{refreshed(c)}</td>
  </tr>;
  const table = (items: CorpusInfo[]) => <table className="w-full text-body">
    <thead><tr className="text-left text-caption text-[var(--steel)]"><th className="py-2 pr-3 font-normal">资料库</th><th className="py-2 pr-3 text-right font-normal">已入库 / 源文件</th>
      <th className="py-2 pr-3 text-right font-normal">待处理</th><th className="py-2 pr-3 text-right font-normal">读取失败</th><th className="py-2 text-right font-normal">最近刷新</th></tr></thead>
    <tbody>{items.map(row)}</tbody>
  </table>;
  const indexed = healthy.reduce((n, c) => n + (c.indexed_count ?? 0), 0);
  return <div className="overflow-x-auto rounded-xl border border-[var(--line-cool)] bg-white px-4 py-2">
    {troubled.length ? table(troubled) : null}
    {healthy.length ? <details className={`py-2 text-body text-[var(--steel)] ${troubled.length ? "border-t border-[var(--line-cool-soft)]" : ""}`}>
      <summary className="flex cursor-pointer items-center gap-2">
        {troubled.length ? null : <span aria-hidden="true" className="size-2 rounded-full bg-[var(--ok-fg)]" />}
        {troubled.length ? `其余 ${healthy.length} 个资料库状态正常` : `${healthy.length} 个资料库全部读取完成，共 ${indexed.toLocaleString()} 份可检索资料`}
        <span className="ml-auto text-caption text-[var(--link)]">逐库查看</span>
      </summary>
      <div className="mt-1">{table(healthy)}</div>
    </details> : null}
  </div>;
}
