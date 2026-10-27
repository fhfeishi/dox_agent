import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { composeQuestion, type ComposedQuestion } from "../api";
import { hierarchyQuery } from "../projects";
import { useApp } from "../store";
import { Icon } from "./Icons";

const TASKS: [string, string][] = [["task1", "精准问答"], ["task2", "对比分析"], ["task3", "技术研判"], ["task4", "专项报告生成"]];
const ELEMENTS = ["技术谱系", "场景", "问题", "关键技术", "成果"];
// Grouped by the question a leader actually asks: where we are, what is missing, how we compare.
const INTENTS = [
  "这个领域有哪些研究路线",
  "已经实现了哪些工作",
  "哪些方向已进入示范应用或转化",
  "哪些方向还停留在理论与方法阶段",
  "关键技术还需要哪些配套技术",
  "还有哪些工作可以做",
  "有哪些代表性项目",
  "主要承担单位与负责人是谁",
  "项目数量与经费投入如何",
  "与国内外同类研究差在哪",
];
const MAX_INTENTS = 3;
// The panel sends what is typed in the input box as the question's core. A question this panel itself
// put there is not the user's words: asking again treats it as an earlier draft to move away from.
const filled = new Set<string>();
const NOTE_MAX = 300;

/**
 * 时间维度 (query 2026-1021): the picked span becomes a `YYYY—YYYY` phrase in the question, which is
 * exactly what the retriever reads as a project-year filter, so choosing 近五年 also narrows the search.
 */
const YEAR = new Date().getFullYear();
const TIMES: { key: string; label: string; from: number; to: number }[] = [
  { key: "", label: "不限时间", from: 0, to: 0 },
  { key: "near3", label: "近 3 年", from: YEAR - 2, to: YEAR },
  { key: "near5", label: "近 3–5 年", from: YEAR - 5, to: YEAR },
  { key: "near10", label: "近 5–10 年", from: YEAR - 10, to: YEAR },
  { key: "near15", label: "15 年内", from: YEAR - 15, to: YEAR },
];

// Each task starts with a typical choice, so 生成问题 works the moment the page opens (query 2026-1015 1639).
export const DEFAULTS: Record<string, { elements: string[]; intents: string[] }> = {
  task1: { elements: ["关键技术"], intents: ["已经实现了哪些工作"] },
  task2: { elements: ["技术谱系", "成果"], intents: ["有哪些代表性项目"] },
  task3: { elements: ["技术谱系", "关键技术"], intents: ["这个领域有哪些研究路线", "还有哪些工作可以做"] },
  task4: { elements: ["场景", "问题", "关键技术", "成果"], intents: ["已经实现了哪些工作"] },
};

function Chip({ on, onClick, children, disabled, title }: {
  on: boolean; onClick: () => void; children: string; disabled?: boolean; title?: string;
}) {
  return <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled} title={title}
    className={`rounded-full border px-[11px] py-[4px] text-caption transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${on
      ? "border-[var(--primary)] bg-[var(--primary-soft)] font-medium text-[var(--primary-pressed)]"
      : "border-[var(--hairline-strong)] text-[var(--slate)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft-2)]"}`}>{children}</button>;
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="grid grid-cols-[60px_minmax(0,1fr)] items-start gap-x-[10px]">
    <span className="pt-[5px] text-caption text-[var(--stone)]">{label}</span>
    <div className="min-w-0">
      <div className="flex flex-wrap gap-[6px]">{children}</div>
      {hint ? <p className="mt-[5px] text-caption leading-[1.5] text-[var(--stone)]">{hint}</p> : null}
    </div>
  </div>;
}

/**
 * Click-to-ask (query 2026-1009 ⑤): users pick a task, elements, a time window and follow-up asks; the
 * model writes them into one question that lands in the input box for editing before sending.
 *
 * It is a popover anchored above the composer (query 2026-1021): the earlier inline panel pushed the
 * page and the conversation up every time it opened, and its only exit was a small 收起 link. Now
 * clicking outside, Escape, the ✕ in its head and the toolbar button all close it; it never moves the
 * page; the toolbar button carries aria-expanded so the state is announced.
 */
