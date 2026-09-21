import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTurn, receiveEvent, regenerateTurn, stopTurn } from './conversation.ts';

test('usage belongs to one attempt, survives export and resets on regeneration', () => {
  const usage = { input_tokens: 20, output_tokens: 6, total_tokens: 26, reported_tokens: 26, calls: 2, reported_calls: 2, complete: true };
  let turn = receiveEvent(newTurn('问题', []), { event: 'usage', data: usage }, 100);
  turn = receiveEvent(turn, { event: 'done', data: { ok: true } }, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(turn)).usage, usage);
  const retry = regenerateTurn(turn, []);
  assert.equal(retry.usage, undefined);
  assert.deepEqual(retry.previousAttempts[0].usage, usage);
  const incomplete = receiveEvent(retry, { event: 'usage', data: { ...usage, total_tokens: null, complete: false } }, 50);
  assert.equal(stopTurn(incomplete, true, 80).usage?.total_tokens, null);
});

test('first token ignores status, sources and empty chunks; completion freezes elapsed time', () => {
  let turn = newTurn('问题', []);
  turn = receiveEvent(turn, { event: 'status', data: { message: '正在研究' } }, 100);
  turn = receiveEvent(turn, { event: 'sources', data: [] }, 200);
  turn = receiveEvent(turn, { event: 'token', data: { text: '' } }, 300);
  assert.equal(turn.firstTokenMs, null);
  turn = receiveEvent(turn, { event: 'token', data: { text: '正文' } }, 1200);
  turn = receiveEvent(turn, { event: 'token', data: { text: '继续' } }, 1600);
  turn = receiveEvent(turn, { event: 'done', data: { ok: true } }, 2000);
  assert.equal(turn.firstTokenMs, 1200);
  assert.equal(turn.totalMs, 2000);
  assert.equal(turn.complete, true);
  assert.deepEqual(receiveEvent(turn, { event: 'done', data: { ok: true } }, 9000), turn);
  assert.deepEqual(stopTurn(turn, true, 10000), turn);
});

test('cancelled and failed attempts retain partial text without successful total or invented first token', () => {
  const empty = stopTurn(newTurn('问题', []), true, 500);
  assert.equal(empty.firstTokenMs, null);
  assert.equal(empty.totalMs, null);
  assert.equal(empty.elapsedMs, 500);
  let partial = receiveEvent(newTurn('问题', []), { event: 'token', data: { text: '部分' } }, 400);
  partial = stopTurn(partial, false, 800);
  assert.equal(partial.answer, '部分');
  assert.equal(partial.firstTokenMs, 400);
  assert.equal(partial.totalMs, null);
  assert.equal(partial.outcome, 'failed');
  assert.equal(partial.complete, false);
});

test('regeneration reuses original request, archives attempts and resets timers', () => {
  let first = newTurn('第一问', []);
  first = receiveEvent(first, { event: 'token', data: { text: '第一答' } }, 10);
  first = receiveEvent(first, { event: 'done', data: { ok: true } }, 20);
  let second = newTurn('追问', [first]);
  second = receiveEvent(second, { event: 'token', data: { text: '旧答案' } }, 30);
  second = receiveEvent(second, { event: 'done', data: { ok: true } }, 40);
  second.requestMessages.push({ role: 'assistant', content: '污染的旧快照' });
  second.sources = [{ title: '旧来源', url: '/old', snippet: '不能进入后端' }];
  const retry = regenerateTurn(second, [first]);
  assert.deepEqual(retry.requestMessages, [
    { role: 'user', content: '第一问' }, { role: 'assistant', content: '第一答' }, { role: 'user', content: '追问' },
  ]);
  assert.equal(retry.previousAttempts[0].answer, '旧答案');
  assert.equal(retry.previousAttempts[0].totalMs, 40);
  assert.equal(retry.firstTokenMs, null);
  assert.equal(retry.totalMs, null);
  assert.equal(retry.answer, '');
  assert.equal(JSON.stringify(retry.requestMessages).includes('旧'), false);
  assert.equal(JSON.stringify(retry.requestMessages).includes('snippet'), false);
  assert.deepEqual(newTurn('下一问', [first, stopTurn(retry, true, 90)]).requestMessages, [
    { role: 'user', content: '第一问' }, { role: 'assistant', content: '第一答' }, { role: 'user', content: '下一问' },
  ]);
});

