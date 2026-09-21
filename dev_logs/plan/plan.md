# dox_agent 实施计划与完成情况

- 依据需求：[`../demand.md`](../demand.md)（以该文件最新版为准）
- 当前状态：[`../status.md`](../status.md)
- 已实现接口与实现：[`../design/`](../design/README.md)
- 前端 UI 优化方案（拟议）：[`ui_optimization.md`](ui_optimization.md)
- 状态标记：✅ 已完成 · 🟡 部分完成 · ⬜ 未开始
- 更新日期：2026-09-21

## 阶段总览

| 阶段 | 目标 | 状态 |
|---|---|---|
| A 工程基线 | 让仓库可运行、可测试 | 🟡 |
| B 语料与元数据 | 基金报告入库并支持领域/年份过滤 | ⬜ |
| C 问答入口收敛 | 移除分类/材料遵循/执行模式选项，固定专业问答 | 🟡 |
| D 本地文档窗口 | 目录树 + 原始 PDF/Markdown + 引用跳页 | ⬜ |
| E 专项报告 | 统一生成入口 + 四模板 | ⬜ |
| F 验收 | 真实基金报告样本验收 | ⬜ |
| G 任务系统与会话栏 | task1–4、prompts、ChatGPT 式会话管理 | ⬜ |
| U UI 优化 | 左栏收敛、会话栏、设置抽屉、文档窗口与报告入口（无后端依赖部分先行） | 🟡 |

实施顺序：A（可运行）→ B（基金报告入库与元数据/过滤，E/F 的前提）→ C/D/G 并行（入口收敛、文档窗口、任务系统）→ E（报告）→ F（真实数据验收）。

---

# 设计指南（2026-09-21 15:09）：成熟 ChatBot 的任务系统与本地文档预览

本指南把查询中的两项功能更新（本地文档预览、task1–4 与会话栏）合理拓展为可实现的设计。所有路径相对仓库根目录。

## 1. 定位与职责

dox_agent 定位为成熟的 Agentic ChatBot，参考 ChatGPT 的会话体验，职责扩展为：

- **会话**：新建、历史列表、重命名、归档/恢复、编辑分支、任务标签、恢复与断开。
- **任务**：每个会话绑定一个任务类型，决定 system prompt 与输出契约。
- **分析与推测**：对已有文档做专业严谨的分析；对领域趋势做有依据的推测。
- **报告**：按模板生成结构化专项报告。
- **资料**：浏览与预览本地文档（PDF/Markdown/txt），引用可跳转原文。
- **证据**：事实结论可追溯到原文；事实、已实现应用、潜在应用、未来推断分开表达。

非目标（本指南不设计）：多租户、云端同步、协作编辑、多 Agent 编排、工作流画布。

## 2. 任务系统（task1–4）

### 2.1 任务定义

| 任务 | 名称 | 目标 | 输出契约 | 对应需求 |
|---|---|---|---|---|
| `task1` | 精准问答 | 基于本地文档回答具体问题 | 先给结论，逐条 `[n]` 引用原文；不推测 | demand §3 |
| `task2` | 对比分析 | 跨文档/项目/时间的对比 | 对比维度表 + 差异结论 + 引用；说明可比性前提 | demand §3 |
| `task3` | 趋势推测 | 基于样本推测领域趋势 | 事实与推断分段；标注样本范围与局限；不编造数字 | demand §4.3 |
| `task4` | 专项报告 | 生成结构化专项报告 | 按模板章节组织 + 范围/来源/局限；复用四模板 | demand §4 |

`task4` 的模板沿用 demand 第 4.1 节：`achievements`、`hotspots`、`future_directions`、`comprehensive`。

任务边界：`task3` 用于聊天式、不落盘的趋势讨论；`task4` 用于生成可保存的结构化报告（含 `hotspots`/`future_directions` 模板）。需要留存的结构化输出一律走 task4，避免与阶段 E 的报告模板职责重叠。

