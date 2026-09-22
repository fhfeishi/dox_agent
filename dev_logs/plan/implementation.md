# dox_agent 实现情况记录（implementation）

- 用途：**按时间顺序记录已完成/部分完成的任务与验证证据**，是 [`plan.md`](plan.md) 状态列的支撑材料。
- 分工：需求在 [`../demand.md`](../demand.md)；任务拆解与状态标记在 [`plan.md`](plan.md)；现状摘要（接口/能力现状）在 [`../status.md`](../status.md)；接口与实现契约在 [`../design/`](../design/README.md)。**本文只记录"做完了什么、拿什么验证的"**，不重复设计方案。
- 状态标记：✅ 已完成 · 🟡 部分完成 · ⬜ 未开始
- 更新日期：2026-09-21
- 批次标记：`已提交` = 有 git 提交号可回溯；`工作树` = 改动尚未提交（风险项，见 §3）

> 记录约定：
> 1. 完成任务后在本表**追加一行**（追加，不重排历史），并把 [`plan.md`](plan.md) 对应任务状态改为 ✅ 或 🟡。
> 2. **未实际运行的检查不得写入证据列**；证据须附可复现的命令或产出路径。
> 3. **代码类完成项必须标注提交号**；尚无提交号的记为`工作树`，提交后回填。
> 4. 证据中如包含"未做/受限"部分，必须显式写明，不得只写通过项。

---

## 1. 完成情况总表

### 1.1 A 工程基线

| 日期 | 完成项 | 批次 | 证据 |
|---|---|---|---|
| 2026-09-21 | A4 命名 `static1` → `dox-agent` | 已提交（历史） | grep 无残留；`py_compile` 通过；`npm run build` 通过 |
| 2026-09-21 | A5 `dev_logs` 整理：历史移入 `archive/`，新增 `status.md` 与 `plan/` | 已提交（历史） | `dev_logs` 目录结构核对 |
| 2026-09-21 | A6 新增 `dev_logs/design/`（HLD / API / LLD），由源码整理 | 已提交（历史） | 文件落盘并经相对链接自检 |
| 2026-09-21 | A1 补齐 `pyproject.toml`（extras：`web`/`embedding`/`dev`；`package-data` 收录 `src/prompts/*.md`；`liteparse` 放宽为 `>=2.4,<3` 以匹配已装 2.14.6） | 已提交（历史） | `uv pip install -e ".[dev]"` 与 `-e ".[web,embedding]"` 均成功；`launch.sh` 安装+启动路径实际跑通（见 A3） |
| 2026-09-21 | A2 恢复 `tests/`（20 个文件，`STATIC1_VENV`→`DOX_AGENT_VENV`） | 已提交（历史） | `.venv/bin/python -m pytest tests -q` → 83 passed |
| 2026-09-21 | A3 端到端：`bash launch.sh` 启动服务、知识库就绪、真实模型问答 | 已提交（历史） | `GET /api/health` → `preparation=ready`、`docs_count=157`；`POST /api/chat`（research 路线）→ 8 条带引用来源、正文含 `[1][4][5][6][7]`、`done` |
| 2026-09-21 | A7 契约同步（第二批）：`/api/tasks`、`/api/documents` 增量字段、`/api/documents/{doc_id}/file`、chat `task_id`、`SessionData.branches`、`DocumentPanel` 写入 `design/API.md` 与 `design/LLD.md`，并同步 `status.md` | 工作树 | 见 §1.5；**E 阶段契约待实现后补** |

### 1.2 B / C 语料与问答收敛

| 日期 | 完成项 | 批次 | 证据 |
|---|---|---|---|
| 2026-09-21 | **C1/C2/C3**：移除自动意图分类与 `query_routing`/`evidence_level`/`execution_mode`，固定专业问答；保留 `allowed_doc_ids` | 已提交 `0ff1480` | 后端 `routing.py`/`config.py`/`graph.py`/`quick.py`/`main.py` 与前端 `api.ts`/`main.tsx`/`Answer.tsx`/`conversation.ts` 改动；`GET /api/health` 无 `defaults`；旧字段请求 422；`pytest` 64 passed；`npm run build` 通过；真实模型问答 research + 8 条引用 |
| 2026-09-21 | C 旁带修复：快速查证的模型调用计量 | 已提交 `0ff1480` | `quick.verify` 显式接收本轮回调；`test_usage` 断言 research+answer 两次调用合计 26 tokens |
| 2026-09-21 | **B6** 清理语料专属硬编码：`graph.py` understand/answer 提示词、`main.py` 启动预热与官方文档自动导入、`prepare_docs.py` 预热查询 | 工作树 | 改为 `AUTO_IMPORT_OFFICIAL`（`config.py:31`）与 `WARMUP_QUERY`（`config.py:32`）配置驱动；`grep -n "LangChain\|LangGraph\|Deep Agents" src/agent/graph.py src/main.py src/prepare_docs.py` 仅剩 `graph.py:1` 模块 docstring（描述技术栈，非提示词）；`py_compile` 通过 |

