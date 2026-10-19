# Kotaemon：文档问答与可视证据

调研日期：2026-10-16。仓库：[ Cinnamon/kotaemon ](https://github.com/Cinnamon/kotaemon)。
固定快照：`9ad3e4e49aa35b8acddd235918a5d9753c1cfdf9`；分支 main；该提交日期 2026-05-30T14:02:58Z。
证据：官方文档与指定源码静态核对；未本地部署产品，未验证真实用户任务耗时。以下“借鉴”均为面向 dox_agent 的设计推断，不是上游产品保证。


## 已核对的产品机制

README将产品定位为文档问答工具，说明全文/向量混合检索、重排、带文档预览的引用及低相关结果提示；界面基于Gradio。来源：[产品说明](https://github.com/Cinnamon/kotaemon/blob/9ad3e4e49aa35b8acddd235918a5d9753c1cfdf9/README.md)。

聊天页源码组合对话、文件范围、设置及引用预览，并包含引用点击与PDF视图的联动代码。来源：[聊天页组装](https://github.com/Cinnamon/kotaemon/blob/9ad3e4e49aa35b8acddd235918a5d9753c1cfdf9/libs/ktem/ktem/pages/chat/__init__.py)、[对话面板](https://github.com/Cinnamon/kotaemon/blob/9ad3e4e49aa35b8acddd235918a5d9753c1cfdf9/libs/ktem/ktem/pages/chat/chat_panel.py)。
这些是实现路径证据，不证明任意扫描PDF都能精准定位。

## 对 dox_agent 的启发

回答正文、证据片段、原文位置应是一次点选链。默认先读结论，点引文再看材料，不把来源列表与报告混成一大段。

“未找到足够相关资料”应成为可处理状态：展示实际范围、改问题或改范围，不伪造全面结论。相似度供管理员定位问题，普通用户不必理解分数含义。

同一类工具的反例也值得看：聊天设置项过多会让业务用户承担检索参数选择，因此不照搬全部控制面板。

## 不照搬的部分

不迁移到Gradio，不为了有图就开启GraphRAG示例，不用论文检索模式替代科研项目身份去重。
官方README的“advanced citations”只是能力声明，dox_agent仍需自己的版本、缺页和点击定位测试。

## 验收切片与许可

中文长报告：点答案引用→定位正确文件/页块→关闭返回原回答；相关材料缺失时不生成假引用。
许可证Apache-2.0：[LICENSE.txt](https://github.com/Cinnamon/kotaemon/blob/9ad3e4e49aa35b8acddd235918a5d9753c1cfdf9/LICENSE.txt)。本轮未运行其OCR或真实问答。
