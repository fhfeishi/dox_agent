# DECISIONS — dox_agent 关键决策

## 预览以原始文件为准（2026-09-22）

- 采用：文档预览对 PDF 直接展示原始文件（浏览器原生 `/file` + `#page=`，沿用 D6 降级），不再把抽取文本整篇拼接渲染；Markdown / txt / Word 才走规范化正文预览。
- 理由与代价：默认（`VITE_UI_DOC_PANEL=off`）路径此前对 PDF 全量拉取规范化正文，既慢又乱，且引用页码被丢弃；直接嵌入原文件最贴近“预览文件”。代价：非 PDF 仍依赖文本抽取质量，且保留两条预览实现（原文件 / 正文）。
- 影响：`frontend/src/DocumentPreview.tsx`（PDF 分支改用 `PdfViewer`，不再走文本管线）、`frontend/src/main.tsx`（预览状态带 `page`，引用跳页将页码透传到 PDF）。
- 已知代价：`PdfViewer` 用 `key` 让 iframe 每次翻页重载整份 PDF（大文件成本高）；D6 升级 PDF.js 后改 JS 控制页码。
- 现状：Word（`.docx`）`parse_file` 的 `kind="text"`，预览走规范化纯文本 `<pre>`；“Word 转 HTML” 是 K9 目标，尚未实现。
- 修复：引用 `[n]` 与“已读证据”chip 在**默认配置**下也可点（`handleOpenSource` 不再依赖 `VITE_UI_DOC_PANEL`）；默认走 PDF 原文件预览，flag 开时走 Explorer。
- 修复（本轮）：`/file` 改 `Content-Disposition: inline`——此前为 `attachment`，iframe 不会内联渲染。
- 修复（本轮）：`[n]` 实际一直未生效——`Answer` 计算了 `rehypePlugins`/`components` 却未传给 `<Markdown>`，且 `rehypeCitations` 返回 transformer 而非 `options => transformer`；现已接通（超范围数字保持字面、代码/链接不误匹配）。验收：`tests/browser_fund_preview.py`。

## 语料选择与回答同库（H8 默认启用，2026-09-22）

- 采用：选中语料始终随 `POST /api/chat` 发送 `corpus_id`（移除 `VITE_UI_CORPUS` 开关），会话头部始终显示当前库。
- 理由：侧栏库选择会重定文档/文献库范围，但此前 `corpus_id` 只在开关开启时发送，导致“看着基金库、回答 demo 库”的范围不一致；H4 后端已实现并有单测，浏览器验收（`browser_fund_preview.py`：选库→重定域→chat 携带 `corpus_id`）已过。
- 影响：`frontend/src/main.tsx`（发送 `corpus_id`、显示库）、`frontend/src/uiFlags.ts`（删除 `corpus` 开关）。

## 语料目录自包含「方案 A」（2026-09-22，取代分离布局）

- 采用：每个知识库 = `CORPORA_ROOT`（默认 `.knowledge`）下一个**自包含目录**，固定三部分：`source/`（原始文件，可按领域再分子目录）、`datadb/`（该库 SQLite `knowledge.sqlite3`）、`vectordb/`（该库 Chroma 索引）。`.demo_langchain/` 演示库采用同一约定。
- 理由与代价：派生数据重建成本高（中文扫描件 OCR + 向量索引），按库自包含便于整库备份/迁移/删除，并与演示库约定统一、消除两棵树漂移；代价是库目录可写、扫描需跳过 `source`/`datadb`/`vectordb` 保留名。
- 影响：`src/agent/config.py`（`CORPORA_ROOT` 默认 `.knowledge`，移除镜像用 `DATA_ROOT`）、`src/agent/corpora.py`（`CorpusInfo` 增 `source_dir`/`db_dir`/`vectordb_dir`）、`README.md`、`.env`/`.env.example`。
- 替代关系：取代下方"文档与本地数据布局"中 `.knowledge/`（原始）与 `.data/`（派生）分离、以及 `.demo_langchain` 旧子目录名（`langchain_dox`/`langchain_datadb`/`langchain_vectordb`）的约定。
- 遗留：应用级会话库原随默认库 `datadb/`；**已由 K0 解决**（迁到 `STATE_DIR`，见下方「应用级会话库独立于语料库」）。

## OCR 模式/语言可运行时配置（2026-09-22，已实现）

> **已被 mineru 取代（2026-09-22）**：改用 mineru 后不再需要 liteparse 的 OCR 三档/语言配置，本节保留备查。

- 采用：OCR 模式（`off`/`force`/`auto`）与语言（`eng`/`chi_sim`/`chi_sim+eng`）可在前端调整，不必改 `.env` 重启；默认 `PDF_OCR_MODE=auto`、`PDF_OCR_LANGUAGE=chi_sim+eng`。
- 理由与代价：基金报告多为中文扫描件，旧的固定 `eng` 质量差；代价是新增运行时配置接口，并需明确“仅影响后续导入”（已入库文档需重新导入才生效）。
- 落点：`src/agent/config.py`（`pdf_ocr_mode`/`pdf_ocr_language`/`pdf_num_workers`、`OCR_MODES`/`OCR_LANGUAGES`、`load_ocr_config`/`save_ocr_config`）、`src/main.py`（`GET/PUT /api/ocr-config`，启动时覆盖 `Settings`）、`frontend/src/OcrSettings.tsx`（设置抽屉）；配置落地 `STATE_DIR/ocr.json`。
- 与解析关系：OCR 语言仅作用于 liteparse（本项目固定解析器）。
- 状态：**已实现（K4）**；测试 `tests/test_corpora_state.py::test_ocr_config_persists_and_only_affects_later_imports`。

## 按库 OCR 语言与“改语言→强制重解析”（K12，2026-09-22）

> **已被 mineru 取代（2026-09-22）**：mineru auto 自行识别语言，不再需要按库选语言；保留“重新导入/force”用于切换解析器后重建。

