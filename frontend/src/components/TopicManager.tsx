import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FACETS, FACET_COLORS, mergeTopics, projectQuery, topicsQuery, undoTopicMerge } from "../projects";
import { TopicSummaryPanel } from "./TopicSummaryPanel";
import { Button, Pill } from "./ui";

/** Merge synonymous topics, rename one, or undo; extracted labels and evidence stay unchanged. */
export function TopicManager({ corpusId, dimension, items }: {
  corpusId: string; dimension: string; items: { name: string; count: number; members: string[] }[];
}) {
  const client = useQueryClient();
  const history = useQuery(topicsQuery(corpusId));
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["library", corpusId] });

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage("");
    try { await action(); setChosen([]); setName(""); setMessage(done); await refresh(); }
    catch (error) { setMessage((error as Error).message + "；已有分类未改变。"); }
    finally { setBusy(false); }
  }
  const records = (history.data ?? []).filter((m) => m.dimension === dimension).reverse();
  return (
    <details className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <summary className="cursor-pointer text-sm font-semibold">整理{dimension}条目（合并同义、改名、撤销）</summary>
      <p className="mt-2 text-xs text-[var(--steel)]">勾选一个可改名，勾选多个可合并为一个名称。只改变归纳名称，原提取名称和原文依据保持不变；重新提取后相同名称继续归入。</p>
      <div className="mt-3 grid max-h-[220px] gap-1 overflow-y-auto sm:grid-cols-2">
        {items.map((item) => (
          <label key={item.name} className="flex items-start gap-2 rounded-lg bg-[var(--canvas)] p-2 text-sm">
            <input type="checkbox" checked={chosen.includes(item.name)} aria-label={"选择条目：" + item.name}
              onChange={(e) => { const next = e.target.checked ? [...chosen, item.name] : chosen.filter((n) => n !== item.name); setChosen(next); if (next.length === 1 && !name) setName(next[0]); }} />
            <span className="min-w-0"><b>{item.name}</b> <span className="text-xs text-[var(--steel)]">· {item.count} 个项目</span>
              {item.members.length > 1 || (item.members[0] && item.members[0] !== item.name) ? <span className="block text-xs text-[var(--steel)]">原条目：{item.members.join("、")}</span> : null}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input aria-label="整理后的条目名称" className="min-w-[200px] flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-1.5 text-sm"
          placeholder="整理后的名称" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Button variant="primary" disabled={busy || !chosen.length || !name.trim()}
          onClick={() => void run(() => mergeTopics(corpusId, dimension, chosen, name.trim()), `已将 ${chosen.length} 个条目整理为“${name.trim()}”。`)}>
          {chosen.length > 1 ? `合并 ${chosen.length} 个条目` : "改名"}
        </Button>
      </div>
      {message ? <p role="status" className="mt-2 text-xs text-[var(--slate)]">{message}</p> : null}
      {records.length ? (
        <div className="mt-4 border-t border-[var(--hairline)] pt-3">
          <p className="mb-2 text-xs font-semibold text-[var(--steel)]">整理记录</p>
          {records.map((m) => (
            <div key={m.id} className={`mb-1 flex flex-wrap items-center gap-2 text-sm ${m.active ? "" : "text-[var(--stone)]"}`}>
              <span className="min-w-0 flex-1">{m.members.join("、")} → <b>{m.name}</b></span>
              {m.active ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => undoTopicMerge(corpusId, m.id), `已撤销“${m.name}”，恢复原条目。`)}>撤销</Button>
                : <Pill tone="gray">{m.undone ? "已撤销" : "已被后续整理包含"}</Pill>}
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

/** 管理资料 → 四维条目整理: topic maintenance that feeds the hierarchy, kept out of the browse view. */
export function TopicAdmin({ corpusId }: { corpusId: string }) {
  const { data } = useQuery(projectQuery(corpusId));
  const [dimension, setDimension] = useState<string>("场景");
  const [topic, setTopic] = useState("");
  const items = useMemo(() => {
    const counts = new Map<string, number>(); const members = new Map<string, Set<string>>();
    for (const p of (data?.projects ?? []).filter((x) => x.identity_status === "identified")) {
      for (const name of new Set(p.facets[dimension].items.map((i) => i.name))) counts.set(name, (counts.get(name) ?? 0) + 1);
      for (const i of p.facets[dimension].items) members.set(i.name, (members.get(i.name) ?? new Set()).add(i.original_name ?? i.name));
    }
    return [...counts].map(([name, count]) => ({ name, count, members: [...(members.get(name) ?? [])].sort() }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data, dimension]);
  if (!data) return null;
  return (
    <details className="mt-5 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4" aria-label="四维条目整理">
      <summary className="cursor-pointer text-sm font-semibold">四维条目整理（合并同义、改名、撤销，查看条目归纳）</summary>
      <p className="mt-2 text-xs text-[var(--steel)]">整理后四维浏览的场景层级会提示“需更新”，重新生成后按整理后的条目归纳。</p>
      <div className="mt-3 flex flex-wrap gap-2">{FACETS.map((key, i) => <button key={key} type="button" aria-pressed={dimension === key}
        onClick={() => { setDimension(key); setTopic(""); }} className="rounded-full border px-3 py-1 text-xs"
        style={{ borderColor: FACET_COLORS[i], background: dimension === key ? FACET_COLORS[i] + "18" : "transparent" }}>{key}</button>)}</div>
      <div className="mt-3"><TopicManager corpusId={corpusId} dimension={dimension} items={items} /></div>
      <label className="mt-4 block text-xs text-[var(--slate)]">查看条目归纳
        <select aria-label="查看条目归纳" className="ml-2 rounded border border-[var(--hairline)] p-1" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">选择条目</option>{items.map((item) => <option key={item.name} value={item.name}>{item.name}（{item.count}）</option>)}
        </select></label>
      {topic ? <div className="mt-3"><TopicSummaryPanel corpusId={corpusId} dimension={dimension} name={topic} /></div> : null}
    </details>
  );
}
