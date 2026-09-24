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

## 知识库重命名与目录名同步（KB-5，2026-09-23）

- 采用：**规范名 = 目录名；重命名 = 目录改名 + 名称同步（`alias` 清空，UI 显示目录名）**；可选 `alias` 按稳定 id 持久化（未重命名时可显示友好名）。`corpus_id` = 持久化稳定 id（回填 `id=corpus_id_for(rel)`）；重命名 = 目录改名 + 文件型 origin 前缀重写（保留 `doc_id`）+ 保留 id。
- **T1/T8 doc_id 解耦**：保留 `doc_id=sha256(origin)` 定义，但 `Knowledge.put(doc, doc_id=)` 支持显式 id、`import_defaults` 对清单内文件传 `files.doc_id` **原地更新**；重命名重写 origin 保留 id → **再导入（含 force）不产重复行/孤儿 chunks**；不做存量 doc_id 批量迁移。
- **T2 原子/锁**：改名在 `import_lock` 内串行；导入中 → 409；DB 事务 + 失败回滚目录。
- **T3 孤儿（KB-5d）**：`/api/corpora` 标 `missing`；默认解析跳过；会话 `corpus_id` 悬空 → 提示“重新关联/解绑”，不静默 404。
- **T4 alias**：不删显示名，按 id 存 alias（UI 优先显示）；**旧 rel-keyed 的 `name` 必须迁移为 alias**。
- **T5 边界**：Windows 保留名/尾随点空格/符号链接拒绝；大小写改名两步临时名；与扫描/导入串行。
- **T7 DEFAULT_CORPUS**：按 id 解析，保留 rel 回退（旧 `.env` 写 rel 仍可）。
- **KB-5c 取消**：alias-by-id 已满足 T4；**不做**“名称/目录批量对齐迁移”（原 T6）；若需对齐，走显式 alias 编辑。
- 理由：`corpus_id` 原由 rel 派生、`doc_id=sha256(origin)`，直接改目录会级联失效；稳定 id + origin 重写 + `put(doc_id)` 消除级联。
- 取代：「知识库重命名语义（2026-09-22）」中“仅改显示名/目录搬迁暂缓”的部分。
- 状态：**KB-5a/5b 已实现**（`8d6ff0a`，108 passed）；**缺陷待修**：旧 `{rel:{name}}` 未迁移为 `{id:{alias:name}}` → 4 个友好库名丢失（应补 `name→alias` 迁移 + 扫描回退 `alias or name`）。**KB-5d 待做**。规格见 [`ITERATION.md`](ITERATION.md) §11.6。

## 多知识库会话（≤6，已纳入首期）（2026-09-23）

- 采用：`ChatRequest` 增 `corpus_ids: string[]`（1–6），与 `corpus_id` **二选一**（同送 422）；缺省 = 默认库。`SessionData.corpus_ids?` 可选（缺失回退 `corpus_id`）。
- **C 两个概念**：**基础库**（单选，文档库浏览/当前库，= `corpus_id`）vs **检索集合**（≤6，`corpus_ids`，默认 = {基础库}，基础库必含）；**切基础库 → 重置检索集合**。
- **B 融合算法（KB-4a，BM25-only）**：`retrieve_multi(knowledges, ...)` → 每库 `select_reports` → **按报告排名 RRF**（不比较跨库原始 BM25 分）；报告键 `(corpus_id, doc_id)`；跨库同项目/同 origin 去重；`MIN/MAX_REPORTS` 与 `CONTEXT/REPORT_TOKENS` 为**跨库全局**；`allowed_doc_ids` 按 `doc_id→corpus_id` 归属校验（越库拒绝）；`sources` 带 `corpus_id`；任一库 matched 即 matched。
- **dense 延后**（各库 Chroma 分不可比）；**报告入口**首版仍单 `corpus_id`，多库报告 **422 拒绝**。
- 理由：用户需求（`.knowledge/` 已有多库、基金按领域拆分）；旧 `corpus_id` 保留兼容。
- 取代：**取代** `PROJECT §1「首期不做跨库联合检索」`；已同步 `PROJECT §1/§4.2`。
- 顺带（小改进，不改后端）：KB-1 默认库会话确认、KB-2 Composer 内新建/切库、KB-3 拖拽多文件（**复用 K7 端点 `POST /api/corpora/{id}/files`**）。
- 状态：**已确认纳入首期**（用户需求）；规格见 [`ITERATION.md`](ITERATION.md) §11.7（KB-4a–c）。

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
  - **M3 run_id 生命周期**：来源 = chat turn 的 `runId`（已存在，随会话持久化）；**重试同 `run_id` → 返回既有（200，`idempotent=true`）**；**重新生成 → 新 `runId` → 新报告（201）**；同 `(session_key, run_id)` 但参数不同 → **幂等优先，返回既有（200）**，不 409。（**2026-09-23 被 W3-A 取代**：参数不同改为请求指纹冲突返回 409；同参数重试仍返回既有报告。见「W3-A 最小运行快照」。）
  - **M4 列表**：`GET /api/reports?session_key=&run_id=&limit=`；`created_at DESC`；`limit` 默认 20 / 上限 100；**仅元数据**（`report_id/created_at/session_key/run_id/corpus_id/template_id/domain/year_from/year_to`，不含 markdown）；未命中 `200 []`。
  - **M5 清理陈旧文档**：`reports.py:5` docstring「#10 is still open」与 `main.py:81` 注释一并更新。
  - **M6 已知限制**：报告无删除；`reports.sqlite3` 与应用级 `workspace.sqlite3` 同在 `STATE_DIR`；单用户可接受，列表 `limit` 缓解，后续可加清理。
  - **M7 校验口径**：`session_key` 服务端**不强制**；“chat 入口必发”是**前端流程约定**，不得加服务端必填校验。
