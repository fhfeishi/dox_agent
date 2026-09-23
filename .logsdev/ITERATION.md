# ITERATION — dox_agent 当前工作

- 更新时间：2026-09-23。
- **当前执行入口：§16.14「W3-A 最小运行快照」**。W0 报告入口与旧会话兼容、KM-S5 隔离真实格式 API 链路、W1 检查器与输出模板/执行摘要、W2 知识库说明/资料搜索、W3-A 最小 RunSnapshot 与收口修订 A1–A6、门禁项 B2–B4 已实施；后端 149 项 / 前端 31 项测试、构建与 12 个离线浏览器脚本通过。**B1 提交封口已完成（`665c3ff`），W3-B 已解锁**（§16.14 B1、§16.11.8）；W3-B 首个切片按“reports 兼容读取 + RunSnapshot 回读”推进。A7 保留为不阻塞的运维项；`tools/` 两脚本已定为用户个人脚本（见 `tools/README.md` 与 DECISIONS）。
- 长期说明见 [`PROJECT.md`](PROJECT.md)；关键取舍见 [`DECISIONS.md`](DECISIONS.md)。

## 1. 当前目标与必要约束

- 目标：正式基金语料接入前，完成可独立验证的工程与界面部分，并把"已完成"变为"默认可用"（浏览器验收 + 开关转 on）。
- 约束：
  - `ChatRequest` 为 `extra="forbid"`：后端未就绪字段不得发送；任务与 corpus_ids 契约已实现。报告仍仅单库，字段见 PROJECT §4.2。
  - 功能开关按 `uiFlags.ts` 实际默认值；转 on 需同时满足"后端契约已实现 ∧ 浏览器实测通过"。
  - 不引入 PROJECT §1「范围外」项。

## 2. 计划与任务状态

**阶段总览**：A 🟡 · B ⬜ · C 🟡 · D 🟡 · E 🟡（E1–E4/E6 已实现，E5/E7 部分；真实模型 E2E 未做）· F ⬜ · G 🟡 · H 🟡 · U 🟡 · K 🟡（K0–K4、K6a、K6–K8、K12、K13 已实现；K5/K9–K11 待做；K2–K4/K12 的 liteparse OCR 部分被 K13 取代）· L 🟢（L1–L7 已实现：报告级检索 + 确定性图 + 评测；增强项 L4b/L4d/dense 延后，见 §5.6）· DIR ⬜（本地持久化统一到 `.knowledge/`，规划 §10）。

**A 工程基线**：A1–A6 ✅（pyproject/extras、tests、端到端、改名、dev_logs 整理、design 落盘）；A7 契约同步 🟡（E 阶段待补）。

**B 语料与元数据**：B6 ✅（清理语料专属硬编码，改 `AUTO_IMPORT_OFFICIAL`/`WARMUP_QUERY`）；B1 基金入库、B2 元数据、B3 补录、B4 领域/年份过滤、B5 chat `filters` ⬜。

**C 问答收敛**：C1/C2/C3/C5 ✅（移除分类与策略字段、固定专业流程、保留 `allowed_doc_ids`）；C4 多轮/引用/失败说明 🟡。

**D 文档窗口**：D1–D5、D7–D9、D11 ✅；D6 🟡（**降级**：`pdfjs-dist` 未装，PDF 用浏览器原生渲染）；D10 页码三方一致性、D10b OCR/重排再校验 ⬜。

**E 专项报告**：E1/E2/E3/E4/E6 ✅（`POST /api/reports` + `GET /api/reports/{id}` + `GET /api/reports?session_key=`、四模板 `src/templates/*.md`、`.md` 导出、`ReportStore` SQLite）；E5（引用有效性/覆盖资料/局限）与 E7（缺失必填/未知模板的明确报错）🟡（部分）；前端报告卡片与会话报告列表已接线（G10d），**真实模型报告 E2E 未做**。详见 §5.7。

**F 验收**：F1–F6、F8–F13 ⬜；F7 🟡（会话与流式基础已具备）。

**G 任务系统**：G1–G4、G7 ✅；G5 🟡（选择器/绑定已实现；**task4 阻断的“报告表单”口径已被 §8 取代为自由文本 intake**，intake 待 G10b、报告生成待 E）；G6 🟡；G8 任务输出验收、G9 报告入口 ⬜。

**H 知识库管理**：H1–H3（注册表/按库导入/`?corpus=`）✅；H5–H7（选择器/详情/按库文档）✅；**H4 ✅代码**（chat `corpus_id`、按库限定检索，提交 `e7d08e2`）、**H8 ✅默认启用并浏览器验收**（会话绑库；已移除 `VITE_UI_CORPUS`，选中语料随 chat 发送以保证浏览与回答同库），真实语料验收见 §3；H9 文件名元数据入服务端、H10 真实报告验收 ⬜。

**K 知识库管理与导入优化**：K0（应用级会话库）、K0b（多库 read/file 补 `corpus`）、K1（增量导入 + 文件清单 + 删除同步）、K6a（`corpus_id` 单射+限长）、K6（库新建/显示名重命名/删除）、K7（库内文件列表/上传/重命名/删除）、K8（Word/.docx）、**K13（mineru 解析 + 外部 `MINERU_CMD` + `parsed/` 缓存，取代 liteparse 及其 OCR 配置；保留 K12 的 `force` 重导入）✅**；K5（两阶段导入+进度/取消，规格 §6.7）、K9（按 kind 预览，§6.8）、K10（检索缓存，§6.9）、K11 验收 ⬜。K2/K3/K4/K12 的 OCR 模式/语言部分已作废。

**U UI 优化**：U0、U4.1a/U4.1b/U4.2、U5（会话内分支）、U6（电源按钮）、U7（知识库预览）、U8（LLM 状态）、U9.1（侧栏收束）、U9.2/U9.2b（文献库）、U9.4-1（只读模型）✅；U9.3 科研头条 🟡（仅占位）；U1（任务 UI）、U2（文档面板/引用跳转）🟡（代码完成、开关默认 off、浏览器验收未做）；U3 报告入口、U9.4-2 模型选择器 ⬜。**U10 界面重构（对齐参考模板）✅代码**：设计令牌 + `store.tsx`/`App.tsx` + `components/`，见 [`DECISIONS.md`](DECISIONS.md)；浏览器视觉/交互验收待补。

**功能开关**：`VITE_UI_TASKS/FILTERS/DOC_PANEL/REPORTS/NEWS/MODELS` 均已建立、默认 off。启用策略：后端契约已实现 ∧ 浏览器实测通过。`VITE_UI_CORPUS` 已移除：`corpus_id` 后端已实现并验收，选中语料始终随 chat 发送。

**L 检索重构（已实现）**：报告级两级混合检索（Layer A 报告召回 → Layer B 报告内 chunk RRF 精排 → 每文档 top-m 累计 → 项目去重 → chunk-DF 泛词净化覆盖率无匹配），命中报告全文按 token 预算装配；图改为确定性 `understand→retrieve→assemble→validate→answer→finish`，移除 LLM search/read 工具循环；`Knowledge.search` 委托 `retrieve`（单索引）。评测 `evaluate.py` + 15 条基金用例（recall/MRR=1.00，样本饱和）。增强项（dense/MMR/过滤下推）延后。规格见 §7；核实见 §5.6。

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
| K12（提交 `0b1bb37`） | 按库 OCR：`Knowledge.meta`（`ocr_mode`/`ocr_language`/`ocr_applied_*`）；`GET/PUT /api/corpora/{id}/ocr`；`ingest?force=`（`stale` 自动强制，job `forced`）；`GET /api/corpora` 增 `ocr_stale`；前端 `CorpusOcrSettings`（侧栏每库可展开） | `pytest` 86 passed（新增 `tests/test_corpus_ocr.py`、force 重解析例）；实机 httpx：PUT `eng`→`stale=true`→ingest `forced=true`→`stale=false`；再 ingest `forced=false, skipped=1` |
| 预览原文件/引用跳页修复（提交 `02d8c1e`/`6849250`；本轮修复） | `/file` 改 `Content-Disposition: inline`（原为 `attachment`，iframe 不会内联渲染）；**引用 `[n]` 实际未生效**：`Answer` 计算了 `rehypePlugins`/`components` 却未传给 `<Markdown>`，且 `rehypeCitations` 返回的是 transformer 而非 `options => transformer`；现已接通，`[n]` 为可点按钮、超范围数字保持字面、代码块不误匹配 | `npm run build` + `node --test` 18 passed；`tests/browser_fund_preview.py` PASS（基金库 PDF 内联渲染 + `[1]` 跳第 3 页 + chat 携带 `corpus_id`） |
| mineru 4.0.5 试用（2026-09-22，本地实测） | 独立 venv 安装 `mineru==4.0.5`（无 torch）；`mineru-kit parse <pdf> -o <out> --tier basic --ocr-mode auto` 成功；`--format markdown` → 单 `.md`（图片 base64、无页标记），`--format middle_json` → 单 `.json`（`pages[].page_idx`+blocks）；v4 不产出经典 `<uuid>_origin.pdf`/`images/`；`temp/` 为经典版产物 | 最小基金 PDF 1–2 页约 6s（首次拉模型约 1 分钟）；**未接入 dox_agent 代码**（仅试用） |
| K13 mineru 适配器（提交 `c2d04b2`） | `parsers.py`：`read_mineru_output` 支持 v4 `middle.json`/经典 `content_list.json`（`page_idx` → 页码，回退 markdown 单页）；`parse_pdf_pages` 跑 `MINERU_CMD`（模板 `{pdf}`/`{out}`，`MINERU_HOME`/超时）；产缓存 `<KB>/parsed/<rel>/`；移除 liteparse 与 `/api/ocr-config`、`/api/corpora/{id}/ocr`、前端 `OcrSettings`/`CorpusOcrSettings`，保留 `ingest?force=true`（侧栏“重导入”） | `pytest` 85 passed（新增 `tests/test_mineru.py` 6 例）；`npm run build` + `node --test` 18 passed；**真实 `temp/` 样例读取验证**：45 页可读中文、页码 1..45 |
| 预览面板放大 + 解析信息（本轮） | `DocumentPanel` 桌面改为 **50vw（min 34rem / max min(60rem,90vw)）、`m-4` 垂直居中、圆角**（窄屏仍全屏遮罩）；新增 `documentMeta.ts` 统一元信息（rel_path/kind/parser/版本/采集）与 `parserLabel()`；旧 `liteparse` 解析显示“旧解析，建议重导入为 mineru” | `npm run build` + `node --test` 18 passed |
| K13 实机 pilot（本轮） | mineru 4.0.5 已装 `.venv`；修复超时：`start_new_session`+`killpg` 杀整进程组、`MINERU_TIMEOUT` 默认 3600；最小基金 PDF（6 页）`standard` >900s 超时、`basic` **96.7s** 且中文可读、页码正确 | 基金库 `force` 全量重建运行中（`basic`，34 份）；完成后回写正文可读/页码与 H10 |
| K13 加固（B1/B2/B3，本轮） | PATH 注入（`Path(sys.executable).parent` 进子进程 `PATH`）；`pyproject` 加 `mineru>=4.0,<5`；默认 `--format zip`（markdown+middle_json 一次产出）；`_block_text` 递归展平修复嵌套 content 的列表 repr 泄漏 | `pytest` 85 passed；`read_mineru_output` 对 zip 实测：自动解包、页文本干净（无 `[{...}]`） |
| L2/L3b/L4a 检索核心（本轮） | 新增 `src/retrieval.py`（纯逻辑、未接线）：block 原子分块 + base64→`[图片]`、`chunk_id=sha1(doc_id\|version\|page\|heading\|seq\|text)`、报告级索引（title+heading+文件名元数据）、两级检索（报告召回 → 报告内加权 RRF → 每文档 top-m 累计 → 项目去重 → 主题词覆盖率无匹配）、`metadata_from_filename`；参数集中 `RetrievalConfig`（未校准项标注）。L1/L3/L5/L6 未动，图与存储走既有路径 | `.venv/bin/python -m pytest tests -q` → **95 passed**（新增 `tests/test_retrieval.py` 10 例）；`ruff check src/retrieval.py tests/test_retrieval.py` 通过 |
| L 立即批次 S2/S3/S6（本轮） | `retrieval.py`：`_BASE64_IMAGE` 改 `data:image/[^;,]{0,80};base64,[A-Za-z0-9+/=]+`（不吞后接英文/标点/多行，S2）；Layer A 查询词取**全部 query 并集**（S3）；`_query_terms` 为空→`reason="direct"`、不做回退（S6a）；覆盖率基数改 `per_doc_cand`、评分仍 `per_doc_top_m`（S6b） | `pytest tests -q` → **102 passed**（`tests/test_retrieval.py` 17 例；新增 7 例覆盖 S2 三边界 / S6a / S3 q1 独有 / S6b / `project_no` 空）；`ruff check` 通过 |
| L 引用集对齐（本轮） | `SelectedReport.chunks` 改 `per_doc_cand`（RRF 降序、可引用集），评分仍用 `per_doc_top_m`；与 §7.8 / D-L1 对齐 | `pytest tests -q` → **103 passed**（`tests/test_retrieval.py` 18 例）；`ruff check` 通过 |
| L1 存储分离 + 重索引（本轮） | `Document.markdown`；`version=sha256(markdown+pages)`；`docs` 仅存元数据，正文分入 `doc_pages`/`doc_markdown`；`all()`/`get()` 不再返回正文、改用 `page_count`；新增 `read_markdown`；`parse_file` 优先复用 `parsed/` 缓存（L1 不重跑 mineru）且保留旧 payload 回退；基金库 `force` 重索引 35/35、0 errors；备份 `knowledge.sqlite3.pre-l1` | `pytest tests -q` → **104 passed**（新增 `test_user_reads_markdown_and_pages_from_separate_storage`）；ruff 通过；实机：基金库 `docs=35`/`files=35`/正文可读/`read_markdown` 可用、mineru 未重跑；demo 旧库经 payload 回退仍可搜索/阅读 |
| L3/L3b/L4a chunks + retrieve（本轮） | `chunks` 表（block 原子、带页/标题），导入时由 `parsed/` 的 `middle_json` 分块（`read_mineru_blocks`）；`Knowledge.put_chunks/chunk_rows/drop_file`（删除同步、缓存失效）；`Knowledge.retrieve` 复用 `select_reports`；`project_no` 由文件名注入（S4）。修复两处检索缺陷：Layer B RRF 改为**候选池内全局排名**（原每文档各自排名使 `Σtop_m` 全等）、命中需**真实 token 交集**（BM25Plus 的 delta 使未命中 chunk 仍 >0） | `pytest tests -q` → **107 passed**；ruff 通过；实机基金库 `chunks=4047`、demo 回填 `5922`；`retrieve("癫痫致痫网络")` top1=赵国光癫痫报告（cover 1.00），"无人车协同感知"/"肝癌超声造影" top1 均正确 |
| L5b 临时接线 + D-L10（本轮） | `Knowledge.search` 委托 `retrieve`（删旧窗口 BM25）；返回 chunk 定位（`chunk_id`/page/heading，无 `start_line`）；新增 `read_chunk`；`graph`/`quick`/`evaluate` 改按 chunk 阅读；`put` 增加页面级 chunk 回退。**D-L10**：泛词按**文档级 chunk-DF**（N=候选报告数）以 `GENERIC_DF_RATIO=0.35` 净化，`specific=_query_terms−generic`；逐文档接受 `cover≥max(MIN_TERM_COVER, REL_COVER×top1)`（`REL_COVER=0.5`），不足 `MIN_REPORTS` 保底并标 `partial`；`specific` 空则宽泛查询取 top `MAX_REPORTS` | `pytest tests -q` → **108 passed**；ruff 通过；实测基金库：`癫痫致痫网络` 仅赵国光（cover 1.00、噪声 0）；`人工智能在医疗领域的应用` 仅医学报告（cover 1.00/0.67），证券市场报告 cover=0 已不入选 |
| L5 token 装配 + S5/S8（本轮） | `Settings` 增 `MODEL_CONTEXT_TOKENS/RETRIEVE_CONTEXT_TOKENS/RETRIEVE_REPORT_TOKENS/ANSWER_RESERVE_TOKENS/HISTORY_TOKENS/ANSWER_TIMEOUT`；`estimate_tokens`（CJK 1/字、非 CJK ~4 字/token，uncalibrated）；`fit_history` 按 token 截断最旧完整轮并保留末条 user（已接入 `/api/chat`）；`assemble_reports` 按报告分装配 markdown 预算 + 报告头（题目/项目号/负责人/年份）+ chunk→`[n]` 映射并记 `truncated`（**L6 待接线**的纯函数）；S8：引用 `version` 与 `useDocuments` 当前版本不一致时前端提示「文档已更新」，不预探 `/file` | `pytest tests -q` → **111 passed**；`npm run build` 通过、`node --test` → 18 passed；ruff 改动文件通过 |
| L6 确定性检索图（本轮） | `graph.py` 重写为 `understand→retrieve→assemble→validate→answer→finish`（删除 `research`/`create_deep_agent`/工具循环）；`Knowledge.retrieve` + `assemble_reports` 接线；`evidence.py` 仅留 `validate_citations`；删除 `quick.py`/`quick_verification`/`note_locators`；`stop_reason ∈ {professional,no_reports,coverage_partial,timed_out,failed,invalid_request}`；`telemetry.path ∈ {retrieve,chunk_only,direct}` + `chunks_retrieved/reports_selected/context_tokens/invalid_citations`；task1 走 chunk-only；`validate` 覆盖缺口触发≤1 次 re-retrieve；前端 `policy.ts`/`api.ts Telemetry`/`MessageView` 同步 | `pytest tests -q` → **95 passed**（按 L6 删除已废弃 research 循环测试约 20 例）；`npm run build` + `node --test` 18 passed；实测基金库：task2 节点=[understand,retrieve,assemble,validate,answer,finish]、path=retrieve、reports=2、invalid_citations=1、sources 先于 token；task1 path=chunk_only；无 search/read step、stages 无 research |
| L7 评测（本轮） | `src/evaluate.py` 扩展：`report_recall@k`/`MRR`/`no_match_rate`/`project_dedup_accuracy`/`avg_context_tokens`/`latency P50·P95`；数据集 `tests/data/fund_retrieval.jsonl`（15 条基金查询+期望报告）；CLI 暴露 4 个校准参数（`MIN_TERM_COVER`/`PER_DOC_TOP_M`/`MIN·MAX_REPORTS`），`REL_COVER`/`GENERIC_DF_RATIO` 固定 | 基金库实测（task1/task2）：recall=1.00、MRR=1.00、no_match=0.00、dedup=1.00、ctx≈56k/69k tokens、P50≈0.60s/P95≈0.66s；参数扫描：recall 对 4 参数不敏感，`MIN_TERM_COVER` 0.3→0.5 时 ctx 56340→46220；`pytest tests -q` → 95 passed；`test_evaluate` 已重写 |
| G10a+G10b（本轮） | 后端放开 `task4`（`Literal`）并在 `understand` 后分叉 `intake`（确定性采集：领域默认/模板关键词/年份范围/跨轮覆盖；回显+缺参；`stop_reason=report_pending`；`telemetry.path=report`；不发 sources）；前端 `Composer` 放开 task4 输入/发送；`task4_intake.md`；`task_instruction(phase)`；`main.py` 传 `corpus_domain` | `pytest tests -q` → **98 passed**；实测 task4 可输入/发送、得到回显与缺参追问、无 422 窗口 |
| G10c + R1/E-MVP 后端（本轮） | G10c 切换任务提示（新建会话、保留历史）；`src/templates/*.md` 单一权威 + `prompts.report_template()`，`task4_report.md` 只留生成指令；任务注册表增 `artifacts`（默认+允许）与 `templates`（保留 `has_template`，V1）；`src/reports.py`（`ReportStore` + `generate_markdown`）；`POST /api/reports`、`GET /api/reports/{id}`、`GET /api/reports/{id}/export?format=md` | `pytest tests -q` → **102 passed**（`test_reports`/`test_prompts` 新增）；`npm run build` + `node --test` 18 passed |
| G10d 前端报告卡片 + #10 后端（本轮） | `src/reports.py` 按 M1–M7：schema 迁移（`PRAGMA table_info` + 幂等 `ALTER`）、部分唯一索引、`find` `run_id` 幂等、`list` 列表；`POST /api/reports` 幂等返回（200 `idempotent=true`）/新建（201），`GET /api/reports?session_key=&run_id=&limit=`；前端 `api.createReport/fetchReports/fetchReport` + `MessageView` 报告卡片（生成/重新生成/复制/下载 `.md`） + `SidePanel` 会话报告列表，`Attempt.report` 持久化 `reportId`；`Policy.report_params` 承载 intake 参数 | `pytest tests -q` → **104 passed**（`test_reports` 覆盖迁移/幂等/列表）；`npm run build` + `node --test` 18 passed |
| DIR-1..4 目录统一（本轮） | `state_dir` 默认 `<CORPORA_ROOT>/.state`；一次性迁移（M2 来源优先/M3 先校验后删）+ **M1 demo origin 前缀重写**；`.demo_langchain/`→`.knowledge/demo_langchain/`、`data/*`→`.knowledge/.state/`；删 `DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT`/`TEXT_ROOT`，新增 `DEFAULT_CORPUS`（M4：名字→首个 ready→None 不抛）；`/file` 单根、`collect_sources(root)`、`ingest/local`=默认库；`.env.example`/`.gitignore`/README/PROJECT 同步 | `pytest tests -q` → **106 passed**（`test_corpora` 覆盖 M1 迁移/origin 重写/默认解析；`test_corpora_state` 重写）；实机迁移：demo 158 docs 归位、`data/` 移除、README origin 重写且 `/file`/rel_path 正常；`grep` 无 4 变量引用 |
| KB-5a/5b 稳定 id + 重命名同步（本轮） | `.state/corpora.json` 改为**按 id 持久化** `{id, rel, alias, created}`（旧 rel-keyed 读时转换 + 扫描回填）；`CorpusInfo` 增 `alias/dir_name`（`name=alias??dir`）；`resolve_default` 按 id→rel（T7）；`valid_corpus_name` 增保留名/尾点空格（T5）；`PATCH /api/corpora/{id}` = **目录改名 + origin 重写（保 doc_id）+ id 保留 + `import_lock` + 回滚**；`Knowledge.put(doc_id=)` + `import_defaults` 复用清单 id（T1） | `pytest tests -q` → **108 passed**（新增 rename-sync、T1 再导入不重复、保留名用例） |
| KB-5/A + KB-4a（本轮） | **A**：旧 `{rel:{name}}` → `{id:{alias:name}}`（load 归一 + 扫描回退 `alias or name` + rename 清空 alias），友好库名恢复；**KB-4a**：`ChatRequest.corpus_ids`（1–6，与 `corpus_id` 二选一，同送 422）；`retrieve_multi` 按**报告排名 RRF**（键 `(corpus_id, doc_id)`）融合、项目/origin 去重、全局预算；`KnowledgeGroup` 跨库 `retrieve/read_markdown/all`；`chunk_source` 带 `corpus_id`；前端 `Source.corpus_id` + `handleOpenSource` 跨库打开 | `pytest tests -q` → **111 passed**（multi 融合、二选一 422）；`npm run build` + `node --test` 23 passed |
| KB-5d 缺失库（本轮） | `/api/corpora` 对 id 存在但目录缺失的库标 `missing:true`（`preparation=missing`）；`resolve_default` 跳过 missing；chat 的 `corpus_id`/`corpus_ids` 指向 missing → **409 `{missing:true,…}`**（未知 id 仍 404）；前端 `CorpusInfo.missing?` | `pytest tests -q` → **112 passed**（缺失库标记 + chat 409） |
| **UI 迁移（对齐参考模板）** | 引入模板设计令牌（暖中性 + `#5645d4`）；新增 `store.tsx`（`AppProvider`/`useApp`，承接原 `main.tsx` 全部 state/effects/handlers）、`App.tsx`（仅布局）与 `components/`（24 个展示组件）；删除遗留 `Answer`/`SessionList`/`TaskPicker`/`Notes`/`appContext`；`documentPreview.ts`→`documentText.ts`。接入真实 `corpus_id`/`allowed_doc_ids`/SSE/引用校验/分支。逻辑修正：重新生成重新合并库/任务范围、task4 禁发、任务开关关闭空态、侧栏导入用 `effectiveCorpusId`；文档预览面板改为 `clamp(36rem,66vw,76rem)` 自适应且内容区 flex-col 使 PDF 填满。详见 [`DECISIONS.md`](DECISIONS.md) | `npm run build`（tsc+vite）通过；`npm test` 18 passed；**浏览器验收 PASS**：`browser_ui_shell`/`browser_status_power`/`browser_answer_controls`/`browser_document_preview`/`browser_session_branches`（Playwright + dist）；Vite SSR 全树与 `MessageView` 渲染通过。`browser_ui_shell` 的会话标题断言改为限定侧栏（新顶栏也显示标题）；fund/smoke 在线用例需后端，未运行 |
| **审查意见处理（P1/P2 + task 接线，2026-09-22）** | 默认开启任务（`VITE_UI_TASKS` 默认 on，可 `=0` 关）；`/api/tasks` 增 `output_hint`；侧栏任务搜索；任意回答可重新生成（`regenerateAt`，修复替换语义）；每步耗时（后端 `graph.step()` 发 `duration_ms` + 前端展示）；非 PDF 预览下载/新窗口；Composer 弹层统一外部点击/Esc；Inspector 标签改「概览」；删除无引用图标与 `filters/reports/news/models` flag；**后端接线**：`Knowledge.search`/`graph.search_impl` 传 `task_id`（任务差异化检索预算不再失效）；`base.md`/task1–3 提示词补引用纪律与输出细节。详见 [`DECISIONS.md`](DECISIONS.md) §7 | `.venv/bin/python -m pytest tests -q` → **115 passed**（新增 `tests/test_prompts.py` 3 例、`test_knowledge` 1 例、强化 `test_steps` 时长断言）；`npm run build` + `npm test` 18 passed；浏览器 6 用例 PASS（含新增 `tests/browser_tasks.py`）。未做：P1-4 复制/导出改 Markdown（与既有断言冲突）、E 阶段报告模板 |
| **知识库 IA 重构（对齐模板 3 层，2026-09-22）** | 文献库主区改为 `CorpusGrid` 知识库卡片网格（数据源 `corpora`）；新增 `CorpusDetail` 抽屉（文档/源文件/导入，含重命名/删除/按库导入/用于当前对话）；抽出 `Drawer` 壳；删 `LibraryView`/`CorpusAdmin`/`SettingsDrawer`；`OpsDrawer` 精简为模型/在线文档源/导出；`openPreview` 带 `corpusId` 修复非活动库文档 `/file` 取错库；文档预览面板自适应；设置按钮文案改「设置」。浏览（`openCorpus`）与切库（`selectCorpus`）分离。冲突/取舍见 [`DECISIONS.md`](DECISIONS.md) §8 | `npm run build` + `npm test` 18 passed；浏览器 **7 用例 PASS**（新增 `tests/browser_library.py`：网格/详情/跨库浏览不改活动库/按库 `/file`/设置抽屉无 KB CRUD/chat `corpus_id`）。`browser_fund_preview` 在线未运行 |
| **Markdown 预览渲染修复（2026-09-22）** | 预览改走 `GET /api/documents/{id}/markdown`（`Knowledge.read_markdown`，不过 300 字符硬切/行窗）；`parse_file` 对 `.md/.markdown` 设 `parser="markdown"`；前端扩展名兜底 + 窗口拼接修正（页内 `\n`/跨页 `\n\n`）；`openTextInNewTab` 用 `renderToStaticMarkup(<Markdown+GFM>)` 渲染新窗口；表格改 wrapper 横向滚动。详见 [`../dev_logs/ui-migration.md`](../dev_logs/ui-migration.md) §7 | `pytest tests -q` → 本改动相关用例 **48 passed**（`test_app`/`test_markdown_parser`/`test_knowledge`/`test_steps`/`test_retrieval`）；全量当时 118 passed，**随后并行 L6 `graph.py` 重构**使 `test_graph`/`test_usage` 3 例失败（`create_deep_agent` 已移除，测试未同步，非本轮改动）；`npm run build` + `npm test` 18 passed；真实 demo 语料 `read_markdown("470e…")` → 3 个表格、最长行 485；浏览器 **8 用例 PASS**（新增 `tests/browser_markdown_preview.py`：`.md` 识别/3 `<table>`/新窗口渲染） |
| **“前端打不开”排查（2026-09-22）** | 复现矩阵全部正常（构建版/真实后端/dev server/全 API 失败/localStorage），定位为**构建产物被清理或浏览器缓存的旧 `index.html` 指向已删除的 hash 资源**。修复：`launch.sh` 改为在 `frontend/dist/index.html` 缺失时也重建；`GET /{asset_path}` 对 `index.html` 发 `Cache-Control: no-cache, must-revalidate`，hash 资源发 `public, max-age=31536000, immutable`。前端代码无需改动 | `bash -n launch.sh` 通过；`curl -D` 确认 index no-cache / asset immutable；`pytest tests/test_app.py` 9 passed；dist 引用的 hash 资源均存在 |
| **导出/在线文档源归位（2026-09-22）** | A. `OfficialDocs` 从 `OpsDrawer` 移入默认库 `CorpusDetail`「导入」tab（非默认库不显示）；B. 会话导出从 `OpsDrawer` 移到 `ChatView` 顶栏「导出」菜单（导出会话为 Markdown / 导出诊断 JSON），新增 `sessionExport.ts`；C. 每条回答操作条新增「导出 MD / 导出 Word」（`turnExport.ts`；Word 为 Word 兼容 HTML `.doc`，非 OOXML）。**取舍**：按本轮要求移除上一轮 Markdown 修复引入的 `react-dom/server`，改用 `createRoot + flushSync`（`markdownToHtml`）——主 chunk 由 722KB 回落到 **525KB**。纯序列化拆到 `exportFormat.ts`（Node 可测），`exportText.ts` 仅保留 DOM 渲染；不加依赖、不改后端/`ChatRequest` | `npm run build` + `npm test` → **23 passed**（新增 `turnExport.test.mts` 3 例、`sessionExport.test.mts` 2 例）；浏览器 **9 用例 PASS**（新增 `tests/browser_export.py`：会话 MD、单轮 MD、单轮 Word 含 `<table>`、设置抽屉无源/导出） |

当前可用基线（本轮实测）：后端 `pytest tests -q` → **112 passed**；前端 `node --test` → **23 passed**；`npm run build` 通过；浏览器（Playwright + dist）**9 用例 PASS**。

## 4. 待定设计

| # | 问题 | 影响 |
|---|---|---|
| 10 | 报告↔会话绑定 | **已定稿（2026-09-22）**：报告为应用级不可变产物，按 `report_id` 定位；`reports` 表列 `(id, created_at, session_key, run_id, corpus_id, params, markdown)`；`GET /api/reports/{id}` 全局取 + **新增按会话列表** `GET /api/reports?session_key=`；`run_id` 幂等；turn 存可选 `reportId`。见 [`DECISIONS.md`](DECISIONS.md)「报告↔会话绑定」（**含 M1–M7 实现细则**：schema 迁移/部分唯一索引/run_id 生命周期/列表口径）。**已实现（本轮）**：M1–M7 + 前端报告卡片（生成/预览/复制/下载）与会话报告列表（`GET /api/reports?session_key=`）+ turn `reportId` 持久化；见 §3。 |
| 11 | task 推导许可与全局 `answer_policy`：已定稿（task1/task2 收窄、task3 放开并标注），随任务提示词落实 | G1/G4（已落实，保留备查） |
| 12 | 模型可用性判定来源：`/api/health` 的 `model_verified` 恒 `false`，无生产逻辑 | U9.4-2/F11（未定稿前不开工） |
| 13 | **已定稿**：mineru `tier=standard` | K13 |
| 14 | **已定稿**：正文用 **markdown**；页码取 `middle_json` 的 `page_idx` | K13 |
| 15 | **已定稿**：正文图片首期**不渲染**（预览服务源 PDF；markdown 渲染留待后续） | K13 |
| 16 | mineru 集成方式：**已定：本地 CLI `MINERU_CMD`**（模板含 `{pdf}`/`{out}`，`MINERU_HOME` 缓存）；云端 API（`MINERU_API_KEY`）未接入 | K13 |

## 5. 未决问题与下一步

> 历史接续顺序已由 §13.12 更新：P0-A、AC-08、V3/AC-02 与 P1-A 代码工作包已实施；剩余浏览器验收、真实 PDF OCR 字段抽查和真实模型抽样不因单元/API 测试通过而视作完成。用户确认填表日期年份作为报告年份后，AC-05a 确定性过滤行为按定向测试报告通过；AC-05b 元数据可信度仍未通过总体验收。旧 DIR/K 排期不再作为开工顺序；**已解决的 L 冲突/裁决见 §5.2/§5.3/§5.6/§5.7。**

