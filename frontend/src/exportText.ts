import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./markdownComponents";
import { escapeHtml } from "./exportFormat";

export { downloadText, downloadWord, escapeHtml } from "./exportFormat";

/**
 * Render Markdown to an HTML string using the existing React renderer.
 * Browser-only; uses `react-dom/client` (already bundled) instead of `react-dom/server`,
 * which would add ~200KB to the main chunk.
 */
export function markdownToHtml(text: string): string {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      createElement(
        Markdown,
        { remarkPlugins: [remarkGfm], components: markdownComponents },
        text,
      ),
    );
  });
  const html = container.innerHTML;
  // Unmount outside the render pass to avoid React's sync-unmount warning.
  queueMicrotask(() => root.unmount());
  return html;
}

/** Open the text in a new tab. Markdown is rendered to HTML; plain text stays `pre-wrap`. */
export function openTextInNewTab(text: string, title: string, markdown = false) {
  const body = markdown ? markdownToHtml(text) : `<pre>${escapeHtml(text)}</pre>`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
body{max-width:52rem;margin:0 auto;padding:3rem 1.5rem;font:15px/1.9 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1a1a1a;overflow-x:auto}
pre{white-space:pre-wrap;word-break:break-word}
td,th{border:1px solid #d8d3cc;padding:.45rem .7rem;text-align:left}
.md-table-wrap{overflow-x:auto}
table{width:max-content;min-width:100%;border-collapse:collapse}
</style>
</head><body>${body}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
