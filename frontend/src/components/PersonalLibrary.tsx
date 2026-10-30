import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePersonalLibrary, createPersonalLibrary, deletePersonalLibrary, fetchPersonalLibraries, fetchPersonalLibrary,
  removeFailedUpload, uploadPersonalFile, UPLOADS_PREFIX, type PersonalLibrary, type PersonalLibrarySummary, type PersonalRef } from "../api";
import { fundMetaFromPath } from "../fundMeta";
import { useLayout } from "../layout";
import { useApp } from "../store";
import { fetchDocuments, type DocumentInfo } from "../useDocuments";
import { SlideOver } from "./SlideOver";
import { Icon } from "./Icons";
import { Button } from "./ui";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
export const personalLibrariesQuery = () => ({ queryKey: ["personal-libraries"], queryFn: ({ signal }: { signal: AbortSignal }) => fetchPersonalLibraries(signal) });

/**
 * 加入个人资料库 (D-20261027-1): the documents ticked in a system library go into one of the account's
 * personal libraries, or a new one named here. Only references are kept; nothing is copied.
 */
/** Closes a popover on an outside click or Escape. */
function useDismiss(open: boolean, setOpen: (open: boolean) => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open, setOpen]);
  return box;
}

/** `up` opens the list above the button, for the selection bar at the foot of the page; `label` names a whole-library add. */
export function AddToPersonal({ refs, up = false, label, block = false }: { refs: PersonalRef[]; up?: boolean; label?: string; block?: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useLayout();
  const libraries = useQuery(personalLibrariesQuery());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useDismiss(open, setOpen);
  async function add(target: PersonalLibrarySummary | null) {
    setBusy(true); setError("");
    try {
      const library = target ? await changePersonalLibrary(target.id, { revision: target.revision, add: refs })
        : await createPersonalLibrary(name.trim(), refs);
      await queryClient.invalidateQueries({ queryKey: ["personal-libraries"] });
      showToast(`已加入个人资料库「${library.name}」，共 ${library.refs.length} 份`);
      setOpen(false); setName("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div ref={box} className="relative">
    <Button size={block ? "md" : "sm"} variant="outline" icon={block ? "book" : undefined} className={block ? "w-full justify-center" : ""} disabled={!refs.length} onClick={() => setOpen(!open)}>
      {label ?? `加入个人资料库${refs.length ? ` · ${refs.length} 份` : ""}`}</Button>
    {open ? <div role="dialog" aria-label="加入个人资料库" className={`absolute right-0 ${up ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+6px)]"} z-[60] w-[280px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-2 shadow-xl`}>
      <p className="px-2 py-1 text-caption text-[var(--steel)]">只保存引用，原文仍在系统资料库</p>
      <ul className="max-h-[220px] overflow-y-auto">
        {(libraries.data ?? []).map((library) => <li key={library.id}>
          <button type="button" disabled={busy} onClick={() => void add(library)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-[var(--surface)] disabled:opacity-50">
            <span className="min-w-0 flex-1 truncate">{library.name}</span><span className="shrink-0 text-caption text-[var(--stone)]">{library.count} 份</span>
          </button></li>)}
      </ul>
      <form className="mt-1 flex gap-1.5 border-t border-[var(--hairline)] px-1 pt-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void add(null); }}>
        <input aria-label="新个人资料库名称" placeholder="新建个人资料库" value={name} onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] px-2 py-1 text-body" />
        <Button type="submit" size="sm" variant="primary" disabled={busy || !name.trim()}>新建并加入</Button>
      </form>
      {error ? <p role="alert" className="px-2 pt-1 text-caption text-[var(--red)]">{error}</p> : null}
    </div> : null}
  </div>;
}

/**
 * 上传到我的资料库 (query 2026-1030 1117): a system library is the administrator's, so from its 资料管理 an
 * account sends its own files to one of its personal libraries, or a new one named here; they are parsed in
 * the background there (D-20261028-2). The file chooser opens on the click itself, before any request.
 */
export function UploadToPersonal({ primary = false }: { primary?: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useLayout();
  const libraries = useQuery(personalLibrariesQuery());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = useRef<PersonalLibrarySummary | string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useDismiss(open, setOpen);
  const choose = (into: PersonalLibrarySummary | string) => { target.current = into; setError(""); input.current?.click(); };
  async function upload(files: File[]) {
    const into = target.current;
    if (!into || !files.length) return;
    setBusy(true); setError("");
    try {
      const library = typeof into === "string" ? await createPersonalLibrary(into) : into;
      const failed: string[] = [];
      for (const file of files) {
        try { await uploadPersonalFile(library.id, file); } catch (e) { failed.push(`${file.name}：${(e as Error).message}`); }
      }
      await queryClient.invalidateQueries({ queryKey: ["personal-libraries"] });
      if (failed.length < files.length) showToast(`已上传 ${files.length - failed.length} 份到「${library.name}」，正在后台解析`);
      if (failed.length) setError(failed.join("；")); else { setOpen(false); setName(""); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div ref={box} className="relative">
    <Button variant={primary ? "primary" : "outline"} icon="upload" className="w-full justify-center" disabled={busy} onClick={() => setOpen(!open)}>{busy ? "正在上传…" : "上传到我的资料库 ▾"}</Button>
    <input ref={input} type="file" multiple accept={UPLOAD_ACCEPT} aria-label="选择要上传到我的资料库的文件" className="sr-only"
      onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void upload(files); }} />
    {open ? <div role="dialog" aria-label="上传到我的资料库" className="absolute left-0 top-[calc(100%+6px)] z-[60] w-[280px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-2 shadow-xl">
      <p className="px-2 py-1 text-caption text-[var(--steel)]">系统资料库由管理员维护。你的文件放进自己的资料库，后台解析后可与本库资料一起分析。</p>
      <ul className="max-h-[220px] overflow-y-auto">
        {(libraries.data ?? []).map((library) => <li key={library.id}>
          <button type="button" disabled={busy} onClick={() => choose(library)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-[var(--surface)] disabled:opacity-50">
            <span className="min-w-0 flex-1 truncate">{library.name}</span><span className="shrink-0 text-caption text-[var(--stone)]">{library.count} 份</span>
          </button></li>)}
      </ul>
      <form className="mt-1 flex gap-1.5 border-t border-[var(--hairline)] px-1 pt-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) choose(name.trim()); }}>
        <input aria-label="新个人资料库名称" placeholder="新建个人资料库" value={name} onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] px-2 py-1 text-body" />
        <Button type="submit" size="sm" variant="primary" disabled={busy || !name.trim()}>新建并上传</Button>
      </form>
      {error ? <p role="alert" className="px-2 pt-1 text-caption text-[var(--red)]">{error}</p> : null}
    </div> : null}
  </div>;
}

const UPLOAD_ACCEPT = ".pdf,.docx,.md,.markdown,.txt";
const fileName = (doc: DocumentInfo) => (doc.rel_path || doc.origin || "").split(/[\\/]/).pop() || doc.title;

/**
 * 添加资料 (D-20261028-2): pick documents from one system library or another of the account's personal
 * libraries, or take the whole of it, then tidy up on the page by unticking and removing what is not
 * wanted. Documents already in the library are shown but cannot be ticked again.
 */
function AddDocuments({ library, open, onClose, onAdded }: { library: PersonalLibrary; open: boolean; onClose: () => void;
  onAdded: (next: PersonalLibrary, added: number) => void }) {
  const { corpora } = useApp();
  const personal = useQuery({ ...personalLibrariesQuery(), enabled: open });
  const systems = corpora.filter((c) => !c.missing);
  const others = (personal.data ?? []).filter((item) => item.id !== library.id && item.count > 0);
  const [from, setFrom] = useState("");
  const source = from || (systems[0] ? `system:${systems[0].id}` : "");
  const [kind, id] = [source.slice(0, source.indexOf(":")), source.slice(source.indexOf(":") + 1)];
  const docs = useQuery({ queryKey: ["documents", id], queryFn: ({ signal }) => fetchDocuments(id, { signal }), enabled: open && kind === "system" && Boolean(id) });
  const refs = useQuery({ queryKey: ["personal-libraries", id], queryFn: ({ signal }) => fetchPersonalLibrary(id, signal), enabled: open && kind === "personal" });
  const items: { ref: PersonalRef; title: string; sub: string }[] = kind === "system"
    ? (docs.data ?? []).map((doc) => { const meta = fundMetaFromPath(doc.rel_path || ""); const title = fileName(doc);
      return { ref: { corpus_id: id, doc_id: doc.doc_id, title }, title: meta?.title || doc.title || title,
        sub: meta ? `${meta.yearFrom}–${meta.yearTo} · ${meta.projectNo} · ${meta.pi}` : title }; })
    : (refs.data?.refs ?? []).filter((ref) => !ref.library_missing).map((ref) => { const meta = fundMetaFromPath(ref.title);
      return { ref: { corpus_id: ref.corpus_id, doc_id: ref.doc_id, title: ref.title }, title: meta?.title || ref.title || ref.doc_id,
        sub: meta ? `${meta.yearFrom}–${meta.yearTo} · ${meta.projectNo} · ${meta.pi}` : ref.corpus_id.startsWith(UPLOADS_PREFIX) ? "上传的文件" : "" }; });
  const key = (ref: PersonalRef) => ref.corpus_id + "\u0000" + ref.doc_id;
  const have = new Set(library.refs.map(key));
  const [q, setQ] = useState("");
  const shown = items.filter((item) => !q.trim() || (item.title + item.sub).toLowerCase().includes(q.trim().toLowerCase()));
  const addable = shown.filter((item) => !have.has(key(item.ref)));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chosen = items.filter((item) => picked.has(key(item.ref)) && !have.has(key(item.ref)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setPicked(new Set()); setQ(""); }, [source]);
  useEffect(() => { if (!open) { setPicked(new Set()); setError(""); } }, [open]);
  const loading = kind === "system" ? docs.isLoading : refs.isLoading;
  const failed = kind === "system" ? docs.isError : refs.isError;
  async function add(list: typeof items) {
    if (!list.length) return;
    setBusy(true); setError("");
    try {
      const next = await changePersonalLibrary(library.id, { revision: library.revision, add: list.map((item) => item.ref) });
      onAdded(next, list.length);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const sourceName = kind === "system" ? short(systems.find((c) => c.id === id)?.name ?? "") : others.find((item) => item.id === id)?.name ?? "";
  const allIn = items.length > 0 && items.every((item) => have.has(key(item.ref)));
  return <SlideOver open={open} onClose={onClose} sizeKey="personal-add" eyebrow={`添加到「${library.name}」`} title="从资料库选择"
    meta="勾选需要的资料，或把整个资料库加进来后，在页面上移出不需要的。系统资料库的资料只保存引用。"
    footer={<div className="flex w-full flex-wrap items-center gap-2">
      {error ? <p role="alert" className="w-full text-caption text-[var(--red)]">{error}</p> : null}
      <Button variant="primary" disabled={busy || !chosen.length} onClick={() => void add(chosen)}>{chosen.length ? `加入所选 ${chosen.length} 份` : "加入所选"}</Button>
      <Button variant="outline" disabled={busy || loading || allIn || !items.length} onClick={() => void add(items.filter((item) => !have.has(key(item.ref))))}
        title={allIn ? "这个资料库的资料都已加入" : ""}>{allIn ? "已全部加入" : `加入「${sourceName}」全部 ${items.filter((item) => !have.has(key(item.ref))).length} 份`}</Button>
    </div>}>
    <div className="space-y-3">
      <label className="block text-caption text-[var(--steel)]">来源
        <select aria-label="来源资料库" value={source} onChange={(e) => setFrom(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-body text-[var(--ink)]">
          <optgroup label="系统资料库">{systems.map((c) => <option key={c.id} value={`system:${c.id}`}>{short(c.name)}</option>)}</optgroup>
          {others.length ? <optgroup label="我的其他个人资料库">{others.map((item) => <option key={item.id} value={`personal:${item.id}`}>{item.name}（{item.count} 份）</option>)}</optgroup> : null}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <input type="search" aria-label="筛选资料" placeholder="按标题、批准号或负责人筛选" value={q} onChange={(e) => setQ(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-body" />
        <label className="flex shrink-0 items-center gap-1.5 text-caption text-[var(--steel)]">
          <input type="checkbox" aria-label="全选筛选结果" disabled={!addable.length}
            checked={addable.length > 0 && addable.every((item) => picked.has(key(item.ref)))}
            onChange={(e) => setPicked((old) => { const next = new Set(old); addable.forEach((item) => e.target.checked ? next.add(key(item.ref)) : next.delete(key(item.ref))); return next; })} />
          全选{q.trim() ? "筛选结果" : ""}</label>
      </div>
      <p role="status" className="text-caption text-[var(--steel)]">{loading ? "正在读取资料…" : failed ? "" : `${shown.length} 份${q.trim() ? "符合筛选" : ""} · 已勾选 ${chosen.length} 份`}</p>
      {failed ? <p role="alert" className="text-body text-[var(--danger-fg)]">资料清单读取失败，请稍后重试。</p> : null}
      <ul className="space-y-0.5">{shown.map((item) => { const k = key(item.ref), already = have.has(k);
        return <li key={k}><label className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${already ? "opacity-60" : "cursor-pointer hover:bg-[var(--surface)]"}`}>
          <input type="checkbox" disabled={already} checked={already || picked.has(k)} aria-label={`选择 ${item.title}`}
            onChange={(e) => setPicked((old) => { const next = new Set(old); if (e.target.checked) next.add(k); else next.delete(k); return next; })} />
          <span className="min-w-0 flex-1"><span className="block truncate text-body text-[var(--ink)]">{item.title}</span>
            <span className="block truncate text-caption text-[var(--stone)]">{already ? "已在这个个人资料库中" : item.sub}</span></span>
        </label></li>; })}</ul>
      {!loading && !failed && !items.length ? <p className="text-body text-[var(--steel)]">这个资料库还没有资料。</p> : null}
    </div>
  </SlideOver>;
}

/** A file on its way to the server, or one the server refused (wrong kind, same name, too large). */
type Sending = { name: string; error?: string };

/**
 * One personal library: its documents grouped by where they come from — a system library, or the files
 * uploaded to this (or another of the account's) personal library. A reference opens
 * the document's preview. Each source is checked on its own (前端复审 P1-2, P1-3): while its document list
 * is read the page says so; a read that failed offers a retry and is never shown as a removed document;
 * only a list read in full, or a deleted system library, marks a reference as gone. 就此提问 uses the ticked
 * references (all usable ones at first), so one question can use part of the library without changing it,
 * within six system libraries as any question.
 */
export function PersonalLibraryPage() {
  const { libraryId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { corpora, corporaLoaded, startResearch, sessionBusy } = useApp();
  const { openPreview, showToast } = useLayout();
  const personal = useQuery(personalLibrariesQuery());
  // While uploads wait or parse, the library is read every two seconds; each finished file appears in it.
  const library = useQuery({ queryKey: ["personal-libraries", libraryId], queryFn: ({ signal }) => fetchPersonalLibrary(libraryId, signal),
    refetchInterval: (query) => query.state.data?.uploads?.some((item) => item.state !== "failed") ? 2000 : false });
  const data = library.data;
  // The account's own uploads come first, then each library the references come from.
  const corpusIds = [...(data?.corpus_ids ?? [])].sort((x, y) => Number(y === `${UPLOADS_PREFIX}${libraryId}`) - Number(x === `${UPLOADS_PREFIX}${libraryId}`));
  const gone = (id: string) => Boolean(data?.refs.some((ref) => ref.corpus_id === id && ref.library_missing))
    || (!id.startsWith(UPLOADS_PREFIX) && (Boolean(corpora.find((c) => c.id === id)?.missing) || (corporaLoaded && !corpora.some((c) => c.id === id))));
  const ownUploads = UPLOADS_PREFIX + libraryId;
  const documents = useQueries({ queries: corpusIds.map((id) => ({ queryKey: ["documents", id], queryFn: ({ signal }: { signal: AbortSignal }) => fetchDocuments(id, { signal }),
    enabled: !gone(id) })) });
  type Source = "checking" | "failed" | "gone" | "read";
  const source = new Map<string, { state: Source; docs: Map<string, DocumentInfo>; retry: () => void }>();
  corpusIds.forEach((id, i) => {
    const query = documents[i];
    const state: Source = gone(id) ? "gone" : query?.isError ? "failed" : query?.isSuccess ? "read" : "checking";
    source.set(id, { state, docs: new Map((query?.data ?? []).map((doc) => [doc.doc_id, doc])), retry: () => void query?.refetch() });
  });
  const key = (ref: PersonalRef) => ref.corpus_id + "\u0000" + ref.doc_id;
  const docOf = (ref: PersonalRef) => source.get(ref.corpus_id)?.docs.get(ref.doc_id);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState<Sending[]>([]);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("");
  const [menu, setMenu] = useState(false);
  const menuBox = useDismiss(menu, setMenu);
  const uploadedCount = data?.refs.filter((ref) => ref.corpus_id === ownUploads).length ?? 0;
  useEffect(() => { void queryClient.invalidateQueries({ queryKey: ["documents", ownUploads] }); }, [uploadedCount, ownUploads, queryClient]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  function settle(next: PersonalLibrary) {
    queryClient.setQueryData<PersonalLibrary>(["personal-libraries", libraryId], (old) => ({ ...next, uploads: next.uploads ?? old?.uploads }));
    void queryClient.invalidateQueries({ queryKey: ["personal-libraries"], exact: true });
  }
  // Files are sent one after another; the server queues them and parses one at a time.
  async function upload(files: File[]) {
    if (!files.length) return;
    setSending((old) => [...old.filter((item) => !item.error), ...files.map((file) => ({ name: file.name }))]);
    for (const file of files) {
      try {
        await uploadPersonalFile(libraryId, file);
        setSending((old) => old.filter((item) => item.name !== file.name || item.error));
      } catch (e) {
        setSending((old) => old.map((item) => item.name === file.name && !item.error ? { ...item, error: (e as Error).message } : item));
      }
      await library.refetch();
    }
  }
  async function dropFailed(name: string) {
    try { await removeFailedUpload(libraryId, name); await library.refetch(); } catch (e) { setError((e as Error).message); }
  }
  async function save(change: Parameters<typeof changePersonalLibrary>[1]) {
    setError("");
    try {
      settle(await changePersonalLibrary(libraryId, change));
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  }
  if (library.error) return <main className="p-8"><p role="alert" className="text-body text-[var(--red)]">{(library.error as Error).message}</p>
    <Link to="/library" className="text-body text-[var(--link)] hover:underline">← 全部资料库</Link></main>;
  if (!data) return <main className="p-8 text-body text-[var(--steel)]">正在读取个人资料库…</main>;
  const usable = data.refs.filter((ref) => docOf(ref));
  const chosen = usable.filter((ref) => !unticked.has(key(ref)));
  const checking = [...source.values()].some((item) => item.state === "checking");
  const failed = data.refs.filter((ref) => source.get(ref.corpus_id)?.state === "failed");
  const lostRef = (ref: PersonalRef) => { const state = source.get(ref.corpus_id)?.state; return state === "gone" || (state === "read" && !docOf(ref)); };
  const missing = data.refs.filter(lostRef).length;
  const chosenSources = new Set(chosen.map((ref) => ref.corpus_id));
  const askProblem = checking ? "正在核对资料，稍候即可提问" : !chosen.length ? "请勾选至少一份可用资料"
    : chosenSources.size > 6 ? `已勾选的资料来自 ${chosenSources.size} 个资料库，一次提问最多 6 个，请取消部分来源的勾选` : "";
  async function ask() {
    setError("");
    try {
      await startResearch([...chosenSources], chosen.map((ref) => ref.doc_id), "task1", "请概括这些资料的研究目标、方法与主要结论，并逐条给出出处。");
      navigate("/chat");
    } catch (e) { setError((e as Error).message); }
  }
  const dropped = data.refs.filter((ref) => docOf(ref) && unticked.has(key(ref)));
  const isUpload = (ref: PersonalRef) => ref.corpus_id === ownUploads;
  function remove(refs: PersonalRef[]) {
    const files = refs.filter(isUpload).length;
    if (files && !window.confirm(refs.length === 1 ? `移出「${refs[0].title}」？这是上传的文件，移出后文件一并删除。`
      : `移出 ${refs.length} 份资料？其中 ${files} 份是上传的文件，会一并删除；其余只移出引用。`)) return;
    void save({ revision: data!.revision, remove: refs }).then((ok) => {
      if (!ok) return;
      setUnticked((old) => { const next = new Set(old); refs.forEach((ref) => next.delete(key(ref))); return next; });
      showToast(`已移出 ${refs.length} 份资料`);
    });
  }
  const sourceTitle = (corpusId: string) => {
    if (corpusId === ownUploads) return "我上传的文件";
    if (corpusId.startsWith(UPLOADS_PREFIX)) {
      const other = personal.data?.find((item) => UPLOADS_PREFIX + item.id === corpusId);
      return other ? `上传到「${other.name}」的文件` : "已删除的个人资料库中的上传";
    }
    const corpus = corpora.find((c) => c.id === corpusId);
    return corpus ? short(corpus.name) : "已删除的系统资料库";
  };
  const tick = (ref: PersonalRef, on: boolean) => setUnticked((old) => { const next = new Set(old); if (on) next.delete(key(ref)); else next.add(key(ref)); return next; });
  // 前端审查 2026-1030 (版本 B, as 资料管理): sources with their counts on the left, reading on the right,
  // what to do with the ticked documents in the bar at the foot.
  const needle = q.trim().toLowerCase();
  const titleOf = (ref: PersonalRef) => { const doc = docOf(ref), meta = fundMetaFromPath(doc?.rel_path || ref.title);
    return { doc, meta, title: meta?.title || doc?.title || ref.title || ref.doc_id }; };
  const matches = (ref: PersonalRef) => { if (!needle) return true; const { meta, title } = titleOf(ref);
    return `${title} ${ref.title} ${meta ? `${meta.projectNo} ${meta.pi}` : ""}`.toLowerCase().includes(needle); };
  const shownSources = corpusIds.filter((id) => !only || id === only);
  const facet = (active: boolean) => `flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-body transition-colors duration-[var(--dur-quick)] ${active
    ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-pressed)]" : "text-[var(--text-2)] hover:bg-[var(--surface)]"}`;
  const railHead = "mb-1.5 px-2 text-caption font-semibold text-[var(--text-3)]";
  return <main className="min-h-0 flex-1 overflow-y-auto px-5 pt-7 pb-28 sm:px-8"
    onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
    onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
    onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); void upload([...e.dataTransfer.files]); }}>
    {dragging ? <div aria-hidden="true" className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--primary)] bg-[color-mix(in_srgb,var(--canvas)_85%,transparent)] text-emphasis font-semibold text-[var(--primary)]">
      松开即上传到「{data.name}」</div> : null}
    <AddDocuments library={data} open={adding} onClose={() => setAdding(false)}
      onAdded={(next, added) => { settle(next); setAdding(false); showToast(`已加入 ${added} 份资料`); }} />
    <input ref={fileInput} type="file" multiple accept={UPLOAD_ACCEPT} hidden aria-label="选择要上传的文件"
      onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; void upload(files); }} />
    <div className="mx-auto max-w-[var(--page-max)] space-y-5">
      <header className="space-y-2 border-b border-[var(--hairline)] pb-4">
        <Link to="/library" className="text-body text-[var(--link)] hover:underline">← 全部资料库</Link>
        <div className="flex flex-wrap items-center gap-3">
          {editing ? <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save({ revision: data.revision, name: name.trim() }).then((ok) => { if (ok) setEditing(false); }); }}>
            <input autoFocus aria-label="个人资料库名称" value={name} onChange={(e) => setName(e.target.value)} className="w-[260px] rounded-lg border border-[var(--hairline-strong)] px-2 py-1.5 text-emphasis font-semibold" />
            <Button type="submit" size="sm" variant="primary">保存</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
          </form> : <h1 className="text-page font-semibold">{data.name}</h1>}
          <span className="rounded-md bg-[var(--surface-cool)] px-2 py-0.5 text-caption text-[var(--muted-cool)]">个人资料库</span>
          <span className="text-body text-[var(--steel)]">{data.refs.length} 份资料{corpusIds.some((id) => !id.startsWith(UPLOADS_PREFIX))
            ? ` · 引用 ${corpusIds.filter((id) => !id.startsWith(UPLOADS_PREFIX)).length} 个系统资料库` : ""}{data.refs.some(isUpload) ? ` · 上传 ${data.refs.filter(isUpload).length} 份` : ""}</span>
          <span className="flex-1" />
          {/* Renaming and deleting are rare; they share one menu instead of a row of buttons. */}
          <div ref={menuBox} className="relative">
            <Button size="sm" variant="outline" onClick={() => setMenu(!menu)}>管理 ▾</Button>
            {menu ? <div role="menu" aria-label="管理个人资料库" className="absolute top-[calc(100%+6px)] right-0 z-[60] w-[200px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-1.5 shadow-xl">
              <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-1.5 text-left text-body hover:bg-[var(--surface)]"
                onClick={() => { setMenu(false); setName(data.name); setEditing(true); }}>重命名</button>
              <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-1.5 text-left text-body text-[var(--red)] hover:bg-[var(--surface)]" onClick={() => {
                setMenu(false);
                if (window.confirm(`删除个人资料库「${data.name}」？${data.refs.some(isUpload) ? "上传到这里的文件会一并删除；" : ""}系统资料库中的原文不受影响。`))
                  void deletePersonalLibrary(libraryId).then(() => queryClient.invalidateQueries({ queryKey: ["personal-libraries"] })).then(() => navigate("/library"), (e) => setError((e as Error).message));
              }}>删除个人资料库</button>
            </div> : null}
          </div>
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start">
        <aside aria-label="筛选资料" className="flex flex-col gap-5 lg:sticky lg:top-0">
          {corpusIds.length ? <div role="group" aria-label="来源">
            <h2 className={railHead}>来源</h2>
            <button type="button" aria-pressed={!only} className={facet(!only)} onClick={() => setOnly("")}>全部<span className="tabular-nums text-[var(--text-3)]">{data.refs.length}</span></button>
            {corpusIds.map((id) => <button key={id} type="button" aria-pressed={only === id} className={facet(only === id)} onClick={() => setOnly(only === id ? "" : id)}>
              <span className="min-w-0 truncate">{sourceTitle(id)}</span><span className="shrink-0 tabular-nums text-[var(--text-3)]">{data.refs.filter((ref) => ref.corpus_id === id).length}</span></button>)}
          </div> : null}
          <div className={corpusIds.length ? "border-t border-[var(--hairline)] pt-4" : ""}>
            <h2 className={railHead}>补充资料</h2>
            <div className="flex flex-wrap gap-2 px-1">
              <Button size="sm" variant="outline" icon="plus" iconSize={12} onClick={() => setAdding(true)}>添加资料</Button>
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>上传文件</Button>
            </div>
            <p className="mt-2 px-2 text-caption text-[var(--text-3)]">“添加资料”从系统资料库或其他个人资料库挑选；也可把 PDF、Word、Markdown、TXT 拖到页面上。</p>
          </div>
        </aside>
        <div className="min-w-0 space-y-3">
          {data.refs.length ? <label className="flex items-center gap-[6px] rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] py-[6px] text-[var(--stone)] focus-within:border-[var(--primary)]">
            <Icon name="search" size={12} />
            <input aria-label="搜索资料" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索项目名、批准号、负责人或文件名"
              className="font-app min-w-0 flex-1 border-0 bg-transparent text-body text-[var(--ink)] outline-none placeholder:text-[var(--stone)]" />
          </label> : null}
          {data.refs.length ? <p role="status" className="text-caption text-[var(--steel)]">
            {checking ? "正在核对资料…" : `可用 ${usable.length} 份 · 已勾选 ${chosen.length} 份`}
            {failed.length ? `；${failed.length} 份所在资料库读取失败，未包含在提问中` : ""}
            {missing > 0 ? `；${missing} 份原资料已不在系统资料库中` : ""}
            {askProblem && !checking ? `。${askProblem}` : ""}</p> : null}
          {sending.length || data.uploads?.length ? <ul aria-label="上传进度" className="space-y-1 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-2">
            {sending.map((item, i) => <li key={"s" + item.name + i} className="flex items-center gap-2 px-1 text-body">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.error ? <><span role="alert" className="shrink-0 text-caption text-[var(--danger-fg)]">{item.error}</span>
                <button type="button" onClick={() => setSending((old) => old.filter((other) => other !== item))} className="shrink-0 text-caption text-[var(--link)] hover:underline">知道了</button></>
                : <span role="status" className="shrink-0 text-caption text-[var(--steel)]">正在上传…</span>}
            </li>)}
            {(data.uploads ?? []).map((item) => <li key={"u" + item.name} className="flex items-center gap-2 px-1 text-body">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.state === "failed" ? <><span role="alert" className="min-w-0 truncate text-caption text-[var(--danger-fg)]" title={item.error}>解析失败：{item.error}</span>
                <button type="button" onClick={() => void dropFailed(item.name)} className="shrink-0 text-caption text-[var(--link)] hover:underline">删除</button></>
                : <span role="status" className="shrink-0 text-caption text-[var(--steel)]">{item.state === "parsing" ? "正在解析…（PDF 可能要几分钟，可以先离开）" : "排队等待解析"}</span>}
            </li>)}
          </ul> : null}
          {error ? <p role="alert" className="text-body text-[var(--red)]">{error}</p> : null}
          {!data.refs.length ? <p className="rounded-xl border border-dashed border-[var(--line-cool-strong)] px-4 py-6 text-body text-[var(--steel)]">
            还没有资料。点左侧“添加资料”从系统资料库或其他个人资料库挑选，点“上传文件”或把文件拖到这里加入自己的文件（PDF、Word、Markdown、TXT）。</p> : null}
          {shownSources.map((corpusId) => {
            const state = source.get(corpusId)!;
            const all = data.refs.filter((ref) => ref.corpus_id === corpusId);
            const refs = all.filter(matches);
            const title = sourceTitle(corpusId);
            if (needle && !refs.length) return null;
            return <section key={corpusId} aria-label={title} className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3">
              <div className="mb-2 flex items-center gap-2 px-1">
                <h2 className="text-body font-semibold text-[var(--steel)]">{title} · {needle ? `${refs.length} / ${all.length}` : all.length}</h2>
                {state.state === "checking" ? <span role="status" className="text-caption text-[var(--stone)]">正在核对…</span> : null}
                {state.state === "failed" ? <><span role="alert" className="text-caption text-[var(--danger-fg)]">资料清单读取失败，引用仍保留</span>
                  <button type="button" onClick={state.retry} className="text-caption text-[var(--link)] hover:underline">重试</button></> : null}
              </div>
              <ul className="space-y-1">{refs.map((ref) => {
                const { doc, meta, title: name } = titleOf(ref);
                const lost = lostRef(ref);
                return <li key={ref.doc_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface)]">
                  <input type="checkbox" aria-label={`本次提问使用 ${name}`} disabled={!doc}
                    checked={Boolean(doc) && !unticked.has(key(ref))} onChange={(e) => tick(ref, e.target.checked)} />
                  <button type="button" disabled={!doc} onClick={() => doc && openPreview(doc, null, corpusId)} className="min-w-0 flex-1 text-left disabled:cursor-default">
                    <span className="block truncate text-body font-medium text-[var(--ink)]">{name}</span>
                    <span className="block truncate text-caption text-[var(--stone)]">{lost ? (state.state === "gone" ? (corpusId.startsWith(UPLOADS_PREFIX) ? "所在个人资料库已删除" : "所在系统资料库已删除") : "原资料已不在所在资料库中")
                      : `${state.state === "failed" ? "暂时无法读取 · " : ""}${meta ? `${meta.yearFrom}–${meta.yearTo} · ${meta.projectNo} · ${meta.pi}` : doc?.title ?? (state.state === "failed" ? "" : "正在核对…")}`}</span>
                  </button>
                  {doc ? <button type="button" onClick={() => openPreview(doc, null, corpusId)} className="shrink-0 text-caption text-[var(--link)] hover:underline">预览 ›</button> : null}
                  <button type="button" aria-label={`移出 ${ref.title || ref.doc_id}`} onClick={() => remove([ref])}
                    className="shrink-0 text-caption text-[var(--steel)] hover:text-[var(--red)]">移出</button>
                </li>;
              })}</ul>
            </section>;
          })}
          {needle && !shownSources.some((id) => data.refs.some((ref) => ref.corpus_id === id && matches(ref))) ? <p className="text-body text-[var(--steel)]">没有匹配的资料。</p> : null}
        </div>
      </div>
    </div>
    {data.refs.length ? <div role="region" aria-label="已选资料" className="fixed bottom-6 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--hairline)] bg-[var(--canvas)] py-2 pr-2 pl-5 text-body shadow-[0_16px_40px_-16px_rgba(15,23,42,0.45)]">
      <span className="whitespace-nowrap text-[var(--slate)]">已勾选 <b className="text-[var(--ink)]">{chosen.length}</b> / {usable.length} 份</span>
      {dropped.length ? <button type="button" onClick={() => remove(dropped)} className="whitespace-nowrap text-body text-[var(--steel)] hover:text-[var(--red)]">移出未勾选的 {dropped.length} 份</button> : null}
      <Button variant="primary" className="rounded-full" disabled={Boolean(askProblem) || sessionBusy} title={askProblem} onClick={() => void ask()}>
        {failed.length || chosen.length < usable.length ? `用已勾选的 ${chosen.length} 份提问` : "就此提问"}</Button>
    </div> : null}
  </main>;
}
