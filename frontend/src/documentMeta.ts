/** Friendly labels for the stored parser field; flags parsers that predate the
 *  mineru switch so the preview can hint at a re-import. */
export function parserLabel(parser?: string): string {
  if (!parser) return "解析器未知";
  if (parser.startsWith("liteparse")) return "liteparse（旧解析）";
  if (parser.startsWith("mineru")) return "mineru";
  if (parser.includes("official")) return "official-markdown";
  if (parser.includes("python-docx")) return "python-docx";
  if (parser === "utf8") return "纯文本";
  return parser;
}

/** True when the document was parsed by liteparse (before K13/mineru). */
export function isLegacyParser(parser?: string): boolean {
  return !!parser && parser.startsWith("liteparse");
}

export function documentMeta(doc: { origin?: string; rel_path?: string; kind?: string; parser?: string; version?: string; captured_at?: string }): string {
  const location = doc.rel_path || doc.origin || "—";
  return `${location} · ${doc.kind ?? "文档"} · ${parserLabel(doc.parser)} · 版本 ${doc.version ?? "—"} · 采集 ${doc.captured_at ?? "未记录"}`;
}
