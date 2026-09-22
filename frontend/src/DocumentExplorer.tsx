import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DocumentPanel } from "./DocumentPanel";
import { DocumentTree } from "./DocumentTree";
import { loadDocumentText } from "./documentPreview";
import { PdfViewer } from "./PdfViewer";
import type { DocumentInfo } from "./useDocuments";

/**
 * U2.1/U2.2/U2.3/U2.5 组合：目录树浏览 + 原文件查看 + "限定为检索资料"。
 * 浏览只改变面板内选中项；检索范围仅在显式点击"限定"按钮后才复用 allowed_doc_ids。
 */
export function DocumentExplorer({ open, onClose, documents, corpusReady, corpusName, corpus, docId, page, onNavigate, allowedDocIds, onLimitScope }: {
  open: boolean; onClose: () => void; documents: DocumentInfo[]; corpusReady: boolean; corpusName?: string; corpus?: string;
  docId: string | null; page: number | null; onNavigate: (docId: string | null, page: number | null) => void;
  allowedDocIds: string[] | null; onLimitScope: (docIds: string[] | null) => void;
}) {
  const doc = docId ? documents.find(item => item.doc_id === docId) ?? null : null;
  const isPdf = !!doc && doc.kind === "pdf";
  const limited = !!doc && Array.isArray(allowedDocIds) && allowedDocIds.length === 1 && allowedDocIds[0] === doc.doc_id;
  return <DocumentPanel open={open} onClose={onClose} header={doc ? doc.title : "本地文档"}
    meta={doc
      ? <p className="mt-1 break-all text-xs text-stone-500">{doc.rel_path ?? doc.origin} · {doc.kind} · 版本 {doc.version} · 采集 {doc.captured_at}</p>
      : <p className="mt-1 text-xs text-stone-500">{corpusName ? `库：${corpusName} · ` : ""}检索范围：{allowedDocIds ? `${allowedDocIds.length} 份` : "全部"} · 浏览不会改变范围</p>}>
    {!corpusReady && <p className="text-sm text-stone-500" role="status">知识库就绪后即可浏览本地文档。</p>}
    {corpusReady && !doc && <DocumentTree documents={documents} selectedDocId={docId ?? undefined} onOpen={item => onNavigate(item.doc_id, 1)}/>}
    {corpusReady && doc && <>
      <button type="button" className="mb-3 text-xs text-stone-500 underline" onClick={() => onNavigate(null, null)}>← 返回目录</button>
      {isPdf
        ? <PdfViewer docId={doc.doc_id} version={doc.version} page={page} pages={doc.pages} corpus={corpus} onPageChange={next => onNavigate(doc.doc_id, next)}/>
        : <TextPane doc={doc} corpus={corpus}/>}
      <div className="mt-4 border-t border-stone-200 pt-3 text-xs">
        {limited
          ? <div className="flex items-center justify-between gap-2">
              <span className="text-teal-800" role="status">检索范围已限定为此文档。</span>
              <button type="button" className="underline" onClick={() => onLimitScope(null)}>取消限定</button>
            </div>
          : <button type="button" className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1 text-teal-800 hover:bg-teal-100"
              onClick={() => onLimitScope([doc.doc_id])}>限定为检索资料（仅此文档）</button>}
      </div>
    </>}
  </DocumentPanel>;
}

/** U2.3：规范化正文预览（Markdown 渲染 + 原文切换），与 U7 的 DocumentPreview 同一读取通道。 */
function TextPane({ doc, corpus }: { doc: DocumentInfo; corpus?: string }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setText(""); setRaw(false);
    loadDocumentText(doc, corpus)
      .then(result => { if (!cancelled) { setText(result.text); setKind(result.kind); } })
      .catch(e => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doc, corpus]);
  const markdown = kind === "official" || doc.parser.includes("markdown");
  return <div className="min-h-0 flex-1 overflow-auto">
    {loading && <p className="text-sm text-stone-500">正在读取正文…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!loading && !error && <>
      {markdown && <div className="mb-3 flex justify-end text-xs"><button className="underline" onClick={() => setRaw(value => !value)}>{raw ? "渲染 Markdown" : "查看原文"}</button></div>}
      {markdown && !raw
        ? <div className="markdown"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
        : <pre className="whitespace-pre-wrap break-words text-xs leading-6">{text}</pre>}
      <p className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-400">这是知识库规范化正文预览；原始文件预览仅 PDF 支持。</p>
    </>}
  </div>;
}
