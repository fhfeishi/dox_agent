# 形式审查前端入口（W8-B）— 当前工作载体

- 需求与裁决：`PROJECT.md` §2 末节「形式审查」；`DECISIONS.md`「形式审查集成裁决」；`ITERATION.md` §16.42（规划）、§16.43（后端实施）、**§16.44（前端实施，本节的执行依据）**。
- 前置：W8-A 后端已提交 `b2aa043`，17 个 `/api/review/*` 端点可用。

## 本次执行（2026-09-29）

1. 新增 `frontend/src/reviewApi.ts`：审查 API 对接层（类型、中文标签、错误文案、导出/原文 URL）。
2. 新增 `frontend/src/components/ReviewViews.tsx`：`ReviewShell`、`ReviewWorkbench`、`ReviewGuidelines`、`ReviewEvidence`、`ReviewRunPage`、`ReviewRunPanel`。
3. 挂载入口：`store.tsx`（NavKey/navPaths/反推）、`IconRail.tsx`（NAV_ITEMS）、`Icons.tsx`（review 图标）、`router.tsx`（`/review` + 4 子路由）、`SidePanel.tsx`（审核任务列表分支，剔除会话搜索与知识库分组）。
4. `pyproject.toml` 直接声明 `pypdf`、`olefile`。
5. 文档同步：PROJECT 三处状态改写；ITERATION 头部与 §16.44。

## 状态与未决

- 已完成：TypeScript 全量编译通过。
- 未验证：`vite build` 在 Windows 侧失败（rollup native 二进制为 WSL 平台），需在 WSL 内执行；浏览器 e2e 主链未跑。
- 下一步：① WSL 内 `npm run build`；② 浏览器主链 + 窄屏验收；③ W8-C 计算工具（calculation 项恒 pending）；④ 按主题分批提交（前端 P1 批 / W8-B 批）。


## 2026-09-30 接续结果

WSL 中完整构建已通过（最大 JS 包 463.52 kB）；/review 三个基本页面已用临时状态目录及真实 API 验证直接进入与刷新，补齐后端深链返回。完整上传→审核→报告→导出和窄屏仍待验收，计算工具仍按 W8-C 安排。交付状态统一见 ITERATION §16.46。
