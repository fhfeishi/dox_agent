import { useEffect, useState } from "react";
import { fetchTargetDetail, type TargetDetail, type TargetEvidence } from "../api";
import { useApp } from "../store";
import { Pill } from "./ui";

/** 报告详情：四个分区 + 原文明示关联 + 证据定位（版本不符显示“资料已更新”）。 */
export function TargetReportView({ corpusId, docId }: { corpusId: string; docId: string }) {
  const { inspectorTarget, showInspector } = useApp();
  const index = inspectorTarget.kind === "target" ? inspectorTarget.index : 0;
  const [detail, setDetail] = useState<TargetDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError("");
    void fetchTargetDetail(corpusId, docId)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch(() => { if (!cancelled) setError("资料已更新或四维信息不可读"); });
    return () => { cancelled = true; };
  }, [corpusId, docId]);

  if (error) return <p role="alert" className="text-[12.5px] text-[var(--red)]">{error}</p>;
  if (!detail) return <p className="text-[12.5px] text-[var(--steel)]">正在读取四维信息…</p>;

  const active = detail.facets[index] ?? detail.facets[0];
  const relations = detail.relations.filter((item) => item.from.dimension === active.key
    || item.to.dimension === active.key);

  function openEvidence(evidence: TargetEvidence) {
    showInspector({
      kind: "document",
      doc: {
        doc_id: detail!.document.doc_id,
        title: detail!.document.title,
        origin: detail!.document.origin,
        version: detail!.document.version,
        captured_at: detail!.document.captured_at,
        kind: detail!.document.kind,
        parser: detail!.document.parser,
        pages: detail!.document.pages,
        corpus_id: corpusId,
        // 正文定位用后端“解析正文”口径：有可靠页码则跳页，否则交给引文逐字定位。
        focus: evidence.locator.basis === "pdf_page" ? undefined : evidence.quote,
      },
      page: evidence.locator.basis === "pdf_page" ? (evidence.locator.page ?? null) : null,
      corpusId,
    });
  }

  return (
    <div className="space-y-[12px] text-[12.5px]">
      <div>
        <p className="text-[13px] font-medium text-[var(--charcoal)]">{detail.title}</p>
        <p className="mt-[2px] break-all text-[11px] text-[var(--stone)]">{detail.source_name}</p>
        <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">
          <Pill tone={detail.process.status === "已完成" ? "mint" : "rose"}>{detail.process.status}</Pill>
          <span className="text-[11px] text-[var(--stone)]">
            处理覆盖 {detail.process.coverage.processed}/{detail.process.coverage.total} 段 · 文档版本 {detail.version.slice(0, 8)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-[6px]">
        {detail.facets.map((facet, position) => (
          <button key={facet.key} type="button"
            onClick={() => showInspector({ kind: "target", corpusId, docId, index: position })}
            className={`rounded-full px-[9px] py-[3px] text-[11.5px] ${position === index
              ? "bg-[var(--primary-soft)] text-[var(--primary-pressed)]" : "text-[var(--steel)] hover:bg-[var(--surface)]"}`}>
            {facet.key} · {facet.state === "has" ? facet.items.length : facet.state === "异常" ? "提取异常" : "未提及"}
          </button>
        ))}
      </div>

      {active.state === "异常" ? (
        <p role="alert" className="text-[12px] text-[var(--red)]">
          {detail.error || "该维度提取异常（返回结构缺字段或引文不匹配），请重新提取；这不等同于原文未提及。"}
        </p>
      ) : null}

      <ul className="space-y-[8px]">
        {active.items.map((item) => (
          <li key={item.id} className="rounded-[10px] border border-[var(--hairline)] p-[10px]">
            <div className="flex items-start gap-[6px]">
              <span className="min-w-0 flex-1 font-medium text-[var(--charcoal)]">{item.name}</span>
              {item.status ? <Pill tone="lav">{item.status}</Pill> : null}
            </div>
            {item.desc ? <p className="mt-[4px] leading-[1.6] text-[var(--steel)]">{item.desc}</p> : null}
            <ul className="mt-[6px] space-y-[4px]">
              {item.evidence.map((evidence, position) => (
                <li key={`${evidence.quote}:${position}`}>
                  <button type="button" className="text-left text-[11.5px] text-[var(--link)] hover:underline"
                    onClick={() => openEvidence(evidence)}>
                    {evidence.locator.basis === "pdf_page" ? `第 ${evidence.locator.page} 页` : "解析正文位置"} · “{evidence.quote.slice(0, 60)}…”
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {active.state === "未提及" ? <li className="text-[12px] text-[var(--stone)]">原文未提及该维度。</li> : null}
        {active.state === "has" && !active.items.length ? <li className="text-[12px] text-[var(--stone)]">没有条目。</li> : null}
      </ul>

      {relations.length ? (
        <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-[10px]">
          <p className="text-[11.5px] font-medium text-[var(--charcoal)]">原文明示关联（{active.key}）</p>
          <ul className="mt-[4px] space-y-[3px] text-[11.5px] text-[var(--steel)]">
            {relations.map((relation, position) => (
              <li key={position}>
                {relation.from.dimension}「{nameOf(detail!, relation.from.dimension, relation.from.item_id)}」
                → {relation.to.dimension}「{nameOf(detail!, relation.to.dimension, relation.to.item_id)}」
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function nameOf(detail: TargetDetail, dimension: string, itemId: string): string {
  const facet = detail.facets.find((item) => item.key === dimension);
  return facet?.items.find((item) => item.id === itemId)?.name ?? itemId;
}
