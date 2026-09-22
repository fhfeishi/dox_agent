# dox_agent 实施计划

- 依据需求：[`../demand.md`](../demand.md)（以该文件最新版为准）
- 当前状态：[`../status.md`](../status.md)
- 已实现接口与实现：[`../design/`](../design/README.md)
- 前端 UI 优化方案：[`ui_optimization.md`](ui_optimization.md)
- **知识库管理与选择规划（下一步）：[`corpus_management.md`](corpus_management.md)**
- **完成情况与证据：[`implementation.md`](implementation.md)**（本文件不再维护完成记录表）
- 状态标记：✅ 已完成 · 🟡 部分完成 · ⬜ 未开始
- 更新日期：2026-09-21

## 阶段总览

| 阶段 | 目标 | 状态 |
|---|---|---|
| A 工程基线 | 让仓库可运行、可测试 | 🟡 |
| B 语料与元数据 | 基金报告入库并支持领域/年份过滤 | ⬜ |
| C 问答入口收敛 | 移除分类/材料遵循/执行模式选项，固定专业问答 | 🟡 |
| D 本地文档窗口 | 目录树 + 原始 PDF/Markdown + 引用跳页 | 🟡 |
| E 专项报告 | 统一生成入口 + 四模板 | ⬜ |
| F 验收 | 真实基金报告样本验收 | ⬜ |
| G 任务系统与会话栏 | task1–4、prompts、ChatGPT 式会话管理 | 🟡 |
| H 知识库管理 | 多库隔离、库选择与详情、按库浏览与问答（demand §10） | 🟡（H1–H3 后端、H5–H7 前端已完成；H4/H8 契约批与 H9/H10 未开工） |
| U UI 优化 | 左栏收敛、会话栏、设置抽屉、侧栏收束与文献库入口、文档窗口与报告入口（无后端依赖部分先行） | 🟡 |

实施顺序：A（可运行）→ B（基金报告入库与元数据/过滤，E/F 的前提）→ C/D/G 并行（入口收敛、文档窗口、任务系统）→ E（报告）→ F（真实数据验收）。U9.1/U9.2/U9.4-1 无后端依赖，可插入任意批次先行。

**H 阶段插入位置（2026-09-21 追加）**：H 是 B4/B5 的前置——`knowledge/` 已并存 `lcdata` 与 `nf`（真实基金报告 10 份），单库混装会让领域/年份过滤失去意义。H1–H3 无破坏性（只加不改），建议**在 B1 之前**执行；H4 与 B5 同批。规划见 [`corpus_management.md`](corpus_management.md)。

> 阶段状态口径：A/C 标 🟡 是因为收尾项未完成（A7 契约同步随 C/D/E/G 推进、C4 多轮追问待真实语料验收），主体工作已完成并经端到端/浏览器验证；与 demand 开头「阶段 A 与阶段 C 已实施并验证」不矛盾。

---

# 设计指南（2026-09-21 15:09）：成熟 ChatBot 的任务系统与本地文档预览

本指南把查询中的两项功能更新（本地文档预览、task1–4 与会话栏）合理拓展为可实现的设计。所有路径相对仓库根目录。

## 1. 定位与职责

dox_agent 定位为成熟的 Agentic ChatBot，参考 ChatGPT 的会话体验，职责扩展为：

- **会话**：新建、历史列表、重命名、归档/恢复、编辑分支、任务标签、恢复与断开。
- **任务**：每个会话绑定一个任务类型，决定 system prompt 与输出契约。
- **分析与推测**：对已有文档做专业严谨的分析；对领域趋势做有依据的推测。
- **报告**：按模板生成结构化专项报告。
- **资料**：浏览与预览本地文档（PDF/Markdown/txt），引用可跳转原文；左侧提供"文献库"一级入口，卡片/列表浏览已入库文档（demand §9.5）。
- **界面容器**：左侧边栏可收束为图标栏，展开/收束状态可保持（demand §9.5）。
- **证据**：事实结论可追溯到原文；事实、已实现应用、潜在应用、未来推断分开表达。

非目标（本指南不设计）：多租户、云端同步、协作编辑、多 Agent 编排、工作流画布。

## 2. 任务系统（task1–4）

### 2.1 任务定义

| 任务 | 名称 | 目标 | 输出契约 | 对应需求 |
|---|---|---|---|---|
| `task1` | 精准问答 | 基于本地文档回答具体问题 | 先给结论，逐条 `[n]` 引用原文；不推测 | demand §9.3 / §3 |
| `task2` | 对比分析 | 跨文档/项目/时间的对比 | 对比维度表 + 差异结论 + 引用；说明可比性前提 | demand §9.3 / §3 |
| `task3` | 趋势推测 | 基于样本推测领域趋势 | 事实与推断分段；标注样本范围与局限；不编造数字 | demand §9.3 / §4.3 |
| `task4` | 专项报告 | 生成结构化专项报告 | 按模板章节组织 + 范围/来源/局限；复用四模板 | demand §9.3 / §4 |