| 未决 | 影响 | 下一步 |
|---|---|---|
| U2 文档面板（`VITE_UI_DOC_PANEL`）浏览器验收未做 | U2 未转 on | 浏览器验收通过后转 on；当前默认路径已可直接预览 PDF/渲染正文（本轮已验收） |
| D10 页码三方一致性未校验；U2 浏览器验收未做 | 引用跳页可信度 | 补 D10 回归 + U2 浏览器验收 |
| D6 `pdfjs-dist` 未装（Windows×WSL 符号链接冲突） | PDF 缩放受限 | 换装后仅替换 `PdfViewer` 内部实现 |
| B2/B4/B5 基金元数据与领域/年份过滤未做 | 报告与过滤缺依据 | 先 H9（文件名元数据入服务端）→ B2/B4/B5 |
| E5/E7 部分未做；报告真实模型 E2E 未做 | 报告引用/覆盖/局限可信度、输入错误提示 | 补 E5（引用/覆盖/局限）与 E7 校验；做一次真实模型报告 E2E |
| #12 模型可用性判定缺失 | F11/U9.4-2 不可验收 | 定 health 探测口径或新增轻量探测接口 |
| 基金库 `.knowledge/自然科学基金/`：source/**35 份** PDF；**K13 重建完成**（`docs=35`、`files indexed=35`、`parser=mineru`、`parsed` 覆盖 35/35、mineru 已停）；**L1 已重索引**（正文独立存储、版本含 markdown、备份 `knowledge.sqlite3.pre-l1`） | 预览/问答可读性 | 重建/重索引已完成 → H10 真实报告验收 |
| H10 真实基金报告端到端验收未做 | 基金场景未验证 | 以真实报告走「选库 → 浏览 → 预览 → 按库问答」 |
| 按 kind 预览、两阶段导入进度、检索缓存未做 | 文件能力不完整、导入不可观测、大库变慢 | K5（§6.7）/K9（§6.8）/K10（§6.9） |
| **L1 改 `version` 定义使存量引用失效** | 所有历史会话 `sources` 版本校验失败（`read`/`/file` 报「文档已更新」） | planner 定迁移口径：允许失效并提示，或提供重写 |
| **D-L3 token 预算缺统一 tokenizer** | `RETRIEVE_CONTEXT_TOKENS` 等无法精确核算 ≤ 模型上限 | planner 定口径（tiktoken / 供应商 usage / 保守字符估算） |
| **D-L6 无匹配的 CJK 停用词口径未定** | 主题词覆盖率可能过松/过严 | MVP 已用 2-gram + 小停用词表并在 `RetrievalConfig` 标 uncalibrated；待评测校准 |


### 5.1 L 阶段本轮交付与未接线声明

- 已交付：`src/retrieval.py` 的 L2/L3b/L4a 纯核心（block 分块 / base64 剥离 / 报告级索引 / 两级选择 / 项目去重 / 无匹配），`tests/test_retrieval.py` 19 例（**本模块**；全量 `pytest` 107 passed，两者口径不同非矛盾）；`RetrievalConfig` 集中参数（未校准项标注）。
- 接线状态（L6 完成后）：`Knowledge.search` 已委托 chunk 引擎（单索引）；`graph.py` 已改为确定性 `understand→retrieve→assemble→validate→answer→finish`，不再有 LLM 工具循环；前端 `policy.ts`/`MessageView` 已同步新标签/telemetry；`docs` 旧 payload 回退仍保留（demo 未重索引亦可搜索）。
- 明确的非目标：dense / rerank / MMR / LLM 多查询（计划默认延后）。

### 5.2 L 阶段冲突裁决与对策（2026-09-22，planner）

| # | 冲突 | 裁决 | 依据/动作 |
|---|---|---|---|
| C1 | L1 被 K13 全量重建阻塞 | **HOLD L1**；`retrieval.py` 纯模块可先提交 | **门禁（S1）**：重建完成且**非运行中**，且 `parsed/<rel>/markdown.md` 覆盖全部 `source/`（按 rel 对齐、与 `files` 清单一致）后才能 L1——仅 `docs=34` 不足（实测 source=35、parsed=19）。L1 从 `parsed/` **重索引**、**不重跑 mineru**、**缺 parsed 即失败列出缺失 rel**（不得静默跳过）；旧 docs 原地替换，保留 DB 备份 `.pre-l1` |
| C2 | L3/L3b 是否依赖 K5 | **不硬依赖** | 当前 ~34 报告、BM25-only，同步建索引成本可接受；K5 仅用于进度/取消 UX 与启用 dense 前 |
| C3 | 只做 L1–L5 会形成两套检索 | **单索引 + 允许临时接线** | 新引擎接线时 `Knowledge.search` 委托之并**删除旧窗口 BM25**；不得两套索引并存；L6 再以确定性 `retrieve→assemble→answer` 替换 LLM 工具循环 |
| C4 | 改 `version` 作废存量引用 | **允许失效并提示，不重写历史** | 回答文本已随会话持久化；`read`/`/file` 明确“文档已更新”；迁移前备份 DB；`doc_id` 不变，文档仍可打开 |
| C5 | D-L3 缺统一 tokenizer | **保守字符估算 + usage 校准** | 不引入 tiktoken；CJK 按字、非 CJK ~4 字/token；字符硬上限兜底；`telemetry` 记供应商 `usage`；标 uncalibrated |
| C6 | CJK 无匹配口径未定 | **2-gram + 小停用词表 + 覆盖率，MVP uncalibrated** | 复用 `retrieval._QUERY_STOP`（含泛学术词）；要求实体/数字匹配；不引入外部停用词表；由 §7.11 校准 `MIN_TERM_COVER` |

**对策（按序执行；1 可立即做，2–8 以 S1 门禁为准）**：
1. **立即修 S2/S3/S6**（纯 `retrieval.py`，无依赖）：base64 正则去贪婪 + Layer A 全查询词并集 + 词项空→`direct` + 覆盖口径；补回归用例后提交。**✅ 已完成**（`pytest` 102 passed；commit 见下）。
2. **L1**：备份 `knowledge.sqlite3` → 加 `markdown`/新 `version`/`doc_pages`/`doc_markdown` → 从 `parsed/` **重索引**（缺 parsed 即失败）→ 验证 `docs=34`、正文可读、页码可定位、`read_markdown` 可用。**✅ 已完成**（基金库 `docs=35`、0 errors、未重跑 mineru、备份 `.pre-l1`；见 §3）。
3. **L3/L3b**：同步建 `chunks` 表 + 报告级索引 + `BM25Plus` 缓存（键 `(corpus, version 签名)`）；**索引时注入 `project_no`（S4）**；导入/删除置 dirty。**✅ 已完成**（chunks 表 + 删除同步 + 缓存失效；BM25 仍按查询构建，未做持久化缓存；基金库 4047 / demo 5922 chunks）。
4. **L4a**：新增 `Knowledge.retrieve`（读取持久化 chunks → `select_reports`）；已交付纯模块逻辑复用。**✅ 已完成**（并修复 Layer B 全局排名与 token 交集两处缺陷；见 §3）。
5. **临时接线（下一步）**：`Knowledge.search` 委托新引擎、删除旧窗口 BM25；`read`/`sources` 适配 chunk（无 `start_line`）；SSE 形状不变；**同时落实 D-L10 逐文档阈值（否则宽泛查询仍带噪声）**。**✅ 已完成**（单索引 + chunk 级 read + D-L10；见 §3）。
6. **L5**：token 预算装配 + 报告头 + 引用映射（chunk→`[n]`）；**历史按 token 截断（S5）**；**PDF 版本失效 UI 提示（S8）**。**✅ 已完成**（token 配置/估算 + S5 历史截断已接入 chat + `assemble_reports` 纯函数 + S8 前端提示；`assemble_reports` 接入图属 L6；见 §3）。
7. **L6（下一步）**：确定性 `understand→retrieve→assemble→answer→validate→finish` 替换 `research` 工具循环；`assemble_reports` 接入图；移除 `quick`/`note_locators` 旧路径；同步 `stop_reason`/`telemetry.path`/前端标签（§7.14 D-L4 三处）。验收：`/api/chat` 不再跑 LLM 工具循环、无 120s 检索阶段；宽泛查询「人工智能医疗领域」返回医学报告并带 `[n]`；SSE 形状不变；`pytest`+浏览器用例通过。**✅ 已完成**（节点集合/事件序列/telemetry 实测通过；`validate` 置于 `answer` 前以避免流式二次回答，见 §7.15 备注；见 §3）。
8. **L7**：扩展 `evaluate.py`（10–15 条），校准 4 个参数并记录「参数版本+指标」。**✅ 已完成**（15 条数据集 + 指标 + 参数扫描；见 §3 §7.16）。

### 5.3 验证者意见处理（S1–S9，2026-09-22）

| # | 级别 | 意见 | 处理 |
|---|---|---|---|
| S1 | 高 | C1 门禁缺 parsed 完整性；实测 source=35/docs=18/parsed=19（含 `_pilot`） | 门禁口径：**以 `import_defaults` 计算的 `rel` 为键**，`parsed/<rel>/markdown.md` 覆盖全部 `source/`，**排除 `_pilot` 与非相对源目录**；三者权威：`source`=待索引集合、`files`=状态、`parsed markdown`=可用缓存。L1 缺 parsed 即失败并列缺失 rel |
| S2 | 高 | 正则吞后接英文/多行 | 改 `data:image/[^;,]{0,80};base64,[A-Za-z0-9+/=]+`（保留 `IGNORECASE`）；回归覆盖 `...;base64,AAAA)==>`、后接英文段落、多行。**已实测确认，立即修** |
| S3 | 中 | Layer A 只用原查询词 | **并入立即批次**：Layer A BM25 喂**全部 query 词并集**（或逐查询取 max）；补「q1 独有命中」用例 |
| S4 | 中 | `project_no` 空转 | S1 门禁后、L3b 索引时注入；`metadata_from_filename` 按 `_` 切分对括号/多下划线可能取错，**以 `FUND_NAME_PATTERN` 做一致性测试** |
| S5 | 中 | 历史 40k 字符与 64k 预算冲突 | 按 token 截断最旧**完整轮**、保留末条 user、system/task 单独计、装配前一次性确定；D-L8 落实 |
| S6 | 中 | 停用词与覆盖口径 | **定稿 (1)**：`terms=_query_terms(query)`；为空 → `reason="direct"`（去掉回退）；覆盖率基数改 `per_doc_cand`（评分仍 `per_doc_top_m`） |
| S7 | 低 | `REPORT_RECALL_M=40` 硬顶 | 小库全量；增长后切分数阈值（uncalibrated）。**未实现**：代码仍 `report_recall_m=40` 硬截断（`retrieval.py:262`）；当前 35<40 等价全量、无影响 |
| S8 | 中 | `/file` 422 → PDF iframe 显示 JSON | **改为前端比对 `sources.version` 与 `useDocuments` 当前 version**，不一致显示「文档已更新」；**不预探 `/file`（200MB）**；必要时 `HEAD` 预检 |
| S9 | 低 | 旧 `CANDIDATE_CAP=200`、`95/10 例` | 确认已被两级索引取代；§5.1 注明 `10 例`=本模块、`95`=全量 |

**立即批次规格（仅 `retrieval.py`，与 K13 重建无关）**
- **S2**：`_BASE64_IMAGE = re.compile(r"data:image/[^;,]{0,80};base64,[A-Za-z0-9+/=]+", re.IGNORECASE)`；无终止锚点，测试覆盖紧贴字母边界。
- **S6a**：`terms = _query_terms(query)`；`if not terms: return RetrievalResult([], matched=False, reason="direct")`；**不做回退**（纯停用词 = 无可检索内容词 = direct）。`RetrievalResult.reason` 注释扩为 `"" | "no_reports" | "direct"`。
- **S6b**：覆盖率取 `per_doc_cand` chunk（含 heading/正文），评分仍用 `per_doc_top_m`。
- **S3**：Layer A BM25 查询词 = 全部 query 词并集。
- **验收**：后接英文/多行 base64 不吞正文；纯停用词查询→`direct`；`q1` 独有命中报告可被召回；`project_no=""` 时不按 doc_id 误去重。
- **代码对齐（本轮已实现）**：`SelectedReport.chunks` = `per_doc_cand`（RRF 降序、可引用集），评分仍 `top_m`；回归 `test_user_can_cite_every_candidate_chunk_not_only_scored_top`。

**证据（测量于 `c81383b` 时点，2026-09-22，重建进行中）**：`strip_base64('text data:image/png;base64,AAAA/BBBB== Discussion...')` → `'text [图片]'`（确认 S2）；`source=35, docs=18, parsed markdown=19（含 _pilot）, mineru 运行中`（确认 S1）。此后实测 `parsed 23/35`、`docs=21`、`files=21`，仍在增长——门禁以「重建结束 + `parsed/<rel>` 按 rel 全覆盖」为准，不看单一数字。

### 5.4 实测问题：宽泛领域查询（2026-09-22）

- 现象（用户）：问「人工智能医疗领域的近年进展」120s 后「找不到证据」。
- 根因分解：
  1. **未接线**：问答仍走旧 `research`（`research_timeout=120`），新 `Knowledge.retrieve` 无生产调用者；实测新引擎对同一查询**毫秒级**返回 `matched=True`（17 候选）。
  2. **覆盖度量失真**：覆盖率用原始重叠 2-gram；**chunk 语料 DF** 显示高频泛词/伪词：`应用` 1.00、`人工` 0.91、`的应` 0.83、`域的` 0.71、`能在` 0.46（报告索引 DF 会低估这些，故必用 chunk-DF）。
  - **对策**：**D-L10**（`GENERIC_DF_RATIO=0.35` 按 **chunk-DF** 净化 + 逐文档相对阈值 `REL_COVER×top1` + 保底）；**下一步 = 步骤 5 接线**。
- 证据（实测，基金库）：净化后 `specific('人工智能在医疗领域的应用')={在医,医疗,疗领}` → 证券市场报告 cover=0、医学报告 top；`specific('癫痫致痫网络')={癫痫,痫致,致痫,痫网}` → 赵国光报告 cover=1.00、噪声=0。

### 5.5 UI 迁移（U10）审查与收尾（2026-09-22）

**已核验**：`pytest tests -q` → **115 passed**；UI 重构为 `store.tsx`（AppProvider/useApp 承接全部 state/effects）+ `App.tsx`（仅布局）+ `components/`（24 个展示组件）+ 设计令牌；删除 `Answer`/`SessionList`/`TaskPicker`/`Notes`/`appContext`；`documentPreview.ts`→`documentText.ts`。浏览器离线验收 **7 用例**已过；在线 `browser_fund_preview`/`browser_smoke` 未跑。逻辑修正见 §3 与迁移记录。

**已并行提交**：UI 迁移 + 后端 prompt/graph 改动已由 `777df19` 提交；归档模板已 ignore（`.logsdev/archive/`）。

**需收尾（审核 U1–U4）**：
1. **U1（中）`ui-migration.md` 位置矛盾 — ✅已删除**：文件实际在 `.logsdev/ui-migration.md` 且**被 git 跟踪**（15.5KB），与 `.logsdev/README.md`「只维护三份长期文档」及本决策「不再作为长期文档」冲突。**已删除**（`git rm`，git 历史可追）；长期决策已折入 `DECISIONS.md`；`ITERATION` 链接已改指 `DECISIONS.md`。归档模板膨胀（104M）**已解决**（`.logsdev/archive/` 已 ignore，0 文件被追踪）。
2. **U2（中）受保护区域仅离线验收**：删除 `Answer.tsx` 后，步骤/耗时/token/已读证据由 `MessageView` 承载。**动作**：U10 声明完成前补一次**在线真实数据**回归（步骤存在、耗时/token 显示、`[n]` 可点跳页），或至少加离线断言覆盖这四块结构与点击。
3. **U3（中）`store.tsx` 单 Provider 重渲染风险**：流式 token 更新会触发整棵组件树重渲染。**动作**：评估 `useApp` 对高频字段（流式文本/进度）分片或 `memo`，纳入后续浏览器实测项。
4. **U4（低）删除清单的功能归属**：见下表，各留至少一条离线用例。

**删除 → 新承载对照**

| 已删除 | 新承载 |
|---|---|
| `Answer` | `components/MessageView.tsx`（步骤/耗时/token/引用/已读证据） |
| `SessionList` | `components/SidePanel.tsx` |
| `TaskPicker` | `components/Composer.tsx`/`SidePanel.tsx`/`ListingViews.tsx` |
| `Notes` | 未挂载（后端 notes 保留，前端无入口） |
| `appContext` | `store.tsx`（`AppProvider`/`useApp`） |
| `LibraryView`/`CorpusAdmin` | `CorpusGrid.tsx` + `CorpusDetail.tsx` + `CorpusFiles.tsx` |
| `SettingsDrawer` | `Drawer.tsx` + `OpsDrawer.tsx` + `CorpusDetail.tsx` |
| U6 电源 / U8 状态灯 | `OpsDrawer.tsx` / `IconRail.tsx`+`SidePanel.tsx` |
| U5 分支 | `SidePanel.tsx` + `MessageView.tsx` |

**收尾顺序**：✅U1 已删 → 补受保护区域在线/离线回归（U2）→ 记录 store 性能项（U3）→ 进 L6。

### 5.6 L6/L7 核实与遗留（2026-09-22，planner）

**核实结论（复核 coder 交付 88e7be7/2c89350/c28e00a）**：
- L7 指标**复现一致**（基金库 BM25-only）：task1 recall=1.00/MRR=1.00/no_match=0.00/dedup=1.00/ctx≈56340；task2 ctx≈68695；P50≈0.60s。15 条为“标题即答案”强区分查询，**recall 饱和，不做无依据调参**。
- `measured.labels` 已含 `retrieve`/`assemble`、移除 `research`（L1 满足）；节点集合 `{understand,direct,finish,retrieve,assemble,validate,answer}`。
- 测试 115→96 属**预期**：L6 删除 `test_quick.py`/`test_evidence_routing.py`/`test_professional_policy.py`（对应已删的 `quick.py`/研究循环）。
- ruff 4 处：3 处既有（`main.py` SIM114/B008、`prompts/__init__.py` UP033，父提交已存在），1 处 `tests/browser_library.py` F401 由早前 UI 提交引入；均非 L6/L7 引入。
- `validate` 顺序：实作 `retrieve→assemble→validate→answer`（避免流式二次回答），**planner 确认接受**（§7.15 备注 / §7.9 图已同步）。

**遗留（低）**：
- **已修复（2026-09-22）**：L6 的 `telemetry` 形状变更导致**恢复旧会话白屏**（`context_tokens` 未定义 → `toLocaleString` 抛错）。已对 `MessageView` 的持久化字段加默认，并加顶层 `ErrorBoundary`（见 `DECISIONS.md`「持久化数据向后兼容」）。Playwright 验证旧会话正常渲染、无 `pageerror`；`npm test` 18 passed。
- **测试覆盖缺口**：`routing.resolve_policy` 仍在并被图调用，但 `scope_missing`→clarify、`preparation` 路由、run timeout 的 Python 用例随 `test_professional_policy.py` 删除而**无替代**（`test_app` 仅测 health 字段）。建议补 `tests/test_routing.py`（scope_missing→clarify、preparation→notice、timeout→`timed_out`）。
- 检索延迟 ≈0.6s 源于每查询重建 BM25；K10 chunk 缓存未做（性能项）。
- 评测集偏易，需扩样后再校准 `MIN_TERM_COVER`/`PER_DOC_TOP_M`/`MIN·MAX_REPORTS`。
- **状态（本轮）**：D-L10 已实现（步骤 5）。实测 `GENERIC_DF_RATIO=0.35` 下泛词判据与 §5.4 一致（`应用`1.00/`人工`0.91/`医疗`0.34）；`癫痫致痫网络` 仅 1 篇（噪声 0），`人工智能在医疗领域的应用` 仅医学报告，证券市场报告不再入选。细节与证据见 §3 / D-L10（§7.7）。

### 5.7 G10/E 核实与遗留（2026-09-22，planner）

**核实结论（复核 `b90e809`/`acdae7c`/`409ad2d`/`463c41b`/`9c3c82e`）**：
- `pytest tests -q` → **104 passed**；`test_reports` 覆盖 schema 迁移/幂等/列表。
- **M1–M7 均已实现**：`PRAGMA table_info`+幂等 `ALTER`（M1）；`''`+部分唯一索引 `WHERE run_id != ''`（M2）；`find` 幂等 → `POST` 既有 200 `idempotent=true` / 新建 201（M3）；`GET /api/reports?session_key=&run_id=&limit=` 仅元数据、`created_at DESC`、默认 20/上限 100、未命中 `[]`（M4）；`reports.py`/`main.py` 注释与 docstring 更新（M5）；docstring 记已知限制（M6）；`session_key` 服务端不强制（M7）。
- 前端：`api.createReport/fetchReports/fetchReport`、`MessageView` 报告卡片（生成/重新生成/复制/下载 `.md`）、`SidePanel` 会话报告列表、`Attempt.report` 可选持久化 `reportId`；`ReportCard` 首次用 `attempt.runId`（重试安全）、重新生成用 `crypto.randomUUID()`（新报告）——符合 M3。
- `main.py` task4 注释已更正。

**遗留**：
- **在线端到端未做**：报告生成依赖真实模型调用；报告卡片/会话列表仅经单测+构建验证，**未做真实模型浏览器 E2E**（coder 已如实声明）。列为待验收项。
- ruff 实为 **4 处既有**（`main.py` SIM114/B008、`prompts` UP033、`tests/browser_library.py` F401），非 3 处；均非本轮引入。
- §9 扩展（task5–8、docx/pdf、图表）仍非首期、未实施。

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
| K12 | **按库 OCR 语言对齐与重导入（侧栏优先）** — **OCR 语言部分已被 K13 取代，仅保留 `force` 重导入机制**（原实现规格见 §6.5）：入口放在**左侧边栏知识库展开项**（`CorpusPicker`/`CorpusAdmin`）：每个库可选 OCR 模式/语言 + 「重新导入并应用」；库详情（`LibraryView`）复用同一操作（可选）。OCR 模式/语言按库存储（`<KB>/datadb` 的 `meta`），生效值 = 库配置 ?? 全局；`files` 清单记录 `used language/mode`，不一致标 `ocr_stale`；「重新导入」必须走 `POST /api/corpora/{id}/ingest?force=true`（绕过 size+mtime 跳过、全部重解析），并提示“重解析全部文件、版本会变化”；对中文库建议 `chi_sim+eng`（可选） | 侧栏展开库 → 选 `chi_sim+eng` → 重新导入 → 预览文本可读、`ocr_stale=false`；未改语言时未变文件仍跳过（不会白重解析） |
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
- 建议顺序（剩余）：**K5 → K9 → K10 → K11**（K0/K0b/K1/K13/K6a/K6/K7/K8 已完成；K3 的 liteparse 并发随 K13 移除；K6b 随 K6/K6a 定）。
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

## 7. L 阶段：报告级混合检索（RAG 重构，2026-09-22，规划）

### 7.1 目标与搜索空间
- 输入：用户问题 + 任务（task1–4）+ 资料范围（库/文档）。
- **搜索空间 = 报告解析后的 markdown / 块文本**（mineru 产物）。
- 目标：先定位相关报告，再把这几篇报告**全文**（预算内）交 LLM，结合任务提示词回答；结论引用到报告+页。
- 不新增任务；但 **answer 系统提示与 `base.md` 的“已读证据”口径需随“全文上下文”同步修改**（否则“全文”被当作“逐条已读”，见 §7.14 D-L2）。

### 7.2 结论：markdown 与 LangGraph 非二选一（已确认）
- markdown 是**数据/上下文**；LangGraph 是**编排**。保留图与事件/预算/超时/追踪；换掉 `research` 里 LLM 驱动的 search/read 工具循环，改为**确定性检索 + 有界补查**。

### 7.3 关键缺陷与收口（L 开工前必须解决）
- **base64 图片污染**：v4 markdown 内嵌 `data:image/...;base64,...`；分块前**剥离为 `[图片]` 占位**，只对文本做 BM25/dense。
- **页码不可靠**：不以"文本匹配"映射页，改为**以 `middle_json` 的 block 为原子**（block 自带 `page_idx`）；chunk 天然带页号，markdown 仅用于渲染/上下文。
- **报告分数太脆**：改为**每文档取自身 top-m chunk 的 RRF 累计**（非全局池累加）；`doc_score = Σ_{c∈top_m(d)} rrf(c) + β·distinct_headings + δ·字段命中 − γ·log(1+len(d))`，替代 `max(chunk)+α·topk_count`。
- **检索算法 6 项收口（2026-09-22 评审；只动检索、不动回答契约）**：
  1. **聚合不稳**：`max+α·topk_count` 被单个幸运 chunk 主导，`topk_count` 与命中数相关使长报告天然占优 → 改为文档级 top-m RRF 累计 + 覆盖 + 字段加权（见上）。
  2. **全局池漏召回**：只取 40–80 chunks 再聚合，关键 chunk 排在池外即整篇漏；且全局池不保证每篇候选有代表 → **先按文档取 top-m 再评分**。
  3. **单查询漏面**：task2/3/4 是多子问题/多主题，单查询会漏面 → **有界多查询（≤3）** + 任务化分解；缺口补查需确定性判据。
  4. **缺去重/多样性**：同报告相邻/重叠 chunk 重复计分、同项目多份挤占名额 → chunk 按 `chunk_id` 去重；报告级项目去重 + MMR 多样性。
  5. **无阈值/无匹配语义**：弱命中被当证据 → 归一化 `doc_score ≥ τ` 且 top1 chunk 有词面交集才进入回答，否则走“无匹配报告”。
  6. **无“全面”定义**：无覆盖目标/停止条件 → aspect 集 + `COVERAGE_TARGET` + 保底（每主题/实体、最相关 `MIN_REPORTS` 项目各≥1），按年份分层。
  - **第二轮评审收口（2026-09-22）**：Q2/Q3 冲突（全局 RRF 截断发生在文档分组之前）由**两级索引**解决——先报告级召回 top-M，再报告内精排；全局 `CANDIDATE_CAP` 取消。阈值改为可解释的主题词覆盖率判据；三权重/MMR/覆盖贪心/LLM 多查询/缓存/rerank 降级为默认关、评测触发（详见 §7.7）。
- **同项目去重 + 任务差异**：按**项目编号**分组去重（同项目取最新/最全一份，跨年合并标注区间）；`min/max_reports` 与是否需全文按 task 区分（§7.7）。
- **预算用 token 而非字符**：`RETRIEVE_CONTEXT_TOKENS`/`RETRIEVE_REPORT_TOKENS`/`ANSWER_RESERVE_TOKENS`，全局核算 system+历史+提示词+报告+输出 ≤ 模型上限。
- **与 K10 去重**：L2 的 chunk 模型直接取代 K10 的候选缓存；K10 只保留"BM25 按库缓存 + chunk id 预计算"两条原则（并入 L1–L3），不建两套索引。
- **dense 子集行为**：限库/限报告时改用 **Chroma metadata filter（doc_id ∈ allowed）**，不再退化成 BM25-only（现 `knowledge.py:185-190`）。

### 7.4 数据与版本（L1）
- `Document` 增 `markdown`；`version = sha256(markdown + pages JSON)`；`read_markdown(doc_id, version)` 版本校验。
- **存储分离**：`docs` 只存元数据+版本；正文另置 `doc_pages(doc_id,page,text)` 与 `doc_markdown(doc_id, markdown)`；`all()`/检索不加载 markdown，装配时按选中的少数报告读取。
- 复用 K13 的 `parsed/<rel>/`（`markdown.md`+`middle_json`）一次性落库，**不二次跑 mineru**。

### 7.5 分块与页码（L2）
- 原子 = `middle_json` block（带 `page_idx`）；按 `title/heading` 切 section，section 内按 512–1024 字 / 100–150 重叠再切；表格/代码/公式整块不拆。
- `chunk = {chunk_id, doc_id, version, title, heading, page, text, tokens}`；`chunk_id = sha1(doc_id|version|page|heading|序号|text)`（版本变自动失效）。
- 分块前剥离 base64。表格**整块一个 chunk 不拆行**（mineru 表格为 markdown 表格）；表格 chunk 额外进 BM25 候选（dense 对表格弱）；图注文本保留、图片本体剔除。

### 7.6 索引与缓存（L3）
- `<KB>/datadb` 持久化 `chunks` 表（含 tokens）+ 每库一个 `BM25Plus`（内存缓存，导入/删除置 dirty 或增量）；查询 O(命中)。
- **字段化 token**：标题/项目号/年份单独存字段 token，BM25F 式加权（标题命中 ×2，项目号精确命中固定加）；CJK 沿用 `tokens()`（`knowledge.py:28`）的 2-gram。
- Chroma 用同一 `chunk_id` 作主键，metadata `doc_id/version/page/heading`（+`project_no`/`year`）；**dense 只嵌入 query + HNSW 检索**，不再每查询 `get(include=[])` 全量 id 再 diff（现 `dense.py:55`）。
- 两级索引：**报告级索引**（`title+各级 heading+project_no/year`，几百条，构建近乎免费）供 Layer A；chunk 级供 Layer B。**取消全局 `CANDIDATE_CAP`**（扁平回退时按文档截断，§7.7）。短时缓存延后。
- `EMBEDDING_PATH` 空 → BM25-only 并如实显示；34 报告 ≈ 数千 chunk，CPU 嵌入需后台（K5）+ 进度，不阻塞首问。

### 7.7 检索与报告选择（L4）

**范围**：只改检索，**不改回答契约**（引用仍按 D-L1/D-L2 指向命中 chunk）。

**主结构：两级「报告召回 + 报告内精排」（2026-09-22 第二轮评审采纳）**

```text
Q → [Q0]归一/过滤 → [Q1]报告级召回(top-M 报告)
  → [Q2]报告内 chunk 精排(每报告 top-m) → [Q3]报告评分/项目去重
  → [Q4]覆盖选择(默认关) → [Q5]有界缺口补查(≤1) → selected_reports
```

- **Layer A 报告级召回**：每篇报告一个文档级索引（`title + 各级 heading + project_no/year`）；BM25(+dense) 直接取 top-`REPORT_RECALL_M` 报告。报告数（34）远小于 chunk 数，既快又保证每篇报告都有被召回机会 → **消除全局 chunk 池漏召回**（不再需要全局 `CANDIDATE_CAP` 截断）。
- **Layer B 报告内精排**：仅在候选报告内部做 chunk 级 hybrid（BM25+dense RRF），每报告保留自身 top-`PER_DOC_CAND` 候选，评分取 top-`PER_DOC_TOP_M`。
- 报告聚合：直接用「报告内代表 chunk 的 RRF 累计」，**不做 max+count、不依赖复杂归一化**。
- 级联：`selected_reports ⊆ Layer A 召回集`，且满足 `MIN/MAX_REPORTS` 与 token 预算。
- **回退**：若不采用两级，扁平 chunk 池必须**按文档截断**（每文档 top-`PER_DOC_CAND`，全局仅 `SAFETY_CAP` 高保护值，且在文档分组之后才截断）；多查询加权时截断按**加权 RRF 分**排序。

**Q0 归一/过滤（MVP）**
- 归一化：全半角、大小写、空格；保留原始 query 供展示。
- MVP 只做 `corpus_id`/`allowed_doc_ids` 过滤并**下推**到检索层（现状 `knowledge.py:147` 是 `all()` 后 Python 剪枝）。
- `year_from/year_to`、`fund_type`、`domain`、`project_no` 硬过滤 = **L4d，延后**（依赖 H9/B2/B4/B5 与 `ChatRequest.filters`；未就绪不得从 UI 发送）。

**Q1 报告级召回（Layer A）**
- 用文档级索引（`title/heading/project_no/year`）直接 BM25(+dense) 取 top-`REPORT_RECALL_M` 报告；**BM25 查询词用全部 query 的并集**（S3），避免只匹配扩展查询的报告被漏。
- **报告数 ≤ `REPORT_RECALL_M` 时全量召回**；报告数增长后改分数阈值（S7，uncalibrated）。

**Q2 报告内 chunk 精排（Layer B，Q1–Q3 为内部细节）**
- 多查询：**默认只用规则**（`q0` 原查询 + `q1` 关键词/实体查询）；按 task 的第 3 条 **LLM 拆解默认关**（延后，评测触发）。
- RRF：`score_rrf(c) = Σ_q w_q · 1/(RRF_K + rank_q(c))`，`RRF_K=60`，`q0` 权重 1.0、`q1` 0.8；按 `chunk_id` 去重，多查询命中累加。
- 候选规模：Layer A `REPORT_RECALL_M`（默认 40，uncalibrated，当前 34 报告库可更小）；Layer B 每查询 `KB_CHUNK_TOPK`/`DENSE_TOPK`（默认 50/50，uncalibrated）。

**Q3 报告评分/项目去重**
- `doc_score = Σ_{c∈top_m(d)} score_rrf(c)`（**默认只保留 RRF 累计**）。
- `SelectedReport.chunks` = `per_doc_cand`（按 RRF 降序，可引用集），评分仅用 `top_m`（见 §7.8）。
- `β·distinct_headings + δ·字段命中 − γ·log(len)` 三权重**默认全 0（关）**；由评测触发后再上。
- `doc → project_no` 映射来自文件名（`FUND_NAME_PATTERN`）/ H9 元数据；同项目保留分最高一篇，其余注明“另有同年份报告”；跨年合并标注区间。

**Q4 覆盖选择（默认关、延后）**
- MMR 多样性、aspect 贪心 + `COVERAGE_TARGET` **默认关**；先用「每主题/实体、每个 `MIN_REPORTS` 项目各至少 1 篇」的简单保底。评测显示缺面后再上贪心。

**Q5 有界缺口补查（≤1 轮）**
- 确定性判据：答案所需主题词在已选报告中缺失（主题词是否出现在已选报告正文/命中 chunk）。
- 只对缺失主题再检索一轮；仍缺则 `coverage_partial` 并如实声明。与 §7.9 的 validate→retrieve 回边一致，**全局至多一次**。
- 输出 `selected_reports[]`：命中 chunks、页集合、是否截断、覆盖的主题。

**默认关/延后（由 §7.11 评测触发）**：MMR 多样性、aspect 贪心 + `COVERAGE_TARGET`、LLM 多查询、短时结果缓存、cross-encoder rerank（`RERANK_TOPK=0`）、`β/δ/γ` 三权重。

**任务差异（报告数 min/max，初值待评测校准）**：

| task | 检索策略 | MIN/MAX_REPORTS（初值，uncalibrated） |
|---|---|---|
| task1 精准问答 | chunk-only 可答；不必全文 | 1 / 3 |
| task2 对比分析 | 强制跨项目/跨报告（多查询按对比对象） | 2 / 5 |
| task3 趋势 | 覆盖多报告/多年份（按年份分层） | 3 / 8 |
| task4 专项报告 | 按模板章节 + 领域/年份过滤 | 3 / 10 |

**阈值与无匹配（可解释、可复现；τ 仅兜底；D-L10）**
- **词项净化（可执行）**：`generic = {t : df_chunk(t)/N ≥ GENERIC_DF_RATIO}`（**chunk 语料 DF**，默认 **0.35**）；`specific = _query_terms(query) − generic`。**无需**显式「剔伪 2-gram」——高频伪词（`应用`/`人工`/`的应`/`域的`/`能在`）被 chunk-DF 判为泛词；低频伪词（`在医`/`疗领`，DF≤0.11）无害，只作 `医疗` 的代理。
- **覆盖率**：`cover = |specific ∩ 命中| / |specific|`；`specific` 为空（宽泛领域查询）→ 跳过逐文档阈值，按报告分取 top `MAX_REPORTS` 标 `coverage_partial`。
- **判据优先级（写死）**：
  1. `top1 = max_doc_cover`；`matched = top1 ≥ MIN_TERM_COVER`（宽泛查询 bypass）。
  2. 逐文档接受：`cover ≥ max(MIN_TERM_COVER, REL_COVER × top1)`。
  3. **保底**：去重后不足 `MIN_REPORTS` 时，按报告分补足并标 `coverage_partial=True`；总数上限 `MAX_REPORTS`。
- BM25 侧要求命中 chunk 含**非停用词/实体匹配**，不接受「任意中文 2-gram 交集」（过松）。
- `NO_MATCH_TAU` 仅兜底且标注 uncalibrated；若启用必须写明归一化公式（如 `doc_score / (PER_DOC_TOP_M / RRF_K)`）与适用库，不作为常数。

**D-L10 覆盖度量与逐文档入选阈值（2026-09-22，P1–P4 修订）**：
- **问题**：覆盖率基于原始重叠 2-gram；泛词与高频伪词（`应用` 1.00、`人工` 0.91、`的应` 0.83、`域的` 0.71、`能在` 0.46）抬高噪声；仅全局 gate 时相关查询会连带弱命中报告入选。
- **词项净化（可执行）**：`generic = {t : df_chunk(t)/N ≥ GENERIC_DF_RATIO}`（**chunk 语料 DF**，默认 **0.35**）；`specific = _query_terms − generic`。**阈值须保留真实词、剔除高频伪词**：实测 `医疗` 0.34 保留、`能在` 0.46 剔除（报告索引 DF 会低估伪词，故必用 chunk-DF）。
- **覆盖率**：`cover=|specific∩hit|/|specific|`；`specific` 为空（宽泛领域查询）→ 跳过逐文档阈值，取 top `MAX_REPORTS` 标 `coverage_partial`。
- **逐文档入选与保底**：见上「判据优先级」；保底补足时 `coverage_partial=True`。
- **参数治理（P4）**：`MIN/MAX_REPORTS`、`MIN_TERM_COVER`（+`PER_DOC_TOP_M`）为**必须校准**；`REL_COVER`、`GENERIC_DF_RATIO` **固定默认、仅观察**。

**参数治理**
- 集中配置：`RetrievalConfig`（`Settings` 子集或 `<KB>/datadb/retrieval.json`），全部带默认值；未校准项显式标 `uncalibrated`。
- **必须校准（3–4）**：`MIN/MAX_REPORTS`（按 task）、`PER_DOC_TOP_M`（或报告召回 M）、`MIN_TERM_COVER`。`REL_COVER`、`GENERIC_DF_RATIO` **固定默认、仅观察**（不列为必须校准）；`COVERAGE_TARGET` 默认关、启用后另计。
- 每次调参记录「参数版本 + 评测指标」，禁止无来源魔法数。

**参数表（默认值；标 `~` 为 uncalibrated）**

| 参数 | 默认 | 作用 |
|---|---|---|
| `REPORT_RECALL_M` ~ | 40 | Layer A 报告级召回数（34 报告库可更小） |
| `KB_CHUNK_TOPK` / `DENSE_TOPK` ~ | 50 / 50 | Layer B 每查询候选数 |
| `PER_DOC_CAND` | 4 | 每报告保留的候选 chunk |
| `SAFETY_CAP` ~ | 1000 | 仅扁平回退的高保护上限（两级路径不用） |
| `PER_DOC_TOP_M` ~ | 3 | 报告评分取前 m chunk |
| `RRF_K` | 60 | RRF 常数 |
| `MIN_REPORTS` / `MAX_REPORTS` ~ | 按 task 上表 | 报告数下/上限 |
| `MIN_TERM_COVER` ~ | 0.3 | 全局无匹配 + 逐文档绝对下限 |
| `REL_COVER` | 0.5 | 逐文档相对阈值（固定默认，仅观察） |
| `GENERIC_DF_RATIO` | 0.35 | 泛词判定基于 **chunk 语料 DF**（固定默认，仅观察；保留 `医疗`0.34、剔 `能在`0.46） |
| `NO_MATCH_TAU` ~ | 0（兜底，默认不启用） | 归一化分数兜底 |
| `COVERAGE_TARGET` ~ | 关 | 覆盖贪心（延后） |
| `MMR_LAMBDA` | 关 | 多样性（延后） |
| `RERANK_TOPK` | 0（关） | cross-encoder |
| `CONTEXT_TOKENS` / `REPORT_TOKENS` | 见 D-L3 | token 预算 |

**快（实现要点）**
- 每库预计算：报告级索引（几百条）+ `chunks` 表（含 tokens）+ `BM25Plus` 按 `(corpus, version 签名)` 内存缓存；导入/删除置 dirty 或增量。
- dense 只算 query（见 §7.6）；Layer A 先缩小到 top-M 报告，Layer B 只在候选内精排。
- RRF 起步，**不默认 rerank**；短时缓存延后。

### 7.8 上下文装配（L5）
- 预算：`RETRIEVE_CONTEXT_TOKENS`（总）与 `RETRIEVE_REPORT_TOKENS`（单篇）；按总分降序装入，放不下按 section 截断（保留命中 section + 标题 + 首/结论段），记 `truncated[]`。
- 报告头：题目/项目号/负责人/**项目起止年份（从文件名派生，非报告年份）**；严格报告年份字段尚无来源，见 §13.5 P2-MD。
- "lost in the middle"：最相关放首/尾，中间放次相关；附极简目录（标题+页码范围）。
- 引用：`[n]` = **命中 chunk**（doc_id+version+page+heading+snippet），`sources` 逐条不变（§7.14 D-L1）；保留 `sources` 字段与不可点字面回退。
- **引用集合口径**：`SelectedReport.chunks` = `per_doc_cand`（按 RRF 降序，含 heading/正文）作为可引用集；**评分只用 `per_doc_top_m`**。L5 装配/引用按 `per_doc_cand`，避免覆盖集（`per_doc_cand`）与可引用集（原仅 `top_m`）不一致。

### 7.9 LangGraph 流程（L6，已实现）
```text
understand → retrieve → assemble → validate → answer → finish
  ↑__ validate 发现覆盖缺口且预算允许：至多一次 re-retrieve（sources 不变） __|
```
- `understand`：`resolve_policy` 固定专业策略；LLM 拆解默认关（规则多查询，§7.7）。
- **`validate` 在 `answer` 前**（避免流式二次回答）；`validate_citations` 在 `answer` 内联；「至多一次 re-retrieve」由 `validate` 回边实现。
- 事件/预算/停止语义不变；`telemetry` 增 `chunks_retrieved/reports_selected/context_tokens/invalid_citations`。
- `quick.py` 已删除；task1 走确定性 `chunk_only` 分支（`telemetry.path=chunk_only`）。
- 节点集合含 `direct`（无检索/澄清分支）。实作备注见 §7.15。

### 7.10 Word 报告（后续，接口先定）
- E 阶段消费 `selected_reports + coverage + evidence` 生成 `.docx`；`templates/*.docx` + python-docx 占位符/表格。
- 占位符约定：`{{domain}}`/`{{year_range}}`/`{{sections}}`/`{{sources}}` 等，先定避免检索输出反复改。
- 检索侧保证报告集与证据**可序列化、可追溯**；不把 chunk 直接交给 Word。**不在本轮**。

### 7.11 验收与评测（L7，"快准全"可度量）
- **复用并扩展 `src/evaluate.py`**（已有 `source_recall`/`evidence_recall`/`MRR`，按 `expected_source`+`expected_terms`）；仅替换失效数据集 `project_progress/evals/retrieval_v4.jsonl`，**不新建评测框架**。
- 规模先 **10–15 条**（34 报告库足够）；离线用「期望报告/项目集合」算 recall 替代 aspect 覆盖率（人工标注成本高，留待真实反馈）。
- 指标：`report_recall@k`、`MRR`、引用页码抽样正确率、P50/P95 检索延迟、平均上下文 token、**no-match 误报率**；同项目去重正确率（规则，可离线）。
- 消融：BM25-only vs hybrid；单查询 vs 规则多查询；`max+count` vs 报告级召回。**只校准 4 个参数**（`MIN/MAX_REPORTS`、`PER_DOC_TOP_M`/报告 M、无匹配判据、`COVERAGE_TARGET` 若启用）。
- 记录：每次调参写「参数版本 + 指标变化」；未校准项标 `uncalibrated`（§7.7 参数治理）。
- 地位：本节评测集与指标是 L4 参数与 L7 验收的唯一依据（R11）。

### 7.12 任务

| 编号 | 任务 |
|---|---|
| L1 | 存 markdown + 存储分离（`doc_pages`/`doc_markdown`）+ `read_markdown`；从 `<KB>/parsed/` 重索引，不重跑 mineru |
| L2 | block 原子分块 + 页码 + base64 剥离 + `chunk_id` |
| L3 | `chunks` 表 + BM25 缓存 + Chroma（metadata filter / 主键） |
| L3b | 报告级索引（`title+heading+project_no/year`），供 Layer A 报告召回 |
| L4 | 两级检索「报告召回 + 报告内精排」（详见 §7.7） |
| L4a | 报告级召回 + 报告内 top-m RRF 评分 + 无匹配判据（MVP 主路径） |
| L4b | 有界多查询（规则）+ 项目去重（默认最简；MMR/覆盖贪心延后） |
| L4c | 有界缺口补查（≤1 轮） |
| L4d | 元数据过滤下推（year/domain/project；**延后**，依赖 H9/B2/B4/B5） |
| L5 | token 预算装配 + 报告头 + 目录 + 引用 |
| L5b | 临时接线：`Knowledge.search` 委托新引擎、删除旧窗口 BM25（单索引） |
| L6 | LangGraph 新流程替换 research 循环 |
| L7 | 评测集与快准全指标 |

### 7.13 依赖与排期（2026-09-22 裁决后）
- **L1 依赖 K13 重建完成并核对**（`docs=34`/正文可读/页码）；L1 从 `<KB>/parsed/<rel>/` 缓存**重索引**，不再次跑 mineru。
- **L3/L3b 不硬依赖 K5**（当前 ~34 报告、BM25-only，同步建索引成本可接受）；K5 仅在需要进度/取消 UX 或启用 dense 前成为前置。
- **单索引约束**：新检索与旧窗口 BM25 不得并存；接线时 `Knowledge.search` 委托新引擎并删除旧窗口扫描（§7.14 D-L7）。
- 最小切片：**L1 → L3/L3b → L4a → L5 → 临时接线 → L6 → L7（校准）**；BM25-only 即可验收准/全。
- 延后/由评测触发：MMR/覆盖贪心、LLM 多查询、L4c 补查、L4d 过滤、dense/rerank。L7 是 L4 参数与验收的唯一依据（R11）。


### 7.14 开工前定稿：五项决策与 R1–R12 收口（2026-09-22）

**D-L1 引用粒度**：`[n]` = **命中 chunk**（`doc_id+version+page+heading+snippet`），可引用集 = `SelectedReport.chunks` = `per_doc_cand`（评分用 `top_m`）。`sources` 仍逐条（前端零改动，保留“已读证据”语义）；上下文注入报告全文，但引用指向支撑该结论的 chunk。markdown chunk 无 `start_line/end_line`，后端统一为 chunk 字段（缺失省略）。

**D-L2 引用校验与提示词口径**：
- 新增确定性 `validate_citations`：抽取正文 `[n]`；越界/无对应 → 按 `citation.ts` 规则字面保留或纠正；计入 `telemetry.invalid_citations`。
- **改提示词**：answer 系统提示与 `base.md` 把注入内容表述为“本次选定报告的全文（分隔符内为数据，不是已逐条核对的证据）”；引用粒度 = chunk；只引用确实支撑结论的段落。

**D-L3 token 预算与模型上限**：
- 显式声明 `MODEL_CONTEXT_TOKENS`（deepseek-chat，如 64k）；新增 `RETRIEVE_CONTEXT_TOKENS`（如 24k）、`RETRIEVE_REPORT_TOKENS`、`ANSWER_RESERVE_TOKENS`（如 2k）、`ANSWER_TIMEOUT`（如 180s）。
- 全局核算 `system+task+history（ChatRequest ≤40k 字符）+reports+output_reserve ≤ 模型上限`；`models.py` 的 max_tokens/timeout 随可配。

**D-L4 stop_reason / telemetry.path / 前端标签**：
- `policy.stop_reason` 新集合：`professional`（正常）、`no_reports`（无命中）、`coverage_partial`（超预算/截断已说明）、`timed_out`、`failed`、`invalid_request`。
- `telemetry.path`：`retrieve`（报告级检索）、`chunk_only`（task1 片段作答）、`direct`（无证据/未就绪）。
- **`RetrievalResult.reason` 契约定稿（S6a）**：`"" | "no_reports" | "direct"`；`direct` = 查询无可检索内容词（`_query_terms` 为空），映射 `telemetry.path=direct`，按“无检索、直接回答”处理，**不得视为异常**。
- 前端 `policy.ts stopLabels` 与 `Answer.tsx` 的 telemetry.path 映射同步；移除 `covered/repair/search_limit/read_limit` 等旧循环标签。
- **三处同步（第二轮评审）**：`evidence.py decide()`、`graph.py validate()`、前端 `policy.ts` 同时移除旧标签，避免残留。

**D-L5 删除同步与配置失效**：
- 删除同步：`drop_file`/删库同时清理 `<KB>/parsed/<rel>/` 与 Chroma 对应 chunk，避免孤儿文件与陈旧向量。
- 配置失效：库 `meta` 记 `parser_signature = sha256(MINERU_CMD + mineru 版本 + tier)`；签名变化即 stale，`force` 重解析（K12 思路正式化）。增量签名从“size+mtime+sha256”扩展为“含 parser_signature”。

**D-L6 参数治理与无匹配判据**：
- 集中 `RetrievalConfig`；未校准项标 `uncalibrated`；只校准 4 个（§7.7）。调参记录「参数版本+指标」。
- 无匹配主判据为 query 主题词覆盖率 `MIN_TERM_COVER`（默认 0.3, uncalibrated）；`NO_MATCH_TAU` 仅兜底且须写清归一化公式。
- 默认关/延后：`β/δ/γ` 三权重、MMR+覆盖贪心、LLM 多查询、短时缓存、rerank。

**D-L7 版本迁移与单索引接线（2026-09-22 裁决）**：
- L1 改 `version` 定义后，历史会话 `sources` 的旧版本校验会失败；**允许失效并在 `read`/`/file` 明确提示“文档已更新”**，不重写会话历史（单用户；回答文本已随会话持久化）。迁移前备份 `<KB>/datadb/knowledge.sqlite3` → `.pre-l1`。
- **单索引**：接线时 `Knowledge.search` 委托新 chunk 索引，删除旧窗口扫描 BM25；不得两套索引并存。允许 L6 前**临时接线**，L6 再以确定性 `retrieve→assemble→answer` 替换 LLM 工具循环。
- 回退：保留 `<KB>/parsed/` 与 DB 备份；不回滚 schema。
- **UI 行为（S8）**：`/file` 对旧 version 仍返 422（不静默改语义）；**前端用已有 `useDocuments` 的 `doc_id→version` 比对 `sources.version`，不一致直接显示「文档已更新」——不预探 `/file`（200MB，白拉）**；如需服务端预检用 `HEAD /api/documents/{id}/file?version=`（仅回状态）。

**D-L8 token 预算口径（2026-09-22）**：
- 仓库无 tiktoken；MVP 用**保守字符估算**（CJK 按字、非 CJK ~4 字/token），并设字符硬上限作二次保护；`MODEL_CONTEXT_TOKENS`/`ANSWER_RESERVE_TOKENS` 显式配置。
- 供应商返回 `usage` 时在 `telemetry` 记实际值用于校准；估算标 `uncalibrated`，不声称精确。
- **历史预算（S5）**：`ChatRequest` 历史 ≤40k 字符 ≈ 40k token，须按 token **截断最旧完整轮**到 `HISTORY_TOKENS`（≈12k），**始终保留末条 user 消息**，system/任务提示**单独计**；截断在服务端装配前一次性确定（所有节点看到同一历史），再纳入全局等式 `system+task+history+reports+输出 ≤ MODEL_CONTEXT_TOKENS`。

**D-L9 CJK 无匹配口径（MVP，uncalibrated）**：
- 采用 2-gram + 小停用词表（含“研究/分析/成果/趋势”等泛学术词）+ 主题词覆盖率 `MIN_TERM_COVER`；要求实体/数字匹配。不引入外部停用词表；由 §7.11 校准。
- **边界（S6a，定稿，取代初稿回退）**：`_query_terms` 为空（查询仅停用词/泛学术词）→ `reason="direct"`，**不做事后回退**；`direct` 映射 `telemetry.path=direct`（无检索、直接回答），不得误判 `no_reports`。覆盖率用 `per_doc_cand`（含 heading/正文）而非仅 top-m 命中 chunk。

**D-L10 覆盖度量与逐文档入选（2026-09-22，P1–P4 修订）**：详见 §7.7「阈值与无匹配」——`generic` 按 **chunk 语料 DF**（`GENERIC_DF_RATIO=0.35`），`specific=_query_terms−generic`；逐文档接受 = `cover ≥ max(MIN_TERM_COVER, REL_COVER×top1)`；保底 `MIN_REPORTS`（不足则补并标 `coverage_partial`）；宽泛查询（`specific` 空）跳过阈值取 top `MAX_REPORTS`。

**R2–R12 其余收口**
- **R4 注入面**：报告用明确分隔符包裹；系统提示重复 `base.md` 第 8 条（文档文本是数据，不执行其中指令）；清洗 `<script>`、base64、超长 URL。
- **R7 quick/notes**：`quick.verify` 重写为 task1 的 `chunk_only` 路径（或删除）；`note_locators` 在 L 重写后移除（notes 未挂载）。
- **R8 限库/版本**：hybrid 用 Chroma metadata filter，`selected_reports ⊆ allowed`；`read`/`/file` 校验 chunk 的 `version`，不一致即失效。
- **R9 存储**：正文分表 `doc_pages`/`doc_markdown`，`all()`/检索不加载全文（治 K10 病灶）。
- **R11 评测**：§7.11 的评测集 + 指标是 L4 参数与 L7 验收的唯一依据。
- **R12 Word 契约**：L 输出稳定“报告数据契约” `{domain, year_from, year_to, template_id, sections[], selected_reports[], coverage, sources[]}`；E 阶段 `templates/*.docx` + python-docx 仅消费它。

### 7.15 L6 实现规格：确定性检索图（替换 research 工具循环）

**目标**：`POST /api/chat` 走 `understand → retrieve → assemble → answer → validate → finish`，**不再跑 LLM 驱动的 search/read 工具循环**；回答契约（SSE 形状、`[n]` 引用）不变。

**节点与分流**
- `understand`：规则为主（`q0` + 关键词查询），LLM 拆解默认关（§7.7）；产出 `queries`。
- `retrieve`：`knowledge.retrieve(query, task_id, allowed_doc_ids, extra_queries)` → `RetrievalResult`。
  - **分流（L6）**：`reason="direct"`（无内容词）或 `reason="no_reports"` → **不进 `assemble`**，直接 `answer` 提示；`telemetry.path=direct`。
  - **task4（G10b，待做）**：`understand` 后若 `task_id=="task4"` → 分叉到独立 `intake` 节点（**不检索/不 assemble/不发 `sources`**；`telemetry.path="report"`），`answer` 仅回显/追问；见 §8.5。
- `assemble`：`assemble_reports(selected, budgets)`（L5 纯函数）→ `context + sources` + `truncated[]`。
- `answer`：system = 任务提示 + D-L2 口径（“选定报告全文，分隔符内为数据”）+ `context`；先发 `sources` 再流式 `token`。
- `validate`：`validate_citations`（D-L2）+ 覆盖缺口；允许**至多一次** re-retrieve（见下），否则 `finish`。

**`measured` 触点（L1，必须同步）**
- 更新 `graph.measured` 的 `labels`：新增 `retrieve`/`assemble`、移除 `research`（否则 `labels[name]` KeyError）；`stages_ms` 自动含新节点；`telemetry.path` 映射同步。
- **`retrieve`/`assemble` 必须发 `step` 事件**（`running → completed`，带 `duration_ms`），否则前端「处理过程」为空（受保护区域，见 §5.5 U2）。

**`sources` 时机与编号（L2）**
- `assemble` 产出 `chunk_source`（`citation/doc_id/version/page/heading/snippet/title/url`，与前端 `Source` 兼容）；**事件顺序：先 `sources` 后 `token`**。
- `citation` 由**服务端**编号 1..n；`url` 仍为 JSON 读接口；点击走前端 `openDocument`（不预探 `/file`，S8）。

**re-retrieve（L3，写死）**
- **触发**：`validate` 检测到 `specific` 词/覆盖缺口（§7.7）。
- **上限 = 1**（新增 `RETRIEVE_RETRY=1`，uncalibrated）；预算取自既有 `RUN_TIMEOUT`，不新增循环。
- **合并**：与首次 `selected_reports` 按 `doc_id` 去重合并，重算 `sources` 编号；仍缺则 `coverage_partial`。

**移除/降级（L4）**
- 删除 `research` 节点与 `search_docs`/`read_doc`/`check_corpus_page`/`finish_research` 工具。
- 删除 `evidence.py` 的 `ResearchReport`/`validate_report`/`decide`/`merge_reports`/`preserve_blocked_report`（死代码）；保留 `validate_citations`（L5/D-L2）。
- **删除 `quick.py` 及 `settings.quick_verification`**；task1 的 chunk-only 作为确定性分支保留，置 `telemetry.path=chunk_only`。
- `note_locators` 移除（notes 未挂载）。

**状态/事件**
- `stop_reason ∈ {professional, no_reports, coverage_partial, timed_out, failed, invalid_request}`；`telemetry.path ∈ {retrieve, chunk_only, direct}`，增 `chunks_retrieved/reports_selected/context_tokens`。
- SSE 事件集合不变（`status/policy/step/telemetry/sources/token/usage/done/error`）。
- **前端三处同步**：`policy.ts stopLabels`、`Answer/MessageView` 的 path 映射；移除 `covered/repair/search_limit/read_limit` 旧标签（§7.14 D-L4）。

**验收（可自动观测，L5）**
- 图节点集合 == `{understand,retrieve,assemble,answer,validate,finish}`（`pytest` 断言）；`/api/chat` 事件序列不含 `search`/`read` 工具 step；`telemetry.stages_ms` 不含 `research`；`status` 文本不再有「研究第 N 轮」。
- 宽泛查询「人工智能医疗领域的应用」返回医学报告并带可点 `[n]`；无匹配走 `no_reports`；`direct` 不走 `assemble`。
- `pytest` 全绿；`browser_answer_controls`/`browser_tasks` 等离线用例通过；`npm run build`。
- **实现备注（2026-09-22）**：`validate` 实作在 `answer` **之前**（`retrieve→assemble→validate→answer`）：覆盖率缺口与 ≤1 次 re-retrieve 在流式回答前完成，避免「answer→validate→re-retrieve」产生二次流式回答；`validate_citations`（需答案文本）在 `answer` 内联执行并计入 `telemetry.invalid_citations`。**planner 已确认（2026-09-22）**：接受该顺序；§7.9 图已同步。节点集合含 `direct`（无检索/澄清分支）。

### 7.16 L7 评测规格：快准全与参数校准

- **复用扩展 `src/evaluate.py`**（不新建框架）：10–15 条基金查询 + 期望报告/项目号；指标 `report_recall@k`、`MRR`、P50/P95 检索延迟、平均 context token、**no-match 误报率**、同项目去重正确率。
- **只校准必须项**（§7.7 P4）：`MIN/MAX_REPORTS`（按 task）、`MIN_TERM_COVER`、`PER_DOC_TOP_M`；`REL_COVER`/`GENERIC_DF_RATIO` 固定默认仅观察。
- **记录**「参数版本 + 指标」；消融 BM25-only vs hybrid（dense 就绪后）、单查询 vs 规则多查询。
- 数据集路径替换失效的 `project_progress/evals/retrieval_v4.jsonl`。

**已实现（参数版本 v1，2026-09-22；default = `MIN_TERM_COVER=0.3`、`PER_DOC_TOP_M=3`、`MIN/MAX_REPORTS` 按 task、`REL_COVER=0.5`、`GENERIC_DF_RATIO=0.35`）：**
- 数据集：`tests/data/fund_retrieval.jsonl`（15 条，每条 `query` + `expected_source` 文件名）。
- 指标（基金库，BM25-only）：task1 `recall=1.00 / MRR=1.00 / no_match=0.00 / dedup=1.00 / avg_ctx≈56k tokens / P50≈0.60s / P95≈0.66s`；task2 `avg_ctx≈69k`。
- 参数扫描（task1，15 条）：`MIN_TERM_COVER ∈ {0.2,0.3,0.4,0.5}` 与 `PER_DOC_TOP_M ∈ {1,3,5}` 均 `recall=1.00`；提高 `MIN_TERM_COVER` 0.3→0.5 使 `avg_ctx` 56340→46220（更省预算）；`max_reports(task1)=1` 使 `avg_ctx`→31536。样本 recall 饱和，**保留默认值（无依据调参）**；待真实反馈扩充样本后再校准。
- 延迟 P50≈0.6s 来自每查询重建 BM25（chunk 缓存/预计算属 L3/K10 未做），已记为性能项。

## 8. 任务系统与专项报告入口优化（规划，2026-09-22）

### 8.1 问题与现状（证据）
- 现象（用户）：切换到「专项报告」（task4）后，对话框**不能输入文字**，无法描述报告需求。
- 现状（代码）：
  - `ChatRequest.task_id: Literal["task1","task2","task3"]`（`main.py:81`）——task4 被显式排除。
  - `Composer.tsx:110-112`：`task4 => canSend=false`；`:181` task4 用 `<div role="status">` **替换 textarea**（不是仅禁用）。
  - `prompts/__init__.py:14`：`CHAT_TASK_IDS=("task1","task2","task3")`；task4 仅在 `TASKS`（`:23`）用于会话绑定，正文指向未实现的 `POST /api/reports`。
  - `store.startTask`：切换任务即 `switchSession(undefined, taskId)`（新建会话并绑定）。
- 结论：**把“输出契约”误当成“输入闸门”**。

### 8.2 设计原则（并标注取代关系）
1. **任务 = 输出契约，不是输入闸门**：四个任务都保留自由文本输入。
2. 输入禁用只由**运行时状态**决定（busy/离线/未就绪），不由 task 决定。
3. **约束的对象是「正文生成」，不是「输入」**：task4 正文仍**不在 `POST /api/chat` 生成**（原文约束保留），走报告入口；chat 只做**参数采集（intake）**。
4. 未知任务 id 仍 `422`/`UnknownTaskError`，不静默回退。
- **取代（superseded）**：本条取代以下旧契约中“task4 不可输入 / chat 排除 task4”的部分（**正文不在 chat 生成**的部分保留）：
  - `PROJECT §2`：「task4 不在 chat 生成正文，走报告入口」→ 补“但允许自由文本输入用于采集”。
  - `PROJECT §4.2`：`task_id` 「仅 task1–3；task4/未知 422」→ 改为 task1–4（task4 走 intake，未知 422）。
  - `DECISIONS`「任务系统取代自动意图分类」：同步。
  - `ITERATION §2 G5` / 旧 `U3.1`「选取 task4 后输入区切换为领域/年份/模板**表单**」→ 作废，改为**自由文本 intake**（服务端采集）。

### 8.3 任务契约（产出物为输出参数，见 §9）

| 维度 | task1 精准问答 | task2 对比分析 | task3 趋势推测 | task4 专项报告 |
|---|---|---|---|---|
| 输入 | 自由文本 | 自由文本 | 自由文本 | **自由文本（报告需求）** |
| 检索 | chunk_only；1/3 | 跨项目；2/5 | 多年份；3/8 | **intake 不检索**；生成时按模板+领域/年份 |
| 默认产出 | text | text+table | text | document |
| 通道 | chat | chat | chat | **chat(intake) → `POST /api/reports`(正文)** |
| chat stop_reason | professional / no_reports / coverage_partial | 同 | 同 | **report_pending**（**不含 report_ready**，见 8.5） |
| 持久化 | 会话 turn | 会话 turn | 会话 turn | 采集参数存会话；报告独立存储 |

### 8.4 task4：两文件 + intake 确定性规则
- **提示词拆两文件**：`task4_intake.md`（chat 采集：字段、缺参追问、不产正文）与 `task4_report.md`（生成基线）；`task_instruction("task4")` 按阶段选。
- **intake 确定性规则**（G10b 验收依据）：
  - 字段：必填 领域/起止年份/模板；可选 基金类别/指定文件/分析重点。
  - 缺参：**一条消息列出全部缺失项**并回显已知项（用户可逐项补/改），不静默。
  - 领域：默认取当前库 `domain`，但**回显并要求确认**（可换），不静默默认。
  - 模板关键词映射：成果→`achievements`、热点→`hotspots`、未来/趋势→`future_directions`、综合→`comprehensive`；歧义/无匹配→追问。
  - 年份：解析 `2020-2024`/`2020至2024`/`2020—2024`/单年 `2023`（=2023–2023）；校验 `start ≤ end`。
  - 状态：跨轮累加，支持覆盖（“年份改 2023”）；参数存会话 turn（与 #10 口径一致）。
  - 参数齐 → 回显 + `stop_reason="report_pending"`（“报告入口未就绪，需求已记录”），**不生成正文**。
- **ReportParams（持久化契约，V2）**：`{domain?, year_from?, year_to?, template?, fund_type?, doc_ids?, focus?}` **全部可选**；存**会话级 `report_params`**（`workspace` session `data`），跨轮累加；turn 可携带快照用于回显。前端 `conversation.ts` 的 Turn/Attempt 增**可选**字段，`restoreTurns`/渲染对缺失字段给默认（遵守 `DECISIONS`「持久化数据向后兼容」）。
- **加载器接口（V4）**：`task_instruction(task_id, *, phase="chat")`，`phase ∈ {"chat","report"}`；task4 `phase="chat"`→`task4_intake.md`，`phase="report"`→`task4_report.md`；其余任务忽略 phase（或等价拆 `intake_instruction()`）。在 `src/prompts/__init__.py` 写清。
- **E 就绪后**：同一输入 → `POST /api/reports` → 生成报告（预览/复制/下载），会话内以卡片引用报告 id。

### 8.5 图分支（与 §7.15 对齐）
- L6 图 `understand → retrieve…` 已实现且**无 task4 分支**。task4 在 `understand` 后**分叉到独立 `intake` 节点**：
  - 不检索、不 `assemble`、**不发 `sources`**；`telemetry.path="report"`；`answer` 只输出参数回显/追问。
- **`report_ready` 不属于 chat**：它是 `POST /api/reports` 的结果，归报告入口/会话卡片，不进 `policy.stop_reason`。

### 8.6 后端优化点
- `ChatRequest.task_id` 放开 task4（`Literal["task1","task2","task3","task4"]`），graph 在 `understand` 后分叉 `intake`。
- chat `stop_reason` **只加 `report_pending`**；`telemetry.path` 加 `report`；前端 `policy.ts` 同步。
- `store.tsx:325` 注释「task4 never goes through chat」随 G10b 更正为“task4 不生成正文，但走 intake”。
- 同步更新 `PROJECT §2`/`§4.2` 与 `DECISIONS` 的 `stop_reason` 集合与 task4 句。
- 依赖：#10（报告↔会话绑定）定稿、E1/E2、B4/B5。

### 8.7 分阶段任务（G10；**G10a+G10b 同批**）
| 编号 | 任务 | 验收 |
|---|---|---|
| **G10a+G10b（同批）** | 前端放开 task4 输入/发送 **且** 后端同批放开 `Literal` 并加 `intake` 分支 | 切到 task4 能输入、能发送、得到参数回显/追问；**无 422 窗口** |
| G10c | 任务切换语义（默认新建会话 + 提示） | 切换有提示、历史不静默丢失；输入可用 |
| G10d | E 接线：前端报告卡片（生成/预览/下载/会话引用 id）；调 `POST /api/reports` 带 `session_key`+`run_id` | 生成 Markdown 报告；会话可列/打开其报告；幂等 |

**本轮状态（2026-09-22）**：G10a+G10b ✅、G10c ✅、G10d ✅（后端 #10 M1–M7 + 四模板 + md 导出；前端报告卡片 + 会话报告列表 + turn `reportId` 持久化）。§9 拓展（task5–8、docx/pdf、图表）仍为**非首期**，依赖 H9/B4/B5，未实施。
- 依赖：G10d 依赖 #10 + E；**G10a+G10b 必须同批**（否则 task4 发送触发 `extra="forbid"`+Literal → 422，回到死路）。

### 8.8 非目标
- 不做自动意图分类（任务仍显式选择）；不新增模板管理平台；不为 task4 建第二套检索。

## 9. 任务类型与产出物扩展（规划，2026-09-22；**扩展，非首期验收**）

### 9.1 两轴模型（产出物是输出参数，不是任务固定属性）
- **意图任务（Task）**：意图 + 检索/预算 + 提示词 + **默认产出物**。
- **产出物（Artifact）**：输出参数 `text`/`table`/`chart`/`document`（document 再选 md/docx/pdf）。
  - chat 默认 `text`；报告入口默认 `document`；导出参数决定 md/docx/pdf；`chart` 可选。
- 修正：任务**只声明默认 + 允许集**，不把产出物写死；同一分析可切换产出物（否则“切换产出物”无处落地）。

### 9.2 任务扩展（**扩展，非首期**；需需求确认）
- **首期（demand §4.1）**：task1–4。
- **扩展（需确认）**：task5 项目画像 / task6 成果汇编 / task7 领域综述 / task8 可视化简报。
- task5–8 **依赖 H9（项目号/负责人）、B4/B5（领域/年份）**；未就绪前**不承诺、不进首期验收**。

| id | 意图 | 检索 | 默认产出 | 允许产出 | 状态 |
|---|---|---|---|---|---|
| task1 | 精准问答 | chunk_only；1/3 | text | text | 首期 |
| task2 | 对比分析 | 跨项目；2/5 | text | text,table | 首期 |
| task3 | 趋势推测 | 多年份；3/8 | text | text | 首期 |
| task4 | 专项报告 | 模板+领域/年份 | document | md（首期）；docx/pdf（R2+） | 首期 |
| task5 | 项目画像 | 单项目聚合 | text | text,table | 扩展 |
| task6 | 成果汇编 | 分组+去重 | table | table,document | 扩展 |
| task7 | 领域综述 | 报告集全文 | document | document | 扩展 |
| task8 | 可视化简报 | 结构化抽取 | table | table,chart,document | 扩展 |

### 9.3 模板权威与加载器（避免两套模板源）
- 现状：仓库**无 `src/templates/`**；模板占位符在 `src/prompts/task4_report.md`；由 `task_instruction`/`GET /api/tasks` 的 `has_template` 驱动。
- **决定：单一权威 = `src/templates/<template_id>.md`（章节结构）**；把章节从 `task4_report.md` **移出**，该文件只保留“生成指令”；新增 `prompts.report_template(template_id)` 加载。
- **契约兼容（V1）**：**保留 `has_template` 不改语义**（=`templates` 非空），**新增 `templates` 列表**（附加，不破坏）。前端 `api.ts TaskInfo` 增可选 `templates?`；`ListingViews` 「含模板」Pill 逻辑不变。**`PROJECT §4.1`、`api.ts`、`ListingViews` 三处在 R1 同批更新**。
- 模板↔任务映射：task4→4 报告模板；task6→`outcomes_compilation`；task7→`domain_review`；task8→`visual_brief`；task5→`project_profile`（扩展期）。
- 无模板管理平台。

### 9.4 可视化（首期不做；R3 再上）
- **前端不渲染内联 SVG/HTML**（`MessageView.tsx:361`/`DocumentPreview.tsx:122` 仅 `remark-gfm`，无 `rehype-raw`）→ 图表必须走**图片端点** `GET /api/reports/{id}/asset/{name}` + `<img>`；**不加 `rehype-raw`**（语料是外部文本，XSS）。
- 首期**只做「表格 + 文字结论」**（无 matplotlib、无中文字体）；`matplotlib` 放 R3 作为 `reporting` extra，并同时解决中文字体与图片端点。
- 数字必须**确定性抽取/校验**（须出现在上下文或结构化字段），不得由 LLM 编造；否则降级表格+文字。

### 9.5 导出管道（首期仅 `.md`）
- 现状：**无 md→HTML 库**；`playwright` 未在 `pyproject` 声明且未装浏览器；`htmldocx`/`matplotlib`/`pandoc` 未装；`python-docx` 可用。
- **决定**：首期只导出 **`.md`**（+ 预览）——符合 demand（PDF/Word 非首期必需）。
- **R2 docx**：**手写基于 python-docx 的最小渲染器**（标题/段落/列表/表格/图片），不引 `htmldocx`/`pandoc`。
- **R3 pdf**：Playwright `page.pdf()` 作为 **`reporting` extra**（运行时依赖 + Chromium + `launch.sh` 安装）；若成本高则继续不做 PDF。
- 接口（E）：`POST /api/reports` 产 `report_id`；`GET /api/reports/{id}`；`GET /api/reports/{id}/export?format=md`。

### 9.6 后端契约变更
- 任务注册表增 `artifacts`（默认 + 允许集）与 `templates`（**新增字段，保留 `has_template` 兼容**）；`GET /api/tasks` 返回。
- `POST /api/reports` 请求含 `ReportParams`（见 §8.4），全部可选。
- chat 只跑 `text`/`table` 意图；`document` 意图走报告入口（与 §8/G10 一致）。
- `POST /api/reports` 请求：`{task_id|template_id, domain, year_from, year_to, fund_type, focus, output_formats[]}`。
- chat `stop_reason` 只加 `report_pending`；`telemetry.path` 加 `report`。

### 9.7 分阶段与依赖
| 阶段 | 内容 | 依赖 |
|---|---|---|
| R1（=E MVP） | task4 + 四模板 + **md 预览/下载** | **#10 定稿** |
| R2 | docx（手写 python-docx） | R1 |
| R3 | 可视化 + task8（需 `reporting` extra + 中文字体 + 图片端点 + 数字确定性抽取） | R2、B4/B5 |
| R4 | task5/6/7 任务与模板 | **H9**、B4/B5、G10 |
- **H9 判定口径（V5）**：`metadata_from_filename` 已从文件名派生 `project_no`/`year_from`/`year_to`（L3b 已注入 `ReportDoc`），但**未派生 `pi`（负责人）与基金类别，也未服务端持久化**。故 H9 视为**部分满足**：R4 的 task5 项目画像（需负责人）**仍依赖 H9 补齐 `pi`/持久化**；task6/7 若仅用项目号/年份则不被 H9 阻塞。
- **不承诺**：H9（`pi`/持久化）与 B4/B5 未就绪前，依赖它们的 task5–8 不做、不进首期验收。

### 9.8 非目标
- 无模板管理平台；无知识图谱；图表仅来自语料；不联网补数据；不引入 ECharts/Vega/pandoc/htmldocx。

### 9.9 验收（首期）
- 每个任务声明 `artifacts`（默认+允许）；未知 task id `422`。
- `.md` 导出与预览内容一致、中文正常、标题/表格保留。
- 扩展项（task5–8、docx/pdf、图表）**不在首期验收**。

## 10. 目录统一：本地持久化收敛到 `.knowledge/`（规划，2026-09-22）

### 10.1 现状与目标
- 现状（事实）：
  - `.knowledge/`（`CORPORA_ROOT`）：每个直接子目录 = 自包含语料（`source/`+`datadb/`+`vectordb/`）。
  - `.demo_langchain/`：演示语料，经 `DATA_DIR`/`VECTORDB_DIR` 指定，**位于语料根之外**（特例）。
  - `data/`（`STATE_DIR`，兼 legacy `DATA_DIR`）：`workspace.sqlite3`、`corpora.json`、`reports.sqlite3`、`official-preparation.json`、测试产物 `*.png`。
  - 路径设置 6 个：`CORPORA_ROOT`/`DATA_DIR`/`VECTORDB_DIR`/`STATE_DIR`/`KNOWLEDGE_ROOT`/`TEXT_ROOT`。
- 目标：**所有本地持久化只在 `.knowledge/` 下**；删除 `data/`；去掉“活动语料可在根外”的特例；能合并的设置合并。

### 10.2 目标布局
```text
.knowledge/
├── README.md
├── .state/                    # 应用级状态；扫描器已跳过 dot 目录
│   ├── workspace.sqlite3      # 会话/笔记
│   ├── reports.sqlite3        # 报告
│   ├── corpora.json           # 显示名覆盖 + 默认库
│   └── official-preparation.json
├── demo_langchain/            # 演示库（原 .demo_langchain/）
│   └── source/ datadb/ vectordb/
└── 自然科学基金/
    └── source/ datadb/ vectordb/
```

### 10.3 设置精简（before → after）
| 现状 | 目标 |
|---|---|
| `CORPORA_ROOT=.knowledge` | `CORPORA_ROOT=.knowledge`（保留） |
| `DATA_DIR`（活动库 sqlite；可在根外） | **删除**；默认库 = `DEFAULT_CORPUS` 相对名解析 |
| `VECTORDB_DIR`（活动库向量；可在根外） | **删除**；用 `CorpusInfo.vectordb_dir` |
| `STATE_DIR=<repo>/data` | `STATE_DIR=.knowledge/.state`（默认随 `CORPORA_ROOT` 派生） |
| `KNOWLEDGE_ROOT`/`TEXT_ROOT` | **删除**，合并进 `CORPORA_ROOT` |
| — | 新增 `DEFAULT_CORPUS`（相对名，默认 `demo_langchain`；缺失回退首个 ready 库） |

### 10.4 代码合并点
- `config.py`：删 4 字段；`state_dir` 从 `corpora_root` 派生；加 `default_corpus`。
- `corpora.py`：`corpus_root_for` 直用 `corpora_root`；删 `_default_rel`/`default_corpus_id` 特例、删 `scan_corpora` 的 “default outside root” 分支；`.state` 由现有 dot-skip 覆盖。
- `main.py`：`/file` 允许根从 4 个简化为 `{corpora_root}`；默认 `app.state.knowledge` 按 `DEFAULT_CORPUS` 解析到 `<corpus>/datadb/knowledge.sqlite3` + `<corpus>/vectordb`。
- `parsers.py`：删 `source_base` 与 legacy 双根 `collect_sources`，统一 `collect_sources(root)`；`ingest/local`/`ingest/text` 目标 = 默认语料 `source/`。
- `knowledge.py`：`dense` 目录直接用 `CorpusInfo.vectordb_dir`（去掉 `vectordb_dir or path.parent/chroma` 兼容分支）。
- `prepare_docs.py`/`cli.py`/`evaluate.py`：`data_dir` 引用改为默认语料 db 路径或显式 `--db`。
- `.env`/`.env.example`/README：删 4 变量、更新布局。

### 10.5 一次性迁移（幂等；含 M1–M3）
- **M2 来源优先级**（逐文件）：`.knowledge/.state/<file>` 已存在 → 跳过；否则 `data/<file>`；workspace 专用回退 `<活动库>/datadb/workspace.sqlite3`（K0 旧路径）。每次仅搬**首个存在**的来源。
- **M3 安全次序**：`复制/移动 → 校验目标齐全（workspace/reports/corpora/official-preparation）→ 再删旧目录`；任一步失败保留旧目录并记日志（不静默丢数据）。测试 `*.png` 单独清理，不参与校验。
- **移动内容**：`.demo_langchain/` → `.knowledge/demo_langchain/`（目标不存在时）；`data/*` → `.knowledge/.state/`。
- **M1 demo origin 重写（高风险，必须做）**：移动后 DB 中**文件型 origin**（如 `…/.demo_langchain/source/README.md`）仍指旧路径 → `local_path_in_roots` 解析失败 → `/file` 404、rel_path 空。
  - 规则：对 `docs.payload.origin` 以旧根绝对路径开头的行，**前缀替换旧根→新根**，**保留 `docs.id` 不变**（`files.doc_id`/`chunks.doc_id`/workspace `sources.doc_id` 引用稳定）。
  - 实测：demo 158 docs 中 **157 为 URL origin（不受移动影响）**、**1 为文件型** `README.md`（`id=sha256(origin)`）。
  - 代价：被移动的文件型文档 `id ≠ sha256(new_origin)`；**不要对移动后的语料 `force` 重导入**（会按新 origin 生成新 id、旧行成孤儿）；正常 ingest 由 `files` 的 size/mtime 跳过，不受影响。
  - 备选（不推荐）：重算 id 需级联 `files`/`chunks`（`chunk_id` 含 doc_id，需重建 5922 chunks）并可能失效 workspace 引用。
- 启动时执行并记日志；旧路径不存在即跳过。

### 10.6 分阶段任务
| 编号 | 内容 | 验收 |
|---|---|---|
| DIR-1 | `state_dir=.knowledge/.state` + 迁移（M2 优先级/M3 先校验后删）+ 扫描跳过 | 状态写入 `.state/`；旧 `data/` 状态迁移后会话保留 |
| DIR-2 | demo 归位 `.knowledge/demo_langchain/` + **M1 origin 重写**；删 `DATA_DIR`/`VECTORDB_DIR` 与 outside-root 分支；`DEFAULT_CORPUS` | 两库均被扫描；**demo `README.md` 的 `/file`/rel_path/预览正常**；默认库解析正确；无根外特例 |
| DIR-3 | 合并 `KNOWLEDGE_ROOT`/`TEXT_ROOT` → `CORPORA_ROOT`；简化 parsers/允许根；**M5 端点/脚本适配** | `grep` 无 4 变量引用；`ingest/local` 语义=导入默认库 `source/`；`evaluate.py --db`/`prepare_docs`/`cli` 默认=默认库 db |
| DIR-4 | 清理 `data/`、`.env`、`.gitignore`、README/PROJECT；验收 | 全新启动**只创建** `.knowledge/`；`pytest`+浏览器 smoke 通过（见 10.8） |

**本轮状态（2026-09-22）**：DIR-1..4 ✅。实机一次性迁移已执行（备份 `/tmp/dox_pre_dir_backup_*.tgz`）：`.demo_langchain/` → `.knowledge/demo_langchain/`（158 docs，1 条文件型 origin 重写）、`data/*` → `.knowledge/.state/`、`data/` 已移除；默认库 `demo_langchain`，`.knowledge/` 现含 `.state/` + 多个库（含 `自然科学基金` 35 docs）。
- **M5 端点语义变更**：统一后 `POST /api/ingest/local`/`ingest/text` = “导入**默认库** `source/`”（原 legacy 双根 + exclude=others 删除）；需在文档与验收中明写。
- **M6 `.gitignore` 同步**：移除 `.demo_langchain/`；确认 `.knowledge/*` 覆盖 `.state/`（含 sqlite）；`data/` 护栏**保留**（浏览器截图改投 `temp/`，避免误提交）。
- **M7 `.env` 废弃变量**：`DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT`/`TEXT_ROOT` 已废弃；`Settings` 仍 `extra="ignore"`，应**在 `.env.example` 与迁移说明注明废弃**（可选：启动时若检测到旧变量记 warning）。

### 10.7 非目标
- 不改语料内部结构（`source/datadb/vectordb`）；不合并多库；不改 `corpus_id` 语义；不动 `.logsdev/archive/`。

### 10.8 验收
- 全新启动后 repo 内**不出现** `data/`；`.knowledge/.state/` 承载会话/报告/覆盖。
- `scan_corpora` 返回 `demo_langchain` + `自然科学基金`；**默认库解析正确**（M4：`DEFAULT_CORPUS` 须存在且为库名；缺失按 `rel_path` 取首个 `preparation=ready`；全无 ready → health/prepare 明确状态，**不抛未捕获异常**）。
- **M1 回归**：迁移后 demo 文件型文档（`README.md`）的 `/file`/rel_path/预览正常。
- 会话历史迁移后可见；按库问答/文件预览/报告生成正常。
- `grep -rn "DATA_DIR\|VECTORDB_DIR\|KNOWLEDGE_ROOT\|TEXT_ROOT" src/` 为空；运行期 `local_path_in_roots` **只允许 `corpora_root`（单根）**。
- **M6**：`.gitignore` 无 `.demo_langchain/`、`.knowledge/*` 覆盖 `.state/`、`data/` 护栏保留。

## 11. 知识库交互与多库会话（规划，2026-09-23）

### 11.1 需求与现状（核实）
| 需求 | 状态 | 证据 |
|---|---|---|
| 默认知识库（不设默认/用第一个/会话提醒） | 🟡 部分 | 后端 `default_corpus` + `resolve_default`（`corpora.py:167`）；前端 `currentCorpus = find(id) ?? find(is_default)`（`store.tsx:232`）——**静默默认**，无会话确认 |
| 会话上方切换/增加知识库 | 🟡 部分 | 仅 Composer 内单选「切换知识库」（`CorpusPicker`）；无「新建知识库」入口；顶栏只显示库名、不可切换 |
| 基于多知识库（≤6）会话/任务 | ❌ 未实现 | `ChatRequest.corpus_id` 单值（`main.py:82`）；`chat_knowledge` 单实例、注释「never cross corpora」（`main.py:645`）；`SessionData.corpus_id?` 单值（`workspace.ts:8`） |
| 拖拽本地文件上传到 `.knowledge` 子库 | 🟡 部分 | 后端已具备（`POST /api/corpora/{id}/files` 落 `<corpus>/source/` + 增量导入）；前端 `CorpusFiles.tsx` 仅**单选** `<input type="file">`，无拖拽/多选 |

### 11.2 范围裁决
- **KB-1/2/3 为首期内改进**：不改后端契约、不越界。
- **KB-5 重命名同步目录**：**KB-5a/5b 已实现**（`8d6ff0a`）；**KB-5c 取消**；**KB-5d 待做**；缺陷（alias 迁移）待修（见 §11.6）。
- **KB-4 多库 ≤6 为范围级新增**：**已确认纳入首期**（用户需求），**取代** `PROJECT §1「首期不做跨库联合检索」`；契约（`corpus_ids` 1–6 二选一）已同步 `PROJECT §1/§4.2`。
  - 动机：`.knowledge/` 已有多库（基金按领域拆分），跨领域问题需要多库联合。

### 11.3 KB-1 默认库确认（小，前端；D）

> 已被 §15.2 取代：新对话自动选首库，不再要求首次确认。以下为历史规划。
- **按会话**确认（存 `SessionData`，缺失默认，遵守持久化向后兼容）；**不全局一次**。
- **首次发送前**若未显式选库 → Composer 顶部一次性提醒，**显示候选库名**，确认后写 `corpusId`；不改后端。
- `resolve_default` 的“首个 ready”**只作候选人选，不得静默用于问答**。
- 无可用库 → 明确空态（禁用发送 + 提示）。

### 11.4 KB-2 切换/新增入口（小，前端）
- Composer 库 popover 加「**+ 新建知识库**」（复用 `createCorpus` + `selectCorpus`）。
- 顶栏：可选加切换按钮；默认保持“输入区切换”，避免两处入口。

### 11.5 KB-3 拖拽多文件上传（中，前端；E）
- **复用现有 K7 端点** `POST /api/corpora/{id}/files`（multipart、200MB、名称规范化、路径穿越防护），**不另写一套**。
- `CorpusFiles` 的 `<input>` 换/加 **dropzone**（`onDragOver/onDrop`），**多文件顺序**调 `uploadCorpusFile`；目标 = **当前基础库** `source/`；视觉反馈 + 逐条失败提示。
- **后端不改**（已流式落 `<corpus>/source/` + 增量导入）。
- 可选组合：`CorpusGrid`「新建库」后直接引导拖入。

### 11.6 KB-5 重命名与目录名同步（取代 K6「仅改显示名」）

> 名称显示规则已由 §15.3 修订：目录名是唯一显示名称，历史 alias 不再优先展示；稳定 id、重命名同步及引用保护继续有效。

**目标**：库名与 `.knowledge/<dir>` **同步**；重命名 = 目录改名 + 名称更新，且不破坏会话/引用。

**核心设计（T1/T4/T8：id 与路径解耦）**
- **稳定 `corpus_id`**：`.state/corpora.json` 按 **id** 持久化 `{id, alias?, created, rel}`（不再以 rel 为键）；现有库回填 `id=corpus_id_for(rel)`。`corpus_id` 不随目录名变化。
- **doc_id 与路径解耦（T1/T8，二选一）**：**选“保留 `doc_id=sha256(origin)` 定义、只修 reimport 逻辑”**——
  - `Knowledge.put(doc, *, doc_id=None)` 支持显式 id；`import_defaults` 对已在清单的文件传 `files.doc_id`，**原地更新**（不再按新 origin 插入新行）。
  - 重命名时**重写 origin 前缀并保留 doc_id**；之后重导入（含 force）复用清单 id，**不产生重复行/孤儿 chunks**。
  - 新增文件仍用 `sha256(origin)`；**不做存量 doc_id 批量迁移**（`allowed_doc_ids`/历史 `sources.doc_id` 不变）。
- **名称模型（T4）**：规范名 = 目录名；**可选 `alias` 按 id 持久化**（保留 K6 的友好命名）；UI 优先显示 alias；改名**不丢 alias**（keyed by id）。

**重命名步骤（`PATCH /api/corpora/{id}`，body `{name}`；T2/T5）**
1. 校验：`valid_corpus_name` + 文件系统安全（**T5**：Windows 保留名 `CON/PRN/AUX/NUL/COM1-9/LPT1-9`、尾随点/空格、目标符号链接）+ 目标不存在（409）。
2. **在 `import_lock` 内串行执行**（**T2**）；导入运行中 → 409。
3. 仅大小写改名（大小写不敏感 FS）用**两步临时名**（T5）。
4. `os.rename(<old>, <new>)`（同根，无跨设备）。
5. **重写文件型 origin** 前缀 `<old_abs>`→`<new_abs>`，**保留 `doc_id`**；DB 写在**事务**内。
6. 更新 `.state/corpora.json`（按 id）：更新 `rel`/`name`，**保留同一 `id` 与 alias**。
7. **失败回滚**（T2）：DB 失败 → 目录改回；目录已改而 DB 未改 → 回滚目录。
- `files.rel_path`（相对 `<corpus>/source`）与 `chunks` 不受影响；`parsed/` 随目录移动。

**T3 孤儿/缺失库**：`/api/corpora` 对稳定 id 找不到目录的标 `missing`；默认解析跳过 missing；会话 `corpus_id` 指向 missing → **409 `{missing:true}` + 可操作提示**（重新关联/解绑）；**未知 id → 404**。前端给横幅 + 「重新关联（选库）/解绑（用默认）」动作。

**DEFAULT_CORPUS（T7）**：按 **id** 解析，**保留 rel 回退**（旧 `.env` 写 rel 仍可解析）；新持久化写 id。

**KB-5c 对齐迁移（T6，显式/可回滚）**：(a) 目录改名为现有显示名 或 (b) 名称回退目录名；**先预览**（将改路径 + 受影响文档数），备份 `corpora.json` 与目录，失败可回滚，用户确认。

**supersede**：取代 K6「重命名仅改显示名」与 deferred K6b；`corpus_id` 由「路径派生」改为「持久化 id（回退 slug+sha1）」。

**影响**：`corpora.py`（id/alias 持久化、`resolve_default`）、`main.py`（PATCH 改名目录 + 锁/回滚 + missing）、`knowledge.py`（`put(doc_id=)`、origin 重写 helper）、`parsers.py`（`import_defaults` 传稳定 id）、前端（alias 显示、missing 提示）。

**验收**：重命名后目录名/名称同步；`corpus_id` 不变；旧会话仍指向该库；`/file` 正常；**重命名后再导入不产生重复行**（T1）；导入中改名 409（T2）；缺失库提示而非 404（T3）；大小写改名/非法名/保留名边界（T5）。

**实现状态与缺陷（2026-09-23）**：
- **KB-5a/5b 已实现**（`8d6ff0a`，108 passed）：id-keyed `.state/corpora.json`、rename 同步目录 + origin 重写 + 锁/回滚、`put(doc_id=)`。
- **KB-5c 取消**（alias-by-id 已满足 T4，不做批量对齐迁移）；**KB-5d 待做**。
- **缺陷待修（阻塞“KB-5a 完成”声明）**：旧 `{rel:{name}}` 未迁移为 `{id:{alias:name}}` → `AI与医疗`/`NF-AI与*` 4 个友好名丢失（现均显示目录名）。修：迁移 `name→alias` + 扫描回退 `alias or name`。
- **命名同步规则**：`PATCH /api/corpora/{id}` 改名时同时**清空 `alias`**，使显示名=新目录名（满足“名称与目录名同步”）；未改名时 alias 作为友好名展示。

### 11.7 KB-4 多知识库会话（≤6，全栈，范围变更）

> 会话交互由 §15.2 取代基础库强制包含/切基础库重置集合的规则；保留 ≤6、多库检索、来源带库及报告单库边界。

**C 两个概念分开（基础库 vs 检索集合）**
- **基础库（base corpus，单选）**：文献库浏览 / 侧栏当前库 / 新建库归属；持久化 `SessionData.corpus_id`。
- **检索集合（retrieval set，≤6）**：本会话实际检索的库；`SessionData.corpus_ids`；**默认 = {基础库}**，基础库**必含**于集合（`base ∈ set`）。
- **切换基础库 → 重置检索集合 = {新基础库}**（并提示），避免“看着 A、检索 A+B”歧义。
- UI：Composer 顶栏显示基础库 chip + “检索库 N（≤6）”；文献库浏览用基础库。

**契约**
- `ChatRequest.corpus_ids: string[] | None`（1–6），与 `corpus_id` **二选一**（同送 422）；缺省 = 默认库。
- `SessionData.corpus_ids?`（可选，缺失回退 `corpus_id`）。
- **R4 裁决：基础库属于前端会话状态，`base ∈ set` 由前端保证**（加载、修改、发送/编辑重问/重生成均校验）。服务端无法从二选一请求中获知基础库，不声称已校验此不变量；直接 API 的检索集合以 corpus_ids 为准，不新增 base 字段，也不把数组首项定义为基础库。

**KB-4a 跨库检索规格（BM25-only + 排名融合；B）**
- **接口**：`retrieve_multi(knowledges: list[Knowledge], query, *, task_id, allowed_doc_ids, extra_queries) -> RetrievalResult`；对每库调 `select_reports`，再在 `assemble` 前合并。图侧引入 `KnowledgeGroup`（单库时=1 个），`retrieve` 节点调 `retrieve_multi`。
- **不比较跨库原始 BM25 分**（各库 DF/长度不同）：按**报告排名 RRF**——`fused(d)=Σ_corpus w_c·1/(RRF_K+rank_corpus(d))`，报告身份键 `(corpus_id, doc_id)`；`w_c` 等权。
- **去重**：跨库同 `project_no`/同 `origin` 保留融合分最高；跨年合并标注（沿用 §7.7）。
- **全局预算**：`MIN/MAX_REPORTS`、`CONTEXT_TOKENS`/`REPORT_TOKENS` 为**跨库全局**（非每库），合并后统一截断；`REPORT_RECALL_M` 每库召回、全局选择。
- **`allowed_doc_ids`（R3）**：非空列表是整个检索集合的全局白名单；每个成员实际搜索 `本库文档 ∩ 白名单`，交集为空即该库不贡献资料，不能回退本库全部；null/省略才表示所选库全部，空数组按现有契约 422。总上限沿用 20。归属校验以选中库实际文档清单为准，越库/不存在拒绝 422；不要只依赖 hash 假定绝对唯一，若一项映射到多个库则明确拒绝歧义，不任意归属。
- **ScopeSelector 聚合（R3）**：按检索集合逐库读取文档、按库分组并标库名，沿用现有选择器；只选 B 的一份文档时，A 不贡献资料。任一库加载失败必须提示并支持重试，不显示“完整列表”；范围变化时丢弃旧响应并清除越界选择。
- **sources**：每条带 `corpus_id`（+ page/heading），`[n]` 全局编号（前端 `/file?corpus=` 已支持）。
- **no-match/direct**：任一库 matched 即 matched；全无 → `no_reports`；`specific` 空 → `direct`（沿用 D-L10）。
- **dense 延后**：各库 Chroma 分不可比 → KB-4 首版 **BM25-only**，不做跨库 dense。
- **报告入口（R2，定稿）**：`POST /api/reports` 仍仅支持单 corpus_id；传 corpus_ids 被 extra=forbid 拒绝（422），这不等于服务端能识别会话曾选多库。A+B 会话在生成卡片必须显式确认“本报告仅使用 A/B 中的一个库”，确认前不发送；不能默认取基础库或第一库。确认单库后只带该库 corpus_id 和属于该库的 doc_ids，清除其他库限定并提示；报告独立保存范围快照，不改会话 A+B 集合。多库报告仍未实现。
- **intake 领域（R5，待实施）**：多库不以 selected[0].domain 静默填领域，也不拼接领域冒充用户意图；优先用户已给领域，否则追问。单库可显示来源明确的领域建议，生成前由用户确认；改变库排列顺序不得改变已确认领域。

**影响文件**：`main.py`/`graph.py`/`retrieval.py`/`store.tsx`/`workspace.ts`/`Composer`/`ScopeSelector`。

**分阶段**：**KB-4a** 契约 + `retrieve_multi` + 全局预算/去重 → **KB-4b** 前端多选（基础库 vs 集合）+ 持久化 → **KB-4c** 验收。

### 11.8 分阶段任务
| 编号 | 内容 | 验收 | 状态 |
|---|---|---|---|
| **A** | 修 `name→alias` 迁移（旧 `{rel:{name}}` → `{id:{alias}}` + 扫描回退 `alias or name`） | 4 个友好库名恢复 | ⚠️ 优先 |
| KB-1 | 首次发送前确认默认库（按会话，显示候选库名） | 未选库首次发送出现确认；无库明确空态 | ⬜ |
| KB-2 | Composer 内新建并切库 | 可从 Composer 新建并切库 | ⬜ |
| KB-3 | 拖拽多文件上传（复用 K7 端点） | 拖入多文件入 `<corpus>/source/` 并增量导入；非法类型/超限逐条报错 | ⬜ |
| KB-5a | 稳定 id 持久化 + 回填迁移 + alias-by-id 模型 | 现有会话 `corpus_id` 不变 | ✅（A 待补） |
| KB-5b | 重命名 = 目录改名 + origin 重写 + id 保留 + 锁/回滚 + `put(doc_id=)` | 目录名=名称、id 不变、旧会话可用、`/file` 正常、再导入不重复 | ✅ |
| ~~KB-5c~~ | ~~名称/目录名对齐迁移~~ → 取消（alias-by-id 已满足） | — | 取消 |
| KB-5d | T3 缺失库标记与提示（409 `{missing}` / 未知 404） | 外部删/改名后提示而非静默 | ✅ 本轮（后端；前端横幅待接） |
| KB-4a | 多库契约 + `retrieve_multi`（RRF）+ 全局预算/去重 + `allowed_doc_ids` 归属 | `corpus_ids` 1–6；同送 422；跨库引用带 `corpus_id` | ✅ 本轮（后端 + 引用打开） |
| KB-4b | 前端多选（基础库 vs 检索集合）+ 持久化 | `corpus_ids` 存/恢复；>6 拒绝；切基础库重置集合 | ⬜ |
| KB-4c | 多库验收 | 选 2 库问答，引用来自两库且 `[n]` 可跳转 | ⬜ |
- 建议排期：**修 A（`name→alias`，小且阻塞）→ KB-1/2/3（纯前端）→ KB-5d → KB-4a/b/c**。KB-5a/5b ✅；KB-5c 取消；KB-4 契约已定（`corpus_ids` 1–6 二选一）。

### 11.9 非目标
- 不做跨库权限/多租户；不合并库；不做自动选库（仍显式选择）。

### 11.10 验收
- **A**：4 个友好库名恢复（`自然科学基金项目-AI与医疗` 等），且扫描回退 `alias or name`。
- KB-4：`corpus_ids` 跨库检索且库隔离不泄；**排名融合（不比较跨库原始分）**；**全局 `MAX_REPORTS`/`CONTEXT_TOKENS`**；跨库同项目去重；`sources` 带 `corpus_id`；`allowed_doc_ids` 越库拒绝；多库报告 422。
- KB-4b：基础库与检索集合分离；切基础库重置集合；≤6 前端拒绝。

## 12. 维护约定

- 完成任务后更新本文 §2/§3 与 [`PROJECT.md`](PROJECT.md) 的现状/限制；长期取舍写入 [`DECISIONS.md`](DECISIONS.md)。
- 证据须可复现（命令/产出路径）；未运行的检查不得写入；受限项显式标注。


## 13. 产品闭环实施规划（2026-09-23，当前执行入口）

### 13.1 目标、基线与证据边界

本节最初作为实施规格撰写；截至 §13.8，实施者已提交代码及定向测试证据。本轮规划更新只纳入实施者明确报告的证据，不等同于本规划作者自行检查代码、浏览器或模型。后续状态以实际提交、测试结果与可观察行为为准。

核对基线：`8c40a0ac93c92eabe62885861564dd8ec5c5e271`，核对前工作区干净。以下“代码存在”来自静态阅读，不等于运行验收。旧文档中的测试数字仅属于原记录，不能计为本轮证据。

| 主题 | 核对结论与定位 | 对排期的影响 |
|---|---|---|
| 友好名称迁移 A | `6810450`；`src/agent/corpora.py::load_corpus_overrides` 已将 `name` 转为 `alias`，扫描也有回退 | §11 的“缺陷待修”已过期；代码已有修复，真实四个库名称恢复未在本轮回读，不再重复实现 |
| 多库后端 | `82da218`；`src/main.py::chat` 接受 `corpus_ids`，检索已有 `KnowledgeGroup` | KB-4a 代码存在；只补暴露出的契约缺口与前端，不能重写一套检索 |
| 多库前端 | `frontend/src/api.ts::Options`、`workspace.ts::SessionData` 仍仅单 `corpus_id`，`store.tsx::send` 发送单库 | KB-4b/c 尚未闭环 |
| 缺失库 | `8c40a0a` 后端返回 missing/409；`CorpusPicker` 无对应状态，`store.tsx` 仍可回退默认库 | KB-5d 仅后端完成；前端应阻止静默换库 |
| 上传 | `CorpusFiles` 只读首个选择文件；`main.py::upload_corpus_file` 用 `target.open("wb")`，保存发生在导入调用之前 | 同名覆盖路径真实存在；先保护源文件，再开放多选/拖拽。§11.5“后端不改”被本节取代 |
| 报告范围 | `reports.py::generate_markdown` 检索仅传领域/重点与 doc_ids；年份/基金类别只拼入模型输入 | E5/B4 的严格筛选未实现；不能把提示词当过滤器 |
| 功能开关 | `uiFlags.ts` 只有 tasks 默认 on、docPanel 默认 off | §1/§2“各开关均 off”是旧状态；启用默认界面仍需浏览器验收 |
| 缓存/目录 | `knowledge.py::chunk_rows` 已缓存 chunks，但 retrieve 仍装配报告；`main.py` 已在 state_dir 创建 workspace/reports | K10 旧“逐页窗口”方案已被 L 替代；DIR 不应直接整套重做，按剩余验收项核对 |
| 文档阅读 | `DocumentPreview` 已提供原 PDF 与 Markdown/文本阅读 | K9 不能整体写成尚未实现；Word 保真预览和浏览器验收才是剩余项 |

### 13.2 执行顺序与工作包

| 顺序 | 工作包 / 既有编号 | 交付物 | 开工与停止条件 |
|---|---|---|---|
| P0-A | 上传源文件保护 | 同名/超限/发布原子性后端场景与解析失败重试已实现并有定向测试；浏览器验收待做 |
| P0-B | 真实迁移与会话确认 | AC-08 真实语料迁移已完成；会话确认/恢复已实施并通过后端/状态测试，浏览器验收待做 |
| P1-A | 多库会话 | 前后端多库、白名单聚合/校验已实施并有定向测试 | 浏览器交互和全部发送入口请求体断言待验收 |
| P1-B | 上传交互 | 拖拽/多选、目标库、队列、部分失败和刷新 | 上传实现依赖现有单文件 API；浏览器验收待做，不引入队列平台 |
| P2 | 报告与阅读 | 填表日期/类别确定性筛选与独立报告库已实现；报告模板、回读/复制/下载与阅读闭环 | 浏览器验收、真实模型报告抽样、更多 PDF/OCR 抽查待做 |
| P2-MD | 报告日期/类别来源核实 | 已完成有限来源核实；口径为填表日期年份=报告提交时间，类别字段为资助类别 | 35 份 Markdown 字段可见率 35/35；三份 PDF 首页抽查一致；总体 OCR 准确率仍待量化 |

不在本轮展开：task5–8、Word/PDF 报告导出、模板管理、科研头条、模型管理、多租户、自动选库、新检索架构。dense 与缓存性能优化仅在有可复现的质量/延迟问题后立项；不承诺“查询延迟不随库大小线性增长”。

### 13.3 会话、库与资料范围：用户可见行为

> 本节首次确认、基础库绑定与切换规则已被 §15.2 取代；其余历史实现记录保留。新规划取消确认门槛，上传目标独立于会话检索集合。

1. 新会话尚未确认库时，显示候选库名与“使用此库 / 选择其他库”；候选取当前可用库或首个可用库，不硬编码演示库。点击明确的选库动作即确认，不再二次弹窗。无库时显示“新建知识库并导入资料”，禁用发送并说明原因。
2. 确认状态和检索集合按 §13.3 的 V3 契约同批兼容。显式确认/选库写 `corpus_confirmed=true`；缺字段时，有效旧 `corpus_id` 视为确认，无绑定视为未确认；失效绑定保留原标识并恢复，不自动回退。未知 404 与 missing 409 都有可恢复入口。
3. 沿用 §11.7 基础库 + 检索集合：基础库用于管理/上传，检索集合用于本轮问答，1–6 个不同库且包含基础库。界面用“文件存入：A”“本次检索：A、B（2/6）”解释，不能只显示“A”。文献库浏览其他库不得隐式修改会话范围。
4. 切基础库重置集合为新库并清空原限定文档，明确提示；移除检索库时移除属于该库的限定文档。发送前展示最终范围，全部资料是“所选库内全部”，不是全站资料。重复 id 不得绕过上限或参与重复融合；后端对重复 id 明确返回 422，不让重复库参与融合。
5. 生成期间禁止修改当前会话范围；普通发送、编辑重问、重新生成走同一范围校验。每轮保留实际请求范围，旧回答/引用仍按原 corpus_id 回读，切库不重写历史证据；使用新范围重问时显式说明。
6. 选择弹层复用 CorpusPicker，增加多选、数量与新建入口；Escape 关闭、焦点返回触发按钮，键盘可选择。新建空库可进入上传，但不能当作已有资料的检索成功状态。
7. 多库 task4 仍可采集需求，但正文只支持用户明确确认的单库；具体收口遵循 §11.7 R2/R5。单库报告范围独立于会话检索集合，不能偷偷取基础库；确认前不发送生成请求。多库报告继续保留为后续缺口。

涉及模块：`store.tsx`、`workspace.ts`、`api.ts`、`Composer`、`CorpusPicker`、`ScopeSelector`；后端仅补缺失的校验。请求继续遵循单 `corpus_id` 与 `corpus_ids` 二选一。

### 13.4 文件导入：最小可靠闭环

> 新入口与上传目标规则见 §15.4；以下原子发布、同名拒绝、失败继续与重试约束继续有效，不再强制存入会话基础库。

- 入口：文献库详情提供拖拽区和“选择文件”（多选）；Composer 的“导入文件”直接打开当前基础库导入界面，替代仅提示去设置的 toast。始终显示目标库，入队时固定目标，途中切换浏览库不改变归属。
- 接受 PDF/DOCX/MD/Markdown/TXT；不支持目录拖入或其他格式时逐项解释。客户端早提示，服务端仍作最终校验。沿用 200MB 上限，不增加未经需求支持的配额体系。
- **本阶段同名规则：拒绝并提示改名，不自动覆盖**。安全临时落盘，完整接收并校验后再发布源文件；冲突/超限/中断不能清除或截断旧文件。覆盖功能留待明确替换交互，不借上传隐式实现。保存/导入的锁定边界需覆盖实际冲突路径。
- 复用 `POST /api/corpora/{id}/files` 单文件接口顺序提交，目标为入队时基础库的 `source/`，不新增上传路径；每行显示等待、上传/处理、已入库、失败及原因。现有接口不能区分上传和解析时显示“上传并处理”，不能伪造百分比或在 HTTP 201 时忽略返回的 errors。
- 文件已经保存但解析失败时显示“已保存，解析失败”，从已保存文件重试导入；不重新上传同名文件。失败不吞掉后续文件，结束显示成功/失败数量，可只重试失败项。
- 用户可停止尚未提交的队列；请求已提交后不能把断开连接称为服务端取消。K5 的解析取消仍按文件边界生效，并显示“等待当前文件结束”。
- 操作后回读 files、corpora 和文档列表，入库前后状态与数量一致；失败项保留。需要后台进度时复用既有 job，不新增分布式任务队列。先实现 parse 计数与可恢复状态，dense 阶段仅在配置启用时执行。

### 13.5 专项报告与阅读：范围先于生成

- 生成前在现有报告卡片展示：库、领域、年份口径、模板、文件范围及可选基金类别；保留输入供修改。参数齐全不代表范围有效，服务端仍需校验。
- **口径与实现状态（2026-09-23 后续确认）**：用户确认报告年份按“填表日期年份”解释，即报告提交时间；不等同于项目起止年份或成果发生年份。报告从 MinerU Markdown 的显式 `填表日期` 提取年份；类别来自 `资助类别`，指定时精确匹配。未知填表日期的文档排除并计入范围说明，无匹配项不调用模型。P2-MD 来源调查已完成有限范围，不再阻塞实现。
- **证据边界**：35 份主基金库 Markdown 中两字段各 35/35 可见；2024/2025/2026 各抽一份原 PDF 首页，字段与解析文本一致。这只证明样本可见/抽样吻合，不能代表全库 OCR 准确率；报告需披露日期/类别来自解析文本、未逐份核验原 PDF。后续扩大 OCR 抽查并统计误差。
- 文件名派生 `year_from/year_to` 始终只代表项目起止年份，不参与报告提交年份过滤。用户指定类别但字段未知不能猜；显式限定文件仍可缩小范围，但报告披露不能验证类别。
- **提取鲁棒性（C2，实施建议）**：现有行首标签解析对 Markdown 表格、加粗字段名和变体字段名易漏取。下一小改先将字段行做确定性归一化（去表格分隔符、Markdown 加粗/行首符号和空白），再按受控别名表识别 `填表日期/填报日期`、`资助类别/项目类别/类别`；日期只取标签后字段值中的首个合法四位年份，类别保留归一化后的完整值并精确匹配。不得跨行任意搜索一个年份/类别，避免误拿印制年份或正文年份。输出本次文档总数、日期/类别命中数、缺失/无效数；报告范围摘要复用计数，日志/诊断提供未命中清单（doc_id/title/corpus），不泄露无关正文。为表格版、加粗标签和字段变体各加 fixture，固定过滤行为并验证可解释缺失。
- 沿用 `(session_key, run_id)` 与 report_id：报告卡片捕获生成时的会话与资料范围；切会话/切库不改变进行中请求的归属。重复点击/失败后查询优先查既有结果，重新生成才产生新 run_id；旧报告保留。
- 报告保存可回读的来源清单（库、文档、版本、页码/章节）及范围/覆盖局限；正文引用能与清单对应。无物理页码不能编造页号。流式问答或报告失败均不得显示“完成”。
- PDF 继续原文件预览，Markdown 渲染与原文切换，TXT 文本；DOCX 先明确标注当前“提取文本预览”，保真 HTML 是后续增强，不阻塞问答。新增 HTML 渲染时才落实内容净化与对应验收，不为四种类型重写全部预览接口。

### 13.6 验收条件（进度以 §13.13 为准）

| 编号 | 场景与可观察通过条件 | 验证层级 |
|---|---|---|
| AC-01 | 已有 A.md 后上传同名/超限/发布前校验失败或发布前取消：原文件字节不变，目标未发布或旧字节保留，临时 `.tmp` 清理且索引不变；新文件成功后可回读；解析失败后 `files.status=error`，UI 显示“已保存、未入库、可重试” | 临时库 API 测试覆盖发布原子性；不要求模拟 TCP 中断；浏览器检查错误/重试状态；禁止真实库破坏性测试 |
| AC-02 | 首次会话确认后发送；旧会话失效库出现恢复入口且不发默认库请求；空库有明确空态；刷新确认状态保留 | 前端交互 + 请求断言 |
| AC-03 | 两个小库分别放唯一事实，选两库后请求只含 corpus_ids；刷新仍选两库；第七库不可选；跨库引用带正确 corpus/page；切基础库清空旧范围；编辑/重生成也一致 | 单元/API + 浏览器 mock；另做真实两库问答抽样，不要求所有问题强行引用每个库 |
| AC-04 | 拖入四类文件及非法/同名文件，逐项结果正确；一项失败后其余继续；目标库不漂移；刷新可回读已保存状态；仅重试失败项 | 临时目录 + 浏览器；解析可用 fixture，另抽样真实 PDF，不全库重解析 |
| AC-05a | 确定性过滤行为：按用户确认的填表日期年份（报告提交时间）筛选；类别按 `资助类别` 精确匹配；缺日期排除并计数；无匹配不调用模型；逆序年份 422；filename 项目起止年不参与报告年份过滤 | 定向报告/API 测试覆盖；状态：**通过（代码行为）**，不代表 OCR 数据可信 |
| AC-05b | 元数据可信度：对每种实际模板/版式及扫描质量分层抽样，逐份对照原 PDF 的填表日期与类别，记录命中率、年份/类别误识别率、未命中和误匹配样例；报告每类样本数与边界，不将 Markdown 字段可见率当准确率 | 状态：**有限证据 / 未通过总体可信度验收**；当前 35/35 Markdown 可见、3 份首页一致只作初步证据。退出前需完成跨版式/扫描件分层核验并明确可接受错误阈值；未定义阈值前不得声称可靠覆盖全库 |
| AC-06 | task4 采集→参数确认→生成→刷新回读→复制/下载；重复点击不重复产物；多库明确受限；切会话不串报告；来源版本失效有提示 | API + 浏览器 mock + 一次真实模型报告抽样（缺凭据则记待验证） |
| AC-08 | 先在临时库覆盖旧 rel-keyed/name、id-keyed/name、幂等与损坏/写失败安全；再对真实配置执行一次只读服务启动/`GET /api/corpora` 扫描，确认 4 个基金库 API 名称仍为期望友好名，磁盘记录已是 id-keyed/alias 且无旧 name，id/rel 不变、missing 条目保留。真实扫描仅做规范化元数据写回，不触碰 PDF/索引；保留变更前备份/差异证据。只有两层证据都通过才标 R1 完成 | 临时目录持久化测试 + 真实 API/磁盘回读（真实库名变更属数据迁移，先备份并确认仅改 corpora.json） |
| AC-09 | 聚合 A/B 列表，只选 B 的文档则 A 不贡献资料；null 才搜全部；越库/未知/归属歧义拒绝；B 加载失败有提示；切库后旧请求不能覆盖列表；总选择上限 20 | API + 前端请求/状态断言 |
| AC-10 | 恢复 base=A/set=B 的不一致会话时阻止发送并提供修复；逐项断言普通 send、regenerate、编辑分支重问、task4 intake 都满足 base∈set 且 missing 只触发恢复。A+B 报告未确认不发请求，确认 B 后报告只发 B/其文档且会话仍 A+B；换库顺序不改变 intake 领域；missing 409 与同名/导入中 409 分流正确。直接 API 无“浏览基础库”概念，服务端不校验 base∈set；该约束由以上每个 UI 请求体断言背书 | 前端恢复/交互 + 每个发送入口的网络请求断言；报告接口单独断言 corpus_id/doc_ids |
| AC-11 | 旧 reports.sqlite3 迁移后，报告 GET/list 中空 `corpus_id` 显示“来源库未记录”而非绑定当前库；`ReportSummary` 对空/缺失新增字段安全渲染；省略 `session_key`/`run_id` 表示不按该字段过滤，显式 `session_key=` 只列空 session_key，显式 `run_id=` 只列 legacy 空 run_id，幂等查找空 run_id 永不命中 | 临时旧 schema + API 列表测试 + 浏览器旧报告卡片恢复 |
| AC-12 | 报告字段解析先归一化 Markdown 表格、加粗与行首装饰；仅从受控字段标签值解析日期/类别，歧义或多值冲突不得任取；每库可见总数/命中/缺失计数，并可审阅未命中文档清单 | 表格/加粗/别名 fixture；边界与冲突用例；每库统计及未命中清单可读；不把全文年份误认成填表日期 |
| AC-07 | 四类阅读现状如实标注；PDF 引用打开正确库和物理页；版本变化/文件缺失可解释；所有文件列表/详情/报告头把 filename-derived 年份标为“项目起止年份（按文件名推断）”或隐藏，不出现“报告年份”；窄屏和键盘能关闭并回到原入口 | 浏览器人工或自动检查，记录实际方式与结果 |

实施接续：代码工作已推进至 §13.12。当前后续重点为浏览器验收、报告真实模型抽样与 OCR 质量抽查；详细状态见 §13.13。P2-MD 已有有限来源结论，不需重复调查；不将三份 PDF 抽查外推为全库准确率。先读取 `.agents/rules/testing-and-code.md`，以当前 HEAD 核对是否已有后续实现，保留他人修改。仅执行受影响的必要检查；前端改动执行构建和相关测试，涉及接口/存储执行对应后端测试。已通过且输入未变不重复运行。

回填本文对应工作包：实际代码基线、执行命令/场景、结果、尚未运行项；长期现状同步 PROJECT，取舍变化同步 DECISIONS。所有适用 AC 通过且无实质缺口即停止；AC-05 的实现有定向测试，PDF/OCR 准确率仍需适量抽查作为数据质量限制。mock 通过不能替代真实模型结论。遇到凭据/语料/元数据来源缺失，保留明确待验证项及所需输入，不通过改写验收宣布完成。


### 13.7 verifier 意见处置（2026-09-23，规划已收口，代码/验收待执行）

上轮 A/B 已有对应修复/后端代码；C 是已定稿设计，不能写成前端 SessionData 已实现 corpus_ids。保留最小 KB-4：BM25-only、报告排名 RRF、全局预算、带库引用，不做跨库 dense 或自动选库。

| 意见 | 裁决与实施接续 | 验收归属 |
|---|---|---|
| R1 迁移落盘 | 规范化能力和临时库持久化/幂等测试据实施者报告通过；真实 `.knowledge/.state/corpora.json` 仍旧 name 格式，四个基金库尚未真实回读/写回。以 AC-08 的真实 `/api/corpora` 扫描 + API 名称与磁盘 id-keyed/alias 回读作为最终退出证据。 | P0-B / AC-08；能力已实现，真实数据迁移未闭环 |
| R2 报告多库 | 单库报告必须在卡片显式确认独立范围，不能静默降级；服务端现有 422 仅说明不接受 corpus_ids，不保证客户端没有丢范围。详见 §11.7。 | P1-A / AC-10，P2 / AC-06 |
| R3 跨库限定 | 全局白名单与每库求交；ScopeSelector 聚合全部选中库并分组；不能以“某库没有限定 id”为由搜全库。 | P1-A / AC-09 |
| R4 基础库约束 | “仅前端保证”已定；PROJECT §4.2 需同步声明直接 API 不含浏览基础库概念且服务端不校验 base⊂set。 | P1-A / AC-10 对每个前端请求体逐项断言 |
| R5 intake 领域 | 多库领域由用户指定/确认，无领域则追问，不从首库默认；这是当前 selected[0].domain 的待改行为。 | P1-A / AC-10 |
| R6 409 分流 | PROJECT §4.5 登记真实 FastAPI detail 包装；仅 detail.missing===true 走缺失库恢复，其余保留原错误语义。 | P0-B / AC-02，P1-A / AC-10 |
| R7 最小实现 | 会话级 corpus_confirmed 可选字段与旧数据回退已补 §13.3；KB-3 固定复用 K7 路径、固定入队目标库，已补 §13.4。 | AC-02/04 |

该审核轮次仅调整规划；未调用扫描、未修改真实 corpora.json，未执行上述测试。验收通过后编码 agent 再变更状态，不能把“审核意见已处理”当作“功能已验证”。

### 13.8 实施进展（2026-09-23，历史快照，状态由 §13.11–13.14 更新）

- **P0-A / AC-01：部分完成并通过已覆盖场景。** 上传采用同目录临时文件、校验后硬链接发布，目标已存在时返回 409 且不覆盖；超限清理临时文件；上传与导入在现有 `import_lock` 内串行。新增 API 场景覆盖同名保护、超限不发布、新 Markdown 入库。解析失败后的“已保存，解析失败”用户提示和中断流场景尚未覆盖，AC-01 暂不标为全部通过。
- **P0-B / R1、AC-08：实现并通过持久化回读场景。** 语料记录损坏/不可读时明确失败，不按空字典继续扫描或覆盖；扫描比较原始磁盘结构与规范化结构，旧 rel-keyed/name 记录首次扫描安全写回为 id-keyed/alias；写入用临时文件原子替换。测试核对名称/id/rel、旧字段移除及第二次扫描幂等；真实四库记录未修改。
- 修正上传后列表读取在“空库变为首个可用默认库”时取到旧数据库实例的问题；按实际数据库路径复用实例。由新 Markdown 上传回读测试覆盖。
- 本轮执行：`.venv/bin/python -m pytest tests/test_corpora.py tests/test_corpora_state.py tests/test_app.py -q`，**30 passed**（含 1 个 Starlette 弃用警告）。此前的单文件上传测试在补上“空库变默认库”场景后重新运行，最终结果以本次 30 项为准。
- **仍待实施：** 报告年份与类别缺少可验证元数据来源；文件名只表达项目起止年份，不能用于冒充报告年份。P0-B 的 AC-02 会话恢复 UI 尚未实施；AC-05 需先确定/补充可信元数据契约。P1-A、P1-B、P2 尚未开始。不得将本段部分进展视为整个 §13 计划完成。


### 13.9 实施反馈后的接续裁决（2026-09-23，历史接续点，已由 §13.11–13.14 取代）

实施者报告：P0-A 已完成同名 409 不覆盖、超限临时文件清理、新 Markdown 导入回读；P0-B R1 规范化持久化已完成，损坏记录明确报错，写回可幂等。报告的定向验证为 `.venv/bin/python -m pytest tests/test_corpora.py tests/test_corpora_state.py tests/test_app.py -q`，30 passed；`git diff --check` 通过。此证据只覆盖报告列出的代码与场景。

接续指令：

1. **P0-A 收尾**：补上解析失败时“文件已保存、尚未入库”的可见状态/重试路径。以可确定复现的发布原子性场景代替难复现 TCP 中断：发布前校验失败/发布前取消后，旧文件字节不变、目标未生成或旧内容保留、临时 `.tmp` 清理、索引不变。解析失败验证 `files.status=error` 和可重试 UI。通过后才把 AC-01 标为完成。
2. **V3 共用前置（P0-B/P1-A 同一轮字段契约）**：在开始 UI 工作前，一次性定义并兼容 `SessionData.corpus_confirmed?` 与 `SessionData.corpus_ids?`，明确默认/缺失/非法值恢复、`restoreTurns`、新会话初始化、保存回读、编辑分支及旧记录测试；禁止先只加确认字段、随后再做第二次数据模型迁移。
3. **P0-B 前端 AC-02**：实现按会话持久化首次确认。旧会话有效绑定保持；missing/未知库不得落到默认库；用户显式重选后保存绑定；无可用库给出新建/导入入口并禁用发送。按 `detail.missing === true` 分流，其他 409 保持各自错误提示。不得重复修改 R1。
4. **P2-MD 元数据调查**：短平快只读调查现有报告 PDF 与 mineru 产物/数据库，不批量重解析，不写入猜测值。交付报告年份和基金类别的字段来源、语义、样本覆盖/失败例。若无可信字段，停止 AC-05 实施并提出最小所需的产品输入（字段由谁提供、来自原文哪处、缺失如何处理）；这项阻塞严格年份/类别筛选，不阻塞 AC-02、P1-A 的 chat 多库。
5. **V2 标签修正 + 阶段优先级**：立即把用户可见的 `year_from/year_to` 标签改为“项目起止年份（按文件名推断）”或隐藏，检查报告头、来源卡、文献库/详情等所有展示路径；不改变数值字段、不推断报告年份。随后按：P0-A 收尾 → P0-B（V3字段共用前置 + AC-02 + AC-08真实回读）→ P1-A 多库会话/引用范围 → P1-B 上传交互 → P2 可做且不依赖缺失元数据的报告回读/预览工作。AC-05 与其余报告可靠性验收分开跟踪，不得将“报告范围 UI”当作“元数据过滤已实现”。

实施状态：P0-A 部分通过；P0-B R1 规范化能力/临时库 AC-08 部分通过，真实语料扫描与回读未通过/未运行；AC-01、AC-02、AC-05、AC-03/04/06/07/09/10 状态维持未完成或 AC-05 blocked。具体测试证据如上，未由本规划更新者独立复核。


### 13.10 verifier V1–V7 处置（2026-09-23，初始裁决，后续状态见 §13.11–13.14）

| 意见 | 处理决定 | 计划落点 |
|---|---|---|
| V1 真实迁移未完成 | 接受。已实现规范化逻辑/临时库持久化测试 ≠ 四个真实库已迁移。真实 GET `/api/corpora` 后需核对友好 alias 和磁盘格式，保留迁移前备份/差异证据。 | AC-08、§13.9 状态已更正 |
| V2 项目年份误标报告年份 | 接受并列为立即零依赖修正。审查全部用户可见路径，将 filename-derived `year_from/year_to` 标签注明“项目起止年份（按文件名推断）”或隐藏；不碰值、不推断报告年份。 | AC-06/07 增加标签一致性检查；实施者先做，P2-MD 后续确认报告字段 |
| V3 会话字段两次迁移风险 | 接受。`corpus_confirmed?` 与 `corpus_ids?` 同一轮定义默认、旧数据兼容和恢复行为；即使 P1-A UI 后做，也不再改第二次 schema。 | §13.3、接续前置与 AC-10 |
| V4 发送入口遗漏 | 接受。明列 send、regenerate、编辑分支重问、task4 intake、task4 report generation；每项断言 base∈set 或报告显式单库范围，并按 missing 409 恢复。 | AC-10 |
| V5 中断不可复现 | 接受。以发布前失败/取消测试原子性，不要求模拟 TCP 中断；解析失败契约使用 `files.status=error` 及 UI 已保存/未入库/可重试。 | AC-01 |
| V6 未提交工作树 | 记录归属：实施者应在其代码、测试、文档变更自检并确认文件清单后提交该实施批次；规划维护者不代替实施者提交，也不混入其未审阅代码。 | §13.9 交接备注 |
| V7 PROJECT §4.2 边界 | 接受。补充直接 API 不含浏览基础库概念，服务端不校验 base⊂set；由 AC-10 所列各前端请求断言支撑。 | PROJECT §4.2、AC-10 |

本轮仍只更新规划；没有改实现标签、迁移真实语料或提交实施者代码。实施者反馈与 verifier 的 116 passed 属于外部报告；本轮未重跑测试。

## 14. 任务模式产品规划（2026-09-23，待实施）

### 14.1 目标与范围

**目标**：让用户在选择 task1–4 前就知道任务适合什么问题、会如何检索、结果长什么样；选择后可自然输入，不因缺参数卡死；默认值可见、可改、可恢复。任务定义分析意图和证据标准，不改变用户资料权限；库/文件范围仍由会话检索集合与显式文档白名单控制。

**当前事实**：后端有 task1 精准问答、task2 对比分析、task3 趋势推测提示词；task4 有自由文本 intake、报告提示词；`src/templates/` 有四份章节模板。它们规定了部分输出形状，但任务选择界面缺少面向用户的背景/示例/default summary，task4 参数默认口径没有统一契约。以下设计是产品规划，不代表提示词和界面已经实现。

**非目标**：新增 task5–8；自动猜测用户意图并切换任务；多库专项报告；图表、docx/pdf 导出；把提示词中的“高/中/低”包装成统计概率；新增元数据管理平台。

### 14.2 统一的任务选择与使用流程

1. 任务菜单列出 4 张可选项：名称、适合问题、能得到的结果、资料要求各一行，并提供一个可直接填入的示例。默认选“精准问答”，显式选择后开始一个新会话；切换会话前确认/提示当前草稿与历史保留方式，不悄悄丢输入。
2. 每个新会话在输入框上方显示任务 chip 和可编辑的“分析设置”摘要；领域、时间范围、对比对象、模板等按任务变化。安全默认值标“默认”，点击可修改；硬过滤值显示其范围和含义。用户在自然语言中改了参数后，同步摘要，下一轮发送前可见。
3. 未提供可选参数时使用已定义默认值，直接开始，不连续追问偏好；仅在任务成立所需信息不足或歧义会改变结果时一次性追问。追问应回显已识别内容，只问最少缺项；回答可以逐项补充。
4. 任务配置按会话持久化，任务切换创建新会话，历史各自保持原 task/settings；恢复旧会话时新增字段缺失使用安全默认，不可造成白屏。任务切换不得重写旧消息或旧报告的参数快照。
5. 显示可观察阶段（范围确认/检索/整理/生成/完成/失败）。task4 intake 明确显示“正在收集报告条件”，不假装已检索；报告仅由报告入口生成。无匹配材料与检索失败有可操作的改范围/补资料提示。

### 14.3 公共默认值与参数语义

后续若需要可评估 `TaskSettings`；本批 T-UX/T-STATE 不引入全套设置 schema 或新后端全局配置。先复用现有 task id、§15 的会话检索集合及 task4 报告参数；只在确有持久化需求时加最少可选字段，并为旧会话定义安全默认。每轮/报告参数快照作为后续增量，不是最小 UX 前置。各任务独立长度/语言设置、完整 prompt 重构及模板扩充均延后。

| 参数 | 缺省行为 | 产品显示与限制 |
|---|---|---|
| `domain` 分析领域 | 单库时采用该库可靠登记领域作为可编辑建议；多库不默认取首库领域，使用用户问题或明确选择。无可靠领域时不猜；task4 必须显示/确认领域 | 标“领域建议：X（来自库 A）”，一键改写；不能把库名直接当科学领域；已确认内容随该会话任务配置保存 |
| 资料库 | 当前会话 1–6 库集合；新对话按 §15 自动选首库，无首次确认流程 | 显示库名与数量；“全部资料”仅指所选检索库集合；任务不自动扩大到其他库 |
| 文件范围 | 默认所选库内全部已入库文档 | 限定文件是全局白名单，跨库按库求交；展示文件所属库；失败加载不退回全库 |
| 近年范围 | task1 不加时间过滤，除非用户问题或显式设置要求；task2/task3 默认显示“近 5 个完整自然年”的**项目起止年份建议窗口**，但不启用过滤；task4 默认“近 5 个完整自然年的填表日期年份” | 令 `Y` 为执行时最近一个完整自然年（当前 2026 年则 `Y=2025`），窗口为 `[Y-4,Y]`，即 2021–2025。task2/task3 仅显示建议窗口，用户明确打开“仅看该项目周期”且后端过滤契约完成前，不把它应用到检索。如用户主动启用该窗口，只有服务端过滤契约落实后才按项目起止区间与窗口重叠筛选，并显示排除/缺失数；目前默认不改变检索候选。设置中标“按项目起止年份（文件名推断，可能不完整）”。task4 的报告提交年份用解析 Markdown 的 `填表日期` 字段，按 §13.5 处理缺失与 OCR 质量限制 |
| 基金/项目类别 | 不限 | task4 的类别字段来自解析 Markdown 的 `资助类别`；指定时精确匹配。缺字段文档不匹配，范围说明计数并提示元数据来自解析文本、总体 OCR 准确率未量化 |
| 语言 | 中文 | 用户明确要求其他语言时跟随；引用原文保留原语言短标题即可 |
| 长度 | 任务默认：task1 简洁（结论+必要依据）；task2 标准（比较表+结论）；task3 标准（事实与推断）；task4 完整章节报告 | 用“简洁/标准/详细”选择，不用 token 数让一般用户配置；默认值始终可在结果前修改 |

**时间数据保护规则**：filename-derived `year_from/year_to` 仅为项目起止年份；task2/task3 的五年窗口仅为未启用的建议，不能静默改变检索集合；显式启用且服务端过滤能力就绪后才能筛选，并说明项目周期口径。task4“报告年份”依据用户确认的填表日期（报告提交时间），从解析 Markdown 提取；日期缺失排除并计数，需说明尚未逐份核对原 PDF。两种时间口径在菜单、参数卡与报告中分开命名。

### 14.4 task1 精准问答

- **背景/适用**：用户已有明确问题，希望快速得到可核查答案；不要求模型补充领域知识或推演趋势。
- **菜单文案**： “针对具体问题，从所选资料中查找证据并回答。适合定义、机制、某项成果或事实核实。”示例：“这些项目采用了哪些医学影像方法？”
- **输入**：自由文本；可含多个子问题。默认使用已确认检索集合全部资料，无默认时间过滤；可选显式限制文件或范围。不要为了领域默认强行改写用户原问题。
- **检索/追问**：直接具体问题优先回答；指代不明且影响答案时只问一个关键澄清。没有证据不转用模型内知识填空，不自动切 task2/3。
- **产出样式（text）**：① 先给直接结论；② 按子问题列事实与 `[n]` 引用；③ 末尾“资料范围与局限”，说明检索库/文件范围、缺项与证据缺口。答案短而完整；无匹配时说明本次范围未找到，而非该领域没有。
- **拒绝模式**：不同报告说法冲突时并列呈现来源与差异；不能把申请目标写为完成事实；没有页码就用可用定位信息，不造页码。

### 14.5 task2 对比分析

- **背景/适用**：需要比较至少两个项目、报告、方案或时期；输出差异与可比性边界，而非单项摘要。
- **菜单文案**：“比较不同项目或方案，按共同维度呈现异同，并说明材料是否可比。”示例：“比较这些项目的研究对象、关键方法和已实现应用。”
- **输入/默认**：自由文本。近五完整自然年的项目周期仅为默认显示的建议窗口、暂不作硬过滤（见 §14.3）；无指定对象时按问题从已选库召回最多 5 个相关项目，不足 2 个时不伪装对比，追问用户补充对象或接受单项梳理。用户明确点名的对象优先于默认窗口，但仍受所选库/文件范围约束。
- **可比性**：先核对对象、年份语义、项目类别与证据粒度。不同类别/阶段不能直接排名；指标缺失不补零；时间重叠不代表因果。对比单位默认项目，报告重复材料合并，来源清单仍保留。
- **产出样式（text + Markdown table）**：范围/对象摘要；表格列“比较维度｜对象 A｜对象 B（及更多对象）｜差异结论｜证据”；随后给 2–5 条综合差异；末尾写可比性前提和局限。每个单元中的事实有来源编号，表格过宽时按维度拆表，不造分数。
- **降级**：只找到一个对象时先说明“当前仅找到一个可比对象”，给单项摘要，问用户是否补充/放宽；不能用两个同项目版本冒充两个独立项目。

### 14.6 task3 趋势推测

- **背景/适用**：用户希望归纳样本内研究方向变化并谨慎讨论可能走向；它提供证据支持的判断，不作领域全景预测。
- **菜单文案**：“从所选报告样本归纳变化，再区分事实与未来推断。结论只代表当前资料范围。”示例：“近几年这些项目的研究重点如何变化，未来可能关注什么？”
- **默认**：研究窗口建议为近五个完整自然年的项目起止窗口，但默认不启用过滤；用户显式启用且服务端过滤契约就绪后才限制检索。默认预测视野为未来 3 年，仅作为用户可改的分析设置，不意味着模型有定量预测能力。没有足够跨年样本时缩短结论，不靠模型外知识补趋势。
- **产出样式（text）**：①“样本事实”——按年份/项目列可观察变化，给 `[n]`；②“可能方向（推断）”——每项写推断、依据、前提与反例/不确定性；③“样本与局限”——有效年份、项目数量/去重规则、资料缺失。高/中/低只能称“定性证据强度”，不能称概率；频次/增长数字须由确定性统计产生、说明分母，不能从语言模型印象生成。
- **范围**：默认按项目去重，多个报告的更新信息可用于时间变化但不可重复计为独立项目；样本少于两个有效年份时明确无法判断趋势，可仅提供方向性观察。

### 14.7 task4 专项报告与四个模板

**采集与默认**

- task4 intake 是参数整理器，不在 chat 生成报告正文。自由输入可一次给全参数，也可以逐轮补充/覆盖；缺项一条消息列出，回显当前已确认值。自然语言里出现的“去年/近五年”先转成明确区间并回显，用户可确认或修改；不能默默套用未显示的日期。
- 报告知识库必须明确选一个。单库会话报告库可预选该唯一库，回显名称并允许更换；多库会话不自动取基础库/第一库，必须在生成前选定单个报告库。选择报告库不修改 chat 检索集合。`doc_ids` 仅可属于所选报告库。
- `domain` 默认取报告库登记领域，作为可编辑建议并在参数摘要里标出来源；无领域时从用户原文提取候选供确认，不从模型背景知识猜领域。
- `template_id` 默认 `comprehensive`，可选 achievements/hotspots/future_directions/comprehensive；识别不到时使用默认值并显式告知用户，可一键更换，不为模板名称不清强制追问。
- 时间参数：task4“报告年份”按用户确认的填表日期年份（报告提交时间），默认近五个完整自然年，令 `Y` 为最近完整自然年，窗口 `[Y-4,Y]`（当前 2026 年为 2021–2025），显示并允许改动。后端从解析 Markdown 的 `填表日期` 提取；没有该字段即排除并计数。用户可另选项目周期，但界面必须明确标为“项目起止年份”。报告/来源注明采用解析文本且未逐份核验原 PDF。
- `fund_type` 默认不限；可选值来自解析 Markdown 的显式 `资助类别`，指定时精确匹配；无该字段文档不能当作类别匹配，报告范围披露其排除/未验证数量。
- `focus` 默认空；`doc_ids` 默认所选报告库全部可用文件；不问可省略的字段。`year_from > year_to` 明确指出并让用户修改，不自动交换。
- 用户明确要求与默认冲突时以用户明确值为准；显式“全部年份/不限”视为移除默认窗口，但 UI 必须显示其范围更宽。报告生成前呈现最终“知识库｜报告提交时间（填表日期）｜项目起止年份（如启用）｜类别｜文件范围｜模板｜重点”，用户确认一次后发起。

**模板职责与输出契约**

模板仍以 `src/templates/{achievements,hotspots,future_directions,comprehensive}.md` 为章节结构唯一权威，提示词仅定义事实/引用/去重规则；本规划不复制或替换模板源。模板章节说明应从“只有标题”扩成每章写作任务、纳入条件、证据要求、不得推断项，并由模板加载器注入。所有模板共享：标题/生成范围卡（库、报告提交时间/填表日期口径、项目周期是否另用、类别状态、时间窗）/执行摘要（3–5 条且均可追溯）/正文章节/来源清单/资料局限。模板可调整顺序或省略不适用小节，但不可省略来源与局限。

| 模板 | 建议章节与内容 | 核心限制 |
|---|---|---|
| 成果报告 `achievements` | 1 范围与口径；2 总体成果概览；3 代表性成果（按主题分组，每项写做了什么/证据/项目）；4 已实现应用；5 潜在应用（单列并标明仍属潜在）；6 来源与局限 | 只把原文明示的已完成内容计为成果；重复项目/成果去重；不按引用数量或描述篇幅推成果重要度 |
| 热点报告 `hotspots` | 1 样本与统计口径；2 热点主题及代表证据；3 项目分布/年度分布（只有确定性统计支持时）；4 边缘/新兴主题（样本充分才写）；5 来源与局限 | 范围限本次样本，不称“全领域热点”；项目为分母并去重；统计值须可复算，无法分词/归类时不造频次 |
| 未来方向 `future_directions` | 1 研究基础与已取得事实；2 仍未解决的问题（有证据）；3 未来方向建议（每项依据→推断→前提/风险）；4 备选情景/不确定性；5 来源与局限 | 推断不能包装成项目已承诺结论；禁止将目标/预期成果当成果；没有证据的技术路线用“待验证问题”标记 |
| 综合报告 `comprehensive` | 1 摘要与范围；2 研究基础/样本结构；3 代表性成果与应用；4 样本内热点/变化；5 未来方向（事实与推断分段）；6 结论；7 来源与局限 | 各章节保持成果、热点、未来推测的证据边界；避免重复罗列同一项目成果；报告结论不超出入选资料 |

**生成与失败**

- 正文通过 `POST /api/reports`，chat 只产参数回显。报告卡展示正在生成/完成/失败；保存后能从会话列表/报告入口回读，包含当时的单库范围、参数和来源快照。
- 入选材料、解析失败、元数据未知必须计入范围说明；未知填表日期的文件排除并计数；报告需说明筛选年份来自解析文本且未逐份核验原 PDF。若用户选择项目周期，明确显示 filename-derived 字段是项目起止年，不混成报告提交年份。
- 引用需对应已装配并被模型实际引用的来源；结果末尾来源表列文档标题、库、报告编号/可用页码。内容不得编造数字、负责人、基金类型、论文/专利，也不得把项目申请目标写成成果。
- 空材料、模板无效、领域/年份无效、模型错误分别给可修复提示并保留用户参数；重试不重复生成记录，用户点击“重新生成”才建立新 run id。

### 14.8 任务模板加载和参数持久化约束

- 第一批复用后端现有任务注册表和 API 字段；仅补足四个模式各一句用途与一个示例（若现有字段可承载则不加字段）。不新增 artifact schema、完整 task 参数 schema 或管理 UI；未知 task/template 仍明确 422。后续若发现现有契约无法表达必要信息，再单独评估最小扩展。
- 任务说明面向用户，prompt 面向模型，两者分开维护；禁止把 system prompt 或内部推理展示在 UI。`src/prompts/` 维护行为与证据规则；`src/templates/` 唯一维护报告章节；避免 UI/后端/模板各写一份互相漂移的章节标题。
- 最小批次不新增全套 `task_settings` JSON。复用并兼容既有 `task_id`、`corpus_confirmed`、`corpus_ids` 和 task4 报告参数；新增持久化字段须有缺失/非法值安全回退，不得影响旧 turn/report。未来任务参数快照独立规划后再实施。
- task1–3 默认产出 `text`；task2 用 Markdown 表格表达比较结构，但 artifact 仍是 text，不另建 table 导出。task4 默认 document Markdown；产出格式沿用现有 `.md` 首期，不开启 DOCX/PDF。

### 14.9 分阶段交付与验收

| 包 | 范围 | 通过条件 |
|---|---|---|
| T-UX（第一批最小版） | 四项菜单名 + 一句用途 + 一个简短示例；当前任务/库范围摘要；不增加长篇 onboarding | 可选任务并看懂差异；任务切换/草稿去留明确；默认领域来源可见；五年项目窗口显示为“建议，未过滤” |
| T-STATE（与 T-UX 同批） | 仅持久化 task id、既有 corpus confirmation/retrieval set 和本批确需的任务默认值；旧记录安全回退 | 旧会话正常恢复；非法/缺失设置不白屏；改新设置不改变旧 turn/report；不提前加入全套 task_settings schema |
| T1 | 精准问答菜单契约和格式 | 多子问题覆盖、只用实际证据、无匹配与冲突表达清晰 |
| T2 | 对比对象识别/可比性/表格 | 至少两对象才下对比结论；不足时诚实降级；表格事实可逐条追源 |
| T3 | 项目窗口/未来视野/推断披露 | 事实与推断分区；频次仅来自可复算统计；样本不足不声称趋势 |
| T4-INTAKE | 领域/库/模板/填表日期年份/类别默认值与确认 | 一条消息列缺项；默认来源可见；用户覆盖生效；报告年份按填表日期年份；缺字段排除并计数，报告注明解析文本来源 |
| T4-TEMPLATE | 四个模板写作说明完善 | 章节有明确目的与证据规则；四类报告结构各有差异且共用来源/局限尾部 |
| T4-E2E | 生成、保存、回读、失败/重试 | 参数快照与报告一致；多库报告显式单库确认；引用/范围/局限核对；模型故障可恢复 |

先完成 T-UX/T-STATE 的最小版（任务菜单、简短说明/示例、当前任务/范围摘要、安全默认、旧会话兼容、执行阶段）；不在这一轮加入每任务复杂参数表、长度/语言调节或重写四个 prompt。通过该最小版后再按实际反馈逐项扩充 task1–3 文案/示例和 task4 intake/template；task4 报告日期/类别过滤已按确认口径实现；任务 UI/模板说明仍待实施，解析准确性需进一步抽查。第一批仅对 T-UX/T-STATE 做浏览器走查和旧会话/切任务请求断言；任务逐项深测与真实模型抽样列为后续增量，不作为最小版前置。缺凭据则记录待验证，不虚报通过。

**停止条件**：四个模式的用途、默认值、澄清行为与输出样式都能在 UI 中看见；旧会话安全恢复；task4 四模板参数及报告回读闭环；无报告年份误标；元数据缺口如实披露。满足后停止，不扩展任务数量/导出格式。

### 13.11 实施进展（2026-09-23，历史执行记录，测试环境状态由 §13.12 更新）

- **V2 年份标签：已实现。** 文献库详情把文件名推导年份标为“项目起止年份（按文件名推断）”；注入模型上下文的报告来源头也使用同一口径，不再称“报告年份”。报告卡片中的年份仍是用户填写的报告筛选范围，不属于文件名派生字段。
- **P2-MD 字段证据：** 对现存主基金库 35 份已解析 Markdown 做有限只读字段扫描：`资助类别` 35/35 命中（面上项目 14、重点项目 6、联合基金项目 9、重大研究计划 6）；`填表日期` 35/35 命中（2024 年 1、2025 年 23、2026 年 11）。同批“国家自然科学基金委员会制（年份）”为 2023 年 17、2025 年 18，显示该印制年份与填表年份不是同一口径。另从 2024/2025/2026 三个年份各抽一份原始 PDF，视觉核对首页的类别和填表日期，均与 Markdown 一致；此 3 份 spot-check 不能代表 35 份总体 OCR 准确率。
- **AC-08：真实迁移完成。** 先将旧文件备份至 `.knowledge/.state/corpora.json.pre-alias-migration-20260923.bak`（迁移前 SHA-256：`797827a8dc1aef7f27e093393975528a5590fad0150dd49907dd24186de8bf8d`），再通过 `GET /api/corpora` 扫描。四个库的 API 名称与既有友好名一致；六条记录的 key/id/rel/created 保留，旧 `name` 转为 `alias`，包含无 alias 的其他登记项；第二次 API 扫描字节不变。迁移只对 `.state/corpora.json` 的注册信息执行写回，不触碰 PDF、解析产物或索引。
- **AC-01：后端场景补齐；重试 UI 已实现。** 同名发布冲突后原字节、文件列表/索引状态不变；超限不发布且临时文件清理；新 Markdown 入库；解析失败仍保存源文件并标记 `files.status=error`。文件列表显示“已保存，未入库 · 解析失败”，提供“重试导入”复用增量导入入口。浏览器 UI 检查尚未运行，故验收未记为完整通过。
- 本轮后端执行：`.venv/bin/python -m pytest tests/test_corpora.py tests/test_corpora_state.py tests/test_app.py tests/test_incremental_import.py tests/test_retrieval.py -q`，**60 passed**（含 1 个 Starlette 弃用警告）。`git diff --check` 上轮通过；本轮最终再执行。前端 `npm test`/build 因当前 PATH 指向 Windows npm、WSL UNC 工作目录不受 CMD 支持而失败，不能记为通过；需可用 Linux Node 环境后补跑。
- **接续：** V3、AC-02、P1-A 和报告范围的实施/验证见 §13.12；AC-05 的产品口径已确认并按解析字段实施，3 份原 PDF 抽查吻合，总体 OCR 错误率仍待量化。

### 13.12 继续实施（2026-09-23，报告口径确认）

- **口径确认：** 用户确认报告年份=填表日期年份（报告提交时间）。filename-derived 年份仍只表示项目起止年份，不参与报告筛选。
- **会话与多库：** `corpus_confirmed`、`corpus_ids` 已纳入会话持久化和旧 turn 恢复；新会话需确认，发送需校验基础库属于检索集合且集合内库均 ready。普通发送、重生成和编辑分支重问复用会话范围；缺失库 `409 detail.missing` 进入恢复提示。限定文档列表跨库聚合、按库分组，重复归属不能限定；请求校验限定文档必须属于所选集合且归属唯一。多库 task4 intake 不继承首库领域，支持显式领域和基金类别采集。
- **报告生成：** 报告卡要求独立选择单一报告库；存在文档限定时，将本轮文档 ID 与该库交集作为 `doc_ids` 发送，并带 `corpus_id`/`session_key`。后端验证文档归属。报告筛选从 Markdown 显式 `填表日期` 提取年份，类别指定时精确匹配 `资助类别`；未知日期排除并计入范围说明，无匹配项阻止模型调用。实现依赖解析文本；35 份扫描样本字段可见率 35/35，三份跨年份 PDF 抽查吻合，但总体 OCR 错误率仍未量化，不能宣称识别无误。
- **验证：** `.venv/bin/python -m pytest tests/test_graph.py tests/test_reports.py tests/test_app.py tests/test_corpora_state.py tests/test_corpora.py tests/test_incremental_import.py tests/test_retrieval.py -q` → **71 passed**（1 Starlette 弃用警告）。Linux Node `node --test src/` → **29 passed**；`tsc --noEmit` 通过；Vite production build 通过，有既有 chunk-size/dynamic-import 警告。用例覆盖多库 chat 请求、missing 409 保留 detail、独立单库报告请求及旧/非法会话范围恢复。首次原生 Node 测试暴露 `ApiError` 参数属性与 strip-only TS 不兼容及报告响应被重复读取，修复后通过。
- **尚未验收：** AC-02/03/09/10 浏览器交互和所有发送入口请求体断言、AC-04 上传 UI 浏览器走查、报告回读/复制/下载端到端、更多真实 PDF OCR 字段抽查及真实模型抽样。当前无浏览器或真实模型证据，不记为通过。


### 13.13 首批验收状态（2026-09-23；后续状态以 §13.15–§13.20 为准）

本表记录首批状态，不覆盖后续实施回填。状态按实施者 §13.11–13.12 报告回填；未独立重跑其命令。verifier 对当时基线独立报告 `pytest tests -q` 120 passed；实施者 §13.12 报告后端定向 71 passed、前端 29 passed、TypeScript 与生产构建通过。§13.15 的 16 项后端定向测试和 29 项前端测试是后续独立报告，不能与旧数字合并。

| 范围 | 当前状态 | 下一证据 |
|---|---|---|
| 上传保护 / AC-01 | 原子发布、同名保护、超限清理、解析失败状态与重试 UI 已实现；定向后端场景通过 | 浏览器确认状态与重试交互 |
| 真实 alias 迁移 / AC-08 | 已备份真实 corpora.json、API 扫描并核对四个友好名、格式及二次读取稳定 | 完成，无重复迁移任务 |
| 会话确认 / 多库 / AC-02/03/09/10 | 会话字段、旧状态恢复、基础库∈集合、缺失库恢复、多库文档聚合与报告单库确认已实现；后端/前端定向测试通过 | 浏览器跑完整入口并检查普通发送、regenerate、编辑分支、task4 intake、task4 report 请求体 |
| 报告筛选 / AC-05a | 填表日期年份及 `资助类别` 精确过滤、未知排除计数、无匹配不调用模型、逆序 422：定向测试通过 | 确定性过滤行为已通过；不代表 OCR 元数据可信 |
| 元数据可信度 / AC-05b | 35 份 Markdown 字段可见率 35/35，3 份 PDF 首页抽样吻合 | **有限证据/总体验收未通过**；跨模板/扫描件分层抽样，报告命中/误识别率与未命中清单 |
| 字段解析稳健性 / AC-12 | 已支持 Markdown 表格、加粗、行首符号、受控别名；日期只解析标签值中的首个合法年份；冲突标歧义；每库覆盖数和不含正文的未命中文档清单已接入 UI；定向用例/build 通过 | 代码验收已通过；浏览器确认展示。仍不等于 AC-05b 总体 OCR 可信度通过 |
| 上传队列 / AC-04 | 实现状态依实施者报告；浏览器验收待做 | 上传 UI 全流程与失败后续传/重试 |
| 报告卡 / 阅读 / AC-06/07 | 标签修正与报告入口范围逻辑已有实现/定向测试；端到端未完成 | 浏览器报告生成、回读、复制、下载；至少一次真实模型报告抽样；阅读与窄屏交互检查 |
| 任务模式 §14 | T-UX/T-STATE 最小版已补充菜单用途/示例、当前任务/检索范围摘要、安全默认与既有恢复/阶段反馈；task2/task3 无时间过滤 | 定向任务菜单测试和前端 build 通过；浏览器确认切换/恢复/范围摘要 |
| 报告 schema 兼容 / AC-11 | 空或缺失 `corpus_id` 显示“来源库未记录”，不推断当前库；可选 summary 字段有安全文案；省略/显式空串过滤语义已测 | 后端定向测试通过；浏览器确认旧报告展示 |

**本批验证报告**：后端指定测试 71 passed；Linux Node `node --test src/` 29 passed；TypeScript 检查和 Vite 生产构建通过。构建有 chunk-size/dynamic-import 警告。浏览器、真实模型与更广 PDF OCR 抽查均未完成。不得将定向测试等同于 AC 全通过。


### 13.14 verifier C1–C5 收口（2026-09-23）

- **C1**：AC-05 拆为 AC-05a 确定性过滤行为（实施者报告定向测试通过）和 AC-05b 元数据可信度（有限证据/总体未通过）。不得用算法测试通过替代 OCR 正确率证据。
- **C2**：把字段提取归一化列为小型确定性改进，支持 Markdown 表格/加粗/行首符号与受控别名；添加 fixture 并显示每库命中/缺失计数与未命中清单。日期只在标签值中解析，禁止任意全篇抓年；重复标签值冲突时标为歧义并计入未命中，不任取一值。对应 AC-12；fixture 通过仍不替代 AC-05b PDF/OCR 可信度抽样。
- **C3**：task2/task3 的近五年项目周期是 UI 建议，默认不启用过滤；后端过滤合同尚未完成前不改变检索候选。未来用户显式启用后，服务端依 `ReportDoc.year_from/year_to` 做区间重叠过滤，回报入选/排除/年份未知计数；不能静默缩小资料范围。
- **C4**：第一批只交付 T-UX/T-STATE 最小集：简洁 task 菜单、一句用途和示例、当前任务/知识库范围摘要、安全默认和旧数据恢复/阶段反馈。长篇任务说明、长度/语言旋钮、逐任务 prompt 和模板扩写后续按反馈分包。
- **C5**：为 reports 新列默认空字符串建立旧报告 UI 契约，空库显示来源未记录、不推断为当前库；省略查询参数与显式空串分别定义，并覆盖旧 schema 迁移、列表和幂等行为。见 AC-11。

本次仅更新实施规划，不改代码、报告数据库或会话记录。独立复核的 120 passed 记录为当前 reviewer 报告；与实施者 §13.12 的 71 后端定向/29 前端测试分开引用，不合并成一个基线。

### 13.15 C1–C5 规划实施回填（2026-09-23）

- **AC-12 字段解析**：`src/reports.py` 统一解析显式标签值，覆盖 Markdown 表格、加粗与行首列表/引用符号；仅接受填表日期/填报日期及资助类别/项目类别/类别别名。日期提取标签值内首个 1900–2100 四位年份；重复字段值出现不同年份/类别时置为歧义并计入缺失，不任取其一。报告生成范围卡显示所选文件数及日期/类别命中、缺失/歧义数。
- **AC-12 可审阅统计**：新增按知识库读取覆盖率的 API，报告卡在用户选定知识库后可展开统计及未命中文档清单（doc_id、标题、库 ID、字段状态，不返回正文）。该数据表示解析文本的字段覆盖，不代表原 PDF/OCR 正确率。
- **AC-11 旧报告**：历史记录空/缺失 `corpus_id` 显示“来源库未记录”，摘要缺失字段给中性回退文案，不从当前库推断来源。省略 `session_key`/`run_id` 返回未按该字段过滤；显式空串只匹配空字段。相关存储/API 用例通过。
- **T-UX/T-STATE 最小集**：复用 task 注册表增加短示例，并在任务菜单显示用途和示例；已有当前任务、检索库/文件范围、恢复默认与阶段进度继续沿用。没有加入复杂 task 参数设置。task2/task3 近五年仍只是建议，检索未加时间过滤。
- **验证**：`.venv/bin/python -m pytest tests/test_reports.py tests/test_prompts.py -q` → **16 passed**（1 项 Starlette 弃用警告）；Linux Node `node --test src/` → **29 passed**；前端 `tsc --noEmit` 与 Vite production build 通过，存在既有 dynamic-import/chunk-size 警告。前端 build 未覆盖浏览器交互。全量 verifier 的 120 项及此前实施者 71 后端/29 前端仍分别记录，未合并。
- **剩余验收**：AC-05b 仍为有限证据/未通过总体可信度验收；跨版式与扫描件 PDF 抽样、识别正确率和误匹配率未完成。AC-11/12 与 T-UX/T-STATE 浏览器走查尚未做；AC-04/06/07/10 既有浏览器/真实模型验收也仍待完成。

### 13.16 verifier 对 C1–C5 实施反馈的复核与下一步（2026-09-23）

**复核边界**：本规划维护者本轮只读检查了实现、相关测试与文档；未重新运行实施者报告的测试，也未做浏览器或真实模型验收。下述“实现/定向测试通过”均指实施者报告及代码/fixture 静态抽查，不替代独立运行或用户交互验收。

- **AC-12 当前判断：实现范围与计划相符，代码/fixture 定向覆盖通过（实施者报告），交互未验收。** `report_metadata` 对标签值提取日期/类别，支持同一 Markdown 表格行的标签和值、加粗、行首列表/引用、受控别名；不同年份/类别冲突标记 ambiguous；无标签年份不被误当填表年份。覆盖接口返回计数和不含正文的未命中文档标识，报告卡按所选库展示。现有 fixture 覆盖这些情形，但未覆盖“表头一行、值在下一行”的分离式表格。下一步先在只读语料/解析产物中确认是否存在这种布局；存在则添加 fixture 和解析支持，不存在则把当前支持范围限定为标签和值同一行/同一表格行，不宣称兼容任意 Markdown 表格。
- **AC-11：后端/存储兼容的实施者定向用例通过；UI 仍待浏览器。** 继续验证旧报告卡空 `corpus_id` 与缺字段文案、会话过滤、显式空串结果；未记录来源不得继承当前知识库。
- **T-UX/T-STATE：实现遵循最小范围；浏览器语义尚未证实。** 任务注册表提供用途/示例，菜单拼接显示；不扩大到复杂设置。浏览器需确认四任务入口可辨、示例可读、切换后历史会话/草稿状态合理、刷新恢复任务与检索范围、阶段提示不误报完成。
- **测试证据分开记**：实施者报告 `tests/test_reports.py tests/test_prompts.py` 为 16 passed，Node 为 29 passed，TypeScript 与生产构建通过；`git diff --check` 通过。全量 120 passed 是此前 verifier 基线，不代表本次新增改动的全量回归。构建的 dynamic-import/chunk-size 警告保留记录，不阻断本批。

**后续顺序**

**浏览器执行方式**：仓库 `tests/browser_*.py` 使用 Python Playwright；本机已有 `~/.cache/ms-playwright/chromium-1234`（`chromium-1243` 指向该缓存）。不再把浏览器验收列为环境阻塞；更新过时脚本后直接逐项运行。`node_repl/computer-use` 的 WSL URI 限制仅影响桌面控制入口，不影响仓库 Playwright。
1. **离线浏览器脚本（本阶段已完成，见 §13.21–13.22）**：既有脚本已按首次知识库确认、多库集合、带 `?corpus=` 路由和 U10 组件更新；task4、文库、会话分支及 AC-07 引用状态已有离线 UI 证据。不要重复把这批脚本更新列为未开始。后续只有新变更影响交互时才重跑受影响脚本。
2. **AC-06/07 服务端闭环（排在批量上传后）**：AC-07 离线 mock 已验证版本过期和当前列表缺失时的提示与停止打开；AC-01/04 批量边界完成后，使用隔离临时语料启动真实本地 API，通过实际文件/版本接口验证服务端 404/版本冲突到 UI 的完整链路，不调用真实模型、不写 `.knowledge` 正式语料。真实模型报告是 AC-06 的独立验收项，可因凭据/服务不可用单列待验，不能阻塞 AC-07。
3. **AC-05b 分层 PDF 抽样（现存样本已核完，见 §13.21）**：原计划要求按主题目录 × PDF 扫描/可读质量 × 填表年份分层、至少 20 份并逐字段记录命中/误识别/误配/缺失/歧义率与区间。实施者已核对现存 35 份源 PDF；当前停在“有限证据/未通过”，原因是产品可接受阈值尚未定义且证据不能外推其他模板或未来扫描质量。不要重复扫描这 35 份；只有阈值/目标范围明确或新增不同模板/质量样本时再开启增量核验。
4. **停止与增量**：关键浏览器路径完成且 AC-05b 达到明确阈值或完成现存 36 份上限后，收集实际使用反馈，再决定是否扩写 task1–3 文案、task4 模板说明或增加参数控件。task2/task3 五年建议保持不筛选；不启动任务参数 schema、任意表格解析器或 OCR 全库重跑，除非验收发现对应触发条件。当前现存 35 份 PDF 已逐份核对，但产品阈值未定，因此 AC-05b 仍为有限证据/未通过，不继续无目标扩样。

### 13.17 只读语料布局核对与浏览器验收环境（2026-09-23）

- **AC-12 表格边界核对**：只读扫描 `.knowledge` 下 36 份现有 `parsed/**/markdown.md`。目标标签在表格行内命中 0 次，标签行/下一行分别承载标签和值的布局命中 0 次；真实语料当前显式字段为普通文本行。故当前 parser 范围限定为标签与值在同一普通文本行、或同一 Markdown 表格行，不实现跨行值传播；新增负向用例锁定跨行表格保持缺失。此抽样只覆盖本地现存解析产物，不声称支持任意外部 Markdown。
- **浏览器验收尝试（后续已更正）**：`node_repl/computer-use` 因工作区 `file:///home/...` WSL 路径不是控制器支持的本地 URI 而无法初始化；这不代表 WSL 没有 Chromium 或仓库 Playwright 不可用。相关更正与实际脚本结果见 §13.20。
- **本次验证**：新增跨行表格负向场景后，`.venv/bin/python -m pytest tests/test_reports.py tests/test_prompts.py -q` → **16 passed**（1 项 Starlette 弃用警告）；`git diff --check` 通过。未改动真实语料或数据库。
- **复核者环境确认（更正见 §13.20）**：本轮独立调用 `node_repl` 初始化在脚本执行前因 `sandboxCwd is not a local file URI` 失败；这只限制 computer-use 桌面控制入口。仓库 Python Playwright 与 Chromium 缓存仍可用，应使用 `tests/browser_*.py` 验收。

