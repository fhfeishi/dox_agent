# DECISIONS — dox_agent 关键决策

## 语料目录自包含「方案 A」（2026-09-22，取代分离布局）

- 采用：每个知识库 = `CORPORA_ROOT`（默认 `.knowledge`）下一个**自包含目录**，固定三部分：`source/`（原始文件，可按领域再分子目录）、`datadb/`（该库 SQLite `knowledge.sqlite3`）、`vectordb/`（该库 Chroma 索引）。`.demo_langchain/` 演示库采用同一约定。
- 理由与代价：派生数据重建成本高（中文扫描件 OCR + 向量索引），按库自包含便于整库备份/迁移/删除，并与演示库约定统一、消除两棵树漂移；代价是库目录可写、扫描需跳过 `source`/`datadb`/`vectordb` 保留名。
- 影响：`src/agent/config.py`（`CORPORA_ROOT` 默认 `.knowledge`，移除镜像用 `DATA_ROOT`）、`src/agent/corpora.py`（`CorpusInfo` 增 `source_dir`/`db_dir`/`vectordb_dir`）、`README.md`、`.env`/`.env.example`。
- 替代关系：取代下方"文档与本地数据布局"中 `.knowledge/`（原始）与 `.data/`（派生）分离、以及 `.demo_langchain` 旧子目录名（`langchain_dox`/`langchain_datadb`/`langchain_vectordb`）的约定。
- 遗留：应用级会话库 `workspace.sqlite3` 仍随默认库的 `datadb/`，尚未迁到固定应用级目录。

## OCR 语言由前端可调（2026-09-22）

- 采用：`PDF_OCR` / `PDF_OCR_LANGUAGE` 应可在前端设置中调整（如 `eng` / `chi_sim` / `chi_sim+eng`），而不是只靠 `.env` 改后重启；后端提供读取/更新该配置的最小接口，前端在设置抽屉暴露语言选择。
- 理由与代价：基金报告多为中文扫描件，当前默认 `eng` 识别质量差；入库质量直接取决于 OCR 语言，需要能即时调整而不用改文件重启。代价：新增运行时配置读写接口，并需明确“仅影响后续导入”的语义（已入库文档不自动重解析，需重新导入）。
- 影响（待实现）：`src/agent/config.py`、`src/main.py`（配置接口）、`frontend/src/SettingsDrawer.tsx`；单用户本地部署下允许写入。
- 默认值：中文语料库默认 `chi_sim+eng`（而非 `eng`）；`PDF_OCR` 与语言均可在设置中调整。
- 与解析选型关系：若采用 mineru，可由解析器负责语言/公式识别；OCR 语言配置仅作用于 liteparse 路径。
- 状态：已采用，未实现；实现前不新增前端入口。

## 导入性能优化方向（2026-09-22）

- 根因判定：慢在 PDF 解析/OCR、每次全量重解析、解析串行与向量索引延后阻塞；**SQLite 写入非瓶颈**。
- 采用：增量导入（文件签名清单）+ OCR 按需 + 并发解析 + 两阶段导入（先文本后向量）+ chunk id 预缓存。
- 影响：`parsers.py`/`knowledge.py`/`main.py` 导入路径、`<KB>/datadb` 文件清单表与任务进度模型。

## 增量导入与文件清单（2026-09-22）

- 采用：`<KB>/datadb` 维护 `files(rel_path,size,mtime_ns,sha256,doc_id,status)`；以 size+mtime 作为廉价签名跳过未变文件，必要时用 sha256 兜底；源文件删除即标记文档移除。
- 理由与代价：避免未变文件重复 OCR/解析；代价是新增清单表与删除同步逻辑。

## 两阶段导入（先文本后向量）（2026-09-22）

- 采用：导入先完成解析入库（BM25 立即可检索），向量索引在后台构建并在任务中独立显示进度；`EMBEDDING_PATH` 为空时跳过向量阶段。
- 理由与代价：避免“导入完成但首次提问卡死”；代价是两种检索能力就绪时间不同，界面需如实显示。

## 知识库与文件 CRUD 及删除语义（2026-09-22）

- 采用：知识库新建/重命名/删除；库内文件列表/上传/删除/重命名或替换。
- 删除语义：`DELETE /api/corpora/{id}` 默认只删派生数据（`datadb/`、`vectordb/`），删除 `source/` 需显式 `purge_source=true`。
- 理由与代价：`source/` 是唯一事实来源，防误删；代价是删除需两步（清派生、再决定源文件）。

## Word 文档支持选型（待定，2026-09-22）

- 采用（候选）：`.docx` 解析用离线库；在 `python-docx`（轻量，只取段落/表格文本）与 `markitdown`（转 Markdown，含更多格式）之间评估后定稿。
- 约束：必须离线、不引入重型运行时；选定后再实现 K6。
- 状态：未定稿，未实现。

## 检索 chunk id 预计算（2026-09-22）

- 采用：chunk id 在导入时计算并缓存，查询期只对新增窗口做 diff，避免每次查询重建全库 id。
- 理由与代价：当前 `Knowledge.search` 每查询 O(库大小)，库越大越慢；代价是需在导入阶段维护 chunk 元数据。

## 应用级会话库独立于语料库（2026-09-22）

- 采用：`workspace.sqlite3` 迁出活动库的 `<KB>/datadb/`，放固定应用级目录；`app.state.workspace` 不再随活动库变化。
- 理由与代价：当前会话库位于活动库目录内（`main.py:91`），删除/重命名默认库会连带丢失会话与笔记；代价是新增一个应用级路径配置。
- 前置：K0；未完成前不开放库删除/重命名。

## 解析器选型：liteparse vs mineru（待评估，2026-09-22）

- 背景：liteparse 2.14.6 无“仅无文本页触发 OCR”开关，仅 `ocr_enabled` 全局开关；中文扫描件用 `eng` 质量差。若 liteparse 不满足质量/速度，尝试 **mineru**（离线版面/公式/OCR）。
- 采用（拟）：K2 用真实中文 PDF 对 liteparse 与 mineru 做耗时/质量对比后定稿；可混合（有文本层走 liteparse，无文本/扫描页走 mineru/OCR）。
- 约束：离线、可批量、资源占用可控；选定前不锁定实现。
- 状态：未定稿。

## 知识库重命名语义（2026-09-22）

- 采用：重命名分两层——（a）显示名更新（`CORPORA` override 的 `name`，不动目录）为默认；（b）目录搬迁为独立操作。
- 理由：`corpus_id` 由相对路径派生（`corpora.py:46`），`doc_id=sha256(origin)`（`parsers.py:32`），搬目录会级联改变两者，使会话 `corpus_id`、`allowed_doc_ids`、历史 `sources.doc_id` 失效。
- 目录搬迁若要支持，须做 id/doc_id 迁移或明确标记失效（K6b）。

## 删除同步必须清除检索索引（2026-09-22）

- 采用：删除文档/文件时，除删 `docs` 行外，必须同时从 BM25（查询期重建）与 dense（Chroma）排除，避免已删文档仍可被检索/引用。
- 影响：K1 删除同步、K7 文件删除。

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