`task4` 的模板沿用 demand 第 4.1 节：`achievements`、`hotspots`、`future_directions`、`comprehensive`。

任务边界：`task3` 用于聊天式、不落盘的趋势讨论；`task4` 用于生成可保存的结构化报告（含 `hotspots`/`future_directions` 模板）。需要留存的结构化输出一律走 task4，避免与阶段 E 的报告模板职责重叠。

### 2.2 任务与会话的关系

- **每个会话绑定一个 `task_id`**，单选。
- 左侧 `+` 打开任务选择列表（单选列表，可带勾选态样式），选中后新建会话并写入 `task_id`。**`task4` 是特例分支**（N11）：选中 task4 同样新建会话并写入 `task_id`，但输入框**切换为报告表单**，不得发送 `POST /api/chat`；生成统一走 `POST /api/reports`。
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

- **两个入口并存**（demand §9.5 要求文献库为一等入口）：左栏"文献库"用于浏览与筛选已入库文档；主区右上"本地文档"用于打开右侧目录树与预览面板。两者都落在同一右侧滑出预览容器上，避免各写一套。
- 预览面板：桌面 ≥1024px 为右侧侧栏，窄屏为全屏抽屉；面板两栏：左侧目录树（可折叠），右侧预览区。
- 关闭面板不丢失聊天上下文。
- **面板形态（2026-09-21 现状校正，N3）**：U7 阶段落地的 `DocumentPanel` 是**遮罩式全屏抽屉**（`fixed inset-0 z-40` + `bg-black/30` + 固定 `max-w-2xl`，`DocumentPanel.tsx:16-17`），当前打开时会遮挡主区、聊天不可滚动。这与本节此前「≥1024px 为侧栏、面板打开时聊天可滚动」的描述不符：
  - 现状（U7）：遮罩抽屉，符合 demand §5「滑出窗口」的最低要求，作为过渡形态保留；
  - 目标（U2）：见 **D11** —— ≥1024px 改为挤压式无遮罩侧栏（聊天可滚动），窄屏保留遮罩抽屉。
  - 因此原「面板打开时聊天仍可滚动查看」**不在 U7 验收内**，顺延至 D11 + U4.1b，并以 F13 之外的独立验收项跟踪（归 U2 验收）。

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
- 条目：标题 + 任务徽标；悬停菜单：重命名 / 归档。**（"复制"与"删除"均为补充项，超出 demand §9.1 冻结范围，实施前确认；口径以 `ui_optimization.md` U0.5 注为准）**
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
| `POST /api/chat` 可选 `model` | 修改（拟议） | 仅在待定设计 #12 与 `GET /api/models` 落地后启用；未落地不得发送，避免 `extra="forbid"` 422 |
| `GET /api/models` | 新增（**拟议、未定**） | 可用模型列表（标识/显示名/是否默认）；demand §9.6 后续项，**首期不实现**，未实现前前端不发请求 |
| `GET /api/news` | 新增（**拟议、未定**） | 可选资讯板块数据源；数据源/板块配置/合规性均未定，demand §8.2 列为首期不做，前端 `VITE_UI_NEWS` 默认关闭 |

## 6. 验收标准（增量）

- 左侧 `+` 可选择 task1–4，新建会话带上任务徽标；切换任务改变系统 prompt 并可验证。
- 会话历史可重命名、归档、恢复；刷新后任务与会话正确恢复。
- 右上"本地文档"入口打开右侧窗口，目录与配置根目录一致，中文文件名与多级目录正常。
- PDF 可翻页/缩放；Markdown 正常渲染并可看原文。
- 点击引用打开正确文件与物理页码（以 D10 的页码口径校验为准）；失效引用有提示。
- 浏览文件不改变检索范围；显式"限定资料"才改变。
- 各任务输出符合其输出契约（task3 明确区分事实/推断，task4 含范围/来源/局限）。
- demand §8.2 于 2026-09-21 追加的三项（侧栏收束、文献库、模型如实显示）见 F9–F11，不在此重复。

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
| A7 | 契约同步：随 C/D/E/G 更新 `design/API.md`/`LLD.md`/`HLD.md`（如涉及）与 `status.md` | 🟡（第二批已补 `/api/tasks`、`/file`、chat `task_id`、`SessionData.branches`、`DocumentPanel`；E 阶段契约待实现后补，故不满 ✅） |