### 13.18 AC-05b 分层 PDF 抽样与解析误报修正（2026-09-23）

- **抽样方法**：只读选择 5 份现有基金报告首页，覆盖四个主题目录、四种资助类别、填表日期年份 2024/2025/2026；先用 `pypdf` 探测原 PDF 是否有文本层，35/35 首页均无可提取文本，再用本机 `pypdfium2` 栅格化后视觉核对类别与填表日期。未执行 OCR、未修改 PDF 或解析缓存。
- **观察结果**：5/5 样本的 PDF 首页资助类别与 Markdown 元数据一致，5/5 填表日期年份一致；这是小规模、跨目录/类别/年份样本，观察到的 0/10 字段不匹配不能外推为总体 OCR 准确率，也没有据此判 AC-05b 通过。
- **解析误报**：其中一份报告首页正确显示“联合基金项目”，正文后部另有“类别：报告/墙报/科普”。全篇别名扫描把后者误当基金类别，造成歧义并错误排除。`report_metadata` 现只扫描首个二级及以下章节标题前的报告头元数据；正文复用通用“类别”标签不再污染筛选。增加报告生成回归用例。
- **全库字段覆盖回读**：新解析边界下，只读扫描 36 份 Markdown 的标签可见计数为日期 36/36、类别 36/36、类别歧义 0；这只是字段覆盖统计，不能取代 PDF 视觉准确率。
- **验证**：AC-05b 回归修复后的 `.venv/bin/python -m pytest tests/test_reports.py tests/test_prompts.py -q` → **17 passed**（1 项 Starlette 弃用警告）；没有使用真实模型，也未运行全量测试。
- **剩余（由 §13.20 更新）**：AC-05b 仍需按扫描质量/版式扩样并统计未命中、误识别/误匹配，保持有限证据状态；浏览器由既有 Python Playwright 脚本验收，当前脚本需先更新。

