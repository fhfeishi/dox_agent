import { useEffect, useState } from "react";

type OcrConfig = { mode: string; language: string; modes: string[]; languages: string[] };

/** K4: runtime OCR mode/language. Changes only affect later imports. */
export function OcrSettings({ connected = true }: { connected?: boolean }) {
  const [config, setConfig] = useState<OcrConfig | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    fetch("/api/ocr-config").then(r => r.ok ? r.json() : Promise.reject(new Error())).then(setConfig)
      .catch(() => setNotice("OCR 配置暂不可用。"));
  }, []);
  async function update(mode: string, language: string) {
    try {
      const response = await fetch("/api/ocr-config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, language }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "保存失败");
      setConfig(payload);
      setNotice("已保存。仅影响后续导入；已入库文档需重新导入才生效。");
    } catch (e) { setNotice((e as Error).message); }
  }
  return <section className="space-y-2 text-sm">
    <h3 className="font-semibold">扫描件 OCR</h3>
    {!config
      ? <p className="text-xs text-stone-500" role="status">{notice || "正在读取 OCR 配置…"}</p>
      : <>
        <label className="grid gap-1 text-xs text-stone-500">OCR 模式
          <select className="rounded border p-1" value={config.mode} disabled={!connected} onChange={e => void update(e.target.value, config.language)}>
            <option value="auto">auto（仅无文本页）</option>
            <option value="force">force（始终 OCR）</option>
            <option value="off">off（仅文本层）</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-stone-500">识别语言
          <select className="rounded border p-1" value={config.language} disabled={!connected} onChange={e => void update(config.mode, e.target.value)}>
            {config.languages.map(language => <option key={language} value={language}>{language}</option>)}
          </select>
        </label>
        <p className="text-xs leading-5 text-stone-500" role="status">{notice || "仅影响后续导入；已入库文档需重新导入才生效。"}</p>
      </>}
  </section>;
}
