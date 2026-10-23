# 收尾规划：分支盘点、未完成任务与 Windows 端缺陷（2026-10-23）

来源：用户 2026-10-23 指令（“查看其他分支是否还有未完成的任务……之前提到的未完成问题也整理到一个方案中；你现在是 planner”）。本文是任务记录：只写当前状态、依据、未决项和下一步，完成一项改一项，不追加流水。Windows 端调通与测试的过程见本次交付说明，证据在 `.logsdev/verification/windows-smoke-20261023/`（截图 58 张与两个测试脚本）。

## 1. 盘点结论

### 1.1 分支（2026-10-23 18:20，`git fetch --all --prune` 后）

| 分支 | 位置 | 与 `main` 的关系 | 结论 |
|---|---|---|---|
| `main` / `origin/main` | `67d3656` | — | 已含全部已提交工作（本日由 `a7bb1a4` 快进） |
| `feat/domain-atlas-20261022`（本地与远端） | `67d3656` | 与 `main` 相同 | 已提交部分无待合并；工作区另有未提交改动，见 W1 |
| `quality-pilot`（仅本地，worktree `../dox_agent-quality-pilot`） | `97f5447`（10-19） | 是 `main` 的祖先，落后 57 个提交，无独有提交，worktree 干净 | 已按用户答复删除分支与 worktree（`git branch -d`，2026-10-23） |

没有其他本地或远端分支，也没有 stash。

### 1.2 未完成任务

