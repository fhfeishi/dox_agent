# PROJECT — dox_agent

- 最近核对：2026-09-22。
- 当前工作与计划见 [`ITERATION.md`](ITERATION.md)；关键取舍见 [`DECISIONS.md`](DECISIONS.md)。
- 本文是项目的长期稳定说明，自包含；详细任务状态与完成证据在 ITERATION。

## 1. 目标与范围

**目标**：面向国家自然科学基金、省重点/省重大、面上项目等科研项目历史报告的**本地、单用户** Agentic RAG 系统。基于本地报告语料提供带来源的专业问答、专项报告生成，以及本地目录浏览与 PDF 原文阅读。

**范围内**：
- 带 `[n]` 引用、支持多轮追问与有限补查的专业问答；
- 每个会话绑定一个任务（task1–4），任务决定 system prompt 与输出契约；
- 本地文档目录树、网页预览、引用跳页；
- 按模板生成专项报告（Markdown 预览/复制/下载）；
- 多知识库隔离、选择与按库问答，含知识库与库内文件的增删改查、上传导入与预览；
- 单用户本地部署（默认只监听 `127.0.0.1`）。

**范围外（首期不做）**：多租户/权限后台、多 Agent 协作、知识图谱、工作流画布、独立问题分类服务、材料遵循等级系统、自动全网研究、自动订阅同步、外部资讯抓取与科研头条、多模型路由与模型管理后台、模板管理平台、分布式任务队列。（`VITE_UI_NEWS`/`VITE_UI_MODELS` 等仅占位，不属首期交付。）

**关键限制**：
- 当前演示语料为 LangChain 技术文档（`.demo_langchain/`），**不是基金报告**；真实基金语料在 `.knowledge/自然科学基金/`，已按方案 A 接入库注册（侧栏可见），但尚未导入/验收。
- 未配置 `EMBEDDING_PATH` 时仅 BM25，不加载 embedding。
- HTTP 可用、检索就绪、模型可用是三个独立条件；健康接口不主动调用模型，`model_verified` 恒 `false`（模型可用性判定待定，见 ITERATION）。

## 2. 需求要点

**专业知识问答**
- 固定流程：解析专业问题 → 限定范围检索 → 阅读原文 → 必要时有限补查 → 带引用回答。
- 每条关键事实标注来源文件与页码，可直接打开原文；无资料/冲突/解析失败明确说明，不把"未检索到"说成"领域不存在"。
- 展示真实执行阶段，不展示或虚构内部推理；沿用搜索/模型调用/超时预算，不增加多 Agent 或工作流编辑器。
- 回答职责由用户显式选择的任务（task1–4）决定；本期不做自动意图分类。

**任务（task1–4）**
- `task1` 精准问答（先结论 + `[n]` 引用，不推测）、`task2` 对比分析（维度表 + 差异 + 可比性前提）、`task3` 趋势推测（事实/推断分段，限定样本）、`task4` 专项报告（按模板章节 + 范围/来源/局限）。
- 提示词归 `src/prompts/`（`base.md` 硬约束 + 各任务角色/输出契约 + 加载器）；未知 task id 抛 `UnknownTaskError`，不静默回退。
- task4 不在 `POST /api/chat` 生成正文，走报告入口（未实现）。
- 推导许可由任务提示词决定：task1/task2 收窄不推测，task3 放开并要求区分事实/推断。

**专项报告**
- 必填：研究领域、起止年份、模板；可选：基金/项目类别、指定文件、分析重点。
- 四模板：`achievements`/`hotspots`/`future_directions`/`comprehensive`；输出 Markdown，支持预览/复制/`.md` 下载。
- 时间口径按报告年份闭区间；同年份缺失资料不混入严格筛选；热点结论限定样本、按项目去重；事实、已实现应用、潜在应用、未来推断分开表达。

