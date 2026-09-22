import type { DocumentInfo } from "./useDocuments";

type ReadResult = { text: string; next_start_line: number | null; start_line: number; page: number; kind: string; parser: string };

const MAX_PAGES = 2000;

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
 * Read the whole stored document. `next_start_line === null` only means the current page is
 * exhausted, so advance to the next page; stop after the last page (or a "页码不存在" page).
 */
export async function loadDocumentText(doc: DocumentInfo, corpus?: string): Promise<{ text: string; kind: string; parser: string }> {
  const parts: string[] = [];
  let kind = doc.kind ?? "text";
  let parser = doc.parser ?? "";
  const lastPage = Math.min(doc.pages, MAX_PAGES);
  for (let page = 1; page <= lastPage; page += 1) {
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
      if (result.text) parts.push(result.text);
      if (result.next_start_line === null || result.next_start_line <= start) break;
      start = result.next_start_line;
    }
  }
  return { text: parts.join("\n\n"), kind, parser };
}
