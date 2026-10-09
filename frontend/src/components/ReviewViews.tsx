import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  addReviewEvidence, createReviewRun, fetchReviewDocuments, fetchReviewEvidence, fetchReviewHealth,
  fetchReviewMappings, fetchReviewRules, fetchReviewRun, fetchReviewRuns, patchReviewDocument, reextractReviewDocument,
  reviewDocumentFileUrl, reviewExportUrl, saveReviewMappings, searchReviewEvidence,
  testReviewModel, uploadReviewDocument,
  REVIEW_EVIDENCE_NEED_LABEL, REVIEW_FIELD_LABEL, REVIEW_KIND_LABEL, REVIEW_SOURCE_LABEL, REVIEW_STATUS_LABEL,
  type ReviewCard, type ReviewDoc, type ReviewEvidence, type ReviewFinding, type ReviewHealth, type ReviewKind,
  type ReviewMappingState, type ReviewMetadata, type ReviewRule, type ReviewRun,
} from "../reviewApi";
import { useApp } from "../store";
import { Button, Pill, type Tone } from "./ui";
import { Icon } from "./Icons";

const TABS: { to: string; label: string; keep?: boolean }[] = [
  { to: "/review/formal", label: "形式审查", keep: true },
  { to: "/review/professional", label: "专业审查", keep: true },
  { to: "/review/templates", label: "审查模板" },
  { to: "/review/evidence", label: "技术证据库" },
];
const ACCEPT = ".pdf,.doc,.docx,.md,.txt";
const STATUS_TONE: Record<string, Tone> = { issue: "rose", warning: "peach", pending: "yellow", pass: "mint", advisory: "sky", na: "gray" };

export function ReviewPageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  // Materials travel between the two task entries; templates are per task type and do not.
  const materials = new URLSearchParams([...search].filter(([key]) => key === "proposal" || key === "sheet")).toString();
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-[10px] border-b border-[var(--hairline)] py-2 pr-[14px] pl-[18px]">
        <span className="text-[14px] font-semibold text-[var(--ink)]">资料审查</span>
        <span className="flex-1" />
        {TABS.map((tab) => (
          <Link key={tab.to} to={tab.keep && materials ? tab.to + "?" + materials : tab.to} aria-current={pathname.startsWith(tab.to) ? "page" : undefined}
            className={`rounded-[7px] px-[11px] py-[6px] text-[12px] hover:bg-[var(--surface)] ${pathname.startsWith(tab.to) ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-pressed)]" : "text-[var(--steel)]"}`}>
            {tab.label}
          </Link>
        ))}
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1080px] px-4 pt-[26px] sm:px-[34px]">
          <h1 className="mb-[6px] text-[26px] font-semibold tracking-[-0.6px] text-[var(--ink)]">{title}</h1>
          <p className="max-w-[720px] text-[13.5px] leading-[1.6] text-[var(--steel)]">{description}</p>
        </div>
        <div className="mx-auto w-full max-w-[1080px] px-4 pt-[22px] pb-[40px] sm:px-[34px]">{children}</div>
      </div>
    </section>
  );
}
const Shell = ReviewPageShell;

export function ReviewShell() {
  return <Outlet />;
}

export function ReviewNotice({ text, error }: { text: string; error?: boolean }) {
  if (!text) return null;
  return <p role={error ? "alert" : "status"} className={`mb-[10px] text-[12.5px] ${error ? "text-[var(--red)]" : "text-[var(--steel)]"}`}>{text}</p>;
}
const Notice = ReviewNotice;