**本地文档窗口**
- 右上方"本地文档"入口 → 右侧滑出窗口：真实相对目录树（展开/折叠/筛选/入库状态）+ 预览（PDF 阅读器 / Markdown 渲染 / txt 纯文本）。
- 引用 `[n]` 可点击并定位物理页码；失效或版本变化明确提示。
- 浏览与限定检索范围是两个操作；浏览不改变范围，限定资料时显示已选文件。
- 文件接口仅允许配置根目录内的资料，按文档 ID 映射，防路径穿越。

**侧栏与文献库**：侧栏可收束为图标栏/展开为全宽并持久化，收束后核心入口与异常提示仍可达；提供"文献库"一级入口浏览已入库文档并打开预览。

**知识库管理与文件操作（部分已实现）**
- 一份独立语料 = `CORPORA_ROOT`（默认 `.knowledge`）下一个自包含目录，内含 `source/`（原始）+ `datadb/`（SQLite）+ `vectordb/`（向量），库之间隔离。
- 知识库 CRUD：新建、重命名、删除（默认只删派生数据；删源文件需显式确认）。
- 库内文件 CRUD：列表、上传（md/pdf/txt；docx 见 Word 支持）、删除、重命名/替换；`source/` 为唯一事实来源。
- 侧栏列出库（名称/份数/就绪状态）并可切换；库详情展示文档清单；基金库显示题目/负责人/项目编号/报告年份区间。
- 每个会话绑定一个库；输入区资料范围为两层：库（必选）+ 库内文档（可选，`allowed_doc_ids`）；切库清空越界选择并提示。
- 导入已增量（K1）：未变文件按 `size+mtime_ns` 跳过，必要时 `sha256` 兜底；源文件删除同步移除清单与 `docs`；清单为空为存量库首次回填（一次性）。OCR 三档 `off/force/auto`（K2，auto 仅对无文本页 OCR）+ liteparse `num_workers`（K3）+ 运行时 OCR 模式/语言配置（K4）。并发解析与两阶段导入进度仍待 K5。
- 预览支持 pdf（浏览器原生）/markdown（渲染）/word（转 HTML）/txt（纯文本）。
- 首期不做跨库联合检索、库内分区、多用户权限隔离。

**模型展示**：首期服务端固定单一模型并如实展示；多模型切换列为后续，需后端模型列表与请求级模型字段，未落地前前端不发送。

## 3. 当前结构与主流程

| 组件 | 职责 | 位置 |
|---|---|---|
| 启动 | 复用/创建 uv 环境、端口检查、启动 uvicorn | `launch.sh`、`src/launcher.py` |
| 后端 API | 生命周期、输入校验、后台准备、导入锁、SSE、静态资源 | `src/main.py` |
| 解析/导入 | 本地 txt/md/PDF（LiteParse）、官方 Markdown、网页快照 | `src/parsers.py`、`src/official_docs.py`、`src/prepare_docs.py` |
| 知识库 | SQLite 原文/版本、BM25Plus、行窗口、版本校验 | `src/knowledge.py`、`src/reading.py` |
| 检索融合 | 本地 embedding + Chroma、按签名隔离 collection、RRF | `src/dense.py` |
| Agent | `understand → research/direct → validate → answer`；证据交接与预算 | `src/agent/` |
| 任务提示词 | base + task1–4 + 加载器 | `src/prompts/` |
| 库注册 | 磁盘扫描 + `CORPORA` 覆盖；每库独立 `Knowledge` | `src/agent/corpora.py` |
| 工作区 | 会话/笔记持久化、revision、分支；工作区库固定在应用级 `STATE_DIR`，独立于活动语料（K0） | `src/workspace.py`、`frontend/src/workspace.ts` |
| 前端 | 会话/任务/资料/文档窗口/文献库/设置与状态 | `frontend/src/` |
| 本地数据 | 自包含库 `.knowledge/<库>/{source,datadb,vectordb}/`；演示 `.demo_langchain/` 同构 | 仓库 `README.md`、[`DECISIONS.md`](DECISIONS.md) |

