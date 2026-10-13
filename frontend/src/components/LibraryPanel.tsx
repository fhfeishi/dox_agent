import { useAuth } from "../auth";
import { useEffect, useState } from "react";
import { useMatch } from "react-router";
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
 * The library list of the library workspace (query 2026-1013 1522): libraries by group, always
 * beside the open library, with 新建资料库 / 新建分组 and group rename or dissolve in place, so
 * choosing, creating and organising never leave the page.
 */
export function LibraryPanel({ query }: { query: string }) {
  const { corpora, corporaError, openCorpus, refreshCorpora, newCorpusOpen: creating, setNewCorpusOpen: setCreating } = useApp();
  const current = useMatch("/library/:corpusId/*")?.params.corpusId ?? "";
  const data = useGroups();
  const admin = useAuth().role === "admin";
  const [folded, setFolded] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const groups = data?.groups ?? [];
  const grouped = new Set(groups.flatMap((g) => g.members));
  const sections = [...groups.map((g) => ({ ...g, ids: g.members })),
    { id: "", name: "未分组", members: [], ids: corpora.filter((c) => !grouped.has(c.id)).map((c) => c.id) }];
  const visible = (id: string) => { const c = corpora.find((x) => x.id === id); return Boolean(c) && (!query || c!.name.toLowerCase().includes(query)); };
  const act = async (action: () => Promise<unknown>) => { setError(""); try { await action(); } catch (e) { setError((e as Error).message); } };

  return <div className="space-y-1">
    {corporaError ? <p role="alert" className="px-2 py-1 text-[12px] text-[var(--red)]">{corporaError}</p> : null}
    {sections.map((section) => {
      const ids = section.ids.filter(visible);
      if (!ids.length && (!section.id || query)) return null;
      const closed = folded.includes(section.id || "_");
      return <div key={section.id || "_"}>
        <div className="group flex items-center gap-1 px-2 pt-2 pb-1">
          <button type="button" aria-expanded={!closed} onClick={() => setFolded(closed ? folded.filter((f) => f !== (section.id || "_")) : [...folded, section.id || "_"])}
            className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11.5px] font-semibold tracking-wide text-[var(--stone)]">
            <span className="w-3">{closed ? "▸" : "▾"}</span><span className="truncate">{section.name}</span><span className="font-normal">{ids.length}</span>
          </button>
          {admin && section.id && data ? <span className="hidden gap-2 text-[11px] text-[var(--steel)] group-hover:flex">
            <button type="button" onClick={() => { const next = window.prompt("分组名称", section.name); if (next?.trim()) void act(() => changeGroups(data.revision, "rename", section.id, next.trim())); }}>改名</button>
            <button type="button" onClick={() => { if (window.confirm(`解散分组「${section.name}」？其中的资料库回到未分组，不会删除。`)) void act(() => changeGroups(data.revision, "dissolve", section.id)); }}>解散</button>
          </span> : null}
        </div>
        {!closed ? ids.map((id) => {
          const c = corpora.find((x) => x.id === id)!;
          const on = id === current;
          return <button key={id} type="button" onClick={() => openCorpus(id)} title={c.name} aria-current={on ? "page" : undefined}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] ${on ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-pressed)]" : "text-[var(--charcoal)] hover:bg-[#eceae7]"}`}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.missing ? "var(--red)" : c.preparation === "ready" ? "#2e9e64" : "#e0a000" }} />
            <span className="min-w-0 flex-1 truncate">{short(c.name)}</span>
            <span className="text-[11px] font-normal text-[var(--stone)]">{c.docs_count}</span>
          </button>;
        }) : null}
      </div>;
    })}
    {admin ? <div className="space-y-1.5 px-2 pt-3">
      {creating ? <form className="flex gap-1.5" onSubmit={(e) => {
        e.preventDefault();
        void act(async () => { const created = await createCorpus(name.trim()); setName(""); setCreating(false); refreshCorpora(); openCorpus(created.id, "files"); });
      }}>
        <input autoFocus aria-label="新资料库名称" placeholder="资料库名称" required value={name} onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1 text-[12.5px]" />
        <button type="submit" className="rounded-md bg-[var(--primary)] px-2 text-[12px] text-white">创建</button>
        <button type="button" className="text-[12px] text-[var(--steel)]" onClick={() => setCreating(false)}>取消</button>
      </form> : <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-[var(--primary)] hover:bg-[#eceae7]">
        <Icon name="plus" size={14} />新建资料库</button>}
      {data ? <button type="button" onClick={() => { const next = window.prompt("新分组名称"); if (next?.trim()) void act(() => changeGroups(data.revision, "create", "", next.trim())); }}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-[var(--steel)] hover:bg-[#eceae7]"><Icon name="plus" size={14} />新建分组</button> : null}
      {error ? <p role="alert" className="text-[12px] text-[var(--red)]">{error}</p> : null}
    </div> : null}
  </div>;
}
