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
- 状态：已采用，未实现；实现前不新增前端入口。

## 文档与本地数据布局（2026-09-22）

- 采用：长期开发文档只维护三份——[`PROJECT.md`](PROJECT.md)、[`ITERATION.md`](ITERATION.md)、[`DECISIONS.md`](DECISIONS.md)；需求、契约、计划与完成证据已并入这三份，历史与过程材料不再单独维护。
- 本地数据按用途分开：`.knowledge/`（原始语料）、`.data/`（数据库/向量库）、`.demo_langchain/`（演示语料：`langchain_dox`/`langchain_vectordb`/`langchain_datadb`）。
- 理由与代价：减少并存文档数量，避免同一结论多处维护；代价是 PROJECT/ITERATION 篇幅更大，需要纪律性地只保留有效信息。
- 影响：仓库 `README.md`、`.env.example`、`.gitignore` 同步；`.knowledge/`、`.data/`、`.demo_langchain/` 数据默认不入库。
- 替代关系：取代此前 `dev_logs/` 多文档结构与 `knowledge/` 单目录同时存放原始语料与派生数据的约定。

## 数据库与向量库分离（2026-09-22）

- 采用：新增 `VECTORDB_DIR`，Chroma 索引路径与 `DATA_DIR`（SQLite）分离；缺省仍为 `DATA_DIR/chroma`，保持旧行为。
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
