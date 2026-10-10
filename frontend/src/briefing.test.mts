import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard, buildMatrix, fieldHeadline, indicators, libraryInsights, lineageOutline, matrixCell, matrixOutline, tierOf } from './briefing.ts';

test('lifts metrics, scale and milestones from cited text, not years', () => {
  assert.deepEqual(indicators(['预测模型AUC=0.813，外部验证AUC 0.816~0.914', '2021年起在全国23家三甲医院超5万例外部验证并投入实战']),
    ['AUC 0.813', 'AUC 0.816~0.914', '23家三甲医院', '5万例']);
  assert.deepEqual(indicators(['灵敏度91.5%，特异度97.2%，已纳入临床指南', '多中心数据'], 5),
    ['灵敏度 91.5%', '特异度 97.2%', '纳入指南', '多中心验证']);
  assert.deepEqual(indicators(['提出一种新方法']), []);
  assert.deepEqual(indicators(['准确率提高12个百分点，C-index 0.78']), ['C-index 0.78']);
  assert.equal(tierOf(5).label, '示范应用');
  assert.equal(tierOf(3).label, '攻关验证');
  assert.equal(tierOf(0).label, '探索/未判定');
});

const evidence = (quote: string) => [{ item_id: 'i', doc_id: 'd', version: 'v', quote, locator: {} }];
const hierarchy = {
  corpus_id: 'c', scenes: [{
    name: '肿瘤诊疗', summary: '实体瘤', project_ids: ['P1', 'P2'], item_ids: [], evidence: [],
    issues: [
      { name: '早期筛查', state: '已解决', summary: '', project_ids: ['P1'], item_ids: [], evidence: [], routes: [
        { title: '影像组学列线图', summary: '', project_ids: ['P1'], item_ids: ['t1'], evidence: evidence('外部验证AUC 0.842') }] },
      { name: '长尾病例', state: '待解决', summary: '', project_ids: ['P2'], item_ids: [], evidence: [], routes: [
        { title: '少样本学习', summary: '', project_ids: ['P2'], item_ids: ['t2'], evidence: [] }] }],
    achievements: [{ title: '多中心预后模型 AUC 0.9', summary: '', marker_basis: { projects: 1, representative: '', note: '' },
      project_ids: ['P1'], item_ids: [], evidence: evidence('5家医院验证'), aspects: [] }],
  }],
} as never;
const lineage = {
  corpus_id: 'c', state: 'ready', branch: '自然科学基金-AI与医疗', gaps: [], maturity_levels: {},
  fields: [{ name: '肿瘤诊疗', plain: '' }],
  items: {
    'P1|t1': { name: '列线图', desc: '', project_id: 'P1', item_id: 't1', maturity: 4, basis: '多中心验证', field: '肿瘤诊疗' },
    'P2|t2': { name: '少样本', desc: '', project_id: 'P2', item_id: 't2', maturity: 1, basis: '', field: '肿瘤诊疗' },
    'P2|t3': { name: '联邦学习', desc: '', project_id: 'P2', item_id: 't3', maturity: 2, basis: '', field: '肿瘤诊疗' },
  },
  categories: [
    { name: '统计建模', summary: '', children: [{ name: '临床预测模型', plain: '用病例数据算风险分', foundation: false, themes: [{ name: '列线图', items: ['P1|t1'] }] },
      { name: '隐私协同', plain: '数据不出院联合建模', foundation: true, themes: [{ name: '联邦', items: ['P2|t3'] }] }] },
    { name: '未归入体系的条目', summary: '', unplaced: true, children: [{ name: 'x', themes: [{ name: 'x', items: ['P2|t2'] }] }] },
  ],
} as never;

test('board summarises scenes, results and the shared foundation', () => {
  const board = buildBoard(hierarchy, lineage);
  assert.equal(board.branch, 'AI与医疗');
  assert.deepEqual([board.solved, board.open, board.projects, board.unplaced, board.unplacedKey], [1, 1, 2, 1, 'c:1']);
  assert.deepEqual(board.scenes[0].issues.map((issue) => [issue.name, issue.state]), [['早期筛查', '已解决'], ['长尾病例', '待解决']]);
  assert.deepEqual(board.scenes[0].achievements[0].indicators, ['AUC 0.9', '5家医院', '多中心验证']);
  assert.deepEqual(board.scenes[0].highlights, ['AUC 0.9', '5家医院', '多中心验证']);
  assert.deepEqual(board.foundations.map((f) => [f.key, f.name, f.projects, f.scenes]), [['d:0:1', '隐私协同', 1, ['肿瘤诊疗']]]);
});

