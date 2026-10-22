import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import {
  applyReviewRule, deleteReviewRule, fetchReviewApplied, fetchReviewRules, reviewGuidelineFileUrl, saveReviewRule, uploadReviewGuidelines,
  REVIEW_EVIDENCE_NEED_LABEL, REVIEW_KIND_LABEL, REVIEW_MEASURES, REVIEW_SOURCE_LABEL,
  type ReviewApplied, type ReviewCheck, type ReviewExecution, type ReviewKind, type ReviewRule,
} from "../reviewApi";
import { Icon } from "./Icons";
import { Button, Pill } from "./ui";
import { ReviewPageShell as Shell, ReviewNotice as Notice } from "./review/ReviewLayout";
import { useAuth } from "../auth";
import { useLayout } from "../layout";

const COUNTING_NOTE = "正文去空白后按 Unicode 码点计数（中文、标点、字母、数字各计 1），不含标题；图片内文字不计入并标为覆盖不足。首版仅支持此口径。";

export function measureLabel(check: ReviewCheck) {
  if (check.method === "model") return "模型核查";
  if (check.method === "manual") return "需人工核查";
  const field = check.execution?.field;
  if (!field) return "未绑定计量";
  if (field === "section_characters") return "程序计数";
  if (field === "plan_interval") return "日期区间";
  if (field === "organizations") return "单位计数";
  if (field.startsWith("docx_")) return "格式核对";
  if (["total_budget", "application_budget", "budget"].includes(field)) return "金额核对";
  return "程序核对";
}

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Inline checks the server repeats; drafts may keep problems, enabling may not. */
export function templateProblems(rule: ReviewRule): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!rule.name.trim()) problems.name = "请填写模版名称";
  const sections = new Map<string, string>();
  for (const check of rule.checks) {
    if (!check.title.trim() || !check.requirement.trim()) { problems[check.id] = "请填写名称和要求"; continue; }
    if (!check.enabled || check.method !== "calculation") continue;
    const spec = check.execution;
    if (!spec) { problems[check.id] = "程序核对项需选择检查对象"; continue; }
    if (spec.field === "plan_interval") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.value) || !/^\d{4}-\d{2}-\d{2}$/.test(spec.end ?? "")) problems[check.id] = "请填写完整的起止日期";
      else if (spec.value > (spec.end ?? "")) problems[check.id] = "开始日期不能晚于结束日期";
    } else if (spec.field === "docx_font") {
      if (!spec.value.trim()) problems[check.id] = "请填写字体名称，如 宋体";
    } else if (!/^\d+(\.\d+)?$/.test(spec.value.trim())) problems[check.id] = "请填写非负数值";
    if (spec.field === "section_characters") {
      const name = (spec.section ?? "").trim();
      if (!name) problems[check.id] = "请填写目标章节";
      else if (sections.has(name)) problems[check.id] = `与“${sections.get(name)}”指向同一章节`;
      else sections.set(name, check.title);
    }
  }
  if (!rule.checks.some((check) => check.enabled)) problems.name = (problems.name ? problems.name + "；" : "") + "至少启用一个条目";
  return problems;
}

function emptyCheck(kind: ReviewKind): ReviewCheck {
  return kind === "formal"
    ? { id: newId("c"), title: "新章节", category: "篇幅与章节", requirement: "新章节不超过 500 个字符（含 500）", applicability: "统计该章节正文，不含标题与空白字符。",
      strength: "hard", method: "calculation", needed_materials: [], source: "用户编写", quote: "", page: null, enabled: true,
      execution: { field: "section_characters", operator: "le", value: "500", unit: "字符", section: "新章节", end: "", counting: "visible-codepoints-v1" } }
    : { id: newId("q"), title: "新评价问题", category: "新评价问题", requirement: "请描述需要评价的问题。", applicability: "说明原文主张、分析判断、证据与建议。",
      strength: "advisory", method: "model", needed_materials: [], source: "用户编写", quote: "", page: null, enabled: true, evidence_need: "internal", execution: null };
}

function strip(rule: ReviewRule): ReviewRule {
  const { scenario: _scenario, ...rest } = rule;
  void _scenario;
  return rest;
}

const UPLOAD_KINDS: { kind: ReviewKind; lead: string }[] = [
  { kind: "formal", lead: "章节、字数、金额、日期、单位数等硬性要求，逐条核对" },
  { kind: "professional", lead: "评审要点与评价问题，逐个给出评价与修改建议" },
];