### 13.19 verifier 对 AC-05b 更新的复核与接续（2026-09-23）

- **代码与测试抽查**：静态确认 `report_metadata` 在首个二级标题（含更深层级）前收集元数据；正文通用“类别”字段不再与报告头基金类别合并。`test_user_report_generation_ignores_generic_category_labels_in_body` 覆盖了该误报回归。实施者报告 17 项定向测试通过；本轮未重跑，不记为独立测试结果。
- **证据分级**：36/36 解析 Markdown 标签可见是新规则下的字段覆盖；5 份 PDF 首页共 10 个类别/填表年份字段吻合是有限视觉抽样；两者均不能量化全库 OCR 误识别率。AC-05b 继续“有限证据/未通过总体可信度验收”。
- **计划调整（由 §13.20 更新）**：PDF/Markdown 分层抽样可与浏览器验收并行；浏览器应更新并运行仓库 Playwright 脚本。`node_repl` 路径停止重试，但不阻塞脚本验收。
- **字段解析边界**：首个二级标题前的报告头仍是当前口径。只有实际语料或 PDF 对照发现元数据位于章节标题之后，才重新评估边界；不为假设场景扩展成全文搜索。

### 13.20 verifier V1–V5 处理与实施接续（2026-09-23）

- **V1 浏览器工具结论更正**：浏览器验收不是环境阻塞。当前主机有 Python Playwright 和 Chromium 缓存 `~/.cache/ms-playwright/chromium-1234`（`chromium-1243` 链接至其版本）；`node_repl/computer-use` 的 WSL URI 限制只影响该桌面控制入口。先前“WSL 未找到 Chromium/Chrome”的表述错误，已改为脚本兼容性待修。
- **旧脚本实测**：只读执行 `./.venv/bin/python tests/browser_tasks.py` 使用缓存 Chromium 成功启动、加载 `frontend/dist`；浏览器 console 未作为结果确认。随后脚本因发送按钮持续 disabled 而超时。日志显示其 `GET /api/documents?corpus=c1` 未被现有精确 mock route 捕获并落到静态服务器 404；旧脚本也未确认 `corpus_confirmed`、未发送 `corpus_ids`，其最终断言仍要求旧 `corpus_id`。因此该次是旧脚本失败，不是浏览器环境失败，也不是产品验收通过。其余 AC 浏览器脚本尚未在本轮运行。
- **脚本更新范围**：维护/更新既有 Playwright 脚本，不改业务代码范围。所有启动新会话的 fixture 应显式处理首次知识库确认与 readiness；多库请求断言 `corpus_ids`，文档路由匹配 query string（`/api/documents?corpus=...`）；按当前 U10 组件 accessible role/name 调整选择器。映射既有 `browser_tasks.py`、`browser_library.py`、`browser_fund_preview.py`、`browser_session_branches.py`；AC-01/04 上传队列和 AC-11/12 报告兼容/覆盖清单若无脚本覆盖，补最小离线 Playwright 用例。逐个运行所有受影响脚本，记录通过、失败和未覆盖 AC，不运行真实模型、不修改真实语料。
- **V2 parser 边界（本节后续由 §13.21 修订）**：真实 PDF 的 Markdown 在标题前可有图片和未标注页眉，且出现连续两个 H1 后才进入元数据；因此只接受“首条非空行是 H1”会误拒真实头部。实现允许元数据前连续 H1 组成标题块，标题块结束后遇到任意级别 heading 即停止；无章节边界时最多读取前 64 行。对 35 份基金 PDF 的后续实际对照见 §13.21。
- **V3 测试数字**：verifier 报告当前全量 `pytest tests -q` **126 passed**，这是当前全量基线报告；不是本规划维护者本轮运行。实施者本批 `17 passed` 是 `tests/test_reports.py tests/test_prompts.py` 定向结果；旧批的 16/17、Node 29、历史 120 均分别保留，不混称本批全量回归。后续每批记录“定向命令/结果 + 最近一次全量命令/结果/基线是否包含本批改动”。
- **V4 AC-05b 有限停止条件**：后续视觉抽样至少 20 份，覆盖所有非空“主题目录 × 扫描/可读质量 × 填表年份”分层，每层至少 1 份；非空层数超过 20 时总量相应增加。逐字段对照 PDF 与 Markdown，报告正确提取/覆盖率、误识别/误配率、缺失率、歧义率及 95% Wilson 区间。20 份后如区间仍跨产品验收阈值，仅在不确定层扩样，最多覆盖现存 36 份；到上限仍无法判定则结论保持“有限/未通过”，停止追加抽样并明确剩余不确定性。阈值依据首轮分层结果由产品/用户确定，不能从当前 5 份倒推。
- **V5 环境表述**：历史记录统一表述为“`node_repl/computer-use` 受 WSL 本地文件 URI 限制；Python Playwright + 缓存 Chromium 可用”。浏览器验收待做的直接原因是脚本 mock/会话/请求契约过时，不是 Chromium 缺失。`git diff --check` 本轮通过；浏览器任务尚无通过结果。

