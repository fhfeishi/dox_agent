import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { artifactExportUrl, fetchArtifact } from "../api";
import { downloadText } from "../exportFormat";
import { useApp } from "../store";
import { ReportMarkdown } from "./ReportMarkdown";
import { reportTag } from "./ResultsPage";

/**
 * A report on a page of its own (query 2026-1023 1044): 报告中心's preview panel opens it here in a new
 * tab, at a reading width, for reading side by side or at full screen. Editing, versions and the bin
 * stay in the panel; this page reads the current version and exports it.
 */
export function ReportPage() {
  const { artifactId = "" } = useParams();
  const { handleOpenSource, corpora } = useApp();
  const report = useQuery({ queryKey: ["report-page", artifactId], queryFn: () => fetchArtifact(artifactId) });
  const item = report.data;
  const link = "text-body text-[var(--link)] hover:underline";
  return <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-soft)]">
    <article className="mx-auto my-6 w-full max-w-[920px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] px-6 py-7 sm:px-10">
      {report.error ? <p role="alert" className="text-body text-[var(--red)]">{(report.error as Error).message}</p>
        : !item ? <p role="status" className="text-body text-[var(--steel)]">正在读取报告…</p>
        : <>
          <header className="mb-6 border-b border-[var(--hairline)] pb-4">
            <p className="text-caption text-[var(--steel)]">{[reportTag(item) || "报告", `第 ${item.version} 版`, (item.updated_at || item.created_at).slice(0, 10),
              item.corpus_ids.map((id) => corpora.find((c) => c.id === id)?.name ?? id).join("、")].filter(Boolean).join(" · ")}</p>
            {/* Most reports open with their own title as a heading; the page names it only when they do not. */}
            {/^#\s/.test(item.markdown.trimStart()) ? null : <h1 className="mt-1 text-page font-semibold text-[var(--ink)]">{item.title}</h1>}
            <nav aria-label="导出" className="mt-3 flex flex-wrap gap-4">
              <button type="button" className={link} onClick={() => void navigator.clipboard.writeText(item.markdown)}>复制正文</button>
              {item.figures?.length ? <a className={link} href={artifactExportUrl(item.artifact_id, "zip", item.version)}>下载图文 ZIP</a>
                : <button type="button" className={link} onClick={() => downloadText(item.markdown, `${item.title}.md`)}>下载 .md</button>}
              <a className={link} href={artifactExportUrl(item.artifact_id, "docx", item.version)}>导出 .docx</a>
            </nav>
          </header>
          {item.status === "generating" ? <p role="status" className="text-body text-[var(--steel)]">报告仍在生成，完成后刷新本页。</p>
            : <div className="markdown"><ReportMarkdown sources={item.citations} onOpenSource={handleOpenSource} markdown={item.markdown} figures={item.figures}
              artifact={{ id: item.artifact_id, version: item.version, trashed: item.lifecycle === "trashed" }} /></div>}
        </>}
    </article>
  </main>;
}
