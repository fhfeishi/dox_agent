import { useEffect, useRef, useState } from "react";
import { ReportMarkdown } from "./ReportMarkdown";
import { streamChat, type Message, type Source } from "../api";
import { useApp } from "../store";
import type { DocumentInfo } from "../useDocuments";
import { Icon } from "./Icons";
import { PANEL_SHELL, PanelButton, PanelHeader } from "./Panel";
import { fundMetaFromPath } from "../fundMeta";

type Turn = { question: string; scope: number; answer: string; sources: Source[]; error?: string };

const STARTERS = (many: boolean) => many
  ? ["这些资料的研究目标与技术路线有何异同？", "比较这些项目已取得的主要成果与指标。", "这些资料共同提到了哪些尚未解决的问题？"]
  : ["概括这份资料的研究目标、方法与主要结论。", "梳理这个项目的技术路线。", "列出已取得的成果与关键指标。"];

/**
 * 与资料对话 (query 2026-1015 1142 / 1518 / 1553): a panel in the same frame as the preview panel,
 * docked at the right over the file list, which leaves room for it. The files ticked in the list are
 * the scope, shown as chips that can be removed here; each question asks only within the scope at the
 * time it is sent (an explicit document scope that never changes the main chat's), so the scope can
 * change during a conversation. A failed answer can be asked again.
 */