> A7 状态说明（2026-09-21）：`git log -- dev_logs/design/` 最后一笔为 `0ff1480`（阶段 C），此后 `be1ddc5`/`72fde7a`/`9a0c899`/`ce3b4e7` **均未同步**，故由 🟡 回退为 ⬜。2026-09-21 第二批已补：U5 `SessionData.branches`、U7 `DocumentPanel`（LLD）、`/api/tasks`、`/api/documents` 增量字段、`/api/documents/{doc_id}/file`、chat `task_id`（API.md/LLD.md），并同步 `status.md`。（N6）**同步时机：各阶段收尾提交内完成，不得跨阶段累积**（N12）。

## B. 语料与元数据（demand §4.2）

| 编号 | 任务 | 状态 |
|---|---|---|
| B1 | 基金历史报告（PDF）入库与解析 | ⬜ |
| B2 | 元数据：文档 ID、标题、相对目录、报告年份、领域标签、基金/项目类别、内容版本、解析状态、项目编号 | ⬜ |
| B3 | 简单元数据清单补录入口（不做标注管理平台） | ⬜ |
| B4 | 检索前领域/年份闭区间过滤（检索层），问答与报告共用同一口径 | ⬜ |
| B5 | `POST /api/chat` **独占** `filters`（domain/year_from/year_to/fund_types）接入，保留 `allowed_doc_ids` | ⬜ |
| B6 | **清理语料专属硬编码**（2026-09-21 深度审核 N1 新增）：`graph.py:232` understand 提示词（「对于 LangChain、LangGraph、Deep Agents 技术问题…」）、`graph.py:326` answer 提示词（「仅当问题涉及产品关系时区分 LangChain…」）、`main.py:45/73` 启动预热与自动 `import_official(["langchain","langgraph","deepagents"])`、`main.py:76` 与 `prepare_docs.py:24,36` 的 `search("LangChain")` 预热查询。改为由 `src/prompts/base.md` 或配置项驱动，并允许关闭自动导入官方技术文档 | ✅（技术专属指令移除，预热改 `WARMUP_QUERY`，自动导入改 `AUTO_IMPORT_OFFICIAL`；`src/__init__.py` docstring 同步） |

> B6 与 G1 的耦合与先后：G1 负责**新建** `src/prompts/` 的任务提示词；B6 负责**清理** `graph.py` 中既有的两处 system prompt。二者互不替代。切语料（B1）时须先完成 B6，否则检索策略与回答口径仍受技术文档语料指令影响。

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
| D1 | 扩展 `GET /api/documents`：相对路径、元数据、入库状态（`kind` 已返回，补 `rel_path`/`status`/`meta`） | ✅（`meta` 为占位 `{}`，B2 落地前为空） |
| D2 | 新增 `GET /api/documents/{doc_id}/file` 原始文件响应（含 Range、可选版本校验） | ✅（Range 由 starlette `FileResponse` 原生承载） |
| D3 | 路径安全：仅根目录内、按文档 ID 映射、防路径穿越 | ✅（`local_path_in_roots`：仅 `knowledge_root`/`text_root` 内、`resolve()` 后取相对路径） |
| D4 | 右侧滑出容器 `DocumentPanel`，关闭不丢聊天上下文 | ✅（U7 交付；D11 后宽屏为挤压式侧栏） |
| D5 | 目录树 `DocumentTree`：展开/折叠、文件名筛选、未入库/解析失败状态 | ✅（U2.2；状态标记当前为 `indexed`/其他） |
| D6 | PDF.js 阅读器：页码、翻页、缩放（本地 worker） | 🟡（**降级实现**：环境无法安装 `pdfjs-dist`——Windows npm 与 WSL node_modules 符号链接冲突（EISDIR），改用浏览器原生 PDF（`/file` + `#page=` + 页码步进），缩放依赖阅读器工具栏；换装 PDF.js 时仅需替换 `PdfViewer` 内部实现） |
| D7 | Markdown 渲染与原文切换（txt 纯文本预览） | ✅（U7 `DocumentPreview` + U2 `DocumentExplorer.TextPane` 同一读取通道） |
| D8 | 引用跳转：`[n]` → 打开面板并定位物理页码；失效提示 | ✅（U2.4：`citation` 映射 + `openDocument(doc_id, page)`；文档不在列表时主界面报错） |
| D9 | 浏览与限定检索范围分离，提供显式"限定资料"操作 | ✅（U2.5：Explorer 内"限定为检索资料（仅此文档）"显式按钮复用 `allowed_doc_ids`，浏览不改范围） |
| D10 | **页码口径校验（2026-09-21 修订）**：校验并锁定三方 1-based 一致 —— `evidence.page` = `Page.number`（`knowledge.py:14-16`，`ge=1`，无重编号）= LiteParse `page_num`（`parsers.py:28` 直接赋值，非 OCR/非重排分支）= PDF.js `getPage(n)`（1-based）；补 1-based 基准的回归测试。**不再预设"需要建立映射"**：当前链路下三者本来就相等，原"含扫描件偏移、不一致则建映射"的描述与实际不符 | ⬜ |
| D10b | OCR/重排风险再校验：若基金样本中出现 OCR 或版面重排分支的 PDF（解析路径不同），需在入库前重跑 D10 的三方一致性检查；届时差异来自解析路径而非偏移量，按新证据处理 | ⬜ |
| D11 | **桌面端挤压式侧栏**（N3 衍生）：U7 阶段的 `DocumentPanel` 实为遮罩式全屏抽屉（`fixed inset-0 z-40` + `bg-black/30`，见 `DocumentPanel.tsx:16-17`）；U2 阶段需在 ≥1024px 改为挤压主区的无遮罩侧栏，窄屏保留遮罩抽屉 | ✅（根节点 `lg:pointer-events-none` + 面板 `lg:pointer-events-auto lg:w-[36rem]`，遮罩 `lg:hidden`） |

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
| F9 | 左侧边栏可收束/展开且状态可保持；收束后新对话/文献库/设置仍可达（键盘可操作），异常提示不因收束而隐藏（U9.1） | ⬜ |
| F10 | 文献库入口展示的文档与 `GET /api/documents` 一致，点击可打开预览；浏览不改变检索范围（U9.2） | ⬜ |
| F11 | 界面如实显示当前模型；**模型不可用时有明确提示，不静默切换**（U9.4-2，依赖待定设计 #12 的判定信号） | ⬜ |
| F12 | 基金语料下 prompt 无技术文档残留：`graph.py` 的 understand/answer 提示词、启动预热与官方技术文档自动导入中，无 LangChain/LangGraph/Deep Agents 相关检索指令（B6） | ⬜ |
| F13 | 「知识库未就绪」在主界面（非侧栏）有**可见文字提示**，侧栏收束后仍可见；不得仅以 tooltip 或颜色承载阻塞性原因（U9.1/N5） | ⬜ |

