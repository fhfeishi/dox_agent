import { useEffect, useState } from "react";
import { fetchCorpusOcr, ingestCorpus, setCorpusOcr, type CorpusOcr } from "./api";

/** K12: per-corpus OCR mode/language with an explicit "re-import and apply" action. */
export function CorpusOcrSettings({ corpusId, onChanged, onIngested }: {
  corpusId: string; onChanged: () => void; onIngested: () => void;
}) {
  const [ocr, setOcr] = useState<CorpusOcr | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { fetchCorpusOcr(corpusId).then(setOcr).catch(() => setNotice("解析设置不可用。")); }, [corpusId]);

  async function change(mode: string, language: string) {
    try { setBusy(true); setNotice(""); setOcr(await setCorpusOcr(corpusId, mode, language)); onChanged(); }
    catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  async function reimport() {
    try {
      setBusy(true); setNotice("");
      await ingestCorpus(corpusId, true);
      setOcr(await fetchCorpusOcr(corpusId));
      onChanged(); onIngested();
      setNotice("已提交重新导入（全量重解析，版本会变化）。");
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }

  if (!ocr) return <p className="text-xs text-stone-400" role="status">{notice || "读取解析设置…"}</p>;
  const status = ocr.stale ? "语言已改，需重新导入" : ocr.applied_language ? `已用 ${ocr.applied_language} 解析` : ocr.unknown ? "解析语言未知" : "尚未导入";
  return <div className="space-y-1 text-xs">
    <div className="flex flex-wrap items-center gap-1">
      <select aria-label="OCR 模式" className="rounded border px-1 py-0.5" value={ocr.mode} disabled={busy} onChange={e => void change(e.target.value, ocr.language)}>
        <option value="auto">auto</option><option value="force">force</option><option value="off">off</option>
      </select>
      <select aria-label="OCR 语言" className="rounded border px-1 py-0.5" value={ocr.language} disabled={busy} onChange={e => void change(ocr.mode, e.target.value)}>
        {ocr.languages.map(language => <option key={language} value={language}>{language}</option>)}
      </select>
      <button className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={busy} onClick={() => void reimport()}>重新导入并应用</button>
    </div>
    <p className={ocr.stale ? "text-amber-700" : "text-stone-400"} role="status">{busy ? "处理中…" : notice || status}</p>
  </div>;
}
