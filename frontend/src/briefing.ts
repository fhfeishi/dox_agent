import type { Hierarchy, Lineage } from "./projects";

/**
 * 总览（原汇报视图，query 2026-1009 1544): the lineage and the scene hierarchy re-read for senior
 * reviewers and managers. Application scenes lead (what problem, how far it got), shared
 * infrastructure is pulled out into one foundation band, maturity is shown as plain tiers and
 * metrics are lifted verbatim from the cited text. Nothing here is generated: every number and
 * name comes from hierarchy.json, lineage.json or their quotes.
 */

export const TIERS = [
  { min: 5, label: "示范应用", color: "#b7791f", hint: "已有示范应用、推广或转化" },
  { min: 4, label: "成型技术", color: "#2d9d7e", hint: "已在真实场景、临床或多中心试验" },
  { min: 2, label: "攻关验证", color: "#478bdb", hint: "已有算法验证、原型或样机" },
  { min: 0, label: "探索/未判定", color: "#9aa3b2", hint: "理论方法研究，或报告文字不足以判定" },
] as const;
export const tierOf = (level: number) => TIERS.find((tier) => level >= tier.min)!;
export const ISSUE_LABEL = { 已解决: "本期突破", 待解决: "深化布局" } as const;

const METRIC = /(AUROC|AUC|C-?index|C指数|Dice|DSC|IoU|mAP|F1|准确率|准确度|正确率|灵敏度|敏感度|敏感性|特异度|特异性|召回率|精确率|识别率|检出率|符合率|一致率|成功率)\s*(?:值)?\s*(?:为|达到|达|提升至|提高到|提高至|约|=|：|:)?\s*(\d+(?:\.\d+)?\s*%?(?:\s*[~～\-–—至]\s*\d+(?:\.\d+)?\s*%?)?)/g;
const SCALE = /(\d[\d,，]*(?:\.\d+)?)\s*(万|千)?\s*(余|多)?\s*(例|名患者|名受试者|名|家三甲医院|家医院|家医疗机构|家单位|个中心|中心|张图像|张|份样本|份)/g;
const MILESTONES: [RegExp, string][] = [
  [/指南/, "纳入指南"], [/多中心/, "多中心验证"], [/前瞻/, "前瞻验证"],
  [/部署|落地|投入使用|投入实战|临床应用|装机/, "已落地应用"], [/推广|示范/, "推广示范"],
];

/** Short indicator chips taken from the given texts: metrics first, then scale, then milestones. */
export function indicators(texts: string[], limit = 4): string[] {
  const out: string[] = [];
  const add = (chip: string) => { if (!out.includes(chip)) out.push(chip); };
  const text = texts.join("；");
  // A metric value is a fraction or a percentage; a bare integer ("准确率提高 12 个百分点") is not one.
  for (const m of text.matchAll(METRIC)) if (/[.%]/.test(m[2])) add(`${m[1]} ${m[2].replace(/\s+/g, "")}`);
  for (const m of text.matchAll(SCALE)) {
    const number = Number(m[1].replace(/[,，]/g, ""));
    if (!m[2] && Number.isInteger(number) && number >= 1900 && number <= 2100) continue;  // a year, not a count
    if (!m[2] && number < 2) continue;
    add(`${m[1]}${m[2] ?? ""}${m[3] ?? ""}${m[4]}`);
  }
  for (const [pattern, label] of MILESTONES) if (pattern.test(text)) add(label);
  return out.slice(0, limit);
}

export type BoardIssue = { name: string; summary: string; state: "已解决" | "待解决" };
export type BoardAchievement = { title: string; summary: string; maturity: number; indicators: string[]; projectIds: string[]; quote: string };
export type BoardScene = { name: string; summary: string; projects: number; tiers: number[]; issues: BoardIssue[]; achievements: BoardAchievement[]; highlights: string[] };
export type Foundation = { key: string; name: string; plain: string; system: string; projects: number; scenes: string[]; maturity: number; items: number };
export type Board = { branch: string; projects: number; tiers: number[]; solved: number; open: number; scenes: BoardScene[]; foundations: Foundation[]; unplaced: number; unplacedKey: string };

const tierIndex = (level: number) => TIERS.indexOf(tierOf(level));

