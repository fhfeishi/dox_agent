import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV, barFor, foldedFor, isCurrent, workCards } from './navigation.ts';

// Upgrade plan U2: one table makes every way in, so each role's entries are pinned here once.
const bar = (role: 'admin' | 'leader' | 'user') =>
  barFor(role).map((item) => item.kind === 'entry' ? `${item.entry.label}${item.entry.pages ? '▾' : ''}` : `${item.label}▾`);

test('each role sees its bar in the order of query 2026-1019 2021', () => {
  assert.deepEqual(bar('admin'), ['首页', '概览▾', '资料库', '对话工作台', '存量分析▾', '资料审查▾', '情报分析', '报告中心']);
  assert.deepEqual(bar('user'), ['首页', '资料库', '对话工作台', '存量分析▾', '资料审查▾', '情报分析', '报告中心']);
  assert.deepEqual(bar('leader'), ['首页', '领域分析', '资料库', '工作台▾', '报告中心']);
  const bench = barFor('leader').find((item) => item.kind === 'workbench');
  assert.deepEqual(bench?.kind === 'workbench' && bench.entries.map((entry) => entry.label), ['对话工作台', '存量分析', '资料审查', '情报分析']);
});

test('the folded menu and the 首页 cards hold the same entries as the bar', () => {
  for (const role of ['admin', 'leader', 'user'] as const) {
    assert.deepEqual(foldedFor(role).map((item) => item.label), NAV.filter((entry) => entry.roles.includes(role)).map((entry) => entry.label));
    assert.deepEqual(workCards(role).map((card) => card.title), ['资料查阅', '存量分析', '资料审查', '情报分析']);
  }
  assert.ok(!foldedFor('user').some((item) => item.label === '概览'), '概览 is the administrator\'s');
});

test('every entry, page and card leads to a route that exists', () => {
  const routes = new Set([...readFileSync(new URL('./router.tsx', import.meta.url), 'utf8').matchAll(/\{ path: "([a-z]+)/g)].map((m) => m[1]));
  const targets = NAV.flatMap((entry) => [entry.to, entry.card?.to, ...(entry.pages ?? []).map((page) => page.to)]).filter(Boolean) as string[];
  for (const to of targets) assert.ok(routes.has(to.split(/[/?]/)[1]), `${to} has no route`);
});

test('a menu page is current only with its own query', () => {
  assert.ok(isCurrent('/tasks?task=task2', '/tasks', '?task=task2'));
  assert.ok(!isCurrent('/tasks?task=task2', '/tasks', ''));
  assert.ok(!isCurrent('/tasks', '/tasks', '?task=task2'));
  assert.ok(isCurrent('/tasks', '/tasks', ''));
  assert.ok(isCurrent('/overview/build', '/overview', ''));
});
