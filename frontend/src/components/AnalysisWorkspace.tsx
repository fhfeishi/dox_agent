import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { createReport, fetchTemplates, preflightReport, templateArea, templateLabel, type TemplateSummary } from "../api";
import { downloadTurn } from "../turnExport";
import { TERMS } from "../copy";

const WORKSPACE_TASK_LABEL = TERMS.workspaceAnalysis.name;
import { MessageView } from "./MessageView";
import { useApp } from "../store";
import type { DocumentInfo } from "../useDocuments";
import type { Project } from "../projects";
import { Icon } from "./Icons";
import { PANEL_SHELL, PanelButton, PanelHeader } from "./Panel";
import { GenerationProgress } from "./GenerationProgress";
import { useLayout } from "../layout";

type Report = { kind: "report"; topic: string; scope: string; runId: string; state: "checking" | "generating" | "done" | "failed"; note: string; artifactId?: string; error?: string };

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
 * so nothing is chosen twice. With nothing ticked it works on the whole library.
 *
 * Its conversation is an ordinary session on the chat engine (query 2026-1020 1719), marked as started
 * here: it is listed in 会话历史 as 资料分析（精准问答）, reopening it from there comes back to this panel
 * with the same materials ticked (`?workspace=1&session=`), and each answer has the same 复制 / 导出 MD /
 * 导出 Word / 保存到报告中心 and 资料检索 trace as in 对话工作台.
 */
