import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchCorpusFiles } from "../api";
import { parserLabel } from "../documentMeta";
import { useLayout } from "../layout";
import { libraryColor } from "../libraryColors";
import { libraryOverviewQuery } from "../libraryQueries";
import { projectQuery } from "../projects";
import { useApp } from "../store";
import type { DocumentInfo } from "../useDocuments";
import { Button } from "./ui";

const TYPES: Record<string, string> = { pdf: "PDF", docx: "Word", doc: "Word", md: "Markdown", markdown: "Markdown", txt: "纯文本" };
const short = (name: string) => name.replace(/^自然科学基金-/, "");
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const time = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/**
 * What a material is, before its text (upgrade plan F3b): its title, library, type and project years
 * first; size, pages, import time, state and version one click away. A field the record does not hold
 * says so instead of being guessed. The actions are the material's own: read it enlarged, download the
 * original, ask about it.
 */
export function DocumentCard({ doc, page, corpusId }: { doc: DocumentInfo; page: number | null; corpusId: string }) {
  const { corpora, startResearch, sessionBusy } = useApp();
  const { openFullPreview } = useLayout();
  const [asking, setAsking] = useState("");
  const overview = useQuery(libraryOverviewQuery());
  const projects = useQuery({ ...projectQuery(corpusId), enabled: Boolean(corpusId) });
  const files = useQuery({ queryKey: ["library", corpusId, "files"], queryFn: ({ signal }) => fetchCorpusFiles(corpusId, signal), enabled: Boolean(corpusId) });
  const library = corpora.find((item) => item.id === corpusId);
  const project = projects.data?.projects.find((item) => item.files.some((file) => file.document.doc_id === doc.doc_id));
  const confirmed = project && project.identity_status === "identified" && !project.year_conflict && project.start_year;
  const extension = (doc.rel_path || doc.origin || "").split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[extension] ?? (doc.kind === "pdf" ? "PDF" : "文本");
  // A document record may carry the absolute path it was imported from; the library lists files relative to its folder.
  const path = (doc.rel_path || doc.origin || "").replace(/\\/g, "/");
  const file = files.data?.files.find((item) => path === item.rel_path || path.endsWith("/" + item.rel_path));
  const unit = doc.kind === "pdf" ? "页" : "个文本块";
  const download = `/api/documents/${encodeURIComponent(doc.doc_id)}/file?${new URLSearchParams({ corpus: corpusId, version: doc.version })}`;

  async function ask() {
    setAsking("");
    try {
      await startResearch(corpusId, [doc.doc_id], "task1", "请概括这份资料的研究目标、方法与主要结论，并逐条给出出处。");
    } catch (cause) { setAsking((cause as Error).message); }
  }

  return <section aria-label="资料信息" className="mb-[14px] space-y-[10px]">
    <p className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-body text-[var(--slate)]">
      <span className="inline-flex items-center gap-[6px] font-medium text-[var(--ink)]">
        <span aria-hidden="true" className="size-[9px] rounded-full" style={{ background: overview.data ? libraryColor(overview.data, corpusId) : "var(--hairline-strong)" }} />
        {library ? short(library.name) : "资料库未知"}
      </span>
      <span className="text-[var(--stone)]">·</span><span>{type}</span>
      <span className="text-[var(--stone)]">·</span>
      <span>{confirmed ? `项目年份 ${project.start_year}${project.end_year && project.end_year !== project.start_year ? `–${project.end_year}` : ""}` : project?.year_conflict ? "项目年份有冲突" : "项目年份未确认"}</span>
    </p>
    {project ? <p className="text-caption text-[var(--steel)]">所属项目：{project.title || "未命名项目"}{project.number ? `（${project.number}）` : ""}{project.identity_status === "pending" ? " · 身份待核对" : ""}</p> : null}
    <div className="flex flex-wrap gap-[8px]">
      <Button size="sm" variant="primary" onClick={() => openFullPreview(doc, page, corpusId, true)}>放大阅读</Button>
      <a href={download} download className="inline-flex h-[28px] items-center rounded-[6px] border border-[var(--hairline-strong)] px-[10px] text-caption text-[var(--slate)] hover:bg-[var(--surface)]">下载原文</a>
      <Button size="sm" variant="outline" disabled={sessionBusy} onClick={() => void ask()}>就此提问</Button>
    </div>
    {asking ? <p role="alert" className="text-caption text-[var(--red)]">{asking}</p> : null}
    <details className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[10px] py-[6px] text-caption text-[var(--steel)]">
      <summary className="cursor-pointer select-none">文件信息</summary>
      <dl className="mt-[6px] grid grid-cols-[5em_minmax(0,1fr)] gap-x-[8px] gap-y-[3px]">
        <dt>大小</dt><dd>{file ? size(file.size) : files.isPending ? "读取中…" : "未记录"}</dd>
        <dt>篇幅</dt><dd>{doc.pages ? `${doc.pages} ${unit}` : "未记录"}</dd>
        <dt>导入时间</dt><dd>{doc.captured_at ? time(doc.captured_at) : "未记录"}</dd>
        <dt>处理状态</dt><dd>{doc.status === "indexed" ? "已入库，可检索" : doc.status || "未记录"}</dd>
        <dt>版本</dt><dd className="font-code">{doc.version ? doc.version.slice(0, 12) : "未记录"}</dd>
        <dt>解析方式</dt><dd>{parserLabel(doc.parser)}</dd>
        <dt>位置</dt><dd className="break-all">{file?.rel_path ?? (path.split("/").pop() || "未记录")}</dd>
      </dl>
    </details>
  </section>;
}