## G. 任务系统与会话栏（demand §9；设计指南 §2、§4）

| 编号 | 任务 | 状态 |
|---|---|---|
| G1 | 建立 `src/prompts/`：`base.md` + task1–4 提示词 + 加载器（推导许可由任务 prompt 覆盖 base 默认，见待定设计 #11，**已按 #11 定稿落实**） | ✅（`base.md` 8 条硬约束 + task1–task4 提示词 + `__init__.py` 加载器；未知 id 抛 `UnknownTaskError` 不回退） |
| G2 | 任务注册表与 `GET /api/tasks` | ✅（`list_tasks()`；`id`/`name`/`description`/`has_template`） |
| G3 | `POST /api/chat` 接入 `task_id`（task1–3）；**不接 `filters`**（归 B5）；task4 不在 chat 生成（旧策略字段已于 C1 移除） | ✅（`ChatRequest.task_id: Literal["task1","task2","task3"] = "task1"`，task4/未知值 422） |
| G4 | `understand`/`answer` 注入任务 prompt 与输出契约 | ✅（graph state 增 `task_id`；两节点 system 提示词注入 `task_instruction()`） |
| G5 | 前端 `+` 任务选择器与新建会话绑定 `task_id`；**含 task4 特例：选中后输入区切报告表单、不发 chat**（同 U1.3/U3.1） | 🟡（选择器/会话绑定/task4 阻断发送已实现于工作树，`main.tsx:284/364`；报告表单为占位，待 E1/E2） |
| G6 | 会话栏重构：搜索、时间分组、任务徽标、重命名/归档（**「删除」为凭空菜单项**：`workspace.ts:123` 导出集合无 `remove` 也无 `duplicate`，`SessionList.tsx` 实测仅重命名/归档；「删除」与「复制」均列为补充项，超出 demand §9.1，实施前确认且需先新增状态层方法） | 🟡（任务徽标随 U1.4 已实现；搜索/分组为 U0.5 既有能力；「重构」余项待 U1 收尾） |
| G7 | `SessionData` 增加 `task_id` 并随会话恢复 | ✅（工作树：`workspace.ts:8` 类型与保存/恢复管线，随 U1.2 交付） |
| G8 | 任务输出契约验收（task3 事实/推断分离、task4 范围/来源/局限） | ⬜ |
| G9 | 前端 task4 报告表单入口与报告记录展示（调用 `POST /api/reports`）（报告↔会话绑定待定，见待定设计 #10） | ⬜ |

## H. 知识库管理（demand §10；规划见 [`corpus_management.md`](corpus_management.md)）

