import { useCallback, useEffect, useState } from "react";
import { extractTargets, fetchTargetJob, fetchTargetReports, type TargetReport } from "../api";
import { useApp } from "../store";
import { Button, Pill } from "./ui";

const DIMENSIONS = ["场景", "问题", "技术", "成果"] as const;
const PROCESS_LABEL: Record<string, string> = {
  未处理: "未处理", 处理中: "处理中", 已完成: "已完成", 未完成: "未完成",
};
const PROCESS_TONE: Record<string, "mint" | "yellow" | "rose" | "gray"> = {
  未处理: "gray", 处理中: "yellow", 已完成: "mint", 未完成: "rose",
};

/** 四维浏览：报告单元列表 + 四维标识。首批不做筛选，只区分“有内容 / 未提及 / 提取异常”。 */
export function TargetReports({ corpusId }: { corpusId: string }) {
  const { showInspector, showToast } = useApp();
  const [items, setItems] = useState<TargetReport[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchTargetReports(corpusId));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [corpusId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runExtraction(force: boolean) {
    const docIds = force && selectedDoc ? [selectedDoc] : [...selected];
    if (!docIds.length) return;
    setBusy(true);
    setError("");
    setProgress("已提交，正在提取…");
    try {
      const job = await extractTargets(corpusId, docIds, force);
      let last = job;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const current = await fetchTargetJob(corpusId, job.job_id);
        last = current;
        setProgress(current.status === "running"
          ? `提取中 · 已完成 ${current.completed} / 共 ${current.total}`
          : `已完成 ${current.completed} / 共 ${current.total}`
            + (current.errors.length
              ? ` · 失败 ${current.errors.length} 项：${current.errors.map((item) => item.error).join("、")}`
              : ""));
        if (current.status !== "running") break;
      }
      await load();
      // 不隐瞒失败：只有全部成功才提示更新完成。
      if (last.status === "done") showToast("四维信息已更新");
      else if (last.status === "partial") setError(`部分完成：成功 ${last.completed} / 共 ${last.total}，失败 ${last.errors.length} 项`);
      else setError(last.errors.map((item) => item.error).join("、") || "四维提取失败");
    } catch (e) {
      setError((e as Error).message);
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  const selectedRows = items.filter((item) => selected.has(item.doc_id));
  const coverage = selectedRows.length
    ? `已选 ${selectedRows.length} 份 · 覆盖 ${selectedRows.reduce((sum, item) => sum + item.process.coverage.processed, 0)}/${selectedRows.reduce((sum, item) => sum + item.process.coverage.total, 0)} 段`
    : "";

  return (
    <div className="mt-[14px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[14px] text-[13px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <h3 className="font-medium text-[var(--charcoal)]">四维浏览 · 报告单元 {items.length} 份</h3>
        <span className="flex-1" />
        <Button variant="primary" size="sm" disabled={busy || !selected.size}
          onClick={() => void runExtraction(false)}>
          {busy ? "正在提取…" : `生成四维信息${selected.size ? `（${selected.size}）` : ""}`}
        </Button>
        {selectedDoc ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void runExtraction(true)}>
            重新提取所选
          </Button>
        ) : null}
      </div>
      <p className="mt-[6px] text-[11.5px] text-[var(--stone)]">
        提取会调用模型并按解析正文分段处理；勾选资料后按需生成，打开页面不会自动对全库提取。{coverage}
      </p>
      {error ? <p role="alert" className="mt-[8px] text-[12px] text-[var(--red)]">{error}</p> : null}
      {progress ? <p role="status" className="mt-[8px] text-[11.5px] text-[var(--steel)]">{progress}</p> : null}

      <ul className="mt-[10px] space-y-[6px]">
        {items.map((item) => (
          <li key={item.doc_id}
            className={`rounded-[10px] border p-[10px] ${selectedDoc === item.doc_id
              ? "border-[var(--primary)]" : "border-[var(--hairline)]"}`}>
            <div className="flex items-start gap-[8px]">
              <input type="checkbox" aria-label={`选择 ${item.title}`} checked={selected.has(item.doc_id)} disabled={busy}
                onChange={(event) => {
                  setSelectedDoc(item.doc_id);
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(item.doc_id);
                    else next.delete(item.doc_id);
                    return next;
                  });
                }} />
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--charcoal)]" title={item.source_name}>
                {item.title}
              </span>
              <Pill tone={PROCESS_TONE[item.process.status] ?? "gray"}>{PROCESS_LABEL[item.process.status] ?? item.process.status}</Pill>
              {item.stale ? <Pill tone="yellow">待更新</Pill> : null}
            </div>
            <div className="mt-[8px] flex flex-wrap items-center gap-[6px]">
              {DIMENSIONS.map((key) => {
                const facet = item.facets[key];
                const hasContent = facet?.state === "has";
                const label = hasContent
                  ? "有内容"
                  : item.process.status === "未处理"
                    ? "未处理"
                    : facet?.state === "异常" ? "提取异常" : "未提及";
                return (
                  <button key={key} type="button" disabled={!hasContent || item.process.status === "未处理"}
                    onClick={() => showInspector({ kind: "target", corpusId, docId: item.doc_id, index: DIMENSIONS.indexOf(key) })}
                    className={`rounded-full px-[9px] py-[3px] text-[11.5px] ${hasContent
                      ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)] hover:bg-[var(--primary-soft-2)]"
                      : "border border-dashed border-[var(--hairline-strong)] text-[var(--stone)] disabled:cursor-default"}`}>
                    {key}：{label}
                  </button>
                );
              })}
              <span className="ml-auto text-[11px] text-[var(--stone)]">
                处理覆盖 {item.process.coverage.processed}/{item.process.coverage.total} 段
              </span>
            </div>
          </li>
        ))}
        {!items.length ? <li className="text-[12px] text-[var(--stone)]">当前没有可检索资料。</li> : null}
      </ul>
    </div>
  );
}
