import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReviewSourcePages, reviewSourceBase } from "../reviewApi";
/** Text of a review material — an application, information sheet or uploaded evidence file — by page. */
export function ReviewSourceView({ fileId, page, evidence = false }: { fileId: string; page: number; evidence?: boolean }) {
  const focus = useRef<HTMLDivElement>(null);
  const base = reviewSourceBase(fileId, evidence);
  const result = useQuery({ queryKey: ["review-source", base], queryFn: ({ signal }) => fetchReviewSourcePages(fileId, evidence, signal) });
  useEffect(() => { focus.current?.scrollIntoView({ block: "center" }); }, [result.data, page]);
  return <div className="p-4">
    <a className="text-body text-[var(--primary)]" href={base + "/file"} target="_blank" rel="noreferrer">下载原始文件</a>
    {result.error ? <p role="alert">{result.error.message}</p> : !result.data ? <p>正在读取原文…</p> :
      result.data.map((item) => <div key={item.page} ref={item.page === page ? focus : undefined} className={"my-4 rounded-xl border p-4 text-body " + (item.page === page ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "")}>
        <p className="mb-2 text-caption text-[var(--steel)]">原文位置 {item.page}</p><p className="whitespace-pre-wrap break-words leading-7">{item.text}</p></div>)}
  </div>;
}