export function ReviewTemplates() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [applied, setApplied] = useState<ReviewApplied>({ formal: null, professional: null });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [uploadKind, setUploadKind] = useState<ReviewKind>("formal");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const reload = () => Promise.all([fetchReviewRules().then(setRules), fetchReviewApplied().then(setApplied)])
    .catch((cause) => setError((cause as Error).message));
  useEffect(() => { void reload(); }, []);
  const legacy = rules.filter((rule) => !rule.kind);
  const admin = role === "admin";

  async function upload(files: File[]) {
    setBusy("读取模版"); setError(""); setNotice("");
    try {
      const draft = await uploadReviewGuidelines(files, uploadKind);
      void navigate(`/review/templates/${encodeURIComponent(draft.id)}?edit=1&generated=1`);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  async function remove(rule: ReviewRule) {
    if (!window.confirm(`删除审查模版“${rule.name}”？已完成的审查仍保留所用版本。`)) return;
    setError(""); setNotice("");
    try { await deleteReviewRule(rule.id); setNotice(`已删除“${rule.name}”。`); await reload(); }
    catch (cause) { setError((cause as Error).message); }
  }

  async function apply(rule: ReviewRule, on: boolean) {
    const kind = rule.kind as ReviewKind;
    setError(""); setNotice("");
    try {
      setApplied(await applyReviewRule(kind, on ? rule.id : null));
      setNotice(on ? `已应用“${rule.name}”：从现在起，新的${REVIEW_KIND_LABEL[kind]}默认使用此模版；已完成的审查不受影响。`
        : `已取消应用“${rule.name}”：新的${REVIEW_KIND_LABEL[kind]}改回内置模版。`);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function classify(rule: ReviewRule, kind: ReviewKind) {
    try {
      await saveReviewRule({ ...strip(rule), kind, source_kind: rule.guideline_ids.length ? "upload" : "manual", confirmed: false });
      setNotice(`“${rule.name}”已归为${REVIEW_KIND_LABEL[kind]}模版并另存为草稿，请预览核对后启用。`);
      await reload();
    } catch (cause) { setError((cause as Error).message); }
  }

  const take = (files: FileList | null | undefined) => { const list = Array.from(files ?? []); if (list.length && !busy) void upload(list); };

  return (
    <Shell title="审查模版" description="模版规定一次审查检查什么。上传规范或要求文档，系统整理成模版草稿；核对后应用，新的审查就默认按它来。">
      <Notice text={error} error />
      <Notice text={notice} />
      {/* Review templates are shared, so administrators maintain them (节点审查 D2); others read and choose. */}
      {!admin ? <p className="mb-5 text-body text-[var(--steel)]">审查模版由管理员维护；这里可以查看各模版检查什么，在审查时选用。</p> : <>
      <section aria-label="上传规范生成模版" className="mb-6 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-emphasis font-semibold text-[var(--ink)]">上传规范，自动生成审查模版</h2>
          <span className="text-caption text-[var(--stone)]">申报指南、评审办法、格式要求等均可，一次 1–5 份</span>
        </div>
        <div role="radiogroup" aria-label="生成哪种模版" className="mt-4 grid gap-2 sm:grid-cols-2">
          {UPLOAD_KINDS.map(({ kind, lead }) => {
            const on = uploadKind === kind;
            return <button key={kind} type="button" role="radio" aria-checked={on} onClick={() => setUploadKind(kind)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${on
                ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--canvas)] hover:border-[var(--primary)]"}`}>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={`grid size-[16px] place-items-center rounded-full border ${on ? "border-[var(--primary)]" : "border-[var(--hairline-strong)]"}`}>
                  {on ? <span className="size-[8px] rounded-full bg-[var(--primary)]" /> : null}
                </span>
                <b className="text-body text-[var(--ink)]">生成{REVIEW_KIND_LABEL[kind]}模版</b>
              </span>
              <span className="mt-1 block pl-6 text-caption text-[var(--slate)]">{lead}</span>
            </button>;
          })}
        </div>
        <button type="button" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files); }}
          className={`mt-3 flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging
            ? "border-[var(--primary)] bg-[var(--primary-soft-2)]" : "border-[var(--hairline-strong)] bg-[var(--canvas)] hover:border-[var(--primary)]"} disabled:cursor-progress`}>
          {busy ? <>
            <span className="text-body font-semibold text-[var(--primary-pressed)]">正在阅读规范、整理检查项…</span>
            <span className="text-caption text-[var(--stone)]">通常需要 1–2 分钟，完成后自动打开草稿供你核对</span>
          </> : <>
            <Icon name="upload" size={22} />
            <span className="text-body font-semibold text-[var(--ink)]">点击选择文件，或拖到这里</span>
            <span className="text-caption text-[var(--stone)]">TXT、Markdown、DOCX、可提取文字的 PDF · 生成的是草稿，每条都标出原文出处</span>
          </>}
        </button>
        <input ref={fileInput} aria-label="上传规范文件" type="file" multiple accept=".pdf,.doc,.docx,.md,.txt" className="hidden"
          onChange={(event) => { take(event.target.files); event.target.value = ""; }} />
        <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-[var(--slate)]">
          <li><b className="text-[var(--primary-pressed)]">①</b> 上传规范</li>
          <li><b className="text-[var(--primary-pressed)]">②</b> 核对草稿，保存并启用</li>
          <li><b className="text-[var(--primary-pressed)]">③</b> 应用：新的审查默认使用</li>
          <li className="text-[var(--stone)]">也可手动新建：
            <button type="button" className="text-[var(--link)]" onClick={() => void navigate("/review/templates/new?kind=formal")}>形式模版</button> ·{" "}
            <button type="button" className="text-[var(--link)]" onClick={() => void navigate("/review/templates/new?kind=professional")}>专业模版</button>
          </li>
        </ol>
      </section>
      {legacy.length ? (
        <section className="mb-6 rounded-xl border border-[var(--warn-line)] bg-[var(--tint-yellow)] p-4">
          <h2 className="text-body font-semibold">旧版检查清单 · 需选择审查类型</h2>
          <p className="mt-1 text-caption text-[var(--slate)]">这些清单在通用模版之前建立，系统无法确定用于形式还是专业审查。选择后另存为新版本草稿，原清单内容不删除。</p>
          {legacy.map((rule) => (
            <div key={rule.id} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--canvas)] p-3 text-body">
              <span className="min-w-0 flex-1">{rule.name} · {rule.checks.length} 项</span>
              <Button size="sm" onClick={() => void classify(rule, "formal")}>归为形式模版</Button>
              <Button size="sm" onClick={() => void classify(rule, "professional")}>归为专业模版</Button>
            </div>
          ))}
        </section>
      ) : null}
      </>}
      {(["formal", "professional"] as ReviewKind[]).map((kind) => {
        const list = rules.filter((rule) => rule.kind === kind && !rule.archived);
        const current = list.find((rule) => rule.id === applied[kind]) ?? list.find((rule) => rule.id === "builtin-" + kind);
        // The applied template leads, then the usable ones, drafts last.
        const order = (rule: ReviewRule) => (rule.id === current?.id ? 0 : rule.confirmed ? 1 : 2);
        return <section key={kind} className="mb-6">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-emphasis font-semibold">{REVIEW_KIND_LABEL[kind]}模版</h2>
            {current ? <span className="text-caption text-[var(--slate)]">新的{REVIEW_KIND_LABEL[kind]}默认使用：<b className="text-[var(--ink)]">{current.name}</b>
              {applied[kind] ? null : <span className="text-[var(--stone)]">（内置，未应用其他模版）</span>}</span> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...list].sort((a, b) => order(a) - order(b)).map((rule) => <TemplateTile key={rule.id} rule={rule} admin={admin}
              applied={rule.id === applied[kind]} onApply={(on) => void apply(rule, on)} onDelete={() => void remove(rule)} />)}
          </div>
        </section>;
      })}
    </Shell>
  );
}