/** Library-wide summary: scenes with their issues and results, the shared foundation, stage tiers. */
export function buildBoard(hierarchy: Hierarchy, lineage: Lineage): Board {
  const projectLevel = new Map<string, number>();
  for (const item of Object.values(lineage.items)) projectLevel.set(item.project_id, Math.max(projectLevel.get(item.project_id) ?? 0, item.maturity));
  const sceneOf = new Map<string, Set<string>>();
  for (const scene of hierarchy.scenes) for (const id of scene.project_ids) sceneOf.set(id, (sceneOf.get(id) ?? new Set()).add(scene.name));

  const scenes = hierarchy.scenes.map((scene): BoardScene => {
    const issues = scene.issues.map((issue): BoardIssue => ({ name: issue.name, summary: issue.summary, state: issue.state }));
    const achievements = scene.achievements.map((a): BoardAchievement => ({
      title: a.title, summary: a.summary, projectIds: a.project_ids, quote: a.evidence[0]?.quote ?? "",
      maturity: Math.max(0, ...a.project_ids.map((id) => projectLevel.get(id) ?? 0)),
      indicators: indicators([a.title, a.summary, ...a.evidence.map((e) => e.quote)]),
    }));
    const tiers = [0, 0, 0, 0];
    for (const id of scene.project_ids) tiers[tierIndex(projectLevel.get(id) ?? 0)] += 1;
    return { name: scene.name, summary: scene.summary, projects: scene.project_ids.length, tiers, issues,
      achievements, highlights: [...new Set(achievements.flatMap((a) => a.indicators))].slice(0, 3) };
  });

  const foundations: Foundation[] = [];
  lineage.categories.forEach((category, c) => category.children.forEach((child, d) => {
    if (!child.foundation || category.unplaced) return;
    const ids = child.themes.flatMap((theme) => theme.items);
    const projects = new Set(ids.map((id) => lineage.items[id]?.project_id).filter(Boolean));
    const covered = new Set([...projects].flatMap((id) => [...(sceneOf.get(id) ?? [])]));
    foundations.push({ key: `d:${c}:${d}`, name: child.name, plain: child.plain ?? "", system: category.name, items: ids.length,
      projects: projects.size, scenes: hierarchy.scenes.map((s) => s.name).filter((name) => covered.has(name)),
      maturity: Math.max(0, ...ids.map((id) => lineage.items[id]?.maturity ?? 0)) });
  }));

  const tiers = [0, 0, 0, 0];
  for (const level of projectLevel.values()) tiers[tierIndex(level)] += 1;
  const issues = hierarchy.scenes.flatMap((scene) => scene.issues);
  return {
    branch: lineage.branch.replace(/^自然科学基金-/, ""), projects: projectLevel.size, tiers, scenes,
    solved: issues.filter((issue) => issue.state === "已解决").length, open: issues.filter((issue) => issue.state === "待解决").length,
    foundations: foundations.sort((a, b) => b.projects - a.projects),
    unplacedKey: (() => { const i = lineage.categories.findIndex((category) => category.unplaced); return i < 0 ? "" : `c:${i}`; })(),
    unplaced: lineage.categories.filter((category) => category.unplaced).reduce((n, category) =>
      n + category.children.reduce((m, child) => m + child.themes.reduce((k, theme) => k + theme.items.length, 0), 0), 0),
  };
}

/*
 * 专科 × 环节 (query 2026-1009 1720): every technique item of the library placed by the
 * application field it serves and the workflow stage it acts in, so the main board covers the
 * whole library rather than the hierarchy's typical routes. Fields come from the scene hierarchy,
 * stages from the lineage framework; items the model could not place stay in visible "未判定" lanes.
 */
export const UNDETERMINED_FIELD = "领域未判定";
export const UNDETERMINED_STAGE = "环节未判定";

export type MatrixItem = { key: string; name: string; projectId: string; maturity: number; basis: string; direction: string; plain: string; indicators: string[] };
export type MatrixDirection = { name: string; plain: string; items: MatrixItem[]; projects: number; maturity: number; indicators: string[] };
export type MatrixCell = { field: string; stage: string; items: MatrixItem[]; projects: number; tiers: number[]; maturity: number; indicators: string[]; directions: MatrixDirection[] };
export type Matrix = { fields: string[]; stages: { name: string; plain: string }[]; cells: Map<string, MatrixCell>; rows: Map<string, MatrixCell>; columns: Map<string, MatrixCell>; hidden: number; total: number; projects: number };

