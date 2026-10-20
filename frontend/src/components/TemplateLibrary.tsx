import { useEffect, useRef, useState } from "react";
import { archiveCustomTemplate, copyTemplate, deleteCustomTemplate, fetchTemplates, restoreCustomTemplate, saveTemplateDraft, templateArea, uploadIntelligenceInput, type TemplateArea, type TemplateSummary } from "../api";
import { extractTemplate } from "../templateOutline";
import { useApp } from "../store";
import { TEMPLATES_CHANGED, sectionsOf, statusLabel } from "./TemplatePanels";
import { Pill } from "./ui";


const BASE: Record<TemplateArea, string> = { analysis: "comprehensive", intelligence: "intelligence" };
const LIMIT = 20000;
const stripExtension = (name: string) => name.replace(/\.(md|markdown|txt|docx|doc|pdf)$/i, "").slice(0, 80);

/** Text of an uploaded file: plain text is read here; Word and PDF are read by the server. */
export async function readText(file: File): Promise<string> {
  if (/\.(md|markdown|txt)$/i.test(file.name)) return (await file.text()).trim();
  return (await uploadIntelligenceInput(file, true)).text.trim();
}

/**
 * The report templates of one area as cards (query 2026-1014 1737 / 1820): 存量分析 and 情报分析 each
 * list only their own. Anyone may 新建 (a copy of the area's built-in template to edit), 上传 (Word,
 * PDF, Markdown or text; chapters are extracted from the headings), 预览, 修改 and 删除. Built-in
 * templates are read only — modifying one saves a copy. A deleted published template is archived so
 * reports already written with it keep their version, and can be restored.
 */
