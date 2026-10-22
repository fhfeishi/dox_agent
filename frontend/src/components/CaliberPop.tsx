import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LibraryOverview } from "../api";
import { DIMENSIONS } from "../libraryQueries";

/**
 * The explanations behind the accumulation map (query 2026-1021): four counts and one scale, each
 * opened from the thing it explains and closed by clicking anywhere else. Nothing here is printed on
 * the page — a reader who does not ask never sees it.
 *
 * Every figure inside is computed from the same rows the map drew: the level spread sums the eleven
 * libraries, the dimension card states the chosen library's own numerator and denominator.
 */

const short = (name: string) => name.replace(/^自然科学基金-/, "");

/** Names come from src/lineage.py MATURITY; the judgement lines are this page's wording. */
export const MATURITY = [
  { n: 0, name: "未判定", read: "看不出技术路线，或标注未完成", eg: "只出现技术名词" },
  { n: 1, name: "理论与方法研究", read: "有框架或论证，没有跑过真实数据", eg: "提出架构 · 给出约束" },
  { n: 2, name: "算法与模型验证", read: "在数据集上跑通并给出指标，还不是可运行系统", eg: "准确率 92% · AUC 0.81" },
  { n: 3, name: "原型与样机验证", read: "做成原型或样机，实验室里能重复演示", eg: "原型系统 · 原理样机" },
  { n: 4, name: "系统集成与场景试验", read: "接进真实场景，做过小规模试验", eg: "产线试点 3 个月" },
  { n: 5, name: "示范应用与转化", read: "形成可复制的示范，或已完成转化", eg: "推广运行 · 专利转化" },
];

const DIM_MEANING = [
  "项目应用在什么场合（住院、产线、田块）。",
  "这个场合里卡在哪一步（风险分层无据）。这一维最容易缺，因为要求材料里真的写了困难点。",
  "用了什么方法、模型或工艺。基本每个项目都能归纳出来，所以这一维通常接近 100%。",
  "最后交付了什么（样机、数据集、规范、验证报告）。",
];

export type QuadKey = "tl" | "tr" | "bl" | "br";

export type PopSpec =
  | { kind: "axis"; axis: "x" | "y" | "area" }
  | { kind: "maturity"; at?: number }
  | { kind: "dimension"; index: number }
  | { kind: "quadrant"; quad: QuadKey }
  | { kind: "caliber" };

export type TerrainTotals = { items: number; dist: number[]; high: number; projects: number };

const meanOf = (dist: number[]) => {
  const total = dist.reduce((a, b) => a + b, 0);
  return total ? dist.reduce((sum, n, level) => sum + n * level, 0) / total : 0;
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <div className="border-b border-[var(--line-cool-soft)] py-1.5 last:border-b-0">
    <b className="text-caption font-semibold text-[var(--heading)]">{label}</b>
    <p className="mt-0.5 text-caption leading-5 text-[var(--steel)]">{children}</p>
  </div>;
}

function Head({ title, sub, tail }: { title: string; sub: string; tail?: ReactNode }) {
  return <>
    <div className="flex items-center gap-2">
      <h4 className="text-body font-semibold text-[var(--heading)]">{title}</h4>
      {tail}
    </div>
    <p className="mt-0.5 text-caption leading-5 text-[var(--muted-cool)]">{sub}</p>
  </>;
}

