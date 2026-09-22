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

**阶段总览**：A 🟡 · B ⬜ · C 🟡 · D 🟡 · E ⬜ · F ⬜ · G 🟡 · H 🟡 · U 🟡。

**A 工程基线**：A1–A6 ✅（pyproject/extras、tests、端到端、改名、dev_logs 整理、design 落盘）；A7 契约同步 🟡（E 阶段待补）。

**B 语料与元数据**：B6 ✅（清理语料专属硬编码，改 `AUTO_IMPORT_OFFICIAL`/`WARMUP_QUERY`）；B1 基金入库、B2 元数据、B3 补录、B4 领域/年份过滤、B5 chat `filters` ⬜。

**C 问答收敛**：C1/C2/C3/C5 ✅（移除分类与策略字段、固定专业流程、保留 `allowed_doc_ids`）；C4 多轮/引用/失败说明 🟡。

**D 文档窗口**：D1–D5、D7–D9、D11 ✅；D6 🟡（**降级**：`pdfjs-dist` 未装，PDF 用浏览器原生渲染）；D10 页码三方一致性、D10b OCR/重排再校验 ⬜。

**E 专项报告**：E1–E7 ⬜（`POST /api/reports`、四模板、预览/下载、存储）。

**F 验收**：F1–F6、F8–F13 ⬜；F7 🟡（会话与流式基础已具备）。

**G 任务系统**：G1–G4、G7 ✅；G5 🟡（选择器/绑定/task4 阻断已实现，报告表单待 E）；G6 🟡；G8 任务输出验收、G9 报告入口 ⬜。

**H 知识库管理**：H1–H3（注册表/按库导入/`?corpus=`）✅；H5–H7（选择器/详情/按库文档）✅；**H4 ✅代码**（chat `corpus_id`、按库限定检索，提交 `e7d08e2`）、**H8 ✅代码**（会话绑库、`VITE_UI_CORPUS`，提交 `67d0ff0`），两者**浏览器/真实语料验收未做**；H9 文件名元数据入服务端、H10 真实报告验收 ⬜。

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

当前可用基线（本次实测）：后端 `pytest tests -q` → **64 passed**；前端 `node --test` → **18 passed**；`npm run build` 通过。

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
| 旧 `knowledge/`（`nf`/`database`/`vectordb`）未按新布局迁移；`.knowledge/`/`.data/` 未接入配置 | 数据位置与配置不一致 | 按 `.knowledge/`/`.data/` 约定迁移并接入 `DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT` |
| H10 真实基金报告端到端验收未做 | 基金场景未验证 | 以真实报告走「选库 → 浏览 → 预览 → 按库问答」 |

## 6. 维护约定

- 完成任务后更新本文 §2/§3 与 [`PROJECT.md`](PROJECT.md) 的现状/限制；长期取舍写入 [`DECISIONS.md`](DECISIONS.md)。
- 证据须可复现（命令/产出路径）；未运行的检查不得写入；受限项显式标注。
