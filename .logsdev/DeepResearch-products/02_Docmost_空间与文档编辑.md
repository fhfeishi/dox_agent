# Docmost：空间导航、文档编辑与版本历史

调研日期：2026-10-16。仓库：[ docmost/docmost ](https://github.com/docmost/docmost)。
固定快照：`6852e0427e3e99843062bc0c906eb01c8497780f`；分支 main；该提交日期 2026-10-16T00:26:42Z。
证据：官方文档与指定源码静态核对；未本地部署产品，未验证真实用户任务耗时。以下“借鉴”均为面向 dox_agent 的设计推断，不是上游产品保证。


## 已核对的产品机制

官方文档将 Space 定义为组织文档和成员的范围，支持嵌套页面、移动/复制、导入导出及不同访问角色。来源：[Spaces 官方指南](https://docmost.com/docs/user-guide/spaces)。这说明其主要对象是可编辑知识页面，不是原始科研报告的提取结果。

空间侧栏与历史视图分属功能模块。历史模态组件在窄屏使用独立全屏布局，而不是把桌面双区机械缩小：[空间侧栏](https://github.com/docmost/docmost/blob/6852e0427e3e99843062bc0c906eb01c8497780f/apps/client/src/features/space/components/sidebar/space-sidebar.tsx)、[版本历史布局](https://github.com/docmost/docmost/blob/6852e0427e3e99843062bc0c906eb01c8497780f/apps/client/src/features/page-history/components/history-modal.tsx)。

## 对 dox_agent 的启发

成果正文要有稳定阅读位置；需要编辑时进入同一对象的编辑状态，历史版本及引用不应另造一份报告。右侧适合预览与短时比对，长正文编辑可展开到主区。

库内目录、成果正文和版本历史各有职责。学习这种职责拆分，不要求复刻其所有侧栏、实时协作或空间权限。

资料原文与用户编写成果仍是两类对象：不能让“页面可编辑”被错误移植为“原始证据可覆盖”。

## 适用角色

普通用户：找到资料与成果、继续修改。管理员：维护公共模板与结构。领导：读发布版本及关键依据。
当前暂不做部门隔离的已确认边界继续保留，不能因 Docmost 有空间角色就擅自改变 dox_agent 的权限设计。

## 验收切片

从成果列表打开报告 → 改正文 → 保存新版本 → 查看旧版 → 回到当前版；原文引用绑定不被文本编辑默默改变，手机返回不丢位置。

## 许可与视觉证据

主仓库 [AGPL-3.0](https://github.com/docmost/docmost/blob/6852e0427e3e99843062bc0c906eb01c8497780f/LICENSE)；README明确列出企业版目录例外：[许可证说明](https://github.com/docmost/docmost/blob/6852e0427e3e99843062bc0c906eb01c8497780f/README.md)。[客户端企业目录许可证](https://github.com/docmost/docmost/blob/6852e0427e3e99843062bc0c906eb01c8497780f/apps/client/src/ee/LICENSE)要求相应企业授权，不能将官网所有功能都当免费社区版能力。
本轮实际浏览并截图的是官方 Spaces 文档页，不是已登录产品工作区。未验证多人协作、性能或企业功能。
