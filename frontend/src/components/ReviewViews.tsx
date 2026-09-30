import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router";
import {
  addReviewEvidence, createReviewRun, fetchReviewDocuments, fetchReviewEvidence, fetchReviewHealth,
  fetchReviewRules, fetchReviewRun, fetchReviewRuns, patchReviewDocument, reextractReviewDocument,
  reviewDocumentFileUrl, reviewExportUrl, reviewGuidelineFileUrl, saveReviewRule, searchReviewEvidence,
  testReviewModel, uploadReviewDocument, uploadReviewGuidelines,
  REVIEW_FIELD_LABEL, REVIEW_METHOD_LABEL, REVIEW_STATUS_LABEL, REVIEW_STRENGTH_LABEL,
  type ReviewCheck, type ReviewDoc, type ReviewEvidence, type ReviewHealth, type ReviewMetadata,
  type ReviewRule, type ReviewRun,
} from "../reviewApi";
import { Button, Pill } from "./ui";
import { Icon } from "./Icons";

const TABS: { to: string; label: string }[] = [
  { to: "/review", label: "审核工作台" },
  { to: "/review/guidelines", label: "申报指南库" },
  { to: "/review/evidence", label: "技术证据库" },
];

function Shell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
      <header className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--hairline)] pr-[14px] pl-[18px]">
        <span className="text-[14px] font-semibold text-[var(--ink)]">形式审查</span>
        <span className="flex-1" />
        {TABS.map((tab) => (
          <Link key={tab.to} to={tab.to}
            className="rounded-[7px] px-[11px] py-[6px] text-[12px] text-[var(--steel)] hover:bg-[var(--surface)]">
            {tab.label}
          </Link>
        ))}
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1080px] px-[34px] pt-[26px]">
          <h1 className="mb-[6px] text-[26px] font-semibold tracking-[-0.6px] text-[var(--ink)]">{title}</h1>
          <p className="max-w-[680px] text-[13.5px] leading-[1.6] text-[var(--steel)]">{description}</p>
        </div>
        <div className="mx-auto w-full max-w-[1080px] px-[34px] pt-[22px] pb-[40px]">{children}</div>
      </div>
    </section>
  );
}

export function ReviewShell() {
  return <Outlet />;
}

function Notice({ text, error }: { text: string; error?: boolean }) {
  if (!text) return null;
  return <p role={error ? "alert" : "status"} className={`mb-[10px] text-[12.5px] ${error ? "text-[var(--red)]" : "text-[var(--steel)]"}`}>{text}</p>;
}

function MetadataFields({ doc, onSave, onRetry }: {
  doc: ReviewDoc;
  onSave: (meta: Partial<ReviewMetadata>) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReviewMetadata>(doc.metadata);
  useEffect(() => setDraft(doc.metadata), [doc.id, doc.metadata]);
  const extraction = doc.metadata_extraction;
  const fields = extraction?.fields ?? {};
  const field = (key: keyof ReviewMetadata, type: "text" | "number" = "text") => (
    <label key={key} className="block text-[12px] text-[var(--slate)]">
      {REVIEW_FIELD_LABEL[key] ?? key}
      <input
        className="mt-[3px] w-full rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] text-[12.5px]"
        value={type === "number" && (draft[key] === null || draft[key] === undefined) ? "" : String(draft[key] ?? "")}
        inputMode={type === "number" ? "numeric" : undefined}
        onChange={(event) => setDraft({ ...draft, [key]: type === "number"
          ? (event.target.value === "" ? null : Number(event.target.value))
          : event.target.value })}
      />
    </label>
  );
  return (
    <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px]">
      <div className="mb-[8px] flex items-center gap-[8px]">
        <strong className="text-[13.5px] text-[var(--ink)]">申请书基本信息</strong>
        {extraction?.status === "running" ? <Pill tone="sky">{extraction.stage_label || "模型正在提取"}</Pill>
          : extraction?.status === "completed" ? <Pill tone="mint">已由 {extraction.model || "模型"} 提取</Pill>
            : extraction?.status === "partial" ? <Pill tone="yellow">部分提取成功</Pill>
              : extraction?.status ? <Pill tone="gray">未使用模型提取</Pill> : null}
        <span className="flex-1" />
        <Button onClick={() => void onRetry()}>用模型重新提取</Button>
        <Button onClick={() => void onSave(draft)}>保存并确认</Button>
      </div>
      {extraction?.error ? <Notice text={extraction.error} error /> : null}
      {(extraction?.notes ?? []).map((note, index) => <Notice key={index} text={note} />)}
      <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-4">
        {field("title")}
        {field("fund")}
        {field("category")}
        {field("year", "number")}
        {field("birth_date")}
        {field("budget", "number")}
        {field("domain")}
      </div>
      {Object.keys(fields).length ? (
        <details className="mt-[10px] text-[12px]">
          <summary className="cursor-pointer text-[var(--steel)]">查看字段原文依据（{Object.keys(fields).length} 项）</summary>
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="mt-[8px]">
              <strong>{REVIEW_FIELD_LABEL[key] ?? key}</strong>
              {value.status === "conflict" ? <Pill tone="yellow">存在冲突</Pill>
                : value.status === "missing" ? <Pill tone="gray">未找到明确依据</Pill> : null}
              {value.candidates.map((candidate, index) => (
                <p key={index} className="mt-[4px] text-[var(--slate)]">
                  {String(candidate.value)} · 第 {candidate.page} 页 · {candidate.reason}
                  <blockquote className="mt-[2px] text-[11.5px] text-[var(--stone)]">{candidate.quote}</blockquote>
                </p>
              ))}
            </div>
          ))}
        </details>
      ) : null}
      <p className="mt-[8px] text-[11.5px] text-[var(--stone)]">
        审查材料不进入知识库、不参与检索；原文文件：<a className="text-[var(--link)]" href={reviewDocumentFileUrl(doc.id)} target="_blank" rel="noreferrer">{doc.filename}</a>
        （{doc.kind === "pdf" ? `${doc.page_count} 页` : `${doc.page_count} 个文本块`}）
      </p>
    </div>
  );
}

