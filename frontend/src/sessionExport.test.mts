import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionToMarkdown } from "./sessionExport.ts";
import type { Turn } from "./conversation.ts";

function turn(n: number, outcome: Turn["outcome"] = "completed"): Turn {
  return {
    runId: `r${n}`,
    steps: [],
    options: { allowed_doc_ids: null },
    policy: null,
    answer: `答案${n}`,
    sources: [],
    complete: true,
    outcome,
    startedAt: "2026-09-22T00:00:00Z",
    firstTokenMs: 1,
    totalMs: 2,
    elapsedMs: 2,
    question: `问题${n}`,
    requestMessages: [],
    previousAttempts: [],
  };
}

test("user session markdown numbers completed turns and skips unfinished ones", () => {
  const md = sessionToMarkdown({ title: "会话", exportedAt: "2026-09-22T00:00:00Z" }, [
    turn(1),
    turn(2, "interrupted"),
    turn(3),
  ]);
  assert.match(md, /# 会话/);
  assert.match(md, /## 第 1 轮/);
  assert.match(md, /## 第 2 轮/);
  assert.match(md, /答案3/);
  assert.doesNotMatch(md, /答案2/);
  assert.match(md, /共 2 轮/);
});

test("user session markdown includes citation lines when present", () => {
  const withSource = { ...turn(1), sources: [{ title: "报告A", url: "", snippet: "", page: 2, citation: 1 }] };
  const md = sessionToMarkdown({ title: "会话", exportedAt: "2026-09-22T00:00:00Z" }, [withSource]);
  assert.match(md, /### 引用来源/);
  assert.match(md, /1\. 报告A · 第2页/);
});
