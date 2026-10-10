# ITERATION — dox_agent 当前工作

- 更新时间：2026-09-30。P1 与报告/引用修正、main 交付检查见 §16.46。历史提取/质量口径见 §16.38，形式审查后端见 §16.43。
- **当前执行入口：§16.46。** P1 已实施并验收资料研究闭环；后续为 P2/P3、四维质量标注验收和 W8 形式审查完整浏览器链/计算工具。
- 长期说明见 [`PROJECT.md`](PROJECT.md)；关键取舍见 [`DECISIONS.md`](DECISIONS.md)。

## 1. 当前目标与必要约束

- 目标：以本地真实资料完成“添加/刷新资料 → 问答并核对来源 → 一句话生成报告 → 预览、修改与导出”的可用闭环；当前资料已接入，不能再沿用“接入前”的旧阶段定位。当前接续安排见 §16.33。
- 约束：
  - `ChatRequest` 为 `extra="forbid"`：后端未就绪字段不得发送；任务与 corpus_ids 契约已实现。报告仍仅单库，字段见 PROJECT §4.2。
  - 功能开关按 `uiFlags.ts` 实际默认值；转 on 需同时满足"后端契约已实现 ∧ 浏览器实测通过"。
  - 不引入 PROJECT §1「范围外」项。

## 2. 计划与任务状态

**历史阶段总览（早期基线，保留供追溯）**：下列 A–DIR 状态不作为当前实施清单；当前代码、证据与工作顺序以 §16.32–16.33 为准。

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
- **intake 确定性规则（G10b 验收依据；2026-09-24 用户需求修订，见 §8.9，取代本条“缺参即追问”主路径）**：
  - 字段：必填 领域/起止年份/模板；可选 基金类别/指定文件/分析重点。
  - 缺参：**一条消息列出全部缺失项**并回显已知项（用户可逐项补/改），不静默。~~（历史 G10b 规则；主路径已由 §8.9 一次启动取代）~~
  - 领域：默认取当前库 `domain`，但**回显并要求确认**（可换），不静默默认。~~（历史 G10b 规则；§8.9 允许明确主题直接启动）~~
  - 模板关键词映射：成果→`achievements`、热点→`hotspots`、未来/趋势→`future_directions`、综合→`comprehensive`；歧义/无匹配→追问。~~（无关键词时默认 `comprehensive` 见 §8.9）~~
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
| **G10e（待实施）** | 报告旅程：内部需求简报与一次启动 → 共用过滤的自动资料预检 → 生成/失败恢复 → 审阅及 Word 导出质量；丰富 intake 与生成提示词（§8.9） | 见 §8.9 与 §16.23；先收口 §16.22 P1/P2，参数须真实参与生成 |

**本轮状态（2026-09-22）**：G10a+G10b ✅、G10c ✅、G10d ✅（后端 #10 M1–M7 + 四模板 + md 导出；前端报告卡片 + 会话报告列表 + turn `reportId` 持久化）。§9 拓展（task5–8、docx/pdf、图表）仍为**非首期**，依赖 H9/B4/B5，未实施。
- 依赖：G10d 依赖 #10 + E；**G10a+G10b 必须同批**（否则 task4 发送触发 `extra="forbid"`+Literal → 422，回到死路）。

### 8.8 非目标
- 不做自动意图分类（任务仍显式选择）；不新增模板管理平台；不为 task4 建第二套检索。

### 8.9 task4 报告旅程：自然语言发起、自动生成与 Word 导出（2026-09-24，重新规划；待实施）

**目标与现状**：用户用一句自然语言或任务卡即可发起报告；系统根据已选资料库、任务和安全默认补成可追溯的内部简报，自行拟定章节和执行摘要，用户点一次“生成报告”即可开始。范围和默认值在按钮旁可见、可就地修改，但不要求用户写完整提示词，也不设置“确认大纲→确认摘要→确认正文”的审批链。现有 `src/agent/graph.py` 的 intake 仍以缺字段追问为主；`MessageView` 报告卡能选库/模板和看字段覆盖，但尚不能预告按当前条件实际入选的资料数。现有 `POST /api/reports` 调一次模型生成 Markdown；Artifact 可导出真实 DOCX，但 `src/docx_export.py` 仅处理标题、简单表格与段落；Pandoc/LibreOffice/OfficeCLI 在本地未检出。**以下是目标契约，未实施**。§16.22 的 W4-C P1/P2 是先行提交门禁；实施顺序见 §16.23。

**从需求到成果的五步**：

1. **自动整理需求**：任务卡“使用此任务”和聊天中的“帮我写一份……报告”进入同一报告草稿。服务端从本次话语、已固定的任务/模板版本、所选库和安全默认构成 `ReportBrief`（主题/目标、读者、重点问题、资料范围、篇幅及各值来源），不得把模型猜测写成用户明确要求。已有主题足以写作时，领域登记缺失也不阻断；只有主题无法判定、多个报告库尚未选一个、年份/类别冲突等真正影响范围的缺口，才在原处问**一条**具体问题。不要为了补齐可选字段多轮追问。
2. **一次启动**：报告卡紧邻“生成报告”显示简短范围摘要（单一报告库、填表日期年份、类别、任务绑定模板、预计产出）和“调整”入口；用途、读者、重点、篇幅等收在可展开设置中，预填“研究进展梳理／专业研究人员／标准篇幅”。所有默认值标来源，点击生成即确认当时可见范围，无额外“确认摘要”页面。模板固定版本只读展示。用户可在启动前修改，也可在生成后编辑成果新版本；大纲、摘要由系统内部拟定，不作为启动门槛。变更范围产生新草稿/运行，不改旧成果。
3. **自动资料预检**：点击生成时使用**与实际生成共用同一确定性过滤函数**预检，卡片可展开查看资料总数、限定文档数、日期缺失/歧义、年份不符、类别不符、符合筛选数和文件清单；不展示正文。排除原因按“日期无效 → 年份不符 → 类别不符”首次命中归类，字段覆盖另列。这里的“符合筛选”只是检索候选，**不等于模型实际读取或最终引用**；生成后分别回读实际选中/引用数。零候选时不调用模型，在同一处给“调整年份／类别／资料范围／查看缺失元数据”；不自动放宽条件。以过滤条件和入选文档 `(corpus_id, doc_id, version)` 形成范围指纹，生成端重算；资料变更时说明差异并让用户再次点生成，不能沿用旧范围。字段命中来自解析文本，页面注明尚未逐份核对原 PDF/OCR。
4. **生成与失败恢复**：服务端再次校验任务/模板版本、单库归属、年份/类别和资料指纹后调用 LLM API，生成有证据约束的 Markdown；内部拟纲与摘要不打断用户。标准篇幅优先一次正文调用；若预计正文超出当前模型可用输出预算，系统内部按章节分段生成、合并并检查跨章节重复/矛盾，不能截断后仍标“完成”。只有确定性检查发现可修复的结构/引用问题时才允许有上限的自动修复，不为每个报告无条件多次调用；每次运行有可观察的成本/时长上限。显示真实状态和已用时间，不编造百分比或思维链。关闭面板后从成果页找回；模型失败保留简报、失败原因和已有状态，同参数技术重试遵守幂等，主动重新生成或改条件开新 run。Markdown 生成成功而 DOCX 导出失败时保留报告与 Markdown，并允许只重试导出，不重新调用模型。
5. **审阅与继续完善**：成果先呈现标题、执行摘要、资料范围、主要发现和局限，再按模板组织正文；引用可打开原文。检查器/成果页提供“查看实际入选资料、复制、下载 Markdown/DOCX、编辑为新版本、重新生成”。人工编辑标“用户修订”，重新生成标新运行；导出指定成果版本，不悄悄重写正文。无证据结论用“资料不足/尚不能判断”，不为凑满章节编造内容。

**安全默认与阻断条件**：

| 项 | 建议值与来源 | 必须明确的边界 |
|---|---|---|
| 报告库 | 会话仅选 1 库时预选该库；多库时为空 | 生成仅用一库，不能默取多库中的首库；库缺失/未就绪时阻止并给修复入口 |
| 领域/主题 | 已明确选定一个报告库且该库登记领域可靠时建议；用户话语中可识别的研究主题优先 | 多库尚未选报告库时不取首库；缺领域登记但用户主题清楚时直接生成，只有主题本身不可判定才就地询问 |
| 年份 | 执行日前 5 个完整自然年；2026 年为 2021–2025 | 口径是**填表日期年份（报告提交时间）**，不是项目起止年份；用户可改，缺日期排除并计数 |
| 类别 | 不限 | 指定后保持精确匹配；不自动扩类别 |
| 模板 | 内置综合报告；报告型自定义任务使用发布时绑定的模板版本 | 任务绑定优先于自然语言关键词和默认；未知/未发布版本仍 422 |
| 资料 | 报告库内全部已入库资料，或本轮限定文档与该库求交 | 交集为空时不生成；每项范围变化都需重做预检 |
| 产出 | 中文 Markdown，标准篇幅；DOCX 为导出 | 默认仅本地资料，引用必需；不提供无后端能力的模型/联网选择 |

值的优先级为本次明确输入 → 已发布任务的可改默认 → 上表安全默认；报告型任务固定模板及服务端有效资料范围始终优先于客户端建议。启动卡可用一句人话概括，例如“将从「AI 与医疗」资料库中筛选填表日期在 2021–2025 年的报告，整理主要成果与局限；按解析文本预检有 12 份符合条件，实际阅读与引用以生成结果为准；面向专业研究人员，使用综合模板。”数字仅在预检后显示，旁边提供“调整”和“生成报告”；不能把示例数字写成真实结果。

**提示词与模板的分工（实施者应更新 `task4_intake.md`、`task4_report.md`，必要时微调四模板）**：intake 只解释有把握的需求、列可见默认、指出**真正阻断**的报告库/主题/范围冲突，并用一条友好问题引导修正；不要求用户重复提供已有信息，不从文件名推断报告年份。生成提示接收服务端定稿的简报、任务/模板版本、过滤结果与入选来源；由模型在内部确定合适章节和摘要，直接写最终 Markdown，不让用户审批大纲或摘要。先给有实证的核心发现，再说明资料如何筛选、证据支持到哪一步、哪些结论有冲突或不确定。写作要有清楚的小标题、具体比较和自然衔接，使 Markdown 易读；“生动”只指表达清晰，不允许虚构案例、数据、图片、论文或政策影响。区别已完成成果、实际应用、潜在应用与未来推断；热点/趋势只对本次样本成立。每个关键断言保留可打开的来源编号，页码仅在已知时标注；多份同项目报告去重。模板只控制章节/样式，不能覆盖 `base.md` 的证据纪律或服务端年份、类别、文档过滤；无资料章节说明缺口，不编造填充。将实际简报、参数来源、任务/模板版本、入选文档版本、生成提示摘要或哈希和模型信息记入运行/成果记录，方便旧成果解释当时按什么要求写。机器元数据放在运行/成果记录，不要求用户面对 YAML front matter。

提示词改写时按四层组织，避免只加形容词：**任务简报**（给谁看、要回答哪 1–3 个问题、输出篇幅与模板）→ **已核定范围**（单库、填表日期口径、类别、候选/实际阅读资料及元数据局限）→ **写作要求**（先用简短摘要回答问题，再按模板呈现可比较的发现、证据差异、争议与可执行的后续核查；表格只在确有可比项时使用）→ **提交前检查**（逐条核对事实引用、数字和项目去重，推断显式标注，无法支持的章节说明缺口）。这些规则约束最终文本，不要求展示模型私有推理或虚构“检查已通过”。内置四模板各补一句独特重点：成果看已完成与应用证据，热点看样本频次与分母，未来方向明确推断条件，综合模板平衡成果/热点/方向；共同证据纪律只维护在 `base.md`/生成基线，不复制四份。

**验收场景（G10e）**：① 单库可靠领域，输入“做一份近年成果报告”→ 预填领域、2021–2025、不限、综合模板，看到范围后**一次点击开始**，不出现大纲/摘要审批；② 多库需选一个报告库，随后用该库可靠领域建议；无领域登记但用户给出明确主题时仍可开始，不拿首库代填；③ 改年份/类别/限定文档后预检与生成使用同一资格集合，零候选不调用模型；④ 自定义任务固定模板版本及实际参数进入生成提示；⑤ 失败、关闭再返回、技术重试、主动重新生成和人工修订各有可回读状态/版本；⑥ Markdown 与其指定版本的 DOCX 标题、章节、表格、引用一致；DOCX 失败仅重试导出。真实模型文字质量另做小样本人工检查，离线替身通过不等于语言质量或 OCR 可信度通过。

**DOCX 方案 A：Markdown 为内容源，Word 为确定性渲染（规划，非现状）**：选用所附 ABC 调研中的 A 来服务当前“研究综合/分析报告”场景。LLM API 只写有引用的 Markdown，不直接输出 OOXML，也不负责页眉、字体或固定页码；同一 Artifact 版本的 Markdown 与引用/资料清单是唯一内容源。现有 `python-docx` 作为可用基线，下一步先补中文研究报告样式及必要的标题、列表、表格、链接/引用、页眉页码、局限与来源附录；随后在**隔离试验**中用 Pandoc `--reference-doc` 比较同一固定 Markdown 的 Word 效果和公式可编辑性，通过结构与视觉样例后才设为优先渲染器。当前环境未在 PATH 检出 Pandoc/LibreOffice，不能声称高级排版已支持；发布时必须打包所需依赖并做启动健康检查，不能让用户自己安装命令行工具。保留 `python-docx` 兼容渲染：对其不支持的公式/脚注/复杂图表不得静默丢弃，应给明确导出状态或回退可接受的已验子集。固定申报表、预算表与签章页才可能触发 B/C 的母版合并评估，须有真实表单样例与验收，不在当前研究报告管线内预埋双通道。

每次导出都从**指定成果版本**读取相同 Markdown；渲染器异常不重跑模型、不覆盖 Markdown。自动校验 DOCX 可重新打开，章节顺序、表格行列、引用标记/链接和关键信息不丢失；中文字体、边距、页眉页码与长表格分页用固定样例做发布前视觉检查。生成信息存于运行/成果侧车（任务/模板版本、参数及来源、库与文档版本、模型、渲染器版本、校验结果），不把结构化技术字段塞进报告正文。研究报告 Word 模板是**样式母版**，与 W4 的“输出内容模板”分离；换样式只需重导出，不生成新报告。避免为首版引入 `pydantic-ai`、Celery/RQ、OfficeCLI、docxtpl 或对象存储。

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

**本节 §14 原阶段的非目标**：新增 task5–8；自动猜测用户意图并切换任务；多库专项报告；图表、docx/pdf 导出；把提示词中的“高/中/低”包装成统计概率；新增元数据管理平台。后续 G10e 已在 §8.9 纳入 DOCX 质量提升，不能把本行误读为当前全项目禁止 DOCX。

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
| `domain` 分析领域 | 单库时采用该库可靠登记领域作为可编辑建议；多库不默认取首库领域，使用用户问题或明确选择。无可靠领域时不猜；task4 当前目标以 §8.9 为准，用户主题明确即可启动 | 标“领域建议：X（来自库 A）”，一键改写；不能把库名直接当科学领域；实际采用内容随该次运行保存 |
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

**采集与默认**（本节原产品细案；G10e 的当前主路径以 §8.9 为准，以下“缺项逐轮补齐/另行确认”的旧措辞不再构成实施要求）

- task4 intake 是参数整理器，不在 chat 生成报告正文。自由输入可一次给全参数，也可以逐轮补充/覆盖；安全默认直接补齐可选项，只追问真正阻断的单库/主题/范围冲突。自然语言里出现的“去年/近五年”转成明确区间并显示，用户可修改；不能默默套用未显示的日期。
- 报告知识库必须明确选一个。单库会话报告库可预选该唯一库，回显名称并允许更换；多库会话不自动取基础库/第一库，必须在生成前选定单个报告库。选择报告库不修改 chat 检索集合。`doc_ids` 仅可属于所选报告库。
- `domain` 默认取报告库可靠登记领域，作为可编辑建议并标出来源；无领域登记但用户原文已有明确主题时直接使用该主题，不从模型背景知识猜领域，也不额外设确认门槛。
- `template_id` 默认 `comprehensive`，可选 achievements/hotspots/future_directions/comprehensive；识别不到时使用默认值并显式告知用户，可一键更换，不为模板名称不清强制追问。
- 时间参数：task4“报告年份”按用户确认的填表日期年份（报告提交时间），默认近五个完整自然年，令 `Y` 为最近完整自然年，窗口 `[Y-4,Y]`（当前 2026 年为 2021–2025），显示并允许改动。后端从解析 Markdown 的 `填表日期` 提取；没有该字段即排除并计数。用户可另选项目周期，但界面必须明确标为“项目起止年份”。报告/来源注明采用解析文本且未逐份核验原 PDF。
- `fund_type` 默认不限；可选值来自解析 Markdown 的显式 `资助类别`，指定时精确匹配；无该字段文档不能当作类别匹配，报告范围披露其排除/未验证数量。
- `focus` 默认空；`doc_ids` 默认所选报告库全部可用文件；不问可省略的字段。`year_from > year_to` 明确指出并让用户修改，不自动交换。
- 用户明确要求与默认冲突时以用户明确值为准；显式“全部年份/不限”视为移除默认窗口，但 UI 必须显示其范围更宽。报告卡呈现最终“知识库｜报告提交时间（填表日期）｜项目起止年份（如启用）｜类别｜文件范围｜模板｜重点”，用户点击“生成报告”即发起，无独立的确认摘要/大纲步骤。

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
| 任务模板 | 内置 task1–task4；问答/对比任务可复制、编辑草稿、发布不可变版本并绑定会话；task4 走独立报告生成 | 缺类型化参数 schema、完整编辑器、归档与自定义报告模板 | W4-A 首切片已实施，W4-B/C 待做 |
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

**W4 接续补充**：上述为目标模型；2026-09-24 的最小对象、版本、执行映射及验收以 §16.18 为准。尤其不能把自定义 `task_id` 直接传入当前固定任务检索/图分支后期待自动工作。

### 16.6 成果作为一等对象

**最小运行快照是成果的前置条件。** 当前 `ChatRequest` 只有 `task_id`、知识库/文档范围和 `run_id`，不足以满足成果追溯。W3 必须先实施 W3-A `RunSnapshot`，再实施 W3-B `Artifact`；不能先创建无法追溯的成果，等 W4/W5 再补关系。

最小 `RunSnapshot` 由服务端持久化并以 `run_id` 唯一关联，至少包含：契约版本、`run_id`、可选 `parent_run_id`、`session_key`、运行类型（chat/report）、开始/结束时间与状态、`task_id`、可空的任务版本、用户可见参数及其默认来源、请求与服务端实际采用的 `corpus_ids`/`allowed_doc_ids`、资源策略（首版固定 `local_only`）、模型标识、输出意图，以及完成后回填的引用版本、usage/telemetry 完整性。服务端解析后的有效范围是权威值，不能只原样保存客户端声明。

W3-A 同步扩展请求契约：`ChatRequest` 增加可选 `session_key` 和版本化 `run_context`（当前可见参数、参数来源、资源策略、输出意图）；`ReportRequest` 增加 `parent_run_id`。旧客户端省略时按 `local_only` 和“来源未记录”兼容，不能伪造用户确认。相同 `run_id` 只允许同一请求指纹重试；冲突请求返回 409，避免一个快照代表两次不同执行。

**W3-A 有效范围回传**：`POST /api/chat` 在 `policy`（或新增 run 事件）中返回服务端**实际采用**的 `corpus_ids`/`allowed_doc_ids`/`model`，前端据此显示“实际范围”，使“服务端解析值权威”在 UI 可见，而非只保存客户端声明。快照写入**异步、不阻断 SSE**；写失败时回答仍正常完成，但标记“运行未记录”，且不得因此生成“可追溯成果”。

普通发送、编辑重问、重新生成、分支重问、task4 intake 和报告生成都必须创建或关联快照。重新生成/重问使用新 `run_id`。task4 intake 保留 chat run；报告生成必须使用独立 `report_run_id` 并以 `parent_run_id` 指向 intake run，首次请求失败后的安全重试复用该 report run id，用户主动“重新生成报告”才创建新 id。现有报告中复用 intake run id 的记录按 legacy 读取，不强行改写。创建快照失败时不得生成“可追溯成果”；旧会话/旧报告没有快照时显示“运行信息未记录”，不伪造补齐。

W4 在这一最小结构上增加不可变任务版本、完整参数 schema 和默认值来源；W5 只负责让所有交互入口展示、编辑并使用同一快照契约，不再承担快照首次落地。W6 增加网络策略与网页快照引用，字段按契约版本向后兼容。

“报告”只是成果的一种形式。新增统一成果实体 `Artifact`，首期类型为回答快照、Markdown 报告和 DOCX 文档；后续才加入图文简报、数据分析包等。（W3-B 最小切片规格已冻结，见 §16.15。）成果至少记录：标题、类型、状态、当前版本、创建/更新时间、来源会话与运行、任务及其版本、知识库集合、引用快照、导出格式和失败原因。

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
| W3 运行快照与成果最小闭环 | **W3-A 先落最小 RunSnapshot**并覆盖全部发送/报告入口；`policy`/run 事件回传服务端实际采用的 `corpus_ids`/`allowed_doc_ids`/`model`，快照异步写、不阻断 SSE（失败标“运行未记录”）；task4 报告使用独立 child run；**W3-B 再建 Artifact**、兼容读取现有 reports、开放跨会话报告查询和全局成果列表、回答保存为成果、Markdown 版本与 DOCX 导出（W3-A 已完成；W3-B 切片规格冻结见 §16.15） | 各发送路径持久化服务端有效范围，且实际范围在 UI 可见；快照写入失败不阻断回答、不生成可追溯成果；请求重试不重复 run、冲突 run id 被拒；报告 run 可回到 intake parent；回答和 task4 成果都能回到 run；省略 `session_key` 才列全局报告，显式空串与省略语义有测试；草稿/中断/完成状态正确；新版本不覆盖旧版本；历史无快照/空字段安全显示；重启可恢复 |
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

**W3-B 缩范围（建议）**：先用"reports 兼容读取 + RunSnapshot 回读"打通"来源运行→成果"；Artifact 首版仅含 `type(answer_snapshot/report)`、`run_id` 关联、version、export；"逐条引用落库"列为可选项、非前置；并顺带收口 B2/B3/B4；A7（`runs` 保留/归档）作为 W3-B 运维项。**切片规格已冻结，以 §16.15 为准。**

### 16.15 W3-B 最小 Artifact 切片规格（2026-09-23 冻结基线；首切片实施情况见 §16.15.1）

W3-A 已收口（B1–B4 完成）。W3-B 涉及 Artifact 存储与全局成果页 IA，属新阶段；本规格由规划先冻结，coder 开工前按此为准，**不得自行设计成果页 IA**。与 §16.6/§16.10 一致，未列入者均为非目标。

1. **最小对象**：`Artifact` 首版 `type ∈ {answer_snapshot, report}`；字段含 `id`、`type`、`run_id`（关联 `RunSnapshot`）、`version`、`status`、`created_at`/`updated_at`、`export`（格式与状态）。引用沿用 `RunSnapshot.citations`，**"逐条引用落库"为可选项、不前置**。生命周期首版到"草稿/生成中/已完成/失败"，待审阅/归档可后置。
2. **reports → Artifact 兼容读取顺序**：先直接读现有 `reports` 表与 API（不改写），再建 Artifact 存储并做**可回滚迁移**；历史缺 `run_id`/`corpus_id` 一律显示"未记录"，不推断当前会话值。
3. **全局成果页 IA**：不得与现有五入口/检查器冲突。中央区为"成果列表/编辑器"，右侧检查器预览；W3 完成前仍标"本会话"。跨会话列表在 W3-B 内以 `session_key` 查询语义定义：**省略 `session_key` = 全局，显式空串 = 空字段筛选**，两者行为分列测试。
4. **导出边界**：DOCX 若纳入 W3-B，必须是**真实 OOXML**（非 HTML `.doc`）并给回读验收（章节/表格/引用一致）；PDF 继续后置。
5. **新增测试与提交**：覆盖 Artifact 存储迁移、run 关联回读、**新版本不覆盖旧版本**、跨会话列表过滤语义；提交范围**只含 W3-B**，沿用 §16.11.8 的可复现提交。
6. **不破坏已冻结契约**：`RunSnapshot` 指纹/409、report 幂等 200、`run` 事件字段（`effective_corpus_ids`/`model`/`resource_policy`/`session_key`）保持稳定。

**并入 W3-B 的运维项（A7）**：明确 `runs.sqlite3` 与 Artifact 的保留/归档策略；被成果或报告引用的运行记录不得因会话/数量上限自动删除，避免破坏追溯。容量阈值、清理动作与恢复方式先形成契约，不在无迁移与回读证据时启用自动清理。**B3 真实断连**（`is_disconnected()`）用例可在 W3-B 补，现有 `CancelledError` 覆盖已足，非前置。

**独立待验项（不因 W3-B 变绿而提升）**：真实模型报告、AC-05b OCR 阈值、AC-01 发布前取消、AC-04 四类拖放组合，继续单列。

**原范围门禁（2026-09-23）**：当时要求 W4 自定义任务/输出模板编辑器、W7 Prompt/Skill 有真实使用证据再立项；输出模板维持四类；W6 网络研究先只做后端契约。**W4 等待条件已由用户 2026-09-24 的明确要求取代，现行最小实施范围见 §16.18；W7 与六类扩展仍待证据。**

#### 16.15.1 实施结果：W3-B 首切片（2026-09-24，已随 `3c3cfaa` 提交）

按冻结规格实现最小 Artifact 对象、reports 兼容读取、run 关联、版本化与真实 DOCX 导出；中央成果页仍标“本会话成果”，全局列表语义已在 API 与测试中定义。

- **后端对象**：新增 `src/artifacts.py` 的 `ArtifactStore`（`STATE_DIR/artifacts.sqlite3`）与 `artifacts`/`artifact_versions` 两表；`Artifact` 字段为 `id`/`type`/`status`/`title`/`current_version`/`session_key`/`run_id`/`corpus_ids`/`task_id`/`template_id`/`export_format`/`export_status`/`fail_reason`，引用从关联 `RunSnapshot.citations` 回读。`add_version` 只追加、不覆盖旧版本。
- **接口**：`POST /api/artifacts`（保存回答快照，必须引用已持久化 `run_id`，否则 422）；`GET /api/artifacts?session_key=&type=&status=&limit=`（**省略 = 全局，显式空串 = 空会话筛选**）；`GET /api/artifacts/{id}`；`GET /api/artifacts/{id}/export?format=md\|docx`。task4 报告成功后自动建 `type=report` 的 Artifact 并关联其 run；历史 reports 以 `report:<id>` 只读合成，不重写 `reports` 表。
- **导出**：新增 `src/docx_export.py`，用 python-docx 生成**真实 OOXML**（标题/表格/段落），测试用 python-docx 回读校验；旧的 HTML `.doc` 回答导出不受影响。
- **前端**：中央“成果”页改为列出当前会话的 artifacts（回答快照 + 报告），右侧检查器新增 `artifact` 目标（标题/类型/版本/来源运行/会话 + 复制/下载 md/导出 docx/查看来源运行）；回答操作条新增“保存为成果”。仍标“本会话成果”。
- **测试**：`tests/test_artifacts.py` 7 例（run 关联与 citations 回读、新版本不覆盖旧版本、省略/空串/指定 session 三种列表语义、legacy report 只读合成且未写回、报告自动建 artifact 且去重、DOCX 真实 OOXML 回读、未知 run 422）；`browser_tasks` 覆盖保存为成果、成果列表、artifact 预览与固定、空会话。
- **本轮实际运行证据**（Linux，当前工作树）：`.venv/bin/python -m pytest tests -q` → **156 passed**；`npm --prefix frontend test` → **31 passed**；`npm --prefix frontend run build` 通过；12 个离线 Playwright 脚本全部退出 0；`git diff --check` 通过；新增文件 `ruff` 无告警。
- **当时未完成**：跨会话/全局成果页 UI、Artifact 生命周期与版本编辑入口、逐条引用落库（可选项）、A7 保留/归档策略、真实模型报告。关键边界的后续进展见 §16.17。

### 16.16 管理者核对与下一步（2026-09-24）

**核对范围与事实**：HEAD 为 `534bba4`，W3-A 代码已在 `665c3ff` 提交；W3-B 首切片仍在工作树，含 `src/artifacts.py`、`src/docx_export.py`、`tests/test_artifacts.py` 等新增文件。当前实现有 Artifact 两表、报告兼容读取、回答保存、真实 DOCX 导出；中央成果页仍只按当前会话取数。以此工作树独立运行：后端全量 **156 passed**、前端 **31 passed**、生产构建通过、`tests/browser_tasks.py` 离线浏览器脚本通过、`git diff --check` 通过。构建仍有动态导入与 chunk 大小警告。这里的浏览器证据使用模拟接口，不能替代真实服务/模型验收；本轮没有运行其余浏览器脚本。

**优先修正的产品契约**：现有 `POST /api/artifacts` 只验证 `run_id` 存在，允许客户端指定成果类型、正文、会话和知识库范围；`RunSnapshot` 尚未保存回答正文或其摘要。因此“回答快照可追溯到该次真实输出”目前**未成立**，不能凭测试通过把 W3-B 判为完成。服务端必须以运行记录为任务、会话、有效知识库及引用的权威来源，并验证保存的内容；用户改写内容应明确成为后续编辑版本，不能冒充原始回答。报告自动建件失败时，报告已保存而 Artifact 可缺；现有幂等返回不会补建，兼容列表还可能随分页出现重复，这些要在全局页面开放前收口。

按下列顺序接续，**仅指导实施，本文不修改业务文件**：