- 附带修正：`main.py:81` 注释「task4 is deliberately absent」已过期，应改为“task4 允许输入、走 intake，不生成正文”。

## 任务 = 输出契约，不是输入闸门（2026-09-22，规划）

- 采用：四个任务（task1–4）都保留自由文本输入；输入禁用只由运行时状态（busy/离线/未就绪）决定，**不由 task 决定**。**约束对象是正文生成，不是输入**：task4 正文仍不在 chat 生成，chat 只做 intake。
- task4 分两阶段：**interim** 走确定性「报告参数采集」（原“缺参一条消息列全”已由下文“安全默认 + 可见范围 + 一次点击生成”取代；只追问主题/报告库/范围的真正阻断项）；**E 就绪后** 由报告入口生成。
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


## 产品闭环优先与旧规划收口（2026-09-23，设计采用，实施待验收）

- 来源：用户要求以管理/设计角色梳理下一步，仅写文档指导编码 agent；代码核对基线 `8c40a0a`。实施与验收统一见 ITERATION §13。
- 选择：先修上传同名保护、失效库与报告范围准确性，再接通多库前端/上传队列，最后验收报告和引用阅读；复用现有单文件端点与检索路径，不启动新架构。
- 上传本阶段同名拒绝，提示改名；失败不得损坏旧源文件。**取代 §11.5/原 KB-3“后端不改”的限制**，因为现保存代码直接 `wb` 写入同名路径。代价是暂不提供原位替换，换取清晰可验收的数据保护边界。
- 缺失库要求重新选择；**取代旧 KB-5d“解绑（用默认）”的静默回退语义**。显式选择可以确认新范围，不能自动替用户选库。
- 严格报告年份与类别由可验证元数据过滤，不靠提示词；无可验证年份不混入严格范围。保留单库报告限制并显式提示，多库报告仍是未完成需求，不将用户多库任务需求标为全部完成。
- K9 原 PDF/Markdown/TXT 已有实现；先验收现有阅读，DOCX HTML 延后。K10 原逐页窗口缓存方案已不适用于 L 检索，不照旧实施；有测量依据后仅优化当前路径。
- 状态更正：`6810450` 已实现 name→alias 修复；`82da218` 已有多库后端；`8c40a0a` 已有 missing/409 后端。旧“待做”描述只作为历史，不据此重复开发。以上均为代码核对，未声称本轮运行通过。


## verifier R1–R7 收口（2026-09-23，设计采用，实施待验收）

- 沿用最小 KB-4，基础库包含于检索集合由前端会话恢复与所有发送入口保证；不增加 base_corpus_id，不宣称二选一 API 已校验基础库。理由：基础库是浏览/上传状态，服务端以显式检索集合为权威；代价是直接 API 不具备浏览范围一致性保证。
- 报告继续单库，但必须显式确认独立报告范围，不静默使用基础库或首库；多库 intake 不默认首库领域。全局限定文档按库求交，UI 聚合所选库文档。完整行为与验收仅在 ITERATION §11.7/§13.7 维护。
- 迁移不另建启动流程：现有扫描需识别原始记录格式变化并安全写回；读时兼容不能代表磁盘已规范化。补持久化回读/幂等验证，不能以显示名正常代替落盘证据。
- R6 错误包装以 PROJECT §4.5 为准；R7 沿用会话级确认与原 K7 上传端点。上述为审核处置结论，非本轮实现或测试完成声明。


## 实施反馈：P0 收尾与报告元数据阻塞（2026-09-23）

- 实施者报告 P0-A 同名保护/超限临时文件处理/新 Markdown 回读、P0-B R1 规范化持久化均已有代码和指定测试通过；证据及未覆盖场景仅在 ITERATION §13.8/§13.9 维护，本规划作者未独立复核。
- 接续先补上传解析失败提示与中断路径，再做会话级首次确认/缺失库恢复，随后实施多库前端与上传队列。
- 报告年份/类别没有可信元数据来源。暂停 AC-05 功能实现，先做限定范围只读调查；文件名项目起止年份不得代替报告年份。调查无果则明确等待产品提供字段来源/标注口径。此阻塞只影响严格年份/类别过滤，不冻结其他产品闭环。


## verifier V1–V7 复核裁决（2026-09-23）

- R1 状态更正：规范化能力和临时库持久化测试已报告完成；真实库仍是旧格式，真实扫描后确认四个基金 alias 和磁盘 id-keyed/alias 才算迁移闭环（AC-08）。
- 项目文件名中的两个年份是项目起止年份。用户可见标签应立即明确为“项目起止年份（按文件名推断）”或隐藏；真实报告年份筛选仍等可信来源调查，不因改标签而假装过滤已完成。
- `corpus_confirmed?` 与 `corpus_ids?` 作为一个会话 schema 契约共同设计和兼容，覆盖旧记录/default/restore/save；不能分两个实现轮次改字段。
- `base∈set` 是前端会话不变量。直接 API 不含基础库字段，服务端不校验；所有前端发送入口逐一验证并用请求体断言。
- 上传中断用发布前失败/取消验证原子性，不强求不稳定 TCP 中断测试；解析失败以 files.status=error 和可重试 UI 表达。
- 实施者应自行提交其代码/测试/文档批次。本规划维护者不代提交未审阅实现。细节和状态只在 ITERATION §13.10 维护。

