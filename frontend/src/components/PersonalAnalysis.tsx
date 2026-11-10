import { useQuery } from "@tanstack/react-query";
import type { PersonalAnalysis } from "../api";
import { fetchPersonalAnalysis, fetchPersonalLibraries, fetchTasks, fetchTemplates } from "../api";
import { BarChart } from "./Charts";
import { Pill } from "./ui";

const DIMENSIONS = ["场景", "问题", "技术", "成果"] as const;
const SOURCE_KIND: Record<string, string> = { system: "系统资料库", upload: "我上传的文件", personal: "个人资料库" };

const card = "rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4";
const head = "text-body font-semibold text-[var(--heading)]";
const muted = "text-caption text-[var(--stone)]";
const note = "rounded-md bg-[var(--surface-soft)] px-2 py-1.5 text-caption leading-[1.6] text-[var(--text-3)]";

export const personalAnalysisQuery = (libraryId: string) => ({
  queryKey: ["personal-libraries", libraryId, "analysis"],
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchPersonalAnalysis(libraryId, signal),
  enabled: Boolean(libraryId),
});

/**
 * 任务模版的名称与版本: the library stores only ids, so the name is read from the same catalogues
 * every session uses (built-in tasks are version 0; a custom task must resolve at its version).
 */
const taskNameQuery = () => ({ queryKey: ["tasks"], queryFn: ({ signal }: { signal: AbortSignal }) => fetchTasks(signal) });
const templateNameQuery = () => ({ queryKey: ["templates"], queryFn: ({ signal }: { signal: AbortSignal }) => fetchTemplates(signal) });

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="min-w-0 rounded-lg border border-[var(--hairline)] px-3 py-2">
    <div className={muted}>{label}</div>
    <div className="mt-0.5 text-emphasis font-semibold tabular-nums text-[var(--ink)]">{value}</div>
    {sub ? <div className="mt-0.5 truncate text-caption text-[var(--text-3)]">{sub}</div> : null}
  </div>;
}

/** One number per gap kind; a zero gap is shown as 0 rather than hidden, so the denominator is visible. */
function ExtractionCard({ data }: { data: PersonalAnalysis }) {
  const e = data.extraction;
  return <section aria-label="提取覆盖" className={card}>
    <h2 className={head}>提取覆盖</h2>
    <p className="mt-1 text-caption leading-[1.6] text-[var(--steel)]">
      四维提取来自系统资料库已有的结果；个人上传在本人工作区提取。这里只读，不调用模型。
    </p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="范围内资料" value={e.documents} />
      <Stat label="已提取" value={e.current} />
      <Stat label="未提取" value={e.missing} />
      <Stat label="已过期" value={e.stale} />
      <Stat label="无法读取" value={e.invalid + e.unreadable.length} />
    </div>
    {e.missing + e.stale + e.invalid + e.unreadable.length ? <p className={`mt-2 ${note}`}>
      缺少提取的资料可以让管理员在系统资料库重跑四维，或在「资料入库」核对解析结果；本次分析不猜测它们的四维内容。
    </p> : null}
  </section>;
}

function SourcesCard({ data }: { data: PersonalAnalysis }) {
  return <section aria-label="来源构成" className={card}>
    <h2 className={head}>来源构成</h2>
    <table className="mt-2 w-full table-fixed text-left text-body">
      <thead><tr className="text-caption text-[var(--text-3)]"><th className="w-[45%] py-1 font-normal">来源</th><th className="py-1 font-normal">类型</th>
        <th className="py-1 text-right font-normal">引用</th><th className="py-1 text-right font-normal">可读</th><th className="py-1 text-right font-normal">缺口</th></tr></thead>
      <tbody>{data.sources.map((source) => <tr key={source.corpus_id} className="border-t border-[var(--hairline)]">
        <td className="truncate py-1.5 text-[var(--ink)]">{source.name || source.corpus_id}</td>
        <td className="py-1.5 text-[var(--steel)]">{SOURCE_KIND[source.kind] ?? source.kind}</td>
        <td className="py-1.5 text-right tabular-nums">{source.documents}</td>
        <td className="py-1.5 text-right tabular-nums">{source.readable}</td>
        <td className="py-1.5 text-right tabular-nums">
          {source.state === "missing" ? <span className="text-[var(--danger-fg)]">资料库已删除</span>
            : source.documents - source.readable ? <span className="text-[var(--warn-fg)]">{source.documents - source.readable}</span> : "0"}
        </td></tr>)}</tbody>
    </table>
    {data.sources.some((source) => source.state !== "ready") ? <p className={`mt-2 ${note}`}>
      缺口表示引用的资料已不在原资料库中；引用本身保留，可回到资料页移出或换一份。
    </p> : null}
  </section>;
}

