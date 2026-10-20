import { useAuth } from "../auth";
import { useNavigate, useSearchParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import { deleteCorpus, reassociateCorpus, renameCorpus, setCorpusDescription, type CorpusInfo } from "../api";
import { changeGroups, useGroups } from "./LibraryHome";
import { useApp } from "../store";
import { useDocuments } from "../useDocuments";
import { CorpusFiles } from "./CorpusFiles";
import { TargetReports } from "./TargetReports";
import { TopicAdmin } from "./TopicManager";
import { ProjectOverview } from "./ProjectOverview";
import { Button, Pill } from "./ui";

const KIND_LABEL: Record<string, string> = { fund: "基金报告库", demo: "演示库", unknown: "资料库" };
type View = "target" | "timeline" | "relations" | "files";
// 资料文件 first and opened by default (query 2026-1014 1642); 技术研判 was 四维浏览.
// 年度分布 is a view of its own again beside the others (query 2026-1015 1714).
// “资料文件” was renamed 资料管理 (query 2026-1019 1458).
const VIEWS: [View, string][] = [["files", "资料管理"], ["target", "技术研判"], ["timeline", "年度分布"], ["relations", "项目关系"]];

/** Corpus main-area view: 资料管理（增删改查）与技术研判、年度分布、项目关系。 */
export function CorpusDetail({ corpusId, onClose }: { corpusId: string; onClose: () => void }) {
  const {
    corpora,
    corpusIds,
    refreshCorpora,
    runCorpusIngest,
    ingestBusy,
    connected,
    corpusView,
    setCorpusView,
    openCorpus,
    openPreview,
  } = useApp();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const admin = useAuth().role === "admin";
  const corpus = corpora.find((c) => c.id === corpusId) ?? null;
  const { documents, error, refresh } = useDocuments(connected, corpusId);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(corpus?.name ?? "");
  const [directory, setDirectory] = useState("");
  const [description, setDescription] = useState(corpus?.description ?? "");
  const [editingDescription, setEditingDescription] = useState(false);

  useEffect(() => {
    setName(corpus?.name ?? "");
  }, [corpus?.name]);

  useEffect(() => {
    setDescription(corpus?.description ?? "");
  }, [corpus?.description]);

  if (!corpus) return <p role="status" className="p-6">资料库正在读取或已不可用。<button onClick={onClose}>返回资料库列表</button></p>;
  const projectView = search.get("projectView") ?? "";
  const view: View = corpusView === "files" ? "files" : projectView === "timeline" || projectView === "relations" ? projectView : "target";
  const showView = (key: View) => {
    if (key === "files") { setCorpusView("files"); return; }
    void navigate(`/library/${encodeURIComponent(corpus.id)}/targets/four-facets${key === "target" ? "" : `?projectView=${key}`}`);
  };
  const isActive = corpusIds.includes(corpus.id);
  const status =
    corpus.missing
      ? { label: "目录缺失", tone: "rose" as const }
      : corpus.job?.status === "running"
      ? { label: "导入中", tone: "yellow" as const }
      : corpus.preparation === "ready"
        ? { label: "就绪", tone: "mint" as const }
        : corpus.preparation === "error"
          ? { label: "加载失败", tone: "rose" as const }
        : { label: "空库", tone: "yellow" as const };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setNotice("");
      refreshCorpora();
      refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`资料库 ${corpus.name}`} className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      {/* query 2026-1013 1522: the library list stays beside; everything about this library is here. */}
      <header className="shrink-0 border-b border-[var(--hairline)] px-5 pt-[14px] pb-[10px] sm:px-8">
        <div className="flex flex-wrap items-center gap-[10px]">
          {editing ? <form className="flex items-center gap-[6px]" onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void run(async () => { await renameCorpus(corpus.id, name.trim()); setEditing(false); });
          }}>
            <input autoFocus aria-label="资料库名称" value={name} onChange={(e) => setName(e.target.value)}
              className="font-app w-[260px] rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[5px] text-[15px] font-semibold outline-none focus:border-[var(--primary)]" />
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>保存</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(corpus.name); }}>取消</Button>
          </form> : <>
            {/* query 2026-1013 2012: back to the cards, or straight to another library, without a side list. */}
            <button type="button" onClick={onClose} className="text-[13px] text-[var(--link)] hover:underline">← 全部资料库</button>
            <span className="text-[var(--stone)]">/</span>
            <h1 className="sr-only">{corpus.name}</h1>
            <select aria-label="切换资料库" value={corpus.id} onChange={(e) => openCorpus(e.target.value, corpusView)}
              className="max-w-full sm:max-w-[360px] cursor-pointer rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2 text-[16px] font-semibold text-[var(--primary-pressed)] shadow-sm transition-colors hover:bg-[var(--primary-soft-2)] focus:outline-2 focus:outline-[var(--primary)]">
              {corpora.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>}
          <Pill tone={status.tone}>{status.label}</Pill>
          <span className="text-[12px] text-[var(--stone)]">{KIND_LABEL[corpus.kind] ?? corpus.kind} · {corpus.docs_count} 份</span>
          {isActive ? <Pill tone="lav">当前对话使用</Pill> : null}
          <span className="flex-1" />
          {/* One row of views, one shown at a time in this page (query 2026-1013 2012). */}
          {!corpus.missing ? <nav aria-label="库内视图" className="flex flex-wrap items-center gap-[2px] rounded-lg bg-[var(--surface)] p-[3px]">
            {VIEWS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => showView(key)} aria-pressed={view === key}
                className={`whitespace-nowrap rounded-md px-[12px] py-[7px] text-[13px] transition-colors motion-reduce:transition-none ${view === key ? "bg-[var(--canvas)] font-semibold text-[var(--ink)] shadow-sm" : "text-[var(--steel)] hover:text-[var(--ink)]"}`}>
                {label}
              </button>
            ))}
          </nav> : null}
          {/* After reload the local flag resets, but a server-side import may still be running. */}
          <ManageMenu corpus={corpus} busy={busy || ingestBusy || corpus.job?.status === "running"} isActive={isActive}
            onRename={() => setEditing(true)} onDescribe={() => setEditingDescription(true)} run={run} onClose={onClose} />
        </div>
        {editingDescription ? <div className="mt-[8px] flex items-start gap-[8px]">
          <textarea autoFocus aria-label="资料库说明" rows={2} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)}
            placeholder="简要说明这个资料库收录什么资料（可选）"
            className="font-app min-w-0 flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[9px] py-[6px] text-[12.5px] leading-[1.5] outline-none focus:border-[var(--primary)]" />
          <Button size="sm" disabled={busy} onClick={() => void run(async () => { await setCorpusDescription(corpus.id, description.trim()); setEditingDescription(false); })}>保存</Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditingDescription(false); setDescription(corpus.description ?? ""); }}>取消</Button>
        </div> : <button type="button" onClick={() => setEditingDescription(true)} title="点击编辑说明"
          className="mt-[4px] block max-w-[900px] text-left text-[12.5px] leading-[1.6] text-[var(--steel)] hover:text-[var(--ink)]">
          {corpus.description || "添加说明：这个资料库收录什么资料"}</button>}
        {notice ? <p role="alert" className="mt-[6px] text-[12px] text-[var(--red)]">{notice}</p> : null}
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-[18px] sm:px-8">
      {corpus.missing ? (
        <section className="space-y-[10px] rounded-[10px] border border-[#f1c8c8] bg-[#fff8f8] p-[14px] text-[12px]">
          <p className="font-medium text-[var(--red)]">目录缺失 · 原路径：<code>{corpus.rel_path}</code></p>
          <p className="text-[var(--steel)]">若你已在资料库根目录中重新放置或改名该文件夹，请明确选择对应目录。系统不会按相似名称自动合并。</p>
          <div className="flex flex-wrap gap-[8px]">
            <select aria-label="重新关联目录" className="min-w-[180px] rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[6px]" value={directory} onChange={(event) => setDirectory(event.target.value)}>
              <option value="">选择未关联目录</option>
              {corpora.filter((candidate) => !candidate.missing && candidate.id !== corpus.id).map((candidate) => <option key={candidate.id} value={candidate.rel_path}>{candidate.name} · {candidate.rel_path}</option>)}
            </select>
            <Button variant="primary" size="sm" disabled={busy || !directory} onClick={() => void run(async () => { await reassociateCorpus(corpus.id, directory); setDirectory(""); })}>重新关联并保留原 ID</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => refreshCorpora()}>刷新目录</Button>
          </div>
        </section>
      ) : (
        <>
          {error ? <p role="alert" className="text-[12.5px] text-[var(--red)]">{error}</p> : null}
          {/* The library's latest refresh, above the content: a cut-off or failed one needs a look, not a footnote. */}
          {corpus.job && ["interrupted", "error", "partial"].includes(corpus.job.status) ? (
            <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--tint-peach)] px-3 py-2 text-[12.5px] text-[var(--charcoal)]">
              <b>{corpus.job.status === "interrupted" ? "上次刷新因服务重启中断" : corpus.job.status === "partial" ? `上次刷新部分完成：${corpus.job.errors.length} 项失败` : "上次刷新失败"}</b>
              <span className="text-[var(--slate)]">现有索引保留{corpus.job.ended_at ? ` · ${new Date(corpus.job.ended_at).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}` : ""}</span>
              <button type="button" className="ml-auto text-[var(--link)] hover:underline disabled:opacity-50" disabled={busy || ingestBusy} onClick={() => runCorpusIngest(corpus.id)}>再次刷新</button>
            </div>
          ) : corpus.job ? <p role="status" className="text-[11.5px] text-[var(--steel)]">
            {corpus.job.status === "running" ? `刷新中 ${corpus.job.completed}/${corpus.job.total || "?"}` :
              `最近刷新：新增 ${corpus.job.added ?? 0}，更新 ${corpus.job.updated ?? 0}，删除 ${corpus.job.deleted ?? 0}，跳过 ${corpus.job.skipped ?? 0}`}
          </p> : null}
          {corpusView === "files" ? (
            <CorpusFiles
              corpusId={corpus.id}
              corpusName={corpus.rel_path}
              documents={documents}
              onPreview={(document) => openPreview(document, null, corpus.id)}
              onChanged={() => refresh()}
              onRetryImport={() => runCorpusIngest(corpus.id)}
              connected={connected}
            />
          ) : null}
          {corpusView === "files" ? (admin ? <TopicAdmin corpusId={corpus.id} /> : null) : (
            <><ProjectOverview corpusId={corpus.id} corpusName={corpus.name} />{view === "target" ? <details className="mt-5"><summary className="cursor-pointer text-sm text-[var(--steel)]">文件级整理与只读对照</summary><TargetReports corpusId={corpus.id} /></details> : null}</>
          )}
        </>
      )}
      </div>
    </section>
  );
}

