# Outline 与 Dify：有价值的架构对照，不等于直接替换

调研日期：2026-10-16。两者均固定到 sources.json 的提交；本轮只读资料与指定代码。


## Outline：按页面、对象、动作组织，而非一个全局巨型模块

官方架构文档将前端区分scenes、components、actions、models、stores；后端区分routes、commands、policies、presenters和queues。其文档场景与版本查看也有独立组件。来源：[架构文档](https://github.com/outline/outline/blob/a717cb0645acebe582619b28a7beb99ceb6ee7ba/docs/ARCHITECTURE.md)、[文档场景](https://github.com/outline/outline/blob/a717cb0645acebe582619b28a7beb99ceb6ee7ba/app/scenes/Document/components/Document.tsx)、[版本阅读](https://github.com/outline/outline/blob/a717cb0645acebe582619b28a7beb99ceb6ee7ba/app/scenes/Document/components/RevisionViewer.tsx)。

借鉴：页面负责工作场景，公共布局不加载业务，数据整形与副作用不塞进展示组件。dox_agent继续React/TanStack Query/FastAPI，不因为该产品使用其他状态库和ORM而全量迁移。

许可：[BSL 1.1原文](https://github.com/outline/outline/blob/a717cb0645acebe582619b28a7beb99ceb6ee7ba/LICENSE)明确不是OSI意义的开源许可，并有特定使用限制与未来转换日期。因此此处归为“公开源码参考”，不能笼统列为可自由复用的开源代码。未对具体商用方案作法律适用结论。

## Dify：把应用配置、知识检索与执行分开

README描述面向构建者的应用/工作流与知识能力；检索实现位于独立RAG模块，包含数据集路由与多种召回方式。来源：[项目介绍](https://github.com/langgenius/dify/blob/0d580fddf7df8e6eae0694a45e76d395be467f19/README.md)、[检索模块](https://github.com/langgenius/dify/blob/0d580fddf7df8e6eae0694a45e76d395be467f19/api/core/rag/retrieval/dataset_retrieval.py)。

借鉴：业务人员运行已确认模板，管理员维护配置；检索输入输出有独立职责。不要把工作流画布、模型供应商和参数面板变成普通用户的必经步骤。

其检索单文件本身也很大，说明“目录多、功能丰富”不能自动证明解耦充分。不能以他人架构名词替代本项目实际依赖分析。

许可：[Dify许可证](https://github.com/langgenius/dify/blob/0d580fddf7df8e6eae0694a45e76d395be467f19/LICENSE)是带额外条件的Apache衍生许可，原文列多租户和前端标识条款；不能按普通Apache-2.0理解。是否引入代码需针对所用版本和场景另行核对。

## 共同结论

保留dox_agent的原文版本、项目去重、规则计算与Word成果，不整体嵌入这两套产品。先借边界和操作模式，以现有API完成一条业务旅程；没有明确收益不增加服务、数据库或框架。