### 1.3 D / G 后端增量

| 日期 | 完成项 | 批次 | 证据 |
|---|---|---|---|
| 2026-09-21 | **D1** `GET /api/documents` 增量字段 `rel_path`/`status`/`meta`（纯附加，`kind` 原有） | 工作树 | `main.py:146-160`；`status` 恒为 `indexed`（该列表即语料本身）；`meta` 在 B2 落地前为占位 `{}` |
| 2026-09-21 | **D2** 新增 `GET /api/documents/{doc_id}/file` 原始文件响应 | 工作树 | `main.py:166-184`；用 `FileResponse`（Range 原生承载）；`Content-Type` 按 kind；支持可选 `version` 校验；415/413/422/404 语义 |
| 2026-09-21 | **D3** 路径安全：仅根目录内、按文档 ID 映射、防路径穿越 | 工作树 | `main.py:32` `local_path_in_roots`：仅 `knowledge_root`/`text_root` 内、`resolve()` 后取相对路径 |
| 2026-09-21 | **G1** 建立 `src/prompts/`：`base.md` + task1–4 提示词 + 加载器 | 工作树 | `src/prompts/`：`base.md`(1061B)、`task1_qa.md`、`task2_compare.md`、`task3_trend.md`、`task4_report.md`、`__init__.py`(2445B)；加载器实测见 §2 |
| 2026-09-21 | **G2** 任务注册表与 `GET /api/tasks` | 工作树 | `main.py:142-144` 返回 `list_tasks()`；字段 `id`/`name`/`description`/`has_template` |
| 2026-09-21 | **G3** `POST /api/chat` 接入 `task_id`（task1–3）；task4 不在 chat 生成 | 工作树 | `main.py:59-65` `ChatRequest.task_id: Literal["task1","task2","task3"] = "task1"`（`extra="forbid"`，task4/未知值 422）；注释明确 task4 正文由 `/api/reports` 生成 |
| 2026-09-21 | **G4** `understand`/`answer` 注入任务 prompt 与输出契约 | 工作树 | graph state 增 `task_id`；两节点 system 提示词注入 `task_instruction()`；`routing.py` `answer_policy` 按待定设计 #11 调整（task1/task2 收窄、task3 放开并须标注事实/推断） |

### 1.4 U 前端（含 U9）

