# ITERATION — dox_agent 当前工作

- 更新时间：2026-09-22。
- 长期说明见 [`PROJECT.md`](PROJECT.md)；关键取舍见 [`DECISIONS.md`](DECISIONS.md)。

## 1. 当前目标与必要约束

- 目标：正式基金语料接入前，完成可独立验证的工程与界面部分，并把"已完成"变为"默认可用"（浏览器验收 + 开关转 on）。
- 约束：
  - `ChatRequest` 为 `extra="forbid"`：后端未就绪字段不得发送（`task_id`、`corpus_id` 已就绪；`filters`、报告相关未就绪）。
  - 功能开关 `uiFlags.ts` 默认关闭；转 on 需同时满足"后端契约已实现 ∧ 浏览器实测通过"。
  - 不引入 PROJECT §1「范围外」项。

## 2. 计划与任务状态

**阶段总览**：A 🟡 · B ⬜ · C 🟡 · D 🟡 · E ⬜ · F ⬜ · G 🟡 · H 🟡 · U 🟡 · K 🟡（K0–K4、K6a、K6–K8、K12、K13 已实现；K5/K9–K11 待做；K2–K4/K12 的 liteparse OCR 部分被 K13 取代）。

**A 工程基线**：A1–A6 ✅（pyproject/extras、tests、端到端、改名、dev_logs 整理、design 落盘）；A7 契约同步 🟡（E 阶段待补）。

**B 语料与元数据**：B6 ✅（清理语料专属硬编码，改 `AUTO_IMPORT_OFFICIAL`/`WARMUP_QUERY`）；B1 基金入库、B2 元数据、B3 补录、B4 领域/年份过滤、B5 chat `filters` ⬜。

**C 问答收敛**：C1/C2/C3/C5 ✅（移除分类与策略字段、固定专业流程、保留 `allowed_doc_ids`）；C4 多轮/引用/失败说明 🟡。

**D 文档窗口**：D1–D5、D7–D9、D11 ✅；D6 🟡（**降级**：`pdfjs-dist` 未装，PDF 用浏览器原生渲染）；D10 页码三方一致性、D10b OCR/重排再校验 ⬜。

**E 专项报告**：E1–E7 ⬜（`POST /api/reports`、四模板、预览/下载、存储）。

**F 验收**：F1–F6、F8–F13 ⬜；F7 🟡（会话与流式基础已具备）。

**G 任务系统**：G1–G4、G7 ✅；G5 🟡（选择器/绑定/task4 阻断已实现，报告表单待 E）；G6 🟡；G8 任务输出验收、G9 报告入口 ⬜。

**H 知识库管理**：H1–H3（注册表/按库导入/`?corpus=`）✅；H5–H7（选择器/详情/按库文档）✅；**H4 ✅代码**（chat `corpus_id`、按库限定检索，提交 `e7d08e2`）、**H8 ✅默认启用并浏览器验收**（会话绑库；已移除 `VITE_UI_CORPUS`，选中语料随 chat 发送以保证浏览与回答同库），真实语料验收见 §3；H9 文件名元数据入服务端、H10 真实报告验收 ⬜。

**K 知识库管理与导入优化**：K0（应用级会话库）、K0b（多库 read/file 补 `corpus`）、K1（增量导入 + 文件清单 + 删除同步）、K6a（`corpus_id` 单射+限长）、K6（库新建/显示名重命名/删除）、K7（库内文件列表/上传/重命名/删除）、K8（Word/.docx）、**K13（mineru 解析 + 外部 `MINERU_CMD` + `parsed/` 缓存，取代 liteparse 及其 OCR 配置；保留 K12 的 `force` 重导入）✅**；K5（两阶段导入+进度/取消，规格 §6.7）、K9（按 kind 预览，§6.8）、K10（检索缓存，§6.9）、K11 验收 ⬜。K2/K3/K4/K12 的 OCR 模式/语言部分已作废。

**U UI 优化**：U0、U4.1a/U4.1b/U4.2、U5（会话内分支）、U6（电源按钮）、U7（知识库预览）、U8（LLM 状态）、U9.1（侧栏收束）、U9.2/U9.2b（文献库）、U9.4-1（只读模型）✅；U9.3 科研头条 🟡（仅占位）；U1（任务 UI）、U2（文档面板/引用跳转）🟡（代码完成、开关默认 off、浏览器验收未做）；U3 报告入口、U9.4-2 模型选择器 ⬜。

**功能开关**：`VITE_UI_TASKS/FILTERS/DOC_PANEL/REPORTS/NEWS/MODELS` 均已建立、默认 off。启用策略：后端契约已实现 ∧ 浏览器实测通过。`VITE_UI_CORPUS` 已移除：`corpus_id` 后端已实现并验收，选中语料始终随 chat 发送。

## 3. 已完成与证据

