import type { Options } from "./api.ts";
import type { Turn } from "./conversation.ts";

/** An in-session branch: the full turn snapshot from the divergence point onward. */
export type Branch = { id: string; fromIndex: number; turns: Turn[]; label: string; createdAt: string; options: Options };

/** Branch records share the 4MB session record with turns; keep branch bytes bounded. */
export const MAX_BRANCH_BYTES = 1_500_000;

export function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Snapshot `turns.slice(index)` as a branch. The caller truncates the main turns. */
export function createBranch(turns: Turn[], index: number, existing: Branch[], options: Options, id = crypto.randomUUID(), now = new Date().toISOString()): Branch {
  return { id, fromIndex: index, turns: deepCopy(turns.slice(index)), label: `分支 (${existing.length + 1})`, createdAt: now, options: deepCopy(options) };
}

/** Keep the newest branches under the byte budget; always keep at least one. */
export function trimBranches(branches: Branch[], budget = MAX_BRANCH_BYTES): { branches: Branch[]; trimmed: boolean } {
  const kept = [...branches];
  let trimmed = false;
  while (kept.length > 1 && byteSize(kept) > budget) {
    kept.shift();
    trimmed = true;
  }
  return { branches: kept, trimmed };
}

export function branchesAtIndex(branches: Branch[], index: number): Branch[] {
  return branches.filter(branch => branch.fromIndex === index);
}
