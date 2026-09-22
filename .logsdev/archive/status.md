# dox_agent 当前开发情况

- 更新日期：2026-09-22
- 依据：本仓库已复制源码 `src/`、`frontend/`、`launch.sh`、`.env.example`。以下结论由实际阅读源码得出，历史记录不在本文件内（见 `archive/`）。
- 定位现状：本地单用户 Agentic RAG 文档问答。语料目前是 LangChain/LangGraph/Deep Agents 官方文档与本地文本/PDF，**尚未切换为科学基金历史报告**。
- 接口与实现设计：见 [`design/`](design/README.md)（[`HLD.md`](design/HLD.md) / [`API.md`](design/API.md) / [`LLD.md`](design/LLD.md)），由实际阅读源码整理。

## 1. 技术与运行

- 后端：Python 3.12、FastAPI、LangGraph、Deep Agents；SQLite 保存原文与版本；BM25Plus 稀疏检索；可选本地 HuggingFace embedding + Chroma，并与 BM25 做 RRF 融合。
- 前端：React 19 + TypeScript + Tailwind 4 + Vite 7；生产构建由 FastAPI 托管（`frontend/dist`）。
- 启动：`launch.sh` 复用/创建虚拟环境，依赖签名来自 `pyproject.toml`。
- 文档与数据布局：开发文档在 `.logsdev/`；本地数据分为 `.knowledge/`（原始语料）、`.data/`（数据库/向量库）、`.demo_langchain/`（演示 LangChain 语料）。向量索引路径由 `VECTORDB_DIR` 指定，缺省为 `DATA_DIR/chroma`。
- **运行状态**：`pyproject.toml` 与 `tests/` 已补齐，`.venv` 已安装依赖（含 `web`/`embedding` extras），`launch.sh` 可完成安装与启动。后端运行与真实模型问答已完成端到端验证（见第 6 节）。
  - 本机以 CPU 后端安装 `torch==2.14.0+cpu`（`uv --torch-backend cpu`），避免默认 CUDA 栈。
  - 演示语料已迁至 `.demo_langchain/`（`langchain_datadb`：157 份 LangChain/LangGraph/Deep Agents 官方文档；`langchain_vectordb`：Chroma 索引），`.env` 的 `DATA_DIR`/`VECTORDB_DIR` 指向该目录；启动即可问答。**尚未切换为科学基金报告**，切换后需重跑验收。
  - 问答已固定为带引用的专业模式（阶段 C 移除了意图分类与 `query_routing`/`evidence_level`/`execution_mode`）；未限定资料的问题也走检索并给出引用。
- 命名：`static1` → `dox-agent` 改名已完成（源码、配置、前端 dist）。

## 2. 已实现的后端接口

| 接口 | 说明 |
|---|---|
| `GET /api/health` | status、app_id（dox-agent）、model、docs_count、api_key_configured、preparation、corpus_id（H3）、index_progress |
| `GET /api/documents` | 文档摘要列表，`pages` 仅为页数、不含正文；已增 `rel_path`/`status`/`meta`（`meta` 占位 `{}`）；可选 `corpus` 参数按库过滤（H3，缺省=默认库） |
| `GET /api/documents/{doc_id}` | 按 `page`/`start_line`/`version` 读取原文；`section=true` 走章节/代码块窗口 |
| `GET /api/documents/{doc_id}/file` | 原始 PDF/Markdown/txt 文件流（FileResponse 自带 Range）；仅 `knowledge_root`/`text_root` 内本地文件 |
| `GET /api/tasks` | 固定任务集 task1–task4（`id`/`name`/`description`/`has_template`） |
| `GET /api/corpora` | 知识库列表（H1）：磁盘扫描 + `CORPORA` 配置覆盖，含份数/初始化状态/导入 job |
| `POST /api/corpora/{corpus_id}/ingest` | 按库导入/更新（H2），限定该库 root 内；`POST /api/ingest/local` 已排除其他库 root |
| `POST /api/ingest/local` | 导入配置目录中的 txt/md 与 knowledge 中的 PDF（LiteParse） |
| `POST /api/ingest/text` | 手工补充正文，同来源更新版本 |
| `GET|POST /api/official-docs` | 官方 Markdown 分区发现与批量更新任务状态 |
| `POST /api/web/preview` | 网页抓取预览（Crawl4AI 或 Firecrawl），不入库 |
| `POST /api/web/confirm/{preview_id}` | 确认最新预览入库 |
| `POST /api/chat` | SSE 流式问答 |
| `GET /api/workspace/{sessions|notes}` | 会话与笔记列表；笔记带来源版本状态 |
| `PUT /api/workspace/{sessions|notes}/{key}` | 保存会话/笔记，revision 冲突返回 409，单记录上限 4MB |
| 前端静态资源 | `/{asset_path}` 托管 `frontend/dist` |