## task1–4 任务模式完善规划（2026-09-23，设计建议待实施）

- 任务菜单补适用背景、输入示例、产出预览和可见可编辑默认值；任务意图保持显式选择，不启用自动分类。任务参数和历史输出快照按会话兼容保存。
- （原任务规划，后经 C3 收紧）基础库登记领域仅作为可见建议；task1 默认不加时间过滤；task2/task3 近五年项目起止年份窗口原拟作默认值，现仅为 UI 建议且默认不生效过滤；task4 报告年份按填表日期年份（报告提交时间）过滤，默认同样近五年。项目周期和填表日期口径分开显示。
- task3 预测视野建议默认未来三年，输出明确是定性推断；频次/数值只由可复算统计产生。
- task4 默认综合模板、类别不限、所选单库内全部文档；多库会话显式选择单库。四个现有模板保留为唯一章节权威，扩充章节目的/证据规则，不建模板管理平台；仅 Markdown。
- 详细契约、默认、模板和验收集中于 ITERATION §14；本节记录决策摘要。状态为规划，非实现或验证完成。

## 实施者接续与报告日期口径（2026-09-23）

- 用户确认“报告年份”按填表日期年份（报告提交时间）解释。任务采集回显该口径；报告生成按解析 Markdown 的显式填表日期筛选，按显式资助类别精确筛选，缺失日期排除并披露数量。当前依据 MinerU 文本；实施者抽查 3 份原 PDF 首页一致，但总体 OCR 错误率未量化，不得声称逐份核对。
- 会话检索集合与多库报告单库确认按 ITERATION §13.12 实施；基础库属于集合仍是前端不变量。此决策记录用户口径和实施边界，浏览器/真实模型验收状态以 ITERATION 为准。


## 实施状态回填：真实迁移与报告日期字段（2026-09-23）

- verifier 独立全量 `pytest tests -q` 116 passed 属于更早基线；本轮 verifier 对当前基线独立报告 120 passed。实施者另报告 71 项后端定向测试、29 项前端测试、tsc 与生产构建通过。三组范围分开记录；浏览器和真实模型报告仍待验收，构建有既有 chunk-size/dynamic-import 警告。
- R1/AC-08 已从“临时库通过、真实迁移待做”更新为：备份后真实 `GET /api/corpora` 扫描，四个基金库 alias 回读正常、磁盘规范化、二次读取稳定。证据见 ITERATION §13.11。
- 报告年份口径现在明确为用户确认的填表日期年份（报告提交时间）。字段来自 MinerU Markdown `填表日期`；基金类别来自 `资助类别`；缺日期排除计数、指定类别精确匹配。35 份 Markdown 字段可见、3 份 PDF 首页抽查吻合不代表总体 OCR 准确率。
- task4 默认时间窗口已从项目周期口径改为填表日期年份；task2/task3 的五年项目起止年份窗口目前只作为界面建议，不得默认过滤。任务菜单、参数摘要、四模板说明和报告浏览器/真实模型验收尚未完成，继续按 ITERATION §14 与 §13.13 接续。

## verifier C1–C5 规划更新（2026-09-23）

- AC-05 拆为 AC-05a 确定性过滤行为与 AC-05b 元数据可信度。前者按实施者定向测试报告记为通过；后者只有 35 份 Markdown 字段可见和 3 份 PDF 首页抽查，属于有限证据，跨版式/扫描件命中率、误识别率及未命中清单仍待验收。
- 解析字段提取计划增加 Markdown 表格/加粗/行首符号归一化、受控标签别名、每库命中/缺失统计与未命中清单，以及表格 fixture；只在字段标签值内取日期，避免全文任意年份误配。
- task2/task3 近五年项目周期暂为显示建议，不得静默缩小检索范围。将来仅在用户显式启用且服务端按项目起止区间重叠过滤、回报计数后实施。
- 任务模式首批限定 T-UX/T-STATE 最小集，暂不引入完整 task 参数/artifact schema、长度/语言旋钮或全套 `task_settings`；沿用现有会话字段与安全兼容规则。
- reports 迁移后新增列空值代表历史数据未记录。UI 显示“来源库未记录”，不推断当前库；查询参数省略与显式空串语义分开，见 ITERATION AC-11。

## C1–C5 实施反馈（2026-09-23）

