import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DocumentPanel } from "./DocumentPanel";
import { loadDocumentText } from "./documentPreview";
import type { DocumentInfo } from "./useDocuments";

export function DocumentPreview({ doc, onClose }: { doc: DocumentInfo | null; onClose: () => void }) {
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
    loadDocumentText(doc)
      .then(result => { if (!cancelled) { setText(result.text); setKind(result.kind); setParser(result.parser); } })
      .catch(e => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doc]);
  const markdown = kind === "official" || parser.includes("markdown");
  return <DocumentPanel open={!!doc} onClose={onClose} header={doc?.title ?? ""}
    meta={doc && <p className="mt-1 break-all text-xs text-stone-500">{doc.origin} · {kind || doc.kind} · {parser || doc.parser} · 版本 {doc.version} · 采集 {doc.captured_at}</p>}>
    {loading && <p className="text-sm text-stone-500">正在读取正文…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!loading && !error && <>
      {markdown && <div className="mb-3 flex justify-end text-xs"><button className="underline" onClick={() => setRaw(value => !value)}>{raw ? "渲染 Markdown" : "查看原文"}</button></div>}
      {markdown && !raw
        ? <div className="markdown"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
        : <pre className="whitespace-pre-wrap break-words text-xs leading-6">{text}</pre>}
      <p className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-400">这是知识库规范化正文预览，不等于原始 PDF 文件。</p>
    </>}
  </DocumentPanel>;
}
