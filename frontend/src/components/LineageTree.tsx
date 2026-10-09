import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildLineage, CATEGORY_COLORS, lineageQuery, locateRoute, projectQuery, type Lineage } from "../projects";
import { useApp } from "../store";
import { Button } from "./ui";

/** One colour per sub-library branch, stable by its place in the library list. */
export function branchColor(corpusIds: string[], corpusId: string) {
  const index = corpusIds.indexOf(corpusId);
  return CATEGORY_COLORS[(index < 0 ? 0 : index) % CATEGORY_COLORS.length];
}

function Branch({ lineage, color, selected, onSelect }: {
  lineage: Lineage; color: string; selected: string; onSelect: (title: string) => void;
}) {
  if (!lineage.categories.length) return <p className="ml-6 py-2 text-xs text-[var(--stone)]">本分支尚未生成技术谱系。</p>;
  return <ul className="ml-[11px] border-l-2 pl-4" style={{ borderColor: color + "55" }}>
    {lineage.categories.map((category) => <li key={category.name} className="relative py-2">
      <span className="absolute top-[18px] -left-4 h-0.5 w-3" style={{ background: color + "55" }} />
      <p className="text-sm font-semibold" style={{ color }}>{category.name}
        <span className="ml-2 text-xs font-normal text-[var(--stone)]">{category.children.reduce((n, c) => n + c.routes.length, 0)} 条典型技术</span></p>
      {category.summary ? <p className="text-xs leading-5 text-[var(--steel)]">{category.summary}</p> : null}
      <ul className="mt-1 ml-[5px] border-l pl-4" style={{ borderColor: color + "40" }}>
        {category.children.map((child) => <li key={child.name} className="relative py-1">
          <span className="absolute top-[14px] -left-4 h-px w-3" style={{ background: color + "40" }} />
          <span className="text-[13px] text-[var(--ink)]">{child.name}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">{child.routes.map((title) => <button key={title} type="button"
            aria-pressed={selected === title} onClick={() => onSelect(title)}
            className="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
            style={selected === title ? { background: color, borderColor: color, color: "#fff" } : { borderColor: color + "66", color: "var(--slate)" }}>
            {title}</button>)}</div>
        </li>)}
      </ul>
    </li>)}
  </ul>;
}

/** Another library's branch, loaded only when expanded. */
function OtherBranch({ corpusId, name, color }: { corpusId: string; name: string; color: string }) {
  const [open, setOpen] = useState(false);
  const { data, error } = useQuery({ ...lineageQuery(corpusId), enabled: open });
  return <li>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-2 py-1 text-sm">
      <span className="size-3 rounded-full" style={{ background: color }} />
      <span style={{ color }}>{name.replace(/^自然科学基金-/, "")}</span>
      <span className="text-xs text-[var(--stone)]">{open ? "收起" : "展开"}</span>
    </button>
    {open ? error ? <p className="ml-6 text-xs text-[var(--red)]">{error.message}</p>
      : data ? <Branch lineage={data} color={color} selected="" onSelect={() => undefined} />
      : <p className="ml-6 text-xs text-[var(--stone)]">正在读取…</p> : null}
  </li>;
}

/**
 * 技术谱系 (query 2026-1009 ④): the corpus's typical techniques placed in a familiar method
 * taxonomy, with every sub-library as a coloured branch. Selecting a technique shows where it sits
 * (parent, siblings), which problems it answers, the supporting techniques the same projects state,
 * and the projects themselves.
 */
