import type { CorpusInfo, Options } from "./api";
export function scopeProblem(ids: string[], corpora: CorpusInfo[], options: Options, loaded: boolean, error: string, documentsError: string): string {
  if (!loaded) return "正在核对知识库";
  if (error) return "知识库列表读取失败，请刷新";
  if (!ids.length || ids.length > 6) return "请选择 1 至 6 个知识库";
  if (ids.some(id => !corpora.some(c => c.id === id && !c.missing))) return "知识库不可用，请替换失效范围";
  if (!options.web_snapshot_ids?.length && ids.some(id => corpora.find(c => c.id === id)?.preparation !== "ready")) return "所选知识库暂无已入库资料，请添加资料或移除空库";
  if (options.allowed_doc_ids?.length === 0) return "指定 0 份资料，请重新选择或明确使用全部资料";
  if (options.allowed_doc_ids && documentsError) return "限定资料列表不可用，请刷新";
  return "";
}
