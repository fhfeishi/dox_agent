import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { downloadText } from "../../exportFormat";
import { useApp } from "../../store";
import type { Domain, DomainsOverview } from "../../domains";
import { SlideOver } from "../SlideOver";

/**
 * 03 缺口与机会 (query 2026-1021 1629, 2026-1022 1606 / 1706, after the 研究地形图 demo).
 *
 * Left, 哪里有缺口: three tabs — 空白技术 (the lineage review found no project covering it), 待解问题
 * (a scene problem not yet solved), 未覆盖组合 (a system the domain uses in three or more scenes, missing
 * from this one) — with a distribution bar; each row opens to say why it is a gap and offers 加入候选池,
 * 在 01 定位 and 在 02 谱系中看; chips below narrow the tab to one library.
 * Right, 下一步可以先做什么: the tab's openings on two counted axes — 已有基础 (projects in the library
 * that already work on it) and 影响面 (projects in the scene it would serve) — as a quadrant or a ranked
 * list; a click puts it in the 候选池, whose two buttons open the export and proposal previews.
 * The pool is kept in this browser only.
 */
type Kind = "blank" | "issue" | "combo";
export type Opportunity = { key: string; kind: Kind; domain: string; domainId: string; title: string; detail: string; basis: string;
  base: number; reach: number; system?: string };
const KINDS: { key: Kind; label: string; reads: string; first: string }[] = [
  { key: "blank", label: "空白技术", reads: "谱系核对出、本库还没有项目覆盖",
    first: "先核对资料库里确实没有相关项目，再选一个已有场景做小规模引入验证" },
  { key: "issue", label: "待解问题", reads: "场景里尚未解决的问题",
    first: "梳理该场景已有项目对这个问题的尝试和未解原因，定出可验证的指标" },
  { key: "combo", label: "未覆盖组合", reads: "3 个以上场景用过、唯独这里没用的体系",
    first: "选一个已在其他场景用这个体系的项目，做向本场景的方法迁移试验" },
];
const STORE = "dox.atlas.opportunities";
const MAX_PROPOSAL = 8;

function load(): Opportunity[] {
  try { return (JSON.parse(localStorage.getItem(STORE) || "[]") as Opportunity[]).filter((o) => o.basis !== undefined && o.domainId !== undefined); } catch { return []; }
}

export function proposalQuestion(list: Opportunity[], note: string) {
  const lines = list.slice(0, MAX_PROPOSAL).map((o, i) =>
    `${i + 1}. 【${o.domain} · ${KINDS.find((k) => k.key === o.kind)!.label}】${o.title}${o.detail ? `——${o.detail}` : ""}`);
  return ["请基于资料库中的已有项目与技术，为下列机会逐条给出立项建议：研究目标、可依托的已有基础（列出相关项目）、需要补上的关键技术、预期成果与主要风险；区分资料依据与研判意见，资料不足的地方直接说明。",
    ...lines, note.trim() ? `补充要求：${note.trim()}` : ""].filter(Boolean).join("\n");
}

function opportunities(domain: Domain): Record<Kind, Opportunity[]> {
  const scene = (name: string) => domain.scenes.find((s) => s.name === name);
  const systemProjects = (name: string) => domain.systems.find((s) => s.name === name)?.projects ?? 0;
  return {
    blank: domain.blanks.map((b) => ({ key: `blank:${domain.id}:${b.name}`, kind: "blank", domain: domain.name, domainId: domain.id, title: b.name,
      detail: b.reason || b.plain, basis: `本库 ${domain.projects} 个项目都没有覆盖这项技术（谱系核对结果）`, base: 0, reach: domain.projects })),
    issue: domain.open_issues.map((i) => {
      const s = scene(i.scene);
      return { key: `issue:${domain.id}:${i.scene}:${i.name}`, kind: "issue" as const, domain: domain.name, domainId: domain.id, title: i.name,
        detail: `${i.scene}${i.state ? ` · ${i.state}` : ""}${i.summary ? `：${i.summary}` : ""}`,
        basis: s ? `场景「${s.name}」已有 ${s.projects} 个项目，其中 ${i.projects} 个写到了这个问题${s.systems.length ? `；用到 ${s.systems.slice(0, 3).join("、")}${s.systems.length > 3 ? " 等" : ""}` : ""}` : `所在场景「${i.scene}」`,
        base: i.projects, reach: s?.projects ?? 0 };
    }),
    combo: domain.combos.map((c) => {
      const users = domain.scenes.filter((s) => s.systems.includes(c.system)).map((s) => s.name);
      return { key: `combo:${domain.id}:${c.scene}:${c.system}`, kind: "combo" as const, domain: domain.name, domainId: domain.id, title: `${c.scene} × ${c.system}`,
        detail: `该体系已用于 ${c.used_in}/${c.scenes} 个场景，这个场景还没有`, system: c.system,
        basis: `「${c.system}」已有 ${systemProjects(c.system)} 个项目在用，分布在：${users.slice(0, 4).join("、")}${users.length > 4 ? ` 等 ${users.length} 个场景` : ""}`,
        base: systemProjects(c.system), reach: scene(c.scene)?.projects ?? 0 };
    }),
  };
}

