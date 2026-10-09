import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { composeQuestion } from "../api";
import { hierarchyQuery } from "../projects";
import { useApp } from "../store";

const TASKS: [string, string][] = [["task1", "精准问答"], ["task2", "对比分析"], ["task3", "技术研判"], ["task4", "专项报告生成"]];
const ELEMENTS = ["技术谱系", "场景", "问题", "关键技术", "成果"];
const INTENTS = ["这个领域有哪些研究路线", "已经实现了哪些工作", "还有哪些工作可以做", "关键技术还需要哪些配套技术", "有哪些代表性项目"];
const OPEN_KEY = "dox-quick-ask-open";

function readOpen() {
  try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; }
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return <button type="button" aria-pressed={on} onClick={onClick}
    className={`rounded-full border px-[10px] py-[3px] text-[12px] transition-colors ${on
      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-pressed)]"
      : "border-[var(--hairline-strong)] text-[var(--slate)] hover:border-[var(--primary)]"}`}>{children}</button>;
}

/**
 * Click-to-ask (query 2026-1009 ⑤): users pick a task, elements and follow-up asks; the model
 * writes them into one question that lands in the input box for editing before sending.
 */
export function QuickAsk() {
  const { taskId, corpusIds, askInTask, busy, sessionBusy } = useApp();
  const [open, setOpen] = useState(readOpen);
  const [task, setTask] = useState(TASKS.some(([id]) => id === taskId) ? taskId : "task1");
  // Follow the session's task when it changes elsewhere (task menu, session list).
  useEffect(() => { if (TASKS.some(([id]) => id === taskId)) setTask(taskId); }, [taskId]);
  const [elements, setElements] = useState<string[]>([]);
  const [intents, setIntents] = useState<string[]>([]);
  const [scene, setScene] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { data: hierarchy } = useQuery({ ...hierarchyQuery(corpusIds[0] ?? ""), enabled: open && Boolean(corpusIds[0]), staleTime: 60_000 });
  const scenes = hierarchy?.scenes.map((item) => item.name) ?? [];

  const toggle = (list: string[], value: string, set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  function setOpenSaved(next: boolean) {
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* per-viewer convenience only */ }
  }

  async function generate() {
    setPending(true); setError("");
    try {
      const question = await composeQuestion({
        task: TASKS.find(([id]) => id === task)![1], elements, intents, corpus_ids: corpusIds,
        scene: scenes.includes(scene) ? scene : "",
      });
      await askInTask(task, question);
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }

  if (!open) return <button type="button" onClick={() => setOpenSaved(true)}
    className="mb-[8px] text-[12px] text-[var(--link)] hover:underline">展开点选提问</button>;

  const label = "w-[64px] shrink-0 pt-[4px] text-[11.5px] text-[var(--stone)]";
  return (
    <section aria-label="点选提问" className="mb-[8px] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[11px] py-[9px]">
      <div className="mb-[6px] flex items-center gap-[8px]">
        <span className="text-[12.5px] font-semibold text-[var(--ink)]">点选提问</span>
        <span className="text-[11.5px] text-[var(--stone)]">点选后生成问题，填入输入框，可修改再发送</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setOpenSaved(false)} className="text-[11.5px] text-[var(--stone)] hover:text-[var(--ink)]">收起</button>
      </div>
      <div className="space-y-[5px]">
        <div className="flex gap-[6px]"><span className={label}>任务</span><div className="flex flex-wrap gap-[6px]">
          {TASKS.map(([id, name]) => <Chip key={id} on={task === id} onClick={() => setTask(id)}>{name}</Chip>)}
        </div></div>
        <div className="flex gap-[6px]"><span className={label}>关注要素</span><div className="flex flex-wrap gap-[6px]">
          {ELEMENTS.map((item) => <Chip key={item} on={elements.includes(item)} onClick={() => toggle(elements, item, setElements)}>{item}</Chip>)}
        </div></div>
        {scenes.length ? <div className="flex gap-[6px]"><span className={label}>关注场景</span><div className="flex flex-wrap gap-[6px]">
          {scenes.map((item) => <Chip key={item} on={scene === item} onClick={() => setScene(scene === item ? "" : item)}>{item}</Chip>)}
        </div></div> : null}
        <div className="flex gap-[6px]"><span className={label}>附带问题</span><div className="flex flex-wrap gap-[6px]">
          {INTENTS.map((item) => <Chip key={item} on={intents.includes(item)} onClick={() => toggle(intents, item, setIntents)}>{item}</Chip>)}
        </div></div>
      </div>
      <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
        <button type="button" disabled={pending || busy || sessionBusy || !corpusIds.length || (!elements.length && !intents.length && !scene)}
          onClick={() => void generate()}
          className="rounded-[7px] bg-[var(--primary)] px-[12px] py-[5px] text-[12.5px] text-white disabled:opacity-45">
          {pending ? "正在生成问题…" : "生成问题"}
        </button>
        {task !== taskId ? <span className="text-[11.5px] text-[var(--stone)]">将新建「{TASKS.find(([id]) => id === task)![1]}」会话，沿用当前知识库</span> : null}
        {error ? <span role="alert" className="text-[12px] text-[var(--red)]">{error}</span> : null}
      </div>
    </section>
  );
}
