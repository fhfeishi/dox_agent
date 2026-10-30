import { useState } from "react";
import type { CorpusFile } from "../api";
import type { Project } from "../projects";
import type { DocumentInfo } from "../useDocuments";

const name = (path: string) => path.split("/").at(-1) ?? path;

/**
 * 资料管理 by project (query 2026-1016 1814): one row per project with its years, number and lead;
 * ticking a project ticks all its readable files. A project with one file opens it from its title
 * (前端审查 O1: nearly every project has one report); one with several expands to its files. What needs
 * attention is said on the row — an unconfirmed project identity, a file that repeats another — so it
 * is seen where the material is chosen. Files that could not be read are listed after the projects.
 */
export function ProjectList({ projects, files, selectedIds, onToggle, onPreview, onDelete, busy, query, filtered = false }: {
  projects: Project[]; files: CorpusFile[]; selectedIds: string[];
  onToggle: (docIds: string[], on: boolean) => void; onPreview?: (document: DocumentInfo) => void;
  /** Absent when the account may not delete files (only administrators maintain system libraries). */
  onDelete?: (relPath: string) => void; busy: boolean; query: string;
  /** A year or missing-information filter narrowed the list, so an empty one says that, not “no projects”. */
  filtered?: boolean;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const [limit, setLimit] = useState(60);
  const byDoc = new Map(files.filter((f) => f.doc_id).map((f) => [f.doc_id!, f]));
  const needle = query.trim().toLowerCase();
  const shown = projects.filter((p) => !needle || `${p.title} ${p.number} ${p.files.map((f) => f.document.title).join(" ")}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(a.identity_status === "pending") - Number(b.identity_status === "pending") || (b.start_year ?? 0) - (a.start_year ?? 0));
  const unread = files.filter((f) => f.status === "error" || f.status === "new" || f.status === "removed")
    .filter((f) => !needle || f.rel_path.toLowerCase().includes(needle));
  const toggleOpen = (id: string) => setOpen((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);

  return <div className="space-y-1">
    <ul aria-label="项目列表" className="space-y-1 rounded-xl border border-[var(--hairline)] p-1">
      {shown.slice(0, limit).map((p) => {
        const ids = p.files.map((f) => f.document.doc_id);
        const picked = ids.filter((id) => selectedIds.includes(id)).length;
        // Identical content is indexed once, so a copy is found through the files list: any file whose
        // content repeats one of this project's files belongs here, named with what it repeats.
        const own = p.files.map((f) => byDoc.get(f.document.doc_id)?.rel_path).filter(Boolean) as string[];
        const copies = files.filter((f) => f.duplicate_of && (own.includes(f.duplicate_of) || own.includes(f.rel_path)));
        const pending = p.identity_status === "pending";
        const expanded = open.includes(p.project_id);
        const single = onPreview && p.files.length === 1 && !copies.length ? p.files[0].document : null;
        return <li key={p.project_id} className={`rounded-lg border border-l-4 px-3 py-2 text-caption transition-colors ${picked ? "border-[var(--primary)] border-l-[var(--primary)] bg-[var(--primary-soft)]" : "border-transparent hover:border-[var(--hairline)] hover:bg-[var(--surface)]"}`}>
          <div className="flex items-center gap-3">
            <input type="checkbox" aria-label={`选择项目 ${p.title}`} checked={picked === ids.length && ids.length > 0}
              ref={(el) => { if (el) el.indeterminate = picked > 0 && picked < ids.length; }} onChange={() => onToggle(ids, picked < ids.length)} />
            <button type="button" onClick={() => single ? onPreview!(single) : toggleOpen(p.project_id)} aria-expanded={single ? undefined : expanded}
              className="min-w-0 flex-1 text-left">
              <span className="block truncate text-body font-medium text-[var(--ink)]">{p.title}</span>
              <span className="block truncate text-caption text-[var(--stone)]">
                {p.start_year ? `${p.start_year}–${p.end_year ?? "?"}` : "年份待核对"} · {p.number || "批准号待核对"}{p.admin ? ` · ${p.admin}` : ""}</span>
            </button>
            {pending ? <span className="shrink-0 rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-caption text-[var(--warn-fg)]" title={p.identity_conflict ? "文件名与原文批准号冲突" : "基金体系或批准号待核对"}>项目待核对</span> : null}
            {copies.length ? <span className="shrink-0 rounded bg-[var(--danger-bg)] px-1.5 py-0.5 text-caption text-[var(--danger-fg)]">含重复内容 {copies.length}</span> : null}
            {single ? <button type="button" onClick={() => onPreview!(single)} className="shrink-0 text-[var(--link)] hover:underline">预览 ›</button>
              : <button type="button" onClick={() => toggleOpen(p.project_id)} className="shrink-0 text-[var(--steel)] hover:text-[var(--ink)]">{p.files.length} 份文件 {expanded ? "▴" : "▾"}</button>}
          </div>
          {expanded ? <ul aria-label={`${p.title} 的文件`} className="mt-2 space-y-1 border-t border-[var(--hairline)] pt-2 pl-7">
            {p.files.map(({ document }) => { const file = byDoc.get(document.doc_id);
              return <li key={document.doc_id} className="flex items-center gap-2">
                <input type="checkbox" aria-label={`选择 ${file?.rel_path ?? document.title}`} checked={selectedIds.includes(document.doc_id)}
                  onChange={() => onToggle([document.doc_id], !selectedIds.includes(document.doc_id))} />
                <span className="min-w-0 flex-1 truncate text-[var(--slate)]" title={file?.rel_path}>{file ? name(file.rel_path) : document.title}</span>
                {file?.duplicate_of ? <span className="shrink-0 text-[var(--danger-fg)]">与 {name(file.duplicate_of)} 内容相同</span> : null}
                {onPreview ? <button type="button" className="shrink-0 text-[var(--link)] hover:underline" onClick={() => onPreview(document)}>预览</button> : null}
                {file?.duplicate_of && onDelete ? <button type="button" disabled={busy} onClick={() => onDelete(file.rel_path)} className="shrink-0 text-[var(--red)] hover:underline disabled:opacity-40">删除副本</button> : null}
              </li>; })}
            {copies.filter((f) => !own.includes(f.rel_path)).map((f) => <li key={f.rel_path} className="flex items-center gap-2 pl-5">
              <span className="min-w-0 flex-1 truncate text-[var(--stone)]" title={f.rel_path}>{name(f.rel_path)}</span>
              <span className="shrink-0 text-[var(--danger-fg)]">与 {name(f.duplicate_of!)} 内容相同，未单独计入</span>
              {onDelete ? <button type="button" disabled={busy} onClick={() => onDelete(f.rel_path)} className="shrink-0 text-[var(--red)] hover:underline disabled:opacity-40">删除副本</button> : null}
            </li>)}
          </ul> : null}
        </li>;
      })}
      {!shown.length ? <li className="px-3 py-2 text-caption text-[var(--stone)]">{needle ? "没有匹配的项目。" : filtered ? "没有符合筛选的项目。" : "还没有可识别的项目。"}</li> : null}
      {shown.length > limit ? <li><button type="button" onClick={() => setLimit(limit + 60)} className="w-full rounded-lg py-2 text-caption text-[var(--link)] hover:bg-[var(--surface)]">
        显示更多（已显示 {limit} / {shown.length} 个项目）</button></li> : null}
    </ul>
    {unread.length ? <details open className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-bg)] px-3 py-2 text-caption">
      <summary className="cursor-pointer font-medium text-[var(--red)]">未入库的文件 · {unread.length}</summary>
      <ul aria-label="未入库的文件" className="mt-2 space-y-1">{unread.map((f) => <li key={f.rel_path} className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate" title={f.rel_path}>{name(f.rel_path)}</span>
        <span className="max-w-[50%] shrink-0 truncate text-[var(--red)]" title={f.reason}>{f.status === "error" ? `读取失败：${(f.reason || "").split(":")[0] || "原因未记录"}` : f.status === "new" ? "待导入" : "源文件缺失"}</span>
        {onDelete ? <button type="button" disabled={busy} onClick={() => onDelete(f.rel_path)} className="shrink-0 text-[var(--red)] hover:underline disabled:opacity-40">删除</button> : null}
      </li>)}</ul>
    </details> : null}
  </div>;
}