export function AnalysisWorkspace({ corpusId, corpusName, documents, projects, task, sessionId, onRestore, onBusy, onRemove, onClear, onClose }: {
  corpusId: string; corpusName: string; documents: DocumentInfo[]; projects: Project[]; task: string; sessionId?: string;
  onRestore: (docIds: string[]) => void; onBusy: (busy: boolean) => void;
  onRemove: (docIds: string[]) => void; onClear: () => void; onClose: () => void;
}) {
  const {
    handleOpenSource,
    turns,
    busy,
    error,
    status,
    stop,
    sessionBusy,
    startedTick,
    openWorkspace,
    setWorkspaceDocs,
    leaveWorkspace,
    askWorkspace,
    regenerateAt,
    setTurnReport,
    saveAnswerArtifact,
    workspace,
    connected,
    ready,
  } = useApp();
  const {
    inspectorOpen,
    setChatDocked,
    showInspector,
  } = useLayout();
  const [, setParams] = useSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [question, setQuestion] = useState("");
  const [opened, setOpened] = useState(false);
  const [form, setForm] = useState<{ topic: string; template: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // 存量分析's templates, the comprehensive one first: it is the area's base template.
  const templates = useQuery({ queryKey: ["templates", "analysis"], queryFn: async ({ signal }) =>
    (await fetchTemplates(signal)).filter((t: TemplateSummary) => templateArea(t) === "analysis" && (t.kind !== "custom" || (t.version && t.status !== "archived")))
      .sort((a, b) => Number(b.id === "comprehensive") - Number(a.id === "comprehensive")) });
  const ids = documents.map((d) => d.doc_id);

  // Open this panel's conversation: the one asked for in the address, or a fresh one for this library.
  // Only on opening: the address then follows the conversation and must not reopen it.
  const initialSession = useRef(sessionId);
  useEffect(() => {
    setChatDocked(true);
    let live = true;
    void openWorkspace(corpusId, ids, initialSession.current).then((restored) => {
      if (!live) return;
      if (restored) onRestore(restored);
      setOpened(true);
    });
    return () => { live = false; setChatDocked(false); leaveWorkspace(); };
  }, [corpusId]);
  // Ticking and unticking changes the scope of the next question.
  const idKey = ids.join(",");
  useEffect(() => { if (opened) setWorkspaceDocs(ids); }, [idKey, opened]);
  useEffect(() => { onBusy(busy); }, [busy]);
  // Once asked, the address names the conversation, so a reload or a copied link comes back to it.
  useEffect(() => {
    if (!opened || !turns.length || !workspace.active) return;
    setParams((old) => { if (old.get("session") === workspace.active) return old;
      const next = new URLSearchParams(old); next.set("workspace", "1"); next.set("session", workspace.active); return next; }, { replace: true });
  }, [opened, turns.length, workspace.active]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [turns.length, reports, form]);

  // The scope in the reader's terms: which projects, how many files.
  const groups = projects.map((p) => ({ p, docs: p.files.map((f) => f.document.doc_id).filter((id) => ids.includes(id)) })).filter((g) => g.docs.length);
  const loose = ids.filter((id) => !groups.some((g) => g.docs.includes(id)));
  const scope = !ids.length ? "整个资料库" : `${groups.length} 个项目${loose.length ? ` 及 ${loose.length} 份其他资料` : ""} · ${ids.length} 份文件`;
  const turnScope = (allowed: string[] | null | undefined) => !allowed?.length ? "整个资料库" : `${allowed.length} 份资料`;
  const updateReport = (runId: string, patch: Partial<Report>) => setReports((old) => old.map((it) => it.runId === runId ? { ...it, ...patch } : it));

  async function ask(text: string, chosenTask = task || "task1") {
    if (!text.trim() || busy || !opened) return;
    setQuestion("");
    await askWorkspace(text.trim(), chosenTask, corpusId, ids);
  }

  async function fresh() {
    setReports([]);
    await openWorkspace(corpusId, ids, undefined, true);
    setParams((old) => { const next = new URLSearchParams(old); next.delete("session"); return next; }, { replace: true });
  }

  /** A report for exactly this scope: checked first (which files can enter and why others cannot), then generated. */
  async function generate(topic: string, templateId: string) {
    const template = templates.data?.find((t) => t.id === templateId);
    const runId = crypto.randomUUID();
    const base = { domain: corpusName.replace(/^自然科学基金-/, ""), corpus_id: corpusId, doc_ids: ids.length ? ids : undefined,
      template_id: templateId, template_version: template?.kind === "custom" ? template.version : undefined, focus: topic.trim(), run_id: runId };
    setForm(null);
    setReports((old) => [...old, { kind: "report", topic: topic.trim(), scope, runId, state: "checking", note: "正在核对资料范围…" }]);
    try {
      const wide = await preflightReport({ ...base, year_from: 1900, year_to: 2100 });
      const years = wide.observed_years?.length ? wide.observed_years : [];
      if (!wide.eligible_count) throw new Error(`所选 ${wide.total} 份资料都缺少项目年份，不能进入报告；请改选有年份的资料，或在文件名中补上立项年份`);
      const left = wide.total - wide.eligible_count;
      updateReport(runId, { state: "generating", note: `纳入 ${wide.eligible_count} 份资料${left ? `；${left} 份缺少项目年份，未纳入` : ""}。生成约需一至数分钟，可继续浏览，完成后在此打开，也会出现在“报告中心”中。` });
      const report = await createReport({ ...base, year_from: Math.min(...years), year_to: Math.max(...years) });
      updateReport(runId, { state: "done", artifactId: report.artifact_id });
    } catch (e) { updateReport(runId, { state: "failed", error: (e as Error).message }); }
  }

  const lastQuestion = turns.at(-1)?.question ?? "";
  const reporting = reports.some((t) => t.state === "checking" || t.state === "generating");
  const right = inspectorOpen ? "xl:right-[calc(var(--inspector-width)+20px)]" : "";

  return <section aria-label="分析工作区"
    className={`${PANEL_SHELL} fixed top-[52px] right-0 bottom-0 z-[60] w-full sm:top-[62px] sm:right-[10px] sm:bottom-[10px] sm:w-[440px] ${right}`}>
    <PanelHeader title="分析工作区" subtitle={`${WORKSPACE_TASK_LABEL}${task && TASK_NAME[task] && task !== "task1" ? ` · ${TASK_NAME[task]}` : ""} · 记入会话历史`}
      actions={<>
        <PanelButton label="开始新的分析" disabled={busy || reporting || sessionBusy || !turns.length} onClick={() => void fresh()}><Icon name="refresh" size={14} /></PanelButton>
        <PanelButton label="收起工作区" onClick={onClose}><Icon name="close" size={14} strokeWidth={2} /></PanelButton>
      </>} />

    {/* The scope stays in view: every question and report below uses exactly this. */}
    <div aria-label="分析范围" className="border-b border-[var(--hairline)] bg-[var(--canvas)] px-[14px] py-[9px]">
      <div className="mb-[6px] flex items-center gap-2 text-caption text-[var(--steel)]">
        <span className="font-medium">范围 · {scope}</span>
        <span className="flex-1 text-[var(--stone)]">{ids.length ? "在左侧勾选可增减" : "在左侧勾选项目可缩小范围"}</span>
        {ids.length ? <button type="button" onClick={onClear} className="text-[var(--link)] hover:underline">清空</button> : null}
      </div>
      {ids.length ? <ul className="flex max-h-[76px] flex-wrap gap-[5px] overflow-y-auto">
        {groups.map(({ p, docs }) => <li key={p.project_id} className="flex max-w-full items-center gap-1 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] py-[2px] pr-[3px] pl-[7px] text-caption text-[var(--slate)]">
          <span className="max-w-[300px] truncate" title={p.title}>{p.title}</span><span className="text-[var(--stone)]">{docs.length} 份</span>
          <button type="button" aria-label={`移出范围：${p.title}`} onClick={() => onRemove(docs)}
            className="grid size-[16px] place-items-center rounded text-[var(--stone)] hover:bg-[var(--surface)] hover:text-[var(--red)]">×</button>
        </li>)}
        {loose.length ? <li className="flex items-center gap-1 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] py-[2px] pr-[3px] pl-[7px] text-caption text-[var(--slate)]">
          其他资料 {loose.length} 份<button type="button" aria-label="移出范围：其他资料" onClick={() => onRemove(loose)}
            className="grid size-[16px] place-items-center rounded text-[var(--stone)] hover:bg-[var(--surface)] hover:text-[var(--red)]">×</button></li> : null}
      </ul> : null}
    </div>

    <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-[14px] py-[14px]" aria-live="polite">
      {!turns.length && !reports.length && !form ? <div className="space-y-2">
        <p className="text-caption text-[var(--steel)]">回答附原文出处，可复制、导出 Markdown / Word、保存到“报告中心”，或直接生成报告；这次分析记入会话历史，之后可从那里回到这里。可以这样问：</p>
        {starters(groups.length, ids.length).map(([text, t]) => <button key={text} type="button" disabled={!opened || busy} onClick={() => void ask(text, t)}
          className="block w-full rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2 text-left text-body text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50">{text}</button>)}
      </div> : null}
      {turns.map((turn, i) => <article key={turn.runId} aria-label={`第 ${i + 1} 问`} className="space-y-2">
        <div className="ml-auto w-fit max-w-[88%]">
          <p className="rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-body whitespace-pre-wrap text-white">{turn.question}</p>
          <p className="mt-0.5 text-right text-caption text-[var(--stone)]">{TASK_NAME[turn.runInfo?.task_id ?? turn.options.task_id ?? "task1"] ?? "精准问答"} · {turnScope(turn.runInfo?.allowed_doc_ids ?? turn.options.allowed_doc_ids)}</p>
        </div>
        <div className="rounded-2xl rounded-bl-md border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2.5">
          <MessageView attempt={turn} startedTick={i === turns.length - 1 ? startedTick : undefined} onOpenSource={handleOpenSource}
            onRegenerate={connected && ready && !busy ? () => void regenerateAt(i) : undefined}
            onReport={(report) => setTurnReport(i, report)}
            onSaveArtifact={turn.outcome === "completed" ? () => void saveAnswerArtifact(turn.runId, turn.answer, turn.question.slice(0, 60)) : undefined}
            onExport={(format) => void downloadTurn({ question: turn.question, corpusName, taskName: WORKSPACE_TASK_LABEL }, turn, format)} />
          {turn.answer && turn.outcome === "completed" ? <div className="mt-1 flex justify-end">
            <button type="button" disabled={reporting} onClick={() => setForm({ topic: turn.question, template: form?.template ?? "" })}
              className="text-caption text-[var(--link)] hover:underline disabled:opacity-40">以此生成报告</button></div> : null}
        </div>
      </article>)}
      {error ? <p role="alert" className="text-body text-[var(--red)]">{error}</p> : busy && status ? <p role="status" className="text-caption text-[var(--steel)]">{status}</p> : null}
      {reports.map((t) => <article key={t.runId} aria-label={`报告：${t.topic}`} className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3 text-body">
        <p className="flex items-center gap-2"><Icon name="doc" size={14} /><b className="min-w-0 flex-1 truncate" title={t.topic}>报告 · {t.topic}</b></p>
        <p className="mt-0.5 text-caption text-[var(--stone)]">{t.scope}</p>
        {t.state === "failed" ? <p role="alert" className="mt-2 text-body text-[var(--red)]">{t.error}</p>
          : <p className="mt-2 text-body text-[var(--steel)]">{t.state === "done" ? "已生成并保存到“报告中心”。" : t.note}</p>}
        {t.state === "generating" ? <GenerationProgress compact status="generating" /> : null}
        {t.state === "done" && t.artifactId ? <button type="button" onClick={() => showInspector({ kind: "artifact", artifactId: t.artifactId! })}
          className="mt-2 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-body text-white">打开报告</button> : null}
        {t.state === "failed" ? <button type="button" onClick={() => setForm({ topic: t.topic, template: "" })} className="mt-2 rounded-lg border border-[var(--hairline-strong)] px-3 py-1 text-body">调整后重新生成</button> : null}
      </article>)}

      {form ? <form aria-label="生成报告" className="space-y-2 rounded-xl border border-[var(--primary)] bg-[var(--canvas)] p-3 text-body"
        onSubmit={(e) => { e.preventDefault(); void generate(form.topic, form.template || templates.data?.[0]?.id || "comprehensive"); }}>
        <p className="font-semibold">生成报告 <span className="font-normal text-[var(--stone)]">· {scope}</span></p>
        <label className="block text-caption text-[var(--steel)]">报告要回答的问题
          <textarea aria-label="报告主题" value={form.topic} rows={3} onChange={(e) => setForm({ ...form, topic: e.target.value })}
            className="mt-1 w-full resize-y rounded-lg border border-[var(--hairline-strong)] px-2 py-1.5 text-body text-[var(--ink)] outline-none focus:border-[var(--primary)]" /></label>
        <label className="block text-caption text-[var(--steel)]">报告模板
          <select aria-label="报告模板" value={form.template || templates.data?.[0]?.id || ""} onChange={(e) => setForm({ ...form, template: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--hairline-strong)] px-2 py-1.5 text-body text-[var(--ink)]">
            {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{templateLabel(t)}</option>)}
          </select></label>
        <div className="flex gap-2"><button disabled={!form.topic.trim()} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-body text-white disabled:opacity-40">生成</button>
          <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-body">取消</button></div>
      </form> : null}
      <div ref={bottom} />
    </div>

    <form className="border-t border-[var(--hairline)] bg-[var(--canvas)] p-[10px]" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
      <div className="flex items-end gap-2 rounded-xl border border-[var(--hairline-strong)] bg-[var(--canvas)] p-1.5 focus-within:border-[var(--primary)]">
        <textarea aria-label="向所选资料提问" value={question} rows={Math.min(5, Math.max(1, question.split("\n").length))}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(question); } }}
          placeholder={ids.length ? "向所选资料提问…" : "向本资料库提问…"}
          className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-body leading-[1.5] outline-none" />
        {busy ? <button type="button" onClick={stop} className="shrink-0 rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-body">停止</button>
          : <button disabled={!question.trim() || !opened || sessionBusy} className="shrink-0 rounded-lg bg-[var(--primary)] px-3.5 py-1.5 text-body text-white disabled:opacity-40">发送</button>}
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-caption text-[var(--stone)]">
        <span>Enter 发送 · Shift+Enter 换行</span>
        <button type="button" disabled={reporting || Boolean(form)} onClick={() => setForm({ topic: question.trim() || lastQuestion || (groups.length > 1 ? "比较所选项目的技术路线、方法与已取得成果" : "梳理所选资料的研究进展与成果"), template: "" })}
          className="text-caption text-[var(--link)] hover:underline disabled:opacity-40">生成报告…</button>
      </div>
    </form>
  </section>;
}
