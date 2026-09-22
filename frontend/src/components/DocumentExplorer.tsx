import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DocumentPanel } from "./DocumentPanel";
import { DocumentTree } from "./DocumentTree";
import { loadDocumentText } from "../documentText";
import { documentMeta, isLegacyParser } from "../documentMeta";
import { downloadText, openTextInNewTab } from "../exportText";
import { PdfViewer } from "./PdfViewer";
import { Button, Pill } from "./ui";
import { useDocuments } from "../useDocuments";
import type { DocumentInfo } from "../useDocuments";

/**
 * U2.1/U2.2/U2.3/U2.5 组合：目录树浏览 + 原文件查看 + "限定为检索资料"。
 * 浏览只改变面板内选中项；检索范围仅在显式点击"限定"按钮后才复用 allowed_doc_ids。
 */
export function DocumentExplorer({
  open,
  onClose,
  corpusReady,
  corpusName,
  corpus,
  docId,
  page,
  onNavigate,
  allowedDocIds,
  onLimitScope,
}: {
  open: boolean;
  onClose: () => void;
  corpusReady?: boolean;
  corpusName?: string;
  corpus?: string;
  docId: string | null;
  page: number | null;
  onNavigate: (docId: string | null, page: number | null) => void;
  allowedDocIds: string[] | null;
  onLimitScope: (docIds: string[] | null) => void;
}) {
  // The explorer owns its document list so a preview opened from another corpus never
  // falls back to the active corpus's documents.
  const { documents } = useDocuments(open, corpus);
  const ready = corpusReady ?? true;
  const doc = docId ? documents.find((item) => item.doc_id === docId) ?? null : null;
  const isPdf = !!doc && doc.kind === "pdf";
  const limited =
    !!doc && Array.isArray(allowedDocIds) && allowedDocIds.length === 1 && allowedDocIds[0] === doc.doc_id;
  return (
    <DocumentPanel
      open={open}
      onClose={onClose}
      header={doc ? doc.title : "本地文档"}
      meta={
        doc ? (
          <p className="mt-[4px] break-all text-[11px] text-[var(--stone)]">
            {documentMeta(doc)}
            {isLegacyParser(doc.parser) ? (
              <span className="ml-2 inline-block">
                <Pill tone="yellow">旧解析（liteparse），建议重导入为 mineru</Pill>
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-[4px] text-[11px] text-[var(--stone)]">
            {corpusName ? `库：${corpusName} · ` : ""}检索范围：{allowedDocIds ? `${allowedDocIds.length} 份` : "全部"} ·
            浏览不会改变范围
          </p>
        )
      }
    >
      {!ready ? (
        <p className="text-[13px] text-[var(--steel)]" role="status">
          知识库就绪后即可浏览本地文档。
        </p>
      ) : null}
      {ready && !doc ? (
        <DocumentTree documents={documents} selectedDocId={docId ?? undefined} onOpen={(item) => onNavigate(item.doc_id, 1)} />
      ) : null}
      {ready && doc ? (
        <>
          <button
            type="button"
            className="mb-[12px] text-[12px] text-[var(--link)] hover:underline"
            onClick={() => onNavigate(null, null)}
          >
            ← 返回目录
          </button>
          {isPdf ? (
            <PdfViewer
              docId={doc.doc_id}
              version={doc.version}
              page={page}
              pages={doc.pages}
              corpus={corpus}
              onPageChange={(next) => onNavigate(doc.doc_id, next)}
            />
          ) : (
            <TextPane doc={doc} corpus={corpus} />
          )}
          <div className="mt-[16px] border-t border-[var(--hairline)] pt-[12px] text-[12px]">
            {limited ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--primary-pressed)]" role="status">
                  检索范围已限定为此文档。
                </span>
                <button type="button" className="text-[var(--link)] hover:underline" onClick={() => onLimitScope(null)}>
                  取消限定
                </button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => onLimitScope([doc.doc_id])}>
                限定为检索资料（仅此文档）
              </Button>
            )}
          </div>
        </>
      ) : null}
    </DocumentPanel>
  );
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
    setLoading(true);
    setError("");
    setText("");
    setRaw(false);
    loadDocumentText(doc, corpus)
      .then((result) => {
        if (!cancelled) {
          setText(result.text);
          setKind(result.kind);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, corpus]);
  const markdown = kind === "official" || doc.parser.includes("markdown");
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {loading ? <p className="text-[13px] text-[var(--steel)]">正在读取正文…</p> : null}
      {error ? (
        <p role="alert" className="text-[13px] text-[var(--red)]">
          {error}
        </p>
      ) : null}
      {!loading && !error ? (
        <>
          <div className="mb-[12px] flex flex-wrap items-center justify-end gap-[12px] text-[12px]">
            {markdown ? (
              <button type="button" className="text-[var(--link)] hover:underline" onClick={() => setRaw((value) => !value)}>
                {raw ? "渲染 Markdown" : "查看原文"}
              </button>
            ) : null}
            <button
              type="button"
              className="text-[var(--link)] hover:underline"
              onClick={() => downloadText(text, `${doc.title.replace(/[\\/:*?"<>|]/g, "_")}.${markdown ? "md" : "txt"}`)}
            >
              下载{markdown ? " .md" : " .txt"}
            </button>
            <button type="button" className="text-[var(--link)] hover:underline" onClick={() => openTextInNewTab(text, doc.title)}>
              新窗口打开
            </button>
          </div>
          {markdown && !raw ? (
            <div className="markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
            </div>
          ) : (
            <pre className="font-code whitespace-pre-wrap break-words text-[12px] leading-[1.9] text-[var(--charcoal)]">
              {text}
            </pre>
          )}
          <p className="mt-[22px] border-t border-[var(--hairline)] pt-[10px] text-[11px] text-[var(--stone)]">
            这是知识库规范化正文预览；原始文件预览仅 PDF 支持。
          </p>
        </>
      ) : null}
    </div>
  );
}