- 问题：OCR 配置当前是**全局**（`STATE_DIR/ocr.json`），且增量导入按 `size+mtime_ns` 跳过未变文件，导致（**清单已回填后**）“改语言后重新导入”实际什么都不做；旧基金库以 `eng` 解析的正文仍是乱码，预览无法阅读。**例外窗口**：基金库当前 `files` 清单为空，按规则会全量回填，普通 ingest 这一次会真的重解析——K12 落地前可临时用它修复。
- 采用：
  - OCR 模式/语言**按库**存储（`<KB>/datadb` 的 `meta` 表）；生效值 = 库配置 ?? 全局默认。
  - 失效条件：**库级 expected vs applied**（`ocr_applied_mode`/`ocr_applied_language`）；期望值存在且与 applied 不一致即 `ocr_stale`（不依赖人工判断）。**未实现**按文件签名（含 parser 版本）的更细粒度失效，保留为后续增强。
  - `POST /api/corpora/{id}/ingest` 增 `force`：绕过 `size+mtime_ns` 跳过、全部重解析（用于语言/模式变更）；`ocr_stale` 时服务端建议/要求 `force`。
  - 入口（保底方案）：放在**左侧边栏知识库展开项**（`CorpusPicker`/`CorpusAdmin`）——“语言/模式 + 重新导入并应用”；库详情页（`LibraryView`）可复用同一操作。自动语言建议为可选增强，不阻塞。
  - 实现规格见 [`ITERATION.md`](ITERATION.md) §6.5（`meta` 键、`GET/PUT /api/corpora/{id}/ocr`、`ingest?force=` 与 `stale` 自动强制、`api.ts`/`CorpusPicker` 变更、验收）。
  - 库详情提供“解析设置 + 重新导入并应用”，并提示“将重解析全部文件、版本会变化”。
- 理由与代价：语言决定识别质量，必须能按库调整并真正重解析；代价是新增按库配置存储与一次全量重解析。
- 状态：**已实现（K12）**。`Knowledge.meta` 存 `ocr_mode`/`ocr_language`/`ocr_applied_*`；`GET/PUT /api/corpora/{id}/ocr`；`ingest?force=`（`stale` 自动强制，job `forced`）；`GET /api/corpora` 增 `ocr_stale`；侧栏 `CorpusAdmin`→`CorpusOcrSettings`。测试 `tests/test_corpus_ocr.py` + 实机 httpx 全流程。

## 导入性能优化方向（2026-09-22）

> **OCR 部分已被 mineru 取代（K13）**：mineru 自动识别语言，不再需要 OCR 三档/按需/语言配置；保留“增量导入/两阶段/缓存”方向。

- 根因判定：慢在 PDF 解析/OCR、每次全量重解析、解析串行与向量索引延后阻塞；**SQLite 写入非瓶颈**。
- 采用：增量导入（文件签名清单）+ 并发解析 + 两阶段导入（先文本后向量）+ chunk id 预缓存（~~OCR 按需~~ 已被 mineru 取代）。
- 影响：`parsers.py`/`knowledge.py`/`main.py` 导入路径、`<KB>/datadb` 文件清单表与任务进度模型。

## 增量导入与文件清单（2026-09-22）

- 采用：`<KB>/datadb` 维护 `files(rel_path,size,mtime_ns,sha256,doc_id,status)`；以 size+mtime 作为廉价签名跳过未变文件，必要时用 sha256 兜底；源文件删除即标记文档移除。
- 理由与代价：避免未变文件重复 OCR/解析；代价是新增清单表与删除同步逻辑。
- 状态：**已实现（K1）**。`Knowledge` 增 `files` 表与 `files()`/`record_file()`/`drop_file()`；`import_defaults(knowledge, settings, root=<corpus>/source)` 按 `size+mtime_ns` 廉价跳过、必要时 `sha256` 兜底，源文件删除即 `drop_file`（删 manifest 行与 `docs` 行），返回 `added/updated/skipped/deleted/scanned`。清单为空视作存量库首次回填，全量重解析一次。测试见 `tests/test_incremental_import.py`；实机默认演示库二次导入 `added=0, skipped=1`，删除探针文件后 `deleted=1` 且不再出现在 `/api/documents`。

## 两阶段导入（先文本后向量）（2026-09-22）

- 采用：导入先完成解析入库（BM25 立即可检索），向量索引在后台构建并在任务中独立显示进度；`EMBEDDING_PATH` 为空时跳过向量阶段。
- 理由与代价：避免“导入完成但首次提问卡死”；代价是两种检索能力就绪时间不同，界面需如实显示。
- 取消：协作式（文件边界检查 flag），线程不可强制中断；取消后 `job=cancelled`，已入库文件保留。规格见 ITERATION §6.7。

## 预览按 kind 选择渲染（K9，2026-09-22）

- 采用：新增 `GET /api/documents/{doc_id}/preview?corpus=`，按 kind 返回 pdf(url)/markdown(text)/html(docx)/text；pdf 继续用 `/file` + `PdfViewer`。
- docx→HTML 候选：`mammoth`（离线、小）优先，回退 python-docx 手写。
- 状态：待实现（K9）；当前只有 `/file` 与文本读接口。规格见 ITERATION §6.8。

## 知识库与文件 CRUD 及删除语义（2026-09-22）

- 采用：知识库新建/重命名/删除；库内文件列表/上传/删除/重命名或替换。
- 删除语义：`DELETE /api/corpora/{id}` 默认只删派生数据（`datadb/`、`vectordb/`），删除 `source/` 需显式 `purge_source=true`。
- 理由与代价：`source/` 是唯一事实来源，防误删；代价是删除需两步（清派生、再决定源文件）。
- 状态：**已实现（K6/K7）**。`POST /api/corpora`、`PATCH /api/corpora/{id}`（仅改显示名，落 `STATE_DIR/corpora.json`）、`DELETE /api/corpora/{id}?purge_source=`；库内文件 `GET/POST/DELETE/PATCH /api/corpora/{id}/files`（md/pdf/txt）。测试：`tests/test_corpora_state.py`。

## Word 文档支持选型（待定，2026-09-22）