| 项 | 内容 | 提交/证据 |
|---|---|---|
| 工程基线 | pyproject + extras；tests 恢复；端到端启动与真实问答 | 历史提交；`pytest` 基线 |
| C 收敛 | 移除 `query_routing`/`evidence_level`/`execution_mode`；health 无 `defaults`；旧字段 422 | `0ff1480`；`pytest` 64 passed |
| B6/G1–G4/D1–D3/H1–H3 | 语料硬编码清理、任务提示词与 `GET /api/tasks`、chat `task_id`、文档增量与 `/file`、库注册 | `761c96d` |
| U0/U4.1a/U4.2 | 左栏收敛、设置抽屉、会话栏、`useDocuments`、phase C 清理、`node --test` | `72fde7a`；12 passed；浏览器脚本 PASS |
| U5 | 会话内分支（`branches.ts` + 测试），编辑并重问不新增会话 | `9a0c899`；15 passed；`browser_session_branches.py` PASS |
| U6/U7/U8 | 电源按钮、知识库正文预览（跨页续读）、LLM 状态灯 | `ce3b4e7`；浏览器脚本 PASS |
| U1/U2/U9/D11/H5–H7 | 任务选择器、文档面板与引用跳转、侧栏收束/文献库、挤压式侧栏、库选择/详情/按库文档 | `e400279`；18 passed；tsc 无新错误 |
| H4/H8 | 按库问答契约与会话绑库 | `e7d08e2`/`67d0ff0`；**浏览器验收**：`tests/browser_fund_preview.py` PASS（选基金库→文档列表重定域→chat 请求携带 `corpus_id`） |
| 布局对齐 | 开发文档 `.logsdev/`；演示语料 `.demo_langchain/`；`VECTORDB_DIR` | `703d286`/`02cbcd9`；`pytest` 64 passed、路径解析验证 |
| 方案 A 自包含库 | `.knowledge/<库>/{source,datadb,vectordb}`；演示库同构；`corpora.py` 按 role 目录扫描并把库内 `datadb/`/`vectordb/` 作为派生路径 | `c8ecef8`；当时基线 `pytest` 68 passed（新增 `tests/test_corpora.py` 4 例）；端到端导入派生落 `<库>/datadb/knowledge.sqlite3` |
| K0/K0b/K1（提交 `9075895`） | 应用级会话库（`state_dir` + 一次性迁移）；read/file 按 `corpus`；增量导入 + 文件清单 + 删除同步；前端传递 `corpus` | 当时基线 `pytest` 75 passed；`tests/test_corpora_state.py`、`tests/test_incremental_import.py`；`npm run build` + `node --test` 18 passed；实机默认演示库二次导入 `added=0/skipped=1`、删探针 `deleted=1` 且不再出现在 `/api/documents` |
| K2/K3/K4（提交 `4483408`） | OCR 三档（off/force/auto，auto 仅对无文本页 OCR）；liteparse `num_workers`；OCR 模式/语言运行时配置（`GET/PUT /api/ocr-config`，落 `STATE_DIR/ocr.json`） + 设置入口 | `pytest` 80 passed（新增 `tests/test_parsers_ocr.py` 4 例、OCR 配置持久化 1 例）；`npm run build` 通过；默认 `PDF_OCR_MODE=auto`、`PDF_OCR_LANGUAGE=chi_sim+eng` |
| K6a/K6/K7（提交 `b443623`） | `corpus_id_for` 单射+限长；知识库新建/显示名重命名/删除（默认只删派生，`purge_source` 才删源）；库内文件列表/上传（`python-multipart` 流式、200MB 上限、名称规范化）/重命名/删除；前端 `CorpusAdmin`+`CorpusFiles` | `pytest` 83 passed（新增 K6a/K6/K7 共 4 例）；`npm run build` + `node --test` 18 passed；实机 httpx：创建→上传 `added=1`→列表 `indexed`→重命名→删文件→删库均成功 |
| K8（提交 `0615ef9`） | Word `.docx` 解析（`python-docx`，段落+表格入正文）；`SOURCE_SUFFIXES` 与上传白名单加入 `.docx` | `pytest` 84 passed（新增 `tests/test_docx.py`）；`npm run build` 通过 |
| K12（本轮） | 按库 OCR：`Knowledge.meta`（`ocr_mode`/`ocr_language`/`ocr_applied_*`）；`GET/PUT /api/corpora/{id}/ocr`；`ingest?force=`（`stale` 自动强制，job `forced`）；`GET /api/corpora` 增 `ocr_stale`；前端 `CorpusOcrSettings`（侧栏每库可展开） | `pytest` 86 passed（新增 `tests/test_corpus_ocr.py`、force 重解析例）；实机 httpx：PUT `eng`→`stale=true`→ingest `forced=true`→`stale=false`；再 ingest `forced=false, skipped=1` |
| 预览原文件/引用跳页修复（提交 `02d8c1e`/`6849250`；本轮修复） | `/file` 改 `Content-Disposition: inline`（原为 `attachment`，iframe 不会内联渲染）；**引用 `[n]` 实际未生效**：`Answer` 计算了 `rehypePlugins`/`components` 却未传给 `<Markdown>`，且 `rehypeCitations` 返回的是 transformer 而非 `options => transformer`；现已接通，`[n]` 为可点按钮、超范围数字保持字面、代码块不误匹配 | `npm run build` + `node --test` 18 passed；`tests/browser_fund_preview.py` PASS（基金库 PDF 内联渲染 + `[1]` 跳第 3 页 + chat 携带 `corpus_id`） |
| mineru 4.0.5 试用（2026-09-22，本地实测） | 独立 venv 安装 `mineru==4.0.5`（无 torch）；`mineru-kit parse <pdf> -o <out> --tier basic --ocr-mode auto` 成功；`--format markdown` → 单 `.md`（图片 base64、无页标记），`--format middle_json` → 单 `.json`（`pages[].page_idx`+blocks）；v4 不产出经典 `<uuid>_origin.pdf`/`images/`；`temp/` 为经典版产物 | 最小基金 PDF 1–2 页约 6s（首次拉模型约 1 分钟）；**未接入 dox_agent 代码**（仅试用） |
| K13 mineru 适配器（提交 `c2d04b2`） | `parsers.py`：`read_mineru_output` 支持 v4 `middle.json`/经典 `content_list.json`（`page_idx` → 页码，回退 markdown 单页）；`parse_pdf_pages` 跑 `MINERU_CMD`（模板 `{pdf}`/`{out}`，`MINERU_HOME`/超时）；产缓存 `<KB>/parsed/<rel>/`；移除 liteparse 与 `/api/ocr-config`、`/api/corpora/{id}/ocr`、前端 `OcrSettings`/`CorpusOcrSettings`，保留 `ingest?force=true`（侧栏“重导入”） | `pytest` 85 passed（新增 `tests/test_mineru.py` 6 例）；`npm run build` + `node --test` 18 passed；**真实 `temp/` 样例读取验证**：45 页可读中文、页码 1..45 |
| 预览面板放大 + 解析信息（本轮） | `DocumentPanel` 桌面改为 **50vw（min 34rem / max min(60rem,90vw)）、`m-4` 垂直居中、圆角**（窄屏仍全屏遮罩）；新增 `documentMeta.ts` 统一元信息（rel_path/kind/parser/版本/采集）与 `parserLabel()`；旧 `liteparse` 解析显示“旧解析，建议重导入为 mineru” | `npm run build` + `node --test` 18 passed |
| K13 实机 pilot（本轮） | mineru 4.0.5 已装 `.venv`；修复超时：`start_new_session`+`killpg` 杀整进程组、`MINERU_TIMEOUT` 默认 3600；最小基金 PDF（6 页）`standard` >900s 超时、`basic` **96.7s** 且中文可读、页码正确 | 基金库 `force` 全量重建运行中（`basic`，34 份）；完成后回写正文可读/页码与 H10 |
| K13 加固（B1/B2/B3，本轮） | PATH 注入（`Path(sys.executable).parent` 进子进程 `PATH`）；`pyproject` 加 `mineru>=4.0,<5`；默认 `--format zip`（markdown+middle_json 一次产出）；`_block_text` 递归展平修复嵌套 content 的列表 repr 泄漏 | `pytest` 85 passed；`read_mineru_output` 对 zip 实测：自动解包、页文本干净（无 `[{...}]`） |

