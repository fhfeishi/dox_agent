import { useEffect, useState } from "react";
import { useAuth } from "../auth";

/**
 * First-visit guides (query 2026-1013 1133): a small bubble with three steps the first time an
 * account opens a work area; dismissing it is remembered for that account on the server. The
 * rail's 指南 button shows the current area's guide again.
 */
export const GUIDES: Record<string, { title: string; steps: string[] }> = {
  admin: { title: "管理视图", steps: ["工作概况：先看“需要处理”，点按钮直接去处理", "关键技术：选领域看技术方向、共性技术与问题路线", "年度分布与近期工作：看项目年份、经费与最近产出"] },
  mine: { title: "我的工作", steps: ["这里列出你发起的对话、报告与审查", "点一项继续：对话回到工作台，报告在右侧打开，审查打开结果页", "右上角开始新对话、审查申请书或生成分析报告"] },
  leader: { title: "领导视图", steps: ["资料库建设：看各领域资料与整理进度，点一行进入", "领域分析：选领域后切换总览、技术谱系、路网、项目关系、资金", "近期工作：按近 3 天至本年查看报告与审查"] },
  chat: { title: "对话工作台", steps: ["直接提问，系统按问题自动选择资料库", "也可在输入框上方自行选择资料库", "回答中的编号可在右侧打开原文核对"] },
  library: { title: "资料库", steps: ["左侧选择资料库，可新建资料库与分组", "右上切换“四维浏览 / 资料文件”", "“管理”菜单可改名、写说明、移动分组"] },
  tasks: { title: "存量分析", steps: ["选择要做的任务，点“开始分析”", "补充问题，核对系统选用的资料范围后发送", "右上角“任务进度”查看报告生成状态，“报告中心”查看成果"] },
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
