import { useEffect, useRef, useState } from "react";
import { ReportMarkdown } from "./ReportMarkdown";
import { streamChat, type Message, type Source } from "../api";
import { useApp } from "../store";
import type { DocumentInfo } from "../useDocuments";

type Turn = { question: string; answer: string; sources: Source[]; error?: string };

const STARTERS = (many: boolean) => many
  ? ["这些资料的研究目标与技术路线有何异同？", "比较这些项目已取得的主要成果与指标。", "这些资料共同提到了哪些尚未解决的问题？"]
  : ["概括这份资料的研究目标、方法与主要结论。", "梳理这个项目的技术路线。", "列出已取得的成果与关键指标。"];

/**
 * 与所选资料对话 (query 2026-1015 1142 / 1518): a panel floating over the file list, so the list stays
 * in place while asking. It opens as soon as files are chosen, can be folded to a button, and asks
 * only within the chosen files (an explicit document scope that never changes the main chat's).
 * Changing the selection starts a new conversation; a failed answer can be asked again.
 */
export function LibraryChat({ corpusId, documents, onBusy, onClear }: {
  corpusId: string; documents: DocumentInfo[]; onBusy: (busy: boolean) => void; onClear: () => void;
}) {
  const { handleOpenSource, inspectorOpen } = useApp();
  const [open, setOpen] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => () => { controller.current?.abort(); onBusy(false); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [turns]);

  async function ask(text: string) {
    if (!text.trim() || busy || !documents.length) return;
    const answered = turns.filter((t) => !t.error && t.answer);
    const messages: Message[] = answered.flatMap((t): Message[] => [{ role: "user", content: t.question }, { role: "assistant", content: t.answer }]).slice(-18);
    messages.push({ role: "user", content: text.trim() });
    const next: Turn = { question: text.trim(), answer: "", sources: [] };
    const index = turns.length;
    setTurns((old) => [...old, next]); setQuestion(""); setBusy(true); onBusy(true);
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

  // Keep clear of the right-hand panel when it is open.
  const side = inspectorOpen ? "xl:right-[calc(var(--inspector-width)+28px)]" : "";
  if (!open) return <button type="button" onClick={() => setOpen(true)}
    className={`fixed bottom-6 right-6 z-[55] flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-medium text-white shadow-xl transition-transform hover:-translate-y-0.5 ${side}`}>
    与所选 {documents.length} 份资料对话{busy ? " · 回答中…" : turns.length ? ` · ${turns.length} 问` : ""}
  </button>;
  return <section aria-label="与所选资料对话"
    className={`fixed bottom-6 right-6 z-[55] flex max-h-[min(640px,calc(100vh-120px))] w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] ${side}`}>
    <header className="flex items-start gap-2 border-b border-[var(--hairline)] bg-[var(--surface)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold">与所选资料对话 · {documents.length} 份</h3>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--steel)]" title={documents.map((d) => d.title).join("、")}>{documents.map((d) => d.title).join("、")}</p>
      </div>
      <button type="button" aria-label="收起对话" title="收起（选择保留）" onClick={() => setOpen(false)}
        className="grid size-7 place-items-center rounded-md text-[var(--steel)] hover:bg-[var(--canvas)]">—</button>
      <button type="button" aria-label="结束对话并清空选择" title="结束对话并清空选择" disabled={busy} onClick={onClear}
        className="grid size-7 place-items-center rounded-md text-[var(--steel)] hover:bg-[var(--canvas)] disabled:opacity-40">✕</button>
    </header>
    <div className="min-h-[160px] flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
      {!turns.length ? <div className="space-y-2">
        <p className="text-xs text-[var(--steel)]">只在所选资料中查找依据，回答附原文出处。可以试试：</p>
        {STARTERS(documents.length > 1).map((text) => <button key={text} type="button" onClick={() => void ask(text)}
          className="block w-full rounded-lg border border-[var(--hairline)] px-3 py-2 text-left text-[13px] text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)]">{text}</button>)}
      </div> : null}
      {turns.map((t, i) => <article key={i} className="space-y-2">
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-[13px] text-white">{t.question}</p>
        <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-[var(--surface)] px-3 py-2">
          {t.answer ? <div className="markdown text-[13px]"><ReportMarkdown markdown={t.answer} sources={t.sources} onOpenSource={handleOpenSource} /></div>
            : !t.error ? <p className="flex items-center gap-1.5 text-[13px] text-[var(--steel)]">正在查阅所选资料<span className="animate-pulse">…</span></p> : null}
          {t.sources.length ? <div className="mt-2 flex flex-wrap gap-1.5">{t.sources.map((source, n) => <button key={source.doc_id ?? n} type="button"
            className="max-w-full truncate rounded-md border border-[var(--hairline)] bg-[var(--canvas)] px-2 py-0.5 text-[11.5px] text-[var(--link)] hover:border-[var(--primary)]"
            onClick={() => void handleOpenSource(source, source.citation ?? n + 1)}>[{source.citation ?? n + 1}] {source.title}</button>)}</div> : null}
          {t.error ? <p role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--red)]">{t.error}
            {i === turns.length - 1 && !busy ? <button type="button" onClick={() => { setTurns((old) => old.slice(0, -1)); void ask(t.question); }}
              className="rounded-md border border-[var(--red)] px-2 py-0.5 text-[12px]">重试</button> : null}</p> : null}
        </div>
      </article>)}
      <div ref={bottom} />
    </div>
    <form className="flex gap-2 border-t border-[var(--hairline)] p-3" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
      <input aria-label="向所选资料提问" value={question} onChange={(e) => setQuestion(e.target.value)}
        placeholder="向这些资料提问…" className="min-w-0 flex-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-2 text-[13px] outline-none focus:border-[var(--primary)]" />
      {busy ? <button type="button" onClick={() => controller.current?.abort()} className="rounded-lg border px-3 text-[13px]">停止</button>
        : <button disabled={!question.trim()} className="rounded-lg bg-[var(--primary)] px-4 text-[13px] text-white disabled:opacity-40">发送</button>}
    </form>
  </section>;
}
