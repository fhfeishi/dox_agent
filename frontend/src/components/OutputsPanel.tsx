import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { outputsQuery, projectQuery, FACET_COLORS } from "../projects";
import { useApp } from "../store";

const ORDER = ["奖励", "专利", "专著", "期刊论文", "会议论文"];
const rank = (type: string) => { const i = ORDER.indexOf(type); return i < 0 ? ORDER.length : i; };

/**
 * 成果板块 (query 2026-1009 ④): what the scene's projects list in their own “成果列表” — counts by
 * type and the entries themselves — rather than one sentence taken from an abstract.
 */
export function OutputsPanel({ corpusId, projectIds, label }: { corpusId: string; projectIds: string[]; label: string }) {
  const { openPreview } = useApp();
  const [all, setAll] = useState(false);
  const { data, error } = useQuery(outputsQuery(corpusId));
  const { data: library } = useQuery(projectQuery(corpusId));
  if (error) return <p role="alert" className="text-xs text-[var(--red)]">{error.message}</p>;
  if (!data) return <p className="text-xs text-[var(--stone)]">正在读取成果列表…</p>;
  const rows = projectIds.flatMap((id) => {
    const outputs = data.projects[id];
    return outputs ? outputs.items.map((item) => ({ ...item, projectId: id, outputs })) : [];
  }).sort((a, b) => rank(a.type) - rank(b.type));
  const counts = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.type]: (acc[row.type] ?? 0) + 1 }), {});
  const listed = projectIds.filter((id) => data.projects[id]).length;
  const titles = new Map((library?.projects ?? []).map((p) => [p.project_id, p]));
  function open(projectId: string) {
    const outputs = data!.projects[projectId];
    const file = titles.get(projectId)?.files.find((f) => f.document.doc_id === outputs.doc_id);
    if (file) openPreview(file.document, null, corpusId);
  }
  const shown = all ? rows : rows.slice(0, 8);
  return <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4" aria-label={label + " 成果板块"}>
    <p className="text-sm font-semibold">成果板块 <span className="font-normal text-xs text-[var(--steel)]">· 取自各项目报告原文的“成果列表”</span></p>
    <p className="mt-1 text-xs text-[var(--steel)]">{listed}/{projectIds.length} 个项目的报告含成果列表{listed < projectIds.length ? "，其余报告原文没有该板块" : ""}。</p>
    {rows.length ? <>
      <div className="mt-2 flex flex-wrap gap-2">{Object.entries(counts).sort((a, b) => rank(a[0]) - rank(b[0])).map(([type, n]) =>
        <span key={type} className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-xs">{type} <b style={{ color: FACET_COLORS[3] }}>{n}</b></span>)}</div>
      <ul className="mt-3 space-y-1.5">{shown.map((row, i) => <li key={i} className="text-xs leading-5">
        <span className="mr-1 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--slate)]">{row.type}</span>
        <span className="text-[var(--ink)]">{row.title}</span>
        <button type="button" onClick={() => open(row.projectId)} className="ml-1 text-[var(--link)] hover:underline">
          {titles.get(row.projectId)?.title ?? row.projectId} · 查看原文</button>
      </li>)}</ul>
      {rows.length > 8 ? <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs text-[var(--link)]">{all ? "收起" : `展开全部 ${rows.length} 项`}</button> : null}
    </> : <p className="mt-2 text-xs text-[var(--stone)]">这些项目的报告原文没有成果列表。</p>}
  </div>;
}