/**
 * A template card: 预览 opens it on the right, 修改 opens its page, 删除 removes it (query 2026-1014 1737);
 * 应用 / 取消应用 decides whether new reviews of its kind start with it (query 2026-1021 1629). A draft
 * cannot be applied before it is checked and enabled, so it offers 核对并启用 instead.
 */
function TemplateTile({ rule, admin, applied, onApply, onDelete }: {
  rule: ReviewRule; admin: boolean; applied: boolean; onApply: (on: boolean) => void; onDelete: () => void;
}) {
  const { showInspector } = useLayout();
  const builtin = rule.id.startsWith("builtin-") || rule.source_kind === "builtin";
  const action = "rounded-md border border-[var(--hairline)] px-2.5 py-1 text-caption text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)]";
  return (
    <article className={`flex flex-col rounded-xl border bg-[var(--canvas)] p-4 hover:border-[var(--primary)] ${applied
      ? "border-[var(--primary)] shadow-[inset_3px_0_0_var(--primary)]" : "border-[var(--hairline)]"}`}>
      <button type="button" onClick={() => showInspector({ kind: "review-template", templateId: rule.id })} className="text-left">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-body text-[var(--ink)]">{rule.name}</strong>
          {applied ? <span className="rounded-[4px] bg-[var(--primary)] px-[7px] py-[2px] text-caption font-semibold text-white">应用中</span> : null}
          <Pill tone="lav">{REVIEW_SOURCE_LABEL[rule.source_kind ?? "manual"]}</Pill>
          {rule.confirmed ? null : <Pill tone="yellow">草稿 · 待核对</Pill>}
        </span>
        <span className="mt-2 block text-caption text-[var(--steel)]">v{rule.version} · 启用 {rule.checks.filter((check) => check.enabled).length}/{rule.checks.length} 项 · {rule.checks.filter((c) => c.enabled).slice(0, 4).map((c) => c.title).join("、")}</span>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {admin && rule.confirmed && !builtin ? (applied
          ? <button type="button" className={action} onClick={() => onApply(false)}>取消应用</button>
          : <Button size="sm" variant="primary" onClick={() => onApply(true)}>应用</Button>) : null}
        {admin && !rule.confirmed && !builtin ? <Link className={action} to={`/review/templates/${encodeURIComponent(rule.id)}?edit=1`}>核对并启用</Link> : null}
        <button type="button" className={action} onClick={() => showInspector({ kind: "review-template", templateId: rule.id })}>预览</button>
        <Link className={action} to={`/review/templates/${encodeURIComponent(rule.id)}`}>{admin ? "修改" : "查看全部条目"}</Link>
        {admin && !builtin ? <button type="button" className="rounded-md px-2 py-1 text-caption text-[var(--stone)] hover:text-[var(--red)]" onClick={onDelete}>删除</button> : null}
        {builtin ? <span className="text-caption text-[var(--stone)]">内置，未应用其他模版时默认使用；修改时另存为新模版</span> : null}
      </div>
    </article>
  );
}