### 13.21 浏览器离线验收、报告头真实格式与基金 PDF 全量视觉核对（2026-09-23）

- **报告头解析修正**：真实基金 Markdown 的前部可先有页图、未标记页眉，再出现连续的 `# 国家自然科学基金` 与 `# 资助项目结题/成果报告`，之后才是资助类别和填表日期。解析器允许目标字段前的连续 H1 标题块；标题块后的任意 heading 截止；无章节 heading 时最多扫描前 64 行。后续正文通用“类别”不进入筛选。fixture 覆盖真实双 H1 头、H1 后单井号正文误报、无章节标题且第 65 行后正文别名不命中，以及既有 H2 正文冲突回归。
- **解析器验证**：`.venv/bin/python -m pytest tests/test_reports.py tests/test_prompts.py -q` → 17 passed；修改纳入本轮全量 `.venv/bin/python -m pytest tests -q` → **126 passed**（1 项 Starlette 弃用警告）。定向与全量结果各自记录。
- **AC-05b 原 PDF 核对**：逐份以 PDFium 原尺寸渲染并人工核对 `.knowledge/自然科学基金/source` 下全部 35 份源 PDF 首页的资助类别和填表日期年份。分层结果：人工智能与农业 2025 年 5 份、2026 年 1 份；人工智能与医疗 2025 年 7 份、2026 年 10 份；人工智能与机器人 2024 年 1 份、2025 年 5 份；人工智能与金融 2025 年 6 份。所有页面均为可读扫描图，未观察到需单列的低可读质量层，共 7 个非空“主题 × 可读质量 × 填表年份”层。PDF—Markdown 日期年份命中 35/35、类别命中 35/35；误识别/误配/缺失/歧义各 0/35。每字段 35/35 的 Wilson 95% 区间为 90.1%–100%。另有 `.knowledge/自然科学基金/parsed/_pilot/markdown.md` 无对应源 PDF，未纳入准确性分母。AC-05b 仍为**有限证据 / 总体验收未通过**：区间下界和可接受误差阈值尚无产品约定；35 份也只代表当前可用文件，不外推其他模板或未来扫描质量。
- **离线 Playwright 结果**：使用仓库既有 Python Playwright + 缓存 Chromium、当前 `frontend/dist` 和 mock API；未运行真实模型、未写真实语料。`tests/browser_tasks.py` 通过 task4 intake/报告生成、报告状态刷新恢复、复制/下载、旧报告空 `corpus_id` 回退、AC-12 覆盖与未命中清单；`tests/browser_library.py` 通过库浏览/切换、同名上传 409 提示、解析失败文件保留并重试单项；`tests/browser_session_branches.py` 通过编辑分支持久化/恢复；`tests/browser_fund_preview.py` 通过 filename 年份标签、同库 inline PDF、引用物理页 3、窄屏 Escape 关闭。所有四个脚本均退出 0。AC-01/04 仅覆盖单文件重复上传和失败项重试；四类批量拖入、逐项失败继续及发布前取消尚未覆盖。
- **AC-06/07 剩余项（截至 §13.21；AC-07 离线提示由 §13.22 补验）**：mock 浏览器闭环不代替真实模型报告；本机 `127.0.0.1:8000` 当前无服务，未做真实模型调用或服务端版本冲突/文件缺失的端到端链路。基金扫描、页面跳转、年份标签、窄屏/键盘退出已有离线 UI 证据；AC-07 客户端离线提示已由 §13.22 覆盖。
- **构建环境**：本轮 `npm run build` 调到 Windows `npm.cmd`，CMD 的 UNC 当前目录与 WSL 工程路径不能组合，未完成构建。本轮未改前端业务代码；浏览器脚本使用已存在的 `frontend/dist` 运行。不要将历史构建结果写成本轮构建验证。

