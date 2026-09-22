# DECISIONS — dox_agent 关键决策

## 预览以原始文件为准（2026-09-22）

- 采用：文档预览对 PDF 直接展示原始文件（浏览器原生 `/file` + `#page=`，沿用 D6 降级），不再把抽取文本整篇拼接渲染；Markdown / txt / Word 才走规范化正文预览。
- 理由与代价：默认（`VITE_UI_DOC_PANEL=off`）路径此前对 PDF 全量拉取规范化正文，既慢又乱，且引用页码被丢弃；直接嵌入原文件最贴近“预览文件”。代价：非 PDF 仍依赖文本抽取质量，且保留两条预览实现（原文件 / 正文）。
- 影响：`frontend/src/DocumentPreview.tsx`（PDF 分支改用 `PdfViewer`，不再走文本管线）、`frontend/src/main.tsx`（预览状态带 `page`，引用跳页将页码透传到 PDF）。
- 已知代价：`PdfViewer` 用 `key` 让 iframe 每次翻页重载整份 PDF（大文件成本高）；D6 升级 PDF.js 后改 JS 控制页码。
- 现状：Word（`.docx`）`parse_file` 的 `kind="text"`，预览走规范化纯文本 `<pre>`；“Word 转 HTML” 是 K9 目标，尚未实现。
- 修复：引用 `[n]` 与“已读证据”chip 在**默认配置**下也可点（`handleOpenSource` 不再依赖 `VITE_UI_DOC_PANEL`）；默认走 PDF 原文件预览，flag 开时走 Explorer。

## 语料目录自包含「方案 A」（2026-09-22，取代分离布局）

- 采用：每个知识库 = `CORPORA_ROOT`（默认 `.knowledge`）下一个**自包含目录**，固定三部分：`source/`（原始文件，可按领域再分子目录）、`datadb/`（该库 SQLite `knowledge.sqlite3`）、`vectordb/`（该库 Chroma 索引）。`.demo_langchain/` 演示库采用同一约定。
- 理由与代价：派生数据重建成本高（中文扫描件 OCR + 向量索引），按库自包含便于整库备份/迁移/删除，并与演示库约定统一、消除两棵树漂移；代价是库目录可写、扫描需跳过 `source`/`datadb`/`vectordb` 保留名。
- 影响：`src/agent/config.py`（`CORPORA_ROOT` 默认 `.knowledge`，移除镜像用 `DATA_ROOT`）、`src/agent/corpora.py`（`CorpusInfo` 增 `source_dir`/`db_dir`/`vectordb_dir`）、`README.md`、`.env`/`.env.example`。
- 替代关系：取代下方"文档与本地数据布局"中 `.knowledge/`（原始）与 `.data/`（派生）分离、以及 `.demo_langchain` 旧子目录名（`langchain_dox`/`langchain_datadb`/`langchain_vectordb`）的约定。
- 遗留：应用级会话库原随默认库 `datadb/`；**已由 K0 解决**（迁到 `STATE_DIR`，见下方「应用级会话库独立于语料库」）。

## OCR 模式/语言可运行时配置（2026-09-22，已实现）

- 采用：OCR 模式（`off`/`force`/`auto`）与语言（`eng`/`chi_sim`/`chi_sim+eng`）可在前端调整，不必改 `.env` 重启；默认 `PDF_OCR_MODE=auto`、`PDF_OCR_LANGUAGE=chi_sim+eng`。
- 理由与代价：基金报告多为中文扫描件，旧的固定 `eng` 质量差；代价是新增运行时配置接口，并需明确“仅影响后续导入”（已入库文档需重新导入才生效）。
- 落点：`src/agent/config.py`（`pdf_ocr_mode`/`pdf_ocr_language`/`pdf_num_workers`、`OCR_MODES`/`OCR_LANGUAGES`、`load_ocr_config`/`save_ocr_config`）、`src/main.py`（`GET/PUT /api/ocr-config`，启动时覆盖 `Settings`）、`frontend/src/OcrSettings.tsx`（设置抽屉）；配置落地 `STATE_DIR/ocr.json`。
- 与解析关系：OCR 语言仅作用于 liteparse（本项目固定解析器）。
- 状态：**已实现（K4）**；测试 `tests/test_corpora_state.py::test_ocr_config_persists_and_only_affects_later_imports`。

