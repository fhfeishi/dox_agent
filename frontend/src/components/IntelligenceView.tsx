import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { useApp } from "../store";
import { copyTemplate, saveTemplateDraft, publishTemplate, fetchTemplates, fetchTemplate } from "../api";
import { Button } from "./ui";

type Input = { input_id: string; filename: string; version: string; text: string };
const PURPOSES = [["comprehensive", "综合情报报告"], ["background", "技术背景"], ["research", "国内外研究现状"], ["feasibility", "可行性"], ["weakness", "痛点与薄弱点"]];
const TEMPLATE = `# 情报分析报告

## 结论摘要
## 技术背景
## 国内外研究现状
## 与已有项目的对比
## 可行性条件
## 痛点与薄弱点
## 建议补充资料
## 来源与分析局限`;

async function responseJson(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : "操作未完成，请重试");
  return value;
}
export function IntelligenceView() {
  const { corpora, corpusIds, workspace, showInspector } = useApp();
  const [inputs, setInputs] = useState<Input[]>([]);
  const [purpose, setPurpose] = useState("comprehensive");
  const [corpus, setCorpus] = useState("");
  const [template, setTemplate] = useState(TEMPLATE);
  const [templateId, setTemplateId] = useState("intelligence");
  const [templateVersion, setTemplateVersion] = useState<number | undefined>(0);
  const templates = useQuery({ queryKey: ["templates", "published"], queryFn: () => fetchTemplates() });
  const [templateInput, setTemplateInput] = useState<Input | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [resultId, setResultId] = useState("");
  const chosenCorpus = corpus || corpusIds[0] || corpora[0]?.id || "";
  async function upload(files: FileList | null, isTemplate = false) {
    if (!files) return;
    if (!isTemplate && inputs.length + files.length > 6) { setError("一次最多选择 6 份外部材料"); return; }
    setBusy("保存并读取材料"); setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append("file", file);
        const saved: Input = await responseJson(await fetch("/api/intelligence/inputs", { method: "POST", body: form }));
        if (isTemplate) { setTemplate(saved.text); setTemplateInput(saved); setTemplateId(""); setTemplateVersion(undefined); }
        else setInputs((old) => [...old, saved]);
      }
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  async function analyze() {
    setBusy("正在核对外部材料与资料库，完成后自动保存报告"); setError("");
    try {
      const result = await responseJson(await fetch("/api/intelligence/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_ids: inputs.map((item) => item.input_id), corpus_id: chosenCorpus,
          purpose, template, template_id: templateId || null, template_version: templateVersion ?? null, input_template_id: templateInput?.input_id ?? null, session_key: workspace.active || "" }),
      }));
      setResultId(result.artifact_id);
      window.dispatchEvent(new Event("dox-artifacts-changed"));
      showInspector({ kind: "artifact", artifactId: result.artifact_id });
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  async function saveTemplate() {
    setBusy("保存我的报告模板"); setError("");
    try {
      const copied = await copyTemplate("intelligence");
      const draft = await saveTemplateDraft(copied.id, copied.revision, { name: "我的情报报告模板", content: template, variables: [] });
      const published = await publishTemplate(draft.id, draft.revision);
      setTemplateId(published.id); setTemplateVersion(published.version);
      await templates.refetch();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  return <section className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas)]">
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
      <header><p className="text-xs font-semibold tracking-widest text-[var(--primary)]">外部信息 × 已有项目</p><h1 className="mt-2 text-3xl font-semibold">情报分析</h1><p className="mt-3 text-sm leading-6 text-[var(--steel)]">上传技术说明或方案，选择一个分析目的，得到有依据的整理报告。外部材料不会自动进入资料库。</p></header>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6">
          <h2 className="font-semibold">1 · 选择外部材料</h2><p className="my-3 text-xs leading-6 text-[var(--steel)]">支持多份 PDF、Word、Markdown 或文本；替换文件保留旧报告引用的版本。未被成果引用的暂存材料保留 7 天。</p>
          <label className="block cursor-pointer rounded-xl border border-dashed border-[var(--primary)] bg-[var(--primary-soft)] p-6 text-center text-sm font-medium text-[var(--primary)]">点击选择文件<input aria-label="上传外部材料" className="mt-3 block w-full text-xs" type="file" multiple accept=".pdf,.doc,.docx,.md,.txt" disabled={Boolean(busy)} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>
          <div className="mt-4 space-y-2">{inputs.map((input) => <div key={input.input_id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><button className="text-left text-sm text-[var(--primary)]" onClick={() => showInspector({ kind: "input", inputId: input.input_id })}>{input.filename}</button><button className="text-xs text-[var(--steel)]" disabled={Boolean(busy)} onClick={() => setInputs((old) => old.filter((item) => item.input_id !== input.input_id))}>移出本次选择</button></div><p className="mt-1 text-xs text-[var(--steel)]">{input.text.length.toLocaleString()} 字符 · 点击核对正文</p></div>)}</div>
        </section>
        <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6">
          <h2 className="font-semibold">2 · 选择分析目的</h2><div className="my-4 grid grid-cols-2 gap-2">{PURPOSES.map(([key, label]) => <button key={key} aria-pressed={purpose === key} disabled={Boolean(busy)} onClick={() => setPurpose(key)} className="rounded-xl border p-3 text-left text-sm" style={{ borderColor: purpose === key ? "var(--primary)" : "var(--hairline)", background: purpose === key ? "var(--primary-soft)" : "transparent" }}>{label}</button>)}</div>
          <label className="block text-sm">对照资料库<select aria-label="情报分析资料库" className="mt-2 w-full rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-3" value={chosenCorpus} disabled={Boolean(busy)} onChange={(e) => setCorpus(e.target.value)}>{corpora.filter((item) => !item.missing).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <p className="mt-3 text-xs leading-6 text-[var(--steel)]">本次材料自述与库内证据分别呈现。没有国外资料或相近项目时会明确提示，不据此判断原创或领先。</p>
        </section>
      </div>
      <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">3 · 确认报告模板</h2><label className="cursor-pointer text-sm text-[var(--primary)]">上传自己的模板<input aria-label="上传情报报告模板" className="mt-2 block text-xs" type="file" accept=".docx,.doc,.pdf,.md,.txt" disabled={Boolean(busy)} onChange={(e) => { void upload(e.target.files, true); e.target.value = ""; }} /></label></div>
        <div className="my-4 flex flex-wrap gap-3">
          <select aria-label="选择报告模板" className="rounded border p-2 text-sm" value={templateId} disabled={Boolean(busy)} onChange={(e) => {
            const ident = e.target.value; if (!ident) return; setBusy("读取报告模板");
            void fetchTemplate(ident).then((value) => { setTemplateId(value.id); setTemplateVersion(value.version); setTemplate(value.content); setTemplateInput(null); })
              .catch((error) => setError(error.message)).finally(() => setBusy(""));
          }}><option value="">本次临时章节</option>{(templates.data ?? []).filter((item) => item.status === "published").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Button size="sm" variant="ghost" disabled={Boolean(busy) || !template.trim()} onClick={() => void saveTemplate()}>保存为我的模板</Button>
        </div>
        <p className="my-3 text-xs text-[var(--steel)]">{templateInput ? templateInput.filename : "使用默认综合研判模板"} · 正文与模板版本随本次结果保存。</p>
        <details><summary className="cursor-pointer text-sm text-[var(--primary)]">预览和调整报告章节</summary><textarea aria-label="情报报告模板" disabled={Boolean(busy)} value={template} onChange={(e) => { setTemplate(e.target.value); setTemplateId(""); setTemplateVersion(undefined); }} className="mt-3 min-h-52 w-full rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-3 text-sm" /></details>
      </section>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-4"><Button disabled={Boolean(busy) || !inputs.length || !chosenCorpus || !template.trim()} onClick={() => void analyze()}>生成分析报告</Button><p role="status" className="text-sm text-[var(--steel)]">{busy || "完成后自动进入存量分析的分析成果"}</p>{resultId ? <Button variant="ghost" onClick={() => showInspector({ kind: "artifact", artifactId: resultId })}>查看本次报告</Button> : null}</div>
    </div>
  </section>;
}

export function ExternalInputView({ inputId }: { inputId: string }) {
  const result = useQuery({ queryKey: ["external-input", inputId], queryFn: async ({ signal }): Promise<Input> =>
    responseJson(await fetch("/api/intelligence/inputs/" + encodeURIComponent(inputId), { signal })) });
  return <div className="p-4">{result.error ? <p role="alert">{result.error.message}</p> : result.data ? <>
    <h3 className="font-semibold">{result.data.filename}</h3><p className="my-2 text-xs text-[var(--steel)]">外部材料自述 · 原输入版本保留</p>
    <div className="markdown"><Markdown>{result.data.text}</Markdown></div></> : <p>正在读取原输入…</p>}</div>;
}
