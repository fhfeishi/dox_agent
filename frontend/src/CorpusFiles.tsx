import { useEffect, useState } from "react";
import { deleteCorpusFile, fetchCorpusFiles, renameCorpusFile, uploadCorpusFile, type CorpusFile } from "./api";

const STATUS_LABEL: Record<string, string> = { new: "待导入", indexed: "已入库", error: "解析失败", removed: "源文件缺失" };

/** K7: source-file list / upload / rename / delete for one corpus. */
export function CorpusFiles({ corpusId, onChanged, connected = true }: {
  corpusId: string; onChanged: () => void; connected?: boolean;
}) {
  const [files, setFiles] = useState<CorpusFile[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ rel: string; name: string } | null>(null);
  async function load() {
    try { setFiles(await fetchCorpusFiles(corpusId)); setNotice(""); } catch (e) { setNotice((e as Error).message); }
  }
  useEffect(() => { void load(); }, [corpusId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); await load(); onChanged(); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  return <details className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
    <summary className="cursor-pointer font-medium text-stone-700">源文件管理 · {files.length}</summary>
    <div className="mt-3 space-y-3">
      <input type="file" aria-label="上传源文件" accept=".md,.markdown,.txt,.pdf,.docx" disabled={busy || !connected}
        onChange={e => { const file = e.target.files?.[0]; if (!file) return; e.target.value = ""; void run(async () => { await uploadCorpusFile(corpusId, file); }); }}/>
      <p className="text-xs text-stone-400">支持 md / markdown / txt / pdf / docx；上传后自动增量导入（未变文件跳过）。</p>
      <ul className="space-y-1">
        {files.map(file => <li key={file.rel_path} className="flex items-center gap-2 text-xs">
          {editing?.rel === file.rel_path
            ? <form className="flex min-w-0 flex-1 gap-1" onSubmit={e => { e.preventDefault(); void run(async () => { await renameCorpusFile(corpusId, file.rel_path, editing.name.trim()); setEditing(null); }); }}>
                <input autoFocus aria-label="文件名" className="min-w-0 flex-1 rounded border px-2 py-1" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/>
                <button type="submit" className="rounded border px-2">保存</button>
                <button type="button" className="px-1" onClick={() => setEditing(null)}>取消</button>
              </form>
            : <>
                <span className="min-w-0 flex-1 truncate text-stone-600" title={file.rel_path}>{file.rel_path}</span>
                <span className="shrink-0 text-stone-400">{STATUS_LABEL[file.status] ?? file.status}</span>
                <button aria-label={`重命名 ${file.rel_path}`} disabled={busy} onClick={() => setEditing({ rel: file.rel_path, name: file.rel_path })}>重命名</button>
                <button aria-label={`删除 ${file.rel_path}`} disabled={busy} className="text-red-600"
                  onClick={() => { if (window.confirm(`删除源文件「${file.rel_path}」并从索引移除？`)) void run(async () => { await deleteCorpusFile(corpusId, file.rel_path); }); }}>删除</button>
              </>}
        </li>)}
        {!files.length && <li className="text-xs text-stone-400">还没有源文件。</li>}
      </ul>
      {notice && <p role="alert" className="text-xs text-red-700">{notice}</p>}
    </div>
  </details>;
}
