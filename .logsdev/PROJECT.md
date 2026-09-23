# PROJECT — dox_agent

- 最近核对：2026-09-23（知识研究工作台目标架构已规划；现有实现盘点与分期见 §9/ITERATION §16。W0 报告入口、KM-S5 隔离真实格式 API 链路、W1 检查器主对象与输出模板/执行摘要、W2 卡片快捷操作/知识库说明/资料搜索已实施；W0 提交封口、W3–W7、真实模型/OCR 仍待验）。
- 当前产品规划见 [`ITERATION.md`](ITERATION.md) §16；知识库收口见 §15；关键取舍见 [`DECISIONS.md`](DECISIONS.md)。
- **最新知识库契约（主干已实施并收口）**：不设默认库或首次确认；新对话自动选目录顺序首库，对话可选择 1–6 库；名称等于子目录名；显式刷新发现本地变化并增量入库，并显示当前库进度与失败库原因；总览卡片显示源文件/已入库/待处理/失败计数；新会话与所有发送入口显式发送 `corpus_ids`。KM-S1–S4 与 W0–W2 已实施并运行验证（全量 pytest、Node、构建、12 个离线浏览器脚本），KM-S5 真实格式小样本与真实模型/OCR 仍待验；实现与证据见 [`ITERATION.md`](ITERATION.md) §15.8 / §16.12 / §16.13。
- 本文是项目的长期稳定说明，自包含；详细任务状态与完成证据在 ITERATION。

## 1. 目标与范围

**目标**：面向国家自然科学基金、省重点/省重大、面上项目等科研项目历史报告的**本地、单用户** Agentic RAG 系统。基于本地报告语料提供带来源的专业问答、专项报告生成，以及本地目录浏览与 PDF 原文阅读。

**范围内**：
- 带 `[n]` 引用、支持多轮追问与有限补查的专业问答；
- 每个会话绑定一个任务（task1–4），任务决定 system prompt 与输出契约；
- 本地文档目录树、网页预览、引用跳页；
- 按模板生成专项报告（Markdown 预览/复制/下载）；
- 多知识库隔离、选择与按库问答，含知识库与库内文件的增删改查、上传导入与预览；
- 多知识库（≤6）会话/任务与跨库联合检索（KB-4，首期新增，取代原“不做跨库”）；
- 单用户本地部署（默认只监听 `127.0.0.1`）。

**范围外（首期不做）**：多租户/权限后台、多 Agent 协作、知识图谱、工作流画布、独立问题分类服务、材料遵循等级系统、自动全网研究、自动订阅同步、外部资讯抓取与科研头条、多模型路由与模型管理后台、模板管理平台、分布式任务队列。（`VITE_UI_NEWS`/`VITE_UI_MODELS` 等仅占位，不属首期交付。）

> 2026-09-23 修订（需求来源：用户提出的知识研究工作台目标，见 §9/ITERATION §16）：上列「**模板管理平台**」已被 §16 **W4（自定义任务/输出模板）与 W7（Prompt/Skill 产品化）分期承接**，不再是首期范围外；「**自动全网研究/外部资讯抓取**」由 §16 **W6** 以显式、受控、可追溯的方式承接（W6-B 受控搜索需真实使用证据触发，不自动联网）。其余条目仍为首期范围外。冲突时以 §9/§16 的分期与退出条件为准。

**关键限制**：
- 当前演示语料为 LangChain 技术文档（`.knowledge/demo_langchain/`），**不是基金报告**；真实基金语料在 `.knowledge/` 下多个库（如 `.knowledge/自然科学基金/`），已接入库注册（侧栏可见）：source **35 份** PDF；**K13 mineru 重建完成**（`docs=35`、`files=35`、`parser=mineru`、`parsed` 按 rel 全覆盖、mineru 已停），**L1 已重索引**（正文独立存储、版本含 markdown、备份 `knowledge.sqlite3.pre-l1`），正文可读、页码可定位。进度见 [`ITERATION.md`](ITERATION.md) §5。
- 未配置 `EMBEDDING_PATH` 时仅 BM25，不加载 embedding。
- HTTP 可用、检索就绪、模型可用是三个独立条件；健康接口不主动调用模型，`model_verified` 恒 `false`（模型可用性判定待定，见 ITERATION）。

