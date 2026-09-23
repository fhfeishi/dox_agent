import { useEffect, useRef, useState } from "react";
import { deleteCorpusFile, fetchCorpusFiles, renameCorpusFile, uploadCorpusFile, type CorpusFile, type CorpusFileListing } from "../api";
import type { DocumentInfo } from "../useDocuments";
import { Icon } from "./Icons";

const STATUS_LABEL: Record<string, string> = {
  new: "待导入",
  indexed: "已入库",
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
  type UploadItem = { file: File; state: UploadState; detail?: string };
  const [files, setFiles] = useState<CorpusFile[]>([]);
  const [listing, setListing] = useState<CorpusFileListing | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ rel: string; name: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "indexed" | "failed">("all");
  const [search, setSearch] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const stopAfterCurrent = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function load() {
    try {
      const result = await fetchCorpusFiles(corpusId);
      setListing(result);
      setFiles(result.files);
      setNotice("");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [corpusId]);
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
  async function uploadFiles(selected: File[]) {
    setBusy(true);
    setNotice("");
    const failures: string[] = [];
    stopAfterCurrent.current = false;
    setUploads(selected.map((file) => ({ file, state: "waiting" })));
    try {
      for (const [index, file] of selected.entries()) {
        if (stopAfterCurrent.current) {
          setUploads((current) => current.map((item, i) => i >= index ? { ...item, state: "stopped" } : item));
          break;
        }
        setUploads((current) => current.map((item, i) => i === index ? { ...item, state: "uploading" } : item));
        try {
          const result = await uploadCorpusFile(corpusId, file);
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
    return { file, document, status: document ? "indexed" : file.status };
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
  const searchedRows = needle
    ? visibleRows.filter((row) => `${row.file.rel_path} ${row.document?.title ?? ""}`.toLowerCase().includes(needle))
    : visibleRows;
  return (
    <div className="mt-[14px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[14px] text-[13px]">
      <h3 className="font-medium text-[var(--charcoal)]">文档 · 已入库 {counts.indexed} / 源文件 {files.length} · 待处理 {counts.pending} / 失败 {counts.failed}</h3>
      <div className="mt-[10px] space-y-[10px]">
        {listing?.misplaced_files.length ? <p role="status" className="rounded-[8px] bg-[#fff7e6] px-[10px] py-[8px] text-[11.5px] text-[#805900]">
          在知识库根目录发现未放入资料目录的文件：{listing.misplaced_files.join("、")}。请移入下方 source/ 目录后刷新；系统不会自动移动文件。
        </p> : null}
        {listing?.source_dir ? <p className="break-all text-[11.5px] text-[var(--stone)]">
          本地资料目录：<code>{listing.source_dir}</code>
          <button type="button" className="ml-[7px] text-[var(--link)] hover:underline" onClick={() => void navigator.clipboard?.writeText(listing.source_dir)}>复制路径</button>
        </p> : null}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const selected = Array.from(e.dataTransfer.files);
            if (!busy && connected && selected.length) void uploadFiles(selected);
          }}
        >
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
            <span className="text-[11.5px] text-[var(--stone)]">或将文件拖放到此处</span>
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
                if (selected.length) void uploadFiles(selected);
              }}
            />
          </div>
          <p className="mt-[6px] text-[11.5px] text-[var(--stone)]">
            支持 md / markdown / txt / pdf / docx 多选；每个文件独立上传并增量导入，失败项不会阻断后续文件。
          </p>
          {busy ? <button type="button" className="mt-[6px] text-[11.5px] text-[var(--red)] hover:underline" onClick={() => { stopAfterCurrent.current = true; }}>停止后续未上传文件</button> : null}
        </div>
        {uploads.length ? <ul aria-label="本次添加进度" className="space-y-[3px] rounded-[8px] bg-[var(--surface-soft)] p-[8px] text-[11.5px]">
          {uploads.map((item) => <li key={`${item.file.name}:${item.file.size}:${item.file.lastModified}`} className="flex gap-[8px]">
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="按文件名搜索"
              className="font-app w-full border-0 bg-transparent text-[11.5px] text-[var(--ink)] outline-none placeholder:text-[var(--stone)]"
            />
          </label>
          {(["all", "pending", "indexed", "failed"] as const).map((key) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full px-[9px] py-[4px] text-[11px] ${filter === key ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"}`}>
            {{ all: "全部", pending: "待处理", indexed: "已入库", failed: "失败" }[key]} {counts[key]}
          </button>)}
        </div>
        <ul className="space-y-[3px]">
          {searchedRows.map(({ file, document, status }) => (
            <li key={file.rel_path} className="flex items-center gap-[8px] text-[12px]">
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
                  <span className="min-w-0 flex-1 truncate text-[var(--charcoal)]" title={file.rel_path}>
                    {file.rel_path}
                  </span>
                  <span className="shrink-0 text-[var(--stone)]">
                    {status === "error" ? "已保存，未入库 · 解析失败" : STATUS_LABEL[status] ?? status}
                  </span>
                  {document && onPreview ? <button type="button" className="shrink-0 text-[var(--link)] hover:underline" onClick={() => onPreview(document)}>预览</button> : null}
                  {status === "error" ? (
                    <button
                      type="button"
                      disabled={busy || !connected}
                      className="shrink-0 rounded-[5px] border border-[var(--hairline-strong)] px-[7px] py-[3px] text-[11px] text-[var(--link)] disabled:opacity-50"
                      onClick={() => void run(onRetryImport)}
                    >
                      重试本库待处理项
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`重命名 ${file.rel_path}`}
                    disabled={busy}
                    className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-[var(--steel)] hover:bg-[var(--surface)]"
                    onClick={() => setEditing({ rel: file.rel_path, name: file.rel_path })}
                  >
                    <Icon name="edit" size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除 ${file.rel_path}`}
                    disabled={busy}
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
                </>
              )}
            </li>
          ))}
          {!searchedRows.length ? <li className="text-[12px] text-[var(--stone)]">{needle ? "没有匹配的资料。" : "此筛选下没有文档。"}</li> : null}
        </ul>
        {notice ? (
          <p role="alert" className="text-[12px] text-[var(--red)]">
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
