import { GenerationProgress } from "../GenerationProgress";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { createReviewRun, fetchReviewDocuments, fetchReviewEvidence, fetchReviewHealth, fetchReviewMappings, fetchReviewRules, fetchReviewRuns, patchReviewDocument, reextractReviewDocument, saveReviewMappings, testReviewModel, uploadReviewDocument, REVIEW_FIELD_LABEL, REVIEW_KIND_LABEL, REVIEW_SOURCE_LABEL, REVIEW_STATUS_LABEL, type ReviewDoc, type ReviewEvidence, type ReviewHealth, type ReviewKind, type ReviewMappingState, type ReviewMetadata, type ReviewRule, type ReviewRun } from "../../reviewApi";
import { useApp } from "../../store";
import { Button, Pill } from "../ui";
import { ReviewPageShell as Shell, ReviewNotice as Notice } from "./ReviewLayout";

const ACCEPT = ".pdf,.doc,.docx,.md,.txt";
function MetadataFields({ doc, onSave, onRetry }: {
  doc: ReviewDoc;
  onSave: (meta: Partial<ReviewMetadata>) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const { showInspector } = useApp();
  const [draft, setDraft] = useState<ReviewMetadata>(doc.metadata);
  // Fields the user has typed into are kept while extraction polls; untouched fields follow the server.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setTouched(new Set()); setDraft(doc.metadata); setError(""); }, [doc.id]);
  useEffect(() => {
    setDraft((old) => ({ ...doc.metadata, ...Object.fromEntries([...touched].map((key) => [key, old[key as keyof ReviewMetadata]])) }));
  }, [doc.metadata, doc.metadata_revision]);
  const edit = (key: keyof ReviewMetadata, value: unknown) => {
    setTouched((old) => new Set(old).add(key));
    setDraft((old) => ({ ...old, [key]: value }));
  };
  async function save() {
    setBusy(true); setError("");
    try { await onSave({ ...draft, organizations: (draft.organizations ?? []).map((n) => n.trim()).filter(Boolean) }); setTouched(new Set()); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const extraction = doc.metadata_extraction;
  const suggested = extraction?.suggested_metadata ?? {};
  const differing = Object.entries(suggested).filter(([key, value]) => value !== null && value !== "" && !(Array.isArray(value) && !value.length)
    && JSON.stringify(value) !== JSON.stringify(draft[key as keyof ReviewMetadata]));
  const localTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const fields = extraction?.fields ?? {};
  const inputCls = "mt-[3px] w-full rounded-[7px] border border-[var(--hairline)] bg-[var(--canvas)] px-[8px] py-[6px] text-body";
  const field = (key: keyof ReviewMetadata, type: "text" | "number" = "text", hint = "") => (
    <label key={key} className="block text-caption text-[var(--slate)]">
      {REVIEW_FIELD_LABEL[key] ?? key}
      <input className={inputCls} placeholder={hint}
        value={type === "number" && (draft[key] === null || draft[key] === undefined) ? "" : String(draft[key] ?? "")}
        inputMode={type === "number" ? "decimal" : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          if (type === "number" && raw !== "" && Number.isNaN(Number(raw))) return; // keep the last valid number
          edit(key, type === "number" ? (raw === "" ? null : Number(raw)) : raw);
        }}
      />
    </label>
  );
  return (
    <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px]">
      <div className="mb-[8px] flex flex-wrap items-center gap-[8px]">
        <strong className="text-body text-[var(--ink)]">基本信息核对</strong>
        {doc.confirmed_at && !touched.size ? <Pill tone="mint">已确认</Pill> : touched.size ? <Pill tone="yellow">有未保存修改</Pill> : <Pill tone="yellow">待确认</Pill>}
        {extraction?.status === "running" ? <Pill tone="sky">{extraction.stage_label || "模型正在提取"}</Pill>
          : extraction?.status === "completed" ? <Pill tone="mint">已自动整理 · 请核对</Pill>
            : extraction?.status === "partial" ? <Pill tone="yellow">部分提取成功</Pill>
              : extraction?.status ? <Pill tone="gray">未使用模型提取</Pill> : null}
        <span className="flex-1" />
        <Button size="sm" onClick={() => void onRetry()}>重新提取</Button>
        <Button size="sm" variant="primary" disabled={busy || extraction?.status === "running"} onClick={() => void save()}>{busy ? "保存中…" : "保存并确认"}</Button>
      </div>
      {error ? <Notice text={error} error /> : null}
      {extraction?.status === "running" ? <Notice text="正在自动整理基本信息，完成后才能保存；你已填写的字段会保留。" /> : null}
      {extraction?.error ? <Notice text={extraction.error} error /> : null}
      {differing.length && extraction?.status !== "running" ? <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--tint-yellow)] px-3 py-2 text-xs">
        <span className="flex-1">模型建议与当前值不同：{differing.map(([key, value]) => `${REVIEW_FIELD_LABEL[key] ?? key}=${Array.isArray(value) ? value.join("、") : String(value)}`).join("；")}</span>
        <Button size="sm" variant="ghost" onClick={() => differing.forEach(([key, value]) => edit(key as keyof ReviewMetadata, value))}>填入模型建议（需再保存）</Button>
      </div> : null}
      {(extraction?.notes ?? []).map((note, index) => <Notice key={index} text={note} />)}
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-4">
        {field("title")}
        {field("total_budget", "number")}
        {field("plan_start", "text", "YYYY-MM-DD")}
        {field("plan_end", "text", "YYYY-MM-DD")}
        <label className="block text-caption text-[var(--slate)] sm:col-span-2">申报单位名单（每行一家）
          <textarea aria-label="申报单位名单" rows={3} className={inputCls} value={(draft.organizations ?? []).join("\n")}
            onChange={(event) => edit("organizations", event.target.value.split("\n"))} />
        </label>
        {field("budget", "number")}
        {field("application_budget", "number")}
      </div>
      <details className="mt-[10px] text-caption">
        <summary className="cursor-pointer text-[var(--steel)]">更多字段（基金、类别、年度、学历等，按模板需要填写）</summary>
        <div className="mt-2 grid grid-cols-1 gap-[10px] sm:grid-cols-4">
          {field("fund")}
          {field("category")}
          {field("year", "number")}
          {field("domain")}
          {field("organization_count", "number")}
          {field("patent_count", "number")}
          {field("birth_date")}
          <label className="text-xs">负责人学历<select aria-label="负责人学历" className={inputCls} value={draft.education ?? ""} onChange={(e) => edit("education", e.target.value)}><option value="">待核对</option>{["专科", "本科", "硕士", "博士"].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="text-xs">是否包含高校<select aria-label="是否包含高校" className={inputCls} value={draft.university_present == null ? "" : String(draft.university_present)} onChange={(e) => edit("university_present", e.target.value === "" ? null : e.target.value === "true")}><option value="">待核对</option><option value="true">已核对：包含</option><option value="false">已核对：不包含</option></select></label>
          <label className="text-xs">正式申报时间<input aria-label="正式申报时间" type="datetime-local" className={inputCls} value={localTime(draft.submitted_at)} onChange={(e) => edit("submitted_at", e.target.value ? new Date(e.target.value).toISOString() : "")} /></label>
        </div>
      </details>
      {Object.keys(fields).length ? (
        <details className="mt-[10px] text-caption">
          <summary className="cursor-pointer text-[var(--steel)]">查看字段原文依据（{Object.keys(fields).length} 项）</summary>
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="mt-[8px]">
              <strong>{REVIEW_FIELD_LABEL[key] ?? key}</strong>
              {value.status === "conflict" ? <Pill tone="yellow">存在冲突</Pill>
                : value.status === "missing" ? <Pill tone="gray">未找到明确依据</Pill> : null}
              {value.candidates.map((candidate, index) => (
                <div key={index} className="mt-[4px] text-[var(--slate)]">
                  {String(candidate.value)} · 第 {candidate.page} 页 · {candidate.reason}
                  <blockquote className="mt-[2px] text-caption text-[var(--stone)]">{candidate.quote}</blockquote>
                </div>
              ))}
            </div>
          ))}
        </details>
      ) : null}
      <p className="mt-[8px] text-caption text-[var(--stone)]">
        计划日期按原文填写实际精度（如只写到月填 YYYY-MM），不能用申报或上传日期代替。审查材料不进入资料库；原文件：<button type="button" className="text-[var(--link)] hover:underline" onClick={() => showInspector({ kind: "review-source", fileId: doc.id, page: 1, title: doc.filename })}>{doc.filename}</button>
      </p>
    </div>
  );
}

