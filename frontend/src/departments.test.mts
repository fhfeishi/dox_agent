import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSectors, codeOf } from './departments.ts';

const many = (code: string, n: number) => Array.from({ length: n }, () => code);

test('every department keeps a sector; large ones split by code, small codes merge inside', () => {
  const codes = [...many('H2701', 60), ...many('H1801', 20), ...many('H3001', 3), ...many('F0601', 30), ...many('F0201', 10),
    ...many('C0601', 4), 'A0401', 'L0101', null, ''];
  const { sectors, departments, keyOf } = buildSectors(codes);
  assert.deepEqual(sectors.map((s) => [s.key, s.label, s.count]), [
    ['H27', 'H27 · 医学', 60], ['H18', 'H18 · 医学', 20], ['H*', '医学 · 其他代码', 3],
    ['F06', 'F06 · 信息', 30], ['F02', 'F02 · 信息', 10],
    ['C', '生命科学部', 4], ['A', '数理科学部', 1],
    ['代码待核对', '代码待核对', 1], ['代码未知', '代码未知', 2],
  ]);
  assert.deepEqual(departments.map((d) => [d.name, d.count]), [
    ['医学科学部', 83], ['信息科学部', 40], ['生命科学部', 4], ['数理科学部', 1], ['代码待核对', 1], ['代码未知', 2]]);
  assert.deepEqual(departments.find((d) => d.name === '代码待核对')!.codes, ['L01']);
  assert.deepEqual([keyOf('H3001'), keyOf('H2701'), keyOf('C0601'), keyOf('L0101'), keyOf(undefined)], ['H*', 'H27', 'C', '代码待核对', '代码未知']);
  assert.deepEqual(codeOf('F06'), { dept: 'F', code: 'F06' });
});

test('a department below the split size stays one sector', () => {
  const { sectors } = buildSectors([...many('G0101', 5), ...many('G0201', 4)]);
  assert.deepEqual(sectors.map((s) => [s.key, s.count, s.codes]), [['G', 9, ['G01', 'G02']]]);
});