| 日期 | 完成项 | 批次 | 证据 |
|---|---|---|---|
| 2026-09-21 | **U0.1–U0.8 / U4.1a / U4.2**：UI 信息架构与基础 | 已提交 `72fde7a` | 拆分 `ScopeSelector`/`IngestTools`、新增 `SettingsDrawer`/`SessionList`/`useDocuments`；删除 `SourceManager.tsx`/`KnowledgePanel.tsx`；`policy.ts` 补 professional/repair/completed；`npm run build` 通过；`npm test` 12 passed |
| 2026-09-21 | U0 回归与验收（离线浏览器） | 已提交 `72fde7a` | `tests/browser_ui_shell.py` PASS：左栏无入库/无旧健康框、健康圆点、会话分组/搜索/未保存会话、抽屉 dialog+Esc+焦点回退+关闭后停止轮询；`tests/browser_answer_controls.py` PASS：复制/重生成/停止/失败/导出/移动端无回归（顺带修正两处过期断言：`run_id` 逐次变化、取消文案） |
| 2026-09-21 | **U5** 会话内分支：编辑并重问合并进原会话（前端测试 12 → **15 passed**） | 已提交 `9a0c899` | 新增 `branches.ts`（深拷贝/切片/字节裁剪/索引查询）与 `branches.test.mts`；`workspace.ts` 增加 `branches` 状态与持久化管线、`branchInPlace`/`restoreBranch`，切会话重置分支；`main.tsx` 分支入口/只读查看/设为主时间线；`SessionList` 归并旧 `source_session_id` 会话。`npm run build` 通过；`npm test` → 15 passed；`tests/browser_session_branches.py` PASS（不新增会话、保存后刷新分支仍在、恢复不残留、旧分支归并） |
| 2026-09-21 | **U7** 知识库源文件预览 | 已提交 `ce3b4e7` | 新增 `DocumentPanel`（共享右滑外壳）、`documentPreview.ts`（带 version 的跨页续读，至最后一页/页码不存在终止，最大页保护）、`DocumentPreview.tsx`（Markdown/纯文本切换 + 元数据）；`IngestTools` 文档列表可点击；`DocumentInfo.pages/kind/parser` 改为必填。`npm run build` 通过；`tests/browser_document_preview.py` PASS（多页续读、元数据含采集时间、原文切换、范围不变） |
| 2026-09-21 | **U6/U8** 设置抽屉电源按钮 + 左下角 LLM 状态 | 已提交 `ce3b4e7` | `SettingsDrawer` 增 `headerAction`；`main.tsx` 电源按钮（内联 SVG，断开后禁用）；侧栏改 flex 列，底部固定 `LLM: <model>` + 红/绿/黄状态灯 + tooltip/`role=status`；新增 `model`/`preparation` state。`npm run build` 通过；`tests/browser_status_power.py` PASS（电源断开、禁用、重连、长列表不顶走状态区） |
| 2026-09-21 | **U1.0–U1.4 + U9.1/U9.2/U9.2b/U9.3/U9.4-1** 任务选择器、侧栏收束、文献库入口 | 工作树 | 新建 `vite-env.d.ts`/`uiFlags.ts`/`TaskPicker.tsx`/`LibraryView.tsx`；`main.tsx` 侧栏收束（`SIDEBAR_KEY` 持久化，`grid-cols` 切换，`aria-expanded`）、`MainView` 视图切换（仅卸载 `<section>`、保留 App 层流式并恢复滚动）、任务选择与会话徽标、task4 报告占位；`workspace.ts`/`SessionList.tsx` 增 `task_id`；设置抽屉只读模型区块。验证：见 §2 |
| 2026-09-21 | **U2.1–U2.5 + U4.1b + D11** 文档面板、引用跳转、挤压式侧栏 | 工作树 | 新建 `DocumentTree.tsx`/`PdfViewer.tsx`/`DocumentExplorer.tsx`/`citation.ts`；`Answer.tsx` 正文 `[n]` 在渲染层变可点击（`citation` 映射，**不改写 Markdown 源文本**）；`DocumentPanel.tsx` 落实 D11（`lg:pointer-events-none` + `lg:w-[36rem]`，遮罩 `lg:hidden`）；主区宽度随收束自适应。**D6 降级**：见 §3。验证：见 §2 |

### 1.6 H 知识库管理

