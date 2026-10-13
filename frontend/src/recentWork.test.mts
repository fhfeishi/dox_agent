import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFacts, headline, type Facts } from './recentWork.ts';

const facts = (reports: Facts['reports'], reviews: Facts['reviews']): Facts => ({ period: '近 7 天', start: '', end: '', reports, reviews, summaries: [] });

test('the period summary counts by state and domain and says so plainly', () => {
  const summary = fromFacts(facts([
    { id: 'a', title: '医疗研判', domains: ['AI与医疗'], date: '2026-10-12', state: '已完成', published: true },
    { id: 'c', title: '机器人对比', domains: ['AI与机器人自动化', 'AI与医疗'], date: '2026-10-08', state: '已完成', published: false },
  ], [
    { id: 'b', title: '申请书甲', kind: '形式审查', domains: [], date: '2026-10-13', state: '进行中', published: false, runs: 3 },
  ]));
  assert.deepEqual(summary.items.map((i) => i.key), ['r:b', 'a:a', 'a:c']);
  assert.deepEqual([summary.reports, summary.reviews, summary.active.length, summary.done.length], [2, 1, 1, 2]);
  assert.equal(summary.items[0].runs, 3);  // one application reviewed three times is one item
  assert.deepEqual(summary.domains, [{ name: 'AI与医疗', count: 2 }, { name: 'AI与机器人自动化', count: 1 }]);
  assert.equal(headline(summary, '近 7 天'), '近 7 天共 2 份分析报告、1 份申请书的审查，主要涉及AI与医疗、AI与机器人自动化，1 项仍在处理。');
  assert.equal(headline(fromFacts(facts([], [])), '近 3 天'), '近 3 天没有新的成果报告或审查任务。');
});
