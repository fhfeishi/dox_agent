# Open Notebook：资料、分析对话与可保留输出

调研日期：2026-10-16。仓库：[ lfnovo/open-notebook ](https://github.com/lfnovo/open-notebook)。
固定快照：`a0f6f3081ae06328f0a451b3a3ef2959ca25721d`；分支 main；该提交日期 2026-10-05T02:29:29Z。
证据：官方文档与指定源码静态核对；未本地部署产品，未验证真实用户任务耗时。以下“借鉴”均为面向 dox_agent 的设计推断，不是上游产品保证。


## 已核对的产品机制

对象明确分为 Notebook、Source、Insight 和 Note：来源可以链接多个笔记本，转换结果附属于来源，笔记可由人编写或从回答保存。来源处理包括读取、可选嵌入和所选转换。来源：[对象关系](https://github.com/lfnovo/open-notebook/blob/a0f6f3081ae06328f0a451b3a3ef2959ca25721d/docs/2-CORE-CONCEPTS/notebooks-sources-notes.md)。

官方界面指南描述桌面Sources/Notes/Chat三列，可收起来源和笔记；窄屏转为页签。每份来源可选择不纳入、只纳入insights、纳入全文；这是具体上下文控制，不等于模型已完整阅读所有来源。来源：[界面结构](https://github.com/lfnovo/open-notebook/blob/a0f6f3081ae06328f0a451b3a3ef2959ca25721d/docs/3-USER-GUIDE/interface-overview.md)、[上下文与检索](https://github.com/lfnovo/open-notebook/blob/a0f6f3081ae06328f0a451b3a3ef2959ca25721d/docs/2-CORE-CONCEPTS/ai-context-rag.md)。

## 对 dox_agent 的启发

这是“选资料→问问题→保留成果”连续性的重点参考。建议复用现有库、选中文档、任务和成果，不再新建一套Notebook对象。

在资料文件页选择A、B后，右侧展开同一个提问流程；范围摘要持续显示，回答可保存到既有成果。切换原文不清空问题；切换任务不重新选范围。

不要默认把所有来源全文送给模型，也不要让用户理解token或embedding才可使用。管理者可以检查处理状态，普通用户只需知道“本次采用哪些资料、哪些没能读取”。

## 一个重要反例：不能降低我们的引用能力

官方引用说明明确：引用指向整条source/note/insight，没有页码、章节或高亮定位；资料删除后链接可能显示内容不存在。转换结果本身也不生成同样的引用。来源：[引用能力与限制](https://github.com/lfnovo/open-notebook/blob/a0f6f3081ae06328f0a451b3a3ef2959ca25721d/docs/3-USER-GUIDE/citations.md)。

因此只借其操作连续性；dox_agent继续保留文件版本、原文位置、引用有效性与成果生命周期。不能把AI笔记直接等同于原始证据。

## 不纳入首批

播客、音视频生成、多模型挑选界面和新增共享来源图谱不是当前核心任务。自托管也不自动意味着无数据外发，取决于实际模型与连接器配置。来源：[部署与模型说明](https://github.com/lfnovo/open-notebook/blob/a0f6f3081ae06328f0a451b3a3ef2959ca25721d/README.md)。

## 验收切片与许可

从两份资料开始一次对比 → 看引用 → 回到问题 → 保存报告；全过程范围一致，结果不变成无出处复制文本。
许可证MIT：[LICENSE](https://github.com/lfnovo/open-notebook/blob/a0f6f3081ae06328f0a451b3a3ef2959ca25721d/LICENSE)。官方站已浏览，但没有部署其应用；三列与交互说明依官方指南，尚未验证实际中文长文件体验。