- AC-12 已按受控别名和 Markdown 常见格式实现；字段冲突不任意择值，报告卡可查看按库覆盖数和未命中文档标识。覆盖统计只说明解析文本字段可见性，不代表 OCR 准确率，AC-05b 仍未通过总体可信度验收。
- T-UX/T-STATE 第一批沿用既有状态字段和 UI，只为注册任务补一条用途与简短示例；task2/task3 五年窗口继续不触发检索过滤。
- AC-11 的旧报告来源回退和省略/空值查询语义已实现并由定向后端用例覆盖。浏览器交互验收未运行，范围和证据记于 ITERATION §13.15。
- 只读扫描 36 份现存解析 Markdown 未发现目标字段表格或跨行标签/值布局；AC-12 暂限标签和值同一行，不传播到后续表格行。浏览器走查工具因 WSL 工作区无法初始化而未完成，详见 ITERATION §13.17。
- 新增 5 份跨目录/类别/年份 PDF 首页视觉抽样中发现通用“类别”别名可与正文非基金字段冲突；字段提取现限在报告头元数据区，回归测试覆盖正文重名标签。5/5 样本类别和日期年份吻合仍属有限证据，AC-05b 不改为通过。

## verifier V1–V5 修订（2026-09-23）

- 浏览器验收不受 Chromium 缺失阻塞：Python Playwright 脚本与 Chromium 缓存可用；`node_repl/computer-use` 才受 WSL 文件 URI 限制。旧 `browser_tasks.py` 实测在当前 UI 的首次库确认门控处无法发送，且 `/api/documents?corpus=` mock 未匹配、请求断言仍用 `corpus_id`；后续先更新既有 `tests/browser_*.py` 再逐项验收。
- 报告头解析不可只把现有 H2 停止规则换成首个任意 heading：35 份基金 Markdown 都以 H1 标题开头，头部元数据在其后。拟保留一个首 H1 标题，遇到其后的任意级标题即停止；无章节边界时以 64 行硬上限失败关闭，并用无 H2/后续 H1 正文标签负向 fixture 锁定。
- AC-05b 采用有限抽样退出规则：至少 20 份、覆盖每个非空主题目录×扫描质量×年份分层；报字段正确命中/错误/误配/缺失/歧义率及 95% Wilson 区间。区间跨阈值时只扩不确定层，最多核验现存 36 份；上限后不确定则如实保持有限/未通过。
- 当前 verifier 报告全量 `pytest tests -q` 126 passed；实施者 17 项为本批定向测试，分别记录、不互相替代。

## 实施接续：真实报告头、离线浏览器与 PDF 核验（2026-09-23）

- 实际 Markdown 前部包含页图/未标注页眉及连续双 H1，之后才是类别和日期。解析实现允许元数据前的连续 H1 标题块，标题块结束后任意 heading 截止；无章节标题最多读 64 行，并由真实双 H1、单 H1 正文和越界正文 fixture 固定边界。定向测试 17 passed；本轮全量测试 126 passed。
- 逐份核对当前可用 35 份源 PDF 首页与 Markdown：类别 35/35、填表日期年份 35/35；没有观察到误识别、误配、缺失或歧义。每字段 35/35 的 Wilson 95% 区间下界 90.1%。分层含农业 2025/2026、医疗 2025/2026、机器人 2024/2025、金融 2025，共 7 个非空主题×年份层；所有扫描首页可读。`parsed/_pilot/markdown.md` 无源 PDF，未纳入 PDF 准确性分母。AC-05b 仍不通过总体可信度验收，阈值尚未定义，且此核验不能外推其他语料。
- 四个既有离线 Playwright 脚本均通过，新增的浏览器场景覆盖 task4 报告生成/恢复/复制/下载、旧报告来源回退、AC-12 覆盖清单、基金年份标签和引用页跳转、键盘退出、重复上传失败提示与单项重试。未做批量拖入四类文件、发布前取消、来源版本变化、缺文件或真实模型报告。
- 构建命令因 WSL 启动 Windows npm 后 CMD 无法从 UNC 工作目录执行而未通过/未完成；本轮未改前端业务代码，浏览器使用现有 `frontend/dist`。本机 API 端口 8000 未运行，所以没有真实模型闭环证据。

## S8 PDF 预览缺失文件检查补充（2026-09-23）

- 保留引用点击时基于当前文档列表的版本比较；PDF 打开时再对 `/api/documents/{id}/file` 发 HEAD，以识别 metadata 仍在但原文件已删除/移动、或打开前版本发生竞态的情况。HEAD 与 GET 共用路径、版本、类型和大小校验，只回状态与长度，不拉取 PDF 字节。
- 这将 S8 的“不预探 `/file`”具体化为“不预先 GET/下载原文”；读取最多 200MB 原文来探测仍禁止。错误码 404/422 在预览面板显示可操作提示，失败不创建 iframe。临时 API 测试核对 200/404/422，离线浏览器 mock 核对提示和无 iframe；没有声称真实服务端浏览器联调。

## 知识库目录同名与免默认设置（2026-09-23，用户要求；主干已实施、收口待验）

- 取消默认库设置/徽标与 KB-1 首次确认。新对话按实际子目录名固定升序选首个存在库；首库为空时明确引导添加资料，不自动改选其他库。有效旧会话继续使用其范围。历史 DEFAULT_CORPUS 兼容读取但不再支配新选择。
- 对话只暴露 1–6 库集合，替代基础库强制包含、切基础库重置集合的旧规则。上传始终明确一个目标库，与会话多库检索解耦；task4 报告单库确认继续保留。
- 库名唯一来源为实际目录名；旧 alias 不再优先展示，不用 alias 自动改写真实目录。既有 name→alias 迁移曾按旧要求完成，保留历史事实；本次改变显示契约。应用内改名仍保持库/文档 id 和引用；外部改名不能猜测 id 对应，由用户明确重新关联。
- 总览与详情的“刷新”统一发现目录/文件变化并增量入库；添加文档保存后自动处理。复用现有 files/ingest 与 job，不引入常驻监听和强制全库 OCR。详细交互、失效处理和验收唯一维护于 ITERATION §15。
- 当前实现与证据已回填 ITERATION §15：临时 API/知识库浏览器检查及隔离服务 Markdown 导入和预览通过；独立审核发现全量回归、任务/分支脚本、总览状态计数和快捷添加入口仍待 §15.7 收口。真实 PDF/DOCX 解析组合与真实模型继续作为未验边界。

