import type { Dispatch, SetStateAction, RefObject } from "react";
import {
  LENSES,
  NODE_KINDS,
  OUTPUT_MEANING,
  lensValue,
  type AtlasMeasure,
  type AtlasModel,
  type Lens,
  type YearWindow,
} from "../../domainAtlas";
import { fmt, cash, windowLabel } from "./lensFormat";
type Props = {
  dismissTip: () => void;
  model: AtlasModel;
  d: AtlasMeasure;
  years: number[];
  base: string | null;
  selected: string;
  chosen: string;
  peek: number | null;
  window: YearWindow;
  lens: Lens;
  open: boolean;
  drawerDrag: RefObject<number | null>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  showLibrary: () => void;
  explain: (el: Element, title: string, text: string) => void;
  layout: {
    mx: number;
    my: number;
  };
};
export function LensInspector({
  dismissTip,
  model,
  d,
  years,
  base,
  selected,
  chosen,
  peek,
  window,
  lens,
  open,
  drawerDrag,
  setOpen,
  showLibrary,
  explain,
  layout,
}: Props) {
  const beginDrawerPull: NonNullable<
    React.ComponentProps<"div">["onPointerDown"]
  > = (e) => {
    drawerDrag.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const commitDrawerPull: NonNullable<
    React.ComponentProps<"div">["onPointerUp"]
  > = (e) => {
    if (drawerDrag.current !== null) {
      const dx = e.clientX - drawerDrag.current;
      if (dx > 60) setOpen(false);
      else if (dx < -60) showLibrary();
    }
    drawerDrag.current = null;
  };
  const cancelDrawerPull: NonNullable<
    React.ComponentProps<"div">["onPointerCancel"]
  > = () => {
    drawerDrag.current = null;
  };
  const openLibraryFromHeading: NonNullable<
    React.ComponentProps<"h3">["onKeyDown"]
  > = (e) => {
    if (e.key === "Enter") showLibrary();
  };
  const explainOutcomeMeaning: NonNullable<
    React.ComponentProps<"span">["onPointerEnter"]
  > = (e) => explain(e.currentTarget, "成果统计口径", OUTPUT_MEANING);
  const dismissOutcomeMeaning: NonNullable<
    React.ComponentProps<"span">["onPointerLeave"]
  > = () => dismissTip();
  const focusOutcomeMeaning: NonNullable<
    React.ComponentProps<"span">["onFocus"]
  > = (e) => explain(e.currentTarget, "成果统计口径", OUTPUT_MEANING);
  const blurOutcomeMeaning: NonNullable<
    React.ComponentProps<"span">["onBlur"]
  > = () => dismissTip();
  const v = LENSES[lens];
  return (
    <aside
      className={`lens-inspector ${open ? "is-open" : ""}`}
      aria-label="研究详情"
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className="lens-drawer-grip"
        onPointerDown={beginDrawerPull}
        onPointerUp={commitDrawerPull}
        onPointerCancel={cancelDrawerPull}
      >
        <span>
          {base ? "蓝线对比" : peek ? `${peek} 年预览` : windowLabel(window)}
        </span>
        <span>← 预览资料库 · 收起 →</span>
      </div>
      <div className="lens-detail-body">
        {base ? (
          <>
            <h3>并排看两个{NODE_KINDS[d.node.kind]}</h3>
            <div className="lens-pair-names">
              <span className="lens-a">A / {model.nodes.get(base)!.name}</span>
              <span className="lens-b">
                B / {model.nodes.get(selected)!.name}
              </span>
            </div>
            <Compare
              a={model.measure(base, window)}
              b={model.measure(selected, window)}
            />
            <ProjectYears
              model={model}
              ids={[base, selected]}
              years={years}
              window={window}
            />
            <Coverage d={model.measure(base, window)} />
            <Coverage d={model.measure(selected, window)} />
          </>
        ) : (
          <>
            <h3
              tabIndex={0}
              className="lens-preview-name"
              onDoubleClick={showLibrary}
              onKeyDown={openLibraryFromHeading}
              title="双击或回车预览资料库"
            >
              {d.node.name}
            </h3>
            <p className="lens-muted">向左拉动顶栏，预览资料库全库概况</p>
            <div className="lens-four">
              <div>
                <b>{fmt(d.projects)}</b>
                <span>项目</span>
              </div>
              <div>
                <b>{cash(d)}</b>
                <span>批准资助金额</span>
                <small>
                  {d.funded}/{d.projects} 项记录金额
                </small>
              </div>
              <div>
                <b>{fmt(d.items)}</b>
                <span>技术条目</span>
                <small>{d.items - d.levels[0]} 条已判定</small>
              </div>
              <div>
                <b>{d.listed ? fmt(d.outputs) : "未记录"}</b>
                <span>
                  成果条目{" "}
                  <span
                    tabIndex={0}
                    className="lens-info"
                    onPointerEnter={explainOutcomeMeaning}
                    onPointerLeave={dismissOutcomeMeaning}
                    onFocus={focusOutcomeMeaning}
                    onBlur={blurOutcomeMeaning}
                  >
                    ⓘ
                  </span>
                </span>
                <small>
                  {d.listed}/{d.projects} 项列有成果
                </small>
              </div>
            </div>
            <div className="lens-why">
              {(() => {
                const p = lensValue(d, lens);
                if (peek) return "年度单元格预览；主图仍按上方年份范围绘制。";
                if (p.reason) return p.reason;
                const q =
                  (p.y! > layout.my ? 0 : 2) + (p.x! > layout.mx ? 1 : 0);
                return (
                  <>
                    <b>「{v.quads[q]}」</b>
                    <span>
                      {v.x} {fmt(p.x!)}，{p.x! > layout.mx ? "高于" : "不高于"}
                      中位 {fmt(layout.mx)}
                    </span>
                    <span>
                      {v.y} {fmt(p.y!)}，{p.y! > layout.my ? "高于" : "不高于"}
                      中位 {fmt(layout.my)}
                    </span>
                  </>
                );
              })()}
            </div>
            <ProjectYears
              model={model}
              ids={[chosen]}
              years={years}
              window={peek ? { from: peek, to: peek } : window}
            />
            <Coverage d={d} />
            {d.node.children.length ? (
              <>
                <h4>
                  {NODE_KINDS[model.nodes.get(d.node.children[0])!.kind]}构成
                </h4>
                <table className="lens-read-table">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>项目</th>
                      <th>资助/万</th>
                      <th>成果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.node.children
                      .map((id) =>
                        model.measure(
                          id,
                          peek ? { from: peek, to: peek } : window,
                        ),
                      )
                      .map((c) => {
                        return (
                          <tr key={c.node.id}>
                            <td>{c.node.name}</td>
                            <td>{c.projects}</td>
                            <td>{c.funded ? fmt(c.funding) : "—"}</td>
                            <td>{c.listed ? fmt(c.outputs) : "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <p className="lens-muted">
                  双击图中节点展开。涉及项目可能重复，各行不可相加。
                </p>
              </>
            ) : (
              <>
                <h4>涉及项目 · 研究方向层到此为止</h4>
                {d.records.slice(0, 20).map((p) => {
                  return (
                    <article key={p.id} className="lens-project">
                      {p.title}
                      <small>
                        {p.year ?? "年份待核对"} ·{" "}
                        {p.amount === null
                          ? "金额未记录"
                          : `${fmt(p.amount)} 万元`}{" "}
                        ·{" "}
                        {p.outputs === null
                          ? "成果未记录"
                          : `${p.outputs} 项成果`}
                      </small>
                    </article>
                  );
                })}
              </>
            )}
            {d.undated ? (
              <p className="lens-muted">
                累计含 {d.undated} 个立项年份未确认项目，选择年份时不计入。
              </p>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
function ProjectYears({
  model,
  ids,
  years,
  window,
}: {
  model: AtlasModel;
  ids: string[];
  years: number[];
  window: YearWindow;
}) {
  const values = ids.map((id) =>
      years.map((y) => model.measure(id, { from: y, to: y }).projects),
    ),
    peak = Math.max(1, ...values.flat());
  if (!years.length) return null;
  return (
    <section className="lens-year-summary" aria-label="各年立项项目分布">
      <h4>
        各年立项项目{" "}
        <small>
          {years[0]}—{years.at(-1)}
        </small>
      </h4>
      <div
        className="lens-spark"
        style={{ gridTemplateColumns: `repeat(${years.length},minmax(0,1fr))` }}
      >
        {years.map((y, i) => {
          return (
            <div
              key={y}
              title={ids
                .map(
                  (id, j) =>
                    `${model.nodes.get(id)?.name} ${y}年 ${values[j][i]} 项目`,
                )
                .join("；")}
              data-active={
                window.from === null ||
                (y >= window.from && y <= (window.to ?? window.from))
              }
            >
              <div className="lens-spark-bars">
                {ids.map((id, j) => {
                  return (
                    <i
                      key={id}
                      style={{
                        height: `${(values[j][i] / peak) * 100}%`,
                        background:
                          ids.length === 1 || j
                            ? "var(--terrain-dot-on)"
                            : "var(--link)",
                      }}
                    />
                  );
                })}
              </div>
              <span>{String(y).slice(-2)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function Coverage({ d }: { d: AtlasMeasure }) {
  if (d.projects < 3)
    return (
      <p className="lens-muted">
        {d.projects
          ? `节点本身只有 ${d.projects} 个项目，不能形成 3 项目均值。`
          : "所选年份没有立项。"}
      </p>
    );
  const a = d.projects - d.funded,
    b = d.projects - d.listed;
  return a || b ? (
    <p className="lens-coverage">
      <b>{d.node.name} · 资料待补充</b>
      {a ? `${a} 项未记录批准资助金额。` : ""}
      {b ? `${b} 项未提供成果列表。` : ""}已列入资料管理员的补录待办。
    </p>
  ) : null;
}
function Compare({ a, b }: { a: AtlasMeasure; b: AtlasMeasure }) {
  const rows = [
    ["项目", fmt(a.projects), fmt(b.projects)],
    ["批准资助金额", cash(a), cash(b)],
    ["技术条目", fmt(a.items), fmt(b.items)],
    [
      "成果条目",
      a.listed ? fmt(a.outputs) : "未记录",
      b.listed ? fmt(b.outputs) : "未记录",
    ],
    ["平均成熟度", fmt(a.maturity), fmt(b.maturity)],
    [
      "4–5档占比",
      a.landed === null ? "—" : fmt(a.landed) + "%",
      b.landed === null ? "—" : fmt(b.landed) + "%",
    ],
    [
      "均资助/万",
      a.avgFunding === null ? "不足3项" : fmt(a.avgFunding),
      b.avgFunding === null ? "不足3项" : fmt(b.avgFunding),
    ],
    [
      "均成果/项",
      a.avgOutputs === null ? "不足3项" : fmt(a.avgOutputs),
      b.avgOutputs === null ? "不足3项" : fmt(b.avgOutputs),
    ],
    ["金额覆盖", `${a.funded}/${a.projects}`, `${b.funded}/${b.projects}`],
    ["成果覆盖", `${a.listed}/${a.projects}`, `${b.listed}/${b.projects}`],
  ];
  return (
    <table className="lens-read-table">
      <thead>
        <tr>
          <th>指标</th>
          <th>A</th>
          <th>B</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, x, y]) => {
          return (
            <tr key={k}>
              <td>{k}</td>
              <td className="lens-a">{x}</td>
              <td className="lens-b">{y}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
