import { useEffect, useState } from "react";
import { useAuth } from "../auth";

/**
 * First-visit guides (query 2026-1013 1133): a small bubble with three steps the first time an
 * account opens a work area; dismissing it is remembered for that account on the server. The
 * rail's 指南 button shows the current area's guide again.
 */
export const GUIDES: Record<string, { title: string; steps: string[] }> = {
  home: { title: "首页", steps: ["选择查阅资料、分析或审查，开始一项工作", "最近报告可直接打开；生成过程中可以继续使用其他功能", "“报告中心”统一查看已完成报告和生成进度"] },
  overview: { title: "概览", steps: ["顶部“概览 ▾”选择资料库建设或领域分析", "领域分析：在“领域”下拉中选领域，再切换总览、技术谱系等视角", "报告、审查结果与一周至一年的成果总结统一在“报告中心”中查看"] },
  chat: { title: "对话工作台", steps: ["直接提问，系统按问题自动选择资料库", "也可在输入框上方自行选择资料库", "回答中的编号可在右侧打开原文核对"] },
  library: { title: "资料库", steps: ["点资料库卡片“打开”，或点“信息”在右侧预览", "打开后先看“资料管理”，可增删改资料与信息；再切换“技术研判 · 年度分布 · 项目关系”", "“← 全部资料库”返回卡片，库名下拉可切换资料库"] },
  tasks: { title: "存量分析", steps: ["选择要做的任务，点“开始分析”", "补充问题，核对系统选用的资料范围后发送", "“报告中心”查看生成进度与报告"] },
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
