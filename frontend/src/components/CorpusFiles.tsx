import { LibraryChat } from "./LibraryChat";
import { droppedFiles } from "../folderUpload";
import { useAuth } from "../auth";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { deleteCorpusFile, fetchCorpusFiles, renameCorpusFile, uploadCorpusFile, type CorpusFile } from "../api";
import type { DocumentInfo } from "../useDocuments";
import { Icon } from "./Icons";
import { fundMetaFromPath } from "../fundMeta";

const STATUS_LABEL: Record<string, string> = {
  new: "待导入",
  indexed: "已入库",
  pending: "待同步",
  error: "解析失败",
  removed: "源文件缺失",
};

/** K7: source-file list / upload / rename / delete for one corpus. */
export function CorpusFiles({
  corpusId,
  onChanged,
  onRetryImport,
  documents = [],
  corpusName = "",
  onPreview,
  connected = true,
}: {
  corpusId: string;
  onChanged: () => void;
  onRetryImport: () => Promise<void>;
  documents?: DocumentInfo[];
  corpusName?: string;
  onPreview?: (document: DocumentInfo) => void;
  connected?: boolean;
}) {
  type UploadState = "waiting" | "uploading" | "indexed" | "parse-error" | "upload-error" | "stopped";
  type UploadItem = { file: File; path: string; state: UploadState; detail?: string };
  const client = useQueryClient();
  const canEdit = useAuth().role === "admin";
  const result = useQuery({ queryKey: ["library", corpusId, "files"],
    queryFn: ({ signal }) => fetchCorpusFiles(corpusId, signal), enabled: connected });
  const listing = result.data;
  const files: CorpusFile[] = listing?.files ?? [];
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ rel: string; name: string } | null>(null);
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") ?? "all";
  const search = params.get("q") ?? "";
  function updateFilter(key: string, value: string) {
    setParams((current) => { const next = new URLSearchParams(current);
      if (value && value !== "all") next.set(key, value); else next.delete(key);
      return next;
    }, { replace: key === "q" });
  }
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const stopAfterCurrent = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState("name");
  const [bodyQuery, setBodyQuery] = useState("");
  const [hovered, setHovered] = useState<DocumentInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const selectedDocs = selectedIds.flatMap((id) => documents.filter((d) => d.doc_id === id));
  useEffect(() => {
    const timer = window.setTimeout(() => setBodyQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(0), [search, filter, mode]);
  const matches = useQuery({ queryKey: ["library", corpusId, "search", bodyQuery],
    enabled: mode === "content" && bodyQuery.length >= 2,
    queryFn: async ({ signal }): Promise<{ hits: { doc_id: string; snippet: string }[]; limit: number }> => {
      const response = await fetch(`/api/corpora/${encodeURIComponent(corpusId)}/search?q=${encodeURIComponent(bodyQuery)}`, { signal });
      if (!response.ok) throw new Error("正文检索失败，请稍后重试");
      return response.json();
    }, staleTime: 30000 });
  const excerpt = useQuery({ queryKey: ["library", corpusId, "excerpt", hovered?.doc_id, hovered?.version],
    enabled: !!hovered,
    queryFn: async ({ signal }): Promise<string> => {
      const response = await fetch(`/api/documents/${hovered!.doc_id}/markdown?corpus=${encodeURIComponent(corpusId)}&version=${encodeURIComponent(hovered!.version)}`, { signal });
      if (!response.ok) throw new Error("原文摘录暂不可读");
      const value = await response.json();
      return String(value.text || "").replace(/^---[\s\S]*?\n---\s*/, "").replace(/[#*|]/g, "").trim().slice(0, 260);
    }, staleTime: 60000 });
  function select(id: string) {
    if (selectedIds.includes(id)) setSelectedIds((old) => old.filter((item) => item !== id));
    else if (selectedIds.length >= 20) setNotice("一次最多选择 20 份资料，请先移除部分选择。");
    else setSelectedIds((old) => [...old, id]);
  }
  async function load() {
    await client.invalidateQueries({ queryKey: ["library", corpusId] });
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await load();
      onChanged();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadFiles(input: { file: File; path: string }[]) {
    const selected = input.filter((item) => /\.(md|markdown|txt|pdf|docx)$/i.test(item.file.name));
    if (!selected.length) { setNotice("没有可上传的支持格式文件"); return; }
    setBusy(true);
    setNotice("");
    const failures: string[] = [];
    stopAfterCurrent.current = false;
    setUploads(selected.map((item) => ({ ...item, state: "waiting" })));
    try {
      for (const [index, { file, path }] of selected.entries()) {
        if (stopAfterCurrent.current) {
          setUploads((current) => current.map((item, i) => i >= index ? { ...item, state: "stopped" } : item));
          break;
        }
        setUploads((current) => current.map((item, i) => i === index ? { ...item, state: "uploading" } : item));
        try {
          const result = await uploadCorpusFile(corpusId, file, path.includes("/") ? path : undefined);
          if (result.errors.length) {
            const detail = result.errors.map((item) => item.error).join("、");
            failures.push(`${file.name}：已保存，解析失败`);
            setUploads((current) => current.map((item, i) => i === index ? { ...item, state: "parse-error", detail } : item));
          } else {
            setUploads((current) => current.map((item, i) => i === index ? { ...item, state: "indexed" } : item));
          }
        } catch (e) {
          failures.push(`${file.name}：${(e as Error).message}`);
          setUploads((current) => current.map((item, i) => i === index ? { ...item, state: "upload-error", detail: (e as Error).message } : item));
        }
      }
      await load();
      onChanged();
      if (failures.length) setNotice(`部分文件未能入库，其余文件已继续处理：${failures.join("；")}`);
      else if (stopAfterCurrent.current) setNotice("已停止后续未上传文件；当前文件处理结果已如实保存。");
    } finally {
      setBusy(false);
    }
  }
  const docsById = new Map(documents.map((document) => [document.doc_id, document]));
  const represented = new Set<string>();
  const rows = files.map((file) => {
    const document = (file.doc_id ? docsById.get(file.doc_id) : undefined) ?? documents.find((item) =>
      item.rel_path === `${corpusName}/source/${file.rel_path}` || item.rel_path?.endsWith(`/${corpusName}/source/${file.rel_path}`));
    if (document) represented.add(document.doc_id);
    return { file, document, status: file.status };
  });
  for (const document of documents) {
    if (!represented.has(document.doc_id)) {
      rows.push({ file: { rel_path: document.title, size: 0, status: "indexed", doc_id: document.doc_id }, document, status: "indexed" });
    }
  }
  const counts = {
    all: rows.length,
    pending: rows.filter((row) => row.status === "new" || row.status === "removed").length,
    indexed: rows.filter((row) => row.status === "indexed").length,
    failed: rows.filter((row) => row.status === "error").length,
  };
  const visibleRows = rows.filter((row) => filter === "all" ||
    (filter === "pending" && (row.status === "new" || row.status === "removed")) ||
    (filter === "indexed" && row.status === "indexed") || (filter === "failed" && row.status === "error"));
  const needle = search.trim().toLowerCase();
  const namedRows = needle
    ? visibleRows.filter((row) => `${row.file.rel_path} ${row.document?.title ?? ""}`.toLowerCase().includes(needle))
    : visibleRows;
  const matchIds = new Set(matches.data?.hits.map((hit) => hit.doc_id) ?? []);
  const searchedRows = mode === "content" && needle
    ? visibleRows.filter((row) => row.document && matchIds.has(row.document.doc_id)) : namedRows;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(searchedRows.length / 40) - 1));
  const pageRows = searchedRows.slice(currentPage * 40, (currentPage + 1) * 40);
  return (
    <div className="mt-[14px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[14px] text-[13px]">
      <h3 className="font-medium text-[var(--charcoal)]">文档 · 已入库 {counts.indexed} / 源文件 {files.length} · 待处理 {counts.pending} / 失败 {counts.failed}</h3>
      <div className="mt-[10px] space-y-[10px]">
        {listing?.misplaced_files.length ? <p role="status" className="rounded-[8px] bg-[#fff7e6] px-[10px] py-[8px] text-[11.5px] text-[#805900]">
          在知识库根目录发现未放入资料目录的文件：{listing.misplaced_files.join("、")}。请移入下方 source/ 目录后刷新；系统不会自动移动文件。
        </p> : null}
        {canEdit && listing?.source_dir ? <details className="break-all text-[11.5px] text-[var(--stone)]"><summary className="cursor-pointer">查看本地资料目录</summary><p>
          本地资料目录：<code>{listing.source_dir}</code>
          <button type="button" className="ml-[7px] text-[var(--link)] hover:underline" onClick={() => void navigator.clipboard?.writeText(listing.source_dir)}>复制路径</button>
        </p></details> : null}
        {/* Adding, renaming and deleting files is library maintenance (administrators only). */}
        {canEdit ? <>
        <div className={`rounded-xl border-2 border-dashed p-4 transition-colors ${dragging ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--surface-soft)]"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false);
            if (!busy && connected) void droppedFiles(e.dataTransfer.items, e.dataTransfer.files).then(uploadFiles).catch((error) => setNotice(error.message));
          }}>
          <div className="flex flex-wrap items-center gap-[8px]">
            <button
              type="button"
              disabled={busy || !connected}
              className="font-app inline-flex h-[30px] items-center gap-[6px] rounded-[7px] bg-[var(--primary)] px-[12px] text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:opacity-50"
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="plus" size={13} strokeWidth={2.2} />
              选择文件
            </button>
            <button type="button" disabled={busy || !connected} onClick={() => folderRef.current?.click()} className="rounded-lg border bg-[var(--canvas)] px-3 py-2 text-xs">选择文件夹</button>
            <span className="text-xs text-[var(--steel)]">或将文件、文件夹拖入此处</span>
            <input ref={folderRef} type="file" aria-label="上传文件夹" multiple {...{ webkitdirectory: "" }} className="sr-only"
              onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = "";
                void uploadFiles(files.map((file) => ({ file, path: file.webkitRelativePath || file.name }))); }} />
            <input
              ref={inputRef}
              type="file"
              aria-label="上传源文件"
              multiple
              accept=".md,.markdown,.txt,.pdf,.docx"
              disabled={busy || !connected}
              className="sr-only"
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (selected.length) void uploadFiles(selected.map((file) => ({ file, path: file.name })));
              }}
            />
          </div>
          <p className="mt-[6px] text-[11.5px] text-[var(--stone)]">
            支持 md / markdown / txt / pdf / docx 多选；每个文件独立上传并增量导入，失败项不会阻断后续文件。
          </p>
          {busy ? <button type="button" className="mt-[6px] text-[11.5px] text-[var(--red)] hover:underline" onClick={() => { stopAfterCurrent.current = true; }}>停止后续未上传文件</button> : null}
        </div>
        </> : null}
        {uploads.length ? <ul aria-label="本次添加进度" className="space-y-[3px] rounded-[8px] bg-[var(--surface-soft)] p-[8px] text-[11.5px]">
          {uploads.map((item) => <li key={item.path} className="flex gap-[8px]">
            <span className="min-w-0 flex-1 truncate" title={item.file.name}>{item.file.name}</span>
            <span className="shrink-0 text-[var(--stone)]">{{ waiting: "等待", uploading: "上传并处理", indexed: "已入库", "parse-error": "已保存，解析失败", "upload-error": "上传失败", stopped: "已停止，未上传" }[item.state]}</span>
            {item.detail ? <span className="max-w-[180px] truncate text-[var(--red)]" title={item.detail}>{item.detail}</span> : null}
          </li>)}
        </ul> : null}
        <div className="flex flex-wrap items-center gap-[6px]" aria-label="筛选文档状态">
          <label className="flex min-w-[160px] flex-1 items-center gap-[6px] rounded-[7px] border border-[var(--hairline)] bg-[var(--canvas)] px-[8px] py-[5px] text-[var(--stone)] focus-within:border-[var(--primary)]">
            <Icon name="search" size={12} />
            <input
              aria-label="搜索资料"
              value={search}
              onChange={(event) => updateFilter("q", event.target.value)}
              placeholder={mode === "content" ? "输入正文主题（至少两个字）" : "按文件名搜索"}
              className="font-app w-full border-0 bg-transparent text-[11.5px] text-[var(--ink)] outline-none placeholder:text-[var(--stone)]"
            />
          </label>
          {(["all", "pending", "indexed", "failed"] as const).map((key) => <button key={key} type="button" onClick={() => updateFilter("status", key)} className={`rounded-full px-[9px] py-[4px] text-[11px] ${filter === key ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"}`}>
            {{ all: "全部", pending: "待处理", indexed: "已入库", failed: "失败" }[key]} {counts[key]}
          </button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="搜索方式" value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-lg border bg-[var(--primary-soft)] p-2 text-xs">
            <option value="name">文件名搜索</option><option value="content">正文检索</option>
          </select>
          <span className="text-xs text-[var(--steel)]">{searchedRows.length} 份 · 已选 {selectedDocs.length} 份{mode === "content" ? "（正文检索最多返回100份相关资料）" : ""}</span>
          <button disabled={chatBusy} onClick={() => setSelectedIds([])} className="text-xs text-[var(--link)]">清空选择</button>
          {matches.isFetching && mode === "content" ? <span role="status">正在检索正文…</span> : null}
          {mode === "content" && matches.error ? <span role="alert">{matches.error.message}</span> : null}
        </div>
        <ul aria-label="资料列表" className="max-h-[560px] space-y-1 overflow-y-auto rounded-xl border border-[var(--hairline)] p-1">
          {pageRows.map(({ file, document, status }) => (
            <li key={file.rel_path} onMouseEnter={() => setHovered(document ?? null)} onMouseLeave={() => setHovered(null)}
              className={`group relative flex min-h-[58px] flex-wrap items-center gap-3 rounded-lg border border-l-4 px-3 py-2 text-xs transition-[background-color,border-color] duration-150 ${document && selectedIds.includes(document.doc_id) ? "border-[var(--primary)] border-l-[var(--primary)] bg-[var(--primary-soft)]" : "border-transparent hover:border-[var(--hairline)] hover:bg-[var(--surface)]"}`}>
              <input type="checkbox" aria-label={`选择 ${file.rel_path}`} disabled={!document || status !== "indexed" || chatBusy}
                checked={!!document && selectedIds.includes(document.doc_id)} onChange={() => document && select(document.doc_id)} />
              {hovered?.doc_id === document?.doc_id && document ? <div role="tooltip" className="pointer-events-none absolute left-9 right-4 top-full z-10 hidden rounded-lg border bg-[var(--canvas)] p-3 leading-6 shadow-lg group-hover:block">
                <b>原文摘录</b><p>{excerpt.data || excerpt.error?.message || "正在读取…"}</p></div> : null}
              {editing?.rel === file.rel_path ? (
                <form
                  className="flex min-w-0 flex-1 gap-[6px]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await renameCorpusFile(corpusId, file.rel_path, editing.name.trim());
                      setEditing(null);
                    });
                  }}
                >
                  <input
                    autoFocus
                    aria-label="文件名"
                    className="font-app min-w-0 flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[5px] text-[12px] outline-none focus:border-[var(--primary)]"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                  <button type="submit" className="rounded-[6px] border border-[var(--hairline-strong)] px-[8px]">
                    保存
                  </button>
                  <button type="button" className="px-[4px]" onClick={() => setEditing(null)}>
                    取消
                  </button>
                </form>
              ) : (
                <>
                  {/* A row reads like a track: the project title first, its years, number and lead below. */}
                  {(() => {
                    const meta = fundMetaFromPath(file.rel_path);
                    const folder = file.rel_path.includes("/") ? file.rel_path.split("/").slice(0, -1).join("/") : "";
                    return <span className="min-w-0 flex-1" title={file.rel_path}>
                      <span className="block truncate text-[13px] font-medium text-[var(--ink)]">{meta?.title || file.rel_path.split("/").at(-1)}</span>
                      <span className="block truncate text-[11.5px] text-[var(--stone)]">
                        {meta ? `${meta.yearFrom}–${meta.yearTo} · ${meta.projectNo} · ${meta.pi}` : file.rel_path.split(".").at(-1)?.toUpperCase()}
                        {folder ? ` · ${folder}` : ""}</span>
                    </span>;
                  })()}
                  <span className="shrink-0 text-[var(--stone)]">
                    {status === "error" ? "已保存，未入库 · 解析失败" : STATUS_LABEL[status] ?? status}
                  </span>
                  {file.reason ? <span className="max-w-[220px] truncate text-[var(--red)]" title={file.reason}>{file.reason}</span> : null}
                  {status === "indexed" && document && onPreview ? <button type="button" className="shrink-0 text-[var(--link)] hover:underline" onClick={() => onPreview(document)}>预览</button> : null}
                  {canEdit && status === "error" ? (
                    <button
                      type="button"
                      disabled={busy || !connected}
                      className="shrink-0 rounded-[5px] border border-[var(--hairline-strong)] px-[7px] py-[3px] text-[11px] text-[var(--link)] disabled:opacity-50"
                      onClick={() => void run(onRetryImport)}
                    >
                      重试本库待处理项
                    </button>
                  ) : null}
                  {canEdit ? <>
                  <button
                    type="button"
                    aria-label={`重命名 ${file.rel_path}`}
                    disabled={busy || chatBusy}
                    className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-[var(--steel)] hover:bg-[var(--surface)]"
                    onClick={() => setEditing({ rel: file.rel_path, name: file.rel_path.split("/").at(-1) ?? file.rel_path })}
                  >
                    <Icon name="edit" size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除 ${file.rel_path}`}
                    disabled={busy || chatBusy}
                    className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-[var(--red)] hover:bg-[var(--surface)]"
                    onClick={() => {
                      if (window.confirm(`删除源文件「${file.rel_path}」并从索引移除？`)) {
                        void run(async () => {
                          await deleteCorpusFile(corpusId, file.rel_path);
                        });
                      }
                    }}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                  </> : null}
                </>
              )}
            </li>
          ))}
          {!searchedRows.length ? <li className="text-[12px] text-[var(--stone)]">{needle ? "没有匹配的资料。" : "此筛选下没有文档。"}</li> : null}
        </ul>
        <div className="flex items-center justify-between text-xs">
          <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded border px-3 py-2 disabled:opacity-40">上一页</button>
          <span>第 {currentPage + 1} / {Math.max(1, Math.ceil(searchedRows.length / 40))} 页 · 每页 40 份</span>
          <button disabled={(currentPage + 1) * 40 >= searchedRows.length} onClick={() => setPage(currentPage + 1)} className="rounded border px-3 py-2 disabled:opacity-40">下一页</button>
        </div>
        {selectedDocs.length ? <LibraryChat key={selectedDocs.map((d) => d.doc_id + d.version).sort().join(",")}
          corpusId={corpusId} documents={selectedDocs} onBusy={setChatBusy} onClear={() => setSelectedIds([])} /> : null}
        {notice || result.error ? (
          <p role="alert" className="text-[12px] text-[var(--red)]">
            {notice || result.error?.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
