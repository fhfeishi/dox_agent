import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactInfo, Source } from "../api";
import { rehypeCitations } from "../citation";

export type ReportFigure = {
  figure_id: string; caption: string; page: number; corpus_id: string;
  doc_id: string; doc_version: string; media_type: string;
};

export function ReportMarkdown({ markdown, figures = [], reportId, artifact, sources = [], onOpenSource }:
  { markdown: string; figures?: ReportFigure[]; reportId?: string; artifact?: { id: string; version: number; trashed?: boolean };
    sources?: ArtifactInfo["citations"]; onOpenSource?: (source: Source, n: number) => void }) {
  const references: Source[] = sources.map((source, index) => ({
    ...source, title: source.title ?? "", url: source.url ?? "", snippet: "",
    page: source.page ?? undefined, citation: source.citation ?? index + 1,
  }));
  return <Markdown remarkPlugins={[remarkGfm]}
    rehypePlugins={onOpenSource ? [rehypeCitations({ sources: references, onCite: onOpenSource })] : []}
    components={{ a: ({ href, children, ...props }) => {
      const match = /^#cite-(\d+)$/.exec(href ?? "");
      const source = match && references.find((item) => item.citation === Number(match[1]));
      if (!source || !onOpenSource) return <a href={href} {...props}>{children}</a>;
      return <button type="button" title={source.title} className="text-[var(--primary)] underline"
        onClick={() => onOpenSource(source, source.citation!)}>{children}</button>;
    }, img: ({ src, alt }) => {
    const match = /^figures\/([a-f0-9]{20})\.(?:jpg|png)$/.exec(src ?? "");
    const figure = figures.find((item) => item.figure_id === match?.[1]);
    if (!figure) return <span role="alert">报告图片不可用：{alt}</span>;
    const imageUrl = artifact
      ? `/api/artifacts/${encodeURIComponent(artifact.id)}/versions/${artifact.version}/figures/${figure.figure_id}?include_trashed=${Boolean(artifact.trashed)}`
      : `/api/reports/${encodeURIComponent(reportId ?? "")}/figures/${figure.figure_id}`;
    const pdfUrl = `/api/documents/${encodeURIComponent(figure.doc_id)}/file?corpus=${encodeURIComponent(figure.corpus_id)}&version=${encodeURIComponent(figure.doc_version)}#page=${figure.page}`;
    return <a href={pdfUrl} target="_blank" rel="noreferrer" title={`查看原 PDF 第 ${figure.page} 页`}>
      <img src={imageUrl} alt={alt ?? figure.caption} className="max-w-full" />
    </a>;
  } }}>{markdown}</Markdown>;
}