## 五入口工作台、统一检查器与一等成果（2026-09-23，产品决策；待实施）

- 采用：一级产品入口固定为对话、知识库、任务、成果、Prompt / Skill。右侧区域是跨入口的上下文检查器，统一资料、引用、模板、执行信息和成果预览，不再让知识库详情、文档和报告各自发展一套叠加抽屉。
- 采用：任务模板与输出模板分离；所有影响范围和结论的默认值在执行前可见、可改，并保存到运行快照。成果成为带状态、版本、来源运行和引用快照的一等对象，报告只是成果类型之一。
- 采用：Prompt 与 Skill 共用入口但保持不同契约；Skill 包含输入、规则、Prompt、受控工具和输出。首版不允许任意代码、插件市场或隐式全网访问。
- 采用：网络资料是显式资料来源，默认关闭；指定 URL 或搜索结果保存抓取时间与快照后再参与引用。执行过程只展示可观察阶段和指标，不展示或虚构私有思维链。
- 理由：现有知识库/对话能力已经形成主链路，但任务固定、中央报告页与真实后端状态矛盾、成果和 Skill 缺少对象模型，多套右侧浮层也会随新功能继续分裂。先统一信息架构和数据关系，能让后续增量复用同一交互语言。
- 代价：自定义任务、成果版本、受控网络搜索和 Skill 分期交付；不以一次性重写换取表面完整。详细现状、对象契约和 W0–W7 退出条件见 ITERATION §16。
- 阶段依赖修正：成果依赖最小 `RunSnapshot`，因此 W3 先持久化服务端实际采用的任务/范围/资源策略/模型/状态，再创建 Artifact；task4 报告使用独立 child run 指向 intake run，重试复用、主动重生成换新 id。W4 扩展任务版本，W5 只统一交互，不能把追溯推迟到后期。
- 报告范围修正：W0 仅恢复当前会话报告的真实列表、预览和导出，W1 改产品外壳但仍标“本会话成果”；省略 `session_key` 的跨会话查询和全局成果库属于 W3。
- 网页范围修正：现有单 latest-preview、首库绑定接口不足以直接接 UI。W6 必须先支持目标库或运行绑定、多预览隔离、持久快照及 Source/RunSnapshot 回读，再实现 URL 界面和受控搜索。

## tools/ 个人脚本归属（2026-09-23，用户决定）

- 采用：`tools/get_nf_pdfs.py`（从 `kd.nsfc.cn` 取 NSFC 结题报告）与 `tools/split_knowledge_corpora.py`（一次性拆分 `.knowledge/自然科学基金`、复用 `parsed/`、重建 `datadb/`+`vectordb/`、删旧库并重写 `corpora.json`）**保留在仓库**，标记为**用户个人脚本记录**，不属于应用运行时代码，不参与业务逻辑与常规检查。
- 说明集中写在 `tools/README.md`（用途、dry-run、破坏性警示、依赖与数据布局来源）。
- 理由：两脚本用于取数与一次性数据布局，复现语料来源需要；但不应进入业务范围，故不并入 `src/`/`tests/`。
- 影响：W0「工作树归属」不再把两脚本当作待决项；`split_knowledge_corpora.py` 是当前四领域库布局、`corpora.json` 与 `parsed/` 复用的产生者，其版本应结合 git 历史理解。

## W3-A 最小运行快照（2026-09-23）

