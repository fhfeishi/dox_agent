import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import {
  fetchReviewRules, reviewGuidelineFileUrl, saveReviewRule, uploadReviewGuidelines,
  REVIEW_EVIDENCE_NEED_LABEL, REVIEW_KIND_LABEL, REVIEW_MEASURES, REVIEW_SOURCE_LABEL,
  type ReviewCheck, type ReviewExecution, type ReviewKind, type ReviewRule,
} from "../reviewApi";
import { Button, Pill } from "./ui";
import { ReviewPageShell as Shell, ReviewNotice as Notice } from "./ReviewViews";

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
  if (!rule.name.trim()) problems.name = "请填写模板名称";
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

export function ReviewTemplates() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [uploadKind, setUploadKind] = useState<ReviewKind>("formal");
  const fileInput = useRef<HTMLInputElement>(null);
  const reload = () => fetchReviewRules().then(setRules).catch((cause) => setError((cause as Error).message));
  useEffect(() => { void reload(); }, []);
  const legacy = rules.filter((rule) => !rule.kind);

  async function upload(files: File[]) {
    setBusy("读取模板"); setError(""); setNotice("");
    try {
      const draft = await uploadReviewGuidelines(files, uploadKind);
      void navigate(`/review/templates/${encodeURIComponent(draft.id)}?edit=1`);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  async function classify(rule: ReviewRule, kind: ReviewKind) {
    try {
      await saveReviewRule({ ...strip(rule), kind, source_kind: rule.guideline_ids.length ? "upload" : "manual", confirmed: false });
      setNotice(`“${rule.name}”已归为${REVIEW_KIND_LABEL[kind]}模板并另存为草稿，请预览核对后启用。`);
      await reload();
    } catch (cause) { setError((cause as Error).message); }
  }

  return (
    <Shell title="审查模板" description="模板规定本次审查检查什么。内置示例只读，可复制后修改；也可在网页上新建，或上传文字要求由系统整理成草稿后核对。">
      <Notice text={error} error />
      <Notice text={notice} />
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <Button variant="primary" onClick={() => void navigate("/review/templates/new?kind=formal")}>新建形式模板</Button>
        <Button onClick={() => void navigate("/review/templates/new?kind=professional")}>新建专业模板</Button>
        <span className="mx-1 h-5 w-px bg-[var(--hairline-strong)]" />
        <label className="text-xs text-[var(--slate)]">上传为
          <select aria-label="上传模板类型" className="ml-2 rounded border border-[var(--hairline)] p-1" value={uploadKind} onChange={(e) => setUploadKind(e.target.value as ReviewKind)}>
            <option value="formal">形式模板</option><option value="professional">专业模板</option>
          </select>
        </label>
        <Button disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>{busy ? "正在整理要求…" : "上传文字模板"}</Button>
        <input ref={fileInput} aria-label="上传文字模板文件" type="file" multiple accept=".pdf,.doc,.docx,.md,.txt" className="hidden"
          onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void upload(files); }} />
        <span className="text-[11.5px] text-[var(--stone)]">支持 TXT、Markdown、DOCX、可提取文字的 PDF；整理结果是草稿，原文件与各条出处保留。</span>
      </div>
      {legacy.length ? (
        <section className="mb-6 rounded-xl border border-[#f2d98a] bg-[var(--tint-yellow)] p-4">
          <h2 className="text-sm font-semibold">旧版检查清单 · 需选择审查类型</h2>
          <p className="mt-1 text-xs text-[var(--slate)]">这些清单在通用模板之前建立，系统无法确定用于形式还是专业审查。选择后另存为新版本草稿，原清单内容不删除。</p>
          {legacy.map((rule) => (
            <div key={rule.id} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--canvas)] p-3 text-sm">
              <span className="min-w-0 flex-1">{rule.name} · {rule.checks.length} 项</span>
              <Button size="sm" onClick={() => void classify(rule, "formal")}>归为形式模板</Button>
              <Button size="sm" onClick={() => void classify(rule, "professional")}>归为专业模板</Button>
            </div>
          ))}
        </section>
      ) : null}
      {(["formal", "professional"] as ReviewKind[]).map((kind) => (
        <section key={kind} className="mb-6">
          <h2 className="mb-3 text-[15px] font-semibold">{REVIEW_KIND_LABEL[kind]}模板</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.filter((rule) => rule.kind === kind && !rule.archived).map((rule) => <TemplateTile key={rule.id} rule={rule} />)}
          </div>
        </section>
      ))}
    </Shell>
  );
}