| 编号 | 内容 | 状态 | 负责 | 依据 |
|---|---|---|---|---|
| W1 | 领域分析 01 总览 v2：三视角四象限 + 年度带 + 下钻（query 2026-1023 1506）；用户 10-23 答复见 §4 第 1 项 | 实施中断：工作区 14 个文件已改、5 个新增，最后修改 17:33，未提交、未验证 | 原实施 Agent（额度恢复后继续） | 方案 `.logsdev/owner-领域分析-design/claude-01-总览/README.md` §5–§6；改动见 `git status`（`src/api/domains.py`、`DomainLens.tsx`、`YearBand.tsx`、`domainAtlas.ts` 等） |
| A1 | 主流程 A、B 验收（G2 门） | 待用户执行 | 用户；Agent 记录 | [A1 验收](../A1-验收-20261021/README.md)；[ITERATION §5](../../ITERATION.md#5-下一步) |

### 1.3 Windows 端测试中发现、尚未修复的问题

| 编号 | 问题 | 复现与依据 | 影响 |
|---|---|---|---|
| R1 | 项目索引缓存失效后（升级、`INDEX_VERSION` 或提取结果变化），首页与领域分析的并发请求同时重建，逐条提交互相等锁，30 秒超时后全部失败，重建永远完成不了 | 服务日志 12 次 `sqlite3.OperationalError: database is locked`（`src/project_index.py:158`）；py-spy 见 6 个线程同时在 `library()` 写入；顺序预热后 11 库首轮 0.05–70 s、次轮均 ≤1.3 s | 页面全部无数据；W1 上线后若缓存失效会再次发生 |
| R2 | 直接打开或刷新 `/library/<资料库>` 返回 404 JSON“页面未构建或资源不存在” | `src/main.py` 前端兜底正则只放行 `library/<id>/documents…` 与 `targets/four-facets`，不放行裸 `library/<id>`；三种角色均复现 | 分享链接、刷新失效（站内点击正常） |
| R3 | 领域分析在资料库列表加载期间显示“还没有可浏览的领域资料” | `frontend/src/components/Overview.tsx` 以 `!current` 判空，列表未返回时 `corpora` 为空；Windows 上 `/api/corpora` 需 3–5 s | 每次进入先看到“没有资料”，易误判 |
| R4 | 资料审查页常驻“最近一次模型连接测试失败” | 审查模块单独存 `model_connection` 记录（`src/review/routes.py:157`），启动检查与 `/api/model/check` 都不更新它；本次启动检查 797 ms 成功，页面仍报失败 | 误导用户以为模型不可用 |
| R5 | `/api/corpora`、`/api/overview/libraries` 在 Windows 上 3–5 s | 测试脚本记录的慢请求；WSL 未对比 | 首屏慢，放大 R3 |
| R6 | Windows 与开发分支不同步：功能分支未合并时，Windows 切到 `main` 或 `pull origin main` 就回到旧界面 | Windows reflog：16:48、18:10 两次切回 `main`；本日已把 `main` 快进到 `67d3656` | 用户误以为更新丢失 |
| R7 | 记录与现状不符 | [领域分析全景实施](../task-领域分析全景实施-20261021.md) 开头写“已回退、不代表当前状态”，但其内容后来已随 `261560d` 等提交进入产品；ITERATION §1 约束写“不改 Windows 副本 `D:\chyCodespace\agents\dox_agent`”，该目录已不存在，现副本为 `D:\chyCodespace\dox_agent` | 接续者被过期记录误导 |

## 2. 工作安排

### 2.1 顺序与并行

```
R1 ─┐
R2 ─┼─ worktree ../dox_agent-fixes（直接检出 main）── 提交 main、推送 ── Windows pull 复测
R3 ─┤
R4 ─┘                                   ╲
W1（原 Agent，在本工作区 feat/domain-atlas-20261022）── 完成 ── rebase 到含 R1 的 main ── 合并 main ── 删除功能分支
R5：R1 之后测量再定；R6：已定（D-20261023-2），README 随修复一起提交；R7：剩全景实施记录
```

- 修复（R1–R4）不等 W1：按 D-20261023-2 在 `main` 一条线上做、不另开分支；为不与 W1 未提交的改动混在一个工作区，用 `git worktree add ../dox_agent-fixes main` 单独检出 `main`，做完删除该 worktree。文件交集只有 `src/api/structure.py`（W1 改它，R1 不改它、只改 `src/project_index.py`），冲突面小。
- 每项先在 WSL 验证，推送后 Windows 拉取同一提交复测（D-20261023-2）。
- W1 依赖 R1：W1 若改动项目条目口径而使缓存失效，没有 R1 时上线即复现锁表。
- 最终写入者：本规划的负责 Agent 维护本文与 ITERATION 的链接；W1 的方案与 query 去向由 W1 负责 Agent 写。

### 2.2 任务卡

| 卡 | 做什么 | 完成依据（证据） |
|---|---|---|
| R1 | 请求只读、后台单一写入方重建（一个事务）、跨进程租约互斥、聚合按修订号缓存；不改缓存内容与签名口径。细节见 [实施方案 §1](实施方案.md#1-r1-项目索引请求只读后台单一写入方跨进程互斥) | 新增测试：冷缓存下 8 线程并发请求同一库与不同库，全部成功、无 `database is locked`，第二轮全部命中缓存；用真实 `.knowledge` 副本删缓存后开首页，页面有数据 |
| R2 | 前端兜底正则放行 `library/<id>`（与路由表 `frontend/src/router.tsx` 的 `:corpusId` 一致） | `test_app` 断言 `GET /library/<id>` 返回 `index.html`、`/api/...` 与带扩展名的缺失资源仍 404；浏览器直接打开并刷新该地址 |
| R3 | 资料库列表未返回时显示加载态，返回后为空才显示“还没有可浏览的领域资料”；顺带检查其他以 `corpora.length` 判空的页面 | 浏览器：节流 `/api/corpora` 到 5 s，加载期间不出现“还没有”；空库环境下仍显示空状态 |
| R4 | 用户选 b：审查页改读系统的模型状态，删去审查模块自己的 `model_connection` 记录与写入；启动检查、`/api/model/check` 与审查页的“重新测试”共用这一份状态 | 测试：一次失败后再成功，审查页不再提示失败；浏览器截图 |
| R5 | R1 合并后在 Windows 上测量两个接口，定位耗时（文件扫描或重复读取），超过 2 s 再立项 | 测量记录写在本文 |
| R6 | 已定为长期做法（D-20261023-2）；剩 README“运行”一节写明：两端同一分支、先 WSL 后 Windows、功能分支验证后合并 `main` | README 改动 |
| R7 | ITERATION 约束已按用户答复更正（D-20261023-2）；剩领域分析全景实施记录：按“清理前保留什么”核对后删除或改写开头说明 | `check_rules` 退出码 0 |
| W1 | 原 Agent 按方案 §6 完成，并按 §4 第 1 项的答复调整：手势保持；下钻止于“研究方向”；年度带保留，重做其交互与信息展示，并优化 01 的界面组件（用户评价“不好看”，先出对比稿再改源码）。补 §6.3 验证；合并前 rebase 到含 R1 的 `main` | 方案 §6.3 所列 pytest、npm test、tsc、构建、`check.sh full` 与浏览器截图 |
| A1 | 用户按任务卡走主流程 A、B | A1 记录表填写完成，用户给出通过与否 |

## 3. 风险

- 修 R1 之前，任何让缓存失效的上线（包括 W1）都会在 Windows 首次打开时锁表；临时处置：停服务后顺序请求各库 `/api/corpora/<id>/projects` 预热（本日用过，见 §1.3 R1 依据）。
- 不要从 WSL 直接打开 Windows 端的 SQLite 文件：跨文件系统时看不到 Windows 进程持有的锁，本日一次只读打开就撞上未回滚的 journal。
- 强制结束正在写库的服务进程会留下 hot journal，下次启动的只读迁移检查会报 `attempt to write a readonly database` 而无法启动；恢复办法是先备份，再以读写方式打开一次让 SQLite 回滚（本日备份在 `C:\Users\User\AppData\Local\Temp\dox_project_index_backup_*`）。

## 4. 用户答复（2026-10-23）

用户原文：

> 1. 顺手；技术方向，技术主题差别不大；年度带可以保留、交互和信息展示要优化一下、还有ui组件需要优化，不好看。
> 2. b
> 3. windows、wsl我们使用的技术栈不区分，就一起就好，wsl优先，然后windows；
> 4. 不要保留了，因为可以到windows端测试，允许经过实践后进行启动脚本的修改。
> 5. 删除，有必要的时候在开分支尝试多种方案。

| # | 问题 | 答复落到 |
|---|---|---|
| 1 | W1 方案 §6.4 三问 | “点空白”三合一保持；下钻止于“研究方向”；年度带保留但重做交互与信息展示，01 界面组件需优化（W1 卡） |
| 2 | R4 改法 | b：只保留系统一份模型状态（R4 卡） |
| 3 | WSL 与 Windows 的做法 | D-20261023-2：同一技术栈与分支，先 WSL 后 Windows |
| 4 | “不改 Windows 副本”约束 | 取消；Agent 可在 Windows 测试并在实测后改启动脚本（D-20261023-2，ITERATION §1 已改） |
| 5 | `quality-pilot` | 已删除；以后需要并行试多个方案时再临时开分支 |

## 5. 下一步

1. 按 [实施方案](实施方案.md) 派发执行 Agent：开 `../dox_agent-fixes`（检出 `main`），按 R1 → R2 → R3 → R4 做，附 R6、R7；每项先 WSL 验证，推送后 Windows 复测。用户 10-23 追加“考虑千人并发、不给未来埋坑”，约束见 DECISIONS D-20261023-3，R1 据此改为后台单一写入方 + 跨进程租约，不只加进程内锁。
2. W1 负责 Agent 恢复后先读本文 §2.1、§3 与 §4 第 1 项，再继续；方案中的答复已同步写入 `.logsdev/owner-领域分析-design/claude-01-总览/README.md` §6.4。
