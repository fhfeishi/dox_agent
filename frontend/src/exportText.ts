import { createElement } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownComponents } from "./markdownComponents";

function escapeHtml(text: string): string {
  return text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c));
}

/** Download plain/Markdown text as a file. */
export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open the text in a new tab. Markdown is rendered to HTML (same react-markdown + GFM as the
 * in-app preview) so tables/code/quotes match; plain text stays `pre-wrap`.
 */
export function openTextInNewTab(text: string, title: string, markdown = false) {
  const body = markdown
    ? renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm], components: markdownComponents }, text))
    : `<pre>${escapeHtml(text)}</pre>`;
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