function MetadataFields({ doc, onSave, onRetry }: {
  doc: ReviewDoc;
  onSave: (meta: Partial<ReviewMetadata>) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
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
  const inputCls = "mt-[3px] w-full rounded-[7px] border border-[var(--hairline)] bg-[var(--canvas)] px-[8px] py-[6px] text-[12.5px]";
  const field = (key: keyof ReviewMetadata, type: "text" | "number" = "text", hint = "") => (
    <label key={key} className="block text-[12px] text-[var(--slate)]">
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
        <strong className="text-[13.5px] text-[var(--ink)]">基本信息核对</strong>
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
        <label className="block text-[12px] text-[var(--slate)] sm:col-span-2">申报单位名单（每行一家）
          <textarea aria-label="申报单位名单" rows={3} className={inputCls} value={(draft.organizations ?? []).join("\n")}
            onChange={(event) => edit("organizations", event.target.value.split("\n"))} />
        </label>
        {field("budget", "number")}
        {field("application_budget", "number")}
      </div>
      <details className="mt-[10px] text-[12px]">
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
        <details className="mt-[10px] text-[12px]">
          <summary className="cursor-pointer text-[var(--steel)]">查看字段原文依据（{Object.keys(fields).length} 项）</summary>
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="mt-[8px]">
              <strong>{REVIEW_FIELD_LABEL[key] ?? key}</strong>
              {value.status === "conflict" ? <Pill tone="yellow">存在冲突</Pill>
                : value.status === "missing" ? <Pill tone="gray">未找到明确依据</Pill> : null}
              {value.candidates.map((candidate, index) => (
                <div key={index} className="mt-[4px] text-[var(--slate)]">
                  {String(candidate.value)} · 第 {candidate.page} 页 · {candidate.reason}
                  <blockquote className="mt-[2px] text-[11.5px] text-[var(--stone)]">{candidate.quote}</blockquote>
                </div>
              ))}
            </div>
          ))}
        </details>
      ) : null}
      <p className="mt-[8px] text-[11.5px] text-[var(--stone)]">
        计划日期按原文填写实际精度（如只写到月填 YYYY-MM），不能用申报或上传日期代替。审查材料不进入资料库；原文件：<a className="text-[var(--link)]" href={reviewDocumentFileUrl(doc.id)} target="_blank" rel="noreferrer">{doc.filename}</a>
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
          <div key={row.check_id} className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[13px]">{row.section}</strong>
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
                {selected.unread_images ? <span className="ml-2 text-[#8a3d00]">含 {selected.unread_images} 处未读取图片，覆盖不足</span> : null}
                <p className="mt-1 line-clamp-2 text-[var(--steel)]">{selected.text}</p>
              </div>
            ) : changed ? <p className="mt-2 text-xs text-[var(--steel)]">保存后按新范围重新计数。</p> : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={dirty || confirmed < state.mappings.length ? "primary" : "outline"} disabled={busy || (!dirty && confirmed === state.mappings.length)}
          onClick={() => void save()}>{busy ? "保存中…" : "确认并保存章节对应"}</Button>
        <span className="text-xs text-[var(--stone)]">只有保存确认的范围才能判定通过或超限；未确认的章节会列为待核实。{state.saved_at ? `上次保存 ${localTime(state.saved_at)}` : ""}</span>
      </div>
    </div>
  );
}