1. **W3-B1 来源可信（阻断项）**：保存回答时仅接受已完成的 chat run；会话、任务、有效库、引用一律从 `RunSnapshot` 派生，冲突的客户端字段拒绝或取消传入。服务端在流结束时保存最终回答正文或其规范化哈希，创建首版成果时核对正文；无法核对的旧运行显示“输出未核验”，不得标成原始回答快照。`report` 类型仅由报告流程创建。测试覆盖伪造会话/库/类型、未完成 run、正文不符与旧快照回退；不更改 W3-A 的 409 与报告 200 幂等语义。
2. **W3-B2 报告关联与去重**：报告保存成功而建件失败后，提供可重试的幂等补建路径；已有报告的幂等请求也能修复缺失关联。历史报告继续只读，列表合并按稳定报告身份去重，分页/筛选后同一报告至多一张卡；不在 GET 时暗中写库。测试覆盖故障后重试、旧报告空字段和跨页去重。
3. **W3-B3 全局成果入口**：中央页默认列出全部会话成果，并提供“全部/当前会话”显式切换；“当前会话”使用指定 `session_key`，全局调用省略该参数，显式空串单独验证。卡片标明来源会话、类型、状态、版本和来源是否可回读；切会话或新建会话后仍可在“全部”找回旧成果。检查器和中央卡片共用同一对象语义；旧报告不重复、不伪造缺失来源。补一条浏览器跨会话主链。
4. **W3-B4 版本与状态最小闭环**：开放读取旧版本与追加编辑版本的接口/界面；从成果预览进入 Markdown 编辑，保存生成新版本，旧内容及其来源引用可回读。首版先支持“草稿/已完成/失败”及可解释的允许转换，生成中仅由运行过程维护；待审阅/归档作为后续明确阶段，不用空按钮充数。编辑后的正文标注“用户修订”，不再宣称与原运行输出字节一致。验证重启后版本、导出版本与状态一致。
5. **W3-B5 导出与留存收口**：用含标题、表格、引用的同一份报告核对 Markdown 与 DOCX 回读，引用至少保留可读编号/来源标识；明确当前解析不支持的排版。A7 先记录容量观察、备份/归档与恢复策略，被成果/报告引用的 run 不自动删除。完成受影响自动检查、真实服务浏览器主链后提交 W3-B；新增文件必须入库，提交后才进入 W4。

**退出与范围**：B1–B3 是开放全局成果页前的门禁；B4–B5 完成、相关检查通过且提交后，W3-B 才标完成。暂不开展 W4 自定义任务、W6 网络资源或 W7 Skill；真实模型报告、AC-05b OCR 可信度、AC-01 发布前取消与 AC-04 四类拖放组合仍独立待验，不因本批成果检查通过而提升状态。逐条引用落库仍为可选项，若沿用运行引用必须确保旧版本来源不会随运行记录清理而消失。

### 16.17 W3-B 来源、全局列表与版本收口（2026-09-24，与本批实现同提交）

本批从已提交的 `3c3cfaa` 开始，按 §16.16 顺序实施 B1–B5。工作树中的未跟踪个人脚本 `tools/align_knowledge.py`、`tools/mineru_parse_missing.py` 未修改、未纳入提交范围。

- **B1 来源可信**：chat 完成前把 token 拼接结果的 SHA-256、状态、指标和引用写入 RunSnapshot，再发唯一 `done`。`POST /api/artifacts` 只接受已完成 chat run，核对正文哈希；会话、任务、有效库与引用取服务端快照，冲突客户端字段返回 422，`report` 类型不能从此入口伪造。首切片已有成果默认标“原始输出未核验”；新核验的首版标“原始回答已核验”，编辑版标“用户修订版本”。旧 run 缺正文哈希不能补称原始快照。
- **B2 报告关联**：报告保存后以事务式 `ensure_report` 建件；已保存报告的幂等请求会补建此前失败的关联。列表用全部已关联 report run 身份去重，并分页读取只读历史报告；`reports` 表不因 GET 改写。运行快照缺失或未完成时仍通过历史报告兼容读取，不伪造可追溯成果。
- **B3 全局入口**：中央成果页默认读取全局列表（省略 `session_key`），提供“当前会话”显式筛选；卡片显示会话、类型、状态、版本及实际运行记录是否存在。新会话仍能找到旧成果，空串/省略语义由 API 定向测试覆盖。
- **B4 版本与状态闭环**：新增读取版本列表、指定版本与追加版本接口；检查器可从预览进入 Markdown 编辑，保存草稿或完成版，切换旧版，并按所选版本导出 Markdown/DOCX。版本正文、状态、失败原因与核验标签随版本持久化，旧版不被覆盖；历史合成报告保持只读。`generating` 不允许经编辑入口设置，失败状态仅允许先转草稿。报告生成失败会形成可见失败成果；同一 run 安全重试成功追加已完成版本，旧失败版本及原因仍可回读。提供方异常只显示通用错误，不泄露内部细节。
- **B5 导出与留存**：同一含标题、表格、引用编号与来源标识的 Markdown 样本做 MD/DOCX 回读，章节、表格与可读引用保留。当前 DOCX 解析器只保留标题、普通段落和管道表格，不承诺复杂嵌套 Markdown、图片或分页。`runs.sqlite3`、`artifacts.sqlite3`、`reports.sqlite3`、`workspace.sqlite3` 作为同一状态集合备份；当前不自动清理。四库合计达到 1 GiB 时人工评估容量与迁移；清理前须证明 run 未被成果/报告引用并保留可恢复备份。恢复时停服务，成组恢复四库，启动后抽查成果→run 与报告→成果回读；缺库时显示“未记录”，不得回填推断字段。自动归档/删除需另做迁移与恢复验收后才启用。

**检查证据**（Linux，本批工作树）：后端全量 `pytest tests -q` 为 **164 passed**（1 Starlette 弃用警告），覆盖旧 Artifact 数据库迁移、伪造来源/正文拒绝、失败报告及安全重试、版本回读、唯一 `done`；前端 `npm test` 为 **31 passed**、`npm run build` 通过（保留既有动态导入和 chunk 警告）；`tests/browser_tasks.py` 离线浏览器脚本退出 0，覆盖跨会话列表、编辑新版本、切回旧版与下载。新增 `tests/browser_artifacts_live.py` 使用真实本地 API/SQLite/浏览器、离线模型替身和临时资料库，走通回答保存、报告建件、编辑、跨会话找回及四库成组恢复后关联回读；退出 0。新代码 `ruff` 检查通过，`main.py` 仍有两项既有告警（B008/PLC0206）。

**退出状态**：B1–B5 的本地契约与退出证据已满足；本批提交后 W3-B 标完成。生产环境备份由运维按上述成组恢复契约执行，自动清理仍禁用。真实模型报告、OCR 可信度及 §16.16 所列独立待验项继续单列，不因本批测试通过而提升状态。W4 自定义任务/输出模板按 §16.15 的真实使用证据门禁另行立项，不能从本批成果回归推断已满足。

### 16.18 W4 自定义任务与输出模板：实施规格（2026-09-24，规划已采纳；进展见 §16.19）

**启动依据与边界**：用户本轮明确要求“完善自定义任务和模板，指导下一步工作”，取代 §16.15“W4 先取得真实使用证据”的等待门槛；这项要求不等于六类新报告形态、任意 Skill 或网络搜索已有使用证据。基线为已提交的 `0c57a0f`；本轮只读核对到 `ChatRequest.task_id` 仍是 task1–task4 的 `Literal`、`ReportRequest.template_id` 仍限四类、`src/prompts`/`src/templates` 是内置权威、前端任务卡和检查器只读。`src/agent/graph.py` 与 `src/retrieval.py` 还按内置任务 ID 分支，**不能仅扩展前端列表**。本轮独立执行 `.venv/bin/python -m pytest tests -q` → **164 passed**（1 条 Starlette 弃用警告）、`npm --prefix frontend test` → **31 passed**；未重跑构建或浏览器，仍引用 §16.17 对应提交的既有证据。

**用户对象和最小数据契约**：

- **任务定义**有稳定 ID、名称/简述/分类/示例、背景、目标、具体要求、边界与澄清条件、产出说明、状态、草稿修订号和不可变已发布版本。另有 `engine_task_id ∈ {task1, task2, task3, task4}`：它决定检索预算、图分支和报告入口；自定义 ID 只表示产品身份，不冒充第五种执行引擎。首版“新建”默认从一项内置任务复制，内置定义只读。
- **输入参数**首版支持文本、整数、枚举、布尔及年份区间等可校验字段；每项写明标签、帮助、必填/可选、候选值、默认值与来源。`corpus_ids`、限定文档、模型和联网权限仍由现有运行/会话契约控制，任务只可给出建议，不能通过自定义字段绕过 1–6 库、单库上传、报告单库或 `local_only` 限制。用户写的执行要求按受约束的任务说明拼接在 `base.md` 硬约束之后，不允许覆盖引用、资料不足和私有思维链规则；不开放代码、工具或 Skill 执行。
- **输出模板定义**是独立对象，含稳定 ID、名称/用途、Markdown 章节正文、草稿与不可变发布版本；四份 `src/templates/*.md` 仍是内置只读来源，可复制为自定义版。一个任务可列多个已发布模板并指定一个默认项；多个任务可复用同一模板。模板变量只能引用声明过的任务/报告参数，缺变量、重复冲突或空章节在发布前报错；不支持脚本、外链 include 或任意 HTML 执行。DOCX 仍由已有导出器生成，W4 不新增 Word 版式编辑器。
- **存储与追溯**：自定义定义存于应用状态目录，不写进 `.knowledge/` 或改内置文件。发布时生成不可变版本；修改已发布项先产生草稿，再发布新版本，旧会话和旧成果不随之变更。会话保存任务 ID + 固定发布版本；RunSnapshot 保存服务端解析的任务 ID/版本、`engine_task_id`、模板 ID/版本、实际参数值与来源，并能回读当时的定义或其内容摘要。`run_id` 请求指纹包含解析后的任务/模板版本与有效参数，沿用 W3-A 的冲突 409 和报告幂等语义。旧会话的 task1–task4、旧 RunSnapshot/报告缺新增字段时安全回退为“版本未记录”，不得自动升级或补造；归档仅从新建列表隐藏，已有会话和运行仍可回读其固定版本。

**默认值与发送前确认**：从“使用此任务”进入新会话时，先显示一行可读摘要：任务版本、知识库范围、资料限定、时间口径、领域、模板、输出格式和网络策略；只对该任务实际用到的项显示/校验。参数取值优先级为本次用户显式值 → 本会话已确认值 → 已发布任务默认 → 安全默认，并在运行记录中标来源。从当前会话使用任务时可沿用其已选库；从空工作台新建会话时沿用目录顺序首库，不引入“全局默认库”。未指定资料时使用所选库内全部已入库资料，网络固定关闭，输出默认 Markdown/中文并要求引用；中文来自现有 `base.md`，首版不提供无效的语言切换。task1 无年份默认；task2/task3 的“近 5 年”仅为显式可点选建议，不启用静默过滤。报告型任务沿用 task4 的确定性过滤：填表日期年份默认执行日之前五个完整自然年（以 2026 年运行为例为 2021–2025），用户可改；缺日期排除并计数，类别指定时精确匹配。**（intake 交互主路径按 §8.9/G10e 调整为安全默认 + 可见范围 + 一次点击生成，当前待实施。）**研究领域仅在已明确选定单一报告库且该库有可靠领域元数据时给出可改建议；多库未选报告库前不拿首库填充。报告生成仍必须单独选定一个目标库；用户主题明确时不因领域登记缺失阻断，真正缺项就地提示，不发起模型请求。

**实施顺序与验收（按切片提交，不一次铺开全部编辑器）**：

1. **W4-A 对话任务竖切**：建立任务定义/发布版本存储、读写与校验接口；复制内置 task1 或 task2 → 编辑背景/目标/要求/参数默认 → 保存草稿 → 预览实际可见配置 → 发布 → 新建会话并发送。服务端用自定义 ID 找到固定版本，再把 `engine_task_id` 交给图和检索，把受约束任务说明交给提示词；请求不能用客户端伪造的版本或说明覆盖已发布定义。任务列表区分“内置/我的/草稿/归档”，检查器预览和四段编辑器复用现有侧栏与右侧区域；草稿保存状态/冲突要可见。验收：未知/未发布任务拒绝，旧 task1–task4 行为不变；一次真实本地 API + 离线模型替身的浏览器主链能从复制到带引用回答，再从成果回读任务版本与参数来源。
2. **W4-B 报告模板竖切**：复制一份内置输出模板，编辑 Markdown 章节与声明的变量，预览并发布；复制 task4 为报告型自定义任务，绑定模板固定版本。扩展报告请求和 intake/生成链：自定义模板由可见表单明确选择，文本 intake 仅辅助采集参数，不靠现有四类关键词猜测模板；报告继续单库、原有年份/类别精确筛选与缺失计数，模板正文从固定版本注入；report child run 与 Artifact 记录任务/模板版本。验收：选自定义模板生成 Markdown 报告并导出 DOCX；改模板再发布后，旧报告仍能回读原模板版本；非法变量、无已发布模板、跨库文档或缺必填参数在模型调用前拒绝。
3. **W4-C 生命周期与兼容收口**：任务/模板支持复制、重命名草稿、归档；发布后仅追加版本，旧会话保持原版，新会话默认取最新版并明确显示版本升级入口。重载应用与成组备份恢复后，定义→会话→运行→成果仍可串起；新状态库纳入 §16.17 成组备份，不自动清理。补 API/浏览器回归覆盖编辑冲突、归档、旧记录缺字段、任务/模板删除或失效时的恢复提示，按主题提交后才标 W4 完成。

**具体呈现示例**：自定义任务卡“基金项目方法对比”显示“比较所选报告的研究对象、技术路线与结果；输出对比表和不可比因素”，标记“基于对比分析 · 我的任务 · v1”，入口为“预览/使用/编辑草稿”。其参数页把“知识库：当前选择 2 库；年份：不限（可选近 5 年）；资料：全部；网络：关闭；输出：Markdown”逐项显示。报告型模板预览则展示章节骨架与变量样例，不把示例资料说成真实证据。运行后成果卡展示任务/模板版本及来源运行；旧版本详情可回读，但不会因新发布被覆盖。

**非目标与停止条件**：W4 不创建 task5–task8 新引擎、不接网页抓取/搜索、不做 Skill/Prompt 市场、不增加图文/数据分析等六类新执行管线，也不改真实语料。A/B/C 各自的主链与必要检查通过即可停止该切片；真实模型报告和 AC-05b OCR 可信度继续独立待验，不用离线替身结果冒充。

### 16.19 W4-A 问答/对比自定义任务首切片（2026-09-24，已实施）

- 复制内置 task1/task2 到应用状态库 `custom_tasks.sqlite3`，可编辑名称、说明、背景、目标、要求和文本参数默认值。草稿以修订号防并发覆盖；发布追加不可变版本；已发布项的新草稿不改旧版本。内置任务保持只读，未发布/未知任务拒绝执行。
- 自定义 `task_id` 由服务端解析到固定版本；图与检索收到 `engine_task_id`，自定义文字附在内置基础约束之后。客户端不能提交指令覆盖定义；运行指纹、RunSnapshot 和会话记录版本，参数值与来源由服务端合成。成果经 `run_id` 回读这些信息。旧内置任务与缺版本的旧运行记录仍可回读。
- 前端任务列表区分内置、草稿和已发布；右侧检查器提供草稿编辑、保存冲突提示、发布和使用入口。新会话固定当时版本；已发布项编辑草稿期间仍可使用旧发布版。
- **实际检查**：`.venv/bin/python -m pytest tests -q` → **166 passed**（1 Starlette 弃用警告）；`npm --prefix frontend test` → **31 passed**；`npm --prefix frontend run build` 通过（既有动态导入与 chunk 告警）；`tests/browser_custom_tasks_live.py` 以真实本地 API/SQLite/浏览器与离线图替身走通复制、编辑、发布、带引用回答、保存成果及版本/默认来源回读；`tests/browser_tasks.py` 旧任务浏览器链通过；新增 Python 文件 `ruff` 通过，`git diff --check` 通过。
- **W4-A 参数补齐（2026-09-24）**：新增文本、整数、枚举、布尔、年份区间的声明式参数 schema、默认值及必填校验；独立 `task_params` 请求字段避免与知识库/模型/网络策略混用。会话可保存用户填写值；发送前显示固定任务版本、资料与网络策略和输入控件；服务端按固定版本校验并在运行快照记录实际值及 `user`/`task_default` 来源。旧 `parameter_defaults` 文本字段兼容，未知参数、类型/选项/年份错误和缺必填均在建 run 前拒绝。保存草稿拒绝重复或保留字段名。
- **本批实际检查**（Linux，基于 `2bbd2c6`）：后端全量 **168 passed**（1 Starlette 弃用警告）；前端 **31 passed**；构建通过（既有动态导入与 chunk 告警）；`browser_custom_tasks_live.py` 使用真实 API/SQLite/浏览器与离线图替身，覆盖编辑必填参数、发布、发送、成果和用户值/默认来源回读；旧 `browser_tasks.py` 通过；新 Python 模块与测试 `ruff` 通过。
- **当时尚未实现（现见 §16.21）**：分类/边界/澄清字段与完整四段编辑器、归档/版本升级入口属于 W4-C 收口；W4-B 自定义报告模板未开始。当前浏览器测试使用离线图替身，不能代表真实模型效果。

### 16.20 W4-B 自定义报告模板竖切（2026-09-24，已实施；基于 `e789a8c`）

按 §16.18 W4-B 规格实现输出模板对象、发布版本与报告绑定；报告仍单库、沿用填表日期/类别确定性筛选与缺失计数。内置四模板保持只读，复制后可编辑并发布不可变版本。

- **模板对象**：新增 `src/custom_templates.py` 的 `TemplateStore`（`STATE_DIR/custom_templates.sqlite3`，`templates`/`versions` 两表）；`OutputTemplate` 校验名称/正文、至少一个章节标题、变量只能引用 `domain`/`year_range`/`year_from`/`year_to`/`fund_type`/`focus`，且声明与实际使用一致（缺声明、重复、未使用均在建件前拒绝）。草稿以修订号防并发覆盖；发布追加不可变版本，旧版不被覆盖。
- **接口**：`POST /api/templates/custom`（复制内置）、`GET /api/templates/custom/{id}`、`GET /api/templates/custom/{id}/versions/{v}`、`PUT /api/templates/custom/{id}/draft`、`POST /api/templates/custom/{id}/publish`；`GET /api/templates` 返回内置 + 自定义（含状态/版本）；`GET /api/templates/{id}` 支持内置或自定义已发布版本。
- **报告绑定**：`ReportRequest.template_id` 由四类 `Literal` 放宽为字符串并新增可选 `template_version`；自定义模板在建 run 前解析到固定发布版本，变量用报告参数渲染后注入提示词；未发布/未知模板 422。运行指纹含 `template_version`；RunSnapshot `params` 与报告 Artifact 的 `template_version` 均记录该版本。内置模板行为不变。
- **前端**：报告卡新增“报告模板”选择器（内置 + 已发布自定义，自定义显示版本），首次从 intake 值初始化；检查器模板预览对内置提供“复制为自定义模板”，对自定义提供名称/正文/变量编辑与“保存草稿/保存并发布”，发布后旧报告仍读原版本。
- **报告型自定义任务（W4-B 剩余项，已实施）**：`copy_builtin` 放开 task4；复制出的报告型任务带 `report_template_id`/`report_template_version` 绑定字段，`TaskDraft` 可编辑。`ReportRequest` 增可选 `task_id`/`task_version`；建 run 前解析报告型自定义任务的固定版本并校验 `engine_task_id=="task4"`（非报告型任务 422）。运行指纹、RunSnapshot（`task_id`/`task_version`/`engine_task_id=task4`）与报告 Artifact（`task_id`/`task_version`/`template_version`）都记录版本。前端报告卡在报告型自定义任务下预选绑定模板并发送任务版本。
- **本轮实际运行证据**（Linux，当前工作树，基于 `e789a8c`）：`.venv/bin/python -m pytest tests -q` → **174 passed**（`tests/test_custom_templates.py` 6 例，含报告型任务版本记录与非报告型任务 422）；`npm --prefix frontend test` → **31 passed**；`npm --prefix frontend run build` 通过；12 个离线 Playwright 脚本与 `browser_custom_tasks_live` 退出 0；`git diff --check` 通过；新增/修改文件 `ruff` 无告警。
- **后续状态**：模板变量样例/预览增强、归档/版本升级入口与完整四段编辑器已由 §16.21 收口；真实模型报告仍未验。

### 16.21 W4-C 生命周期与兼容收口（2026-09-24，当前工作区；基于 `cbf1f9a`）

按 §16.18 完成 W4-C，并在实施前复核 `cbf1f9a`。复核发现报告型任务绑定可被 API 绕过、task4 无前端创建/绑定入口、报告卡可能采用 intake 猜测或模板最新版、失败报告重试会丢失任务来源；本批已一并修复，不沿用原提交“已完整”的判断。

- **版本与生命周期**：任务/模板均可复制自定义对象为新 ID 草稿，名称与完整定义通过修订号编辑；独立 `archived` 标记不覆盖 `draft/published`，默认列表隐藏归档项，显式固定版本仍可回读和执行，归档项不能编辑/发布。旧 JSON 缺新增字段时安全归一化，缺版本不自造。
- **报告权威绑定**：报告型任务发布前必须绑定内置模板 v0 或已发布自定义模板指定版本；归档模板不能绑定到新任务。报告请求以发布任务中的模板 ID/版本为权威，客户端不匹配即 422；模板后续发布新版不改变旧任务。报告 `task_params`、任务说明、RunSnapshot、reports 与 Artifact 统一使用服务端解析值，失败后同 run 重试保留任务/模板来源。
- **兼容与升级**：自定义 chat/report 必须显式携带任务版本；旧会话缺版本在 UI 阻止发送并提供新建最新版会话或成组备份恢复提示。已有会话保持固定版本，发布新版后显示当前/最新版本，只有用户确认才升级；升级会清除新 schema 不再接受或不兼容的旧参数。成果卡显示任务/模板版本，历史缺字段显示未记录。
- **界面与恢复**：任务入口可复制专项报告任务；检查器提供完整任务字段、报告模板绑定、模板用途、变量样例预览、复制/归档/恢复。会话→运行→成果链已用六库（workspace/reports/runs/artifacts/custom_tasks/custom_templates）成组复制、删除、恢复后回读；仍不自动清理。
- **本批实际证据**（Linux，当前未提交工作区）：受影响后端 `tests/test_custom_tasks.py`、`test_custom_templates.py`、`test_artifacts.py`、`test_reports.py`、`test_runs.py` 为 **53 passed**（1 条 Starlette 弃用警告）；前端 `npm test` 为 **36 passed**；`npm run build` 通过（保留既有动态导入与 chunk 告警）；12 个离线 Playwright 脚本全部退出 0；`browser_custom_tasks_live.py` 覆盖 task4 创建/固定模板/模板升级后仍用 v1/任务升级清参数/复制归档恢复并退出 0；`browser_artifacts_live.py` 覆盖定义→会话→run→report Artifact 的六库成组恢复并退出 0；`git diff --check` 通过。变更文件 Ruff 在排除仓库既有 `B008/PLC0206/TRY004` 后无告警。
- **退出状态**：本批本地检查通过（见上「本批实际证据」），但 **verifier 复核不建议提交**（§16.22：2 个 P1 + 2 个 P2 待修）。修复、重验并提交前，W4-C 不标完成；按 §16.11.8，W4 整体待提交封口后才能标完成并进入 W5。真实模型报告、AC-05b OCR 可信度和 W5–W7 不因本批通过而提升状态。

### 16.22 W4-C verifier 反馈与提交门禁（2026-09-24，规划已更新；待实施）

**verifier 结论（2026-09-24，独立复核；其报告的检查未由规划者重跑）**：暂不建议提交。已验证范围：后端全量 **180 passed**、前端 **36 passed**、构建通过、两个真实本地 API 浏览器场景通过；Ruff 仅 3 处既有告警（未改行）；verifier 未修改任何文件。以下修复项均为**待实施**，由实现者执行。

**P1（阻断提交，必须修复并重验）**

| # | 问题 | 定位 | 修复目标与退出证据 |
|---|---|---|---|
| P1-1 | `ReportRequest.template_version` 禁止 `0`，但内置模板绑定的报告卡会发送 `0` → **422** | `src/main.py:147`；`MessageView.tsx:336-339` | 内置模板报告请求被服务端接受（不因版本字段 422）。口径二选一由实现者定：接受 `0` 为内置版本，或内置路径省略 `template_version`；**不得**削弱自定义模板“未发布/未知 422”。退出：定向 API 测试覆盖内置绑定发送路径 + 报告卡浏览器链不 422 |
| P1-2 | 报告型任务的 `task_params` 写入快照/成果，**未进入最终检索 query 或 LLM 提示** → 参数实际失效 | `src/reports.py:202,246-258` | 服务端按发布版本解析后的 `task_params` 参与报告生成的提示词/检索输入（至少注入提示词；与 W4-B“模板变量用报告参数渲染”同链）。客户端伪造值不得绕过发布版本校验（既有 422 保留）。退出：定向测试断言生成提示（或等价注入点）含解析后的参数值；旧内置无参数报告行为不变 |

**P2（同批修复，避免提交后立即返工；若实现者主张延后须在提交信息/ITERATION 注明理由）**

| # | 问题 | 定位 | 修复目标 |
|---|---|---|---|
| P2-1 | 模板发布后再次编辑草稿，状态显示隐藏但仍可用的 `v1`（版本口径混乱） | `MessageView.tsx:293-297` | 草稿/已发布/归档状态与“当前可用版本”显示一致：有草稿时仍可选用已发布版，但不得把 `v1` 显示为草稿态或暗示已丢失 |
| P2-2 | 任务页对 `task3` 显示“复制任务”，后端只允许 `task1/2/4` | `Inspector.tsx:406`；`custom_tasks.py:131-142` | 前端仅对可复制任务显示入口（或后端放开 `task3`，二选一；**倾向前端对齐后端**，不扩复制范围） |

**门禁与顺序（实现者执行）**：P1-1/P1-2 修复 → P2 同批 → 重跑受影响检查（`pytest` 全量、`npm test`、`npm run build`、相关浏览器脚本至少含报告卡/live 报告链）→ 按主题提交（§16.11.8；未跟踪 `tools/` 个人脚本仍不纳入）→ 才标 W4 完成并进入 W5 规划。

**非目标**：不借此扩 W5–W7、不改六类报告形态、不处理真实模型报告/AC-05b（继续独立待验）；P1-2 不要求新建“参数专用执行引擎”，只打通已有报告生成链。

### 16.23 G10e 报告生成体验：下一批实施顺序（2026-09-24，规划待实施）

**前置**：以 §16.22 四项 verifier 意见修复、全量/前端/构建/报告浏览器链重验和 W4-C 提交为门禁。当前工作树仍有业务与文档改动；此前 verifier 报告的 **180 后端/36 前端通过**仅支持其当时版本，不能当作本规划已验证。G10e 目标契约仅在 §8.9 维护；本节规定实施顺序和退出，不再另造一套报告流程。

1. **G10e-A 一次启动的需求简报（优先）**：复用 task4 intake 与报告卡，让一句话形成带来源的内部 `ReportBrief`；服务端确认实际值并保存到运行快照。补单库/多库、五完整自然年、类别不限、综合/任务绑定模板的默认；用户明确主题可代替缺失的库领域登记。卡片显示紧凑范围与“调整”，高级写作项折叠；点击“生成报告”就是唯一启动动作，不再另设摘要或大纲审批。仅报告库未选、主题无法判定或范围自相矛盾时就地问一条问题。浏览器覆盖“单库一句话直达生成”“多库选库”“主题明确但库领域缺失”“改年份/模板”“自定义固定模板”，断言没有要求用户填写完整提示词/审批大纲。
2. **G10e-B 后台资料预检与范围保护**：把 `reports.py` 当前资格判定抽为同一只读函数供预检与生成复用；返回按所选库/文档/日期/类别的互斥计数、文件清单和范围指纹。用户点击生成后自动运行预检；零候选不调用模型，给就地修改；资料版本变化显示差异并让用户再点生成。生成端仍自行验证，不信任前端计数。测试日期缺失/歧义、年份/类别排除、限定文档求交、筛选变化与过期预检。报告范围说明区分“符合筛选候选”“实际选中/引用”，不能把预检估算写成实际读取。
3. **G10e-C API 生成与证据化正文**：更新 intake/report 提示词与必要的内置模板文案，使 `ReportBrief` 的用途、读者、重点问题、篇幅和已发布任务参数进入**实际**生成输入；写作参数暂作独立提示字段，开放模板占位符时才扩版本化白名单与发布校验。提示词不替代服务端过滤。模型内部拟定结构与摘要，标准篇幅一次正文调用优先；仅预估超出模型输出预算时内部按章节分段，分配证据并做合并去重/一致性检查，给运行设置调用/时长上限，绝不要求用户审批章节。确定性校验失败时至多一次有界自动修复，仍失败则保留诊断，不把截断或无引用文字标为完成。用固定短报告、长报告输出预算、冲突资料、零证据样例检查章节、引用、事实/推断及缺口表达；真实模型小样本另验。成果保留 Markdown 原文和运行侧车，浏览器覆盖生成后查看来源、编辑新版本、重新生成和关闭后找回。
4. **G10e-D Word 导出质量（在 C 的稳定 Markdown 契约后）**：先在现有 `python-docx` 导出上补齐已声明的中文研究报告子集，确保标题层级、列表、表格、引用及报告来源附录可读；`/api/artifacts/{id}/export?format=docx&version=…` 始终读取指定版本，历史报告经 Artifact 兼容入口也可导出。以固定的中文长报告、含表格/引用报告、含公式报告做 Pandoc `--reference-doc` 隔离试验：记录依赖安装/打包、版式、公式、结构回读与失败路径；**仅通过后**将其设为优先渲染器。无 Pandoc 环境不得标该增强完成；`python-docx` 只承诺其已验子集，超出能力时明确告知，不静默丢内容。导出失败保留 Markdown 并可单独重试；单元/接口测试重开 OOXML 与内容对照，发布前用 Word/LibreOffice 或可用渲染器检查固定样例的中文分页与表格，不要求最终用户审查中间稿。

**完成条件与停止**：A/B/C 的受影响后端测试、前端测试/构建、真实本地服务 + 离线模型替身浏览器主链通过；D 的基础 DOCX 内容/失败恢复另有结构回读与固定样例视觉证据，Pandoc 增强按独立试验结论标状态，不能以 `python-docx` 测试代替。只提交本批 G10e 与必要测试/文档，不纳入 `tools/` 个人脚本。完成已验子集后可进入 W5 对话工作台；六类新报告形态、固定申报表 C 管线、网络搜索、自动 PDF/OCR 纠错不在本批。若 W4-C 提交门禁仍未满足，本节保持“待实施”，不可把体验规划写成已支持。