const cellKey = (field: string, stage: string) => `${field}\u0000${stage}`;

function summarise(field: string, stage: string, items: MatrixItem[]): MatrixCell {
  const tiers = [0, 0, 0, 0];
  const best = new Map<string, number>();
  for (const item of items) best.set(item.projectId, Math.max(best.get(item.projectId) ?? 0, item.maturity));
  for (const level of best.values()) tiers[tierIndex(level)] += 1;
  const byDirection = new Map<string, MatrixItem[]>();
  for (const item of items) byDirection.set(item.direction, [...(byDirection.get(item.direction) ?? []), item]);
  const sorted = [...items].sort((a, b) => b.maturity - a.maturity);
  const directions = [...byDirection].map(([name, list]): MatrixDirection => ({
    name, plain: list[0].plain, items: [...list].sort((a, b) => b.maturity - a.maturity),
    projects: new Set(list.map((i) => i.projectId)).size, maturity: Math.max(0, ...list.map((i) => i.maturity)),
    indicators: [...new Set(list.flatMap((i) => i.indicators))].slice(0, 3),
  })).sort((a, b) => b.projects - a.projects || b.maturity - a.maturity);
  return { field, stage, items, projects: best.size, tiers, directions, maturity: Math.max(0, ...items.map((i) => i.maturity)),
    indicators: [...new Set(sorted.flatMap((i) => i.indicators))].slice(0, 3) };
}

/** Field names in display order (the scenes the lineage was placed into), and each item's field. */
export function fieldResolver(lineage: Lineage) {
  const names = (lineage.fields ?? []).map((f) => f.name);
  const of = (key: string) => {
    const field = lineage.items[key]?.field ?? "";
    return names.includes(field) ? field : UNDETERMINED_FIELD;
  };
  return { names, of };
}

export function buildMatrix(lineage: Lineage, minLevel = 0): Matrix {
  const resolve = fieldResolver(lineage);
  const where = new Map<string, { name: string; plain: string }>();
  lineage.categories.forEach((category) => category.children.forEach((child) => child.themes.forEach((theme) =>
    theme.items.forEach((id) => where.set(id, category.unplaced ? { name: "未归入体系的条目", plain: "" } : { name: child.name, plain: child.plain ?? "" })))));
  const stageNames = (lineage.stages ?? []).map((s) => s.name);
  const fieldNames = resolve.names;
  const all: (MatrixItem & { field: string; stage: string })[] = Object.entries(lineage.items).map(([key, item]) => {
    return { key, name: item.name, projectId: item.project_id, maturity: item.maturity, basis: item.basis,
      direction: where.get(key)?.name ?? "未归入体系的条目", plain: where.get(key)?.plain ?? "",
      indicators: indicators([item.basis, item.desc], 3),
      field: resolve.of(key),
      stage: stageNames.includes(item.stage ?? "") ? item.stage! : UNDETERMINED_STAGE };
  });
  const shown = all.filter((item) => item.maturity >= minLevel);
  const fields = [...fieldNames, ...(shown.some((i) => i.field === UNDETERMINED_FIELD) ? [UNDETERMINED_FIELD] : [])];
  const stages = [...(lineage.stages ?? []), ...(shown.some((i) => i.stage === UNDETERMINED_STAGE) ? [{ name: UNDETERMINED_STAGE, plain: "" }] : [])];
  const cells = new Map<string, MatrixCell>(), rows = new Map<string, MatrixCell>(), columns = new Map<string, MatrixCell>();
  for (const field of fields) {
    rows.set(field, summarise(field, "", shown.filter((i) => i.field === field)));
    for (const stage of stages) cells.set(cellKey(field, stage.name), summarise(field, stage.name, shown.filter((i) => i.field === field && i.stage === stage.name)));
  }
  for (const stage of stages) columns.set(stage.name, summarise("", stage.name, shown.filter((i) => i.stage === stage.name)));
  return { fields, stages, cells, rows, columns, hidden: all.length - shown.length, total: all.length,
    projects: new Set(shown.map((i) => i.projectId)).size };
}

export const matrixCell = (matrix: Matrix, field: string, stage: string) => matrix.cells.get(cellKey(field, stage))!;

