import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { fileStatus } from "../api";
import { Button } from "./ui";

/**
 * U2.3（对 D6 的降级实现）：不引入 PDF.js，改用浏览器原生 PDF 渲染 —— 通过
 * `/api/documents/{id}/file`（FileResponse 自带 Range）加 `#page=` 片段定位页码。
 * 缩放依赖阅读器自带工具栏；D10 页码一致性校验完成前按"文档+页"best effort。
 */
export function PdfViewer({
  docId,
  version,
  page,
  pages,
  corpus,
  onPageChange,
}: {
  docId: string;
  version?: string;
  page: number | null;
  pages: number;
  corpus?: string;
  onPageChange?: (page: number) => void;
}) {
  const [current, setCurrent] = useState(Math.max(1, page ?? 1));
  const [availability, setAvailability] = useState<"checking" | "available" | "error">("checking");
  const [fileError, setFileError] = useState("");
  useEffect(() => {
    setCurrent(Math.max(1, page ?? 1));
  }, [docId, page]);
  const params = new URLSearchParams();
  if (version) params.set("version", version);
  if (corpus) params.set("corpus", corpus);
  const query = params.toString() ? `?${params}` : "";
  const fileUrl = `/api/documents/${encodeURIComponent(docId)}/file${query}`;
  useEffect(() => {
    const controller = new AbortController();
    setAvailability("checking");
    setFileError("");
    fileStatus(fileUrl, controller.signal)
      .then((status) => {
        if (status >= 200 && status < 300) {
          setAvailability("available");
          return;
        }
        setFileError(status === 404
          ? "原文件已缺失或已移动，请刷新文献库后重试"
          : status === 422
            ? "文档已更新，请刷新文献库后重试"
            : `无法预览原文件（HTTP ${status}）`);
        setAvailability("error");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFileError((error as Error).message || "无法检查原文件，请稍后重试");
        setAvailability("error");
      });
    return () => controller.abort();
  }, [fileUrl]);
  function jump(next: number) {
    const clamped = Math.min(Math.max(1, next), Math.max(1, pages));
    setCurrent(clamped);
    onPageChange?.(clamped);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-[8px] pb-[10px] text-caption text-[var(--slate)]">
        <Button size="sm" disabled={current <= 1} onClick={() => jump(current - 1)}>上一页</Button>
        <span aria-live="polite" className="font-code tabular-nums">
          第 {current} 页{pages ? ` / 约 ${pages} 页` : ""}
        </span>
        <Button size="sm" disabled={pages > 0 && current >= pages} onClick={() => jump(current + 1)}>下一页</Button>
        <a
          className="ml-auto inline-flex items-center gap-[4px] text-[var(--link)] hover:underline"
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
        >
          新窗口打开
          <Icon name="external" size={12} />
        </a>
      </div>
      {/* key 确保翻页时 iframe 重新加载，使 #page= 片段生效；已知代价：每次翻页重载整份 PDF（大扫描件成本高），D6 升级 PDF.js 后改 JS 控制页码 */}
      {availability === "checking" ? <p role="status" className="py-[16px] text-body text-[var(--steel)]">正在检查原文件…</p> : null}
      {availability === "error" ? <p role="alert" className="py-[16px] text-body text-[var(--red)]">{fileError}</p> : null}
      {availability === "available" ? (
        <iframe
          key={current}
          title="PDF 预览"
          src={`${fileUrl}#page=${current}`}
          className="min-h-0 w-full flex-1 rounded-[10px] border border-[var(--hairline)] bg-white"
        />
      ) : null}
      <p className="pt-[10px] text-caption text-[var(--stone)]">
        浏览器内置 PDF 渲染（缩放请用阅读器工具栏）。页码与引用的一致性校验（D10）完成前为 best effort。
      </p>
    </div>
  );
}