function TaskCard({ tone, label, title, children, actions, onOpen }: {
  tone: "lav" | "sky"; label: string; title: ReactNode; children: ReactNode; actions: ReactNode; onOpen?: () => void;
}) {
  const accent = tone === "lav" ? "border-[#cfc6f5] bg-[var(--tint-lavender)]" : "border-[#b9d7f2] bg-[var(--tint-sky)]";
  return (
    <section aria-label={label} className={`flex min-h-[200px] flex-col rounded-2xl border p-5 ${accent}`}>
      <div className="flex items-center gap-2">
        <Icon name={tone === "lav" ? "checklist" : "upload"} size={16} />
        <span className="text-[12px] font-semibold tracking-wide text-[var(--slate)]">{label}</span>
      </div>
      {onOpen ? <button type="button" onClick={onOpen} className="mt-2 text-left text-[17px] font-semibold text-[var(--ink)] hover:underline focus-visible:outline-2">{title}</button>
        : <div className="mt-2 text-[17px] font-semibold text-[var(--ink)]">{title}</div>}
      <div className="mt-2 flex-1 text-[12.5px] leading-6 text-[var(--slate)]">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}

const CARD_TEXT: Record<ReviewKind, { label: string; lead: string; note: string }> = {
  formal: { label: "形式审查模板", lead: "按所选要求检查申请书的章节完整性、字数、金额、日期和文字规范，定位需要修改或核对的位置。",
    note: "错别字提供校对建议；字体、版式等仅对已支持的格式检查，不把无法读取当成通过。" },
  professional: { label: "专业审查模板", lead: "围绕研究目标与技术方案，评议合理性、开展必要性、可行性和论证充分性；结合所选资料比较已有工作，给出有依据的修改建议。",
    note: "需选择一个对照资料库，默认取其中最相近的 3 篇报告全文作为参考；检索未命中不等于原创。" },
};

export function ReviewWorkbench() {
  const navigate = useNavigate();
  const { kind } = useParams();
  const reviewKind: ReviewKind = kind === "professional" ? "professional" : "formal";
  const { corpora, corpusIds } = useApp();
  const [search, setSearch] = useSearchParams();
  const sheetId = search.get("sheet") ?? "";
  const [health, setHealth] = useState<ReviewHealth | null>(null);
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [docs, setDocs] = useState<ReviewDoc[]>([]);
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [evidence, setEvidence] = useState<ReviewEvidence[]>([]);
  const [doc, setDoc] = useState<ReviewDoc | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [library, setLibrary] = useState("");
  const [references, setReferences] = useState(3);
  const [literature, setLiterature] = useState<string[]>([]);
  const [mode, setMode] = useState<"historical" | "update">("update");
  const [cutoff, setCutoff] = useState("");
  const [mapping, setMapping] = useState<MappingSummary>({ confirmed: 0, total: 0, dirty: false });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
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
      setDoc(next); remember("proposal", next.id); setPicking(false);
      if (next.metadata_extraction?.status === "running") watchExtraction(next.id);
      void reload();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  const proposals = docs.filter((item) => item.id !== sheetId);
  const available = corpora.filter((item) => !item.missing);
  // Default: the library the conversation currently uses, else the first one; always shown and changeable.
  const chosenLibrary = available.some((item) => item.id === library) ? library
    : available.find((item) => corpusIds.includes(item.id))?.id ?? available[0]?.id ?? "";
  const extracting = doc?.metadata_extraction?.status === "running" || sheet?.metadata_extraction?.status === "running";
  const blockers = [
    !health?.model_configured ? "审查模型未配置" : "",
    !template ? "没有可用的已启用模板" : "",
    !doc ? "尚未上传申请书" : "",
    doc && !doc.metadata.title.trim() ? "请确认项目名称" : "",
    extracting ? "基本信息仍在整理" : "",
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
      void navigate(`/review/runs/${run.id}`);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  const text = CARD_TEXT[reviewKind];
  const back = encodeURIComponent(search.toString());
  return (
    <Shell title={REVIEW_KIND_LABEL[reviewKind]} description={reviewKind === "formal"
      ? "选择模板、上传申请书、核对准备信息后开始审查。结果说明是否符合本模板的要求，并定位到原文。"
      : "选择评价问题模板与对照资料，审查技术正文的合理性、必要性、可行性与论证充分性。"}>
      <Notice text={error} error />
      <Notice text={notice} />
      {health && !health.model_configured ? <Notice text="审查模型未配置：请先配置 MODEL_API_KEY（或 REVIEW_MODEL_*），未配置时不能发起审查。" error /> : null}
      {health?.model_connection === "failed" ? <Notice text="最近一次模型连接测试失败，请检查密钥与接口地址。" error /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <TaskCard tone="lav" label={text.label} onOpen={template ? () => void navigate(`/review/templates/${encodeURIComponent(template.id)}?back=${back}`) : undefined}
          title={template ? <>{template.name} <span className="text-[13px] font-normal text-[var(--steel)]">· v{template.version}</span></> : "尚无可用模板"}
          actions={<>
            {template ? <Button onClick={() => void navigate(`/review/templates/${encodeURIComponent(template.id)}?back=${back}`)}>预览模板</Button> : null}
            <Button onClick={() => setChoosing(!choosing)} >{choosing ? "收起" : "更换模板"}</Button>
          </>}>
          <p>{text.lead}</p>
          {template ? <p className="mt-1">本次启用 <b>{enabled.length}</b> 项：{enabled.slice(0, 6).map((c) => c.title).join("、")}{enabled.length > 6 ? "…" : ""}</p> : null}
          <p className="mt-1 text-[11.5px] text-[var(--steel)]">{text.note}</p>
          {choosing ? (
            <div className="mt-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3">
              {usable.map((rule) => (
                <button key={rule.id} type="button" disabled={!rule.confirmed} onClick={() => { remember("template", rule.id); setChoosing(false); }}
                  className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] disabled:opacity-50 ${rule.id === template?.id ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface)]"}`}>
                  <span className="min-w-0 flex-1 truncate">{rule.name} · v{rule.version}</span>
                  <Pill tone="gray">{REVIEW_SOURCE_LABEL[rule.source_kind ?? "manual"]}</Pill>
                  {!rule.confirmed ? <Pill tone="yellow">草稿</Pill> : null}
                </button>
              ))}
              <div className="mt-2 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-2">
                {template ? <Link className="text-xs text-[var(--link)]" to={`/review/templates/new?from=${encodeURIComponent(template.id)}&back=${back}`}>复制当前模板编辑</Link> : null}
                <Link className="text-xs text-[var(--link)]" to="/review/templates">新建或上传模板</Link>
              </div>
            </div>
          ) : null}
        </TaskCard>

        <TaskCard tone="sky" label="上传申请书" title={doc ? doc.filename : "拖入文件或点击上传"}
          actions={<>
            <Button variant={doc ? "outline" : "primary"} disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>{busy === "读取申请书" ? "读取中…" : doc ? "上传新版本" : "上传申请书"}</Button>
            {proposals.length ? <Button onClick={() => setPicking(!picking)}>选择已上传</Button> : null}
            {doc ? <a className="self-center text-xs text-[var(--link)]" href={reviewDocumentFileUrl(doc.id)} target="_blank" rel="noreferrer">查看原文</a> : null}
          </>}>
          <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) void upload(file); }}
            className={`rounded-xl border border-dashed p-3 ${dragging ? "border-[var(--link)] bg-[var(--canvas)]" : "border-[#9cc4ea]"}`}>
            {doc ? <>
              <p>{doc.kind.toUpperCase()} · {doc.page_count} {doc.kind === "pdf" ? "页" : "个文本块"} · {doc.confirmed_at ? "基本信息已确认" : "基本信息待核对"}</p>
              {doc.warnings?.length ? <p className="text-[11.5px] text-[#8a6a00]">{doc.warnings[0]}</p> : null}
            </> : <p>上传待审正文，自动整理内容与基本信息。需要时补充信息表；原文件保留，可随时查看。</p>}
            <p className="mt-1 text-[11px] text-[var(--steel)]">PDF / DOC / DOCX / Markdown / TXT，≤30MB；扫描件不做 OCR。</p>
          </div>
          <input ref={fileInput} aria-label="上传申请书文件" type="file" accept={ACCEPT} className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
          {picking ? (
            <select aria-label="选择已上传申请书" className="mt-2 w-full rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-2" value={doc?.id ?? ""}
              onChange={(e) => { const next = docs.find((item) => item.id === e.target.value); if (next) { setDoc(next); remember("proposal", next.id); setPicking(false); } }}>
              <option value="">请选择</option>
              {proposals.map((item) => <option key={item.id} value={item.id}>{item.metadata.title || item.filename} · {item.created_at?.slice(0, 10)}</option>)}
            </select>
          ) : null}
        </TaskCard>
      </div>

      {doc ? (
        <section aria-label="准备核对" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-[12.5px]">
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
              <strong className="text-[13.5px]">章节对应核对</strong>
              <p className="mb-3 mt-1 text-xs text-[var(--steel)]">模板中的章节名称定义检查对象；这里确认本申请书中实际参与计数的内容。可选择重复标题的正确位置、调整起止文本块，或确认缺少该章节。</p>
              <SectionMapping doc={doc} rule={template} onSummary={setMapping} />
            </div>
          ) : null}
          {reviewKind === "professional" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-[12.5px]">
                <strong className="text-[13.5px]">对照资料库</strong>
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
              <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-[12.5px]">
                <strong className="text-[13.5px]">评价方式</strong>
                <label className="mt-2 flex items-start gap-2"><input type="radio" checked={mode === "update"} onChange={() => setMode("update")} /><span>更新建议（默认）：面向修改与下次申报，使用今天之前的已选材料。</span></label>
                <label className="mt-2 flex items-start gap-2"><input type="radio" checked={mode === "historical"} onChange={() => setMode("historical")} /><span>历史评价：按指定评价时点，只采用日期明确且不晚于该时点的材料。</span></label>
                {mode === "historical" ? <label className="mt-2 block text-xs">评价时点<input aria-label="评价时点" type="date" className="ml-2 rounded border border-[var(--hairline)] p-1" value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></label> : null}
              </div>
            </div>
          ) : null}
          <details className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px]">
            <summary className="cursor-pointer text-[13.5px] font-semibold">补充信息表（可选）</summary>
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
        </section>
      ) : null}

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] bg-[var(--canvas)] py-3">
        <Button variant="primary" size="md" disabled={Boolean(blockers.length) || Boolean(busy)} onClick={() => void start()}>
          {busy === "创建审核任务" ? "创建中…" : "开始审查"}
        </Button>
        <span className="min-w-0 flex-1 text-[11.5px] text-[var(--stone)]">{blockers.length ? "尚需：" + blockers.join("；") : "审查约需数分钟，可离开页面后从审查记录返回。"}</span>
        {health ? <Pill tone={health.model_configured ? "mint" : "gray"}>{health.model_name} · {health.model_configured ? "已配置" : "未配置"}</Pill> : null}
        <Button size="sm" variant="ghost" onClick={() => void testReviewModel().then(() => setNotice("模型连接及 JSON 输出测试成功。")).catch((cause) => setError((cause as Error).message))}>测试模型连接</Button>
      </div>

      <RunList runs={runs.filter((run) => (run.request?.kind ?? "formal") === reviewKind)} />
    </Shell>
  );
}

