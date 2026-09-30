import { useSearchParams } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { createCorpus, deleteCorpus, renameCorpus, type CorpusInfo } from "../api";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { Button, Pill } from "./ui";

const KIND_LABEL: Record<string, string> = { fund: "基金报告库", demo: "演示库", unknown: "知识库" };
const PREPARATION: Record<string, { label: string; tone: "mint" | "yellow" | "rose" | "gray" }> = {
  ready: { label: "就绪", tone: "mint" },
  empty: { label: "空库", tone: "yellow" },
  uninitialized: { label: "空库", tone: "yellow" },
  running: { label: "准备中", tone: "yellow" },
  error: { label: "加载失败", tone: "rose" },
};

function statusOf(corpus: CorpusInfo): { label: string; tone: "mint" | "yellow" | "rose" | "gray" } {
  if (corpus.missing) return { label: "目录缺失", tone: "rose" };
  if (corpus.job?.status === "running") return { label: "导入中", tone: "yellow" };
  if ((corpus.indexed_count ?? corpus.docs_count) === 0) return { label: "无当前可检索资料", tone: "yellow" };
  if (corpus.failed_count) return { label: "部分失败", tone: "rose" };
  if (corpus.job?.status === "error" || corpus.preparation === "error") return { label: "导入失败", tone: "rose" };
  if (corpus.pending_count) return { label: "待入库", tone: "yellow" };
  return PREPARATION[corpus.preparation] ?? { label: corpus.preparation, tone: "gray" };
}

