import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
/** Text of a review material — an application, information sheet or uploaded evidence file — by page. */
export function ReviewSourceView({ fileId, page, evidence = false }: { fileId: string; page: number; evidence?: boolean }) {
  const focus = useRef<HTMLDivElement>(null);
  const base = "/api/review/" + (evidence ? "evidence/" : "documents/") + encodeURIComponent(fileId);
  const result = useQuery({ queryKey: ["review-source", base], queryFn: async ({ signal }): Promise<{ page: number; text: string }[]> => {
    const response = await fetch(base + "/pages", { signal });
    if (!response.ok) throw new Error("这份原始材料暂不可读"); return response.json();
  } });
  useEffect(() => { focus.current?.scrollIntoView({ block: "center" }); }, [result.data, page]);
  return <div className="p-4">
    <a className="text-sm text-[var(--primary)]" href={base + "/file"} target="_blank" rel="noreferrer">下载原始文件</a>
    {result.error ? <p role="alert">{result.error.message}</p> : !result.data ? <p>正在读取原文…</p> :
      result.data.map((item) => <div key={item.page} ref={item.page === page ? focus : undefined} className={"my-4 rounded-xl border p-4 text-sm " + (item.page === page ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "")}>
        <p className="mb-2 text-xs text-[var(--steel)]">原文位置 {item.page}</p><p className="whitespace-pre-wrap break-words leading-7">{item.text}</p></div>)}
  </div>;
}
