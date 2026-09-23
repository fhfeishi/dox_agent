import type { Source } from "./api";
import type { Attempt } from "./conversation";
import { downloadText, downloadWord, escapeHtml, fileStamp, sanitizeFileName } from "./exportFormat.ts";

export type TurnExportMeta = {
  question?: string;
  corpusName?: string;
  taskName?: string;
  /** ISO timestamp; injected for deterministic tests. */
  exportedAt?: string;
};

function sourceLines(sources: Source[]): string {
  return sources
    .map((s, i) => `${s.citation ?? i + 1}. ${s.title}${s.page ? ` · 第${s.page}页` : ""}`)
    .join("\n");
}

/** Pure Markdown serialization of one answered turn (no DOM). */
export function turnToMarkdown(meta: TurnExportMeta, attempt: Attempt): string {
  const stamp = meta.exportedAt ?? new Date().toISOString();
  const parts = [
    `# ${meta.question || "回答"}`,
    `> 导出时间：${stamp} · 知识库：${meta.corpusName || "未选择"} · 任务：${meta.taskName || "专业问答"}`,
    "## 回答",
    attempt.answer,
  ];
  if (attempt.sources.length) parts.push("## 引用来源", sourceLines(attempt.sources));
  return parts.join("\n\n") + "\n";
}

/**
 * Word-compatible HTML document (`.doc`). Pure string composition so it can be unit-tested;
 * `bodyHtml` is the already-rendered answer HTML.
 */
export function turnWordDocumentHtml(meta: TurnExportMeta, bodyHtml: string): string {
  const stamp = meta.exportedAt ?? new Date().toISOString();
  const title = meta.question || "回答";
  const header =
    `<h1>${escapeHtml(title)}</h1>` +
    `<p>导出时间：${escapeHtml(stamp)} · 知识库：${escapeHtml(meta.corpusName || "未选择")} · 任务：${escapeHtml(meta.taskName || "专业问答")}</p>`;
  return (
    `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->` +
    `<style>@page{size:A4;margin:2cm} td,th{border:1px solid #999;padding:4px 8px} table{border-collapse:collapse;width:100%}</style>` +
    `</head><body>${header}${bodyHtml}</body></html>`
  );
}

/** Download one answered turn as Markdown or a Word-compatible `.doc`. */
export async function downloadTurn(meta: TurnExportMeta, attempt: Attempt, format: "md" | "word") {
  const base = sanitizeFileName(meta.question || "") || "dox-answer";
  const stamp = fileStamp(meta.exportedAt);
  if (format === "word") {
    const sources = attempt.sources.length
      ? `<h2>引用来源</h2><ol>${attempt.sources
          .map((s) => `<li>${escapeHtml(s.title)}${s.page ? ` · 第${s.page}页` : ""}</li>`)
          .join("")}</ol>`
      : "";
    // Markdown→HTML needs React/JSX; import lazily so this module stays Node-testable.
    const { markdownToHtml } = await import("./exportText.ts");
    downloadWord(turnWordDocumentHtml(meta, `${markdownToHtml(attempt.answer)}${sources}`), `${base}-${stamp}.doc`);
    return;
  }
  downloadText(turnToMarkdown(meta, attempt), `${base}-${stamp}.md`);
}
