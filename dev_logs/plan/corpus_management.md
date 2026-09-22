# dox_agent 知识库管理与选择（规划 v1，2026-09-21）

- 定位：本文件是 [`plan.md`](plan.md) 的**下一步规划**，对应需求新增章节 [`../demand.md`](../demand.md) §10。
- 状态：**H1–H3 后端 + H5–H7 前端已实现（2026-09-22，工作树）**——`src/agent/corpora.py` 注册表、`GET /api/corpora`、`POST /api/corpora/{id}/ingest`、`GET /api/documents?corpus=`、`/api/health` 增 `corpus_id`、`import_defaults` 限定库 root；前端侧栏库选择器（`CorpusPicker`/`useCorpora`）、库详情页（`LibraryView` 库头部 + 导入按钮）、按库文档过滤；H4/H8/H9/H10 未开工，`VITE_UI_CORPUS` 开关待创建。
- 背景：`knowledge/` 目录下已并存多个语料（`lcdata`（技术文档，当前 `DATA_DIR`）、`nf`（**真实基金报告 10 份中文 PDF**）），但 `DATA_DIR` 是单值，后端无"库"这一实体，前端只有平铺的文档列表。本规划引入**知识库（corpus）**作为一等实体。

---

## 1. 现状核对（实测，2026-09-21）

| 事实 | 证据 |
|---|---|
| `knowledge/` 已有 4 个子目录：`lcdata`（4 项，含 `knowledge.sqlite3`/`chroma`）、`nf/人工智能与医疗`（10 份 PDF）、`database`（空）、`vectordb`（空） | `ls knowledge/` |
| 基金语料文件名自带元数据：`2021_2025_82030037_赵国光_基于AI的...pdf` = 起止年*项目编号*负责人*题目 | `ls "knowledge/nf/人工智能与医疗/"` |
| `DATA_DIR` 单值，当前指向 `lcdata` | `.env: DATA_DIR=…/knowledge/lcdata` |
| `Knowledge(path)` 单实例；`docs` 表按 `id`（origin 的 sha256 前 20）主键 | `knowledge.py:50-60` |
| `import_defaults` 会 `knowledge_root.rglob("*.pdf")`，即**把 `nf` 的 10 份基金报告与 `lcdata` 一起收进同一库** | `parsers.py:103-108` |
| 前端 `useDocuments` 拉 `GET /api/documents`，无库维度 | `useDocuments.ts` |
| 侧栏已有「文献库 · N 份」入口，主区 `LibraryView` 有卡片/列表切换、按名筛选 | `main.tsx:286`、`LibraryView.tsx` |
| 已有 `DocumentExplorer`（目录树 + `PdfViewer` + 「限定为检索资料」） | `DocumentExplorer.tsx` |
| 预览用 id 进 `documentPreview.ts`；PDF 用 `/file` + `#page=`（D6 降级） | `PdfViewer.tsx` |

**结论**：后端缺"库"实体与按库隔离，前端缺库维度选择；已有组件（`LibraryView`/`DocumentExplorer`/`PdfViewer`）可复用，本规划以**扩展为主、不重写**。

---

## 2. 「知识库」概念定义

**知识库（corpus）= 一份独立的语料集合**，对应磁盘上一个目录 + 独立 SQLite + 独立向量索引。

- 一个库 = 一个 `knowledge/<corpus_id>/` 目录；`knowledge.sqlite3` 与 `chroma/` 在库内。
- 库之间**完全隔离**：检索、文献库列表、报告生成均以当前选中库为范围。
- 每个会话**绑定一个库**（与 `task_id` 同层，随会话持久化），切会话即切库。
- 首期不做：跨库联合检索、库内分区、权限隔离（单用户）。

> 与需求对齐：demand §1「可检索历史报告是数据前提」、§4.2「检索前领域/年份过滤」都以"一个明确的语料范围"为前提。当前单库混装会让年份过滤失去意义（技术文档无报告年份），因此多库隔离是 B4/B5 的**前置**。

---

## 3. 后端设计

### 3.1 库注册表

新增 `corpora` 概念，来源为配置 + 磁盘扫描：

```
knowledge/
├── lcdata/     → { id: "lcdata", name: "技术文档语料", kind: "tech" }
├── nf/
│   ├── 人工智能与医疗/   → { id: "nf-ai-med", name: "人工智能与医疗", kind: "fund",
│   │                        domain: "人工智能与医疗", report_root: "…/nf" }
└── database/, vectordb/  → 空目录，无 sqlite 则视为未初始化，不出现在列表
```

- 扫描规则：`knowledge_root` 下含 `knowledge.sqlite3` 的目录视为**已初始化库**；另有显式配置 `CORPORA`（JSON 或 env）用于命名、领域、类型。
- `corpus_id` 由相对路径稳定派生（如 `nf/人工智能与医疗` → `nf-ai-med`），保证重建索引后 id 不变。
- 每库独立持有 `Knowledge` 实例（lazy 创建并缓存），互不干扰。

### 3.2 接口契约（新增）

