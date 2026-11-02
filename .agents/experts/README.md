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
