import { useState } from "react";
import type { DocumentInfo } from "./useDocuments";

type Preview = { preview_id: string; title: string; pages: { number: number; text: string }[] };

async function api(path: string, body?: object) {
  const response = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "请求失败");
  return data;
}

export function IngestTools({ documents, refresh, connected = true, onOpenDocument }: {
  documents: DocumentInfo[]; refresh: () => void; connected?: boolean; onOpenDocument: (docId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState("");
  const [origin, setOrigin] = useState("");
  const [text, setText] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice("正在处理…");
    try { await action(); } catch (e) { setNotice(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  }
  async function ingestText() {
    await run(async () => {
      const result = await api("/api/ingest/text", { title, origin, text });
      setNotice(`正文已入库（${result.changed ? "新版本" : "版本未变"}），可以重新提问。`);
      setText(""); refresh();
    });
  }

  return <section className="space-y-4 text-sm">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold">知识库 · {documents.length} 份</h3>
      <button disabled={busy || !connected} className="rounded-lg border bg-white px-3 py-1 text-xs disabled:opacity-40" onClick={() => void run(async () => {
        const result = await api("/api/ingest/local", {});
        setNotice(`已导入 ${result.imported.length} 份；失败 ${result.errors.length} 份${result.errors.map((e: { source: string }) => " · " + e.source).join("")}`);
        refresh();
      })}>导入 / 更新本地文本与 PDF</button>
    </div>

    <details>
      <summary className="cursor-pointer text-xs text-stone-600">网页快照</summary>
      <div className="mt-2 space-y-2">
        <input aria-label="网页地址" className="w-full rounded border bg-white p-2" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)}/>
        <button disabled={busy || !url.trim() || !connected} className="w-full rounded-lg border bg-white p-2 disabled:opacity-40" onClick={() => void run(async () => {
          setPreview(null); setPreview(await api("/api/web/preview", { url })); setNotice("请确认预览是正文，而非登录页或验证码。");
        })}>抓取并预览</button>
      </div>
    </details>

    <details>
      <summary className="cursor-pointer text-xs text-stone-600">补充正文</summary>
      <div className="mt-2 space-y-2">
        <input aria-label="补充标题" className="w-full rounded border bg-white p-2" placeholder="标题" maxLength={200} value={title} onChange={e => setTitle(e.target.value)}/>
        <input aria-label="补充来源" className="w-full rounded border bg-white p-2" placeholder="原始来源（相同来源会更新版本）" value={origin} onChange={e => setOrigin(e.target.value)}/>
        <textarea aria-label="补充正文" className="w-full rounded border bg-white p-2" rows={6} maxLength={500000} value={text} onChange={e => setText(e.target.value)}/>
        <button disabled={busy || !title.trim() || !text.trim() || !connected} className="rounded-lg border bg-white px-3 py-1 disabled:opacity-40" onClick={() => void ingestText()}>保存正文</button>
      </div>
    </details>

    <details>
      <summary className="cursor-pointer text-xs text-stone-600">已入库文档 · {documents.length}（点击预览正文）</summary>
      <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">{documents.map(d => <li key={d.doc_id}><button className="w-full truncate rounded px-1 py-0.5 text-left text-stone-600 hover:bg-stone-100 hover:underline" onClick={() => onOpenDocument(d.doc_id)}>{d.title}<span className="text-stone-400"> · {d.kind} · {d.pages} 页</span></button></li>)}</ul>
    </details>

    <p className="text-xs leading-5" role="status">{notice}</p>

    {preview && <div role="dialog" aria-modal="true" aria-label="网页入库预览" className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-5">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-6">
        <h2 className="font-semibold">{preview.title}</h2>
        <p className="my-3 text-sm text-stone-500">确认内容正确后，保存这份文本快照。</p>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-4 text-xs">{preview.pages.map(p => p.text).join("\n\n")}</pre>
        <div className="mt-4 flex justify-end gap-4"><button disabled={busy} onClick={() => setPreview(null)}>取消</button><button disabled={busy} className="rounded bg-teal-800 px-4 py-2 text-white" onClick={() => void run(async () => {
          await api("/api/web/confirm/" + preview.preview_id, {}); setPreview(null); refresh(); setNotice("网页快照已入库");
        })}>确认入库</button></div>
      </div>
    </div>}
  </section>;
}
