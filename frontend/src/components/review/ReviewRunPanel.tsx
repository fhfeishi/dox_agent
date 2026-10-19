import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchReviewRuns, type ReviewRun } from "../../reviewApi";
import { Icon } from "../Icons";

export function ReviewRunPanel() {
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchReviewRuns().then((next) => { if (active) setRuns(next); })
        .catch((cause) => { if (active) setError((cause as Error).message); });
    };
    load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, []);
  // Keep the list current only while something is under review (节点审查 C1).
  const reviewing = runs.some((run) => run.status === "queued" || run.status === "running");
  useEffect(() => {
    if (!reviewing) return;
    let active = true;
    const timer = window.setInterval(() => { void fetchReviewRuns().then((next) => { if (active) setRuns(next); }).catch(() => undefined); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [reviewing]);
  const ordered = useMemo(() => runs, [runs]);
  if (error) return <p role="alert" className="px-[10px] py-2 text-[12px] text-[var(--red)]">{error}</p>;
  return (
    <div>
      <p className="px-[10px] pt-[4px] text-[11px] text-[var(--stone)]">审核任务</p>
      {!ordered.length ? <p className="px-[10px] py-3 text-[12.5px] text-[var(--stone)]">还没有审核任务。</p> : null}
      {ordered.map((run) => (
        <Link key={run.id} to={`/review/runs/${run.id}`}
          className="mt-[2px] flex items-center gap-[6px] rounded-[8px] px-[10px] py-[6px] text-[12.5px] text-[var(--slate)] hover:bg-[var(--surface)]">
          <Icon name={run.status === "completed" ? "checklist" : run.status === "running" ? "reload" : "warning"} size={13} strokeWidth={1.9} />
          <span className="min-w-0 flex-1 truncate">{run.document?.metadata?.title || run.document?.filename || "未命名申请书"}</span>
          <span className="text-[11px] text-[var(--stone)]">{run.status === "completed" ? "已完成" : run.status === "running" ? "进行中" : "未完成"}</span>
        </Link>
      ))}
    </div>
  );
}
