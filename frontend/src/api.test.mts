import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createReport, streamChat } from './api.ts';

test('reassembles split UTF-8 and SSE frames', async () => {
  const original = globalThis.fetch;
  const bytes = new TextEncoder().encode('event: token\ndata: {"text":"证据"}\n\nevent: done\ndata: {"ok":true}\n\n');
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); },
  }));
  try {
    const events: unknown[] = [];
    await streamChat([{ role: 'user', content: 'hi' }], new AbortController().signal, event => events.push(event));
    assert.deepEqual(events, [{ event: 'token', data: { text: '证据' } }, { event: 'done', data: { ok: true } }]);
  } finally { globalThis.fetch = original; }
});

test('rejects incomplete responses and backend error events', async () => {
  const original = globalThis.fetch;
  try {
    for (const [body, expected] of [
      ['event: token\ndata: {"text":"partial"}\n\n', /连接中断/],
      ['event: error\ndata: {"message":"模型不可用"}\n\n', /模型不可用/],
    ] as const) {
      globalThis.fetch = async () => new Response(body);
      await assert.rejects(streamChat([], new AbortController().signal, () => {}), expected);
    }
  } finally { globalThis.fetch = original; }
});

test('done is terminal without waiting for socket closure or processing trailing events', async () => {
  const original = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: done\ndata: {"ok":true}\n\nevent: token\ndata: {"text":"late"}\n\n'));
    },
    cancel() { cancelled = true; },
  }));
  try {
    const events: unknown[] = [];
    await streamChat([], new AbortController().signal, event => events.push(event));
    assert.deepEqual(events, [{ event: 'done', data: { ok: true } }]);
    assert.equal(cancelled, true);
  } finally { globalThis.fetch = original; }
});

test('sends requested options and delivers server policy without guessing route', async () => {
  const original = globalThis.fetch;
  const options = { allowed_doc_ids: ['doc'] };
  const policy = { ...options, route: 'research', stop_reason: 'covered' };
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string), { messages: [], ...options });
    return new Response(`event: policy\ndata: ${JSON.stringify(policy)}\n\nevent: done\ndata: {"ok":true}\n\n`);
  };
  try {
    const events: unknown[] = [];
    await streamChat([], new AbortController().signal, event => events.push(event), options);
    assert.deepEqual(events[0], { event: 'policy', data: policy });
  } finally { globalThis.fetch = original; }
});

test('user multi-corpus chat request preserves the explicit retrieval set', async () => {
  const original = globalThis.fetch;
  const options = { allowed_doc_ids: ['from-b'], corpus_ids: ['a', 'b'], task_id: 'task1' };
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string), { messages: [], ...options });
    return new Response('event: done\ndata: {"ok":true}\n\n');
  };
  try { await streamChat([], new AbortController().signal, () => {}, options); }
  finally { globalThis.fetch = original; }
});

test('user missing-corpus response retains the recovery detail', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ detail: { missing: true, corpus_id: 'a' } }, { status: 409 });
  try {
    await assert.rejects(streamChat([], new AbortController().signal, () => {}), (error: unknown) =>
      error instanceof ApiError && error.detail !== undefined && /目录已缺失/.test(error.message));
  } finally { globalThis.fetch = original; }
});

test('user report request carries its independently confirmed single-corpus scope', async () => {
  const original = globalThis.fetch;
  const params = { domain: '医疗', year_from: 2025, year_to: 2025, template_id: 'comprehensive',
    corpus_id: 'b', doc_ids: ['b-doc'], session_key: 'session' };
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string), params);
    return Response.json({ report_id: 'report', markdown: '# 报告' });
  };
  try { assert.equal((await createReport(params)).report_id, 'report'); }
  finally { globalThis.fetch = original; }
});