export function ReviewTemplateDetail() {
  const { id = "" } = useParams();
  const { role } = useAuth();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const back = search.get("back") ?? "";
  const [rules, setRules] = useState<ReviewRule[] | null>(null);
  const [draft, setDraft] = useState<ReviewRule | null>(null);
  const [baseline, setBaseline] = useState("");
  const [enable, setEnable] = useState(false);
  // 应用 (query 2026-1021 1629): which template new reviews start with, and whether saving applies this one.
  const [applied, setApplied] = useState<ReviewApplied>({ formal: null, professional: null });
  const [applyOnSave, setApplyOnSave] = useState(false);
  const generated = Boolean(search.get("generated"));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = rules?.find((rule) => rule.id === id) ?? null;
  const editing = draft !== null;
  const dirty = editing && JSON.stringify(draft) !== baseline;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search);

  useEffect(() => { void fetchReviewApplied().then(setApplied).catch(() => undefined); }, []);
  useEffect(() => {
    void fetchReviewRules().then((list) => {
      setRules(list);
      if (id === "new") {
        const kind = (search.get("kind") === "professional" ? "professional" : "formal") as ReviewKind;
        const from = list.find((rule) => rule.id === search.get("from"));
        const start: ReviewRule = from
          ? { ...strip(structuredClone(from)), id: newId("tpl"), name: from.name + "（副本）", source_kind: from.source_kind === "upload" ? "upload" : "manual", version: 1, confirmed: false }
          : { id: newId("tpl"), kind, name: kind === "formal" ? "新形式审查模版" : "新专业审查模版", source_kind: "manual", fund: "", category: "", year: null,
            version: 1, scope_note: "", engine: "guideline", checks: [emptyCheck(kind)], missing_documents: [], extraction_notes: [], guideline_ids: [], confirmed: false };
        setDraft(start); setBaseline(""); setEnable(false);
      } else if (search.get("edit")) {
        const current = list.find((rule) => rule.id === id);
        if (current && current.source_kind !== "builtin") {
          setDraft(structuredClone(current)); setBaseline(JSON.stringify(current));
          // A draft just generated from uploaded rules: the page exists to check it, then use it.
          setEnable(current.confirmed || generated); setApplyOnSave(generated);
        }
      }
    }).catch((cause) => setError((cause as Error).message));
  }, [id]);

  const rule = draft ?? saved;
  const problems = useMemo(() => (draft ? templateProblems(draft) : {}), [draft]);
  if (!rules) return <Shell title="审查模版" description="正在读取模版…"><Notice text={error} error /></Shell>;
  if (!rule) return <Shell title="审查模版" description="模版不存在或已删除。"><Link className="text-[var(--link)]" to="/review/templates">返回模版列表</Link></Shell>;
  const kind = (rule.kind ?? "formal") as ReviewKind;
  const isApplied = applied[kind] === rule.id;
  async function toggleApplied(on: boolean) {
    setError(""); setNotice("");
    try {
      setApplied(await applyReviewRule(kind, on ? rule!.id : null));
      setNotice(on ? `已应用：新的${REVIEW_KIND_LABEL[kind]}默认使用此模版；已完成的审查不受影响。` : `已取消应用：新的${REVIEW_KIND_LABEL[kind]}改回内置模版。`);
    } catch (cause) { setError((cause as Error).message); }
  }
  const workbench = `/review/${kind}${back ? "?" + back : ""}`;

  async function save(leaving = false) {
    if (!draft) return false;
    if (enable && Object.keys(problems).length) {
      // Name the marked items and go to the first: a long generated draft hides them far below.
      const marked = draft.checks.filter((check) => problems[check.id]);
      setError(`请先处理 ${marked.length + (problems.name ? 1 : 0)} 处标注再启用${marked.length ? `：${marked.map((check) => `“${check.title}”${problems[check.id]}`).join("；")}` : `：${problems.name}`}。也可以先保存为草稿。`);
      if (marked.length) document.getElementById("check-" + marked[0].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    setBusy(true); setError("");
    try {
      const next = await saveReviewRule({ ...draft, confirmed: enable });
      setRules((old) => [...(old ?? []).filter((item) => item.id !== next.id), next]);
      setDraft(null); setBaseline("");
      const applyNow = enable && applyOnSave && next.kind;
      if (applyNow) setApplied(await applyReviewRule(next.kind as ReviewKind, next.id));
      setNotice(applyNow ? `已保存、启用并应用 v${next.version}：新的${REVIEW_KIND_LABEL[next.kind as ReviewKind]}默认使用此模版。`
        : enable ? `已保存并启用 v${next.version}。` : `已保存为草稿 v${next.version}，启用后才能用于审查。`);
      dirtyRef.current = false;
      if (!leaving) void navigate(`/review/templates/${encodeURIComponent(next.id)}${back ? "?back=" + encodeURIComponent(back) : ""}`, { replace: true });
      return true;
    } catch (cause) { setError((cause as Error).message + "；你的编辑仍保留在页面上。"); return false; } finally { setBusy(false); }
  }

  const update = (next: ReviewCheck) => setDraft((old) => old && { ...old, checks: old.checks.map((check) => (check.id === next.id ? next : check)) });
  const move = (index: number, delta: number) => setDraft((old) => {
    if (!old) return old;
    const checks = [...old.checks];
    const [item] = checks.splice(index, 1);
    checks.splice(Math.max(0, Math.min(checks.length, index + delta)), 0, item);
    return { ...old, checks };
  });

  return (
    <Shell title={editing ? "编辑模版" : "模版预览"} description={kind === "formal"
      ? "形式模版规定章节、字数、金额、日期与文字规范等检查要求；结果表示是否符合本模版，不代表官方合规。"
      : "专业模版列出本次需要评价的问题；每个启用的问题都会得到评价或被单列为未完成。"}>
      <Notice text={error} error />
      <Notice text={notice} />
      {blocker.state === "blocked" ? (
        <div role="alertdialog" aria-label="未保存的修改" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--orange)] bg-[var(--tint-peach)] p-4 text-body">
          <span className="flex-1">模版有未保存的修改，离开前如何处理？</span>
          <Button variant="primary" onClick={() => { void save(true).then((ok) => (ok ? blocker.proceed?.() : blocker.reset?.())); }}>保存</Button>
          <Button onClick={() => blocker.proceed?.()}>舍弃修改</Button>
          <Button variant="ghost" onClick={() => blocker.reset?.()}>继续编辑</Button>
        </div>
      ) : null}
      {editing && generated ? <p role="status" className="mb-4 rounded-xl border border-[var(--hairline)] bg-[var(--primary-soft)] px-4 py-3 text-body text-[var(--ink)]">
        已根据上传的规范生成草稿。请逐条核对要求与数值（每条下方标有原文出处），不需要的条目取消启用；确认后点下方“保存、启用并应用”。
      </p> : null}
      <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <label className="min-w-0 flex-1 text-caption text-[var(--slate)]">模版名称
              <input aria-label="模版名称" className="mt-1 block w-full rounded-lg border border-[var(--hairline-strong)] px-3 py-2 text-emphasis font-semibold"
                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              {problems.name ? <span className="mt-1 block text-[var(--red)]">{problems.name}</span> : null}
            </label>
          ) : <h2 className="min-w-0 flex-1 text-group font-semibold">{rule.name}</h2>}
          <Pill tone="lav">{REVIEW_KIND_LABEL[kind]}</Pill>
          <Pill tone="gray">{REVIEW_SOURCE_LABEL[rule.source_kind ?? "manual"]}</Pill>
          {isApplied && !editing ? <span className="rounded-[4px] bg-[var(--primary)] px-[7px] py-[2px] text-caption font-semibold text-white">应用中</span> : null}
          <Pill tone={editing ? "yellow" : rule.confirmed ? "mint" : "yellow"}>{editing ? (dirty ? "未保存" : "编辑中") : rule.confirmed ? `已启用 · v${rule.version}` : `草稿 · v${rule.version}`}</Pill>
        </div>
        {editing ? (
          <label className="mt-3 block text-caption text-[var(--slate)]">适用说明
            <textarea aria-label="适用说明" className="mt-1 block w-full rounded-lg border border-[var(--hairline)] p-2 text-body" rows={2}
              value={draft.scope_note} onChange={(e) => setDraft({ ...draft, scope_note: e.target.value })} />
          </label>
        ) : <p className="mt-3 text-body leading-6 text-[var(--slate)]">{rule.scope_note || "依据本模版开展审查。"}</p>}
        {rule.extraction_notes?.length ? <ul className="mt-3 list-disc pl-5 text-caption text-[var(--steel)]">{rule.extraction_notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : null}
        {rule.guideline_ids.length ? <p className="mt-2 text-caption">原始文件：{rule.guideline_ids.map((g, i) => <a key={g} className="mr-2 text-[var(--link)]" href={reviewGuidelineFileUrl(g)} target="_blank" rel="noreferrer">文件 {i + 1}</a>)}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? <>
            <label className="flex items-center gap-2 text-body"><input type="checkbox" checked={enable} onChange={(e) => { setEnable(e.target.checked); if (!e.target.checked) setApplyOnSave(false); }} />保存后启用（可用于审查）</label>
            <label className={`flex items-center gap-2 text-body ${enable ? "" : "text-[var(--stone)]"}`}><input type="checkbox" disabled={!enable} checked={enable && applyOnSave} onChange={(e) => setApplyOnSave(e.target.checked)} />并应用（新的{REVIEW_KIND_LABEL[kind]}默认使用）</label>
            <span className="flex-1" />
            <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : enable ? (applyOnSave ? "保存、启用并应用" : "保存并启用") : "保存为草稿"}</Button>
            <Button onClick={() => { if (id === "new") void navigate(-1); else { setDraft(null); setBaseline(""); } }}>{dirty ? "放弃修改" : "退出编辑"}</Button>
          </> : <>
            {rule.confirmed ? <Button variant="primary" onClick={() => void navigate(workbench + (workbench.includes("?") ? "&" : "?") + "template=" + encodeURIComponent(rule.id))}>用它审查一次</Button> : null}
            {role === "admin" && rule.confirmed && rule.source_kind !== "builtin"
              ? <Button onClick={() => void toggleApplied(!isApplied)}>{isApplied ? "取消应用" : "应用（新审查默认使用）"}</Button> : null}
            {role === "admin" ? <Button onClick={() => void navigate(`/review/templates/new?from=${encodeURIComponent(rule.id)}${back ? "&back=" + encodeURIComponent(back) : ""}`)}>复制编辑</Button> : null}
            {role === "admin" && rule.source_kind !== "builtin" ? <Button onClick={() => { setDraft(structuredClone(rule)); setBaseline(JSON.stringify(rule)); setEnable(rule.confirmed); }}>编辑</Button> : null}
            <span className="flex-1" />
            <Link className="self-center text-body text-[var(--link)]" to={back ? workbench : "/review/templates"}>{back ? "返回审查工作台" : "返回模版列表"}</Link>
          </>}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="模版目录" className="h-fit rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3 text-body lg:sticky lg:top-4">
          {rule.checks.map((check) => <a key={check.id} href={"#check-" + check.id} className={`block rounded px-2 py-1 ${check.enabled ? "text-[var(--ink)]" : "text-[var(--stone)] line-through"}`}>{check.title}</a>)}
        </nav>
        <div className="min-w-0 space-y-3">
          {rule.checks.map((check, index) => editing
            ? <CheckEditor key={check.id} kind={kind} check={check} problem={problems[check.id]} onChange={update}
              onMove={(delta) => move(index, delta)} onDelete={() => setDraft({ ...draft, checks: draft.checks.filter((item) => item.id !== check.id) })} />
            : <CheckPreview key={check.id} kind={kind} check={check} />)}
          {editing ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setDraft({ ...draft, checks: [...draft.checks, emptyCheck(kind)] })}>{kind === "formal" ? "新增章节字数检查" : "新增评价问题"}</Button>
              {kind === "formal" ? <Button onClick={() => setDraft({ ...draft, checks: [...draft.checks, { ...emptyCheck("formal"), title: "文字检查", category: "文字规范", requirement: "请描述需要检查的文字规范。", applicability: "模型核查，结果为校对建议，不作为资格判断。", strength: "advisory", method: "model", execution: null }] })}>新增文字核查项</Button> : null}
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function requirementLine(check: ReviewCheck) {
  const spec = check.execution;
  if (check.method !== "calculation" || !spec) return null;
  if (spec.field === "plan_interval") return `${spec.section || "项目计划"}应在 ${spec.value} 至 ${spec.end} 内（含首尾日）`;
  const measure = REVIEW_MEASURES.find((m) => m.field === spec.field);
  const target = spec.field === "section_characters" ? `“${spec.section}”正文` : measure?.label ?? spec.field;
  if (spec.operator === "eq") return `${target}应为 ${spec.value}${spec.unit === "磅" ? " 磅" : ""}`;
  return `${target}不超过 ${spec.value} ${spec.unit}（含 ${spec.value}）`;
}

