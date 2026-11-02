import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { domainTreeQuery, type DomainsOverview } from "../../domains";
import { libraryOverviewQuery } from "../../libraryQueries";
import { libraryColor } from "../../libraryColors";
import { useLayout } from "../../layout";
import { BoxTree, type BoxNode } from "./BoxTree";

/**
 * 02 技术谱系 · B (query 2026-11-02 17:09): the same lineage as the radial roads (A) — 人工智能 › 领域 ›
 * 技术体系 › 研究方向 › 主题 › 项目 — as a tree that opens to the right, like 五级谱系. Only the opened
 * domain's tree is read; a project opens its record in the side panel.
 */
export function LineageBoxes({ data, reveal }: { data: DomainsOverview; reveal?: { library: string; system?: string; at: number } }) {
  const { showInspector } = useLayout();
  const libraries = useQuery({ ...libraryOverviewQuery() });
  const domains = [...data.domains].sort((a, b) => b.projects - a.projects);
  const [path, setPath] = useState<string[]>(() => domains[0] ? [domains[0].id] : []);
  const tree = useQuery({ ...domainTreeQuery(path[0] ?? ""), enabled: Boolean(path[0]) });
  // 03 缺口与机会 › 在技术谱系中看 opens that domain, at the system it names.
  const wanted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!reveal) return;
    wanted.current = reveal.system;
    setPath([reveal.library]);
  }, [reveal?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  // An opened domain unfolds like 五级谱系: its largest system and direction (or the named system),
  // so the 主题 column shows; a 主题's projects are the explicit next step.
  useEffect(() => {
    const data = tree.data;
    if (!data || path.length !== 1 || data.id !== path[0]) return;
    const named = data.systems.findIndex((s) => s.name === wanted.current);
    wanted.current = undefined;
    const largest = <T extends { items: number }>(list: T[]) => list.reduce((best, n, i) => (n.items > list[best].items ? i : best), 0);
    const si = named >= 0 ? named : largest(data.systems), system = data.systems[si];
    if (!system) return;
    const next = [data.id, `${data.id}|s${si}`];
    if (system.directions.length) next.push(`${data.id}|s${si}d${largest(system.directions)}`);
    setPath(next);
  }, [tree.data, path]);
  const hue = (id: string) => (libraries.data ? libraryColor(libraries.data, id) : "var(--terrain-dot)");
  const short = (name: string) => name.replace(/^自然科学基金-/, "").replace(/^AI与/, "");
  const branch = (id: string): Pick<BoxNode, "children" | "loading"> => {
    if (id !== path[0]) return {};
    if (!tree.data) return { loading: tree.isLoading };
    const color = hue(id);
    const bySize = <T extends { items: number }>(list: T[]) => list.map((n, i) => ({ n, i })).sort((a, b) => b.n.items - a.n.items);
    return { children: bySize(tree.data.systems).map(({ n: s, i: si }) => ({
      key: `${id}|s${si}`, name: s.name, sub: s.plain, count: `${s.items} 条`, color,
      children: bySize(s.directions).map(({ n: d, i: di }) => ({
        key: `${id}|s${si}d${di}`, name: d.name, sub: d.plain, count: `${d.items} 条`, color,
        children: bySize(d.themes).map(({ n: t, i: ti }) => ({
          key: `${id}|s${si}d${di}t${ti}`, name: t.name, sub: t.plain, count: `${t.projects.length} 项目`, color,
          children: [...t.projects].sort((a, b) => b.maturity - a.maturity).map((p) => ({
            key: `p:${id}:${p.id}`, name: p.title, tier: p.maturity, count: `${p.items.length} 项技术`,
            sub: [p.number, p.year].filter(Boolean).join(" · ") })),
        })),
      })),
    })) };
  };
  const root: BoxNode = { key: "root", name: "人工智能", sub: `${data.totals.domains} 个领域`,
    children: domains.map((d) => ({ key: d.id, name: short(d.name), count: `${d.projects} 项目`, color: hue(d.id),
      levels: d.levels, sub: `${d.items} 条技术`, ...branch(d.id) })) };
  const choose = (next: string[]) => {
    const leaf = next[next.length - 1];
    if (leaf?.startsWith("p:")) {
      const rest = leaf.slice(2), cut = rest.indexOf(":");
      showInspector({ kind: "project", corpusId: rest.slice(0, cut), projectId: rest.slice(cut + 1), facet: "技术" });
    }
    setPath(next);
  };
  // As tall as the radial map's frame (its drawing plus its 96 px bar and hint line), so switching views keeps the page still.
  return <div className="flex flex-col" style={{ height: "calc(var(--lineage-h) + 96px)" }}>
    {tree.error ? <p role="alert" className="px-4 pt-3 text-body text-[var(--red)]">{(tree.error as Error).message}</p> : null}
    <BoxTree root={root} path={path} onPath={choose} label="技术谱系树状图" fill
      heads={["人工智能", "领域", "技术体系", "研究方向", "主题", "项目"]} widths={[130, 180, 200, 200, 200, 260]} />
  </div>;
}
