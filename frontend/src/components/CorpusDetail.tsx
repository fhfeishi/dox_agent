import { useEffect, useState } from "react";
import { deleteCorpus, renameCorpus } from "../api";
import { fundMetaFromPath } from "../fundMeta";
import { useApp } from "../store";
import { useDocuments } from "../useDocuments";
import { CorpusFiles } from "./CorpusFiles";
import { Drawer } from "./Drawer";
import { Icon } from "./Icons";
import { IngestTools } from "./IngestTools";
import { Button, Pill } from "./ui";

type Tab = "docs" | "files" | "import";

const KIND_LABEL: Record<string, string> = { fund: "基金报告库", demo: "演示库", unknown: "知识库" };

/** Corpus detail drawer: documents, source files and per-corpus import for one corpus id. */
export function CorpusDetail({ corpusId, onClose }: { corpusId: string; onClose: () => void }) {
  const {
    corpora,
    effectiveCorpusId,
    selectCorpus,
    refreshCorpora,
    runCorpusIngest,
    ingestBusy,
    connected,
    openPreview,
    showToast,
  } = useApp();
  const corpus = corpora.find((c) => c.id === corpusId) ?? null;
  const { documents, error, refresh } = useDocuments(connected, corpusId);
  const [tab, setTab] = useState<Tab>("docs");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(corpus?.name ?? "");

  useEffect(() => {
    setName(corpus?.name ?? "");
  }, [corpus?.name]);

  if (!corpus) return null;
  const isActive = corpus.id === effectiveCorpusId;
  const status =
    corpus.job?.status === "running"
      ? { label: "导入中", tone: "yellow" as const }
      : corpus.preparation === "ready"
        ? { label: "就绪", tone: "mint" as const }
        : corpus.preparation === "error"
          ? { label: "加载失败", tone: "rose" as const }
          : { label: "未初始化", tone: "yellow" as const };

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
        {isActive ? (
          <Pill tone="lav">当前对话使用中</Pill>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              selectCorpus(corpus.id);
              showToast(`已切换当前对话到「${corpus.name}」`);
            }}
          >
            用于当前对话
          </Button>
        )}
        <Pill tone={status.tone}>{status.label}</Pill>
        {corpus.is_default ? <Pill tone="gray">默认库</Pill> : null}
        <span className="flex-1" />
        {editing ? (
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
        ) : (
          <>
            <Button variant="quiet" size="sm" icon="edit" iconSize={12} onClick={() => setEditing(true)}>
              重命名
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              iconSize={12}
              disabled={corpus.is_default || busy}
              title={corpus.is_default ? "默认库不可删除" : "删除派生数据（保留源文件）"}
              onClick={() => {
                if (window.confirm(`删除知识库「${corpus.name}」的派生数据？源文件保留。`)) {
                  void run(async () => {
                    await deleteCorpus(corpus.id);
                    onClose();
                  });
                }
              }}
            >
              删除
            </Button>
          </>
        )}
      </div>

      {notice ? (
        <p role="alert" className="text-[12px] text-[var(--red)]">
          {notice}
        </p>
      ) : null}

      <div className="flex gap-[4px] border-b border-[var(--hairline)]">
        {(
          [
            ["docs", `文档 · ${documents.length}`],
            ["files", "源文件"],
            ["import", "导入"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`font-app -mb-px rounded-t-[6px] border-b-2 px-[10px] py-[8px] text-[12.5px] transition-colors ${
              tab === key
                ? "border-b-[var(--ink)] font-semibold text-[var(--ink)]"
                : "border-b-transparent text-[var(--steel)] hover:text-[var(--charcoal)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "docs" ? (
        <div className="space-y-[4px]">
          {error ? (
            <p role="alert" className="text-[12.5px] text-[var(--red)]">
              {error}
            </p>
          ) : null}
          {!documents.length && !error ? (
            <p className="py-[18px] text-center text-[13px] text-[var(--steel)]">
              本库还没有已入库文档；在「源文件」上传或在「导入」按库导入。
            </p>
          ) : null}
          {documents.map((doc) => {
            const fund = corpus.kind === "fund" ? fundMetaFromPath(doc.rel_path ?? "") : null;
            return (
              <button
                key={doc.doc_id}
                type="button"
                onClick={() => openPreview(doc, null, corpus.id)}
                className="flex w-full items-center gap-[11px] rounded-[8px] px-[8px] py-[9px] text-left transition-colors hover:bg-[var(--surface)]"
              >
                <span className="grid size-[26px] shrink-0 place-items-center rounded-[5px] bg-[var(--tint-sky)] text-[var(--link)]">
                  <Icon name="doc" size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.8px] font-medium text-[var(--ink)]" title={doc.title}>
                    {doc.title}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--stone)]">
                    {fund
                      ? `${fund.pi} · ${fund.projectNo} · ${fund.yearFrom}–${fund.yearTo} · ${doc.pages} 页`
                      : `${doc.pages} 页 · ${doc.kind} · ${doc.parser || "解析器未知"} · 版本 ${doc.version}`}
                  </span>
                </span>
                <Icon name="chevronRight" size={12} strokeWidth={2.2} className="text-[var(--stone)]" />
              </button>
            );
          })}
        </div>
      ) : null}

      {tab === "files" ? <CorpusFiles corpusId={corpus.id} onChanged={() => refresh()} connected={connected} /> : null}

      {tab === "import" ? (
        <div className="space-y-[14px]">
          <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-[12px]">
            <div className="flex items-center gap-[10px]">
              <div className="min-w-0 flex-1">
                <p className="text-[12.8px] font-medium text-[var(--ink)]">按库导入 / 更新</p>
                <p className="mt-[3px] text-[11.5px] leading-[1.6] text-[var(--steel)]">
                  只处理本库 <code className="font-code">{corpus.rel_path}/source</code> 下的文件；未变文件按
                  size+mtime 跳过。
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon="reload"
                iconSize={13}
                disabled={ingestBusy || corpus.job?.status === "running"}
                onClick={() => void runCorpusIngest(corpus.id).then(() => refreshCorpora())}
              >
                {corpus.job?.status === "running" ? "导入中…" : "导入/更新"}
              </Button>
            </div>
            {corpus.job ? (
              <p role="status" className="mt-[8px] text-[11.5px] text-[var(--steel)]">
                {{
                  running: `正在导入…（${corpus.job.completed}/${corpus.job.total || "?"}）`,
                  done: `导入完成：新增 ${corpus.job.added ?? corpus.job.imported} · 更新 ${corpus.job.updated ?? corpus.job.changed} · 跳过 ${corpus.job.skipped ?? 0} · 删除 ${corpus.job.deleted ?? 0}`,
                  partial: `部分完成：成功 ${corpus.job.imported}，失败 ${corpus.job.errors.length}`,
                  error: "导入失败",
                  idle: "",
                }[corpus.job.status] ?? corpus.job.status}
              </p>
            ) : null}
          </div>

          {corpus.is_default ? (
            <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-[12px]">
              <p className="text-[12.8px] font-medium text-[var(--ink)]">补充材料（仅默认库）</p>
              <p className="mt-[3px] mb-[10px] text-[11.5px] leading-[1.6] text-[var(--steel)]">
                <code className="font-code">/api/ingest/local</code>、<code className="font-code">/api/ingest/text</code> 与
                <code className="font-code">/api/web/*</code> 只写入默认库，因此仅在默认库详情出现。
              </p>
              <IngestTools refresh={() => refresh()} connected={connected} />
            </div>
          ) : (
            <p className="text-[11.5px] leading-[1.6] text-[var(--stone)]">
              本地目录扫描 / 网页快照 / 补充正文只支持默认库；本库请用「按库导入」或「源文件」上传。
            </p>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
