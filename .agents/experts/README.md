# 产品内置专家

四席专家目前只是资产：目录和脊柱 `AGENT.md`。不接入 FastAPI、界面或 prompt_skills。

要用某一席时，只读该席的 `AGENT.md`。不要自动加载 `learned/`。`skills/` 与 `notes/` 现在是空的。学习节奏见 [LEARNING.md](LEARNING.md)。

| 席 | 标识 | 读者 | 脊柱 |
|---|---|---|---|
| 项目申请专家 | `project-application` | 要写项目申请的用户 | [AGENT.md](project-application/AGENT.md) |
| 存量分析专家 | `stock-analyst` | 要做存量分析的用户 | [AGENT.md](stock-analyst/AGENT.md) |
| 情报分析专家 | `intel-analyst` | 要做情报分析的用户 | [AGENT.md](intel-analyst/AGENT.md) |
| 资料入库专家 | `corpus-ingest` | 管理员，做入库处理 | [AGENT.md](corpus-ingest/AGENT.md) |

## 分层

| 层 | 路径 | 怎么用 |
|---|---|---|
| 脊柱 | `AGENT.md` | 人维护。只放职责、边界、硬要求、反模式 |
| 已晋升做法 | `skills/` | 空。一次做完并被证明好用之后，才由人放进来 |
| 外围词表 | `notes/` | 空。名词和歧义，整目录可以删 |
| 草稿 | `learned/pending/` | 不自动装载 |
| 噪声 | `learned/quarantine/` | 不自动装载，也不回灌 `skills/` |


## 与仓库入口的关系

根目录 AGENTS.md 只索引四席（按任务读取表 +「产品内置专家」短节），不粘贴正文。`.agents/rules`、DOCUMENTS.md、verifier、本机 skills 仍由 `.gitignore` 忽略，不在本 PR 入库。

首次同步前先备份本机原有的 AGENTS.md，再逐段合并：保留四席索引，也保留本机必要的 WSL/Windows 路径说明、前端 DESIGN/dox-ui 等任务路由，不用整文件覆盖。新 clone 不保证带有上述本机规则、技能和校验器；引用目标缺失时应报告缺失，不能把未执行的检查称为通过。

## 运行时边界

这里的席位标识不是 API、任务注册名或 prompt_skills 资产 ID；各席 `skills/` 也不是运行时技能加载目录。四席文档不授予资料库权限，不替代 `src/review/` 的审查流程。

入库席关于管理员确认、个人库归属、重复和覆盖的要求是行为约束，不是已实现的权限或并发保证。将来接线时须验证服务端授权、账户与库隔离、同一原件重复提交、并发写入及源文件变化后的结果失效；多进程或跨机器写同一库也须单独验证，不能把进程内锁当成分布式保证。
