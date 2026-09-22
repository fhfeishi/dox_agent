/** Display labels only; effective values always come from server policy events. */
export const stopLabels: Record<string, string> = {
  professional: "专业问答", completed: "处理完成",
  no_reports: "没有匹配的报告", coverage_partial: "覆盖不完整，已说明",
  corpus_running: "等待知识库准备", corpus_empty: "知识库尚无文档",
  corpus_uninitialized: "知识库尚未导入", corpus_error: "知识库暂不可用",
  scope_missing: "所选资料不可用",
  timed_out: "达到时间预算", failed: "服务异常", invalid_request: "请求不可用",
};
