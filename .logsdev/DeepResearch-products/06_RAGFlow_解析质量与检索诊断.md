# RAGFlow：将解析、片段与检索质量分别观察

调研日期：2026-10-16。仓库：[ infiniflow/ragflow ](https://github.com/infiniflow/ragflow)。
固定快照：`5556dfdd378faf818504aaf77fd46977dcde08c4`；分支 main；该提交日期 2026-10-16T10:31:14Z。
证据：官方文档与指定源码静态核对；未本地部署产品，未验证真实用户任务耗时。以下“借鉴”均为面向 dox_agent 的设计推断，不是上游产品保证。


## 已核对的产品机制

官方检索测试指南要求先确认文档解析和片段，再检查检索与排序；参数测试与正式应用配置不自动同步。来源：[检索测试指南](https://github.com/infiniflow/ragflow/blob/5556dfdd378faf818504aaf77fd46977dcde08c4/docs/guides/dataset/retrieval_testing.md)。

片段管理说明支持查询、详情、启停及编辑，并可在支持的文档中联动原文位置。保存后的片段会参与后续检索。来源：[片段与原文管理](https://github.com/infiniflow/ragflow/blob/5556dfdd378faf818504aaf77fd46977dcde08c4/docs/guides/dataset/chunk_parsing_results_and_knowledge_fragment_management.md)。

README当前还描述知识编译产物、Agentic检索及独立服务部署。来源：[当前架构与能力](https://github.com/infiniflow/ragflow/blob/5556dfdd378faf818504aaf77fd46977dcde08c4/README.md)。此快照已不是凭旧印象可推断的早期架构，本报告不复述过时部署参数。

## 对 dox_agent 的启发

不要在检索不到文档时只改问题提示词。管理员需要一条最小诊断路径：
原文件存在→正文是否读到→相关片段是否生成→本次范围是否排除→是否召回→排名/预算是否截断。

用户端只给简明原因和下一步；诊断信息放管理员展开区。先利用已有解析、chunk、检索日志和测试能力，确实缺字段再补，不能直接接入另一套检索服务。

## 不能直接照搬片段编辑

dox_agent依赖原文证据。若允许人工改片段，修改文本必须与原文分开，记录作者/版本，不能仍声称是原文引句。首期优先重解析和人工核对，而不是开放任意片段改写。

## 验收切片与许可

选已知正文中存在的目标，确认可检索；再构造未解析、范围排除、召回但预算未读三种情况，分别显示原因，不统一“资料不存在”。

许可证Apache-2.0：[LICENSE](https://github.com/infiniflow/ragflow/blob/5556dfdd378faf818504aaf77fd46977dcde08c4/LICENSE)。本轮阅读官方指南与仓库，未安装其依赖栈、未跑检索性能基准，不将宣传的规模能力当成本系统千人可用证明。
