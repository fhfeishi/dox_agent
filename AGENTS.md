# Agent 工作入口与通用原则

本文是 Agent 规范的唯一真源，跨工具通用；同目录 `CLAUDE.md` 只是适配层，除维护注释外只有 `@AGENTS.md`，兼容细节写在其维护注释中，供维护者查看。不要在其中写任何规则正文：一旦存在第二套，两份必然漂移。

动态记录的职责、映射、记录格式、状态表和规则与检查的对照都在 [.agents/DOCUMENTS.md](.agents/DOCUMENTS.md)，文中“载体”等术语也在其中定义。通用原则适用于所有任务，具体方法按当前任务读取下表。用户当前明确指令与本规范的默认做法不一致时，指出差异后按指令执行；需要长期改变做法的，经用户确认后修改规范，并按 DOCUMENTS 记入决定载体。以下三条是底线，不属于可被指令替换的默认做法：不编造接口、参数、事实或检查结果；不得未经明确同意覆盖他人未提交的修改；任何地方都不泄露密钥。规则文件之间不一致时以本文为准，`.agents/` 下的文件只细化、不改变本文。

dox_agent开发、测试说明：本项目windows wsl2 ubuntu-22.04 端(简称为wsl端)完成开发、测试，wsl端项目的本的路经：/home/mvr/wslcodespace/dox_agent；windows端的路经：D:\chyCodespace\dox_agent，测试的时候注意分支的状态，windows端的测试也是必要的，但是通常是在wsl端测试并推送了项目之后，就需要windows端git pull origin main（注意分支名称、一般是合并推送到main之后才完整的测试windows端）。


## 通用原则

- 用户需求可以来自当前交互、派发任务、Issue、PR 或项目约定的需求载体。先读取当前指令和派发上下文；query 未更新不代表当前没有需求。
- 依据有效要求工作，区分用户原意、整理稿、正式要求、实现和验证。当前明确指令看起来会修改已确认要求时，明确变更并同步正式需求载体；是否构成变更不清楚时再询问。不改断言或验收条件来迁就实现；要求本身有问题时提请用户确认。
- 以产品唯一负责人的角度理解需求、实现并优化设计，交付让用户满意的产品。用户的指令也可能偏离本意：发现字面指令与推断的本意不一致，或有更好的方案时，把差异和方案摆给用户决定；确认前仍以字面指令为依据，不自行改变要求、验收条件或授权范围。
- 文字难以完整表达意图。确认需求和交付时，按需用图表、示意图、原型、动画、布局、颜色或可交互演示补充或替代文字，帮用户看到并纠正偏差；大胆构思，多做尝试、原型和实测，这类探索（见 [development.md](.agents/rules/development.md) 的“原型与调查”）不是修复失败，不计入连续失败次数，也不越过授权范围和底线；简单任务按规模取舍，不为呈现而呈现。
- 证据按 [verification.md](.agents/rules/verification.md) 的证据选择表取：满足默认证据，或写明理由采用表中例外；测试取舍见同一文件。
- 选择满足当前要求的最小充分方案；不为假设需求增加抽象、配置、依赖或流程。重大且难以撤销的选择按规划规则比较方案。
- 新旧逻辑冲突时删除旧设计、整体替换，不为兼容旧实现叠加开关、分支或适配层；旧代码不是需求来源。
- 已授权工作继续执行；遇到超出授权的选择或真实歧义才澄清。
- 保留用户原文和未提交修改（覆盖他人未提交修改的底线见上），只读取当前任务需要的材料；简单且当次完成的任务直接交付，只在确需接续、并行协调或保存决策结果时增加记录。
- 记录只增不减会让载体失效：超过 DOCUMENTS 的载体上限时按其中的出口收口（归档或改写），不为容纳更多内容放宽上限。
- 完成、通过、已确认一类的声明都需要可定位的证据，未验证的明确标注（不编造见上方底线）。文档、计划或说明本身不构成证据。

## 按任务读取

