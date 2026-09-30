import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCorpora } from "./api";

export function useCorpora(enabled: boolean) {
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["corpora"], queryFn: ({ signal }) => fetchCorpora(signal), enabled });
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ["corpora"] }), [client]);
  return { corpora: result.data ?? [], error: result.error?.message ?? "", loaded: result.isFetched, refresh };
}