当前可用基线（本次实测）：后端 `pytest tests -q` → **85 passed**；前端 `node --test` → **18 passed**；`npm run build` 通过。

## 4. 待定设计

| # | 问题 | 影响 |
|---|---|---|
| 10 | 报告↔会话绑定：`POST /api/reports` 无 `session_key`/`run_id`，`GET /api/reports/{id}` 只按 id 取 | E1/E2/G9（E 开工前须定稿） |
| 11 | task 推导许可与全局 `answer_policy`：已定稿（task1/task2 收窄、task3 放开并标注），随任务提示词落实 | G1/G4（已落实，保留备查） |
| 12 | 模型可用性判定来源：`/api/health` 的 `model_verified` 恒 `false`，无生产逻辑 | U9.4-2/F11（未定稿前不开工） |
| 13 | **已定稿**：mineru `tier=standard` | K13 |
| 14 | **已定稿**：正文用 **markdown**；页码取 `middle_json` 的 `page_idx` | K13 |
| 15 | **已定稿**：正文图片首期**不渲染**（预览服务源 PDF；markdown 渲染留待后续） | K13 |
| 16 | mineru 集成方式：**已定：本地 CLI `MINERU_CMD`**（模板含 `{pdf}`/`{out}`，`MINERU_HOME` 缓存）；云端 API（`MINERU_API_KEY`）未接入 | K13 |

## 5. 未决问题与下一步

> 当前唯一优先：**K13 基金库重建 → H10**（先 pilot 1–2 份确认中文/页码/耗时，再 `force` 全量 34 份）；其余按 §6.4 顺序。

