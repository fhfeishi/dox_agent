import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Upgrade plan U1 (design/界面.md §4): text sizes come from the type scale in styles/globals.css
// (text-caption 12 … text-display 38). A hard-coded pixel size is how body text drifted to 11–13px.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

test('components size text with the type scale, never a hard-coded pixel size', () => {
  const offending = sources(new URL('.', import.meta.url).pathname).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/text-\[\d+(?:\.\d+)?px\]/g)].map((match) => `${file}: ${match[0]}`));
  assert.deepEqual(offending, []);
});
