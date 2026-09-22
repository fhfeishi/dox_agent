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

**阶段总览**：A 🟡 · B ⬜ · C 🟡 · D 🟡 · E ⬜ · F ⬜ · G 🟡 · H 🟡 · U 🟡 · K 🟡（K0–K4、K6a、K6–K8 已实现；K5/K9–K11 待做）。

**A 工程基线**：A1–A6 ✅（pyproject/extras、tests、端到端、改名、dev_logs 整理、design 落盘）；A7 契约同步 🟡（E 阶段待补）。

**B 语料与元数据**：B6 ✅（清理语料专属硬编码，改 `AUTO_IMPORT_OFFICIAL`/`WARMUP_QUERY`）；B1 基金入库、B2 元数据、B3 补录、B4 领域/年份过滤、B5 chat `filters` ⬜。

**C 问答收敛**：C1/C2/C3/C5 ✅（移除分类与策略字段、固定专业流程、保留 `allowed_doc_ids`）；C4 多轮/引用/失败说明 🟡。

**D 文档窗口**：D1–D5、D7–D9、D11 ✅；D6 🟡（**降级**：`pdfjs-dist` 未装，PDF 用浏览器原生渲染）；D10 页码三方一致性、D10b OCR/重排再校验 ⬜。

**E 专项报告**：E1–E7 ⬜（`POST /api/reports`、四模板、预览/下载、存储）。

**F 验收**：F1–F6、F8–F13 ⬜；F7 🟡（会话与流式基础已具备）。

**G 任务系统**：G1–G4、G7 ✅；G5 🟡（选择器/绑定/task4 阻断已实现，报告表单待 E）；G6 🟡；G8 任务输出验收、G9 报告入口 ⬜。

**H 知识库管理**：H1–H3（注册表/按库导入/`?corpus=`）✅；H5–H7（选择器/详情/按库文档）✅；**H4 ✅代码**（chat `corpus_id`、按库限定检索，提交 `e7d08e2`）、**H8 ✅代码**（会话绑库、`VITE_UI_CORPUS`，提交 `67d0ff0`），两者**浏览器/真实语料验收未做**；H9 文件名元数据入服务端、H10 真实报告验收 ⬜。

**K 知识库管理与导入优化**：K0（应用级会话库）、K0b（多库 read/file 补 `corpus`）、K1（增量导入 + 文件清单 + 删除同步）、K2（OCR 三档）、K3（liteparse 多 worker）、K4（OCR 运行时配置）、K6a（`corpus_id` 单射+限长）、K6（库新建/显示名重命名/删除）、K7（库内文件列表/上传/重命名/删除，md/pdf/txt）、K8（Word/.docx 解析）✅；K5（两阶段导入+进度/取消）、K9（按 kind 预览）、K10（检索缓存）、K11 验收 ⬜。

**U UI 优化**：U0、U4.1a/U4.1b/U4.2、U5（会话内分支）、U6（电源按钮）、U7（知识库预览）、U8（LLM 状态）、U9.1（侧栏收束）、U9.2/U9.2b（文献库）、U9.4-1（只读模型）✅；U9.3 科研头条 🟡（仅占位）；U1（任务 UI）、U2（文档面板/引用跳转）🟡（代码完成、开关默认 off、浏览器验收未做）；U3 报告入口、U9.4-2 模型选择器 ⬜。

**功能开关**：`VITE_UI_TASKS/FILTERS/DOC_PANEL/REPORTS/NEWS/MODELS/CORPUS` 均已建立、默认 off。启用策略：后端契约已实现 ∧ 浏览器实测通过。

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
| H4/H8 | 按库问答契约与会话绑库 | `e7d08e2`/`67d0ff0`；**浏览器验收未做** |
| 布局对齐 | 开发文档 `.logsdev/`；演示语料 `.demo_langchain/`；`VECTORDB_DIR` | `703d286`/`02cbcd9`；`pytest` 64 passed、路径解析验证 |
| 方案 A 自包含库 | `.knowledge/<库>/{source,datadb,vectordb}`；演示库同构；`corpora.py` 按 role 目录扫描并把库内 `datadb/`/`vectordb/` 作为派生路径 | `c8ecef8`；当时基线 `pytest` 68 passed（新增 `tests/test_corpora.py` 4 例）；端到端导入派生落 `<库>/datadb/knowledge.sqlite3` |
| K0/K0b/K1（提交 `9075895`） | 应用级会话库（`state_dir` + 一次性迁移）；read/file 按 `corpus`；增量导入 + 文件清单 + 删除同步；前端传递 `corpus` | 当时基线 `pytest` 75 passed；`tests/test_corpora_state.py`、`tests/test_incremental_import.py`；`npm run build` + `node --test` 18 passed；实机默认演示库二次导入 `added=0/skipped=1`、删探针 `deleted=1` 且不再出现在 `/api/documents` |
| K2/K3/K4（提交 `4483408`） | OCR 三档（off/force/auto，auto 仅对无文本页 OCR）；liteparse `num_workers`；OCR 模式/语言运行时配置（`GET/PUT /api/ocr-config`，落 `STATE_DIR/ocr.json`） + 设置入口 | `pytest` 80 passed（新增 `tests/test_parsers_ocr.py` 4 例、OCR 配置持久化 1 例）；`npm run build` 通过；默认 `PDF_OCR_MODE=auto`、`PDF_OCR_LANGUAGE=chi_sim+eng` |
| K6a/K6/K7（提交 `b443623`） | `corpus_id_for` 单射+限长；知识库新建/显示名重命名/删除（默认只删派生，`purge_source` 才删源）；库内文件列表/上传（`python-multipart` 流式、200MB 上限、名称规范化）/重命名/删除；前端 `CorpusAdmin`+`CorpusFiles` | `pytest` 83 passed（新增 K6a/K6/K7 共 4 例）；`npm run build` + `node --test` 18 passed；实机 httpx：创建→上传 `added=1`→列表 `indexed`→重命名→删文件→删库均成功 |
| K8（提交 `0615ef9`） | Word `.docx` 解析（`python-docx`，段落+表格入正文）；`SOURCE_SUFFIXES` 与上传白名单加入 `.docx` | `pytest` 84 passed（新增 `tests/test_docx.py`）；`npm run build` 通过 |

