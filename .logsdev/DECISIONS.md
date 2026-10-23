# DECISIONS — dox_agent 关键决策

接入本规范前的 105 条未编号决定（2026-09-22 至 2026-10-20）在 [DECISIONS-archive.md](DECISIONS-archive.md)，未被取代的仍然有效，按需检索。

## 索引

- D-20261021-1 采用 aevum/projection_dox 文档体系（规则、检查与基线）｜文档制度、规则检查、基线｜现行
- D-20261021-2 引入 baoyu-design skill，安装产物不入库｜skill、依赖安装、版本控制｜现行
- D-20261022-1 工作文档名称不强制带日期｜工作文档命名、check_rules C8｜现行
- D-20261022-2 记录目录收口：专题目录、证据目录、载体出口与模板更新通道｜.logsdev 结构、owner-*-design、verification、query 与 DECISIONS 出口、设计载体、init.py --update｜现行
- D-20261023-1 报告、审查与对话按账户归属列出｜可见范围、报告中心、周期总结、会话历史、visible_owners｜现行

## D-20261021-1 采用 aevum/projection_dox 文档体系（规则、检查与基线）

- 决定与范围：把 `projection_dox` 的规则与检查机制并入本项目：`AGENTS.md` 换成该模板正文（保留本项目 `check.sh` 与验证入口的既有事实，不改工程行为）；`.agents/DOCUMENTS.md` 按本项目载体登记“项目映射”（PROJECTION → `PROJECT.md`、INTERACTION → `ITERATION.md`）；`.agents/rules/` 四份方法文档、`.agents/skills/ui-component-sourcing/`、`.agents/verifier/check_rules.py` 与 `test_check_rules.py` 一并纳入。用户选择“只接入规则与检查，历史用基线兼容”（A 方案），不整改既有 2000+ 记录。
- 理由与代价：此前 `.agents/DOCUMENTS.md` 只有信息归属和映射，缺记录格式、状态表、载体上限、检查与回归测试，规则靠人工遵守且无法定位违规。代价：既有 `.logsdev/` 记录大量不符合新结构（命名、状态行、DECISIONS 编号、载体行数），需要基线登记；`.agents/` 与 `AGENTS.md` 目前仍被 `.gitignore` 忽略，规则文件未纳入版本控制，与模板要求不符，待用户决定是否解除忽略。
- 未采用：整改全部历史记录（B 方案）——会移动大量历史文件、改写已确认的决策标题，收益低于风险；只合并说明文档、不装检查（C 方案）——规则仍无法执行，等于没有接入。
- 依据：用户 2026-10-21 选择 A 方案；`python3 .agents/verifier/check_rules.py` 退出码 0（基线 144 条，0 个新增错误、0 个警告）；`python3 .agents/verifier/test_check_rules.py` 15 个用例全部通过。
- 适配与偏离模板之处：`test_check_rules.py` 不再复制真实 `.logsdev`（265 MB，且历史记录按基线收口），改为内置最小记录样本 `FIXTURE`，并按本项目映射使用 `PROJECT.md`/`ITERATION.md`；`check_rules.py` 的 `read()` 对图片等二进制附件直接返回 None，修掉“读 png 失败再记一条 C9”的自身误报；`.logsdev/README.md` 中与 `.agents/` 重复的规则书（原第 59–140 行）改为指向 `.agents/` 的入口说明，保留文档索引。
- 基线：首次接入以 `--write-baseline` 初始化 `.agents/verifier/check_rules.baseline`（144 条），之后只减不增；历史记录按 DOCUMENTS 的“载体上限与出口”逐步收口，不一次性重写。

## D-20261021-2 引入 baoyu-design skill，安装产物不入库