### 2.2 任务与会话的关系

- **每个会话绑定一个 `task_id`**，单选。
- 左侧 `+` 打开任务选择列表（单选列表，可带勾选态样式），选中后新建会话并写入 `task_id`。
- 会话栏条目显示任务徽标；会话头部显示当前任务名与一句话职责。
- 允许会话内切换任务：切换仅影响后续问题，历史回答保留其原任务策略，并在过程记录中标注。**（补充项，超出 demand §9.1 冻结范围，实施前确认）**
- **不做多任务叠加**：不同任务 prompt 的目标可能冲突（如 task1 禁止推测 vs task3 要求推测）。如未来确有组合需求，另定"组合任务"白名单，不默认拼接。

### 2.3 Prompt 组织（`src/prompts/`）

```text
src/prompts/
├── __init__.py          # 加载、缓存、导出 list_tasks() / task_prompt(task_id)
├── base.md              # 所有任务共享的硬约束
├── task1_qa.md
├── task2_compare.md
├── task3_trend.md
└── task4_report.md      # 含模板占位符
```

- `base.md` 硬约束：中文回答；事实仅依据本轮已读原文；关键结论用 `[n]` 引用；区分已取得成果/已实现应用/潜在应用/未来推断；不得编造数字、编号、论文、专利、引用；资料不足或冲突时说明；不展示内部推理过程。
- 各任务文件只补充角色、分析重点与输出结构，不覆盖 `base.md` 的硬约束。
- `task4_report.md` 使用 demand §4.4 的通用提示词基线，模板章节由 `template_id` 注入。
- 加载器：`task_prompt(task_id)` 读取并缓存；未知 id 返回明确输入错误（422），不静默回退默认任务。
- 首期提示词是服务端文本配置，不开发模板 CRUD 或管理平台。

### 2.4 任务如何影响执行（后端接入）

- `understand` 节点：注入 `base.md` + 任务 prompt，用于理解与允许资料范围判定。
- `answer` 节点：注入任务输出契约（结构与引用要求）；`task3` 显式允许有条件推断但要求标注。`task4` 不由 chat 生成正文：选择 task4 后前端进入报告表单，生成统一走 `POST /api/reports`（阶段 E），结果作为会话中的报告记录展示。
- 移除 `query_routing`/`evidence_level`/`execution_mode`，由 `task_id` 取代其策略角色；`allowed_doc_ids`（检索过滤）保留。
- 预算与检索沿用现有有界流程（`MAX_SEARCHES`/`MAX_READS`/`MAX_MODEL_CALLS`/超时），不为任务新建 Agent。
- `task3` 的"热点"结论限定于本次样本；若输出频次须基于统计、说明分母并按项目去重。

### 2.5 任务接口

| 接口 | 说明 |
|---|---|
| `GET /api/tasks` | 返回任务列表：`id`、`name`、`description`、是否有模板 |
| `POST /api/chat` | 新增 `task_id`（task1–3）与 `filters`（domain/year_from/year_to/fund_types），保留 `allowed_doc_ids`；移除旧策略字段；**不接受 task4**（前端不发送，服务端明确报错） |
| `POST /api/reports` | task4 唯一生成入口（见阶段 E） |

## 3. 本地文档预览

### 3.1 入口与布局

- 主区右上提供"本地文档"入口，点击右侧滑出预览面板（桌面 ≥1024px 为侧栏，窄屏为全屏抽屉）。
- 面板两栏：左侧目录树（可折叠），右侧预览区。
- 关闭面板不丢失聊天上下文；面板打开时聊天仍可滚动查看。

### 3.2 目录树

- 数据源：扩展后的 `GET /api/documents`（含 `rel_path`）。
- 前端按 `rel_path` 构建真实相对目录树；支持展开/折叠与文件名筛选。
- 每个条目显示状态：已入库 / 未入库 / 解析失败。
- 点击文件进入预览；另提供"限定为检索资料"显式按钮（浏览与限定范围分离）。

