import type { Turn } from "./conversation";
import { downloadText, fileStamp, sanitizeFileName } from "./exportFormat.ts";

export type SessionExportMeta = {
  title?: string;
  corpusName?: string;
  taskName?: string;
  /** ISO timestamp; injected for deterministic tests. */
  exportedAt?: string;
};

/** Pure Markdown serialization of a whole session. Only completed answers are exported. */
export function sessionToMarkdown(meta: SessionExportMeta, turns: Turn[]): string {
  const done = turns.filter((turn) => turn.outcome === "completed" && turn.answer);
  const stamp = meta.exportedAt ?? new Date().toISOString();
  const header =
    `# ${meta.title || "会话导出"}\n\n> 导出时间：${stamp} · 知识库：以各轮记录为准 · ` +
    `任务：${meta.taskName || "专业问答"} · 共 ${done.length} 轮`;
  const blocks = done.map((turn, i) => {
    const sources = turn.sources.length
      ? "\n\n### 引用来源\n\n" +
        turn.sources
          .map((s, j) => `${s.citation ?? j + 1}. ${s.title}${s.page ? ` · 第${s.page}页` : ""}`)
          .join("\n")
      : "";
    const ids = turn.runInfo?.effective_corpus_ids ?? turn.options.corpus_ids ?? [];
    const scope = `资料范围（${turn.runInfo ? "服务端范围" : "请求范围"}）：${ids.join("、") || "未记录"}`;
    return `## 第 ${i + 1} 轮\n\n${scope}\n\n**提问**\n\n${turn.question}\n\n**回答**\n\n${turn.answer}${sources}`;
  });
  return [header, ...blocks].join("\n\n---\n\n") + "\n";
}

/** Download the session as Markdown. Browser-only. */
export function downloadSessionMarkdown(meta: SessionExportMeta, turns: Turn[]) {
  const base = sanitizeFileName(meta.title || "") || "dox-session";
  downloadText(sessionToMarkdown(meta, turns), `${base}-${fileStamp(meta.exportedAt)}.md`);
}
