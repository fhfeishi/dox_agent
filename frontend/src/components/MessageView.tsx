import { GenerationProgress } from "./GenerationProgress";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { fetchReport, fetchArtifact, createReport, fetchCorpusFiles, fetchReportMetadata, fetchTaskVersion, fetchTemplates, preflightReport, templateArea, templateLabel, type ReportInfo, type ReportMetadataCoverage, type ReportPreflight, type Source, type Step, type TaskInfo, type TemplateSummary, type TraceItem } from "../api";
import { rehypeCitations } from "../citation";
import { downloadText } from "../exportText";
import { markdownComponents } from "../markdownComponents";
import { formatDuration, type Attempt } from "../conversation";
import { Icon } from "./Icons";
import { ReportMarkdown } from "./ReportMarkdown";
import { useApp } from "../store";
import { useAuth } from "../auth";
import { fetchDocuments } from "../useDocuments";
import { useLayout } from "../layout";

const STEP_STATUS: Record<Step["status"], { label: string; cls: string }> = {
  running: { label: "进行中", cls: "bg-[var(--primary-soft)] text-[var(--primary)] ring-[var(--lav-line)]" },
  completed: { label: "完成", cls: "bg-[var(--canvas)] text-[var(--slate)] ring-[var(--hairline)]" },
  failed: { label: "失败", cls: "bg-[var(--tint-rose)] text-[var(--rose-fg)] ring-[var(--rose-line)]" },
  interrupted: { label: "已中断", cls: "bg-[var(--tint-peach)] text-[var(--orange-fg)] ring-[var(--orange-line)]" },
};

const SEARCH_REASON: Record<string, string> = {
  direct: "没能从问题中识别出可检索的主题词",
  no_reports: "所选范围内没有包含这些主题词的报告",
};

function TraceNode({ index, title, last, children }: { index: number; title: string; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative flex gap-[10px] pb-[12px]">
      {!last ? <span aria-hidden="true" className="absolute top-[22px] bottom-0 left-[10px] w-px bg-[var(--hairline)]" /> : null}
      <span className="relative grid size-[21px] shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-caption font-semibold text-[var(--primary)]">{index}</span>
      <div className="min-w-0 flex-1 pt-[1px]">
        <p className="text-body font-medium text-[var(--charcoal)]">{title}</p>
        <div className="mt-[3px] space-y-[6px] text-caption leading-[1.6] text-[var(--steel)]">{children}</div>
      </div>
    </li>
  );
}

/**
 * How this answer found its material (user, 2026-10-20: which reports, and why), replacing the list of
 * internal steps. Folded, one line says what happened; open, the search reads as four stages: what was
 * looked for, which reports were chosen and where they match, what could not be covered, and what the
 * answer rests on. Timings and tokens sit in 技术信息 for administrators.
 */
