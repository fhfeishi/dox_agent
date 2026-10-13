import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { fetchArtifacts } from "../api";
import { fetchReviewRuns } from "../reviewApi";
import { useApp } from "../store";

const ACTIVE = new Set(["queued", "running", "generating"]);
const LABELS: Record<string, string> = { queued: "排队中", running: "处理中", generating: "生成中", completed: "已完成", failed: "未完成", draft: "草稿", final: "已定稿" };

/** This is the existing shared workspace, not a claim of per-user ownership. */
export function TaskProgress() {
  const navigate = useNavigate();
  const { showInspector, toggleInspector } = useApp();
  const [onlyActive, setOnlyActive] = useState(false);
  const review = useQuery({ queryKey: ["activity", "reviews"], queryFn: fetchReviewRuns, refetchInterval: 5000 });
  const reports = useQuery({ queryKey: ["activity", "reports"], queryFn: () => fetchArtifacts(), refetchInterval: 5000 });
  const rows = [
    ...(review.data ?? []).map((r) => ({ key: "review:" + r.id, title: r.document?.metadata.title || r.document?.filename || "申请书",
      type: r.request.kind === "formal" ? "形式审查" : "专业审查", status: r.status,
      date: r.created_at, detail: r.error || r.stage_label, open: () => { toggleInspector(); navigate("/review/runs/" + r.id); } })),
    ...(reports.data ?? []).map((r) => ({ key: "report:" + r.artifact_id, title: r.title || "分析报告",
      type: "分析成果", status: r.status, date: r.created_at, detail: "",
      open: () => showInspector({ kind: "artifact", artifactId: r.artifact_id }) })),
  ].sort((a, b) => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) || b.date.localeCompare(a.date));
  const visible = rows.filter((r) => !onlyActive || ACTIVE.has(r.status));
  const failedRead = review.error || reports.error;
  return <section aria-label="报告任务进度" className="space-y-4">
    <p className="text-sm leading-6 text-[var(--steel)]">可离开当前页面，稍后从这里继续查看。以下为当前共享工作区返回的审查任务与分析成果，暂未按个人隔离；普通问答请回到对应对话。</p>
    <div className="flex gap-2">
      <button className="rounded border px-3 py-2 text-sm" aria-pressed={!onlyActive} onClick={() => setOnlyActive(false)}>最近任务</button>
      <button className="rounded border px-3 py-2 text-sm" aria-pressed={onlyActive} onClick={() => setOnlyActive(true)}>处理中（{rows.filter((r) => ACTIVE.has(r.status)).length}）</button>
    </div>
    {failedRead ? <div role="alert" className="text-sm text-[var(--red)]">部分任务读取失败，已读取的内容仍可查看。<button className="ml-2 underline" onClick={() => { void review.refetch(); void reports.refetch(); }}>重试</button></div> : null}
    {review.isPending || reports.isPending ? <p role="status">正在读取任务…</p> : null}
    {!visible.length && !failedRead && !review.isPending && !reports.isPending ? <p className="p-4 text-sm text-[var(--steel)]">{onlyActive ? "当前没有处理中任务。" : "暂无任务记录。"}</p> : null}
    {visible.slice(0, 50).map((row) => <button key={row.key} onClick={row.open} className="block w-full rounded-xl border border-[var(--hairline)] p-4 text-left hover:border-[var(--primary)]">
      <span className="flex items-start justify-between gap-3"><strong className="text-sm">{row.title}</strong><span className="shrink-0 text-xs">{LABELS[row.status] ?? row.status}</span></span>
      <span className="mt-2 block text-xs text-[var(--steel)]">{row.type} · {row.date.slice(0, 16).replace("T", " ")}</span>
      {row.detail ? <span className="mt-2 block text-sm text-[var(--steel)]">{row.detail}</span> : null}
      <span className="mt-2 block text-xs text-[var(--primary)]">{ACTIVE.has(row.status) ? "查看处理情况 →" : "查看结果 →"}</span>
    </button>)}
    {visible.length > 50 ? <p className="text-xs text-[var(--steel)]">已显示最近 50 条；完整审查记录在审查页，分析成果在报告中心。</p> : null}
  </section>;
}
