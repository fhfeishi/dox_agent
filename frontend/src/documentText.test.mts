import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutFrontMatter } from './documentText.ts';

test('previews drop the imported YAML block and keep the body', () => {
  const body = '# 项目\n\n| 字段 | 内容 |\n| --- | --- |\n| 批准号 | 1 |\n';
  assert.equal(withoutFrontMatter(`---\nid: x\nprojectName: 项目\n---\n\n${body}`), `\n${body}`);
  assert.equal(withoutFrontMatter(`﻿---\r\nid: x\r\n---\r\n${body}`), body);
  // A rule inside the text, or text without a leading block, is left alone.
  assert.equal(withoutFrontMatter(`正文\n---\n下文`), `正文\n---\n下文`);
  assert.equal(withoutFrontMatter(body), body);
});
