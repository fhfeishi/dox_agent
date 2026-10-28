import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { Button } from "./ui";

/**
 * First-visit guides (query 2026-1013 1133): a small bubble with three steps the first time an
 * account opens a work area; dismissing it is remembered for that account on the server. The
 * rail's 指南 button shows the current area's guide again.
 */
export const GUIDES: Record<string, { title: string; steps: string[] }> = {
  home: { title: "首页", steps: ["选择资料查阅、存量分析或资料审查，开始一项工作", "最近报告可直接打开；生成过程中可以继续使用其他功能", "“报告中心”统一查看已完成报告和生成进度"] },
  // The leader's 概览 is 领域分析 alone; the administrator's also holds 资料库建设 (OVERVIEW_ADMIN below).
  overview: { title: "概览", steps: ["01 研究领域总览：单击圆选中，再点一次进入下一层；从一个圆拖到另一个圆可并排对比", "02 技术谱系：单击节点展开或收起；双击图内空白进入缩放与拖动，Esc 退出", "03 缺口与机会：先看“先做”的条目，点开看依据；生成的报告在“报告中心”"] },
  chat: { title: "对话工作台", steps: ["直接提问，系统按问题自动选择资料库", "也可在输入框上方自行选择资料库", "回答中的编号可在右侧打开原文核对"] },
  // Shown to everyone but the administrator, who maintains system libraries (LIBRARY_ADMIN below).
  library: { title: "资料库", steps: ["打开系统资料库浏览项目与原文，点项目名即可预览", "新建个人资料库，从系统资料库挑选资料或上传自己的文件，把一项工作用到的资料集中在一处", "在个人资料库点“就此提问”，回答只依据这些资料"] },
  tasks: { title: "存量分析", steps: ["选择要做的任务，点“开始分析”", "补充问题，核对系统选用的资料范围后发送", "“报告中心”查看生成进度与报告"] },
  review: { title: "资料审查", steps: ["模版已默认选好，点模版可预览或更换", "上传申请书", "点“开始审查”，完成后在本页打开报告"] },
  intelligence: { title: "情报分析", steps: ["上传外部材料", "选择输出模版", "生成报告并在右侧查看"] },
};

// The administrator's view of 资料库 (D-20261027-1): system libraries are theirs to maintain.
const LIBRARY_ADMIN = { title: "资料库", steps: ["系统资料库由管理员维护：打开后可上传文件或文件夹，改名、删除在“管理 ▾”中", "“技术研判 · 年度分布 · 项目关系”查看库内结构；补录待办可直接筛出缺金额的项目",
  "勾选项目可加入自己的个人资料库，提问时只用这些资料"] };

const OVERVIEW_ADMIN = { title: "概览", steps: ["顶部“概览 ▾”切换资料库建设与领域分析", "资料库建设：先处理“需要处理”的事项，再看各库的读取状态",
  "领域分析：01 单击圆选中再进入、拖到另一圆对比；02 单击节点展开，双击图内空白缩放"] };

export const GUIDE_EVENT = "dox-guide";

export function Guide({ area }: { area: string }) {
  const { guidesSeen, seeGuide, role } = useAuth();
  const [forced, setForced] = useState(false);
  useEffect(() => {
    setForced(false);
    const show = () => setForced(true);
    window.addEventListener(GUIDE_EVENT, show);
    return () => window.removeEventListener(GUIDE_EVENT, show);
  }, [area]);
  const guide = role === "admin" && area === "library" ? LIBRARY_ADMIN : role === "admin" && area === "overview" ? OVERVIEW_ADMIN : GUIDES[area];
  if (!guide || (!forced && guidesSeen.includes(area))) return null;
  const close = () => { setForced(false); if (!guidesSeen.includes(area)) seeGuide(area); };
  return <div data-area-guide={area} role="dialog" aria-label={`${guide.title} 操作指南`}
    className="absolute right-4 bottom-4 z-40 w-[300px] max-w-[calc(100%-2rem)] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 shadow-xl">
    <p className="text-body font-semibold">{guide.title} · 三步上手</p>
    <ol className="mt-2 space-y-1.5 text-body leading-5 text-[var(--slate)]">
      {guide.steps.map((step, i) => <li key={step} className="flex gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-caption font-semibold text-white">{i + 1}</span>{step}</li>)}
    </ol>
    <div className="mt-3 flex items-center justify-between">
      <span className="text-caption text-[var(--stone)]">可随时点“指南”再次查看</span>
      <Button size="sm" variant="primary" onClick={close}>知道了</Button>
    </div>
  </div>;
}
