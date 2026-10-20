import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReportMarkdown } from "./ReportMarkdown";
import { createArtifact, createReport, fetchTemplates, preflightReport, streamChat, templateArea, templateLabel, type Message, type Source, type TemplateSummary } from "../api";
import { useApp } from "../store";
import type { DocumentInfo } from "../useDocuments";
import type { Project } from "../projects";
import { Icon } from "./Icons";
import { PANEL_SHELL, PanelButton, PanelHeader } from "./Panel";
import { GenerationProgress } from "./GenerationProgress";

type Answer = { kind: "answer"; question: string; task: string; scope: string; runId: string; answer: string; sources: Source[]; error?: string; saved?: string };
type Report = { kind: "report"; topic: string; scope: string; runId: string; state: "checking" | "generating" | "done" | "failed"; note: string; artifactId?: string; error?: string };
type Item = Answer | Report;

const TASK_NAME: Record<string, string> = { task1: "精准问答", task2: "对比分析", task3: "技术研判", task4: "专项报告" };

/** Questions to start with, by scope: the whole library, one project, or two and more to compare. */
function starters(projects: number, files: number): (readonly [string, string])[] {
  if (!files) return [["场景、问题和应用对象有哪些共性？", "task1"], ["比较这些项目的数据、方法和已取得成果。", "task2"],
    ["这些项目体现了哪些走向？区分事实与推断并说明资料范围。", "task3"]];
  if (projects > 1) return [["比较这些项目的技术路线、方法与已取得成果的异同。", "task2"], ["这些项目各自的优势与不足是什么？依据分别是什么？", "task2"],
    ["这些项目共同面临哪些尚未解决的问题？", "task1"]];
  return [["概括这个项目的研究目标、方法与主要结论。", "task1"], ["梳理这个项目的技术路线与关键指标。", "task1"], ["列出已取得的成果与对应依据。", "task1"]];
}

/**
 * 分析工作区 (query 2026-1016 1814, user's choice A): the right-hand panel of 资料管理 that carries one
 * scope — the projects and files ticked in the list — from asking and comparing to a delivered report,
 * so nothing is chosen twice. An answer can be saved to 成果 or become the topic of a report; a report
 * is generated for exactly this scope (`/api/reports` with its documents), its progress is shown here and
 * it opens on the right when done, already in 成果. With nothing ticked it works on the whole library.
 */