### 3.3 预览

| 类型 | 渲染 | 说明 |
|---|---|---|
| PDF | PDF.js（本地 worker） | 页码、翻页、缩放；不依赖 CDN |
| Markdown | `react-markdown` + GFM | 可切换查看原始文本 |
| txt | 纯文本 | 只读 |

- 未入库或解析失败的 PDF 可预览但不可检索时，如实提示，不把预览成功当作入库成功。

### 3.4 引用跳转

- 回答/报告中的 `[n]` 变为可点击元素，调用 `openDocument(doc_id, page)`。
- 打开面板并把 PDF 定位到对应**物理页码**；文件不存在或版本变化时明确提示，不退化为新版原文证据。
- 页内高亮后续按需增加。

### 3.5 接口与安全

| 接口 | 变更 |
|---|---|
| `GET /api/documents` | 补 `rel_path`、`status`、`meta`（`kind` 已返回，`main.py:117`；前端据此建树） |
| `GET /api/documents/{doc_id}/file` | 新增：返回原始文件（PDF/Markdown/txt）；`Content-Type` 按 kind；支持 `Range`；可选 `version` 校验 |

- 仅允许读取配置根目录内的资料；用文档 ID 映射文件；拒绝路径穿越与指向根目录外的链接。
- 大文件与不可预览类型返回明确错误。

### 3.6 前端组件（增量）

| 组件 | 职责 |
|---|---|
| `DocumentPanel.tsx` | 右侧滑出容器、打开/关闭、当前文档与页码状态 |
| `DocumentTree.tsx` | 目录树、筛选、状态标记 |
| `PdfViewer.tsx` | PDF.js 渲染与页码/缩放控制 |
| `MarkdownViewer.tsx` | Markdown 渲染与原文切换 |
| 引用组件改造 | `[n]` → `openDocument` |
| 依赖 | 新增 `pdfjs-dist` |

## 4. 会话栏优化（参考 ChatGPT）

- 顶部："+ 新对话"，点击打开任务选择。
- 搜索框：按标题筛选会话。
- 分组：按时间（今天 / 昨天 / 更早）分组，当前会话高亮。
- 条目：标题 + 任务徽标；悬停菜单：重命名 / 归档 / 复制。**（“删除”为补充项，超出 demand §9.1，实施前确认）**
- 归档区沿用现有折叠展示与恢复。
- 数据：`SessionData` 增加 `task_id`（工作区存 JSON，无需数据库迁移）。
- 状态保持：现有 `workspace.ts` 串行保存、revision 冲突与断开/重连继续复用。

## 5. 目标接口（增量总览）

| 接口 | 状态 | 用途 |
|---|---|---|
| `GET /api/tasks` | 新增 | 任务列表 |
| `POST /api/chat` | 修改 | 新增 `task_id`（task1–3）与 `filters`，保留 `allowed_doc_ids`，移除旧策略字段；不接受 task4 |
| `GET /api/documents` | 修改 | 增加 `rel_path`/`status`/`meta`（`kind` 已返回） |
| `GET /api/documents/{doc_id}/file` | 新增 | 原始 PDF/Markdown 文件服务 |
| `GET /api/workspace/sessions` | 修改 | 会话数据含 `task_id`（沿用 JSON） |
| `POST /api/reports`、`GET /api/reports/{id}` | 新增 | 见阶段 E |

## 6. 验收标准（增量）

- 左侧 `+` 可选择 task1–4，新建会话带上任务徽标；切换任务改变系统 prompt 并可验证。
- 会话历史可重命名、归档、恢复；刷新后任务与会话正确恢复。
- 右上"本地文档"入口打开右侧窗口，目录与配置根目录一致，中文文件名与多级目录正常。
- PDF 可翻页/缩放；Markdown 正常渲染并可看原文。
- 点击引用打开正确文件与物理页码（以 D10 的 page→物理页映射校验为准）；失效引用有提示。
- 浏览文件不改变检索范围；显式"限定资料"才改变。
- 各任务输出符合其输出契约（task3 明确区分事实/推断，task4 含范围/来源/局限）。

