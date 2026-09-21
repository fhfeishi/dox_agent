# dox_agent 当前开发情况

- 更新日期：2026-09-21
- 依据：本仓库已复制源码 `src/`、`frontend/`、`launch.sh`、`.env.example`。以下结论由实际阅读源码得出，历史记录不在本文件内（见 `archive/`）。
- 定位现状：本地单用户 Agentic RAG 文档问答。语料目前是 LangChain/LangGraph/Deep Agents 官方文档与本地文本/PDF，**尚未切换为科学基金历史报告**。
- 接口与实现设计：见 [`design/`](design/README.md)（[`HLD.md`](design/HLD.md) / [`API.md`](design/API.md) / [`LLD.md`](design/LLD.md)），由实际阅读源码整理。

## 1. 技术与运行

- 后端：Python 3.12、FastAPI、LangGraph、Deep Agents；SQLite 保存原文与版本；BM25Plus 稀疏检索；可选本地 HuggingFace embedding + Chroma，并与 BM25 做 RRF 融合。
- 前端：React 19 + TypeScript + Tailwind 4 + Vite 7；生产构建由 FastAPI 托管（`frontend/dist`）。
- 启动：`launch.sh` 复用/创建虚拟环境，依赖签名来自 `pyproject.toml`。
- **运行状态**：`pyproject.toml` 与 `tests/` 已补齐，`.venv` 已安装依赖（含 `web`/`embedding` extras），`launch.sh` 可完成安装与启动。后端运行与真实模型问答已完成端到端验证（见第 6 节）。
  - 本机以 CPU 后端安装 `torch==2.14.0+cpu`（`uv --torch-backend cpu`），避免默认 CUDA 栈。
  - 演示语料来自 `knowledge/lcdata`（157 份 LangChain/LangGraph/Deep Agents 官方文档 + 已构建的 Chroma 索引），`DATA_DIR` 指向该目录；启动即可问答。**尚未切换为科学基金报告**，切换后需重跑验收。
  - 问答已固定为带引用的专业模式（阶段 C 移除了意图分类与 `query_routing`/`evidence_level`/`execution_mode`）；未限定资料的问题也走检索并给出引用。
- 命名：`static1` → `dox-agent` 改名已完成（源码、配置、前端 dist）。

## 2. 已实现的后端接口

| 接口 | 说明 |
|---|---|
| `GET /api/health` | status、app_id（dox-agent）、model、docs_count、api_key_configured、preparation、index_progress |
| `GET /api/documents` | 文档摘要列表，`pages` 仅为页数、不含正文 |
| `GET /api/documents/{doc_id}` | 按 `page`/`start_line`/`version` 读取原文；`section=true` 走章节/代码块窗口 |
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
- 对话契约字段：`messages`、`run_id`、可选 `allowed_doc_ids`（1–20 份）；已移除 `execution_mode`/`query_routing`/`evidence_level`（阶段 C）。
- SSE 事件：`status`、`policy`、`step`、`telemetry`、`sources`、`token`、`usage`、`done`、`error`。
- 检索：BM25Plus；指定资料范围时只走 BM25（不同步子集到共享 Chroma）；可选 dense + RRF；结果按来源分散。

## 4. 已实现的前端能力

- 对话：流式回答、停止、重新生成、复制、步骤过程、耗时与 token 用量、错误提示。
- 会话：自动保存/恢复、切换、重命名、归档/恢复；会话栏按今天/昨天/更早分组、可搜索、当前高亮、悬停重命名/归档，未保存的新会话显式渲染不消失。编辑历史问题改为**会话内分支**（`branches.ts`，可查看/设为主时间线，字节配额裁剪，旧独立分支会话归并展示）不新建会话。
- 资料：输入区 `ScopeSelector` 资料范围多选（≤20 份）与筛选；入库/采集（本地导入、网页预览、补充正文、在线文档源）收进 `SettingsDrawer`；已入库文档可点击在共享 `DocumentPanel` 中预览规范化正文（Markdown/纯文本切换、跨页续读、元数据）。
- 信息架构：左栏仅会话管理；运维能力与导出/断开在设置抽屉（`role=dialog`、focus trap、Esc 关闭；关闭即卸载并停止轮询）。
- 空状态：任务导向示例（精准问答/对比/趋势），不含任何语料特定文案。
- 状态：左下角固定 `LLM: <model>` + 红/绿/黄状态灯 + 文字状态（颜色非唯一信号，tooltip 显示 health，点击打开设置抽屉）；长会话不顶走。断开/保存失败在主界面可见；设置抽屉标题栏为电源按钮（内联 SVG，断开后禁用）。
- 未挂载：`frontend/src/Notes.tsx` 已存在但未挂载到 `main.tsx`（文件头已标 experimental）。

## 5. 尚未实现（对照 `demand.md`）

- 科学基金报告语料与元数据（报告年份、领域标签、基金/项目类别、项目编号、解析状态）。
- 检索前的领域/年份过滤。
- 右侧本地文档目录树、原始 PDF/Markdown 文件服务、PDF.js 阅读窗口、引用跳页。
- 统一报告生成入口与四个模板（`achievements`/`hotspots`/`future_directions`/`comprehensive`）。
- 报告预览/复制/Markdown 下载。
- 任务系统：`task1`–`task4` 与会话绑定、`src/prompts/` 提示词目录、`GET /api/tasks`（设计见 [`plan/plan.md`](plan/plan.md) 的设计指南）。
- ChatGPT 式会话栏：`+` 任务选择、搜索、时间分组、任务徽标。

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

> 维护约定：每次开发后更新本文件第 5、6 节；任务拆解与完成记录写入 `plan/plan.md`。
