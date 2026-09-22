import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DocumentPanel } from "./DocumentPanel";
import { PdfViewer } from "./PdfViewer";
import { documentMeta, isLegacyParser } from "./documentMeta";
import { loadDocumentText } from "./documentPreview";
import type { DocumentInfo } from "./useDocuments";

/**
 * Preview shell. PDFs show the original file directly (browser-native `/file` + `#page=`),
 * which is what "预览文件" should mean; other kinds fall back to the normalized-text reader
 * (Markdown render / raw toggle). `page` lets a citation jump land on the right PDF page.
 */
export function DocumentPreview({ doc, page, corpus, onClose }: {
  doc: DocumentInfo | null; page?: number | null; corpus?: string; onClose: () => void;
}) {
  const isPdf = !!doc && doc.kind === "pdf";
  return <DocumentPanel open={!!doc} onClose={onClose} header={doc?.title ?? ""}
    meta={doc && <p className="mt-1 break-all text-xs text-stone-500">{documentMeta(doc)}{
      isLegacyParser(doc.parser) && <span className="ml-2 rounded bg-amber-100 px-1 text-amber-800">旧解析（liteparse），建议重导入为 mineru</span>}</p>}>
    {isPdf && doc
      ? <PdfViewer docId={doc.doc_id} version={doc.version} page={page ?? null} pages={doc.pages} corpus={corpus}/>
      : <TextPreview doc={doc} corpus={corpus}/>}
  </DocumentPanel>;
}

/** Non-PDF fallback: the normalized text reader shared with the document explorer's TextPane. */
function TextPreview({ doc, corpus }: { doc: DocumentInfo | null; corpus?: string }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("");
  const [parser, setParser] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setLoading(true); setError(""); setText(""); setRaw(false);
    setKind(doc.kind ?? ""); setParser(doc.parser ?? "");
    loadDocumentText(doc, corpus)
      .then(result => { if (!cancelled) { setText(result.text); setKind(result.kind); setParser(result.parser); } })
      .catch(e => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doc, corpus]);
  const markdown = kind === "official" || parser.includes("markdown");
  return <>
    {loading && <p className="text-sm text-stone-500">正在读取正文…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!loading && !error && <>
      {markdown && <div className="mb-3 flex justify-end text-xs"><button className="underline" onClick={() => setRaw(value => !value)}>{raw ? "渲染 Markdown" : "查看原文"}</button></div>}
      {markdown && !raw
        ? <div className="markdown"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
        : <pre className="whitespace-pre-wrap break-words text-xs leading-6">{text}</pre>}
      <p className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-400">这是知识库规范化正文预览，不等于原始 PDF 文件。</p>
    </>}
  </>;
}