---

# 实施计划

## A. 工程基线

| 编号 | 任务 | 状态 |
|---|---|---|
| A1 | 补齐 `pyproject.toml`、依赖 extras（`web`/`embedding`）与 `package-data`（收录 `src/prompts/*.md`），恢复 `launch.sh` 安装 | ✅ |
| A2 | 恢复/重建 `tests/` 回归测试，覆盖现有 JSON/SSE、检索、会话 | ✅ |
| A3 | 端到端启动验证（服务、知识库就绪、真实模型问答） | ✅ |
| A4 | 命名与配置 `static1` → `dox-agent` | ✅ |
| A5 | `dev_logs` 目录整理（历史归档 + 现状 + 计划） | ✅ |
| A6 | 接口设计与实现落盘（`dev_logs/design/`：HLD / API / LLD） | ✅ |
| A7 | 契约同步：随 C/D/E/G 更新 `design/API.md`/`LLD.md`/`HLD.md`（如涉及）与 `status.md` | 🟡 |

## B. 语料与元数据（demand §4.2）

| 编号 | 任务 | 状态 |
|---|---|---|
| B1 | 基金历史报告（PDF）入库与解析 | ⬜ |
| B2 | 元数据：文档 ID、标题、相对目录、报告年份、领域标签、基金/项目类别、内容版本、解析状态、项目编号 | ⬜ |
| B3 | 简单元数据清单补录入口（不做标注管理平台） | ⬜ |
| B4 | 检索前领域/年份闭区间过滤（检索层），问答与报告共用同一口径 | ⬜ |
| B5 | `POST /api/chat` **独占** `filters`（domain/year_from/year_to/fund_types）接入，保留 `allowed_doc_ids` | ⬜ |

## C. 专业知识问答（demand §3、§2.2）

| 编号 | 任务 | 状态 |
|---|---|---|
| C1 | 移除问题分类分支，以及 `query_routing`/`evidence_level`/`execution_mode` 的前端选项与请求字段；清理 `GET /api/health` 的 `defaults{query_routing,evidence_level}` 与前端初始化 | ✅ |
| C2 | 不暴露 `execution_mode`，服务端固定有限研究流程与预算 | ✅ |
| C3 | 保留 `allowed_doc_ids` 作为检索过滤条件（非"材料遵循等级"） | ✅ |
| C4 | 多轮追问、带页码引用、无资料/冲突/解析失败明确说明 | 🟡 |
| C5 | 沿用搜索次数、模型调用与超时限制，不增加多 Agent/工作流编辑器 | ✅（口子已有，语义待切语料） |

## D. 本地文档窗口（demand §5、§6；设计指南 §3）

| 编号 | 任务 | 状态 |
|---|---|---|
| D1 | 扩展 `GET /api/documents`：相对路径、元数据、入库状态（`kind` 已返回，补 `rel_path`/`status`/`meta`） | ⬜ |
| D2 | 新增 `GET /api/documents/{doc_id}/file` 原始文件响应（含 Range、可选版本校验） | ⬜ |
| D3 | 路径安全：仅根目录内、按文档 ID 映射、防路径穿越 | ⬜ |
| D4 | 右侧滑出容器 `DocumentPanel`，关闭不丢聊天上下文 | ⬜ |
| D5 | 目录树 `DocumentTree`：展开/折叠、文件名筛选、未入库/解析失败状态 | ⬜ |
| D6 | PDF.js 阅读器：页码、翻页、缩放（本地 worker） | ⬜ |
| D7 | Markdown 渲染与原文切换（txt 纯文本预览） | ⬜ |
| D8 | 引用跳转：`[n]` → 打开面板并定位物理页码；失效提示 | ⬜ |
| D9 | 浏览与限定检索范围分离，提供显式"限定资料"操作 | 🟡（现有限定范围逻辑可复用） |
| D10 | 引用 `page` → PDF 物理页映射与校验：确认 `evidence.page` 与 PDF.js 物理页一致（含扫描件偏移），不一致则建立映射并加回归测试 | ⬜ |