| 编号 | 任务 | 状态 |
|---|---|---|
| H1 | 后端：库扫描与注册表 + `GET /api/corpora`；每库独立 `Knowledge` 实例 | ✅（`src/agent/corpora.py`；只读扫描 + `CORPORA` 配置覆盖；实测真实树：lcdata 默认库、nf 基金库未初始化） |
| H2 | 后端：`import_defaults` 限定在库 root 内（**修 `parsers.py:107` 跨库 rglob**）；`POST /api/corpora/{id}/ingest` | ✅（`parsers.py` 增 `root`/`exclude`；`ingest/local` 排除其他库 root；202 + job 状态） |
| H3 | 后端：`GET /api/documents?corpus=`；`/api/health` 补 `corpus_id` | ✅（未初始化库只读返回空列表，不创建 sqlite） |
| H4 | 后端：`POST /api/chat` 接受 `corpus_id`，graph 按库限定检索范围 | ⬜ |
| H5 | 前端：侧栏知识库选择器（展开/收束两态，含份数与状态点） | ✅（`CorpusPicker.tsx` + `useCorpora.ts`；收束态 Layers 图标浮层；切库清越界 `allowed_doc_ids` 并提示） |
| H6 | 前端：知识库详情页（复用 `LibraryView`，字段随库类型自适应） | ✅（库头部：类型/领域/份数/总页数/job 进度；「导入/更新本库」按钮 + 5s 轮询；基金库卡片显示文件名解析的负责人/项目编号/年份区间，待 H9 换服务端 meta） |
| H7 | 前端：文档可视化接库范围（`DocumentExplorer` 传当前库） | ✅（`useDocuments(corpus)` 按库拉取；Explorer 头部显示库名） |
| H8 | 前端：按库问答（`corpus_id` 随请求 + 会话头显示库名 + 切库清越界 `allowed_doc_ids`）；`VITE_UI_CORPUS` 默认 off | ⬜ |
| H9 | 元数据：从基金文件名提取报告年份区间/项目编号/负责人/领域（衔接 B2/B4） | ⬜ |
| H10 | 验收：以 `nf/人工智能与医疗` 10 份真实报告走通「选库 → 浏览 → 预览 → 按库问答」 | ⬜ |

> H 为 B4/B5 的前置（单库混装会使领域/年份过滤失去意义）。H1–H3 只加不改、无破坏性，建议在 B1 之前执行；H4 与 B5 同批。H8 因 `ChatRequest extra="forbid"`，须待 H4 契约落地后才可发送 `corpus_id`。

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
| U1 | 任务系统与会话绑定 | 🟡（U1.0–U1.4 已实施：`vite-env.d.ts`/`uiFlags`/`TaskPicker`/`SessionData.task_id`/会话头与徽标；U1.5 过滤 UI 依赖 B5，未实现） |
| U2 | 右侧文档面板与引用跳转 | 🟡（U2.1–U2.5 代码完成：入口/树/查看器/引用跳转/限定分离；U2.6 **D6 降级**为浏览器原生 PDF；D10 页码一致性校验与浏览器实测未做） |
| U3 | 报告入口 | ⬜（依赖 E1/E2；U3.4 依赖待定设计 #10） |
| U4.1a | 内容区静态放宽：主区 `max-w-4xl` → `max-w-5xl`（`main.tsx:211`） | ✅（`72fde7a`） |
| U4.1b | **双栏条件自适应**（N4）：随侧栏收束/展开动态调整内容宽度；文档面板按 D11 在宽屏降级为挤压式侧栏 | ✅（主区宽度随收束切换 `md:grid-cols-*` 与 `max-w-*`；D11 挤压式侧栏随 U2 落地） |
| U4.2 | 空状态改为任务导向示例 | ✅ |
| U4.3 | 流式过程与 Markdown/代码块排版 | 🟡（基础排版已有，后续随 U2/U3 调整） |
| U5 | 会话内分支：编辑并重问合并进原会话（`SessionData.branches`；含持久化管线/`restoreTurns`/字节配额/旧数据归并/`branches.ts` 单测） | ✅（见 `ui_optimization.md` §8） |
| U6 | 设置抽屉用电源按钮取代整行“断开连接并退出” | ✅ |
| U7 | 知识库源文件预览（复用读接口，Markdown/纯文本 + 元数据） | ✅ |
| U8 | 左下角 LLM 模型名 + 红/绿/黄状态灯 | ✅（`ce3b4e7`） |
| U9.1 | 侧栏收束/展开：图标栏 ↔ 全宽，`localStorage` 持久化，键盘可达，异常提示不隐藏 | ✅（`SIDEBAR_KEY` 持久化；收束时图标栏：新对话/文献库/搜索/头条(仅开关)/设置） |
| U9.2 | 「文献库」一级入口：卡片/列表视图、按名称筛选、点击复用 `DocumentPreview` 预览；不改检索范围 | ✅（`LibraryView.tsx`；点击走 `openDocument`，`VITE_UI_DOC_PANEL` 开启时进入 Explorer） |
| U9.2b | 文献库视图与聊天共存：切换视图只卸载主区 `<section>` 展示层，**保留 App 层 `turns` 与流式 controller**（请求/回调挂载在 App，不随 section 卸载）；返回对话时恢复滚动位置 | ✅（`showView`/`backToChat` 记录/恢复 `window.scrollY`） |
| U9.3 | 科研头条占位：`VITE_UI_NEWS` 默认 off，不实现抓取 | 🟡（**仅占位骨架已渲染**；「科研头条」本身属 demand §8.2 首期不做，数据源未定前不开放——占位 ≠ 交付功能） |
| U9.4-1 | 设置抽屉只读展示当前模型（当前 `deepseek-v4.1-flash`） | ✅（"模型"区块读 `/api/health` 的 `model`） |
| U9.4-2 | 模型选择器：`VITE_UI_MODELS` 默认 off，请求可选 `model` | ⬜（依赖后端 `GET /api/models` + 待定设计 #12） |

