import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFacts, headline, type Facts } from './recentWork.ts';

const facts = (reports: Facts['reports'], reviews: Facts['reviews']): Facts => ({ period: '一周内', start: '', end: '', reports, reviews, summaries: [] });

test('the period summary counts by state and domain and says so plainly', () => {
  const summary = fromFacts(facts([
    { id: 'a', title: '医疗研判', kind: '分析报告', domains: ['AI与医疗'], date: '2026-10-12', state: '已完成' },
    { id: 'c', title: '机器人对比', kind: '保存的回答', domains: ['AI与机器人自动化', 'AI与医疗'], date: '2026-10-08', state: '已完成' },
  ], [
    { id: 'b', title: '申请书甲', kind: '形式审查', domains: [], date: '2026-10-13', state: '进行中', runs: 3 },
  ]));
  assert.deepEqual(summary.items.map((i) => i.key), ['r:b', 'a:a', 'a:c']);
  assert.deepEqual([summary.reports, summary.reviews, summary.active.length, summary.done.length], [2, 1, 1, 2]);
  assert.equal(summary.items[0].runs, 3);  // one application reviewed three times is one item
  assert.deepEqual(summary.domains, [{ name: 'AI与医疗', count: 2 }, { name: 'AI与机器人自动化', count: 1 }]);
  assert.equal(headline(summary, '一周内'), '一周内共 2 份报告、1 份申请书的审查，主要涉及AI与医疗、AI与机器人自动化，1 项仍在处理。');
  assert.equal(headline(fromFacts(facts([], [])), '一周内'), '一周内没有新的成果报告或审查任务。');
});