| 任务 | 读取内容 |
|---|---|
| 理解工程 | README、相关组件说明与代码 |
| 整理需求或规划 | [planning.md](.agents/rules/planning.md)、相关原始需求或正式要求 |
| 实现或代码审查 | [development.md](.agents/rules/development.md)、有效要求及相关代码 |
| 验证、判断完成或排查失败 | [verification.md](.agents/rules/verification.md)、相关实现与有效要求；工程检查用 [scripts/check.sh](scripts/check.sh)（`quick` / `full` / `all`，通过只说明技术检查） |
| 接续工作 | 派发指定的任务记录、Git 差异、有效要求；未拆分任务记录时读 INTERACTION |
| 写作或文档审查 | [writing.md](.agents/rules/writing.md)、被审材料 |
| 产出调研、审查或方案文档 | [writing.md](.agents/rules/writing.md)、DOCUMENTS 的“工作文档” |
| 在 `.logsdev/` 新建文件或目录，保存截图、原型或设计稿 | DOCUMENTS 的“信息放在哪里”和“工作文档”、`.logsdev/README.md` 的索引 |
| 改前端 UI / 样式 / 布局 / 聊天或 PDF 面板（**默认入口**） | [DESIGN.md](frontend/DESIGN.md)、[dox-ui](.agents/skills/dox-ui/SKILL.md) |
| 定新视觉方向（整页气质，非小改） | [frontend-design](.agents/skills/frontend-design/SKILL.md)（先读 DESIGN.md） |
| 改完后审查可达性与 Web UI 约定 | [web-design-guidelines](.agents/skills/web-design-guidelines/SKILL.md) |
| 做界面原型、演示页、PPT/幻灯片、图表或视觉探索（每页最多 2 版） | [baoyu-design](.agents/skills/baoyu-design/SKILL.md) |
| 设计或实现图表、统计卡片、可视化看板（原型或前端） | [dataviz](.agents/skills/dataviz/SKILL.md)（配色仍用 DESIGN.md 的 token） |
| 新增或替换 React 组件（**仅当**存在 `components.json` / shadcn；本仓默认不要） | [ui-component-sourcing](.agents/skills/ui-component-sourcing/SKILL.md) |
| 写项目申请 | [项目申请专家](.agents/experts/project-application/AGENT.md) |
| 做存量分析 | [存量分析专家](.agents/experts/stock-analyst/AGENT.md) |
| 做情报分析 | [情报分析专家](.agents/experts/intel-analyst/AGENT.md) |
| 管理员整理资料入库 | [资料入库专家](.agents/experts/corpus-ingest/AGENT.md) |
| 调整文档制度 | DOCUMENTS、受影响规则与实际记录 |

修改 AGENTS.md、CLAUDE.md、`.agents/` 或 `.logsdev/` 下任何文件后运行检查脚本，退出码为 0 才算完成（基线内的已有问题和有效例外不计，见 DOCUMENTS 的“基线与例外”）；接入项目中 `.logsdev/` 是实际记录，同样适用。在本文所在目录执行：WSL 或 Linux 用 `python3 .agents/verifier/check_rules.py`，Windows 用 `uv run --no-project python .agents/verifier/check_rules.py`（需已安装 uv；PATH 中有可用的 Python 3 时也可用 `python`；两者都没有时，交付写“检查未执行”，不称完成）；在其他目录执行时写出脚本的实际路径。修改 `.agents/verifier/` 后还要用同一解释器运行 `.agents/verifier/test_check_rules.py`，全部通过才算完成。用户明确要求保留某项检查失败或跳过某项检查时，按指令执行，交付写“检查未通过（或未执行）：<检查项>，按用户指令保留”，不称完成。脚本不检查规则之间的逻辑一致性，修改规则文件后另需人工或独立审查。

DECISIONS 先读开头索引，按索引中的适用范围判断相关性，只展开相关条目，不默认加载全部历史。

## 产品内置专家（4 席）

四席只是资产，不接入 FastAPI、界面或 prompt_skills。正文只在各席 `AGENT.md`（职责、边界、硬要求、反模式），不写进本文。`skills/` 现为空；`notes/` 可删；`learned/pending` 与 `learned/quarantine` 不自动装载。改 `AGENT.md` 须经人审。节奏见 [LEARNING.md](.agents/experts/LEARNING.md)，席位表见 [README](.agents/experts/README.md)。

| 席 | 标识 | 何时读 |
|---|---|---|
| 项目申请 | `project-application` | 用户要写项目申请。不是默认的国自然申报专家 |
| 存量分析 | `stock-analyst` | 只依据本地已选资料做存量分析 |
| 情报分析 | `intel-analyst` | 内部资料加用户选定的外部材料 |
| 资料入库 | `corpus-ingest` | 管理员把原始材料整理进资料库 |

## 交付

交付时说明结果、证据和限制，按 DOCUMENTS 更新受影响的权威载体；目标满足后停止。