## E. 专项报告与分析文档（demand §4、§6）

| 编号 | 任务 | 状态 |
|---|---|---|
| E1 | `POST /api/reports` 流式入口（domain、year_from、year_to、template_id，可选 fund_types/doc_ids/focus）（报告↔会话绑定待定，见待定设计 #10） | ⬜ |
| E2 | `GET /api/reports/{report_id}` 读取 Markdown、参数、模板版本、引用、生成时间与资料局限（报告↔会话绑定待定，见待定设计 #10） | ⬜ |
| E3 | 四个模板：`achievements`/`hotspots`/`future_directions`/`comprehensive` | ⬜ |
| E4 | 预览、复制、`.md` 下载 | ⬜ |
| E5 | 引用有效性核对、实际覆盖资料记录、资料局限说明 | ⬜ |
| E6 | 复用现有 SQLite 存储，不新增数据库/对象存储 | ⬜ |
| E7 | 缺少必填范围或模板未知返回明确输入错误；无匹配资料不生成伪报告 | ⬜ |

## F. 首期验收（demand §8.2）

| 编号 | 任务 | 状态 |
|---|---|---|
| F1 | 界面无问题分类/材料遵循/通用闲聊入口；专业问题可多轮追问 | ⬜ |
| F2 | 右侧目录与配置目录一致，中文文件名与多级目录正常 | ⬜ |
| F3 | 引用定位正确文件与物理页码；失效有提示 | ⬜ |
| F4 | 四类文档包含范围、正文、来源与局限 | ⬜ |
| F5 | 范围外年份/年份缺失/重复项目样本：不混入、不虚增、可去重 | ⬜ |
| F6 | 计划目标、已取得成果、已落地应用、未来推断正确区分 | ⬜ |
| F7 | 无匹配材料如实提示；停止/失败/重新生成/会话恢复可辨认 | 🟡（会话与流式基础已具备） |
| F8 | 中文扫描 PDF 与复杂表格用真实样本检查解析质量 | ⬜ |

## G. 任务系统与会话栏（demand §9；设计指南 §2、§4）

| 编号 | 任务 | 状态 |
|---|---|---|
| G1 | 建立 `src/prompts/`：`base.md` + task1–4 提示词 + 加载器（推导许可由任务 prompt 覆盖 base 默认，见待定设计 #11） | ⬜ |
| G2 | 任务注册表与 `GET /api/tasks` | ⬜ |
| G3 | `POST /api/chat` 接入 `task_id`（task1–3）；**不接 `filters`**（归 B5）；task4 不在 chat 生成（旧策略字段已于 C1 移除） | ⬜ |
| G4 | `understand`/`answer` 注入任务 prompt 与输出契约 | ⬜ |
| G5 | 前端 `+` 任务选择器与新建会话绑定 `task_id` | ⬜ |
| G6 | 会话栏重构：搜索、时间分组、任务徽标、重命名/归档/删除 | ⬜ |
| G7 | `SessionData` 增加 `task_id` 并随会话恢复 | ⬜ |
| G8 | 任务输出契约验收（task3 事实/推断分离、task4 范围/来源/局限） | ⬜ |
| G9 | 前端 task4 报告表单入口与报告记录展示（调用 `POST /api/reports`）（报告↔会话绑定待定，见待定设计 #10） | ⬜ |

## U. UI 优化（依据 [`ui_optimization.md`](ui_optimization.md)）

