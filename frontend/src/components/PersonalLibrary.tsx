import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePersonalLibrary, createPersonalLibrary, deletePersonalLibrary, fetchPersonalLibraries, fetchPersonalLibrary,
  type PersonalLibrarySummary, type PersonalRef } from "../api";
import { fundMetaFromPath } from "../fundMeta";
import { useLayout } from "../layout";
import { useApp } from "../store";
import { fetchDocuments, type DocumentInfo } from "../useDocuments";
import { Button } from "./ui";

const short = (name: string) => name.replace(/^自然科学基金-/, "");
export const personalLibrariesQuery = () => ({ queryKey: ["personal-libraries"], queryFn: ({ signal }: { signal: AbortSignal }) => fetchPersonalLibraries(signal) });

/**
 * 加入个人资料库 (D-20261027-1): the documents ticked in a system library go into one of the account's
 * personal libraries, or a new one named here. Only references are kept; nothing is copied.
 */
export function AddToPersonal({ refs }: { refs: PersonalRef[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useLayout();
  const libraries = useQuery(personalLibrariesQuery());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
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
    <Button size="sm" variant="outline" disabled={!refs.length} onClick={() => setOpen(!open)}>加入个人资料库{refs.length ? ` · ${refs.length} 份` : ""}</Button>
    {open ? <div role="dialog" aria-label="加入个人资料库" className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[280px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-2 shadow-xl">
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
 * One personal library: its references grouped by the system library they come from. A reference opens
 * the document's preview; one whose document or library is gone says so and can be removed. 就此提问
 * starts a conversation limited to these documents (up to six system libraries, as any question).
 */
export function PersonalLibraryPage() {
  const { libraryId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { corpora, startResearch, sessionBusy } = useApp();
  const { openPreview } = useLayout();
  const library = useQuery({ queryKey: ["personal-libraries", libraryId], queryFn: ({ signal }) => fetchPersonalLibrary(libraryId, signal) });
  const corpusIds = library.data?.corpus_ids ?? [];
  const documents = useQueries({ queries: corpusIds.map((id) => ({ queryKey: ["documents", id], queryFn: ({ signal }: { signal: AbortSignal }) => fetchDocuments(id, { signal }),
    enabled: !corpora.find((c) => c.id === id)?.missing })) });
  const docs = new Map<string, DocumentInfo>();
  documents.forEach((query) => query.data?.forEach((doc) => docs.set(doc.doc_id, doc)));
  const loadedDocs = documents.every((query) => !query.isPending);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const data = library.data;
  async function save(change: Parameters<typeof changePersonalLibrary>[1]) {
    setError("");
    try {
      const next = await changePersonalLibrary(libraryId, change);
      queryClient.setQueryData(["personal-libraries", libraryId], next);
      await queryClient.invalidateQueries({ queryKey: ["personal-libraries"], exact: true });
    } catch (e) { setError((e as Error).message); }
  }
  async function ask() {
    if (!data) return;
    setError("");
    try {
      const present = data.refs.filter((ref) => docs.has(ref.doc_id));
      await startResearch([...new Set(present.map((ref) => ref.corpus_id))], present.map((ref) => ref.doc_id), "task1",
        "请概括这些资料的研究目标、方法与主要结论，并逐条给出出处。");
      navigate("/chat");
    } catch (e) { setError((e as Error).message); }
  }
  if (library.error) return <main className="p-8"><p role="alert" className="text-body text-[var(--red)]">{(library.error as Error).message}</p>
    <Link to="/library" className="text-body text-[var(--link)] hover:underline">← 全部资料库</Link></main>;
  if (!data) return <main className="p-8 text-body text-[var(--steel)]">正在读取个人资料库…</main>;
  const usable = data.refs.filter((ref) => docs.has(ref.doc_id));
  const askProblem = !usable.length ? "还没有可用的资料" : corpusIds.length > 6 ? "一次提问最多涉及 6 个系统资料库，请移除部分来源" : "";
  return <main className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8">
    <div className="mx-auto max-w-[var(--page-max)] space-y-5">
      <header className="space-y-2">
        <Link to="/library" className="text-body text-[var(--link)] hover:underline">← 全部资料库</Link>
        <div className="flex flex-wrap items-center gap-3">
          {editing ? <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save({ revision: data.revision, name: name.trim() }).then(() => setEditing(false)); }}>
            <input autoFocus aria-label="个人资料库名称" value={name} onChange={(e) => setName(e.target.value)} className="w-[260px] rounded-lg border border-[var(--hairline-strong)] px-2 py-1.5 text-emphasis font-semibold" />
            <Button type="submit" size="sm" variant="primary">保存</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
          </form> : <h1 className="text-page font-semibold">{data.name}</h1>}
          <span className="rounded-md bg-[var(--surface-cool)] px-2 py-0.5 text-caption text-[var(--muted-cool)]">个人资料库</span>
          <span className="text-body text-[var(--steel)]">{data.refs.length} 份资料 · 来自 {corpusIds.length} 个系统资料库</span>
          <span className="flex-1" />
          <Button variant="primary" disabled={Boolean(askProblem) || sessionBusy} title={askProblem} onClick={() => void ask()}>就此提问</Button>
          {!editing ? <Button variant="outline" onClick={() => { setName(data.name); setEditing(true); }}>重命名</Button> : null}
          <Button variant="outline" onClick={() => {
            if (window.confirm(`删除个人资料库「${data.name}」？只删除这份清单，系统资料库中的原文不受影响。`))
              void deletePersonalLibrary(libraryId).then(() => queryClient.invalidateQueries({ queryKey: ["personal-libraries"] })).then(() => navigate("/library"), (e) => setError((e as Error).message));
          }}>删除</Button>
        </div>
        {askProblem && data.refs.length ? <p className="text-caption text-[var(--steel)]">{askProblem}</p> : null}
        {error ? <p role="alert" className="text-body text-[var(--red)]">{error}</p> : null}
      </header>
      {!data.refs.length ? <p className="rounded-xl border border-dashed border-[var(--line-cool-strong)] px-4 py-6 text-body text-[var(--steel)]">
        还没有资料。打开一个<Link to="/library" className="text-[var(--link)] hover:underline">系统资料库</Link>，勾选项目后点“加入个人资料库”。</p> : null}
      {corpusIds.map((corpusId) => {
        const corpus = corpora.find((c) => c.id === corpusId);
        const refs = data.refs.filter((ref) => ref.corpus_id === corpusId);
        return <section key={corpusId} aria-label={corpus ? short(corpus.name) : "已删除的系统资料库"} className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3">
          <h2 className="mb-2 px-1 text-body font-semibold text-[var(--steel)]">{corpus ? short(corpus.name) : "已删除的系统资料库"} · {refs.length}</h2>
          <ul className="space-y-1">{refs.map((ref) => {
            const doc = docs.get(ref.doc_id), meta = fundMetaFromPath(doc?.rel_path || ref.title);
            const gone = ref.library_missing || (loadedDocs && !doc);
            return <li key={ref.doc_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface)]">
              <button type="button" disabled={!doc} onClick={() => doc && openPreview(doc, null, corpusId)} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <span className="block truncate text-body font-medium text-[var(--ink)]">{meta?.title || doc?.title || ref.title || ref.doc_id}</span>
                <span className="block truncate text-caption text-[var(--stone)]">{gone ? "原资料已不在系统资料库中" : meta ? `${meta.yearFrom}–${meta.yearTo} · ${meta.projectNo} · ${meta.pi}` : doc?.title}</span>
              </button>
              {doc ? <button type="button" onClick={() => openPreview(doc, null, corpusId)} className="shrink-0 text-caption text-[var(--link)] hover:underline">预览 ›</button> : null}
              <button type="button" aria-label={`移出 ${ref.title || ref.doc_id}`} onClick={() => void save({ revision: data.revision, remove: [ref] })}
                className="shrink-0 text-caption text-[var(--steel)] hover:text-[var(--red)]">移出</button>
            </li>;
          })}</ul>
        </section>;
      })}
    </div>
  </main>;
}