| 接口 | 用途 | 最小参数/返回 |
|---|---|---|
| `GET /api/corpora` | 库列表 | `id`/`name`/`kind`/`domain`/`docs_count`/`preparation`/`index_progress` |
| `POST /api/corpora/{id}/ingest` | 导入/更新该库 | 复用现有 `import_defaults`，但**限定在该库 root 内** rglob |
| `GET /api/documents?corpus=<id>` | 库内文档列表 | 现有接口**加可选 `corpus` 参数**，缺省为会话库 |
| `GET /api/documents/{doc_id}/file` | 保持 | doc_id 全局唯一，无需改 |
| `POST /api/chat` | 加 `corpus_id` | 与 `task_id` 同级；服务端据此选 `Knowledge` 实例 |
| `GET /api/health` | 加当前库状态 | 保留 `model`/`preparation`，补 `corpus_id` |

**兼容性**：`ChatRequest extra="forbid"`，故 `corpus_id` 必须走后端先行的发布顺序（见 §5）；未落地前前端不发送。

**关键修正**：`import_defaults` 现用 `knowledge_root.rglob("*.pdf")`（`parsers.py:107`），会跨库收文件。必须改为以**该库 root** 为界，否则多库隔离被导入逻辑破坏。

### 3.3 元数据（衔接 B2）

基金报告文件名已含 `起止年_项目编号_负责人_题目`，可作为 B2 元数据的**首批低成本来源**：

- `report_year_from`/`report_year_to`：取文件名前两段（`2021`/`2025`）。
- `project_no`：第三段（`82030037`）。
- `pi_name`：第四段。
- `domain`：目录名（`人工智能与医疗`）。
- 解析失败或格式不符时留空并标 `meta_incomplete`，**不猜测**。

存储：`Document` 模型加 `meta: dict`（B2 已规划该字段，D1 已留占位 `{}`），按库独立 sqlite 存储，无需迁移。

---

## 4. 前端设计

### 4.1 侧栏：库选择器（对齐 WorkBuddy「资料库」）

参考 WorkBuddy 左侧边栏「资料库」的信息层级——**库是一级入口，文档是库的下级**：

```
┌ 侧栏（展开态）───────────────┐
│ DOX_AGENT / 01        [收束] │
│                              │
│ ＋ 新的问答                   │
│                              │
│ ▸ 知识库                      │  ← 库选择区（新增）
│   ● 人工智能与医疗    10 份   │  ← 当前库（高亮 + 圆点）
│   ○ 技术文档语料     157 份   │
│   ○ ＋ 导入新库…              │
│                              │
│ 文献库 · 10 份                │  ← 当前库内的文档（随库切换变化）
│ 科研头条（开关）               │
│ ─────────────────────────    │
│ 会话历史…                     │
│ ─────────────────────────    │
│ ● LLM: deepseek-flash  正常   │
└──────────────────────────────┘
```

- 收束态：库选择降级为图标按钮，点击弹出库列表浮层（复用 `RailButton` 模式）。
- 库条目显示：名称 + 份数 + 状态点（就绪/构建中/异常）。
- 切库行为：切换后「文献库」计数与文档列表随之刷新；**已绑定旧库的会话不受影响**。
- 新建会话时继承当前选中的库。

### 4.2 知识库详情页

点击库名进入详情视图（主区替换，复用 `LibraryView` 的 `MainView` 切换机制）：

- 顶部：库名、类型、领域、文档份数、总页数、索引状态、最后导入时间。
- 中部：文档卡片/列表（**现 `LibraryView` 直接复用**），字段按库类型自适应：
  - 基金库：题目、负责人、项目编号、报告年份区间、页数；
  - 技术库：标题、kind、页数、采集时间。
- 操作：`导入/更新本库`、`按文件名筛选`、`卡片/列表切换`。

### 4.3 文档可视化（PDF 为主）

- 点击文档 → 复用现有 `DocumentExplorer` + `PdfViewer`（`/file` + `#page=`）。
- **本规划不引入 PDF.js**（D6 降级结论保持：环境装不上 `pdfjs-dist`）；如后续换装，只替换 `PdfViewer` 内部实现。
- 基金 PDF 多为扫描件，需在 UI 标注解析状态：`已解析（可检索）` / `仅预览（不可检索）`，对齐 demand §5「不把预览成功当作入库成功」。
- 引用跳转复用现有 `citation` → `openDocument(doc_id, page)`。

### 4.4 按库问答

- 发送请求时携带当前会话的 `corpus_id`（后端就绪后才发，见 §5）。
- 输入区「资料范围」语义收敛为**两层**：
  1. **库**（必选，一层范围）——决定检索在哪个语料内；
  2. **库内文档**（可选 `allowed_doc_ids`，二层范围）——现「限定为检索资料」保持不变。
- 切换库时，若原 `allowed_doc_ids` 不属于新库，**自动清空并提示**（避免静默跨库引用）。
- 会话头显示当前库名，避免"回答了但不知道在哪个库"。

---

## 5. 分期与依赖