| 编号 | 任务 | 状态 |
|---|---|---|
| U0.1 | 拆分 `SourceManager` → `ScopeSelector`（输入区）+ `IngestTools`（抽屉） | ✅ |
| U0.2 | `SettingsDrawer` 收纳运维能力；`role=dialog`/focus trap/Esc；关闭即卸载停止轮询 | ✅ |
| U0.2b | 断开/保存失败在主界面可见 | ✅ |
| U0.3 | 健康状态圆点+tooltip；未就绪/失败展开文字；保留轮询并就绪后降频 | ✅ |
| U0.4 | `useDocuments` 收敛三处 fetch | ✅ |
| U0.5 | `SessionList`：今天/昨天/更早分组、搜索、当前高亮、悬停重命名/归档、未保存会话显式渲染 | ✅ |
| U0.6 | 阶段 C 清理：`policy.ts` 补 professional/repair/completed 并删旧键；`Policy.route` 收窄；Process 展开态不强制收起 | ✅ |
| U0.7 | `Notes.tsx` 留原处加 experimental 注释 | ✅ |
| U0.8 | `package.json` 加 `test: node --test src/` | ✅ |
| U1 | 任务系统与会话绑定 | ⬜（依赖 G2/G3/G7） |
| U2 | 右侧文档面板与引用跳转 | ⬜（依赖 D1/D2，页码以 D10 为准） |
| U3 | 报告入口 | ⬜（依赖 E1/E2；U3.4 依赖待定设计 #10） |
| U4.1 | 双栏自适应放宽内容宽度 | ✅ |
| U4.2 | 空状态改为任务导向示例 | ✅ |
| U4.3 | 流式过程与 Markdown/代码块排版 | 🟡（基础排版已有，后续随 U2/U3 调整） |

依赖说明：U1–U3 由 `ui_optimization.md` §4 特性开关控制，后端就绪前默认关闭且不发送新字段；本轮未创建开关（当前无占位 UI 可控制）。

## 首期不做（来自 demand §8.2）

多租户/权限后台、多 Agent 协作、知识图谱、工作流画布、独立问题分类服务、材料遵循等级系统、自动全网研究、自动订阅同步、模板管理平台、分布式任务队列。

## 审核意见采纳（2026-09-21）

以下审核意见已采纳并回写到本文与 `demand.md`：

| # | 意见 | 处理 |
|---|---|---|
| 1 | chat 缺 `filters` | §2.5/§5 chat 契约补 `filters`，新增 B5 |
| 2 | demand §6 契约过期 | demand §6 chat 行补 task_id/filters，并加 `GET /api/tasks` |
| 3 | task4 双入口 | 统一为：chat 不生成 task4，生成走 `POST /api/reports`（§2.4/§2.5/G3/G9） |
| 4 | §2.2 与 §9.3 张力 | demand §2.2/§3 注明"用户显式任务 ≠ 自动分类" |
| 5 | 实施顺序漏 B | 改为 A → B → C/D/G 并行 → E → F |
| 6 | 引用页码语义 | 新增 D10：page→PDF 物理页映射与校验 |
| 7 | 命名不一致 | 统一为"本地文档"（demand §5、plan D） |
| 8 | 复选/单选措辞 | 改为"单选列表，可带勾选态样式" |
| 9 | task3/task4 边界 | §2.1 明确：task3 聊天式讨论，task4 落盘报告 |
| 10 | 越界项 | 会话内切换任务、删除会话标注为"补充项，超出 demand §9.1" |
| 11 | prompts 打包 | A1 增补 `package-data` 收录 `src/prompts/*.md` |
| 12 | 文档同步无任务 | 新增 A7 契约同步任务 |
| 13 | health 残留 | C1 增补清理 `defaults{query_routing,evidence_level}` |
| 14 | 报告元数据 | E2 补生成时间与资料局限 |

未采纳：无。现状类声明经实测与仓库一致，A4/A5/A6 证据保留。

## 待定设计（实现前确认）

