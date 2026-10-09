import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { changeArtifactLifecycle, fetchArtifacts, type ArtifactInfo, type ArtifactSummary } from "../api";
import { fetchReviewRuns, type ReviewRun } from "../reviewApi";
import { useApp } from "../store";
import { Pill } from "./ui";

type Group = "analysis" | "review" | "intelligence" | "trash";
const GROUPS: [Group, string][] = [["analysis", "存量分析报告"], ["review", "资料审查报告"], ["intelligence", "情报分析报告"], ["trash", "回收站"]];
const TYPE_LABEL: Record<string, string> = { answer_snapshot: "回答快照", report: "报告" };
const STATUS_LABEL: Record<string, string> = { completed: "已完成", draft: "草稿", failed: "失败", generating: "生成中", running: "进行中" };

/**
 * One entry for every saved result (query 2026-1009 ②): analysis, review and intelligence reports
 * grouped in the inspector, plus the recycle bin. Opening an artifact goes to the artifact view,
 * which keeps the existing edit/save/export actions.
 */
export function InspectorResults() {
  const { showInspector, corpora, workspace } = useApp();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group>("analysis");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null>(null);
  const [trash, setTrash] = useState<ArtifactSummary[] | null>(null);
  const [runs, setRuns] = useState<ReviewRun[] | null>(null);
  const [error, setError] = useState("");
  const [lastTrash, setLastTrash] = useState<ArtifactInfo | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("dox-artifacts-changed", refresh);
    return () => window.removeEventListener("dox-artifacts-changed", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    const fail = (cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "成果读取失败"); };
    fetchArtifacts().then((items) => { if (active) setArtifacts(items); }, fail);
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
        <ul className="space-y-[8px]">{(runs ?? []).slice().reverse().map((run) => <li key={run.id} className={row}>
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