- 采用（已定）：`.docx` 解析用 `python-docx`（离线、轻量，取段落与表格文本），不引入 markitdown。
- 约束：必须离线、不引入重型运行时。
- 状态：**已实现（K8）**：`parse_file` 解析 `.docx` 段落+表格；`SOURCE_SUFFIXES` 与上传白名单加入 `.docx`；测试 `tests/test_docx.py`。

## 检索候选/BM25 预计算与缓存（2026-09-22）

- 采用：把每查询 O(库) 的候选窗口切分、`tokens()`、`BM25Plus(corpus)` 预计算并缓存（随导入维护）；chunk id 仅是其一部分。
- 理由与代价：`Knowledge.search`（`knowledge.py:104-126`）每查询重建全库窗口与 BM25 才导致延迟随库增长；dense 层已自行做 missing/stale diff（`dense.py:51-61`），不是瓶颈。代价是需在导入/删除时维护缓存一致性。
- 状态：待实现（K10）；导入时构建 `chunks[]`+`BM25Plus` 并按库缓存。规格见 ITERATION §6.9。

## 检索重构：报告级混合检索（L 阶段，2026-09-22）

- 采用：搜索空间 = 报告解析后的 markdown/块文本；hybrid（BM25 + dense/RRF）在 chunk 级检索 → 聚合到报告级 → 取相关报告**全文**（token 预算内）→ 结合任务提示词回答。
- LangGraph：保留图作为编排（understand→retrieve→assemble→answer→validate），但**移除 LLM 驱动的 search/read 工具循环**，改为确定性检索 + 有界补查。markdown 是数据/上下文，图是编排，非二选一。
- 分块：**以 `middle_json` block 为原子**（带 `page_idx` → 页码），markdown 仅用于渲染/上下文；**分块前剥离 base64 图片**为 `[图片]`。
- 报告召回/聚合：采用**两级「报告级召回（title+heading+project_no/year）top-M + 报告内 chunk 精排 top-m RRF」**，天然消除全局 chunk 池漏召回；取消全局 `CANDIDATE_CAP`（扁平回退时按文档截断）。报告级索引几百条，构建近乎免费。
- 默认最简：多查询只用规则（LLM 拆解延后）；`β/δ/γ` 三权重、MMR、aspect 贪心 + `COVERAGE_TARGET`、短时缓存、rerank **默认关/延后**，由评测触发。
- 无匹配口径：主判据为 query 主题词覆盖率 `MIN_TERM_COVER`（默认 0.3，uncalibrated）且要求非停用词/实体匹配；`NO_MATCH_TAU` 仅兜底，启用须写明归一化公式，不作常数。
- 参数治理与评测：集中 `RetrievalConfig`，未校准项标 `uncalibrated`；只校准 `MIN/MAX_REPORTS`（按 task）、`PER_DOC_TOP_M`/报告 M、无匹配判据、`COVERAGE_TARGET`；复用扩展 `evaluate.py`（10–15 条），记录「参数版本+指标」。分层与参数表见 ITERATION §7.7。
- 去重与差异：按**项目编号**去重（同项目取最新/最全，跨年合并标注），`min/max_reports` 与是否需全文按 task 区分。
- 预算：改用 **token**（`RETRIEVE_CONTEXT_TOKENS`/`RETRIEVE_REPORT_TOKENS`/`ANSWER_RESERVE_TOKENS`），全局核算 system+历史+提示词+报告+输出。
- 与 K10 关系：L2 的 chunk 模型取代 K10 候选缓存；K10 仅保留“BM25 按库缓存 + chunk id 预计算”原则，不建两套索引。
- dense 子集：限库/限报告改用 Chroma metadata filter（`doc_id ∈ allowed`），不退化为 BM25-only。
- Word 报告：后续复用 `selected_reports`，模板 `templates/*.docx`（python-docx），不在本轮。
- 状态：规划（L1–L7），规格见 ITERATION §7。

## L 阶段冲突裁决（2026-09-22，planner）

- **L1 时机**：K13 全量重建期间不改 `Document`/`version`/存储；**门禁 = 重建非运行中 + `parsed/<rel>/markdown.md` 覆盖全部 source（按 rel 与 files 清单一致）+ `docs`/正文/页码核对**（仅 `docs=34` 不足；实测 source=35/parsed=19）。从 `<KB>/parsed/` 重索引（**不重跑 mineru**，缺 parsed 即失败）。迁移前备份 `<KB>/datadb/knowledge.sqlite3` → `.pre-l1`；原地替换，不回滚 schema。
- **K5 非硬前置**：当前 ~34 报告、BM25-only，L3/L3b 同步建索引；K5 仅用于进度/取消与启用 dense 前。
- **单索引 + 临时接线**：`Knowledge.search` 委托新引擎并删除旧窗口 BM25；L6 再以确定性 `retrieve→assemble→answer` 替换 LLM 工具循环；不得两套索引并存。
- **version 迁移**：采用新 `version`；历史 `sources` 允许失效并在 `read`/`/file` 明确提示“文档已更新”，不重写会话历史（`doc_id` 不变，文档仍可打开）。
- **token 口径（D-L8）**：无 tiktoken；MVP 保守字符估算 + 字符硬上限 + 供应商 `usage` 校准，标 uncalibrated。
- **CJK 无匹配（D-L9）**：2-gram + 小停用词表 + 覆盖率，MVP uncalibrated，由评测校准；`_query_terms` 为空 → `reason="direct"`，**无回退**（`telemetry.path=direct`）。
- **验证者 S1–S9（2026-09-22，二次修订）**：parsed 完整性门禁（S1，rel 口径、排除 `_pilot`）、base64 正则去贪婪（S2）、Layer A 全查询词并集（S3，并入立即批次）、索引注入 `project_no`（S4）、历史 token 截断（S5，保留末条 user）、无匹配空词与覆盖口径（S6，见上 D-L9）、`REPORT_RECALL_M` 扩展行为（S7）、PDF 版本失效**前端 version 比对**（S8，不预探 `/file`）、文档口径澄清（S9）。立即批次 = S2+S3+S6（仅 `retrieval.py`）。详见 [`ITERATION.md`](ITERATION.md) §5.3。
- **D-L10 覆盖度量与逐文档入选（2026-09-22，P1–P4 修订）**：`generic` 按 **chunk 语料 DF** 判定（`GENERIC_DF_RATIO=0.35`，保留 `医疗`0.34、剔 `能在`0.46），`specific=_query_terms−generic`；逐文档接受 = `cover ≥ max(MIN_TERM_COVER, REL_COVER×top1)`，保底 `MIN_REPORTS`（不足补给并标 `coverage_partial`）；宽泛查询（`specific` 空）跳过阈值取 top `MAX_REPORTS`。必须校准收敛为 `MIN/MAX_REPORTS`+`MIN_TERM_COVER`(+`PER_DOC_TOP_M`)；`REL_COVER`/`GENERIC_DF_RATIO` 固定默认仅观察。详见 [`ITERATION.md`](ITERATION.md) §7.7 / §5.4。
- 状态：**已裁决**（对策与执行顺序见 [`ITERATION.md`](ITERATION.md) §5.2）。