function asMarkdown(list: Opportunity[]) {
  return ["# 机会清单", "", ...KINDS.flatMap((k) => {
    const items = list.filter((o) => o.kind === k.key);
    return items.length ? [`## ${k.label}`, "", "| 领域 | 机会 | 说明 | 已有基础 |", "|---|---|---|---|",
      ...items.map((o) => `| ${o.domain} | ${o.title} | ${o.detail.replace(/\|/g, "／")} | ${o.basis.replace(/\|/g, "／")} |`), ""] : [];
  })].join("\n");
}
function asCsv(list: Opportunity[]) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ["类型,领域,机会,说明,已有基础", ...list.map((o) => [KINDS.find((k) => k.key === o.kind)!.label, o.domain, o.title, o.detail, o.basis].map(cell).join(","))].join("\n");
}
function proposalMarkdown(list: Opportunity[]) {
  return ["# 立项建议（草稿）", "", "由机会清单生成，尚未做可行性与经费评估。", "", ...list.flatMap((o, i) => [
    `## ${i + 1}. ${o.title}（${o.domain} · ${KINDS.find((k) => k.key === o.kind)!.label}）`, "",
    `- 已有基础：${o.basis}`, `- 缺口：${o.detail || o.title}`, `- 首步验证：${KINDS.find((k) => k.key === o.kind)!.first}`, ""])].join("\n");
}

