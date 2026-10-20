import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Upgrade plan U1 (design/界面.md §4): text sizes and UI colours come from styles/globals.css.
// Hard-coded values are how body text drifted to 11–13px and one grey-blue became twenty.
const root = new URL('.', import.meta.url).pathname;
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}
const files = sources(root).map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }));

// Colours that encode data, not chrome: each chart keeps its palette next to its legend.
const DATA_COLOURS = new Set([
  'projects.ts',                     // facet, maturity and category palettes shared by the charts
  'departments.ts',                  // NSFC department colours
  'briefing.ts',                     // maturity levels
  'libraryColors.ts',                // one hue per library (banner, material preview)
  'exportText.ts',                   // the stylesheet inside exported HTML documents
  'components/HeroCarousel.tsx',     // library hues on the leader banner (dataviz-validated)
  'components/LineageRoadmap.tsx', 'components/LineageTree.tsx', 'components/ProjectGraph.tsx',
  'components/ReportBoard.tsx', 'components/SceneFlow.tsx', 'components/TechTimeline.tsx',
  'components/YearDistribution.tsx',
]);

test('text is sized with the type scale, never a hard-coded pixel size', () => {
  const offending = files.flatMap(({ path, text }) =>
    [...text.matchAll(/text-\[\d+(?:\.\d+)?px\]/g)].map((match) => `${path}: ${match[0]}`));
  assert.deepEqual(offending, []);
});

test('interface colours come from the colour roles; only charts keep their own palettes', () => {
  const offending = files.filter(({ path }) => !DATA_COLOURS.has(path)).flatMap(({ path, text }) =>
    [...text.matchAll(/#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g)].map((match) => `${path}: ${match[0]}`));
  assert.deepEqual(offending, []);
});
