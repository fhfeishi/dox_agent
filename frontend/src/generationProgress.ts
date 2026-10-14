export type GenerationState = {
  status: string; stage?: number; stage_label?: string; kind?: string;
};
export function generationProgress({ status, stage, stage_label, kind }: GenerationState) {
  if (status === "completed") return { label: "报告已生成", percent: 100, active: false };
  if (status === "failed" || status === "interrupted") return { label: "生成未完成，请查看原因", percent: undefined, active: false };
  if (status === "queued") return { label: "已加入队列，等待开始", percent: 0, active: true };
  const total = kind === "formal" ? 4 : kind === "professional" ? 3 : 0;
  // The server stage is the number of previous stages, not elapsed time or remaining duration.
  const done = total && stage != null ? Math.max(0, Math.min(Math.floor(stage), total - 1)) : null;
  return {
    label: stage_label || "正在生成报告",
    percent: done === null ? undefined : Math.floor(done / total * 100),
    active: ["running", "generating"].includes(status),
  };
}