| 日期 | 完成项 | 批次 | 证据 |
|---|---|---|---|
| 2026-09-21 | **H1** 库注册表：`src/agent/corpora.py`（磁盘扫描 + `CORPORA` 配置覆盖；只读 `mode=ro` 计数、未初始化库不建 sqlite；`corpora_root` 默认 `DATA_DIR` 父目录） | 工作树 | 真实树实测：`lcdata`（默认库、排第一）与 `nf-人工智能与医疗`（kind=fund、uninitialized）均识别；`_docs_count` 对真实库临时副本计数 157；override 合并 `nf-ai-med` 生效；命令见 §2 |
| 2026-09-21 | **H2** `import_defaults` 增 `root`/`exclude` 参数；`POST /api/corpora/{id}/ingest`（202 + job，导入限定在库 root 内；`ingest/local` 排除其他库 root） | 工作树 | `parsers.py`/`main.py` 改动；路由 AST 枚举确认；**导入实测未做**（需 WSL 内运行服务；nf 共约 218MB，LiteParse 耗时，见 §3） |
| 2026-09-21 | **H3** `GET /api/documents?corpus=`（缺省=默认库，未初始化库只读返回 `[]`）；`/api/health` 增 `corpus_id`；`local_path_in_roots` 纳入实际库根（兄弟库 PDF 可由 `/file` 提供） | 工作树 | `main.py` 改动；AST 枚举确认三路由均在 |
| 2026-09-22 | **H5** 侧栏知识库选择器（展开态 `CorpusPicker` 列表块 + 收束态 Layers 图标浮层；状态点：就绪/空库/未初始化/导入中/失败；切库清空越界 `allowed_doc_ids` 并提示，对齐 §4.4） | 工作树 | 新增 `useCorpora.ts`/`CorpusPicker.tsx`；`main.tsx` 接线；`tsc --noEmit` 无新错误；`node --test` 18 passed |
| 2026-09-22 | **H6** 知识库详情页（复用 `LibraryView`：库头部类型/领域/份数/总页数/导入 job 实时进度；「导入/更新本库」调 `POST /api/corpora/{id}/ingest` 并轮询；基金库卡片/列表显示文件名解析的负责人/项目编号/年份区间） | 工作树 | `LibraryView.tsx` 扩展 + `fundMeta.ts`（与后端 `FUND_NAME_PATTERN` 同一约定，展示层专用，H9 后换服务端 meta）+ `fundMeta.test.mts` 3 用例通过 |
| 2026-09-22 | **H7** 文档可视化接库范围（`useDocuments` 增 `corpus` 参数走 `GET /api/documents?corpus=`；`DocumentExplorer` 头部显示当前库名） | 工作树 | `useDocuments.ts`/`DocumentExplorer.tsx`/`main.tsx` 改动；`tsc --noEmit` 无新错误 |

### 1.5 文档同步

| 日期 | 完成项 | 批次 | 证据 |
|---|---|---|---|
| 2026-09-21 | `demand.md` 同步 §9.5–§9.7 与 §8.2 | 工作树 | 见 `git diff dev_logs/demand.md`（+44 行） |
| 2026-09-21 | `plan.md` 补 U9 任务行、F9–F13、B6/D10b/D11、待定设计 #12、三轮审核采纳 #15–#41 | 工作树 | 见 `git diff dev_logs/plan/plan.md`（+169/-…） |
| 2026-09-21 | `ui_optimization.md` 同步状态、#16/#21/#22/#23/#28 修订 | 工作树 | 见 `git diff dev_logs/plan/ui_optimization.md`（+150/-…） |
| 2026-09-21 | `status.md` §5/§6 同步 | 工作树 | 见 `git diff dev_logs/status.md`（+34/-…） |
| 2026-09-21 | 本文 `implementation.md` 建立，完成情况记录自 `plan.md` 迁出 | 工作树 | 本文件；`plan.md` 对应段改为指向本文 |
| 2026-09-21 | 新增知识库管理规划：`demand.md` §10、`plan/corpus_management.md`（H1–H10）、`plan.md` 增 H 阶段与插入位置说明 | 工作树 | **规划类，无实现**；无验证证据，不产生完成项 |

---

## 2. 本批（工作树）实际验证命令与结果

以下为本批改动在 2026-09-21 22:20 前后的**实测**结果，可复现：

| 检查 | 命令 | 结果 |
|---|---|---|
| 前端单测 | `frontend/node_modules/.bin/tsc` 环境下 `node --test "src/*.test.mts"` | ✅ **15 passed / 0 fail**（3 个测试文件：`api.test.mts`/`branches.test.mts`/`conversation.test.mts`） |
| 后端编译 | `python -m py_compile src/*.py src/agent/*.py src/prompts/*.py` | ✅ 通过（exit 0） |
| prompts 加载器 | `from prompts import list_tasks, task_prompt` | ✅ `list_tasks()` → `task1/task2/task3`（`has_template=False`）、`task4`（`has_template=True`）；`task_prompt()` 返回 177/179/233/421 字符；未知 id 抛 `UnknownTaskError: 未知任务：task9`（**不静默回退**，符合设计） |
| B6 硬编码清除 | `grep -n "LangChain\|LangGraph\|Deep Agents" src/agent/graph.py src/main.py src/prepare_docs.py src/__init__.py` | ✅ 仅 `graph.py:1` 模块 docstring |
| 契约字段 | 读 `src/main.py` | ✅ `GET /api/tasks`(142)、`ChatRequest.task_id`(64)、`/file`(166) 均在位 |
| H1–H3 后端编译 | `python -m py_compile src/agent/corpora.py src/agent/config.py src/parsers.py src/main.py` | ✅ 通过 |
| H1 注册表实测 | 独立加载 `corpora.py` 扫描真实 `knowledge/` 树 | ✅ lcdata（默认、排第一）+ nf-人工智能与医疗（fund/uninitialized）；override 合并 nf-ai-med 生效；`default_corpus_id`=lcdata |
| H1 计数逻辑 | `_docs_count` 对真实库临时副本 | ✅ 157（真实库在 9P 上被运行中服务锁定，Windows 侧直读失败属环境限制；Linux 生产路径 `mode=ro` 正常） |
| H2/H3 路由 | AST 枚举 `main.py` 装饰器 | ✅ `/api/corpora`、`/api/corpora/{corpus_id}/ingest`、`/api/documents` 均在 |
| H5–H7 前端编译 | `tsc --noEmit` | ✅ 无新错误（仅既有 Windows 大小写伪错误） |
| H5–H7 前端单测 | `node --test src/*.test.mts` | ✅ **18 passed / 0 fail**（15 → 18，新增 `fundMeta.test.mts` 3 用例：标准名/字母数字项目编号/非基金名 null） |

