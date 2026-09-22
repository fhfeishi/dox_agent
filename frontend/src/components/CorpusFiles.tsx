import { useEffect, useState } from "react";
import { deleteCorpusFile, fetchCorpusFiles, renameCorpusFile, uploadCorpusFile, type CorpusFile } from "../api";
import { Icon } from "./Icons";

const STATUS_LABEL: Record<string, string> = {
  new: "待导入",
  indexed: "已入库",
  error: "解析失败",
  removed: "源文件缺失",
};

/** K7: source-file list / upload / rename / delete for one corpus. */
export function CorpusFiles({
  corpusId,
  onChanged,
  connected = true,
}: {
  corpusId: string;
  onChanged: () => void;
  connected?: boolean;
}) {
  const [files, setFiles] = useState<CorpusFile[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ rel: string; name: string } | null>(null);
  async function load() {
    try {
      setFiles(await fetchCorpusFiles(corpusId));
      setNotice("");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [corpusId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await load();
      onChanged();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-[14px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[14px] text-[13px]">
      <summary className="cursor-pointer font-medium text-[var(--charcoal)]">源文件管理 · {files.length}</summary>
      <div className="mt-[10px] space-y-[10px]">
        <input
          type="file"
          aria-label="上传源文件"
          accept=".md,.markdown,.txt,.pdf,.docx"
          disabled={busy || !connected}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = "";
            void run(async () => {
              await uploadCorpusFile(corpusId, file);
            });
          }}
        />
        <p className="text-[11.5px] text-[var(--stone)]">
          支持 md / markdown / txt / pdf / docx；上传后自动增量导入（未变文件跳过）。
        </p>
        <ul className="space-y-[3px]">
          {files.map((file) => (
            <li key={file.rel_path} className="flex items-center gap-[8px] text-[12px]">
              {editing?.rel === file.rel_path ? (
                <form
                  className="flex min-w-0 flex-1 gap-[6px]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await renameCorpusFile(corpusId, file.rel_path, editing.name.trim());
                      setEditing(null);
                    });
                  }}
                >
                  <input
                    autoFocus
                    aria-label="文件名"
                    className="font-app min-w-0 flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[5px] text-[12px] outline-none focus:border-[var(--primary)]"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                  <button type="submit" className="rounded-[6px] border border-[var(--hairline-strong)] px-[8px]">
                    保存
                  </button>
                  <button type="button" className="px-[4px]" onClick={() => setEditing(null)}>
                    取消
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[var(--charcoal)]" title={file.rel_path}>
                    {file.rel_path}
                  </span>
                  <span className="shrink-0 text-[var(--stone)]">{STATUS_LABEL[file.status] ?? file.status}</span>
                  <button
                    type="button"
                    aria-label={`重命名 ${file.rel_path}`}
                    disabled={busy}
                    className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-[var(--steel)] hover:bg-[var(--surface)]"
                    onClick={() => setEditing({ rel: file.rel_path, name: file.rel_path })}
                  >
                    <Icon name="edit" size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除 ${file.rel_path}`}
                    disabled={busy}
                    className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-[var(--red)] hover:bg-[var(--surface)]"
                    onClick={() => {
                      if (window.confirm(`删除源文件「${file.rel_path}」并从索引移除？`)) {
                        void run(async () => {
                          await deleteCorpusFile(corpusId, file.rel_path);
                        });
                      }
                    }}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </>
              )}
            </li>
          ))}
          {!files.length ? <li className="text-[12px] text-[var(--stone)]">还没有源文件。</li> : null}
        </ul>
        {notice ? (
          <p role="alert" className="text-[12px] text-[var(--red)]">
            {notice}
          </p>
        ) : null}
      </div>
    </details>
  );
}