- 采用：`RunStore`（`STATE_DIR/runs.sqlite3`）按 `run_id` 持久化最小快照：契约版本、`session_key`、`parent_run_id`、运行类型（chat/report）、状态、`task_id`、模型、资源策略（首版 `local_only`）、请求/服务端有效 `corpus_ids`、`allowed_doc_ids`、用户可见参数与来源、输出意图，以及完成后的 `ended_at`、usage/telemetry 指标和引用版本（`doc_id`/`corpus_id`/`version`/`title`/`page`）。服务端解析后的有效范围是权威值。
- 请求契约向后兼容：`ChatRequest` 增可选 `session_key`、`run_context`；`ReportRequest` 增 `parent_run_id`。旧客户端省略时按 `local_only`/“未记录”处理，不伪造。
- 幂等与冲突：每个 `run_id` 绑定一个请求指纹；不同指纹复用同一 `run_id` 返回 409，避免一个快照代表两次不同执行。**chat 同指纹不再静默重跑覆盖**：`created=False` 时运行中或已终态均 409，要求换新 `run_id`；重放已完成回答属 W3-B Artifact。**取代** #10 M3 中“同 `(session_key, run_id)` 参数不同 → 幂等优先返回 200”的报告语义：报告先做指纹校验，再按“已保存→200 `idempotent` / 生成中→409 / 失败→安全重试”分支。
- 报告父子关系：报告是独立 child run，`parent_run_id` 指向 task4 intake 的 chat run；首次生成与安全重试复用稳定的 report run id，用户主动“重新生成报告”才换新 id。前端用 `${intakeRunId}-report` 作首次/重试 id，重新生成用新 UUID。
- 创建快照失败不得生成“可追溯成果”；旧会话/旧报告无快照时 `GET /api/runs/{id}` 返回 404，界面显示“运行信息未记录”，不补造。
- 快照写入不阻断回答：只有 `RunConflict`（同 `run_id` 不同指纹）返回 409；其它快照写入异常只记日志，回答/报告仍继续，读取回退为“未记录”（对应 §16.10 W3 退出条件）。
- 理由：成果（W3-B/W4/W5）必须能回到当时实际采用的任务、范围、模型和指标；先把可追溯的最小结构落地，再建 Artifact，避免后期回填关系。
- 有效范围回传（A2）：SSE 流开始处新增确定性 `run` 事件，携带 `effective_corpus_ids`/`model`/`resource_policy`/`session_key`；前端记录到该轮 `runInfo`，检查器执行摘要显示“服务端实际范围”。请求声明仍非权威。
- 派生 report run id（A5）：首次/安全重试用 `${intakeRunId.slice(0, 72)}-report`，保证不超过 `run_id` 上限 80。
- 执行摘要回读（B2）：检查器打开执行摘要时调用 `GET /api/runs/{id}`，快照存在则优先展示其权威字段，404 显示“运行信息未记录（历史运行或快照写入失败）”。
- 影响：`src/runs.py`（新增）、`src/main.py`（chat/report 接线、`GET /api/runs/{run_id}`、`run` 事件）、`frontend/src/api.ts`/`conversation.ts`/`store.tsx`/`MessageView.tsx`/`Inspector.tsx`。测试 `tests/test_runs.py`；浏览器断言 chat `session_key`、报告 `parent_run_id`/独立 report run 与“服务端实际范围”。W3-B（Artifact、跨会话报告/全局成果、DOCX）仍待做。

## W3-B 最小 Artifact 与成果兼容读取（2026-09-24）

- 采用：新增应用级 `ArtifactStore`（`STATE_DIR/artifacts.sqlite3`），`Artifact` 为 `answer_snapshot`/`report` 两类，按稳定 `artifact_id` 记录类型、状态、标题、当前版本、`session_key`、`run_id`、`corpus_ids`、任务/模板、导出与失败原因；`artifact_versions` 追加式版本，新版本不覆盖旧版本。引用沿用关联 `RunSnapshot.citations`，“逐条引用落库”列为可选项。
- 兼容读取：现有 `reports` 表不改写；未关联 Artifact 的历史报告在 `GET /api/artifacts` 中以 `report:<report_id>` 只读合成，缺 `run_id`/`corpus_id` 显示“未记录”。
- 落库与关联：`POST /api/artifacts` 保存回答快照时必须引用已持久化且已完成的 chat run；`run_id` 存在只是必要条件，不能证明客户端提交的正文或范围真实。服务端以 RunSnapshot 的会话/任务/有效库/引用为权威，并核对首版正文与该次实际输出；旧运行无法核对时显示“输出未核验”，用户修订另建版本。task4 报告成功后由报告流程创建 `type=report` 的 Artifact 并关联其 run。此条于 2026-09-24 根据实施核对**修正**首切片“仅校验 run 存在”的口径；实现与验收见 ITERATION §16.17。
- 列表语义：`GET /api/artifacts` 省略 `session_key` = 全局，显式空串 = 空会话筛选，指定值 = 过滤；三者在测试中分列。
- 导出：新增 `src/docx_export.py` 生成**真实 OOXML** `.docx`（标题/表格/段落），旧 HTML `.doc` 回答导出保留；PDF 后置。
- 成果页 IA：中央“成果”页与右侧检查器，沿用五入口；全局成果列表默认跨会话，提供当前会话筛选；实现与边界见 ITERATION §16.17。
- 影响：`src/artifacts.py`、`src/docx_export.py`（新增）、`src/main.py`（artifacts 接口与报告自动建件）、`frontend/src/api.ts`/`store.tsx`/`ListingViews.tsx`/`Inspector.tsx`/`MessageView.tsx`/`ChatView.tsx`。测试 `tests/test_artifacts.py`；`browser_tasks` 与 `browser_artifacts_live` 覆盖保存、失败重试、版本、全局预览及隔离恢复。A7 采用成组备份、不自动清理的首版策略；自动归档/清理由后续阶段按迁移与恢复证据另立项。

## W4 自定义任务与输出模板启动边界（2026-09-24，规划已采纳，W4-A 首切片已实施）

