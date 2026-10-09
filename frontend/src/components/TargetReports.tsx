import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { extractTargets, fetchTargetJob } from "../api";
import { DIMENSIONS, FILTER_KEYS, normalizeFacetName, targetReportsQuery, usableTarget } from "../libraryQueries";
import { useApp } from "../store";
import { Button, Pill } from "./ui";
import { TargetComparison } from "./TargetComparison";

export function TargetReports({ corpusId }: { corpusId: string }) {
  const { startResearch, sessionBusy, targetJobs, rememberTargetJob } = useApp();
  const [search, setSearch] = useSearchParams();
  const client = useQueryClient();
  const reports = useQuery(targetReportsQuery(corpusId));
  const items = reports.data ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [watch, setWatch] = useState(true);
  const jobId = targetJobs[corpusId];
  const job = useQuery({
    queryKey: ["target-job", corpusId, jobId],
    queryFn: ({ signal }) => fetchTargetJob(corpusId, jobId, signal),
    enabled: Boolean(jobId), retry: false,
    refetchInterval: (query) => watch && !query.state.error && query.state.data?.status === "running" ? 1000 : false,
  });
  useEffect(() => {
    if (!job.data) return;
    if (job.data.status !== "running") void client.invalidateQueries({ queryKey: ["library", corpusId, "projects"] });
    void client.invalidateQueries({ queryKey: ["library", corpusId, "targets"] });
    void client.invalidateQueries({ queryKey: ["library", corpusId, "target"] });
  }, [client, corpusId, job.data?.completed, job.data?.status]);
  const extraction = useMutation({
    mutationFn: (force: boolean) => extractTargets(corpusId, [...selected], force),
    onSuccess: (value) => {
      client.setQueryData(["target-job", corpusId, value.job_id], value);
      rememberTargetJob(corpusId, value.job_id);
      setWatch(true);
    },
  });
  const running = job.data?.status === "running";
  const busy = extraction.isPending || running;
  const filters = FILTER_KEYS.map((key) => search.get(key) ?? "");
  const needle = (search.get("q") ?? "").trim().toLocaleLowerCase();
  const status = search.get("status") ?? "all";
  function setFilter(key: string, value: string) {
    setSearch((current) => { const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key); return next;
    }, { replace: key === "q" });
  }
  function matches(item: typeof items[number], except = -1) {
    return filters.every((value, index) => index === except || !value
      || usableTarget(item) && item.facets[DIMENSIONS[index]]?.items.some((entry) => normalizeFacetName(entry.name) === value));
  }
  const visible = items.filter((item) => matches(item)
    && (!needle || `${item.title} ${item.source_name}`.toLocaleLowerCase().includes(needle))
    && (status === "all" || (status === "current" ? usableTarget(item)
      : status === "stale" ? item.stale : item.process.status === status)));
  const selectedRows = items.filter((item) => selected.has(item.doc_id));
  const unavailable = selected.size - selectedRows.length;
  const currentCount = items.filter(usableTarget).length;
  const context = filters.map((value, index) => value ? `${DIMENSIONS[index]}：${value}` : "").filter(Boolean).join("；");
  async function research(task: string) {
    setError("");
    try {
      if (unavailable) throw new Error("选中资料已失效，请重新核对选择；系统不会静默缩小范围");
      await startResearch(corpusId, [...selected], task, `${question.trim()}${context ? `\n筛选背景：${context}` : ""}`);
    } catch (e) { setError((e as Error).message); }
  }
  function open(docId: string, index: number) {
    const row = items.find((item) => item.doc_id === docId);
    // Pin the reader to the version visible in this list, including after a reload.
    setSearch((current) => { const next = new URLSearchParams(current);
      next.set("doc", docId); next.set("facet", String(index));
      if (row) next.set("version", row.version); return next;
    });
  }
  return <div className="mt-[14px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[14px] text-[13px]">
    <div className="flex flex-wrap items-center gap-[8px]">
      <h3 className="font-medium">四维浏览 · 报告单元 {items.length} 份</h3>
      <span className="flex-1" />
      <Button size="sm" variant="quiet" onClick={() => void reports.refetch()}>刷新四维列表</Button>
      <Button size="sm" disabled={busy || !selected.size || Boolean(unavailable)} onClick={() => extraction.mutate(false)}>生成四维信息{selected.size ? `（${selected.size}）` : ""}</Button>
      <Button size="sm" variant="ghost" disabled={busy || !selected.size || Boolean(unavailable)} onClick={() => extraction.mutate(true)}>重新提取所选</Button>
    </div>
    <p className="mt-2 text-xs text-[var(--stone)]">四维方案 · 当前可用于筛选 {currentCount} 份；未处理 {items.filter((item) => !item.stale && item.process.status === "未处理").length}；未完成 {items.filter((item) => !item.stale && item.process.status === "未完成").length}；待更新 {items.filter((item) => item.stale).length}。提取会调用模型，普通浏览不会提取。</p>
    {reports.isPending ? <p role="status">正在读取四维列表…</p> : null}
    {error || reports.error || extraction.error ? <p role="alert" className="mt-2 text-[var(--red)]">{error || reports.error?.message || extraction.error?.message}{reports.data && reports.error ? "（显示上次读取内容）" : ""}</p> : null}
    {jobId ? <div className="my-2 flex flex-wrap items-center gap-2 text-xs" aria-label="提取进度">
      {job.data ? <span role="status">{running ? "提取中" : "提取已结束"} · 已完成 {job.data.completed} / 共 {job.data.total} · 失败 {job.data.errors.length} 项</span> : null}
      {job.error ? <span role="alert">任务状态暂不可读；服务重启后任务记录可能不可用，请刷新已发布结果。{job.error.message}</span> : null}
      {job.data?.errors.map((item) => <span key={item.doc_id}>{item.doc_id}：{item.error}</span>)}
      {running && watch && !job.error ? <Button size="sm" variant="ghost" onClick={() => setWatch(false)}>停止查看进度</Button> : null}
      <Button size="sm" variant="quiet" disabled={job.isFetching} onClick={() => { setWatch(true); void job.refetch(); void reports.refetch(); }}>继续查看状态</Button>
      {running && !watch ? <span>仍在处理：已停止自动刷新，可点击“继续查看状态”查看最新进度</span> : null}
    </div> : null}
    <div className="my-3 flex flex-wrap gap-2" aria-label="四维筛选">
      <input aria-label="搜索四维资料" placeholder="搜索文档标题" value={search.get("q") ?? ""}
        onChange={(event) => setFilter("q", event.target.value)} className="rounded border p-2" />
      {DIMENSIONS.map((dimension, index) => {
        const counts = new Map<string, number>();
        for (const item of items.filter((row) => usableTarget(row) && matches(row, index))) {
          for (const name of new Set(item.facets[dimension]?.items.map((entry) => normalizeFacetName(entry.name)))) counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        if (filters[index] && !counts.has(filters[index])) counts.set(filters[index], 0);
        return <label key={dimension} className="text-xs">{dimension === "成果" ? "文献成果" : dimension}
          <select aria-label={`${dimension}筛选`} value={filters[index]} onChange={(event) => setFilter(FILTER_KEYS[index], event.target.value)} className="ml-1 max-w-56 rounded border p-2">
            <option value="">全部</option>
            {[...counts].sort(([a], [b]) => a.localeCompare(b, "zh")).map(([name, count]) => <option key={name} value={name}>{name}（{count} 份）</option>)}
          </select>
        </label>;
      })}
      <select aria-label="整理状态筛选" value={status} onChange={(event) => setFilter("status", event.target.value === "all" ? "" : event.target.value)} className="rounded border p-2">
        <option value="all">全部整理状态</option><option value="current">完整且当前有效</option><option value="未处理">未处理</option><option value="未完成">未完成</option><option value="stale">待更新</option>
      </select>
    </div>
    <div className="mb-2 flex flex-wrap gap-2">{filters.map((value, index) => value ? <Button key={index} size="sm" variant="quiet" onClick={() => setFilter(FILTER_KEYS[index], "")}>{DIMENSIONS[index]}：{value} ×</Button> : null)}</div>
    <p className="text-xs text-[var(--steel)]">筛选命中 {visible.length} 份 · 已选 {selected.size} 份（当前筛选外 {Math.max(0, selected.size - visible.filter((item) => selected.has(item.doc_id)).length)} 份）。跨维筛选表示共同出现，不代表存在关联。</p>
    <div className="my-2 flex flex-wrap gap-2">
      <Button size="sm" variant="quiet" disabled={!visible.length} onClick={() => setSelected((current) => new Set([...current, ...visible.map((item) => item.doc_id)]))}>选中筛选结果</Button>
      <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => { setSelected(new Set()); setCompare(false); }}>清空选择</Button>
      <Button size="sm" variant="quiet" disabled={selected.size < 2 || Boolean(unavailable)} onClick={() => setCompare((current) => !current)}>{compare ? "收起对照" : "只读对照"}</Button>
    </div>
    {selected.size ? <section aria-label="基于所选资料研究" className="my-3 rounded border p-3">
      <label className="block">研究问题<textarea aria-label="研究问题" className="mt-1 w-full rounded border p-2" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="说明你希望从所选资料中研究什么" /></label>
      <p className="mb-2 text-xs text-[var(--stone)]">将新建会话，限定 {selected.size} 份原文。{context ? `筛选背景：${context}。` : ""}报告还会按项目年份和类别预检，实际纳入范围以预检为准。</p>
      <div className="flex flex-wrap gap-2">{[["task1", "基于所选资料提问"], ["task2", "生成对比分析"], ["task3", "技术研判"], ["task4", "生成报告"]].map(([task, label]) =>
        <Button key={task} size="sm" disabled={sessionBusy || !question.trim() || Boolean(unavailable) || task === "task2" && selected.size < 2} onClick={() => void research(task)}>{label}</Button>)}</div>
      {unavailable ? <p role="alert">{unavailable} 份选中资料已失效，请清空并重新选择。</p> : null}
    </section> : null}
    {compare ? <TargetComparison corpusId={corpusId} reports={selectedRows} onOpen={open} /> : null}
    <ul className="mt-3 space-y-2" aria-label="四维资料列表">
      {visible.map((item) => <li key={item.doc_id} className="rounded-lg border border-[var(--hairline)] p-3">
        <div className="flex items-start gap-2">
          <input type="checkbox" aria-label={`选择 ${item.title}`} checked={selected.has(item.doc_id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.doc_id); else next.delete(item.doc_id); return next; })} />
          <span className="min-w-0 flex-1 font-medium">{item.title}</span>
          <Pill tone={usableTarget(item) ? "mint" : "gray"}>{item.process.status}</Pill>{item.stale ? <Pill tone="yellow">待更新</Pill> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{DIMENSIONS.map((key, index) => {
          const facet = item.facets[key];
          const label = item.stale ? "待更新" : item.process.status === "未处理" ? "未处理" : facet?.state === "has" ? "有内容" : facet?.state === "异常" ? "提取异常" : item.process.status !== "已完成" ? "未完成" : "未提及";
          return <button key={key} className="rounded-full bg-[var(--primary-soft)] px-2 py-1 text-xs text-[var(--primary-pressed)] disabled:bg-[var(--surface)] disabled:text-[var(--stone)]"
            disabled={item.stale || item.process.status === "未处理"} onClick={() => open(item.doc_id, index)}>{key}：{label}</button>;
        })}<span className="ml-auto text-xs text-[var(--stone)]">处理覆盖 {item.process.coverage.processed}/{item.process.coverage.total} 段</span></div>
        {item.message ? <p className="mt-1 text-xs">{item.message}</p> : null}
        {usableTarget(item) ? <p className="mt-2 text-xs text-[var(--steel)]">技术：{item.facets["技术"]?.items.map((entry) => entry.name).join("、") || "未提及"}；文献成果：{item.facets["成果"]?.items.map((entry) => `${entry.name}（${entry.status ?? "原文未明确"}）`).join("、") || "未提及"}</p> : null}
      </li>)}
      {!reports.isPending && !visible.length ? <li>当前筛选没有资料；可移除筛选查看未整理或未分类内容。</li> : null}
    </ul>
  </div>;
}