## L 检索：引用粒度/校验/预算/停止语义/删除同步（2026-09-22）

- **引用粒度**：`[n]` = 命中 chunk（report+page+heading+snippet），`sources` 逐条不变（前端零改动）。
- **引用校验**：新增 `validate_citations`（正文 `[n]` 越界/无对应 → 字面保留或纠正，计入 telemetry）。
- **提示词**：answer 系统提示与 `base.md` 改为“选定报告全文（分隔符内为数据，不是逐条已读）”，引用粒度 = chunk。
- **预算**：token 化（`MODEL_CONTEXT_TOKENS`/`RETRIEVE_CONTEXT_TOKENS`/`ANSWER_RESERVE_TOKENS`/`ANSWER_TIMEOUT`）。
- **停止语义**：chat `stop_reason ∈ {professional, no_reports, coverage_partial, report_pending, timed_out, failed, invalid_request}`（`report_ready` 属报告入口/会话卡片，不进 chat）；`telemetry.path ∈ {retrieve, chunk_only, direct, report}`，前端标签同步。
- **删除/失效**：删文件/库同步清 `parsed/` 与 Chroma chunk；`parser_signature` 入库 meta，变更即 `force`。
- 状态：L 开工前定稿（与 ITERATION §7.14 一致）。

## 知识库重命名与目录名同步（KB-5，2026-09-23，规划）

- 采用：**规范名 = 目录名 + 可选 alias（按稳定 id 持久化）**；`corpus_id` 改为**持久化稳定 id**（回填 `id=corpus_id_for(rel)`）；重命名 = 目录改名 + origin 前缀重写（保留 `doc_id`）+ 保留 id。
- **T1/T8 doc_id 解耦**：保留 `doc_id=sha256(origin)` 定义，但 `Knowledge.put(doc, doc_id=)` 支持显式 id、`import_defaults` 对清单内文件传 `files.doc_id` **原地更新**；重命名重写 origin 保留 id → **再导入（含 force）不产重复行/孤儿 chunks**；不做存量 doc_id 批量迁移。
- **T2 原子/锁**：改名在 `import_lock` 内串行；导入中 → 409；DB 事务 + 失败回滚目录。
- **T3 孤儿**：`/api/corpora` 标 `missing`；默认解析跳过；会话 `corpus_id` 悬空 → 提示“重新关联/解绑”，不静默 404。
- **T4 alias**：不删显示名，按 id 存 alias（UI 优先显示），避免 rel-keyed 漂移。
- **T5 文件系统边界**：Windows 保留名/尾随点空格/符号链接拒绝；大小写改名两步临时名；与扫描/导入串行。
- **T6 对齐迁移**：预览 + 备份 + 可回滚 + 用户确认。
- **T7 DEFAULT_CORPUS**：按 id 解析，保留 rel 回退（旧 `.env` 写 rel 仍可）。
- 理由：`corpus_id` 原本由 rel 派生、`doc_id=sha256(origin)`，直接改目录会级联失效会话/引用；稳定 id + origin 重写 + put(doc_id) 消除级联。
- 取代：取代「知识库重命名语义（2026-09-22）」中“仅改显示名/目录搬迁暂缓”的部分。
- 状态：**规划**，规格见 [`ITERATION.md`](ITERATION.md) §11.6（KB-5a–d）。

## 多知识库会话（≤6，新需求）（2026-09-23，规划）

- 采用：`ChatRequest` 增 `corpus_ids: string[]`（1–6），与 `corpus_id` 二选一（同送 422）；各库 retrieve → 跨库报告级合并/去重；`[n]` 跨库编号且 `sources` 带 `corpus_id`；`SessionData.corpus_ids?` 可选。
- 理由：`.knowledge/` 已有多库（基金按领域拆分），跨领域问题需多库联合；旧 `corpus_id` 保留兼容。
- 取代：**取代** `PROJECT §1「首期不做跨库联合检索」`；实施前更新 PROJECT/DECISIONS。
- 顺带（小改进，不改后端）：KB-1 默认库会话确认、KB-2 Composer 内新建/切库、KB-3 拖拽多文件上传。
- 状态：**规划**，规格见 [`ITERATION.md`](ITERATION.md) §11（KB-1–KB-4）。

## 本地持久化统一到 .knowledge/（2026-09-22，规划）