### 13.22 AC-07 来源失效提示浏览器补验（2026-09-23）

- 扩展既有 `tests/browser_fund_preview.py`，在同一离线会话中模拟旧版本引用及引用文档已不在当前文档列表两种情况。浏览器分别看到“文档已更新，已停止打开”和“文档不在当前列表中，请刷新文献库后重试”，并确认失效引用不打开预览；有效引用仍打开所选基金库中的 PDF 第 3 页，窄屏 Escape 仍可关闭并回到问题输入框。
- `.venv/bin/python tests/browser_fund_preview.py` 实际通过，使用缓存 Chromium、当前 `frontend/dist` 与 mock API；未运行真实模型、未修改真实语料。此结果验证客户端可见提示和停止跳转行为，不验证服务端真实 404/版本冲突端到端链路。
- AC-07 的离线来源提示场景已覆盖；仍待真实 API 版本冲突/源文件缺失链路及真实模型报告。AC-01/04 仍缺四类文件批量处理、单项失败后继续和发布前取消验收。由于当前 API 未运行且无真实模型调用条件，本轮不把离线 mock 结果扩写为服务端/真实模型通过。

### 13.23 verifier 对 AC-07 离线验收的复核与接续（2026-09-23）

- **复核结论**：只读检查 `tests/browser_fund_preview.py`，其 mock 文档列表包含当前有效文档，旧 `version` 引用走失效提示分支，列表中不存在的 `doc_id` 走刷新提示分支；两种无效引用均未打开预览。有效引用的 iframe URL 带 `corpus=fund` 且 `#page=3`。因此本轮支持“AC-07 客户端离线提示/停止跳转已验收”，不支持“真实 API 失效链路已验收”。实施者报告脚本退出 0、`git diff --check` 通过；本规划维护者未重跑脚本。
- **状态更正**：§13.21 记载的“版本失效和缺失文件尚未覆盖”是当时状态，已由 §13.22 的新脚本结果替代。真实服务端返回版本冲突或 404、且界面正确拦截的链路仍待验；不要再把浏览器工具或 Chromium 描述为阻塞原因。
- **下一步顺序**：先完成 AC-01/04 批量上传验收（多文件拖入/选择、某项失败后其余继续、失败项状态及单项重试、发布前取消/失败时目标字节与索引不变）；再用临时隔离语料/API 验证 AC-07 真实文件缺失和版本不匹配。每条记录请求/响应、界面结果和是否打开预览。真实模型报告单列 AC-06，凭据不可用时保持待验，不与 AC-07 混报。AC-05b 已检查现存 35 份 PDF 的限度和产品阈值未定状态见 §13.21，不因本次变更重启抽样。
- **数据与范围保护**：真实 API 链路优先使用临时 `CORPORA_ROOT`/`STATE_DIR` 和可控 PDF，不删除或改写 `.knowledge` 下正式文件、索引和解析缓存；不发起模型调用。若只能连接正式语料服务，则只做只读缺失/版本模拟，不人为改动正式文件制造冲突。
- **检查记录**：本轮只读核对脚本与现有文档，没有改业务代码或测试脚本；本轮文档变更后执行 `git diff --check`。测试通过数字采用实施者本轮实际记录，不与旧的 126 全量基线或其他批次定向数字混用。

