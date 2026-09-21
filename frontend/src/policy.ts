/** Display labels only; effective values always come from server policy events. */
export const stopLabels: Record<string, string> = {
  social: "无需查证", classified: "已选择回答方式", knowledge_only: "仅使用资料",
  covered: "已完成覆盖检查", corpus_unavailable: "部分资料缺失，已停止补查",
  corpus_running: "等待知识库准备", corpus_error: "知识库暂不可用",
  scope_missing: "所选资料不可用", scope_ambiguous: "需要明确资料", scope_conflict: "资料范围不一致",
  routing_invalid: "分类结果无效，转入查证", routing_timeout: "分类超时，转入查证",
  routing_unavailable: "分类服务暂不可用", handoff_missing: "研究交接不完整",
  round_limit: "达到研究轮数上限", no_progress: "无新增证据", read_limit: "达到阅读上限",
  search_limit: "达到搜索上限", partial_or_clarify: "已说明限制或待补充条件",
  timed_out: "达到时间预算", failed: "服务异常", invalid_request: "请求不可用",
};