**主流程**：浏览器 → `POST /api/chat`（SSE）→ 服务端按 `task_id`+`corpus_id`+资料范围检索、阅读、版本核验 → 事件流 → 前端渲染带 `[n]` 引用回答。

**关键失败与恢复**：知识库未就绪/失败 → 主界面可见提示、查证暂不可用；密钥未配置 → 不可发送并提示；流中断 → "已中断（结果未确认）"；保存 revision 冲突 → 409 且保留本地内容。

## 4. 行为契约

### 4.1 HTTP 接口

| 接口 | 说明 |
|---|---|
| `GET /api/health` | `status`/`app_id`/`model`/`docs_count`/`api_key_configured`/`model_verified(false)`/`web_provider`/`preparation`/`corpus_id`/`index_progress` |
| `GET /api/documents?corpus=` | 摘要数组（`pages` 为页数、不含正文）+ `rel_path`/`status`/`meta`（`meta` 占位 `{}`）；未初始化库返回空数组；未知库 404 |
| `GET /api/documents/{doc_id}` | 按 `page`/`start_line`/`version`/`section` 读取原文证据；可选 `corpus`（缺省默认库）；404/422 |
| `GET /api/documents/{doc_id}/file?version=` | 原始 PDF/Markdown/txt（FileResponse/Range）；可选 `corpus`（缺省默认库）；404/422/415/413(>200MB)；仅根目录内本地文件 |
| `GET /api/tasks` | 固定 task1–4：`id`/`name`/`description`/`has_template` |
| `GET\|PUT /api/ocr-config` | OCR 模式（`off`/`force`/`auto`）与语言（`eng`/`chi_sim`/`chi_sim+eng`）；写入口落 `STATE_DIR/ocr.json`，仅影响后续导入（K4） |
| `GET /api/corpora` | 库列表：`id`/`name`/`kind`/`domain`/`rel_path`/`docs_count`/`preparation`/`is_default`/`index_progress`/`job` |
| `POST /api/corpora` | 新建库目录（`source/`+`datadb/`+`vectordb/`）；201；重名 409、名称非法 422（K6） |
| `PATCH /api/corpora/{id}` | 仅改显示名（落 `STATE_DIR/corpora.json`）；目录与 `corpus_id` 不变（K6） |
| `DELETE /api/corpora/{id}?purge_source=` | 默认只删 `datadb/`/`vectordb/`；`purge_source=true` 才删 `source/`；默认库 409（K6） |
| `GET\|POST\|PATCH\|DELETE /api/corpora/{id}/files` | 库内源文件列表/上传/重命名/删除（md/pdf/txt；上传 201、非法类型 415、超限 413）（K7） |
| `POST /api/corpora/{id}/ingest` | 按库导入（限定库 root 内）；202 + job；404/409 |
| `POST /api/ingest/local`、`POST /api/ingest/text` | 本地导入 / 手工补正文；准备中 409 |
| `GET\|POST /api/official-docs` | 官方 Markdown 发现与批量更新（单进程内存任务） |
| `POST /api/web/preview`、`/api/web/confirm/{id}` | 网页快照预览与确认入库 |
| `POST /api/chat` | SSE 流式问答（见 4.2） |
| `GET\|PUT /api/workspace/{sessions\|notes}(/{key})` | 会话与笔记读写；409 revision 冲突、413 超 4MB、422 笔记来源非法 |
| `GET /{asset_path}` | 托管 `frontend/dist`；`api/` 前缀与越界 404 |

通用：JSON + SSE；请求模型 `extra="forbid"`，未声明字段返回 422。

### 4.2 `POST /api/chat`

