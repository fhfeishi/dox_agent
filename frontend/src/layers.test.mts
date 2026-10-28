import { fileURLToPath } from "node:url";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Upgrade plan F1: a page asks for data through the API modules (api.ts, authApi.ts, reviewApi.ts and
// the data modules beside them), never with its own fetch. Five pages once each read the library
// overview their own way; one query now serves them all and shares one cache.
const root = fileURLToPath(new URL('.', import.meta.url));
function views(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return views(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

test('no view requests data itself', () => {
  const offending = views(root).flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    return [...text.matchAll(/(?<![\w.])fetch\(/g)].map(() => relative(root, path));
  });
  assert.deepEqual(offending, []);
});
