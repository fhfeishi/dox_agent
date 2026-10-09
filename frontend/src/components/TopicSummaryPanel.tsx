import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { generateTopicSummary, topicSummaryQuery, type TopicSummary } from "../projects";
import { EvidenceList } from "./SceneHierarchy";
import { Button, Pill } from "./ui";

/** A topic's grounded summary; generated only on request, never on page open. */
export function TopicSummaryPanel({ corpusId, dimension, name }: { corpusId: string; dimension: string; name: string }) {
  const client = useQueryClient();
  const query = useQuery(topicSummaryQuery(corpusId, dimension, name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const summary = query.data;
  async function generate() {
    setBusy(true); setError("");
    try { client.setQueryData(topicSummaryQuery(corpusId, dimension, name).queryKey, await generateTopicSummary(corpusId, dimension, name)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const sources = new Map((summary?.sources ?? []).map((source) => [source.ref, source]));
  const point = (item: NonNullable<TopicSummary["common"]>[number], index: number) => (
    <li key={index} className="rounded-lg bg-[var(--canvas)] p-3">
      <p className="text-sm leading-6">{item.text}</p>
      <details className="mt-1 text-xs"><summary className="cursor-pointer text-[var(--primary)]">依据 {item.refs.length} 条 · {item.project_ids.length} 个项目</summary>
        {item.refs.map((ref) => sources.get(ref)).filter(Boolean).map((source) => (
          <div key={source!.ref} className="mt-2"><p className="text-[var(--steel)]">{source!.project}{source!.status ? " · " + source!.status : ""}</p>
            <EvidenceList corpusId={corpusId} evidence={[source!]} limit={1} staleHint="请更新主题归纳" /></div>))}
      </details>
    </li>
  );
  return (
    <section aria-label="主题归纳" className="mb-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">主题归纳</h4>
        {summary?.state === "ready" ? <Pill tone="mint">与当前资料一致</Pill> : summary?.state === "stale" ? <Pill tone="yellow">资料已变化 · 需更新</Pill> : <Pill tone="gray">尚未生成</Pill>}
        <span className="flex-1" />
        <Button size="sm" variant={summary?.state === "ready" ? "ghost" : "primary"} disabled={busy || query.isPending} onClick={() => void generate()}>
          {busy ? "正在归纳…" : summary?.state === "missing" ? "生成主题归纳" : "更新归纳"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-[var(--steel)]">只依据本主题各项目的原文摘录生成，每条要点可展开依据；项目数与代表项目由索引统计。已取得与预期不合并为同一事实。</p>
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--red)]">{error}</p> : null}
      {summary?.update_error ? <p role="alert" className="mt-2 text-xs text-[#8a3d00]">最近一次更新未完成（{summary.update_error}），以下保留上一版本。</p> : null}
      {summary?.status === "未完成" && !summary.overview ? <p className="mt-2 text-xs text-[var(--red)]">归纳未完成：{summary.error}</p> : null}
      {summary?.state === "stale" ? <p className="mt-2 text-xs text-[#8a6a00]">本主题的成员或来源版本已变化；下方为原归纳及其当时的原文快照，打开已更新的文件会提示版本变化。</p> : null}
      {summary && summary.state !== "missing" && summary.overview !== undefined ? <>
        {summary.overview ? <p className="mt-3 text-[14px] leading-7">{summary.overview}</p> : null}
        <p className="mt-2 text-xs text-[var(--steel)]">涉及 {summary.project_count} 个项目 · 代表项目：{(summary.representatives ?? []).map((r) => `${r.title}（${r.items} 条依据）`).join("、") || "无"}{summary.unsupported_items ? ` · ${summary.unsupported_items} 条描述无可回读原文，未参与归纳` : ""}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><p className="mb-2 text-xs font-semibold text-[var(--steel)]">共性</p>{summary.common?.length ? <ul className="space-y-2">{summary.common.map(point)}</ul> : <p className="text-xs text-[var(--stone)]">没有至少两个项目共同支持的共性要点。</p>}</div>
          <div><p className="mb-2 text-xs font-semibold text-[var(--steel)]">差异</p>{summary.differences?.length ? <ul className="space-y-2">{summary.differences.map(point)}</ul> : <p className="text-xs text-[var(--stone)]">没有可核对的差异要点。</p>}</div>
        </div>
        {summary.gaps?.length ? <details className="mt-3 text-xs text-[var(--steel)]"><summary className="cursor-pointer">未采用的模型要点 {summary.gaps.length} 条</summary><ul className="mt-1 list-disc pl-5">{summary.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details> : null}
      </> : null}
    </section>
  );
}