- 决定与范围：用 `npx skills add JimLiu/baoyu-design -s baoyu-design -y --copy` 安装设计类 skill（界面原型、演示页、PPT、图表、视觉探索），装到 `.agents/skills/baoyu-design`（同时被复制到 `.claude/skills/`、`.hermes/`），并在 AGENTS 的阅读路由登记。按用户 2026-10-21 指令，安装产物不纳入 git：`.claude/skills/`、`.hermes/`、`skills-lock.json` 加入 `.gitignore`（`.agents/` 原本已忽略）。
- 理由与代价：该 skill 自带 199 个文件、约 7 MB，并被复制进每个 agent 目录，入库会明显撑大仓库且随上游更新频繁变动。代价：换机器或 clone 后需要重新执行安装命令，命令写进 `.gitignore` 的注释里；`skills-lock.json` 不入库，无法用它固定版本。
- 未采用：只装 `baoyu-design` 而不装同仓库的 `release-skills`——后者是发版流程，与本项目当前需要无关；用 `--copy` 而非符号链接——链接指向全局目录，换机器后失效。
- 依据：`npx skills add` 输出显示安装到 `.agents/skills/baoyu-design` 等三处；`git check-ignore` 确认四个路径均已忽略；`python3 .agents/verifier/check_rules.py` 在本改动范围内无新增错误（`.logsdev/_tmp` 一项见下）。
- 已知未决：检查当前报 C8 `.logsdev/_tmp/README.md:1 工作文档目录缺少入口 README.md`。该目录不是本次改动产生的，同一工作目录下另有进程正在修改 `src/api/structure.py`（11:50 仍在写入），按“不得覆盖他人未提交修改”保留原状，待其结束后再按 DOCUMENTS 处理。

## D-20261022-1 工作文档名称不强制带日期

- 决定与范围：工作文档和设计载体的名称只要求看得出主题（如 `owner-问答-design`），日期后缀可加可不加；创建日期以开头的 `日期：` 行为准，该行仍必填。名称带日期时须是真实日期，并与 `日期：` 一致。改动见 `.agents/DOCUMENTS.md` 的“工作文档开头”和“工作文档”节的位置与命名一条，以及 `check_rules.py` 的 C8、C5。
- 理由与代价：用户 2026-10-22 指出原规则不合适。用户自己按 `owner-<页面>-design` 组织设计试验目录，强制加日期会让同一页面的持续设计每天换一个目录名，链接也跟着失效；日期本来已写在开头行里，名称里再写一遍是重复。代价是从名称上看不出新旧，需要看开头日期或 git 记录。
- 依据：`test_check_rules.py` 15 个用例通过，新增“名称不带日期通过”“名称日期不真实”“名称日期与开头不一致”三项；`check_rules.py` 退出码 0，基线因 3 条命名错误消失而收缩。

## D-20261022-2 记录目录收口：专题目录、证据目录、载体出口与模板更新通道

- 决定与范围：用 `projection_dox/init.py --update` 把模板 2026-10-22 版的规则与检查同步进来（AGENTS.md 只手工加一条路由），并按新规则整理记录：
  - 项目映射从 `.agents/DOCUMENTS.md` 移到 `.logsdev/README.md`，新增 `任务记录 → .logsdev/tasks`；README 只做映射和索引，去掉自设的状态词。
  - `owner-<模块>-design/` 是专题目录：一个模块一个，入口 README 写“现行”，目录内部怎么组织不设限；按用户决定本地保存、不入库（各目录放 `.gitignore`，`owner-首页-design`、`owner-问答-design` 已 `git rm --cached`，文件仍在本地）。`owner-领域分析-design` 顶层 7 份 `README-v*` 移入 `notes/`，12 个 `*.tmp` 移到 `archive/owner-领域分析-design-tmp/`，`verification-gulu/` 里的 `node_modules/`、`.npmcache/`（约 35 MB，可重装）删除。
  - 截图等检查证据统一放 `.logsdev/verification/<来源>/`（本来就由测试脚本写入，整体忽略）。
  - `design/`、`requirements/`、`reviews/`、`DeepResearch-products/`、`interactions/` 是接入前的分类目录，原位保留、不再新增文件。
  - 登记设计载体两份：`design/系统.md`、`design/界面.md`（开头改为标准三行，PROJECT 链接）。`机关界面设计语言`（自述初稿）、`总体交互与展示设计-20261015`（与界面.md 同主题）、`通用模板审查…-20261008`（10-08 待实施稿）仍是参考，不登记。
  - 载体出口：query 中已关闭的条目原文移入 `query-archive/<YYYY-MM>.md`，`query.md` 顶部留索引；之后每条处理完写一行去向（结果、提交号、证据路径），细节写提交说明。DECISIONS 接入前 105 条未编号条目原样移入 `DECISIONS-archive.md`。PROJECT §9、§10 移出。