## 2. 需求要点

**专业知识问答**
- 固定流程：解析专业问题 → 限定范围检索 → 阅读原文 → 必要时有限补查 → 带引用回答。
- 检索（计划 L）：搜索空间为报告 markdown；hybrid chunk 检索 → 选相关报告 → 全文 markdown（预算内）入上下文；事实引用绑定报告+页。
- 每条关键事实标注来源文件与页码，可直接打开原文；无资料/冲突/解析失败明确说明，不把"未检索到"说成"领域不存在"。
- 展示真实执行阶段，不展示或虚构内部推理；沿用搜索/模型调用/超时预算，不增加多 Agent 或工作流编辑器。
- 回答职责由用户显式选择的任务（task1–4）决定；本期不做自动意图分类。

**任务（task1–4）**
- `task1` 精准问答（先结论 + `[n]` 引用，不推测）、`task2` 对比分析（维度表 + 差异 + 可比性前提）、`task3` 趋势推测（事实/推断分段，限定样本）、`task4` 专项报告（按模板章节 + 范围/来源/局限）。
- 提示词归 `src/prompts/`（`base.md` 硬约束 + 各任务角色/输出契约 + 加载器）；未知 task id 抛 `UnknownTaskError`，不静默回退。
- task4 不在 `POST /api/chat` 生成正文，走报告入口；但**允许自由文本输入**（chat 只做报告参数采集 intake）。见 [`ITERATION.md`](ITERATION.md) §8。
- 推导许可由任务提示词决定：task1/task2 收窄不推测，task3 放开并要求区分事实/推断。
- **扩展（规划，非首期验收）**：task5 项目画像/task6 成果汇编/task7 领域综述/task8 可视化简报；两轴分离（意图 × 产出物输出参数）；首期仅 `.md` 导出，docx/pdf/图表延后。见 [`ITERATION.md`](ITERATION.md) §9。

**专项报告**
- 当前生成端点仅单 `corpus_id`；多库会话在报告卡片独立选择一个报告库，确认前不生成，不默认使用基础库。报告请求携带本轮选中且属于所选库的 `doc_ids`；会话检索集合保持原值。多库 intake 不从首库静默填领域，需明确填写。
- 必填：研究领域、起止年份、模板；可选：基金/项目类别、指定文件、分析重点。
- 四模板：`achievements`/`hotspots`/`future_directions`/`comprehensive`；输出 Markdown，支持预览/复制/`.md` 下载。
- 用户确认“报告年份”按填表日期年份（报告提交时间）解释。报告过滤从 MinerU Markdown 的显式 `填表日期` 与 `资助类别` 标签提取；日期缺失的文档排除并计数，类别指定时仅精确类别匹配。当前实现依赖解析文本；35/35 字段可见，3 份原 PDF 首页抽查吻合，但总体 OCR 误识别率未量化；文件名项目起止年份不参与报告年份筛选。热点结论限定样本、按项目去重；事实、已实现应用、潜在应用、未来推断分开表达。

**本地文档窗口**
- 右上方“本地文档”入口 → 右侧滑出窗口：真实相对目录树（展开/折叠/筛选/入库状态）+ 预览（PDF 直接展示原始文件 / Markdown 渲染 / Word 转 HTML（K9 目标，当前为纯文本）/ txt 纯文本）。预览面板**桌面约占视口 50% 宽、圆角居中**，窄屏为全屏抽屉；元信息显示解析器（旧 `liteparse` 会提示重导入为 mineru）。
- 引用 `[n]` 可点击并定位物理页码；失效或版本变化明确提示。
- 浏览与限定检索范围是两个操作；浏览不改变范围，限定资料时显示已选文件。
- 文件接口仅允许配置根目录内的资料，按文档 ID 映射，防路径穿越。

**侧栏与文献库**：侧栏可收束为图标栏/展开为全宽并持久化，收束后核心入口与异常提示仍可达；提供"文献库"一级入口浏览已入库文档并打开预览。