export function QuickAsk({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { taskId, corpusIds, askInTask, busy, sessionBusy, input } = useApp();
  const [task, setTask] = useState(TASKS.some(([id]) => id === taskId) ? taskId : "task1");
  // Follow the session's task when it changes elsewhere (task menu, session list).
  useEffect(() => { if (TASKS.some(([id]) => id === taskId)) setTask(taskId); }, [taskId]);
  const [elements, setElements] = useState<string[]>(() => DEFAULTS[task].elements);
  const [intents, setIntents] = useState<string[]>(() => DEFAULTS[task].intents);
  // Choosing another task brings that task's typical choice.
  useEffect(() => { setElements(DEFAULTS[task].elements); setIntents(DEFAULTS[task].intents); }, [task]);
  const [time, setTime] = useState("");
  const [scene, setScene] = useState("");
  const [allScenes, setAllScenes] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Drafts for the current picks (query 2026-1021 1619): 换一个角度 adds one, ‹ › goes back to an
  // earlier one, and changing any pick starts over, since the old drafts no longer match it.
  const [drafts, setDrafts] = useState<ComposedQuestion[]>([]);
  const [shown, setShown] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const { data: hierarchy } = useQuery({ ...hierarchyQuery(corpusIds[0] ?? ""), enabled: Boolean(corpusIds[0]), staleTime: 60_000 });
  const scenes = hierarchy?.scenes.map((item) => item.name) ?? [];
  const scopeKey = corpusIds.join("|");
  useEffect(() => { setScene(""); setAllScenes(false); }, [scopeKey]);

  // Dismiss on click outside and on Escape. Clicks, not mousedown: a mousedown here would close on the
  // toolbar button before its own click reopened, so that button could never shut the panel.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const path = event.composedPath();
      if (panel.current && path.includes(panel.current)) return;
      // The toolbar button owns the toggle. React flushes the effect that registered this listener
      // before the same click finishes bubbling, so without this the button would open the panel and
      // this listener would close it again — the panel could never be reopened (found 2026-1021).
      if (path.some((node) => node instanceof Element && (node.getAttribute("aria-controls") === "quick-ask-panel" || node.closest('[aria-modal="true"]')))) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); document.querySelector<HTMLButtonElement>('[aria-controls="quick-ask-panel"]')?.focus(); }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const toggle = (list: string[], value: string, set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const toggleIntent = (value: string) => {
    if (value === "综合分析") {
      if (intents.includes(value)) setIntents([]);
      else { setIntents([value]); setElements(ELEMENTS); }
      return;
    }
    const focused = intents.filter((item) => item !== "综合分析");
    if (!focused.includes(value) && focused.length >= MAX_INTENTS) return;
    toggle(focused, value, setIntents);
  };

  const span = TIMES.find((item) => item.key === time);
  const period = span && span.from ? `${span.from}—${span.to}` : "";
  const picked = elements.length + intents.length + (time ? 1 : 0) + (scene ? 1 : 0);
  const typed = input.trim();
  const note = filled.has(typed) ? "" : typed.slice(0, NOTE_MAX);
  // Mirrors the server's SPARSE_PICKS: a thin selection with nothing typed may borrow a library angle.
  const sparse = !intents.includes("综合分析") && !note && elements.length + intents.length + (scene ? 1 : 0) <= 2;
  const picks = JSON.stringify([task, scopeKey, elements, intents, time, scene, note]);
  useEffect(() => { setDrafts([]); setShown(0); }, [picks]);
  const draft = drafts[shown];

  function reset() {
    setElements(DEFAULTS[task].elements);
    setIntents(DEFAULTS[task].intents);
    setTime("");
    setScene("");
    setError("");
  }

  async function generate() {
    setPending(true); setError("");
    // Every earlier draft for these picks, plus a generated question still sitting in the input box.
    const earlier = [...drafts.map((item) => item.question), ...(typed && !note ? [typed] : [])];
    try {
      const next = await composeQuestion({
        task: TASKS.find(([id]) => id === task)![1], elements, intents, corpus_ids: corpusIds,
        scene: scenes.includes(scene) ? scene : "", period, note, avoid: [...new Set(earlier)].slice(-5),
      });
      setDrafts((list) => [...list, next]);
      setShown(drafts.length);
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }

  async function use() {
    if (!draft) return;
    filled.add(draft.question);
    await askInTask(task, draft.question);
    onClose();
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-guide="chat-input"]')?.focus());
  }

  return (
    <div id="quick-ask-panel" ref={panel} role="dialog" aria-label="点选提问" data-guide="chat-quick"
      className="quick-ask composer-panel" style={open ? undefined : { display: "none" }}>
      <div className="flex shrink-0 items-center gap-[8px] border-b border-[var(--hairline-soft)] px-[14px] py-[10px]">
        <span className="grid size-[24px] shrink-0 place-items-center rounded-[7px] bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon name="checklist" size={14} strokeWidth={1.9} />
        </span>
        <span className="text-body font-semibold text-[var(--ink)]">点选提问</span>
        <span className="min-w-0 flex-1 truncate text-caption text-[var(--stone)]">选好后生成问题，填入输入框，可再改</span>
        <button type="button" aria-label="关闭点选提问" onClick={onClose}
          className="grid size-[24px] shrink-0 place-items-center rounded-[6px] text-[var(--stone)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]">
          <Icon name="close" size={13} strokeWidth={2.1} />
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-[11px] overflow-y-auto px-[14px] py-[12px]">
        {note ? <Row label="已输入" hint="生成的问题以这段文字为核心，点选的条件围绕它展开">
          <span className="min-w-0 max-w-full truncate rounded-[6px] bg-[var(--surface)] px-[9px] py-[4px] text-caption text-[var(--ink)]" title={note}>{note}</span>
        </Row> : null}
        <Row label="任务">
          {TASKS.map(([id, name]) => <Chip key={id} on={task === id} onClick={() => setTask(id)}>{name}</Chip>)}
        </Row>
        <Row label="关注要素">
          {ELEMENTS.map((item) => <Chip key={item} on={elements.includes(item)} onClick={() => {
            toggle(elements, item, setElements);
            if (intents.includes("综合分析")) setIntents([]);
          }}>{item}</Chip>)}
        </Row>
        <Row label="时间"
          hint={period
            ? <>检索时按项目起止年份与 <b className="font-medium text-[var(--slate)]">{period}</b> 相交筛选，年份取自文件名</>
            : "不选则覆盖全部年份；选了会把年份区间写进问题，检索与报告一起收敛"}>
          {TIMES.map((item) => <Chip key={item.key} on={time === item.key} onClick={() => setTime(time === item.key ? "" : item.key)}
            title={item.from ? `${item.from}—${item.to}` : "全部立项年份"}>{item.label}</Chip>)}
        </Row>
        <Row label="附带问题"
          hint={intents.includes("综合分析") ? "覆盖研究路线、进展、成果、投入与缺口；也可改选具体问题" : `最多 ${MAX_INTENTS} 项`}>
          <Chip on={intents.includes("综合分析")} onClick={() => toggleIntent("综合分析")}>综合分析</Chip>
          {INTENTS.map((item) => {
            const on = intents.includes(item);
            return <Chip key={item} on={on} disabled={!on && intents.length >= MAX_INTENTS} onClick={() => toggleIntent(item)}>{item}</Chip>;
          })}
        </Row>
        <Row label="关注场景">
          <Chip on={!scene} onClick={() => setScene("")}>综合</Chip>
          {(allScenes ? scenes : scenes.slice(0, 8)).map((item) =>
            <Chip key={item} on={scene === item} onClick={() => setScene(scene === item ? "" : item)}>{item}</Chip>)}
          {scenes.length > 8 ? <button type="button" onClick={() => setAllScenes(!allScenes)}
            className="rounded-full px-[8px] py-[4px] text-caption text-[var(--stone)] transition-colors hover:text-[var(--primary)]">
            {allScenes ? "收起" : `还有 ${scenes.length - 8} 个`}
          </button> : null}
        </Row>
      </div>

      {draft ? <div aria-live="polite" className="quick-ask-draft shrink-0 border-t border-[var(--hairline-soft)] px-[14px] py-[10px]">
        <div className="mb-[5px] flex items-center gap-[6px] text-caption text-[var(--stone)]">
          <span className="font-medium text-[var(--slate)]">生成的问题</span>
          {drafts.length > 1 ? <span className="inline-flex items-center gap-[2px]">
            <button type="button" aria-label="上一版" disabled={shown === 0} onClick={() => setShown(shown - 1)}
              className="grid size-[18px] place-items-center rounded-[4px] hover:bg-[var(--surface)] disabled:opacity-30">‹</button>
            <span className="tabular-nums">{shown + 1} / {drafts.length}</span>
            <button type="button" aria-label="下一版" disabled={shown === drafts.length - 1} onClick={() => setShown(shown + 1)}
              className="grid size-[18px] place-items-center rounded-[4px] hover:bg-[var(--surface)] disabled:opacity-30">›</button>
          </span> : null}
        </div>
        <p className="text-body leading-[1.65] text-[var(--ink)]">{draft.question}</p>
        {draft.added.length ? <p className="mt-[4px] text-caption text-[var(--stone)]">
          补充了本资料库中的：{draft.added.map((name) => <b key={name} className="font-medium text-[var(--primary-pressed)]">「{name}」</b>)}
        </p> : null}
      </div> : null}

      <div className="flex shrink-0 flex-wrap items-center gap-[8px] border-t border-[var(--hairline-soft)] bg-[var(--surface-soft)] px-[14px] py-[9px]">
        <span className="min-w-0 text-caption text-[var(--stone)]">
          {picked || note
            ? `${note ? "已输入文字 · " : ""}已选 ${picked} 项${period ? ` · ${period}` : ""}${sparse ? " · 选得较少，会借用本库的场景或问题补一个角度" : ""}`
            : "先选条件，或直接在上方输入框提问"}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={reset}
          className="rounded-[6px] px-[9px] py-[5px] text-caption text-[var(--slate)] transition-colors hover:bg-[var(--surface)]">重置</button>
        {draft ? <>
          <button type="button" disabled={pending || busy || sessionBusy} onClick={() => void generate()}
            className="inline-flex items-center gap-[5px] rounded-[7px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[11px] py-[5px] text-body text-[var(--slate)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-pressed)] disabled:opacity-45">
            {pending ? "正在换角度…" : "换一个角度"}
          </button>
          <button type="button" disabled={pending || busy || sessionBusy} onClick={() => void use()}
            className="inline-flex items-center gap-[5px] rounded-[7px] bg-[var(--primary)] px-[13px] py-[6px] text-body text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:opacity-45">
            填入输入框<i className="not-italic" aria-hidden="true">→</i>
          </button>
        </> : <button type="button" disabled={pending || busy || sessionBusy || !(picked || note)} onClick={() => void generate()}
          className="inline-flex items-center gap-[5px] rounded-[7px] bg-[var(--primary)] px-[13px] py-[6px] text-body text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:opacity-45">
          {pending ? "正在生成问题…" : "生成问题"}
          {pending ? null : <i className="not-italic" aria-hidden="true">→</i>}
        </button>}
        {task !== taskId ? <span className="w-full text-caption text-[var(--stone)]">将新建「{TASKS.find(([id]) => id === task)![1]}」会话，沿用当前资料库</span> : null}
        {error ? <span role="alert" className="w-full text-caption text-[var(--red)]">{error}</span> : null}
      </div>
    </div>
  );
}
