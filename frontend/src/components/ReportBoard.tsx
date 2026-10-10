import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildBoard, buildMatrix, fieldHeadline, libraryInsights, matrixCell, matrixOutline, TIERS, tierOf, type BoardScene, type MatrixCell } from "../briefing";
import { lineageQuery, projectQuery, type Hierarchy } from "../projects";
import { useApp } from "../store";
import { Button } from "./ui";
import { Chips, Tier, TierCounts } from "./StageMarks";

const LEVELS = [{ min: 0, label: "全部" }, { min: 2, label: "攻关验证及以上" }, { min: 4, label: "成型技术及以上" }];

/** Stage share as one colour bar (the overview's earlier look, restored per query 2026-1009 1743). */
function TierBar({ tiers }: { tiers: number[] }) {
  const total = tiers.reduce((a, b) => a + b, 0) || 1;
  return <span className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--hairline)]" title={TIERS.map((t, i) => `${t.label} ${tiers[i]}`).join("；")}>
    {tiers.map((n, i) => n ? <span key={i} style={{ width: `${n / total * 100}%`, background: TIERS[i].color }} /> : null)}
  </span>;
}

/** One field × stage: technical directions (L3), each opening its project items (L4) with stage and metrics. */
function StagePanel({ cell, plain, titles, onTech, onProject }: { cell: MatrixCell; plain: string; titles: Map<string, string>;
  onTech: (node: string) => void; onProject: (id: string) => void }) {
  return <div className="mt-3">
    <p className="text-xs text-[var(--steel)]">{plain ? `${plain} · ` : ""}{cell.projects} 个项目、{cell.items.length} 个技术条目，按技术方向归并：</p>
    <div className="mt-2 space-y-1.5">{cell.directions.map((d) => <details key={d.name} className="rounded-lg border border-[var(--hairline)] px-3 py-2">
      <summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
        <b className="text-[13px]">{d.name}</b><span className="text-xs text-[var(--stone)]">{d.projects} 个项目</span><Tier level={d.maturity} /><Chips list={d.indicators} />
        {d.plain ? <span className="w-full text-xs leading-5 text-[var(--steel)]">{d.plain}</span> : null}
      </summary>
      <ul className="mt-2 space-y-1.5">{d.items.map((item) => <li key={item.key} className="border-l-2 pl-2 text-[13px]" style={{ borderColor: tierOf(item.maturity).color }}>
        <span className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onTech(`i:${item.key}`)} title="在下方细节中查看" className="text-left font-medium hover:text-[var(--link)] hover:underline">{item.name}</button>
          <Tier level={item.maturity} /><Chips list={item.indicators} />
        </span>
        <span className="block text-xs text-[var(--steel)]">
          <button type="button" onClick={() => onProject(item.projectId)} className="text-left text-[var(--link)] hover:underline">{titles.get(item.projectId) ?? item.projectId}</button>
          {item.basis ? ` · 依据：${item.basis}` : ""}</span>
      </li>)}</ul>
    </details>)}</div>
  </div>;
}

/**
 * 总览（原汇报视图，query 2026-1009 1544): the main board a senior reviewer reads first. Application
 * scenes with this period's breakthroughs and next-stage directions, the shared foundation as one
 * band underneath, and per scene a detail page with routes in plain words and result cards whose
 * metrics are quoted from the reports. The technology view stays the expert's full tree.
 */