| 编号 | 任务 | 依赖 | 说明 |
|---|---|---|---|
| H1 | 后端：库扫描与注册表（`GET /api/corpora`），每库独立 `Knowledge` 实例 | 无 | 只读，不动现有单库行为 |
| H2 | 后端：`import_defaults` 限定在库 root 内；`POST /api/corpora/{id}/ingest` | H1 | **修 `parsers.py:107` 跨库 rglob** |
| H3 | 后端：`GET /api/documents?corpus=`；`/api/health` 补 `corpus_id` | H1 | 附加参数，保持向后兼容 |
| H4 | 后端：`POST /api/chat` 接受 `corpus_id`；graph 按库注入检索范围 | H1、H2 | 契约变更，前端须等 |
| H5 | 前端：侧栏库选择器（展开/收束两态） | H1 | 对齐 WorkBuddy 资料库层级 |
| H6 | 前端：知识库详情页（复用 `LibraryView`，字段随库类型） | H3、H5 | 主区视图切换 |
| H7 | 前端：文档可视化接库范围（`DocumentExplorer` 传当前库） | H3、H6 | 已有组件，改动小 |
| H8 | 前端：问答按库（`corpus_id` 随请求 + 会话头显示库名 + 切库清 `allowed_doc_ids`） | H4、H5 | 需开关保护 |
| H9 | 元数据：从基金文件名提取年份/项目编号/负责人/领域（衔接 B2/B4） | H1 | 为 B4 年份过滤铺路 |
| H10 | 验收：以 `nf/人工智能与医疗` 10 份真实报告走通「选库 → 浏览 → 预览 → 按库问答」 | H1–H9 | 见 §6 |

**实施顺序**：H1 → H2 → H3（后端独立可用）→ H5（前端可选择，此时库列表/详情可真切）→ H6/H7 → H4 → H8 → H9 → H10。

**开关**：H8 依赖 `corpus_id` 契约，须新增 `VITE_UI_CORPUS`（默认 **off**），契约落地后再开；H5–H7 只依赖 H1/H3，可先做。

**前置提醒**：`ChatRequest extra="forbid"`——H4 未完成前，前端**不得**发送 `corpus_id`（否则 422）。

---

## 6. 验收标准

- `user 选择知识库`：侧栏列出 ≥2 个库（含份数与状态点）；点击「人工智能与医疗」后文献库计数变为 10，刷新后仍保持。
- `user 浏览基金文档`：进入库详情，卡片显示负责人/项目编号/报告年份区间（取自文件名）；点击打开 PDF 预览，页码步进可用。
- `user 预览不改变检索范围`：浏览与预览不修改 `allowed_doc_ids`（沿用 demand §5）。
- `user 按库问答`：在基金库提问，回答引用仅来自该库；切到技术库后同一问题引用来源随之变化，不串库。
- `user 切库清空越界范围`：若原限定文档不属于新库，切库后 `allowed_doc_ids` 被清空且有明确提示。
- `user 解析状态如实`：不可检索但可预览的 PDF 标注「仅预览（不可检索）」。
- `user 导入不跨库`：对某库执行导入，其他库文档数不变。

---

## 7. 风险与待决

| 项 | 说明 | 处置 |
|---|---|---|
| **回归风险** | `DATA_DIR` 单值是现有 A3 端到端验收的基础；引入多库须保证 `lcdata` 行为不变 | H1 只加不改，`DATA_DIR` 退化为"默认库" |
| **`import_defaults` 跨库** | `parsers.py:107` rglob 整个 `knowledge_root`，会把 `nf` 混进 `lcdata` | H2 必修，否则隔离失效 |
| **基金 PDF 体量大** | `nf` 单份最大 74 MB（江泓），10 份约 218 MB；LiteParse 全量解析耗时 | H2 需给出进度与失败清单；必要时分库串行 |
| **扫描件解析质量** | 多为扫描件，`PDF_OCR=true` 但 `PDF_OCR_LANGUAGE=eng`，中文识别需调整 | 列入 H9；先实测 1 份再定语言 |
| **`.env` 含明文密钥** | `MODEL_API_KEY`/`LANGSMITH_API_KEY` 为真实值 | 独立事项：确认 `.env` 已被 gitignore（现 `git status` 未见其改动，需复核） |
| 待决 #13 | 库是"目录约定"还是"显式配置" | 倾向：磁盘扫描为主 + 配置覆盖命名/领域 |
| 待决 #14 | 会话切库是否允许（历史回答如何处理） | 倾向：允许切库但历史回答标注其原库，不回溯改写 |

---

## 8. 与既有文档的关系

| 本规划 | 上游需求 | 相关任务 |
|---|---|---|
| 多库隔离 | demand §1、§4.2（语料范围前提） | B1、B4、B5 |
| 库内文档可视化 | demand §5、§9.2、§9.5 | D1–D3、D11、U2、U9.2 |
| 按库问答 | demand §3、§6 | C3（`allowed_doc_ids`）、G3（`task_id` 同层） |
| 基金元数据 | demand §4.2 | B2、B3 |
| 侧栏库入口 | demand §9.5（一级入口层级） | U9.1、U9.2 |

> 本文只做规划，不改变现有任务状态。H1–H10 正式开工时合入 [`plan.md`](plan.md) 并新增「H 知识库管理」阶段行。