- 采用：所有本地持久化只在 `.knowledge/` 下——语料 `.knowledge/<corpus>/{source,datadb,vectordb}`；应用状态 `.knowledge/.state/{workspace,reports}.sqlite3` + `corpora.json`；演示库移到 `.knowledge/demo_langchain/`（扫描器已跳过 dot 目录，`.state` 不会被当语料）。
- 删除：`DATA_DIR`/`VECTORDB_DIR`（活动库在根外的特例）与 `KNOWLEDGE_ROOT`/`TEXT_ROOT`（并入 `CORPORA_ROOT`）；新增 `DEFAULT_CORPUS`（相对名）。
- 取代：取代「语料目录自包含方案 A」中“活动库可位于 CORPORA_ROOT 之外”的部分。
- 状态：**规划**，规格见 [`ITERATION.md`](ITERATION.md) §10（DIR-1–DIR-4）。
- **迁移要点（M1–M7）**：
  - **M1（高风险）**：移动语料后必须重写 DB 中**文件型 origin** 前缀（保留 `docs.id`），否则 `/file`/rel_path/预览 404；实测 demo 158 docs 中 **1 个文件型、157 URL 型**。移动后的语料**勿 `force` 重导入**（避免 id 重算成孤儿）。
  - **M2/M3**：state 迁移来源优先级 `.state/` → `data/` → `<活动库>/datadb/workspace.sqlite3`；先复制/校验再删旧目录，失败保留并记日志。
  - **M4**：默认库解析确定性：`DEFAULT_CORPUS` 存在且为库；缺失取首个 `ready`（按 rel_path）；全无 ready → health 明确状态。
  - **M5**：`ingest/local`/`ingest/text` 语义变更为“导入默认库 `source/`”；脚本 `--db`/默认库 db 同步。
  - **M6**：`.gitignore` 移除 `.demo_langchain/`；`.knowledge/*` 覆盖 `.state/`；`data/` 护栏保留（截图改投 `temp/`）。
  - **M7**：`DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT`/`TEXT_ROOT` 标废弃（`extra="ignore"`，可选启动 warning）。

## 报告↔会话绑定（#10 定稿，2026-09-22）

- 定位：报告是**应用级不可变产物**，`report_id` 全局唯一定位；单用户本地，不做多用户权限。
- 字段：`POST /api/reports` 增可选 `run_id`；`session_key`（chat 入口必填、独立报告可空）、`corpus_id` 记录来源。`reports` 表列改为 `(id, created_at, session_key, run_id, corpus_id, params, markdown)`（前三者可查询，`params` 留全量）。
- 幂等：同一 `(session_key, run_id)` 重复请求返回既有报告，不重复生成。
- 接口：`GET /api/reports/{id}` 按 id 全局取；**新增 `GET /api/reports?session_key=&run_id=&limit=`**（列表，仅元数据）；`/export?format=md` 不变。
- 会话侧：assistant turn 存**可选** `reportId`（缺失默认，遵守「持久化数据向后兼容」）；会话可列/打开其报告。
- 不做：删除、权限、跨用户。
- 状态：**已定稿**；G10d 前端卡片按此接线；后端需补 `run_id` 幂等与列表接口（当前最小实现缺）。
- **实现细则（M1–M7，编码前定）**：
  - **M1 schema 迁移**：`ReportStore.__init__` 在 `CREATE TABLE IF NOT EXISTS` 后 `PRAGMA table_info(reports)`，对缺失的 `session_key`/`run_id`/`corpus_id` 逐个 `ALTER TABLE reports ADD COLUMN ... TEXT NOT NULL DEFAULT ''`（幂等，不会漏列）。
  - **M2 幂等与 NULL**：`session_key`/`run_id` **落库用 `''` 而非 NULL**（SQLite UNIQUE 视 NULL 互不相等）；建**部分唯一索引** `CREATE UNIQUE INDEX IF NOT EXISTS reports_run ON reports(session_key, run_id) WHERE run_id != ''`（旧行 `run_id=''` 被排除，无冲突）。
  - **M3 run_id 生命周期**：来源 = chat turn 的 `runId`（已存在，随会话持久化）；**重试同 `run_id` → 返回既有（200，`idempotent=true`）**；**重新生成 → 新 `runId` → 新报告（201）**；同 `(session_key, run_id)` 但参数不同 → **幂等优先，返回既有（200）**，不 409。
  - **M4 列表**：`GET /api/reports?session_key=&run_id=&limit=`；`created_at DESC`；`limit` 默认 20 / 上限 100；**仅元数据**（`report_id/created_at/session_key/run_id/corpus_id/template_id/domain/year_from/year_to`，不含 markdown）；未命中 `200 []`。
  - **M5 清理陈旧文档**：`reports.py:5` docstring「#10 is still open」与 `main.py:81` 注释一并更新。
  - **M6 已知限制**：报告无删除；`reports.sqlite3` 与应用级 `workspace.sqlite3` 同在 `STATE_DIR`；单用户可接受，列表 `limit` 缓解，后续可加清理。
  - **M7 校验口径**：`session_key` 服务端**不强制**；“chat 入口必发”是**前端流程约定**，不得加服务端必填校验。
- 附带修正：`main.py:81` 注释「task4 is deliberately absent」已过期，应改为“task4 允许输入、走 intake，不生成正文”。

## 重命名同步目录（KB-5，取代 K6「仅改显示名」，2026-09-23）

- 采用：`.knowledge/<dir>` 为规范名；`PATCH /api/corpora/{id}` 执行**目录改名 + 文件型 origin 前缀重写（保留 doc_id）+ 稳定 corpus_id 保留**；可选 `alias` 按 id 持久化；`.state/corpora.json` 按 **id** 持久化（旧 rel-keyed 读时转换 + 扫描回填）。
- 理由与代价：库名与磁盘一致、便于运维/迁移；代价是重命名需 `import_lock` + 失败回滚，且文档 `doc_id` 与路径解耦依赖 `Knowledge.put(doc_id=)` + `import_defaults` 复用清单 id（T1）。
- 边界（T5）：校验保留名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）、尾随点/空格、分隔符；仅大小写改名走两步临时名。
- 关联：`resolve_default` 按 id→rel（T7，旧 `.env` 写 rel 仍可解析）；T3（缺失库提示）与 T6（名称/目录对齐迁移）待后续。

## 任务 = 输出契约，不是输入闸门（2026-09-22，规划）