export function AnalysisWorkspace({ corpusId, corpusName, documents, projects, task, onBusy, onRemove, onClear, onClose }: {
  corpusId: string; corpusName: string; documents: DocumentInfo[]; projects: Project[]; task: string; onBusy: (busy: boolean) => void;
  onRemove: (docIds: string[]) => void; onClear: () => void; onClose: () => void;
}) {
  const { handleOpenSource, inspectorOpen, setChatDocked, showInspector } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [form, setForm] = useState<{ topic: string; template: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // 存量分析's templates, the comprehensive one first: it is the area's base template.
  const templates = useQuery({ queryKey: ["templates", "analysis"], queryFn: async ({ signal }) =>
    (await fetchTemplates(signal)).filter((t: TemplateSummary) => templateArea(t) === "analysis" && (t.kind !== "custom" || (t.version && t.status !== "archived")))
      .sort((a, b) => Number(b.id === "comprehensive") - Number(a.id === "comprehensive")) });
  useEffect(() => {
    setChatDocked(true);
    return () => { controller.current?.abort(); onBusy(false); setChatDocked(false); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [items, form]);

  // The scope in the reader's terms: which projects, how many files.
  const ids = documents.map((d) => d.doc_id);
  const groups = projects.map((p) => ({ p, docs: p.files.map((f) => f.document.doc_id).filter((id) => ids.includes(id)) })).filter((g) => g.docs.length);
  const loose = ids.filter((id) => !groups.some((g) => g.docs.includes(id)));
  const scope = !ids.length ? "整个资料库" : `${groups.length} 个项目${loose.length ? ` 及 ${loose.length} 份其他资料` : ""} · ${ids.length} 份文件`;
  const update = (runId: string, patch: Partial<Answer> | Partial<Report>) => setItems((old) => old.map((it) => it.runId === runId ? { ...it, ...patch } as Item : it));

  async function ask(text: string, chosenTask = task || "task1") {
    if (!text.trim() || busy) return;
    const answered = items.filter((t): t is Answer => t.kind === "answer" && !t.error && Boolean(t.answer));
    const messages: Message[] = answered.flatMap((t): Message[] => [{ role: "user", content: t.question }, { role: "assistant", content: t.answer }]).slice(-18);
    messages.push({ role: "user", content: text.trim() });
    const runId = crypto.randomUUID();
    const next: Answer = { kind: "answer", question: text.trim(), task: chosenTask, scope, runId, answer: "", sources: [] };
    setItems((old) => [...old, next]); setQuestion(""); setBusy(true); onBusy(true);
    const abort = new AbortController(); controller.current = abort;
    let done = false;
    try {
      await streamChat(messages, runId, abort.signal, (event) => {
        if (event.event === "token") next.answer += event.data.text;
        if (event.event === "sources") next.sources = event.data;
        if (event.event === "error") next.error = event.data.message;
        if (event.event === "done") done = event.data.ok;
        update(runId, { ...next });
      }, { task_id: chosenTask, corpus_ids: [corpusId], allowed_doc_ids: ids.length ? ids : null });
      if (!done && !abort.signal.aborted && !next.error) next.error = "本次回答未完成，请查看已有内容后重试。";
    } catch (cause) { next.error = abort.signal.aborted ? "已停止生成。" : (cause as Error).message; }
    finally { update(runId, { ...next }); setBusy(false); onBusy(false); }
  }

  async function save(item: Answer) {
    try {
      const saved = await createArtifact({ type: "answer_snapshot", run_id: item.runId, markdown: item.answer, title: item.question.slice(0, 60) });
      update(item.runId, { saved: saved.artifact_id });
    } catch (e) { update(item.runId, { error: (e as Error).message }); }
  }

  /** A report for exactly this scope: checked first (which files can enter and why others cannot), then generated. */
  async function generate(topic: string, templateId: string) {
    const template = templates.data?.find((t) => t.id === templateId);
    const runId = crypto.randomUUID();
    const base = { domain: corpusName.replace(/^自然科学基金-/, ""), corpus_id: corpusId, doc_ids: ids.length ? ids : undefined,
      template_id: templateId, template_version: template?.kind === "custom" ? template.version : undefined, focus: topic.trim(), run_id: runId };
    setForm(null);
    setItems((old) => [...old, { kind: "report", topic: topic.trim(), scope, runId, state: "checking", note: "正在核对资料范围…" }]);
    try {
      const wide = await preflightReport({ ...base, year_from: 1900, year_to: 2100 });
      const years = wide.observed_years?.length ? wide.observed_years : [];
      if (!wide.eligible_count) throw new Error(`所选 ${wide.total} 份资料都缺少项目年份，不能进入报告；请改选有年份的资料，或在文件名中补上立项年份`);
      const left = wide.total - wide.eligible_count;
      update(runId, { state: "generating", note: `纳入 ${wide.eligible_count} 份资料${left ? `；${left} 份缺少项目年份，未纳入` : ""}。生成约需一至数分钟，可继续浏览，完成后在此打开，也会出现在“报告中心”中。` });
      const report = await createReport({ ...base, year_from: Math.min(...years), year_to: Math.max(...years) });
      update(runId, { state: "done", artifactId: report.artifact_id });
    } catch (e) { update(runId, { state: "failed", error: (e as Error).message }); }
  }

  function copy(text: string, key: string) {
    void navigator.clipboard?.writeText(text).then(() => { setCopied(key); window.setTimeout(() => setCopied(""), 1500); });
  }
  const lastQuestion = [...items].reverse().find((t): t is Answer => t.kind === "answer")?.question ?? "";
  const reporting = items.some((t) => t.kind === "report" && (t.state === "checking" || t.state === "generating"));
  const right = inspectorOpen ? "xl:right-[calc(var(--inspector-width)+20px)]" : "";
  const link = "text-[11.5px] text-[var(--link)] hover:underline disabled:opacity-40";

  return <section aria-label="分析工作区"
    className={`${PANEL_SHELL} fixed top-[52px] right-0 bottom-0 z-[60] w-full sm:top-[62px] sm:right-[10px] sm:bottom-[10px] sm:w-[440px] ${right}`}>
    <PanelHeader title="分析工作区" subtitle={`${scope}${task && TASK_NAME[task] ? ` · ${TASK_NAME[task]}` : ""}`}
      actions={<>
        <PanelButton label="清空记录" disabled={busy || reporting || !items.length} onClick={() => setItems([])}><Icon name="refresh" size={14} /></PanelButton>
        <PanelButton label="收起工作区" onClick={onClose}><Icon name="close" size={14} strokeWidth={2} /></PanelButton>
      </>} />

    {/* The scope stays in view: every question and report below uses exactly this. */}
    <div aria-label="分析范围" className="border-b border-[var(--hairline)] bg-[var(--canvas)] px-[14px] py-[9px]">
      <div className="mb-[6px] flex items-center gap-2 text-[11.5px] text-[var(--steel)]">
        <span className="font-medium">范围 · {scope}</span>
        <span className="flex-1 text-[var(--stone)]">{ids.length ? "在左侧勾选可增减" : "在左侧勾选项目可缩小范围"}</span>
        {ids.length ? <button type="button" onClick={onClear} className="text-[var(--link)] hover:underline">清空</button> : null}
      </div>
      {ids.length ? <ul className="flex max-h-[76px] flex-wrap gap-[5px] overflow-y-auto">
        {groups.map(({ p, docs }) => <li key={p.project_id} className="flex max-w-full items-center gap-1 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] py-[2px] pr-[3px] pl-[7px] text-[11.5px] text-[var(--slate)]">
          <span className="max-w-[300px] truncate" title={p.title}>{p.title}</span><span className="text-[var(--stone)]">{docs.length} 份</span>
          <button type="button" aria-label={`移出范围：${p.title}`} onClick={() => onRemove(docs)}
            className="grid size-[16px] place-items-center rounded text-[var(--stone)] hover:bg-[var(--surface)] hover:text-[var(--red)]">×</button>
        </li>)}
        {loose.length ? <li className="flex items-center gap-1 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] py-[2px] pr-[3px] pl-[7px] text-[11.5px] text-[var(--slate)]">
          其他资料 {loose.length} 份<button type="button" aria-label="移出范围：其他资料" onClick={() => onRemove(loose)}
            className="grid size-[16px] place-items-center rounded text-[var(--stone)] hover:bg-[var(--surface)] hover:text-[var(--red)]">×</button></li> : null}
      </ul> : null}
    </div>

    <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-[14px] py-[14px]" aria-live="polite">
      {!items.length && !form ? <div className="space-y-2">
        <p className="text-[12px] text-[var(--steel)]">回答附原文出处；满意的回答可保存到“报告中心”，或直接生成报告。可以这样问：</p>
        {starters(groups.length, ids.length).map(([text, t]) => <button key={text} type="button" onClick={() => void ask(text, t)}
          className="block w-full rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2 text-left text-[13px] text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)]">{text}</button>)}
      </div> : null}
      {items.map((t) => t.kind === "answer" ? <article key={t.runId} className="space-y-2">
        <div className="ml-auto w-fit max-w-[88%]">
          <p className="rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-[13px] whitespace-pre-wrap text-white">{t.question}</p>
          <p className="mt-0.5 text-right text-[10.5px] text-[var(--stone)]">{t.scope}</p>
        </div>
        <div className="rounded-2xl rounded-bl-md border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2.5">
          {t.answer ? <div className="markdown text-[13px]"><ReportMarkdown markdown={t.answer} sources={t.sources} onOpenSource={handleOpenSource} /></div>
            : !t.error ? <p className="text-[13px] text-[var(--steel)]">正在查阅资料<span className="animate-pulse">…</span></p> : null}
          {t.sources.length ? <div className="mt-2 border-t border-[var(--hairline)] pt-2">
            <p className="mb-1 text-[11px] text-[var(--stone)]">出处</p>
            <div className="flex flex-wrap gap-1.5">{t.sources.map((source, n) => <button key={`${source.doc_id ?? ""}-${n}`} type="button"
              className="max-w-full truncate rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2 py-0.5 text-[11.5px] text-[var(--link)] hover:border-[var(--primary)]"
              onClick={() => void handleOpenSource(source, source.citation ?? n + 1)}>[{source.citation ?? n + 1}] {source.title}</button>)}</div>
          </div> : null}
          {t.error ? <p role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--red)]">{t.error}
            {!busy ? <button type="button" onClick={() => { setItems((old) => old.filter((x) => x.runId !== t.runId)); void ask(t.question, t.task); }}
              className="rounded-md border border-[var(--red)] px-2 py-0.5 text-[12px]">重试</button> : null}</p> : null}
          {t.answer && !t.error && !(busy && t === items.at(-1)) ? <div className="mt-2 flex flex-wrap justify-end gap-3 border-t border-[var(--hairline)] pt-2">
            <button type="button" onClick={() => copy(t.answer, t.runId)} className={link}>{copied === t.runId ? "已复制" : "复制"}</button>
            {t.saved ? <button type="button" onClick={() => showInspector({ kind: "artifact", artifactId: t.saved! })} className={link}>已保存，打开</button>
              : <button type="button" onClick={() => void save(t)} className={link}>保存到报告中心</button>}
            <button type="button" disabled={reporting} onClick={() => setForm({ topic: t.question, template: form?.template ?? "" })} className={link}>以此生成报告</button>
          </div> : null}
        </div>
      </article> : <article key={t.runId} aria-label={`报告：${t.topic}`} className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3 text-[13px]">
        <p className="flex items-center gap-2"><Icon name="doc" size={14} /><b className="min-w-0 flex-1 truncate" title={t.topic}>报告 · {t.topic}</b></p>
        <p className="mt-0.5 text-[11px] text-[var(--stone)]">{t.scope}</p>
        {t.state === "failed" ? <p role="alert" className="mt-2 text-[12.5px] text-[var(--red)]">{t.error}</p>
          : <p className="mt-2 text-[12.5px] text-[var(--steel)]">{t.state === "done" ? "已生成并保存到“报告中心”。" : t.note}</p>}
        {t.state === "generating" ? <GenerationProgress compact status="generating" /> : null}
        {t.state === "done" && t.artifactId ? <button type="button" onClick={() => showInspector({ kind: "artifact", artifactId: t.artifactId! })}
          className="mt-2 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[12.5px] text-white">打开报告</button> : null}
        {t.state === "failed" ? <button type="button" onClick={() => setForm({ topic: t.topic, template: "" })} className="mt-2 rounded-lg border border-[var(--hairline-strong)] px-3 py-1 text-[12.5px]">调整后重新生成</button> : null}
      </article>)}

      {form ? <form aria-label="生成报告" className="space-y-2 rounded-xl border border-[var(--primary)] bg-[var(--canvas)] p-3 text-[13px]"
        onSubmit={(e) => { e.preventDefault(); void generate(form.topic, form.template || templates.data?.[0]?.id || "comprehensive"); }}>
        <p className="font-semibold">生成报告 <span className="font-normal text-[var(--stone)]">· {scope}</span></p>
        <label className="block text-[12px] text-[var(--steel)]">报告要回答的问题
          <textarea aria-label="报告主题" value={form.topic} rows={3} onChange={(e) => setForm({ ...form, topic: e.target.value })}
            className="mt-1 w-full resize-y rounded-lg border border-[var(--hairline-strong)] px-2 py-1.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--primary)]" /></label>
        <label className="block text-[12px] text-[var(--steel)]">报告模板
          <select aria-label="报告模板" value={form.template || templates.data?.[0]?.id || ""} onChange={(e) => setForm({ ...form, template: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--hairline-strong)] px-2 py-1.5 text-[13px] text-[var(--ink)]">
            {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{templateLabel(t)}</option>)}
          </select></label>
        <div className="flex gap-2"><button disabled={!form.topic.trim()} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[12.5px] text-white disabled:opacity-40">生成</button>
          <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-[12.5px]">取消</button></div>
      </form> : null}
      <div ref={bottom} />
    </div>

    <form className="border-t border-[var(--hairline)] bg-[var(--canvas)] p-[10px]" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
      <div className="flex items-end gap-2 rounded-xl border border-[var(--hairline-strong)] bg-[var(--canvas)] p-1.5 focus-within:border-[var(--primary)]">
        <textarea aria-label="向所选资料提问" value={question} rows={Math.min(5, Math.max(1, question.split("\n").length))}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(question); } }}
          placeholder={ids.length ? "向所选资料提问…" : "向本资料库提问…"}
          className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-[1.5] outline-none" />
        {busy ? <button type="button" onClick={() => controller.current?.abort()} className="shrink-0 rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-[13px]">停止</button>
          : <button disabled={!question.trim()} className="shrink-0 rounded-lg bg-[var(--primary)] px-3.5 py-1.5 text-[13px] text-white disabled:opacity-40">发送</button>}
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-[10.5px] text-[var(--stone)]">
        <span>Enter 发送 · Shift+Enter 换行</span>
        <button type="button" disabled={reporting || Boolean(form)} onClick={() => setForm({ topic: question.trim() || lastQuestion || (groups.length > 1 ? "比较所选项目的技术路线、方法与已取得成果" : "梳理所选资料的研究进展与成果"), template: "" })}
          className="text-[12px] text-[var(--link)] hover:underline disabled:opacity-40">生成报告…</button>
      </div>
    </form>
  </section>;
}