/** 已有基础 × 影响面 on square-root scales: two libraries hold most projects, the rest would sit on the axis. */
function OppMap({ items, pool, onPick }: { items: Opportunity[]; pool: Set<string>; onPick: (o: Opportunity) => void }) {
  const W = 460, H = 300, L = 48, R = 440, T = 26, B = 258;
  const maxBase = Math.max(1, ...items.map((o) => o.base)), maxReach = Math.max(1, ...items.map((o) => o.reach));
  const x = (v: number) => L + Math.sqrt(v / maxBase) * (R - L), y = (v: number) => B - Math.sqrt(v / maxReach) * (B - T);
  const ranked = [...items].sort((a, b) => (b.base / maxBase + b.reach / maxReach) - (a.base / maxBase + a.reach / maxReach));
  // Many openings share the same two counts: equal points fan out a few pixels, and a label is drawn
  // only where it does not collide with one already placed (best-ranked first).
  const seen = new Map<string, number>();
  const at = new Map(ranked.map((o) => {
    const key = `${o.base}|${o.reach}`, n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return [o.key, { cx: x(o.base) + (n ? ((n % 2 ? 1 : -1) * Math.ceil(n / 2) * 7) : 0), cy: y(o.reach) }];
  }));
  const placed: { x: number; y: number; w: number }[] = [];
  const labelled = new Set<string>();
  for (const o of ranked.slice(0, 12)) {
    const p = at.get(o.key)!, w = Math.min(14, o.title.length) * 11;
    if (placed.some((q) => Math.abs(q.y - p.cy) < 15 && Math.abs(q.x - p.cx) < (q.w + w) / 2 + 10)) continue;
    placed.push({ x: p.cx, y: p.cy, w }); labelled.add(o.key);
  }
  const midX = (L + R) / 2, midY = (T + B) / 2;
  return <svg viewBox={`0 0 ${W} ${H}`} className="opp-map" role="group" aria-label="机会象限：横轴已有基础，纵轴影响面">
    <rect x={L} y={T} width={R - L} height={B - T} className="opp-plot" />
    <rect x={midX} y={T} width={R - midX} height={midY - T} className="opp-best" />
    <text x={R - 6} y={midY - 6} textAnchor="end" className="opp-best-label">有基础、影响大：先做</text>
    <line x1={midX} y1={T} x2={midX} y2={B} className="opp-mid" /><line x1={L} y1={midY} x2={R} y2={midY} className="opp-mid" />
    <text x={R} y={B + 18} textAnchor="end" className="opp-axis">已有基础（相关项目数）→</text>
    <text x={L} y={T - 10} className="opp-axis">影响面（涉及项目数）↑</text>
    {ranked.slice().reverse().map((o) => {
      const { cx, cy } = at.get(o.key)!, on = pool.has(o.key), right = cx < R - 140;
      return <g key={o.key} className={`opp-pt${on ? " is-in" : ""}`} role="button" tabIndex={0}
        aria-label={`${o.title}，已有基础 ${o.base}，影响面 ${o.reach}${on ? "，已在候选池" : ""}`}
        onClick={() => onPick(o)} onKeyDown={(e) => { if (e.key === "Enter") onPick(o); }}>
        <title>{`${o.domain} · ${o.title}\n已有基础 ${o.base} 个项目 · 影响面 ${o.reach} 个项目`}</title>
        <circle cx={cx} cy={cy} r="11" className="halo" /><circle cx={cx} cy={cy} r="4.5" className="dot" />
        {labelled.has(o.key) ? <text x={right ? cx + 9 : cx - 9} y={cy + 4} textAnchor={right ? "start" : "end"}>
          {o.title.length > 14 ? `${o.title.slice(0, 13)}…` : o.title}{on ? " ✓" : ""}</text> : null}
      </g>;
    })}
  </svg>;
}

