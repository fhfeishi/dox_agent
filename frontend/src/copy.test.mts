import { fileURLToPath } from "node:url";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RETIRED, TERMS } from './copy.ts';
import { NAV } from './navigation.ts';

// Upgrade plan U3: a renamed concept must not linger anywhere a person can read it.
const root = fileURLToPath(new URL('.', import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') && name !== 'copy.ts' ? [path] : [];
  });
}
// Comments may keep history (“named 成果 until …”); what is shown may not.
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

test('no retired name is left in the interface', () => {
  const found = sources(root).flatMap((path) => {
    const text = withoutComments(readFileSync(path, 'utf8'));
    return RETIRED.filter((word) => text.includes(word)).map((word) => `${relative(root, path)}: ${word}`);
  });
  assert.deepEqual(found, []);
});

test('the navigation is labelled with the term table', () => {
  const names = new Set(Object.values(TERMS).map((term) => term.name));
  for (const entry of NAV) if (entry.key !== 'overview') assert.ok(names.has(entry.label), `${entry.label} is not in the term table`);
  for (const entry of NAV) if (entry.card) assert.ok(names.has(entry.card.title), `${entry.card.title} is not in the term table`);
});
