import { useCallback, useEffect, useState } from "react";
import { fetchCorpora, type CorpusInfo } from "./api";

/**
 * H5: single owner of the corpus list (`GET /api/corpora`). Consumers refresh it after
 * ingest jobs or when reconnecting; the registry itself is a read-only disk scan.
 */
export function useCorpora(enabled: boolean) {
  const [corpora, setCorpora] = useState<CorpusInfo[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setCorpora(await fetchCorpora());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "知识库列表不可用");
    }
  }, []);
  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);
  return { corpora, error, refresh };
}
