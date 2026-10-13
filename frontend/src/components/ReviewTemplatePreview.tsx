import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchReviewRules, REVIEW_METHOD_LABEL, type ReviewRule } from "../reviewApi";

export function ReviewTemplatePreview({ templateId }: { templateId: string }) {
  const [rule, setRule] = useState<ReviewRule | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setRule(null); setError("");
    void fetchReviewRules().then((items) => {
      if (!active) return;
      const found = items.find((r) => r.id === templateId);
      if (found) setRule(found); else setError("模板不存在或已移除");
    }, (cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [templateId]);
  if (error) return <p role="alert">{error}</p>;
  if (!rule) return <p>正在读取模板…</p>;
  return <section aria-label="审查模板预览">
    <h2 className="text-lg font-semibold">{rule.name}</h2>
    <p className="mt-2 text-xs text-[var(--steel)]">{rule.kind === "formal" ? "形式审查" : "专业审查"} · 版本 {rule.version} · {rule.checks.filter((c) => c.enabled).length} 项启用</p>
    <p className="my-3 text-sm leading-6">{rule.scope_note}</p>
    {rule.checks.map((c) => <article key={c.id} className="mb-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4">
      <h3 className="text-sm font-semibold">{c.title}{!c.enabled ? "（未启用）" : ""}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{c.requirement}</p>
      <p className="mt-2 text-xs text-[var(--steel)]">{REVIEW_METHOD_LABEL[c.method] ?? c.method} · {c.source}</p>
      {c.execution?.field === "section_characters" ? <p className="mt-2 text-xs">仅计章节正文，去空白，按 Unicode 字符计数。</p> : null}
      {c.revised ? <p className="mt-2 text-xs text-[var(--orange)]">已人工修订，请核对当前要求。</p> : null}
    </article>)}
    <Link to={`/review/templates/${encodeURIComponent(rule.id)}`} className="text-sm text-[var(--link)]">进入模板管理与编辑 →</Link>
  </section>;
}