当前可用基线（本次实测）：后端 `pytest tests -q` → **84 passed**；前端 `node --test` → **18 passed**；`npm run build` 通过。

## 4. 待定设计

| # | 问题 | 影响 |
|---|---|---|
| 10 | 报告↔会话绑定：`POST /api/reports` 无 `session_key`/`run_id`，`GET /api/reports/{id}` 只按 id 取 | E1/E2/G9（E 开工前须定稿） |
| 11 | task 推导许可与全局 `answer_policy`：已定稿（task1/task2 收窄、task3 放开并标注），随任务提示词落实 | G1/G4（已落实，保留备查） |
| 12 | 模型可用性判定来源：`/api/health` 的 `model_verified` 恒 `false`，无生产逻辑 | U9.4-2/F11（未定稿前不开工） |

## 5. 未决问题与下一步

| 未决 | 影响 | 下一步 |
|---|---|---|
| 开关默认 off，U1/U2/H8 界面默认不可见 | "完成 ≠ 可用" | 逐枚：后端契约已实现 ∧ 浏览器实测通过后转 on |
| D10 页码三方一致性未校验；U2 浏览器验收未做 | 引用跳页可信度 | 补 D10 回归 + U2 浏览器验收 |
| D6 `pdfjs-dist` 未装（Windows×WSL 符号链接冲突） | PDF 缩放受限 | 换装后仅替换 `PdfViewer` 内部实现 |
| B2/B4/B5 基金元数据与领域/年份过滤未做 | 报告与过滤缺依据 | 先 H9（文件名元数据入服务端）→ B2/B4/B5 |
| E 报告入口未做；#10 未决 | task4/U3/G9 无法开工 | 定稿 #10 → 实现 E1/E2 |
| #12 模型可用性判定缺失 | F11/U9.4-2 不可验收 | 定 health 探测口径或新增轻量探测接口 |
| 基金库 `.knowledge/自然科学基金/` 已注册但未导入 | 尚不能按库问答/验收 | 执行按库导入（约 213MB，注意 OCR 语言）后再做 H10 |
| H10 真实基金报告端到端验收未做 | 基金场景未验证 | 以真实报告走「选库 → 浏览 → 预览 → 按库问答」 |
| 按 kind 预览、两阶段导入进度未做 | 文件能力不完整、导入过程不可观测 | K9/K5 |

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

> 进度：K0、K0b、K1、K2、K3、K4、K6a、K6、K7、K8 **已完成**（提交：K0/K0b/K1=`9075895`、K2/K3/K4=`4483408`、K6a/K6/K7=`b443623`、K8=`0615ef9`；测试见 §3）；K5、K9–K11 未开始。

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
| K12 | **按库 OCR 语言对齐与重导入（侧栏优先）**：入口放在**左侧边栏知识库展开项**（`CorpusPicker`/`CorpusAdmin`）：每个库可选 OCR 模式/语言 + 「重新导入并应用」；库详情（`LibraryView`）复用同一操作（可选）。OCR 模式/语言按库存储（`<KB>/datadb` 的 `meta`），生效值 = 库配置 ?? 全局；`files` 清单记录 `used language/mode`，不一致标 `ocr_stale`；「重新导入」必须走 `POST /api/corpora/{id}/ingest?force=true`（绕过 size+mtime 跳过、全部重解析），并提示“重解析全部文件、版本会变化”；对中文库建议 `chi_sim+eng`（可选） | 侧栏展开库 → 选 `chi_sim+eng` → 重新导入 → 预览文本可读、`ocr_stale=false`；未改语言时未变文件仍跳过（不会白重解析） |

### 6.4 顺序与依赖

- **K0 必须先于 K6（库删除/重命名）**；**K6a（corpus_id 稳定性）先于 K6 的目录搬迁**。
- **K0b（非默认库 read/file 补 `corpus`）先于 K7/K9 的多库预览**；它是既有 U2/U7 缺口的修复。
- **K2（OCR 三档）与 K4（语言）先于 K11**。
- **K8（Word）先于 K7 的 docx 支持**；K7 本阶段不含 docx。
- K1 的删除同步必须同时清 BM25 与 dense（stale）；**K1/K10 对存量库有一次性回填成本**，不计入优化后稳态。
- K6/K7 的写操作需重扫并重载活动库。
- **K12（按库 OCR 语言 + 强制重导入）依赖 K1 清单与 K4 配置；修复“改语言后重新导入不生效”**。
- 建议顺序：**K0 → K0b → K1 → K2 → K3 → K4 → K12 → K5 → K6a → K6 → K7 → K8 → K9 → K10 → K11**（K6b 随 K6/K6a 定）。
- 与既有任务的关系：K 是 H9/B2/B4/B5（元数据/过滤）与 H10（真实报告验收）的前置；完成后更新 H10 验收与 PROJECT 现状。

## 7. 维护约定

- 完成任务后更新本文 §2/§3 与 [`PROJECT.md`](PROJECT.md) 的现状/限制；长期取舍写入 [`DECISIONS.md`](DECISIONS.md)。
- 证据须可复现（命令/产出路径）；未运行的检查不得写入；受限项显式标注。
