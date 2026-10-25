import { HelpTerm as Info } from "../HelpTerm";
import { useAuth } from "../../auth";
import { useLayout } from "../../layout";
import type {
  AtlasMeasure,
  AtlasModel,
  Lens,
  YearWindow,
} from "../../domainAtlas";
import {
  LENSES,
  NODE_KINDS,
  OUTPUT_MEANING,
  lensValue,
} from "../../domainAtlas";
import { cash, fmt, windowLabel } from "./lensFormat";
type Props = {
  model: AtlasModel;
  d: AtlasMeasure;
  selected: string | null;
  base: string | null;
  window: YearWindow;
  lens: Lens;
  kind: "domain" | "system" | "direction";
  medians: { mx: number; my: number };
  open: boolean;
  onClose: () => void;
  onSelectRow: (id: string) => void;
  showLibrary: () => void;
};
export function LensInspector({
  model,
  d,
  selected,
  base,
  window,
  lens,
  kind,
  medians,
  open,
  onClose,
  onSelectRow,
  showLibrary,
}: Props) {
  const { role } = useAuth(),
    { openCorpus } = useLayout();
  const domain = model.nodes.get(d.node.domain),
    short = domain?.name.replace(/^AI与/, "");
  const missingMoney = d.projects - d.funded,
    missingOutputs = d.projects - d.listed;
  const v = LENSES[lens],
    value = lensValue(d, lens);
  const quadrant = value.reason
    ? null
    : (value.y! > medians.my ? 0 : 2) + (value.x! > medians.mx ? 1 : 0);
  const why = value.reason
    ? value.reason
    : `在「${v.quads[(value.y! > medians.my ? 0 : 2) + (value.x! > medians.mx ? 1 : 0)]}」：${v.x} ${fmt(value.x!)}（中位 ${fmt(medians.mx)}），${v.y} ${fmt(value.y!)}（中位 ${fmt(medians.my)}）。`;
  const rows = d.node.children.map((id) => model.measure(id, window));
  return (
    <aside
      className={`lens-inspector ${open ? "is-open" : ""}`}
      aria-label="研究详情"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="lens-inspector-top">
        <span className="lens-inspector-status" role="status">
          {base
            ? `对比中 · ${NODE_KINDS[kind]}`
            : selected
              ? `已选中 · ${NODE_KINDS[d.node.kind]}`
              : `当前层 · ${NODE_KINDS[kind]}`}
        </span>
        <button
          type="button"
          className="lens-icon-button"
          aria-label="收起详情"
          title="收起详情"
          onClick={onClose}
        >
          ⟩
        </button>
      </div>
      <div
        key={`${d.node.id}|${base}|${window.from}|${window.to}`}
        className="lens-detail-body"
      >
        {base && selected ? (
          <>
            <h3>并排看两个{NODE_KINDS[kind]}</h3>
            <div className="lens-pair-names">
              <b className="lens-a">A · {model.nodes.get(base)!.name}</b>
              <b className="lens-b">B · {model.nodes.get(selected)!.name}</b>
            </div>
            <Compare
              a={model.measure(base, window)}
              b={model.measure(selected, window)}
            />
          </>
        ) : (
          <>
            <h3 className="lens-preview-name">
              {domain && d.node.kind === "domain" ? (
                <a
                  className="ui-page-link"
                  href={`/library/${encodeURIComponent(domain.id)}/${role === "leader" ? "targets/four-facets" : "documents"}`}
                  onClick={(e) => {
                    if (
                      e.button === 0 &&
                      !e.ctrlKey &&
                      !e.metaKey &&
                      !e.shiftKey &&
                      !e.altKey
                    ) {
                      e.preventDefault();
                      openCorpus(domain.id);
                    }
                  }}
                >
                  {d.node.name}
                </a>
              ) : (
                d.node.name
              )}
            </h3>
            <p className="lens-scope-range">
              {windowLabel(window).replace("立项", "")}
            </p>
            <div className="lens-four">
              <div>
                <b>{fmt(d.projects)}</b>
                <span className="lens-stat-label">
                  <Info
                    text={`当前层与所选立项年份内的可确认项目，各体系可能涉及相同项目。${d.undated ? `含 ${d.undated} 项立项年份未确认，仅计累计，不进入年度柱图。` : ""}`}
                  >
                    项目
                  </Info>
                </span>
              </div>
              <div>
                <b>{cash(d)}</b>
                <span className="lens-stat-label">
                  <Info
                    text={`${d.funded}/${d.projects} 项给出金额，未记录不作零。`}
                  >
                    批准资助金额
                  </Info>
                </span>
                {d.projects && d.funded / d.projects < 0.95 ? (
                  <small>缺 {missingMoney} 项</small>
                ) : null}
              </div>
              <div>
                <b>{fmt(d.items)}</b>
                <span className="lens-stat-label">
                  <Info
                    text={`${d.items - d.levels[0]} 条已判定成熟度；平均成熟度只计已判定条目。`}
                  >
                    技术条目
                  </Info>
                </span>
              </div>
              <div>
                <b>{d.listed ? fmt(d.outputs) : "未记录"}</b>
                <span className="lens-stat-label">
                  <Info
                    text={`${d.listed}/${d.projects} 项列有成果。${OUTPUT_MEANING}`}
                  >
                    成果条目
                  </Info>
                </span>
                {d.projects && d.listed / d.projects < 0.95 ? (
                  <small>缺 {missingOutputs} 项</small>
                ) : null}
              </div>
            </div>
            {selected ? (
              <div className="lens-why">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  aria-hidden="true"
                >
                  {[0, 1, 2, 3].map((i) => (
                    <rect
                      key={i}
                      x={(i % 2) * 12}
                      y={Math.floor(i / 2) * 12}
                      width="10"
                      height="10"
                      rx="2"
                      fill="currentColor"
                      opacity={i === quadrant ? 1 : 0.16}
                    />
                  ))}
                </svg>
                <Info text={why}>
                  {quadrant === null ? "暂不能定位" : v.quads[quadrant]}
                </Info>
              </div>
            ) : null}
            {missingMoney || missingOutputs ? (
              <div className="lens-coverage">
                <Info
                  text={`${missingMoney ? `缺金额 ${missingMoney} 项` : "金额完整"}；${missingOutputs ? `缺成果 ${missingOutputs} 项` : "成果完整"}。缺失已列入补录待办。`}
                >
                  待补录
                </Info>
              </div>
            ) : null}
            {rows.length ? (
              <>
                <h4>
                  <Info text="各行可能涉及同一项目，不可直接相加。">
                    {NODE_KINDS[rows[0].node.kind]}构成
                  </Info>
                </h4>
                <table className="lens-read-table">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>项目</th>
                      <th>资助/万</th>
                      <th>技术</th>
                      <th>成果</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.node.id}
                        tabIndex={0}
                        className="lens-row-hit"
                        onClick={() => onSelectRow(row.node.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onSelectRow(row.node.id);
                          }
                        }}
                      >
                        <td>{row.node.name}</td>
                        <td>{row.projects}</td>
                        <td>{row.funded ? fmt(row.funding) : "未记录"}</td>
                        <td>{fmt(row.items)}</td>
                        <td>{row.listed ? fmt(row.outputs) : "未记录"}</td>
                        <td>›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
            {d.node.kind === "direction" ? (
              <>
                <h4>涉及项目</h4>
                {d.records.slice(0, 20).map((p, i) => (
                  <article className="lens-project" key={`${p.id}-${i}`}>
                    {p.title}
                    <p>
                      {p.year ?? "年份待核对"} ·{" "}
                      {p.amount === null
                        ? "金额未记录"
                        : `${fmt(p.amount)} 万元`}{" "}
                      ·{" "}
                      {p.outputs === null
                        ? "成果未记录"
                        : `${p.outputs} 项成果`}
                    </p>
                  </article>
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
      {domain ? (
        <div className="lens-inspector-foot">
          <button type="button" className="lens-primary" onClick={showLibrary}>
            预览资料库 · {short}
          </button>
        </div>
      ) : null}
    </aside>
  );
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
    ["均资助/万", fmt(a.avgFunding), fmt(b.avgFunding)],
    ["均成果/项", fmt(a.avgOutputs), fmt(b.avgOutputs)],
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
        {rows.map(([name, x, y]) => (
          <tr key={name}>
            <td>{name}</td>
            <td className="lens-a">{x}</td>
            <td className="lens-b">{y}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
