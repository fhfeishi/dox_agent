/**
 * One name for each concept the interface shows (upgrade plan U3, design/界面.md §3). A rename happens
 * here, the navigation takes its labels from here, and copy.test.mts refuses the retired names
 * anywhere in the interface code (comments excepted), so a renamed page cannot linger in a button.
 */
export const TERMS = {
  home: { name: "首页", retired: [] },
  overview: { name: "概览", retired: [] },
  build: { name: "资料库建设", retired: [] },
  domains: { name: "领域分析", retired: [] },
  workbench: { name: "工作台", retired: ["开始今天的工作"] },
  // One word for a library everywhere (query 2026-1027 前端审查答复).
  library: { name: "资料库", retired: ["知识库", "对话库"] },
  libraryFiles: { name: "资料管理", retired: ["资料文件"] },
  libraryBrowse: { name: "资料查阅", retired: [] },
  research: { name: "技术研判", retired: ["研究归纳", "四维浏览"] },
  extraction: { name: "四维提取", retired: ["四维整理"] },
  chat: { name: "对话工作台", retired: [] },
  // A conversation held in 资料管理 · 分析工作区 (query 2026-1020 1719).
  workspaceAnalysis: { name: "资料分析（精准问答）", retired: [] },
  tasks: { name: "存量分析", retired: [] },
  taskTemplates: { name: "任务模版", retired: ["分析任务"] },
  review: { name: "资料审查", retired: ["审查申请书"] },
  intelligence: { name: "情报分析", retired: [] },
  results: { name: "报告中心", retired: ["成果周期总结", "保存为成果", "保存到成果", "分析成果", "成果回收站", "打开报告成果", "返回成果列表", "成果列表不可用"] },
  saveAnswer: { name: "保存到报告中心", retired: [] },
  savedAnswer: { name: "保存的回答", retired: ["回答快照"] },
  periodSummary: { name: "周期总结", retired: [] },
  panel: { name: "右侧面板", retired: ["检查器"] },
} as const satisfies Record<string, { name: string; retired: readonly string[] }>;

export const RETIRED: readonly string[] = Object.values(TERMS).flatMap((term) => term.retired);

export const INDEX_COPY = {
  updating: "资料正在更新，当前显示的是上次整理的结果",
  preparing: "资料正在整理，请稍后刷新",
  retry: "重试",
} as const;

export const CORPORA_COPY = {
  loading: "正在读取资料库…",
  error: "资料库列表读取失败",
  emptyDomains: "还没有可浏览的领域资料。",
  emptyHome: "尚无可浏览的资料库。",
  retry: "重试",
} as const;
