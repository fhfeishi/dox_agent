# GitHub 产品调研与 dox_agent 整合索引

调研日期：2026-10-16；交付核对：2026-10-17。范围：8个项目，官方仓库/文档与选定源码；产品思路整合与第一批本地模块解耦。
这不是“推荐换用哪套产品”的排名，也不因星数推断易用性、保密适用性或千人承载能力。

## 先看结论

- 资料接收和整理重点学习 **Paperless-ngx**。
- 资料、问题和可保留分析输出的连续工作区重点学习 **Open Notebook**。
- 工作区范围、文件处理和引用聚合参考 **AnythingLLM**。
- 原文证据联动参考 **Kotaemon**，解析及召回诊断参考 **RAGFlow**。
- 成果阅读/编辑与版本组织参考 **Docmost**。
- **Outline、Dify**用于架构和产品边界对照，不默认引入其代码。

这些模式可组合到现有dox_agent，不需要把八套产品拼接成新系统。直接下载依赖不是产品整合。

## 阅读顺序

1. [资料接收整理：Paperless-ngx](01_Paperless-ngx_资料接收与整理.md)
2. [文档编辑与空间：Docmost](02_Docmost_空间与文档编辑.md)
3. [连续研究工作区：Open Notebook](03_OpenNotebook_资料到分析的连续工作区.md)
4. [范围与引用：AnythingLLM](04_AnythingLLM_工作区范围与来源呈现.md)
5. [证据阅读：Kotaemon](05_Kotaemon_证据联动与检索界面.md)
6. [检索诊断：RAGFlow](06_RAGFlow_解析质量与检索诊断.md)
7. [架构及许可对照：Outline与Dify](07_Outline与Dify_架构对照及许可边界.md)
8. [跨产品结论与本项目整合](08_dox_agent整合方案与验证.md)
9. [代码解耦与模块化](09_工程模块化方案与首批实施.md)
10. [源资料清单与哈希](sources.json)

## 选型方法和证据分级

筛选条件：与本地资料/科研报告相关；有公开代码和可读官方资料；能贡献不同工作流程；不要求与dox_agent技术栈相同。
保留小型个人仓库下的Open Notebook，以及社区、团队和平台型项目作对照。仓库归属不用于推断维护者人数或稳定性。

A：实际运行并完成目标任务；B：指定提交的代码与官方说明相互印证；C：只有官方说明；D：设计推断。
本轮多数为B/C，所有dox_agent借鉴建议为D，待原型和真实人员验证。没有任一外部产品完成本地部署后的A类全过程验收。

网页搜索用于发现，报告结论优先引用官方仓库、原始文件或官方指南；未把DeepWiki、转载或营销对比表当作实现证明。
固定的是调研时默认分支HEAD，不是稳定发行版承诺。完整SHA、文件哈希及是否归档见sources.json；八个仓库在本次API返回中均未标记archived。

| 仓库 | 固定提交 | 提交日期（UTC） | 许可证记录 |
| --- | --- | --- | --- |
| [paperless-ngx/paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | 30a24ee02e | 2026-10-16 | GPL-3.0 |
| [docmost/docmost](https://github.com/docmost/docmost) | 6852e0427e | 2026-10-16 | AGPL-3.0；企业目录另许可 |
| [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook) | a0f6f3081a | 2026-10-05 | MIT |
| [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | d7d68e75c4 | 2026-10-15 | MIT |
| [Cinnamon/kotaemon](https://github.com/Cinnamon/kotaemon) | 9ad3e4e49a | 2026-05-30 | Apache-2.0 |
| [infiniflow/ragflow](https://github.com/infiniflow/ragflow) | 5556dfdd37 | 2026-10-16 | Apache-2.0 |
| [outline/outline](https://github.com/outline/outline) | a717cb0645 | 2026-10-16 | BSL 1.1（公开源码） |
| [langgenius/dify](https://github.com/langgenius/dify) | 0d580fddf7 | 2026-10-16 | Dify自定义许可 |

许可证栏是文件识别结果，不是对具体部署/分发行为的法律结论。借鉴交互并自主实现与直接复制代码必须分开；引入前需核对具体目录、依赖和所用版本。

## 浏览与失败记录

- Docmost官方Spaces指南、Open Notebook官方站实际可访问并有截图；这证明页面阅读，不代表已操作产品工作区。
- Paperless公开demo返回Cloudflare403，未绕过验证，未上传任何资料。
- 另有官方文档URL返回403或404；相关结论改用固定提交内的官方文档，未假装访问成功。
- GitHub公开API/原始文件通过本机代理进行只读获取；未改dox_agent模型连接设置，未向外部产品上传本项目资料或凭据。
- 第三方源码只暂存在/tmp用于阅读，没有复制到src/或frontend/。

截图：
[Docmost文档页](evidence/docmost-spaces.png) ·
[Open Notebook官网](evidence/open-notebook-site.png) ·
[Paperless demo受阻页](evidence/paperless-demo.png)

## 调研的实际价值与限制

补产品调研能帮助我们找到成熟的操作模式和已知代价，但不能让设计自动“科学正确”。本轮没有用户访谈、外部项目性能测试、长期维护评价或涉密部署认证。
下一步应用相同资料、相同任务比较原型，不以截图好看或功能更多认定胜出。

## 本轮交付状态

已完成8项目调研、10份Markdown报告及来源清单、现行设计关联、审查域首批模块解耦。分析工作区已有主链经补验通过，未重复开发。后端main/store等更大范围的拆分列为后续M2/M3，不将首批交付称为全系统重构完成。代码未提交或推送。验证汇总见 [交付证据](evidence/交付验证-20261017.md)。
