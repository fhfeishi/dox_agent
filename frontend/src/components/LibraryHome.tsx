import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { LibraryOverview } from "./LeaderConstruction";
import { createCorpus } from "../api";
import { useApp } from "../store";
import { Icon } from "./Icons";

type Group = { id: string; name: string; members: string[] };
const short = (name: string) => name.replace(/^自然科学基金-/, "");

/** Notify every list of a group change (the library header's 移动到分组 uses this too). */
export async function changeGroups(revision: number, action: string, group_id = "", name = "", corpus_id = "") {
  const response = await fetch("/api/corpus-groups", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, action, group_id, name, corpus_id }) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof value?.detail === "string" ? value.detail : "分组修改失败，请刷新后重试");
  window.dispatchEvent(new Event("dox-groups-changed"));
  return value as { revision: number; groups: Group[] };
}

export function useGroups() {
  const [data, setData] = useState<{ revision: number; groups: Group[] } | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => void fetch("/api/corpus-groups").then((r) => r.ok ? r.json() : null).then((value) => { if (active) setData(value); }).catch(() => undefined);
    load();
    window.addEventListener("dox-groups-changed", load); window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("dox-groups-changed", load); window.removeEventListener("focus", load); };
  }, []);
  return data;
}

/**
 * 资料库 (query 2026-1013 2012): every library as a card — name, what it holds, how many reports and
 * projects, where its projects concentrate — by group, with search. A card opens the library in the
 * same workspace; 信息 previews it on the right without leaving. Administrators create libraries
 * and groups here and rename or dissolve groups in place. The same page serves every role; the
 * maintenance controls follow the server's administrator rule.
 */