## 3. 已实现的问答能力（Agent / 检索）

- 流程：`understand` → `direct` 或 `research` → `validate` → `answer` → `finish`。
- 研究工具：`search_docs`、`read_doc`、`check_corpus_page`、`finish_research`；带有限补查、预算（`MAX_SEARCHES`、`MAX_READS`、`MAX_MODEL_CALLS`、超时）与硬停止。
- 证据：`evidence_id` 绑定 doc_id/page/start_line/version；版本核验；来源卡片带 citation。
- 对话契约字段：`messages`、`run_id`、可选 `allowed_doc_ids`（1–20 份）、可选 `task_id`（`task1–3`，默认 `task1`；task4 不在 chat 生成）；已移除 `execution_mode`/`query_routing`/`evidence_level`（阶段 C）。
- 任务系统：`src/prompts/`（base.md 8 条硬约束 + task1–4 角色/输出契约 + 加载器）；understand/answer 注入 `task_instruction(task_id)`；推导许可由任务提示词覆盖全局基线（#11 定稿）。
- 知识库管理（H1–H3）：库注册表 `agent/corpora.py`（只读扫描，`DATA_DIR` 退化为默认库）；每库独立 `Knowledge` 实例（懒创建）；`local_path_in_roots` 纳入实际库根；当前识别 `lcdata`（默认）与 `nf-人工智能与医疗`（10 份基金 PDF，未初始化）。
- 知识库选择与详情（H5–H7）：侧栏「知识库」选择区（展开态列表 + 收束态图标浮层，含份数与状态点）；切库自动清空越界 `allowed_doc_ids` 并提示；文献库页即库详情页（库头部 + 「导入/更新本库」+ job 实时进度）；基金库文档卡片显示文件名解析的负责人/项目编号/报告年份区间（`fundMeta.ts` 展示层解析，H9 后由服务端 meta 替代）；文档列表按当前库过滤。
- SSE 事件：`status`、`policy`、`step`、`telemetry`、`sources`、`token`、`usage`、`done`、`error`。
- 检索：BM25Plus；指定资料范围时只走 BM25（不同步子集到共享 Chroma）；可选 dense + RRF；结果按来源分散。

## 4. 已实现的前端能力

