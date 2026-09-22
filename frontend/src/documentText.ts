import type { DocumentInfo } from "./useDocuments";

type ReadResult = { text: string; next_start_line: number | null; start_line: number; page: number; kind: string; parser: string };

const MAX_PAGES = 2000;

/** True when a document's stored text should be rendered as Markdown, not as raw text. */
export function isMarkdownDocument(doc: {
  kind?: string;
  parser?: string;
  rel_path?: string;
  origin?: string;
  title?: string;
}): boolean {
  if (doc.kind === "official") return true;
  if ((doc.parser ?? "").includes("markdown")) return true;
  // Extension fallback: legacy `.md` imports stored `parser="utf8"` before the parser label fix,
  // and incremental import skips unchanged files, so the fallback must stay.
  return /\.(md|markdown)$/i.test(doc.rel_path || doc.origin || doc.title || "");
}

async function readPage(docId: string, page: number, startLine: number, version: string, corpus?: string): Promise<ReadResult> {
  const query = new URLSearchParams({ page: String(page), start_line: String(startLine), version });
  if (corpus) query.set("corpus", corpus);
  const response = await fetch(`/api/documents/${encodeURIComponent(docId)}?${query}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.detail === "string" ? payload.detail : `读取失败（HTTP ${response.status}）`);
  }
  return response.json();
}

/**
 * Full parsed markdown body for rendering previews. This is the preferred channel for
 * Markdown documents: it returns the parser output verbatim, without the 300-char line
 * splits and 60-line windows that break tables/code blocks. Falls back to `loadDocumentText`.
 */
export async function loadDocumentMarkdown(doc: DocumentInfo, corpus?: string): Promise<{ text: string; version: string }> {
  const query = new URLSearchParams({ version: doc.version });
  if (corpus) query.set("corpus", corpus);
  const response = await fetch(`/api/documents/${encodeURIComponent(doc.doc_id)}/markdown?${query}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.detail === "string" ? payload.detail : `读取失败（HTTP ${response.status}）`);
  }
  const payload = await response.json();
  return { text: typeof payload.text === "string" ? payload.text : "", version: payload.version };
}

/**
 * Read the whole stored document through the windowed reader (fallback / non-Markdown).
 * Windows inside a page are joined with "\n" (a window boundary must not terminate a table or
 * list); only page boundaries use "\n\n".
 */
export async function loadDocumentText(doc: DocumentInfo, corpus?: string): Promise<{ text: string; kind: string; parser: string }> {
  const pages: string[] = [];
  let kind = doc.kind ?? "text";
  let parser = doc.parser ?? "";
  const lastPage = Math.min(doc.pages, MAX_PAGES);
  for (let page = 1; page <= lastPage; page += 1) {
    const windows: string[] = [];
    let start = 1;
    while (true) {
      let result: ReadResult;
      try {
        result = await readPage(doc.doc_id, page, start, doc.version, corpus);
      } catch (error) {
        const message = (error as Error).message;
        // A missing page or an empty page ends this page; a version change is fatal.
        if (message.includes("页码不存在") || message.includes("行号超出范围")) break;
        throw error;
      }
      kind = result.kind ?? kind;
      parser = result.parser ?? parser;
      if (result.text) windows.push(result.text);
      if (result.next_start_line === null || result.next_start_line <= start) break;
      start = result.next_start_line;
    }
    if (windows.length) pages.push(windows.join("\n"));
  }
  return { text: pages.join("\n\n"), kind, parser };
}

/** Preview loader shared by the document panel and the explorer. */
export async function loadPreviewText(
  doc: DocumentInfo,
  corpus?: string,
): Promise<{ text: string; markdown: boolean }> {
  const markdown = isMarkdownDocument(doc);
  if (markdown) {
    try {
      const result = await loadDocumentMarkdown(doc, corpus);
      if (result.text.trim()) return { text: result.text, markdown: true };
    } catch {
      /* fall back to the windowed reader (e.g. pre-markdown corpora) */
    }
  }
  const result = await loadDocumentText(doc, corpus);
  return { text: result.text, markdown: markdown || result.kind === "official" || result.parser.includes("markdown") };
}
