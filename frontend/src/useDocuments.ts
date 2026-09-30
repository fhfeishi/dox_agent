import { useCallback } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CorpusInfo } from "./api";

export type DocumentInfo = {
  doc_id: string; title: string; origin: string; version: string; captured_at: string;
  kind: string; parser: string; pages: number; rel_path?: string; status?: string;
  corpus_id?: string; corpus_name?: string;
  /** 证据引文：只用于在规范化正文中定位，不参与检索或发送。 */
  focus?: string;
};

export const documentsQuery = (corpus?: string) => ({
  queryKey: ["library", corpus ?? "default", "documents"],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<DocumentInfo[]> => {
    const response = await fetch(corpus ? `/api/documents?corpus=${encodeURIComponent(corpus)}` : "/api/documents", { signal });
    if (!response.ok) throw new Error("无法读取文档列表");
    return response.json();
  },
  staleTime: 15_000,
});

export function useDocuments(enabled: boolean, corpus?: string) {
  const client = useQueryClient();
  const result = useQuery({ ...documentsQuery(corpus), enabled });
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ["library", corpus ?? "default"] }), [client, corpus]);
  return { documents: result.data ?? [], error: result.error?.message ?? "", refresh };
}

/** Session scope shares the same corpus queries as library browsing. */
export function useDocumentScope(enabled: boolean, corpusIds: string[], corpora: CorpusInfo[]) {
  const client = useQueryClient();
  const results = useQueries({ queries: corpusIds.map((id) => ({ ...documentsQuery(id), enabled })) });
  const names = new Map(corpora.map((corpus) => [corpus.id, corpus.name]));
  const error = results.find((result) => result.error)?.error?.message ?? "";
  const documents = error ? [] : results.flatMap((result, index) => (result.data ?? []).map((doc) => ({
    ...doc, corpus_id: corpusIds[index], corpus_name: names.get(corpusIds[index]) ?? corpusIds[index],
  })));
  const key = corpusIds.join("\u0000");
  const refresh = useCallback(async () => {
    await Promise.all(corpusIds.map((id) => client.invalidateQueries({ queryKey: ["library", id] })));
  }, [client, key]);
  return { documents, error, refresh };
}