- 对话：流式回答、停止、重新生成、复制、步骤过程、耗时与 token 用量、错误提示。
- 会话：自动保存/恢复、切换、重命名、归档/恢复；会话栏按今天/昨天/更早分组、可搜索、当前高亮、悬停重命名/归档，未保存的新会话显式渲染不消失。编辑历史问题改为**会话内分支**（`branches.ts`，可查看/设为主时间线，字节配额裁剪，旧独立分支会话归并展示）不新建会话。
- 资料：输入区 `ScopeSelector` 资料范围多选（≤20 份）与筛选；入库/采集（本地导入、网页预览、补充正文、在线文档源）收进 `SettingsDrawer`；已入库文档可点击在共享 `DocumentPanel` 中预览规范化正文（Markdown/纯文本切换、跨页续读、元数据）。该面板在 ≥1024px 已改为**挤压式无遮罩侧栏**（D11：根节点 `lg:pointer-events-none`、遮罩 `lg:hidden`），窄屏保留遮罩抽屉。
- U2 文档面板（`VITE_UI_DOC_PANEL` 门控，默认 off）：右上"本地文档"入口 → `DocumentExplorer`（目录树 `DocumentTree` 按 `rel_path` 建树/折叠/筛选/状态标记 + 原文件查看：PDF 走浏览器原生渲染（`/file` + `#page=`，**D6 降级**，未用 PDF.js）、Markdown/原文切换）+ "限定为检索资料（仅此文档）"显式按钮（复用 `allowed_doc_ids`，浏览不改范围）。
- 引用跳转（U2.4）：`api.ts` `Source` 增 `citation`；`Answer.tsx` 以 rehype 插件在渲染层把正文 `[n]` 变可点击（不改 Markdown 源文本、code/pre/内跳过、n 超出 sources 原样显示），点击 `openDocument(doc_id, page)`；"已读证据"卡片同步 citation 编号。
- 侧栏：收束/展开（图标栏 ↔ 全宽，`localStorage` 持久化）；「文献库」一级入口（`LibraryView`：卡片/列表、名称筛选、点击复用文档预览）；视图切换只卸载主区 `<section>`，`turns` 与流式 controller 留在 App 层，返回恢复滚动位置；主区宽度随收束自适应（U4.1b）。
- 任务系统 UI（`VITE_UI_TASKS` 门控，默认 off）：`TaskPicker` 任务单选器（`GET /api/tasks`）；`SessionData.task_id` 随会话保存/恢复；会话头显示任务名与职责、会话栏任务徽标；task4 输入区为报告占位（不发 chat）。
- 内容区宽度：随侧栏收束/展开动态调整（`md:grid-cols-[56px|260px_1fr]` + `max-w-*` 切换）。
- 信息架构：左栏仅会话管理；运维能力与导出/断开在设置抽屉（`role=dialog`、focus trap、Esc 关闭；关闭即卸载并停止轮询）；设置抽屉新增只读"模型"区块（U9.4-1）。
- 空状态：任务导向示例（精准问答/对比/趋势），不含任何语料特定文案。
- 状态：左下角固定 `LLM: <model>` + 红/绿/黄状态灯 + 文字状态（颜色非唯一信号，tooltip 显示 health，点击打开设置抽屉）；长会话不顶走。断开/保存失败在主界面可见；设置抽屉标题栏为电源按钮（内联 SVG，断开后禁用）。
- 未挂载：`frontend/src/Notes.tsx` 已存在但未挂载到 `main.tsx`（文件头已标 experimental）。

## 5. 尚未实现（对照 `demand.md`）

