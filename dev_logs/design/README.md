# design：当前接口设计与实现

本目录记录**当前源码**的接口设计与实现契约，由实际阅读源码整理，供后续二次开发对照使用。

| 文件 | 内容 |
|---|---|
| [`HLD.md`](HLD.md) | 总体架构、系统边界、模块职责、运行时状态 |
| [`API.md`](API.md) | 对外 HTTP / SSE 接口契约、内部模块契约、检索子流程 |
| [`LLD.md`](LLD.md) | 数据模型、Agent 状态机、路由与证据契约、预算、错误语义、前端实现 |

维护规则：

- 改接口同步 `API.md`；改节点/数据/状态同步 `LLD.md`；改系统边界或部署方式同步 `HLD.md`。
- 区分"已实现"与"规划"：需求在 [`../demand.md`](../demand.md)，任务拆解与状态在 [`../plan/plan.md`](../plan/plan.md)，完成情况与证据在 [`../plan/implementation.md`](../plan/implementation.md)，现状摘要见 [`../status.md`](../status.md)。
- 原 static1 的设计文档在 [`../archive/static1_design/`](../archive/static1_design/)，仅作历史参考，不再更新。

> 源码根：`src/`（后端）、`frontend/src/`（前端）。以下路径均相对仓库根目录。