function TemplateTile({ rule }: { rule: ReviewRule }) {
  return (
    <Link to={`/review/templates/${encodeURIComponent(rule.id)}`}
      className="block rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 hover:border-[var(--primary)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
      <span className="flex flex-wrap items-center gap-2">
        <strong className="text-[14px] text-[var(--ink)]">{rule.name}</strong>
        <Pill tone="lav">{REVIEW_SOURCE_LABEL[rule.source_kind ?? "manual"]}</Pill>
        <Pill tone={rule.confirmed ? "mint" : "yellow"}>{rule.confirmed ? "已启用" : "草稿"}</Pill>
      </span>
      <span className="mt-2 block text-xs text-[var(--steel)]">v{rule.version} · 启用 {rule.checks.filter((check) => check.enabled).length}/{rule.checks.length} 项 · {rule.checks.filter((c) => c.enabled).slice(0, 4).map((c) => c.title).join("、")}</span>
    </Link>
  );
}

export function ReviewTemplateDetail() {
  const { id = "" } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const back = search.get("back") ?? "";
  const [rules, setRules] = useState<ReviewRule[] | null>(null);
  const [draft, setDraft] = useState<ReviewRule | null>(null);
  const [baseline, setBaseline] = useState("");
  const [enable, setEnable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = rules?.find((rule) => rule.id === id) ?? null;
  const editing = draft !== null;
  const dirty = editing && JSON.stringify(draft) !== baseline;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search);

  useEffect(() => {
    void fetchReviewRules().then((list) => {
      setRules(list);
      if (id === "new") {
        const kind = (search.get("kind") === "professional" ? "professional" : "formal") as ReviewKind;
        const from = list.find((rule) => rule.id === search.get("from"));
        const start: ReviewRule = from
          ? { ...strip(structuredClone(from)), id: newId("tpl"), name: from.name + "（副本）", source_kind: from.source_kind === "upload" ? "upload" : "manual", version: 1, confirmed: false }
          : { id: newId("tpl"), kind, name: kind === "formal" ? "新形式审查模板" : "新专业审查模板", source_kind: "manual", fund: "", category: "", year: null,
            version: 1, scope_note: "", engine: "guideline", checks: [emptyCheck(kind)], missing_documents: [], extraction_notes: [], guideline_ids: [], confirmed: false };
        setDraft(start); setBaseline(""); setEnable(false);
      } else if (search.get("edit")) {
        const current = list.find((rule) => rule.id === id);
        if (current && current.source_kind !== "builtin") { setDraft(structuredClone(current)); setBaseline(JSON.stringify(current)); setEnable(current.confirmed); }
      }
    }).catch((cause) => setError((cause as Error).message));
  }, [id]);

  const rule = draft ?? saved;
  const problems = useMemo(() => (draft ? templateProblems(draft) : {}), [draft]);
  if (!rules) return <Shell title="审查模板" description="正在读取模板…"><Notice text={error} error /></Shell>;
  if (!rule) return <Shell title="审查模板" description="模板不存在或已删除。"><Link className="text-[var(--link)]" to="/review/templates">返回模板列表</Link></Shell>;
  const kind = (rule.kind ?? "formal") as ReviewKind;
  const workbench = `/review/${kind}${back ? "?" + back : ""}`;

  async function save(leaving = false) {
    if (!draft) return false;
    if (enable && Object.keys(problems).length) { setError("请先处理标注的问题再启用；也可以先保存为草稿。"); return false; }
    setBusy(true); setError("");
    try {
      const next = await saveReviewRule({ ...draft, confirmed: enable });
      setRules((old) => [...(old ?? []).filter((item) => item.id !== next.id), next]);
      setDraft(null); setBaseline("");
      setNotice(enable ? `已保存并启用 v${next.version}。` : `已保存为草稿 v${next.version}，启用后才能用于审查。`);
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
    <Shell title={editing ? "编辑模板" : "模板预览"} description={kind === "formal"
      ? "形式模板规定章节、字数、金额、日期与文字规范等检查要求；结果表示是否符合本模板，不代表官方合规。"
      : "专业模板列出本次需要评价的问题；每个启用的问题都会得到评价或被单列为未完成。"}>
      <Notice text={error} error />
      <Notice text={notice} />
      {blocker.state === "blocked" ? (
        <div role="alertdialog" aria-label="未保存的修改" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--orange)] bg-[var(--tint-peach)] p-4 text-sm">
          <span className="flex-1">模板有未保存的修改，离开前如何处理？</span>
          <Button variant="primary" onClick={() => { void save(true).then((ok) => (ok ? blocker.proceed?.() : blocker.reset?.())); }}>保存</Button>
          <Button onClick={() => blocker.proceed?.()}>舍弃修改</Button>
          <Button variant="ghost" onClick={() => blocker.reset?.()}>继续编辑</Button>
        </div>
      ) : null}
      <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <label className="min-w-0 flex-1 text-xs text-[var(--slate)]">模板名称
              <input aria-label="模板名称" className="mt-1 block w-full rounded-lg border border-[var(--hairline-strong)] px-3 py-2 text-[15px] font-semibold"
                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              {problems.name ? <span className="mt-1 block text-[var(--red)]">{problems.name}</span> : null}
            </label>
          ) : <h2 className="min-w-0 flex-1 text-xl font-semibold">{rule.name}</h2>}
          <Pill tone="lav">{REVIEW_KIND_LABEL[kind]}</Pill>
          <Pill tone="gray">{REVIEW_SOURCE_LABEL[rule.source_kind ?? "manual"]}</Pill>
          <Pill tone={editing ? "yellow" : rule.confirmed ? "mint" : "yellow"}>{editing ? (dirty ? "未保存" : "编辑中") : rule.confirmed ? `已启用 · v${rule.version}` : `草稿 · v${rule.version}`}</Pill>
        </div>
        {editing ? (
          <label className="mt-3 block text-xs text-[var(--slate)]">适用说明
            <textarea aria-label="适用说明" className="mt-1 block w-full rounded-lg border border-[var(--hairline)] p-2 text-sm" rows={2}
              value={draft.scope_note} onChange={(e) => setDraft({ ...draft, scope_note: e.target.value })} />
          </label>
        ) : <p className="mt-3 text-sm leading-6 text-[var(--slate)]">{rule.scope_note || "依据本模板开展审查。"}</p>}
        {rule.extraction_notes?.length ? <ul className="mt-3 list-disc pl-5 text-xs text-[var(--steel)]">{rule.extraction_notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : null}
        {rule.guideline_ids.length ? <p className="mt-2 text-xs">原始文件：{rule.guideline_ids.map((g, i) => <a key={g} className="mr-2 text-[var(--link)]" href={reviewGuidelineFileUrl(g)} target="_blank" rel="noreferrer">文件 {i + 1}</a>)}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} />保存后启用（可用于审查）</label>
            <span className="flex-1" />
            <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : enable ? "保存并启用" : "保存为草稿"}</Button>
            <Button onClick={() => { if (id === "new") void navigate(-1); else { setDraft(null); setBaseline(""); } }}>{dirty ? "放弃修改" : "退出编辑"}</Button>
          </> : <>
            {rule.confirmed ? <Button variant="primary" onClick={() => void navigate(workbench + (workbench.includes("?") ? "&" : "?") + "template=" + encodeURIComponent(rule.id))}>使用此版本</Button> : null}
            <Button onClick={() => void navigate(`/review/templates/new?from=${encodeURIComponent(rule.id)}${back ? "&back=" + encodeURIComponent(back) : ""}`)}>复制编辑</Button>
            {rule.source_kind !== "builtin" ? <Button onClick={() => { setDraft(structuredClone(rule)); setBaseline(JSON.stringify(rule)); setEnable(rule.confirmed); }}>编辑</Button> : null}
            <span className="flex-1" />
            <Link className="self-center text-sm text-[var(--link)]" to={back ? workbench : "/review/templates"}>{back ? "返回审查工作台" : "返回模板列表"}</Link>
          </>}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="模板目录" className="h-fit rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3 text-sm lg:sticky lg:top-4">
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
        <h3 className="flex-1 text-[15px] font-semibold">{check.title}</h3>
        {!check.enabled ? <Pill tone="gray">已停用</Pill> : null}
        <Pill tone={check.method === "calculation" ? "sky" : check.method === "model" ? "lav" : "gray"}>{measureLabel(check)}</Pill>
        {kind === "professional" && check.evidence_need ? <Pill tone="gray">{REVIEW_EVIDENCE_NEED_LABEL[check.evidence_need]}</Pill> : null}
      </div>
      <p className="mt-2 text-[14px] leading-6">{check.requirement}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--steel)]">{check.applicability}</p>
      {requirementLine(check) ? <p className="mt-2 inline-block rounded-md bg-[var(--tint-sky)] px-2 py-1 text-xs text-[#12609e]">执行参数：{requirementLine(check)}</p> : null}
      {check.execution?.field === "section_characters" ? (
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-[var(--link)]">查看计数说明</summary><p className="mt-1 text-[var(--slate)]">{COUNTING_NOTE}</p></details>
      ) : null}
      {check.revised && original ? (
        <p className="mt-2 rounded-lg bg-[var(--tint-yellow)] px-3 py-2 text-xs">原文要求：{original.requirement || "（无）"} ／ 本模板人工修订为：{check.requirement}。执行按修订后的要求；原文件只证明原始要求。</p>
      ) : null}
      <p className="mt-2 text-[11.5px] text-[var(--stone)]">来源：{check.source === "用户编写" ? "用户编写" : check.source}{check.page ? ` · 第 ${check.page} 页/块` : ""}</p>
      {check.quote ? <blockquote className="mt-1 border-l-2 border-[var(--hairline-strong)] pl-2 text-[11.5px] text-[var(--steel)]">{check.quote}</blockquote> : null}
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
  const input = "mt-1 block w-full rounded-lg border border-[var(--hairline)] px-2 py-1.5 text-sm";
  return (
    <article id={"check-" + check.id} className={`scroll-mt-4 rounded-xl border bg-[var(--canvas)] p-4 ${problem ? "border-[var(--red)]" : "border-[var(--hairline)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={check.enabled} onChange={(e) => onChange({ ...check, enabled: e.target.checked })} />启用</label>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => onMove(-1)}>上移</Button>
        <Button size="sm" variant="ghost" onClick={() => onMove(1)}>下移</Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>删除</Button>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--slate)]">条目名称<input aria-label={"条目名称：" + check.title} className={input} value={check.title} onChange={(e) => onChange({ ...check, title: e.target.value })} /></label>
        {kind === "formal" ? (
          <label className="text-xs text-[var(--slate)]">检查方式
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
          <label className="text-xs text-[var(--slate)]">证据需求
            <select aria-label={"证据需求：" + check.title} className={input} value={check.evidence_need ?? "internal"} onChange={(e) => onChange({ ...check, evidence_need: e.target.value as ReviewCheck["evidence_need"] })}>
              {Object.entries(REVIEW_EVIDENCE_NEED_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        )}
      </div>
      {spec && measure ? (
        <div className="mt-3 grid gap-3 rounded-lg bg-[var(--surface)] p-3 sm:grid-cols-3">
          {measure.kind === "section" || measure.kind === "interval" ? <label className="text-xs text-[var(--slate)]">{measure.kind === "section" ? "目标章节" : "进度计划章节"}
            <input aria-label={"目标章节：" + check.title} className={input} value={spec.section ?? ""} onChange={(e) => setSpec({ section: e.target.value })} /></label> : null}
          {measure.kind === "interval" ? <>
            <label className="text-xs text-[var(--slate)]">最早开始<input aria-label={"最早开始：" + check.title} type="date" className={input} value={spec.value} onChange={(e) => setSpec({ value: e.target.value })} /></label>
            <label className="text-xs text-[var(--slate)]">最晚结束<input aria-label={"最晚结束：" + check.title} type="date" className={input} value={spec.end ?? ""} onChange={(e) => setSpec({ end: e.target.value })} /></label>
          </> : (
            <label className="text-xs text-[var(--slate)]">{spec.operator === "eq" ? "要求值" : "上限（含）"} · {measure.unit}
              <input aria-label={"上限：" + check.title} inputMode="decimal" className={input} value={spec.value} onChange={(e) => setSpec({ value: e.target.value })} /></label>
          )}
          {measure.kind === "section" ? <p className="text-[11px] leading-5 text-[var(--steel)] sm:col-span-3">计数口径（只读）：{COUNTING_NOTE}</p> : null}
        </div>
      ) : null}
      <label className="mt-3 block text-xs text-[var(--slate)]">{kind === "formal" ? "要求说明" : "评价问题"}
        <textarea aria-label={"要求：" + check.title} rows={2} className={input} value={check.requirement} onChange={(e) => onChange({ ...check, requirement: e.target.value })} /></label>
      <label className="mt-2 block text-xs text-[var(--slate)]">{kind === "formal" ? "检查口径说明" : "期望的解释"}
        <input aria-label={"口径：" + check.title} className={input} value={check.applicability} onChange={(e) => onChange({ ...check, applicability: e.target.value })} /></label>
      {check.original?.requirement && check.original.requirement !== check.requirement ? <p className="mt-2 text-xs text-[#8a6a00]">原文要求：{check.original.requirement}（保存后标为人工修订）</p> : null}
      {problem ? <p role="alert" className="mt-2 text-xs text-[var(--red)]">{problem}</p> : null}
    </article>
  );
}
