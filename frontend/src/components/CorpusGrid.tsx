import { useMemo, useState } from "react";
import { createCorpus, deleteCorpus, renameCorpus, type CorpusInfo } from "../api";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { Button, Pill } from "./ui";

const KIND_LABEL: Record<string, string> = { fund: "基金报告库", demo: "演示库", unknown: "知识库" };
const PREPARATION: Record<string, { label: string; tone: "mint" | "yellow" | "rose" | "gray" }> = {
  ready: { label: "就绪", tone: "mint" },
  empty: { label: "空库", tone: "yellow" },
  uninitialized: { label: "未初始化", tone: "yellow" },
  running: { label: "准备中", tone: "yellow" },
  error: { label: "加载失败", tone: "rose" },
};

function statusOf(corpus: CorpusInfo): { label: string; tone: "mint" | "yellow" | "rose" | "gray" } {
  if (corpus.job?.status === "running") return { label: "导入中", tone: "yellow" };
  if (corpus.job?.status === "error" || corpus.preparation === "error") return { label: "导入失败", tone: "rose" };
  return PREPARATION[corpus.preparation] ?? { label: corpus.preparation, tone: "gray" };
}

/** Library landing view: one card per knowledge base (data source = `corpora`, not documents). */
export function CorpusGrid() {
  const {
    corpora,
    corporaError,
    effectiveCorpusId,
    openCorpus,
    refreshCorpora,
    newCorpusOpen,
    setNewCorpusOpen,
    setNav,
    showToast,
  } = useApp();

  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return corpora;
    return corpora.filter((c) => `${c.name} ${c.domain} ${c.kind}`.toLowerCase().includes(needle));
  }, [corpora, query]);

  const totalDocs = corpora.reduce((sum, c) => sum + c.docs_count, 0);
  const readyCount = corpora.filter((c) => c.preparation === "ready").length;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setNotice("");
      refreshCorpora();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="文献库" className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--hairline)] pr-[14px] pl-[18px]">
        <span className="text-[14px] font-semibold text-[var(--ink)]">文献库</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--stone)]">
          · 共 {corpora.length} 个库 · {totalDocs} 份文档 · {readyCount} 就绪
        </span>
        <Button variant="ghost" size="md" icon="chat" onClick={() => setNav("chat")}>
          返回对话
        </Button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1180px] px-[34px] pt-[26px]">
          <h1 className="mb-[6px] text-[26px] font-semibold tracking-[-0.6px] text-[var(--ink)]">知识库</h1>
          <p className="max-w-[680px] text-[13.5px] leading-[1.6] text-[var(--steel)]">
            每个知识库是一组已解析的本地报告。浏览不会改变当前对话的检索范围；在库详情里点「用于当前对话」才会切换。
          </p>

          <div className="mt-[18px] flex flex-wrap items-center gap-[9px]">
            <Button variant="primary" icon="plus" iconSize={13} onClick={() => setNewCorpusOpen(!newCorpusOpen)}>
              新建知识库
            </Button>
            <label className="mx-[0] flex min-w-[220px] flex-1 items-center gap-[8px] rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-[10px] py-[7px] text-[var(--stone)] focus-within:border-[var(--primary)]">
              <Icon name="search" size={14} />
              <input
                aria-label="搜索知识库"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="按名称 / 领域 / 类型筛选"
                className="font-app w-full border-0 bg-transparent text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--stone)]"
              />
            </label>
          </div>

          {newCorpusOpen ? (
            <form
              className="mt-[14px] flex flex-wrap items-center gap-[8px] rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-[12px]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                void run(async () => {
                  const info = await createCorpus(name.trim());
                  setName("");
                  setNewCorpusOpen(false);
                  showToast(`已创建「${info.name}」，可在详情里导入文档`);
                });
              }}
            >
              <input
                autoFocus
                aria-label="新知识库名称"
                className="font-app min-w-[200px] flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] py-[7px] text-[13px] outline-none focus:border-[var(--primary)]"
                placeholder="新知识库名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" variant="primary" size="md" disabled={busy || !name.trim()}>
                创建
              </Button>
              <Button variant="ghost" size="md" onClick={() => setNewCorpusOpen(false)}>
                取消
              </Button>
              <p className="w-full text-[11.5px] text-[var(--stone)]">
                新建后为空库；在库详情「导入」或「源文件」里加入 md / pdf / txt / docx。
              </p>
            </form>
          ) : null}

          {corporaError ? (
            <p role="alert" className="mt-[12px] text-[12.5px] text-[var(--red)]">
              {corporaError}
            </p>
          ) : null}
          {notice ? (
            <p role="alert" className="mt-[12px] text-[12.5px] text-[var(--red)]">
              {notice}
            </p>
          ) : null}
        </div>

        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-[14px] px-[34px] pt-[20px] pb-[40px]">
          {visible.map((corpus) => {
            const status = statusOf(corpus);
            const isActive = corpus.id === effectiveCorpusId;
            return (
              <article
                key={corpus.id}
                className="group flex min-h-[176px] flex-col gap-[11px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[15px] transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-[var(--hairline-strong)] hover:shadow-[0_4px_12px_rgba(15,15,15,0.08)]"
              >
                <div className="flex items-start gap-[11px]">
                  <button
                    type="button"
                    onClick={() => openCorpus(corpus.id)}
                    className="flex min-w-0 flex-1 items-start gap-[11px] text-left"
                  >
                    <span className="grid size-[36px] shrink-0 place-items-center rounded-[8px] bg-[var(--tint-sky)] text-[var(--link)]">
                      <Icon name="library" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[14px] leading-[1.35] font-semibold text-[var(--ink)]">
                        {corpus.name}
                      </span>
                      <span className="mt-[4px] block text-[11.5px] text-[var(--stone)]">
                        {KIND_LABEL[corpus.kind] ?? corpus.kind}
                        {corpus.domain && corpus.domain !== "unknown" ? ` · ${corpus.domain}` : ""}
                      </span>
                    </span>
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      title="更多"
                      aria-label={`${corpus.name} 更多操作`}
                      className="grid size-[24px] shrink-0 place-items-center rounded-[6px] text-[var(--steel)] hover:bg-[var(--surface)]"
                      onClick={() => setMenuId(menuId === corpus.id ? null : corpus.id)}
                    >
                      <Icon name="dots" size={14} />
                    </button>
                    {menuId === corpus.id ? (
                      <div className="absolute top-[28px] right-0 z-30 w-[150px] rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-[5px] shadow-[0_16px_48px_-8px_rgba(15,15,15,0.16)]">
                        <button
                          type="button"
                          className="block w-full rounded-[6px] px-[9px] py-[7px] text-left text-[12.5px] text-[var(--charcoal)] hover:bg-[var(--surface)]"
                          onClick={() => {
                            setEditing({ id: corpus.id, name: corpus.name });
                            setMenuId(null);
                          }}
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          disabled={corpus.is_default}
                          className="block w-full rounded-[6px] px-[9px] py-[7px] text-left text-[12.5px] text-[var(--red)] hover:bg-[var(--surface)] disabled:opacity-40"
                          onClick={() => {
                            setMenuId(null);
                            if (window.confirm(`删除知识库「${corpus.name}」的派生数据？源文件保留。`)) {
                              void run(async () => {
                                await deleteCorpus(corpus.id);
                              });
                            }
                          }}
                        >
                          删除派生数据
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {editing?.id === corpus.id ? (
                  <form
                    className="flex gap-[6px]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!editing.name.trim()) return;
                      void run(async () => {
                        await renameCorpus(corpus.id, editing.name.trim());
                        setEditing(null);
                      });
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="知识库名称"
                      className="font-app min-w-0 flex-1 rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[8px] py-[6px] text-[12.5px] outline-none focus:border-[var(--primary)]"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                    <Button type="submit" size="sm" disabled={busy || !editing.name.trim()}>
                      保存
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                      取消
                    </Button>
                  </form>
                ) : null}

                <div className="flex flex-wrap items-center gap-[5px]">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  {corpus.is_default ? <Pill tone="gray">默认</Pill> : null}
                  {isActive ? <Pill tone="lav">当前对话</Pill> : null}
                </div>

                <footer className="mt-auto flex items-center gap-[10px] border-t border-[var(--hairline-soft)] pt-[11px] text-[11.5px] text-[var(--stone)]">
                  <b className="font-semibold text-[var(--slate)]">{corpus.docs_count}</b> 份文档
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-[4px] text-[var(--link)] hover:underline"
                    onClick={() => openCorpus(corpus.id)}
                  >
                    打开
                    <Icon name="chevronRight" size={11} strokeWidth={2.4} />
                  </button>
                </footer>
              </article>
            );
          })}

          <button
            type="button"
            onClick={() => setNewCorpusOpen(true)}
            className="font-app flex min-h-[176px] flex-col items-center justify-center gap-[9px] rounded-[12px] border border-dashed border-[var(--hairline-strong)] bg-[var(--surface-soft)] text-[var(--steel)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft-2)] hover:text-[var(--primary)]"
          >
            <Icon name="plus" size={24} />
            <span className="text-[13px] font-medium">新建知识库</span>
            <span className="text-[11.5px]">PDF · Markdown · TXT · Word</span>
          </button>
        </div>

        {!corpora.length && !corporaError ? (
          <p className="mx-auto -mt-[120px] w-full max-w-[1180px] px-[34px] text-center text-[13px] text-[var(--steel)]">
            还没有知识库。新建后用「导入」或「源文件」加入资料。
          </p>
        ) : null}
      </div>
    </section>
  );
}