- **知识库管理与选择（H 阶段，拟议未开工）**：`knowledge/` 下已并存多个语料（`lcdata`、`nf/人工智能与医疗`（10 份基金报告）），但后端**无"库"这一实体**、`DATA_DIR` 为单值、`import_defaults` 会跨库 `rglob`；前端只有平铺文档列表。规划见 [`plan/corpus_management.md`](plan/corpus_management.md)（H1–H10），需求见 `demand.md` §10。H1–H3 为后端前置（库注册表 / 修跨库 rglob / `?corpus=`），是 B4/B5 领域年份过滤的前置。
H5–H7（侧栏选择器、库详情页、按库文档过滤）已完成；H4/H8（chat `corpus_id` 契约与按库问答）代码已提交（`e7d08e2`/`67d0ff0`），浏览器/真实语料验收未做；H9（文件名元数据入服务端）、H10 验收未开工。
- 检索前的领域/年份过滤（B4/B5 与 U1.5 过滤 UI）。
- D10 页码口径校验（`evidence.page` = `Page.number` = 阅读器物理页三方一致性回归）与 D10b OCR/重排再校验；**D6 已降级**：`pdfjs-dist` 因 Windows npm 与 WSL node_modules 符号链接冲突（EISDIR）无法安装，PDF 预览改用浏览器原生渲染（`/file` + `#page=`），缩放依赖阅读器工具栏，换装 PDF.js 时仅需替换 `PdfViewer` 内部实现。U2/D8 的浏览器实测尚未进行。
- 统一报告生成入口与四个模板（`achievements`/`hotspots`/`future_directions`/`comprehensive`）；task4 报告表单（U3/G9，当前输入区为占位提示）。
- 报告预览/复制/Markdown 下载。
- 模型选择器（U9.4-2）：依赖尚未拟定的 `GET /api/models`，首期只做只读展示（已完成）。
- **模型可用性判定信号**：demand §8.2/§9.6 要求模型不可用时明确提示，但 `/api/health` 的 `model_verified` 恒为 `False`（`src/main.py:108`）且无生产逻辑消费，当前无可用判定（见 [`plan/plan.md`](plan/plan.md) 待定设计 #12）。
- 科研头条/资讯板块：demand §9.7 定为**待定、首期不做**（涉及外部抓取与合规，未定前不开放入口）。
- 契约文档同步：A7 已随 B6/G1–G4/U1/U2/D1–D3/D11 批次补齐 `design/API.md`/`LLD.md` 与 `status.md`（2026-09-21）；**E 阶段 `/api/reports` 契约待实现后再补**。

## 6. 本次实际验证

