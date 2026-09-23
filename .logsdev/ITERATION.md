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
| **UI 迁移（对齐参考模板）** | 引入模板设计令牌（暖中性 + `#5645d4`）；新增 `store.tsx`（`AppProvider`/`useApp`，承接原 `main.tsx` 全部 state/effects/handlers）、`App.tsx`（仅布局）与 `components/`（24 个展示组件）；删除遗留 `Answer`/`SessionList`/`TaskPicker`/`Notes`/`appContext`；`documentPreview.ts`→`documentText.ts`。接入真实 `corpus_id`/`allowed_doc_ids`/SSE/引用校验/分支。逻辑修正：重新生成重新合并库/任务范围、task4 禁发、任务开关关闭空态、侧栏导入用 `effectiveCorpusId`；文档预览面板改为 `clamp(36rem,66vw,76rem)` 自适应且内容区 flex-col 使 PDF 填满。详见 [`DECISIONS.md`](DECISIONS.md) | `npm run build`（tsc+vite）通过；`npm test` 18 passed；**浏览器验收 PASS**：`browser_ui_shell`/`browser_status_power`/`browser_answer_controls`/`browser_document_preview`/`browser_session_branches`（Playwright + dist）；Vite SSR 全树与 `MessageView` 渲染通过。`browser_ui_shell` 的会话标题断言改为限定侧栏（新顶栏也显示标题）；fund/smoke 在线用例需后端，未运行 |
| **审查意见处理（P1/P2 + task 接线，2026-09-22）** | 默认开启任务（`VITE_UI_TASKS` 默认 on，可 `=0` 关）；`/api/tasks` 增 `output_hint`；侧栏任务搜索；任意回答可重新生成（`regenerateAt`，修复替换语义）；每步耗时（后端 `graph.step()` 发 `duration_ms` + 前端展示）；非 PDF 预览下载/新窗口；Composer 弹层统一外部点击/Esc；Inspector 标签改「概览」；删除无引用图标与 `filters/reports/news/models` flag；**后端接线**：`Knowledge.search`/`graph.search_impl` 传 `task_id`（任务差异化检索预算不再失效）；`base.md`/task1–3 提示词补引用纪律与输出细节。详见 [`DECISIONS.md`](DECISIONS.md) §7 | `.venv/bin/python -m pytest tests -q` → **115 passed**（新增 `tests/test_prompts.py` 3 例、`test_knowledge` 1 例、强化 `test_steps` 时长断言）；`npm run build` + `npm test` 18 passed；浏览器 6 用例 PASS（含新增 `tests/browser_tasks.py`）。未做：P1-4 复制/导出改 Markdown（与既有断言冲突）、E 阶段报告模板 |
| **知识库 IA 重构（对齐模板 3 层，2026-09-22）** | 文献库主区改为 `CorpusGrid` 知识库卡片网格（数据源 `corpora`）；新增 `CorpusDetail` 抽屉（文档/源文件/导入，含重命名/删除/按库导入/用于当前对话）；抽出 `Drawer` 壳；删 `LibraryView`/`CorpusAdmin`/`SettingsDrawer`；`OpsDrawer` 精简为模型/在线文档源/导出；`openPreview` 带 `corpusId` 修复非活动库文档 `/file` 取错库；文档预览面板自适应；设置按钮文案改「设置」。浏览（`openCorpus`）与切库（`selectCorpus`）分离。冲突/取舍见 [`DECISIONS.md`](DECISIONS.md) §8 | `npm run build` + `npm test` 18 passed；浏览器 **7 用例 PASS**（新增 `tests/browser_library.py`：网格/详情/跨库浏览不改活动库/按库 `/file`/设置抽屉无 KB CRUD/chat `corpus_id`）。`browser_fund_preview` 在线未运行 |
| **Markdown 预览渲染修复（2026-09-22）** | 预览改走 `GET /api/documents/{id}/markdown`（`Knowledge.read_markdown`，不过 300 字符硬切/行窗）；`parse_file` 对 `.md/.markdown` 设 `parser="markdown"`；前端扩展名兜底 + 窗口拼接修正（页内 `\n`/跨页 `\n\n`）；`openTextInNewTab` 用 `renderToStaticMarkup(<Markdown+GFM>)` 渲染新窗口；表格改 wrapper 横向滚动。详见 [`../dev_logs/ui-migration.md`](../dev_logs/ui-migration.md) §7 | `pytest tests -q` → 本改动相关用例 **48 passed**（`test_app`/`test_markdown_parser`/`test_knowledge`/`test_steps`/`test_retrieval`）；全量当时 118 passed，**随后并行 L6 `graph.py` 重构**使 `test_graph`/`test_usage` 3 例失败（`create_deep_agent` 已移除，测试未同步，非本轮改动）；`npm run build` + `npm test` 18 passed；真实 demo 语料 `read_markdown("470e…")` → 3 个表格、最长行 485；浏览器 **8 用例 PASS**（新增 `tests/browser_markdown_preview.py`：`.md` 识别/3 `<table>`/新窗口渲染） |
| **“前端打不开”排查（2026-09-22）** | 复现矩阵全部正常（构建版/真实后端/dev server/全 API 失败/localStorage），定位为**构建产物被清理或浏览器缓存的旧 `index.html` 指向已删除的 hash 资源**。修复：`launch.sh` 改为在 `frontend/dist/index.html` 缺失时也重建；`GET /{asset_path}` 对 `index.html` 发 `Cache-Control: no-cache, must-revalidate`，hash 资源发 `public, max-age=31536000, immutable`。前端代码无需改动 | `bash -n launch.sh` 通过；`curl -D` 确认 index no-cache / asset immutable；`pytest tests/test_app.py` 9 passed；dist 引用的 hash 资源均存在 |
| **导出/在线文档源归位（2026-09-22）** | A. `OfficialDocs` 从 `OpsDrawer` 移入默认库 `CorpusDetail`「导入」tab（非默认库不显示）；B. 会话导出从 `OpsDrawer` 移到 `ChatView` 顶栏「导出」菜单（导出会话为 Markdown / 导出诊断 JSON），新增 `sessionExport.ts`；C. 每条回答操作条新增「导出 MD / 导出 Word」（`turnExport.ts`；Word 为 Word 兼容 HTML `.doc`，非 OOXML）。**取舍**：按本轮要求移除上一轮 Markdown 修复引入的 `react-dom/server`，改用 `createRoot + flushSync`（`markdownToHtml`）——主 chunk 由 722KB 回落到 **525KB**。纯序列化拆到 `exportFormat.ts`（Node 可测），`exportText.ts` 仅保留 DOM 渲染；不加依赖、不改后端/`ChatRequest` | `npm run build` + `npm test` → **23 passed**（新增 `turnExport.test.mts` 3 例、`sessionExport.test.mts` 2 例）；浏览器 **9 用例 PASS**（新增 `tests/browser_export.py`：会话 MD、单轮 MD、单轮 Word 含 `<table>`、设置抽屉无源/导出） |

