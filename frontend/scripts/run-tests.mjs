// Runs every src/**/*.test.mts with node's built-in test runner and fails loudly when that is
// not really happening (F7/Q5). `node --test src/` behaved differently per Node version: on
// Node 20 it ran 0 tests and still exited 0, on Node 24 it errored, on Node 26 it worked.
// Plain JavaScript on purpose, so it can explain the problem even on an old Node.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// The tests are TypeScript run directly by Node, which needs built-in type stripping
// (on by default from Node 22.18 / 23.6; see "engines" in package.json).
if (!process.features?.typescript) {
  console.error(`npm test needs Node ^22.18.0 or >=23.6.0 (runs .mts tests without a build step); this is ${process.version}.`);
  process.exit(1);
}

function testFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : testFiles(path);
    return entry.name.endsWith(".test.mts") ? [path] : [];
  });
}

const files = testFiles(join(root, "src")).sort();
if (files.length === 0) {
  console.error("npm test found no src/**/*.test.mts files; refusing to report success.");
  process.exit(1);
}

// Human-readable output on the console, plus TAP in a temp file so we can count what ran.
const work = mkdtempSync(join(tmpdir(), "dox-node-test-"));
const tap = join(work, "report.tap");
const result = spawnSync(process.execPath, [
  "--test", "--test-reporter=spec", "--test-reporter-destination=stdout",
  "--test-reporter=tap", `--test-reporter-destination=${tap}`,
  ...files.map((file) => relative(root, file)),
], { cwd: root, stdio: "inherit" });
const summary = readFileSync(tap, "utf8");
rmSync(work, { recursive: true, force: true });

if (result.status !== 0) process.exit(result.status ?? 1);
// A file that defines no tests shows up in TAP as one passing "test" named after the file.
const empty = [...summary.matchAll(/^ok \d+ - (\S+\.test\.mts)$/gm)].map((match) => match[1]);
const count = Number(/^# tests (\d+)$/m.exec(summary)?.[1] ?? 0) - empty.length;
if (count <= 0 || empty.length > 0) {
  console.error(`npm test: ${Math.max(count, 0)} tests ran; files with no tests: ${empty.join(", ") || "none"}.`);
  process.exit(1);
}
console.log(`npm test: ${count} tests in ${files.length} files passed.`);