| 检查 | 结果 |
|---|---|
| `grep` 全量扫描 `static1` 标识 | 无残留 |
| `.venv/bin/python -m py_compile src/*.py src/agent/*.py` | 通过 |
| `cd frontend && npm run build`（tsc --noEmit + vite build） | 通过，dist 已重建 |
| `.venv/bin/python -m pytest tests -q`（A2 恢复的回归套件） | 83 passed |
| `uv pip install -e ".[dev]"` / `-e ".[web,embedding]"`（A1） | 均成功；`torch 2.14.0+cpu`、`Crawl4AI 0.9.3`、`sentence-transformers 5.7.0` |
| `bash launch.sh` 启动（A3，BM25 模式） | 安装步骤执行、服务在 `127.0.0.1:8000` 启动 |
| `GET /api/health`（A3） | `preparation=ready`、`docs_count=157`、`app_id=dox-agent` |
| `POST /api/chat` 真实模型问答（A3） | research 路线；8 条带 `doc_id/page/start_line/version` 的引用来源；正文含 `[1][4][5][6][7]`；流式 `done` |
| 启用 embedding 的 DenseIndex（A3 旁证） | 本地模型权重加载成功、索引构建启动（因 CPU 全量索引 6667 chunks 约需小时级，未等其完成；BM25 模式已完整验收） |
| 前端构建（去硬编码后） | `npm run build` 通过；产物无 `南溪`、`LangChain 官方文档` 等语料特定文案，含新文案`在线文档源`与资料建议。 |
| 演示语料接入（本次） | `knowledge/lcdata` 的 Chroma 集合名由旧 `static1-53eb4e...` 改为当前代码使用的 `dox-agent-53eb4e...`（签名一致）；服务启动后 `preparation=ready`、`docs_count=157`、`index_progress=ready 6717/6717`（复用而非重建）。 |
| 演示问答（阶段 C 之前，旧默认 `knowledge_only`） | `POST /api/chat` → research 路线，8 条引用来源，流式 `done`。 |
| 阶段 C 后端（本次） | 移除 `execution_mode`/`query_routing`/`evidence_level`：`GET /api/health` 无 `defaults`；`POST /api/chat` 传旧字段返回 422；不传策略字段 → 固定 research，8 条引用来源、`done`。 |
| 阶段 C 测试（本次） | `pytest tests -q` → 64 passed；新增 `tests/test_professional_policy.py`，删除旧分类套件 `test_query_routing.py`。 |
| 阶段 C 旁带修复（本次） | 快速查证（`quick.verify`）的模型调用此前未计入 usage；现显式传入本轮回调，`test_usage` 验证 research+answer 两次调用共 26 tokens。 |
| 前端（本次） | `npm run build` 通过；移除三个策略下拉，`Options` 仅剩 `allowed_doc_ids`；产物无旧字段文案。 |
| U0 UI 信息架构（本次） | 新增 `ScopeSelector`/`IngestTools`/`SettingsDrawer`/`SessionList`/`useDocuments`，删除 `SourceManager.tsx`/`KnowledgePanel.tsx`；`npm run build` 通过；`npm test`（node:test）12 passed。 |
| U0 离线浏览器验收（本次） | `tests/browser_ui_shell.py` PASS：左栏无入库/无旧健康框、健康圆点、会话分组/搜索/未保存会话、抽屉 dialog+Esc+焦点回退+关闭后停止轮询。 |
| 回答控件回归（本次） | `tests/browser_answer_controls.py` PASS：复制/重生成/停止/失败/导出/移动端无回归；同时修正两处过期断言（`run_id` 逐次变化、取消文案）。 |
| U5 会话内分支（`9a0c899`） | 新增 `branches.ts` 与 `branches.test.mts`；`npm run build` 通过；`npm test`（node:test）**15 passed**（U0 基线为 12）；`tests/browser_session_branches.py` PASS：编辑并重问不新增会话、保存后刷新分支仍在、恢复不残留运行态、旧 `source_session_id` 分支会话归并。 |
| U7 知识库源文件预览（`ce3b4e7`） | 新增 `DocumentPanel`/`documentPreview.ts`/`DocumentPreview.tsx`；`npm run build` 通过；`tests/browser_document_preview.py` PASS：多页续读至末页、元数据含采集时间、原文切换、预览不改检索范围。 |
| U6/U8 电源按钮与 LLM 状态（`ce3b4e7`） | `npm run build` 通过；`tests/browser_status_power.py` PASS：电源断开、断开后禁用、重连、长会话列表不顶走状态区。 |
| B6+G1–G4 后端（本批，工作树改动） | `py_compile` 对 `src/main.py`、`agent/graph.py`、`agent/config.py`、`agent/routing.py`、`prepare_docs.py`、`prompts/__init__.py` 全部通过；prompts 加载器实测（Windows Python）：`list_tasks()` 返回 task1–4、task4 `has_template=true`、未知 id 抛 `UnknownTaskError`；AST 枚举确认路由含 `/api/tasks` 与 `/api/documents/{doc_id}/file`。**pytest 未运行**（`.venv` 为 Linux ELF，本机不可执行）。 |
| U1/U2/U9 前端（本批，工作树改动） | `tsc --noEmit` 无新错误（仅既有 Windows 主机大小写伪错误：`DocumentPreview.tsx` vs `documentPreview.ts`，Linux 构建不受影响）；`node --test src/*.test.mts` **15 passed**；`vite build` 未运行（rollup 原生二进制为 Linux 版）。U2 浏览器验收与 D10 页码一致性校验未做。 |
| H1–H3 知识库管理后端（本批，工作树改动） | `py_compile` 对 `agent/corpora.py`/`config.py`/`parsers.py`/`main.py` 通过；corpora 模块独立加载扫描真实树：`lcdata`（默认、第一）+ `nf-人工智能与医疗`（fund/uninitialized）；`_docs_count` 临时副本计数 157；override 合并生效；路由 AST 三路由均在。**按库导入与按库文档接口未在运行服务上实测**（需 WSL）。 |
| H5–H7 知识库前端（本批，工作树改动） | `tsc --noEmit` 无新错误；`node --test src/*.test.mts` **18 passed / 0 fail**（新增 `fundMeta.test.mts`）。浏览器实测未做。 |

> 维护约定：每次开发后更新本文件第 5、6 节（现状摘要与本次验证）；任务拆解与状态写入 [`plan/plan.md`](plan/plan.md)，完成情况与逐项证据写入 [`plan/implementation.md`](plan/implementation.md)。
