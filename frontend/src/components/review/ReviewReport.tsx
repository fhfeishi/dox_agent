import { GenerationProgress } from "../GenerationProgress";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { fetchReviewRun, reviewExportUrl, REVIEW_EVIDENCE_NEED_LABEL, REVIEW_FIELD_LABEL, REVIEW_STATUS_LABEL, type ReviewCard, type ReviewFinding, type ReviewRun } from "../../reviewApi";
import { useApp } from "../../store";
import { Button, Pill, type Tone } from "../ui";
import { ReviewPageShell as Shell, ReviewNotice as Notice } from "./ReviewLayout";

const STATUS_TONE: Record<string, Tone> = { issue: "rose", warning: "peach", pending: "yellow", pass: "mint", advisory: "sky", na: "gray" };

function localTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
const SHEET_FIELDS = ["organizations", "organization_count", "university_present", "education", "submitted_at", "patent_count"];
const BUDGET_FIELDS = ["total_budget", "application_budget", "budget", "plan_interval"];
type Topic = { key: string; label: string };
const FORMAL_TABS: Topic[] = [
  { key: "overview", label: "审核概览" }, { key: "outline", label: "正文与大纲" }, { key: "sheet", label: "信息表与单位" },
  { key: "budget", label: "预算与进度" }, { key: "basis", label: "依据与覆盖" },
];
const PROFESSIONAL_TABS: Topic[] = [
  { key: "overview", label: "审核概览" }, { key: "topics", label: "技术专题" }, { key: "projects", label: "相近项目" },
  { key: "literature", label: "政策与文献" }, { key: "suggestions", label: "修改建议" },
];

function StatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? "gray"}>{REVIEW_STATUS_LABEL[status] ?? status}</Pill>;
}

