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

/** Open the text in a new tab as a minimal readable HTML page. */
export function openTextInNewTab(text: string, title: string) {
  const escapedTitle = title.replace(/[<>&]/g, "");
  const escapedBody = text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c));
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${escapedTitle}</title>
<style>body{max-width:52rem;margin:0 auto;padding:3rem 1.5rem;font:15px/1.9 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1a1a1a;white-space:pre-wrap;word-break:break-word}</style>
</head><body>${escapedBody}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
