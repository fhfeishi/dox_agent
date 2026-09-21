import { useCallback, useEffect, useState } from "react";

export type DocumentInfo = {
  doc_id: string; title: string; origin: string; version: string; captured_at: string;
  kind: string; parser: string; pages: number;
};

/** Single owner of the document list. Other views consume it instead of fetching again. */
export function useDocuments(enabled: boolean) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      if (!response.ok) throw new Error("无法读取文档列表");
      setDocuments(await response.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法读取文档列表");
    }
  }, []);
  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);
  return { documents, error, refresh };
}