/** Library landing view: one card per knowledge base (data source = `corpora`, not documents). */
export function CorpusGrid() {
  const {
    corpora,
    corporaError,
    corpusIds,
    openCorpus,
    refreshCorpora,
    refreshAllCorpora,
    runCorpusIngest,
    startCorpusChat,
    ingestBusy,
    status,
    newCorpusOpen,
    setNewCorpusOpen,
    setNav,
    showToast,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const selectedGroup = searchParams.get("group") ?? "";
  function setQuery(value: string) { setSearchParams(p => { if (value) p.set("q",value); else p.delete("q"); return p; }); }
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  type Group = { id: string; name: string; members: string[] };
  const [groupData, setGroupData] = useState<{revision: number; groups: Group[]} | null>(null);
  const [groupError, setGroupError] = useState("");
  const [expanded, setExpanded] = useState(() => localStorage.getItem("dox.library.group") ?? "");
  async function loadGroups() {
    try { const r = await fetch("/api/corpus-groups"); if (!r.ok) throw new Error("分组读取失败"); setGroupData(await r.json()); setGroupError(""); }
    catch (e) { setGroupError((e as Error).message); }
  }
  useEffect(() => { void loadGroups(); window.addEventListener("focus", loadGroups); window.addEventListener("dox-groups-changed",loadGroups); return () => { window.removeEventListener("focus", loadGroups); window.removeEventListener("dox-groups-changed",loadGroups); }; }, []);
  async function changeGroup(action: string, group_id = "", name = "", corpus_id = "") {
    if (!groupData) return;
    setBusy(true);
    try {
      const r = await fetch("/api/corpus-groups", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({revision: groupData.revision, action, group_id, name, corpus_id})});
      const result = await r.json(); if (!r.ok) { if (r.status === 409) await loadGroups(); throw new Error(result.detail); }
      setGroupData(result); setGroupError(""); window.dispatchEvent(new Event("dox-groups-changed"));
    } catch(e) { setGroupError((e as Error).message); } finally { setBusy(false); }
  }
  function toggleGroup(id: string) { const next = expanded === id ? "" : id; setExpanded(next); localStorage.setItem("dox.library.group", next); }
  const groups = groupData?.groups ?? [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return corpora;
    return corpora.filter((c) => `${c.name} ${c.domain} ${c.kind}`.toLowerCase().includes(needle));
  }, [corpora, query]);

  const totalDocs = corpora.reduce((sum, c) => sum + c.docs_count, 0);
  const readyCount = corpora.filter((c) => c.preparation === "ready").length;
  const missingCount = corpora.filter((c) => c.missing).length;

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

  function renderCorpus(corpus: CorpusInfo) {
            const status = statusOf(corpus);
            const isActive = corpusIds.includes(corpus.id);
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
                      {corpus.description ? (
                        <span className="mt-[4px] line-clamp-2 block text-[11.5px] leading-[1.45] text-[var(--slate)]">
                          {corpus.description}
                        </span>
                      ) : null}
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
                          className="block w-full rounded-[6px] px-[9px] py-[7px] text-left text-[12.5px] text-[var(--red)] hover:bg-[var(--surface)]"
                          onClick={() => {
                            setMenuId(null);
                            if (window.confirm(`清理知识库「${corpus.name}」的索引？源文件保留。`)) {
                              void run(async () => {
                                await deleteCorpus(corpus.id);
                              });
                            }
                          }}
                        >
                          清理索引（保留文件）
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

                {groupData ? <label className="text-xs">分组 <select aria-label={`${corpus.name} 移动到分组`} disabled={busy} value={groups.find(g => g.members.includes(corpus.id))?.id ?? ""} onChange={e => void changeGroup("move", e.target.value, "", corpus.id)}><option value="">未分组</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label> : null}
                <div className="flex flex-wrap items-center gap-[5px]">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  {isActive ? <Pill tone="lav">当前对话</Pill> : null}
                </div>

                <footer className="mt-auto flex items-center gap-[10px] border-t border-[var(--hairline-soft)] pt-[11px] text-[11.5px] text-[var(--stone)]">
                  <span>
                    当前可检索 <b className="font-semibold text-[var(--slate)]">{corpus.indexed_count ?? corpus.docs_count}</b> / 源文件 <b className="font-semibold text-[var(--slate)]">{corpus.source_count ?? 0}</b>
                  </span>
                  {corpus.pending_count || corpus.failed_count ? (
                    <span className="text-[#9a6500]">
                      待处理 {corpus.pending_count ?? 0} / 失败 {corpus.failed_count ?? 0}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-[4px] text-[var(--link)] hover:underline"
                    onClick={() => openCorpus(corpus.id)}
                  >
                    打开
                    <Icon name="chevronRight" size={11} strokeWidth={2.4} />
                  </button>
                </footer>
                <div className="flex flex-wrap gap-[7px] text-[11.5px]">
                  <button type="button" disabled={Boolean(corpus.missing)} onClick={() => void startCorpusChat(corpus.id)}
                    className="rounded-[6px] bg-[var(--primary-soft)] px-[8px] py-[5px] text-[var(--primary-pressed)] hover:bg-[var(--primary-soft-2)] disabled:opacity-50">与此库对话</button>
                  <button type="button" disabled={Boolean(corpus.missing)} onClick={() => openCorpus(corpus.id)}
                    className="rounded-[6px] px-[8px] py-[5px] text-[var(--steel)] hover:bg-[var(--surface)] disabled:opacity-50">添加资料</button>
                  <button type="button" disabled={Boolean(corpus.missing)} onClick={() => openCorpus(corpus.id, "target")}
                    className="rounded-[6px] px-[8px] py-[5px] text-[var(--steel)] hover:bg-[var(--surface)] disabled:opacity-50">四维浏览</button>
                  <button type="button" disabled={Boolean(corpus.missing) || ingestBusy} onClick={() => void runCorpusIngest(corpus.id)}
                    className="rounded-[6px] px-[8px] py-[5px] text-[var(--steel)] hover:bg-[var(--surface)] disabled:opacity-50">刷新</button>
                </div>
              </article>
            );
  }
  return (
    <section aria-label="知识库" className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--hairline)] pr-[14px] pl-[18px]">
        <span className="text-[14px] font-semibold text-[var(--ink)]">知识库</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--stone)]">
          · 共 {corpora.length} 个库 · {totalDocs} 份文档 · {readyCount} 就绪{missingCount ? ` · 需要处理 ${missingCount}` : ""}
        </span>
        <Button variant="ghost" size="md" icon="chat" onClick={() => setNav("chat")}>
          返回对话
        </Button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1180px] px-[34px] pt-[26px]">
          <h1 className="mb-[6px] text-[26px] font-semibold tracking-[-0.6px] text-[var(--ink)]">知识库</h1>
          {selectedGroup && <button onClick={() => setSearchParams({})}>← 全部知识库</button>}
          <p className="max-w-[680px] text-[13.5px] leading-[1.6] text-[var(--steel)]">
            知识库名称与本地目录一致。浏览不会改变当前对话范围；可在详情中加入或移除知识库。
          </p>

          <div className="mt-[18px] flex flex-wrap items-center gap-[9px]">
            <Button variant="primary" icon="plus" iconSize={13} onClick={() => setNewCorpusOpen(!newCorpusOpen)}>
              新建知识库
            </Button>
            <Button variant="ghost" icon="reload" iconSize={13} disabled={ingestBusy} onClick={() => void refreshAllCorpora()}>
              {ingestBusy ? "正在刷新…" : "刷新并入库"}
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
                  showToast(`已创建「${info.name}」`);
                  openCorpus(info.id);
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
                新建后为空库；创建后可直接在该库详情里拖放或选择 md / pdf / txt / docx。
              </p>
            </form>
          ) : null}

          <div className="mt-3 flex gap-3"><button disabled={!groupData || busy} onClick={() => { const name = window.prompt("新分组名称"); if (name?.trim()) void changeGroup("create", "", name); }}>＋新建分组</button>{groupError && <p role="alert">{groupError} <button onClick={() => void loadGroups()}>刷新分组</button></p>}</div>
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
          {status ? <p role="status" className="mt-[10px] text-[11.5px] text-[var(--steel)]">{status}</p> : null}
        </div>

        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-[repeat(auto-fill,minmax(min(100%,268px),1fr))] gap-[14px] px-[34px] pt-[20px] pb-[40px]">
          {groups.filter(g => !selectedGroup || selectedGroup === g.id).map(group => {
            const needle = query.trim().toLowerCase();
            const groupMatch = needle && group.name.toLowerCase().includes(needle);
            const members = group.members.map(id => corpora.find(c => c.id === id) ?? {id, name: `知识库不可用（${id}）`, missing: true, docs_count: 0, preparation: "empty", kind: "unknown", domain: ""} as CorpusInfo);
            const matches = needle && !groupMatch ? members.filter(c => visible.some(v => v.id === c.id)) : members;
            if (needle && !groupMatch && !matches.length) return null;
            const open = Boolean(needle) || expanded === group.id || selectedGroup === group.id;
            return <section key={group.id} aria-label={`分组 ${group.name}`} className={`rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4 ${open ? "col-span-full" : "shadow-[4px_4px_0_var(--hairline),8px_8px_0_var(--surface)]"}`}>
              <div className="flex flex-wrap items-center gap-3"><button aria-expanded={open} onClick={() => toggleGroup(group.id)} className="font-semibold">{group.name} · {members.length} 个库 · {open ? "收起" : "展开"}</button>
                <button disabled={busy} onClick={() => { const name = window.prompt("分组名称", group.name); if (name?.trim()) void changeGroup("rename", group.id, name); }}>改名</button>
                <button disabled={busy} onClick={() => { if (window.confirm("解散分组？成员回到未分组，不删除知识库。")) void changeGroup("dissolve", group.id); }}>解散分组</button></div>
              <p className="my-2 text-xs">{needle ? `匹配 ${matches.length} / 共 ${members.length} 个库 · ` : ""}{matches.reduce((n,c) => n+c.docs_count, 0)} 份资料（按库累加） · {matches.filter(c => c.missing || c.preparation !== "ready" || c.failed_count).length} 库需处理</p>
              {open ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,268px),1fr))] gap-3">{matches.map(renderCorpus)}{!members.length && <p>尚未加入知识库，请在库卡片选择此分组。</p>}</div> : <p className="text-sm">{members.slice(0,3).map(c => c.name).join("、") || "空组"}</p>}
            </section>;
          })}
          {(!selectedGroup || selectedGroup === "ungrouped") && visible.filter(c => !groups.some(g => g.members.includes(c.id))).map(renderCorpus)}



        </div>

        {!corpora.length && !corporaError ? (
          <p className="mx-auto mt-2 w-full max-w-[1180px] px-[34px] text-center text-[13px] text-[var(--steel)]">
            还没有知识库。新建后在该库详情里拖放或选择文档即可添加资料。
          </p>
        ) : null}
      </div>
    </section>
  );
}