export function ReviewWorkbench() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<ReviewHealth | null>(null);
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [docs, setDocs] = useState<ReviewDoc[]>([]);
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [doc, setDoc] = useState<ReviewDoc | null>(null);
  const [ruleId, setRuleId] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [mode, setMode] = useState<"historical" | "update">("historical");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const poller = useRef<number | null>(null);

  const reload = async () => {
    const [nextRules, nextDocs, nextRuns] = await Promise.all([fetchReviewRules(), fetchReviewDocuments(), fetchReviewRuns()]);
    setRules(nextRules);
    setDocs(nextDocs);
    setRuns(nextRuns);
  };
  useEffect(() => {
    void fetchReviewHealth().then(setHealth).catch((cause) => setError((cause as Error).message));
    void reload().catch((cause) => setError((cause as Error).message));
  }, []);
  useEffect(() => () => { if (poller.current) window.clearInterval(poller.current); }, []);

  const watchExtraction = (id: string) => {
    if (poller.current) window.clearInterval(poller.current);
    poller.current = window.setInterval(async () => {
      try {
        const next = await fetchReviewRunDocuments(id);
        setDoc(next);
        if (next.metadata_extraction?.status === "running") return;
        if (poller.current) window.clearInterval(poller.current);
        setNotice(next.metadata_extraction?.status === "completed"
          ? "模型已提取基本信息，请核对后再开始审核。"
          : next.metadata_extraction?.error || "提取未完成，可重试或手工填写。");
        void reload();
      } catch (cause) {
        if (poller.current) window.clearInterval(poller.current);
        setError((cause as Error).message);
      }
    }, 1500);
  };

  async function upload(file: File) {
    setBusy("读取申请书");
    setError("");
    setNotice("");
    try {
      const next = await uploadReviewDocument(file);
      setDoc(next);
      setCutoff(next.metadata.year ? `${next.metadata.year}-12-31` : cutoff);
      if (next.metadata_extraction?.status === "running") watchExtraction(next.id);
      void reload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  const confirmedRules = rules.filter((rule) => rule.confirmed);
  const selectedRule = rules.find((rule) => rule.id === ruleId) ?? null;
  const canStart = Boolean(doc && selectedRule?.confirmed && cutoff && health?.model_configured
    && doc.metadata_extraction?.status !== "running" && doc.metadata.title.trim());

  async function start() {
    if (!doc || !selectedRule) return;
    setBusy("创建审核任务");
    setError("");
    try {
      const run = await createReviewRun({ document_id: doc.id, rule_id: selectedRule.id, cutoff_date: cutoff, mode });
      void navigate(`/review/runs/${run.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Shell title="申请书预审" description="上传申请书 → 核对基本信息 → 选择已启用的指南检查清单 → 开始审核。引用必校验、缺证据标待核实，模型失败不生成假报告。">
      <Notice text={error} error />
      <Notice text={notice} />
      {health && !health.model_configured ? (
        <Notice text="审查模型未配置：请先配置 MODEL_API_KEY（或 REVIEW_MODEL_*），未配置时不能发起审核。" error />
      ) : null}
      {health?.model_connection === "failed" ? <Notice text="最近一次模型连接测试失败，请检查密钥与接口地址。" error /> : null}

      <div className="mb-[14px] flex flex-wrap items-center gap-[8px]">
        <Button onClick={() => fileInput.current?.click()}>{busy === "读取申请书" ? "读取中…" : "上传申请书"}</Button>
        <input ref={fileInput} type="file" accept=".pdf,.doc,.docx" className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        <span className="text-[11.5px] text-[var(--stone)]">支持 PDF / DOC / DOCX，≤30MB；扫描件不做 OCR。</span>
        <span className="flex-1" />
        {health ? <Pill tone={health.model_configured ? "mint" : "gray"}>{health.model_name} · {health.model_configured ? "已配置" : "未配置"}</Pill> : null}
        <Button onClick={() => void testReviewModel().then(() => setNotice("模型连接及 JSON 输出测试成功。")).catch((cause) => setError((cause as Error).message))}>测试模型连接</Button>
      </div>

      {docs.length ? (
        <div className="mb-[14px] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px]">
          <strong>已上传申请书</strong>
          <div className="mt-[6px] flex flex-wrap gap-[6px]">
            {docs.map((item) => (
              <button key={item.id} type="button" onClick={() => { setDoc(item); setCutoff(item.metadata.year ? `${item.metadata.year}-12-31` : cutoff); }}
                className={`rounded-[7px] border px-[9px] py-[5px] ${doc?.id === item.id ? "border-[var(--primary)] text-[var(--primary-pressed)]" : "border-[var(--hairline)] text-[var(--steel)]"}`}>
                {item.metadata.title || item.filename}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {doc ? (
        <div className="space-y-[14px]">
          <MetadataFields
            doc={doc}
            onSave={async (meta) => {
              try { setDoc(await patchReviewDocument(doc.id, meta)); setNotice("基本信息已保存。"); }
              catch (cause) { setError((cause as Error).message); }
            }}
            onRetry={async () => {
              try { const next = await reextractReviewDocument(doc.id); setDoc(next); if (next.metadata_extraction?.status === "running") watchExtraction(next.id); }
              catch (cause) { setError((cause as Error).message); }
            }}
          />
          <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px]">
            <strong className="text-[13.5px] text-[var(--ink)]">审核条件</strong>
            <div className="mt-[8px] grid gap-[10px] sm:grid-cols-3">
              <label className="block text-[12px] text-[var(--slate)]">检查清单
                <select value={ruleId} onChange={(event) => setRuleId(event.target.value)}
                  className="mt-[3px] w-full rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] text-[12.5px]">
                  <option value="">选择清单</option>
                  {rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} · {rule.year} · {rule.checks.filter((check) => check.enabled).length}/{rule.checks.length} 项{rule.confirmed ? "" : "（草稿）"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[12px] text-[var(--slate)]">技术证据截止日期
                <input type="date" value={cutoff} onChange={(event) => setCutoff(event.target.value)}
                  className="mt-[3px] w-full rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] text-[12.5px]" />
              </label>
              <label className="block text-[12px] text-[var(--slate)]">评估模式
                <select value={mode} onChange={(event) => setMode(event.target.value as "historical" | "update")}
                  className="mt-[3px] w-full rounded-[7px] border border-[var(--hairline)] bg-[var(--surface)] px-[8px] py-[6px] text-[12.5px]">
                  <option value="historical">历史评估 · 按申报当时</option>
                  <option value="update">更新建议 · 面向下次申报</option>
                </select>
              </label>
            </div>
            {selectedRule ? <p className="mt-[8px] text-[11.5px] text-[var(--stone)]">范围：{selectedRule.scope_note}</p> : null}
            {selectedRule && !selectedRule.confirmed ? <Notice text="该清单仍是草稿，请先到「申报指南库」核对并启用。" error /> : null}
            {!confirmedRules.length ? <Notice text="还没有已启用的检查清单，请先上传申报指南生成清单。" error /> : null}
            <div className="mt-[10px] flex items-center gap-[8px]">
              <Button disabled={!canStart || Boolean(busy)} onClick={() => void start()}>
                {busy === "创建审核任务" ? "创建中…" : "开始审核"}
              </Button>
              <span className="text-[11.5px] text-[var(--stone)]">审核约需数分钟到十几分钟，可离开页面后从审核记录返回查看。</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-[12px] border border-dashed border-[var(--hairline-strong)] bg-[var(--surface-soft)] p-[24px] text-center text-[13px] text-[var(--steel)]">
          还没有上传申请书。上传后由模型提取基本信息，人工核对即可发起审核。
        </p>
      )}

      {runs.length ? (
        <div className="mt-[18px]">
          <strong className="text-[13.5px] text-[var(--ink)]">审核记录</strong>
          <div className="mt-[8px] grid gap-[8px]">
            {runs.map((run) => (
              <Link key={run.id} to={`/review/runs/${run.id}`}
                className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px] hover:border-[var(--primary)]">
                <span className="block text-[13px] font-semibold text-[var(--ink)]">{run.document?.metadata?.title || run.document?.filename || "未命名申请书"}</span>
                <span className="mt-[3px] block text-[var(--steel)]">
                  {run.status === "completed" ? "已完成" : run.status === "running" ? "进行中" : "未完成"} · {run.stage_label}
                  {run.summary ? ` · 问题 ${run.summary.issue ?? 0} / 建议 ${run.summary.warning ?? 0} / 待核实 ${run.summary.pending ?? 0}` : ""} · {run.created_at?.slice(0, 10)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

async function fetchReviewRunDocuments(id: string): Promise<ReviewDoc> {
  const response = await fetch(`/api/review/documents/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("申请书状态读取失败");
  return (await response.json()) as ReviewDoc;
}

function CheckRow({ check, onChange }: { check: ReviewCheck; onChange: (next: ReviewCheck) => void }) {
  return (
    <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px]">
      <label className="flex items-start gap-[8px]">
        <input type="checkbox" className="mt-[2px]" checked={check.enabled}
          onChange={(event) => onChange({ ...check, enabled: event.target.checked })} />
        <span>
          <strong className="text-[12.8px] text-[var(--ink)]">{check.title}</strong>
          <span className="ml-[6px] text-[var(--stone)]">{check.category}</span>
        </span>
      </label>
      <p className="mt-[5px] text-[var(--slate)]">{check.requirement}</p>
      <p className="mt-[3px] text-[11.5px] text-[var(--stone)]">适用条件：{check.applicability}</p>
      <div className="mt-[5px] flex flex-wrap gap-[6px]">
        <Pill tone={check.strength === "hard" ? "rose" : check.strength === "advisory" ? "yellow" : "gray"}>{REVIEW_STRENGTH_LABEL[check.strength]}</Pill>
        <Pill tone={check.method === "calculation" ? "sky" : "gray"}>{REVIEW_METHOD_LABEL[check.method]}</Pill>
        {check.needed_materials.length ? <Pill tone="gray">需核查：{check.needed_materials.join("、")}</Pill> : null}
      </div>
      <details className="mt-[5px] text-[11.5px]">
        <summary className="cursor-pointer text-[var(--link)]">查看指南原文依据（第 {check.page} 页）</summary>
        <blockquote className="mt-[4px] text-[var(--stone)]">{check.quote}</blockquote>
      </details>
    </div>
  );
}

export function ReviewGuidelines() {
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [draft, setDraft] = useState<ReviewRule | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchReviewRules().then(setRules).catch((cause) => setError((cause as Error).message)); }, []);

  async function plan(files: File[]) {
    setBusy("生成检查清单");
    setError("");
    setNotice("");
    setConfirmed(false);
    try {
      const next = await uploadReviewGuidelines(files);
      setDraft(next);
      setNotice(`已生成 ${next.checks.length} 项检查，请核对基金、年份与适用条件后启用。`);
      setRules(await fetchReviewRules());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!draft) return;
    setBusy("保存清单");
    setError("");
    try {
      await saveReviewRule({ ...draft, confirmed });
      setNotice(confirmed ? "清单已启用，可在审核工作台选择。" : "已保存为草稿。");
      setRules(await fetchReviewRules());
      if (confirmed) setDraft(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Shell title="申报指南库" description="上传当年申报指南，由模型生成检查清单（草稿），核对基金、年份与适用条件后启用。生成清单不等于政策认证。">
      <Notice text={error} error />
      <Notice text={notice} />
      <div className="mb-[14px] flex flex-wrap items-center gap-[8px]">
        <Button onClick={() => fileInput.current?.click()}>{busy === "生成检查清单" ? "正在阅读指南…" : "上传指南 · 生成检查清单"}</Button>
        <input ref={fileInput} type="file" multiple accept=".pdf,.doc,.docx" className="hidden"
          onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void plan(files); }} />
        <span className="text-[11.5px] text-[var(--stone)]">每次 1–5 份 DOC / DOCX / PDF；单次清单最多 100 项。</span>
      </div>

      {draft ? (
        <div className="mb-[18px] rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <strong className="text-[13.5px] text-[var(--ink)]">{draft.name}</strong>
            <Pill tone="gray">{draft.fund || "基金未识别"}</Pill>
            <Pill tone="gray">{draft.category || "类别未识别"}</Pill>
            <Pill tone="sky">{draft.year}</Pill>
            <Pill tone={confirmed ? "mint" : "yellow"}>{confirmed ? "将启用" : "草稿"}</Pill>
            <span className="flex-1" />
            <Button disabled={Boolean(busy)} onClick={() => void save()}>{busy === "保存清单" ? "保存中…" : confirmed ? "保存并启用" : "保存为草稿"}</Button>
          </div>
          <p className="mt-[6px] text-[11.5px] text-[var(--stone)]">范围：{draft.scope_note}</p>
          {draft.missing_documents.length ? (
            <p className="mt-[6px] text-[11.5px] text-[var(--stone)]">指南引用但尚未提供的文件：{draft.missing_documents.join("、")}</p>
          ) : null}
          {(draft.extraction_notes ?? []).map((note, index) => <Notice key={index} text={note} />)}
          <label className="mt-[8px] flex items-start gap-[8px] text-[12px] text-[var(--slate)]">
            <input type="checkbox" className="mt-[2px]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            我已核对清单的适用范围、年份与引用条款，启用此版本。
          </label>
          <div className="mt-[10px] grid gap-[8px]">
            {draft.checks.map((check) => (
              <CheckRow key={check.id} check={check}
                onChange={(next) => setDraft({ ...draft, checks: draft.checks.map((item) => (item.id === next.id ? next : item)) })} />
            ))}
          </div>
        </div>
      ) : null}

      <strong className="text-[13.5px] text-[var(--ink)]">已有清单</strong>
      {!rules.length ? <p className="mt-[6px] text-[12.5px] text-[var(--stone)]">还没有检查清单。</p> : null}
      <div className="mt-[8px] grid gap-[8px]">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px]">
            <span className="block text-[13px] font-semibold text-[var(--ink)]">{rule.name}</span>
            <span className="mt-[3px] block text-[var(--steel)]">
              {rule.fund || "基金未识别"} · {rule.category || "类别未识别"} · {rule.year} · v{rule.version} · {rule.checks.filter((check) => check.enabled).length}/{rule.checks.length} 项启用
            </span>
            <div className="mt-[5px] flex flex-wrap items-center gap-[6px]">
              <Pill tone={rule.confirmed ? "mint" : "yellow"}>{rule.confirmed ? "可用" : "草稿"}</Pill>
              {rule.guideline_ids.map((id) => (
                <a key={id} className="text-[var(--link)]" href={reviewGuidelineFileUrl(id)} target="_blank" rel="noreferrer">原始指南</a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
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

export function ReviewRunPage() {
  const { id = "" } = useParams();
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    const load = async () => {
      try {
        const next = await fetchReviewRun(id);
        if (!active) return;
        setRun(next);
        if (next.status === "running") timer = window.setTimeout(load, 2000);
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    };
    void load();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [id]);

  const report = run?.reader_report;
  const summary = run?.summary ?? {};
  const points = (title: string, items: typeof report extends undefined ? never : ReviewRun["reader_report"] extends undefined ? never : NonNullable<ReviewRun["reader_report"]>["issues"]) => (
    <div className="mt-[10px]">
      <strong className="text-[13px] text-[var(--ink)]">{title}</strong>
      {!items.length ? <p className="mt-[4px] text-[12px] text-[var(--stone)]">本次未列出此类事项。</p> : null}
      {items.map((item) => (
        <div key={item.id} className="mt-[6px] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-[12px] text-[12px]">
          <span className="flex items-center gap-[6px]">
            <strong className="text-[12.8px] text-[var(--ink)]">{item.title}</strong>
            <Pill tone={item.status === "pending" ? "gray" : item.status === "issue" ? "rose" : "yellow"}>
              {REVIEW_STATUS_LABEL[item.status] ?? item.status}
            </Pill>
          </span>
          <p className="mt-[4px] text-[var(--slate)]">建议：{item.suggestion || "请结合原文核查。"}</p>
          <details className="mt-[4px] text-[11.5px]">
            <summary className="cursor-pointer text-[var(--link)]">查看说明与原文依据{item.page ? `（第 ${item.page} 页）` : ""}</summary>
            <p className="mt-[4px] text-[var(--slate)]">{item.detail}</p>
            {item.quote ? <blockquote className="mt-[4px] text-[var(--stone)]">{item.quote}</blockquote> : null}
          </details>
        </div>
      ))}
    </div>
  );

  return (
    <Shell title="预审报告" description="逐项回答指南要求；待核实不等于不合格，技术建议也不代表已确认先进性。">
      <Notice text={error} error />
      {!run ? <p className="text-[13px] text-[var(--steel)]">正在读取报告…</p> : null}
      {run ? (
        <div>
          <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-[16px] text-[12.5px]">
            <strong className="text-[13.5px] text-[var(--ink)]">{run.document?.metadata?.title || run.document?.filename}</strong>
            <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">
              <Pill tone={run.status === "completed" ? "mint" : run.status === "running" ? "sky" : "rose"}>
                {run.status === "completed" ? "已完成" : run.status === "running" ? "进行中" : "未完成"}
              </Pill>
              {run.status === "running" ? <span className="text-[var(--steel)]">{run.stage_label}</span> : null}
              {run.status === "completed" ? (
                <span className="text-[var(--steel)]">
                  问题 {summary.issue ?? 0} · 建议 {summary.warning ?? 0} · 待核实 {summary.pending ?? 0} · 通过 {summary.pass ?? 0}
                  {run.audit?.verification ? ` · 复核 ${run.audit.verification.completed}/${run.audit.verification.total}` : ""}
                </span>
              ) : null}
              <span className="flex-1" />
              {run.status === "completed" ? (
                <>
                  <a className="text-[var(--link)]" href={reviewExportUrl(run.id, "docx")}>下载 Word</a>
                  <a className="text-[var(--link)]" href={reviewExportUrl(run.id, "json")}>下载 JSON</a>
                </>
              ) : null}
            </div>
            {run.error ? <p role="alert" className="mt-[6px] text-[12.5px] text-[var(--red)]">{run.error}</p> : null}
            {run.rule ? <p className="mt-[6px] text-[11.5px] text-[var(--stone)]">
              清单：{run.rule.name} · {run.rule.year} · v{run.rule.version} · 模式：{run.request.mode === "historical" ? "历史评估" : "更新建议"} · 证据截止 {run.request.cutoff_date}
            </p> : null}
            {report ? <p className="mt-[8px] text-[12.5px] text-[var(--slate)]">{report.summary}</p> : null}
            {run.audit?.limitations?.length ? (
              <details className="mt-[8px] text-[11.5px]">
                <summary className="cursor-pointer text-[var(--link)]">查看本次审核的范围限制（{run.audit.limitations.length}）</summary>
                {run.audit.limitations.map((item, index) => <p key={index} className="mt-[3px] text-[var(--stone)]">{item}</p>)}
              </details>
            ) : null}
          </div>
          {report ? (
            <>
              {points("一、规范方面需要处理的问题", report.issues)}
              {points("二、研究方案的具体修改建议", report.technical)}
              {points("三、待补充材料与待核实事项", report.pending)}
              {report.missing_documents.length ? (
                <div className="mt-[10px] text-[12px]">
                  <strong>尚未提供的依据文件</strong>
                  <ul className="mt-[4px] list-disc pl-[18px] text-[var(--stone)]">
                    {report.missing_documents.map((name, index) => <li key={index}>{name}</li>)}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Shell>
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