export function ReviewRunPage() {
  const { id = "" } = useParams();
  const { showInspector, handleOpenSource, corpora } = useApp();
  const [search, setSearch] = useSearchParams();
  // Only allow a local results route; a copied report URL must never redirect off-site.
  const requestedReturn = search.get("return") ?? "";
  const returnTo = /^\/results(?:\?|$)/.test(requestedReturn) ? requestedReturn : "/results";
  const returnLink = <Link to={returnTo} className="inline-flex text-sm text-[var(--link)] hover:underline">← 返回成果列表</Link>;
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    let active = true; let timer: number | null = null;
    const load = async () => {
      try {
        const next = await fetchReviewRun(id);
        if (!active) return;
        setRun(next);
        if (["queued", "running"].includes(next.status)) timer = window.setTimeout(load, 2000);
      } catch (cause) { if (active) setError((cause as Error).message); }
    };
    void load();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [id]);
  const formal = run?.request.kind !== "professional";
  const tabs = formal ? FORMAL_TABS : PROFESSIONAL_TABS;
  const tab = tabs.some((item) => item.key === search.get("tab")) ? search.get("tab")! : "overview";
  const checks = useMemo(() => new Map((run?.rule?.checks ?? []).map((check) => [check.id, check])), [run]);
  const findings = run?.findings ?? [];
  const cards = run?.technical?.cards ?? [];
  const items = formal ? findings : cards;
  const statusOf = (status: string) => status === "advisory" ? "warning" : status;
  const count = (status: string) => items.filter((item) => statusOf(item.status) === status).length;
  const verificationPending = run?.audit?.verification?.pending ?? 0;
  const visible = (item: ReviewFinding | ReviewCard) => filter === "all"
    || (filter === "unverified" ? item.verification_status === "pending" : statusOf(item.status) === filter);
  const selectStatus = (value: string) => {
    setFilter(filter === value ? "all" : value);
    setSearch((old) => { const next = new URLSearchParams(old); next.set("tab", "overview"); return next; }, { replace: true });
  };

  function topic(finding: ReviewFinding) {
    const field = finding.clause_ids?.map((cid) => checks.get(cid)?.execution?.field).find(Boolean) ?? "";
    if (finding.group === "budget" || BUDGET_FIELDS.includes(field)) return "budget";
    if (SHEET_FIELDS.includes(field) || finding.group === "scope" || finding.group === "structure") return "sheet";
    return "outline";
  }
  function source(page: number) {
    if (!run) return;
    const loc = run.source_locations?.[String(page)];
    const fileId = loc?.file_id ?? run.document.id;
    showInspector({ kind: "review-source", fileId, page: loc?.source_page ?? page,
      title: fileId === run.information_sheet?.id ? run.information_sheet.filename : run.document.filename });
  }
  const evidenceById = new Map((run?.technical?.evidence ?? []).map((item) => [item.id, item]));

  const findingCard = (item: ReviewFinding) => (
    <article key={item.id} className="mb-3 rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 flex-1 text-base font-semibold">{item.title}</h3>
        {item.origin === "program" ? <Pill tone="sky">程序核对</Pill> : item.origin === "model" ? <Pill tone="lav">模型意见</Pill> : null}
        {item.coverage === "partial" ? <Pill tone="peach">读取覆盖不足</Pill> : null}
        {item.mapping && item.mapping !== "confirmed" ? <Pill tone="yellow">范围未确认</Pill> : null}
        <StatusPill status={item.status} />
      </div>
      {item.requirement ? <p className="mt-2 text-body text-[var(--slate)]">要求：{item.requirement}{item.actual !== undefined && item.actual !== null ? <> · 实际值：<b>{String(item.actual)}</b></> : null}</p> : null}
      <div className="my-3 rounded-xl bg-[var(--surface)] p-4 text-sm leading-7"><strong className="mb-1 block text-xs text-[var(--steel)]">修改或核对建议</strong>{item.suggestion || "结合原文逐项核对。"}</div>
      <details className="text-sm leading-7"><summary className="cursor-pointer font-medium text-[var(--primary)]">查看问题说明、要求和原文依据</summary>
        <p className="mt-3 whitespace-pre-wrap">{item.detail}</p>
        {item.stage_dates?.length ? <p className="mt-2 text-xs">进度计划识别日期：{item.stage_dates.join("、")}</p> : null}
        <p className="mt-3 text-xs text-[var(--steel)]">判断依据：{item.source}</p>
        {item.quote ? <blockquote className="my-3 border-l-2 border-[var(--primary)] bg-[var(--primary-soft)] px-4 py-3">{item.quote}</blockquote> : null}
        {item.counted_text ? <blockquote className="my-3 border-l-2 border-[var(--hairline-strong)] px-4 py-2 text-xs text-[var(--steel)]">计入内容（节选）：{item.counted_text}</blockquote> : null}
        {item.page ? <Button size="sm" variant="ghost" onClick={() => source(item.page!)}>定位这条意见的原文</Button> : null}
      </details>
    </article>
  );
  const list = (rows: ReviewFinding[], empty: string) => {
    const shown = rows.filter((item) => visible(item));
    return shown.length ? shown.map(findingCard) : <p className="rounded-xl border border-dashed border-[var(--hairline-strong)] p-5 text-sm text-[var(--steel)]">{empty}</p>;
  };
  const card = (item: ReviewCard) => (
    <article key={item.id} className="mb-3 rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-2"><h3 className="min-w-0 flex-1 text-base font-semibold">{item.title}</h3><StatusPill status={item.status} /></div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{item.assessment}</p>
      <div className="my-3 rounded-xl bg-[var(--surface)] p-4 text-sm leading-7 whitespace-pre-wrap"><strong className="mb-1 block text-xs text-[var(--steel)]">修改建议</strong>{item.suggestion}</div>
      <p className="text-xs text-[var(--steel)]">评议方式：{item.basis}</p>
      {item.evidence_ids.length ? <p className="mt-2 text-xs">本条依据：{item.evidence_ids.map((eid) => <span key={eid} className="mr-2 inline-block rounded bg-[var(--tint-sky)] px-2 py-0.5">{evidenceById.get(eid)?.title ?? eid}</span>)}</p>
        : <p className="mt-2 text-xs text-[var(--stone)]">本条未引用外部证据，仅依据申请书原文。</p>}
      {item.quote ? <blockquote className="my-3 border-l-2 border-[var(--primary)] bg-[var(--primary-soft)] px-4 py-2 text-sm">{item.quote}</blockquote> : null}
      {item.page ? <Button size="sm" variant="ghost" onClick={() => source(item.page!)}>定位这条意见的原文</Button> : null}
      {item.other_pages?.length ? <span className="ml-2 text-xs text-[var(--steel)]">另见：{item.other_pages.map((page) => (
        <button key={page} type="button" className="mr-2 text-[var(--link)]" onClick={() => source(page)}>{run?.source_locations?.[String(page)]?.kind === "pdf" ? "第" : "块"} {run?.source_locations?.[String(page)]?.source_page ?? page}{run?.source_locations?.[String(page)]?.kind === "pdf" ? " 页" : ""}</button>))}</span> : null}
    </article>
  );

  if (!run) return <Shell title="审查报告" description={error ? "审查结果读取失败" : "正在读取审查结果…"}>{returnLink}<Notice text={error} error /></Shell>;
  const sectionRows = findings.filter((f) => f.clause_ids?.some((cid) => checks.get(cid)?.execution?.field === "section_characters"));
  const projects = (run.technical?.evidence ?? []).filter((item) => item.kind === "project");
  const projectGroups = [...projects.reduce((map, item) => map.set(item.title, [...(map.get(item.title) ?? []), item]), new Map<string, typeof projects>())];
  const others = (run.technical?.evidence ?? []).filter((item) => item.kind !== "project");
  const doc = run.document;
  const versions = run.input_versions ?? [];
  return (
    <Shell title={formal ? "形式审查报告" : "专业审查报告"} description="先看需要处理的问题，再展开说明和原文。待核实不等于不合格；没有发现问题也不等于通过。">
      {returnLink}
      <Notice text={error} error />
      <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs text-[var(--steel)]">{formal ? "形式审查" : "专业审查"} · 模板 {run.rule?.name} v{run.rule?.version}</p><h2 className="mt-2 text-xl font-semibold">{doc.metadata.title || doc.filename}</h2></div>
          <Pill tone={run.status === "completed" ? "mint" : run.status === "failed" ? "rose" : "sky"}>{run.status === "completed" ? "已生成" : REVIEW_STATUS_LABEL[run.status] ?? run.status}</Pill>
        </div>
        <p className="mt-4 text-sm leading-7">{run.reader_report?.summary || run.stage_label}</p>
        {["queued", "running", "failed"].includes(run.status) ? <GenerationProgress status={run.status} stage={run.stage} stage_label={run.stage_label} kind={run.request.kind} /> : null}
        {run.error ? <div role="alert" className="mt-3 rounded bg-[var(--tint-rose)] p-3 text-sm">{run.error}
          <Link className="ml-3 text-[var(--link)]" to={`/review/${run.request.kind}?proposal=${encodeURIComponent(doc.id)}&template=${encodeURIComponent(run.request.rule_id ?? "")}`}>返回准备并重试</Link>
        </div> : null}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--steel)]">
          <span>正文：{doc.filename}{versions[0] ? ` · ${versions[0].sha256.slice(0, 8)}` : ""}</span>
          <span>信息表：{run.information_sheet ? <button type="button" className="text-[var(--link)] hover:underline"
            onClick={() => showInspector({ kind: "review-source", fileId: run.information_sheet!.id, page: 1, title: run.information_sheet!.filename })}>{run.information_sheet.filename}</button> : "未提供"}</span>
          {!formal ? <span>评价方式：{run.request.mode === "historical" ? `历史评价 · ${run.request.cutoff_date}` : "更新建议"}</span> : null}
          {!formal ? <span>对照资料库：{corpora.find((item) => item.id === run.request.corpus_ids?.[0])?.name ?? run.request.corpus_ids?.[0] ?? "未记录"} · 参考报告 {run.technical?.local_matches ?? 0}/{run.request.reference_count ?? 3} 篇 · 文献 {run.request.evidence_ids?.length ?? 0} 篇</span> : null}
          <span>生成：{localTime(run.created_at)}</span><details><summary className="cursor-pointer">生成人</summary>{run.created_by || "未记录"}</details>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--primary)]">
          {run.status === "completed" ? <a href={reviewExportUrl(run.id, "docx")}>下载 Word 报告</a> : null}
          <button type="button" className="hover:underline" onClick={() => showInspector({ kind: "review-source", fileId: doc.id, page: 1, title: doc.filename })}>查看原申请书</button>
          <Link to={"/review/" + (formal ? "professional" : "formal") + "?proposal=" + encodeURIComponent(doc.id) + (run.information_sheet ? "&sheet=" + encodeURIComponent(run.information_sheet.id) : "")}>使用这些材料开展{formal ? "专业审查" : "形式审查"}</Link>
        </div>
      </section>
      {run.status === "completed" ? <>
        <div className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[["issue", "发现问题"], ["warning", "修改建议"], ["pending", "待核实"], ["pass", "已核对通过"]].map(([key, label]) => (
            <button key={key} type="button" onClick={() => selectStatus(key)} aria-pressed={filter === key}
              className={`rounded-xl border bg-[var(--canvas)] p-4 text-left ${filter === key ? "border-[var(--primary)]" : "border-[var(--hairline)]"}`}>
              <span className="text-xs text-[var(--steel)]">{label}</span><strong className="mt-2 block text-2xl">{count(key)}</strong>
            </button>))}
          <button type="button" onClick={() => selectStatus("unverified")} aria-pressed={filter === "unverified"}
            className={`rounded-xl border p-4 text-left ${filter === "unverified" ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--canvas)]"}`}>
            <span className="text-xs text-[var(--steel)]">最终复核未完成</span><strong className="mt-2 block text-2xl">{verificationPending}</strong></button>
        </div>
        <p role="status" className="mb-4 text-xs text-[var(--steel)]">
          {filter === "all" ? "显示全部结果；点击上方状态查看对应事项。" : `已筛选 ${filter === "unverified" ? "最终复核未完成" : REVIEW_STATUS_LABEL[filter]}，再次点击已选状态恢复全部。`}
        </p>
        <div role="tablist" aria-label="报告专题" className="mb-5 flex flex-wrap gap-1 border-b border-[var(--hairline)]">
          {tabs.map((item) => (
            <button key={item.key} role="tab" type="button" aria-selected={tab === item.key}
              onClick={() => setSearch((old) => { const next = new URLSearchParams(old); next.set("tab", item.key); return next; }, { replace: true })}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === item.key ? "border-[var(--primary)] font-semibold text-[var(--ink)]" : "border-transparent text-[var(--steel)]"}`}>{item.label}</button>
          ))}
        </div>
        <div role="tabpanel" className="min-w-0">
          {formal && tab === "overview" ? <>
            <h2 className="mb-3 text-lg font-semibold">主要问题与处理顺序</h2>
            {list([...findings].sort((a, b) => ["issue", "warning", "pending", "pass", "na"].indexOf(a.status) - ["issue", "warning", "pending", "pass", "na"].indexOf(b.status)), "当前筛选下没有事项；未检查的内容不视为通过。")}
          </> : null}
          {formal && tab === "outline" ? <>
            <h2 className="mb-3 text-lg font-semibold">章节篇幅</h2>
            <div className="mb-5 overflow-x-auto rounded-xl border border-[var(--hairline)]">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-[var(--surface)] text-left text-xs text-[var(--steel)]"><tr><th className="p-3">章节</th><th className="p-3">要求</th><th className="p-3">实际（字符）</th><th className="p-3">差异</th><th className="p-3">范围与覆盖</th><th className="p-3">结论</th></tr></thead>
                <tbody>{sectionRows.map((row) => {
                  const spec = row.clause_ids?.map((cid) => checks.get(cid)?.execution).find(Boolean);
                  const diff = typeof row.actual === "number" && spec ? row.actual - Number(spec.value) : null;
                  return <tr key={row.id} className="border-t border-[var(--hairline)]">
                    <td className="p-3 font-medium">{spec?.section || row.title}</td><td className="p-3">≤ {spec?.value}</td>
                    <td className="p-3">{row.actual ?? "未读取"}</td><td className={`p-3 ${diff !== null && diff > 0 ? "text-[var(--red)]" : ""}`}>{diff === null ? "—" : diff > 0 ? `超出 ${diff}` : `余 ${-diff}`}</td>
                    <td className="p-3 text-xs">{row.mapping === "confirmed" ? "已确认" : row.mapping === "automatic" ? "自动定位" : "未确认"} · {row.coverage === "complete" ? "完整读取" : row.coverage === "partial" ? "覆盖不足" : "未读取"}</td>
                    <td className="p-3"><StatusPill status={row.status} /></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {list(findings.filter((f) => topic(f) === "outline"), "此专题没有符合筛选的事项。")}
          </> : null}
          {formal && tab === "sheet" ? <>
            <h2 className="mb-3 text-lg font-semibold">信息表与单位</h2>
            <dl className="mb-5 grid gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 text-sm sm:grid-cols-2">
              {(["title", "organizations", "total_budget", "plan_start", "plan_end"] as const).map((key) => (
                <div key={key}><dt className="text-xs text-[var(--steel)]">{REVIEW_FIELD_LABEL[key]}</dt>
                  <dd>正文：{String((Array.isArray(doc.metadata[key]) ? (doc.metadata[key] as string[]).join("、") : doc.metadata[key]) || "未填写")}
                    {run.information_sheet ? <> ／ 信息表：{String((Array.isArray(run.information_sheet.metadata[key]) ? (run.information_sheet.metadata[key] as string[]).join("、") : run.information_sheet.metadata[key]) || "未填写")}</> : null}</dd></div>
              ))}
            </dl>
            {list(findings.filter((f) => topic(f) === "sheet"), "此专题没有符合筛选的事项。")}
          </> : null}
          {formal && tab === "budget" ? <>
            <h2 className="mb-3 text-lg font-semibold">预算与进度</h2>
            {run.budget?.rows?.length ? <div className="mb-5 overflow-x-auto rounded-xl border border-[var(--hairline)] p-4"><table className="w-full text-sm"><thead><tr className="border-b text-left text-[var(--steel)]"><th className="pb-2">科目</th><th className="pb-2 text-right">金额（万元）</th></tr></thead><tbody>{run.budget.rows.map((row) => <tr key={row.name} className="border-b"><td className="py-2">{row.name}</td><td className="py-2 text-right">{row.amount}</td></tr>)}</tbody></table><p className="mt-3 text-sm">各项合计 {run.budget.sum ?? "未识别"} 万元；原表总额 {run.budget.total ?? "未识别"} 万元；差额 {run.budget.total != null && run.budget.sum != null ? (run.budget.total - run.budget.sum).toFixed(4) : "未计算"}。仅作算术核对。</p></div> : null}
            {list(findings.filter((f) => topic(f) === "budget"), "此专题没有符合筛选的事项。")}
          </> : null}
          {formal && tab === "basis" ? <BasisPanel run={run} /> : null}

          {!formal && tab === "overview" ? <>
            <h2 className="mb-3 text-lg font-semibold">评价覆盖</h2>
            <p className="mb-3 text-sm leading-7">{run.technical?.summary}</p>
            <div className="mb-5 overflow-x-auto rounded-xl border border-[var(--hairline)]"><table className="w-full min-w-[520px] text-sm">
              <thead className="bg-[var(--surface)] text-left text-xs text-[var(--steel)]"><tr><th className="p-3">评价问题</th><th className="p-3">证据需求</th><th className="p-3">意见数</th><th className="p-3">覆盖</th></tr></thead>
              <tbody>{(run.technical?.coverage ?? []).map((row) => <tr key={row.check_id} className="border-t border-[var(--hairline)]"><td className="p-3">{row.title}</td><td className="p-3 text-xs">{REVIEW_EVIDENCE_NEED_LABEL[row.evidence_need] ?? row.evidence_need}</td><td className="p-3">{row.cards}</td><td className="p-3">{row.state === "evaluated" ? <Pill tone="mint">已评价</Pill> : <Pill tone="rose">未完成评价</Pill>}</td></tr>)}</tbody>
            </table></div>
            <BasisPanel run={run} />
          </> : null}
          {!formal && tab === "topics" ? (run.technical?.coverage ?? []).map((row) => (
            <section key={row.check_id} className="mb-6">
              <h2 className="mb-3 text-lg font-semibold">{row.title}</h2>
              {row.state === "missing" ? <p className="rounded-xl border border-dashed border-[var(--red)] p-4 text-sm">未完成评价：模型没有就该问题给出有效意见，请重新运行或人工评议。</p> : null}
              {cards.filter((item) => item.check_id === row.check_id && visible(item)).map(card)}
            </section>)) : null}
          {!formal && tab === "projects" ? <>
            <h2 className="mb-3 text-lg font-semibold">相近项目 · {projectGroups.length} 个（{projects.length} 份文件）</h2>
            {!projectGroups.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-[var(--steel)]">{run.request.corpus_ids?.length ? "所选资料库中没有检索到相近项目；这不能说明申请内容原创。" : "本次未选择对照资料库。"}</p> : null}
            {projectGroups.map(([title, files]) => (
              <article key={title} className="mb-3 rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-5">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-xs text-[var(--steel)]">项目区间 {files[0].project_period?.filter(Boolean).join("–") || "未知"}（不等于发表时间）· {files.length} 份文件 · 被 {cards.filter((c) => c.evidence_ids.some((e) => files.some((f) => f.id === e))).length} 条意见引用</p>
                <details className="mt-2 text-sm"><summary className="cursor-pointer text-[var(--primary)]">查看本次参考片段</summary><p className="mt-2 whitespace-pre-wrap leading-7">{files[0].summary}</p></details>
                {files[0].doc_id ? <Button size="sm" variant="ghost" onClick={() => void handleOpenSource({ title, doc_id: files[0].doc_id, corpus_id: files[0].corpus_id, version: files[0].version, url: files[0].url, snippet: "" }, 0)}>查看项目原文</Button> : null}
              </article>))}
          </> : null}
          {!formal && tab === "literature" ? <>
            <h2 className="mb-3 text-lg font-semibold">政策与文献 · {others.length}</h2>
            {run.technical?.excluded_count ? <p className="mb-3 text-sm text-[var(--steel)]">已排除 {run.technical.excluded_count} 份评价时点之后或日期不明的材料。</p> : null}
            {!others.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-[var(--steel)]">本次未选择政策材料或文献；不作政策符合性结论。</p> : null}
            {others.map((item) => (
              <article key={item.id} className="mb-3 rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-5">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs text-[var(--steel)]">{item.kind === "policy" ? "政策/要求原文" : item.published || "发表时间未明确"}</p>
                {item.filename ? <button type="button" className="mt-2 inline-block text-sm text-[var(--primary)] hover:underline"
                  onClick={() => showInspector({ kind: "review-source", fileId: item.id, page: 1, title: item.filename, evidence: true })}>预览原文</button>
                  : item.url ? <a className="mt-2 inline-block text-sm text-[var(--primary)]" href={item.url} target="_blank" rel="noreferrer">查看原始出处</a> : null}
              </article>))}
          </> : null}
          {!formal && tab === "suggestions" ? <>
            <h2 className="mb-3 text-lg font-semibold">修改建议</h2>
            <p className="mb-3 text-sm text-[var(--steel)]">原申请书保持只读；修改后上传新版本重新审查，本报告保留不变。</p>
            {cards.filter((item) => visible(item)).map((item) => (
              <article key={item.id} className="mb-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 text-sm">
                <p className="text-xs text-[var(--steel)]">{item.topic ?? "评议"} · {item.title}</p>
                <p className="mt-2 whitespace-pre-wrap leading-7">{item.suggestion}</p>
              </article>))}
          </> : null}
        </div>
      </> : null}
    </Shell>
  );
}

function BasisPanel({ run }: { run: ReviewRun }) {
  const enabled = run.rule?.checks.filter((check) => check.enabled) ?? [];
  const results = new Map<string, string>();
  for (const f of run.findings ?? []) for (const cid of f.clause_ids ?? []) results.set(cid, f.status);
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-5">
        <h3 className="font-semibold">模板条目与执行情况 · {enabled.length} 项启用</h3>
        {enabled.map((check) => (
          <div key={check.id} className="mt-3 border-t border-[var(--hairline)] pt-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><b className="flex-1">{check.title}</b>{results.has(check.id) ? <StatusPill status={results.get(check.id)!} /> : run.request.kind === "professional" ? null : <Pill tone="gray">未生成结果</Pill>}</div>
            <p className="mt-1">{check.requirement}</p>
            {check.revised && check.original ? <p className="mt-1 text-xs text-[var(--warn-fg)]">原文要求：{check.original.requirement}／本模板人工修订为上述要求</p> : null}
            <p className="mt-1 text-xs text-[var(--steel)]">来源：{check.source}</p>
          </div>
        ))}
      </div>
      {run.mappings?.rows?.length ? (
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 text-sm">
          <h3 className="font-semibold">章节对应快照（修订 {run.mappings.revision}）</h3>
          {run.mappings.rows.map((row) => <p key={row.check_id} className="mt-2">{row.section}：{row.status === "confirmed" ? (row.missing ? "确认缺失" : "已确认") : "自动识别/未确认"}{row.selected ? ` · ${row.selected.count} 字符 · 位置 ${row.selected.pages.join("、")}` : ""}{row.selected?.unread_images ? " · 含未读图片" : ""}</p>)}
        </div>
      ) : null}
      <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 text-sm">
        <h3 className="font-semibold">范围与限制</h3>
        {run.audit?.limitations?.length ? run.audit.limitations.map((item, index) => <p key={index} className="mt-2 leading-6">{item}</p>) : <p className="mt-2 text-[var(--steel)]">无额外限制说明。</p>}
        {run.audit?.verification ? <p className="mt-3 text-xs">最终文字复核 {run.audit.verification.completed} / {run.audit.verification.total}；程序确定的计量结论独立保留。</p> : null}
      </div>
    </section>
  );
}