function RunList({ runs }: { runs: ReviewRun[] }) {
  if (!runs.length) return null;
  return (
    <div id="records" className="mt-[18px]">
      <strong className="text-[13.5px] text-[var(--ink)]">审查记录</strong>
      <div className="mt-[8px] grid gap-[8px]">
        {runs.map((run) => (
          <Link key={run.id} to={`/review/runs/${run.id}`}
            className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px] hover:border-[var(--primary)]">
            <span className="block text-[13px] font-semibold text-[var(--ink)]">{run.document?.metadata?.title || run.document?.filename || "未命名申请书"}</span>
            <span className="mt-[3px] block text-[var(--steel)]">
              {REVIEW_STATUS_LABEL[run.status] ?? run.status} · {run.rule?.name ?? "模板"} v{run.rule?.version ?? "-"}
              {run.summary ? ` · 问题 ${run.summary.issue ?? 0} / 建议 ${run.summary.warning ?? 0} / 待核实 ${run.summary.pending ?? 0}` : ""} · {run.created_at?.slice(0, 10)}
            </span>
          </Link>
        ))}
      </div>
    </div>
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

export function ReviewEvidence() {
  const [items, setItems] = useState<ReviewEvidence[]>([]);
  const [query, setQuery] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [results, setResults] = useState<ReviewEvidence[]>([]);
  const [draft, setDraft] = useState({ title: "", published: "", url: "", summary: "", keywords: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => { void fetchReviewEvidence().then(setItems).catch((cause) => setError((cause as Error).message)); }, []);
  const reload = async () => setItems(await fetchReviewEvidence());

  return (
    <Shell title="技术证据库" description="用于技术先进性评议的文献证据：公开题录检索仅发送检索词，检索结果与人工录入内容均需人工核实。">
      <Notice text={error} error />
      <Notice text={notice} />
      <div className="mb-[14px] flex flex-wrap items-end gap-[8px]">
        <label className="text-[12px] text-[var(--slate)]">检索词
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            className="ml-[6px] rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] text-[12.5px]" />
        </label>
        <label className="text-[12px] text-[var(--slate)]">截止日期
          <input type="date" value={cutoff} onChange={(event) => setCutoff(event.target.value)}
            className="ml-[6px] rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] text-[12.5px]" />
        </label>
        <Button disabled={!cutoff || query.trim().length < 3} onClick={() => {
          setBusy("检索");
          void searchReviewEvidence(query.trim(), cutoff)
            .then((next) => { setResults(next); setNotice(`检索到 ${next.length} 条题录，尚未加入证据库。`); })
            .catch((cause) => setError((cause as Error).message))
            .finally(() => setBusy(""));
        }}>{busy === "检索" ? "检索中…" : "公开题录检索"}</Button>
      </div>

      {results.length ? (
        <div className="mb-[16px] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px]">
          <strong>检索结果</strong>
          {results.map((item, index) => (
            <div key={index} className="mt-[6px] flex flex-wrap items-center gap-[6px]">
              <span className="flex-1">{item.title}（{item.published}）</span>
              <Button onClick={() => void addReviewEvidence({
                title: item.title, published: item.published, url: item.url, summary: item.summary, keywords: item.keywords,
              }).then(async () => { await reload(); setNotice("已加入证据库（内容待人工核实）。"); }).catch((cause) => setError((cause as Error).message))}>加入证据库</Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-[16px] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px]">
        <strong>人工录入</strong>
        <div className="mt-[6px] grid gap-[8px] sm:grid-cols-2">
          <input aria-label="题名" placeholder="题名" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className="rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px]" />
          <input aria-label="发表日期" type="date" value={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.value })}
            className="rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px]" />
          <input aria-label="链接" placeholder="https://" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            className="rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px]" />
          <input aria-label="关键词" placeholder="关键词，逗号分隔" value={draft.keywords} onChange={(event) => setDraft({ ...draft, keywords: event.target.value })}
            className="rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px]" />
          <textarea aria-label="摘要" placeholder="摘要（≥15 字）" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            className="min-h-[70px] rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] sm:col-span-2" />
        </div>
        <div className="mt-[8px]">
          <Button onClick={() => void addReviewEvidence({
            title: draft.title, published: draft.published, url: draft.url, summary: draft.summary,
            keywords: draft.keywords.split(",").map((value) => value.trim()).filter(Boolean),
          }).then(async () => { await reload(); setDraft({ title: "", published: "", url: "", summary: "", keywords: "" }); setNotice("已加入证据库。"); })
            .catch((cause) => setError((cause as Error).message))}>保存证据</Button>
        </div>
      </div>

      <strong className="text-[13.5px] text-[var(--ink)]">证据库（{items.length}）</strong>
      {!items.length ? <p className="mt-[6px] text-[12.5px] text-[var(--stone)]">证据库为空；没有直接相关文献时，评议只评价申请书内部论证。</p> : null}
      <div className="mt-[8px] grid gap-[8px]">
        {items.map((item) => (
          <div key={item.id} className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px]">
            <a className="text-[13px] font-semibold text-[var(--link)]" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
            <span className="mt-[3px] block text-[var(--steel)]">{item.published} · {item.origin}{item.verified ? "" : " · 待人工核实"}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

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
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("needs");
  useEffect(() => {
    let active = true; let timer: number | null = null;
    const load = async () => {
      try {
        const next = await fetchReviewRun(id);
        if (!active) return;
        setRun(next);
        if (next.status === "running") timer = window.setTimeout(load, 2000);
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
  const items: { status: string }[] = formal ? findings : cards;
  const count = (status: string) => items.filter((item) => item.status === status).length;
  const verificationPending = run?.audit?.verification?.pending ?? 0;
  const visible = (status: string) => filter === "all" || (filter === "needs" ? !["pass", "na"].includes(status) : status === filter);

  function topic(finding: ReviewFinding) {
    const field = finding.clause_ids?.map((cid) => checks.get(cid)?.execution?.field).find(Boolean) ?? "";
    if (finding.group === "budget" || BUDGET_FIELDS.includes(field)) return "budget";
    if (SHEET_FIELDS.includes(field) || finding.group === "scope" || finding.group === "structure") return "sheet";
    return "outline";
  }
  function source(page: number) {
    if (!run) return;
    const loc = run.source_locations?.[String(page)];
    showInspector({ kind: "review-source", fileId: loc?.file_id ?? run.document.id, page: loc?.source_page ?? page });
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
      {item.requirement ? <p className="mt-2 text-[13px] text-[var(--slate)]">要求：{item.requirement}{item.actual !== undefined && item.actual !== null ? <> · 实际值：<b>{String(item.actual)}</b></> : null}</p> : null}
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
    const shown = rows.filter((item) => visible(item.status));
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

  if (!run) return <Shell title="审查报告" description="正在读取审查结果…"><Notice text={error} error /></Shell>;
  const sectionRows = findings.filter((f) => f.clause_ids?.some((cid) => checks.get(cid)?.execution?.field === "section_characters"));
  const projects = (run.technical?.evidence ?? []).filter((item) => item.kind === "project");
  const projectGroups = [...projects.reduce((map, item) => map.set(item.title, [...(map.get(item.title) ?? []), item]), new Map<string, typeof projects>())];
  const others = (run.technical?.evidence ?? []).filter((item) => item.kind !== "project");
  const doc = run.document;
  const versions = run.input_versions ?? [];
  return (
    <Shell title={formal ? "形式审查报告" : "专业审查报告"} description="先看需要处理的问题，再展开说明和原文。待核实不等于不合格；没有发现问题也不等于通过。">
      <Notice text={error} error />
      <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs text-[var(--steel)]">{formal ? "形式审查" : "专业审查"} · 模板 {run.rule?.name} v{run.rule?.version}</p><h2 className="mt-2 text-xl font-semibold">{doc.metadata.title || doc.filename}</h2></div>
          <Pill tone={run.status === "completed" ? "mint" : run.status === "failed" ? "rose" : "sky"}>{run.status === "completed" ? "已生成" : REVIEW_STATUS_LABEL[run.status] ?? run.status}</Pill>
        </div>
        <p className="mt-4 text-sm leading-7">{run.reader_report?.summary || run.stage_label}</p>
        {run.error ? <p role="alert" className="mt-3 rounded bg-[var(--tint-rose)] p-3 text-sm">{run.error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--steel)]">
          <span>正文：{doc.filename}{versions[0] ? ` · ${versions[0].sha256.slice(0, 8)}` : ""}</span>
          <span>信息表：{run.information_sheet?.filename || "未提供"}</span>
          {!formal ? <span>评价方式：{run.request.mode === "historical" ? `历史评价 · ${run.request.cutoff_date}` : "更新建议"}</span> : null}
          {!formal ? <span>对照资料库：{corpora.find((item) => item.id === run.request.corpus_ids?.[0])?.name ?? run.request.corpus_ids?.[0] ?? "未记录"} · 参考报告 {run.technical?.local_matches ?? 0}/{run.request.reference_count ?? 3} 篇 · 文献 {run.request.evidence_ids?.length ?? 0} 篇</span> : null}
          <span>生成：{localTime(run.created_at)}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--primary)]">
          {run.status === "completed" ? <a href={reviewExportUrl(run.id, "docx")}>下载 Word 报告</a> : null}
          <a href={reviewDocumentFileUrl(doc.id)} target="_blank" rel="noreferrer">查看原申请书</a>
          <Link to={"/review/" + (formal ? "professional" : "formal") + "?proposal=" + encodeURIComponent(doc.id) + (run.information_sheet ? "&sheet=" + encodeURIComponent(run.information_sheet.id) : "")}>使用这些材料开展{formal ? "专业审查" : "形式审查"}</Link>
        </div>
      </section>
      {run.status === "completed" ? <>
        <div className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {(formal ? [["issue", "发现问题"], ["warning", "修改建议"], ["pending", "待核实"], ["pass", "已核对通过"]] : [["advisory", "评议意见"], ["pending", "待核实"]]).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(filter === key ? "needs" : key)} aria-pressed={filter === key}
              className={`rounded-xl border bg-[var(--canvas)] p-4 text-left ${filter === key ? "border-[var(--primary)]" : "border-[var(--hairline)]"}`}>
              <span className="text-xs text-[var(--steel)]">{label}</span><strong className="mt-2 block text-2xl">{count(key)}</strong>
            </button>))}
          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4"><span className="text-xs text-[var(--steel)]">最终复核未完成</span><strong className="mt-2 block text-2xl">{verificationPending}</strong></div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant={filter === "needs" ? "primary" : "ghost"} onClick={() => setFilter("needs")}>优先查看待处理事项</Button>
          <Button size="sm" variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>查看全部结果</Button>
        </div>
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
                    <td className="p-3 text-xs">{row.mapping === "confirmed" ? "已确认" : "未确认"} · {row.coverage === "complete" ? "完整读取" : row.coverage === "partial" ? "覆盖不足" : "未读取"}</td>
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
              {cards.filter((item) => item.check_id === row.check_id && visible(item.status)).map(card)}
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
                <a className="mt-2 inline-block text-sm text-[var(--primary)]" href={item.url} target="_blank" rel="noreferrer">查看原始出处</a>
              </article>))}
          </> : null}
          {!formal && tab === "suggestions" ? <>
            <h2 className="mb-3 text-lg font-semibold">修改建议</h2>
            <p className="mb-3 text-sm text-[var(--steel)]">原申请书保持只读；修改后上传新版本重新审查，本报告保留不变。</p>
            {cards.filter((item) => visible(item.status)).map((item) => (
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
            {check.revised && check.original ? <p className="mt-1 text-xs text-[#8a6a00]">原文要求：{check.original.requirement}／本模板人工修订为上述要求</p> : null}
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

export function ReviewRunPanel() {
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchReviewRuns().then((next) => { if (active) setRuns(next); })
        .catch((cause) => { if (active) setError((cause as Error).message); });
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const ordered = useMemo(() => runs, [runs]);
  if (error) return <p role="alert" className="px-[10px] py-2 text-[12px] text-[var(--red)]">{error}</p>;
  return (
    <div>
      <p className="px-[10px] pt-[4px] text-[11px] text-[var(--stone)]">审核任务</p>
      {!ordered.length ? <p className="px-[10px] py-3 text-[12.5px] text-[var(--stone)]">还没有审核任务。</p> : null}
      {ordered.map((run) => (
        <Link key={run.id} to={`/review/runs/${run.id}`}
          className="mt-[2px] flex items-center gap-[6px] rounded-[8px] px-[10px] py-[6px] text-[12.5px] text-[var(--slate)] hover:bg-[var(--surface)]">
          <Icon name={run.status === "completed" ? "checklist" : run.status === "running" ? "reload" : "warning"} size={13} strokeWidth={1.9} />
          <span className="min-w-0 flex-1 truncate">{run.document?.metadata?.title || run.document?.filename || "未命名申请书"}</span>
          <span className="text-[11px] text-[var(--stone)]">{run.status === "completed" ? "已完成" : run.status === "running" ? "进行中" : "未完成"}</span>
        </Link>
      ))}
    </div>
  );
}
