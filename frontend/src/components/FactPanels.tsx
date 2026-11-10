import type { FactField, ProjectFacts, FundingFact } from "../api";
import { Pill } from "./ui";

const SOURCE_LABEL: Record<string, string> = {
  content: "原文", filename: "文件名", manual: "人工", unknown: "未知",
};
const CONFIDENCE: Record<string, { label: string; tone: "mint" | "yellow" | "gray" }> = {
  high: { label: "高", tone: "mint" }, medium: { label: "中", tone: "yellow" }, low: { label: "低", tone: "gray" },
};
export const TERM_LABEL: Record<string, string> = {
  total: "总经费", awarded: "批准资助金额", direct: "直接费用", indirect: "间接费用",
};
export const FIELD_LABEL: Record<string, string> = {
  project_name: "项目名称", project_no: "项目编号", project_scheme: "项目体系",
  project_category: "项目类别", lead_unit: "承担单位", participant_units: "参与单位",
  principal_investigator: "负责人", start_date: "开始时间", end_date: "结束时间",
};

/** The single charting amount (2026-11-09): total funding only, never another term as a stand-in. */
export function chartAmount(facts: ProjectFacts | null | undefined): { amount: number; currency: string } | null {
  const totals = (facts?.funding ?? []).filter((item) => item.term === "total" && item.amount);
  if (totals.length !== 1) return null;  // missing or conflicting: draw nothing rather than pick one
  const amount = Number(totals[0].amount);
  if (!Number.isFinite(amount)) return null;
  return { amount: totals[0].unit === "万元" ? amount : amount / 10000, currency: totals[0].currency };
}

function Evidence({ field }: { field: FactField }) {
  const first = field.evidence?.[0];
  if (!first) return null;
  const where = first.locator.basis === "pdf_page" ? `第 ${first.locator.page} 页` : "解析正文";
  return <p className="mt-0.5 truncate text-caption text-[var(--text-3)]" title={first.quote}>
    {where} · “{first.quote}”</p>;
}

/** One project field: value, where it came from, and the quote it was read from. */
function Field({ label, field }: { label: string; field?: FactField }) {
  if (!field) return <div className="rounded-lg border border-dashed border-[var(--hairline)] px-2 py-1.5">
    <div className="text-caption text-[var(--text-3)]">{label}</div>
    <div className="text-body text-[var(--stone)]">原文未写</div>
  </div>;
  const confidence = CONFIDENCE[field.confidence] ?? CONFIDENCE.medium;
  return <div className="rounded-lg border border-[var(--hairline)] px-2 py-1.5">
    <div className="flex items-baseline gap-1.5">
      <span className="text-caption text-[var(--text-3)]">{label}</span>
      <span className="flex-1" />
      <span className="text-caption text-[var(--text-3)]">{SOURCE_LABEL[field.source] ?? field.source}</span>
      <Pill tone={confidence.tone}>{confidence.label}</Pill>
    </div>
    <div className="truncate text-body text-[var(--ink)]" title={field.value}>{field.value}</div>
    <Evidence field={field} />
  </div>;
}

/** Funding facts: one line per stated amount; the terms are never summed or converted. */
function FundingList({ funding }: { funding: FundingFact[] }) {
  if (!funding.length) return <p className="text-body text-[var(--stone)]">原文未写可识别的资金金额。</p>;
  const counts = new Map<string, number>();
  for (const item of funding) counts.set(item.term, (counts.get(item.term) ?? 0) + 1);
  return <ul className="space-y-1.5">
    {funding.map((item, index) => <li key={`${item.term}-${index}`}
      className="rounded-lg border border-[var(--hairline)] px-2 py-1.5">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-caption text-[var(--text-3)]">{TERM_LABEL[item.term] ?? item.term}</span>
        {item.term_raw && item.term_raw !== TERM_LABEL[item.term] ? <span className="text-caption text-[var(--text-3)]">（原文：{item.term_raw}）</span> : null}
        <span className="text-body font-semibold tabular-nums text-[var(--ink)]">{item.amount} {item.unit}</span>
        {item.tax !== "未说明" ? <Pill tone="gray">{item.tax}</Pill> : null}
        {(counts.get(item.term) ?? 0) > 1 ? <Pill tone="yellow">同口径多值</Pill> : null}
        <span className="flex-1" />
        <span className="text-caption text-[var(--text-3)]">{SOURCE_LABEL[item.source] ?? item.source}</span>
      </div>
      {item.evidence?.[0] ? <p className="mt-0.5 truncate text-caption text-[var(--text-3)]" title={item.evidence[0].quote}>
        {item.evidence[0].locator.basis === "pdf_page" ? `第 ${item.evidence[0].locator.page} 页` : "解析正文"} · “{item.evidence[0].quote}”</p> : null}
    </li>)}
  </ul>;
}

/**
 * 元数据 tab (2026-11-09): project identity and funding facts as stored in the archive record.
 * Nothing here is computed: a missing field says the document does not state it, and a conflicting
 * funding term is shown as two values rather than one chosen total.
 */