function YearsCard({ data }: { data: PersonalAnalysis }) {
  const { labels, by_year, reason } = data.years;
  return <section aria-label="年度分布" className={card}>
    <h2 className={head}>年度分布</h2>
    <p className="mt-1 text-caption text-[var(--steel)]">按立项年统计范围内项目；项目年份不是成果发生年。</p>
    {reason ? <p className={`mt-3 ${note}`}>{reason}</p> : labels.length <= 1 ? <>
      <p className={`mt-3 ${note}`}>范围内只有 1 个立项年，不画趋势。{labels.map((year) => `${year} 年 ${by_year[String(year)]} 个项目`).join("；")}</p>
    </> : <div className="mt-3">
      <BarChart spec={{ type: "bar", title: "范围内项目年度立项数", labels: labels.map(String),
        values: labels.map((year) => by_year[String(year)] ?? 0), unit: " 个" }} />
    </div>}
    <p className={`mt-2 ${note}`}>{data.counts.projects < 3
      ? `范围内 ${data.counts.projects} 个项目，不足以说明趋势；计数只代表本次范围。`
      : `共 ${data.counts.projects} 个项目；计数只代表本次范围，不是全库统计。`}</p>
  </section>;
}

function FundingCard({ data }: { data: PersonalAnalysis }) {
  const total = Number(data.funding.total_yuan) / 1e4;
  return <section aria-label="经费" className={card}>
    <h2 className={head}>项目总金额</h2>
    {data.funding.reason ? <p className={`mt-3 ${note}`}>{data.funding.reason}</p>
      : <div className="mt-3"><Stat label="已知项目总金额合计" value={`${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} 万元`}
        sub={`${data.funding.projects} 个项目给出总经费或批准资助；直接费用不作总额；缺失不补零`} /></div>}
  </section>;
}

function DimensionsCard({ data }: { data: PersonalAnalysis }) {
  return <section aria-label="四维条目" className={card}>
    <h2 className={head}>四维条目（本次范围）</h2>
    <p className="mt-1 text-caption text-[var(--steel)]">只列范围内项目已提取的条目，按覆盖项目数排序；不生成新条目。</p>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {DIMENSIONS.map((key) => {
        const group = data.dimensions[key];
        return <div key={key}>
          <h3 className="flex items-baseline gap-2 text-body font-semibold text-[var(--ink)]">{key}
            <span className="text-caption font-normal text-[var(--text-3)]">
              {group.evidence_projects}/{data.counts.projects} 个项目有{key}条目{group.missing_projects ? ` · ${group.missing_projects} 个缺` : ""}
            </span></h3>
          {group.items.length ? <ul className="mt-1 space-y-0.5">{group.items.slice(0, 12).map((item) =>
            <li key={item.name} className="flex items-baseline gap-2 text-body"><span className="min-w-0 flex-1 truncate text-[var(--ink)]">{item.name}</span>
              <span className="shrink-0 tabular-nums text-caption text-[var(--text-3)]">{item.count}</span></li>)}</ul>
            : <p className="mt-1 text-caption text-[var(--text-3)]">范围内没有{key}条目。</p>}
          {group.items.length > 12 ? <p className="mt-1 text-caption text-[var(--text-3)]">另有 {group.items.length - 12} 条未列出。</p> : null}
        </div>;
      })}
    </div>
  </section>;
}

function ProjectsCard({ data }: { data: PersonalAnalysis }) {
  return <section aria-label="项目索引" className={card}>
    <h2 className={head}>项目索引</h2>
    <p className="mt-1 text-caption text-[var(--steel)]">
      同一批准号跨资料库只算一个项目，文件仍标出来源；没有批准号的资料单列为待识别，不与其他项目合并。
    </p>
    {data.projects.length ? <table className="mt-2 w-full table-fixed text-left text-body">
      <thead><tr className="text-caption text-[var(--text-3)]"><th className="w-[46%] py-1 font-normal">项目</th><th className="py-1 font-normal">批准号</th>
        <th className="py-1 font-normal">年份</th><th className="py-1 text-right font-normal">文件</th><th className="py-1 text-right font-normal">已提取</th></tr></thead>
      <tbody>{data.projects.map((project) => <tr key={project.project_id} className="border-t border-[var(--hairline)] align-top">
        <td className="py-1.5 pr-2"><span className="block truncate text-[var(--ink)]">{project.title}</span>
          <span className="block truncate text-caption text-[var(--text-3)]">
            {project.corpus_ids.length > 1 ? `来自 ${project.corpus_ids.length} 个资料库`
              : project.files.map((file) => (file.origin || file.title).split(/[\\/]/).pop() || file.title).join("、")}</span></td>
        <td className="py-1.5 text-[var(--steel)]">{project.identity_status === "identified" ? project.number
          : <Pill tone="yellow">待识别</Pill>}</td>
        <td className="py-1.5 tabular-nums text-[var(--steel)]">{project.start_year ?? "—"}{project.end_year ? `–${project.end_year}` : ""}</td>
        <td className="py-1.5 text-right tabular-nums">{project.files.length}</td>
        <td className="py-1.5 text-right tabular-nums">{project.extracted_files}/{project.files.length}</td>
      </tr>)}</tbody>
    </table> : <p className={`mt-3 ${note}`}>范围内还没有识别出项目：加入项目报告类资料后，这里按批准号归并项目。</p>}
  </section>;
}