### 13.24 AC-01/04 批量上传与 AC-07 原文件预检续接（2026-09-23）

- **AC-01/04 上传 UI**：`CorpusFiles` 文件输入支持多选与拖放，按顺序逐项上传；单项失败会记入汇总并继续后续文件，上传成功后刷新源文件列表。离线浏览器选取 `.md`、`.pdf`、`.txt`、`.docx`、`.markdown`，其中同名冲突和非法 `.exe` 上传失败，其余四份显示并在整页刷新后仍可回读；另实测拖入 `.txt` 成功。原有解析失败项仍显示可重试，点击其行后状态更新为已入库。该场景验证多选/拖放交互与逐项错误处理，不证明五种格式都能被当前解析器成功解析。
- **AC-01 发布失败**：超上传上限 API 用例额外断言文档索引前后不变、源目录无目标文件或临时文件；既有同名用例仍核对原文件字节与文件列表不变。未模拟发布前用户取消。
- **AC-07 文件可用性**：`/api/documents/{id}/file` 的 GET 与新增 HEAD 共用同一文档版本、根目录、存在性、格式和大小校验；HEAD 只回状态和长度，不发送文件内容。PDF 预览先 HEAD 检查；404 显示“原文件已缺失或已移动”，422 显示“文档已更新”，失败时不创建 iframe。临时隔离 API 用例用测试根目录内 PDF 验证 HEAD：存在且版本匹配 200、版本不匹配 422、删除源文件后 404。离线浏览器 mock 分别模拟 404/422，核对提示与 iframe 缺席；既有路径继续验证正确库与物理页 3。API 与 UI 分层验证，不等同于连到真实运行服务的端到端测试。
- **检查结果**：Linux Node 26.8.1 直接执行 TypeScript `tsc --noEmit` 和 Vite production build 成功；Vite 有动态/静态导入与 chunk 大小警告。Windows `npm.cmd` 路径下 `npm run build` 仍因 WSL UNC 工作目录失败。`.venv/bin/python -m pytest tests/test_app.py -q` → 15 passed（1 项 Starlette 弃用警告）；`tests/browser_library.py`、`tests/browser_fund_preview.py` 均退出 0；`git diff --check` 通过。
- **尚未闭合**：AC-04 尚无真实多文件解析组合测试；拖放只实测一份 `.txt`，未覆盖四类文件的拖放组合。AC-01 发布前取消未验；AC-07 没有通过启动隔离服务把真实 HEAD 响应串到浏览器的整链路检查。AC-06 真实模型报告仍待服务/凭据。不得将现有隔离 TestClient + mock 浏览器结果写作真实模型或运行服务端到端通过。

## 15. 知识库管理交互修订（2026-09-23，已实施；部分验收仍待补）

### 15.1 目标、依据与范围

用户明确取消“设置默认知识库”，要求新对话自动依赖目录列表首库、对话中可改选最多 6 库；库名与 `.knowledge/` 子目录名一致，重命名同步；优化添加文档，并用刷新发现本地变化。此需求取代 KB-1 首次确认、alias 优先显示及基础库强制绑定的交互规划；历史迁移与验收结果保留，不据此声称新需求已实现。

截图可见：库卡片同时展示友好名与另一目录名，多个失效记录以 `missing` 出现；详情有 17 个源文件但仅 2 份已入库；添加文档藏在“源文件管理”折叠区，另设“导入”页且有“仅默认库可用”的说明。静态代码也仍以 alias 优先显示、默认库优先排序，且存在默认库专属操作和首次确认门槛。三张截图仅用作界面现状证据。

本批复用网格、详情抽屉、CorpusPicker、ScopeSelector、按库上传/增量导入接口。不增加标签体系、权限平台、跨库 dense、自动选库模型或后台常驻文件监听；不借本次改版扩写报告模板。

### 15.2 新对话首库与 1–6 库选择

- **“第一个”的确定规则**：服务端按实际一级子目录名升序返回（固定字符串排序规则，前后端共用返回顺序），不按历史默认库、alias 或就绪状态置顶。排除 `.state`、隐藏/内部目录及已缺失条目；合法的空库也列出。新对话在首次列表成功读取后选首个存在的库，直接显示“使用知识库：A · 1/6”，不弹确认、不要求“设为默认”。若首库为空/待入库，保持选择，提示添加文档/刷新；不能悄悄跳到后一个库。无库显示“新建知识库 / 刷新”。读取失败与真实空列表分别提示。
- **对话中调整**：点击范围摘要打开带搜索、复选框、库名、入库数量与状态的选择器，勾选立即生效并持久化，不另加“确认使用”步骤。至少 1 库、最多 6 个不同库；最后一项不可直接取消，但允许“仅使用此库”一键替换。第七库不可勾选并说明上限；已选项仍可移除。缺失库不可新增选择。空库允许选中供后续添加资料，但发送前提示其尚无可用文档，并提供取消选择/入库操作，不静默忽略。
- **取消基础库的用户门槛**：用户只管理一个“对话使用的知识库集合”。库详情可“加入当前对话 / 从当前对话移除”，另提供“仅使用此库”；浏览详情不改变集合。不要把点击名称、上传目标改变或刷新当成整组重置。添加库保留已有文件限定，并提示当前仍限定这些文件；移除库只移除该库的限定项。若移除后限定项归零，保持待重新选择状态，用户明确选择“全部文档”后才扩大范围，不能自动扩大检索。
- **会话兼容**：有效旧 `corpus_ids` 原样恢复；只有旧 `corpus_id` 时恢复为单元素集合；完全无绑定的新/旧空会话才选首库。`corpus_confirmed` 兼容读取但不再阻止发送，不要求全量重写历史会话。恢复出未知/缺失/超过 6 项等异常范围时展示原范围与修复入口，不静默裁剪、替换或发送。用户主动切换影响后续轮次，历史回答与来源不改写。
- **统一请求**：应用端新问答统一显式发送 `corpus_ids`（单库也用数组），沿用服务端旧 `corpus_id` 兼容入口；普通发送、编辑重问、重生成、task4 intake 复用选择校验。生成期间锁住该会话范围。内部若暂留 `corpus_id`，仅作旧数据兼容或上传建议值，不能强制成为不可取消项。
- **不设置持久默认库**：移除默认库徽标、首次确认卡、设置入口和 `DEFAULT_CORPUS` 对新会话首选顺序的影响。服务端旧请求省略范围时也按同一首库规则解析；无库/首库未就绪给明确错误，不隐式换库。梳理 health、启动缓存、旧导入入口和删除限制，不仅隐藏徽标。旧配置暂可读取但须标为弃用，不能继续决定新会话范围。
- **报告边界**：task4 正文仍只支持用户明确选择一个报告库；对话多库不等于多库报告。原报告确认流程保留，不能因取消默认库确认而同时删除报告范围确认。

### 15.3 目录即名称、重命名与失效恢复

- API `name` 与界面库名统一为 `.knowledge/<子目录名>`；路径单独提供“本地目录”及复制按钮，不再用 alias 替代名称。已有 alias/name override 不再参与显示和排序，保留旧迁移记录供追溯，不把友好 alias 反向用于批量改目录。优先只改变名称派生规则，无需为停用 alias 新建迁移框架。
- 应用内重命名继续复用现有 PATCH：目录、登记路径、origin、缓存与界面一并更新，稳定 corpus_id/doc_id 保留，旧会话/来源继续可读。库名已相同视为无操作；重名/非法名明确提示；导入/上传处理中暂不可改名。目录改动后登记写回或索引更新失败时须完整回滚或明确呈现可恢复状态，不能把半成功报为完成。
- 刷新后名称一律重新从目录读取。**外部直接移动/改名目录不等于可自动识别其旧 id**：发现旧路径缺失和新目录时，不凭名称相似度猜测合并。缺失项集中放“需要处理”，显示“目录缺失 · 原路径”，提供刷新、重新关联目录、移除失效记录。
- “重新关联目录”仅在用户明确选择根目录内现存且未归属于其他有效库的目录后执行；校验路径与占用，保留旧 id，复用路径/来源更新逻辑，并原子更新登记。冲突时保持两条记录并解释。移除失效记录只移除登记，不删文件，引用它的旧会话仍提示来源不可用。首次关联实施前先核对现有 stable-id 与来源更新 helper，复用而非复制。
- 不因首库身份禁止管理操作；取消 `is_default` 专属删除门槛后，仍遵守忙碌状态与删除确认。界面把“清理索引（保留文件）”和“删除知识库及文件”分开命名，防止清索引后刷新重新发现被误认为删除失败。删除被当前会话使用的库后保留失效提示，不自动换库。

### 15.4 添加文档与详情布局

- 知识库总览顶部：新建知识库、刷新、名称搜索；卡片主标题只显示目录名，展示“已入库 X / 源文件 Y”和“待处理 N / 失败 M”。状态用中文：空库、待入库、处理中、部分失败、就绪、目录缺失；有部分文档可用时同时显示待处理数，不用单一“就绪”掩盖未入库文件。
- 详情首屏提供“添加文档”“刷新”“加入当前对话”，更多菜单放重命名/清理索引/删除。合并源文件和已入库文档为一个文档列表，以状态筛选查看“全部 / 待处理 / 已入库 / 失败”；每行保留完整文件名可查看、状态、预览和对应重试动作。原“导入”独立页收敛为刷新与处理状态，移除默认库专属的无关说明。
- 添加文档为明显拖拽区与“选择文件”，支持 PDF、DOCX、MD/Markdown、TXT 多选；显示单文件限制和目标库。详情入口固定该库；对话单库入口预选该库，多库入口让用户选**一个**目标（记住当前打开面板的选择即可，不成为全局默认），不能复制上传到所有检索库。选择目标后立即可添加，不再要求另一层入库确认。
- 文档保存后自动增量入库；复用现有 files 上传接口，按序处理，不为每个文件新建任务系统。入队时捕获目标 id，切页面/改会话集合不改归属；处理队列状态提升到可跨详情切换保留的位置。支持停止尚未提交项；已提交项继续如实显示处理状态，不声称关闭抽屉取消服务端任务。
- 每项显示“等待 / 上传并处理 / 已入库 / 已保存，解析失败 / 上传失败”；只能获取阶段时不显示虚构百分比。失败后继续其他项，同名拒绝且原文件不变；上传失败可重新选择文件，已保存的解析失败从原路径重试，不重复上传。批次结束汇总并刷新所有相关数量和列表。
- 刷新页面后从服务端回读已保存文件状态；浏览器内尚未提交的 File 对象不保证恢复，提示重新选择剩余文件。没有服务端逐文件重试能力时不得把全库重试按钮标成“仅重试此项”；优先补最小按路径重试或如实标注范围。
- 本地添加说明提供可复制的 `.knowledge/<库名>/source/` 路径：“也可将文件放入此目录，点击刷新自动读取”。浏览器不能直接打开主机目录时只提供复制路径，不设计无效的打开按钮。

### 15.5 刷新：发现、对齐、增量入库和回读

- **总览刷新**：先重新扫描一级子目录、对齐名称、发现新库并标记缺失；再对各有效库的 `source/` 递归发现支持文件，按现有清单增量导入新增/修改文件。**详情刷新**同样处理，但范围只限当前库。一次点击完成发现与入库，无需再找第二个“导入”按钮。首页首次进入可读取目录与文件状态，但不每次渲染都自动发起解析。
- 复用 GET corpora、GET files/documents 和现有按库 ingest（force=false）；GET 列表不承担长耗时解析，由明确刷新动作串联扫描与导入。优先前端编排/既有 job，后端只补当前接口无法返回的差异计数或覆盖边界。不需要新建全局调度平台。
- 无变化跳过；多库顺序执行，当前已有导入时附着现有进度，重复刷新不创建相同库任务。一库失败不阻断其他库，反馈“发现 N 库，新增 X，更新 Y，缺失 Z，失败 M”，进度按实际可获得计数显示。完成后同时回读库卡、文档列表、源文件状态和对话范围中的名称；已有会话集合不重置。
- 文件删除只在该库目录和 source/ 成功完整枚举后才同步移除派生检索记录，保留旧引用可解释失效；目录不可读、暂时缺失或扫描出错不能按空目录清除索引。刷新不删除原文件、不覆盖同名文件、不强制重解析所有 PDF。
- 合法一级空目录也在总览显示“空库”；没有 source/ 时提供明确添加入口，添加/用户执行初始化时才创建标准目录。普通 GET 不擅自建空库。若用户直接把文档放在库根目录而非 source/，展示“发现未放入资料目录的文件”与正确路径，不静默漏掉，也不自动移动或重复导入；首期仍统一 source/ 为文档来源。内部 datadb/vectordb/parsed/.state 不作为资料递归导入，越过根目录的符号链接不扫描。
- 刷新开始/结束/部分失败有反馈和最近刷新时间；断网保留原列表并显示“刷新失败”，不可把临时失败渲染成所有库消失。恢复只重做未完成工作，不重跑已成功且未变的解析。

### 15.6 实施顺序、兼容与验收

实施顺序为 **KM-1 首库/命名/范围契约**、**KM-2 刷新与本地发现**、**KM-3 添加文档与详情收敛**、**KM-4 外部改名恢复和删除文案**。四包代码均已落地；复用 §13.24 已有上传保护、HEAD 预检和浏览器证据。任务模式参数/报告模板扩写暂后置。

| 验收 | 必须观察到的结果 |
|---|---|
| KM-AC1 首库免确认 | 倒序配置默认库/alias 不影响目录排序；新会话直接选首库且无确认卡。首库空时保持空库提示，无库/读取失败分别反馈。有效旧会话不因新增或改名导致首库排序变化而换库。 |
| KM-AC2 名称一致 | 名称=目录名；旧 alias 不覆盖。应用重命名后刷新、旧会话、文件预览和重导入均正常，id 不变不重复；登记写回失败不留下表面成功。 |
| KM-AC3 多库操作 | 1→6 可选，第 7 个被拒；可直接替换唯一选项；增库不丢文件限定、减库不把空白名单变成全库；刷新/会话切换恢复；所有发送入口显式传实际集合，历史引用不变。 |
| KM-AC4 刷新本地变化 | 临时目录外部新增库及四类文档→点击刷新→出现状态并增量入库；重复刷新无重复数据/解析；外部删文件后旧来源失效；扫描失败不清索引；空目录与错放库根文件有明确提示。 |
| KM-AC5 添加体验 | 多选/拖拽混合有效、同名、非法、解析失败项，逐项继续；目标库不随导航变化；无需手动二次入库；页面刷新回读状态；停止待提交项不假报已提交取消。截图中“17 源文件/2 已入库”须明确显示剩余 15 项的实际状态。 |
| KM-AC6 失效恢复 | 外部目录改名不误合并 id；用户重新关联后旧会话可用；目标已归属其他库时拒绝；失效登记移除不删文件。清索引/删除文案与刷新后结果一致，首库没有特权限制。 |

### 实施结果与证据（2026-09-23）

- **KM-1 首库/命名/范围**：首库由实际一级目录名升序决定，`DEFAULT_CORPUS` 与 alias 不再改变选择；API/界面名称取目录名。新会话自动绑定首库，1–6 集合显式随请求发送，已有有效会话范围在刷新时保留。定向后端与前端用例覆盖默认解析、别名、旧记录恢复、单/多库数组、超限范围保留待修复；离线浏览器验证新界面无默认标记、同库加入、1→6 勾选、第 7 个禁用和请求集合。
- **KM-2 刷新/本地发现**：GET 文件清单保持只读；显式刷新扫描目录与 `source/`，增量导入变化、跳过未变项并回读状态。目录枚举/权限失败不会当作空目录清除索引，符号链接不越界扫描。临时目录 API 用例覆盖外部新增/删除及重复刷新；另以隔离 Uvicorn 服务 + Playwright 实测“新建库→服务外写入 Markdown→点击刷新→真实入库→浏览器预览读到正文”。
- **KM-3 添加/详情**：文件列表合并源文件和索引状态；支持多选、拖放、逐项续传、同名拒绝和真实 API 上传后自动导入。失败提示如实标出整库待处理项重试。离线浏览器覆盖多格式文件名批次、非法/冲突项、续传与刷新后服务端回读；真服务联调只解析 Markdown。未用真实解析器验证 PDF/DOCX 批次或批次停止边界。尚未提交的浏览器 `File` 队列是组件内存状态，刷新/关闭后需重新选取。
- **KM-4 外部改名恢复/删除**：外部改名不会按相似名称自动合并；缺失记录可显式关联未占用目录并保留旧库 id，冲突会拒绝；应用改名失败路径有回滚。清理索引（保留源文件）与连源文件删除分开确认，首库不再有专属限制。临时 API 用例覆盖 ID/文档来源保留、冲突、重命名回滚；失效记录移除只删登记。
- **检查**：`.venv/bin/python -m pytest tests/test_corpora.py tests/test_corpora_state.py tests/test_incremental_import.py tests/test_app.py -q` → **44 passed**；`frontend` 的 Node 单测 → **29 passed**；TypeScript `tsc --noEmit` 与 Vite production build 通过（保留既有动态/静态导入及 bundle 大小警告）；`tests/browser_library.py` 通过；隔离服务 + 浏览器联调通过。
- **未覆盖/后续边界**：尚未用真实解析器验证 PDF/DOCX 的小样本组合、刷新/改名后每种历史会话恢复组合；未运行真实模型报告。未重跑正式语料 OCR。浏览器内未提交的 `File` 不跨页面刷新持久化。现有实现和检查在当前未提交工作树中，尚未提交。

### 15.7 管理者审核与下一步收口（2026-09-23）

**审核结论：主干实现基本符合 §15，但当前状态是“已实现、待收口”，尚不能标整批验收通过。** 本轮只读审查实现和测试，并独立运行受影响检查；没有修改业务代码或测试脚本。

**已确认成立**

- 首库解析已忽略 `DEFAULT_CORPUS`，按现存一级目录 `rel_path` 固定升序取首个非 missing 库；API 顺序与之相同。`is_default` 只作内部兼容标记，当前界面不显示默认徽标。目录名作为 API `name`，alias 只保留迁移元数据。
- 新会话无绑定时自动保存首库；应用端新请求用 `corpus_ids`，选择器支持 1–6、最后一库不可取消、第七库禁用及“仅使用此库”。移除库会过滤该库的限定文档；过滤后为空数组时发送被阻止，不会静默扩大成全部文档。
- 总览与本库刷新、外部目录发现、错放根目录文件提示、多文件逐项上传、停止未提交项、同名保护、解析失败重试、显式重新关联、清索引与连源删除均已有实现和定向测试。独立运行 `tests/browser_library.py` 通过，确认当前构建中的 1→6、多库请求、混合格式文件名批次、失败继续和刷新回读可见行为。
- 独立运行前端 Node 用例为 **29 passed**；`npm --prefix frontend run build` 通过，保留既有动态/静态导入和 500 kB chunk 警告；`git diff --check` 通过。

**发现与影响**

1. **P0：全量后端回归未通过。** `.venv/bin/python -m pytest tests -q` 实际为 **133 passed、1 failed**。失败的 `test_api_attaches_client_run_id_to_steps` 在没有任何知识库时直接调用 chat；新契约会先返回无库错误，因而没有 step。它更像旧测试夹具未适配，而不是 step 实现回归，但在修正夹具并全量变绿前，不能引用 44 项定向结果宣称整体无回归。
2. **P0：任务和分支浏览器脚本仍绑定已取消交互。** `tests/browser_tasks.py` 与 `tests/browser_session_branches.py` 都实际超时，仍在点击“使用此库并确认”；前者还断言单 `corpus_id`。task4 intake/报告恢复、编辑分支重问等路径尚未在新首库/`corpus_ids` 契约下重新验收。§13.21 的旧 PASS 只适用于当时界面。
3. **P1：截图中的总览信息差只修到了详情页。** `CorpusFiles` 已显示“已入库 / 源文件 / 待处理 / 失败”，但 `CorpusInfo` 和知识库卡仍只有 `docs_count`，卡片继续显示“X 份文档”。用户在总览仍看不出“17 个源文件、2 份已入库、15 个待处理”的真实状态，也无法从卡片区分“完全就绪”和“部分可用”。
4. **P1：添加文档入口仍不够连贯。** 详情中已有拖放/多选，但新建提示和空态仍写“在详情『导入』或『源文件』加入资料”，这两个旧页签已经收敛；对话区只提示“可添加文档或刷新”，没有可操作按钮。上传目标可通过点库名切换，但从对话到目标库添加资料仍需用户自己寻找文献库详情。
5. **P1：刷新总览的长任务反馈仍需边界验收。** `refreshAllCorpora` 顺序轮询每库，单库最多约 75 秒；多库失败会计数并继续，但尚无多库慢任务/部分失败浏览器证据。当前全局 busy 会一直占用刷新入口，需证明用户能看见当前库、已完成数及失败库，而不是长时间只有“正在刷新”。先补可观察性，不引入新调度平台。
6. **P2：历史名称仍散落在非主路径。** `IngestTools` 仍有“扫描默认库本地目录”，部分旧浏览器 fixture 名为“默认库”，`src/agent/corpora.py` 顶部说明仍写旧 DEFAULT_CORPUS 语义。未被当前页面使用的代码不阻断功能，但应在本批收尾清理或明确废弃，避免下轮维护者误用。
7. **提交边界不清。** 当前工作树约 45 个已修改文件，包含报告/任务/预览等前序改动，另有未跟踪 `tools/get_nf_pdfs.py`。知识库批次提交前应先确认该下载工具是否属于用户明确范围；没有归属证据时不混入本批。不得为整理工作树丢弃他人未提交修改。

**下一步实施顺序**

1. **KM-S1 契约回归收口（先做）**：给 `test_steps` 建最小临时首库或显式 `corpus_ids`，保持该测试只验证 run_id/step；更新 `browser_tasks.py`、`browser_session_branches.py`，移除首次确认动作，单库也断言 `corpus_ids:[id]`。覆盖普通发送、task4 intake、编辑分支重问、重新生成、刷新恢复；旧 `corpus_id` 只留专门兼容用例。退出证据为全量 pytest、29 项 Node、生产构建及这两个脚本全部通过。
2. **KM-S2 补总览状态（解决截图核心问题）**：为 corpora 列表提供轻量 `source_count/indexed_count/pending_count/failed_count`（字段名可按现有模型调整），从 files manifest 与只读源目录统计，不在 GET 中触发解析或创建目录。卡片显示“已入库 X / 源文件 Y”，有差异时显示“待处理 N / 失败 M”；状态优先级为目录缺失、处理中、失败/部分失败、待处理、就绪、空库。详情和卡片使用同一计数语义，并补 API/组件测试。
3. **KM-S3 打通添加资料入口与文案**：新建成功后提供“添加文档”主动作并打开该库详情；空库卡片和对话中的空库提示提供“添加文档”“刷新本库”。多库对话点击添加时先显示单一上传目标，不能复制到全部库。删除“导入/源文件”旧页签措辞，把文件选择控件包装成明确按钮/拖拽区；仍复用当前上传接口和组件。
4. **KM-S4 刷新可观察性**：总览显示“正在处理 A（i/n）”，完成后列出失败库与原因，并允许关闭页面后从服务端 job 回读；已有运行任务只附着，不重复创建。以 3 个临时库覆盖无变化、成功新增和解析失败，断言一库失败不阻断后续库，重复刷新不重复入库。保持顺序处理和现有锁，只有实际延迟证据再考虑并行。
5. **KM-S5 小样本真实格式与恢复验收**：临时库各放一份真实 TXT、Markdown、DOCX 和最小可解析 PDF，执行添加/刷新/预览/重启回读；只对 PDF 走现有 MinerU，不触碰正式语料。补应用重命名、外部改名后重新关联、旧单库会话、旧多库会话各一条浏览器或 API 链路。真实模型报告继续作为 AC-06 独立项。
6. **提交与停止条件**：以上检查全绿后，按知识库管理批次整理提交，记录准确命令和数字；不顺手提交未归属工具，不扩展到标签、权限、自动选库或跨库 dense。卡片能直接解释截图中的源文件/入库差异、所有发送入口使用新范围、全量回归通过，即停止本轮知识库交互扩展。

### 15.8 收口实施结果（2026-09-23）

在 §15.7 审核结论与 KM-S1–S5 顺序下，本轮在既有未提交知识库批次之上完成 KM-S1–KM-S4，并修复 §13 遗留的过时离线脚本。**工作树未提交、未推送**；真实模型、真实 PDF/DOCX 解析组合与 AC-05b 阈值仍待验。

- **KM-S1 契约回归收口**：`tests/test_steps.py` 的 chat 用例先在临时 `CORPORA_ROOT` 建一个含 1 篇已入库文档的首库，使新 scope 前置校验通过，同时保持只验证 run_id/step。`tests/browser_tasks.py`、`tests/browser_session_branches.py` 移除“使用此库并确认”，改为等待首库自动选择；请求体断言改为 `corpus_ids == ["c1"]` 且无 `corpus_id`；分支脚本新增“重新生成使用新 run_id 且沿用集合”，任务脚本新增 task4 intake 请求体断言。
- **KM-S2 总览状态**：`GET /api/corpora` 新增只读 `source_count/indexed_count/pending_count/failed_count`（读源目录 + files 清单，不在 GET 触发解析/建库，并在 `asyncio.to_thread` 中执行）；`CorpusGrid` 卡片显示“已入库 X / 源文件 Y”与“待处理 N / 失败 M”，状态优先级为目录缺失→导入中→部分失败→导入失败→待入库→就绪/空库。同一计数语义由详情与卡片共用。
- **KM-S3 添加资料入口与文案**：新建库后直接打开该库详情并 toast；对话空库提示提供“添加文档/刷新本库”可操作按钮；`CorpusFiles` 文件选择包成“选择文件”按钮 + 拖放区（隐藏原生 input，保留 `aria-label`）；删除过时“导入/源文件”文案；移除未挂载且语义过时的 `IngestTools.tsx`/`OfficialDocs.tsx`。
- **KM-S4 刷新可观察性**：`refreshAllCorpora` 顺序处理并在状态栏显示“正在处理 <库>（i/n）”，收集失败库名与原因，附着已在运行的 job 而不重复创建；保留顺序处理与现有锁。
- **离线脚本适配**：`browser_answer_controls`/`browser_document_preview`/`browser_markdown_preview`/`browser_fund_preview` 补齐首库/`corpus_ids`/`/api/corpora/{id}/files` mock 与文档行“预览”入口；新增 `tests/browser_refresh.py`（3+1 临时库：无变化、解析失败、成功、已在运行；断言继续执行、失败列表、附着运行 job）。

**本轮实际运行证据**（Linux，当前工作树）：

- `.venv/bin/python -m pytest tests -q` → **135 passed**（1 Starlette 弃用警告）。
- `npm --prefix frontend test`（`node --test src/`）→ **29 passed**；`npm --prefix frontend run build`（tsc + vite）通过，保留既有 dynamic-import/chunk-size 警告。
- 11 个离线 Playwright 脚本全部退出 0：`browser_ui_shell`、`browser_status_power`、`browser_answer_controls`、`browser_document_preview`、`browser_session_branches`、`browser_tasks`、`browser_library`、`browser_refresh`、`browser_markdown_preview`、`browser_export`、`browser_fund_preview`。
- `git diff --check` 通过。`ruff check src tests` 有 7 项**既有**告警（`main.py` B008/PLC0206、`prompts` UP033、`corpora.py`/`test_corpora_state.py`/`test_incremental_import.py`），非本批引入；本批新增/修改文件无告警。

**未完成（保持待验，不声明通过）**：

- KM-S5：真实/最小可解析 PDF 与 DOCX 的小样本“添加→刷新→预览→重启回读”，以及应用改名、外部改名后重新关联、旧单库/多库会话链路，尚未在隔离临时库执行。
- AC-06 真实模型报告、AC-05b OCR 可信度阈值、AC-01 发布前取消、AC-04 四类拖放组合未变。
- 提交：本批仍在未提交工作树；按 §15.7「提交边界不清」需先确认 `tools/get_nf_pdfs.py` 归属再整理提交，本轮未提交、未推送。

## 16. 知识研究工作台产品规划（2026-09-23，需求已采纳；待分期实施）

本节把用户提出的知识管理、任务模板、成果管理、右侧预览、ChatBot 会话以及 Prompt/Skill 产品化要求，整理为下一阶段唯一实施规划。它描述**目标产品**，不把拟议能力写成现状；§15 的知识库收口和既有验收事实继续有效。

### 16.1 产品定位与核心闭环

产品从“基金报告问答界面”扩展为本地优先的**知识管理与研究推理工作台**：用户整理本地资料或明确允许的网络资料，选择任务与输出要求，智能体执行可追溯的检索、阅读、分析和生成，最后把有价值的回答沉淀为可继续修改、复用和导出的成果。

```mermaid
flowchart LR
    accTitle: 知识研究工作台核心闭环
    accDescr: 本地知识库和受控网络资料进入任务执行，任务调用提示词或技能形成带证据的回答与成果，成果可继续修订并反哺下一次工作

    local_docs[本地资料] --> knowledge[知识库]
    web_docs[受控网络资料] --> knowledge
    task[任务模板] --> run[研究执行]
    skill[Prompt 与 Skill] --> run
    knowledge --> run
    run --> answer[带引用回答]
    run --> artifact[成果]
    answer --> artifact
    artifact --> reuse[修订与复用]
    reuse --> task

    classDef source fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a5f
    classDef engine fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#3b0764
    classDef output fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d

    class local_docs,web_docs,knowledge source
    class task,skill,run engine
    class answer,artifact,reuse output
```

五个一级入口固定为：**对话、知识库、任务、成果、Prompt / Skill**。右侧区域不是第六个业务入口，而是跨五个入口共享的“检查器”：负责预览资料、模板、引用、执行信息和成果，避免每个模块再造一种抽屉。

### 16.2 当前实现盘点

以下是制定规划时的只读基线；后续实施结果与检查见 §16.12。

| 能力面 | 当前可用事实 | 主要缺口 | 当前成熟度 |
|---|---|---|---|
| 知识库 | 本地目录扫描；新建、应用内改名、清索引、连源删除；目录缺失重关联；多文件上传、刷新增量入库、失败重试、文件预览；会话可选 1–6 库 | 无知识库说明字段；卡片快捷动作和活动信息仍有限；真实 PDF/DOCX 小样本闭环仍待 KM-S5 | 主链路可用，待真实格式收口 |
| 对话与会话 | 本地会话保存、重命名、归档、分支、编辑重问、重新生成；任务/知识库/资料范围随会话保存；答案引用、执行阶段、首 token、耗时和 token 用量可见；回答可导出 Markdown/Word | 会话筛选维度、置顶/分组不足；固定单模型，不能提供真实模型切换；网络资料未接入输入区 | 已有成熟骨架 |
| 任务模板 | 服务端固定注册 task1–task4；卡片显示用途、示例和输出提示；任务绑定会话；task4 走独立报告生成 | 无自定义任务 CRUD、版本、参数 schema、可编辑默认值、详情预览和输出模板选择 | 内置模板可用，管理能力缺失 |
| 报告/成果 | task4 报告后端、会话内报告卡、列表、Markdown 预览/复制/下载、幂等生成已存在 | 中央“报告”页、任务卡与右侧概览仍有“接口未实现”的过期占位；报告不可编辑/版本化；没有统一成果实体、草稿和跨会话成果库；报告仅 `.md` | 后端链路已存在，产品入口断裂 |
| 右侧区域 | 已有产出面板的概览/引用/原文列表，也有 PDF/正文预览和知识库详情抽屉 | 多套浮层并存；没有统一预览栈、返回路径、固定/关闭规则；模板和成果不能在同一检查器预览 | 局部可用，交互需统一 |
| 网络资料 | 后端已有网页预览/确认和官方文档导入基础接口 | 前端无资源入口、搜索策略、确认快照、来源状态和会话范围；当前不等于“可自行全网研究” | 仅有底层原语 |
| Prompt / Skill | Prompt 以仓库 Markdown 文件随代码发布，报告模板位于 `src/templates/` | 无产品入口、用户自定义、版本、参数、测试或启停；Skill 数据模型和运行契约不存在 | 未产品化 |

一个需要立即纠正的可见矛盾是：`ReportsView`、task4 卡片提示和 `Inspector` 概览仍宣称报告接口未实现，而会话内已经能生成和读取报告。第一阶段应先让界面如实反映已有能力，再扩展成果系统。

### 16.3 全局信息架构与窗口规则

**图标栏**始终显示五个一级入口，底部保留设置与服务状态。**展开侧栏**显示当前入口的二级内容：对话显示会话历史，知识库显示库列表，任务显示模板分类，成果显示筛选与最近成果，Prompt / Skill 显示分类与启用状态。侧栏收起后，一级入口、当前异常和新建对话仍可达。

**中央工作区**只承担当前主任务：对话时间线、知识库总览/详情、任务列表/编辑器、成果列表/编辑器或 Prompt / Skill 列表。不得把完整编辑表单塞入窄侧栏。

