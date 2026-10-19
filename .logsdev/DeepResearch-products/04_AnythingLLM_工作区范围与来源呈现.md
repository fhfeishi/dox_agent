# AnythingLLM：明确工作区资料范围与来源聚合

调研日期：2026-10-16。仓库：[ Mintplex-Labs/anything-llm ](https://github.com/Mintplex-Labs/anything-llm)。
固定快照：`d7d68e75c422d10384b8aa30f72d6d032fcc555e`；分支 master；该提交日期 2026-10-15T20:20:11Z。
证据：官方文档与指定源码静态核对；未本地部署产品，未验证真实用户任务耗时。以下“借鉴”均为面向 dox_agent 的设计推断，不是上游产品保证。


## 已核对的产品机制

项目README说明工作区、文档问答和来源引用。更具体的源码显示：文档管理组件区分待选文件与工作区文档，维护待加入集合、处理进度及失败提示；加入工作区与文件存在不是同一动作。来源：[工作区文档管理](https://github.com/Mintplex-Labs/anything-llm/blob/d7d68e75c422d10384b8aa30f72d6d032fcc555e/frontend/src/components/Modals/ManageWorkspace/Documents/index.jsx)、[文档操作](https://github.com/Mintplex-Labs/anything-llm/blob/d7d68e75c422d10384b8aa30f72d6d032fcc555e/server/models/documents.js)。

回答的引用组件包含combineLikeSources及侧栏打开逻辑，同来源可聚合显示。来源：[来源组件](https://github.com/Mintplex-Labs/anything-llm/blob/d7d68e75c422d10384b8aa30f72d6d032fcc555e/frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/Citation/index.jsx)。

## 对 dox_agent 的启发

界面应明确三个集合：库里存在的资料、已经可检索的资料、本次任务实际采用的资料。它们不能统一用“已上传”解释。

资料选择从入口传到任务，用户明示的选中范围优先于自动推荐。应用只在需要时说明“2份正在处理，尚未用于回答”，不用让用户手动管理向量化。

引用列表按文件归并，但保留该文件各条引用的位置；与我们已有同文档去重相符，无需再次开发一个来源系统。

## 不照搬的部分

桌面版、Docker版、多用户配置的能力不能互相推断。自托管与本地模型是不同条件；多个模型/连接器和Agent配置不应成为普通资料管理员的入口。

工作区移入/移出在dox_agent中不能被理解为移动源文件。保持资料库与分析范围的现行边界，避免两套范围配置。

## 验收切片与许可

用户选两份资料，其中一份处理失败 → 明确本次有效范围 → 回答只引用可用来源 → 重试成功后新任务使用新版本，不改写旧答案依据。
许可证MIT：[LICENSE](https://github.com/Mintplex-Labs/anything-llm/blob/d7d68e75c422d10384b8aa30f72d6d032fcc555e/LICENSE)。本轮静态阅读指定源码，未部署工作区或运行该项目模型。