export function CaliberPop({ spec, anchor, rows, chosen, cutX, onClose }: {
  spec: PopSpec | null; anchor: Element | null; rows: LibraryOverview[];
  chosen?: LibraryOverview; cutX: number; onClose: () => void;
}) {
  const card = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; arrow: number; up: boolean } | null>(null);
  const open = Boolean(spec && anchor);

  const width = spec?.kind === "maturity" ? 396 : spec?.kind === "caliber" ? 388 : spec?.kind === "quadrant" ? 348 : 344;

  // Placed under the anchor, flipped above when there is no room, and kept inside the window.
  useLayoutEffect(() => {
    if (!spec || !anchor) { setBox(null); return; }
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const height = card.current?.offsetHeight ?? 220;
      const viewportW = window.innerWidth, viewportH = window.innerHeight, gap = 12;
      const below = rect.bottom + gap + height < viewportH - 10 || rect.top - gap - height < 10;
      const top = Math.max(10, Math.min(below ? rect.bottom + gap : rect.top - gap - height, viewportH - height - 10));
      const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, viewportW - width - 12));
      const arrow = Math.max(18, Math.min(rect.left + rect.width / 2 - left, width - 18));
      setBox({ left, top, width, arrow, up: !below });
    };
    place();
    // Scrolling moves the anchor: follow it rather than closing under the reader's hand.
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; if (anchor.isConnected) place(); else onClose(); });
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [spec, anchor, width, onClose]);

  // A click anywhere but the card (or the thing that opened it) closes it; Esc does the same.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (card.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open, anchor, onClose]);

  if (!spec || !anchor || !box) return null;

  return createPortal(
    <div className="terrain-pop" style={{ left: box.left, top: box.top, width: box.width }}>
      <div ref={card} className="terrain-pop-card" role="dialog" aria-label="口径说明"
        style={{ "--ox": `${box.arrow}px`, "--oy": box.up ? "100%" : "0" } as CSSProperties}>
        <i className="terrain-arrow" data-up={box.up} style={{ "--ax": `${box.arrow}px` } as CSSProperties} aria-hidden="true" />
        <Body spec={spec} rows={rows} chosen={chosen} cutX={cutX} />
      </div>
    </div>,
    document.body,
  );
}