/** Reporting outline over the whole library: field → stage → leading directions with their best evidence. */
export function matrixOutline(branch: string, matrix: Matrix, board: Board): string {
  const chips = (list: string[]) => list.length ? `；${list.join("，")}` : "";
  const lines = [`# ${branch} 技术谱系（汇报版）`, "",
    `共 ${matrix.projects} 个项目、${matrix.total - matrix.hidden} 个技术条目，按应用领域 × ${matrix.stages.map((s) => s.name).join(" / ")} 组织。`];
  for (const field of matrix.fields) {
    const row = matrix.rows.get(field)!;
    if (!row.items.length) continue;
    lines.push("", `## ${field}（${row.projects} 个项目）`);
    const scene = board.scenes.find((s) => s.name === field);
    for (const issue of scene?.issues ?? []) lines.push(`- ${ISSUE_LABEL[issue.state]}：${issue.name}`);
    for (const stage of matrix.stages) {
      const cell = matrixCell(matrix, field, stage.name);
      if (!cell.items.length) continue;
      lines.push("", `### ${stage.name}（${cell.projects} 个项目，最高 ${tierOf(cell.maturity).label}）`);
      for (const d of cell.directions.slice(0, 3)) lines.push(`- ${d.name}（${d.projects} 个项目，${tierOf(d.maturity).label}${chips(d.indicators)}）`);
    }
    if (scene?.achievements.length) {
      lines.push("", "### 标志性成果");
      for (const a of scene.achievements) lines.push(`- ${a.title}（${tierOf(a.maturity).label}${chips(a.indicators)}）`);
    }
  }
  if (board.foundations.length) {
    lines.push("", "## 共性技术底座");
    for (const f of board.foundations) lines.push(`- ${f.name}：${f.plain}（${f.projects} 个项目，覆盖 ${f.scenes.length} 个领域）`);
  }
  lines.push("", "注：阶段为模型依据项目报告的判定，不是正式技术成熟度评定；指标原样摘自原文或判定依据。");
  return lines.join("\n");
}

/**
 * Technology view outline (query 2026-1009 1720, Gemini scheme 2): discipline system → direction →
 * method theme → application carrier (field) → leading project techniques with stage and metrics.
 * Up to `perCarrier` items per carrier, highest stage first; counts say how many are left out.
 */
export function lineageOutline(name: string, lineage: Lineage, perCarrier = 2): string {
  const resolve = fieldResolver(lineage);
  const lines = [`# ${name} 技术谱系（学科体系版）`, "", "层级：学科体系 › 技术方向 › 方法主题 › 应用承载 › 项目技术〔报告所述阶段；指标〕", ""];
  for (const category of lineage.categories) {
    lines.push(`L1 ${category.name}${category.plain ? `（${category.plain}）` : ""}`);
    for (const child of category.children) {
      lines.push(`├── L2 ${child.name}${child.foundation ? "〔共性底座〕" : ""}`);
      for (const theme of child.themes) {
        lines.push(`│   ├── L3 ${theme.name}（${theme.items.length} 条）`);
        const carriers = new Map<string, string[]>();
        for (const key of theme.items) carriers.set(resolve.of(key), [...(carriers.get(resolve.of(key)) ?? []), key]);
        for (const [field, keys] of [...carriers].sort((a, b) => Number(a[0] === UNDETERMINED_FIELD) - Number(b[0] === UNDETERMINED_FIELD) || b[1].length - a[1].length)) {
          lines.push(`│   │   ├── L4 承载：${field}（${new Set(keys.map((k) => lineage.items[k].project_id)).size} 个项目）`);
          const best = [...keys].sort((a, b) => lineage.items[b].maturity - lineage.items[a].maturity);
          for (const key of best.slice(0, perCarrier)) {
            const item = lineage.items[key];
            const chips = indicators([item.basis, item.desc], 2);
            lines.push(`│   │   │   └── L5 ${item.name}〔${item.maturity} ${tierOf(item.maturity).label}${chips.length ? `；${chips.join("，")}` : ""}〕 ${item.project_id}`);
          }
          if (best.length > perCarrier) lines.push(`│   │   │   └── …另 ${best.length - perCarrier} 条`);
        }
      }
    }
    lines.push("");
  }
  lines.push("注：阶段为模型依据项目报告的判定，不是正式技术成熟度评定；指标摘自判定依据与条目说明，可在系统中回到原文核对。");
  return lines.join("\n");
}
