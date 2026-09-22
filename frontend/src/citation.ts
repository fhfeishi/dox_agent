import type { Source } from "./api";

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] };
type Segment = string | { n: number; raw: string };

const CITATION_PATTERN = /\[(\d{1,3})\]/g;
/** U2.4: code blocks, inline code and existing links keep their literal brackets. */
const SKIP_TAGS = new Set(["code", "pre", "a", "script", "style"]);

export type CitationHandler = (source: Source, n: number) => void;

/**
 * U2.4 rehype plugin: rewrite `[n]` text nodes into anchor elements in the rendered
 * hast tree only — the Markdown source text is never rewritten. `n` maps to the
 * server-provided `citation` (falling back to the array index); numbers without a
 * matching source stay literal, and streaming works because `sources` arrives
 * before the first token.
 */
export function rehypeCitations({ sources, onCite }: { sources: Source[]; onCite: CitationHandler }) {
  const byNumber = new Map<number, Source>();
  sources.forEach((source, index) => {
    const n = source.citation ?? index + 1;
    if (!byNumber.has(n)) byNumber.set(n, source);
  });
  return (tree: HastNode) => {
    rewrite(tree);
  };

  function rewrite(node: HastNode): boolean {
    if (node.type === "element" && node.tagName !== undefined && SKIP_TAGS.has(node.tagName)) return false;
    const children = node.children;
    if (!children) return false;
    let changed = false;
    const next: HastNode[] = [];
    for (const child of children) {
      if (child.type === "text" && typeof child.value === "string" && child.value.includes("[")) {
        const segments = splitCitations(child.value);
        if (segments.some(segment => typeof segment !== "string")) {
          changed = true;
          for (const segment of segments) {
            if (typeof segment === "string") { next.push({ type: "text", value: segment }); continue; }
            const source = byNumber.get(segment.n);
            next.push(source
              ? { type: "element", tagName: "a", properties: { href: `#cite-${segment.n}`, title: source.title }, children: [{ type: "text", value: segment.raw }] }
              : { type: "text", value: segment.raw });
          }
          continue;
        }
      }
      if (rewrite(child)) changed = true;
      next.push(child);
    }
    if (changed) node.children = next;
    return changed;
  }
}

/** Split a text node into literal strings and `[n]` citations, preserving the raw bracket text. */
function splitCitations(value: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of value.matchAll(CITATION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) segments.push(value.slice(last, start));
    segments.push({ n: Number(match[1]), raw: match[0] });
    last = start + match[0].length;
  }
  if (last < value.length) segments.push(value.slice(last));
  return segments;
}