- 采用：四个任务（task1–4）都保留自由文本输入；输入禁用只由运行时状态（busy/离线/未就绪）决定，**不由 task 决定**。**约束对象是正文生成，不是输入**：task4 正文仍不在 chat 生成，chat 只做 intake。
- task4 分两阶段：**interim** 走确定性「报告参数采集」（缺参一条消息列全；齐则回显参数 + `report_pending`，输入不丢弃）；**E 就绪后** 同输入 → 报告生成。
- 所有权：`report_pending` 属 chat；**`report_ready` 属报告入口/会话卡片**，不进 chat `stop_reason`。
- 任务切换：保留「会话绑定任务」，切换 = 显式新建会话并绑定 + 温和提示；不再替换 `textarea`。
- 理由：把“输出契约”误当“输入闸门”会让 task4 成为死路。
- 状态：**规划（G10；G10a+G10b 必须同批，避免 422 窗口）**，规格见 [`ITERATION.md`](ITERATION.md) §8。

## 任务与产出物两轴模型（2026-09-22，规划，扩展非首期）

- 采用：**任务（意图）与产出物（格式）分离**——任务定义意图+检索+提示词+**默认产出物**；产出物是**输出参数**（`text`/`table`/`chart`/`document`），任务只声明默认+允许集。不为每种格式新建任务。
- 任务扩展（**非首期验收**，需需求确认）：task5 项目画像、task6 成果汇编、task7 领域综述、task8 可视化简报；依赖 H9/B4/B5。
- 模板**单一权威**：`src/templates/<template_id>.md`（章节结构）；把章节从 `src/prompts/task4_report.md` 移出，加载器加 `report_template()`；`has_template`→`templates` 列表；无模板管理平台。
- 导出：首期仅 **`.md`**（demand 非首期必需 docx/pdf）；R2 docx 用**手写 python-docx 渲染器**；R3 pdf 用 Playwright 作 `reporting` extra。
- 可视化：首期**表格+文字**；前端不渲染内联 SVG/HTML（无 rehype-raw），图表须走 `GET /api/reports/{id}/asset/{name}` 图片端点；matplotlib 放 R3 并解决中文字体；数字须确定性抽取/校验。
- 状态：**规划**，规格见 [`ITERATION.md`](ITERATION.md) §9。

## 持久化数据向后兼容：渲染对新增字段做默认（2026-09-22）

- 问题：L6 改变 `telemetry` 形状（新增 `context_tokens`/`chunks_retrieved`/`reports_selected`），但 `workspace` 持久化的旧会话缺这些键；恢复会话时 `MessageView` 的 `t.context_tokens.toLocaleString()` 抛错，整棵 React 树崩溃 → **整页白屏**。
- 采用：前端渲染对**持久化/历史数据的新增字段**一律给默认（`context_tokens ?? 0`、`stages_ms ?? {}` 等）；并加顶层 `ErrorBoundary`（`components/ErrorBoundary.tsx`）兜底，单个组件异常时显示错误与「重新加载」而非白屏。
- 理由：契约演进不可避免，持久化历史不能假定与当前 TS 类型一致（类型不覆盖既有数据）。
- 影响：`components/MessageView.tsx`、`components/ErrorBoundary.tsx`、`main.tsx`。
- 状态：**已修复并验证**（Playwright：旧会话恢复后 `#root` 正常渲染、无 `pageerror`；`npm test` 18 passed）。

## UI 架构重构（U10，2026-09-22）

- 采用：`store.tsx` 的 `AppProvider` 拥有全部业务状态（SSE/会话/分支/多库/预览/导入），`App.tsx` 仅布局；组件经 `useApp()` 读取、零业务逻辑；设计令牌集中在 `styles/globals.css`；IA 为 `IconRail → SidePanel → Main → Inspector`，文献库为「卡片网格 → 库详情抽屉 → 文档/源文件/导入」三层。
- 理由与代价：与 `.logsdev/archive/DoxAgentWeb` 模板对齐、消除 `main.tsx` 单文件耦合；代价是 `store.tsx` 较大（`useMemo` 依赖长），后续可拆子 hook。
- 保留：SSE 流式、会话/分支持久化、按库文档、引用跳页/版本校验（S8）、PDF 原生预览（D6）。
- 状态：**已实现（代码）**；浏览器离线验收 **7 用例**通过；在线 `browser_fund_preview`/`browser_smoke` 待跑。

## 文档位置：ui-migration 并入 .logsdev（2026-09-22）

- 采用：长期文档只维护 `.logsdev/{PROJECT,ITERATION,DECISIONS}` 与 `README`；过程/历史材料交给 git。`ui-migration.md` 不单独维护；其长期结论折入 `.logsdev/DECISIONS.md`，细节由提交历史保存。
- 理由：`.logsdev/README.md` 只维护三份长期文档；`ui-migration.md` 与 `DECISIONS.md` 两处维护会漂移（§5 组件映射已与 §8 不一致）。
- 动作：**删除 `.logsdev/ui-migration.md`**（该文件实际在 `.logsdev/` 且被 git 跟踪，非 `dev_logs/`）；归档模板 `.logsdev/archive/` 已 ignore（不追踪 104M）。
- 状态：**已完成**：`.logsdev/ui-migration.md` 已删除（git 历史可追）；归档已 ignore、UI 决策已折入 `DECISIONS.md`。

## 应用级会话库独立于语料库（2026-09-22）

- 采用：`workspace.sqlite3` 迁出活动库的 `<KB>/datadb/`，放固定应用级目录；`app.state.workspace` 不再随活动库变化。
- 理由与代价：当前会话库位于活动库目录内（`main.py:91`），删除/重命名默认库会连带丢失会话与笔记；代价是新增一个应用级路径配置。
- 前置：K0；未完成前不开放库删除/重命名。
- 状态：**已实现（K0）**。新增 `Settings.state_dir`（默认 `DOX_AGENT_ROOT/data`）；`main.workspace_path` 把 `workspace.sqlite3` 放在该目录，并在应用级文件不存在时从活动库 `<KB>/datadb/workspace.sqlite3` 一次性复制迁移。测试见 `tests/test_corpora_state.py`。