export function TemplateLibrary({ area }: { area: TemplateArea }) {
  const { showInspector } = useApp();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = () => fetchTemplates(undefined, true).then((all) => setTemplates(all.filter((t) => templateArea(t) === area))).catch(() => setTemplates([]));
  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener(TEMPLATES_CHANGED, reload);
    return () => window.removeEventListener(TEMPLATES_CHANGED, reload);
  }, [area]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  const create = () => run(async () => {
    const copy = await copyTemplate(BASE[area]);
    await load();
    showInspector({ kind: "template", templateId: copy.id, edit: true });
    setMessage(`已新建“${copy.name}”，请在右侧修改名称与章节后发布`);
  });
  const uploaded = (file: File) => run(async () => {
    const raw = await readText(file);
    if (!raw) throw new Error("上传的文件没有可读取的文字");
    const name = stripExtension(file.name) || "上传的模板";
    const extracted = extractTemplate(raw, name);
    if (extracted.content.length > LIMIT) throw new Error(`提取后约 ${extracted.content.length} 字，超过 ${LIMIT} 字上限，请精简后上传`);
    const copy = await copyTemplate(BASE[area]);
    const variables = [...new Set([...extracted.content.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];
    const saved = await saveTemplateDraft(copy.id, copy.revision, { name, content: extracted.content, purpose: `上传自 ${file.name}`, variables });
    await load();
    showInspector({ kind: "template", templateId: saved.id, edit: true });
    setMessage(extracted.extracted ? `已从“${file.name}”提取 ${extracted.sections} 个章节，生成模板草稿“${saved.name}”，请在右侧核对后发布`
      : `“${file.name}”中没有识别出章节标题，已保留全文为模板草稿“${saved.name}”，请在右侧整理章节后发布`);
  });
  const remove = (template: TemplateSummary) => run(async () => {
    if (!window.confirm(`删除模板“${template.name}”？${template.version ? "已生成的报告仍保留所用版本，可在“已删除”中恢复。" : ""}`)) return;
    if (template.version) await archiveCustomTemplate(template.id); else await deleteCustomTemplate(template.id);
    setMessage(`已删除模板“${template.name}”`);
    await load();
  });
  const restore = (template: TemplateSummary) => run(async () => {
    await restoreCustomTemplate(template.id); await load(); setMessage(`已恢复“${template.name}”`);
  });

  const archived = (t: TemplateSummary) => Boolean(t.archived) || t.status === "archived";
  const live = templates.filter((t) => !archived(t));
  const gone = templates.filter(archived);
  const action = "rounded-[6px] border border-[var(--hairline)] px-[9px] py-[4px] text-caption text-[var(--slate)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-45";
  return <section aria-label={area === "analysis" ? "报告模板库" : "情报分析模板库"} className="space-y-[10px]">
    <div className="flex flex-wrap items-center gap-[8px]">
      <h2 className="text-emphasis font-semibold text-[var(--ink)]">{area === "analysis" ? "报告模板" : "情报分析模板"} · {live.length}</h2>
      <span className="text-caption text-[var(--stone)]">{area === "analysis" ? "专项报告按所选模板的章节大纲生成" : "情报分析报告按所选模板的章节生成"}</span>
      <span className="flex-1" />
      <button type="button" className={action} disabled={busy} onClick={() => void create()}>新建模板</button>
      <button type="button" className={action} disabled={busy} title="支持 Word、PDF、Markdown、文本；自动提取章节大纲" onClick={() => input.current?.click()}>上传文档提取模板</button>
      {gone.length ? <button type="button" className={action} onClick={() => setShowArchived(!showArchived)}>{showArchived ? "收起已删除" : `已删除 · ${gone.length}`}</button> : null}
      <input ref={input} type="file" accept=".md,.markdown,.txt,.docx,.pdf" className="hidden" aria-label={area === "analysis" ? "上传报告模板文件" : "上传情报分析模板文件"}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploaded(file); }} />
    </div>
    {message ? <p role="status" className="text-body text-[var(--steel)]">{message}</p> : null}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[10px]">
      {live.map((t) => {
        const sections = sectionsOf(t.content);
        const custom = t.kind === "custom";
        return <article key={t.id} className="flex flex-col gap-[6px] rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-[12px]">
          <button type="button" onClick={() => showInspector({ kind: "template", templateId: t.id })} className="flex flex-col gap-[6px] text-left">
            <span className="flex flex-wrap items-center gap-[6px] text-body font-semibold text-[var(--ink)]">{t.name}<Pill tone={custom ? "lav" : "sky"}>{statusLabel(t)}</Pill></span>
            <span className="line-clamp-2 text-caption leading-[1.5] text-[var(--steel)]">{sections.length ? `${sections.length} 节：${sections.join(" · ")}` : t.purpose || "无章节"}</span>
          </button>
          <div className="mt-auto flex flex-wrap items-center gap-[6px] pt-[4px]">
            <button type="button" className={action} onClick={() => showInspector({ kind: "template", templateId: t.id })}>预览</button>
            <button type="button" className={action} onClick={() => showInspector({ kind: "template", templateId: t.id, edit: true })}>修改</button>
            {custom ? <button type="button" className="rounded-[6px] px-[7px] py-[4px] text-caption text-[var(--stone)] hover:text-[var(--red)] disabled:opacity-45" disabled={busy} onClick={() => void remove(t)}>删除</button>
              : <span className="text-caption text-[var(--stone)]">内置，不可删除；修改时另存为新模板</span>}
          </div>
        </article>;
      })}
    </div>
    {showArchived && gone.length ? <ul aria-label="已删除的模板" className="space-y-[6px] rounded-[10px] border border-dashed border-[var(--hairline-strong)] p-[12px] text-body">
      {gone.map((t) => <li key={t.id} className="flex items-center gap-[8px]">
        <button type="button" className="text-left text-[var(--link)] hover:underline" onClick={() => showInspector({ kind: "template", templateId: t.id })}>{t.name}</button>
        <span className="text-[var(--stone)]">v{t.version}</span>
        <button type="button" className={action} disabled={busy} onClick={() => void restore(t)}>恢复</button>
      </li>)}
    </ul> : null}
  </section>;
}