function Body({ spec, rows, chosen, cutX }: { spec: PopSpec; rows: LibraryOverview[]; chosen?: LibraryOverview; cutX: number }) {
  const items = rows.reduce((n, r) => n + (r.lineage.items || 0), 0);
  const dist = rows.reduce<number[]>((acc, r) => {
    const own = r.lineage.maturity ?? [];
    return acc.map((n, i) => n + (own[i] ?? 0));
  }, [0, 0, 0, 0, 0, 0]);
  const high = dist.slice(4).reduce((a, b) => a + b, 0);
  const sizes = rows.map((r) => r.lineage.items || 0).filter(Boolean);
  const lowX = Math.min(...sizes), highX = Math.max(...sizes);

  if (spec.kind === "axis") {
    if (spec.axis === "x") return <>
      <Head title="横轴 · 技术条目数" sub="衡量这个库攒下多少条可追踪的技术线索" tail={<i className="rounded border border-[var(--line-cool)] px-1 text-caption not-italic text-[var(--muted-cool)]">对数</i>} />
      <div className="mt-2">
        <Section label="怎么算">取技术谱系的条目计数。同一技术在多个项目下出现会各计一次，所以它不等于「会多少种技术」，而是「攒了多少条记录」。全库现有 {items.toLocaleString("zh-CN")} 条。</Section>
        <Section label="为什么用对数">各库从 {lowX.toLocaleString("zh-CN")} 条到 {highX.toLocaleString("zh-CN")} 条，相差 {Math.round(highX / Math.max(1, lowX))} 倍。线性轴会把小库全压在左边缘，看不出差别。</Section>
      </div>
    </>;
    if (spec.axis === "y") return <>
      <Head title="纵轴 · 平均成熟度" sub="衡量这些条目整体走到了哪一步" tail={<i className="rounded border border-[var(--line-cool)] px-1 text-caption not-italic text-[var(--muted-cool)]">0–5</i>} />
      <div className="mt-2">
        <Section label="怎么算">对该库全部条目的成熟度取算术平均，0 档也计入。全库均值 {meanOf(dist).toFixed(2)}。</Section>
        <Section label="为什么低不等于差">条目越多，越容易混进大量低成熟条目，均值被拖低。同样 2.0，可能是「均匀分布在 2 档」，也可能是「一半 0 档、一半 4 档」——要配合右栏的 6 档分布一起看。</Section>
      </div>
    </>;
    return <>
      <Head title="圆面积 · 覆盖项目数" sub="衡量这个库压住了多少个项目" tail={<i className="rounded border border-[var(--line-cool)] px-1 text-caption not-italic text-[var(--muted-cool)]">面积</i>} />
      <div className="mt-2">
        <Section label="怎么算">条目里出现过的项目编号去重后计数，一定小于等于该库的项目总数；差额是还没归入任何技术条目的项目。</Section>
        <Section label="为什么半径开方">半径按覆盖项目数开方换算，让面积正比于数量，否则大库在视觉上会被放大好几倍。</Section>
      </div>
    </>;
  }

  if (spec.kind === "maturity") {
    return <>
      <Head title="技术成熟度 6 档" sub={`右侧是全库 ${items.toLocaleString("zh-CN")} 条的分布；点右栏阶梯条可定位到该档`} />
      <div className="mt-2">
        {MATURITY.map((m) => {
          const count = dist[m.n] ?? 0;
          const share = items ? Math.round(count / items * 100) : 0;
          const on = spec.at === m.n;
          return <div key={m.n} className={`terrain-step grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2.5 py-1.5 ${on ? "bg-[var(--selected-cool)]" : ""}`}
            style={{ animationDelay: `${m.n * 28}ms` }}>
            <span className="terrain-serif mt-px grid size-5 place-items-center rounded text-caption font-semibold"
              style={{ background: `var(--m-${m.n})`, color: m.n === 5 ? "var(--canvas)" : "var(--heading)" }}>{m.n}</span>
            <div className="min-w-0">
              <div className={`text-caption font-semibold ${on ? "text-[var(--terrain-dot-on)]" : "text-[var(--heading)]"}`}>{m.name}</div>
              <div className="mt-0.5 text-caption leading-5 text-[var(--muted-cool)]">
                {m.read}<span className="text-[var(--muted-cool-soft)]">　· {m.eg}</span>
              </div>
            </div>
            <span className="terrain-serif text-right text-caption text-[var(--steel)]">
              <b className="block font-normal text-[var(--slate)]">{count.toLocaleString("zh-CN")}</b>{share}%
            </span>
          </div>;
        })}
      </div>
      <p className="mt-2 rounded bg-[var(--terrain-amber-soft)] px-2.5 py-2 text-caption leading-5 text-[var(--terrain-amber-ink)]">
        <b className="font-semibold">档位名称</b>取自后端 maturity_levels 常量；灰色小字是本页补充的判据。级别由模型逐条判定并附依据，需人工核对，不作质量评级。
      </p>
    </>;
  }

  if (spec.kind === "dimension") {
    const name = DIMENSIONS[spec.index];
    if (!chosen) return <Head title={`${name}维`} sub="选择一个资料库后查看这一维的覆盖" />;
    // Same measure as the ring beside the map: projects whose material yielded something here.
    const done = (chosen.dimension_evidence ?? chosen.dimensions)[name] ?? 0;
    const total = chosen.projects;
    const share = total ? done / total * 100 : 0;
    const gap = Math.max(0, total - done);
    return <>
      <Head title={`${name}维 · ${shortPct(share)}`} sub={`${short(chosen.name)}　${done} / ${total} 个项目的材料里归纳出该维内容`} />
      <div className="mt-2">
        <Section label="这一维在问什么">{DIM_MEANING[spec.index]}</Section>
      </div>
      <p className="mt-2 rounded bg-[var(--terrain-amber-soft)] px-2.5 py-2 text-caption leading-5 text-[var(--terrain-amber-ink)]">
        {gap > 0
          ? <>还有 <b className="font-semibold">{gap} 个</b>项目的材料里没有归纳出「{name}」。这部分在数据里是空的，不代表没有，只代表还没抽出来。</>
          : <>这一维基本抽全了，可作为其他维度抽取质量的参照。</>}
      </p>
    </>;
  }

  if (spec.kind === "quadrant") {
    const inQuad = rows.filter((r) => quadOf(r, cutX) === spec.quad).sort((a, b) => b.lineage.items - a.lineage.items);
    const copy = QUAD_TEXT[spec.quad];
    return <>
      <Head title={copy.title} sub={copy.sub} />
      <div className="mt-2">
        <Section label={inQuad.length ? "谁在这里" : "为什么是空的"}>
          {inQuad.length
            ? inQuad.map((r) => `${short(r.name)}（${r.lineage.items} 条 / ${(r.lineage.avg_maturity ?? 0).toFixed(2)}）`).join("、")
            : "没有任何资料库落在这一格。"}
        </Section>
        <Section label="该怎么读">{copy.read}</Section>
        <Section label="分割线怎么定">
          横轴切在 {cutX} 条：这是当前条目数排序里最靠右的一处断层，越过它的库与小库之间差一个量级。纵轴切在 2.5：这是 6 档里「算法与模型验证」与「原型与样机验证」的中点，越过它意味着平均做出过可运行的东西。
        </Section>
      </div>
    </>;
  }

  return <>
    <Head title="这张图的口径与边界" sub={`数据取各库技术谱系与四维归纳，共 ${rows.length} 个资料库`} />
    <div className="mt-2">
      <Section label="技术条目">谱系里逐条落位的技术记录。同一技术在多个项目下各计一次，衡量的是技术线索的厚度。</Section>
      <Section label="覆盖项目">条目里出现过的项目编号去重后计数，一定小于等于该库项目总数。</Section>
      <Section label="成熟度">0–5 六档，由模型逐条判定并附依据原文，取算术平均作为纵轴。全库 {items.toLocaleString("zh-CN")} 条中 {high} 条进入场景试验或转化。</Section>
      <Section label="四维覆盖">分母为识别出的项目数，分子为该维全部文件都已处理完的项目数。它衡量抽取完成度，不作内容质量评价。</Section>
    </div>
    <p className="mt-2 rounded bg-[var(--terrain-amber-soft)] px-2.5 py-2 text-caption leading-5 text-[var(--terrain-amber-ink)]">
      <b className="font-semibold">三条边界</b>　① 成熟度为模型标注，需人工核对；② 项目数在各库内去重、跨库未去重；③ 本图只做横向比较，绝对值不可对外引用。
    </p>
  </>;
}