export function LibraryHome() {
  const { corpora, corporaError, corporaLoaded, openCorpus, refreshCorpora, showInspector, newCorpusOpen: creating, setNewCorpusOpen: setCreating } = useApp();
  const [search, setSearch] = useSearchParams();
  const query = (search.get("q") ?? "").trim().toLowerCase();
  const data = useGroups();
  const overview = useQuery({ queryKey: ["overview", "libraries"], queryFn: async ({ signal }): Promise<LibraryOverview[]> => {
    const response = await fetch("/api/overview/libraries", { signal });
    if (!response.ok) throw new Error("资料库概况暂不可读");
    return response.json();
  } });
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const groups = data?.groups ?? [];
  const grouped = new Set(groups.flatMap((g) => g.members));
  const sections = [...groups.map((g) => ({ id: g.id, name: g.name, ids: g.members })),
    { id: "", name: groups.length ? "未分组" : "", ids: corpora.filter((c) => !grouped.has(c.id)).map((c) => c.id) }];
  const visible = (id: string) => { const c = corpora.find((x) => x.id === id); return Boolean(c) && (!query || c!.name.toLowerCase().includes(query) || (c!.description ?? "").toLowerCase().includes(query)); };
  const act = async (action: () => Promise<unknown>) => { setError(""); try { await action(); } catch (e) { setError((e as Error).message); } };
  const row = (id: string) => overview.data?.find((r) => r.corpus_id === id);

  // Same column as 任务模版 and 成果, so list pages share one gutter (query 2026-1019 2021).
  return <main className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8">
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">资料库</h1>
        <span className="text-sm text-[var(--steel)]">{corpora.length} 个资料库</span>
        <span className="flex-1" />
        <input type="search" aria-label="搜索资料库" placeholder="搜索资料库名称或说明" value={search.get("q") ?? ""}
          onChange={(e) => setSearch((old) => { const next = new URLSearchParams(old); if (e.target.value) next.set("q", e.target.value); else next.delete("q"); return next; }, { replace: true })}
          className="w-[240px] rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 py-1.5 text-body" />
        {/* Every account keeps libraries and their groups (query 2026-1016 0919). */}
        <>
          {creating ? <form className="flex gap-1.5" onSubmit={(e) => {
            e.preventDefault();
            void act(async () => { const created = await createCorpus(name.trim()); setName(""); setCreating(false); refreshCorpora(); openCorpus(created.id, "files"); });
          }}>
            <input autoFocus aria-label="新资料库名称" placeholder="资料库名称" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-[180px] rounded-lg border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1.5 text-body" />
            <button type="submit" className="rounded-lg bg-[var(--primary)] px-3 text-body text-white">创建</button>
            <button type="button" className="text-body text-[var(--steel)]" onClick={() => setCreating(false)}>取消</button>
          </form> : <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-body text-white">
            <Icon name="plus" size={14} />新建资料库</button>}
          {data ? <button type="button" onClick={() => { const next = window.prompt("新分组名称"); if (next?.trim()) void act(() => changeGroups(data.revision, "create", "", next.trim())); }}
            className="rounded-lg border border-[var(--hairline-strong)] px-3 py-1.5 text-body">新建分组</button> : null}
        </>
      </header>
      {corporaError || error ? <p role="alert" className="text-sm text-[var(--red)]">{corporaError || error}</p> : null}
      {!corpora.length ? <p className="text-sm text-[var(--steel)]">{corporaLoaded ? "还没有资料库，可点“新建资料库”。" : "正在读取资料库…"}</p> : null}
      {sections.map((section) => {
        const ids = section.ids.filter(visible);
        if (!ids.length && (!section.id || query)) return null;
        return <section key={section.id || "_"} aria-label={section.name || "资料库"}>
          {section.name ? <div className="group mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--steel)]">{section.name} · {ids.length}</h2>
            {section.id && data ? <span className="flex gap-2 text-xs text-[var(--steel)] opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" onClick={() => { const next = window.prompt("分组名称", section.name); if (next?.trim()) void act(() => changeGroups(data.revision, "rename", section.id, next.trim())); }}>改名</button>
              <button type="button" onClick={() => { if (window.confirm(`解散分组「${section.name}」？其中的资料库回到未分组，不会删除。`)) void act(() => changeGroups(data.revision, "dissolve", section.id)); }}>解散</button>
            </span> : null}
          </div> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ids.map((id) => {
            const c = corpora.find((x) => x.id === id)!;
            const info = row(id);
            const fields = (info?.fields ?? []).slice(0, 2).map(([n]) => n).join("、");
            const state = c.missing ? "目录缺失" : c.job?.status === "running" ? "导入中" : c.preparation === "error" ? "加载失败" : !c.docs_count ? "空库" : "";
            return <article key={id} className="flex flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface)] transition-colors hover:border-[var(--primary)]">
              <button type="button" onClick={() => openCorpus(id)} className="flex-1 p-4 text-left">
                <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-emphasis" title={c.name}>{short(c.name)}</b>
                  {state ? <span className="shrink-0 rounded bg-[#fdf3d8] px-1.5 text-xs text-[#7a5a00]">{state}</span> : null}</span>
                <span className="mt-1 line-clamp-2 block min-h-[2.5em] text-body leading-5 text-[var(--steel)]">{c.description || "暂无说明"}</span>
                <span className="mt-2 block text-body text-[var(--slate)]">报告 {c.docs_count} 份{info ? ` · 项目 ${info.projects} 个` : ""}</span>
                {fields ? <span className="mt-0.5 block truncate text-xs text-[var(--stone)]">主要应用领域：{fields}</span> : null}
              </button>
              <div className="flex border-t border-[var(--hairline)] text-body">
                <button type="button" onClick={() => openCorpus(id)} className="flex-1 py-2 text-[var(--primary)] hover:bg-[var(--canvas)]">打开</button>
                <button type="button" onClick={() => showInspector({ kind: "corpus", corpusId: id })} className="flex-1 border-l border-[var(--hairline)] py-2 text-[var(--slate)] hover:bg-[var(--canvas)]">信息</button>
              </div>
            </article>;
          })}</div>
        </section>;
      })}
    </div>
  </main>;
}