依赖说明：U1–U3 由 `ui_optimization.md` §4 特性开关控制，后端就绪前默认关闭且不发送新字段。**开关现状（2026-09-21 更新）：`vite-env.d.ts` 与 `uiFlags.ts` 已建立（U1.0），六枚开关均可读取、默认关闭**；U1.1–U1.4、U2、U9 各子项已在开关内实施。U9.4-2 待后端契约。

> **开关启用策略（2026-09-21 第四轮审查新增）**：每枚开关转 on 须同时满足两个条件——① 对应后端契约已实现；② 通过浏览器实测验收。当前判定：`VITE_UI_TASKS`（后端 `/api/tasks`+chat `task_id` 已实现 ✅，浏览器验收未做）与 `VITE_UI_DOC_PANEL`（后端 D1/D2 已实现 ✅，D10/浏览器验收未做）**暂维持 off**，随本批提交与浏览器验收一并开启；`VITE_UI_FILTERS/REPORTS`（B5/E 未实现）、`VITE_UI_NEWS`（待定）、`VITE_UI_MODELS`（待定设计 #12）维持 off。开启时改 `uiFlags.ts` 默认值或配 `.env`，不得只改一处。

**z-index 层级约定**：`SettingsDrawer` = 30、`DocumentPanel`（含 U9.2 预览与 U2 Explorer）= 40，文献库视图不得另设更高层级以免盖住预览面板。执行顺序：U5 单独一个提交（先抽 `branches.ts` 纯逻辑 + `node:test`），U7 次之，U6/U8 可并入任一批；U9 各子项独立成小步提交。

## 首期不做（来自 demand §8.2）

多租户/权限后台、多 Agent 协作、知识图谱、工作流画布、独立问题分类服务、材料遵循等级系统、自动全网研究、自动订阅同步、**外部资讯抓取与科研头条**、**多模型路由与模型管理后台**、模板管理平台、分布式任务队列。

（后两项为 demand §8.2 于 2026-09-21 追加，逐项对齐。）

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

### 第二轮审核采纳（2026-09-21，依据 [`review-2026-09-21.md`](review-2026-09-21.md)）

| # | 意见 | 处理 |
|---|---|---|
| 15 | plan 未同步 demand §9.5–§9.7（P0） | 新增 U9.1/U9.2/U9.3/U9.4-1/U9.4-2 任务行；阶段总览 U 行与设计指南 §1/§3.1 补入文献库入口与侧栏收束 |
| 16 | ui §2 表与文件头矛盾（P0） | ui §2 末四行改 ✅ U5（`9a0c899`）/U6/U7/U8（`ce3b4e7`），并统一图例说明 |
| 17 | F 节缺 demand §8.2 新增三条（P1） | 新增 F9/F10/F11 |
| 18 | 首期不做缺 2 项（P1） | 补「外部资讯抓取与科研头条」「多模型路由与模型管理后台」 |
| 19 | §5 缺 2 条拟议接口（P1） | 补 `GET /api/models`、`GET /api/news`（均标注拟议、首期不实现）与 chat 可选 `model` 的前置条件 |
| 20 | 模型可用性无判定依据（P1） | 新增**待定设计 #12**，承接 U9.4-2 与 F11；ui §8 U8 加缺口说明（`model_verified` 恒 `False` 且仅被测试断言） |
| 21 | ui §8 标题仍写拟议（P1） | 改为「已实施并离线验收」并注明状态以 plan 为准 |
| 22 | 悬停菜单三处不一致（P1） | 统一为「重命名/归档」；复制与删除并列为补充项（plan §4/G6 与 ui U0.5 注同步） |
| 23 | 测试基线数字过期（P1） | ui §1.1 注明 U0 基线 12、U5 后当前 15 |
| 24 | 提交号口径不统一（P1） | 完成情况记录补 `0ff1480`/`72fde7a`/`9a0c899`/`ce3b4e7`，并写入「代码类完成项须标提交号」约定 |
| 25 | §2.1 未引 demand §9.3（P2） | 四个任务的「对应需求」列补 §9.3 |
| 26 | `src/prompts/` 空目录易误读（P2） | G1 行补明「当前为空目录、`git ls-files` 无记录，本任务从零开始」 |
| 27 | 阶段 A/C 标 🟡 与 demand 口径不一（P2） | 阶段总览加脚注说明 🟡 系 A7/C4 收尾项所致 |
| 28 | U9.2 卡片字段超 demand（P2） | ui U9.2 拆分「必需/可选」字段 |
| 29 | status.md 未同步（P2） | §5 补 U9 待办与 demand §9.5–9.7 缺口，§6 补 U5/U6/U7/U8 验证行 |

