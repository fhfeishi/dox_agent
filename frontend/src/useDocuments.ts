import { useCallback, useEffect, useRef, useState } from "react";
import type { CorpusInfo } from "./api";

export type DocumentInfo = {
  doc_id: string; title: string; origin: string; version: string; captured_at: string;
  kind: string; parser: string; pages: number; rel_path?: string; status?: string;
  corpus_id?: string; corpus_name?: string;
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

/** Aggregate the session's explicit retrieval set for document scoping. */
export function useDocumentScope(enabled: boolean, corpusIds: string[], corpora: CorpusInfo[]) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [error, setError] = useState("");
  const requestSerial = useRef(0);
  const key = corpusIds.join("\u0000");
  const names = new Map(corpora.map((corpus) => [corpus.id, corpus.name]));
  const nameKey = corpusIds.map((id) => `${id}:${names.get(id) ?? id}`).join("\u0000");
  const refresh = useCallback(async () => {
    const serial = ++requestSerial.current;
    if (!corpusIds.length) { setDocuments([]); setError(""); return; }
    try {
      const results = await Promise.all(corpusIds.map(async (corpusId) => {
        const response = await fetch(`/api/documents?corpus=${encodeURIComponent(corpusId)}`);
        if (!response.ok) throw new Error(`无法读取「${names.get(corpusId) ?? corpusId}」的文档列表`);
        const items = await response.json() as DocumentInfo[];
        return items.map((item) => ({ ...item, corpus_id: corpusId, corpus_name: names.get(corpusId) ?? corpusId }));
      }));
      if (serial === requestSerial.current) {
        setDocuments(results.flat());
        setError("");
      }
    } catch (e) {
      if (serial === requestSerial.current) {
        setDocuments([]);
        setError(e instanceof Error ? e.message : "无法读取所选知识库的文档列表");
      }
    }
  }, [key, nameKey]);
  useEffect(() => {
    if (enabled) void refresh();
    return () => { requestSerial.current += 1; };
  }, [enabled, refresh]);
  return { documents, error, refresh };
}