- 依据：用户明确要求完善自定义任务和模板并指导下一步；这取代 ITERATION §16.15 对 **W4** 的“等待真实使用证据”门槛。不能从这一要求推断六类新报告形态、W6 网络搜索或 W7 Skill 已获实施依据。
- 采用：用户任务有独立身份与不可变发布版本，并显式绑定一个已有 `engine_task_id`（task1–task4）；检索/图分支沿用该执行模式，任务说明与参数受 `base.md` 和服务端校验约束。输出模板与任务分开管理，内置四模板只读、自定义模板从其复制并独立版本化；会话、RunSnapshot、报告与成果固定记录实际采用的任务/模板版本和参数来源。
- 理由与代价：当前 `ChatRequest`/`ReportRequest` 和图/检索分支均硬编码内置 ID；把自定义卡片直接当新 task id 会产生错误路由或隐式回退。需增加定义存储、版本解析、请求接线和旧会话回读，但不扩展新的执行管线。交互与分批验收见 ITERATION §16.18。
- W4-A 首切片采用应用状态库 `custom_tasks.sqlite3` 保存草稿和不可变版本；只复制 task1/task2，服务端将自定义 ID 映射到现有引擎 ID，再执行图/检索。运行与会话保存固定版本；编辑草稿不改已发布版本。报告模板接线仍按 ITERATION §16.18 的 W4-B 实施。
- W4-A 参数补齐：类型化任务输入走独立 `task_params` 字段；W3 的 `run_context.visible_params` 仍是运行摘要，不能覆盖任务字段。服务端按发布版本校验并合成默认/用户来源；不把任务参数解释为知识库范围、模型或联网权限。报告模板仍待 W4-B。

## W4-B 自定义输出模板与报告绑定（2026-09-24）

- 采用：输出模板成为独立版本化对象（`TemplateStore`，`STATE_DIR/custom_templates.sqlite3`）。内置四模板只读，可复制为自定义草稿；草稿以修订号防并发覆盖，发布追加不可变版本，旧报告读原版本。变量仅可引用声明过的报告参数（`domain`/`year_range`/`year_from`/`year_to`/`fund_type`/`focus`），缺声明、重复或未使用均在发布前拒绝；不允许脚本/include/HTML 执行。
- 报告绑定：`ReportRequest.template_id` 放宽为字符串并新增 `template_version`；自定义模板在建 run 前解析到固定发布版本并按报告参数渲染后注入提示词，未发布/未知模板 422。运行指纹、RunSnapshot `params` 与报告 Artifact 均记录模板版本；内置模板与旧请求行为不变。
- 兼容：`template_id` 原为四类 `Literal`，放宽后仍只接受已存在模板；旧内置报告、缺 `template_version` 的历史记录读回为“版本未记录”，不补造。
- 影响：`src/custom_templates.py`（新增）、`src/main.py`（模板接口与报告解析/指纹/Artifact 版本）、`src/reports.py`（可注入模板正文）、`frontend/src/api.ts`/`components/MessageView.tsx`/`components/Inspector.tsx`。测试 `tests/test_custom_templates.py`。
- 后续状态：报告型任务固定绑定与 W4-C 生命周期/兼容收口已实施；采用与边界见下节及 ITERATION §16.21。

## W4-C 归档、固定版本与恢复口径（2026-09-24）

- 归档与发布状态分离：自定义任务/模板保留 `draft/published`，另用 `archived` 控制新建列表和编辑权限；归档不删除不可变版本。显式固定版本可继续回读和执行，归档模板不能绑定到新任务，但既有报告任务仍可使用其发布时绑定的版本。
- 报告型任务以发布版本中的模板 ID/版本为服务端权威，客户端不能改选；模板后续发布不追溯改变旧任务。报告和任务参数由服务端解析后统一进入 RunSnapshot、reports 与 Artifact，失败重试沿用同一有效来源。
- 自定义任务执行必须显式携带版本；旧会话缺版本不静默升级。用户确认升级到最新版时才修改会话绑定，并清除新 schema 不接受的旧参数。定义、会话、运行、报告和成果以 workspace/reports/runs/artifacts/custom_tasks/custom_templates 六库成组备份恢复，当前不自动清理。
- **提交门禁（2026-09-24，verifier）**：本决策的实现经 verifier 复核**暂不建议提交**——内置模板报告发送 `template_version=0` 被 422、报告 `task_params` 未进入提示/检索（P1），及草稿状态显示与 task3 复制入口两处 P2。修复与退出证据唯一维护于 [`ITERATION.md`](ITERATION.md) §16.22；提交封口前 W4 不标完成。

## task4 报告旅程：一次启动、资料预检与证据化写作（2026-09-24，用户需求；规划待实施）

- 采用：自然语言需求先变成带来源的内部运行简报，报告卡展示可见范围和“调整”；点击一次“生成报告”即启动，不另设大纲、摘要或正文逐级审批。安全默认包括单库可靠领域建议、最近 5 个完整自然年填表日期（2026 年运行 → 2021–2025）、类别不限、内置综合模板或任务固定模板。多库不取首库作为报告库；用户已讲清主题时无需因库领域登记缺失而追问。报告用途、读者、关键问题和篇幅是可改的写作参数，不变相改变服务端筛选。
- 点击生成后自动预检，与实际生成**共用资格过滤**，列入选/排除数、文件与范围指纹；零入选不调用模型，资料变化说明差异并需再点击生成，不自动放宽条件。年份/类别/文档归属及模板版本仍由服务端验证，模型只组织有证据的正文。简报和发布任务参数必须进入实际生成提示；历史成果保留任务/模板版本、参数来源与资料版本。
- 提示词和模板分工：intake 解释建议并只询问真正阻断项；生成提示围绕用户目标、读者和材料证据**内部拟纲、直接写最终 Markdown**，说明事实、推断、冲突和局限；模板只管章节，不覆盖 `base.md` 或过滤规则。“生动”不等于编造数字、案例、图片或引用。
- 本决策取代 §8.4“缺参即追问”和本节原“一次确认摘要”作为主路径；不取代 chat 不产报告正文、单库报告与多库领域规则。详细契约唯一维护于 ITERATION §8.9，实施门禁/顺序见 §16.23；§16.22 的 W4-C 阻断项先修复并提交，G10e 目前**未实施**。

