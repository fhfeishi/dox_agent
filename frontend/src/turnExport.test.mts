import { test } from "node:test";
import assert from "node:assert/strict";
import { turnToMarkdown, turnWordDocumentHtml } from "./turnExport.ts";
import type { Attempt } from "./conversation.ts";

const attempt: Attempt = {
  runId: "r1",
  steps: [],
  options: { allowed_doc_ids: null },
  policy: null,
  answer: "结论 [1]\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
  sources: [{ title: "报告A", url: "", snippet: "", page: 3, citation: 1 }],
  complete: true,
  outcome: "completed",
  startedAt: "2026-09-22T00:00:00Z",
  firstTokenMs: 10,
  totalMs: 20,
  elapsedMs: 20,
};

test("user turn markdown includes question, answer, header and source line", () => {
  const md = turnToMarkdown(
    { question: "问题?", corpusName: "库", taskName: "精准问答", exportedAt: "2026-09-22T00:00:00Z" },
    attempt,
  );
  assert.match(md, /# 问题\?/);
  assert.match(md, /知识库：库/);
  assert.match(md, /结论 \[1\]/);
  assert.match(md, /1\. 报告A · 第3页/);
});

test("user turn markdown omits the sources section when there are none", () => {
  const md = turnToMarkdown({ question: "q", exportedAt: "2026-09-22T00:00:00Z" }, { ...attempt, sources: [] });
  assert.doesNotMatch(md, /## 引用来源/);
});

test("word document escapes the title and keeps table html", () => {
  const doc = turnWordDocumentHtml(
    { question: "<b>x</b>", exportedAt: "2026-09-22T00:00:00Z" },
    "<table><tr><td>1</td></tr></table>",
  );
  assert.match(doc, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(doc, /<table>/);
  assert.match(doc, /urn:schemas-microsoft-com:office:word/);
});