export function ReportBoard({ corpusId, hierarchy, onTech, onDim }: { corpusId: string; hierarchy: Hierarchy; onTech: (node: string) => void;
  onDim: (dim: "问题" | "成果", scene: string) => void }) {
  const { showInspector, corpora } = useApp();
  const { data: lineage } = useQuery(lineageQuery(corpusId));
  const { data: library } = useQuery(projectQuery(corpusId));
  const [min, setMin] = useState(0);
  const [open, setOpen] = useState("");
  const [stage, setStage] = useState("");
  const [copied, setCopied] = useState("");
  if (!lineage) return <p role="status" className="py-4 text-sm text-[var(--steel)]">正在读取技术谱系…</p>;
  if (!hierarchy.scenes.length || !lineage.categories.length) return <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 text-sm text-[var(--steel)]">
    总览需要本库的场景归纳和技术谱系。{!lineage.categories.length ? <button type="button" className="ml-1 text-[var(--link)] hover:underline" onClick={() => onTech("")}>在下方细节中生成技术谱系 ↓</button> : "请先在“场景”页生成四维归纳。"}
  </div>;

  // Title with the library's own name; the lineage branch name is the model's wording.
  const libraryName = corpora.find((c) => c.id === corpusId)?.name.replace(/^自然科学基金-/, "");
  const named = (value: ReturnType<typeof buildBoard>) => libraryName ? { ...value, branch: libraryName } : value;
  const board = named(buildBoard(hierarchy, lineage));
  const matrix = buildMatrix(lineage, min);
  const openField = (field: string, at = "") => {
    const row = matrix.rows.get(field);
    setOpen(open === field && !at ? "" : field);
    setStage(at || matrix.stages.find((s) => row && matrixCell(matrix, field, s.name).items.length)?.name || "");
  };
  const titles = new Map((library?.projects ?? []).map((p) => [p.project_id, p.title]));
  const scene: BoardScene | undefined = board.scenes.find((s) => s.name === open);
  const project = (id: string) => showInspector({ kind: "project", corpusId, projectId: id, facet: "成果" });
  const copy = async () => {
    try { await navigator.clipboard.writeText(matrixOutline(board.branch, matrix, board)); setCopied("已复制汇报大纲（Markdown）"); }
    catch { setCopied("复制失败，请检查浏览器剪贴板权限"); }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3">
      <b className="text-[15px]">{board.branch}</b>
      <span className="text-sm text-[var(--steel)]">{board.projects} 个项目 · 本期突破 <b className="text-[#0e7a28]">{board.solved}</b> 项 · 深化布局 <b>{board.open}</b> 项</span>
      <span className="flex-1" />
      <span className="text-xs text-[var(--steel)]">显示</span>
      <div role="radiogroup" aria-label="阶段门槛" className="flex overflow-hidden rounded-md border border-[var(--hairline)]">
        {LEVELS.map((level) => <button key={level.min} type="button" role="radio" aria-checked={min === level.min} onClick={() => setMin(level.min)}
          className={`px-2.5 py-1 text-xs ${min === level.min ? "bg-[var(--primary)] text-white" : "text-[var(--slate)] hover:bg-[var(--canvas)]"}`}>{level.label}</button>)}
      </div>
      <Button size="sm" variant="ghost" onClick={() => void copy()}>复制汇报大纲</Button>
      {copied ? <span role="status" className="w-full text-right text-xs text-[var(--steel)]">{copied}</span> : null}
      <div className="flex w-full flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--steel)]">
        <TierCounts tiers={board.tiers} unit=" 个项目" />
        <span className="text-[var(--stone)]">（项目按其技术在报告中所述的最高阶段计）</span>
      </div>
    </div>

    <section aria-label="本库总览要点" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {libraryInsights(board, matrix, lineage, (library?.projects ?? []).map((p) => ({ start: p.start_year, end: p.end_year }))).map((card) =>
        <article key={card.title} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold text-[var(--stone)]">{card.title}</p>
          <p className="mt-1 text-[14px] font-semibold leading-6">{card.headline}</p>
          <ul className="mt-1.5 space-y-0.5 text-xs leading-5 text-[var(--steel)]">{card.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </article>)}
    </section>

    {min > 0 ? <p role="status" className="rounded-lg border border-[#d9a92f88] bg-[#fdf6e3] px-3 py-2 text-sm text-[#7a5a00]">
      当前筛选：只统计“{LEVELS.find((level) => level.min === min)?.label}”的技术条目，已收起 {matrix.hidden} 个；问题、成果与共性底座不受筛选影响。
      <button type="button" className="ml-2 underline" onClick={() => setMin(0)}>显示全部</button></p> : null}

    {lineage.state === "stale" && !lineage.job ? <p className="rounded-lg bg-[#fdf6e3] px-3 py-2 text-xs text-[#9a6500]">{lineage.stale_reason || "四维技术条目已变化"}，下方仍是上次生成的谱系。
      <button type="button" className="ml-1 underline" onClick={() => onTech("")}>在下方细节中重新生成 ↓</button></p> : null}
    <section aria-label="主展板" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {matrix.fields.map((field) => {
        const row = matrix.rows.get(field)!;
        const s = board.scenes.find((sc) => sc.name === field);
        const solved = s?.issues.filter((i) => i.state === "已解决") ?? [];
        const later = s?.issues.filter((i) => i.state === "待解决") ?? [];
        if (!row.items.length && !s) return null;
        return <article key={field} className={`flex flex-col gap-2 rounded-xl border-2 bg-[var(--surface)] p-3 ${open === field ? "border-[var(--primary)]" : "border-[var(--hairline)]"} ${s ? "" : "border-dashed"}`}>
          <button type="button" onClick={() => openField(field)} className="text-left">
            <span className="flex items-baseline gap-2"><b className="text-[15px]">{field}</b><span className="text-xs text-[var(--stone)]">{row.projects} 个项目 · {row.items.length} 个技术条目</span></span>
          </button>
          {fieldHeadline(matrix, lineage, field) ? <p className="text-[13px] font-medium text-[var(--slate)]">{fieldHeadline(matrix, lineage, field)}</p> : null}
          <TierBar tiers={row.tiers} />
          {s ? <ul className="space-y-1 text-[13px]">
            {solved.map((i) => <li key={i.name} className="flex gap-1.5"><span className="text-[#0e7a28]">✔</span><span>{i.name}</span></li>)}
            {later.map((i) => <li key={i.name} className="flex gap-1.5 rounded border border-dashed border-[var(--hairline-strong)] px-1 text-[var(--steel)]"><span>➜</span><span>{i.name}</span></li>)}
          </ul> : <p className="text-xs leading-5 text-[var(--steel)]">模型未能判定服务领域的技术条目，如实单列。</p>}
          <Chips list={s?.highlights.length ? s.highlights : row.indicators} />
          <button type="button" onClick={() => openField(field)} className="mt-auto self-start text-xs text-[var(--link)] hover:underline">
            {open === field ? "收起" : "展开：按环节查看全部技术 →"}</button>
        </article>;
      })}
    </section>

    {board.foundations.length ? <section aria-label="共性技术底座" className="rounded-xl border-2 border-[#7c5cd655] bg-[#7c5cd60d] p-3">
      <p className="text-sm font-semibold text-[#4a2a8f]">共性技术底座 <span className="font-normal text-[var(--steel)]">· 跨场景共用的数据、协同与可信支撑，单独列出而不在各场景重复</span></p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{board.foundations.map((f) =>
        <button key={f.key} type="button" onClick={() => onTech(f.key)} className="rounded-lg border border-[var(--hairline)] bg-[var(--surface)] p-2 text-left hover:border-[#7c5cd6]">
          <span className="flex items-center gap-1.5"><b className="text-[13px]">{f.name}</b><Tier level={f.maturity} /></span>
          {f.plain ? <span className="mt-0.5 block text-xs leading-5 text-[var(--steel)]">{f.plain}</span> : null}
          <span className="mt-1 block text-[11px] text-[var(--stone)]">{f.projects} 个项目 · 覆盖 {f.scenes.length}/{board.scenes.length} 个场景 · 属于{f.system}</span>
        </button>)}</div>
    </section> : null}

    {open ? <section aria-label={`展开页：${open}`} className="rounded-xl border-2 border-[var(--primary)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold">{open}</h3>
        {scene ? <span className="text-sm text-[var(--steel)]">{scene.summary}</span> : null}
      </div>
      <div role="tablist" aria-label="业务环节" className="mt-3 flex flex-wrap gap-1.5">{matrix.stages.map((st) => {
        const cell = matrixCell(matrix, open, st.name);
        return <button key={st.name} type="button" role="tab" aria-selected={stage === st.name} disabled={!cell.items.length} onClick={() => setStage(st.name)} title={st.plain}
          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-40 ${stage === st.name ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--hairline)] hover:bg-[var(--canvas)]"}`}>{st.name} · {cell.projects}</button>;
      })}</div>
      {stage ? <StagePanel cell={matrixCell(matrix, open, stage)} plain={matrix.stages.find((st) => st.name === stage)?.plain ?? ""} titles={titles} onTech={onTech} onProject={project} /> : null}
      {scene ? <p className="mt-4 flex flex-wrap gap-3 border-t border-[var(--hairline)] pt-3 text-xs">
        <span className="text-[var(--stone)]">该领域的</span>
        <button type="button" className="text-[var(--link)] hover:underline" onClick={() => onDim("问题", scene.name)}>核心问题与典型技术路线 →</button>
        <button type="button" className="text-[var(--link)] hover:underline" onClick={() => onDim("成果", scene.name)}>标志性成果与方面完成度 →</button>
      </p> : null}
    </section> : null}

    <p className="text-[11px] leading-5 text-[var(--stone)]">
      阶段为模型依据各项目报告中的技术说明与已取得成果的判定（不是正式的技术成熟度评定）；指标原样摘自所引原文；“本期突破/深化布局”对应场景归纳中的已解决/待解决问题。
    </p>
    {board.unplaced ? <p className="text-xs text-[var(--steel)]">另有 <b>{board.unplaced}</b> 个技术条目未归入技术体系，反映当前分类尚未覆盖的部分。
      <button type="button" className="ml-1 text-[var(--link)] hover:underline" onClick={() => onTech(board.unplacedKey)}>在下方细节中逐条查看 ↓</button></p> : null}
  </div>;
}