请求：`messages`（1–20 条，每条 ≤12000，总 ≤40000，末条必须 user）、`allowed_doc_ids`（可空，非空 1–20）、`task_id`（默认 `task1`，仅 task1–3；task4/未知 422）、`corpus_id`（可选，缺省默认库；未知 404）、`run_id`（8–80）。禁止额外字段（含已移除的 `execution_mode`/`query_routing`/`evidence_level`）。

SSE 事件：`status`、`policy`（route/stop_reason/notice/allowed_doc_ids）、`step`、`telemetry`、`sources`（附服务端 `citation`，先于 token）、`token`、`usage`、`done`、`error`。无 `done` 的断流视为未完成；失败用 `error` 且不发送 `done`。

### 4.3 数据模型

- 知识库 SQLite `docs(id, version, payload)`：`id=sha256(origin)[:20]`，`version=sha256(pages JSON)[:20]`；引用携带 version，版本不符读取报错。
- 工作区 SQLite `records(id, kind, revision, payload)`：`kind ∈ {sessions, notes}`；会话 `data` 含 `turns`/`options`/`branches`/`task_id`/`corpus_id`；`BEGIN IMMEDIATE` 校验 revision（冲突 409），单记录 >4MB 413；笔记 `body`≤20000、`reviewed`、`sources` 1–6 条且版本可读。
- 阅读行号是规范化视图行号（超长行按 300 字符切段），非 PDF 原版排版行号；`section` 窗口按标题/代码围栏切块并返回 `heading`/`truncated`/`code_omitted`。

### 4.4 检索

SQLite 当前文档 → 页/行窗口 → BM25Plus sparse；配置 `EMBEDDING_PATH` 且未限定资料时并行 dense（Chroma 同步、按模型签名隔离 collection）→ 两路各取 `max(20, limit*3)` 候选 → RRF（等权，常数 60）→ 最终 limit 1–10 → 按来源分散。指定 `allowed_doc_ids` 时仅 BM25，不同步子集到共享 Chroma。

### 4.5 错误语义

422 请求校验/页行/版本；409 准备中写入、官方任务重入、revision 冲突、预览过期；413 记录超限/文件超限；404 文档/库不存在；415 文件类型不支持；流建立后失败走 SSE `error`。

## 5. 质量约束与验收

| 约束 | 可观察标准 | 验证入口 |
|---|---|---|
| 事实可追溯 | 关键结论带 `[n]` 且能打开原文 | 真实问答/报告抽查 |
| 有界执行 | 搜索/阅读/模型调用/超时在预算内 | `MAX_SEARCHES`/`MAX_READS`/`MAX_MODEL_CALLS`/`RUN_TIMEOUT` |
| 回归 | 后端 `pytest`、前端 `node --test`、`npm run build` 通过 | ITERATION 证据 |
| 语料隔离 | 引用仅来自当前库 | H10 验收 |
| 状态可辨认 | 未就绪/失败/停止/恢复在主界面可见 | 本项目需求要点（§2） |

**首期验收要点**：无分类/材料遵循/闲聊入口；目录与配置一致、中文名正常；引用定位物理页码；四类报告含范围/正文/来源/局限；范围外年份/年份缺失/重复项目不混入、不虚增；事实与推断正确区分；无匹配材料如实提示；中文扫描 PDF/复杂表格用真实样本检查。

## 6. 运行与验证

- 启动：`bash launch.sh`（复用环境 → 安装依赖 → 构建前端 → uvicorn）；默认 <http://127.0.0.1:8000>。
- 配置：`.env`（`MODEL_*`、`DATA_DIR`、`VECTORDB_DIR`、`STATE_DIR`、`KNOWLEDGE_ROOT`/`TEXT_ROOT`、`EMBEDDING_PATH`、`PDF_OCR_MODE`/`PDF_OCR_LANGUAGE`/`PDF_NUM_WORKERS`、`CORPORA*`、预算与超时）。
- 测试：`.venv/bin/python -m pytest tests -q`；`cd frontend && npm test`、`npm run build`。
- 本地数据布局与配置映射见仓库 `README.md`。