## API 报告的 DOCX 管线采用 A（2026-09-24，用户提供 ABC 调研后确定；规划待实施）

- 选择：当前产品输出的是基于知识库证据的研究综合/分析报告，不是固定版式的国自然申请书。采用所附《科研文档生成Pipeline-ABC方案》的 **A：Markdown 内容源 + 单通道 Word 渲染**，复用现有 `generate_markdown → Artifact → python-docx` 基础链路；优先补好中文研究报告的样式与导出校验，再以 Pandoc `--reference-doc` 做独立样例试验，通过后作为增强渲染器。Markdown 和来源/运行记录是内容权威，DOCX 是可重复生成的派生文件；不让 LLM 输出 OOXML，也不要求用户审查中间稿。
- 理由与证据边界：仓库的 `src/reports.py` 当前一次 API 调用生成 Markdown，`src/docx_export.py` 仅保留标题、简单表格和段落，`python-docx 1.2.0` 可用；本机未检出 Pandoc、LibreOffice、OfficeCLI，因此“高级 Word 排版已验证”不成立。Pandoc 官方手册确认可从 Markdown 生成 DOCX，`--reference-doc` 提供样式、页边距和页眉页脚：[Pandoc User’s Guide](https://pandoc.org/MANUAL.html)。所附调研的 GitHub 热度、许可证和命令效果未在本项目复测，不能作为验收证据。
- B/C 取舍：B 需要把正文转换为 Office DOM 操作，C 还需母版合并和额外 QA，解决的是固定封面、预算表、签章页等严格表单问题；目前缺真实表单需求和样例，投入与失败面大于收益。未来若用户明确要求提交级固定申请书，再用真实表单样例评估 C 的独立输出档位，不暗中改变现有报告的渲染链。
- 代价与边界：A 不保证固定表单排版；Pandoc 试验通过前仅承诺 `python-docx` 实测子集。导出发生不支持的公式/脚注/复杂图表时不得静默丢内容；错误保留 Markdown 和成果版本，可只重试导出。样式母版不等同于 W4 内容模板，换样式不重新请求 LLM。具体任务与退出证据在 ITERATION §8.9/§16.23。

## W6-A 网页快照：持久快照、显式落点与共享预算（2026-09-24）

- 采用：网页资料先经**短时效预览**（多预览隔离、15 分钟有效期），再由用户显式选择落点——"入库到指定知识库"或"仅用于本次运行"，二者互斥，不设默认落点。确认后的快照持久化为 `web_snapshots.sqlite3`（URL 归一化，内容 SHA-256 同时作为版本），重启后仍可回读；引用与运行快照只记录 `snapshot_id`/版本/抓取时间，不把正文塞进会话。
- 状态不伪造：所选语料库未就绪时，有快照也可以运行，但 `preparation`、`stop_reason` 与运行记录保留真实值；原来是直接把 `chat_preparation` 改成 `ready`，会让"未就绪"在界面和成果里消失，本批删除该覆盖，改为 `resolve_policy(has_web_sources=…)` 只取消"暂不能查证"的短路提示。
- 预算共享：网页正文与本地证据共用 `RETRIEVE_CONTEXT_TOKENS`，逐快照扣减并在来源标 `truncated`；原先每份固定 `[:50000]` 字符、最多六份，可绕过预算把运行推过模型窗口。
- 代价与边界：预览仍是进程内状态（重启即失效，需重新抓取），持久的只有已确认快照；网页来源不做摘要式转述，模型只能引用快照编号。受控搜索（W6-B）未开始，不自动联网。
- 影响：`src/web_snapshots.py`（新增）、`src/main.py`（预览/确认/快照接口、chat 快照解析与运行字段）、`src/agent/graph.py`（引用与预算）、`src/agent/routing.py`（`has_web_sources`）、`src/runs.py`（`preparation`、`local_plus_urls`）、`frontend/src/api.ts`/`store.tsx`/`components/Composer.tsx`/`components/Inspector.tsx`；测试 `tests/test_app.py`、`tests/test_graph.py`、`tests/browser_web_live.py`。实施与证据见 [`ITERATION.md`](ITERATION.md) §16.27。

## G10e 与 DOCX 管线状态更新（2026-09-24）

- 上文"task4 报告旅程"决策中的 A/B/C 已随 `81bd39f`/`3c47fc9` 落地：一句话形成简报、报告卡显示可见范围、一次点击生成、生成前用与生成端同一过滤预检、零候选不调用模型、截断输出拒绝保存。D（Word 质量）只补齐 `python-docx` 的中文标题/表格/段落子集，Pandoc `--reference-doc` 试验未做，仍不得标为增强完成。
- DOCX 管线决策的选型（A：Markdown 内容源 + 确定性渲染）不变；"样式母版与内容模板分离""导出失败保留 Markdown 并可单独重试"已按该决策实现到子集级别。
