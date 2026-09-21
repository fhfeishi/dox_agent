import { test } from "node:test";
import assert from "node:assert/strict";
import { branchesAtIndex, byteSize, createBranch, deepCopy, trimBranches, type Branch } from "./branches.ts";

const options = { allowed_doc_ids: null };
const turn = (question: string, answer: string) => ({ question, answer, previousAttempts: [], sources: [] });
const branch = (id: string, fromIndex = 0, size = 0): Branch => ({
  id, fromIndex, label: id, createdAt: "2026-09-21T00:00:00.000Z", options,
  turns: [turn("q".repeat(size), "a".repeat(size))],
}) as unknown as Branch;

test("createBranch snapshots a deep copy from the divergence index", () => {
  const turns = [turn("q0", "a0"), turn("q1", "a1"), turn("q2", "a2")];
  const created = createBranch(turns as never, 1, [], options, "id-1", "2026-09-21T00:00:00.000Z");
  assert.equal(created.fromIndex, 1);
  assert.equal(created.label, "分支 (1)");
  assert.deepEqual(created.turns.map(t => t.question), ["q1", "q2"]);
  turns[1].answer = "mutated";
  assert.equal(created.turns[0].answer, "a1", "branch must not alias the live turns");
  assert.deepEqual(createBranch(turns as never, 0, [created], options).label, "分支 (2)");
});

test("trimBranches keeps the newest under the byte budget and always keeps one", () => {
  const branches = [branch("old", 0, 400), branch("mid", 0, 400), branch("new", 0, 400)];
  const budget = byteSize([branches[2]]);
  const trimmed = trimBranches(branches, budget);
  assert.equal(trimmed.trimmed, true);
  assert.ok(trimmed.branches.length < branches.length);
  assert.equal(trimmed.branches.at(-1)!.id, "new");
  assert.ok(byteSize(trimmed.branches) <= budget);
  const single = trimBranches([branch("only", 0, 400)], 1);
  assert.equal(single.branches.length, 1);
  assert.equal(single.trimmed, false);
});

test("branchesAtIndex finds divergence markers and deepCopy isolates values", () => {
  assert.deepEqual(branchesAtIndex([branch("a", 2), branch("b", 2), branch("c", 5)], 2).map(b => b.id), ["a", "b"]);
  const source = { nested: { value: 1 } };
  const copy = deepCopy(source);
  copy.nested.value = 2;
  assert.equal(source.nested.value, 1);
});