| # | 问题 | 影响任务 | 需确认 |
|---|---|---|---|
| 10 | 报告与会话的绑定与持久化：`POST /api/reports`（E1）无 `session_key`/`run_id`，`GET /api/reports/{id}`（E2）只按 id 取，而 G9 要求报告“作为会话中的报告记录展示” | E1 / E2 / G9 | 由前端把 `report_id` 写入 `SessionData`，还是报告携带会话键、由后端持久化绑定 |
| 11 | task1/task2 输出契约与全局 `answer_policy` 冲突：现全局允许“有依据的推导”，而本 plan 定义 task1“不推测” | G1 / G4 | 明确推导许可由任务 prompt 覆盖 base 默认：task1/task2 收窄，task3 放开并要求标注事实/推断 |

> 这两项在实现对应任务前定稿；未定稿前不开始 E1/E2/G9 与 G1/G4。

## 完成情况记录

| 日期 | 完成项 | 证据 |
|---|---|---|
| 2026-09-21 | A4 命名 `static1` → `dox-agent` | grep 无残留；`py_compile` 通过；`npm run build` 通过 |
| 2026-09-21 | A5 `dev_logs` 整理：历史移入 `archive/`，新增 `status.md` 与 `plan/` | `dev_logs` 目录结构核对 |
| 2026-09-21 | A6 新增 `dev_logs/design/`（HLD / API / LLD），由源码整理 | 文件落盘并经相对链接自检 |
| 2026-09-21 | A1 补齐 `pyproject.toml`（extras：`web`/`embedding`/`dev`；`package-data` 收录 `src/prompts/*.md`；`liteparse` 放宽为 `>=2.4,<3` 以匹配已装 2.14.6） | `uv pip install -e ".[dev]"` 与 `-e ".[web,embedding]"` 均成功；`launch.sh` 安装+启动路径实际跑通（见 A3） |
| 2026-09-21 | A2 恢复 `tests/`（20 个文件，`STATIC1_VENV`→`DOX_AGENT_VENV`） | `.venv/bin/python -m pytest tests -q` → 83 passed |
| 2026-09-21 | A3 端到端：`bash launch.sh` 启动服务、知识库就绪、真实模型问答 | `GET /api/health` → `preparation=ready`、`docs_count=157`；`POST /api/chat`（research 路线）→ 8 条带引用来源、`[1][4][5][6][7]` 正文、`done` |
| 2026-09-21 | C1/C2/C3：移除自动意图分类与 `query_routing`/`evidence_level`/`execution_mode`，固定专业问答；保留 `allowed_doc_ids` | 后端 `routing.py`/`config.py`/`graph.py`/`quick.py`/`main.py` 与前端 `api.ts`/`main.tsx`/`Answer.tsx`/`conversation.ts` 改动；`GET /api/health` 无 `defaults`；旧字段请求 422；`pytest` 64 passed；`npm run build` 通过；真实模型问答 research + 8 条引用 |
| 2026-09-21 | C 旁带修复：快速查证的模型调用计量 | `quick.verify` 显式接收本轮回调；`test_usage` 断言 research+answer 两次调用合计 26 tokens |
| 2026-09-21 | U0.1–U0.8 / U4.1–U4.2：UI 信息架构与基础 | 拆分 `ScopeSelector`/`IngestTools`、新增 `SettingsDrawer`/`SessionList`/`useDocuments`；删除 `SourceManager.tsx`/`KnowledgePanel.tsx`；`policy.ts` 补 professional/repair/completed；`npm run build` 通过；`npm test`（node:test）12 passed |
| 2026-09-21 | U0 回归与验收（离线浏览器） | `tests/browser_ui_shell.py` PASS：左栏无入库/无旧健康框、健康圆点、会话分组/搜索/未保存会话、抽屉 dialog+Esc+焦点回退+关闭后停止轮询；`tests/browser_answer_controls.py` PASS：复制/重生成/停止/失败/导出/移动端无回归（顺带修正两处过期断言：`run_id` 逐次变化、取消文案） |

> 记录约定：完成任务后在本表追加一行，并把对应任务状态改为 ✅ 或 🟡；未运行的检查不得写入证据。
