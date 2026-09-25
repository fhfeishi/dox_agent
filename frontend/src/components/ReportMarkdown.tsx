import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ReportFigure = {
  figure_id: string; caption: string; page: number; corpus_id: string;
  doc_id: string; doc_version: string; media_type: string;
};

export function ReportMarkdown({ markdown, figures = [], reportId, artifact }:
  { markdown: string; figures?: ReportFigure[]; reportId?: string; artifact?: { id: string; version: number } }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={{ img: ({ src, alt }) => {
    const match = /^figures\/([a-f0-9]{20})\.(?:jpg|png)$/.exec(src ?? "");
    const figure = figures.find((item) => item.figure_id === match?.[1]);
    if (!figure) return <span role="alert">报告图片不可用：{alt}</span>;
    const imageUrl = artifact
      ? `/api/artifacts/${encodeURIComponent(artifact.id)}/versions/${artifact.version}/figures/${figure.figure_id}`
      : `/api/reports/${encodeURIComponent(reportId ?? "")}/figures/${figure.figure_id}`;
    const pdfUrl = `/api/documents/${encodeURIComponent(figure.doc_id)}/file?corpus=${encodeURIComponent(figure.corpus_id)}&version=${encodeURIComponent(figure.doc_version)}#page=${figure.page}`;
    return <a href={pdfUrl} target="_blank" rel="noreferrer" title={`查看原 PDF 第 ${figure.page} 页`}>
      <img src={imageUrl} alt={alt ?? figure.caption} className="max-w-full" />
    </a>;
  } }}>{markdown}</Markdown>;
}
