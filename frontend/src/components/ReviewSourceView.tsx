import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { reviewDocumentFileUrl } from "../reviewApi";
export function ReviewSourceView({ fileId, page }: { fileId: string; page: number }) {
  const focus = useRef<HTMLDivElement>(null);
  const result = useQuery({ queryKey: ["review-source", fileId], queryFn: async ({ signal }): Promise<{ page: number; text: string }[]> => {
    const response = await fetch("/api/review/documents/" + encodeURIComponent(fileId) + "/pages", { signal });
    if (!response.ok) throw new Error("这份原始材料暂不可读"); return response.json();
  } });
  useEffect(() => { focus.current?.scrollIntoView({ block: "center" }); }, [result.data, page]);
  return <div className="p-4"><p className="mb-4 text-xs text-[var(--steel)]">Word 按段落或表格定位，PDF 按原文件页码定位。</p>
    <a className="text-sm text-[var(--primary)]" href={reviewDocumentFileUrl(fileId)} target="_blank" rel="noreferrer">打开原始文件</a>
    {result.error ? <p role="alert">{result.error.message}</p> : !result.data ? <p>正在读取原文…</p> :
      result.data.map((item) => <div key={item.page} ref={item.page === page ? focus : undefined} className={"my-4 rounded-xl border p-4 text-sm " + (item.page === page ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "")}>
        <p className="mb-2 text-xs text-[var(--steel)]">原文位置 {item.page}</p><p className="whitespace-pre-wrap break-words leading-7">{item.text}</p></div>)}
  </div>;
}
