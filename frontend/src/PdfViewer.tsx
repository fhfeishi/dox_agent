import { useEffect, useState } from "react";

/**
 * U2.3（对 D6 的降级实现）：不引入 PDF.js，改用浏览器原生 PDF 渲染 —— 通过
 * `/api/documents/{id}/file`（FileResponse 自带 Range）加 `#page=` 片段定位页码。
 * 缩放依赖阅读器自带工具栏；D10 页码一致性校验完成前按"文档+页"best effort。
 */
export function PdfViewer({ docId, version, page, pages, onPageChange }: {
  docId: string; version?: string; page: number | null; pages: number; onPageChange?: (page: number) => void;
}) {
  const [current, setCurrent] = useState(Math.max(1, page ?? 1));
  // Citation jumps or document switches arrive as prop changes; keep the viewer in sync.
  useEffect(() => { setCurrent(Math.max(1, page ?? 1)); }, [docId, page]);
  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  const fileUrl = `/api/documents/${encodeURIComponent(docId)}/file${query}`;
  function jump(next: number) {
    const clamped = Math.min(Math.max(1, next), Math.max(1, pages));
    setCurrent(clamped);
    onPageChange?.(clamped);
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center gap-2 pb-2 text-xs text-stone-600">
      <button type="button" className="rounded-lg border border-stone-300 bg-white px-2 py-1 disabled:opacity-40"
        disabled={current <= 1} onClick={() => jump(current - 1)}>上一页</button>
      <span aria-live="polite">第 {current} 页{pages ? ` / 约 ${pages} 页` : ""}</span>
      <button type="button" className="rounded-lg border border-stone-300 bg-white px-2 py-1 disabled:opacity-40"
        disabled={pages > 0 && current >= pages} onClick={() => jump(current + 1)}>下一页</button>
      <a className="ml-auto underline" href={fileUrl} target="_blank" rel="noreferrer">新窗口打开</a>
    </div>
    {/* key 确保翻页时 iframe 重新加载，使 #page= 片段生效 */}
    <iframe key={current} title="PDF 预览" src={`${fileUrl}#page=${current}`}
      className="min-h-0 w-full flex-1 rounded-lg border border-stone-200 bg-white"/>
    <p className="pt-2 text-xs text-stone-400">浏览器内置 PDF 渲染（缩放请用阅读器工具栏）。页码与引用的一致性校验（D10）完成前为 best effort。</p>
  </div>;
}