test('matrix places every item by field and stage, keeps undetermined lanes and filters by stage level', () => {
  const placed = { ...(lineage as Record<string, unknown>),
    fields: [{ name: '肿瘤诊疗', plain: '' }, { name: '心脑血管', plain: '' }],
    stages: [{ name: '诊断与分型', plain: '' }, { name: '疗效评估与预后', plain: '' }],
    items: {
      'P1|t1': { name: '列线图', desc: '外部验证AUC 0.842', project_id: 'P1', item_id: 't1', maturity: 4, basis: '多中心验证', field: '肿瘤诊疗', stage: '疗效评估与预后' },
      'P2|t2': { name: '少样本', desc: '', project_id: 'P2', item_id: 't2', maturity: 1, basis: '', field: '', stage: '诊断与分型' },
      'P2|t3': { name: '联邦学习', desc: '', project_id: 'P2', item_id: 't3', maturity: 2, basis: '', field: '肿瘤诊疗', stage: 'S9' },
    } } as never;
  const matrix = buildMatrix(placed);
  assert.deepEqual(matrix.fields, ['肿瘤诊疗', '心脑血管', '领域未判定']);
  assert.deepEqual(matrix.stages.map((s) => s.name), ['诊断与分型', '疗效评估与预后', '环节未判定']);
  const cell = matrixCell(matrix, '肿瘤诊疗', '疗效评估与预后');
  assert.deepEqual([cell.projects, cell.maturity, cell.indicators], [1, 4, ['AUC 0.842', '多中心验证']]);
  assert.deepEqual(cell.directions.map((d) => [d.name, d.plain, d.items[0].key]), [['临床预测模型', '用病例数据算风险分', 'P1|t1']]);
  assert.equal(matrixCell(matrix, '肿瘤诊疗', '环节未判定').items[0].direction, '隐私协同');
  assert.equal(matrixCell(matrix, '领域未判定', '诊断与分型').items[0].direction, '未归入体系的条目');
  assert.deepEqual([matrix.rows.get('肿瘤诊疗')!.projects, matrix.columns.get('诊断与分型')!.items.length, matrix.projects], [2, 1, 2]);

  const leaders = buildMatrix(placed, 4);
  assert.deepEqual([leaders.total, leaders.hidden, leaders.fields, leaders.stages.map((s) => s.name)],
    [3, 2, ['肿瘤诊疗', '心脑血管'], ['诊断与分型', '疗效评估与预后']]);


  const insights = libraryInsights(buildBoard(hierarchy, placed), matrix, placed, [{ start: 2019, end: 2022 }, { start: 2021, end: null }]);
  assert.deepEqual(insights.map((card) => [card.title, card.headline]), [
    ['研究规模', '2 个项目、3 条技术，覆盖 1 个应用领域'], ['技术重心', '以统计建模为主'],
    ['应用重心', '肿瘤诊疗最集中（2 个项目），主要在“疗效评估与预后”'], ['成熟与转化', '50% 的项目报告达到成型技术或示范应用'],
    ['待突破', '1 个深化布局方向']]);
  assert.equal(insights[0].points[0], '立项 2019–2022 年');
  assert.equal(fieldHeadline(matrix, placed, '肿瘤诊疗'), '');  // fewer than 3 items: no claim

  const outline = matrixOutline('AI与医疗', matrix, buildBoard(hierarchy, placed));
  assert.match(outline, /## 肿瘤诊疗（2 个项目）\n- 本期突破：早期筛查\n- 深化布局：长尾病例/);
  assert.match(outline, /### 疗效评估与预后（1 个项目，最高 成型技术）\n- 临床预测模型（1 个项目，成型技术；AUC 0.842，多中心验证）/);
});

test('technology outline runs system, direction, theme and leading techniques with stage', () => {
  const outline = lineageOutline('AI与医疗', lineage, 1);
  assert.match(outline, /## 统计建模\n- 临床预测模型：用病例数据算风险分\n  - 列线图（1 个项目）\n    - 列线图〔4 成型技术；多中心验证〕 P1/);
  assert.match(outline, /- 隐私协同〔共性底座〕：数据不出院联合建模/);
  assert.doesNotMatch(outline, /…另|承载/);
  const two = { ...(lineage as Record<string, unknown>), categories: [{ name: '统计建模', summary: '', children: [{ name: '方向', themes: [{ name: '主题', plain: '一句说明', items: ['P1|t1', 'P2|t3'] }] }] }] } as never;
  assert.match(lineageOutline('x', two, 1), /  - 主题（2 个项目）：一句说明\n    - 列线图〔4 成型技术；多中心验证〕 P1\n    - …另 1 条/);
});

test('blank knowledge nodes merge after their siblings and leave counts alone', async () => {
  const { withBlanks } = await import('./projects.ts');
  const merged = withBlanks({ ...(lineage as Record<string, unknown>), blanks: [
    { level: 4, parent: ['统计建模'], name: '手术视频分析', plain: '', reason: '', covered: 0 },
    { level: 5, parent: ['统计建模', '手术视频分析'], name: '器械识别', plain: '', reason: '', covered: 0 },
    { level: 3, parent: [], name: '医学自然语言处理', plain: '', reason: '', covered: 15 }] } as never);
  assert.deepEqual(merged.categories.map((c) => [c.name, Boolean(c.blank)]), [['统计建模', false], ['未归入体系的条目', false], ['医学自然语言处理', true]]);
  const added = merged.categories[0].children[2];
  assert.deepEqual([added.name, added.blank, added.themes.map((t) => [t.name, t.items.length])], ['手术视频分析', true, [['器械识别', 0]]]);
  assert.equal(merged.categories[2].covered, 15);
  assert.equal((lineage as { categories: unknown[] }).categories.length, 2);  // the source lineage is untouched
});