**知识库管理与文件操作（CRUD 已有；两阶段导入、批量上传交互与部分预览增强待收口）**
- 一份独立语料 = `CORPORA_ROOT`（默认 `.knowledge`）下一个自包含目录，内含 `source/`（原始）+ `datadb/`（SQLite）+ `vectordb/`（向量），库之间隔离。
- 知识库 CRUD：新建、重命名、删除（默认只删派生数据；删源文件需显式确认）。（K6 已实现）
- 库内文件 CRUD：列表、上传（md/pdf/txt（K7）、docx（K8））、删除、重命名/替换；`source/` 为唯一事实来源。
- 侧栏列出库（名称/份数/就绪状态）并可切换；库详情展示文档清单；基金库显示题目/负责人/项目编号/项目起止年份区间（文件名派生，best-effort；不能称报告年份）。
- 当前契约（已实施）：每个会话使用 1–6 个知识库，无基础库强制包含/首次确认门槛；新对话按实际子目录名固定升序选首个存在库，空库给添加资料入口、不静默跳库。有效旧会话保留范围，失效绑定提示修复。上传目标独立明确为单库。
- 名称始终取实际一级子目录名，旧 alias 不再覆盖；应用重命名同步目录/登记/来源并保留稳定 id。总览与详情显式刷新可发现目录和 `source/` 文件变化、增量入库并回读状态；不强制重解析、不猜测外部改名关系。临时 API、知识库离线浏览器（含 1→6 与第 7 个禁用）和一次隔离服务浏览器链路已有证据；任务/分支脚本已适配首库自动选择与 `corpus_ids`，总览状态计数与添加入口已收口（见 ITERATION §15.8）；真实 PDF/DOCX 解析组合与真实模型仍未验。
- 导入已增量（K1）：未变文件按 `size+mtime_ns` 跳过，必要时 `sha256` 兜底；源文件删除同步移除清单与 `docs`；清单为空为存量库首次回填（一次性）。**PDF 解析已改用 mineru（K13）**：`MINERU_CMD`（默认 `mineru-kit parse … --tier standard --ocr-mode auto --format zip`，一次产 markdown+middle_json）；产物缓存 `<KB>/parsed/<rel>/`，**正文/检索取自 `middle_json` 按页文本（`page_idx` → 页码）**，`markdown.md` 备渲染；预览服务源 PDF；txt/md/docx 仍直接解析。两阶段导入进度仍待 K5。
- 预览支持 pdf（浏览器原生）/markdown（渲染）/word（转 HTML）/txt（纯文本）。
- 首期不做**库内分区**、多用户权限隔离；跨库联合检索已作为 KB-4 **纳入首期**（见 §11.6）。
  - **2026-09-23 变更**：「多知识库（≤6）会话/任务」为用户需求，已纳入首期，**取代“首期不做跨库联合检索”**；契约（`corpus_ids` 1–6、跨库引用）见 [`ITERATION.md`](ITERATION.md) §11.6 与 §4.2。

**模型展示**：首期服务端固定单一模型并如实展示；多模型切换列为后续，需后端模型列表与请求级模型字段，未落地前前端不发送。

## 3. 当前结构与主流程

| 组件 | 职责 | 位置 |
|---|---|---|
| 启动 | 复用/创建 uv 环境、端口检查、启动 uvicorn | `launch.sh`、`src/launcher.py` |
| 后端 API | 生命周期、输入校验、后台准备、导入锁、SSE、静态资源 | `src/main.py` |
| 解析/导入 | PDF 走 **mineru**（`MINERU_CMD`；正文按页、页码 `page_idx`、预览源 PDF）；txt/md/docx（python-docx）；官方 Markdown、网页快照不变 | `src/parsers.py`、`src/official_docs.py`、`src/prepare_docs.py` |
| 知识库 | SQLite 原文/版本、BM25Plus、行窗口、版本校验 | `src/knowledge.py`、`src/reading.py` |
| 检索融合 | 本地 embedding + Chroma、按签名隔离 collection、RRF | `src/dense.py` |
| Agent | `understand → research/direct → validate → answer`；证据交接与预算 | `src/agent/` |
| 任务提示词 | base + task1–4 + 加载器 | `src/prompts/` |
| 库注册 | 磁盘扫描 + `CORPORA` 覆盖；每库独立 `Knowledge` | `src/agent/corpora.py` |
| 工作区 | 会话/笔记持久化、revision、分支；工作区库固定在应用级 `STATE_DIR`，独立于活动语料（K0） | `src/workspace.py`、`frontend/src/workspace.ts` |
| 前端 | 会话/任务/资料/文档窗口/文献库/设置与状态 | `frontend/src/` |
| 本地数据 | 自包含库 `.knowledge/<库>/{source,datadb,vectordb}/`；**§10 已实现**：应用状态与演示库均归入 `.knowledge/`（`.state/`、`demo_langchain/`），`data/` 与 `DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT`/`TEXT_ROOT` 已移除 | 仓库 `README.md`、[`DECISIONS.md`](DECISIONS.md) |