未采纳：无。经复核 P0 两条成立（提交 `ce3b4e7`/`9a0c899` 与 `src/main.py:108` 均已实测），已按清单修订；正面清单 8 项保持不动。

### 第三轮审核采纳（2026-09-21，依据 [`review-2026-09-21-deep.md`](review-2026-09-21-deep.md)）

源码证据已逐条实测（`graph.py:232/326`、`main.py:45/73/76`、`prepare_docs.py:24/36`、`parsers.py:28`、`knowledge.py:14-16/123`、`DocumentPanel.tsx:16-17`、`main.tsx:211`、`workspace.ts:123`、`git log -- dev_logs/design/`）。

| # | 意见 | 处理 |
|---|---|---|
| 30 | N1 切语料缺 prompt 去硬编码任务（P0） | **B 阶段新增 B6**：清理 `graph.py`/`main.py`/`prepare_docs.py` 五处语料专属内容与自动导入；并加注「B6 与 G1 职责互不替代、切语料前须先做」；F 节加 F12 验收 |
| 31 | N2 D10 方向错误（P0） | **D10 重写**为三方 1-based 一致性校验（`Page.number` = LiteParse `page_num` = PDF.js `getPage(n)`），删除「建立映射」预设；另设 **D10b** 承接 OCR/重排分支的再校验（保留真实风险，避免把 repo 的整体判断绝对化到未来语料） |
| 32 | N3 DocumentPanel 是遮罩抽屉而非侧栏（P1） | 定案：**U7 维持遮罩抽屉**（符合 demand §5 最低要求），桌面挤压式侧栏另立 **D11**，并从 U7 验收中移除；plan §3.1 与 ui §8 U7 均已标注形态现状 |
| 33 | N4 U4.1 名实不符（P1） | **U4 拆 U4.1a（已实施的静态放宽）/ U4.1b（未实施的条件自适应）**，plan 与 ui 同步，避免 ✅ 掩盖未做部分 |
| 34 | N5 异常可见定义不足（P1） | 新增 **F13**：知识库未就绪须主界面可见文字、收束后仍可见；ui U9.1 联动约束同步（指向 `main.tsx:217-222`） |
| 35 | N6 A7 滞后 6 个提交（P1） | A7 由 🟡 **回退为 ⬜**，附待补清单（`SessionData.branches` → LLD、U7 预览 → LLD、四个拟议接口 → API.md）与同步时机约定（N12） |
| 36 | N7 U9.1/U9.2 改动冲突与 z-index（P1） | plan 依赖说明与 ui U9.1 均写明「同批、先 grid 后文库」；新增 **z-index 层级表**（抽屉 30 / 预览 40 / 文献库视图不设更高层）；新增 **U9.2b** 约束「只卸载 `<section>`、保留 App 层流式与滚动位置」 |
| 37 | N8 「删除」是凭空菜单项（P2） | G6 行加源码证据（`workspace.ts:123` 无 `remove`/`duplicate`），并注明实施前需先新增状态层方法 |
| 38 | N9 开关全部未创建（P2） | ui §4 表加「实测 `grep VITE_UI` 零命中、本表为待创建清单」；plan 依赖说明同步改为「全部开关均未创建」 |
| 39 | N10 status 测试基线（P2） | 已在第二轮 #29 同步（U5 行记 15 passed），保持 U0 行的 12 passed 作为历史基线不改写 |
| 40 | N11 task4 交互分支缺失（P2） | plan §2.2 与 G5 补明「选 task4 → 新建会话但输入区切报告表单、不发 chat」 |
| 41 | N12 A7 同步时机（P2） | A7 说明补「各阶段收尾提交内完成，不得跨阶段累积」 |