const QUAD_TEXT: Record<QuadKey, { title: string; sub: string; read: string }> = {
  tl: { title: "小而精 · 左上", sub: "条目不破百，平均成熟度高于 2.5", read: "摊子不大，但沉淀得比多数库深。这一类最适合当模版：做法已经跑通，把它们的方法迁移到别的库，成本最低。" },
  tr: { title: "量大且深 · 右上", sub: "条目破百，平均成熟度高于 2.5", read: "既铺得开又沉得深。若这里长期是空的，说明扩量和提质还没有同时发生过。" },
  bl: { title: "少且浅 · 左下", sub: "条目不破百，平均成熟度低于 2.5", read: "规模本来就小，沉淀也还没起来。这里不宜再摊新方向，先把已有条目往原型推，否则扩量只会放大低成熟条目。" },
  br: { title: "铺得宽 · 沉不下去 · 右下", sub: "条目破百，平均成熟度低于 2.5", read: "条目多而成熟低，通常意味着抽取时把大量方法描述都算作了技术条目。先查口径，再谈投入。" },
};

export function shortPct(value: number) {
  return `${(Math.round(value * 10) / 10).toString().replace(/\.0$/, "")}%`;
}

export function quadOf(row: LibraryOverview, cutX: number): QuadKey {
  return `${(row.lineage.avg_maturity ?? 0) >= 2.5 ? "t" : "b"}${(row.lineage.items || 0) >= cutX ? "r" : "l"}` as QuadKey;
}