**主流程**：浏览器 → `POST /api/chat`（SSE）→ 服务端按 `task_id`+`corpus_ids`（1–6 库；兼容旧 `corpus_id`）+资料范围检索、阅读、版本核验 → 事件流 → 前端渲染带 `[n]` 引用回答。

**关键失败与恢复**：知识库未就绪/失败 → 主界面可见提示、查证暂不可用；密钥未配置 → 不可发送并提示；流中断 → "已中断（结果未确认）"；保存 revision 冲突 → 409 且保留本地内容。

## 4. 行为契约

### 4.1 HTTP 接口

| 接口 | 说明 |
|---|---|
| `GET /api/health` | `status`/`app_id`/`model`/`docs_count`/`api_key_configured`/`model_verified(false)`/`web_provider`/`preparation`/`corpus_id`/`index_progress` |
| `GET /api/documents?corpus=` | 摘要数组（`pages` 为页数、不含正文）+ `rel_path`/`status`/`meta`（`meta` 占位 `{}`）；未初始化库返回空数组；未知库 404 |
| `GET /api/documents/{doc_id}` | 按 `page`/`start_line`/`version`/`section` 读取原文证据；可选 `corpus`（缺省按首库兼容解析）；404/422 |
| `GET /api/documents/{doc_id}/file?version=` | 原始 PDF/Markdown/txt（FileResponse/Range，`Content-Disposition: inline` 供内联预览）；可选 `corpus`（缺省按首库兼容解析）；404/422/415/413(>200MB)；仅根目录内本地文件 |
| `GET /api/tasks` | 固定 task1–4：`id`/`name`/`description`/`output_hint`/`has_template`（兼容保留）/`templates`（新增）/`artifacts`（默认+允许集） |
| `GET /api/templates`、`GET /api/templates/{id}` | 内置输出模板只读目录与章节内容（`id`/`name`/`content`）；未知模板 404；章节仍以 `src/templates/*.md` 为唯一权威 |
| `POST /api/reports`、`GET /api/reports/{id}`、`GET /api/reports?session_key=`、`GET /api/reports/{id}/export?format=md` | 报告生成（retrieve→assemble→模板→LLM）/按 id 取/按会话列表/导出（首期仅 md）；参数 `session_key`/`run_id`（幂等）/`corpus_id`；无匹配 422 |
| `GET\|PUT /api/ocr-config` | ~~liteparse OCR 模式/语言~~ **已移除（K13：改用 mineru 自动识别）** |
| `GET /api/corpora` | 库列表：目录名派生 `name`、稳定 `id`、`kind`/`domain`/`description`/`rel_path`、missing/准备状态、源文件/已入库/待处理/失败计数和 job；读取不触发解析 |
| `POST /api/corpora` | 新建库目录（`source/`+`datadb/`+`vectordb/`）；201；重名 409、名称非法 422（K6） |
| `PATCH /api/corpora/{id}` | 应用内重命名：同步目录、登记与来源并保留稳定 `id`；忙碌、重名或回滚失败明确报错 |
| `PUT /api/corpora/{id}/description` | 编辑用户说明（与目录名分离，按稳定 id 持久化）；去空白、≤1000 字、空串清除；未知 404、目录缺失/导入中 409 |
| `DELETE /api/corpora/{id}?purge_source=` | 默认清理派生索引并保留源文件；`purge_source=true` 明确删除整个知识库及源文件；没有默认库特权 |
| `GET\|POST\|PATCH\|DELETE /api/corpora/{id}/files` | 库内源文件列表/上传/重命名/删除（md/pdf/txt/docx；上传 201、非法类型 415、超限 413）（K7/K8） |
| `POST /api/corpora/{id}/ingest?force=` | 按库导入（限定库 root 内）；`force=true` 绕过增量跳过、全部重解析（用于解析器/参数变更后重建，如 liteparse→mineru）；202 + job（含 `forced`）；404/409 |
| `GET\|PUT /api/corpora/{id}/ocr` | ~~按库 OCR 模式/语言~~ **已移除（K13：mineru 自动识别语言）**；`ingest?force=true` 保留用于切换解析器后重建 |
| `POST /api/ingest/local`、`POST /api/ingest/text` | 本地导入（txt/md/pdf/docx）/ 手工补正文；准备中 409 |
| `GET\|POST /api/official-docs` | 官方 Markdown 发现与批量更新（单进程内存任务） |
| `POST /api/web/preview`、`/api/web/confirm/{id}` | 网页快照预览与确认入库 |
| `POST /api/chat` | SSE 流式问答（见 4.2）；前端始终发送当前选中库的 `corpus_id`，保证浏览与回答同库 |
| `GET\|PUT /api/workspace/{sessions\|notes}(/{key})` | 会话与笔记读写；409 revision 冲突、413 超 4MB、422 笔记来源非法 |
| `GET /{asset_path}` | 托管 `frontend/dist`；`api/` 前缀与越界 404 |