export function LibraryChat({ corpusId, documents, onBusy, onRemove, onClear, onClose }: {
  corpusId: string; documents: DocumentInfo[]; onBusy: (busy: boolean) => void;
  onRemove: (docId: string) => void; onClear: () => void; onClose: () => void;
}) {
  const { handleOpenSource, inspectorOpen, setChatDocked } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(-1);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setChatDocked(true);
    return () => { controller.current?.abort(); onBusy(false); setChatDocked(false); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [turns]);

  async function ask(text: string, history = turns) {
    if (!text.trim() || busy || !documents.length) return;
    const answered = history.filter((t) => !t.error && t.answer);
    const messages: Message[] = answered.flatMap((t): Message[] => [{ role: "user", content: t.question }, { role: "assistant", content: t.answer }]).slice(-18);
    messages.push({ role: "user", content: text.trim() });
    const next: Turn = { question: text.trim(), scope: documents.length, answer: "", sources: [] };
    const index = history.length;
    setTurns([...history, next]); setQuestion(""); setBusy(true); onBusy(true);
    const abort = new AbortController(); controller.current = abort;
    let done = false;
    const update = () => setTurns((old) => old.map((t, i) => i === index ? { ...next } : t));
    try {
      await streamChat(messages, crypto.randomUUID(), abort.signal, (event) => {
        if (event.event === "token") next.answer += event.data.text;
        if (event.event === "sources") next.sources = event.data;
        if (event.event === "error") next.error = event.data.message;
        if (event.event === "done") done = event.data.ok;
        update();
      }, { task_id: "task1", corpus_ids: [corpusId], allowed_doc_ids: documents.map((d) => d.doc_id) });
      if (!done && !abort.signal.aborted && !next.error) next.error = "本次回答未完成，请查看已有内容后重试。";
    } catch (cause) { next.error = abort.signal.aborted ? "已停止生成。" : (cause as Error).message; }
    finally { update(); setBusy(false); onBusy(false); }
  }
  function copy(text: string, index: number) {
    void navigator.clipboard?.writeText(text).then(() => { setCopied(index); window.setTimeout(() => setCopied(-1), 1500); });
  }

  // Keep clear of the preview panel when a source is opened beside the conversation.
  const right = inspectorOpen ? "xl:right-[calc(var(--inspector-width)+20px)]" : "";
  return <section aria-label="与所选资料对话"
    className={`${PANEL_SHELL} fixed top-[52px] right-0 bottom-0 z-[60] w-full sm:top-[62px] sm:right-[10px] sm:bottom-[10px] sm:w-[420px] ${right}`}>
    <PanelHeader title="与资料对话" subtitle={documents.length ? `只在所选 ${documents.length} 份资料中检索并作答` : "在列表中勾选资料后提问"}
      actions={<>
        <PanelButton label="新对话" disabled={busy || !turns.length} onClick={() => setTurns([])}><Icon name="refresh" size={14} /></PanelButton>
        <PanelButton label="收起对话" onClick={onClose}><Icon name="close" size={14} strokeWidth={2} /></PanelButton>
      </>} />

    <div aria-label="对话范围" className="border-b border-[var(--hairline)] bg-[var(--canvas)] px-[14px] py-[9px]">
      <div className="mb-[6px] flex items-center gap-2 text-[11.5px] text-[var(--steel)]">
        <span className="font-medium">范围 · {documents.length} 份</span>
        <span className="flex-1 text-[var(--stone)]">在左侧列表勾选可增减，最多 20 份</span>
        {documents.length ? <button type="button" onClick={onClear} className="text-[var(--link)] hover:underline">清空</button> : null}
      </div>
      {documents.length ? <ul className="flex max-h-[76px] flex-wrap gap-[5px] overflow-y-auto">
        {documents.map((d) => <li key={d.doc_id} className="flex max-w-full items-center gap-1 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] py-[2px] pr-[3px] pl-[7px] text-[11.5px] text-[var(--slate)]">
          <span className="max-w-[300px] truncate" title={d.title}>{fundMetaFromPath(d.rel_path ?? "")?.title || d.title}</span>
          <button type="button" aria-label={`移出范围：${d.title}`} onClick={() => onRemove(d.doc_id)}
            className="grid size-[16px] place-items-center rounded text-[var(--stone)] hover:bg-[var(--surface)] hover:text-[var(--red)]">×</button>
        </li>)}
      </ul> : <p className="text-[12px] text-[var(--stone)]">还没有选择资料。勾选资料，或先按正文检索主题再勾选搜索结果。</p>}
    </div>

    <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-[14px] py-[14px]" aria-live="polite">
      {!turns.length && documents.length ? <div className="space-y-2">
        <p className="text-[12px] text-[var(--steel)]">回答附原文出处，点出处可在右侧查看原文。可以这样问：</p>
        {STARTERS(documents.length > 1).map((text) => <button key={text} type="button" onClick={() => void ask(text)}
          className="block w-full rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2 text-left text-[13px] text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)]">{text}</button>)}
      </div> : null}
      {turns.map((t, i) => <article key={i} className="space-y-2">
        <div className="ml-auto w-fit max-w-[88%]">
          <p className="rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-[13px] whitespace-pre-wrap text-white">{t.question}</p>
          <p className="mt-0.5 text-right text-[10.5px] text-[var(--stone)]">在 {t.scope} 份资料中</p>
        </div>
        <div className="rounded-2xl rounded-bl-md border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2.5">
          {t.answer ? <div className="markdown text-[13px]"><ReportMarkdown markdown={t.answer} sources={t.sources} onOpenSource={handleOpenSource} /></div>
            : !t.error ? <p className="text-[13px] text-[var(--steel)]">正在查阅所选资料<span className="animate-pulse">…</span></p> : null}
          {t.sources.length ? <div className="mt-2 border-t border-[var(--hairline)] pt-2">
            <p className="mb-1 text-[11px] text-[var(--stone)]">出处</p>
            <div className="flex flex-wrap gap-1.5">{t.sources.map((source, n) => <button key={`${source.doc_id ?? ""}-${n}`} type="button"
              className="max-w-full truncate rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2 py-0.5 text-[11.5px] text-[var(--link)] hover:border-[var(--primary)]"
              onClick={() => void handleOpenSource(source, source.citation ?? n + 1)}>[{source.citation ?? n + 1}] {source.title}</button>)}</div>
          </div> : null}
          {t.error ? <p role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--red)]">{t.error}
            {i === turns.length - 1 && !busy ? <button type="button" onClick={() => void ask(t.question, turns.slice(0, -1))}
              className="rounded-md border border-[var(--red)] px-2 py-0.5 text-[12px]">重试</button> : null}</p> : null}
          {t.answer && !(busy && i === turns.length - 1) ? <div className="mt-1.5 flex justify-end">
            <button type="button" onClick={() => copy(t.answer, i)} className="text-[11.5px] text-[var(--stone)] hover:text-[var(--link)]">{copied === i ? "已复制" : "复制回答"}</button>
          </div> : null}
        </div>
      </article>)}
      <div ref={bottom} />
    </div>

    <form className="border-t border-[var(--hairline)] bg-[var(--canvas)] p-[10px]" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
      <div className="flex items-end gap-2 rounded-xl border border-[var(--hairline-strong)] bg-[var(--canvas)] p-1.5 focus-within:border-[var(--primary)]">
        <textarea aria-label="向所选资料提问" value={question} rows={Math.min(5, Math.max(1, question.split("\n").length))}
          disabled={!documents.length} onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(question); } }}
          placeholder={documents.length ? "向这些资料提问…" : "请先在列表中勾选资料"}
          className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-[1.5] outline-none disabled:cursor-not-allowed" />
        {busy ? <button type="button" onClick={() => controller.current?.abort()} className="shrink-0 rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-[13px]">停止</button>
          : <button disabled={!question.trim() || !documents.length} className="shrink-0 rounded-lg bg-[var(--primary)] px-3.5 py-1.5 text-[13px] text-white disabled:opacity-40">发送</button>}
      </div>
      <p className="mt-1 px-1 text-[10.5px] text-[var(--stone)]">Enter 发送 · Shift+Enter 换行</p>
    </form>
  </section>;
}