当前可用基线（本轮实测）：后端 `pytest tests -q` → **106 passed**；前端 `node --test` → **23 passed**；`npm run build` 通过；浏览器（Playwright + dist）**9 用例 PASS**。

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

> 当前优先：**DIR-1–4（本地持久化统一到 `.knowledge/`，规划 §10）** 与 K5/K9/K10/K11；E5/E7 与真实模型报告 E2E 待补。**已解决的 L 冲突/裁决见 §5.2/§5.3/§5.6/§5.7。**

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
- 报告头：题目/项目号/负责人/报告年份（H9/B2 前置）。
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
- **KB-5 重命名同步目录为中改**：**取代** K6「重命名仅改显示名」；需稳定 `corpus_id` + origin 重写；实施前更新 `DECISIONS`。
- **KB-4 多库 ≤6 为范围级新增**：**取代** `PROJECT §1「首期不做跨库联合检索」`（:63）；实施前先定契约并更新 PROJECT/DECISIONS。
  - 动机：`.knowledge/` 已有多库（基金按领域拆分），跨领域问题需要多库联合。

### 11.3 KB-1 默认库确认（小，前端）
- 现状：静默默认库（`find(id) ?? find(is_default)`）。
- 目标：**首次发送前**若用户未显式选库 → Composer 顶部一次性提醒「请确认本次会话使用的知识库」，确认后写 `corpusId`；不改后端。
- 边界：无可用库 → 明确状态，不静默。

### 11.4 KB-2 切换/新增入口（小，前端）
- Composer 库 popover 加「**+ 新建知识库**」（复用 `createCorpus` + `selectCorpus`）。
- 顶栏：可选加切换按钮；默认保持“输入区切换”，避免两处入口。

### 11.5 KB-3 拖拽多文件上传（中，前端）
- `CorpusFiles` 的 `<input>` 换/加 **dropzone**（`onDragOver/onDrop`），**多文件顺序**调 `uploadCorpusFile`；视觉反馈 + 逐条失败提示。
- **后端不改**（已流式落 `<corpus>/source/` + 增量导入）。
- 可选组合：`CorpusGrid`「新建库」后直接引导拖入。

### 11.6 KB-5 重命名与目录名同步（取代 K6「仅改显示名」）

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

**T3 孤儿/缺失库**：`/api/corpora` 对稳定 id 找不到目录的标 `missing`；默认解析跳过 missing；会话 `corpus_id` 指向 missing → 提示「库已移动/缺失，重新关联或解绑」，**不静默 404**。

