import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headline, periodStart, summarize, type WorkItem } from './recentWork.ts';

const now = new Date(2026, 9, 13, 16, 30);  // Tuesday 13 October 2026, local time

test('periods start at local midnight: rolling days, Monday weeks, calendar quarters', () => {
  const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];
  assert.deepEqual(day(periodStart('3d', now)), [2026, 10, 11, 0]);
  assert.deepEqual(day(periodStart('7d', now)), [2026, 10, 7, 0]);
  assert.deepEqual(day(periodStart('30d', now)), [2026, 9, 14, 0]);
  assert.deepEqual(day(periodStart('week', now)), [2026, 10, 12, 0]);
  assert.deepEqual(day(periodStart('month', now)), [2026, 10, 1, 0]);
  assert.deepEqual(day(periodStart('quarter', now)), [2026, 10, 1, 0]);
  assert.deepEqual(day(periodStart('year', now)), [2026, 1, 1, 0]);
  assert.deepEqual(day(periodStart('week', new Date(2026, 9, 11, 9))), [2026, 10, 5, 0]);  // a Sunday belongs to the week from Monday
});

test('summary keeps items inside the period, counts by state and domain, and says so plainly', () => {
  const at = (d: number, h = 9) => new Date(2026, 9, d, h).toISOString();
  const items: WorkItem[] = [
    { key: 'a', kind: 'report', title: '医疗研判', type: '报告', date: at(12), state: 'done', domains: ['AI与医疗'] },
    { key: 'b', kind: 'review', title: '申请书甲', type: '形式审查', date: at(13), state: 'active', domains: [] },
    { key: 'c', kind: 'report', title: '机器人对比', type: '报告', date: at(8), state: 'done', domains: ['AI与机器人自动化', 'AI与医疗'] },
    { key: 'd', kind: 'report', title: '旧报告', type: '报告', date: at(1), state: 'done', domains: ['AI与农业'] },
  ];
  const week = summarize(items, 'week', now);
  assert.deepEqual(week.items.map((i) => i.key), ['b', 'a']);
  assert.deepEqual([week.reports, week.reviews, week.active.length, week.done.length], [1, 1, 1, 1]);
  const month = summarize(items, '7d', now);
  assert.deepEqual(month.domains, [{ name: 'AI与医疗', count: 2 }, { name: 'AI与机器人自动化', count: 1 }]);
  assert.equal(headline(month, '近 7 天'), '近 7 天共 2 份分析报告、1 项审查任务，主要涉及AI与医疗、AI与机器人自动化，1 项仍在处理。');
  assert.equal(headline(summarize([], '3d', now), '近 3 天'), '近 3 天没有新的成果报告或审查任务。');
});