## 按库 OCR 语言与“改语言→强制重解析”（K12，2026-09-22）

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

- 根因判定：慢在 PDF 解析/OCR、每次全量重解析、解析串行与向量索引延后阻塞；**SQLite 写入非瓶颈**。
- 采用：增量导入（文件签名清单）+ OCR 按需 + 并发解析 + 两阶段导入（先文本后向量）+ chunk id 预缓存。
- 影响：`parsers.py`/`knowledge.py`/`main.py` 导入路径、`<KB>/datadb` 文件清单表与任务进度模型。

## 增量导入与文件清单（2026-09-22）

- 采用：`<KB>/datadb` 维护 `files(rel_path,size,mtime_ns,sha256,doc_id,status)`；以 size+mtime 作为廉价签名跳过未变文件，必要时用 sha256 兜底；源文件删除即标记文档移除。
- 理由与代价：避免未变文件重复 OCR/解析；代价是新增清单表与删除同步逻辑。
- 状态：**已实现（K1）**。`Knowledge` 增 `files` 表与 `files()`/`record_file()`/`drop_file()`；`import_defaults(knowledge, settings, root=<corpus>/source)` 按 `size+mtime_ns` 廉价跳过、必要时 `sha256` 兜底，源文件删除即 `drop_file`（删 manifest 行与 `docs` 行），返回 `added/updated/skipped/deleted/scanned`。清单为空视作存量库首次回填，全量重解析一次。测试见 `tests/test_incremental_import.py`；实机默认演示库二次导入 `added=0, skipped=1`，删除探针文件后 `deleted=1` 且不再出现在 `/api/documents`。

## 两阶段导入（先文本后向量）（2026-09-22）

- 采用：导入先完成解析入库（BM25 立即可检索），向量索引在后台构建并在任务中独立显示进度；`EMBEDDING_PATH` 为空时跳过向量阶段。
- 理由与代价：避免“导入完成但首次提问卡死”；代价是两种检索能力就绪时间不同，界面需如实显示。

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

## 应用级会话库独立于语料库（2026-09-22）

- 采用：`workspace.sqlite3` 迁出活动库的 `<KB>/datadb/`，放固定应用级目录；`app.state.workspace` 不再随活动库变化。
- 理由与代价：当前会话库位于活动库目录内（`main.py:91`），删除/重命名默认库会连带丢失会话与笔记；代价是新增一个应用级路径配置。
- 前置：K0；未完成前不开放库删除/重命名。
- 状态：**已实现（K0）**。新增 `Settings.state_dir`（默认 `DOX_AGENT_ROOT/data`）；`main.workspace_path` 把 `workspace.sqlite3` 放在该目录，并在应用级文件不存在时从活动库 `<KB>/datadb/workspace.sqlite3` 一次性复制迁移。测试见 `tests/test_corpora_state.py`。

## 解析器：固定使用 liteparse（2026-09-22）

- 采用：解析固定使用 liteparse（当前 2.14.6）；**不引入 mineru，不做解析器对比测试**。
- 说明：liteparse 无“仅无文本页触发 OCR”开关，故 OCR 策略由本项目的三档开关（`off`/`force`/`auto`）控制，而不是换解析器。
- 备选：仅当 liteparse 在真实语料上出现无法解决的解析失败/质量问题且用户确认时，再单独立项，不在本轮规划内。

## 知识库重命名语义（2026-09-22）

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

- 采用：移除自动意图分类与 `query_routing`/`evidence_level`/`execution_mode`；每轮固定专业问答，回答职责由用户显式选择的 task1–4 决定；task4 不在 chat 生成，走报告入口。
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
