import { useCallback, useEffect, useState } from "react";

export type DocumentInfo = {
  doc_id: string; title: string; origin: string; version: string; captured_at: string;
  kind: string; parser: string; pages: number; rel_path?: string; status?: string;
};

/** Single owner of the document list. Other views consume it instead of fetching again.
 *  H3/H7: pass `corpus` to scope the list to one corpus; undefined = the default corpus. */
export function useDocuments(enabled: boolean, corpus?: string) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(corpus ? `/api/documents?corpus=${encodeURIComponent(corpus)}` : "/api/documents");
      if (!response.ok) throw new Error("无法读取文档列表");
      setDocuments(await response.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法读取文档列表");
    }
  }, [corpus]);
  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);
  return { documents, error, refresh };
}