export function LineageTree({ corpusId, route, onRoute, onIssue }: {
  corpusId: string; route: string; onRoute: (title: string) => void; onIssue: (scene: string) => void;
}) {
  const { corpora, showInspector } = useApp();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const { data, isPending, error } = useQuery(lineageQuery(corpusId));
  const { data: library } = useQuery(projectQuery(corpusId));
  const run = useMutation({
    mutationFn: () => buildLineage(corpusId),
    onSuccess: (value) => { setNotice(value.error ? `本次归类未完成：${value.error}` : ""); client.setQueryData(["library", corpusId, "lineage"], value); },
    onError: (reason: Error) => setNotice(reason.message),
  });
  if (isPending) return <p role="status" className="py-4 text-sm text-[var(--steel)]">正在读取技术谱系…</p>;
  if (error) return <p role="alert" className="py-4 text-sm text-[var(--red)]">{error.message}</p>;
  const ids = corpora.map((item) => item.id);
  const color = branchColor(ids, corpusId);
  const position = locateRoute(data, route);
  const detail = data.routes[route];
  const titles = new Map((library?.projects ?? []).map((p) => [p.project_id, p.title]));
  const generate = <Button size="sm" variant={data.state === "missing" ? "primary" : "ghost"} disabled={run.isPending} onClick={() => run.mutate()}>
    {run.isPending ? "正在归类…" : data.state === "missing" ? "生成技术谱系" : "重新归类"}</Button>;

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: color }} />
        <b style={{ color }}>{data.branch.replace(/^自然科学基金-/, "")}</b>
        <span className="text-xs text-[var(--stone)]">{Object.keys(data.routes).length} 条典型技术 · {data.categories.filter((c) => c.name !== "未归类").length} 个技术体系</span>
        <span className="flex-1" />{Object.keys(data.routes).length ? generate : null}
      </div>
      {notice || data.error ? <p role="alert" className="mb-2 text-xs text-[var(--red)]">{notice || `上次归类未完成：${data.error}，下方为之前的结果。`}</p> : null}
      {data.state === "stale" ? <p className="mb-2 text-xs text-[#9a6500]">四维归纳中的技术路线已变化，谱系需要重新归类。</p> : null}
      {!Object.keys(data.routes).length ? <p className="text-sm text-[var(--steel)]">本库四维归纳中还没有技术路线，请先在“场景”中生成四维归纳。</p>
        : data.state === "missing" ? <p className="text-sm text-[var(--steel)]">尚未生成。生成时由模型把本库已有的典型技术归入常见技术体系，技术名称保持原样，不新增技术。</p>
        : <Branch lineage={data} color={color} selected={route} onSelect={onRoute} />}
      {data.gaps.length ? <details className="mt-2 text-xs text-[var(--stone)]"><summary className="cursor-pointer">未采用的归类 {data.gaps.length} 项</summary>
        <ul className="mt-1 space-y-1">{data.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details> : null}
      {corpora.length > 1 ? <div className="mt-4 border-t border-[var(--hairline)] pt-3">
        <p className="mb-1 text-xs font-semibold text-[var(--steel)]">其他领域分支</p>
        <ul>{corpora.filter((c) => c.id !== corpusId && !c.missing).map((c) =>
          <OtherBranch key={c.id} corpusId={c.id} name={c.name} color={branchColor(ids, c.id)} />)}</ul>
      </div> : null}
    </div>

    <aside aria-label="技术详情" className="h-fit rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 lg:sticky lg:top-2">
      {!detail ? <p className="text-sm text-[var(--steel)]">点击左侧任一技术，查看它属于哪个技术体系、解决哪些问题、还需要哪些配套技术，以及对应的项目。</p> : <>
        <p className="text-xs text-[var(--stone)]">{data.branch.replace(/^自然科学基金-/, "")} › {position?.category.name ?? "未归类"} › {position?.child.name ?? ""}</p>
        <h3 className="mt-1 text-base font-semibold" style={{ color }}>{route}</h3>
        {detail.summary ? <p className="mt-1 text-sm leading-6">{detail.summary}</p> : null}

        <p className="mt-3 text-xs font-semibold text-[var(--steel)]">针对的问题</p>
        <ul className="mt-1 space-y-1">{detail.issues.map((item, i) => <li key={i}>
          <button type="button" onClick={() => onIssue(item.scene)} className="text-left text-sm text-[var(--link)] hover:underline">
            {item.issue}</button><span className="ml-1 text-xs text-[var(--stone)]">· {item.scene} · {item.state}</span></li>)}</ul>

        <p className="mt-3 text-xs font-semibold text-[var(--steel)]">还需要的配套技术与手段</p>
        <p className="text-[11px] text-[var(--stone)]">取自同一项目报告中与本技术一起使用的其他技术</p>
        {data.supporting[route]?.length ? <ul className="mt-1 flex flex-wrap gap-1.5">{data.supporting[route].map((item) =>
          <li key={item.name} className="rounded-md bg-[var(--canvas)] px-2 py-0.5 text-xs">{item.name}</li>)}</ul>
          : <p className="mt-1 text-xs text-[var(--stone)]">对应项目报告中没有提到其他技术。</p>}

        {position ? <>
          <p className="mt-3 text-xs font-semibold text-[var(--steel)]">同一方向的其他技术</p>
          {position.child.routes.filter((t) => t !== route).length ? <div className="mt-1 flex flex-wrap gap-1.5">
            {position.child.routes.filter((t) => t !== route).map((t) => <button key={t} type="button" onClick={() => onRoute(t)}
              className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: color + "66" }}>{t}</button>)}</div>
            : <p className="mt-1 text-xs text-[var(--stone)]">本库该方向只有这一项。</p>}
          <p className="mt-3 text-xs font-semibold text-[var(--steel)]">同一体系的其他方向</p>
          <p className="mt-1 text-xs leading-5">{position.category.children.filter((c) => c !== position.child).map((c) => c.name).join("、") || "无"}</p>
        </> : null}

        <p className="mt-3 text-xs font-semibold text-[var(--steel)]">相关项目（{detail.project_ids.length}）</p>
        <ul className="mt-1 space-y-1">{detail.project_ids.map((id) => <li key={id}>
          <button type="button" onClick={() => showInspector({ kind: "project", corpusId, projectId: id, facet: "技术" })}
            className="text-left text-sm text-[var(--link)] hover:underline">{titles.get(id) ?? id}</button></li>)}</ul>
      </>}
    </aside>
  </div>;
}