通用：JSON + SSE；请求模型 `extra="forbid"`，未声明字段返回 422。

### 4.2 `POST /api/chat`

多库边界（已实施）：会话只维护 1–6 个检索库集合，取消 `base ∈ retrieval set` 前端约束。应用统一显式发送 `corpus_ids`；旧 `corpus_id` 接口兼容，二者仍不可同送。服务端直接 API 从未包含浏览基础库概念。旧缺省默认库逻辑已改为目录顺序首库，配置 `DEFAULT_CORPUS` 不再支配该选择。

请求：`messages`（1–20 条，每条 ≤12000，总 ≤40000，末条必须 user）、`allowed_doc_ids`（可空，非空 1–20）、`task_id`（默认 `task1`，`task1–4`；**task4 走 intake 分支、不生成正文**；未知 422）、`corpus_id`（可选，缺省默认库；未知 404）、`corpus_ids`（可选，1–6，**与 `corpus_id` 二选一**，同送 422；缺省默认库；KB-4）、`run_id`（8–80）。禁止额外字段（含已移除的 `execution_mode`/`query_routing`/`evidence_level`）。

SSE 事件：`status`、`policy`（route/stop_reason/notice/allowed_doc_ids）、`step`、`telemetry`、`sources`（附服务端 `citation`，先于 token）、`token`、`usage`、`done`、`error`。无 `done` 的断流视为未完成；失败用 `error` 且不发送 `done`。

### 4.3 数据模型

- 知识库 SQLite `docs(id, version, payload)`：`id=sha256(origin)[:20]`，`version=sha256(pages JSON)[:20]`；引用携带 version，版本不符读取报错。另含 `files(rel_path,size,mtime_ns,sha256,doc_id,status,updated_at)`（增量清单）与 `meta(key,value)`（**K12 残留、当前未使用**：K13 已移除按库 OCR，无调用者）。
- 工作区 SQLite `records(id, kind, revision, payload)`：`kind ∈ {sessions, notes}`；会话数据含 `turns`/`options`/`branches`/`task_id`/`corpus_id`，并已持久化 `corpus_confirmed`/`corpus_ids`；旧会话缺失新增字段时按安全回退规则恢复。报告表新增 `session_key`/`run_id`/`corpus_id` 的旧记录以空值表示未知来源，不得由 UI 推断为当前库。`BEGIN IMMEDIATE` 校验 revision（冲突 409），单记录 >4MB 413；笔记 `body`≤20000、`reviewed`、`sources` 1–6 条且版本可读。
- 阅读行号是规范化视图行号（超长行按 300 字符切段），非 PDF 原版排版行号；`section` 窗口按标题/代码围栏切块并返回 `heading`/`truncated`/`code_omitted`。

### 4.4 检索（L 阶段已实现）