export function MetadataPanel({ facts }: { facts?: ProjectFacts | null }) {
  // Legacy records carry no metadata section at all (and normalize to {}); that is "not extracted",
  // not a document that states nothing.
  if (!facts || !facts.status) return <p className="text-body text-[var(--steel)]">这份资料还没有抽取项目元数据与资金。</p>;
  if (facts.status === "failed") return <div className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-bg)] p-2 text-body text-[var(--danger-fg)]">
    项目元数据/资金抽取失败：{facts.process.error || "原因未记录"}
  </div>;
  // A record written before the split has an empty metadata section: no project facts yet.
  const project = facts.project ?? {};
  const identity = project.identity || "待识别";
  const funding = facts.funding ?? [];
  return <div className="space-y-3 text-body">
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill tone={project.identity ? "mint" : "yellow"}>{identity}</Pill>
      {facts.status === "partial" ? <Pill tone="yellow">部分字段未提取</Pill> : null}
      {facts.missing?.length ? <span className="text-caption text-[var(--text-3)]">缺：{facts.missing.map((key) => FIELD_LABEL[key] ?? key).join("、")}</span> : null}
    </div>
    <div className="grid gap-1.5 sm:grid-cols-2">
      <Field label="项目名称" field={project.project_name} />
      <Field label="项目编号" field={project.project_no} />
      <Field label="项目体系" field={project.project_scheme} />
      <Field label="项目类别" field={project.project_category} />
      <Field label="承担单位" field={project.lead_unit} />
      <Field label="负责人" field={project.principal_investigator} />
      <Field label="开始时间" field={project.start_date} />
      <Field label="结束时间" field={project.end_date} />
    </div>
    {project.participant_units?.length ? <div className="rounded-lg border border-[var(--hairline)] px-2 py-1.5">
      <div className="text-caption text-[var(--text-3)]">参与单位</div>
      <ul className="space-y-0.5">{project.participant_units.map((unit, index) => <li key={index}>
        <span className="text-body text-[var(--ink)]">{unit.value}</span><Evidence field={unit} /></li>)}</ul>
    </div> : null}
    <div>
      <h3 className="mb-1 text-body font-semibold text-[var(--heading)]">资金</h3>
      <FundingList funding={funding} />
      <p className="mt-1 rounded-md bg-[var(--surface-soft)] px-2 py-1.5 text-caption leading-[1.6] text-[var(--text-3)]">
        不同口径不合计；缺失不补零；同口径多值并列显示。图上只用“总经费”口径，缺失或冲突时不画。
      </p>
    </div>
    {facts.rejected?.length ? <div>
      <h3 className="mb-1 text-body font-semibold text-[var(--heading)]">未通过校验（{facts.rejected.length}）</h3>
      <ul className="space-y-0.5 text-caption text-[var(--danger-fg)]">
        {facts.rejected.map((item, index) => <li key={index}>{FIELD_LABEL[item.field] ?? item.field}：{item.reason}</li>)}
      </ul>
    </div> : null}
  </div>;
}

/** 解析 tab (2026-11-09): what the parse produced and how far it got, with a way into the workbench. */
export function ParsePanel({ parse, onOpenWorkbench }: { parse?: import("../api").ParseFacts | null; onOpenWorkbench?: () => void }) {
  if (!parse) return <p className="text-body text-[var(--steel)]">这份资料还没有解析记录。</p>;
  const quality = parse.quality;
  const rows: [string, string][] = [
    ["解析状态", parse.status === "parsed" ? "已解析" : "解析失败"],
    ["解析方式", [parse.parser, parse.profile].filter(Boolean).join(" · ") || "未记录"],
    ["页数", quality ? String(quality.pages) : "未记录"],
    ["正文覆盖", quality ? `${Math.round((quality.coverage ?? 0) * 100)}%` : "未记录"],
    ["文字很少的页", quality ? String(quality.sparse_pages) : "未记录"],
    ["乱码字符", quality ? String(quality.unreadable_chars) : "未记录"],
    ["质量等级", parse.grade ?? "未评定"],
    ["人工校正", parse.corrections_hash ? (parse.corrections_invalidated ? "原件已变化，校正已失效" : "已应用") : "无"],
  ];
  return <div className="space-y-2 text-body">
    <dl className="grid gap-1.5 sm:grid-cols-2">{rows.map(([label, value]) =>
      <div key={label} className="rounded-lg border border-[var(--hairline)] px-2 py-1.5">
        <dt className="text-caption text-[var(--text-3)]">{label}</dt>
        <dd className="truncate text-body text-[var(--ink)]" title={value}>{value}</dd>
      </div>)}</dl>
    <p className="rounded-md bg-[var(--surface-soft)] px-2 py-1.5 text-caption leading-[1.6] text-[var(--text-3)]">
      解析与信息抽取是两件事：解析决定“文件变成可定位的正文”，抽取决定“从正文读出哪些事实”。校正过的正文会用于下一次抽取。
    </p>
    {onOpenWorkbench ? <button type="button" onClick={onOpenWorkbench}
      className="text-body text-[var(--link)] hover:underline">在资料入库中逐页核对解析 ›</button> : null}
  </div>;
}