function CheckPreview({ kind, check }: { kind: ReviewKind; check: ReviewCheck }) {
  const original = check.original;
  return (
    <article id={"check-" + check.id} className={`scroll-mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 ${check.enabled ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-emphasis font-semibold">{check.title}</h3>
        {!check.enabled ? <Pill tone="gray">已停用</Pill> : null}
        <Pill tone={check.method === "calculation" ? "sky" : check.method === "model" ? "lav" : "gray"}>{measureLabel(check)}</Pill>
        {kind === "professional" && check.evidence_need ? <Pill tone="gray">{REVIEW_EVIDENCE_NEED_LABEL[check.evidence_need]}</Pill> : null}
      </div>
      <p className="mt-2 text-body leading-6">{check.requirement}</p>
      <p className="mt-1 text-caption leading-5 text-[var(--steel)]">{check.applicability}</p>
      {requirementLine(check) ? <p className="mt-2 inline-block rounded-md bg-[var(--tint-sky)] px-2 py-1 text-caption text-[var(--info-fg)]">执行参数：{requirementLine(check)}</p> : null}
      {check.execution?.field === "section_characters" ? (
        <details className="mt-2 text-caption"><summary className="cursor-pointer text-[var(--link)]">查看计数说明</summary><p className="mt-1 text-[var(--slate)]">{COUNTING_NOTE}</p></details>
      ) : null}
      {check.revised && original ? (
        <p className="mt-2 rounded-lg bg-[var(--tint-yellow)] px-3 py-2 text-caption">原文要求：{original.requirement || "（无）"} ／ 本模版人工修订为：{check.requirement}。执行按修订后的要求；原文件只证明原始要求。</p>
      ) : null}
      <p className="mt-2 text-caption text-[var(--stone)]">来源：{check.source === "用户编写" ? "用户编写" : check.source}{check.page ? ` · 第 ${check.page} 页/块` : ""}</p>
      {check.quote ? <blockquote className="mt-1 border-l-2 border-[var(--hairline-strong)] pl-2 text-caption text-[var(--steel)]">{check.quote}</blockquote> : null}
    </article>
  );
}

function CheckEditor({ kind, check, problem, onChange, onMove, onDelete }: {
  kind: ReviewKind; check: ReviewCheck; problem?: string;
  onChange: (next: ReviewCheck) => void; onMove: (delta: number) => void; onDelete: () => void;
}) {
  const spec = check.execution;
  const measure = REVIEW_MEASURES.find((m) => m.field === spec?.field);
  const setSpec = (next: Partial<ReviewExecution>) => spec && onChange({ ...check, execution: { ...spec, ...next } });
  const input = "mt-1 block w-full rounded-lg border border-[var(--hairline)] px-2 py-1.5 text-body";
  return (
    <article id={"check-" + check.id} className={`scroll-mt-4 rounded-xl border bg-[var(--canvas)] p-4 ${problem ? "border-[var(--red)]" : "border-[var(--hairline)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-body"><input type="checkbox" checked={check.enabled} onChange={(e) => onChange({ ...check, enabled: e.target.checked })} />启用</label>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => onMove(-1)}>上移</Button>
        <Button size="sm" variant="ghost" onClick={() => onMove(1)}>下移</Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>删除</Button>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-caption text-[var(--slate)]">条目名称<input aria-label={"条目名称：" + check.title} className={input} value={check.title} onChange={(e) => onChange({ ...check, title: e.target.value })} /></label>
        {kind === "formal" ? (
          <label className="text-caption text-[var(--slate)]">检查方式
            <select aria-label={"检查方式：" + check.title} className={input} value={check.method === "calculation" ? spec?.field ?? "" : check.method}
              onChange={(e) => {
                const value = e.target.value;
                const next = REVIEW_MEASURES.find((m) => m.field === value);
                if (next) onChange({ ...check, method: "calculation", strength: "hard", execution: { field: next.field, operator: next.kind === "interval" ? "within" : next.field.startsWith("docx_") ? "eq" : "le", unit: next.unit,
                  value: next.kind === "interval" ? "" : spec?.value ?? "", end: "", section: next.kind === "number" ? "" : spec?.section || check.title, counting: "visible-codepoints-v1" } });
                else onChange({ ...check, method: value as ReviewCheck["method"], execution: null });
              }}>
              {REVIEW_MEASURES.map((m) => <option key={m.field} value={m.field}>程序核对 · {m.label}</option>)}
              <option value="model">模型核查（文字规范等，结果为建议）</option>
              <option value="manual">需人工核查（只列待核实）</option>
            </select>
          </label>
        ) : (
          <label className="text-caption text-[var(--slate)]">证据需求
            <select aria-label={"证据需求：" + check.title} className={input} value={check.evidence_need ?? "internal"} onChange={(e) => onChange({ ...check, evidence_need: e.target.value as ReviewCheck["evidence_need"] })}>
              {Object.entries(REVIEW_EVIDENCE_NEED_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        )}
      </div>
      {spec && measure ? (
        <div className="mt-3 grid gap-3 rounded-lg bg-[var(--surface)] p-3 sm:grid-cols-3">
          {measure.kind === "section" || measure.kind === "interval" ? <label className="text-caption text-[var(--slate)]">{measure.kind === "section" ? "目标章节" : "进度计划章节"}
            <input aria-label={"目标章节：" + check.title} className={input} value={spec.section ?? ""} onChange={(e) => setSpec({ section: e.target.value })} /></label> : null}
          {measure.kind === "interval" ? <>
            <label className="text-caption text-[var(--slate)]">最早开始<input aria-label={"最早开始：" + check.title} type="date" className={input} value={spec.value} onChange={(e) => setSpec({ value: e.target.value })} /></label>
            <label className="text-caption text-[var(--slate)]">最晚结束<input aria-label={"最晚结束：" + check.title} type="date" className={input} value={spec.end ?? ""} onChange={(e) => setSpec({ end: e.target.value })} /></label>
          </> : (
            <label className="text-caption text-[var(--slate)]">{spec.operator === "eq" ? "要求值" : "上限（含）"} · {measure.unit}
              <input aria-label={"上限：" + check.title} inputMode="decimal" className={input} value={spec.value} onChange={(e) => setSpec({ value: e.target.value })} /></label>
          )}
          {measure.kind === "section" ? <p className="text-caption leading-5 text-[var(--steel)] sm:col-span-3">计数口径（只读）：{COUNTING_NOTE}</p> : null}
        </div>
      ) : null}
      <label className="mt-3 block text-caption text-[var(--slate)]">{kind === "formal" ? "要求说明" : "评价问题"}
        <textarea aria-label={"要求：" + check.title} rows={2} className={input} value={check.requirement} onChange={(e) => onChange({ ...check, requirement: e.target.value })} /></label>
      <label className="mt-2 block text-caption text-[var(--slate)]">{kind === "formal" ? "检查口径说明" : "期望的解释"}
        <input aria-label={"口径：" + check.title} className={input} value={check.applicability} onChange={(e) => onChange({ ...check, applicability: e.target.value })} /></label>
      {check.original?.requirement && check.original.requirement !== check.requirement ? <p className="mt-2 text-caption text-[var(--warn-fg)]">原文要求：{check.original.requirement}（保存后标为人工修订）</p> : null}
      {problem ? <p role="alert" className="mt-2 text-caption text-[var(--red)]">{problem}</p> : null}
    </article>
  );
}