test('effective policy is versioned, exported and reused independently of session changes', () => {
  const session = { query_routing: 'auto' as const, evidence_level: 'low' as const, allowed_doc_ids: ['a'] };
  let turn = newTurn('仅按资料回答', [], session);
  session.allowed_doc_ids.push('b');
  assert.deepEqual(turn.options.allowed_doc_ids, ['a']);
  turn = receiveEvent(turn, { event: 'policy', data: { query_routing: 'knowledge_only', evidence_level: 'low', allowed_doc_ids: ['a'], route: 'research', stop_reason: 'covered' } }, 50);
  turn = receiveEvent(turn, { event: 'token', data: { text: '结论 [1]' } }, 70);
  turn = receiveEvent(turn, { event: 'done', data: { ok: true } }, 100);
  const retry = regenerateTurn(turn, []);
  assert.equal(retry.options.query_routing, 'knowledge_only');
  assert.equal(retry.options.evidence_level, 'low');
  assert.equal(retry.policy, null);
  const exported = JSON.parse(JSON.stringify(retry));
  assert.equal(exported.previousAttempts[0].policy.stop_reason, 'covered');
  assert.equal(exported.previousAttempts[0].answer, '结论 [1]');
  const cancelled = stopTurn(retry, true, 120);
  assert.deepEqual(receiveEvent(cancelled, { event: 'policy', data: turn.policy! }, 200), cancelled);
});


test("restoration retains effective config and prior versions while excluding interrupted output", async () => {
  const { restoreTurns, newTurn, regenerateTurn } = await import("./conversation.ts");
  const first = newTurn("question", [], {query_routing: "knowledge_only", evidence_level: "high", allowed_doc_ids: ["doc"], execution_mode: "research"});
  const running = regenerateTurn({...first, answer: "old", complete: true, outcome: "completed"}, []);
  running.answer = "partial";
  const restored = restoreTurns([running]);
  assert.equal(restored[0].outcome, "interrupted");
  assert.equal(restored[0].answer, "partial");
  assert.equal(restored[0].options.execution_mode, "research");
  assert.equal(restored[0].previousAttempts[0].answer, "old");
  assert.equal(newTurn("next", restored).requestMessages.length, 1);
});

test("interruption closes live steps and stale run events cannot enter a new answer", async () => {
  const { newTurn, receiveEvent, stopTurn } = await import("./conversation.ts");
  let turn = newTurn("question", []);
  turn = receiveEvent(turn, {event: "step", data: {run_id: turn.runId, id: "one", sequence: 1, phase: "search", status: "running", label: "搜索资料"}}, 10);
  const stopped = stopTurn(turn, true, 20);
  assert.equal(stopped.steps[0].status, "interrupted");
  const next = newTurn("next", []);
  const stale = receiveEvent(next, {event: "step", data: {...turn.steps[0], run_id: turn.runId, status: "completed"}}, 30);
  assert.equal(stale.steps.length, 0);
});

test("editing a historical question creates a clean branch before that turn", async () => {
  const { branchFromTurn, newTurn, receiveEvent } = await import("./conversation.ts");
  const finish = (turn: ReturnType<typeof newTurn>, answer: string) => receiveEvent(receiveEvent(turn, {event: "token", data: {text: answer}}, 10), {event: "done", data: {ok: true}}, 20);
  const first = finish(newTurn("first", []), "one");
  const second = finish(newTurn("second", [first], {query_routing: "knowledge_only", evidence_level: "high", allowed_doc_ids: ["doc"], execution_mode: "research"}), "two");
  const third = finish(newTurn("third", [first, second]), "three");
  const branch = branchFromTurn([first, second, third], 1);
  assert.deepEqual(branch.history.map(turn => turn.question), ["first"]);
  assert.equal(branch.options.query_routing, "knowledge_only");
  assert.deepEqual(branch.options.allowed_doc_ids, ["doc"]);
  assert.equal([first, second, third][2].answer, "three");
});