| 未决 | 影响 | 下一步 |
|---|---|---|
| U2 文档面板（`VITE_UI_DOC_PANEL`）浏览器验收未做 | U2 未转 on | 浏览器验收通过后转 on；当前默认路径已可直接预览 PDF/渲染正文（本轮已验收） |
| D10 页码三方一致性未校验；U2 浏览器验收未做 | 引用跳页可信度 | 补 D10 回归 + U2 浏览器验收 |
| D6 `pdfjs-dist` 未装（Windows×WSL 符号链接冲突） | PDF 缩放受限 | 换装后仅替换 `PdfViewer` 内部实现 |
| B2/B4/B5 基金元数据与领域/年份过滤未做 | 报告与过滤缺依据 | 先 H9（文件名元数据入服务端）→ B2/B4/B5 |
| E 报告入口未做；#10 未决 | task4/U3/G9 无法开工 | 定稿 #10 → 实现 E1/E2 |
| #12 模型可用性判定缺失 | F11/U9.4-2 不可验收 | 定 health 探测口径或新增轻量探测接口 |
| 基金库 `.knowledge/自然科学基金/`：source/**34 份** PDF；旧解析（liteparse/eng）`docs=10` 乱码；**K13 `force` 全量重建运行中（basic）** | 预览/问答可读性 | 重建完成后校对 docs 份数/正文/页码 → 做 H10 |
| H10 真实基金报告端到端验收未做 | 基金场景未验证 | 以真实报告走「选库 → 浏览 → 预览 → 按库问答」 |
| 按 kind 预览、两阶段导入进度、检索缓存未做 | 文件能力不完整、导入不可观测、大库变慢 | K5（§6.7）/K9（§6.8）/K10（§6.9） |

## 6. K 阶段规划：知识库管理、解析优化与预览（2026-09-22，规划中）

### 6.1 根因分析（优化前历史，K2/K3/K4 已解决）

> 以下为**优化前**的代码核对结论；相关项已由 K2/K3/K4 解决，保留用于解释设计动因，**不得当作现状依据**。

- **慢点不在 SQLite**：`Knowledge.put` 单条 `INSERT OR REPLACE`。（仍然成立）
- ~~OCR 常开~~：旧 `parse_file` 固定 `ocr_enabled=settings.pdf_ocr`；**已由 K2 改为三档 `off/force/auto`（`parse_pdf_pages`），K4 改为运行时配置。**
- ~~全量重解析~~：旧 `import_defaults` 逐个解析、无跳过；**已由 K1 增量清单解决。**
- ~~解析串行~~：旧单次 `to_thread`；**已由 K3 `num_workers` 并发。**
- ~~向量延后阻塞查询~~：`DenseIndex._search` 首次才建；**待 K5 两阶段导入解决（未做）。**
- ~~查询期重复计算~~：`Knowledge.search` 每查询重建窗口与 BM25；**待 K10 缓存解决（未做）。**
- 非默认库并非“仅 BM25”：`knowledge_for` 设 `vectordb_dir`，`EMBEDDING_PATH` 非空时同样建 dense。

### 6.2 目标布局（方案 A，扫描已实施）

```
.knowledge/<KB>/
├── source/        # 原始文件（唯一事实来源，可含子目录）
├── datadb/        # knowledge.sqlite3（解析文本/版本/文件清单）
└── vectordb/      # Chroma 索引
```
`CORPORA_ROOT=.knowledge`；每个直接子目录 = 一个自包含库。当前活动库的 `DATA_DIR=<KB>/datadb`、`VECTORDB_DIR=<KB>/vectordb`；演示库 `.demo_langchain/{source,datadb,vectordb}` 同构。

### 6.3 任务

> 进度：K0、K0b、K1、K2、K3、K4、K6a、K6、K7、K8、K12、K13 **已完成**（提交：K0/K0b/K1=`9075895`、K2/K3/K4=`4483408`、K6a/K6/K7=`b443623`、K8=`0615ef9`、K12 前轮、K13 本轮；测试见 §3）；K5、K9–K11 未开始。**K13（mineru）已实现；K2/K3/K4/K12 的 OCR 模式/语言部分已作废**。

| 编号 | 任务 | 验收 |
|---|---|---|
| **K0（前置）** | 应用级会话库：把 `workspace.sqlite3` 从活动库 `<KB>/datadb/`（`main.py:91`）迁到固定应用级目录，`app.state.workspace` 独立于语料；未完成前**不开放库删除/重命名** | 删除/切换默认库不影响会话与笔记；旧库目录不再存 `workspace.sqlite3` |
| **K0b（前置）** | 多库读取补 `corpus`：`GET /api/documents/{doc_id}`（`main.py:312`）与 `/file`（`main.py:266`）当前只用默认库，非默认库 404；补可选 `corpus`（或按 doc_id 跨库定位） | 切到非默认库后引用跳页/原文预览可用；修复既有 U2/U7 缺口 |
| K1 | 增量导入与删除同步：`<KB>/datadb` 增 `files(rel_path,size,mtime_ns,sha256,doc_id,status,updated_at)` 清单；未变跳过；新增/变更重解析；源文件删除→标记移除，且**同时从 BM25 与 dense 排除**；**存量库首次回填清单为一次性成本**（清单为空视为全新，全量重解析） | 二次导入近零解析；删除后文档不出现在检索与引用；报告含 added/updated/skipped/deleted/errors；回填成本与稳态可区分 |
| K2 | 解析管线确认：**固定使用 liteparse**（不引入 mineru）；OCR 提供三档开关：`off`（仅文本层）/ `force`（强制 OCR）/ `auto`（先提文本，仅无文本页再 OCR），由库设置选择 | 三档可用；有文本层 PDF 选 `off`/`auto` 不再全量 OCR |
| K3 | 解析性能：并发解析（liteparse `num_workers`/`pool_size` 或线程池）、大文件分段；未变文件跳过由 K1 负责 | 多文件并行解析；有文本层 PDF 不触发 OCR |
| K4 | OCR/语言运行时配置：后端读取/更新接口 + 前端设置入口（`eng`/`chi_sim`/`chi_sim+eng`）；语义“仅影响后续导入”，需重导入才生效 | 不改 `.env` 重启即可调整；中文默认 `chi_sim+eng` |
| K5 | 两阶段导入 + 进度/取消：先解析入库（BM25 可检索）→ 后台建向量；任务含 phase/stage/计数/错误，可轮询与取消 | 导入结束即可问答；向量进度独立；可取消 |
| K6 | 知识库 CRUD：新建；**重命名拆分为**（a）显示名（`CORPORA` override 的 `name`，不动目录）与（b）目录搬迁（单列 K6b）；删除默认只删 `datadb/`/`vectordb/`，`?purge_source=true` 才删 `source/`；PATCH/DELETE 后**重扫并重载活动库** `knowledge`/`dense` | 显示名与目录名分离；删除/重载后侧栏与检索一致；重名拒绝 |
| K6a | **corpus_id 稳定性**：`corpus_id_for`（`corpora.py:46`）把 `/`、空格换成 `-` 非单射且未限长；改为单射+限长（如 `slug + sha1(rel)[:8]`，总长 ≤120 对齐 `ChatRequest.corpus_id`）；重命名默认库先走 `CORPORA` 显示名，不改目录 | 不再撞库；超长名可用；重命名默认库不改已绑定会话的库标识 |
| K6b | 目录搬迁与 id/doc_id 迁移（**待定，随 K6 评估**）：`corpus_id`（`corpora.py:46`）与 `doc_id=sha256(origin)`（`parsers.py:32`/`knowledge.py:69`）随路径变化失效；需给出迁移或失效处理（含 H8 会话 `corpus_id`、`allowed_doc_ids`、历史 `sources.doc_id`） | 搬迁后既有会话不指向不存在的库/文档；否则 UI 明确提示失效 |
| K7 | 文件 CRUD：`GET/POST(上传)/DELETE/PATCH /api/corpora/{id}/files`；**本阶段含 md/pdf/txt，docx 由 K8 加入**。上传口径：multipart、流式落盘、单文件上限（与 `MAX_PREVIEW_BYTES` 200MB 对齐或单列）、单库配额、文件名规范化、路径穿越防护；并发导入走 `import_lock` | 上传/删除/改名/替换后清单与检索一致；越限/非法名被拒 |
| K8 | Word 支持：`.docx` 解析（默认 `python-docx`，离线轻量）入 `datadb`；**同时改 `parse_file`（`parsers.py:14-35`）与 `SOURCE_SUFFIXES`（`corpora.py:20`）**，否则含 docx 的库不会被扫描成库 | `.docx` 可入库、可检索、可预览 |
| K9 | 预览：`GET /api/documents/{doc_id}/preview`（**带 `corpus` 参数**，与列表接口一致）按 kind 返回 html/text/file；统一 `DocumentPanel`：pdf 原生（D6）、md 渲染、docx 转 HTML、txt 纯文本 | 四类文件可预览并显示元数据 |
| K10 | 检索性能：**范围含每查询的 `self.all()` + 窗口切分 + `tokens()` + `BM25Plus(corpus)`**（`knowledge.py:104-126`），不止 chunk id；需预计算/缓存候选与 BM25，或明确调低验收口径；**存量库首次回填缓存同 K1 为一次性成本** | 大库查询延迟不随库线性增长（或按调低口径验收） |
| K11 | 验收：文件/库 CRUD、预览、重命名/删除、按库问答仅本库引用；以一次真实导入抽样计时（不做对比测试） | 功能通过 |
| K12 | **按库 OCR 语言对齐与重导入（侧栏优先）**（实现规格见 §6.5）：入口放在**左侧边栏知识库展开项**（`CorpusPicker`/`CorpusAdmin`）：每个库可选 OCR 模式/语言 + 「重新导入并应用」；库详情（`LibraryView`）复用同一操作（可选）。OCR 模式/语言按库存储（`<KB>/datadb` 的 `meta`），生效值 = 库配置 ?? 全局；`files` 清单记录 `used language/mode`，不一致标 `ocr_stale`；「重新导入」必须走 `POST /api/corpora/{id}/ingest?force=true`（绕过 size+mtime 跳过、全部重解析），并提示“重解析全部文件、版本会变化”；对中文库建议 `chi_sim+eng`（可选） | 侧栏展开库 → 选 `chi_sim+eng` → 重新导入 → 预览文本可读、`ocr_stale=false`；未改语言时未变文件仍跳过（不会白重解析） |
| K13 | **改用 mineru 4.0.5 解析（取代 liteparse）**（规格见 §6.6）：PDF 走 `mineru-kit parse --tier standard --ocr-mode auto`；入库取 **markdown**、页码取 `middle_json`、预览服务源 PDF；移除 liteparse 及其 OCR 配置；`force` 重新导入重建 | 基金库 PDF 以 mineru 入库、正文可读、页码可定位、预览源 PDF；未变文件二次导入跳过；移除 liteparse 后构建/测试通过 |

### 6.4 顺序与依赖

- **K0 必须先于 K6（库删除/重命名）**；**K6a（corpus_id 稳定性）先于 K6 的目录搬迁**。
- **K0b（非默认库 read/file 补 `corpus`）先于 K7/K9 的多库预览**；它是既有 U2/U7 缺口的修复。
- **K2/K3/K4/K12 的 liteparse OCR 部分已作废（被 K13 取代）；仅保留 K12 的 `force` 重导入机制**。
- **K8（Word）先于 K7 的 docx 支持**；K7 本阶段不含 docx。
- K1 的删除同步必须同时清 BM25 与 dense（stale）；**K1/K10 对存量库有一次性回填成本**，不计入优化后稳态。
- K6/K7 的写操作需重扫并重载活动库。
- **K12（按库 OCR 语言 + 强制重导入）依赖 K1 清单与 K4 配置；修复“改语言后重新导入不生效”**。（已被 K13 取代：mineru auto 自行识别语言，不再选语言；保留 force 重导入）
- **K13（mineru 4.0.5）先于基金库重导入与 H10**。
- 建议顺序：**K0 → K0b → K1 → K13 → K5 → K6a → K6 → K7 → K8 → K9 → K10 → K11**（K3 的 liteparse 并发随 K13 一并移除；K6b 随 K6/K6a 定）。
- 与既有任务的关系：K 是 H9/B2/B4/B5（元数据/过滤）与 H10（真实报告验收）的前置；完成后更新 H10 验收与 PROJECT 现状。

### 6.5 K12 实现规格（按库 OCR 语言 + 强制重导入）

> 状态：**已实现**（提交/证据见 §2/§3）；**但 OCR 语言部分已被 K13（mineru）取代**，仅保留“`force` 重新导入”机制。以下为规格备查。

**后端**
- `Knowledge`（`src/knowledge.py`）新增 `meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`；方法 `meta_all()/meta_get()/meta_set()`。
- 库级键：`ocr_mode`、`ocr_language`（期望值），`ocr_applied_mode`、`ocr_applied_language`（上次成功导入实际使用）；`ocr_stale = 期望存在且 ≠ applied`；`applied` 为空且有文档时给 `ocr_unknown=true` 提示（不阻塞）。
- `import_defaults(knowledge, settings, *, root, exclude, force=False)`（`parsers.py`）：`force=True` 时忽略 `size+mtime/sha256` 跳过，全部重解析（仍更新清单元数据）。
- 导入生效配置：`settings.model_copy(update={"pdf_ocr_mode": 期望mode, "pdf_ocr_language": 期望language})`。
- 接口：
  - `GET /api/corpora/{id}/ocr` → `{mode, language, modes, languages, applied_mode, applied_language, stale, unknown}`（期望值缺省回落全局 `Settings`）；未知库 404。
  - `PUT /api/corpora/{id}/ocr` body `{mode, language}` → 校验 `OCR_MODES`/`OCR_LANGUAGES` 后写库 `meta`；**不自动导入**；返回同上；非法 422。
  - `POST /api/corpora/{id}/ingest?force=true` → 传 `force`；**若 `stale` 则服务端自动按 `force` 处理**（避免“点了没反应”），job 增 `forced: bool`；成功后写 `ocr_applied_*`。
  - `GET /api/corpora` 的 `corpus_payload` 增 `ocr_stale`（列表徽标用）。

**前端**
- `api.ts`：`CorpusInfo` 增 `ocr_stale?`；新增 `fetchCorpusOcr(id)`、`setCorpusOcr(id, mode, language)`；`ingestCorpus(id, force?)`。
- 侧栏展开项（`CorpusPicker`/`CorpusAdmin`）：每个库一个可展开“解析设置”：
  - 语言下拉（`eng`/`chi_sim`/`chi_sim+eng`）、模式下拉（`off`/`force`/`auto`）；
  - 状态：`ocr_stale ? "语言已改，需重新导入" : applied ? "已用 {applied_language} 解析" : "解析语言未知"`；
  - 按钮「重新导入并应用」→ `setCorpusOcr` 后 `ingestCorpus(id, true)`；导入中禁用并显示 job 进度（复用 H6 的 5s 轮询）。
- 全局 `OcrSettings` 保留为“新建库默认”。

**验收**
- 侧栏选基金库 → 设 `chi_sim+eng` → 出现“需重新导入” → 点重导入 → job `forced=true`、完成 `ocr_stale=false`；预览文本可读。
- 未改语言重导入：`skipped>0`（不白重解析）。
- 非法 mode/language 422；未知库 404。
- `applied` 为空的存量库显示“解析语言未知”，不阻塞。

### 6.6 K13 实现规格：mineru 解析（取代 liteparse）

> 状态：**已实现**（适配器 + 配置 + OCR 管道移除）。mineru 4.0.5 已装入项目 venv（`.venv/bin/mineru-kit`），但**未写入 PATH**（已代码修复，见下）且此前未写入 `pyproject`（已补）。真实基金库重导入待执行；`temp/` 经典产物与 v4 zip 产物读取均已验证。以下为规格。

**背景**：liteparse 中文 OCR 失败（`--ovr-language chi_sim+eng` → `failed loading language 'chi_sim_vert'`）。改用 **mineru 最新稳定版 4.0.5**（已实测）。

**CLI 与产物（实测 4.0.5，默认 `--format zip`）**
- 无状态入口：`mineru-kit parse <pdf> -o <out>/result.zip --tier standard --ocr-mode auto --format zip`（`mineru parse` 需先 `mineru server start`，不用于 subprocess）。
- `--format zip` **一次产出** `markdown.md` + `middle_json.json`（+`images/`、`model_output.json`、`structured_content.json`），`read_mineru_output` 会自动解包。
- `middle_json` 结构：`pages[]{page_idx, blocks[]{type, content}}`（**页码来源**）；`content` 可能嵌套（如 `image_footnote`），`_block_text` 已改为递归展平（修复列表 repr 泄漏）。
- v4 **不产出** 经典版 `<uuid>_origin.pdf`/`content_list.json`；`temp/` 经典产物仅作历史参考。
- 首次运行拉模型到 `MINERU_HOME`（实测约 1 分钟，CPU ONNX+llama.cpp）；之后可离线复跑（**待实测**）。

**对用户原话的答复**：你 `temp/` 的产物是**经典 MinerU**（`full.md`+`*_origin.pdf`+`images/`+`content_list.json`）；本项目选定 **4.0.5（v4）**，其 `mineru-kit parse` **不产出** `origin.pdf`/`images/`，而是单 markdown（图片 base64 内嵌）+ 单 middle_json。因此：**预览服务源 PDF**（等价于 origin.pdf），**正文用 v4 markdown**；若坚持经典三件套，需改用经典 MinerU（不在选定路径）。

**后端**
- 移除 liteparse：`_pdf_pages`/`parse_pdf_pages`、`pdf_ocr_mode`/`pdf_ocr_language`/`pdf_num_workers`、`/api/ocr-config` 与 `OcrSettings`、K12 的按库语言选择（保留 `force` 重新导入）。
- `parse_file` 的 `.pdf` 分支：调用 `MINERU_CMD`（默认 `mineru-kit parse {pdf} -o {out} --tier {tier} --ocr-mode auto --format middle_json`）；正文取 markdown，页码取 middle_json 的 `page_idx` 重组每页（无则单页）。
- 产物缓存于 `<KB>/parsed/<rel>/`；源 PDF `size+mtime` 未变则跳过（增量签名含 `parser=mineru@4`）。
- 预览：`/file` 返回**源 PDF**（即 origin）；doc `origin` 仍指向源 PDF 路径以保 `doc_id` 稳定。
- 迁移：现有基金库 liteparse/eng 乱码正文用 `ingest?force=true` 以 mineru 重建。

**已实现修复（本轮）**
- **B1 PATH**：`parse_pdf_pages` 把 `Path(sys.executable).parent` 注入子进程 `PATH`，`launch.sh` 未 activate 时也能找到 `mineru-kit`。
- **B2 依赖**：`pyproject.toml` 基础依赖加入 `mineru>=4.0,<5`（新环境 `uv pip install -e ".[web,embedding]"` 即带 mineru）。
- **B3 正文来源**：默认 `--format zip` 同时产 markdown+middle_json；**检索/引用用 middle_json 逐页块文本（页码准确）**，`markdown.md` 解包后保存备后续渲染（修正 `_block_text` 嵌套展平）。

**前端**
- 预览 PDF 仍用 `PdfViewer`（原文件 + `#page=`）；移除 OCR 语言设置入口（mineru auto）。
- 侧栏/库详情保留“重新导入”（切换解析器后重建）。

**验收**
- 基金库 34 份 PDF（source）→ mineru 4.0.5（`--tier standard`）解析 → `docs=34`、`files=34`、`parsed/` 每份一目录；正文可读中文、页码可定位；预览显示源 PDF。
- 未变文件二次导入跳过（不重跑 mineru）；`MINERU_HOME` 模型缓存可离线复跑。
- 移除 liteparse 后 `pytest`/`npm run build` 通过（基线 85/18）；`pyproject.toml` 已加 `mineru>=4.0,<5`。
- 首次运行模型拉取（约 1 分钟）有明确提示；断网复跑（模型已缓存）可成功。

**已定稿**
- tier=`standard`；**入库/检索用 mineru 逐页文本（zip 的 middle_json 块文本，页码准确）；markdown.md 保存备后续渲染**；正文图片**不渲染**（预览服务源 PDF）。见 §4 #13–#15。

**待确认**
- 命令安全：`MINERU_CMD` 仅接受默认模板或显式配置，避免任意命令注入。
- 集成方式已定（#16）：**本地 CLI**；`.env` 的 `MINERU_API_KEY` 未使用（应删或注未用）。
- **B4 试点**：先对 1–2 份 PDF 跑 `--tier standard` 计时并确认中文/页码，再 `force` 全量；单份超时默认 900s。

### 6.7 K5 实现规格：两阶段导入 + 进度/取消

**现状**：`POST /api/corpora/{id}/ingest?force=` 单阶段；`job` 仅结束后一次性填 counts；`import_defaults` 无进度回调；dense 索引懒建（首次 `search` 时）。

**目标**
- 阶段：`job.phase ∈ {parse, index, done}`。
  - parse：`import_defaults(..., on_progress=cb)` 逐文件回调 → 实时 `completed/total`。
  - index：parse 结束后，若 `EMBEDDING_PATH` 非空且有 `dense`，后台 `dense.sync(...)`；进度用已有 `DenseIndex.progress`（`{stage, completed, total}`），写入 `job.index_*`。
- 取消：`POST /api/corpora/{id}/ingest/cancel`；**协作式取消**（文件边界检查 flag）；线程不可强制中断，正在处理的文件收尾后停止。
- 轮询：`GET /api/corpora/{id}/job` 返回 job（或继续用 `/api/corpora` 的 `job` 字段）。

**验收**
- 解析阶段计数递增；phase 从 parse→index→done。
- parse 完成即可 BM25 问答（不等 index）。
- 取消在文件边界生效，`job.status=cancelled`；已入库文件保留。
- `EMBEDDING_PATH` 空 → 跳过 index 阶段（phase=done）。

**影响**：`main.py`（job/取消路由）、`parsers.py`（进度回调）、`dense.py`（显式 sync）、前端（阶段/进度/取消 UI）。

### 6.8 K9 实现规格：按 kind 预览

**现状**：`/file` 返回 PDF/Markdown/txt 原始文件；`DocumentPreview` 对 pdf 用 `PdfViewer`，其余读文本渲染；docx 的 `kind="text"` → 纯文本。

**目标**
- 新增 `GET /api/documents/{doc_id}/preview?corpus=`，按 kind 返回：
  - pdf → `{kind:"pdf", url:"/api/documents/{id}/file?…"}`（前端 iframe + `#page=`）
  - md/txt → `{kind:"markdown"|"text", text, parser}`
  - docx → `{kind:"html", html}`（docx→HTML）
- docx→HTML：默认 `mammoth`（离线、小包）；不可用时回退 python-docx 手写 `<p>/<table>`。
- 前端 `DocumentPreview` 按 kind 选：PdfViewer / Markdown / HTML / 纯文本。

**验收**：pdf/md/docx/txt 四类各自正确渲染；docx 显示为 HTML（非纯文本）；带 `corpus` 参数。

**待确认**：docx→HTML 库（`mammoth` vs python-docx 手写）。

### 6.9 K10 实现规格：检索候选/BM25 缓存

**现状**：`Knowledge.search` 每查询 `self.all()` 反序列化全库 + 逐页切窗口 + `tokens()` + `BM25Plus`（`knowledge.py:104-126`）。

**目标**
- 导入时构建并缓存搜索块：`chunks[]{doc_id,version,title,page,start_line,snippet,tokens}` + 一个 `BM25Plus` 实例，按库维护。
- 查询：tokenize → 缓存 BM25 打分 → `allowed_doc_ids` 过滤 → top-k；不再每查询重建全库。
- 失效：`put`/`drop_file`/删文件后置 dirty 或增量更新；可选持久化 `<KB>/datadb`（`chunks` 表）以避免重启重建。
- dense：保持现有 lazy sync，与 chunk 缓存解耦。

**验收**：首次构建后查询延迟基本不随库大小线性增长；与旧实现 top-k 在 fixtures 上一致；首次构建为一次性成本（同 K1）。

## 7. 维护约定

- 完成任务后更新本文 §2/§3 与 [`PROJECT.md`](PROJECT.md) 的现状/限制；长期取舍写入 [`DECISIONS.md`](DECISIONS.md)。
- 证据须可复现（命令/产出路径）；未运行的检查不得写入；受限项显式标注。