**DEFAULT_CORPUS（T7）**：按 **id** 解析，**保留 rel 回退**（旧 `.env` 写 rel 仍可解析）；新持久化写 id。

**KB-5c 对齐迁移（T6，显式/可回滚）**：(a) 目录改名为现有显示名 或 (b) 名称回退目录名；**先预览**（将改路径 + 受影响文档数），备份 `corpora.json` 与目录，失败可回滚，用户确认。

**supersede**：取代 K6「重命名仅改显示名」与 deferred K6b；`corpus_id` 由「路径派生」改为「持久化 id（回退 slug+sha1）」。

**影响**：`corpora.py`（id/alias 持久化、`resolve_default`）、`main.py`（PATCH 改名目录 + 锁/回滚 + missing）、`knowledge.py`（`put(doc_id=)`、origin 重写 helper）、`parsers.py`（`import_defaults` 传稳定 id）、前端（alias 显示、missing 提示）。

**验收**：重命名后目录名/名称同步；`corpus_id` 不变；旧会话仍指向该库；`/file` 正常；**重命名后再导入不产生重复行**（T1）；导入中改名 409（T2）；缺失库提示而非 404（T3）；大小写改名/非法名/保留名边界（T5）。

### 11.7 KB-4 多知识库会话（≤6，全栈，范围变更）
- **契约**：`ChatRequest` 增 `corpus_ids: string[] | None`（1–6），与 `corpus_id` **二选一**（同送 422）；缺省 = 默认库。
- **检索**：为每个库建 `Knowledge`；**各库 retrieve → 跨库报告级合并/去重**；`allowed_doc_ids` 跨库校验；`[n]` 跨库编号，`sources` 带 `corpus_id`（前端 `/file?corpus=` 已支持）。
- **持久化**：`SessionData.corpus_ids?: string[]`（**可选**，缺失回退 `corpus_id`，遵守持久化向后兼容）。
- **前端**：多选 chip ≤6；`ScopeSelector` 跨选中库；删除/越界清理。
- **预算**：合并后仍受 token/报告数预算约束。
- **影响文件**：`main.py`/`graph.py`/`retrieval.py`/`store.tsx`/`workspace.ts`/`Composer`/`ScopeSelector`。
- 分阶段：**KB-4a** 后端契约与合并检索 → **KB-4b** 前端多选与持久化 → **KB-4c** 验收。

### 11.8 分阶段任务
| 编号 | 内容 | 验收 |
|---|---|---|
| KB-1 | 首次发送前确认默认库 | 未选库首次发送出现确认；确认后不再提示；无库明确状态 |
| KB-2 | Composer 内新建并切库 | 可从 Composer 新建并切库 |
| KB-3 | 拖拽多文件上传 | 拖入多文件入 `<corpus>/source/` 并增量导入；非法类型/超限逐条报错 |
| KB-5a | 稳定 id 持久化 + 回填迁移 + alias-by-id 模型 | 现有会话 `corpus_id` 不变 |
| KB-5b | 重命名 = 目录改名 + origin 重写 + id 保留 + 锁/回滚 + `put(doc_id=)` | 重命名后目录名=名称、id 不变、旧会话可用、`/file` 正常、**再导入不重复** |
| KB-5c | 名称/目录名对齐（T6：预览+备份+可回滚） | 无名称漂移；失败可回滚 |
| KB-5d | T3 缺失库标记与提示 | 外部删/改名后提示而非 404 |
| KB-4a | 多库契约 + 合并检索（后端） | `corpus_ids` 1–6；与 `corpus_id` 同送 422；跨库引用带 `corpus_id` |
| KB-4b | 前端多选 chip + 持久化 | `corpus_ids` 存/恢复；>6 拒绝 |
| KB-4c | 多库验收 | 选 2 库问答，引用来自两库且 `[n]` 可跳转 |
- 建议排期：**KB-1/2/3（纯前端）→ KB-5a（稳定 id 先行，供 KB-4 复用）→ KB-5b/c/d → [定 KB-4 契约] → KB-4a/b/c**。KB-5b 需 T1/T2 定稿后实施；KB-5c 对齐迁移单独一步且可回滚。

### 11.9 非目标
- 不做跨库权限/多租户；不合并库；不做自动选库（仍显式选择）。

### 11.10 验收
- KB-4：`corpus_ids` 跨库检索且库隔离不泄；`sources` 带 `corpus_id`；`allowed_doc_ids` 越库拒绝。

## 12. 维护约定

- 完成任务后更新本文 §2/§3 与 [`PROJECT.md`](PROJECT.md) 的现状/限制；长期取舍写入 [`DECISIONS.md`](DECISIONS.md)。
- 证据须可复现（命令/产出路径）；未运行的检查不得写入；受限项显式标注。
