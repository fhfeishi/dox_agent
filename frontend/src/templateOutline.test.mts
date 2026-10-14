import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTemplate } from './templateOutline.ts';

test('an uploaded report becomes a template outline with chapters, sub-sections and guidance', () => {
  const text = [
    '技术研判报告', '一、研究背景', '说明本领域的需求与政策背景。', '这一段不作为撰写要求。',
    '（一）国内现状', '1.1 主要团队', '二、主要结论', '本报告认为该方向前景较好。', '三、建议',
  ].join('\n');
  const result = extractTemplate(text, '技术研判报告');
  assert.equal(result.extracted, true);
  assert.equal(result.sections, 5);
  assert.match(result.content, /^# 技术研判报告/);
  assert.match(result.content, /## 一、研究背景\n\n说明本领域的需求与政策背景。\n\n### （一）国内现状/);
  assert.ok(!result.content.includes('这一段不作为撰写要求'));
  assert.match(result.content, /### 1\.1 主要团队\n\n## 二、主要结论/);
  // A long sentence ending in 。 is never taken for a heading.
  assert.ok(!/## 本报告认为/.test(result.content));
});

test('markdown headings keep their level, and text without headings is kept as it is', () => {
  const md = extractTemplate('# 模板\n## 研究范围\n### 资料来源\n正文', '模板');
  assert.deepEqual([md.sections, md.content.includes('## 研究范围\n\n### 资料来源')], [2, true]);
  const plain = extractTemplate('只有一段说明文字，没有任何标题。', '说明');
  assert.deepEqual(plain, { content: '只有一段说明文字，没有任何标题。', sections: 0, extracted: false });
});