报告级两级混合检索：搜索空间为报告解析后的 `middle_json` block 文本（带 `page_idx` 页号、分块前剥离 base64）。**Layer A 报告级召回**（`title`+heading+`project_no`/年份，BM25；报告数 ≤ `REPORT_RECALL_M` 全量）→ **Layer B 报告内 chunk 精排**（候选池内全局 RRF；每报告取 `PER_DOC_CAND` 候选，评分取 `PER_DOC_TOP_M`）。报告评分 = 每文档自身 top-m RRF 累计；按项目号去重；无匹配按 **chunk 语料 DF 泛词净化**（`GENERIC_DF_RATIO=0.35`）后的 `specific` 词覆盖率判定（`MIN_TERM_COVER` 全局 + `REL_COVER×top1` 逐文档，保底 `MIN_REPORTS`）。命中报告**全文**按 token 预算（`RETRIEVE_CONTEXT_TOKENS`/`REPORT_TOKENS`）装配入上下文，`[n]` 引用指向命中 chunk。

- 图：`understand → retrieve → assemble → validate → (retrieve|answer) → finish`（确定性，无 LLM search/read 工具循环；`validate` 在 `answer` 前，`validate_citations` 内联）。
- 检索为 **BM25-only**（`EMBEDDING_PATH` 空）；dense 留作增强。
- **参数**：`MIN/MAX_REPORTS`、`MIN_TERM_COVER`、`PER_DOC_TOP_M` 待评测校准；`REL_COVER`/`GENERIC_DF_RATIO` 固定默认。评测：`src/evaluate.py` + `tests/data/fund_retrieval.jsonl`（15 条，BM25-only：recall/MRR=1.00、no_match=0、ctx≈56k/69k、P50≈0.6s；样本饱和，待扩样）。
- 默认关/延后：MMR/覆盖贪心/字段权重/LLM 多查询/rerank/过滤下推（year/domain/project，依赖 H9/B2/B4/B5）。
- `Knowledge.search` 已委托 `retrieve`（单索引，旧窗口 BM25 删除）。

### 4.5 错误语义

422 请求校验/页行/版本；409 准备中写入、官方任务重入、revision 冲突、预览过期、同名冲突或已登记库目录缺失；413 记录超限/文件超限；404 文档/未知库不存在；415 文件类型不支持；流建立后失败走 SSE `error`。

已实现的 chat 缺失库响应为 HTTP 409、JSON `{"detail":{"missing":true,"corpus_id":"…","message":"…"}}`。前端按 `detail.missing === true` 分流，保留 corpus_id 引导重新选择，不回退默认库；不能把所有 409 当缺失库。其他 409 保留原 detail 字符串/对象与各自语义。

## 5. 质量约束与验收

| 约束 | 可观察标准 | 验证入口 |
|---|---|---|
| 事实可追溯 | 关键结论带 `[n]` 且能打开原文 | 真实问答/报告抽查 |
| 有界执行 | 搜索/阅读/模型调用/超时在预算内 | `MAX_SEARCHES`/`MAX_READS`/`MAX_MODEL_CALLS`/`RUN_TIMEOUT` |
| 回归 | 后端 `pytest`、前端 `node --test`、`npm run build` 通过 | ITERATION 证据 |
| 语料隔离 | 引用仅来自本轮选中的检索库与限定文档，且带来源库 | H10 验收 |
| 状态可辨认 | 未就绪/失败/停止/恢复在主界面可见 | 本项目需求要点（§2） |

**首期验收要点**：无分类/材料遵循/闲聊入口；目录与配置一致、中文名正常；引用定位物理页码；四类报告含范围/正文/来源/局限；范围外年份/年份缺失/重复项目不混入、不虚增；事实与推断正确区分；无匹配材料如实提示；中文扫描 PDF/复杂表格用真实样本检查。

## 6. 运行与验证

- 启动：`bash launch.sh`（复用环境 → 安装依赖 → 构建前端 → uvicorn）；默认 <http://127.0.0.1:8000>。
- 配置：`.env`（`MODEL_*`、`CORPORA_ROOT`、`DEFAULT_CORPUS`、`STATE_DIR`、`EMBEDDING_PATH`、`MINERU_CMD`/`MINERU_HOME`/`MINERU_TIMEOUT`、预算与超时）。
- 测试：`.venv/bin/python -m pytest tests -q`；`cd frontend && npm test`、`npm run build`。
- 本地数据布局与配置映射见仓库 `README.md`。


## 7. 上一阶段产品缺口与实施边界（2026-09-23，约束 §13–§15 收口批次）

