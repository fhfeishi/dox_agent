import { useState } from "react";
import { createCorpus, deleteCorpus, renameCorpus, type CorpusInfo } from "./api";

/** K6: create corpora and rename (display name) or delete (derived data) them. */
export function CorpusAdmin({ corpora, current, onChanged, onSelect }: {
  corpora: CorpusInfo[]; current: string; onChanged: () => void; onSelect: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState("");
  async function run(action: () => Promise<void>) {
    try { await action(); setNotice(""); onChanged(); } catch (e) { setNotice((e as Error).message); }
  }
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-stone-500">管理知识库</summary>
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        <input aria-label="新知识库名称" className="min-w-0 flex-1 rounded border px-2 py-1" placeholder="新知识库名称" value={name} onChange={e => setName(e.target.value)}/>
        <button disabled={!name.trim()} className="rounded border px-2 disabled:opacity-40" onClick={() => void run(async () => {
          const info = await createCorpus(name.trim()); setName(""); onSelect(info.id);
        })}>新建</button>
      </div>
      {corpora.map(corpus => <div key={corpus.id} className={`flex items-center gap-1 rounded px-1 py-0.5 ${corpus.id === current ? "bg-stone-100" : ""}`}>
        {editing?.id === corpus.id
          ? <form className="flex min-w-0 flex-1 gap-1" onSubmit={e => { e.preventDefault(); void run(async () => { await renameCorpus(corpus.id, editing.name.trim()); setEditing(null); }); }}>
              <input autoFocus aria-label="知识库名称" className="min-w-0 flex-1 rounded border px-2 py-1" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/>
              <button type="submit" className="rounded border px-2">保存</button>
              <button type="button" className="px-1" onClick={() => setEditing(null)}>取消</button>
            </form>
          : <>
              <span className="min-w-0 flex-1 truncate text-stone-600">{corpus.name}{corpus.is_default ? "（活动）" : ""}</span>
              <button aria-label={`重命名 ${corpus.name}`} className="shrink-0" onClick={() => setEditing({ id: corpus.id, name: corpus.name })}>重命名</button>
              <button aria-label={`删除 ${corpus.name}`} disabled={corpus.is_default}
                className="shrink-0 text-red-600 disabled:opacity-30"
                onClick={() => { if (window.confirm(`删除知识库「${corpus.name}」的派生数据？源文件保留。`)) void run(async () => { await deleteCorpus(corpus.id); }); }}>删除</button>
            </>}
      </div>)}
      {notice && <p role="alert" className="text-red-700">{notice}</p>}
    </div>
  </details>;
}
