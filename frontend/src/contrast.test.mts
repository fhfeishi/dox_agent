import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Secondary text was readable on paper and not on screen: --steel #6b7a8c reached 4.39:1 on --canvas
// and 3.66:1 on a pressed row, and --muted-cool #8a98aa only 2.6:1 on the to-do chip. Both carried real
// sentences (todo details, card notes, counts), not decoration. WCAG AA asks 4.5:1 for body text; this
// test keeps the neutral text roles above it so a future tint cannot quietly drop back under.
const root = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(`${root}styles/globals.css`, 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `--${name} is missing from globals.css`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every surface a note can sit on, including a hovered row and the segmented control's track.
const SURFACES = ['canvas', 'surface-soft', 'surface', 'surface-cool', 'surface-sink', 'surface-press', 'line-cool-soft'];

test('secondary text clears WCAG AA (4.5:1) on every cool surface it is used on', () => {
  const failures: string[] = [];
  for (const role of ['steel', 'stone', 'text-3', 'muted-cool']) {
    for (const surface of SURFACES) {
      const ratio = contrast(token(role), token(surface));
      if (ratio < 4.5) failures.push(`--${role} on --${surface}: ${ratio.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(failures, []);
});