export function GapBoard({ data, onLocate, onReveal }: {
  data: DomainsOverview; onLocate: (domainId: string) => void; onReveal: (domainId: string, system?: string) => void;
}) {
  const { askInTask } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Kind>("issue");
  const [domain, setDomain] = useState("");
  const [open, setOpen] = useState("");
  const [mode, setMode] = useState<"map" | "list">("map");
  const [pool, setPool] = useState<Opportunity[]>(load);
  const [panel, setPanel] = useState<"" | "export" | "proposal">("");
  const [format, setFormat] = useState<"md" | "csv">("md");
  const [note, setNote] = useState("");
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(pool)); } catch { /* private mode: the pool lives for this visit */ } }, [pool]);

  const all: Record<Kind, Opportunity[]> = { blank: [], issue: [], combo: [] };
  for (const d of data.domains) { const o = opportunities(d); for (const k of KINDS) all[k.key].push(...o[k.key]); }
  const total = all.blank.length + all.issue.length + all.combo.length || 1;
  const inTab = all[tab];
  const shown = inTab.filter((o) => !domain || o.domainId === domain);
  const perDomain = data.domains.map((d) => ({ d, n: inTab.filter((o) => o.domainId === d.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const unchecked = data.domains.filter((d) => !d.blanks_checked).length;
  const inPool = new Set(pool.map((o) => o.key));
  const flip = (item: Opportunity) => setPool(inPool.has(item.key) ? pool.filter((o) => o.key !== item.key) : [...pool, item]);
  const add = (item: Opportunity) => { if (!inPool.has(item.key)) setPool([...pool, item]); };
  const proposal = pool.slice(0, MAX_PROPOSAL);
  const ranked = [...shown].sort((a, b) => (b.base + b.reach) - (a.base + a.reach));
  const maxBase = Math.max(1, ...shown.map((o) => o.base)), maxReach = Math.max(1, ...shown.map((o) => o.reach));

  return <div className="gap-board">
    <section className="gap-card" aria-label="哪里有缺口">
      <header><h3>哪里有缺口</h3><small>点一行看判断依据</small><span>共 <b>{total}</b> 项</span></header>
      <div role="tablist" aria-label="缺口类型" className="gap-tabs">
        {KINDS.map((k) => <button key={k.key} role="tab" type="button" aria-selected={tab === k.key}
          onClick={() => { setTab(k.key); setOpen(""); setDomain(""); }}>
          <b>{all[k.key].length}</b>{k.label}<small>{k.reads}</small></button>)}
      </div>
      <div className="gap-dist" aria-hidden="true">{KINDS.map((k) => <i key={k.key} className={`is-${k.key}`} style={{ width: `${(all[k.key].length / total) * 100}%` }} />)}</div>
      {tab === "blank" && unchecked ? <p className="gap-note">{unchecked} 个领域还没做谱系核对，这一栏只来自做过核对的库。</p> : null}
      <ul className="gap-list">
        {shown.slice(0, 60).map((o) => {
          const isOpen = open === o.key;
          return <li key={o.key} className={`${isOpen ? "is-open" : ""}${inPool.has(o.key) ? " is-in" : ""}`}>
            <button type="button" className="gap-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : o.key)}>
              <span className={`gap-kind is-${o.kind}`}>{KINDS.find((k) => k.key === o.kind)!.label.slice(0, 2)}</span>
              <b>{o.title}</b><small>{o.domain.replace(/^AI与/, "")}</small><i aria-hidden="true">{isOpen ? "▾" : "▸"}</i>
            </button>
            {isOpen ? <div className="gap-body">
              {o.detail ? <p>{o.detail}</p> : null}
              <p className="basis">已有基础：{o.basis}</p>
              <div className="gap-acts">
                <button type="button" className="primary" onClick={() => flip(o)}>{inPool.has(o.key) ? "移出候选池" : "加入候选池"}</button>
                <button type="button" onClick={() => onLocate(o.domainId)}>在 01 定位</button>
                <button type="button" onClick={() => onReveal(o.domainId, o.system)}>在 02 谱系中看</button>
              </div>
            </div> : null}
          </li>;
        })}
        {shown.length > 60 ? <li className="gap-more">另有 {shown.length - 60} 项，选一个领域缩小范围</li> : null}
        {!shown.length ? <li className="gap-more">这一类没有</li> : null}
      </ul>
      {perDomain.length > 1 ? <div className="gap-domains" role="group" aria-label="本类按领域">
        <span>本类按领域：</span>
        {perDomain.map(({ d, n }) => <button key={d.id} type="button" aria-pressed={domain === d.id} onClick={() => setDomain(domain === d.id ? "" : d.id)}>
          {d.name.replace(/^AI与/, "")}<i>{n}</i></button>)}
      </div> : null}
    </section>

    <section className="gap-card" aria-label="下一步可以先做什么">
      <header><h3>下一步可以先做什么</h3><small>点一项加入候选池</small>
        <span role="tablist" aria-label="展示方式" className="gap-mode">
          <button role="tab" type="button" aria-selected={mode === "map"} onClick={() => setMode("map")}>象限图</button>
          <button role="tab" type="button" aria-selected={mode === "list"} onClick={() => setMode("list")}>排序列表</button>
        </span></header>
      <p className="gap-note">当前：{KINDS.find((k) => k.key === tab)!.label}{domain ? ` · ${data.domains.find((d) => d.id === domain)?.name.replace(/^AI与/, "")}` : ""} {shown.length} 项。两个轴都是项目计数，右上角“有基础、影响大”优先考虑。</p>
      {mode === "map" ? (shown.length ? <OppMap items={shown} pool={inPool} onPick={add} /> : <p className="gap-more">这一类没有</p>)
        : <ol className="opp-list">{ranked.slice(0, 20).map((o, i) => <li key={o.key}>
          <span className="rank">{i + 1}</span>
          <span className="name"><b>{o.title}</b><small>{o.domain.replace(/^AI与/, "")}</small></span>
          <span className="bars"><span>基础<i><i style={{ width: `${(o.base / maxBase) * 100}%` }} /></i>{o.base}</span>
            <span>影响<i><i style={{ width: `${(o.reach / maxReach) * 100}%` }} /></i>{o.reach}</span></span>
          <button type="button" aria-pressed={inPool.has(o.key)} onClick={() => flip(o)}>{inPool.has(o.key) ? "已加入" : "加入"}</button>
        </li>)}</ol>}

      <div className="atlas-pool" aria-label="候选池" role="region">
        <div className="atlas-pool-head"><b>候选池</b><span>{pool.length} 项</span>
          {pool.length ? <button type="button" onClick={() => setPool([])}>清空</button> : null}</div>
        <div className="atlas-pool-items">
          {pool.length ? pool.map((o) => <span key={o.key}><small>{o.domain.replace(/^AI与/, "")}</small>{o.title}
            <button type="button" aria-label={`移出：${o.title}`} onClick={() => flip(o)}>×</button></span>)
            : <em>从左侧展开一条“加入候选池”，或点右侧象限图里的点</em>}
        </div>
        <div className="atlas-pool-actions">
          <button type="button" disabled={!pool.length} onClick={() => setPanel("export")}>导出机会清单</button>
          <button type="button" className="primary" disabled={!pool.length} onClick={() => setPanel("proposal")}>生成立项建议 →</button>
        </div>
      </div>
    </section>
    <SlideOver open={panel === "export"} onClose={() => setPanel("")} eyebrow="导出预览" title="机会清单" label="导出机会清单"
      stats={KINDS.map((k) => ({ value: pool.filter((o) => o.kind === k.key).length, label: k.label }))}
      footer={<>
        <span role="radiogroup" aria-label="导出格式" className="slide-seg">
          {(["md", "csv"] as const).map((f) => <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}>{f === "md" ? "Markdown" : "CSV（Excel）"}</button>)}
        </span>
        <button type="button" className="slide-action primary" onClick={() => downloadText(format === "md" ? asMarkdown(pool) : asCsv(pool), format === "md" ? "机会清单.md" : "机会清单.csv")}>下载 {pool.length} 项</button>
      </>}>
      {KINDS.map((k) => {
        const items = pool.filter((o) => o.kind === k.key);
        return items.length ? <section key={k.key} className="slide-group">
          <h3>{k.label}</h3>
          {items.map((o) => <article key={o.key} className="slide-card">
            <small>{o.domain}</small><b>{o.title}</b>{o.detail ? <p>{o.detail}</p> : null}<p className="basis">已有基础：{o.basis}</p>
          </article>)}
        </section> : null;
      })}
    </SlideOver>

    <SlideOver open={panel === "proposal"} onClose={() => setPanel("")} eyebrow="立项建议 · 草稿" title="立项建议（草稿）" label="生成立项建议"
      stats={[{ value: proposal.length, label: "候选方向" }, { value: new Set(proposal.map((o) => o.domain)).size, label: "涉及领域" }]}
      warn={<>“已有基础”由资料库计数得出；“首步验证”是按缺口类型给的起步建议，尚未做可行性与经费评估。{pool.length > MAX_PROPOSAL ? `一次最多 ${MAX_PROPOSAL} 条，其余请下次生成。` : ""}</>}
      footer={<>
        <button type="button" className="slide-action" onClick={() => downloadText(proposalMarkdown(proposal), "立项建议-草稿.md")}>导出草稿</button>
        <button type="button" className="slide-action primary" onClick={() => {
          void askInTask("task3", proposalQuestion(proposal, note)).then(() => { setPanel(""); navigate("/chat"); });
        }}>交给对话工作台写完整建议 →</button>
      </>}>
      {proposal.map((o, i) => <article key={o.key} className="slide-card proposal">
        <div className="proposal-top"><span>PR-{i + 1}</span><small>{o.domain} · {KINDS.find((k) => k.key === o.kind)!.label}</small></div>
        <b>{o.title}</b>
        <dl>
          <div><dt>已有基础</dt><dd>{o.basis}</dd></div>
          <div><dt>缺口</dt><dd>{o.detail || o.title}</dd></div>
          <div><dt>首步验证</dt><dd>{KINDS.find((k) => k.key === o.kind)!.first}</dd></div>
        </dl>
      </article>)}
      <label className="atlas-note">交给对话工作台时的补充要求（可选）
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：面向 2027 年度申报，经费 300 万元以内" />
      </label>
    </SlideOver>
  </div>;
}