### 16.24 W4-C 提交封口与 verifier 处置（2026-09-24，已提交 `fb5e17b`）

verifier 在 §16.22 提出 2 个 P1 + 2 个 P2 作为提交门禁。本轮逐项静态核对当前代码，四项均已落盘，并提交为 `fb5e17b`：

| # | 问题 | 处置与定位 |
|---|---|---|
| P1-1 | 内置模板报告卡发送 `template_version=0` 被 422 | `src/main.py`：`template_version` 约束放宽为 `ge=0`；内置模板路径解析为 `0`（`requested_template_version = 0`），自定义模板仍要求已发布版本，未发布/未知仍 422 |
| P1-2 | 报告 `task_params` 未进入生成提示 | `src/reports.py`：写作简报加入 `purpose`/`audience`/`length`；按发布版本的参数标签把解析后的 `task_params` 拼进生成提示，并注明"仅影响写作，不放宽资料范围" |
| P2-1 | 模板草稿再编辑后版本显示混乱 | `MessageView.tsx`：模板选项过滤掉草稿（`version=0`）与归档项，报告型任务固定模板按绑定版本显示 |
| P2-2 | `task3` 显示"复制任务"但后端只允许 task1/2/4 | 前端对齐后端：`Inspector.tsx` 仅对 `task1`/`task2`/`task4` 显示复制入口，未扩大后端复制范围 |

证据边界：以上为当前提交的代码静态核对结论。本会话所在环境无法执行后端 `pytest`、ruff 与浏览器脚本（Windows 侧无法进入 WSL 的 `.venv`），**提交封口的复跑检查仍需在 WSL 内执行**；未复跑前不把"已验证"写进本文档。

### 16.25 G10e 报告旅程：A/B/C 已提交，D 部分实施（2026-09-24）

- **A 一次启动（已提交 `81bd39f`）**：`build_report_brief` 由用户话语、任务/模板版本与可见安全默认合成 `ReportBrief`；报告卡紧邻"生成报告"显示紧凑范围并提供"调整"，用途/读者/重点/篇幅收在可展开项并预填"研究进展梳理／专业研究人员／标准篇幅"；模板固定版本只读展示。
- **B 资料预检（已提交 `81bd39f`）**：新增 `POST /api/reports/preflight`，复用生成端同一个 `preflight_report` 资格过滤，返回入选/排除计数、文件清单与范围指纹；零候选不调用模型。前端 `ReportPreflight` 与覆盖展示已接线。
- **C 证据化生成与失败恢复（已提交 `81bd39f`/`3c47fc9`）**：简报与已发布任务参数进入实际生成提示；`finish_reason == "length"` 视为未完成的截断正文并明确报错，不把截断内容标为完成。
- **D Word 导出（部分）**：`docx_export.py` 补齐中文标题样式（黑体）与管道表格，仍只承诺标题、段落、简单表格子集；Pandoc `--reference-doc` 隔离试验未做，本机未检出 Pandoc/LibreOffice，按 §8.9 不得标为增强完成。
- **未验**：真实模型报告小样本、G10e 浏览器主链（单库一句话直达、多库选库、零候选不调用模型）的复跑证据。

### 16.26 W5 对话工作台：已开工，未达退出条件（2026-09-24）

`1c13a4e` 只落地了"运行配置摘要显示 + 会话置顶"（纯前端，含 `browser_session_branches`/`browser_tasks` 用例补充）。§16.10 的 W5 退出条件还要求：编辑重问、重新生成、分支、task4 与保存成果使用一致快照；缺项可就地修复；指标未知不伪造。当前未达成，W5 不标完成。本批 W6-A 属于提前开工，理由见 §16.27。

**W6-A 一致性补充（本批）**：执行摘要新增“网页快照”一行（数量 + 版本前缀 + 网页引用条数），数据取自运行快照的 `params.web_snapshot_ids`/`web_snapshot_versions`，未使用时显示“未使用”；`RunInfo` 补 `web_snapshot_ids`，`RunSnapshot`/`ArtifactInfo` 的 `citations` 类型支持 `kind="web"`（`snapshot_id`/`url`/`fetched_at`）。核对结论：普通发送、编辑重问（分支）、重新生成、task4 intake 与保存成果共用同一个请求装配，均携带 `session_key`、`task_id`/`task_version`、`corpus_ids`、`web_snapshot_ids` 与 `resource_policy`；指标缺失显示“未记录/未提供”，不回填估计值。

### 16.27 W6-A 网页快照：后端扩展 + URL 界面（2026-09-24，本批；未提交）

按 §16.10 的 W6-A 范围实施：目标库/运行绑定、多预览隔离、持久快照、Source 与 RunSnapshot 回读，以及输入区的指定网址界面。

- **后端**：新增 `src/web_snapshots.py`（`web_snapshots.sqlite3`，URL 归一化 + 内容哈希即版本 + 抓取时间）。`/api/web/preview` 返回 `preview_id`/`expires_at`（15 分钟）且多预览互不覆盖；`/api/web/confirm/{id}` 接受 `target_corpus_id` 或 `save_for_run`，二选一否则 422；新增 `GET /api/web/snapshots/{id}`。`ChatRequest.web_snapshot_ids`（≤6、不可重复）在服务端解析为快照后随运行保存，`resource_policy` 由服务端定为 `local_plus_urls`，引用为 `kind="web"` 并与本地引用统一编号。
- **前端**：`Composer` 增加"指定网址"入口（预览 → 选择"仅用于本次运行"或"加入所选知识库"），运行配置行显示"本地资料 + N 个指定网址快照"；`Inspector` 新增网页快照预览；`store.tsx` 把快照 id 随所有发送入口提交，网页引用点开检查器。
- **本批审查发现与修复（审查 → 实施同批）**：
  1. 网页正文原按 `[:50000]` 硬截断，绕过 `RETRIEVE_CONTEXT_TOKENS` 预算 → 改为与本地证据共用预算（`fit_web_body`，按 D-L8 估算逐快照扣减），截断在来源标 `truncated` 并发 status 提示。
  2. `chat_preparation = "ready"` 会把未就绪的语料库伪装成就绪 → 删除该覆盖；改为 `resolve_policy(..., has_web_sources)`：有快照时不再用"暂不能查证"的提示短路回答，但 `preparation`/`stop_reason` 与运行快照保留真实状态。
  3. 预览字典只在新建预览时清理 → 抽出 `prune_web_previews`（过期清理 + 最多保留 20 个），预览与确认两处都调用。
  4. 运行快照新增 `preparation` 字段，`RESOURCE_POLICIES` 补 `local_plus_urls`。
- **文档同步**：PROJECT §4.1/§4.2、README 状态库清单（六库 → 七库，纳入成组备份契约）与 DECISIONS 的 W6-A 条目随本批更新。
- **测试**：`tests/test_graph.py` 新增"长快照按预算截断"与"短快照完整读取"；`tests/test_app.py` 新增"未就绪语料库 + 快照仍如实记录 preparation"（与既有预览隔离/确认/绑定用例一起）。
- **证据边界**：本会话无法执行后端检查（见 §16.24 的证据边界），前端 `tsc --noEmit` 与 `node --test`（36 passed）已通过。提交前须在 WSL 复跑后端全量 `pytest`、ruff 与相关浏览器脚本（含新增 `tests/browser_web_live.py`）。
- **阶段纪律**：按 §16.11.8，W5 未退出就动 W6-A 属偏离；本批先按主题提交封口，随后回到 §16.26 收尾 W5，再进入 G10e-D。

### 16.28 2026-09-25 进度复核：代码已前行，验收口径待补

**仓库事实**：复核时 HEAD 为 `2a6d8be`，工作树原本干净。提交 `3b39725`/`c8b966f` 已包含 W6-A 持久网页快照和 W6-B 显式、限域搜索；`e0fdd73` 补 W5 历史运行范围回放；`8b7e462` 加版本化 Prompt/Skill 资产及任务绑定；`ceb1958` 为 DOCX 加页眉/页码和公式拒绝，`2a6d8be` 修正文献引用编号与实际入模文档对齐。PROJECT §9 和 §16.27 的“未提交/未开始”是旧时点叙述；README 的七库清单未计入已由 `main.py` 建立的 `prompt_skills.sqlite3`，实施者下一次更新运行说明时须同步成组备份清单。当前 `src/docx_export.py` 可处理标题、段落、列表、简单管道表格、外链、页眉和页码；**不能插图**，公式会明确拒绝。报告仍是一或两次完整正文调用（第二次仅修复），没有实现原 §16.23 所写的长报告自动分段。

**本轮实际检查**：当前 HEAD 上定向后端 `tests/test_reports.py tests/test_artifacts.py tests/test_prompt_skills.py tests/test_app.py` 为 **56 passed、1 条依赖弃用警告**；前端 `npm --prefix frontend test` 为 **36 passed**。没有在本轮运行全量后端、浏览器或真实模型，故 W5/W6-B/W7 的整体退出条件、真实报告质量和 Word 视觉效果仍需对应证据；不能以提交存在或这 92 项定向/前端用例代替。下一批先补受影响浏览器主链与真实模型短报告抽查，再独立验图文竖切；与图文无关的 W5/W6/W7 验收不作为提图实验的阻断门槛。

**本地只读语料观察**：在 `.knowledge/*/parsed/` 找到 **133** 对 `markdown.md`/`middle_json.json`、**7057** 个 JPG；`middle_json` 中 2821 个 image、2506 个 chart、1135 个 table 图像引用，扫描到的引用文件**0 个缺失**。这是缓存完整性观察，**不是**可用于报告的图片数或抽取正确率。目视三例分别为研究曲线图、封面标志、表格截图；同一页多个 chart 可能只在最后一块带共同图注。因此按文件名批量插图会把标志/表格误用，并可能把组合图拆错。现有 `src/parsers.py` 读取 Markdown/逐页文本与块，但没有把图像和图注形成可引用资产；`src/retrieval.py` 只把图片字节从检索文本剥离；`src/reports.py` 的实际入模文档清单尚未作为结构化结果交给图像选择器。PDF 图文能力仍为**规划**。

### 16.29 G10f 图文研究报告：复用本地解析结果，少量可信配图（2026-09-25，规划待实施）

**用户结果与边界**：选择“图文报告”或在自然语言中提出“配图”后，沿用 §8.9 的一次启动：系统自动选与结论相关的**原 PDF 图**并写图注、出处和页码，用户可以直接生成；不要求手写图片提示词或逐张确认。普通报告仍默认纯文字。首版默认最多 **4** 个图组，图不足就生成文字报告并说明“未找到可可靠复用的图”，不插无关装饰图、不调用图像生成。此“4”是首版版面/大小预算建议，不是研究证据阈值。图文报告继续单个报告知识库，年份/类别/限定文档和任务模板由现有服务端规则决定；不得从范围外资料选图。

