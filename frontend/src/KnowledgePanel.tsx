import { useEffect, useState } from 'react';

type Doc = { doc_id: string; title: string; kind: string; pages: number };
type Preview = { preview_id: string; title: string; pages: { number: number; text: string }[] };
async function api(path: string, body?: object) {
  const response = await fetch(path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '请求失败');
  return data;
}
export function KnowledgePanel({ connected = true }: { connected?: boolean }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const refresh = async () => setDocs(await api('/api/documents'));
  useEffect(() => { if (connected) refresh().catch(() => setNotice('知识库服务未连接')); }, [connected]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice('正在处理…');
    try { await action(); } catch (e) { setNotice(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 text-sm">
    <h2 className="mb-3 font-semibold">知识库 · {docs.length} 份</h2>
    <button disabled={busy} className="w-full rounded-lg border p-2 disabled:opacity-40" onClick={() => void run(async () => {
      const result = await api('/api/ingest/local', {}); await refresh();
      setNotice('已导入 ' + result.imported.length + ' 份；失败 ' + result.errors.length + ' 份' + result.errors.map((e: {source: string}) => ' · ' + e.source).join(''));
    })}>导入 / 更新本地文本与 PDF</button>
    <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-xs text-stone-500">{docs.map(d => <li key={d.doc_id}>{d.title} · {d.kind} · {d.pages} 页</li>)}</ul>
    <label className="mt-5 block text-xs" htmlFor="web-url">网页地址</label>
    <input id="web-url" className="mt-2 w-full rounded border bg-white p-2" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)}/>
    <button disabled={busy || !url.trim()} className="mt-2 w-full rounded-lg border p-2 disabled:opacity-40" onClick={() => void run(async () => {
      setPreview(null); setPreview(await api('/api/web/preview', { url })); setNotice('请确认预览是正文，而非登录页或验证码。');
    })}>抓取并预览</button>
    <p className="mt-3 text-xs leading-5" role="status">{notice}</p>
    {preview && <div role="dialog" aria-modal="true" aria-label="网页入库预览" className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-5">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-6">
        <h2 className="font-semibold">{preview.title}</h2>
        <p className="my-3 text-sm text-stone-500">确认内容正确后，保存这份文本快照。</p>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-4 text-xs">{preview.pages.map(p => p.text).join('\n\n')}</pre>
        <div className="mt-4 flex justify-end gap-4"><button disabled={busy} onClick={() => setPreview(null)}>取消</button><button disabled={busy} className="rounded bg-teal-800 px-4 py-2 text-white" onClick={() => void run(async () => {
          await api('/api/web/confirm/' + preview.preview_id, {}); setPreview(null); await refresh(); setNotice('网页快照已入库');
        })}>确认入库</button></div>
      </div>
    </div>}
  </section>;
}
