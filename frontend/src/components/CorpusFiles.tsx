import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { droppedFiles } from "../folderUpload";
import { useAuth } from "../auth";
import { AddToPersonal } from "./PersonalLibrary";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { deleteCorpusFile, fetchCorpusFiles, renameCorpusFile, searchCorpus, uploadCorpusFile, type CorpusFile } from "../api";
import type { DocumentInfo } from "../useDocuments";
import { Icon } from "./Icons";
import { fundMetaFromPath } from "../fundMeta";
import { outputsQuery, projectQuery } from "../projects";
import { ProjectList } from "./ProjectList";
import { loadDocumentMarkdown } from "../documentText";
import { Button, Segmented } from "./ui";

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
  // A system library's files are the administrator's to add, rename and delete (D-20261027-1).
  const admin = useAuth().role === "admin";
  const showPath = admin;
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
  // What is ticked survives a reload in this tab (upgrade plan F2): a page refreshed mid-comparison
  // keeps its materials. Per viewer and per library; the page works the same without storage.
  const pickedKey = "dox-picked:" + corpusId;
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(pickedKey) ?? "[]"); return Array.isArray(saved) ? saved.filter((id) => typeof id === "string").slice(0, 20) : []; }
    catch { return []; }
  });
  useEffect(() => {
    try { if (selectedIds.length) sessionStorage.setItem(pickedKey, JSON.stringify(selectedIds)); else sessionStorage.removeItem(pickedKey); }
    catch { /* storage unavailable: the selection simply does not outlive the page */ }
  }, [pickedKey, selectedIds]);
  const [chatBusy, setChatBusy] = useState(false);
  // The workspace opens from a link (?workspace=1), and with &session= on the conversation 会话历史 reopened.
  const [chatOpen, setChatOpen] = useState(() => params.get("workspace") === "1");
  const workspaceTask = params.get("task") ?? "";
  // 按项目 is the default list (query 2026-1016 1814): a comparison is between projects, not files.
  const byFile = params.get("by") === "file";
  const projectsResult = useQuery({ ...projectQuery(corpusId), enabled: connected });
  const allProjects = projectsResult.data?.projects ?? [];
  // 前端审查 A1/A2: narrow the projects by start year, or to what still needs a look. The funding figures
  // leave out a project for one of three reasons, each its own filter (前端复审 P1-1): no approved amount,
  // an amount in conflict, or no start year.
  const year = params.get("year") ?? "";
  const lack = params.get("lack") ?? "";
  const outputs = useQuery({ ...outputsQuery(corpusId), enabled: connected && !byFile });
  const identified = allProjects.filter((p) => p.identity_status === "identified");
  const lacking = {
    funding: identified.filter((p) => !p.funding.some((m) => m.scope === "awarded" && m.amount_yuan !== null)),
    conflict: identified.filter((p) => p.funding_conflicts.includes("awarded")),
    year: identified.filter((p) => p.start_year === null),
    outputs: outputs.data ? identified.filter((p) => !outputs.data.projects[p.project_id]) : [],
  };
  const years = [...new Set(allProjects.flatMap((p) => p.start_year ? [p.start_year] : []))].sort((a, b) => b - a);
  const projects = (lack in lacking ? lacking[lack as keyof typeof lacking] : allProjects)
    .filter((p) => !year || String(p.start_year) === year);
  const pendingDocs = new Set(allProjects.filter((p) => p.identity_status === "pending").flatMap((p) => p.files.map((f) => f.document.doc_id)));
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
    queryFn: ({ signal }) => searchCorpus(corpusId, bodyQuery, signal), staleTime: 30000 });
  const excerpt = useQuery({ queryKey: ["library", corpusId, "excerpt", hovered?.doc_id, hovered?.version],
    enabled: !!hovered,
    queryFn: async ({ signal }) => (await loadDocumentMarkdown(hovered!, corpusId, signal)).text
      .replace(/^---[\s\S]*?\n---\s*/, "").replace(/[#*|]/g, "").trim().slice(0, 260), staleTime: 60000 });
  function toggleMany(ids: string[], on: boolean) {
    if (!on) { setSelectedIds((old) => old.filter((id) => !ids.includes(id))); return; }
    const next = [...new Set([...selectedIds, ...ids])];
    if (next.length > 20) { setNotice("一次最多选择 20 份资料，请先移除部分选择。"); return; }
    setNotice(""); setSelectedIds(next);
  }
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
    return { key: "file:" + file.rel_path, file, document, status: file.status };
  });
  for (const document of documents) {
    if (!represented.has(document.doc_id)) {
      // Keyed by document: a report's Markdown and PDF versions share a title (query 2026-1015 1553).
      rows.push({ key: "doc:" + document.doc_id, file: { rel_path: document.title, size: 0, status: "indexed", doc_id: document.doc_id }, document, status: "indexed" });
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
  // The projects actually listed: filters, then the body search or the name search (ProjectList applies the
  // same name rule), so the count above the list is the list's own (前端复审 P2-2).
  const listedProjects = (mode === "content" && needle ? projects.filter((p) => p.files.some((f) => matchIds.has(f.document.doc_id))) : projects)
    .filter((p) => mode === "content" || !needle || `${p.title} ${p.number} ${p.files.map((f) => f.document.title).join(" ")}`.toLowerCase().includes(needle));
  const searchedRows = mode === "content" && needle
    ? visibleRows.filter((row) => row.document && matchIds.has(row.document.doc_id)) : namedRows;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(searchedRows.length / 40) - 1));
  const pageRows = searchedRows.slice(currentPage * 40, (currentPage + 1) * 40);
  return (
    // Upload is a toolbar action and the whole panel takes a drop (前端审查 O2): reading comes first.
    <div className={`relative mt-[14px] rounded-[12px] border bg-[var(--canvas)] p-[14px] text-body ${dragging ? "border-[var(--primary)]" : "border-[var(--hairline)]"}`}
      onDragOver={(e) => { if (busy || !connected || !admin) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false);
        if (!busy && connected && admin) void droppedFiles(e.dataTransfer.items, e.dataTransfer.files).then(uploadFiles).catch((error) => setNotice(error.message));
      }}>
      {dragging ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[12px] border-2 border-dashed border-[var(--primary)] bg-[var(--primary-soft)]/90 text-body font-medium text-[var(--primary-pressed)]">松开即上传到本资料库</div> : null}
      <div className="flex flex-wrap items-center gap-[8px]">
        <h3 className="mr-auto font-medium text-[var(--charcoal)]">文档 · 已入库 {counts.indexed} / 源文件 {files.length} · 待处理 {counts.pending} / 失败 {counts.failed}</h3>
        {admin ? <>
        <span className="text-caption text-[var(--stone)]" title="支持 md / markdown / txt / pdf / docx 多选；每个文件独立上传并增量导入，失败项不会阻断后续文件。">可拖入文件或文件夹</span>
        <Button size="sm" variant="primary" icon="plus" iconSize={12} disabled={busy || !connected} onClick={() => inputRef.current?.click()}>上传文件</Button>
        <Button size="sm" variant="outline" disabled={busy || !connected} onClick={() => folderRef.current?.click()}>上传文件夹</Button>
        <input ref={folderRef} type="file" aria-label="上传文件夹" multiple {...{ webkitdirectory: "" }} className="sr-only"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = "";
            void uploadFiles(files.map((file) => ({ file, path: file.webkitRelativePath || file.name }))); }} />
        <input ref={inputRef} type="file" aria-label="上传源文件" multiple accept=".md,.markdown,.txt,.pdf,.docx" disabled={busy || !connected} className="sr-only"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (selected.length) void uploadFiles(selected.map((file) => ({ file, path: file.name })));
          }} />
        </> : null}
      </div>
      <div className="mt-[10px] space-y-[10px]">
        {listing?.misplaced_files.length ? <p role="status" className="rounded-[8px] bg-[var(--warn-bg)] px-[10px] py-[8px] text-caption text-[var(--warn-fg)]">
          在资料库根目录发现未放入资料目录的文件：{listing.misplaced_files.join("、")}。请移入下方 source/ 目录后刷新；系统不会自动移动文件。
        </p> : null}
        {showPath && listing?.source_dir ? <details className="break-all text-caption text-[var(--stone)]"><summary className="cursor-pointer">查看本地资料目录</summary><p>
          本地资料目录：<code>{listing.source_dir}</code>
          <button type="button" className="ml-[7px] text-[var(--link)] hover:underline" onClick={() => void navigator.clipboard?.writeText(listing.source_dir)}>复制路径</button>
        </p></details> : null}
        {busy ? <button type="button" className="text-caption text-[var(--red)] hover:underline" onClick={() => { stopAfterCurrent.current = true; }}>停止后续未上传文件</button> : null}
        {uploads.length ? <ul aria-label="本次添加进度" className="space-y-[3px] rounded-[8px] bg-[var(--surface-soft)] p-[8px] text-caption">
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
              placeholder={mode === "content" ? "输入正文主题（至少两个字）" : "搜索项目名、批准号、负责人或文件名"}
              className="font-app w-full border-0 bg-transparent text-caption text-[var(--ink)] outline-none placeholder:text-[var(--stone)]"
            />
          </label>
          {(["all", "pending", "indexed", "failed"] as const).map((key) => <button key={key} type="button" onClick={() => updateFilter("status", key)} className={`rounded-full px-[9px] py-[4px] text-caption ${filter === key ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"}`}>
            {{ all: "全部", pending: "待处理", indexed: "已入库", failed: "失败" }[key]} {counts[key]}
          </button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="列表方式" value={byFile ? "file" : "project"} onChange={(key) => updateFilter("by", key === "file" ? "file" : "")}
            options={[["project", "按项目"], ["file", "按文件"]]} />
          <Segmented label="搜索方式" value={mode} onChange={setMode} options={[["name", "按名称"], ["content", "按正文"]]} />
          {!byFile ? <>
            <select aria-label="立项年" value={year} onChange={(e) => updateFilter("year", e.target.value)} className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-caption">
              <option value="">全部年份</option>{years.map((y) => <option key={y} value={y}>{y} 年立项</option>)}
            </select>
            <select aria-label="缺失信息" value={lack} onChange={(e) => updateFilter("lack", e.target.value)} className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-caption">
              <option value="">全部项目</option>
              <option value="funding">未记录批准资助金额 · {lacking.funding.length}</option>
              <option value="conflict">批准资助金额待核对 · {lacking.conflict.length}</option>
              <option value="year">立项年待核对 · {lacking.year.length}</option>
              <option value="outputs">未列成果 · {outputs.data ? lacking.outputs.length : "…"}</option>
            </select>
          </> : null}
          <span className="text-caption text-[var(--steel)]">{byFile ? `${searchedRows.length} 份` : listedProjects.length === allProjects.length ? `${allProjects.length} 个项目` : `找到 ${listedProjects.length} 个项目 / 共 ${allProjects.length} 个`} · 已选 {selectedDocs.length} 份{mode === "content" ? "（正文检索最多返回100份相关资料）" : ""}</span>
          {selectedDocs.length ? <button type="button" onClick={() => setSelectedIds([])} className="text-caption text-[var(--link)]">清空选择</button> : null}
          {selectedDocs.length ? <AddToPersonal refs={selectedDocs.map((d) => ({ corpus_id: corpusId, doc_id: d.doc_id, title: (d.rel_path || d.origin || "").split(/[\\/]/).pop() || d.title }))} /> : null}
          {needle && searchedRows.some((row) => row.document && row.status === "indexed") ? <button type="button" className="text-caption text-[var(--link)]"
            onClick={() => setSelectedIds([...new Set([...selectedIds, ...searchedRows.flatMap((row) => row.document && row.status === "indexed" ? [row.document.doc_id] : [])])].slice(0, 20))}>
            勾选搜索结果（最多 20 份）</button> : null}
          <span className="flex-1" />
          {!chatOpen ? <button type="button" onClick={() => setChatOpen(true)}
            className="rounded-lg border border-[var(--primary)] px-3 py-1.5 text-caption font-medium text-[var(--primary)] hover:bg-[var(--primary-soft)]">分析工作区{selectedDocs.length ? ` · ${selectedDocs.length} 份` : ""}</button> : null}
          {matches.isFetching && mode === "content" ? <span role="status">正在检索正文…</span> : null}
          {mode === "content" && matches.error ? <span role="alert">{matches.error.message}</span> : null}
        </div>
        {!byFile ? <ProjectList projects={listedProjects}
          files={files} selectedIds={selectedIds} onToggle={toggleMany} onPreview={onPreview} busy={busy}
          query={mode === "content" ? "" : search} filtered={Boolean(year || lack)}
          onDelete={admin ? (rel) => { if (window.confirm(`删除源文件「${rel}」并从索引移除？`)) void run(async () => { await deleteCorpusFile(corpusId, rel); }); } : undefined} /> : <>
        <ul aria-label="资料列表" className="max-h-[560px] space-y-1 overflow-y-auto rounded-xl border border-[var(--hairline)] p-1">
          {pageRows.map(({ key, file, document, status }) => (
            <li key={key} onMouseEnter={() => setHovered(document ?? null)} onMouseLeave={() => setHovered(null)}
              className={`group relative flex min-h-[58px] flex-wrap items-center gap-3 rounded-lg border border-l-4 px-3 py-2 text-caption transition-[background-color,border-color] duration-150 ${document && selectedIds.includes(document.doc_id) ? "border-[var(--primary)] border-l-[var(--primary)] bg-[var(--primary-soft)]" : "border-transparent hover:border-[var(--hairline)] hover:bg-[var(--surface)]"}`}>
              <input type="checkbox" aria-label={`选择 ${file.rel_path}`} disabled={!document || status !== "indexed"}
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
                    className="font-app min-w-0 flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[5px] text-caption outline-none focus:border-[var(--primary)]"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                  <Button type="submit" size="sm">保存</Button>
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
                      <span className="block truncate text-body font-medium text-[var(--ink)]">{meta?.title || file.rel_path.split("/").at(-1)}</span>
                      <span className="block truncate text-caption text-[var(--stone)]">
                        {meta ? `${meta.yearFrom}–${meta.yearTo} · ${meta.projectNo} · ${meta.pi}` : file.rel_path.split(".").at(-1)?.toUpperCase()}
                        {folder ? ` · ${folder}` : ""}</span>
                    </span>;
                  })()}
                  <span className="shrink-0 text-[var(--stone)]">
                    {status === "error" ? "已保存，未入库 · 解析失败" : STATUS_LABEL[status] ?? status}
                  </span>
                  {file.reason ? <span className="max-w-[220px] truncate text-[var(--red)]" title={file.reason}>{file.reason}</span> : null}
                  {file.duplicate_of ? <span className="shrink-0 rounded bg-[var(--danger-bg)] px-1.5 py-0.5 text-caption text-[var(--danger-fg)]" title={file.duplicate_of}>与 {file.duplicate_of.split("/").at(-1)} 内容相同</span> : null}
                  {document && pendingDocs.has(document.doc_id) ? <span className="shrink-0 rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-caption text-[var(--warn-fg)]">项目待核对</span> : null}
                  {status === "indexed" && document && onPreview ? <button type="button" className="shrink-0 text-[var(--link)] hover:underline" onClick={() => onPreview(document)}>预览</button> : null}
                  {status === "error" && admin ? (
                    <Button size="sm" disabled={busy || !connected} onClick={() => void run(onRetryImport)}>重试本库待处理项</Button>
                  ) : null}
                  {admin ? <>
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
          {!searchedRows.length ? <li className="text-caption text-[var(--stone)]">{needle ? "没有匹配的资料。" : "此筛选下没有文档。"}</li> : null}
        </ul>
        <div className="flex items-center justify-between text-caption">
          <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded border px-3 py-2 disabled:opacity-40">上一页</button>
          <span>第 {currentPage + 1} / {Math.max(1, Math.ceil(searchedRows.length / 40))} 页 · 每页 40 份</span>
          <button disabled={(currentPage + 1) * 40 >= searchedRows.length} onClick={() => setPage(currentPage + 1)} className="rounded border px-3 py-2 disabled:opacity-40">下一页</button>
        </div>
        </>}
        {chatOpen ? <AnalysisWorkspace corpusId={corpusId} corpusName={corpusName} documents={selectedDocs} onBusy={setChatBusy} projects={projects} task={workspaceTask}
          sessionId={params.get("session") ?? undefined} onRestore={(ids) => setSelectedIds(ids.slice(0, 20))}
          onRemove={(ids) => setSelectedIds((old) => old.filter((item) => !ids.includes(item)))} onClear={() => setSelectedIds([])} onClose={() => setChatOpen(false)} />
          // Ticking files offers the conversation without opening it over the list.
          : selectedDocs.length ? <div role="region" aria-label="已选资料" className="fixed bottom-6 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--hairline)] bg-[var(--canvas)] py-2 pr-2 pl-5 text-body shadow-[0_16px_40px_-16px_rgba(15,23,42,0.45)]">
            <span className="whitespace-nowrap text-[var(--slate)]">已选 <b className="text-[var(--ink)]">{selectedDocs.length}</b> 份资料</span>
            <button type="button" onClick={() => setSelectedIds([])} className="whitespace-nowrap text-body text-[var(--steel)] hover:text-[var(--ink)]">清空</button>
            <button type="button" onClick={() => setChatOpen(true)} className="whitespace-nowrap rounded-full bg-[var(--primary)] px-4 py-1.5 font-medium text-white hover:bg-[var(--primary-pressed)]">分析这些资料</button>
          </div> : null}
        {notice || result.error ? (
          <p role="alert" className="text-caption text-[var(--red)]">
            {notice || result.error?.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
