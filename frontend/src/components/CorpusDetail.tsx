import { useEffect, useState } from "react";
import { deleteCorpus, reassociateCorpus, renameCorpus, setCorpusDescription } from "../api";
import { useApp } from "../store";
import { useDocuments } from "../useDocuments";
import { CorpusFiles } from "./CorpusFiles";
import { Drawer } from "./Drawer";
import { Button, Pill } from "./ui";

const KIND_LABEL: Record<string, string> = { fund: "基金报告库", demo: "演示库", unknown: "知识库" };

/** Corpus detail drawer: documents, source files and per-corpus import for one corpus id. */
export function CorpusDetail({ corpusId, onClose }: { corpusId: string; onClose: () => void }) {
  const {
    corpora,
    corpusIds,
    setSearchCorpusIds,
    refreshCorpora,
    runCorpusIngest,
    ingestBusy,
    connected,
    openPreview,
  } = useApp();
  const corpus = corpora.find((c) => c.id === corpusId) ?? null;
  const { documents, error, refresh } = useDocuments(connected, corpusId);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(corpus?.name ?? "");
  const [directory, setDirectory] = useState("");
  const [description, setDescription] = useState(corpus?.description ?? "");
  const [editingDescription, setEditingDescription] = useState(false);

  useEffect(() => {
    setName(corpus?.name ?? "");
  }, [corpus?.name]);

  useEffect(() => {
    setDescription(corpus?.description ?? "");
  }, [corpus?.description]);

  if (!corpus) return null;
  const isActive = corpusIds.includes(corpus.id);
  const status =
    corpus.missing
      ? { label: "目录缺失", tone: "rose" as const }
      : corpus.job?.status === "running"
      ? { label: "导入中", tone: "yellow" as const }
      : corpus.preparation === "ready"
        ? { label: "就绪", tone: "mint" as const }
        : corpus.preparation === "error"
          ? { label: "加载失败", tone: "rose" as const }
        : { label: "空库", tone: "yellow" as const };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setNotice("");
      refreshCorpora();
      refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={corpus.name}
      level="z-[78]"
      width="max-w-[560px]"
      subtitle={
        <p className="mt-[4px] flex flex-wrap items-center gap-[8px] text-[11.5px] text-[var(--stone)]">
          {KIND_LABEL[corpus.kind] ?? corpus.kind}
          {corpus.domain && corpus.domain !== "unknown" ? ` · ${corpus.domain}` : ""} · {corpus.docs_count} 份
        </p>
      }
    >
      <div className="flex flex-wrap items-center gap-[8px]">
        {!corpus.missing && isActive ? (
          <Button variant="ghost" size="sm" disabled={corpusIds.length <= 1} onClick={() => setSearchCorpusIds(corpusIds.filter((id) => id !== corpus.id))}>从当前对话移除</Button>
        ) : !corpus.missing ? (
          <Button variant="primary" size="sm" disabled={corpusIds.length >= 6 || corpus.missing} onClick={() => setSearchCorpusIds([...corpusIds, corpus.id])}>加入当前对话</Button>
        ) : null}
        {!corpus.missing && !(corpusIds.length === 1 && isActive) ? <Button variant="quiet" size="sm" disabled={busy} onClick={() => setSearchCorpusIds([corpus.id])}>仅使用此库</Button> : null}
        {isActive ? <Pill tone="lav">当前对话使用中 · {corpusIds.length}/6</Pill> : null}
        <Pill tone={status.tone}>{status.label}</Pill>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" icon="reload" iconSize={12} disabled={busy || ingestBusy} onClick={() => void runCorpusIngest(corpus.id).then(() => refresh())}>刷新本库</Button>
        {!corpus.missing && editing ? (
          <form
            className="flex items-center gap-[6px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void run(async () => {
                await renameCorpus(corpus.id, name.trim());
                setEditing(false);
              });
            }}
          >
            <input
              autoFocus
              aria-label="知识库名称"
              className="font-app w-[150px] rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[6px] text-[12.5px] outline-none focus:border-[var(--primary)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              保存
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              取消
            </Button>
          </form>
        ) : !corpus.missing ? (
          <>
            <Button variant="quiet" size="sm" icon="edit" iconSize={12} onClick={() => setEditing(true)}>
              重命名
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              iconSize={12}
              disabled={busy}
              title="清理索引（保留文件）"
              onClick={() => {
                if (window.confirm(`清理知识库「${corpus.name}」的索引？源文件保留。`)) {
                  void run(async () => {
                    await deleteCorpus(corpus.id);
                    onClose();
                  });
                }
              }}
            >
              清理索引
            </Button>
            <Button variant="ghost" size="sm" className="text-[var(--red)]" disabled={busy} onClick={() => {
              if (window.confirm(`删除知识库「${corpus.name}」及其源文件和索引？此操作不可撤销。`)) {
                void run(async () => { await deleteCorpus(corpus.id, true); onClose(); });
              }
            }}>删除知识库及文件</Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="text-[var(--red)]" disabled={busy} onClick={() => {
            if (window.confirm(`仅移除「${corpus.name}」的失效登记？不会删除磁盘文件。`)) {
              void run(async () => { await deleteCorpus(corpus.id); onClose(); });
            }
          }}>移除失效记录</Button>
        )}
      </div>

      {notice ? (
        <p role="alert" className="text-[12px] text-[var(--red)]">
          {notice}
        </p>
      ) : null}

      {!corpus.missing ? (
        <section className="rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-[12px] text-[12.5px]">
          <div className="flex items-center gap-[8px]">
            <span className="font-medium text-[var(--charcoal)]">知识库说明</span>
            <span className="flex-1" />
            {editingDescription ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => void run(async () => {
                  await setCorpusDescription(corpus.id, description.trim());
                  setEditingDescription(false);
                })}>保存</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingDescription(false); setDescription(corpus.description ?? ""); }}>取消</Button>
              </>
            ) : (
              <Button size="sm" variant="quiet" icon="edit" iconSize={12} onClick={() => setEditingDescription(true)}>编辑说明</Button>
            )}
          </div>
          {editingDescription ? (
            <textarea
              autoFocus
              aria-label="知识库说明"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="简要说明这个知识库收录什么资料（可选）"
              className="font-app mt-[8px] w-full rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[9px] py-[7px] text-[12.5px] leading-[1.5] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
          ) : (
            <p className="mt-[6px] leading-[1.6] text-[var(--steel)]">{corpus.description || "未填写说明。"}</p>
          )}
        </section>
      ) : null}

      {corpus.missing ? (
        <section className="space-y-[10px] rounded-[10px] border border-[#f1c8c8] bg-[#fff8f8] p-[14px] text-[12px]">
          <p className="font-medium text-[var(--red)]">目录缺失 · 原路径：<code>{corpus.rel_path}</code></p>
          <p className="text-[var(--steel)]">若你已在知识库根目录中重新放置或改名该文件夹，请明确选择对应目录。系统不会按相似名称自动合并。</p>
          <div className="flex flex-wrap gap-[8px]">
            <select aria-label="重新关联目录" className="min-w-[180px] rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[6px]" value={directory} onChange={(event) => setDirectory(event.target.value)}>
              <option value="">选择未关联目录</option>
              {corpora.filter((candidate) => !candidate.missing && candidate.id !== corpus.id).map((candidate) => <option key={candidate.id} value={candidate.rel_path}>{candidate.name} · {candidate.rel_path}</option>)}
            </select>
            <Button variant="primary" size="sm" disabled={busy || !directory} onClick={() => void run(async () => { await reassociateCorpus(corpus.id, directory); setDirectory(""); })}>重新关联并保留原 ID</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => refreshCorpora()}>刷新目录</Button>
          </div>
        </section>
      ) : (
        <>
          {error ? <p role="alert" className="text-[12.5px] text-[var(--red)]">{error}</p> : null}
          <CorpusFiles
            corpusId={corpus.id}
            corpusName={corpus.rel_path}
            documents={documents}
            onPreview={(document) => openPreview(document, null, corpus.id)}
            onChanged={() => refresh()}
            onRetryImport={() => runCorpusIngest(corpus.id)}
            connected={connected}
          />
          {corpus.job ? <p role="status" className="text-[11.5px] text-[var(--steel)]">
            {corpus.job.status === "running" ? `刷新中 ${corpus.job.completed}/${corpus.job.total || "?"}` :
              corpus.job.status === "partial" ? `部分完成：${corpus.job.errors.length} 项失败` :
                corpus.job.status === "error" ? "刷新失败，现有索引保留" :
                  `最近刷新：新增 ${corpus.job.added ?? 0}，更新 ${corpus.job.updated ?? 0}，删除 ${corpus.job.deleted ?? 0}，跳过 ${corpus.job.skipped ?? 0}`}
          </p> : null}
        </>
      )}
    </Drawer>
  );
}