本节记录知识库、报告准确性和任务最小体验的上一阶段收口边界，只约束 ITERATION §13–§15 的实施批次。它不限制已采纳的长期产品目标；当前目标、阶段依赖和非目标以 §9 与 ITERATION §16 为准。

基线 `8c40a0ac93c92eabe62885861564dd8ec5c5e271` 静态核对：多库检索与 missing/409 后端已存在，前端会话选库原为单库。2026-09-23 已在备份后通过本地 API 扫描完成真实 `corpora.json` 规范化并复读校验；上传同名保护/损坏文件保护与多库前端会话路径已补。上传失败状态和单项重试已通过离线浏览器检查，批量边界仍待验。任务开关默认 on，文档目录面板默认 off，不能沿用“全部默认关闭”的旧描述。

报告 PDF 的现存 MinerU Markdown 中观察到明确“资助类别”和“填表日期”字段：主基金库此前解析的 35 份分别为 35/35 可见；新解析边界下只读扫描 36 份 Markdown 为日期 36/36、类别 36/36 可见。另有“国家自然科学基金委员会制（年份）”字段，口径与填表年份不同。用户确认报告年份采用填表日期年份，报告生成按解析文本的填表日期区间和类别筛选，日期未知文档排除并计数。既有跨年份首页抽查外，新增 5 份覆盖四个主题目录、四种类别与 2024/2025/2026 填表年份的 PDF 首页视觉核对，10 个类别/年份字段均与 Markdown 一致；该小样本仍不能代表总体 OCR 准确率。抽样发现正文“类别：报告/墙报/科普”会与首页基金类别冲突，解析现限定到首个二级标题前并加了回归用例。文件名年份只表示项目起止年份，界面已改为明确标注。2026-09-23 实施者在备份 `corpora.json` 后执行本地 API 扫描：四个实际语料库名称与 alias 回读符合预期，磁盘记录已规范化为 id-keyed/alias；备份保存在 `.knowledge/.state/corpora.json.pre-alias-migration-20260923.bak`。上传同名保护、超限清理、新 Markdown 与解析失败状态有定向 API 场景；批量多选续传和失败项单独重试 UI 已在离线浏览器场景覆盖，详情见 ITERATION。PDF/Markdown/文本预览已有，DOCX 当前为提取文本；真实模型报告和真实服务浏览器联调仍待验。