未采纳：无。深度审核的 6 项源码级正面确认（`citation` 字段确需在 U2.4 增补、`DocumentPanel` 共用外壳、`documentPreview.ts` 终止条件比文档更严谨、`extra="forbid"`、预算边界、`answer_policy` 矛盾）均与现有待决/任务一致，作为基线保留。

### 第四轮审查采纳（2026-09-21 22:35，plan.md × implementation.md 一致性审查，依据 [`plan-status-check.md`](plan-status-check.md) 及其追加节）

本轮为文档一致性审查：implementation.md 的证据**独立复跑通过**（`node --test` → 15 passed；`py_compile` 全通过）；plan 状态列未发现虚报，问题集中在**跨文档状态不同步**。

| # | 意见 | 处理 |
|---|---|---|
| 42 | G5/G7 状态过期：implementation 记 U1.2 `SessionData.task_id` 与任务选择器已实现（工作树），plan 仍 ⬜ | G5 → 🟡（选择器/绑定/task4 阻断已实现，`main.tsx:284/364`；报告表单占位待 E）；G7 → ✅（工作树，`workspace.ts:8`） |
| 43 | 阶段总览 D/G 仍 ⬜，与任务列大面积 ✅/🟡 矛盾 | D → 🟡、G → 🟡（B 维持 ⬜：主目标"基金语料入库"未动，仅 B6 清理完成） |
| 44 | A7 标 ✅ 却附「E 阶段契约待实现后补」，自相矛盾 | A7 → 🟡（第二批已补的契约经 `grep` 实证在 API.md/LLD.md 各 8 处命中） |
| 45 | U9.3 ✅ 与「首期不做：科研头条」同页并存，语义含混（承接前轮 P2-C） | U9.3 → 🟡（仅占位骨架，占位 ≠ 交付功能） |
| 46 | 「完成 ≠ 可用」：开关默认全 off 但无启用策略（承接 P1-B，补决策而非只提问题） | 依赖说明新增**开关启用策略**：转 on = 后端契约已实现 ∧ 浏览器实测通过；tasks/docPanel 暂维持 off，随本批提交与浏览器验收开启 |
| 47 | §6 验收仍写「D10 的 page→物理页映射」，与 D10 重写后的「无需映射」口径冲突 | 改为「D10 的页码口径校验」 |
| 48 | G1 行残留「`src/prompts/` 为空目录」的过期陈述，与 ✅ 矛盾 | 移除该历史陈述，保留 `UnknownTaskError` 行为描述 |
| 49 | implementation.md 证据可复现性 | 独立复跑：`node --test src/*.test.mts` → **15 passed / 0 fail**；`py_compile src/*.py src/agent/*.py src/prompts/*.py` → 通过。记录于 [`plan-status-check.md`](plan-status-check.md) 追加节 |

## 待定设计（实现前确认）

| # | 问题 | 影响任务 | 需确认 |
|---|---|---|---|
| 10 | 报告与会话的绑定与持久化：`POST /api/reports`（E1）无 `session_key`/`run_id`，`GET /api/reports/{id}`（E2）只按 id 取，而 G9 要求报告“作为会话中的报告记录展示” | E1 / E2 / G9 | 由前端把 `report_id` 写入 `SessionData`，还是报告携带会话键、由后端持久化绑定 |
| 11 | task1/task2 输出契约与全局 `answer_policy` 冲突：现全局允许“有依据的推导”，而本 plan 定义 task1“不推测” | G1 / G4 | 明确推导许可由任务 prompt 覆盖 base 默认：task1/task2 收窄，task3 放开并要求标注事实/推断 |
| 12 | **模型可用性判定来源缺失**：demand §8.2/§9.6 要求“模型不可用须明确提示、不静默切换”，但 `/api/health` 的 `model_verified` 恒为 `False`（`src/main.py:108`），仅被 `tests/test_professional_policy.py:150` 断言其值，无生产逻辑与前端消费；U8 红灯条件（断连/未配密钥/health 失败/`preparation=error`）覆盖不到模型本身不可用 | U9.4-2 / F11 / U8（如需扩展） | health 是否改为真实探测并返回可判定字段，或新增轻量模型探测接口；前端据此呈现“模型不可用”而非继续展示绿灯 |

> 第 10、11 项在实现对应任务前定稿；未定稿前不开始 E1/E2/G9 与 G1/G4。第 12 项未定稿前 U9.4-2 不开工、F11 不可验收。

## 完成情况记录

> 完成情况与证据已迁移至 [`implementation.md`](implementation.md)（2026-09-21 建立），本文不再维护完成记录；任务状态以上文各表为准。