- 理由与代价：用户 2026-10-22 指出各 Agent 在 `.logsdev/` 下乱放记录、按模块设计的目录在规则里没有位置。实测：`owner-领域分析-design` 有 1285 个文件、216 MB，10 份并列入口、5 个 Agent 子目录、证据两套、依赖缓存混在其中；query、DECISIONS、PROJECT 超限后留在基线里，query 涨到 1769 行。代价：专题目录不入库，换机器不随仓库走，确认的设计必须写进设计载体或 PROJECT 才算保存；分类目录冻结而不搬迁，因为 `src/core/db.py`、`scripts/permission_matrix.py` 和历史决定都引用这些路径；PROJECT §9（单用户工作台架构）、§10（四维需求报告）移出的依据是 PROJECT 自述“§1–§10 已被 §0 取代、待 D-doc 重写”且 D-doc 已完成，若其中仍有只写在那里的有效要求，从提交 `0c8afc0` 的 `.logsdev/PROJECT.md` 找回。
- 未采用：搬迁分类目录（大量链接和代码注释要改，收益小）；专题目录入库（用户选择不入库）；保留 query 中的长段实施记录（与提交说明重复，用户选择一行去向）；规定专题目录的固定版本表栏位（用户要求规则不能压住设计上的想象力，只约束入口、依赖缓存和证据位置）。
- 依据：用户 2026-10-22 确认方案（范围两边都改、专题目录不入 git、去向一行、设计载体由 Agent 判断）并要求规则减负；`check_rules.py` 与 `test_check_rules.py` 结果见交付说明。

## D-20261023-1 报告、审查与对话按账户归属列出

- 决定与范围：报告（含保存的回答）、审查记录与对话归生成它的账户。报告中心列表与统计、周期总结及其生成、首页“最近报告”、审查记录列表与会话历史只列本账户的记录；规则集中在 `src/auth.py` 的 `visible_owners`，各列表接口带 `scope=mine|all`。未记录生成人的早期记录（10-13 之前，当前本机 9 份报告、9 次审查、36 个会话）归管理员，与“只有生成人或管理员可删除”的既有规则一致；`scope=all` 只限管理员（报告中心“全部账户”、管理员待办与概览统计）。按 id 直接打开某份报告或审查不受限，链接仍可分享。取代 query 2026-1014 1516 的“所有角色看到同样的报告”。
- 理由与代价：用户 query 2026-1023 1044 要求报告中心显示当前登录用户的报告，周期总结要随记录即时更新；实测领导 10-23 生成的季度总结统计了全部 10 份报告（其中 9 份不是本人的），也漏掉了 41 秒前刚保存的回答。代价：早期无生成人的会话与报告对领导和普通用户不再可见，只在管理员处；这是可见性而非权限，未知 id 仍可读。
- 未采用：把早期记录按会话内容推断归属（无依据，可能错归）；按 id 读取也做归属校验（会使已分享的报告链接与跨页引用失效，需另行决定）。
- 依据：`tests/test_period_summary.py`、`tests/test_workspace.py` 中的归属断言；浏览器检查 `.logsdev/verification/query-20261023-1044/`。