function Trace({ attempt, live, corpusName, onOpenSource, technical }: {
  attempt: Attempt; live: boolean; corpusName: (id: string) => string;
  onOpenSource?: (s: Source, n: number) => void; technical?: ReactNode;
}) {
  const items = attempt.trace ?? [];
  const searches = items.filter((item): item is Extract<TraceItem, { kind: "search" }> => item.kind === "search");
  const coverage = items.filter((item): item is Extract<TraceItem, { kind: "coverage" }> => item.kind === "coverage");
  const answer = items.find((item): item is Extract<TraceItem, { kind: "answer" }> => item.kind === "answer");
  const search = searches.at(-1);
  const terms = searches[0]?.terms ?? [];
  // Open while the answer is being found, so the search can be followed; folded to its one line once
  // done, so the answer comes first (query 2026-1020 1719).
  const [open, setOpen] = useState(live);
  useEffect(() => { setOpen(live); }, [live]);
  const summary = live
    ? !search ? "正在理解问题、确定检索词" : !answer ? `已选出 ${search.reports.length} 份报告，正在核对覆盖` : `正在依据 ${answer.sources} 份资料组织回答`
    : attempt.outcome === "interrupted" ? "已中断，结果未确认"
      : attempt.outcome === "failed" ? "处理失败"
        : search ? search.reports.length ? `在 ${search.considered} 份资料中选出 ${search.reports.length} 份` : "没有找到匹配的报告"
          : attempt.steps.length ? "未检索资料" : "旧回答没有记录检索过程";
  const scopeIds = attempt.runInfo?.effective_corpus_ids ?? [];
  const sourceOf = (docId: string) => {
    const index = attempt.sources.findIndex((item) => item.doc_id === docId);
    return index < 0 ? null : { source: attempt.sources[index], number: attempt.sources[index].citation ?? index + 1 };
  };
  let stage = 0;

  return (
    <div className="mb-[16px] overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-soft)]">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="font-app flex w-full items-center gap-[8px] px-[12px] py-[9px] text-left hover:bg-[var(--surface)]">
        <Icon name="chevronRight" size={13} strokeWidth={2}
          className={`text-[var(--stone)] transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        <span className="text-body font-semibold text-[var(--slate)]">资料检索</span>
        {live ? (
          <span className="relative flex size-[7px] shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--primary)] opacity-60" />
            <span className="relative inline-flex size-[7px] rounded-full bg-[var(--primary)]" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-caption text-[var(--steel)]">
          {summary}{!live && terms.length ? ` · 检索词 ${terms.join("、")}` : ""}
        </span>
      </button>

      {open ? (
        <div className="border-t border-[var(--hairline-soft)] px-[12px] pt-[12px] pb-[4px]">
          {!items.length ? (
            <p className="pb-[10px] text-caption text-[var(--stone)]">
              {live ? "正在理解问题…" : attempt.steps.length ? "本次回答没有检索资料（例如采集报告需求或需要先补充信息）。" : "旧回答没有记录检索过程。"}
            </p>
          ) : (
            <ol aria-label="资料检索过程">
              <TraceNode index={++stage} title="理解问题">
                <p className="flex flex-wrap items-center gap-[5px]">
                  <span>检索词</span>
                  {terms.length ? terms.map((term) => (
                    <span key={term} className="rounded-[5px] bg-[var(--canvas)] px-[6px] py-[1px] text-[var(--charcoal)] ring-1 ring-[var(--hairline)]">{term}</span>
                  )) : <span>{searches[0]?.reports.length ? "按问题整体匹配（资料较少，未单独提取检索词）" : "未识别"}</span>}
                </p>
                <p>
                  范围：{scopeIds.length ? scopeIds.map(corpusName).join("、") : "所选资料库"}
                  {searches[0]?.limited ? ` · 限定 ${searches[0].limited} 份资料` : " · 全部已入库资料"}
                  {searches[0]?.year_window ? ` · ${searches[0].year_window[0]}–${searches[0].year_window[1]} 年` : ""}
                  {searches[0]?.year_relaxed ? " · 所选时间范围内没有项目，已按全部年份检索" : ""}
                </p>
              </TraceNode>
              {searches.map((round, r) => (
                <TraceNode key={r} index={++stage} title={round.round > 1 ? "补查资料" : "找到资料"}>
                  <p>
                    {round.reports.length
                      ? `${round.round > 1 ? "补查后" : `在 ${round.considered} 份资料中`}选出 ${round.reports.length} 份，按与检索词的吻合程度排序`
                      : SEARCH_REASON[round.reason] ?? "没有找到匹配的报告"}
                    {round.partial ? "；少于这类任务通常需要的报告数，结论的范围有限" : ""}
                  </p>
                  {round.reports.length ? (
                    <ul className="space-y-[6px]">
                      {round.reports.map((report) => {
                        const cited = sourceOf(report.doc_id);
                        const missing = round.terms.filter((term) => !report.matched.includes(term));
                        return (
                          <li key={report.doc_id} className="rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-[10px] py-[8px]">
                            <div className="flex items-start gap-[7px]">
                              {cited ? <span className="mt-[2px] grid size-[16px] shrink-0 place-items-center rounded-[4px] bg-[var(--primary)] text-caption font-bold text-white">{cited.number}</span> : null}
                              {cited && onOpenSource
                                ? <button type="button" onClick={() => onOpenSource(cited.source, cited.number)}
                                    className="min-w-0 text-left text-body text-[var(--charcoal)] hover:text-[var(--primary)] hover:underline">{report.title}</button>
                                : <span className="min-w-0 text-body text-[var(--charcoal)]">{report.title}</span>}
                            </div>
                            <p className="mt-[2px] text-[var(--stone)]">
                              {[corpusName(report.corpus_id), report.project_no, report.years, report.pi].filter(Boolean).join(" · ")}
                            </p>
                            <div className="mt-[4px] flex flex-wrap items-center gap-x-[10px] gap-y-[3px]">
                              <span className="flex items-center gap-[6px]">
                                <span aria-hidden="true" className="h-[5px] w-[44px] overflow-hidden rounded-full bg-[var(--track)]">
                                  <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.round(report.cover * 100)}%` }} />
                                </span>
                                <span>吻合 {Math.round(report.cover * 100)}%</span>
                              </span>
                              {report.matched.length ? <span>含：<span className="text-[var(--charcoal)]">{report.matched.join("、")}</span></span> : null}
                              {missing.length ? <span className="text-[var(--stone)]">未含：{missing.join("、")}</span> : null}
                            </div>
                            {report.where.length ? (
                              <p className="mt-[2px]">依据：{report.where.map((w) => `第 ${w.page} 页${w.heading ? `「${w.heading}」` : ""}`).join("；")}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </TraceNode>
              ))}
              {coverage.map((gap, g) => (
                <TraceNode key={`gap-${g}`} index={++stage} title="核对覆盖">
                  <p>{gap.retry ? `首轮资料没有覆盖「${gap.missing.join("、")}」，已按这些词补查` : `仍未覆盖「${gap.missing.join("、")}」，回答会说明这部分资料不足`}</p>
                </TraceNode>
              ))}
              {answer ? (
                <TraceNode index={++stage} title="组织回答" last>
                  <p>
                    依据 {answer.sources} 份报告的{answer.basis.replace(/^本轮/, "")}（约 {Math.max(1, Math.round(answer.characters / 1000)).toLocaleString()} 千字）
                    {answer.web ? `，另有 ${answer.web} 个网页快照` : ""}；回答中的 [n] 对应上面的编号。
                  </p>
                </TraceNode>
              ) : live ? (
                <TraceNode index={++stage} title="组织回答" last><p>等待前面的步骤完成…</p></TraceNode>
              ) : null}
            </ol>
          )}
          {technical ? (
            <details className="mb-[8px] border-t border-[var(--hairline-soft)] pt-[6px] text-caption text-[var(--stone)]">
              <summary className="cursor-pointer">技术信息</summary>
              {technical}
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepList({ attempt }: { attempt: Attempt }) {
  if (!attempt.steps.length) return null;
  return (
    <ul className="mt-[6px] flex flex-wrap gap-x-[12px] gap-y-[2px]">
      {attempt.steps.map((step) => (
        <li key={step.id}>
          {step.label}
          <span className="font-code ml-[4px] tabular-nums">{step.duration_ms != null ? formatDuration(step.duration_ms) : STEP_STATUS[step.status].label}</span>
        </li>
      ))}
    </ul>
  );
}

function Metrics({ attempt, startedTick }: { attempt: Attempt; startedTick?: number }) {
  const [now, setNow] = useState(() => performance.now());
  const running = attempt.outcome === "running";
  useEffect(() => {
    if (!running) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [running, startedTick]);
  const elapsed =
    running && startedTick !== undefined ? Math.max(0, now - startedTick) : attempt.elapsedMs;
  const first =
    attempt.firstTokenMs === null
      ? running
        ? `等待中${elapsed === null ? "" : ` ${formatDuration(elapsed)}`}`
        : "未收到正文"
      : formatDuration(attempt.firstTokenMs);
  const usage = attempt.usage;
  const tokenText =
    usage?.complete && attempt.complete
      ? `${(usage.total_tokens ?? 0).toLocaleString()}（输入 ${(usage.input_tokens ?? 0).toLocaleString()} / 输出 ${(usage.output_tokens ?? 0).toLocaleString()}）`
      : usage?.reported_tokens != null
        ? `${usage.reported_tokens.toLocaleString()} · ${running ? "统计中" : "不完整"}`
        : running
          ? "统计中"
          : attempt.startedAt
            ? "未返回"
            : "—";
  // 思考 ≈ 总耗时 − 首 token（首 token 之后到收束的生成阶段）。仅当两者都有时显示。
  const thinking =
    attempt.complete && attempt.totalMs != null && attempt.firstTokenMs != null
      ? attempt.totalMs - attempt.firstTokenMs
      : null;

  return (
    <div className="mt-[10px] flex flex-wrap gap-x-[14px] gap-y-[4px] text-caption text-[var(--stone)]" aria-label="回答耗时">
      <span>
        首 token / Think 等待：<b className="font-code font-medium text-[var(--slate)] tabular-nums">{first}</b>
      </span>
      {thinking !== null ? (
        <span>
          思考{" "}
          <b className="font-code font-medium text-[var(--slate)] tabular-nums">
            {formatDuration(thinking)}
          </b>
        </span>
      ) : null}
      <span>
        {attempt.complete ? "总耗时" : running ? "已耗时" : "耗时"}{" "}
        <b className="font-code font-medium text-[var(--slate)] tabular-nums">
          {attempt.complete
            ? attempt.totalMs === null
              ? "未报告"
              : formatDuration(attempt.totalMs)
            : elapsed === null
              ? "未报告"
              : formatDuration(elapsed)}
        </b>
        {!attempt.complete ? (
          <span className="ml-[4px]">
            {running
              ? "进行中"
              : attempt.outcome === "interrupted"
                ? "已中断（结果未确认）"
                : "失败（未完成）"}
          </span>
        ) : null}
      </span>
      <span>
        本轮 Token{" "}
        <b className="font-code font-medium text-[var(--slate)] tabular-nums">{tokenText}</b>
      </span>
    </div>
  );
}

function Sources({ attempt, onOpenSource }: { attempt: Attempt; onOpenSource?: (s: Source, n: number) => void }) {
  if (!attempt.sources.length) return null;
  const documents = new Map<string, { source: Source; number: number; numbers: number[] }>();
  attempt.sources.forEach((source, index) => {
    const number = source.citation ?? index + 1;
    const key = JSON.stringify([source.corpus_id, source.doc_id ?? source.snapshot_id ?? source.url, source.version]);
    const existing = documents.get(key);
    if (existing) existing.numbers.push(number);
    else documents.set(key, { source, number, numbers: [number] });
  });
  return (
    <div className="mt-[14px]">
      <div className="mb-[8px] flex items-center gap-[7px] text-caption font-semibold tracking-[0.4px] text-[var(--stone)] uppercase">
        <Icon name="library" size={12} strokeWidth={2} />
        引用来源 {documents.size} 篇
      </div>
      <div className="flex flex-wrap gap-[7px]">
        {[...documents.values()].map(({ source: s, number: n, numbers }, j) => {
          const label = `${s.title}${s.page ? ` · 第${s.page}页` : ""}`;
          return onOpenSource ? (
            <button
              key={j}
              type="button"
              onClick={() => onOpenSource(s, n)}
              title={[`引用编号：${numbers.join("、")}`, ...(s.locations?.map((location) => `${location.heading}：${location.snippet}`) ?? [s.snippet])].join("\n")}
              className="font-app flex max-w-[320px] items-center gap-[7px] rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] px-[9px] py-[6px] text-left transition-colors hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-soft)]"
            >
              <span className="grid size-[15px] shrink-0 place-items-center rounded-[4px] bg-[var(--primary)] text-caption font-bold text-white">
                {n}
              </span>
              <span className="truncate text-caption text-[var(--charcoal)]">{label}</span>
            </button>
          ) : (
            <span
              key={j}
              className="flex max-w-[320px] items-center gap-[7px] rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas)] px-[9px] py-[6px]"
            >
              <span className="grid size-[15px] shrink-0 place-items-center rounded-[4px] bg-[var(--slate)] text-caption font-bold text-white">
                {n}
              </span>
              <span className="truncate text-caption text-[var(--charcoal)]">{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Telemetry({ attempt }: { attempt: Attempt }) {
  const t = attempt.telemetry;
  if (!t) return null;
  return (
    <details className="mt-[12px] text-caption text-[var(--stone)]">
      <summary className="cursor-pointer">运行记录</summary>
      <div className="mt-[6px] space-y-[2px]">
        <p>
          {{
            retrieve: "报告级检索",
            chunk_only: "片段作答",
            report: "报告需求采集",
            direct: "直接交流",
          }[t.path ?? ""] ?? "旧版本未记录路径"}
        </p>
        <p>
          检索 {t.chunks_retrieved ?? 0} 片段 · 选中 {t.reports_selected ?? 0} 篇 · 上下文约 {(t.context_tokens ?? 0).toLocaleString()} tokens · 已报告 {
            attempt.usage?.reported_calls ?? "?"
          } / {attempt.usage?.calls ?? "?"} 次模型调用
        </p>
        {Object.entries(t.stages_ms ?? {}).map(([stage, ms]) => (
          <p key={stage}>
            {{
              understand: "理解问题",
              retrieve: "检索报告",
              assemble: "装配上下文",
              validate: "核验覆盖",
              answer: "组织回答",
              direct: "直接交流",
              finish: "完成",
            }[stage] ?? stage}
            ：{formatDuration(ms)}
          </p>
        ))}
      </div>
    </details>
  );
}

function ReportCard({ attempt, onReport }: { attempt: Attempt; onReport?: (report: ReportInfo) => void }) {
  const { corpora, workspace, activeTask, handleOpenSource } = useApp();
  const { showInspector } = useLayout();
  const taskId = attempt.runInfo?.task_id ?? attempt.options.task_id;
  const taskVersion = attempt.runInfo?.task_version ?? attempt.options.task_version;
  const currentTaskMatches = activeTask?.id === taskId && activeTask?.version === taskVersion;
  const [historicalTask, setHistoricalTask] = useState<TaskInfo | null>(null);
  const [taskLoadError, setTaskLoadError] = useState("");
  useEffect(() => {
    if (!taskId?.startsWith("custom-") || !taskVersion || currentTaskMatches) return;
    let active = true;
    void fetchTaskVersion(taskId, taskVersion).then(
      (task) => { if (active) { setHistoricalTask(task); setTaskLoadError(""); } },
      (error) => { if (active) setTaskLoadError(`原任务版本读取失败：${(error as Error).message}`); },
    );
    return () => { active = false; };
  }, [taskId, taskVersion, currentTaskMatches]);
  // The session may upgrade while an older intake remains visible; bind its report to that run's task version.
  const reportTask = currentTaskMatches ? activeTask : historicalTask?.id === taskId && historicalTask?.version === taskVersion ? historicalTask : undefined;
  const [local, setLocal] = useState<ReportInfo | null>(null);
  const report = local;
  const [reportState, setReportState] = useState("");
  useEffect(() => {
    const id = attempt.report?.report_id;
    if (!id) return;
    let active = true;
    const refresh = () => {
      setLocal(null);
      void fetchReport(id).then(value => { if (active) { setLocal(value); setReportState(""); } }, cause => { if (active) setReportState((cause as Error).message); });
    };
    refresh(); window.addEventListener("focus", refresh); window.addEventListener("dox-artifacts-changed", refresh);
    return () => { active=false; window.removeEventListener("focus",refresh); window.removeEventListener("dox-artifacts-changed",refresh); };
  }, [attempt.report?.report_id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [coverage, setCoverage] = useState<ReportMetadataCoverage | null>(null);
  const [preflight, setPreflight] = useState<ReportPreflight | null>(null);
  const lastRequest = useRef<{ key: string; runId: string } | null>(null);
  const [coverageBusy, setCoverageBusy] = useState(false);
  const [coverageError, setCoverageError] = useState("");
  const [showCoverage, setShowCoverage] = useState(false);
  const scopeIds = attempt.runInfo?.effective_corpus_ids ?? attempt.options.corpus_ids ??
    (attempt.options.corpus_id ? [attempt.options.corpus_id] : []);
  const allowedDocIds = attempt.runInfo?.allowed_doc_ids ?? attempt.options.allowed_doc_ids;
  const [corpusId, setCorpusId] = useState(scopeIds.length === 1 ? scopeIds[0] : "");
  const params = attempt.policy?.report_params;
  const [domain, setDomain] = useState(params?.domain ?? "");
  const domainEdited = useRef(false);
  const [yearFrom, setYearFrom] = useState(params?.year_from ?? new Date().getFullYear() - 5);
  const [yearTo, setYearTo] = useState(params?.year_to ?? new Date().getFullYear() - 1);
  const [fundType, setFundType] = useState(params?.fund_type ?? "");
  const [focus, setFocus] = useState(params?.focus ?? "");
  const [purpose, setPurpose] = useState(params?.purpose ?? "研究进展梳理");
  const [audience, setAudience] = useState(params?.audience ?? "专业研究人员");
  const [length, setLength] = useState(params?.length ?? "标准篇幅");
  const [illustrated, setIllustrated] = useState(Boolean(params?.illustrated));
  const [reportMode, setReportMode] = useState<"theme" | "review">("theme");
  const [adjust, setAdjust] = useState(false);
  useEffect(() => {
    if (!params) return;
    domainEdited.current = false;
    setDomain(params.domain ?? "");
    setYearFrom(params.year_from ?? new Date().getFullYear() - 5);
    setYearTo(params.year_to ?? new Date().getFullYear() - 1);
    setFundType(params.fund_type ?? "");
    setFocus(params.focus ?? "");
    setPurpose(params.purpose ?? "研究进展梳理");
    setAudience(params.audience ?? "专业研究人员");
    setLength(params.length ?? "标准篇幅");
    setIllustrated(Boolean(params.illustrated));
  }, [params]);
  const boundReportTask = reportTask?.kind === "custom" && reportTask.engine_task_id === "task4" && Boolean(reportTask.report_template_id);
  const [templateId, setTemplateId] = useState(boundReportTask ? reportTask?.report_template_id ?? "" : params?.template_id ?? "comprehensive");
  const [templateOptions, setTemplateOptions] = useState<TemplateSummary[]>([]);
  useEffect(() => {
    let active = true;
    void fetchTemplates().then(
      (items) => { if (active) setTemplateOptions(items.filter((item) => templateArea(item) === "analysis" && (item.kind !== "custom" || (!item.archived && (item.version ?? 0) > 0)))); },
      () => { if (active) setTemplateOptions([]); },
    );
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (boundReportTask) setTemplateId(reportTask?.report_template_id ?? "");
    else if (!templateId && params?.template_id) setTemplateId(params.template_id);
  }, [reportTask?.report_template_id, boundReportTask, params?.template_id, templateId]);
  const boundTemplate = templateOptions.find((item) => item.id === reportTask?.report_template_id);
  const availableTemplates = boundReportTask
    ? [{ id: reportTask?.report_template_id ?? "", name: boundTemplate?.name ?? reportTask?.report_template_id ?? "固定模版",
        kind: boundTemplate?.kind ?? "custom", status: "published", version: reportTask?.report_template_version ?? 0 }]
    : templateOptions;
  const ready = Boolean((!taskId?.startsWith("custom-") || reportTask) && domain.trim() && yearFrom >= 1900 && yearTo <= 2100 && yearFrom <= yearTo && templateId && scopeIds.includes(corpusId));
  useEffect(() => { setPreflight(null); }, [corpusId, domain, yearFrom, yearTo, fundType, templateId]);
  useEffect(() => {
    setCoverage(null);
    setCoverageError("");
    setShowCoverage(false);
  }, [corpusId]);
  if (attempt.policy?.stop_reason !== "report_pending") return null;
  async function generate() {
    setBusy(true);
    setError("");
    try {
      if (!scopeIds.includes(corpusId)) throw new Error("请确认本次报告使用的单一知识库");
      let docIds: string[] | undefined;
      if (allowedDocIds?.length) {
        const [docs, files] = await Promise.all([
          fetchDocuments(corpusId, { failure: "无法读取所选知识库的文档范围" }), fetchCorpusFiles(corpusId),
        ]);
        // The current document list omits stale entries; keep their manifest membership
        // so an explicit selection reaches the server and receives a conflict response.
        const corpusDocIds = new Set([...docs.map((doc) => doc.doc_id),
          ...files.files.map((file) => file.doc_id).filter((id): id is string => Boolean(id))]);
        docIds = allowedDocIds.filter((id) => corpusDocIds.has(id));
        if (!docIds.length) throw new Error("所选知识库中没有本轮限定的资料，请调整资料范围后重新发起报告");
      }
      const selectedTemplate = templateOptions.find((item) => item.id === templateId);
      const customReportTask = reportTask?.kind === "custom" && reportTask?.engine_task_id === "task4";
      const boundTemplateIsCustom = availableTemplates.find((item) => item.id === templateId)?.kind === "custom";
      if (!ready) throw new Error("请确认报告知识库、主题和年份范围");
      const request = { domain: domain.trim(), year_from: yearFrom, year_to: yearTo,
        fund_type: fundType.trim(), focus: focus.trim(), purpose: purpose.trim(),
        audience: audience.trim(), length: length.trim(), illustrated, report_mode: reportMode, template_id: templateId,
        template_version: boundReportTask
          ? reportTask?.report_template_version
          : boundTemplateIsCustom ? selectedTemplate?.version : undefined,
        task_id: customReportTask ? reportTask?.id : undefined,
        task_version: customReportTask ? taskVersion : undefined,
        task_params: attempt.options.task_params ?? {},
        corpus_id: corpusId, doc_ids: docIds,
        session_key: workspace.active, parent_run_id: attempt.runId };
      const scope = await preflightReport(request);
      setPreflight(scope);
      if (!scope.eligible_count) throw new Error("当前范围没有符合条件的资料。请调整项目年份、类别或资料范围，并查看缺失元数据。");
      const key = JSON.stringify({ request, fingerprint: scope.fingerprint });
      // A changed scope starts a new child run; an unchanged failed request reuses its run id.
      const reportRunId = attempt.report || report || (lastRequest.current && lastRequest.current.key !== key)
        ? crypto.randomUUID() : lastRequest.current?.runId ?? `${attempt.runId.slice(0, 72)}-report`;
      lastRequest.current = { key, runId: reportRunId };
      const result = await createReport({ ...request, scope_fingerprint: scope.fingerprint, run_id: reportRunId });
      if (onReport) onReport(result);
      else setLocal(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成报告失败");
    } finally {
      setBusy(false);
    }
  }
  async function copyReport() {
    if (report) await navigator.clipboard.writeText(report.markdown);
  }
  async function inspectCoverage() {
    setShowCoverage((shown) => !shown);
    if (coverage || coverageBusy || !scopeIds.includes(corpusId)) return;
    setCoverageBusy(true);
    setCoverageError("");
    try {
      setCoverage(await fetchReportMetadata(corpusId));
    } catch (e) {
      setCoverageError(e instanceof Error ? e.message : "元数据覆盖读取失败");
    } finally {
      setCoverageBusy(false);
    }
  }
  return (
    <div className="mt-[12px] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px]">
      {taskLoadError ? <p role="alert" className="text-caption text-[var(--red)]">{taskLoadError}</p> : null}
      <div className="flex flex-wrap items-center gap-[8px]">
        <span className="text-body font-medium text-[var(--slate)]">专项报告</span>
        <span className="text-caption text-[var(--stone)]">
          {domain || "待指定主题"} · 项目年份 {yearFrom}–{yearTo} · {fundType || "类别不限"} · {availableTemplates.find((item) => item.id === templateId)?.name ?? templateId}
        </span>
        <label className="text-caption text-[var(--slate)]">
          报告知识库
          <select aria-label="报告知识库" value={corpusId} disabled={busy}
            onChange={(event) => {
              setCorpusId(event.target.value);
              if (!domainEdited.current && (!domain || params?.sources?.domain === "corpus")) {
                setDomain(corpora.find((item) => item.id === event.target.value)?.domain ?? "");
              }
            }}
            className="ml-[5px] rounded border border-[var(--hairline)] bg-[var(--canvas)] px-[5px] py-[3px]">
            <option value="">请选择单一知识库</option>
            {scopeIds.map((id) => <option key={id} value={id}>{corpora.find((item) => item.id === id)?.name ?? id}</option>)}
          </select>
        </label>
        <label className="text-caption text-[var(--slate)]">
          报告模版
          <select aria-label="报告模版" value={templateId} disabled={busy || boundReportTask}
            onChange={(event) => setTemplateId(event.target.value)}
            className="ml-[5px] rounded border border-[var(--hairline)] bg-[var(--canvas)] px-[5px] py-[3px]">
            {availableTemplates.map((item) => (
              <option key={item.id} value={item.id}>{templateLabel(item)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-[4px] text-caption text-[var(--slate)]">
          <input type="checkbox" checked={illustrated} disabled={busy} onChange={(event) => setIllustrated(event.target.checked)} />图文报告
        </label>
        <label className="text-caption text-[var(--slate)]">范围
          <select aria-label="报告范围" value={reportMode} disabled={busy}
            onChange={(event) => setReportMode(event.target.value as "theme" | "review")}
            className="ml-[5px] rounded border border-[var(--hairline)] bg-[var(--canvas)] px-[5px] py-[3px]">
            <option value="theme">主题研究</option>
            <option value="review">合格资料综述</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void generate()}
          className="ml-auto rounded-[6px] bg-[var(--primary)] px-[10px] py-[4px] text-caption text-white disabled:opacity-50"
        >
          {busy ? "生成中…" : report ? "重新生成" : "生成报告"}
        </button>
      </div>
      {preflight ? <div className="mt-[7px] text-caption leading-[1.6] text-[var(--steel)]">
        <p>按项目区间与年份窗口相交预检：{allowedDocIds?.length ? "本次限定资料" : "所选库"}符合条件的 {preflight.eligible_count} 份（所选范围共 {preflight.total} 份）；来源失效 {preflight.excluded.stale ?? 0}，项目区间缺失 {preflight.excluded.period}，年份不相交 {preflight.excluded.year}，类别不符 {preflight.excluded.category}。候选数不等于模型实际读取或引用数。</p>
        {preflight.hint ? <p className="mt-[4px] text-[var(--red)]">{preflight.hint}</p> : null}
        {preflight.eligible_count === 0 && (preflight.observed_years?.length ?? 0) > 0 ? (
          <button type="button"
            className="mt-[4px] rounded border border-[var(--hairline)] px-[6px] py-[2px] text-caption text-[var(--primary)]"
            onClick={() => {
              const years = preflight.observed_years ?? [];
              setYearFrom(Math.min(...years));
              setYearTo(Math.max(...years));
            }}>
            把年份改为 {Math.min(...(preflight.observed_years ?? []))}–{Math.max(...(preflight.observed_years ?? []))}（库中项目年份）
          </button>
        ) : null}
        {preflight.reasons?.length ? (
          <details><summary className="cursor-pointer text-[var(--primary)]">查看被排除的资料（{preflight.reasons.length} 份）</summary>
            <ul className="max-h-[120px] overflow-auto pl-[16px]">
              {preflight.reasons.map((item) => (
                <li key={item.doc_id}>{item.title} · {item.reason === "period"
                  ? "文件名缺少有效项目区间"
                  : item.reason === "year" ? `项目区间 ${item.period} 与年份窗口不相交` : item.reason === "stale" ? "来源已变化或不可用" : "资助类别不符"}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <details><summary className="cursor-pointer text-[var(--primary)]">查看候选资料与版本</summary>
          <ul className="max-h-[120px] overflow-auto pl-[16px]">{preflight.eligible.map((doc) => <li key={doc.doc_id}>{doc.title} · 项目 {doc.project_year_from}–{doc.project_year_to} · {doc.version}</li>)}</ul>
        </details>
      </div> : null}
      <div className="mt-[7px] text-caption text-[var(--stone)]">
        {params?.sources?.domain === "corpus" ? "主题来自所选库建议" : params?.sources?.domain === "user" ? "主题来自本次输入" : "主题需要指定"}；年份默认取最近五个完整自然年，可调整。符合筛选的资料以生成时预检为准。
        <button type="button" onClick={() => setAdjust((value) => !value)} className="ml-[7px] text-[var(--primary)] hover:underline">{adjust ? "收起调整" : "调整"}</button>
      </div>
      {adjust ? <div className="mt-[8px] grid grid-cols-2 gap-[7px] text-caption text-[var(--slate)]">
        <label>研究主题<input aria-label="研究主题" value={domain} onChange={(event) => { domainEdited.current = true; setDomain(event.target.value); }} className="ml-[5px] rounded border px-[5px] py-[3px]" /></label>
        <label>基金类别<input aria-label="基金类别" value={fundType} onChange={(event) => setFundType(event.target.value)} placeholder="不限" className="ml-[5px] rounded border px-[5px] py-[3px]" /></label>
        <label>起始年份<input aria-label="起始年份" type="number" value={yearFrom} onChange={(event) => setYearFrom(Number(event.target.value))} className="ml-[5px] w-[85px] rounded border px-[5px] py-[3px]" /></label>
        <label>结束年份<input aria-label="结束年份" type="number" value={yearTo} onChange={(event) => setYearTo(Number(event.target.value))} className="ml-[5px] w-[85px] rounded border px-[5px] py-[3px]" /></label>
        <label>写作目的<input aria-label="写作目的" value={purpose} onChange={(event) => setPurpose(event.target.value)} className="ml-[5px] rounded border px-[5px] py-[3px]" /></label>
        <label>目标读者<input aria-label="目标读者" value={audience} onChange={(event) => setAudience(event.target.value)} className="ml-[5px] rounded border px-[5px] py-[3px]" /></label>
        <label>分析重点<input aria-label="分析重点" value={focus} onChange={(event) => setFocus(event.target.value)} className="ml-[5px] rounded border px-[5px] py-[3px]" /></label>
        <label>篇幅<input aria-label="篇幅" value={length} onChange={(event) => setLength(event.target.value)} className="ml-[5px] rounded border px-[5px] py-[3px]" /></label>
      </div> : null}
      {!domain.trim() ? <p className="mt-[6px] text-caption text-[var(--red)]">请在“调整”中填写研究主题。</p> : null}
      {yearFrom > yearTo ? <p className="mt-[6px] text-caption text-[var(--red)]">起始年份不能晚于结束年份。</p> : null}
      {scopeIds.includes(corpusId) ? (
        <button type="button" onClick={() => void inspectCoverage()}
          className="mt-[6px] text-caption text-[var(--primary)] hover:underline">
          {showCoverage ? "收起元数据覆盖" : "查看元数据覆盖与未命中资料"}
        </button>
      ) : null}
      {showCoverage ? (
        <div className="mt-[5px] text-caption leading-[1.6] text-[var(--steel)]">
          {coverageBusy ? <p>正在读取字段覆盖…</p> : null}
          {coverageError ? <p role="alert" className="text-[var(--red)]">{coverageError}</p> : null}
          {coverage ? (
            <>
              <p>{corpora.find((item) => item.id === coverage.corpus_id)?.name ?? coverage.corpus_id}：
                共 {coverage.total} 份；文件名项目区间可识别 {coverage.period.hits}、缺失 {coverage.period.missing}；
                资助类别命中 {coverage.category.hits}、缺失 {coverage.category.missing}。</p>
              {coverage.unmatched.length ? (
                <ul className="mt-[3px] max-h-[120px] list-disc overflow-auto pl-[18px]">
                  {coverage.unmatched.map((doc) => (
                    <li key={doc.doc_id}>{doc.title} · 项目区间 {doc.period} · 类别 {doc.category}</li>
                  ))}
                </ul>
              ) : <p>所有资料均识别到项目区间和类别标签。</p>}
              <p className="mt-[3px]">项目区间来自文件名；类别统计仅反映解析文本字段覆盖。</p>
            </>
          ) : null}
        </div>
      ) : null}
      {busy ? <GenerationProgress status="generating" /> : null}
      {error ? (
        <p role="alert" className="mt-[6px] text-caption text-[var(--red)]">
          {error}
          {reportMode === "theme" && error.includes("没有匹配的报告") ? (
            <button type="button" className="ml-[7px] text-[var(--primary)] underline"
              onClick={() => { setReportMode("review"); setError(""); }}>
              改做合格资料综述
            </button>
          ) : null}
        </p>
      ) : null}
      {reportState ? <p role="status">{reportState} · 请到报告中心的回收站查看或还原。</p> : null}
      {report ? (
        <div className="mt-[8px]">
          <div className="markdown max-h-[360px] overflow-auto rounded-[8px] border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[10px]">
            <ReportMarkdown sources={report.params?.visible_sources} onOpenSource={handleOpenSource} markdown={report.markdown} figures={report.figures} reportId={report.report_id} />
          </div>
          <div className="mt-[6px] flex gap-[10px] text-caption">
            <button type="button" onClick={() => {
              void fetchArtifact(`report:${report.report_id}`).then(
                (artifact) => showInspector({ kind: "artifact", artifactId: artifact.artifact_id }),
                (error: Error) => setError(error.message));
            }}
              className="text-[var(--primary)] hover:underline">打开报告</button>
            <button type="button" onClick={() => void copyReport()} className="text-[var(--primary)] hover:underline">
              复制
            </button>
            {report.figures?.length ? <a href={`/api/reports/${encodeURIComponent(report.report_id)}/export?format=zip`}>下载图文 ZIP</a>
              : <button type="button" onClick={() => downloadText(report.markdown, `report-${report.report_id.slice(0, 8)}.md`)} className="text-[var(--primary)] hover:underline">下载 .md</button>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MessageView({
  attempt,
  startedTick,
  onRegenerate,
  onOpenSource,
  onReport,
  onDraft,
  onExport,
  onSaveArtifact,
  compact = false,
}: {
  attempt: Attempt;
  startedTick?: number;
  onRegenerate?: () => void;
  onOpenSource?: (source: Source, n: number) => void;
  onReport?: (report: ReportInfo) => void;
  onDraft?: () => void;
  onExport?: (format: "md" | "word") => void;
  onSaveArtifact?: () => void;
  compact?: boolean;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // Run records, token counts and timings are for administrators; others see elapsed time only while
  // an answer is being written (节点审查 D4).
  const { role } = useAuth();
  const { corpora } = useApp();
  useEffect(() => {
    setCopyState("idle");
  }, [attempt.answer]);
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 3000);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(attempt.answer);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const sourceByNumber = useMemo(() => {
    const map = new Map<number, Source>();
    attempt.sources.forEach((source, index) => {
      const n = source.citation ?? index + 1;
      if (!map.has(n)) map.set(n, source);
    });
    return map;
  }, [attempt.sources]);

  const rehypePlugins: PluggableList | undefined = useMemo(
    () =>
      onOpenSource
        ? [rehypeCitations({ sources: attempt.sources, onCite: (source, n) => onOpenSource(source, n) })]
        : undefined,
    [attempt.sources, onOpenSource],
  );

  const components = useMemo(
    () =>
      onOpenSource
        ? {
            table: markdownComponents.table,
            a: (props: ComponentProps<"a">) => {
              const match = typeof props.href === "string" ? /^#cite-(\d+)$/.exec(props.href) : null;
              const source = match ? sourceByNumber.get(Number(match[1])) : undefined;
              if (!match || !source) return <a {...props} />;
              const n = Number(match[1]);
              return (
                <button
                  type="button"
                  title={source.title}
                  aria-label={`[${n}]`}
                  className="font-app mx-[2px] inline-block h-[16px] rounded-[4px] bg-[var(--primary-soft)] px-[4px] align-[1px] text-caption leading-[16px] font-semibold text-[var(--primary)] hover:bg-[var(--lav-bg)]"
                  onClick={() => onOpenSource(source, n)}
                >
                  {n}
                </button>
              );
            },
          }
        : { table: markdownComponents.table },
    [onOpenSource, sourceByNumber],
  );

  const running = attempt.outcome === "running";

  return (
    <>
      {!compact ? <Trace attempt={attempt} live={running} onOpenSource={onOpenSource}
        corpusName={(id) => (corpora.find((item) => item.id === id)?.name ?? id).replace(/^自然科学基金-/, "")}
        technical={role === "admin" ? <><Metrics attempt={attempt} startedTick={startedTick} /><StepList attempt={attempt} /><Telemetry attempt={attempt} /></> : undefined} /> : null}
      {attempt.answer ? (
        <div className="markdown">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={components}>
            {attempt.answer}
          </Markdown>
        </div>
      ) : (
        <p className="text-body leading-[1.72] text-[var(--charcoal)]">
          {running ? "正在检索并组织答案" : "未生成回答"}
          {running ? (
            <span className="animate-caret ml-[2px] inline-block h-[15px] w-[7px] translate-y-[2px] rounded-[1px] bg-[var(--primary)]" />
          ) : null}
        </p>
      )}

      {/* 对比分析的结论以表内 [n] 引用核对，不再追加整段引用来源列表（query 2026-1008 1547）。 */}
      {!compact && (attempt.runInfo?.task_id ?? attempt.options.task_id) !== "task2" ? <Sources attempt={attempt} onOpenSource={onOpenSource} /> : null}
      {!compact ? <ReportCard attempt={attempt} onReport={onReport} /> : null}



      {!compact ? (
        <div className="mt-[10px] flex flex-wrap items-center gap-[2px]">
          <button
            type="button"
            disabled={!attempt.answer || running}
            onClick={() => void copy()}
            className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            <Icon name="copy" size={13} strokeWidth={1.9} />
            {copyState === "copied" ? "已复制" : "复制答案"}
          </button>
          {onExport ? (
            <>
              <button
                type="button"
                aria-label="导出此回答为 Markdown"
                disabled={!attempt.answer || running}
                onClick={() => onExport("md")}
                className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
              >
                <Icon name="download" size={13} strokeWidth={1.9} />
                导出 MD
              </button>
              <button
                type="button"
                aria-label="导出此回答为 Word"
                disabled={!attempt.answer || running}
                onClick={() => onExport("word")}
                className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
              >
                <Icon name="download" size={13} strokeWidth={1.9} />
                导出 Word
              </button>
            </>
          ) : null}
          {onSaveArtifact && attempt.policy?.stop_reason !== "report_pending" && attempt.outcome === "completed" && attempt.answer ? (
            <button
              type="button"
              aria-label="保存到报告中心"
              onClick={onSaveArtifact}
              title="把这条回答连同引用来源保存到报告中心"
              className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
            >
              <Icon name="library" size={13} strokeWidth={1.9} />
              保存到报告中心
            </button>
          ) : null}
          {onRegenerate ? (
            <button
              type="button"
              disabled={running}
              onClick={onRegenerate}
              title="沿用此版本生效配置重新生成"
              className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
            >
              <Icon name="refresh" size={13} strokeWidth={1.9} />
              重新生成
            </button>
          ) : null}
          {onDraft ? (
            <button
              type="button"
              disabled={!attempt.answer || running}
              onClick={onDraft}
              title="把这条回答载入输入框，改完作为新提问发送"
              className="font-app inline-flex h-[26px] items-center gap-[5px] rounded-[6px] px-[8px] text-caption text-[var(--slate)] transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
            >
              <Icon name="edit" size={13} strokeWidth={1.9} />
              改后重发
            </button>
          ) : null}
          {copyState === "failed" ? (
            <span role="alert" className="text-caption text-[var(--red)]">
              复制失败，请手动选择答案复制。
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function BranchNote({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className="mb-[16px] flex justify-center">
      <button
        type="button"
        onClick={onOpen}
        className="font-app inline-flex items-center gap-[5px] rounded-full border border-[var(--primary-soft)] bg-[var(--primary-soft-2)] px-[11px] py-[4px] text-caption text-[var(--primary-pressed)] hover:bg-[var(--primary-soft)]"
      >
        <Icon name="history" size={12} strokeWidth={2} />
        {label}
      </button>
    </div>
  );
}

// Questions that show what each built-in task is for; a custom task offers its own example.
const EXAMPLES: Record<string, string[]> = {
  task1: ["这批项目采用了哪些关键方法？逐条给出出处。", "已经实现了哪些工作，依据分别是什么？"],
  task2: ["比较这些项目的研究对象、方法和应用。", "对比相近方案的主要差异与适用条件。"],
  task3: ["这个领域有哪些研究路线，已经实现了哪些工作，还有哪些工作可以做？", "关键技术还需要哪些配套技术？"],
  task4: ["生成一份 2021 至 2025 年面上项目成果报告。"],
};

/** An empty conversation says which task it is and offers questions in that task's spirit. */
export function EmptyState({ task, onPick }: { task?: { id: string; name: string; description?: string; example?: string }; onPick: (question: string) => void }) {
  const examples = task ? EXAMPLES[task.id] ?? (task.example ? [task.example] : []) : EXAMPLES.task1;
  return (
    <div className="pt-[40px] pb-[16px]">
      <p className="text-body font-semibold tracking-[0.3px] text-[var(--primary)]">你的知识，有据可循</p>
      <h1 className="mt-[10px] text-page leading-[1.3] font-semibold text-[var(--ink)]">{task ? task.name : "从一个好问题开始。"}</h1>
      <p className="mt-[8px] max-w-[600px] text-body leading-[1.7] text-[var(--steel)]">
        {task?.description || "需要时查阅知识库资料并逐条标注来源。"}
      </p>
      {examples.length ? <div className="mt-[16px] space-y-[6px]">
        {examples.map((question) => (
          <button key={question} type="button" onClick={() => onPick(question)}
            className="flex w-full max-w-[600px] items-center gap-[8px] rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] px-[12px] py-[8px] text-left text-body text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
            <Icon name="chevronRight" size={12} strokeWidth={2.2} className="shrink-0 text-[var(--stone)]" />{question}
          </button>
        ))}
      </div> : null}
    </div>
  );
}