## 解析器：改用 mineru 4.0.5（取代 liteparse，2026-09-22）

- 采用：PDF 解析改用 **mineru 最新稳定版 4.0.5**；**彻底移除 liteparse**。原因：liteparse 中文 OCR 报错（`--ovr-language chi_sim+eng` → `failed loading language 'chi_sim_vert'`），且抽取质量差。
- 版本与 CLI（实测 4.0.5）：无状态入口 **`mineru-kit parse <pdf> -o <out>/result.zip --tier standard --ocr-mode auto --format zip`**（一次产 `markdown.md` + `middle_json.json` + images）；`mineru parse` 需先 `mineru server start`。已装入项目 venv，并在 `parse_pdf_pages` 注入 `PATH`（B1）、加入 `pyproject` 依赖（B2，`mineru>=4.0,<5`）。
- 产物（v4 实测）：`--format markdown` → 单个 `.md`（**图片内嵌 base64**，自包含）；`--format middle_json` → 单个 `.json`，结构 `pages[]{page_idx, blocks[]{type, content[]{type,content}}}`（**页码来源**）。v4 **不产出** 经典版的 `<uuid>_origin.pdf`/`images/`/`content_list.json`。
- 入库与预览：**正文/检索用 zip 的 `middle_json` 逐页块文本（页号准确，B3）**；**`markdown.md` 解包后保留备后续渲染**；**预览服务源 PDF**（即 origin，v4 无单独 origin.pdf）。`_block_text` 已改为递归展平（修复嵌套 content 的列表 repr 泄漏）。
- 旧版对照：`temp/` 的 10 个目录属**经典 MinerU**（`full.md`+`*_origin.pdf`+`images/`），仅作历史参考；实现以 v4 CLI 为准。
- 取代：原「解析器：固定使用 liteparse」及 K2/K3/K4/K12 基于 liteparse 的 OCR 三档/语言配置/按库语言（mineru auto 自行识别语言）。
- 状态：**已实现适配器（K13）**：`parsers.py` 跑 `MINERU_CMD` 到 `<KB>/parsed/<rel>/`，`read_mineru_output` 支持 v4 `middle.json`/经典 `content_list.json`（`page_idx`→页码，回退 markdown 单页）；已移除 liteparse、`/api/ocr-config`、`/api/corpora/{id}/ocr` 与前端 OCR 入口；保留 `ingest?force=true`（侧栏“重导入”）。
- 实现补充（2026-09-22，本地实测）：`MINERU_TIMEOUT` 默认 **3600s**；超时用 `start_new_session=True` + `killpg` 杀**整个进程组**（`shell=True` 否则超时只杀 shell，遗留 mineru 孙进程）。
- tier 实测：最小基金 PDF（6 页）`--tier standard` **>900s 未完成（超时）**，`--tier basic` **96.7s** 且中文可读、页码正确。故**代码默认仍为 standard（#13），本机重建用 basic**（`.env` 覆盖，已有注释）；标准档待后续质量增强或更强算力再跑。
- 试用证据（2026-09-22，本地独立 venv）：安装 `mineru==4.0.5`（无 torch）；最小基金 PDF `--tier basic --ocr-mode auto` 1–2 页约 6s（首次拉模型约 1 分钟）；`--format markdown` 单文件（图片 base64、无页标记）/ `--format middle_json` 单文件（`pages[].page_idx`+blocks）。证据见 [`ITERATION.md`](ITERATION.md) §3。
- 待审核（影响实现）：① tier 默认 `basic`/`standard`；② 页码取 `middle_json` 还是 markdown 单页；③ 正文图片是否渲染（预览走源 PDF）。见 [`ITERATION.md`](ITERATION.md) §4 #13–#15。

## 知识库重命名语义（2026-09-22）※部分被 KB-5 取代

> **2026-09-23 取代（KB-5）**：「重命名仅改显示名、不动目录」被取代——新需求要求**名称与 `.knowledge/<dir>` 同步**；演变为：稳定 `corpus_id`（持久化、与路径解耦）+ 目录改名 + origin 重写保留 `doc_id`。本节的“目录搬迁作为独立操作”作废。见 [`ITERATION.md`](ITERATION.md) §11.6。

- 采用：重命名分两层——（a）显示名更新（`CORPORA` override 的 `name`，不动目录）为默认；（b）目录搬迁为独立操作。
- 理由：`corpus_id` 由相对路径派生（`corpora.py:46`），`doc_id=sha256(origin)`（`parsers.py:32`），搬目录会级联改变两者，使会话 `corpus_id`、`allowed_doc_ids`、历史 `sources.doc_id` 失效。
- 目录搬迁若要支持，须做 id/doc_id 迁移或明确标记失效（K6b）。

## 删除同步必须清除检索索引（2026-09-22）

- 采用：删除文档/文件时，除删 `docs` 行外，必须同时从 BM25（查询期重建）与 dense（Chroma）排除，避免已删文档仍可被检索/引用。
- 影响：K1 删除同步、K7 文件删除。
- 状态：K1 已实现 BM25 侧（`drop_file` 删 `docs` 行）；dense 侧由 `DenseIndex._search` 的 missing/stale diff 在下次未限定资料的检索时清理，不做即时删除。

## corpus_id 稳定性（2026-09-22）

- 采用：`corpus_id_for` 改为**单射且限长**（如 `slug + sha1(rel)[:8]`，总长 ≤120 对齐 `ChatRequest.corpus_id`）；重命名默认库优先走 `CORPORA` 显示名，不改目录；目录搬迁作为独立操作并显式处理引用（K6b）。
- 理由：当前 `corpus_id_for` 把 `/`、空格都替换为 `-`（`corpora.py:46`），`a b/` 与 `a-b/` 撞同一 id，`find_corpus` 取首个匹配会串库；未限长会使超长库名无法用于 chat。
- 状态：**已实现（K6a）**。`corpus_id_for = slug(≤111) + "-" + sha1(rel)[:8]`，单射且总长 ≤120；测试断言 `a b` 与 `a-b` 不同、超长名 ≤120。

