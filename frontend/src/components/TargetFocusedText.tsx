import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadPreviewText } from "../documentText";
import { downloadText, openTextInNewTab } from "../exportText";
import { markdownComponents } from "../markdownComponents";
import type { DocumentInfo } from "../useDocuments";

const WINDOW = 2200;

/**
 * 证据定位视图：在规范化正文中定位引文并高亮，不重新换算行号（行号是阅读器口径）。
 * 后端返回的字符位置仅作提示，实际定位统一用逐字引文匹配；找不到时不伪造位置。
 * 默认显示带高亮的原文片段——Markdown 只是可选阅读入口，定位标记只在原文分支存在。
 */
export function TargetFocusedText({ doc, corpus, quote }: { doc: DocumentInfo; corpus?: string; quote: string }) {
  const [text, setText] = useState("");
  const [markdown, setMarkdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renderMarkdown, setRenderMarkdown] = useState(false);
  const marker = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setText("");
    setRenderMarkdown(false);
    loadPreviewText(doc, corpus)
      .then((result) => {
        if (cancelled) return;
        setText(result.text);
        setMarkdown(result.markdown);
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doc, corpus]);

  const range = useMemo(() => {
    const at = quote ? text.indexOf(quote) : -1;
    if (at < 0) return null;
    return {
      start: Math.max(0, at - WINDOW),
      end: Math.min(text.length, at + quote.length + WINDOW),
      at,
    };
  }, [text, quote]);

  // 等定位标记真正渲染出来再滚动；从 Markdown 切回原文时同样重新定位。
  useEffect(() => {
    if (loading || renderMarkdown || range === null) return;
    marker.current?.scrollIntoView({ block: "center" });
  }, [range?.at, renderMarkdown, loading]);

  if (loading) return <p className="text-[13px] text-[var(--steel)]">正在读取正文…</p>;
  if (error) return <p role="alert" className="text-[13px] text-[var(--red)]">{error}</p>;

  const located = range !== null;
  const view = located ? text.slice(range!.start, range!.end) : text.slice(0, WINDOW * 2);
  const before = located ? text.slice(range!.start, range!.at) : "";
  const hit = located ? text.slice(range!.at, range!.at + quote.length) : "";
  const after = located ? text.slice(range!.at + quote.length, range!.end) : "";

  return (
    <>
      <div className="mb-[12px] flex flex-wrap items-center justify-end gap-[12px] text-[12px]">
        {markdown ? (
          <button type="button" className="text-[var(--link)] hover:underline"
            onClick={() => setRenderMarkdown((value) => !value)}>
            {renderMarkdown ? "返回原文定位" : "渲染 Markdown"}
          </button>
        ) : null}
        <button type="button" className="text-[var(--link)] hover:underline"
          onClick={() => downloadText(text, `${(doc.title || "document").replace(/[\\/:*?"<>|]/g, "_")}.${markdown ? "md" : "txt"}`)}>
          下载{markdown ? " .md" : " .txt"}
        </button>
        <button type="button" className="text-[var(--link)] hover:underline"
          onClick={() => openTextInNewTab(text, doc.title || "文档预览", markdown)}>
          新窗口打开
        </button>
      </div>
      {located ? null : (
        <p role="status" className="mb-[10px] text-[12px] text-[#8a6a00]">
          未能在当前正文中找到该引文（资料可能已更新）。已显示正文开头，请重新提取或刷新资料后再定位；不用旧位置冒充新内容。
        </p>
      )}
      {markdown && renderMarkdown ? (
        <div className="markdown">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{view}</Markdown>
        </div>
      ) : (
        <pre className="font-code whitespace-pre-wrap break-words text-[12px] leading-[1.9] text-[var(--charcoal)]">
          {located ? (<>{before}<mark ref={marker} className="bg-[var(--primary-soft)] text-[var(--ink)]">{hit}</mark>{after}</>) : view}
        </pre>
      )}
      <p className="mt-[22px] border-t border-[var(--hairline)] pt-[10px] text-[11px] text-[var(--stone)]">
        这是知识库规范化正文预览，不等于原始 PDF 文件。
      </p>
    </>
  );
}
