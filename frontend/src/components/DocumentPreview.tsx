import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DocumentPanel } from "./DocumentPanel";
import { PdfViewer } from "./PdfViewer";
import { documentMeta, isLegacyParser } from "../documentMeta";
import { loadPreviewText } from "../documentText";
import { downloadText, openTextInNewTab } from "../exportText";
import { markdownComponents } from "../markdownComponents";
import { Pill } from "./ui";
import type { DocumentInfo } from "../useDocuments";

/**
 * Preview shell. PDFs show the original file directly (browser-native `/file` + `#page=`),
 * which is what "预览文件" should mean; other kinds fall back to the normalized-text reader
 * (Markdown render / raw toggle). `page` lets a citation jump land on the right PDF page.
 */
export function DocumentPreview({
  doc,
  page,
  corpus,
  onClose,
}: {
  doc: DocumentInfo | null;
  page?: number | null;
  corpus?: string;
  onClose: () => void;
}) {
  const isPdf = !!doc && doc.kind === "pdf";
  return (
    <DocumentPanel
      open={!!doc}
      onClose={onClose}
      header={doc?.title ?? ""}
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
        ) : undefined
      }
    >
      {isPdf && doc ? (
        <PdfViewer docId={doc.doc_id} version={doc.version} page={page ?? null} pages={doc.pages} corpus={corpus} />
      ) : (
        <TextPreview doc={doc} corpus={corpus} />
      )}
    </DocumentPanel>
  );
}

/** Non-PDF fallback: the normalized text reader shared with the document explorer's TextPane. */
export function TextPreview({ doc, corpus }: { doc: DocumentInfo | null; corpus?: string }) {
  const [text, setText] = useState("");
  const [markdown, setMarkdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setText("");
    setRaw(false);
    setMarkdown(false);
    loadPreviewText(doc, corpus)
      .then((result) => {
        if (!cancelled) {
          setText(result.text);
          setMarkdown(result.markdown);
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
  return (
    <>
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
              onClick={() => downloadText(text, `${(doc?.title || "document").replace(/[\\/:*?"<>|]/g, "_")}.${markdown ? "md" : "txt"}`)}
            >
              下载{markdown ? " .md" : " .txt"}
            </button>
            <button
              type="button"
              className="text-[var(--link)] hover:underline"
              onClick={() => openTextInNewTab(text, doc?.title || "文档预览", markdown)}
            >
              新窗口打开
            </button>
          </div>
          {markdown && !raw ? (
            <div className="markdown">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {text}
              </Markdown>
            </div>
          ) : (
            <pre className="font-code whitespace-pre-wrap break-words text-[12px] leading-[1.9] text-[var(--charcoal)]">
              {text}
            </pre>
          )}
          <p className="mt-[22px] border-t border-[var(--hairline)] pt-[10px] text-[11px] text-[var(--stone)]">
            这是知识库规范化正文预览，不等于原始 PDF 文件。
          </p>
        </>
      ) : null}
    </>
  );
}