**右侧检查器**统一承接以下对象：资料原文、引用片段、知识库摘要、任务详情、输出模板、执行摘要、成果预览。交互规则如下：

- 点击可预览对象即打开或替换当前预览；检查器内部保留短返回栈，最多保留本次页面上下文，不建立永久浏览历史。
- 标题栏固定显示对象类型、名称、返回、固定和关闭。固定后中央区切换不自动替换；未固定时跟随当前选择。
- 桌面端默认约 400–520 px，可调整宽度并保存；窄屏改为全屏层。`Esc` 只关闭最上层预览，不清空中央页状态。
- PDF/长成果允许“一键放大”；重型文件查看器可继续使用专用全屏层，但入口和返回仍由检查器管理。
- 同一时刻只有一个主检查器。知识库详情、文档预览、报告预览不再各自叠加多个相互遮挡的 Drawer。

### 16.4 知识库产品契约

沿用 §15 已采纳的约束：没有全局默认知识库；新对话自动选实际目录名升序的首个可用库，用户可在对话中改为 1–6 库；上传目标始终是一个明确库；库名等于 `.knowledge/<目录名>`，应用内改名同步目录并保留稳定 id。

**总览卡片**至少显示名称、用户说明、源文件/已入库/待处理/失败计数、最近刷新时间和当前对话是否选中。主动作按上下文为“打开”或“与此库对话”；次动作提供“添加资料”“刷新”。重命名、清索引、删除及失效重关联进入更多菜单，危险动作继续明确区分“保留源文件”和“连文件删除”。

**知识库说明**是用户可编辑元数据，与目录名分离；目录名仍是名称唯一来源。首期只增加简短说明，不引入标签体系、权限或库内分区。说明缺失时显示空态，不从文件内容自动杜撰。

**详情页**围绕一个合并资料列表组织，不再区分用户难以理解的“源文件页”和“入库页”。每项显示文件名、类型、大小、版本/更新时间、处理状态和可执行动作。支持搜索与“全部 / 待处理 / 已入库 / 失败”筛选；选中资料在右侧检查器预览。添加区固定目标库，支持拖放/多选，逐项反馈并允许重试。

**刷新**继续承担保底能力：重新扫描一级目录、对齐目录名和显示名、发现有效库及 `source/` 新增/修改/删除文件、增量入库并回读状态。刷新不得猜测外部目录改名关系、不得覆盖同名文件、不得因临时枚举失败清空索引。总览刷新显示正在处理的库和失败清单；详情刷新仅处理当前库。

**与此库对话**新建会话并把该库设为唯一检索库；它不改变其他已有会话。多库选择器继续显示 1–6 上限和单库上传目标，限定资料按已选库聚合。

### 16.5 任务模板与输出模板

任务模板回答“为什么做、用什么资料、如何做、交付什么”；输出模板只回答“成果如何组织和呈现”。二者必须分离，允许一个任务选择多个输出模板，也允许多个任务复用同一输出模板。

每个任务模板的最小数据契约：

| 分组 | 字段与行为 |
|---|---|
| 身份 | 名称、简述、分类、图标、内置/自定义、启用状态、版本 |
| 背景与目标 | 任务背景、适用场景、明确目标、非目标 |
| 输入 | 用户需要填写的参数、必填性、类型、候选值、默认值及默认值来源说明 |
| 资料策略 | 需要几个知识库、是否允许限定文档、是否允许指定 URL/网络搜索、证据与引用要求 |
| 执行要求 | 可观察的阶段、澄清条件、停止条件、允许调用的 Skill；不保存或展示模型私有思维链 |
| 产出 | 成果类型、可选输出模板、默认格式、章节要求、质量检查与导出格式 |
| 示例 | 一条输入示例和一份短产出预览，用于用户选择而非作为运行事实 |

**默认值规则**：所有会影响范围或结论的默认值都要在开始执行前可见、可改，并随本次运行快照保存。没有模板声明时采用安全默认：当前会话知识库、全部已入库资料、仅本地知识、中文、标准篇幅、Markdown、必须引用。固定单模型阶段只显示当前模型，不提供无效下拉框。

- task1 不默认限制年份。
- task2/task3 的“近 5 年”只能作为可点选建议，当前不得静默过滤；启用后必须回显年份口径与入选/排除数。
- task4 可沿用“最近 5 个完整自然年的填表日期年份”作为可见默认，用户可改；缺失日期排除和计数规则继续有效。
- 单库且存在可靠领域元数据时可提出领域建议；多库不得拿第一库领域充当默认。无法可靠推断的必填项在执行前澄清。
- 网络访问默认关闭。用户可选择“仅指定网址”或“允许搜索”，并看到域名、时间范围和保存快照策略。

**首批输出模板维持现有四类** Markdown 报告（需求来源：用户当前 demand 的四类；实现见 `src/templates/`，W4 仅做自定义/编辑）。六类产品模板（文本研究报告、图文编排报告、数据分析报告、对比分析报告、知识库分析报告、知识汇总报告）为**后续扩展、非首批**，需真实使用证据触发，不得写成已支持。所有报告共享最小骨架：标题与范围、执行摘要、方法与资料边界、主要发现、证据/图表、结论与建议、局限、来源附录、生成信息。各模板只声明差异章节，不能复制出六套互相漂移的生成逻辑。

图文模板首期允许引用已有图片、图注和明确占位；没有图像来源或生成能力时不得伪造图片。数据分析模板只对可读取的结构化数据执行可复算分析，不能把语言模型估算包装成统计结果。

**任务入口交互**：卡片显示用途、输入要求、默认资料策略和产出预览；点击卡片先在右侧预览详情，主动作“使用此任务”再创建会话。内置模板只读但可复制为自定义模板；自定义模板支持草稿、启用、复制、重命名和归档。首版编辑器按“基本信息 → 输入与默认 → 资料与工具 → 产出”四段完成，不做可视化工作流画布。

### 16.6 成果作为一等对象

**最小运行快照是成果的前置条件。** 当前 `ChatRequest` 只有 `task_id`、知识库/文档范围和 `run_id`，不足以满足成果追溯。W3 必须先实施 W3-A `RunSnapshot`，再实施 W3-B `Artifact`；不能先创建无法追溯的成果，等 W4/W5 再补关系。

最小 `RunSnapshot` 由服务端持久化并以 `run_id` 唯一关联，至少包含：契约版本、`run_id`、可选 `parent_run_id`、`session_key`、运行类型（chat/report）、开始/结束时间与状态、`task_id`、可空的任务版本、用户可见参数及其默认来源、请求与服务端实际采用的 `corpus_ids`/`allowed_doc_ids`、资源策略（首版固定 `local_only`）、模型标识、输出意图，以及完成后回填的引用版本、usage/telemetry 完整性。服务端解析后的有效范围是权威值，不能只原样保存客户端声明。

W3-A 同步扩展请求契约：`ChatRequest` 增加可选 `session_key` 和版本化 `run_context`（当前可见参数、参数来源、资源策略、输出意图）；`ReportRequest` 增加 `parent_run_id`。旧客户端省略时按 `local_only` 和“来源未记录”兼容，不能伪造用户确认。相同 `run_id` 只允许同一请求指纹重试；冲突请求返回 409，避免一个快照代表两次不同执行。

**W3-A 有效范围回传**：`POST /api/chat` 在 `policy`（或新增 run 事件）中返回服务端**实际采用**的 `corpus_ids`/`allowed_doc_ids`/`model`，前端据此显示“实际范围”，使“服务端解析值权威”在 UI 可见，而非只保存客户端声明。快照写入**异步、不阻断 SSE**；写失败时回答仍正常完成，但标记“运行未记录”，且不得因此生成“可追溯成果”。

普通发送、编辑重问、重新生成、分支重问、task4 intake 和报告生成都必须创建或关联快照。重新生成/重问使用新 `run_id`。task4 intake 保留 chat run；报告生成必须使用独立 `report_run_id` 并以 `parent_run_id` 指向 intake run，首次请求失败后的安全重试复用该 report run id，用户主动“重新生成报告”才创建新 id。现有报告中复用 intake run id 的记录按 legacy 读取，不强行改写。创建快照失败时不得生成“可追溯成果”；旧会话/旧报告没有快照时显示“运行信息未记录”，不伪造补齐。

W4 在这一最小结构上增加不可变任务版本、完整参数 schema 和默认值来源；W5 只负责让所有交互入口展示、编辑并使用同一快照契约，不再承担快照首次落地。W6 增加网络策略与网页快照引用，字段按契约版本向后兼容。

“报告”只是成果的一种形式。新增统一成果实体 `Artifact`，首期类型为回答快照、Markdown 报告和 DOCX 文档；后续才加入图文简报、数据分析包等。成果至少记录：标题、类型、状态、当前版本、创建/更新时间、来源会话与运行、任务及其版本、知识库集合、引用快照、导出格式和失败原因。

生命周期为：`草稿 → 生成中 → 待审阅 → 已完成 → 已归档`，失败是带可重试原因的状态。用户可以把优质回答“保存为成果”；task4 成功生成后自动创建成果。未完成成果保留已生成内容和下一动作，不把中断结果标为完成。

成果中央页支持按状态、类型、任务、知识库和时间筛选；卡片主动作是预览，次动作包括继续完善、创建新版本、复制、导出和归档。编辑先支持 Markdown 分段编辑与“基于批注生成新版本”，不直接覆盖历史完成版本。每次重新生成创建新版本并保留原引用快照，避免来源变化后看不出报告依据。

现有 `reports` 表和 API 先作为 `Artifact(type=report)` 的兼容来源：第一阶段中央成果页直接读取现有报告；建立 Artifact 存储后再做可回滚迁移。历史报告缺少库、任务或 run 信息时显示“未记录”，不得推断当前会话值。

DOCX 是优先导出目标：回答目前的 Word 导出是 Word 可打开的 HTML `.doc`，并非 OOXML `.docx`。W3 需新增真实 DOCX 生成与回读验收，再统一到成果导出服务；报告先保证 Markdown 内容与 DOCX 章节、表格、引用一致。PDF 和复杂排版在 DOCX 稳定后再评估。

### 16.7 对话、会话和输入区

会话继续是产品核心工作面。会话历史保留新建、重命名、归档、分支、编辑重问和重新生成，并增加按标题、任务、知识库和时间筛选以及置顶；文件夹/标签在真实会话量证明需要前不实施。

输入区采用一行可读配置摘要：**模型、任务、知识库（1–6）、资料范围、网络资料策略、输出形式**。点击任一项打开就地选择器；发送前只阻止缺失的必填项，并给出直接修复动作。添加资料时必须选择一个目标库，不把上传复制到全部检索库。

模型选择只有在后端提供可用模型列表、健康状态和请求级 model 字段后才开放。此前显示当前固定模型及状态，不能只做前端假选择。

答案卡继续显示正文、引用和当前已有的复制、Markdown/Word 导出、重新生成、编辑重问。新增成果动作“保存为成果/打开成果”。“推理步骤”统一命名为**执行过程**：展示检索、阅读、筛选、工具调用、生成、校验等可审计阶段和耗时，不展示、存储或编造模型私有思维链。首 token、总耗时、输入/输出/总 token 和统计完整性继续如实展示；供应商未返回的值显示“未提供”。

引用必须保留 `corpus_id + doc_id + version + page/位置`。打开引用先做版本和文件可用性检查，再进入右侧原文预览。网络引用同时显示 URL、抓取时间和快照状态。

### 16.8 Prompt 与 Skill 产品化

Prompt 和 Skill 共用一个一级入口、使用两类卡片，但数据语义不能混为一体：

- **Prompt** 是可复用的指令片段或完整提示词，包含名称、用途、正文、变量、示例、版本和启用状态。
- **Skill** 是可被任务调用的能力包，至少包含用途、输入参数、执行规则、所用 Prompt、允许的工具/资料策略、输出契约、版本和测试样例。Skill 可以只有 Prompt，但不能假定所有 Skill 都只是 Prompt。

首版支持浏览内置项、搜索、预览、复制为自定义、编辑草稿、启用/停用和查看被哪些任务引用。内置项随版本发布，用户不能原地覆盖；自定义项保存在应用状态目录，运行时按版本快照。删除已被任务/成果引用的版本改为归档。

Skill 首版不执行任意本地代码、不安装第三方插件、不开放工具市场。只允许从后端注册的安全工具集合中选择，任务保存前校验变量、输入/输出和工具是否存在。测试台用固定样例展示渲染后的 Prompt、拟调用阶段和结构校验，不调用真实模型时不得显示为“效果通过”。

### 16.9 网络资料与可追溯研究

将网络能力建模为另一类资料来源，而不是在模型内部隐式联网。运行范围提供三档：仅知识库、知识库 + 指定网址、知识库 + 允许搜索。后两档保存查询、选中结果、抓取时间、正文快照/哈希和最终引用；网页变化或抓取失败可解释。

现有 `/api/web/preview` 与 `/api/web/confirm/{preview_id}` **不能直接接到目标界面**：preview 会在服务端选择首库，全局只保留最近一次预览；confirm 只能写入该库，也没有持久网页快照或运行级引用回读。W6 首包因此是后端资源契约扩展，而不是前端接线。

W6-A 至少增加以下行为：预览请求不预选知识库；多个 preview id 相互隔离并有明确过期时间；确认时由用户选择一个 `target_corpus_id`，或生成不入库的持久 `web_snapshot_id` 供本次运行绑定；快照保存规范 URL、标题、抓取时间、正文/内容哈希、解析状态和版本；`RunSnapshot` 保存实际采用的 `web_snapshot_ids`。知识库目标沿用该库文档索引，运行目标不得暗中写入首库。

网页来源回读扩展现有 Source 契约，至少能区分本地文档和网页快照，并返回 URL、`snapshot_id`、抓取时间和版本。历史/过期 preview 不能引用；已经确认的持久快照不因后来预览被覆盖。浏览器验收必须同时覆盖两个预览并存、选择非首库、仅绑定运行、重启后快照回读、网页变化和抓取失败。

W6-B 才增加搜索提供方、域名白名单、时间过滤、结果勾选和预算。默认不自动搜索全网；任务模板可以建议开启，但必须让用户看见。

### 16.10 分期实施与退出条件

每一阶段形成可独立使用的竖切，不同时铺开五套新后端。未经本阶段退出证据，不把后续占位写成“已支持”。

| 阶段 | 实施范围 | 退出证据 |
|---|---|---|
| W0 当前基线封口 | 完成 KM-S5；整理当前未提交工作树归属并提交；修正中央报告页、task4 卡片和 Inspector 的“接口未实现”错误文案。报告范围严格限定为**当前会话**，继续调用 `GET /api/reports?session_key=<active>`；不做跨会话列表或 Artifact | §15 既有检查继续通过；真实 TXT/MD/DOCX/PDF 临时库链路有记录；当前会话报告能预览/复制/下载，空态真实，切会话不串报告，其他入口不再显示过期占位 |
| W1 产品外壳与检查器 | 五入口导航；入口文案由“报告”改“成果”，但此阶段中央区仍明确标为“本会话成果”；右侧统一检查器状态/返回/固定/关闭；现有知识库、任务、当前会话报告和引用接入，不新增业务 schema | 桌面/窄屏浏览器覆盖五入口、侧栏收展、对象预览切换、Esc/返回、中央状态不丢失；不再叠加冲突抽屉；不得把当前会话列表宣传成全局成果库 |
| W2 知识库体验补全 | 知识库说明；卡片“打开/对话/添加/刷新”；合并资料筛选；从对话直达单库上传目标 | 新建→添加→自动处理→预览→与此库对话；外部新增→刷新发现；目录改名/失效提示；1–6 范围不受上传动作污染 |
| W3 运行快照与成果最小闭环 | **W3-A 先落最小 RunSnapshot**并覆盖全部发送/报告入口；`policy`/run 事件回传服务端实际采用的 `corpus_ids`/`allowed_doc_ids`/`model`，快照异步写、不阻断 SSE（失败标“运行未记录”）；task4 报告使用独立 child run；**W3-B 再建 Artifact**、兼容读取现有 reports、开放跨会话报告查询和全局成果列表、回答保存为成果、Markdown 版本与 DOCX 导出 | 各发送路径持久化服务端有效范围，且实际范围在 UI 可见；快照写入失败不阻断回答、不生成可追溯成果；请求重试不重复 run、冲突 run id 被拒；报告 run 可回到 intake parent；回答和 task4 成果都能回到 run；省略 `session_key` 才列全局报告，显式空串与省略语义有测试；草稿/中断/完成状态正确；新版本不覆盖旧版本；历史无快照/空字段安全显示；重启可恢复 |
| W4 任务与输出模板 | 自定义任务草稿/启用/复制/归档；参数与可见默认；输出模板预览；在已有 RunSnapshot 上增加不可变任务版本、参数值与默认来源 | 从内置任务复制→修改背景/输入/默认/产出→启用→运行→成果可追溯到固定任务版本；旧会话仍按旧 task id 恢复；W3 旧快照按契约版本安全回读 |
| W5 对话工作台完善 | 配置摘要、会话筛选/置顶、执行过程与成果动作统一；所有入口复用 W3/W4 快照契约；后端能力就绪后再加模型选择 | 普通发送、编辑重问、重新生成、分支、task4 和保存成果使用一致快照；缺项可就地修复；指标未知不伪造；不在此阶段补建另一套运行记录 |
| W6 网络资料 | **W6-A 先扩展后端**：目标库/运行绑定、多预览隔离、持久快照、Source 与 RunSnapshot 回读；再接 URL 界面。**W6-B** 才做受控搜索与结果选择 | 两个预览不互相覆盖；可选非首库或仅本次运行；重启后快照和引用可回读；运行记录 URL/抓取时间/版本；搜索关闭时不隐式联网，网络失败不污染本地知识结论 |
| W7 Prompt / Skill | 内置只读、自定义副本、版本/变量/引用关系、受控工具声明与静态测试台 | 自定义 Skill 能被一个任务引用并按版本恢复；非法变量/工具阻止启用；不允许任意代码执行 |

**W3 前置的真实数据（V4）**：RunSnapshot 的 usage/telemetry 完整性字段目前只有人工/可视化证据（AC-05b 的 35/35 首页字段核对为有限证据、总体未通过），尚无真实模型报告样本。**有凭据时**在 W3 前安排一次真实模型报告抽样，用于验证 usage/telemetry 回填；**无凭据则继续单列待验，不阻塞 W3-A 的 schema 落地**。

**本阶段非目标**：多用户权限、团队协作、多 Agent 编排、可视化流程画布、任意插件市场、自动订阅/全网抓取、知识图谱、复杂 PDF 排版、未经后端支持的多模型路由、原始思维链展示。需求出现真实使用证据后再立项。

### 16.11 统一验收契约

1. **对象可追溯**：W3 起先持久化最小 RunSnapshot；一次运行能回读当时可用的任务标识/版本、知识库集合、限定资料、资源策略、模型标识、时间与指标，后续版本再增加网络快照；成果只能引用已持久化运行和引用版本。历史缺项明确显示未记录。
2. **默认值可见**：时间、领域、资料范围、网络策略、输出格式等影响结论的默认值在执行前可见，并随运行保存；不得静默使用第一库领域或隐藏时间过滤。
3. **状态真实**：草稿、处理中、部分失败、中断、待审阅、完成分开；未知 token、OCR 可信度、网络快照或历史字段不推断补齐。
4. **交互连续**：卡片→详情/预览→使用/编辑→运行→成果→继续修改有明确返回路径；关闭检查器或切换一级入口不意外丢失草稿。
5. **本地安全**：名称与目录对齐，上传单库明确，同名不覆盖，刷新失败不清索引，删除分层确认，旧会话与历史报告向后兼容。
6. **证据优先**：研究结论必须引用本地版本或网络快照；执行过程只展示可观察事件，不冒充私有推理；无材料时明确说明资料不足。
7. **阶段停止**：每阶段的浏览器主链、持久化兼容和受影响自动检查通过后即停止；不顺手实现后续阶段占位或扩大为管理平台。
8. **可复现提交**：新增源码/测试文件必须入库；阶段检查通过后按主题分批提交，**未提交不得进入下一阶段**，避免工作树膨胀导致证据不可复现（已连续两轮因此受影响）。

### 16.12 W0–W2 实施进展（2026-09-23，未完成整阶段）

- **W0 报告入口已修复**：中央页按当前 `workspace.active` 调用会话报告列表，支持逐项预览、复制和 Markdown 下载；无报告显示真实空态。修复 `fetchReport` 对同一响应重复读取 JSON 导致的实际预览失败。离线浏览器覆盖切换到新会话后不显示旧报告。task4 卡片及右侧概览不再声称接口未实现。报告页仍仅显示当前会话，不宣称跨会话成果库。
- **KM-S5 隔离真实格式样本**：临时库用各一份真实 TXT、Markdown、DOCX 和由 ReportLab 生成的单页 PDF，经 `POST /api/corpora/{id}/files` 逐份上传，四项均返回 201、无导入错误；`GET /api/documents` 回读 4 项，每项 Markdown 预览非空，PDF 原文件 HEAD 200。应用内改名保留库 id；外部目录改名后记录显示 missing，显式重新关联恢复同一 id；重启应用后 4 个 doc id 一致。使用本机 MinerU CLI；没有访问正式 `.knowledge`。这是 API 链路证据，尚未覆盖真实服务浏览器操作。
- **W0 旧会话兼容已补验**：离线浏览器以旧单库和多库记录恢复、切换、重载并发送，回读和请求中的 `corpus_ids` 均与各自会话一致；缺字段的历史报告仍按当前会话显示“未记录”。
- **W1 检查器已接主对象**：五入口仍如实区分当前会话报告和未产品化的 Prompt/Skill。知识库、任务、当前会话报告、引用及非 PDF 文档从右侧检查器预览；PDF 保留专用大视图并可返回。检查器有返回、固定、关闭、Esc、宽度保存与窄屏全屏呈现。旧详情/设置层打开时收起检查器，避免遮挡；切换入口保留输入草稿。输出模板与执行摘要尚未有独立检查器对象，W1 不标整阶段完成。
- **W2 卡片快捷操作首包**：知识库卡片新增“与此库对话”“添加资料”“刷新”。对话动作新建绑定该库的单库会话，不改写已有会话；添加动作打开明确目标库的资料区且不改变检索范围。知识库说明元数据、资料搜索与其余 W2 验收链路尚未实施。
- **实际检查**：`npm --prefix frontend run build` 通过（保留原有分包警告）；`npm --prefix frontend test` 为 30 passed；`tests/browser_tasks.py`、`browser_library.py`、`browser_refresh.py`、`browser_document_preview.py`、`browser_markdown_preview.py`、`browser_fund_preview.py`、`browser_answer_controls.py`、`browser_ui_shell.py`、`browser_legacy_scope.py` 退出 0；`git diff --check` 通过。未重跑后端全量测试，因为本批未修改后端代码。
- **未决接续**：当前工作树在本批前已有大量未提交业务/测试/文档改动，`tools/get_nf_pdfs.py`、`tools/split_knowledge_corpora.py` 已定为用户个人脚本（`tools/README.md`、DECISIONS「tools/ 个人脚本归属」）；其余是已有未提交工作树，归属仍需按主题分批确认。为避免把他人改动混入提交，本轮未提交。W0 的提交封口与 W1 剩余对象待做；W2 下一步为用户说明和资料搜索。

### 16.13 W1/W2 续接实施（2026-09-23）

承接 §16.12 的剩余项，本轮补齐 W1 的输出模板/执行摘要检查器对象与 W2 的知识库说明/资料搜索。**工作树仍未提交、未推送**；W3（RunSnapshot/Artifact）未开始。`tools/` 两脚本已定为用户个人脚本（`tools/README.md`、DECISIONS「tools/ 个人脚本归属」）；W0 提交封口仍待按主题分批执行。

- **W1 输出模板预览（只读，不新增业务 schema）**：新增 `GET /api/templates`（`id`+`name`）与 `GET /api/templates/{id}`（附 `content`，未知 404）；模板名集中在 `src/prompts`，章节仍以 `src/templates/*.md` 为唯一权威。检查器新增 `template` 目标；任务预览列出该任务的 `templates` 并可点击进入只读 Markdown 预览，经统一返回栈回到任务。
- **W1 执行摘要预览**：检查器新增 `execution` 目标，读取最近一轮回答的可观察信息：运行 ID/状态/总耗时/首 token、各阶段与耗时、`telemetry` 的路径/命中片段/选中报告/上下文 token、`usage` 的输入/输出/总 token 与调用次数；未知值显示“未记录/未提供”，不推断补齐。概览页提供“查看执行摘要”入口。
- **W1 宽度与窄屏**：检查器宽度滑杆的值写入 `localStorage` 并在重载后恢复；窄屏（≤`sm`）为全宽浮层。`aside` 增加 `aria-label="检查器"` 便于定位与无障碍。
- **W2 知识库说明**：`CorpusInfo.description`（用户可编辑元数据，与目录名分离）按稳定 id 持久化到 `corpora.json`；新增 `PUT /api/corpora/{id}/description`（去空白、≤1000 字、空串清除；未知 404、目录缺失 409、导入中 409）。说明显示在知识库卡片与检查器知识库摘要；详情页可就地编辑并保存。
- **W2 资料搜索**：详情页合并资料列表新增按文件名搜索输入，与“全部/待处理/已入库/失败”筛选叠加；无匹配时显示真实空态。

**本轮实际运行证据**（Linux，当前工作树）：

- `.venv/bin/python -m pytest tests -q` → **139 passed**（1 Starlette 弃用警告）；新增/修改 `tests/test_prompts.py`、`tests/test_corpora_state.py` 覆盖模板目录与说明接口。
- `npm --prefix frontend test`（`node --test src/`）→ **30 passed**；`npm --prefix frontend run build`（tsc + vite）通过，保留既有分包警告。
- 12 个离线 Playwright 脚本全部退出 0：`browser_ui_shell`、`browser_status_power`、`browser_answer_controls`、`browser_document_preview`、`browser_session_branches`、`browser_tasks`、`browser_library`、`browser_refresh`、`browser_markdown_preview`、`browser_export`、`browser_fund_preview`、`browser_legacy_scope`。其中 `browser_tasks` 覆盖执行摘要、任务→输出模板预览、返回栈、固定、宽度保存与窄屏全宽；`browser_library` 覆盖说明编辑与资料搜索。
- `git diff --check` 通过。本批新增/修改文件无新增 `ruff` 告警；仓库其余既有告警（`main.py` B008/PLC0206、`prompts` UP033、`corpora.py` TRY004、`test_corpora_state.py` PLR0402 等）非本批引入。

**未完成（保持待验，不声明通过）**：W0 的工作树归属整理与提交封口；W2 其余验收链路（外部新增→刷新发现、目录改名/失效提示）虽在 §15 已有实现与定向测试，但未在 W2 阶段重新走查；W3 运行快照与成果、W4 任务/输出模板编辑、W5 对话工作台、W6 网络资料、W7 Prompt/Skill 均未开始；真实模型报告与 PDF/OCR 可信度仍为独立待验项。

### 16.14 W3-A 最小运行快照（2026-09-23）

依据 §16.6「成果的前置条件」先落地服务端最小 `RunSnapshot`，为后续 Artifact/任务版本/网络快照提供可追溯运行。**工作树仍未提交、未推送**；W3-B（Artifact、跨会话报告与全局成果、回答保存为成果、版本与 DOCX）未开始。

- **存储与对象**：新增 `src/runs.py` 的 `RunStore`（`STATE_DIR/runs.sqlite3`），按 `run_id` 记录：契约版本、`session_key`、`parent_run_id`、`run_type`（chat/report）、`status`、`task_id`、`model`、`resource_policy`、请求/服务端有效 `corpus_ids`、`allowed_doc_ids`、用户可见 `params`/`param_sources`/`output_intent`，以及完成后的 `ended_at`、`metrics`（usage+telemetry）与 `citations`（`doc_id`/`corpus_id`/`version`/`title`/`page`）。服务端解析后的有效范围是权威值。
- **请求契约（向后兼容）**：`ChatRequest` 增可选 `session_key` 与 `run_context`；`ReportRequest` 增 `parent_run_id`。旧客户端省略时按 `local_only`/“未记录”处理，不伪造用户确认。
- **幂等与冲突（A1）**：`run_id` 绑定请求指纹；不同指纹复用同一 `run_id` 返回 409。chat 的相同指纹请求**不重跑覆盖**：`created=False` 时运行中或已终态均返回 409，要求换新 `run_id`（重放已完成回答属 W3-B Artifact）。报告端点先做指纹校验，再按“已保存→200 `idempotent` / 生成中→409 / 失败→安全重试”分支。此点**取代** #10 M3 的“参数不同也幂等返回 200”，见 DECISIONS「W3-A 最小运行快照」。
- **报告父子关系**：报告为独立 child run，`parent_run_id` 指向 task4 intake 的 chat run；前端首次/安全重试用 `${intakeRunId}-report`，主动“重新生成报告”用新 UUID，父 run 始终为 intake run。
- **接线**：chat 在流式开始前创建快照（scope 校验之后），流结束/失败/超时/中断在 `finally` 回填状态与指标；报告在生成前创建快照，失败标 `failed`、成功标 `completed`。新增 `GET /api/runs/{run_id}`（无记录 404，供历史“运行信息未记录”回退）。前端 chat 发送 `session_key` 与最小 `run_context`，报告发送 `parent_run_id`。

**本轮实际运行证据**（Linux，当前工作树）：

- `.venv/bin/python -m pytest tests -q` → **149 passed**（1 Starlette 弃用警告）；`tests/test_runs.py` 10 例覆盖 chat 有效范围快照、终态不重跑 409、运行中并发 409、失败/超时/取消回填、快照写入失败不阻断回答、`requested ≠ effective`、citations 含 `corpus_id`/`title`、指纹冲突 409、报告父子 run、未知 run 404。
- `npm --prefix frontend test`（`node --test src/`）→ **31 passed**；`npm --prefix frontend run build`（tsc + vite）通过，保留既有分包警告。
- 12 个离线 Playwright 脚本全部退出 0；`browser_tasks` 覆盖 chat `session_key`、报告 `parent_run_id`/独立 report run 与执行摘要中的“服务端实际范围”，`browser_session_branches` 覆盖 chat `session_key`。
- `git diff --check` 通过；新增 `src/runs.py`、`tests/test_runs.py` 无 `ruff` 告警，其余为既有告警。

**未完成 / 下一步**：W3-B 建 `Artifact`、兼容读取现有 `reports`、开放跨会话报告查询与全局成果列表、回答保存为成果、Markdown 版本与真实 DOCX 导出；报告引用的版本回填仍以 `metrics.report_id` 为最小记录，未按引用逐条落库。W0 提交封口、W4–W7、真实模型/OCR 仍待验。

**W3-A 收口修订计划（verifier A1–A7，2026-09-23）**。A1/A2/A3/A5/A6 已实施并复验（见下）；A7 保留为不阻塞的运维项。

- **A1（高，先做）重试/并发语义**：`main.py` 调用 `runs.create` 时丢弃 `created` 标志，同 `run_id`+同指纹重试会重跑并在 `finally` 覆盖首轮 `status/metrics/citations`；首轮运行中重复请求会并发写同一快照。目标语义：`created=True` 才执行；`created=False` 且 `status=="running"` → 409；已终态 → 409 并要求换新 `run_id`，不静默重跑（已完成回答的重放属 W3-B Artifact）。报告端点：`created=False` 且生成中 → 409，已保存报告仍幂等 200，失败可安全重试。**已实施**：chat `created=False` 一律 409；报告先做指纹校验，再按“已保存→200 / 生成中→409 / 失败→安全重试”分支；非指纹冲突的快照写入失败只记日志、不阻断回答/报告生成（读取回退为“未记录”）；`tests/test_runs.py` 中“同指纹重试 → 200”的旧断言已改为终态 409。
- **A2（中）有效范围回传**：流开始处新增确定性 `run` 事件，携带 `effective_corpus_ids`/`model`/`resource_policy`/`session_key`；前端 `receiveEvent` 记录 `runInfo`，检查器执行摘要显示“服务端实际范围”。**已实施**。
- **A3（中）citations 补 `corpus_id`**（含 `title`）：chat `finally` 回填的 citations 现含 `doc_id`/`corpus_id`/`version`/`title`/`page`。**已实施**并纳入测试。
- **A5（低）前端 `${intakeRunId}-report` 边界**：派生 report run id 截断到 `${intakeRunId.slice(0, 72)}-report`，避免接近 80 上限 422。**已实施**。
- **A6（低）补测**：失败/超时/取消 status 回填、`requested ≠ effective`、同指纹终态行为、citations 含 `corpus_id` 均已覆盖（`tests/test_runs.py`）；取消用例触发与断连相同的 `CancelledError` 回填分支。
- **A7（低，不阻塞）**：`runs.sqlite3` 保留/归档策略，留待 W3-B 或运维。

**W3-A 剩余项与进入 W3-B 的门禁（verifier B1–B4，2026-09-23）**：

- **B1（高，唯一持续阻塞）提交封口**：**已完成（`665c3ff`）**。工作树按用户确认以“一次提交整个可运行工作树”方式提交：64 文件（含 `src/runs.py`、`tests/test_runs.py`、`tests/browser_refresh.py`、`tests/browser_legacy_scope.py`、`.vscode/settings.json`、`requirements-cpu.txt`），并在提交信息中说明同时携带未单独提交的 W0–W2/L6/KM 改动（共享文件、无法拆成可导入的 W3-A-only 提交）。提交后 `git status` 干净；门禁解除，W3-B 可开始。
- **B2（低）`fetchRun` 未使用**：**已实施**——检查器执行摘要打开时回读 `GET /api/runs/{id}`，快照存在则用其权威字段，404 显示“运行信息未记录（历史运行或快照写入失败）”；`browser_tasks` 断言快照模型 `offline-snapshot` 覆盖 run 事件值。
- **B3（低）中断路径无自动化用例**：**已实施**——`test_cancelled_run_backfills_interrupted_status` 覆盖取消分支回填 `interrupted`（TestClient 不稳定投递断连，故用同分支的 `CancelledError` 触发）。
- **B4（低）重试语义需 UI 对齐**：**已确认无需额外代码**——run 冲突 409 的字符串 detail 由 `store.send` 原样显示；恢复依赖新一次发送，`regenerateTurn` 总是生成新 `run_id`；已在 `store.tsx` 注明该语义。

**W3-B 缩范围（建议）**：先用"reports 兼容读取 + RunSnapshot 回读"打通"来源运行→成果"；Artifact 首版仅含 `type(answer_snapshot/report)`、`run_id` 关联、version、export；"逐条引用落库"列为可选项、非前置；并顺带收口 B2/B3/B4；A7（`runs` 保留/归档）作为 W3-B 运维项。
