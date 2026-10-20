import { useEffect, useRef, useState } from "react";
import { addReviewEvidence, fetchReviewEvidence, searchReviewEvidence, uploadReviewEvidence, type ReviewEvidence } from "../../reviewApi";
import { useApp } from "../../store";
import { Button } from "../ui";
import { ReviewPageShell as Shell, ReviewNotice as Notice } from "./ReviewLayout";

const ACCEPT = ".pdf,.doc,.docx,.md,.txt";
export function ReviewEvidence() {
  const { showInspector } = useApp();
  const [items, setItems] = useState<ReviewEvidence[]>([]);
  const [query, setQuery] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [published, setPublished] = useState("");
  const [results, setResults] = useState<ReviewEvidence[]>([]);
  const [draft, setDraft] = useState({ title: "", published: "", url: "", summary: "", keywords: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchReviewEvidence().then(setItems).catch((cause) => setError((cause as Error).message)); }, []);
  const reload = async () => setItems(await fetchReviewEvidence());
  const input = "rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] text-body";

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("上传"); setError(""); setNotice("");
    try {
      for (const file of Array.from(files)) await uploadReviewEvidence(file, published);
      await reload(); setNotice(`已加入 ${files.length} 份本地文献（内容待人工核实）。`);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  // query 2026-1013 1520: the client network is restricted, so local files come first.
  return (
    <Shell title="技术证据库">
      <Notice text={error} error />
      <Notice text={notice} />
      <div className="mb-[16px] flex flex-wrap items-center gap-[10px] rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <Button variant="primary" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>{busy === "上传" ? "上传中…" : "上传本地文献"}</Button>
        <label className="text-caption text-[var(--slate)]">发表日期（可选）
          <input type="date" value={published} onChange={(event) => setPublished(event.target.value)} className={"ml-[6px] " + input} /></label>
        <span className="text-caption text-[var(--stone)]">PDF / DOCX / Markdown / TXT，可多选；历史评价只使用有日期的文献。</span>
        <input ref={fileInput} aria-label="上传本地文献文件" type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(event) => { const files = event.target.files; void upload(files).then(() => { event.target.value = ""; }); }} />
      </div>

      <strong className="text-body text-[var(--ink)]">证据库（{items.length}）</strong>
      {!items.length ? <p className="mt-[6px] text-body text-[var(--stone)]">证据库为空；没有直接相关文献时，评议只评价申请书内部论证。</p> : null}
      <div className="mt-[8px] grid gap-[8px]">
        {items.map((item) => (
          <div key={item.id} className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-caption">
            {item.filename ? <button type="button" className="text-left text-body font-semibold text-[var(--link)] hover:underline"
              onClick={() => showInspector({ kind: "review-source", fileId: item.id, page: 1, title: item.filename, evidence: true })}>{item.title}</button>
              : <a className="text-body font-semibold text-[var(--link)]" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>}
            <span className="mt-[3px] block text-[var(--steel)]">{item.published || "日期未填"} · {item.origin}</span>
          </div>
        ))}
      </div>

      <details className="mt-[18px] rounded-[10px] border border-[var(--hairline)] p-[12px] text-caption">
        <summary className="cursor-pointer text-body text-[var(--steel)]">其他方式：联网题录检索（需外网）、手工录入</summary>
        <div className="mt-[10px] flex flex-wrap items-end gap-[8px]">
          <label className="text-caption text-[var(--slate)]">检索词<input value={query} onChange={(event) => setQuery(event.target.value)} className={"ml-[6px] " + input} /></label>
          <label className="text-caption text-[var(--slate)]">截止日期<input type="date" value={cutoff} onChange={(event) => setCutoff(event.target.value)} className={"ml-[6px] " + input} /></label>
          <Button disabled={!cutoff || query.trim().length < 3} onClick={() => {
            setBusy("检索");
            void searchReviewEvidence(query.trim(), cutoff)
              .then((next) => { setResults(next); setNotice(`检索到 ${next.length} 条题录，尚未加入证据库。`); })
              .catch((cause) => setError((cause as Error).message))
              .finally(() => setBusy(""));
          }}>{busy === "检索" ? "检索中…" : "公开题录检索"}</Button>
        </div>
        {results.map((item, index) => (
          <div key={index} className="mt-[6px] flex flex-wrap items-center gap-[6px]">
            <span className="flex-1">{item.title}（{item.published}）</span>
            <Button onClick={() => void addReviewEvidence({
              title: item.title, published: item.published, url: item.url, summary: item.summary, keywords: item.keywords,
            }).then(async () => { await reload(); setNotice("已加入证据库（内容待人工核实）。"); }).catch((cause) => setError((cause as Error).message))}>加入证据库</Button>
          </div>
        ))}
        <p className="mt-[14px] font-semibold">手工录入</p>
        <div className="mt-[6px] grid gap-[8px] sm:grid-cols-2">
          <input aria-label="题名" placeholder="题名" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={input} />
          <input aria-label="发表日期" type="date" value={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.value })} className={input} />
          <input aria-label="链接" placeholder="https://" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} className={input} />
          <input aria-label="关键词" placeholder="关键词，逗号分隔" value={draft.keywords} onChange={(event) => setDraft({ ...draft, keywords: event.target.value })} className={input} />
          <textarea aria-label="摘要" placeholder="摘要（≥15 字）" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            className={"min-h-[70px] sm:col-span-2 " + input} />
        </div>
        <div className="mt-[8px]">
          <Button onClick={() => void addReviewEvidence({
            title: draft.title, published: draft.published, url: draft.url, summary: draft.summary,
            keywords: draft.keywords.split(",").map((value) => value.trim()).filter(Boolean),
          }).then(async () => { await reload(); setDraft({ title: "", published: "", url: "", summary: "", keywords: "" }); setNotice("已加入证据库。"); })
            .catch((cause) => setError((cause as Error).message))}>保存证据</Button>
        </div>
      </details>
    </Shell>
  );
}