/** One menu for everything that changes a library (query 2026-1013 1522), instead of a row of buttons. */
function ManageMenu({ corpus, busy, isActive, onRename, onDescribe, run, onClose }: {
  corpus: CorpusInfo; busy: boolean; isActive: boolean; onRename: () => void; onDescribe: () => void;
  run: (action: () => Promise<void>) => Promise<void>; onClose: () => void;
}) {
  const { corpusIds, setSearchCorpusIds, runCorpusIngest } = useApp();
  const groups = useGroups();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const item = "block w-full rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-[var(--surface)] disabled:opacity-40";
  const pick = (action: () => void) => () => { setOpen(false); action(); };
  const groupOf = groups?.groups.find((g) => g.members.includes(corpus.id))?.id ?? "";
  return <div ref={box} className="relative">
    <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>管理 ▾</Button>
    {open ? <div role="menu" aria-label="管理资料库" className="absolute top-[calc(100%+6px)] right-0 z-[60] w-[220px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-1.5 shadow-xl">
      {!corpus.missing ? <>
        <>
        <button type="button" role="menuitem" className={item} onClick={pick(onRename)}>重命名</button>
        <button type="button" role="menuitem" className={item} onClick={pick(onDescribe)}>编辑说明</button>
        {groups ? <label className="flex items-center gap-2 px-3 py-1.5 text-[13px]">分组
          <select aria-label="移动到分组" className="min-w-0 flex-1 rounded border border-[var(--hairline)] bg-[var(--canvas)] px-1 py-0.5 text-[12.5px]" value={groupOf}
            onChange={(e) => { const target = e.target.value; setOpen(false); void run(async () => { await changeGroups(groups.revision, "move", target, "", corpus.id); }); }}>
            <option value="">未分组</option>{groups.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label> : null}
        <div className="my-1 border-t border-[var(--hairline)]" />
        </>
        {isActive ? <button type="button" role="menuitem" className={item} disabled={corpusIds.length <= 1}
          onClick={pick(() => setSearchCorpusIds(corpusIds.filter((id) => id !== corpus.id)))}>从当前对话移除</button>
          : <button type="button" role="menuitem" className={item} disabled={corpusIds.length >= 6} onClick={pick(() => setSearchCorpusIds([...corpusIds, corpus.id]))}>加入当前对话</button>}
        {!(corpusIds.length === 1 && isActive) ? <button type="button" role="menuitem" className={item} onClick={pick(() => setSearchCorpusIds([corpus.id]))}>当前对话只用此库</button> : null}
        <>
        <button type="button" role="menuitem" className={item} disabled={busy} onClick={pick(() => void runCorpusIngest(corpus.id))}>刷新本库</button>
        <div className="my-1 border-t border-[var(--hairline)]" />
        <button type="button" role="menuitem" className={item} disabled={busy} onClick={pick(() => {
          if (window.confirm(`清理资料库「${corpus.name}」的索引？源文件保留。`)) void run(async () => { await deleteCorpus(corpus.id); onClose(); });
        })}>清理索引（保留文件）</button>
        <button type="button" role="menuitem" className={item + " text-[var(--red)]"} disabled={busy} onClick={pick(() => {
          if (window.confirm(`删除资料库「${corpus.name}」及其源文件和索引？此操作不可撤销。`)) void run(async () => { await deleteCorpus(corpus.id, true); onClose(); });
        })}>删除资料库及文件</button>
        </>
      </> : <button type="button" role="menuitem" className={item + " text-[var(--red)]"} disabled={busy} onClick={pick(() => {
        if (window.confirm(`仅移除「${corpus.name}」的失效登记？不会删除磁盘文件。`)) void run(async () => { await deleteCorpus(corpus.id); onClose(); });
      })}>移除失效记录</button>}
    </div> : null}
  </div>;
}
