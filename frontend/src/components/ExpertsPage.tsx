import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import {
  clearExpertMemory, fetchExpertMemory, saveExpertMemory, type ExpertMemory,
} from "../api";
import { Button, Card, GroupLabel } from "./ui";

/** 专家 (2026-11-13): one expert per account, remembered as two short texts.
 *
 * The page exists to *correct* what was learned, not to configure it: the review pass writes after
 * each task, and the person deletes a line that is wrong or empties a store that has drifted. There
 * is no seat picker, no candidate queue and no JSON — those belonged to the five-table design whose
 * learning loop never closed.
 */
export function ExpertsAdminPage() {
  const admin = useAuth().role === "admin";
  if (!admin) return <main className="p-[20px] text-body text-[var(--steel)]">专家仅管理员可见。</main>;
  return <ExpertsPage />;
}

const TARGETS: { key: "profile" | "practice"; title: string; hint: string }[] = [
  { key: "profile", title: "输出偏好", hint: "希望结果长什么样：篇幅、结构、编号方式、术语、引用习惯" },
  { key: "practice", title: "我的做法", hint: "完成这类任务的步骤、要检查的项、常见的坑" },
];

export function ExpertsPage() {
  const [memory, setMemory] = useState<ExpertMemory | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await fetchExpertMemory();
      setMemory(next);
      setDrafts({ profile: next.profile.items.join("\n"), practice: next.practice.items.join("\n") });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (target: "profile" | "practice") => {
    setBusy(target); setError(""); setNotice("");
    try {
      // One entry per line: the store joins them with its own delimiter and enforces the budget.
      const items = (drafts[target] ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
      setMemory(await saveExpertMemory(target, items));
      setNotice("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };

  const wipe = async (target: "profile" | "practice") => {
    if (!window.confirm("清空这一栏？之后可以重新累积。")) return;
    setBusy(target); setError(""); setNotice("");
    try {
      setMemory(await clearExpertMemory(target));
      setDrafts((current) => ({ ...current, [target]: "" }));
      setNotice("已清空");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };

  return <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-soft)]">
    <div className="mx-auto my-6 w-full max-w-[860px] px-4">
      <header className="mb-4">
        <h1 className="text-page font-semibold text-[var(--ink)]">专家</h1>
        <p className="mt-1 text-body text-[var(--steel)]">
          每次任务结束后，系统会复盘这次做得怎么样，把值得长期沿用的偏好和做法记下来。
          这里显示已经记住的内容——发现哪条不对，删掉或改掉即可。
        </p>
      </header>

      {error ? <p role="alert" className="mb-3 text-body text-[var(--red)]">{error}</p> : null}
      {notice ? <p role="status" className="mb-3 text-body text-[var(--ok-fg)]">{notice}</p> : null}

      {memory ? TARGETS.map(({ key, title, hint }) => {
        const text = memory[key];
        const used = (drafts[key] ?? "").length;
        const full = used > text.limit;
        return <Card key={key} className="mb-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <GroupLabel>{title}</GroupLabel>
            <span className={`text-caption tabular-nums ${full ? "text-[var(--red)]" : "text-[var(--steel)]"}`}>
              {used} / {text.limit} 字
            </span>
          </div>
          <p className="mt-1 mb-2 text-caption text-[var(--steel)]">{hint}</p>
          <textarea
            aria-label={title}
            className="min-h-[120px] w-full resize-y rounded-md border border-[var(--hairline)] bg-[var(--canvas)] p-[8px] text-body leading-[1.6] text-[var(--ink)]"
            value={drafts[key] ?? ""}
            placeholder="还没有记住任何内容。任务结束后会自动出现。"
            onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" disabled={busy === key || full} onClick={() => void save(key)}>保存</Button>
            <Button size="sm" variant="ghost" disabled={busy === key} onClick={() => void wipe(key)}>清空</Button>
            <span className="text-caption text-[var(--steel)]">一行一条</span>
          </div>
        </Card>;
      }) : <p role="status" className="text-body text-[var(--steel)]">正在读取……</p>}
    </div>
  </main>;
}