type MappingSummary = { confirmed: number; total: number; dirty: boolean };

function SectionMapping({ doc, rule, onSummary }: { doc: ReviewDoc; rule: ReviewRule; onSummary: (value: MappingSummary) => void }) {
  const [state, setState] = useState<ReviewMappingState | null>(null);
  const [choices, setChoices] = useState<Record<string, { block_ids: string[]; missing: boolean }>>({});
  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const accept = (next: ReviewMappingState) => {
    const rows = Object.fromEntries(next.mappings.map((row) => [row.check_id, { block_ids: row.block_ids, missing: row.missing }]));
    setState(next); setChoices(rows); setBaseline(JSON.stringify(rows));
  };
  useEffect(() => {
    setState(null); setError("");
    void fetchReviewMappings(doc.id, rule.id).then(accept).catch((cause) => setError((cause as Error).message));
  }, [doc.id, rule.id, rule.version]);
  const dirty = JSON.stringify(choices) !== baseline;
  const confirmed = state?.mappings.filter((row) => row.status === "confirmed").length ?? 0;
  useEffect(() => onSummary({ confirmed, total: state?.mappings.length ?? 0, dirty }), [confirmed, state, dirty]);
  if (error) return <Notice text={error} error />;
  if (!state) return <p className="text-sm text-[var(--steel)]">正在识别章节…</p>;
  if (!state.mappings.length) return <p className="text-sm text-[var(--steel)]">本模板没有需要按章节定位的条目。</p>;
  const index = new Map(state.blocks.map((block, i) => [block.id, i]));
  const label = (id: string) => {
    const block = state.blocks[index.get(id) ?? 0];
    return `第 ${block.page} ${doc.kind === "pdf" ? "页" : "块"} · ${block.level ? "【标题】" : ""}${block.text.slice(0, 26)}${block.image ? " · 含图片" : ""}`;
  };
  const range = (from: string, to: string) => {
    const a = index.get(from) ?? 0; const b = index.get(to) ?? a;
    return state.blocks.slice(Math.min(a, b), Math.max(a, b) + 1).map((block) => block.id);
  };

  async function save() {
    if (!state) return;
    setBusy(true); setError("");
    try {
      accept(await saveReviewMappings(doc.id, { rule_id: state.rule_id, rule_version: state.rule_version, revision: state.revision,
        mappings: Object.entries(choices).map(([check_id, value]) => ({ check_id, ...value })) }));
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {state.mappings.map((row) => {
        const choice = choices[row.check_id] ?? { block_ids: [], missing: false };
        const changed = JSON.stringify(choice) !== JSON.stringify({ block_ids: row.block_ids, missing: row.missing });
        const selected = row.selected;
        return (
          <div key={row.check_id} className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3 text-body">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-body">{row.section}</strong>
              <span className="text-[var(--stone)]">→</span>
              <span className="min-w-0 flex-1 truncate text-[var(--slate)]">{choice.missing ? "确认缺少该章节" : choice.block_ids.length ? `${label(choice.block_ids[0])} 起，共 ${choice.block_ids.length} 块` : "未定位"}</span>
              <Pill tone={changed ? "yellow" : row.status === "confirmed" ? "mint" : row.status === "found" ? "sky" : row.status === "ambiguous" ? "peach" : "gray"}>
                {changed ? "未保存" : { confirmed: "已确认", found: "自动识别 · 待确认", ambiguous: `同名 ${row.candidates?.length ?? 0} 处 · 需选择`, not_found: "未找到" }[row.status]}
              </Pill>
            </div>
            {(row.candidates?.length ?? 0) > 1 ? (
              <fieldset className="mt-2 flex flex-wrap gap-2">
                <legend className="sr-only">选择{row.section}的正确位置</legend>
                {row.candidates!.map((candidate, i) => (
                  <label key={i} className="flex items-center gap-1 rounded-lg border border-[var(--hairline)] px-2 py-1">
                    <input type="radio" name={"cand-" + row.check_id} checked={!choice.missing && JSON.stringify(choice.block_ids) === JSON.stringify(candidate.block_ids)}
                      onChange={() => setChoices({ ...choices, [row.check_id]: { block_ids: candidate.block_ids, missing: false } })} />
                    第 {i + 1} 处 · {doc.kind === "pdf" ? "页" : "块"} {candidate.pages[0]}–{candidate.pages[candidate.pages.length - 1]} · {candidate.count} 字符
                  </label>
                ))}
              </fieldset>
            ) : null}
            <details className="mt-2">
              <summary className="cursor-pointer text-[var(--link)]">调整范围或标记缺失</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs">起始文本块
                  <select aria-label={row.section + "起始文本块"} className="mt-1 block w-full rounded border border-[var(--hairline)] p-1" value={choice.block_ids[0] ?? ""}
                    onChange={(e) => setChoices({ ...choices, [row.check_id]: { block_ids: e.target.value ? range(e.target.value, choice.block_ids[choice.block_ids.length - 1] ?? e.target.value) : [], missing: false } })}>
                    <option value="">未选择</option>
                    {state.blocks.map((block) => <option key={block.id} value={block.id}>{label(block.id)}</option>)}
                  </select>
                </label>
                <label className="text-xs">结束文本块（含）
                  <select aria-label={row.section + "结束文本块"} className="mt-1 block w-full rounded border border-[var(--hairline)] p-1" value={choice.block_ids[choice.block_ids.length - 1] ?? ""}
                    disabled={!choice.block_ids.length}
                    onChange={(e) => setChoices({ ...choices, [row.check_id]: { block_ids: range(choice.block_ids[0], e.target.value), missing: false } })}>
                    {state.blocks.map((block) => <option key={block.id} value={block.id}>{label(block.id)}</option>)}
                  </select>
                </label>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={choice.missing}
                onChange={(e) => setChoices({ ...choices, [row.check_id]: { block_ids: [], missing: e.target.checked } })} />已核对全文标题，确认申请书缺少该章节</label>
            </details>
            {selected && !changed ? (
              <div className="mt-2 rounded-lg bg-[var(--surface)] p-2 text-xs leading-5">
                <span className="font-semibold">计入 {selected.count} 字符</span> · {doc.kind === "pdf" ? "页" : "块"} {selected.pages.join("、")}
                {selected.unread_images ? <span className="ml-2 text-[var(--orange-fg)]">含 {selected.unread_images} 处未读取图片，覆盖不足</span> : null}
                <p className="mt-1 line-clamp-2 text-[var(--steel)]">{selected.text}</p>
              </div>
            ) : changed ? <p className="mt-2 text-xs text-[var(--steel)]">保存后按新范围重新计数。</p> : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={dirty || confirmed < state.mappings.length ? "primary" : "outline"} disabled={busy || (!dirty && confirmed === state.mappings.length)}
          onClick={() => void save()}>{busy ? "保存中…" : "确认并保存章节对应"}</Button>
        <span className="text-xs text-[var(--stone)]">唯一且完整读取的章节会自动核对；有歧义时可在这里确认范围。{state.saved_at ? `上次保存 ${localTime(state.saved_at)}` : ""}</span>
      </div>
    </div>
  );
}

/** One step of the review: a label and its current value; details open on click (query 2026-1013 1133). */
function StepTile({ step, label, value, open, onClick, onDrop }: {
  step: number; label: string; value: string; open: boolean; onClick: () => void; onDrop?: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  return <button type="button" onClick={onClick} aria-expanded={open}
    onDragOver={onDrop ? (e) => { e.preventDefault(); setOver(true); } : undefined} onDragLeave={onDrop ? () => setOver(false) : undefined}
    onDrop={onDrop ? (e) => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files[0]; if (file) onDrop(file); } : undefined}
    className={`flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-left hover:border-[var(--primary)] ${open || over ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--surface)]"}`}>
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">{step}</span>
    <span className="min-w-0 flex-1"><span className="block text-caption text-[var(--steel)]">{label}</span>
      <span className="block truncate text-body font-semibold text-[var(--ink)]">{value}</span></span>
    <span className="text-xs text-[var(--steel)]">{open ? "▴" : "▾"}</span>
  </button>;
}

/** The newest task of this kind, so a finished report is one click away; all records stay folded. */
function LatestRun({ runs }: { runs: ReviewRun[] }) {
  const latest = runs[0];
  if (!latest) return null;
  const title = latest.document?.metadata?.title || latest.document?.filename || "申请书";
  const active = runs.filter((run) => run.status === "queued" || run.status === "running").length;
  return <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] px-4 py-3 text-body">
    <Link to={`/review/runs/${latest.id}`} className="flex flex-wrap items-center gap-2 hover:text-[var(--link)]">
      <Pill tone={latest.status === "completed" ? "mint" : latest.status === "failed" ? "rose" : "sky"}>
        {latest.status === "completed" ? "审查完成" : latest.status === "failed" ? "未完成" : REVIEW_STATUS_LABEL[latest.status] ?? "审查中"}</Pill>
      <b className="min-w-0 flex-1 truncate">{title}</b>
      <span className="text-xs text-[var(--link)]">{latest.status === "completed" ? "打开报告 →" : latest.status === "failed" ? "查看原因 →" : latest.stage_label}</span>
    </Link>
    {["queued", "running"].includes(latest.status) ? <GenerationProgress compact status={latest.status} stage={latest.stage} stage_label={latest.stage_label} kind={latest.request.kind} /> : null}
    {active ? <p className="mt-1 text-xs text-[var(--steel)]">共 {active} 项在排队或审查中，可离开本页，完成后从这里或左侧审核任务打开。</p> : null}
  </div>;
}

const CARD_TEXT: Record<ReviewKind, { label: string; lead: string; note: string }> = {
  formal: { label: "形式审查模板", lead: "按所选要求检查申请书的章节完整性、字数、金额、日期和文字规范，定位需要修改或核对的位置。",
    note: "错别字提供校对建议；字体、版式等仅对已支持的格式检查，不把无法读取当成通过。" },
  professional: { label: "专业审查模板", lead: "围绕研究目标与技术方案，评议合理性、开展必要性、可行性和论证充分性；结合所选资料比较已有工作，给出有依据的修改建议。",
    note: "需选择一个对照资料库，默认取其中最相近的 3 篇报告全文作为参考；检索未命中不等于原创。" },
};

export function ReviewWorkbench() {
  const { kind } = useParams();
  const reviewKind: ReviewKind = kind === "professional" ? "professional" : "formal";
  const { corpora, corpusIds, showInspector } = useApp();
  const [search, setSearch] = useSearchParams();
  const sheetId = search.get("sheet") ?? "";
  const [health, setHealth] = useState<ReviewHealth | null>(null);
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [docs, setDocs] = useState<ReviewDoc[]>([]);
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [evidence, setEvidence] = useState<ReviewEvidence[]>([]);
  const [doc, setDoc] = useState<ReviewDoc | null>(null);
  const [panel, setPanel] = useState<"" | "template" | "upload">("");
  const [library, setLibrary] = useState("");
  const [references, setReferences] = useState(3);
  const [literature, setLiterature] = useState<string[]>([]);
  const [mode, setMode] = useState<"historical" | "update">("update");
  const [cutoff, setCutoff] = useState("");
  const [mapping, setMapping] = useState<MappingSummary>({ confirmed: 0, total: 0, dirty: false });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const poller = useRef<number | null>(null);

  const reload = async () => {
    const [nextRules, nextDocs, nextRuns] = await Promise.all([fetchReviewRules(), fetchReviewDocuments(), fetchReviewRuns()]);
    setRules(nextRules); setDocs(nextDocs); setRuns(nextRuns);
  };
  useEffect(() => {
    void fetchReviewHealth().then(setHealth).catch((cause) => setError((cause as Error).message));
    void reload().catch((cause) => setError((cause as Error).message));
    void fetchReviewEvidence().then(setEvidence).catch(() => undefined);
  }, []);
  useEffect(() => () => { if (poller.current) window.clearInterval(poller.current); }, []);
  useEffect(() => {
    const ident = search.get("proposal");
    if (!ident || doc?.id === ident) return;
    let active = true;
    void fetchReviewDocument(ident).then((value) => { if (active) setDoc(value); }, (cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [search.get("proposal")]);
  // Coming back restores what the address does not name: “使用此版本” returns with only ?template=,
  // and the proposal already uploaded must stay chosen.
  useEffect(() => {
    const previous = new URLSearchParams(sessionStorage.getItem("review-workbench:" + reviewKind) ?? "");
    const missing = [...previous].filter(([key]) => !search.has(key));
    if (missing.length) setSearch((old) => { const next = new URLSearchParams(old); for (const [key, value] of missing) next.set(key, value); return next; }, { replace: true });
  }, [reviewKind]);
  useEffect(() => {
    if (search.size) sessionStorage.setItem("review-workbench:" + reviewKind, search.toString());
  }, [reviewKind, search]);
  // Poll only while a review is queued or running (节点审查 C1); returning to the page refreshes once.
  const reviewing = runs.some((run) => run.status === "queued" || run.status === "running");
  useEffect(() => {
    let active = true;
    const refresh = () => { void fetchReviewRuns().then((value) => { if (active) setRuns(value); }).catch((cause) => { if (active) setError(cause.message); }); };
    const timer = reviewing ? window.setInterval(refresh, 2500) : undefined;
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [reviewing]);
  const sheet = docs.find((item) => item.id === sheetId) ?? null;

  function remember(key: string, value: string) {
    setSearch((old) => { const next = new URLSearchParams(old); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  }

  const usable = rules.filter((rule) => rule.kind === reviewKind && !rule.archived);
  const template = usable.find((rule) => rule.id === search.get("template") && rule.confirmed)
    ?? usable.find((rule) => rule.id === "builtin-" + reviewKind && rule.confirmed) ?? usable.find((rule) => rule.confirmed) ?? null;
  const enabled = template?.checks.filter((check) => check.enabled) ?? [];

  const watchExtraction = (id: string) => {
    if (poller.current) window.clearInterval(poller.current);
    poller.current = window.setInterval(async () => {
      try {
        const next = await fetchReviewDocument(id);
        setDoc(next);
        if (next.metadata_extraction?.status === "running") return;
        if (poller.current) window.clearInterval(poller.current);
        setNotice(next.metadata_extraction?.status === "completed" ? "已自动整理基本信息，请核对后保存。" : next.metadata_extraction?.error || "自动整理未完成，可重试或手工填写。");
        void reload();
      } catch (cause) {
        if (poller.current) window.clearInterval(poller.current);
        setError((cause as Error).message);
      }
    }, 1500);
  };

  async function upload(file: File) {
    setBusy("读取申请书"); setError(""); setNotice("");
    try {
      const next = await uploadReviewDocument(file);
      setDoc(next); remember("proposal", next.id);
      if (next.metadata_extraction?.status === "running") watchExtraction(next.id);
      void reload();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  const proposals = docs.filter((item) => item.id !== sheetId);
  const available = corpora.filter((item) => !item.missing);
  // Default: the library the conversation currently uses, else the first one; always shown and changeable.
  const chosenLibrary = available.some((item) => item.id === library) ? library
    : available.find((item) => corpusIds.includes(item.id))?.id ?? available[0]?.id ?? "";
  const blockers = [
    !health?.model_configured ? "审查模型未配置" : "",
    !template ? "没有可用的已启用模板" : "",
    !doc ? "尚未上传申请书" : "",
    mapping.dirty ? "章节对应有未保存修改" : "",
    reviewKind === "professional" && mode === "historical" && !cutoff ? "历史评价需填写评价时点" : "",
    reviewKind === "professional" && !chosenLibrary ? "请选择对照资料库" : "",
  ].filter(Boolean);

  async function start() {
    if (!doc || !template) return;
    setBusy("创建审核任务"); setError("");
    try {
      const run = await createReviewRun({ document_id: doc.id, kind: reviewKind, rule_id: template.id, rule_version: template.version,
        information_sheet_id: sheetId || undefined, mode: reviewKind === "professional" ? mode : "update",
        cutoff_date: reviewKind === "professional" && mode === "historical" ? cutoff : undefined,
        corpus_ids: reviewKind === "professional" ? [chosenLibrary] : [], reference_count: references,
        evidence_ids: reviewKind === "professional" ? literature : [] });
      setRuns((old) => [run, ...old.filter((item) => item.id !== run.id)]);
      setNotice("已开始审查，可离开本页处理其他工作；完成后在下方打开报告。");
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  const text = CARD_TEXT[reviewKind];
  const back = encodeURIComponent(search.toString());
  return (
    <Shell title={REVIEW_KIND_LABEL[reviewKind]}>
      <Notice text={error} error />
      <Notice text={notice} />
      {health && !health.model_configured ? <Notice text="审查模型未配置：请先配置 MODEL_API_KEY（或 REVIEW_MODEL_*），未配置时不能发起审查。" error /> : null}
      {health?.model_connection === "failed" ? <div className="mb-3 flex flex-wrap items-center gap-2"><Notice text="最近一次模型连接测试失败，请检查密钥与接口地址。" error />
        <Button size="sm" variant="ghost" onClick={() => void testReviewModel().then(() => { setNotice("模型连接及 JSON 输出测试成功。"); void fetchReviewHealth().then(setHealth); })
          .catch((cause) => setError((cause as Error).message))}>重新测试</Button></div> : null}

      {/* query 2026-1013 1133: three steps, details hidden until clicked. */}
      <div className="grid items-center gap-3 md:grid-cols-[1fr_1fr_auto]">
        <StepTile step={1} label={text.label} open={panel === "template"}
          value={template ? `${template.name} · v${template.version}` : "尚无可用模板"}
          onClick={() => { setPanel(panel === "template" ? "" : "template"); if (template && panel !== "template") showInspector({ kind: "review-template", templateId: template.id }); }} />
        <StepTile step={2} label="申请书" open={panel === "upload"} value={busy === "读取申请书" ? "读取中…" : doc ? doc.filename : "上传申请书"}
          onClick={() => { if (!doc && !busy) fileInput.current?.click(); else setPanel(panel === "upload" ? "" : "upload"); }}
          onDrop={(file) => void upload(file)} />
        <Button variant="primary" size="md" disabled={Boolean(blockers.length) || Boolean(busy)} onClick={() => void start()}
          title={blockers.length ? "尚需：" + blockers.join("；") : undefined}>
          {busy === "创建审核任务" ? "提交中…" : "开始审查"}
        </Button>
      </div>
      <input ref={fileInput} aria-label="上传申请书文件" type="file" accept={ACCEPT} className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
      {blockers.length && doc ? <p className="mt-2 text-caption text-[var(--stone)]">尚需：{blockers.join("；")}</p> : null}

      {panel === "template" ? (
        <div className="mt-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 text-body leading-6 text-[var(--slate)]">
          <p>{text.lead}</p>
          {template ? <p className="mt-1">本次启用 <b>{enabled.length}</b> 项：{enabled.slice(0, 6).map((c) => c.title).join("、")}{enabled.length > 6 ? "…" : ""}</p> : null}
          <p className="mt-1 text-caption text-[var(--steel)]">{text.note} 完整条款已在右侧预览。</p>
          <p className="mt-3 text-xs font-semibold text-[var(--steel)]">更换模板</p>
          <div className="mt-1">{usable.map((rule) => (
            <button key={rule.id} type="button" disabled={!rule.confirmed} onClick={() => { remember("template", rule.id); showInspector({ kind: "review-template", templateId: rule.id }); }}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-body disabled:opacity-50 ${rule.id === template?.id ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--canvas)]"}`}>
              <span className="min-w-0 flex-1 truncate">{rule.name} · v{rule.version}</span>
              <Pill tone="gray">{REVIEW_SOURCE_LABEL[rule.source_kind ?? "manual"]}</Pill>
              {!rule.confirmed ? <Pill tone="yellow">草稿</Pill> : null}
            </button>))}</div>
          <div className="mt-2 flex flex-wrap gap-3 border-t border-[var(--hairline)] pt-2">
            {template ? <Link className="text-xs text-[var(--link)]" to={`/review/templates/new?from=${encodeURIComponent(template.id)}&back=${back}`}>复制当前模板编辑</Link> : null}
            <Link className="text-xs text-[var(--link)]" to="/review/templates">新建或上传模板</Link>
          </div>
        </div>
      ) : null}
      {panel === "upload" ? (
        <div className="mt-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 text-body leading-6 text-[var(--slate)]">
          {doc ? <>
            <p>{doc.kind.toUpperCase()} · {doc.page_count} {doc.kind === "pdf" ? "页" : "个文本块"} · {doc.confirmed_at ? "基本信息已确认" : "基本信息待核对"}</p>
            {doc.warnings?.length ? <p className="text-caption text-[var(--warn-fg)]">{doc.warnings[0]}</p> : null}
          </> : null}
          <p className="text-caption text-[var(--steel)]">PDF / DOC / DOCX / Markdown / TXT，≤30MB；扫描件不做 OCR。可把文件拖到“申请书”上。</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>{doc ? "上传新版本" : "上传申请书"}</Button>
            {doc ? <button type="button" className="text-xs text-[var(--link)] hover:underline" onClick={() => showInspector({ kind: "review-source", fileId: doc.id, page: 1, title: doc.filename })}>查看原文</button> : null}
            {proposals.length ? <select aria-label="选择已上传申请书" className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-1.5 text-xs" value={doc?.id ?? ""}
              onChange={(e) => { const next = docs.find((item) => item.id === e.target.value); if (next) { setDoc(next); remember("proposal", next.id); } }}>
              <option value="">选择已上传的申请书</option>
              {proposals.map((item) => <option key={item.id} value={item.id}>{item.metadata.title || item.filename} · {item.created_at?.slice(0, 10)}</option>)}
            </select> : null}
          </div>
        </div>
      ) : null}
      <LatestRun runs={runs.filter((run) => (run.request?.kind ?? "formal") === reviewKind)} />
      {doc ? (
        <details aria-label="准备核对" className="mt-4 space-y-4 rounded-xl border border-[var(--hairline)] p-4">
          <summary className="cursor-pointer text-sm font-medium">补充信息与高级选项（可选）</summary>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-body">
            <strong className="mr-2">准备核对</strong>
            <Pill tone={template ? "mint" : "rose"}>{template ? "模板已保存" : "缺少模板"}</Pill>
            <Pill tone="mint">正文可读 · {doc.page_count} {doc.kind === "pdf" ? "页" : "块"}</Pill>
            <Pill tone={doc.confirmed_at ? "mint" : "yellow"}>{doc.confirmed_at ? "基本信息已确认" : "待核对字段"}</Pill>
            {reviewKind === "formal" ? <Pill tone={mapping.total && mapping.confirmed === mapping.total ? "mint" : "yellow"}>章节对应 {mapping.confirmed}/{mapping.total} 已确认</Pill> : null}
            <Pill tone={sheet ? "mint" : "gray"}>{sheet ? "信息表：" + sheet.filename : "信息表：未提供（可选）"}</Pill>
          </div>
          <MetadataFields doc={doc}
            onSave={async (meta) => {
              const updated = await patchReviewDocument(doc.id, meta);
              setDoc(updated); setDocs((old) => old.map((item) => item.id === updated.id ? updated : item)); setNotice("基本信息已保存。");
            }}
            onRetry={async () => {
              try { const next = await reextractReviewDocument(doc.id); setDoc(next); if (next.metadata_extraction?.status === "running") watchExtraction(next.id); }
              catch (cause) { setError((cause as Error).message); }
            }} />
          {reviewKind === "formal" && template ? (
            <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px]">
              <strong className="text-body">章节对应核对</strong>
              <p className="mb-3 mt-1 text-xs text-[var(--steel)]">模板中的章节名称定义检查对象；这里确认本申请书中实际参与计数的内容。可选择重复标题的正确位置、调整起止文本块，或确认缺少该章节。</p>
              <SectionMapping doc={doc} rule={template} onSummary={setMapping} />
            </div>
          ) : null}
          {reviewKind === "professional" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-body">
                <strong className="text-body">对照资料库</strong>
                <p className="mt-1 text-xs text-[var(--steel)]">选择一个子资料库，系统从中检索与申请书最相近的报告，读取全文作为对比参考。</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select aria-label="对照资料库" className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-2" value={chosenLibrary} onChange={(e) => setLibrary(e.target.value)}>
                    {available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <label className="text-xs">参考报告
                    <select aria-label="参考报告篇数" className="ml-2 rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-2" value={references} onChange={(e) => setReferences(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 篇{n === 3 ? "（默认）" : ""}</option>)}
                    </select></label>
                </div>
                <p className="mt-3 font-semibold">附加文献（{literature.length} 已选）</p>
                {!evidence.length ? <p className="text-xs text-[var(--stone)]">技术证据库为空。</p> : null}
                <div className="mt-1 max-h-[140px] space-y-1 overflow-y-auto">
                  {evidence.map((item) => (
                    <label key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={literature.includes(item.id)}
                      onChange={(e) => setLiterature(e.target.checked ? [...literature, item.id] : literature.filter((id) => id !== item.id))} />
                      <span className="min-w-0 truncate">{item.title} · {item.published || "日期不明"}</span></label>
                  ))}
                </div>

              </div>
              <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-body">
                <strong className="text-body">评价方式</strong>
                <label className="mt-2 flex items-start gap-2"><input type="radio" checked={mode === "update"} onChange={() => setMode("update")} /><span>更新建议（默认）：面向修改与下次申报，使用今天之前的已选材料。</span></label>
                <label className="mt-2 flex items-start gap-2"><input type="radio" checked={mode === "historical"} onChange={() => setMode("historical")} /><span>历史评价：按指定评价时点，只采用日期明确且不晚于该时点的材料。</span></label>
                {mode === "historical" ? <label className="mt-2 block text-xs">评价时点<input aria-label="评价时点" type="date" className="ml-2 rounded border border-[var(--hairline)] p-1" value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></label> : null}
              </div>
            </div>
          ) : null}
          <details className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px]">
            <summary className="cursor-pointer text-body font-semibold">补充信息表（可选）</summary>
            <p className="my-2 text-xs text-[var(--steel)]">信息表与正文分别保存；两处事实冲突时并列展示，不固定只信其一。</p>
            <select aria-label="选择申报信息表" className="mr-3 rounded border p-2 text-xs" value={sheetId} onChange={(e) => remember("sheet", e.target.value)}>
              <option value="">尚未提供</option>{docs.filter((item) => item.id !== doc.id).map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}
            </select>
            <input aria-label="上传申报信息表" type="file" accept={ACCEPT} disabled={Boolean(busy)} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return; setBusy("读取信息表");
              void uploadReviewDocument(file).then(async (next) => { remember("sheet", next.id); await reload(); })
                .catch((cause) => setError(cause.message)).finally(() => setBusy(""));
            }} />
            {sheet ? <div className="mt-3"><MetadataFields doc={sheet}
              onSave={async (meta) => { const updated = await patchReviewDocument(sheet.id, meta); setDocs((old) => old.map((item) => item.id === updated.id ? updated : item)); }}
              onRetry={async () => { await reextractReviewDocument(sheet.id); await reload(); }} /></div> : null}
          </details>
        </details>
      ) : null}


      <RunList runs={runs.filter((run) => (run.request?.kind ?? "formal") === reviewKind)} />
    </Shell>
  );
}

function RunList({ runs }: { runs: ReviewRun[] }) {
  if (!runs.length) return null;
  return (
    <details id="records" className="mt-[18px]">
      <summary className="cursor-pointer text-body text-[var(--steel)]">审查记录 · {runs.length} 份</summary>
      <div className="mt-[8px] grid gap-[8px]">
        {runs.map((run) => (
          <Link key={run.id} to={`/review/runs/${run.id}`}
            className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-caption hover:border-[var(--primary)]">
            <span className="block text-body font-semibold text-[var(--ink)]">{run.document?.metadata?.title || run.document?.filename || "未命名申请书"}</span>
            <span className="mt-[3px] block text-[var(--steel)]">
              {REVIEW_STATUS_LABEL[run.status] ?? run.status} · {run.rule?.name ?? "模板"} v{run.rule?.version ?? "-"}
              {run.levels ? ` · 修改建议 高 ${run.levels.high} / 中 ${run.levels.medium} / 低 ${run.levels.low} · 待核实 ${run.levels.pending}` : ""} · {run.created_at?.slice(0, 10)}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

function localTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function fetchReviewDocument(id: string): Promise<ReviewDoc> {
  const response = await fetch(`/api/review/documents/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("申请书状态读取失败");
  return (await response.json()) as ReviewDoc;
}

