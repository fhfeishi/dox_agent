# 历史快照的边界

默认由已有版本记录保存历史，目标项目无需创建本目录。只有无版本记录、外部交付或审计明确需要独立快照时才使用；不按轮次自动复制，也不作为废弃内容的堆放区。

快照应写明所属项目或工作主题、日期、材料版本或代码基线、保存理由及当前正文入口；保持只读，名称能够唯一定位。已有重要历史材料保留原始语境，不因正文简化而删除。

当前状态回到实际采用的项目说明或工作记录；本模板的可选载体见 [记录入口](../README.md)。快照中的旧规则或结论不自动成为当前执行要求。

## 本项目的历史快照

| 快照 | 内容 |
|---|---|
| [`static1_design/`](static1_design/) | 原 static1 的 API pipeline / HLD / LLD |
| [`static1_implement/`](static1_implement/) | 实现边界与开发执行记录 |
| [`static1_plan/`](static1_plan/) | 旧 roadmap 与 status |

来源与索引见 [`static1.md`](static1.md)。归档只读，不描述 dox_agent 当前状态；当前状态见 [`../status.md`](status.md)。

## 过程记录快照（2026-09-22 归档）

以下为一次性过程文件，其结论已提取进现行文档，故只读归档；原始内部链接可能指向归档前位置，不再修改。

| 快照 | 内容 | 结论去向 |
|---|---|---|
| [`query.md`](query.md) | 2026-09-21 用户需求更新记录 | [`../demand.md`](demand.md) §9、[`../plan/plan.md`](plan/plan.md) 设计指南与 U 任务 |
| [`review-2026-09-21.md`](review-2026-09-21.md) | 第二轮 plan/ui 对照审核 | [`../plan/plan.md`](plan/plan.md)「第二轮审核采纳」#15–#29 |
| [`review-2026-09-21-deep.md`](review-2026-09-21-deep.md) | 第三轮深度审核 | [`../plan/plan.md`](plan/plan.md)「第三轮审核采纳」#30–#41 |
| [`plan-status-check.md`](plan-status-check.md) | 第四轮 plan × implementation 一致性核查 | [`../plan/plan.md`](plan/plan.md)「第四轮审查采纳」#42–#49、[`../plan/implementation.md`](plan/implementation.md) §3 |