### 未运行 / 受限的检查（不得视为通过）

| 检查 | 原因 |
|---|---|
| `pytest tests -q` | `.venv` 为 Linux ELF，Windows 主机不可执行；需在 WSL 内运行 |
| `vite build` | rollup 原生二进制为 Linux 版，Windows 主机不可执行 |
| `tsc --noEmit` 全量 | Windows 主机存在既有大小写伪错误（`DocumentPreview.tsx` vs `documentPreview.ts`），Linux 构建不受影响 |
| U2 浏览器实测 | 未做（D10 页码一致性校验亦未做，`PdfViewer` 已标注 best effort） |
| `POST /api/corpora/{id}/ingest` 实测 | 需 WSL 内运行服务；nf 10 份约 218MB，LiteParse 全量解析耗时 |

---

## 3. 已知风险与遗留（对应 plan 待办）

| 项 | 说明 | 关联 |
|---|---|---|
| **31 项改动未提交** | 工作树累积 20 改 + 9 新 + `src/prompts/`，横跨前后端 5 个阶段；任何误操作会一次性丢失 | 见 [`plan-status-check.md`](plan-status-check.md) P1-A |
| **已完成功能被开关默认关闭** | `uiFlags.ts` 六枚开关默认全 off，`.env` 无任何 `VITE_UI_*`；U1/U2 在默认配置下界面**不可见**（`main.tsx:283/307`），而后端依赖已同批实现，关闭理由已失效 | 同上 P1-B |
| **D6 降级** | `pdfjs-dist` 因 Windows npm × WSL 符号链接冲突（EISDIR）无法安装，改用浏览器原生 PDF（`/file` + `#page=`）；缩放依赖阅读器工具栏。换装 PDF.js 时只需替换 `PdfViewer` 内部实现 | D6 / F3 |
| **D10 未做** | 页码三方一致性（`Page.number` = LiteParse `page_num` = PDF.js `getPage(n)`）未校验 | D10 / D10b |
| **U9.4-2 未开工** | 依赖后端 `GET /api/models` 与待定设计 #12（模型可用性判定来源） | U9.4-2 / F11 |
| **nf 导入未实测** | H2 代码完成但未真正导入约 218MB 基金 PDF；首次导入耗时长且 `PDF_OCR_LANGUAGE=eng` 对中文扫描件识别差（corpus_management §7 已列） | H2 / H10 |

---

## 4. 维护约定（本文相关）

1. 完成任务后，在本文件 §1 对应分组**追加一行**，并同步 [`plan.md`](plan.md) 的任务状态列（✅/🟡）。
2. 证据列须为可复现的命令或产出路径；**未运行的检查不得写入**，受限项统一记入 §2「未运行/受限」表。
3. 代码类条目必须标提交号；尚无提交号者记为`工作树`，提交后回填并更新 §3 风险表。
4. 每次开发后同步 [`../status.md`](../status.md)（现状摘要）；接口/数据模型变更另按 [`../design/README.md`](../design/README.md) 的规则同步对应设计文档。
5. 本文与 `plan.md` 的分工：**`plan.md` 保留任务拆解、状态列与设计指南；本文保留完成情况与证据**。二者不得各自维护一份完成记录。