function RelationsCard({ data }: { data: PersonalAnalysis }) {
  const { nodes, edges, reason } = data.relations;
  const title = new Map(nodes.map((node) => [node.project_id, node.title]));
  return <section aria-label="项目关系" className={card}>
    <h2 className={head}>项目关系</h2>
    <p className="mt-1 text-caption text-[var(--steel)]">两个项目共享同一技术、场景或问题条目时连一条线；只表示描述相近，不等于重复立项。</p>
    {reason ? <p className={`mt-3 ${note}`}>{reason}</p> : <ul className="mt-3 space-y-1">
      {edges.slice(0, 20).map((edge) => <li key={`${edge.source}|${edge.target}`} className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-body">
        <div className="truncate text-[var(--ink)]">{title.get(edge.source) ?? edge.source} ↔ {title.get(edge.target) ?? edge.target}</div>
        <div className="mt-0.5 truncate text-caption text-[var(--text-3)]">共享 {edge.count} 条：{edge.shared.join("、")}</div>
      </li>)}
    </ul>}
    {edges.length > 20 ? <p className={`mt-2 ${note}`}>另有 {edges.length - 20} 组关系未列出。</p> : null}
  </section>;
}

/**
 * 分析 tab of one personal library (2026-11-06): the task picture, read from stored records only.
 * Every number says what it counts and what is missing; nothing here is generated by a model and
 * nothing counts toward the system-wide figures.
 */
export function PersonalAnalysisView({ libraryId, onAsk }: { libraryId: string; onAsk: () => void }) {
  const analysis = useQuery(personalAnalysisQuery(libraryId));
  const libraries = useQuery({ queryKey: ["personal-libraries"], queryFn: ({ signal }: { signal: AbortSignal }) => fetchPersonalLibraries(signal) });
  const tasks = useQuery(taskNameQuery());
  const templates = useQuery(templateNameQuery());
  if (analysis.isError) return <div role="alert" className={card}>
    <p className="text-body text-[var(--danger-fg)]">{(analysis.error as Error).message}</p>
    <button type="button" className="mt-2 text-body text-[var(--link)] hover:underline" onClick={() => void analysis.refetch()}>重试</button>
  </div>;
  if (!analysis.data) return <div className={card}><p className={muted}>正在汇总本次范围的资料…</p></div>;
  const view = analysis.data;
  const taskName = tasks.data?.find((task) => task.id === view.task_id)?.name
    ?? view.task_name ?? (view.task_id === "task4" ? "专项报告" : view.task_id);
  const taskVersion = view.task_version ? ` v${view.task_version}` : "";
  const templateName = templates.data?.find((item) => item.id === view.report_template_id)?.name ?? view.report_template_id;
  const library = libraries.data?.find((item) => item.id === libraryId);
  return <div className="space-y-4">
    <section aria-label="任务与范围" className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={head}>本次范围</h2>
        <Pill tone="lav">任务模版：{taskName}{taskVersion}</Pill>
        {templateName && view.task_engine_id === "task4" ? <Pill tone="sky">报告模版：{templateName}</Pill> : null}
        <span className="flex-1" />
        <button type="button" className="text-caption text-[var(--link)] hover:underline" onClick={onAsk}>就此范围提问 ›</button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="资料" value={view.counts.documents} sub={`${view.counts.corpora} 个来源`} />
        <Stat label="项目" value={view.counts.projects} sub={view.counts.pending_identity ? `另有 ${view.counts.pending_identity} 份待识别` : "均按批准号识别"} />
        <Stat label="跨库项目" value={view.counts.cross_library_projects} sub="同一批准号出现在多个资料库" />
        <Stat label="已提取四维" value={`${view.extraction.current}/${view.extraction.documents}`} sub="缺提取的项不计入四维条目" />
      </div>
      <p className={`mt-3 ${note}`}>{view.notes.join(" ")}</p>
      {library && library.count > view.counts.documents ? <p className={`mt-2 ${note}`}>
        资料页列出 {library.count} 份引用，其中 {library.count - view.counts.documents} 份不在范围内的可读资料中（原资料已删除或读取失败）。
      </p> : null}
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <SourcesCard data={view} />
      <ExtractionCard data={view} />
      <YearsCard data={view} />
      <FundingCard data={view} />
    </div>
    <DimensionsCard data={view} />
    <ProjectsCard data={view} />
    <RelationsCard data={view} />
  </div>;
}
