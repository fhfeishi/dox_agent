import { useEffect, useState } from "react";
import { useAuth } from "../auth";

/**
 * First-visit guides (query 2026-1013 1133): a small bubble with three steps the first time an
 * account opens a work area; dismissing it is remembered for that account on the server. The
 * rail's 指南 button shows the current area's guide again.
 */
export const GUIDES: Record<string, { title: string; steps: string[] }> = {
  home: { title: "首页", steps: ["看工作概况：资料、进行中的任务", "点领域资料进入场景、问题、技术与成果", "右上角直接上传申请书生成审查报告"] },
  leader: { title: "领域全景", steps: ["上方选择一个领域", "先读要点结论，点卡片看依据", "点场景看核心问题与技术路线"] },
  chat: { title: "对话", steps: ["左下角确认本次对话使用的资料库", "在输入框提出问题", "回答中的编号可打开原文核对"] },
  library: { title: "资料库", steps: ["选择一个资料库", "四维浏览：场景、问题、技术、成果", "技术谱系页看领域全景与路网"] },
  tasks: { title: "存量分析", steps: ["左侧选择资料库", "选择任务，点“开始分析”", "组织问题并提问；成果在右上角“成果与回收站”"] },
  review: { title: "资料审查", steps: ["模板已默认选好，点模板可预览或更换", "上传申请书", "点“开始审查”，完成后在本页打开报告"] },
  intelligence: { title: "情报分析", steps: ["上传外部材料", "选择输出模板", "生成成果并在右侧查看"] },
};

export const GUIDE_EVENT = "dox-guide";

export function Guide({ area }: { area: string }) {
  const { guidesSeen, seeGuide } = useAuth();
  const [forced, setForced] = useState(false);
  useEffect(() => {
    setForced(false);
    const show = () => setForced(true);
    window.addEventListener(GUIDE_EVENT, show);
    return () => window.removeEventListener(GUIDE_EVENT, show);
  }, [area]);
  const guide = GUIDES[area];
  if (!guide || (!forced && guidesSeen.includes(area))) return null;
  const close = () => { setForced(false); if (!guidesSeen.includes(area)) seeGuide(area); };
  return <div role="dialog" aria-label={`${guide.title} 操作指南`}
    className="absolute right-4 bottom-4 z-40 w-[300px] max-w-[calc(100%-2rem)] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 shadow-xl">
    <p className="text-sm font-semibold">{guide.title} · 三步上手</p>
    <ol className="mt-2 space-y-1.5 text-[13px] leading-5 text-[var(--slate)]">
      {guide.steps.map((step, i) => <li key={step} className="flex gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-semibold text-white">{i + 1}</span>{step}</li>)}
    </ol>
    <div className="mt-3 flex items-center justify-between">
      <span className="text-[11px] text-[var(--stone)]">可随时点“指南”再次查看</span>
      <button type="button" onClick={close} className="rounded-md bg-[var(--primary)] px-3 py-1 text-xs text-white">知道了</button>
    </div>
  </div>;
}