## 多库 read/file 必须按 corpus（2026-09-22）

- 采用：`GET /api/documents/{doc_id}` 与 `/file` 增加可选 `corpus`（或按 doc_id 跨库定位），与列表接口一致。
- 理由：当前两者只用默认库（`main.py:312`、`main.py:266`），切到非默认库后引用跳页/原文预览 404；这是已实现的 U2/U7 缺口，K7/K9 多库预览的前置（K0b）。
- 状态：**已实现（K0b）**。两个接口接受可选 `corpus`；未知库返回 404，不再静默回退默认库；前端 `documentPreview.ts`/`PdfViewer` 传递当前库 id。测试见 `tests/test_corpora_state.py`。

## 上传安全与配额（2026-09-22）

- 采用：上传用 multipart、流式落盘；单文件上限与 `MAX_PREVIEW_BYTES`（200MB）对齐或单列；设置单库配额；文件名规范化与路径穿越防护；并发导入复用 `import_lock`。
- 理由：上传是新的写入口，需与现有预览/工作区限制协调，避免超限与竞态。
- 状态：**上传部分已实现（K7）**：multipart 流式落盘、单文件 200MB（`MAX_PREVIEW_BYTES`）、名称规范化与路径穿越防护（`safe_file_name` + `is_relative_to`）、复用 `import_lock`。**单库配额未实现**，待后续（K7 完整）。

## 存量库首次回填为一次性成本（2026-09-22）

- 采用：K1 的文件清单与 K10 的检索缓存在存量库首次引入时会全量回填（清单为空视为全新、缓存为空则重建）；这是一次性成本，不计入优化后的稳态，验收需剔除。

## 非默认库同样建 dense 索引（注释订正，2026-09-22）

- 事实：`knowledge_for` 为非默认库设 `vectordb_dir`（`main.py:154-159`），`Knowledge.__init__` 在 `EMBEDDING_PATH` 非空时即建 `DenseIndex`（`knowledge.py:54-56`），与默认/非默认库无关。
- 订正：`src/main.py:370-371` 旧注释 “Non-default corpora currently search BM25-only…” 与实际不符（方案 A 之前的旧情形）且引用已删除的 plan H；改为“每个库用各自 `vectordb_dir`，非默认库在 `EMBEDDING_PATH` 非空时同样建 dense”。
- 性质：仅注释订正，无行为变更，不影响测试。

## 文档与本地数据布局（2026-09-22）※已被「语料目录自包含方案 A」取代

> 保留备查；当前布局以「语料目录自包含方案 A」为准。

- 采用：长期开发文档只维护三份——[`PROJECT.md`](PROJECT.md)、[`ITERATION.md`](ITERATION.md)、[`DECISIONS.md`](DECISIONS.md)；需求、契约、计划与完成证据已并入这三份，历史与过程材料不再单独维护。
- 本地数据按用途分开：`.knowledge/`（原始语料）、`.data/`（数据库/向量库）、`.demo_langchain/`（演示语料：`langchain_dox`/`langchain_vectordb`/`langchain_datadb`）。
- 理由与代价：减少并存文档数量，避免同一结论多处维护；代价是 PROJECT/ITERATION 篇幅更大，需要纪律性地只保留有效信息。
- 影响：仓库 `README.md`、`.env.example`、`.gitignore` 同步；`.knowledge/`、`.data/`、`.demo_langchain/` 数据默认不入库。
- 替代关系：取代此前 `dev_logs/` 多文档结构与 `knowledge/` 单目录同时存放原始语料与派生数据的约定。

## 数据库与向量库分离（2026-09-22）※方案 A 下由库内目录承担

- 采用：新增 `VECTORDB_DIR`，Chroma 索引路径与 `DATA_DIR`（SQLite）分离；缺省仍为 `DATA_DIR/chroma`。
- 现状：方案 A 下每个库的派生数据固定在 `<KB>/datadb`、`<KB>/vectordb`；`DATA_DIR`/`VECTORDB_DIR` 仅描述活动（默认/演示）库。
- 理由与代价：支撑 `.data/`/`.demo_langchain` 的数据库与向量库分目录布局；代价是多一个配置项。
- 影响：`src/agent/config.py`、`src/knowledge.py`、`.env`/`.env.example`、仓库 `README.md`。

## 任务系统取代自动意图分类（2026-09-21）

- 采用：移除自动意图分类与 `query_routing`/`evidence_level`/`execution_mode`；每轮固定专业问答，回答职责由用户显式选择的 task1–4 决定；task4 不在 chat 生成正文，走报告入口。
- **部分被取代（2026-09-22）**：“task4 不可输入”被「任务 = 输出契约」取代——task4 允许自由文本输入走 intake；**“正文不在 chat 生成”保留**。
- 理由与代价：用户显式选择比模型猜测更可控、可解释，且不新增分类模型调用；代价是会话创建时需先选任务，不再有自动路由。
- 影响：`ChatRequest` 用 `task_id` 取代旧策略字段；任务提示词放 `src/prompts/`（base 硬约束 + 各任务契约）。

## 知识库隔离为过滤的前置（2026-09-21）

- 采用：引入"知识库"实体（目录 + 独立 SQLite + 独立向量索引），每会话绑定一个库，库内文档范围由 `allowed_doc_ids` 细化。
- 理由与代价：多套语料混装会使领域/年份过滤失去意义；代价是需库注册、库选择与切库越界清理。
- 影响：`GET /api/corpora`、按库导入、`GET /api/documents?corpus=`、chat `corpus_id`。

## PDF 阅读器降级（D6，2026-09-21）

- 采用：因环境无法安装 `pdfjs-dist`（Windows npm × WSL 符号链接冲突），PDF 预览改用浏览器原生渲染（`/file` + `#page=`）。
- 理由与代价：可离线推进阅读与引用跳页；代价是缩放依赖浏览器工具栏。
- 替代关系：换装 PDF.js 时仅替换 `PdfViewer` 内部实现，不改上层契约。