**源与方案**：首选已落盘的 `parsed/<源文件相对路径>/middle_json.json` + `images/` + `markdown.md`。MinerU 官方输出契约说明 ZIP 中保存图片、源页索引和块索引，文件名可能随版本变化，所以只读 JSON 中真实 `image_path`，不拼文件名（[MinerU 输出契约](https://github.com/opendatalab/MinerU/blob/master/docs/en/reference/output_files.md)）。`pdfimages` 全量原图抽取没有图注/版面语义，不能作为首选；只有缓存缺失、图组需合并或裁图不完整时，才按已验证的 `page_idx`/`bbox` 从**同一原 PDF**定点裁取。若源 PDF 或块定位不能验证，候选标不可用，不悄悄改用其他文档的图。首版不重跑全库 OCR/MinerU。

1. **G10f-0 只读样本门槛**：从现存结果挑普通单图、同页多联图、封面标志/签章、表格截图、扫描或缺图注各一例，对照原 PDF 页确认图块、`page_idx+1`、bbox、图注和图片文件。已定位可复现样例：丁方宇恙虫病报告的 `page_11_chart_3/4/5.jpg` 共页且图注只挂最后一块；李宗敏网络谣言报告的 `page_0_image_0.jpg` 是封面标志、`page_5_table_2.jpg` 是表格截图。记录可用、需成组、应排除、无法判断四类；样本只回答当前格式能否可靠映射，不宣称全库准确率。若多联图不能从缓存安全复原，首版先跳过多联图，不让错误单图进入报告。
2. **G10f-1 图像清单与来源**：只在所选报告库**本次符合筛选且实际送入模型的文档**上按需建图像清单，不扫描 7000 张给用户。报告生成链返回结构化实际入模 `(corpus_id, doc_id, doc_version)`，不从“来源附录”文本反解析。每个候选记录 PDF 文件 SHA、文档版本、页号、块索引/bbox、原始相对图片路径、图种、原图注、邻近段落、图片 SHA/尺寸及可用状态；图片路径必须限制在该文档解析目录内。旧缓存与当前 PDF 的对应关系未证实前标“待核”，不能写成已核原件；选中图片字节复制为成果版本的内容寻址附件，使重新解析/删除缓存后仍可重导出旧版本，并把附件目录纳入成组备份。
3. **G10f-2 自动选图与可改结果**：仅 chart/image 进入自动候选；封面标志、页眉、签章、表单/表格截图、极小/模糊图及无可靠说明的图片默认排除，表格优先保留为可读表格而非截图。优先用原图注、邻近正文、章节和已入模结论做文本相关性排序；同页相邻、共用图注的多联图作为一个图组，不把图注硬贴到单张子图。模型只从服务端给出的 figure_id 中选择，服务端再次校验归属与上限；图注中的事实沿用原文，不根据图片外观推断结果。结果页可“查看原 PDF 第 N 页／移除或替换图片”，调整后成为成果新版本，**不用重跑正文模型**。不自动选到可信图时安静降为文字报告。
4. **G10f-3 预览与导出**：Markdown 内容与不可变图片附件共同构成一个成果版本；正文在相关论点附近放图、简短原图注、`[n]` 来源与原 PDF 页码，图题缺失不能由模型虚构。预览通过受控资产端点读取已选附件，点击能打开带版本的源 PDF 页；不得将服务器本地路径或原始 base64 暴露为公开链接。DOCX 在现有 A 管线用 `python-docx` 按比例嵌图并附图注/来源，限制尺寸且不静默漏图（[python-docx 图片接口](https://python-docx.readthedocs.io/en/latest/user/quickstart.html)）；图文 Markdown 提供“Markdown + 图片”ZIP，旧纯文本 `.md` 导出保持兼容，单个 `.md` 不冒充离线可显示图片。Pandoc 母版试验仍独立，不作为首版插图前置。

**退出证据**：用上述真实 PDF 样本跑通“一句话选图文 → 自动选到有图注的相关图 → 页面原图/源 PDF 页可打开 → 下载 DOCX 后重开检查图片字节、图注、页码与正文引用 → 下载 ZIP 离线显示”，并证明封面标志/表格/错页和范围外图片不被自动插入；缓存图片删失、原 PDF 版本变化与导出异常不会损坏已完成的 Markdown/旧成果附件。服务端与前端必要检查、浏览器主链通过后只可称“已验样本类型”；没有跨模板图像定位抽样或真实模型报告检查前，不称全库图文准确率通过。G10f 完成后再考虑人工上传图片、重新绘图或图像理解模型，不能把这些提前塞进首版。
### 16.30 会话删除与报告预检可诊断（2026-09-25，本批）

**会话删除**：后端此前只有 `GET/PUT /api/workspace/{kind}/{key}`，界面因此只能重命名/置顶/归档，无法删除会话。
新增 `DELETE /api/workspace/{kind}/{key}`（`kind ∈ {sessions, notes}`，未知 id 或 kind 不符 404），
`Workspace.delete` 校验 kind 后删除；前端 `workspace.remove` 清掉待保存快照与 revision，删除当前会话时自动切到下一个未归档会话
（没有则新建）。会话行增加“删除 → 确认删除/取消”两步操作。删除会话不影响已保存的成果与报告。

**报告资料选择不再“静默失效”**：实测「自然科学基金-AI与医疗」库 36 份中 17 份能抽到 `填表日期`/`资助类别`，
19 份存的是另一种解析产物（YAML front matter + 项目信息表，只有 `研究期限`/`startYear`-`endYear`，**没有** 填表日期与资助类别），
因此被判 `date missing` 全部排除；同时部分文档填表日期为 2026，落在默认窗口 2021–2025 之外而按 `year` 排除。
代码不能凭空补字段，本批做的是让结果可诊断：`preflight_report` 返回逐份 `reasons`（原因 + 项目起止年份，仅展示）、
`observed_years`（库中实际可识别的填表日期年份）与 `hint`（零候选时说明是缺字段——建议对该库「重导入」补全解析字段——
还是年份不符并给出实际区间；部分入选时提示另有 N 份因缺字段未纳入）。报告年份仍严格按填表日期，项目起止年份不参与筛选。

**界面侧**：报告卡除提示外列出被排除资料的清单与逐份原因（缺填表日期时附该项目起止年份）；零候选且库中能识别到填表日期年份时，提供“把年份改为实际区间”的一键修正——仍是显式操作，不自动放宽窗口。

**待办（数据侧）**：对「自然科学基金-AI与医疗」执行 `POST /api/corpora/{id}/ingest?force=true` 重导入，
让 `parsed/` 缓存（23 份已含 填表日期）回填正文；其余无缓存的文件需重跑 mineru。重导入后仍未出现字段的文档，
需在界面按“缺元数据”清单逐份核对原 PDF。

**2026-09-27 数据复核更正**：上述 36 份与“全部重导入”建议只适用于当时样本。当前本地「自然科学基金-AI与医疗」库有 517 份已入库资料（17 PDF、500 Markdown）、5199 个 chunk、517 个 `indexed` 文件记录。500 份 Markdown 原文件均未出现“填表日期/填报日期”，重导入不会凭空产生该字段。对 2021–2025 填表年份、不限定类别的只读预检结果为 7 份入选、500 份缺日期、10 份年份不符（可识别年份为 2025/2026）。应先按原文件类型和逐份原因处理；仅在原 PDF 确有日期而当前解析文本漏掉时考虑重导入。预检提示已按此更正，项目起止年份仍不代替填表日期。

**本轮实现与边界**：审查确认 `ready` 当前只由库中 `docs` 行数大于零决定；界面另显示待处理和失败数。旧文档更新解析失败时，导入器保留旧索引并把文件标 `error`，旧内容仍可被检索（临时库实测）；是否在失败期间继续检索旧版，涉及历史可读性与当前源文件一致性的上层取舍，本轮未改变。检索的前 40 份标题/标题层召回会漏掉仅正文命中的第 41 份；新增“有范围且本轮无匹配时扫描该范围全部文档”的回退。真实 517 文档/5199 chunk 样本的一个主题查询约 0.61 秒，全范围扫描约 1.49 秒，均为单次本机观察，不代表吞吐上限。会话删除前排空保存队列；报告 Word 已有系统来源附录时不再重复追加来源；新增报告预检说明区分原件缺字段与解析漏字段。

**检查**：集成工作树上 `uv run pytest tests -q` 为 210 passed；`tests/browser_session_branches.py`（含延迟 PUT 删除时序）和 `tests/browser_tasks.py` 均退出 0；前端 TypeScript 与 Vite 构建通过；改动文件 Ruff 与 `git diff --check` 通过。浏览器结果使用离线模型/接口替身；本轮未重跑真实模型报告。当前工作树同时保留另一写入者的未提交报告引用改动与未跟踪文件，后续提交需按所有者划分，不能把它们混入本轮提交。

### 16.31 资料可用性、召回与报告范围的接续方案（2026-09-27，审查修订版；首批已在工作树实施，验收未完成）

**目标与事实边界**：本节记录实施前的存储、并发、跨库、清单、全文覆盖和评测验收规则；其中旧 `ready`、旧索引可被新检索及分步写入等描述是当时基线，不代表当前工作树状态。§16.32–16.33 单独记录已落地的首批代码和仍未通过的验收；文档规则本身不构成通过证据。

1. **S1 旧版生命周期与原子发布**：A（首期推荐）仅在解析新源文件期间保留上一版正文/chunk 作失败回退，成功发布后覆盖旧索引；历史成果按已保存的回答/报告及来源记录回读，旧原文无快照则显示“原版本不可回读”，不跳到新 PDF。B 长期保存每版原文/PDF 与索引，可完整回看旧引用，但增加版本库、容量、迁移和备份成本。先选 A，**不再声称旧索引长期可恢复或旧原文已可历史读取**；有明确历史原文需求再单独决策 B。解析先写临时/版本化缓存并核对源文件内容哈希；同一知识库 SQLite 事务一次提交 `docs`、`doc_pages`、`doc_markdown`、`chunks`、`files` 的当前成功版本与源哈希指针，提交后才使内存索引缓存失效。失败只登记最新源状态，上一版数据保留至下次成功发布或用户删除源文件，期间仅作重试回退、退出所有新运行。文件清单须区分“上次成功入库源哈希”与“当前检测到的源哈希/错误”。外部图片缓存/可选向量索引不属于 SQLite 事务：按版本存放，只有与已提交文档版本一致才可进入检索或报告；孤儿临时文件以后清理，不能暴露半新版。
2. **S2 冻结运行证据**：预检指纹包括筛选参数及 `(corpus_id, doc_id, 正文版本, 成功入库源哈希)`；点击生成重新核对，不同则 409 并就地刷新。聊天在首轮检索前冻结所选库/白名单内的文档元数据与 chunk 检索视图，覆盖率补检索也只能使用同一视图；选出最终文档后、首个回答 token 前复制所需正文。报告在预检通过后冻结全部合格文档的解析正文，后续分段摘要与综合只读该包。各库可分别取得一致性读视图，但多库没有跨 SQLite 原子事务，故冻结后整体复核所有文档版本及源文件哈希；任一项在冻结期间变化就 409 中止，不把不同时间的新旧内容拼成一次完成运行。受预算约束的不可变证据包可放在本轮内存/临时存储，不再查可能被覆盖的“当前正文”。冻结完成后外部文件变化不改本轮内容；运行记录保留冻结时点、实际库、文档版本和源哈希，下一轮再检查新状态。证据包只为本轮使用，不冒充长期历史原文库。报告的预检 A、生成 B 冲突必须在调用模型前暴露；流式聊天不能先发 token 后发现证据冲突。
3. **S3 多库与双清单**：知识库卡展示“当前可检索 X / 源文件 Y / 待同步 N / 解析失败 M”。**管理清单显示全部源文件、失败原因和重试入口**；只有对话选文档和报告预检的可选清单过滤到当前有效索引。某个被选库仍有有效文档且用户未逐份限定时可继续，但发送前范围摘要和结果必须显示未纳入数；任一被选库零有效文档，默认 409 并给“刷新/移除此库后继续”单击动作，不自动把六库变五库。用户显式限定的任一文档失效时，始终 409 指明库、文件与原因，要求重新选范围。用户点击移除后发起新请求，运行快照记录原请求范围、实际库/文档版本和排除原因；部分库可用也不能静默缩小显式白名单。网页专用运行沿用显式网页策略，不伪装本地库已就绪。
4. **R1 召回方案与冻结门槛**：候选为“标题/标题层 top40 ∪ 全库 chunk 命中文档”后统一精排；新增全库候选的截断必须由标注集证明不会重现漏检。实施前冻结不少于 40 条正例（标题、仅正文、前 40 份弱命中、同义/缩写各至少 10 条）及 10 条无证据反例，记录库/白名单、金标准文档和版本。对比候选、任务上限及 token 裁剪后的**最终入模来源**、真实输出引用、p50/p95。建议门槛：前三类 30/30 至少一份金标准进入最终入模证据；同义/缩写至少 8/10，总体至少 38/40；原已正确命中的冻结用例不得退化，10 条负例不得声称有证据，所有引用不得越界或伪造。固定 517 文档/5199 chunk 本地环境中热缓存检索 p95 ≤3 秒，另记冷启动；至少 10 条真实模型回答抽查，≥9/10 实际引用金标准且论断得到支持。任一门槛不满足不称“召回质量通过”，回看候选截断/上下文预算/模型引用。数字是**建议验收线**，样本与环境在实施前冻结，不能事后按结果下调。同义词扩展独立评测，不以一次 0.61/1.49 秒观察代替质量或延迟证据。
5. **G1 两种报告意图**：“主题研究”仍要求主题证据；“合格资料综述”仅在用户选择该模式或明确要求综述这些资料时启用，从同一严格填表日期/类别/文档筛选取得全部合格资料，不因主题词零命中拦截。主题无命中给“改做合格资料综述”单击动作，不自动转换；没有逐份选择时写明“所选库符合条件的 K 份”，不称“我选的 K 份”。当前 500 份无填表日期的 Markdown 继续排除计数，项目起止年不能代替；零合格或零可读证据不调用模型写事实报告。标题与范围说明不能把合格资料综述写成整个知识库的结论。
6. **G2 全集覆盖的最低证据标准**：全集仅指**全部合格资料的已解析文本**，不保证图像/OCR 与原 PDF 全部信息已理解。按页/章节确定性切分每份非空解析正文，记录总段数、成功送入证据摘要模型的段数、截断/失败段、文档版本与定位；一份“文本已处理”要求每个非空段无截断、摘要成功且可回到原段。摘要只是模型概括，不等于事实逐项核实。综合模型使用每份成功摘要及其原段来源；分别计数 eligible、全文文本已处理、部分处理、综合入模摘要和未覆盖，不能把只读前几页称为全文。任一合格文档分段/摘要失败，默认不产出“全集已完成”；保留失败草稿，并只在用户明确选择时生成题名、范围与遗漏清单均标注的“部分综述”。超预算先分批处理可容纳的各段，仍不能覆盖则提示缩小范围，不静默截取。当前 `assemble_reports` 截断路径不得继续称为“实际入模全文”。

**接续顺序与验收**：S1/S2/S3 先封住当前资料与版本边界；G1/G2 再开放一键综述；R1 标注与基线测量可先并行，但门槛未过不宣称检索改善。端到端证明：① 更新解析失败或事务失败，不让旧索引/半新版进新回答和报告，历史无原文快照时诚实提示；② 预检后、冻结期间换源触发 409，冻结后只用同一证据包；③ 六库中一库不可用、显式文档失效均不被静默剔除，管理清单仍能处理失败项；④ 弱命中前 40 份不挡第 41 份，检查最终入模与引用；⑤ 当前 7/517 样本的资料综述逐份记录文本段覆盖，500 份缺日期仍排除，摘要失败不冒称全集。实施前核对当前未提交工作树与文档写入归属，按实际修改路径做必要检查。

### 16.32 §16.31 第一批代码实施与剩余验收（2026-09-27，工作树未提交）

- **已落地的代码路径**：`Knowledge.put` 将正文、chunk 与成功文件指针放入同一 SQLite 事务；导入记录成功源哈希、观察到的哈希与错误原因，更新 PDF 使用源哈希专属 MinerU 缓存，避免旧解析结果配上新源哈希。图片只从与成功源哈希对应的版本缓存选择；既有未绑定版本的解析缓存不再自动供图，需刷新源文件才能恢复图片。新检索、报告预检和可选文档清单过滤失效文件，管理文件清单保留它们及原因；原 PDF 预览在检测到失效时拒绝。多库零可用库不自动剔除，显式失效文档返回冲突。聊天每轮冻结 SQLite 检索视图，复制前、快照内、复制后比对当前文档版本与成功源哈希，运行引用在有源文件时记录哈希。检索把标题窗口外有正文词面命中的文档加入精排。报告新增显式主题研究／合格资料综述；综述将相邻短章节合并分段，逐段摘要全部合格资料的解析文本，记录版本、字符范围和段数，摘要与终稿共用运行时限；摘要截断、空正文、超时或汇总预算不足时不保存“全集”。
- **检查及其边界**：集成工作树上 `uv run pytest tests -q` 为 216 passed；前端 36 项 Node 测试、TypeScript、Vite 构建与 `tests/browser_tasks.py` 离线浏览器链通过；`knowledge`、解析、检索、报告、图片、graph 与相应测试的 Ruff 定向检查通过，`main.py` 仍有既有 B008/BLE001 告警。受控真实模型调用用临时 SQLite 副本对 7 份合格资料中最短的 1 份（31,296 字符）完成综述：当时未合并短章节，共 27 段、约 247 秒，产出 4,347 字符和系统来源附录；之后仅做只读分段测量，同一文本合并成 8 段、非空白字符覆盖不变，未再次实测模型耗时或事实保真。真实 7/517 全范围综述及 R1 预定的人工标注集/延迟门槛均未验，不称质量达标。浏览器链使用接口替身。
- **剩余缺口**：聊天每轮复制 SQLite 一致性只读视图，检索、补检索与正文读取均使用同一视图，并在首个回答 token 前复核引用的当前源文件；SSE 已建立后冲突表现为错误事件，不是 HTTP 409。报告预检与解析正文在模型调用前复核，仍缺跨 SQLite 与外部文件系统的严格事务快照。同尺寸且保留原修改时间的外部源文件替换，当前按元数据快速判断时可能漏检；真实 7 份综述的时间/成本、事实保真和 R1 的 40 条正例、10 条反例及模型引用抽查尚未验证。不能将本批描述为 §16.31 全部完成。

### 16.33 集成进度审核与接续顺序（2026-09-27，规划者独立核对）

**核对基线**：HEAD `bd53f54`；G10f 图文基础链已有提交，§16.31 的资料一致性、跨库范围、正文召回与合格资料综述是当前**未提交工作树**的首批实现。§16.32 所列全量后端 216、前端 Node 36、构建与离线 `browser_tasks.py` 为实施者记录，本轮未独立全量重跑。规划者在当前集成工作树独立运行相关后端四组用例 **71 passed**；`git diff --check` 本轮文档收口后复核。不能把这些数字混成同一次验证，也不能以定向通过宣布 §16.31 或图文报告端到端完成。保留其他写入者的未提交改动及未跟踪文件，提交前按文件归属核对。

**分项状态与证据**：

| 范围 | 当前判断 | 尚缺的完成证据 |
|---|---|---|
| G10f 图文报告 | PDF 图候选、图注/页码、不可变附件、页面预览、DOCX 和 ZIP 的代码链已提交；本轮运行 `tests/browser_figures_live.py` **失败**，页面回退为“未找到可可靠复用的图”。只读扫描本地 140 份 `middle_json.json`，全部在旧 `parsed/<rel>/` 路径，零份在新 `.versions/<sha>/` 路径；现有浏览器脚本也仍创建旧布局。故“代码已提交”与“本地已有解析结果可配图”必须分开。 | 在源 PDF 内容哈希与解析产物确能对应的前提下，按下方精简范围优先使用当前格式，必要时只重解析所选样本；不要求新增旧缓存迁移器；更新浏览器样例到有效契约，实测本地 PDF 的图片、图注、源页、预览、DOCX 和 ZIP 均一致。无匹配仍文字回退，不以整库重跑 OCR 掩盖兼容问题。 |
| S1/S2/S3 资料版本与可用范围 | `Knowledge.put` 的 SQLite 正文/页/chunk/成功文件指针已同事务写入；新运行排除失效索引，管理清单保留失败项；聊天冻结 SQLite 只读视图，报告开始前核对筛选资料。属于首批实现。 | SQLite 外的源文件和解析缓存不在同一事务；同尺寸且保留修改时间的源文件替换可能绕过快速判定。补所选源文件内容哈希核对及并发更新回归，明确冻结前发现范围冲突应返回 409；若 SSE 已建立才发现冲突，定义可识别的范围变更事件与前端恢复动作，不能把普通 error 事件记成 HTTP 409。记录冻结时实际库、文档版本与源哈希；仍不声称跨库全局原子快照。 |
| G1/G2 报告两种意图 | 主题研究与合格资料综述已成显式模式；严格填表日期/类别筛选不变，500 份缺日期的本地 Markdown 不纳入。综述按已解析正文分段摘要并记覆盖，截断、空文本和超预算阻止冒称全集。 | 实施者仅在合并短段**之前**以真实模型跑通最短 1 份 31,296 字符资料，耗时约 247 秒；合并成 8 段只读测过，未实测新耗时与内容保真。先以同一份跑合并后受控样本，再测 7 份合格资料的总耗时、成本、覆盖/遗漏、引用与事实支撑；超过运行预算就给缩小范围/部分综述显式选择，不静默截取，也不先称“7 份全集已可用”。 |
| R1 召回质量 | 正文词面命中文档已加入标题前 40 份之外的候选，消除已知的弱标题命中遮挡路径；仍主要依赖词面匹配。 | 按 §16.31 先冻结 40 正例/10 反例与环境，对比候选、最终入模、真实引用及 p50/p95；达到该节所列不退化、召回、越界引用和延迟门槛后，才标“质量通过”。代码修复不等于同义召回或实际引用通过。 |

**精简后的接续安排（用户明确要求：不处理所有遗留物，清理历史与冗余逻辑；替代此前的详细三批设计）**：以当前支持的数据格式和主流程为准。保留源文件、会话与成果，不为所有旧格式新增自动修复、迁移或兼容层；不支持的旧输入明确提示按当前方式重新导入/新建，不能自动清空或伪装恢复成功。

1. **先做一轮小范围清理。** 优先核对 `src/agent/corpora.py` 的 `migrate_layout` 与 `src/main.py` 的 `workspace_path`：两处均有旧会话库迁移，但触发范围不同，先确认当前部署与自定义路径的实际需要，再删除已无输入的路径或收敛到一个入口。核对 `src/agent/config.py` 的废弃 `default_corpus` 配置、corpora 模块旧默认库说明、workspace 的旧确认注释/字段使用；确认无行为用途后连同专属引用和过时测试一起移除。仅按真实调用与当前数据判断，不因命名带 legacy 就删除，不做全仓库重构。清理记录只需列“删了什么、为何已不用、现有场景如何验证”。
2. **收口一条主流程。** 复用现有上传入口、报告卡与成果导出：对话直接到目标库添加资料，一句需求即可生成报告，参数沿用可见默认值，详细调整折叠。修复会导致错误资料进入回答、当前成果读不回或导出损坏的问题；低价值历史界面、无人使用的分支和重复判断随所在改动一起清理，不再扩展框架。已有代码路径尚未完成验收的仍如实标注，不能借清理删掉当前必需功能。
3. **图文只保障当前格式。** 撤销“必须为全部旧解析缓存建设安全绑定/迁移能力”的前置要求。直接支持有可靠源版本的新缓存；旧缓存不兼容时提示所选 PDF 需要重新解析，按需处理该文件即可，当前文字报告可继续。现有旧缓存保留，不批量删除或全库重跑。更新 `browser_figures_live.py` 的输入格式并用一个真实 PDF 验证预览、来源页与 DOCX/ZIP；不为覆盖所有历史布局增加分支。

**清理边界**：`src/main.py` 的旧报告成果回读目前也承担报告建件失败后的读取兜底，不能直接删；先保留现有最小回读，不继续扩展未知历史格式。已存成果/会话的缺字段默认、来源版本校验、上传同名保护与原子发布继续保留，它们保障当前数据和行为。旧 `name`/rel-keyed 配置转换等一次性兼容，只有核实当前支持数据已规范化、入口与契约同步后才可移除；未发现旧数据也不等于获准删除磁盘文件。没有当前使用依据的深度修复、通用迁移器、历史全文版本库、后台队列均不列入本批。

**最小验证与停止条件**：复用受影响的已有浏览器/API 路径，验证“上传/刷新 → 带来源问答 → 报告 → 成果回读/导出”；只检查本次删除影响的旧记录读取或自定义目录场景，不为每项清理新增测试。图文另用已有图文链。真实模型从一份资料开始；扩大到七份只用于验证原定七份综述能力，不能阻塞无关清理。R1/OCR 总体质量验收仍未通过，不作为每次清理的前置全量任务；不因此下调原验收线或宣称完成。达到当前主流程和被影响行为的完成条件就交付，不继续追逐所有遗留问题。

**本次复核边界**：优先读取项目约束，再核对当前 HEAD、未提交清单与上述相关代码；HEAD 仍为 bd53f54。本次没有重新运行应用测试、浏览器或付费模型；上表 71 项通过、图文浏览器失败为前次 §16.33 核对证据，不包装成新增结果。仅修改规划文档。开发中运行受改动影响的已有最小场景，收尾按项目约定执行全套一次；不重复增加锁定内部实现的测试。

**交付证据**：每批记录提交/工作树边界、测试是全量还是定向、浏览器是否真实本地服务及模型是否替身；图文至少提供本地 PDF 的源哈希、图注/页码/图片字节一致性与导出回读，综述提供逐份逐段覆盖和失败原因，召回提供冻结题集与最终引用。未满足者保留“部分实现/有限验证”状态。

### 16.34 §16.33 接续：前端构建与小范围清理（2026-09-27，工作树未提交）

- **前端构建**：本机裸 `npm run build` 调到 `/mnt/d/.../npm`（Windows 版），因 WSL UNC 路径启动 `cmd.exe` 后找不到 `tsc` 而失败；使用 Linux Node/npm 优先的 `PATH="$HOME/.local/bin:$PATH" npm run build` 已通过。`launch.sh` 在 Linux `node` 未入 PATH 且用户目录有 Linux Node/npm 时自动优先该目录，README 说明 WSL 环境要求。`App.tsx` 按导航加载主页面，并将大型浮层拆成独立 chunk（常驻浮层仍在首次渲染时加载）；同一次生产构建最大 JS chunk 约 297.14 kB，先前约 626.81 kB 的 500 kB 告警与动态/静态双导入提示均未出现。Node 36 项通过，`browser_tasks.py` 离线浏览器链通过；构建成功不等于所有页面均做了真实服务联调。
- **清理范围**：移除启动时的 `.demo_langchain/`、`data/` 一次性自动迁移及只服务该迁移的常量/测试；当前工作区不存在这两个旧目录，现有 `.knowledge/` 数据未移动或删除。移除未参与选库的 `default_corpus` 设置和示例，首库仍按目录名排序。保留 `workspace_path` 对库内旧会话库到自定义 `state_dir` 的拷贝，因为启动仍调用且已有自定义目录用例；保留改库名时实际使用的 `rewrite_origins`。受影响语料/状态用例 24 passed。旧布局输入如仍存在，不会再由启动自动迁移；README 已说明。
- **当前格式图文**：`browser_figures_live.py` 改用源 PDF SHA 专属 `.versions/<sha>/` 解析目录，并在临时本地 API/浏览器中核对原图字节、图注/第 2 页、预览、DOCX 嵌图和 ZIP 附件；模型为离线替身，PDF 为测试生成的有效三页文件。该检查不证明历史 140 份未绑定源版本缓存可直接配图，也不证明真实 MinerU 的图注/OCR 准确率。旧缓存不迁移、不删除；需对所选 PDF 重新解析才可启用配图。
- **集成收尾**：`uv run pytest tests -q` 为 215 passed（上一批 216 减去删除的旧迁移专属用例）；`bash -n launch.sh` 与 `git diff --check` 通过。`browser_artifacts_live.py` 的离线报告替身补齐当前 `visible_sources` 契约后，临时真实服务的回答保存、报告、成果版本与成组恢复浏览器链通过；`browser_figures_live.py` 记录源 SHA `8f718a2733f2366d43485979f1f545f73c7f21d7709dea2d22a2243ee3759071`（临时测试 PDF），并通过上述图文导出检查。前端构建使用 Linux Node/npm 的显式 PATH 运行；未把裸 `npm` 在本机指向 Windows 的问题误记为应用代码编译失败。
### 16.35 报告年份从填表日期改为项目起止区间（2026-09-28，工作树未提交）

用户明确指出医疗库文件名含项目起止年份，大量 Markdown 无填表日期，并要求删除不正确旧设计。此前强制填表日期来自 2026-09-23 用户口径记录（DECISIONS“实施者接续与报告日期口径”），后来写入 PROJECT 和 §13.5/§16.31；2026-09-27 已查明医疗库 500 份 Markdown 无该字段，却只改提示未改筛选。本次以新用户指令覆盖旧口径，当前权威要求见 PROJECT“专项报告”和 DECISIONS“2026-09-28 报告年份口径替换”；旧章节是历史过程，不能再当现行验收条件。

- **实现**：报告 `year_from/year_to` 改为项目年份窗口，按文件名起止区间相交选资料；无有效区间才因年份元数据缺失排除。删除报告筛选中的填表日期读取、正文 `研究期限` 备用路径及日期字段统计；类别仍由头部显式标签解析，只有用户指定类别才过滤。预检、报告提示、task4 intake、运行范围摘要、前端卡片和侧栏统一显示新口径。指纹带 `year_basis=project_period_overlap`。历史报告正文不重写，列表仅用中性“年份窗口”表示旧参数。
- **数据与验证边界**：只读核对医疗库当前 517 份有效资料文件名均可解析项目区间；2021–2025 窗口、类别不限预检为 517/517，`period/year/category/stale` 排除均为 0。集成工作树后端全套 `uv run pytest tests -q` 为 215 passed；前端 Node 36 passed、TypeScript + Vite 构建通过（最大 JS chunk 297.13 kB）；`browser_tasks.py`、`browser_artifacts_live.py`、`browser_figures_live.py`、`browser_custom_tasks_live.py` 均通过，`git diff --check` 通过。尚未验证真实模型在 517 候选下的主题研究或综述预算；517 份预检入选不等于 517 份入模或综述完成。旧 AC-05b 填表日期 OCR 可信度阈值不再是当前报告筛选的门槛。

### 16.36 query 2026-0928 1006：四维需求接续（2026-09-28，仅需求整理）

完整需求调整报告与范围在 [PROJECT §10](PROJECT.md#10-四维知识整理与技术研判需求调整报告2026-09-28)，原始 query 保持不变。新增目标为每份报告提取“场景、问题、技术、成果”，再在现有知识库中浏览与研判；固定 schema、target JSON、按需批量与界面组织为推荐设计，未实施。

下一步先用现有已解析报告验证“单份提取→四维展示→原文证据”一条链，再扩展同库聚合/筛选及复用已有任务。复用现有正文版本与文件管理，不要求先清理所有历史问题，不启动知识图谱或新任务引擎。提取无项目年份门槛；转入报告生成时遵守 §16.35 的项目区间口径，旧填表日期要求不再生效。

§16.34–16.35 为实施者最新执行反馈，215 项测试及当前格式图文浏览器通过未由本轮重跑；§16.33 的图文失败是较早基线，不应继续表述为本轮实测。当前 HEAD 仍为 bd53f54，相关代码/文档修改在工作树；本轮只做源码与文档核对、需求整理，未改源码、语料或调用模型。


### 16.37 GitHub 进度快照与四维待集成项（2026-09-28）

本轮按用户要求整理并提交现有更新；延续规划/审核职责，不修改业务代码、不应用 coder 补丁。提交至 `codex/progress-20260928` 进度分支，非发布版本，main 不变。提交前基线为 `bd53f54`，已与 origin/main 对齐。

- **已有工作**：§16.32–16.35 的资料有效性/读取快照、正文召回、合格资料综述、当前格式图文、小范围旧逻辑清理、项目起止区间筛选，以及四维首批源码、提示词、接口、页面和已有用例纳入快照。前述 215 项及浏览器结果是先前实施记录，不能代表当前四维集成已通过。
- **四维当前状态**：从“仅需求整理”推进到首批代码和待集成修复；尚未完成。`src/targets.py`、四维 UI 等新增文件随本次快照保存。最终有效补丁为 [fixes5d](interactions/target-facet-handoff/target_facet_fixes5d.patch) 与 [fixes6b](interactions/target-facet-handoff/target_facet_fixes6b.patch)，从本地交接目录原样复制，未应用；旧 fixes5/5b/5c/6 不再使用。fixes5d 统一证据放大预览并恢复四维面板，fixes6b 验证模型调用期间资料更新拒绝发布。
- **本轮独立检查**：两份有效补丁 `git apply --check --recount` 通过；当前工作树 TypeScript 检查失败，定位 `frontend/src/store.tsx:50` 的 TS1109 和三项 TS1005，与待修联合类型一致；`bash -n launch.sh` 通过。`.venv/bin/python` 无 pytest，后端测试未运行；生产构建、浏览器和真实模型未运行。`git diff --check` 发现原始 query 第 142 行行尾空白，保留用户原文，不宣称检查全绿。补丁文件的空白上下文作为补丁原文保留。
- **外部反馈边界**：coder 报告 fixes5d/6b 副本 strict 类型检查及前端 Node 36 项通过；本轮未独立复跑副本，不能代替当前工作树验收。
- **未提交范围**：探针、提示词临时副本、tsbuildinfo、uv.lock 和本地 .env.example 修改留在工作区；不上传真实知识库、密钥或验证缓存。未删除任何用户文件。

**下一步只做集成收尾**：实施者应用上方两份补丁，在 Linux Node 环境完成类型检查/构建，使用配置好 dev 依赖的 Python 环境运行目标提取行为用例；不要把环境重建或全库解析当作前置。浏览器覆盖 docPanel 开/关下 PDF 可靠页码、正文高亮/滚动、关闭返回原四维分区、轮询停止后的手动继续查询。记录模型替身与真实服务边界；四维链完成后再推进同库筛选/聚合，不扩图谱或任务引擎。真实模型大范围综述和召回质量仍依 §16.33 待验。


### 16.38 集成状态对齐与运行中提取（2026-09-29）

本轮按用户要求梳理进度并提交 GitHub；仅更新进度文档并提交已有忽略规则调整，不修改业务代码、不重启服务、不改变正在进行的四维提取。以下取代 §16.37 的当前状态，保留其历史记录。

- **已集成**：`66aa288` 已应用四维证据统一放大预览、原文高亮与返回、运行中任务手动查询及提取期间文档更新拒绝发布用例；源码核对一致，不再重复应用交接补丁。`47a9242` 新增 `tests/browser_target_facets.py`，以 API 替身覆盖四维状态、PDF 页码、正文定位、返回及轮询结束后手动查询。脚本存在不等于本轮执行通过。
- **仓库状态**：本轮开始时 main 与 GitHub main 均为 `c91f0ca`。此前 `b8ecf25`、`c91f0ca` 已提交源资料、解析资料及部分 target；本轮不改变既有数据提交。现有 `.gitignore` 调整将知识库状态库、数据库与向量目录排除，源资料与解析/target 不再整体忽略；本轮按明确路径暂存，仅提交此规则和两份进度文档，运行中新生成的 target 不纳入。
- **进行中**：用户明确四维信息提取任务仍在运行。不得按 target 文件数量推断全库成功，亦不停止、重跑或清理运行。实施者本地记录称部分批量结果来自独立提取脚本，存在失败记录不落盘等与产品入口不同的行为；该记录未由本轮验证，不能把这些产物当成产品 API 全链验收证据。
- **验证边界**：此前集成记录报告前端生产构建通过；浏览器提交说明描述离线替身覆盖，本轮未重跑浏览器。独立执行 `.venv/bin/python -m pytest tests/test_app.py -q -k target` 因环境缺少 pytest 未能运行；不为文档提交同步或重建正在使用的环境。旧 215/216 项及副本 36 项结果不转记为当前全库四维验收。

**下一步**：先让当前提取任务继续；结束后汇总实际成功、未完成、失败及待更新，抽查四维事实、预期/已取得成果区分与证据定位。确认独立脚本输出能被产品读取及正确判定版本；随后在独立验证环境跑目标 API 用例，并核实 docPanel 开/关下的浏览器闭环。只补真实失败点，不增加队列、图谱或兼容框架。提示词条目上限与 relations.basis 约束差异待按现有 schema 核对，不在运行期间修改。

### 16.39 前端顶层设计方案交付（2026-09-29，仅文档）

按本次用户要求，结合当前源码、§9–§10、历史 UI 迁移与四维 v2.1 记录，并查询 GitHub 参考项目及官方文档，完整方案集中写入 [PROJECT §11](PROJECT.md#11-前端顶层设计优化方案2026-09-29提案未实施)。包含技术路线比较、资料表示与多提取方案、导航与交互、目录和状态职责、类型与接口、组件样式、性能边界、分期步骤和待确认问题；候选接口/布局与当前实现分开标注。

基线为 `40b3f34402251b64f191fc0ad65758f48283e392`，开始时已跟踪文件无差异；本次仅修改 PROJECT/ITERATION，并修正两份文档开头仍称“四维尚未实施”的过时入口。不修改用户原文、DECISIONS、业务源码、依赖和真实语料，不干预 §16.38 的运行中提取。外部参考的活动证据与限制见 PROJECT §11.14。

本次检查结果：新增正文包含 15 个三级章节，末节为待确认问题；Python 3 检查新增正文相对文件链接均存在、代码围栏成对；`git diff --check -- .logsdev/PROJECT.md .logsdev/ITERATION.md` 通过。已做源码事实与历史语义交叉核对，未运行应用测试、构建、浏览器或真实模型。方案交付不等于技术选型已采用，也不等于实现验收。后续若启动重构，按 PROJECT §11.13 的纵向切片推进；当前提取/质量核对仍沿用 §16.38，不以新规划替换未完成工作。


**本轮方案自审与修订（同日，用户要求重新审阅规则）**：重读 AGENTS、DOCUMENTS 及 planning/development/writing/verification，按“最小充分、冲突替换、验证按实际行为”审核 §11。此次为作者自审，不称独立审查；原方案仍在工作区未提交，本次原位修订，保留上方首次交付记录。发现与处理如下：

| 位置 | 具体问题与维护成本 | 已修订设计 / 对行为的影响 |
|---|---|---|
| §11.1/11.8/11.11 | 摘要默认 Zustand，正文却说可选；另设整页存储快照会多一套恢复协议 | 统一 React 局部 reducer/Context；移除默认 Zustand 与整页 sessionStorage，保留浏览返回与 URL 刷新恢复 |
| §11.4/11.8 | 提前规定方案版本目录、代码分发与常驻 job 监视，增加同步/生命周期成本 | 每方案一个定义文件，结果固定提取依据；处理视图按需查询，不建分发和常驻监视系统 |
| §11.9 | 为命名风格普遍复制 DTO 展示模型，形成字段同步负担；类型生成和换客户端绑定 | 直接消费生成类型，只为组合行为建小类型；fetch 可保留，生成类型不强制换库 |
| §11.4/11.5 | UI 方案捆绑双通道检索、目录按层加载，没有本轮实测必要性 | 复用正文 BM25 和已有文件清单，保留全文入口；服务端性能改造以实际瓶颈为条件 |
| §11.13 | P0–P5 把基线/基础设施分为前置阶段，容易推迟业务交付 | 改为首批一条研究闭环，多方案和结构阅读后续分开；逐路径列同批删除项，不先全站重构 |
| §9/§10/§11.1 | 旧五入口固定、单 schema 及历史阶段限制可能与新方案竞争；§10 还把筛选计数误写成已实现 | 区分旧实现事实与后续设计，明确新设计替代旧限制，纠正筛选状态；替代原则记入 DECISIONS |

缩减未取消原始需求中的多提取方案、结构导航和证据可追溯；主要删除提前建设的机制与重复状态。下一次实现沿用 §11.13 所列现有浏览器/API 行为路径验证，当前仅检查文档一致性、链接与差异格式，不运行应用测试或改动提取任务。


**四维历史提示词回溯与方案补齐（同日，提取仍在进行）**：本轮按用户指令读取 query 四维需求、`interactions/report-naming-and-facet-2026-0928.md` §3–§4、`archive/project-md-pending-2026-0928.md` 条目 B/C 及确认记录；对照 `target_extract.md`、提示装配入口、`targets.py`、task2/3/4、四份模板和 graph/reports 实际生成链。历史完整提示词位于贯通方案 §3.3（机器提取）和 §3.4（阅读框架），未复制成另一份可编辑提示词。

发现当前磁盘仍为提示版本 1、缺少阅读框架文件、task2/3/4 未接四维框架、模板缺四维章节；graph/reports 未见 target 输入，因此“能展示四维”不等于“已经按四维研判”。运行进程/独立脚本实际采用的提示词未核对，不从源码推断本次全部产物口径。历史“升级可接受”不作为立即修改运行任务的依据。

已在 PROJECT §10.7–§10.8 集中承接四维提示要求、代码差距和运行中升级边界；§11.5.4 补齐筛选、证据、只读对照、显式任务范围、事实/推断和成果回溯；§11.13 加入对应实施与验证路径。自审修正历史稿“四维各一次”的基数误导、综合模板编号冲突，并指出条目上限未写入提示、同名合并与关系声明不等于语义正确的限制。提取、阅读组织两种职责保留，旧提取规则切换时直接替换，不增加双版本运行分支。

本轮仅改 PROJECT/ITERATION；此前 DECISIONS 修改保留。没有修改提示词、版本常量、模板、源码或 target，没有停止、重启或重跑提取，也没有调用模型。当前提取收尾继续按 §16.38；方案实现按 §11.13。本轮 Python 3 检查 §10.7 起的相对文件链接均存在、代码围栏成对，并核实阅读框架文件缺失及提示版本仍为 1；三份已修改文档的 `git diff --check` 通过。未运行应用测试、浏览器或模型质量验收。

### 16.40 四维全库提取收尾与版本口径阻塞（2026-09-29，数据侧完成；发现产品侧全部 stale）

**数据侧**：11 个库 1122 份 target 全部落盘并提交（`e1f9ab4` = `origin/main`）。逐库数与 `datadb/docs` 相等：医疗 517、机器人自动化 510、金融经济 20、材料 14、农业 13、大数据 10、生物识别 10、隐私保护 10、生物医药 9、信息智能 5、社会治理 4。

**只读核对结果**：

| 核对项 | 结果 |
|---|---|
| `schema_version` | 1122 份均为 1，与 `SCHEMA_VERSION` 一致 |
| `facets` | 均为 4 项 list（`key`/`state`/`items`，条目含 `id`/`name`/`desc`/`evidence`） |
| 证据 | `evidence[].quote` 为原文逐字子串，附 `locator`（basis/page/chunk_id）与 `version` |
| 成果三态 | 均落在 已取得/预期/原文未明确 |
| `relations` | 均为 `{"from":{dimension,item_id},"to":{...},"basis":"原文明示"}`，与 `_normalize_segment` 输出一致 |
| `version` 与 docs 表 | 11 库抽样 155 份，不一致 0 |
| **`prompt_version`** | **1122 份为 2，而 `src/targets.py:23` 的 `PROMPT_VERSION = 1`** |

**阻塞机理**：`_record_state` 把 `prompt_version != PROMPT_VERSION` 判 `stale`；`_summary` 对 stale 返回空 facets 并标“未处理”，`target_detail` 抛 `TargetStale`。前端 `TargetReports.tsx` 对 stale 显示“待更新”且四维按钮 disabled——**1122 份当时全部不可浏览**。属元数据标注与代码常量不一致，不是内容缺失。

**为何不擅自改代码常量**：§10.8 禁止伪改版本号冒充重提取；§16.39 已核实磁盘 `target_extract.md` 仍是 v1 提示词、v2 增强稿未写入，改常量等于假升级。该批产物本按 v1 契约结构生成，故“产物 2→1”是纠正错误标注。

### 16.41 版本口径纠正与残留清理（2026-09-29，已执行，待复验）

用户选择方案 1（改数据）。执行内容与边界：

- **批量修正**：1122 份 target 的 `prompt_version` 由 2 改为 1，JSON 其余字段与格式不变（`ensure_ascii=False, indent=2`）。
- **探针文件**：`.knowledge/自然科学基金-AI与社会治理/target/.probe_write.json`（原 11 字节，误提交）内容已清空为 0 字节，并 `git rm --cached` 移出索引（索引计数由 1 变 0）。**文件本体因映射限制未能删除**，需在 WSL 内执行 `rm` 清除。
- **写入通道限制（本次实测，供后续参考）**：通过 Git Bash 访问该映射时，Python 直写（`open('w')`、`os.open(O_TRUNC)`）、`sed -i`（rename）、`mv`、`rm`（safe-delete 回收站不支持网络盘）均被拒，只有 **bash 重定向 `cat tmp > file` 与 `cmd >> file`** 可用；`.logsdev/ITERATION.md` 因此前用 UNC 路径被拒，本次改用 Z 盘映射 + `cat >>` 追加成功。
- **未做提交**：修正后的 1122 份数据与索引变更仍在工作区，未 commit，待复验后由用户决定是否提交。
- **验证边界**：尚未在产品 API 路径上复跑（本会话 `.venv/bin/python` 不存在、系统 `python3` 无 pytest），也未重跑前端构建与浏览器链；“界面可读”是按 `_record_state` 源码逻辑推得，待实测确认。

**下一步**：复验 `_record_state` 判定为 `current`（脚本比对 + 若环境允许则跑 `tests/test_app.py -k target` 与 `tests/browser_target_facets.py`）；抽查四维事实、预期/已取得区分与证据定位；再推进 §11 前端重构、§10.7.3 的 task2/3/4 阅读框架与模板四维章节。

**复验结果（同日，修正完成后）**：批量脚本 `OK=1122 FAIL=0`，耗时 19m21s；`grep` 确认仍为 2 的文件 0、为 1 的文件 1122。只读复验脚本（复刻 `_record_state` 判定，检查维度键、成果三态、证据引文、version、source_hash、schema/prompt 版本）输出 **11 库合计 1122/1122 全部 `current`**，无 missing/invalid/stale。逐库：医疗 517、机器人自动化 510、金融经济 20、材料 14、农业 13、大数据 10、生物识别 10、隐私保护 10、生物医药 9、信息智能 5、社会治理 4，均与库内文档数相等。

**内容抽查（随机 3 份，seed=11）**：医疗 `e426bf19`（4 维各 1 项）、机器人自动化 `e0cd4934`（技术 2 项）、材料 `a462260b`（场景/问题 2 项、技术/成果 3 项）。三份的**引文全部在原文中命中**，`locator.basis` 分别为 `parsed_text`（Markdown 源）与 `pdf_page`（PDF 源带页码），成果 `status` 均为“已取得”，`relations` 3–5 条，`process.status` 均为“已完成”。抽查只证明这三份的结构与引文，不代表 1122 份的语义全部正确；§16.31 R1 的标注集与真实模型质量验收仍未做。

**当前阻塞已解除**：`stale` 归零后，前端 `TargetReports.tsx:143` 的 disabled 条件不再命中，四维按钮可点击并展示“有内容”。该结论由源码判定逻辑与复验脚本得出，**尚未在浏览器或真实服务中实测**（本会话 `.venv/bin/python` 不存在、系统 `python3` 无 pytest，后端测试与 `tests/browser_target_facets.py` 均未运行）。

**仍待处理**：① 是否提交这 1122 份改动与索引变更（未提交，等用户决定）；② 探针文件本体需在 WSL 内 `rm`（Windows 侧 rm/mv/PowerShell 均失败）；③ 跑 `tests/test_app.py -k target` 与 `tests/browser_target_facets.py` 做产品链实测；④ 再推进 §11 前端重构、§10.7.3 阅读框架与模板四维章节。

### 16.42 形式审查（grant-review 合并）：W8 规划已采纳，待实施（2026-09-29）

- **需求来源**：用户 2026-09-29 指令——新增一级入口「形式审查」（左侧边栏，与知识库/任务/成果同级），面向申报书预审；功能基础为 `.logsdev/archive/grant-review.zip`。功能分析与实施规划：[`archive/grant-review/`](archive/grant-review/README.md)（01–04，04 已经自审修订）；正式需求见 PROJECT §2 末节；裁决见 DECISIONS「形式审查集成裁决」。本节只保留执行安排与状态。
- **保留核心**：指南→动态检查清单（草稿→编辑→确认启用）、申请书基本信息模型提取（逐字段原文候选+并发人工保护）、五阶段审核管线（材料理解→规范审核→技术评议→结论复核）、预算确定性复算、证据库（Crossref 题录+人工录入）、报告（网页/Word/JSON）与历史记录、诚实性约束全套（引用服务端回填与校验、缺证据标 pending、预算前置检查、模型失败不伪造结果、重启中断恢复）。
- **删减旧逻辑（不迁入）**：legacy 手工规则引擎（words/age/required_sections/budget_cap 配置路径及 rules 手工编辑 UI）、`use_model=false` 独立程序核对路径、`local_review` 关键词评议与 TOPICS/seeded 人脸伪造硬编码、`02_guidelines` 阶段与提示词、`/documents/sample` 样例端点、内置 3 篇领域证据与 nsfc-general-2021 内置规则种子。形式审查要求模型已配置（与主产品一致），不做无模型兜底。
- **冲突裁决**：①审查材料（指南/申请书）为工作材料，独立于知识库语料，不入库不建索引，解析栈 pypdf/python-docx/olefile 与 mineru 管线并存；②demo 的 `/api/documents`、`/api/runs` 与既有接口语义冲突，统一挂 `/api/review/*`；③数据存 `$STATE_DIR/review/` 独立 SQLite（objects 单表）；④模型默认复用 `MODEL_*`，`REVIEW_MODEL_*` 可覆盖，**前置实测** deepseek-chat 对非流式 `json_object` 长输出的稳定性；⑤前端先按现有壳（IconRail+SidePanel+Outlet）实现，与 §11 前端重构正交，后续随迁移批次移动；导出保留 review 独立 python-docx 排版，不强行复用 G10e 管线。
- **已知功能缺口（W8-C 必做）**：动态清单 `method=calculation` 的检查项（字数/正文页数/日期边界）在 demo 中就没有计算工具，全部恒 pending（归档 `audit.py:127-128`）；W8-C 把字数/页数/日期计量实现为服务端计算工具注入审核（与预算复算同构：tool_ids 关联、结论受保护）。
- **分期与退出证据**：
  - **W8-A 后端骨架**：依赖核对（pypdf/olefile 大概率需新增）；`src/review/` 删减移植；`/api/review/*` 挂载；`$STATE_DIR/review/` 存储；模型配置适配与 JSON 输出前置实测。退出：curl 走通 指南上传→清单生成→启用→申请书上传→元信息提取→审核→报告→导出 的 API 全链。
  - **W8-B 前端入口与工作台**：`store.tsx:43/238-242`、`IconRail.tsx:5-11`、`Icons.tsx`、`router.tsx:34-50` 六处机械改动 + SidePanel 显式分支；工作台/报告页/原文侧栏/审核记录。退出：浏览器走通主链，窄屏无横向溢出。
  - **W8-C 指南库、证据库与计算工具**：指南库 UI（草稿→编辑→启用）、Crossref 与人工录入、计算工具接入。退出：真实指南生成清单并审核出逐项报告；calculation 项有程序结论而非恒 pending。
  - **W8-D 收口**：错误/边界文案、e2e 验收、文档同步（PROJECT §2/本节标实施）。
- **开放问题**：SidePanel 二级侧栏内容（倾向审核任务列表）；一级入口增至 6 个与 §11.15-1 导航归并提案的关系（登记为关联项，本轮按用户指令固定入口）；demo `data/` 不迁移。
- **本批只改文档，未改代码。**

**产品链实测（同日，通过 ssh 桥在 WSL 内执行）**：Windows 侧 `.venv/bin/python` 是 WSL 符号链接无法执行、`wsl.exe` 在安全黑名单内，故用项目 ssh 桥在 WSL 内运行。

- 环境：先 `~/.local/bin/uv sync --extra dev` 装上 dev 组（pytest/ruff 原先缺失），此后 `uv run pytest` 可用。
- `uv run pytest tests -q -k target` → **2 passed，215 deselected**。
- `uv run pytest tests -q`（后端全量）→ **1 failed, 215 passed, 1 skipped**。
  - 失败项：`tests/test_launch.py::test_launch_selects_environment_with_uv[parent]`，断言 launch.sh 在 parent 模式应选用 `tmp/.venv`，实际日志为 `uv venv --seed --python=3.12 <project>/.venv` 后用 project 内 venv。
  - **与本轮改动无关**：`tests/test_launch.py` 全文不引用 knowledge/target/prompt_version（grep 无命中），本轮只改 `.knowledge/*/target/*.json` 的 `prompt_version` 字段。属既有失败，未在本轮修复，也不计入四维验收。
- 探针文件：已在 WSL 内 `rm` 删除，社会治理库 target 目录现只剩 4 份有效结果。

**提交**：`90e8589 target: align prompt_version with the current extraction rule (v1)`，1123 个路径（1122 份 target + 探针文件移出索引）。提交在 9P 上耗时 13m43s，属该映射的正常开销。

**验证边界**：后端测试通过不等于四维语义正确，也未跑前端构建与 `tests/browser_target_facets.py` 浏览器链；`uv sync` 改变了 `.venv` 依赖集合，后续跑测试前无需重装。
### 16.43 W8-A 形式审查后端骨架：已实施并走通全链（2026-09-29）

按 §16.42 规划实施 W8-A，提交 `b2aa043 review: port the grant-review backend as src/review with the single guideline engine`。工作区仍存在其他写入者的未提交改动（frontend/*、launch.sh 等），本批未纳入。

**实施内容**：

- **删减移植**：归档 14 个后端模块 → `src/review/`（新增包，含 6 个提示词，删 `02_guidelines`）。按裁决删除 legacy 手工规则字段（`WordRule`/`AgeRule`/`words`/`age`/`required_sections`/`budget_cap`/`engine='legacy'`）、`use_model=false` 路径、`local_review`/TOPICS/seeded 人脸伪造硬编码、`/documents/sample` 端点、内置证据与规则种子；`RulePack.engine` 收窄为 `Literal["guideline"]`；`checks.py` 只保留预算确定性复算。
- **配置适配**：`model_client.py`（替代 `bailian.py`）读取 `REVIEW_MODEL_*` 覆盖、回退主配置 `MODEL_*`；httpx 直连保留，预算旋钮（max_calls/deadline/chunk/max_chars/tokens）保留；删除百炼域名校验与 `enable_thinking` 特有参数；提示词改包内路径。
- **存储**：`storage.py` 的 DATA 改为 `$STATE_DIR/review/`（当前解析 `.knowledge/.state/review/`），objects 单表 + 中断任务恢复并入主应用 lifespan；上传/指南/报告目录随 init 创建。
- **挂载**：`routes.py` 以 APIRouter 注册 17 个 `/api/review/*` 端点进 `src/main.py`；`model_client` 兜底异常补 `logger.warning(exc_info=True)`（API 仍返回通用文案）。
- **依赖核对**：pypdf 6.19.0、olefile 0.47 已随既有依赖安装（transitive），未新增；python-docx/httpx/fastapi 复用。

**前置实测（W8-A 第一步）**：实际配置 `deepseek-flash`@`api.deepseek.com`。短 JSON 0.7s、长 JSON（5816 字符/20 项）32.5s，均 `finish_reason=stop` 且 JSON 可解析 → **通过**，无需 `REVIEW_MODEL_*`。发现其为推理模型，`reasoning_tokens` 占输出预算（实测 6481 中 3366）。

**全链实测（curl 走通，真实模型）**：

| 阶段 | 结果 |
|---|---|
| 指南上传 → 清单生成 | 200，`guide-544454c1bc55`（2026 面上填报说明），38 项 checks（model 18 / manual 15 / **calculation 5**） |
| 启用 | `confirmed=true`，version 2 |
| 申请书上传（deepfake-2021.pdf，61 页） | 200，元信息提取 completed（title/fund/category/year/birth/budget 均 extracted，domain conflict 留待确认） |
| PATCH 确认元信息 | 200 |
| POST /runs 审核 | completed，约 12 分钟，17 次调用（01×6、03×4、04×1、05×6）全 completed |
| 报告 | findings 50（pass 11 / warning 2 / pending 31 / na 6 / **issue 0**），technical cards 8 |
| 导出 | `/export/json` 304 KB、`/export/docx` 61 KB，均 200 |

**质量抽查**：5 个 calculation 项全部 pending 并明确说明缺计量工具（正文 30 页、合作单位 2 个、资助期限、500 字摘要、5 篇论文）——如实印证 §6 缺口，属 W8-C 范围；rule-match 对 2026 版指南 × 2021 版申请书正确标 pending；44/50 findings 带页码引用；issue=0 符合诚实性约束（不因缺证据判违规）。

**实施中发现与修复**：

1. `max_tokens` 默认 6000 被 reasoning_tokens 顶穿 → `finish_reason=length` 截断，清单生成 502。默认调至 16000（上限 32768），实测环境用 `REVIEW_MAX_OUTPUT_TOKENS=28000`。截断抛错不造假，属诚实失败。
2. 兜底 `except ... from None` 吞掉真实异常 → 补完整日志后定位：失败的 01_extract 调用无 usage，属响应前异常；同 payload 独立探针复现成功（50.8s/18 items），重跑后全链通过。
3. 环境教训（记入 memory）：`pgrep/pkill -f <字符串>` 会匹配 ssh 远程命令自身命令行导致自杀；`cat 不存在文件 > 目标` 会先 truncate 目标再报错；重启服务应按端口查 PID。

**成本**：本次全链总 tokens ≈ **451,096**（含 reasoning）；reasoning 占比高，单次全链审核成本不可忽略，生产使用需提示（DeepSeek 具体单价 [待核实：官方定价页]）。

**验证边界**：后端 API 全链已通过 curl 实测；前端入口与工作台未实施（W8-B）；calculation 计算工具未补（W8-C）；浏览器链未跑；后端测试套件本次未重跑（此前基线 215 passed + 1 既有失败）。

### 16.44 检索假无匹配修复：DF=0 查询词不再计入覆盖率分母（2026-09-29）

**现象**：task1 对医疗库（517 份）提问「本库影像与病理 AI 辅助诊断有哪些项目？按疾病归类，并说明数据来源与任务类型的分布」返回「当前知识库中没有匹配的报告」。对照短查询（「影像与病理辅助诊断」「医学影像 人工智能 诊断」）均可命中，证明库与链路正常。

**根因（实测证据）**：

1. bigram 分词把长查询切成 30 个 terms，其中 8 个跨词边界垃圾 bigram（`库影/有哪/些项/按疾/病归/并说/明数/务类`）在 517 份文档中 DF=0；
2. generic 泛词净化（DF≥0.35）只剔除 9 个常见词，剩 22 个 specific，多数不可回答；
3. 候选报告 37 份已召回，但没有任何一份能覆盖 22 个 specific 的 30%（`min_term_cover=0.3`）→ 假 `no_reports`。

**修复（`retrieval.py`，一处）**：`specific` 只保留候选集中 DF>0 的词项；全部实词 DF=0 时仍判 `no_reports`（保留「领域不存在」的诚实判定）；实词全为泛词时维持原 broad 行为。提交 `retrieval: drop corpus-absent query terms from the coverage denominator`。

**验证**：原查询修复后 matched=True（specific 22→14），召回 2 份影像辅助诊断报告（cover 0.357）；Q2/Q3 无回归。检索相关用例 51 passed；全量 214 passed + 2 failed + 1 skipped——`test_launch` 与 `test_mineru.py::test_changed_pdf_does_not_publish_old_parse_cache` 均为既有失败，与本次无关：前者已定位（launch.sh 环境选择断言），后者不引用 retrieval 且失败内容为「同尺寸 PDF 替换后旧正文仍可检索」，即 §16.32 已记录的"同尺寸替换可能漏检"缺口，未在本轮修复。

### 16.44 W8-B 形式审查前端入口与页面（2026-09-29，已实施，待构建与 e2e 验收）

按 05 补充实施方案落地 W8-B，工作树未提交。

**改动**：

| 文件 | 内容 |
|---|---|
| `frontend/src/reviewApi.ts`（新增） | `/api/review/*` 对接层：类型、状态/性质/核查方式中文标签、统一错误文案、导出与原文 URL |
| `frontend/src/components/ReviewViews.tsx`（新增） | `ReviewShell`（Outlet）、`ReviewWorkbench`（上传→元信息核对→选清单→发起审核→记录）、`ReviewGuidelines`（指南→清单草稿→核对启用）、`ReviewEvidence`（题录检索/人工录入）、`ReviewRunPage`（轮询进度 + reader_report + 导出 + 限制）、`ReviewRunPanel`（侧栏审核任务列表） |
| `frontend/src/store.tsx:43,238-242` | `NavKey` 加 `review`；`navPaths` 加 `/review`；pathname 反推加 `/review` 分支 |
| `frontend/src/components/IconRail.tsx:5-11` | NAV_ITEMS 插入「形式审查」，置于"成果"之后 |
| `frontend/src/components/Icons.tsx` | `IconName` 加 `review` 并补自绘 SVG |
| `frontend/src/router.tsx` | 加 `review` 路由与 4 个子路由（工作台/指南库/证据库/报告） |
| `frontend/src/components/SidePanel.tsx` | 加 `review` 分支显示审核任务列表；review 下不再显示会话搜索与知识库分组 |
| `pyproject.toml` | 直接声明 `pypdf`、`olefile`（此前仅随 mineru 传递依赖可用） |

**保留的诚实性表现**：未配置模型时禁用开始按钮并提示；清单为草稿时阻止发起；运行中显示真实阶段标签；报告只展示服务端 `reader_report`（待核实独立成组、不冒充通过）；导出按钮仅在 completed 后出现；审核材料明确标注不进入知识库。

**验证状态（如实记录）**：`tsc -b` 全量编译通过（3 处 Pill 色调已修正为项目 Tone 集）。**`vite build` 未执行成功**：Windows 侧 node 加载 `rollup/dist/native.js` 报 MODULE_NOT_FOUND（node_modules 为 WSL 平台安装），需在 WSL 内跑 `npm run build`。浏览器 e2e 主链尚未跑。

**待办**：① WSL 内 `npm run build`；② 浏览器走通 上传→元信息→审核→报告→导出 主链与窄屏；③ W8-C 计算工具（5 个 calculation 项仍恒 pending）；④ 文档同步后按主题分批提交。

### 16.45 检索判定层主题词化：标题最大匹配的查询主题抽取（2026-09-29）

**问题**：在 §16.44 修复 DF=0 假无匹配后，4 个 Demo 查询虽能命中，但判定词项仍被 bigram 切碎（`径规/化学/助诊/像与` 等半词进入 specific，覆盖率被稀释、区分度差；「辅助诊断」「路径规划」等完整术语未被当作整体）。用户要求 task1–4 在 BM25 够用的前提下优化检索逻辑，不直接裸 query 进 BM25 判定。

**方案（已实施，召回侧不动）**：Layer A/B 的 BM25 召回与 RRF 精排完全不变；只把**覆盖率/泛词/specific 的判定词项**从 bigram 换成 `_query_topics` 抽取的主题词——以候选库标题做最长匹配（≥2 字）+ 拉丁词保留（需出现在标题中），结尾助词（与/和/及/的/在/有/是/按/并/就/都/也/而）剥离，停用词剔除。主题的泛词判定与命中率均按「主题全部 bigram 同现于文档 token 集」计算；主题抽取为空时回退原 bigram 判定（已含 DF>0 净化）；主题全部 DF=0 时保持诚实 no_reports。

**对比实测（4 Demo，修复前 → 后）**：

| Demo | specific 前 | specific 后 | 结果 |
|---|---|---|---|
| task1 医疗长问 | 14 个半词 | ('ai','辅助诊断','任务','分布') | 召回 3 份（心音/阿尔茨海默/儿童喘息辅助诊断），cover 0.5–0.75 |
| 对照「影像与病理辅助诊断」 | ('像与','与病','理辅','助诊') | ('影像','辅助诊断') | 3 份病理项目 cover 0.5→1.0 量级区分 |
| task2 医疗+机器人 | ('学影','助诊') | ('医学影像','辅助诊断',…) | 双库融合正常，多份 cover 1.0 |
| task3 机器人 | ('路径','径规','避障') | ('路径规划','避障') | 强相关 cover 1.0 vs 弱相关 0.5，区分度正确 |

**回归**：检索相关 51 passed；全量 215 passed + 2 failed（`test_launch` 与 `test_mineru` 均为既有失败，§16.44 已记录归因）。提交 `retrieval: judge coverage by title-matched query topics instead of raw bigrams`。

**边界**：召回排序仍由 BM25 决定，主题词只改判定；「数字病理」类项目在 Demo1 的 top3 位置受 BM25 分数约束，未强排——如需调整排序权重另议；dense/重排仍按计划不做。

### 16.46 P1、报告引用修正与 main 交付（2026-09-30）

**已落地**：库路由与深链、Query 数据归属、四维筛选及只读对照、证据返回、显式所选资料新任务；task2/3 与报告的四维阅读框架；文档级引用、单库与跨库来源身份、补检预算、长文预算分配、项目年份口径、报告主题和覆盖重点采集，以及成果正文中的引用预览。专项报告自动保存为唯一 report 成果，可预览、编辑版本和导出。

**真实流程证据**：医疗 517 份、机器人 510 份，用配置的 deepseek-flash 执行用户四条 Demo。读取 3/5/8/10 份样本，26 条来源记录的正文与原文件检查均成功，数字引用无越界。成果浏览器链包括自动卡片、正文、来源预览、编辑版本 2、重开和版本 1 回读；DOCX 导出成功。详见 [验收记录](verification/demo-tasks-20260930/README.md)。

**交付审查修正**：
- 形式审查的 /review、guidelines、evidence、runs/:id 深链加入应用页面返回范围，修复直接访问/刷新 404。
- ApiError 的 status 使用显式字段，移除 Node 原生 TypeScript strip-only 不支持的构造参数属性。
- test_launch 的旧 parent 用例改为显式 DOX_AGENT_VENV，用例与启动脚本现有优先级一致。
- test_mineru 原断言把 BM25 共享单词 body 的命中当成旧缓存。改为检查最新正文不含 old body、含 new body，并验证检索片段与版本；没有改变缓存实现或放宽旧缓存验收。
- README 删除过期入口和错误链接，更新六入口、当前能力、数据布局、配置和验证边界；新本地数据忽略范围保留，已有跟踪数据不移除。

**本轮完成依据**：
- pytest 全量：217 passed（35.18s）。
- 前端 Node 检查：36 passed。
- TypeScript + Vite 构建通过，最大 JS 包 463.52 kB，无超过 500 kB 的警告。
- uv lock --check 通过。
- browser_target_facets.py 通过：深链刷新、筛选、只读对照、范围传递、轮询停止/恢复及迟到响应隔离。
- 形式审查使用临时状态目录、真实 API 的页面浏览器检查通过：工作台/指南库/证据库直接进入与刷新。未调用模型，不能代表上传→审核→报告全链或窄屏验收。
- git diff --check 通过。

**仍待实施/验收**：P2 第二种真实提取目的与 Profile、P3 技术文档结构导航、四维质量标注集及门槛、形式审查计算工具接入与完整浏览器链。当前检索样本分布不是全库统计。

**分支与工作树**：维护 main；当前只有主工作树，无应用托管的其他 worktree。发布采用普通快进推送，不改写历史。源码与工程记录一并交付，运行数据库、环境密钥和构建产物不新增入库。


### 16.47 成果管理与回收站实施指南（2026-09-30，文档完成，代码未实施）

已核对 ArtifactStore、ReportStore、历史列表合并/回补、会话嵌入正文、模板依赖和共享图片。实施方案及按批次验收集中于 [成果管理与回收站实施指南](成果管理与回收站实施指南.md)，不在这里重复契约。

核心前置是收敛成果正文来源，避免删除后通过历史报告或会话回读；首版采用 7 天回收期、还原和单项永久删除，运行中的后端负责期限检查与清理。模板整合管理入口与目录，保持现有固定版本/归档规则。

本轮只编辑规划文档；没有业务代码、目录数据迁移、删除或自动清理，没有重复运行代码测试。用户及其他规划中的 query.md 和已有 PROJECT.md 改动保留。

### 16.48 交互、分组与成果生命周期（2026-09-30，实施中）

用户已授权按本轮审核实施。记录职责沿用 PROJECT / ITERATION / DECISIONS，对应用户所称 PROJECTION / INTERACTION / DECISION。

基线已有未提交 PROJECT、ITERATION、query、两份方案及 launch.sh 权限变化，保留。顺序：①对话范围/上传/保存状态与导航；②分组持久化及界面；③成果存储迁移、生命周期与回收界面；④受影响旅程与集成验证。完成条件沿用方案，不因实施缩减。

最小检查覆盖：A+B 对话浏览/上传 C 后保持范围；保存失败与空限定阻断、旧范围替换；分组移动/解散/重开不改变资料；报告生成中断恢复、删除/还原/到期、旧地址防回补、共享图片及回收版本预览。复用现有浏览器/API 旅程，隔离临时数据，不在真实资料上试删除。当前尚未执行检查。

### 16.49 成果生命周期集成验证与历史迁移完成（2026-09-30）

按 §16.48 顺序完成批次③④的验证收口。批次①②（范围保存/上传隔离/分组）与成果旅程共用同一浏览器链，一并运行。

**历史迁移**：由用户在本机执行 `python -m src.artifact_migration --state-dir .knowledge/.state --backup-dir ~/dox_state_backup_20260930 --service-stopped`（备份含 backup.complete 标记）。迁移后只读核对：

- 新旧成果库同为 10 成果 / 10 版本 / 8 图片；`current_version` 指针零错位。
- 8 份历史报告全部在新成果库建立 `report_id` 关联；31 个会话记录无内嵌报告正文，仅保留 `report_id` 引用（1 个会话）。
- `artifacts/migration.complete` 已写入，启动闸门放行；残留空目录 `.migration-stage` 已删除。

**检查结果（全部在本轮代码上执行）**：

| 检查 | 结果 |
| --- | --- |
| 后端全量 pytest | 220 passed（40.06s），含生命周期并发/到期/共享图片用例 |
| 前端 node --test | 36 passed |
| tsc --noEmit + vite build | 通过，最大 JS 包 465.65 kB |
| launch.sh 真实启动 | /api/health ok；成果列表返回 revision/trashed_at/purge_after；view=trash 正常；旧 /api/reports/{id} 映射到同一成果 |
| tests/browser_artifacts_live.py | PASS：保存→编辑版本→移入回收站→只读预览→还原→成组备份恢复重启；另验第二快照「取消确认不删除→确认彻底删除→API 410 purged→原聊天回答仍显示」 |

**测试修正**：`browser_artifacts_live.py` 上传落盘断言由即时 assert 改为 10 秒轮询——上传队列先本地回显文件名、POST 落盘晚于回显，原断言是竞态（两次运行一成一败）；另补彻底删除浏览器段。

**验收补齐（对照指南 §13 复核后的补充断言）**：还原后同 ID 继续 `POST versions` 编辑与 `GET export` 导出成功；回收期内同 run_id 重发报告请求被拒（410，lifecycle=trashed 且不重置期限）；purge 后同 run_id 重发 410 不可回补、新 run_id 仍可正常生成；迁移测试补无 run_id 历史报告分支（确定性 ID `report-<id>`、正文保留、generated_version=1）。补后全量 pytest 仍 220 passed；指南 §13 行 2/3 与无 run_id 迁移行从「实现存在但无断言」变为「有可定位证据」。

**边界**：浏览器旅程用模型替身，不证明真实模型报告质量（沿用 demo-tasks-20260930 验收）；真实 7 天到期由 `test_report_trash_expiry_shared_images_and_restart` 注入时间覆盖，未等待真实期限。改动仍全部未提交，提交时机由用户决定。

**文档同步**：README（成果能力行、目录布局、备份口径、升级迁移提示、接口行）；实施指南状态行改为已实施并指向本节；PROJECT §12 从「待实施」改为「已实施」。

**全量浏览器旅程清点（2026-09-30 补充）**：以 committed 基线 `4f49593`（临时 worktree 构建）对比分类 17 个浏览器脚本后，修复 3 个本批引入的回归并重跑通过——`browser_status_power`、`browser_export`（侧栏新增"设置"入口后导航栏按钮选择器需限定 `navigation`）、`browser_target_facets`（"当前对话：…"文字按交互方案 §3.1 删除，改为断言对话库 chip）。清点后当前树状态：

- 通过（9，本轮实测）：artifacts_live、custom_tasks_live、figures_live、prompt_skills_live（需 `python -m tests.browser_prompt_skills_live`，其 `from tests.…` 导入不支持直接文件执行）、refresh、answer_controls、status_power、export、target_facets。
- 基线同样失败、属预存问题（10，已在基线 worktree 验证）：`browser_smoke`、`browser_ui_shell`、`browser_library`、`browser_legacy_scope`、`browser_session_branches`、`browser_tasks`（离线脚本，UI 演进后的断言漂移）、`browser_web_live`（等待发送按钮超时）、`browser_fund_preview`、`browser_document_preview`、`browser_markdown_preview`（元素不可见）。这些预存失败早于本批、不阻塞本批交付，列入待办由用户决定是否修复。

**Clone 就绪验证（2026-09-30，用户授权提交后执行）**：全部改动分三笔提交——`0487f22`（后端生命周期/分组/迁移 + 测试 + .gitignore + launch.cmd）、`fc2b068`（前端交互语义/分组/回收站视图）、`75b10bf`（文档记录）。提交前恢复被注释的 `.knowledge/*` 忽略规则（注释会使 11 个库的 datadb/vectordb 与 .state 运行数据暴露为未跟踪、存在误暂存风险；保留无害的 `.vscode/` 新增）；`launch.cmd`（Windows 启动器）入库；launch.sh 无内容差异（模式漂移是 Windows 侧 git 视图假象，WSL 侧本为 755）。

以 committed 状态做真实 clone 测试（本地 clone 等价远端内容，PORT=8917）：launch.sh 全链启动成功——venv 创建、web 依赖安装、npm ci + 前端构建、uvicorn 启动；/api/health ok、UI HTML 正常服务、/api/artifacts 返回空列表（新布局，无迁移闸门）；对默认库执行导入后 docs 0→5、preparation ready（source 已入库，复用 tracked 的 mineru 解析缓存，未重跑解析）；以主仓库 venv 对 clone 代码跑全量 pytest 220 passed（clone 自身 dev 组安装因网络受阻改此路径，web 组离线缓存安装成功）。

环境限制（如实记录）：uv 不读取 pip.conf，`uv venv --seed` 与依赖安装需 uv 可达 PyPI 或以 `UV_DEFAULT_INDEX` 指定镜像（README 已补说明）；本机 WSL 当前对 pypi/镜像的大文件下载不稳定（TLS eof/connection reset）；clone 内官方文档自动导入依赖网络，未在本轮触发成功。main 现领先 origin/main 三笔提交，推送由用户确认。

**Windows 原生运行验证与 launch.cmd 修复（2026-09-30）**：用户在 `D:\chyCodespace\agents\dox_agent` 克隆后要求于 Windows 端跑通。发现并修复 launch.cmd 三个缺陷（原文件从未完整跑通）：①路径规范化只识别 `\` 开头路径，盘符绝对路径被重复拼接项目根（`D:\...\D:\...\.venv`），改为同时识别 `X:` 盘符；②`for /f` 子句内嵌含括号的 Python 单行代码导致 cmd 解析崩溃，改为退出码判定 embedding 是否配置；③PORT/HOST 默认值设置在预检之后，`launcher.py check` 读不到而回退 8000，撞上其他实例，移到脚本最前。Windows 端验证链：uv venv 创建 → web+embedding 依赖安装（清华镜像；embedding 走 torch/transformers 全量下载成功）→ npm ci + 前端构建 → uvicorn 启动 → health ok → 默认库导入 docs 0→5（embedding 向量库同步建立）→ 真实模型 chat 冒烟 completed。修复已提交推送上游（默认端口保持 8000）；D 盘本地实例仅改 launch.cmd 默认 8010 与 .env 的 EMBEDDING_PATH 切换为 E:/ 路径，服务保持运行。


### 16.50 资料管理人员会议需求扩展（2026-09-30，文档完成，代码未实施）

原始会议纪要已在 query.md，本轮保留原文，没有重复倒填。完整需求展开见 [资料管理人员业务需求与实施方案](资料管理人员业务需求与实施方案.md)，正式安排入口为 PROJECT §14。

已核对库/四维、项目统计缺口、单材料审查模型、当前 PDF/DOCX 解析能力及现有技术评议流程。方案重点是点击式归纳、项目去重与经费口径、可追溯关系、外部自述隔离、双文件材料包和形式/专业分开执行。资助门槛与政策条款按真实材料配置，不把纪要示例硬编码。

本轮仅编辑需求文档；未改代码、补经费数据、启用规则或运行模型。后续 M1–M5 的退出条件集中维护于该方案，不重复宣称既有能力覆盖新要求。


### 16.51 query「2026-0930 1734」正式需求整理（2026-09-30，文档完成）

已通读原文完整条目，包括末尾五入口、Prompt/Skill 前台删除、情报分析模板上传/默认/修改，以及 grant-review 融合参考要求。用户确认：独立成果入口取消，统一成果列表和回收站置于存量分析，情报分析报告收录其中。

正式需求与验收集中于 [需求文档-资料管理与分析审查](需求文档-资料管理与分析审查.md)，PROJECT §14 指向该文件。前一方案保留设计参考，并标明旧导航、成果归属和入口名称已被最新要求替代。

只读核对 grant-review.zip 的 App、ReportOverview、GuideChecks、MetadataPanel，保留报告摘要、状态筛选、详细卡片、待核实、预算专题、证据与追溯等层次要求。本轮只更新文档，没有更改原始 query、业务代码或运行数据库。


### 16.52 审核意见落实与实施（2026-10-01，主流程已实施，真实样例验收待补）

已采纳 query 1734 需求审核的七项修正，详细契约及检查映射见正式需求 §13。授权依据：用户“实施”及本次继续修正指令。按最小项目身份前置推进；资料审查对照 grant-review 原流程与分层报告，独立拆执行而非只改 UI。

当前实现风险：重复项目统计、不同口径资金混算、文件失效扩大、外部输入旧引用丢失、两任务仍执行整套流程、calculation 假通过及无匹配被判原创。按对应端到端旅程验证，真实指南与模板的业务验收独立保留。

本轮已落地五入口、项目索引与四维/时间经费/关系展示、外部材料与模板版本、情报成果自动归档，以及共享材料包上的形式/专业独立执行。金额、数量、日期等按指南绑定执行；未绑定或证据缺失保持待核实，不由模型补判。复用现有 SQLite、模板、成果和 grant-review 流程，没有新增图数据库或后台调度体系。

收尾修正：添加资料入口明确跳转文件页，避免默认项目概览改变上传路径；四维提取完成同步刷新项目索引查询；旧浏览器旅程适配新的导航和文件级折叠区。成果生命周期与四维证据旅程通过。

验证：后端全量 221 passed、1 个新增内置模板导致的旧断言失败；修正该断言后单项 1 passed。前端 36 passed，构建最大 JS 478.18 kB。新增业务浏览器旅程及旧成果/四维旅程通过。详情、反例覆盖和截图见 [实施验证](verification/business-20261001/README.md)。

真实模型的两类审查均因连接重置失败，未完成真实业务质量验收；真实指南/模板样例与 DOCX 字体版式核验仍待补。实现和验证边界分开记录，不宣称全部业务验收完成。当前改动未提交或推送，保留用户 query 原文及其他已有改动。

### 16.53 四维概览与年度数量浏览（2026-10-04）

依据正式需求 §14 的 A 阶段实施：四维概览卡展示各维度有依据项目数、前三条及数量条；点击进入主题工作区。主题内增加来源分明的项目摘述，不冒充跨项目综合。管理按钮与说明编辑移至管理资料视图；项目详情复用检查器，原文返回保留项目和筛选。

年度图默认数量，按项目去重、补连续零值年份，年份未知单列；切换经费保留既有口径与缺失原因。相关筛选变化清除过期项目选择，避免浏览范围与分析焦点不一致。没有新增依赖、后台任务或模型调用。

验证：扩展 browser_review_flows 通过四卡、双文件去重、空年份筛选、经费图、项目→原文→项目返回与 430px 无溢出；browser_artifacts_live 验证上传和成果生命周期通过；前端 36 项测试通过。UI 截图已查看；最大 JS 478.50 kB（最终微调后以构建日志为准）。本轮未改后端，不重复后端全套。

后续：B 的人工主题归并与撤销、C 的主题综合/失效更新尚未实现；查找项目快捷入口和全宽窄屏阅读仍需后续完善。当前窄屏沿用已有检查器响应式布局。已有真实模型网络受阻及真实审查样例缺失的边界继续有效。本轮不提交、不推送。

### 16.54 通用模板审查实施（2026-10-08，S0–S3 与 G1 已实施，S4/G2 未完成）

依据：通用模板审查与资料归纳设计实施方案-20261008（已落实六项审核意见）；用户明确要求开始实施并尽量完成。
先完成 S0 来源/版本与显式证据选择，再完成 S1–S3 模板工作台、章节映射、计量及专题报告。G1/G2 按独立工作线推进。保留本轮开始时已有代码和运行数据库修改。
主要失败方式：无来源却伪造指南、空选读取库存、草稿/类型混用、同名章节错配、未读图片下假通过、金额口径混算、进度误取申报日期、专业编辑未执行、迁移误分类。
验证优先扩展 test_review_flows 与 browser_review_flows；实际解析/HTTP/存储使用隔离目录，模型替身只控制结果和异常。生产数据库不用于开发试写。真实模型/业务样例验收单独记录。

**本轮实施（工作树，未提交）**
- S0：`fund/tender` 场景字段、路由校验和界面卡片删除；运行绑定模板 id + 当前已保存版本快照，类型不符/旧版本/全部停用拒绝；内置示例只读、按代码内容变化发布新版本；条目原始出处不可覆盖，人工修订标 `revised` 并显示“原文要求／修订”，副本只继承服务端已有的原始出处。文献只读显式选择，空选不读库存；历史评价排除评价时点后及日期不明材料；专业审查不选资料库即内部论证并写入限制。旧清单无类型时不迁移，模板页要求用户选择类型后另存。
- S1：资料审查页改为模板主卡（浅紫）+上传申请书卡（浅蓝）、准备核对条、章节对应核对（同名候选、起止块、确认缺失、保存修订号与并发冲突）、专业对照范围/文献/评价方式；`/review/templates` 模板库（新建、复制、上传文字模板、旧清单归类）与 `/review/templates/:id` 预览/编辑（启停、排序、计量控件、只读计数口径、内联校验、离开未保存保护）。申请书与模板上传增加 Markdown/TXT。
- S2：`src/review/sections.py` 章节定位与可见码点计数（标题不计、子节计入、图片标覆盖不足）；单位名单去重与疑似同机构待核、总预算口径、计划区间（整体与阶段日期，精度不足待核，不用申报日期）；自动识别范围只给待核实，确认后才判通过/超限；可靠范围已超限即使有未读图片也报告问题。专业审查按模板启用问题执行，结果带 `check_id`，未知 ID 丢弃，遗漏问题单列“未完成评价”。
- S3：报告页按形式（概览/正文与大纲/信息表与单位/预算与进度/依据与覆盖）和专业（概览/技术专题/相近项目/政策与文献/修改建议）分页签；章节表列要求/实际/差异/范围与覆盖；逐条意见显示其引用证据；最终复核未完成单列；Word 导出写入人工修订与覆盖说明。
- G1：项目索引新增 `topic_merges` 记录（按原提取名映射，合并/改名/撤销，后续合并包含旧合并），聚合时保留 `original_name`；同一项目多文件的同名主题只计一次（修复原聚合按条目重复计数）；资料库主题归纳下新增“整理条目”面板。层级指纹随主题名变化自动标需更新。

**验证**：后端全量 `.venv/bin/python -m pytest -q` 226 passed；`npm test` 36 passed，`npm run build` 通过（主包 496.27 kB，含既有静态导入的审查侧栏）。`tests/test_review_flows.py` 扩展覆盖：自动范围 300 字待核实、确认后 300 通过/210 超限/子节计入 2000、名单去重 3 家、300.01 万超限、阶段日期越界、修订号冲突 409、内置只读 403、改类型/全停用 422、人工修订保留原始 300、空选文献不读库存、内部审查遗漏问题单列。`tests/test_app.py` 项目旅程扩展：多文件主题计一次、改名/重名拒绝、来源更新后人工归属保留、撤销恢复与重复撤销 409。`python -m tests.browser_review_flows` PASS（模板预览→复制→编辑→未保存拦截→启用→使用、章节确认 4/4、形式/专业分页签报告、原文定位、主题改名与撤销、430px 无横向溢出），截图在 `verification/business-20261001/`（formal-workbench、formal-review、template-preview、professional-review、professional-mobile）。`browser_target_facets`、`browser_scene_hierarchy` 复跑通过。另用脚本直接核对 280 字+未读图片待核实、301 字+图片仍超限、开始日早一天越界、疑似同机构待核。

**限制与未完成**：未使用真实模型和真实模板/申请书（S4）；上传文字模板依赖模型 `00_plan` 提取，仅做了契约改造未做真实样例；PDF 章节按行与编号标题识别，复杂版式需人工调整范围；字体版式仍不检查；G2 主题综合未实施。工作树另有 §13 四维层级实现（`src/hierarchy.py` 等，非本轮编写），本轮仅确认其测试随全量通过。未提交、未推送。

### 16.55 四维层级结构与成果相关分析需求整理（2026-10-08，仅文档）

依据 query.md「2026-1007 1241」（原文已保留）。用户确认三点：资料库四维浏览、存量分析综合报告、情报分析报告共用同一数据契约；每类场景 3 个核心问题＝2 已解决＋1 待解决；成果“相关分析”采用八方面清单与完成度四态。本轮只更新文档。

已落位：正式需求 §17（R-SCN-01–08、验收表、待确认项）；设计实施方案 §13（层级实体字段、生成与失效、界面与路由落点、依赖与非目标、验收载体）。未改动任何业务代码，未运行测试，未提交或推送。

未决：6 类/18 问题是否为固定展示契约；相关分析二级页形态。实现前需先确认第 1 项，否则层级生成与显示口径会在实现期反复。

### 16.56 四维层级与成果相关分析实施（2026-10-08）

依据：query.md「2026-1007 1241」；正式要求需求文档 §17（审核后已修订入口位置与数量口径）；设计实施方案 §13。本轮实现需求 §17 的库级层级与相关分析，并同步完成实施前审核。

审核发现并已修订：成果“相关分析”入口位置自相矛盾（原写成果项入口、实际按场景聚合八方面），改为场景成果区一处入口、页内按成果项分组；验收表“显示 6 类场景”与“按实际数量显示”冲突，改为显示实际数量并显式标注与目标的差距；§13 未说明层级由谁生成，补为库级一次模型综合且输出只能引用索引中已有条目名；两项待确认按“数量为目标值、二级页用同路由深链视图”定案。

实现：`src/hierarchy.py`（综合、校验、指纹、过期与读取）、`src/prompts/hierarchy.md`、`src/targets.py:item_evidence`（按当前版本取条目引文）、`src/project_index.py` 主题条目补 `item_ids`、`GET/POST /api/corpora/{id}/hierarchy`；前端 `SceneHierarchy.tsx`（场景列表→场景详情→问题与技术路线→标志性成果→相关分析八方面深链视图）、`projects.ts` 类型与查询、`CorpusDetail` 挂载。丢弃规则：场景/问题/技术/成果名称未命中清单即整条丢弃并计入 `coverage.gaps`；方面只能引用本成果条目的证据，引用不到回落“原文未提及”；每次问题构成不足 2 已解决+1 待解决记录缺口。一次失败的更新保留上一版并标“未完成”，不伪装当前。

验证：`tests/test_hierarchy.py` 3 passed（保留/丢弃、方面越权引用回落、复用与 force、失败保留旧版、主题变化标 stale）；`tests/browser_scene_hierarchy.py` 离线浏览器旅程通过（数量与缺口展示、深链与刷新、回到上一层、引用回读、版本变化拒绝、窄屏无横向溢出、仅点击才 POST）；后端全量 224 passed；前端 36 passed、tsc 无错、构建最大 JS 478.50 kB；`browser_target_facets` 回归通过。

遗留（属另一条工作线，非本轮引入，已用 stash 复现确认）：`tests/test_review_flows.py` 两项与 `browser_review_flows` 因 `RulePack` 现要求 `kind` 而请求未带该字段返回 422；需按 S0 契约更新这些测试数据后再判定。未做真实模型综合质量审核，层级真实质量仍待样例审核。


### 16.57 G2 主题归纳与审查存储隔离（2026-10-08，工作树未提交）

依据：通用模板审查方案 §9 G2、需求文档 §14.3–14.4 与 §14.7 C；用户“继续实施”。

- `src/topic_summary.py` + `prompts/topic_summary.md`：按“维度+主题”手动生成一句概述、共性、差异；输入为该主题成员条目的当前版本原文摘录（编号 E1…），每条要点必须引用编号，无编号、引用越界、混合已取得与预期、共性只有一个项目的要点均不采用并列入“未采用”。代表项目与项目数由索引计算。结果存 `<库>/topic_summaries.json`，每主题保存成员指纹与来源快照；成员或版本变化仅使该主题标“需更新”，页面打开不调用模型；无可回读原文返回 409 不生成；生成失败保留上一版本并标注更新错误。接口：`GET/POST /api/corpora/{id}/topic-summary`。
- 前端：选中主题后在“相关项目摘述”上方显示主题归纳面板（状态、生成/更新、共性/差异、逐条依据与原文打开）。`EvidenceList` 增加版本变化提示参数，层级页文案不变。
- 存储隔离：审查数据目录改由应用 `settings.state_dir/review` 在启动时设定，不再使用进程级默认值；修复上轮测试写入真实 `.knowledge/.state/review` 的问题（上轮已写入的两条内置模板 v1 与应用首启内容一致，未删除）。

验证：`tests/test_app.py` 项目旅程扩展（成果主题混合状态要点被拒、无依据要点被拒、代表项目按索引、来源快照保留两种状态；报告文件更新后仅“临床诊疗”需更新而“远程医疗”仍一致；无证据 409；失败保留上一版本）。浏览器旅程增加主题选择→生成归纳→展开依据→打开原文（截图 `verification/business-20261001/topic-summary.png`）。实测：`browser_review_flows`、`browser_scene_hierarchy`、`browser_target_facets` 通过；`npm test` 36 passed，构建通过；后端全量 215 passed / 11 failed，失败均为报告生成 500（另一会话同时在工作树接入 `hierarchy_record`，测试替身 `fake_generate` 不接受该参数），不涉及本节文件，已告知该会话；本节相关用例全部通过。全量 pytest 前后真实审查库修改时间不变。限制：仅受控模型，真实归纳质量需样例审核。

### 16.58 场景层级进入存量分析与情报报告（2026-10-08）

依据需求 §17 R-SCN-07 后半段：资料库浏览已用层级，综合报告与情报报告此前仍各自写作。实现：`src/hierarchy.py:render_section` 把已保存的层级按本次报告自己的来源列表过滤后渲染成 Markdown 章节（场景→问题/技术路线表、标志性成果的八方面完成度表、覆盖说明与缺口数）；范围外的条目显示“本次报告范围未包含该条依据文件”而不是静默消失或改写编号。`src/reports.py` 在来源附录之前插入该章，并在提示中声明该章为准、模型不得改写名称状态数量；`src/intelligence.py` 对情报报告做同样处理。层级记录通过 `params["hierarchy_record"]` 传入，`generate_markdown` 取出后改写为随成果保存的小快照（state/fingerprint/generated_at/场景数/目标值），旧报告因此保留自己那一版层级。读取层级失败只记日志，不阻断报告生成。

验证：`tests/test_hierarchy.py` 5 passed（新增报告正文含层级章节、按本次来源编号引用、无层级时不生成空章；情报报告追加同一章节并保存快照）；后端全量 228 passed；前端 36 passed、tsc 无错、构建通过；浏览器旅程 `browser_scene_hierarchy`、`browser_target_facets`、`browser_review_flows` 均通过。

未做：报告正文的层级章节未覆盖 Word/DOCX 导出的样式差异核对；层级真实综合质量仍未做样例审核。工作树在本轮期间被并行修改（`src/review/*` 于 14:37 变更），先前记录的 `test_review_flows` 两条 422 失败已由该侧修复，现全量通过。


### 16.59 S4 真实材料验收、DOCX 字体核对与稳健性修复（2026-10-08，工作树未提交）

依据：用户“能够完成的直接完成”。详细结果、截图与实测 Word 报告见 [S4 实测记录](verification/s4-20261008/README.md)。

- S4：真实 `deepseek-flash`，真实面上项目申请书（DOCX 119 块、PDF 61 页）与 2026 填报说明；状态写入临时目录，资料库用副本。形式/专业审查、模板提取、Word 导出均完成。
- 修复（均由真实运行暴露）：审查模型与题录检索不再忽略系统代理（此前所有“连接重置”的根因）；专业意见接受多个原文编号；网络异常/非法 JSON 重试一次；指南提取与分块理解在输出截断时对半拆分重试；PDF 日期行不再识别为章节标题。受控夹具改用真实模型的多编号写法并断言意见带原文。
- 新增 DOCX 正文字体/字号核对（逐段解析 run→样式链→文档默认的东亚字体与字号，主题字体等未声明值计为无法核对；非 DOCX 显示未检查），模板编辑器可选“正文字体/正文字号”。`test_review_flows` 增加宋体正文夹 4 个黑体字判为问题的用例。
- 另一会话同期修复了报告生成相关的 11 个失败。

验证：后端全量与前端、浏览器旅程结果见交付说明；真实模型结果见上文链接。


### 16.58 query「2026-1008 1547」：项目关系图、四维层级收束、对比分析隐藏引用来源（2026-10-08，工作树未提交）

- 项目关系：`knowledge_graph_D.html` 的设计（角度=学科、半径=立项年、年份轴筛选、中心枢纽、详情抽屉、图例）落为 `ProjectGraph.tsx`，接入资料库“项目关系”页签，数据只用真实字段：项目索引新增 `code/admin/unit`（源文件头 `code/projectAdmin/dependUnit`，`INDEX_VERSION=3`）。扇区为二级申请代码（前 8 个 + 其他/代码未知，宽度按项目数开方），同一单元格多行排布不越界，510 个点零重叠。原演示中的负责人经费等演示数据不采用。关联：同一核心问题（权重 3）、同一场景类别（1）、共享当前维度条目；抽屉说明关联原因并可进入项目详情。真实条目几乎一项目一条，仅按同名条目连线时关联几乎为空，这是原面板“空”的主因。
- 四维浏览收束：资料库“四维浏览”默认页签改为“四维层级”（场景层级），原四维卡、主题网格、年度分布、项目关系移入后续页签。层级综合改为“场景/核心问题 = 自拟类别名 + 逐字成员清单”，覆盖项目与证据为成员并集，成员不可回指、重复归入均丢弃并记入缺口；每场景最多 3 个核心问题（优先 2 已解决 + 1 待解决）；成果 3–5 项不再误记缺口。界面显示“归并 N 个原提取条目”。已用真实模型为各库生成层级（结果见交付说明）。
- 对比分析：task2 回答不再显示“引用来源 N 篇”列表，表内 `[n]` 引用仍可点击定位。

真实生成（deepseek，11 个库均完成，日志 `verification/query-20261008-1547/hierarchy-generation.log`）：机器人自动化 510 项目 → 6 场景覆盖 325 项目、18 问题（12 已解决 / 6 待解决）、36 条路线、18 项成果；医疗 514 → 6 场景覆盖 161 项目、17 问题；小库（4–20 项目）场景覆盖全部项目，问题数按实际供给（10–18），缺口如实记录。农业首次生成漏掉全部成果层，已增加缺口记录与一次纠正重试，重生成后 28 项成果。截图：`verification/query-20261008-1547/`（hierarchy、scene、analysis、graph、graph-mobile）。

验证：`tests/test_hierarchy.py`（类别成员并集、未知成员丢弃、跨类别重复丢弃）；`browser_review_flows`（默认四维层级、四维卡移入主题归纳、关系图点选与关联原因）；`browser_answer_controls`（对比回答无引用来源列表、保留 [1] 引用）；真实机器人库副本截图与零重叠检查（510 点 0 重叠，430px 无横向溢出，无页面错误）。
限制：医疗库场景仅覆盖 161/514 项目（模型每类列出的成员有限）；部分成果标题为通用条目（如“论文与专利”）；`tests/data/fund_retrieval.jsonl` 在工作区被删除（非本节改动），导致 `test_evaluate` 1 项失败，未擅自恢复。运行中的服务需重启以加载新的项目索引字段。


### 16.59 query「2026-1008 1654」：四维浏览按 场景/问题/技术/成果 四按钮展开（2026-10-08，工作树未提交）

- 资料库“打开”页（四维浏览）顶部改为四个按钮：场景（类别卡片：摘要、项目数、问题/成果数，点击下钻到该场景）、问题（按场景分组的核心问题：已解决/待解决、摘要、对应技术路线）、技术（按问题分组的技术路线：摘要、项目数、一条原文依据）、研究成果（标志性成果：摘要、覆盖与代表项目、原文依据，加每场景“成果分析”——八个方面取各成果的最高完成度并给出一句归纳，可展开逐成果完成度表）。非场景视图可按场景筛选；按钮显示实际数量与目标（6 类 / 18 个）。
- 主题归纳、年度分布、项目关系移到下方“更多视图”，默认不展开；原首行统计、目标说明段、缺口块简化为一行（缺口可展开）。原场景详情页由按钮视图替代，深链参数为 `dim` 与 `scene`。
- 生成质量：真实数据中出现“论文与专利”类泛化成果、核心问题只含 1 个成员，提示词要求标志性成果为具体样机/系统/验证/应用，核心问题归并同类问题主题；已重新生成各库。

验证：`browser_scene_hierarchy` 按新界面重写（四按钮数量与目标、缺口、场景下钻、技术与成果、成果分析、刷新保持、原文版本变化提示、不自动调用模型、窄屏）；`browser_review_flows` 通过；真实机器人库副本截图（`verification/query-20261008-1654/`），430px 无溢出、无页面错误。


### 16.60 query「2026-1008 1727」：更多视图精简与项目关系分级（2026-10-08，工作树未提交）

- 更多视图只保留“年度分布”“项目关系”；原“主题归纳”页（四维卡、条目网格、条目摘述）删除。条目整理（G1）与条目归纳（G2）移到“管理资料 → 四维条目整理”（折叠），功能保留。分析问题与项目列表只在年度分布下显示。
- 项目关系：关联依据切换 场景 / 问题 / 技术；成果不作依据（见 DECISIONS 同日条目）。新增 `src/project_similarity.py` 与 `GET /api/corpora/{id}/relations?dimension=`：按项目该维度描述的本地向量相似度给出邻居与度数，向量缓存于项目索引库（按描述摘要失效）。节点按度数着色（越深关联越多，带图例），抽屉列出最相近 12 个及相似度、共同类别；未配置模型时退回层级类别并说明。
- 顶层设计冲突（已指出并处理）：四维提取条目近乎一项目一条，层级类别又是“全员互联”，二者都无法表达“关联多少”；真正的分级关联需要相似度，故引入语义相似度。相似度存在“枢纽”现象（描述泛化的项目度数偏高），只表示描述相近，不判断继承或重复立项。
- 实测（机器人库副本，510 项目）：场景/问题/技术分别有 405/409/375 个项目有关联，度数中位数 7/6/7、最大 42/68/69、取值 39/48/45 种；首算每维约 2–4 分钟（CPU），缓存后 0.13 秒。已为各真实库预计算。

验证：`test_hierarchy` 新增相似关联用例（缓存复用、仅变更描述重算、度数与邻居）；`browser_review_flows`（更多视图仅两项、管理资料中条目整理与归纳、关联依据三选一、无向量模型时技术同名退回）；`browser_scene_hierarchy`、`browser_target_facets` 通过；真实数据截图 `verification/query-20261008-1727/`。


### 16.61 query「2026-1008 1746」：专业审查对照一个子资料库、默认 3 篇相近报告（2026-10-08，工作树未提交）

- `ReviewRequest`：专业审查 `corpus_ids` 必须恰好 1 个，新增 `reference_count`（默认 3，1–5）；发起时校验资料库存在且目录未缺失。检索使用审查专用配置（task2 的最少/最多报告数 = 设定篇数），按相关度取前 N 篇全文；不足时写入限制说明。原“无资料库即内部论证审查”路径删除（见 DECISIONS 同日条目）。
- 前端：对照资料库改为单选下拉（默认当前对话资料库或第一个）+ 参考报告篇数（默认 3）；报告页显示对照库名与“参考报告 实际/设定 篇”。
- 真实验证（机器人申请书 × 机器人库副本，真实模型）：此前检索判定层只返回 2 篇，改为按设定补足后为 3/3，第三篇为“面向无人工厂的多智能体协同与决策机制”，相近工作意见引用了对照报告；约 120 秒。

验证：`test_review_flows`（无资料库 422、不存在的库 422、默认 3 篇、库内不足的限制说明）；`browser_review_flows`（资料库预选、默认 3 篇）。


### 16.62 query「2026-1008 1822」：资料审查基本信息提取与核对修复（2026-10-08，工作树未提交）

逐项核对代码发现并修复的缺陷：
1. 重新提取覆盖已确认信息：确认后再“重新提取”会用模型结果整体替换元数据（丢失手填的申报单位、总预算、计划日期）并清除确认。现在已确认或期间改过的文档不被改动，模型值只作建议并列出差异；未确认文档只补空字段。
2. 未确认正文借用信息表的确认：信息表确认后，整份材料被视为已确认，程序核对使用正文中未确认的值。现在只采用已确认文件的字段。
3. 信息表空单位名单抹掉正文名单：空列表被当作冲突值。现在空值不参与冲突判断；项目名称不做跨文件冲突比较。
4. 自动提取轮询时输入被覆盖：表单每 1.5 秒随轮询重置。现在已编辑字段保留、其余随服务端更新；提取中禁止保存并提示。
5. 正式申报时间输入框不回显已保存值；数字框输入非数字被当作空值。均已修正。
6. 保存失败只显示“（422）”：现在列出出错字段与原因。
7. 提取不覆盖通用模板字段：新增申报单位（逐个单位、需原文可见、“无”不计）、项目总预算、计划起止日期（按原文精度）。

另：模型建议与已确认值不同时显示“填入模型建议（需再保存）”；正文保存后同步刷新已上传列表。

验证：`test_review_flows` 新增提取—确认—重提取—合并旅程（真实提取管线，模型替身只返回引用 sources 的候选）；`browser_review_flows` 增加空项目名称的可读报错、申报时间回显；真实模型提取真实申请书：标题/基金/类别/年度/出生年月/总预算 72/单位/2027-01—2030-12 均正确，直接费用因原文只有总预算而留空，“合作单位：无”未计入（14 秒）。

### 16.63 进度复核与 GitHub 发布检查（2026-10-09）

本次按用户要求审核并发布 main。复核以当前代码及 query 后续 1547–1822 条目为准：四维四按钮、更多视图精简、按场景/问题/技术的语义关系图；专业审查固定一个子库、默认三篇参考；元数据提取和人工确认保护均已实现。README 同步删除旧“无库内部审查”和“场景名称必须原样命中”说明。

本轮实测：后端 229 passed、1 failed（本地已删除 tests/data/fund_retrieval.jsonl）；保留用户本地删除状态，不把删除提交到发布版本。在隔离目录复制当前 src 与 test_evaluate，并使用 HEAD 已有的数据文件运行该文件，2 passed。前端 36 passed；构建通过，最大 JS 499.02 kB。browser_review_flows 与 browser_scene_hierarchy 通过。未重新运行真实模型或重复旧资料分析。

提交仅包含代码、测试及进度/需求文档；运行数据库、真实材料、原始实测 JSON/Word、截图及本地临时文件不纳入此提交。S4 README 的原始报告/截图/复现脚本为本地验收证据，不随本次发布提供；不能将未发布附件当成 clone 后可取得的测试输入。原始 query 和早期文档的 Markdown 行尾空格保留，不为 diff 检查改写原文。

尚需工作：专业意见的领域质量评阅；大库场景覆盖和代表成果质量继续优化（实际覆盖不可当全库）；复杂格式与全文视觉样式核验；新生成十一份 Word 模板及含瑕疵样例的完整逐份验收。语义相似度仅表示描述相近，不代表重复立项。当前构建接近 500 kB，后续功能增长应关注拆包，本次无超限告警。

### 16.64 知识库重复解析产物清理（2026-10-09）

用户授权简单清理并推送。医疗库 parsed 中 6 个无同路径源文件的目录，均在生物识别库 parsed 下有逐文件 SHA-256 完全一致副本。全库源文本和 SQLite 文本记录检查发现对应项目已在生物识别库；未发现对医疗库旧解析目录的明确路径引用。保留生物识别库副本，把医疗库重复目录移至仓库外隔离备份。

本次移出 245 个文件、59,950,401 字节（约 57.17 MiB）；原件和还原清单位于本机 /home/mvr/wslcodespace/dox_agent-cleanup-backups/20261009-094806。备份保留相对原路径、保留副本路径及逐文件哈希；还原需在确认原路径为空后按清单移回。移动后复核备份与保留副本哈希均一致。

未改 source、datadb、target、层级、成果、会话或模板；未清理正常解析缓存、旧登记备份及回收站。提交仅含这 6 个重复目录删除和本记录，数据库、本地 .gitignore 及评测数据删除保持原状。此次减少工作树重复数据，不会缩减 Git 历史对象或本机总占用（隔离备份仍在）；未执行破坏性历史重写。

### 16.65 query「2026-1009 0947」：模型代理开关、存量分析与成果入口、技术谱系与点选提问（2026-10-09，工作树未提交）

依据：query.md「2026-1009 0947」；有效要求整理见 PROJECT §15，取舍见 DECISIONS 同日条目。

- ① 代理：`MODEL_USE_PROXY`（默认 false）+ 面板开关（`STATE_DIR/model_settings.json` 优先）；`src/agent/models.py` 为 ChatOpenAI 传入按开关构造的 httpx 客户端（`trust_env`），审查模型客户端同用该开关；`GET /api/model`、`PUT /api/model/proxy`、`POST /api/model/check`。左下角“模型”按钮打开“模型与连接”面板（模型信息、代理开关、连接测试）。本机 `.env` 设为 `MODEL_USE_PROXY=true`（直连被重置，见下）。
- ② 存量分析：task3 更名“技术研判”（`task3_assess.md`，旧 `task3_trend.md` 删除），报告模板 `future_directions` 显示名改为“技术研判报告”并增加“技术路线与成熟程度”章；存量分析页去掉顶层切换与复制按钮，卡片提供 预览模板/修改模板/上传模板/开始分析（内置只读，修改与上传生成“我的任务”草稿；专项报告的上传生成自定义报告模板），任务预览显示内置模板正文；task3 现可复制。成果与回收站移入检查器“成果”视图（`InspectorResults.tsx`：存量分析报告/资料审查报告/情报分析报告/回收站），旧 `ReportsView`、侧栏“本会话报告”、`fetchReports` 删除，`/tasks/results` 与 `/artifacts` 改为打开该视图。
- ③ “（带 [n]）”：来源是 task3 提示词把格式说明写在输出结构小节名后，模型照抄为标题（工作区历史回答中 3 处）；提示词与四个报告模板改为“小节标题只写名称”。
- ④ 四维浏览：五个按钮 技术谱系/场景/问题/技术/成果。`src/lineage.py` + `prompts/lineage.md` + `GET/POST /api/corpora/{id}/lineage`；`LineageTree.tsx`（本库分支展开、其他子库按颜色分支懒加载；选中技术显示体系位置、同级、同体系其他方向、针对的问题、配套技术、相关项目）。`SceneFlow.tsx` 场景逻辑简图（场景→问题→技术→成果，成果按共同项目连线，点击高亮链条并列出项目）；问题卡的技术可跳谱系、可展开项目；技术卡显示所属体系与配套技术。`src/achievement_list.py` + `GET /api/corpora/{id}/outputs` + `OutputsPanel.tsx`：成果板块取报告原文“成果列表”。项目关系图节点色相 = 场景类别/核心问题/谱系体系，深浅 = 关联数，新增类别图例。
- ⑤ 点选提问：`QuickAsk.tsx`（任务、关注要素、关注场景〔取本库层级〕、附带问题）→ `POST /api/compose-question`（`src/compose_question.py`、`prompts/compose_question.md`）→ 问题填入输入框；任务不同则新建会话并沿用当前知识库（store `askInTask`）。

验证：
- 后端 `pytest -q --deselect tests/test_evaluate.py`：230 passed（`test_evaluate` 因本地已删除 `tests/data/fund_retrieval.jsonl` 未运行，同 §16.63）。新增 `test_hierarchy.py::test_lineage_and_outcome_list_stay_traceable`（区分：清单外/重复路线被采用、配套技术不是取自同项目条目、失败覆盖旧谱系、成果列表计数错误）、`test_app.py::test_model_proxy_switch_persists_and_overrides_env`（区分：面板选择不持久或不优先于 .env）。
- 前端 `tsc` 无错，`npm test` 36 passed，构建通过（最大 JS 497.92 kB）。离线浏览器：`browser_scene_hierarchy`（按新界面改写：谱系仅点击生成、技术详情、问题→谱系、场景逻辑简图、成果板块）、`browser_review_flows`（成果入口改为检查器分组）、`browser_answer_controls` 通过。`browser_tasks`（断言的“当前对话：”文案于 fc2b068 已移除）与 `browser_ui_shell`（“Prompt / Skill”按钮于 91bd04d 已移除）此前已失效，未在本轮修复。
- 真实运行（端口 8031，应用状态用临时副本，真实知识库）：连接测试 代理开 86 ms 正常、代理关 `ConnectTimeout` 15 s（本机直连 TLS 被重置，curl 复核同样结果）；点选提问由 deepseek-flash 生成问题并填入、切到技术研判会话；存量分析卡片、任务模板正文预览、检查器成果分组（存量 9/审查 9/情报 3/回收站 0）；机器人库技术谱系（7 体系、36 条、0 未归类）、医疗分支展开、场景逻辑简图、成果板块（57/60 项目含成果列表，1255 条）、按场景着色的关系图；430px 无横向溢出，无页面错误。截图与谱系生成日志：`verification/query-20261009-0947/`。
- 技术谱系真实生成（deepseek-flash，11 个库，每库 27–54 s，日志 `verification/query-20261009-0947/lineage-generation.log`）：全部成功，每库 6–8 个体系、15–44 条典型技术，仅大数据库 2 条未归类，无清单外名称。少数类别仍偏应用/学科（如“基因编辑”“系统表型与队列”），同库重跑的类别划分会变化，需领域人员审核。
- 成果列表解析：1031 份 Markdown 源文件全部含“成果列表（N）”，机器人库 500/510 文件解析条数与声明数 N 完全一致（其余为无该板块的文件）。

限制与后续：
- 技术谱系是模型归类，未经领域人员审核；首版提示曾按应用场景分组，已改为按方法体系，仍可能有归类不当。配套技术只反映库内项目自述，单项目路线时往往只有 1–3 项。
- 逻辑简图中成果与技术按共同项目连线；层级中多数路线只覆盖 1 个项目，连线较稀疏，属数据实际情况。
- 成果板块与四维“成果”条目并存：未据成果列表重提取四维成果，也未把成果列表计数并入八方面完成度；如需要应单列为提取规则变更（需提升提示版本，见 PROJECT §10 的版本口径）。
- 运行中的服务需重启以加载新接口；工作树未提交、未推送。

### 16.66 query「2026-1009 1111」：五级技术谱系树与技术发展脉络图（2026-10-09，工作树未提交）

依据：query.md「2026-1009 1111」；有效要求见 PROJECT §15.1，取舍见 DECISIONS 同日“技术谱系改为全条目五级树并附成熟度”。

- 后端 `src/lineage.py` 重写：覆盖每库全部项目技术条目（全库 2716 条）；一次框架调用给出 体系 › 方向 › 主题（带编号，主题数按条目数约 1/5），再以 25 条/批、6 并发归入主题编号并判定成熟度（0–5，附依据），失败批次重试一次；后台任务，`POST /lineage` 返回 202，`GET` 带 `job` 进度；条目集合变化标 stale；旧格式文件视为未生成。提示词 `lineage.md`（框架）、`lineage_assign.md`（归类与成熟度，非技术条目记 0）。
- 前端 `LineageTree.tsx`：五级可折叠树（▸/▾，点击名称即选中并展开路径），每个非叶节点显示条目数、项目数与成熟度分布条，叶节点以成熟度着色；生成进度条与轮询；右侧面板对分支显示“发展脉络”，对叶节点显示成熟度与依据、所属项目及起止年、典型技术所针对的问题、同一项目配套使用的技术（可跳转）。其他子库作为颜色分支可展开浏览。
- `TechTimeline.tsx`：横轴项目年份、纵轴成熟度（5→1、未判定），≤60 条时每个项目一条横条（点击打开项目），更多时为“年 × 成熟度”计数格（点击列出在研项目）；虚线为截至当年已结题项目的最高成熟度，列出“某年首次达到某级”的节点及项目。
- 四维浏览：问题/逻辑简图中的技术跳到该技术条目所在叶节点；技术卡显示 体系 › 方向 › 主题 与成熟度；关系图“技术”着色按项目技术条目所在体系（覆盖几乎全部项目）。

试验与修正：农业库首轮让模型自由填写方向/主题名，148 条中约 80 条因名称不一致落入未归类、主题几乎全为单条；改为三级框架 + 主题编号后未归类仅剩超时失败的一批（40 条），再加 25 条小批与一次重试。名称点击时“展开路径”与“切换折叠”同时触发导致节点不展开，已改为只展开路径（离线旅程覆盖）。

后续修正（同日）：
- 条目键冲突：四维提取的条目 id 由名称派生，不同项目的同名技术条目 id 相同，导致医疗库树中 1024 条而条目表只有 1021 条（后写覆盖前写，项目归属丢失）。条目键改为“项目|条目”，记录保留原 `item_id`；层级路线与树叶的对应按 条目 id + 项目 匹配。`test_hierarchy` 增加两项目同名条目仍为两片叶的断言。旧生成结果全部重新生成。
- 发展脉络按项目聚合：同一项目在一个分支下常有多条技术条目，原先画成多条相同横条、节点中重复列出；改为每个项目一条（取其在该分支达到的最高成熟度，悬停列出条目数），≤24 个项目时横条内显示项目名；计数格改为在研项目数；阶梯线在横条下层、计数格上层绘制。
- 生成速度：deepseek-flash 单次归类回复常超过 60 秒，谱系调用改用 180 秒请求超时（`model_for(settings, timeout=…)`）、10 并发；农业 148 条约 5 分钟，医疗 1021 条约 10.5 分钟（修正前一轮）。
- 提示词：组织管理机制、研讨方式等非技术条目成熟度记 0（首轮信息智能库此类条目曾被判为 5）。

验证（16.66）：
- 后端 `pytest -q --deselect tests/test_evaluate.py`：230 passed；`test_hierarchy::test_lineage_and_outcome_list_stay_traceable` 改写为五级结构（框架/归类两类调用、后台任务轮询、未知主题编号进“未归类”、越界成熟度记 0、失败保留上一版、同名条目跨项目不合并）。ruff 总数 46（与上次提交相同，无新增）。
- 前端 tsc 无错、`npm test` 36 passed、构建通过；离线 `browser_scene_hierarchy`（生成仅点击触发、逐级展开/折叠、分支发展脉络与节点、叶节点成熟度与同项目配套技术、问题→技术叶节点）、`browser_review_flows`、`browser_answer_controls` 通过。
- 真实生成（deepseek-flash，修正键后全量重生成，日志 `verification/query-20261009-0947/lineage5-generation.log` 末段）：信息智能 15 条/0 未归类；农业 148/2；医疗 1024/48；大数据 27/0；机器人自动化 1260/23；材料 48/0；生物医药 31/0；生物识别 35/0；社会治理 31/0；金融经济 63/7；隐私保护 34/1。大库 8 个体系、24–26 个方向、72–78 个主题（单条主题 1–3 个），每库 2–12 分钟；无整体失败。
- 真实界面（端口 8031，状态临时副本）：农业库分支横条模式（项目名标注、阶梯线、2024/2025 节点）、医疗与机器人库计数格模式（2018–2025）、叶节点详情；430px 无横向溢出，无页面错误。截图 `agri-*.png`、`med-*.png`、`robot-*.png`。界面曾提示“需重新生成”，原因是测试服务使用较早复制的项目索引状态；用真实状态读取三个库均为 ready。

限制：成熟度是模型对项目自述的研判（如“提升未知复杂场景泛化能力”被判为系统集成级），未经领域审核，同库重跑的框架与归类会变化（医疗库未归类 6→48）；小库主题多为单条；“当年达到”按结题年计，无法反映项目中期进展。工作树未提交、未推送。

### 16.67 撤回模型面板代理开关，默认直连（2026-10-09，工作树未提交）

- 用户要求：确认不走代理（127.0.0.1:7897）时 deepseek-flash 可正常调用，设直连为默认，删除前端模型面板的代理开关（用户判定为过度设计）。
- 实现：删除面板开关、`PUT /api/model/proxy`、`STATE_DIR/model_settings.json` 与 `/api/model` 的 `proxy` 字段及对应测试；`use_proxy` 只读 `.env` 的 `MODEL_USE_PROXY`（默认 false），作为网络必须经代理时的唯一入口。本机 `.env` 改为 false。
- 直连实测：第一次检查时本机全部直连失败（含 baidu），默认路由与 DNS 均指向 198.18.0.x（Windows 侧代理 TUN/fake-IP）；之后复测直连恢复：`curl` 4/4 HTTP 401（无密钥，预期）约 0.3 s；`check_model` 正常 263–308 ms；deepseek-flash 实际对话 20/20 成功，中位 0.74 s、最长 0.95 s。期间出现过 1 次 15 s 连接超时，随后立即恢复。
- 验证：pytest 229 passed（去掉 1 个代理开关测试，deselect test_evaluate）；ruff 46（基线不变）；tsc、npm test 36 passed、build 通过；真实服务 `PUT /api/model/proxy` 返回 405，模型面板无代理开关、“测试连接”显示“连接正常 · 308 ms”，无页面错误（截图 `verification/query-20261009-0947/model-panel-no-proxy.png`）。

### 16.68 query「2026-1009 1541」：任务模板统一视图、大纲编辑、清理与报告模板库（2026-10-09，工作树未提交）

- 后端：`custom_tasks` 增加 `outline` 与 `delete`（仅未发布草稿，已发布 409）；复制内置任务时预填默认大纲（`prompts.default_outline`，由用途与输出提示生成），`goal` 不再必填，发布要求“名称 + 大纲或目标”；`custom_templates.delete` 同规则；新增 `DELETE /api/tasks/custom/{id}`、`DELETE /api/templates/custom/{id}`；`/api/templates` 的内置项带章节正文供模板库卡片显示；对话图、报告生成与 `main` 的任务注入加入“任务大纲”，空字段不再注入。
- 前端：新增 `TemplatePanels.tsx`（任务模板 / 报告模板两个面板，阅读态显示大纲，编辑态为大纲编辑器 + 预览效果切换，内置项保存时才复制），替换检查器中原任务表单与模板表单；`TasksView` 卡片改为 预览 / 修改 / 上传 / 删除或归档 / 开始分析，新增“报告模板库”区与“已归档”列表；上传到普通任务写入大纲，上传到报告任务或模板库生成我的模板草稿。
- 验证：pytest 230 passed（新增 `test_outline_edit_reaches_the_run_and_unused_drafts_can_be_removed`，含大纲进入运行状态、已发布删除 409、草稿删除、模板草稿删除），deselect test_evaluate；ruff 45（基线 46，顺带去掉一个未用导入并整理 main 导入顺序）；tsc、npm test 36、build 通过；新增离线浏览器 `tests/browser_task_templates.py` PASS；`browser_scene_hierarchy`、`browser_review_flows`、`browser_answer_controls` PASS。
- 真实界面（真实状态副本 + deepseek-flash）：预览无输入框、修改为同一视图的大纲编辑器；内置“技术研判”编辑后发布为“技术研判（我的）v1”；6 份遗留“精准问答”草稿逐一删除，卡片 11 → 5；归档后从卡片消失并可在“已归档”恢复；模板库 5 个内置模板显示章节，热点报告加一节后预览、保存草稿、删除；专项报告修改时模板下拉 5 个可选；430px 无横向溢出、无页面错误。用发布的大纲任务实际提问，回答出现大纲要求的“可继续工作”项（该会话所选为信息智能库，资料不涉及该问题，回答如实说明）。截图见 `verification/query-20261009-1541/`。
- 未处理：`tests/browser_custom_tasks_live.py` 在本次改动前已失效（首步点击已改名的“任务”入口），覆盖的旧表单界面已被本次替换，未修复；`browser_tasks`、`browser_ui_shell` 的既有失效同前。真实状态 `.knowledge/.state` 中 6 份遗留草稿未替用户删除（上面只在副本中删除）。

### 16.69 query「2026-1009 1544」「1627」：技术谱系汇报视图与发展图语义修正（2026-10-09，工作树未提交）

- 设计见 PROJECT §15.3，取舍见 DECISIONS“技术谱系面向资深专家与管理层”。
- 后端（`lineage.py`、`prompts/lineage.md`）：框架输出体系/方向的通俗说明 `plain` 与方向的 `foundation`（共性支撑）标记；提示加入分类标准（体系=方法学科、方向=学科内按原理细分、主题须为方向下位概念、每条只归一处）；首轮未归入的条目再归类一次（只补位置，不改阶段）；仍未归入的以“未归入体系的条目”列在最后并标 `unplaced`。
- 前端：新增 `briefing.ts`（阶段分档、按规则从引文摘指标、主展板/共性底座/大纲的纯计算，含单元测试）与 `ReportBoard.tsx`（汇报视图：主展板、共性底座、场景展开页、门槛筛选与“当前筛选”提示、复制汇报大纲、未归入条目数量与入口）；技术谱系页默认汇报视图，可切到技术视图；技术视图显示通俗说明、共性底座标记、分类标准，树中技术名可两行、项目名移出行内、高层只显示项目数，其他领域折叠为“切换领域”，从汇报视图跳入时自动展开到对应条目。`TechTimeline` 改为“项目周期与报告所述验证阶段”，删除阶梯虚线与“首次达到”节点，摘要改为“本分支已有项目报告达到”，图中文字放大；“同一项目配套使用的技术”改为“同项目还涉及的技术”；阶段色最高级由红改为金色；四维导航窄屏紧凑；侧栏“当前资料库”改为“当前对话使用”。
- 真实生成（deepseek-flash，全部 11 库重新生成，日志 `verification/query-20261009-1544/lineage-regen.log`）：未归入条目 医疗 48 → 2、机器人 23 → 2，其余 9 库为 0（农业此前 2）。医疗库 8 个体系名称为经典学科说法（机器学习与模式识别、计算机视觉与影像分析、影像组学与多组学、信号处理与传感检测等），标出 6 个共性底座方向（联邦与可信学习、模型解释与鲁棒性、组学数据治理、图像预处理与配准、传感与检测系统、模型评估与选择）。
- 验证：pytest 230 passed（`test_lineage_and_outcome_list_stay_traceable` 扩展覆盖通俗说明、底座标记、二次归类只补位置不改阶段）；ruff 45；tsc、npm test 38（新增 `briefing.test.mts` 2 项：指标摘取不误取年份与裸整数、主展板/底座/筛选/大纲）、build 通过；离线 `browser_scene_hierarchy`（重写谱系步骤：默认汇报视图、底座、展开页、筛选提示、跳入技术视图、阶段图无“发展节点”）、`browser_task_templates`、`browser_review_flows`、`browser_answer_controls` PASS。真实界面：医疗库 6 个场景卡、6 个底座、展开页指标均可在原文引句中找到（如 AUC 0.816–0.914 对应外部/内部/训练集原句），“成型技术及以上”提示收起 44 条路线、12 项成果；机器人库同样可用（底座为知识融合与可信学习、仿真平台与数字孪生）；430px 无横向溢出、无页面错误。截图与大纲样例见 `verification/query-20261009-1544/`。
- 未处理：直接打开 `/library/<库>`（不带子路径）服务端返回 404 的既有问题，因现有测试要求未知路径 404，未在本轮改动；分类与“同项目还涉及的技术”的严格关系、发展事件时间线需 target v2 提取事件后再做；“共性底座”取决于模型标记，部分（如医疗“图像预处理与配准”）是否算底座需领域人员确认。

### 16.70 query「2026-1009 1720」：领域 × 环节主展板（2026-10-09，工作树未提交）

- 评估 Gemini 三方案后用户确认按“方案一为主图、方案二为技术视图、方案三为筛选与大纲”实施（设计见 PROJECT §15.3 第 11 条）。核对时发现 Gemini 示例把 NSFC:62202455 的“50余家医院部署”（阶段 5）误挂到 NSFC:62202435 的 DAFed（阶段 4、5 家医院数据）上，因此谱系与指标一律由数据生成，不采用手写示例树。
- 后端：谱系框架额外输出 `stages`（业务环节）；存在场景归纳时 `fields` 直接取场景名并要求模型原样使用；归类批次同时给出 `field`/`stage` 编号，非法编号记为空；二次归类只补空缺的领域/环节，不改首轮判定。记录新增 `fields`、`stages` 与条目的 `field`、`stage`。
- 前端：`briefing.ts` 新增 `buildMatrix`/`matrixOutline`（未判定行列、门槛筛选、按方向归并、旧谱系按项目所在场景回退分行），删除被替代的 `boardOutline`；`ReportBoard` 主展板改为矩阵表，领域展开页为环节标签 → 方向折叠 → 条目，并保留代表问题与标志性成果。
- 验证：pytest 230 passed（谱系测试覆盖领域取自场景、环节解析、F0/越界为空）；npm test 39（新增矩阵用例）；tsc、build 通过；离线 `browser_scene_hierarchy` 按新主展板重写并通过；本轮文件无新增 ruff 问题（总数 48 中新增 3 条均在他人修改的 `src/targets.py`）。
- **阻塞，未完成真实生成**：17:10 前后另一会话在改四维提取（`src/targets.py` SCHEMA_VERSION 1→2、`target_extract.md`，新增技术角色、归属、带日期事件等），各库 `target/*.json` 已从工作区删除（git 中仍有；医疗 521 个仅剩 4 个临时文件），项目索引中四维条目为 0，谱系生成返回 409“本库还没有技术维度的整理条目”。本轮未恢复这些文件、未改 `targets.py`。医疗库 `lineage.json` 保持 16:52 的版本（无领域/环节字段），汇报视图暂按项目所在场景分行、不分环节，并在页面说明。待四维重新提取后需重新生成全部谱系。

### 16.71 技术视图按 Gemini 方案二调整、颜色带文字（2026-10-09，工作树未提交）

- 用户要求技术视图树参考 Gemini 推荐方案调整，并指出“有的横向颜色条没有字、有的有字，设计语言不和谐”。设计见 PROJECT §15.3 第 12–13 条。
- 前端：`LineageTree` 改为 L1 学科体系 › L2 技术方向 › L3 方法主题 › L4 应用承载 › L5 项目技术，L5 带阶段徽标与指标，承载内按阶段排序、默认 5 条可展开，默认展开到 L2，新增“展开到 L2–L5 / 全部收起”和“复制谱系大纲”；新增 `StageMarks.tsx`（阶段徽标、带文字的阶段计数、指标标签）供汇报视图与技术视图共用，删除无文字的 `TierBar`、`MaturityBar`；`TechTimeline` 删去无名称细条模式（>24 个项目即用数字年份格），短横条名称标在条后；`briefing.ts` 抽出 `fieldResolver`（矩阵与树共用），新增 `lineageOutline`。
- 验证：pytest 230 passed；npm test 40（新增大纲用例）；tsc、build 通过；离线 `browser_scene_hierarchy`（新增 L5 展开、承载、阶段徽标文字、条目详情“应用承载”断言）、`browser_task_templates`、`browser_review_flows`、`browser_answer_controls` PASS；真实界面医疗库技术视图 L1–L5 可展开、无页面错误（截图 `verification/query-20261009-1544/tech-l5.png`）。
- 限制：医疗库现有谱系没有逐条领域字段，L4 暂按项目所在场景回退，场景未覆盖的项目进入“领域未判定”（如“组学标签与列线图”下 24 个项目）；四维提取文件仍被另一会话删除中（医疗 target 仅剩 4 个临时文件），重新生成谱系后 L4 才是逐条判定的领域。

### 16.72 query「2026-1009 1743」：总览/细节图标切换、总览回溯卡片、细节视图标题层级（2026-10-09，工作树未提交）

- 冲突与决定：见 DECISIONS“总览恢复卡片外观、全量内容进展开页”。
- 前端：`SceneHierarchy` 视图切换改为图标单选（新增 `tree` 图标），名称“总览/细节”；`ReportBoard` 主展板恢复场景卡片与彩色阶段条（`TierBar`），卡片按领域生成（含“领域未判定”虚线卡），展开页保留环节 → 方向 → 条目与代表问题/成果，删除矩阵表格组件；界面文字“汇报视图/技术视图”统一改为“总览/细节”；`LineageTree` L1 渲染为分区标题块、L2 为带通俗说明的小标题、L3 起为树，去掉重复根节点（点标题查看全领域）。
- 验证：pytest 230 passed；npm test 40；tsc、build 通过；离线 `browser_scene_hierarchy`（总览卡片、✔/➜、展开页环节标签、细节 L1 标题块）、`browser_task_templates`、`browser_review_flows`、`browser_answer_controls` PASS；真实界面医疗库总览/细节无页面错误、430px 无横向溢出（截图 `verification/query-20261009-1743/`）。
- 现状限制：医疗谱系无逐条领域/环节，总览按项目所在场景归卡，“领域未判定”卡有 241 个项目、461 个条目，展开页不分环节；医疗 `lineage.json` 带有 16:52 一次失败尝试留下的 `error`，页面如实提示“下方为之前的结果”。四维文件待另一会话重提取后重生成全部谱系。
### 16.46 医疗库 target v2 收尾与本地提取通路（2026-10-09）

**任务来源**：query.md 2026-1009 2000——因 deepseek-api 账户余额不足，改为本地零 API 方式完成 target v2 提取，优先 AI与医疗库。

**核查结论（只读）**：`tools/get_target_v2.py` 的线上产出已把医疗库推进到 **511 / 517**，全部 `schema_version=2`、`prompt_version=2`、`process.status=已完成`、`coverage` 无失败块、`rejected=0`。缺口是 **6 份从未提取**（此前手工四维提取阶段的遗漏，非模型失败）：

| doc_id | 项目 |
|---|---|
| 525a277c435b9a306cb6 | 江泓·SCA3MJD 修饰基因与疾病预警平台 |
| 91cf48d66089215d72c4 | 宋兰·儿童喘息症状可解释 AI |
| 80c5867ec108b62a13ea | 李为民·肺癌快速演进关键分子功能可视化 |
| a8943e3c32e65c28792c | 马春燕·超快成像多模态超声组学 CMVD |
| 820b7532978be1932ecb | 陈忠·组胺 H3 受体与摄食神经网络 |
| 5b55d714706d93990be6 | 倪挺·多器官衰老表型组与 AI 预警 |

其余 10 个库 target 目录为 0 份（机器人自动化 510、农业 13、材料 14、金融经济 20、大数据 10、生物识别 10、隐私保护 10、生物医药 9、社会治理 4、信息智能 5），未在本轮范围内。

**实施**：新增 `.workbuddy/commit_target_v2.py`——**不调用任何模型**，读手写草稿（facets / relations / outputs / events），复用 `src/targets.py` 的 `_normalize_segment` → `_Merge` → `_outputs_check` 全套校验与合并逻辑后落盘。因此 schema、枚举、引文可溯源、id 派生、证据定位与线上产出完全一致，唯一差别是内容来源为草稿。逐份先预检引文是否命中原文，再提交。

**结果（6 份全部零 rejected）**：

| doc_id | 场景 | 问题 | 技术 | 成果 | outputs | events | relations |
|---|---|---|---|---|---|---|---|
| 91cf48d6 | 3 | 3 | 5 | 4 | 10 | 3 | 4 |
| a8943e3c | 3 | 3 | 4 | 4 | 11 | 3 | 5 |
| 820b7532 | 2 | 2 | 3 | 4 | 6 | 2 | 4 |
| 525a277c | 2 | 3 | 4 | 4 | 5 | 2 | 5 |
| 80c5867e | 3 | 2 | 4 | 4 | 9 | 3 | 5 |
| 5b55d714 | 2 | 2 | 5 | 5 | 9 | 3 | 5 |

**复验（产品代码口径）**：医疗库 517 份全部 `_record_state = current`，`needs_extraction` 为真的文档数 **0**；outputs 总数 5978 → **6028**，events 11 → **27**、含 events 的文件 11 → **17**。

**本地提取的四个易错点（后续沿用）**：
1. `relations` 每条**必须**带 `"basis": "原文明示"`，否则被静默跳过（不报错、结果为 0 条）。
2. 专利/成果的 `year`、`identifiers` 必须在该条目引文中可读；成果目录区的著录行常不含年份，改用正文的「专利申请号/申请日期/专利状态」段落作引文更稳。
3. 成果维度 `status` 枚举是 已取得/在研/预期/原文未明确，**没有「申请」「授权」**——那是 `outputs.kind=专利` 的枚举；混用会被拒。
4. 空格与全半角必须逐字照抄（如 `C MVD`、`Nature Genet ics`、`Quantita tive Imaging`、`Cel1 Discovery`）。

**提交**：`c80ef01`（6 份 target + 提交器）。`.workbuddy/` 被 gitignore，提交器需 `git add -f`。

**未解决（不隐瞒）**：医疗库 events 覆盖率仅 17/517（3.3%）。codex-astra 2026-1009 1627 指出的「发展图把最终成果误读成当年水平、缺真实事件无法形成突破时间线」**仍未闭环**——当前 events 只覆盖有明确日期的论文发表、专利申请与部署事件。这需要为剩余 500 份补事件提取，属独立一轮工作量，未在本轮范围内，也未修改任何前端时间线代码。### 16.47 events 覆盖率的真实成因与派生结果（2026-10-09）

**起因**：§16.46 把「events 仅 17/517」列为未解决项。本节给出证据性归因，并交付一次可溯源的派生。

**关键核查：覆盖率低不是提取能力不足，而是语料本身缺少事件事实。**

| 证据 | 数值 |
|---|---|
| 全库日期串总数（医疗库） | 3083 |
| 其中紧邻 `研究期限` 字段 | 1000 |
| 紧邻 `填表日期` 字段 | 34 |
| 紧邻 `依托单位` / `项目编号` / `批准号` 等表头元信息 | 3 |
| **真正的 `申请日期` / `授权公告日` 字段** | **3** |
| 其余为叙述正文内年份（含一稿多投、参考文献年份） | 2044 |

进一步逐句诊断 517 份：把「事件语义词 + 可溯源日期」要求同时满足后，**496 份为「无语义」**（日期全在表头/研究期限）、7 份「有语义但被过滤」、仅 14 份命中。也就是说规则没有漏判，正文里确实不存在「某年某月做了某事」的可引用叙述。

**成果列表区的著录也无法补**：核实 `## 成果列表` 为系统渲染的简化格式 `[期刊论文] 题名 — 作者`，**不含发表年份**；专利条目同样无申请号与日期。按 v2 提示词规则 6（「year/identifiers 必须能在引文中读到，不得从项目起止年份或文件名推断」），从题名里的数字推断发表年属推断，不做。

**已交付的派生**：新增 `.workbuddy/derive_events.py`，规则化抽取「事件语义词 + 可溯源日期 + 已完成状态」同现的句子，产出仍交给 `targets._normalize_segment` / `_Merge` 做同一套校验，去重口径与 `_Merge` 一致（`type + date + 归一化 desc[:120]`），可重复运行幂等。医疗库写入 **14 份 / 23 条**，events 27 → **50**，含 events 的文档 11 → **27**，517 份仍全部 `current`、`needs_extraction = 0`。

**开发中修掉的三个会产出错误事实的缺陷（规则化抽取必须先审这些）**：

1. **否定事实被当事件**：初版把「本研究是…博士学位论文中的第二章内容，没有公开发表」「尚未发表」判为"论文发表"。加入 `NEGATIVE`（未发表/未公开/已投稿/在审/未授权/申请中…）整句丢弃。
2. **日期抓错**：初版从「专利状态:优先审查中（2026年1月14日）」抓到 2026-01-14 当申请日期。改为优先取 `申请日期|授权公告日|公开日|公告日` 字段值（`PAT_FIELD_DATE`），该例修正为 `2025-05-21`。
3. **学术活动误判部署**：「举办…线上推广」「学术报告」被判"部署"。加入 `NOT_DEPLOY`（推广项目/培训班/学术会议/论坛/讲座）过滤。

**仍需如实说明的边界**：

- 派生产物 `self_reported` 统一为 `true`——这些事件来自项目方自己的结题报告叙述，属于自述；模型产出时应逐条判断，故派生值只保证可溯源、不保证判断最优。
- 派生产物 `tech_ids` / `output_ids` 为空，未与四维技术条目、可枚举成果建立关联；时间线上的「事件属于哪条技术」目前查不到。
- events 覆盖率 27/517（5.2%）。**这不是待补的缺口，而是语料事实**：NSFC 结题报告体裁不叙述带日期的事件。因此 §16.46 中「codex 指出的时间线缺口仍未闭环」这一表述应修正为——**在当前语料下无法通过提取 events 闭环**；若确需技术突破时间线，需要额外来源（如项目立项/中检/年检记录）或改变时间线的语义（改用项目立项年份 + 报告所述验证阶段，并按 codex 建议明确标注为「项目周期与报告所述验证阶段」，不声称"首次达到"）。
- 未修改任何前端时间线代码。

**提交**：待本节与派生器一并提交。### 16.48 启动其余 10 库的 target v2 提取（2026-10-09）

**进度**：全库 v2 从 **511 → 522 / 1122**。医疗库 517/517 保持完整，本轮新增信息智能库 5/5。剩余缺口 600 份（机器人自动化 510、农业 13、材料 14、金融经济 20、大数据 10、生物识别 10、隐私保护 10、生物医药 9、社会治理 4）。

**跨库流程已验证**：`commit_target_v2.py` 直接按库名子串定位，无需改代码。信息智能 5 份四维合计 场景 9 / 问题 11 / 技术 17 / 成果 12、outputs 19、events 1、relations 22，**最终零 rejected**。

**本轮又踩到的两类引文错误（比上一轮更隐蔽，值得记）**：

1. **跨句拼接伪装成单句**：「确保了…确保了…正确性」——原文实为「重点围绕…开展战略研究，确保本重大研究计划各项子项目的基础理论、科研方向和技术路线的正确性」。写成两段拼接必失败。
2. **漏字**：「奠定了基础」vs 原文「奠定了**重要**基础」。这类一字之差肉眼不可见。

结论不变且再次验证：**写草稿前先用脚本逐条 `quote in markdown` 预检**，不要靠阅读记忆转写；命中失败时用「定位关键词 + 打印前后 100 字符 repr + 逐字符 zip 比对」三步定位，比反复试改快得多。

**未提交**：`.workbuddy/` 在 gitignore 内，本轮新增的 `derive_events.py`、`scan_event_scale.py` 已用 `git add -f` 提交；信息智能库 5 份 target 与 ITERATION 文档待提交。其他库仍为空，未做任何改动。### 16.49 小库 v2 批量推进（2026-10-09 续做）

**进度**：全库 v2 由 526 → **565 / 1122（50.4%）**。本轮完成 4 个库、共 39 份，**全部零 rejected**：

| 库 | 份数 | 内容 |
|---|---|---|
| 生物医药 | 9/9 | 蛋白/药物设计、SERS药物机制、拉曼成像、DDI预测、FLIM肿瘤微环境、腈水解酶进化、微流控芯片设计 |
| 大数据 | 10/10 | 采煤机数字孪生、大数据聚类、网络谣言治理、因果迁移学习、恙虫病时空、生物网络、气候风险、贝叶斯因子、中医体质、统计研讨班 |
| 隐私保护 | 10/10 | 图神经网络隐私、区块链联邦、边缘智能、非贯通数据联邦、C-V2X、商务智能隐私、图神经网络SMPC、多方隐私计算、模型遗忘、图表示隐私 |
| 生物识别 | 10/10 | 肝癌微血管侵犯、法医体液溯源、精准肝段外科、糖抗体重组蛋白、焦亡探针、垂体腺瘤、器官衰老 |

累计已完成的 7 个库：医疗 517、信息智能 5、社会治理 4、生物医药 9、大数据 10、隐私保护 10、生物识别 10。

**重要发现：跨库同源报告**。生物识别库的 `28da67af`（SCA3 修饰基因）与 `05dd16a4`（多器官衰老表型组）分别是医疗库 `525a277c` 与 `5b55d714` 的同一份报告、不同 doc_id。直接复用已校验的草稿内容提交，**全部引文一次命中**——反向印证了那两份提取的可靠性。遇到同源报告时应优先查库内是否已有同项目提取结果，不要重写。

**本轮新增的引文错误类型（4 类）**：

1. **「本研究」vs「本项目」**：结题摘要段多写「本研究从…出发」，我按习惯写成「本项目」→ 必失败（8ac40244、da152f89）。
2. **无中生有的连接词**：给引文加了原文没有的「然而」（7402c263）。
3. **汉字「一」被写成破折号「—」**：原文「构建了"识别一分类一评价"一体化的治理理论与方法体系」是汉字「一」（39295a97）。
4. **题名拼写错误会传染**：原文 `Identiffcation`（少一个 i），我按记忆写成 `Identification`，引文即失效。

**规律不变**：所有失败都源于「按记忆改写」而非「逐字照抄」。**写草稿前先跑脚本 `quote in markdown` 预检**是唯一可靠的防错手段。

**剩余缺口 557**：机器人自动化 510、农业 13、材料 14、金融经济 20。机器人库已验证 510 份全部含标准摘要节、中位长度 5360 字符，可按同节批推进（约 26 批）。
### 16.50 农业库 v2 完成（2026-10-09）

**农业库 13/13 完成，零 rejected**。覆盖：PhytoExpr 转录调控区大模型 + QUIC-seq 低成本建库、跨媒体农业知识表示、棉花机械导航（DeepLabV3+ + LQR/DDQN 双控制器）、矿区生态遥感反演（模型群）、植物表型多模态分析（弱监督实例分割 + 骨架重建）、SpectralGPT 高光谱基础大模型、玉米基因型-表型因果分析、水稻 PE 大片段编辑、马铃薯 CWSI 高通量检测、小麦 AFB1 纳米色敏传感、作物深层表型平台（RPT）、鸡群健康大模型监测（EMSC-DETR / LCD-YOLOv8n / MCA-YOLOv5）。

**全库进度 578 / 1122（51.5%）**，已完成 8 个库。剩余：机器人自动化 510、材料 14、金融经济 20。

**本轮 3 类新引文错误**：

1. **引文取自「中文摘要」段，但我在结题摘要里找**（162b0c7e 的「第二，如何解析复杂性状背后的多基因遗传互作」只存在于中文摘要，结题摘要无此句）。摘要是两段独立文本，**不能跨段假设某句在另一段也存在**。
2. **跨段/跨句合并成一段引文**：如把「共发表论文66篇…」和「获国家发明专利10项…」拼成一段 → 原文中间有换行符，必失败。
3. **全角括号误记**：`作物水分胁迫指数(CWSI)`（半角）我写成 `（CWSI）`（全角）。

**规律再次验证**：10 次失败 100% 出在「凭印象转写」，0 次出在逻辑错误。落地做法不变：写完草稿先跑 `quote in markdown` 预检，再提交。

### 16.51 材料与金融经济库 v2 完成，10 个小库全部收官（2026-10-09）

**新增两个库**：材料 14/14、金融经济 20/20，均零 rejected（初次提交共 8 处引文/枚举未命中，修正后归零）。

**全库进度 612 / 1122（54.5%）**，`verify_all_targets.py` 复验：**11 个库 612 份全部 `current`，missing/stale 均为 0，全库 rejected 合计 0**，outputs 6203 条、events 57 条。

| 库 | docs | current | outputs |
|---|---|---|---|
| 医疗 | 517 | 517 | 6028 |
| 信息智能 / 社会治理 / 生物医药 / 大数据 / 隐私保护 / 生物识别 / 农业 / 材料 / 金融经济 | 95 | 95 | 175 |
| 机器人自动化 | 510 | **0（未开始）** | 0 |

**新增工具 `.workbuddy/slice_quote.py`**：给定原文必然存在的定位子串，向两侧扩到句读边界，直接产出可放进 draft 的引文。这是对 §16.50 结论的工程化落地——**不要再手写引文**。用法：改 CASES 里的 (doc_id, 维度/关系类型, 定位子串) 后运行，输出已自校验 `quote in markdown`。

**工具化后暴露的两个新问题**：

1. **按条目名定位的补丁会静默失效**：条目在后续修正中被改名后（如 `遗传互作解析困难` → `缺乏有效关联方法`），键不匹配，补丁「修正 0 处」而不报错。第二版改为**按维度/关系类型批量替换**才生效。教训：修复脚本必须报告「实际改动数」，0 改动要视为失败而非成功。
2. **WSL 内 Python 可直接写 `.knowledge/`**，而 Windows 侧读的是 9P 缓存。同一路径两处读取结果可能不同——判断「是否已写入」要以 WSL 内或 `verify_all_targets.py` 的结果为准。

**剩余**：仅机器人自动化 510 份。已验证该库 510 份全部含标准摘要节、markdown 中位长度 5360 字符（约医疗库的三分之一），单份读取量小，可按 ~26 批推进。


### 16.73 全库 target v2 收官：机器人自动化 510 份 + 范式升级为确定性提取（2026-10-09）

**里程碑**：机器人自动化 510 份完成 → **全库 1122 / 1122（100%）**，`verify_all_targets.py` 复验：11 个库全部 `current`，`missing / stale / rejected` **全 0**，outputs 16619 条、events 68 条。

| 库 | docs | current | outputs | events | rejected |
|---|---|---|---|---|---|
| 机器人自动化 | 510 | 510 | 10416 | 11 | 0 |
| 医疗 | 517 | 517 | 6028 | 50 | 0 |
| 信息智能 / 社会治理 / 生物医药 / 大数据 / 隐私保护 / 生物识别 / 农业 / 材料 / 金融经济 | 95 | 95 | 175 | 7 | 0 |
| **合计** | **1122** | **1122** | **16619** | **68** | **0** |

**范式升级（本轮最重要的决定）**：接手时机器人库 `target/` 里只剩 4 个损坏的 `sed*` 临时文件（旧 `sed -i` 中断残留），**没有任何可复用的 v1 四维产物**——手写草稿分 26 批不现实。叠加 deepseek api 余额不足，改为**确定性规则本地提取**，新增 `.workbuddy/local_extract_v2.py`：不调模型，直接从原文按规则取四维 + 成果 + 事件，再交给 `src/targets.py` 的 `_normalize_segment` / `_Merge` / `_outputs_check` 做与线上产出**完全一致**的校验，因此 schema、枚举、引文可溯源、id 派生均与模型产出同构。

四条提取路径：

1. **outputs — 消费报告自带的「成果列表(N)」著录**（`achievement_list.parse`）。500/510 份含该小节，type→kind 固定映射（期刊论文 / 会议论文 / 专利 / 奖励 / 专著），**10427 条著录 → 10416 条 outputs**。这是量级最大的一块收益，且完全逐字来自原文。
2. **四维（主路径）— 标题小节映射**：科学问题→问题；关键技术 / 研究内容 / 技术路线→技术；应用背景 / 应用场景 / 应用示范→场景；研究成果 / 进展 / 结论 / 摘要→成果。每维最多取 3 条。
3. **四维（兜底）— 关键词评分挖句** `_mine_sentences()`：510 份版式高度不统一（仅约 202 份含「科学问题 / 研究内容」小节），只靠标题匹配会让问题 / 技术两维几乎为空。兜底要求句子命中 ≥2 个维度关键词、长度 14–220 字、非表格/标题行，且逐字校验 `sent in markdown`。**实测：加兜底前 问题/技术 仅 3/21 条，加完 341/1025 条**——覆盖率问题基本解决。
4. **events — 复用 `derive_events.extract_events` 规则**，仅 11 条。这是**诚实结果**：全库只有 2 份报告含「专利申报 / 授权」叙述段（正则实测），不硬凑时间线。

**核心工程结论（铁律升级）**：本轮 `_normalize_segment` 校验**零 rejected、一次通过**，所有引文 100% 逐字取自原文。对照 §16.49–16.51：此前约 200 份的引文失败 **100% 出在「凭印象手写」**（漏字、自造连接词、全半角混淆、跨段假设），改成「程序化从原文取」后该类失败**归零**。⇒ **大库 / 多库场景应优先写确定性提取器，而不是手写草稿**；`slice_quote.py` 是手写路径下的兜底工具，而非首选。

**一处已定位的非缺陷（勿重复排查）**：`outputs_check` 有 10 份显示 `inconsistent`（专利 −7、奖励/专著 −3、期刊论文 −1）。根因是 `_Merge` 按 `kind + title + attribution` 去重，而这 10 份报告的成果列表里**同一题名被重复著录**（如 `一种点云位姿调整方法及装置` ×2）。实测 `listed − extracted` 恒等于重复计数，属正确行为，无需修复。

**环境备忘（本轮踩坑）**：

1. `wsl.exe` 被 WorkBuddy 安全策略拉黑且不可绕过，唯一通道是 ssh 桥
   `bash /c/Users/User/.workbuddy/wsl-bridge/wb-wsl.sh '<cmd>'`；传文件用 `wb-scp.sh`（Windows→WSL 方向）。
2. **必须用项目 venv**：`.venv/bin/python`（3.12）。系统 `python3` 是 3.10，`src/targets.py` 的
   `from datetime import UTC` 会直接 ImportError——这是本轮第一次尝试的失败原因。
3. Windows 侧 `Glob` 工具在该仓库大目录上会搜索超时（30s），定位文件改用 `Bash` + 精确 `ls` / `find`。

**清理**：删除机器人库 `target/` 下 4 个损坏 `sed*` 残留，现为 510 个 `.json`、0 残留。

**独立审计（不依赖 `verify_all_targets.py`）**：直接扫磁盘全部 `target/*.json`——1122 份全部 `schema_version=2` / `prompt_version=2` / `status=已完成`，四维齐全、**零结构异常、rejected=0**，四维条目合计 场景 1506 / 问题 1081 / 技术 2695 / 成果 2076，**零四维条目文档 0 份**。另跨 9 个库随机抽 120 份、805 条四维引文回原文逐字比对，**未命中 0 条**。

**遗留**：`ITERATION.md` §16.51 曾因追加操作被重复写入两份（内容逐字相同），已删除重复块（保留 2931 行那一份；另一处 `16.51` 是 2026-09-30 的历史小节，非重复）。数据文件、提取器脚本与本节文档的 git 提交在本轮补做。


### 16.74 events 覆盖率提升：68 → 1351（+1283，19.9 倍）（2026-10-09）

**背景**：§16.51 起就记录「events 覆盖率仅 17/517（3.3%）」是遗留缺口。本轮定位根因并修复。

**根因（实测确认，非猜测）**：`derive_events.extract_events` 原本在取不到日期时 `continue`，整条事件被丢弃。实测对比「严格(需日期)」与「放宽(免日期)」两种口径：

| 库 | 文档 | 严格命中 | 放宽命中 | 可增量 |
|---|---|---|---|---|
| 医疗 | 517 | 14 | 224 | +210 |
| 机器人自动化 | 510 | 5 | 221 | +216 |

即 **约 96% 的候选事件被「必须有日期」这一条卡掉**。而按 `targets._event_date` 的契约，`date=""` 是**合法**的（返回 `("", "未知")`，`precision` 记为「未知」），只有「日期非空但引文里读不到年份」才抛错。⇒ 改为**日期可选**，覆盖率立即从 68 升到千级。

**改动**（`.workbuddy/derive_events.py`）：

1. **日期改为可选**：能读到就用（优先取「申请日期/授权公告日」字段值），读不到留空。不再因缺日期丢弃事件。
2. **放宽分句门槛**：句子级关键词白名单补入 `研制完成/研制成功/建成/通过验收/成功研制/获得/荣获/通过…鉴定`。
3. **新增 4 条事件规则**：样机（研制完成/建成/通过验收）、其他（突破/首次实现）、其他（获/荣获奖项）、其他（通过鉴定/验收/评审）。
4. **新增噪声过滤 `NOISE`**（6 类，带可审计理由）：版式行(标题/表格)、图表题、经费/预算说明、总计式罗列（「共发表论文87篇」与成果列表著录重复且非时点事件）、清单式罗列（成果列表表格行）、参考文献行。
5. 排除原因随 `extract_events.last_dropped` 带出，`main()` 汇总打印「噪声排除：总计式罗列 33、清单式罗列 8 …」，**保持排除可审计**（符合项目「可见排除原因」契约）。

**结果**：`verify_all_targets.py` 复验 **11 库 1122/1122 current、missing/stale/rejected 全 0**，events **68 → 1351**。类型分布：部署 522、论文发表 327、其他 244、专利授权 115、试验 114、专利申请 24、样机 5。有事件的文档数：医疗 230/517、机器人 244/510、农业 11/13、隐私保护 10/10 等。

**独立审计**（全量、不依赖 verify 脚本）：

- 引文逐字回原文比对 **1351 条全部命中，未命中 0**；
- 噪声复检：过滤后 **100% 干净**（6 类噪声全部为 0，改动前为 91.4% 干净）；
- 有日期的 140 条事件，**年份 100% 可在引文中读到**（0 违规）；
- `precision` 分布全部合法：未知 1211 / 年 103 / 日 22 / 月 15。

**关于「有日期事件仅占 10.4%」的如实说明**：这是**源数据的真实特征，不是规则缺陷**。诊断显示其余 1211 条无日期事件中，1099 条所在全文确实有年份，但那些年份多为**噪声**（项目批准号 `62031003`、admin 哈希等），并非事件日期；另 112 条「句子内含年份」经逐条查看全是**期刊名后缀**（`AAAI-2023`、`KDD-2025`、`IEEE TNNLS-2024` 等 CCF 等级标注），把它们当发表日期会**制造错误时间线**。故保持留空是正确的保守策略。

**本轮踩坑（重要，属环境级）**：本环境（uv cpython-3.12.13）实测 **`d[k] += 1` 这种字典下标增强赋值会抛 `KeyError`**，连 `d = {}; d["abc"] += 1` 都复现，而 `dict.__setitem__`/`__getitem__` 显式调用、`collections.Counter`、`d.get(k, 0) + 1` 均正常——即 CPython 特化路径异常，与本项目代码无关。已把 `derive_events.py` 中两处计数改为 `d[k] = d.get(k, 0) + 1` 写法规避。**后续在该环境写计数器一律用 `Counter` 或 `setdefault`，不要用 `+=`。**
另：scp 传脚本后 `.workbuddy/__pycache__` 可能残留旧 `.pyc`（scp 不保 mtime/size，字节码缓存判定失效），改完脚本若行为异常先 `rm -rf .workbuddy/__pycache__` 再排查。

**改动文件**：`.workbuddy/derive_events.py`（唯一改动点）、全库 1122 份 target 记录中的 events 字段（数据）。四维与 outputs 未受影响。

### 16.73 target-v2 后重生成场景归纳与技术谱系（2026-10-09，工作树未提交）

- 用户告知 target-v2 提取完成后继续实施。v2 医疗库技术条目 1338 个（v1 为 1024），农业 48 个（v1 148）、机器人 1025 个（v1 1260）。v2 新增的技术角色 94% 为“关键创新”，带日期事件全库仅 50 条（46 条有日期、12 条关联技术），暂不足以支撑真实发展时间线，未接入；项目索引仍只传技术条目名称与说明。
- 先用旧场景名重生成一次谱系后发现场景归纳基于 v1、54 条代表路线仅 2 条还能连上 v2 条目，于是按“场景归纳 → 谱系”顺序全部重建：11 库场景归纳（`verification/query-20261009-1544/hierarchy-regen.log`），再 11 库谱系（`lineage-regen.log`）。医疗：6 个场景即 6 个应用领域，36/36 条代表路线连上谱系条目，未归入体系 1 条；领域未判定 183 条、环节未判定 197 条。
- 代码：`lineage.read` 在场景名与谱系领域不一致时标为 stale 并给出原因 `stale_reason`（总览与细节视图都显示）；谱系测试补充该情形。细节视图与大纲中“领域未判定”承载排在最后。
- 验证：pytest 230 passed；npm test 40；tsc、build 通过；四个离线浏览器脚本 PASS；真实界面医疗库总览 7 张卡（含领域未判定）、展开页环节标签与方向/条目、细节视图 L1–L4 正常，无页面错误（截图 `verification/query-20261009-v2/`）。
- 待定（设计冲突，已提请用户）：新场景归纳把“肿瘤”拆成“影像诊断与分子分型 / 治疗疗效与预后预测”，并有方法类场景“医学影像与病理通用AI方法”，与“领域 × 环节”要求两轴独立冲突（矩阵中肿瘤诊断行 250/322 落在诊断环节、疗效行诊断环节为 0；方法类场景 88 条环节未判定）。

### 16.74 方案A：场景按服务对象重建；谱系任务导出给其他模型（2026-10-10，工作树未提交）

- 用户选择方案A：`prompts/hierarchy.md` 增加“场景按服务对象划分，不按业务环节、不按技术方法；无明确对象的通用方法不单设场景”。全部 11 库按“场景归纳 → 谱系”顺序重建。医疗新场景为 6 类患者群（肺癌与肺结节、乳腺癌与妇科肿瘤、消化系统肿瘤、肝脏与胆道、神经与精神、心血管），每个领域均覆盖 5 个诊疗环节（领域与环节不再重叠），33/33 条代表路线连上谱系条目。
- 修复：场景归纳的模型调用超时/接口错误原先直接变成 HTTP 500 且不留记录（材料、隐私保护两库因此失败），现记为“未完成：模型调用失败（类型）”并保留上一版；场景归纳模型超时由 60 s 调为 180 s（与谱系一致）。新增 `test_hierarchy_provider_error_is_recorded_not_a_server_error`。材料、隐私保护、机器人三库场景归纳重跑成功，材料、隐私保护谱系已随之重生成。
- 未完成：机器人库谱系重生成在 1000/1025 时因停止服务中断（用户 DeepSeek 额度将尽，停止继续调用），磁盘上仍是 10:04 按旧场景名生成的版本，界面显示“场景归纳已重新生成，应用领域需要随之更新”。
- 新问题（待用户决定）：需求 §17 规定场景目标 6 类；按服务对象划分后医疗 6 个场景只覆盖 271/514 个项目，约一半技术条目落入“领域未判定”。
- 用户要求把谱系生成交给其他模型执行：`.logsdev/lineage-task/README.md`（三步流程、两份提示词原文、第②③步消息格式、系统校验规则、交回格式）与 `inputs/`（11 库的条目清单 `*.items.json` 与第①步消息 `*.step1.txt`）。交回结果的组装与导入尚未实现。
- 验证：pytest `tests/test_hierarchy.py tests/test_reports.py` 33 passed。

### 16.75 query「2026-1010 0914」：专业审查大纲顺序；四维浏览陈述逻辑梳理（2026-10-10，工作树未提交）

- 专业审查：`review/templates.py` 内置问题顺序调整（内置模板随代码自动发布新版本，用户复制的模板不受影响）；`review/audit.py` 按模板问题顺序排列模型意见，评价覆盖、按问题分组、修改建议与导出因此一致；`test_review_flows` 让测试模型倒序作答并断言新顺序与意见顺序。
- 四维浏览：页签下增加“本页回答什么”的一句话；总览展开页删除重复的代表问题/标志成果，改为链接到该领域的问题、成果页签；删除旧谱系兼容（无领域字段时按项目场景回退、“生成于划分环节之前”提示）及总览不再使用的代表路线计算；“技术”页签与各处文案统一为“报告所述阶段”徽标/说法。医疗库 6 个场景名去掉“患者”（场景归纳与谱系同步）；`prompts/hierarchy.md` 补充场景命名规则。
- 验证：pytest 231 passed；npm test 40；tsc、build 通过；四个离线浏览器脚本 PASS（`browser_scene_hierarchy` 改为断言总览不再重复问题、并能跳转到成果页签）；真实界面医疗库五个页签与总览/细节无页面错误（截图 `verification/query-20261010-0914/`）。

### 16.76 项目关系图按学部划分扇区（2026-10-10，工作树未提交）

- 用户问项目关系图为何只有信息科学部、医学科学部。原因：扇区取自项目申请代码（首字母为学部），医疗库约 313 份 H、157 份 F，其他学部合计不足 30 份；原实现按三位代码取前 8 个扇区，医疗前 8 全是 H/F，其余 40 个代码（含全部 C/A/B/T/E/D/G）并入灰色“其他代码”，图例又只列出有独立扇区的学部，少数学部因此不可见。用户同意按“先学部、后代码”修改。
- 实现：新增 `frontend/src/departments.ts`（每个有项目的学部都有自己的扇区；项目 ≥24 的大学部按占比 ≥8% 且 ≥6 个项目的前 5 个代码细分，其余代码在本学部内合并为“XX · 其他代码”，不跨学部合并；首字母不属于 NSFC 学部的代码单列“代码待核对”，无代码的单列“代码未知”）与单元测试；`ProjectGraph` 改用它，学部边界线加粗，图例列出全部学部及项目数，并标出待核对的代码。
- 结果：医疗库扇区为 H27、H18、医学其他、F06、F02、F01、信息其他，以及生命、数理、化学、交叉、地球、工程与材料、管理科学部各自一个扇区，“代码待核对 L02”“代码未知 15”；机器人库为 F03、F06、F01、信息其他、E05、E11、E12、工程与材料其他及其余 6 个学部。L02、L14 两个代码不属于 NSFC 学部字母，待核对原文。
- 验证：pytest 231 passed；npm test 42（新增 2 项）；tsc、build 通过；`browser_review_flows`、`browser_scene_hierarchy`、`browser_task_templates`、`browser_answer_controls` PASS；真实界面医疗、机器人库项目关系图无页面错误（截图 `verification/query-20261010-graph/`）。

### 16.77 进度梳理与 Windows clone 可运行性（2026-10-10）

**已完成（自 38b4ebf 以来，本次一并提交）**

- 模型连接：默认直连，删除界面代理开关，仅 `.env` 的 `MODEL_USE_PROXY` 可改（16.67）。
- 存量分析：任务/报告模板统一视图、大纲编辑、草稿删除与归档、报告模板库（16.68）。
- 技术谱系：五级树与项目周期图（16.66、16.69、16.71），总览/细节两视图与图标切换（16.72），应用领域 × 业务环节字段（16.70），场景按服务对象划分（16.74），五个板块的陈述约定与去重（16.75）。全部 11 库已在 target-v2 上按“场景归纳 → 谱系”顺序重建，`hierarchy.json`、`lineage.json` 随仓库提交。
- 场景归纳：模型接口错误/超时不再变成 500（16.74）。
- 资料审查：专业审查评价问题顺序调整，意见按模板顺序（16.75）。
- 项目关系图：按学部划分扇区（16.76）。
- 四维提取 v2：另一会话已提交各库 `target/` v2 数据，但读取 v2 的 `src/targets.py`、`src/prompts/target_extract.md` 与 `tools/get_target_v2.py` 当时未提交；缺这些代码时新 clone 会把 v2 数据判为过期、四维为空，本次一并提交。

**Windows clone 运行**：`launch.cmd` 与 `launch.sh` 等价（创建/复用 `.venv`、安装依赖、无 `frontend/dist` 时 `npm ci && npm run build`、启动服务）。新 clone 没有检索数据库 `datadb/`，需在库详情导入一次建库（用已跟踪的解析缓存，不调用模型）。库登记 `corpora.json` 只含相对路径；`.gitattributes` 以 LF 检出（`.cmd` 为 CRLF），保证解析文本版本与提取证据一致；最长跟踪路径 125 字符。README 已补 Windows 步骤与首次使用说明。**更正（2026-10-10）**：此处原记“全新 clone 冒烟通过”无效——当时用本仓库的 `.venv`（以可编辑方式安装本仓库）启动 clone，实际加载的是本仓库代码与 `.knowledge` 数据。实际问题见 16.80。未在 Windows 实机验证，由用户测试。

**未完成 / 待定**

- 机器人库谱系的应用领域仍对应旧场景名（重生成在 1000/1025 时中断），界面提示需要重新生成；医疗库 6 个场景仅覆盖 271/514 个项目，约一半条目为“领域未判定”，建议保持 6 个场景、由谱系为未覆盖条目补充服务对象领域，待用户决定。两者需要模型调用，谱系任务已导出到 `.logsdev/lineage-task/` 可交其他模型执行，结果组装尚未实现。
- target-v2 的带日期事件已由另一会话补到 1351 条（提交 8455357），可评估是否据此做真实发展时间线。
- 项目关系图中 L02、L14 两个申请代码不属于 NSFC 学部字母，需核对原文。
- 既有失效浏览器脚本：`browser_tasks`、`browser_ui_shell`、`browser_custom_tasks_live`。

### 16.78 query「2026-1010 1124」：细节视图三级图谱与可交互窗口（2026-10-10，工作树未提交）

- 新增 `ZoomPan.tsx`（滚轮缩放、拖动平移、放大/缩小/适应/大窗口、拖动不误触点击、初始适应窗口且不低于可读比例）；`LineageTree` 的文字树替换为三级节点连线图谱（上一级 → 当前 → 下一级，连线粗细按条目数，节点带阶段徽标，超过 14 个可显示全部，单项技术显示同项目技术），顶部路径导航；`TechTimeline` 的图放入同样的窗口。删除旧文字树、展开层级按钮与文字版其他领域分支。布局改为左 3 : 右 2。
- 验证：pytest 231 passed；npm test 42；tsc、build 通过；`browser_scene_hierarchy` 改为在图谱中逐级进入、经路径返回、检查上一级/同项目节点与放大按钮，四个离线浏览器脚本 PASS；真实界面医疗库根层 9 个学科体系、逐级进入到单项技术、大分支（38 项）“显示全部”与大窗口、430px 无横向溢出、无页面错误（截图 `verification/query-20261010-1124/`）。

### 16.79 query「2026-1010 1147」：场景逻辑简图连线整理（2026-10-10，工作树未提交）

- 原因：四列各自垂直居中，成果列顺序与技术位置无关；每项成果连到所有有共同项目的技术，多对多连线交叉；只靠问题关联的成果跨过技术列连线，穿过技术卡片；连线没有箭头。
- 修改（`SceneFlow.tsx`）：改为固定排布——技术按所属问题成组排列、问题居中于其技术、场景居中于全部；成果放在所连节点的平均高度并按需下移避免重叠，无连线的成果排在最后；每项成果默认只画一条实线到共同项目最多的技术，其余共同项目连线仅在选中链条时以虚线出现；只与问题相关的成果不再跨列画线，改在卡片上注明“直接对应问题：…”；连线带箭头，方向为场景 → 问题 → 技术 → 成果；窄屏（宽度 < 720）退化为不画线的分列列表。
- 验证：`browser_scene_hierarchy` 新增断言（默认 4 条带箭头连线）通过，`browser_review_flows` PASS，npm test 42；真实界面医疗库“肺癌与肺结节”“神经系统疾病与精神障碍”两个场景默认与选中状态截图见 `verification/query-20261010-1147/`，无页面错误、430px 无横向溢出。

### 16.80 让 Windows 新 clone 直接可用：提交检索库并使原文路径可移植（2026-10-10）

- 风险：文档编号 `doc_id = sha256(入库时的绝对路径)[:20]`（`knowledge.put`），`target/<doc_id>.json`、谱系与场景层级都以它为键；若在新 clone 删除检索库后重新导入，会得到全新编号、四维与谱系全部对不上。16.77 的冒烟因使用本仓库可编辑安装的 `.venv` 而误判通过。
- 核对：11 个库的 `datadb/knowledge.sqlite3`（共约 95 MB，单文件最大 32 MB）其实早已随仓库提交且与本机一致，旧 README“仓库不附带检索库、需导入建库”的说法有误。检索库保存原编号与以相对路径为键的文件清单：clone 后可直接浏览检索；之后若执行导入，未变化的文件按清单沿用原编号。库中原文路径为原机器绝对路径，`local_path_in_roots` 在路径不属于当前库根时，按库根目录名（默认 `.knowledge`）之后的相对部分映射到本机库根，含 `..` 的仍拒绝；新增 `test_origin_from_another_machine_maps_onto_this_corpora_root`。README 首次使用说明同步更正。`.gitignore` 仅加入 `CLAUDE.md`，`.knowledge/*` 的忽略规则保持不变（检索库以 `-f` 提交）；本机会话、运行、成果等运行状态与项目索引缓存不推送。

