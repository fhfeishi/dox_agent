import { useMemo, useState } from "react";
import type { CorpusInfo } from "./api";
import { fundMetaFromPath } from "./fundMeta";
import type { DocumentInfo } from "./useDocuments";

export type LibraryMode = "card" | "list";

const PREPARATION_LABEL: Record<string, string> = { ready: "就绪", empty: "空库", uninitialized: "未初始化" };

/**
 * U9.2 library entry + H6 corpus detail: browse indexed documents without touching the
 * retrieval scope. With `corpus` given, shows the corpus header (H6) and adapts card
 * fields by kind — fund corpora render filename-derived 负责人/项目编号/年份区间
 * (display-only until H9 lands server-side meta).
 */
export function LibraryView({ documents, corpusReady, onOpenDocument, onBack, corpus, onIngestCorpus, ingestBusy }: {
  documents: DocumentInfo[];
  corpusReady: boolean;
  onOpenDocument: (docId: string) => void;
  onBack: () => void;
  corpus?: CorpusInfo | null;
  onIngestCorpus?: () => void;
  ingestBusy?: boolean;
}) {
  const [mode, setMode] = useState<LibraryMode>("card");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter(doc => doc.title.toLowerCase().includes(needle));
  }, [documents, query]);
  const fund = corpus?.kind === "fund";
  const job = corpus?.job ?? null;
  const totalPages = useMemo(() => documents.reduce((sum, doc) => sum + (doc.pages || 0), 0), [documents]);

  return <section className="flex-1 py-8" aria-label="文献库">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">文献库{corpus ? ` · ${corpus.name}` : ""}</h1>
        <p className="mt-1 text-xs text-stone-500">
          {corpus
            ? `${fund ? "基金报告库" : corpus.kind === "unknown" ? "知识库" : corpus.kind} · ${corpus.domain} · ${PREPARATION_LABEL[corpus.preparation] ?? corpus.preparation} · ${documents.length} 份 · 共 ${totalPages} 页`
            : `已入库文档 ${documents.length} 份`} · 浏览与预览不改变检索范围
        </p>
        {job && <p role="status" className={`mt-1 text-xs ${job.status === "error" ? "text-red-700" : job.status === "running" ? "text-amber-700" : "text-teal-700"}`}>
          {{ running: `正在导入…（${job.completed}/${job.total || "?"}）`, done: `导入完成：新增 ${job.added ?? job.imported} · 更新 ${job.updated ?? job.changed} · 跳过 ${job.skipped ?? 0} · 删除 ${job.deleted ?? 0}`, partial: `导入部分完成：成功 ${job.imported} 份，失败 ${job.errors.length} 份`, error: "导入失败", idle: "" }[job.status] ?? job.status}
          {!!job.errors.length && job.status !== "running" && <span className="text-stone-400">（{job.errors.map(e => e.source ?? e.error).slice(0, 3).join("、")}{job.errors.length > 3 ? " 等" : ""}）</span>}
        </p>}
      </div>
      <div className="flex items-center gap-2">
        {corpus && onIngestCorpus && <button type="button" disabled={ingestBusy || job?.status === "running"}
          className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs text-teal-800 hover:bg-teal-100 disabled:opacity-40"
          onClick={onIngestCorpus}>{job?.status === "running" ? "导入中…" : "导入/更新本库"}</button>}
        <div className="flex rounded-lg border border-stone-300 bg-white p-0.5 text-xs">
          {(["card", "list"] as const).map(item => <button key={item} aria-pressed={mode === item}
            className={`rounded px-2 py-1 ${mode === item ? "bg-stone-200 text-stone-800" : "text-stone-500"}`}
            onClick={() => setMode(item)}>{item === "card" ? "卡片" : "列表"}</button>)}
        </div>
        <button className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs" onClick={onBack}>返回对话</button>
      </div>
    </div>

    <input aria-label="按名称筛选文档" className="mt-4 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
      placeholder="按文件名筛选" value={query} onChange={e => setQuery(e.target.value)}/>

    {!corpusReady && <p role="status" className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">知识库准备中，文档列表可能不完整。</p>}
    {corpusReady && !documents.length && <p className="mt-6 text-sm text-stone-500">{corpus && corpus.preparation === "uninitialized" ? "本库尚未导入文档；点击右上方「导入/更新本库」开始解析。" : "还没有已入库文档；可在“设置与运维”中导入本地文本与 PDF。"}</p>}
    {corpusReady && !!documents.length && !visible.length && <p className="mt-6 text-sm text-stone-500">没有匹配的文档。</p>}

    {mode === "card"
      ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(doc => {
            const meta = fund ? fundMetaFromPath(doc.rel_path ?? "") : null;
            return <button key={doc.doc_id} onClick={() => onOpenDocument(doc.doc_id)}
              className="rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-teal-300 hover:bg-stone-50">
              <h2 className="truncate text-sm font-medium text-stone-800" title={doc.title}>{meta?.title ?? doc.title}</h2>
              <p className="mt-2 text-xs text-stone-500">{meta ? `${meta.pi} · ${meta.projectNo} · ${meta.yearFrom}–${meta.yearTo}` : `${doc.pages} 页 · ${doc.kind}`}</p>
              <p className="mt-1 text-xs text-stone-400">{meta ? `${doc.pages} 页` : ""}{meta ? " · " : ""}采集 {doc.captured_at || "未记录"}</p>
            </button>;
          })}
        </div>
      : <ul className="mt-5 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
          {visible.map(doc => {
            const meta = fund ? fundMetaFromPath(doc.rel_path ?? "") : null;
            return <li key={doc.doc_id}>
              <button onClick={() => onOpenDocument(doc.doc_id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-stone-800" title={doc.title}>{meta?.title ?? doc.title}</span>
                  {meta && <span className="block text-xs text-stone-400">{meta.pi} · {meta.projectNo} · {meta.yearFrom}–{meta.yearTo}</span>}
                </span>
                <span className="shrink-0 text-xs text-stone-500">{doc.pages} 页</span>
                <span className="shrink-0 text-xs text-stone-400">采集 {doc.captured_at || "未记录"}</span>
              </button></li>;
          })}
        </ul>}
  </section>;
}