该批次接续顺序：AC-01 同名/超限发布保护和 AC-08 真实迁移已有证据；批量多选、单项失败后续传、刷新回读和解析失败重试已通过离线浏览器验收。AC-07 的真实 API HEAD 200/422/404 与客户端 mock 提示分别通过隔离测试，尚未做实际运行服务的浏览器联调；AC-01 发布前取消、AC-04 真实多文件解析组合/拖拽和 AC-06 真实模型报告仍待验。V3 会话确认与多库范围、报告范围选择和填表日期/类别筛选已实施。详情见 [ITERATION §13](ITERATION.md#13-项目接续与验收)。当时只闭合“选资料→导入→问答→核对来源→生成报告”，不在 §13–§15 批次扩展新任务类型、导出格式或管理平台；这些后续目标现由 §9/ITERATION §16 分期承接。

跨库限定的有效契约：非空 allowed_doc_ids 是整个检索集合的白名单，各库与之求交，无交集不贡献资料；null/省略才表示所选库全部。ScopeSelector 聚合所有选中库并按库分组；unknown/跨库/重复归属拒绝限定。实施、迁移落盘与审核处置见 ITERATION §11.7/§13。

## 8. 任务模式（目标契约，首批 T-UX/T-STATE 已实现）

首期四模式：精准问答（事实核对）、对比分析（至少两对象并先核可比性）、趋势推测（事实/推断分开、限样本）、专项报告（intake 收参后生成 Markdown）。菜单应展示用途、适合问题与示例；默认值来源可见且可改。领域建议仅在单库时取该库可靠登记领域；多库不默认取第一库领域，使用用户问题或明确选择。task2/task3 的近五个完整自然年项目起止年份窗口目前只是界面建议，默认不得过滤或静默缩小检索范围；显式过滤须等服务端按项目区间重叠实现、显示范围计数并由用户开启。task1 默认不过滤时间。task4 报告提交年份按用户确认的填表日期年份筛选，值来自 MinerU 解析文本；36 份解析 Markdown 的日期/类别标签可见。现存 35 份基金源 PDF 首页类别和填表日期年份均逐份与 Markdown 核对一致（35/35）；同一字段 Wilson 95% 区间下界为 90.1%，不代表其他模板/扫描质量，AC-05b 仍是有限证据且总体未通过。报告头允许元数据前连续 H1 标题块，之后任意级别标题截止，无标题时最多读前 64 行。AC-12 同一行/同一 Markdown 表格行标签值有效，不传播跨行单元格。覆盖统计不证明 OCR 可信度。离线 Playwright 覆盖状态见 ITERATION §13.21–13.24。多库会话生成报告时须显式选一个库。

四个现有报告模板的章节职责、任务默认/澄清及验收见 [ITERATION §14](ITERATION.md#14-任务模式产品规划2026-09-23待实施)。首批 T-UX/T-STATE 已实现简洁任务菜单、用途/示例、当前任务与检索范围摘要、安全默认、旧会话恢复和阶段提示；仓库 Playwright 脚本已完成离线回归。长度/语言选项、完整任务参数 schema、prompt/模板大改留作后续增量。task2/task3 的五年窗口仅作建议，当前没有时间过滤。task4 日期/类别过滤行为的定向和全量测试通过；AC-12 字段解析、冲突处理和每库覆盖/未命中展示已通过定向测试与离线浏览器检查，但元数据总体可信度仍未通过产品阈值验收。AC-07 HEAD 预检实现与分层验证边界见 ITERATION §13.21–13.24。

## 9. 知识研究工作台目标架构（2026-09-23，规划已采纳；待分期实施）

长期产品定位扩展为本地优先的知识管理与研究推理工作台，核心闭环是“知识/受控网络资料 → 任务与 Skill → 可追溯执行 → 带引用回答/成果 → 修订复用”。当前基金报告场景仍是首个真实领域和验收语料，不据此假定通用任务、网络研究或 Skill 已经实现。

一级入口固定为**对话、知识库、任务、成果、Prompt / Skill**；右侧区域统一为跨入口检查器，不作为独立业务模块。知识库名称继续等于 `.knowledge/` 一级子目录名，没有全局默认库，新会话选目录顺序首库且可改为 1–6 库。上传始终落到一个明确目标库。

任务模板与输出模板分离。任务记录背景、目标、输入参数及可见默认值、资料/网络策略、执行约束、成果类型和版本；输出模板记录成果结构与格式。所有影响范围的默认值须在执行前可见并写入运行快照。task2/task3 不启用隐藏年份过滤；task4 可继续使用可见、可改的最近五个完整自然年填表日期默认。

成果是一级对象，报告只是成果类型之一。成果实施前先落最小 RunSnapshot，持久化服务端实际采用的任务标识、资料范围、资源策略、模型、时间、状态与可用指标；W4 再扩展不可变任务版本和完整默认来源，W6 再扩展网络快照。目标成果支持草稿/生成中/待审阅/完成/归档、来源运行和引用快照、Markdown 版本以及 DOCX 导出。现有 reports 先兼容呈现，再迁移到 Artifact；历史缺失字段显示“未记录”。执行过程展示检索、阅读、工具、生成和校验等可观察阶段，不展示或编造模型私有思维链。

网络资料默认关闭，按“仅知识库 / 指定网址 / 允许搜索”显式选择并保存快照。现有网页接口绑定首库且只保留最近一次预览，不能直接接 UI；先扩展为目标库/运行绑定、多预览隔离和持久快照，再做前端与搜索。Prompt 是指令资产，Skill 是包含输入、执行规则、Prompt、允许工具和输出契约的版本化能力包；两者共用入口但不混用模型。首版 Skill 不运行任意代码或安装第三方插件。

实施顺序为：封口当前会话报告与基线 → 统一五入口与右侧检查器 → 补知识库体验 → 最小运行快照 + 成果闭环 → 自定义任务/输出模板 → 完善对话 → 网页资源后端扩展 + URL/受控搜索 → Prompt/Skill。W0/W1 不宣称全局成果库；跨会话报告/成果从 W3 开始。详细对象、交互、阶段退出条件和现状矩阵以 [`ITERATION.md`](ITERATION.md) §16 为唯一执行依据。
