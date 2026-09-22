# UI 迁移记录（对齐 DoxAgentWeb 参考模板）

- 创建：2026-09-22；最近更新：2026-09-22（浏览器验收）。
- 参考模板：`.logsdev/archive/DoxAgentWeb/`（React 19 + TS + Tailwind v4）。
- 目标：把 `frontend/` 的界面、交互与组件结构对齐到参考模板，同时不改动后端契约与真实业务逻辑。

## 1. 背景与约束

- 迁移前：单页 `frontend/src/main.tsx`（约 470 行）+ 25 个扁平组件，视觉为 teal/stone，`Answer`/`SessionList`/`TaskPicker` 与页面逻辑交织。
- 参考模板的信息架构：`IconRail(56) → SidePanel(276) → Main → Inspector(浮层)`；暖中性色 + 紫色主色 `--primary:#5645d4`；设计令牌集中在 `:root`。
- 必须保留的真实逻辑（未重写，仅搬迁）：SSE 流式问答、会话与分支持久化、多知识库/按库文档、引用跳页与版本校验（S8）、文档预览、导入运维；`ChatRequest` 为 `extra="forbid"`，`uiFlags` 默认关闭，未就绪字段不得发送。

## 2. 最终架构

```
src/
  main.tsx              挂载 <AppProvider><App/></AppProvider>
  App.tsx               仅布局装配（rail / panel / main / inspector / overlays）
  store.tsx             AppProvider + useApp：全部 state、effects、handlers
  App.tsx + components/ 24 个纯展示组件
  api.ts conversation.ts workspace.ts branches.ts citation.ts clipboard.ts
  documentText.ts documentMeta.ts fundMeta.ts policy.ts uiFlags.ts
  useCorpora.ts useDocuments.ts styles/globals.css
```

| 决策 | 选择 | 理由 |
|---|---|---|
| 状态归属 | `store.tsx` 的 `AppProvider` 拥有全部业务状态；组件只经 `useApp()` 读取 | 组件零业务逻辑、无 prop-drilling；和模板一致 |
| 循环依赖 | `store.tsx` 不 import 任何组件；`App.tsx` 组合二者 | 无环、无 TDZ |
| 视觉 | 复制模板 `:root` 令牌到 `src/styles/globals.css` | 换肤集中一处 |
| PDF | 保留浏览器原生 `/file` + `#page=` | `pdfjs-dist` 在 WSL 有符号链接问题（D6 降级） |
| 功能开关 | 维持 `uiFlags` 语义，默认 off | 后端契约未就绪字段不得发送 |

### 与模板的刻意差异

- **不使用 mock 数据**：`KnowledgeBase`/`TaskTemplate`/`Citation` 改用真实 `CorpusInfo`/`TaskInfo`/`Source`。
- **单库而非多库**：每会话绑定 `corpus_id`，输入区展示当前库。
- **无联网开关**：模板 `webEnabled` 对应能力属范围外。
- **报告页占位**：E 阶段未实现。
- **侧栏可收起（U9.1）**：状态持久化到 `localStorage`；收起后一级入口由 `IconRail` 承担。
- **无 thumbs 反馈**：后端无反馈接口，不放置非功能性控件。
- **无障碍名称沿用既有浏览器验收契约**（见 §4）：如「复制答案」「编辑并重问」「资料范围：全部」等，与模板文案（「复制 Markdown」「编辑并重发」）不同，避免破坏已完成模块的验收。

## 3. 关键逻辑修正（本轮审查发现）

1. **重新生成丢失库/任务范围**：`regenerateTurn` 只保留 `allowed_doc_ids`，原先直接以 `turn.options` 发起请求，导致重新生成时 `corpus_id`/`task_id` 丢失、答非所选库。现在请求统一使用合并后的 `requestOptions`（`store.tsx`）。
2. **task4 仍可发送**：输入区在 task4 下显示占位提示，但发送按钮此前仍可点击。现 `canSend` 排除 task4（`Composer.tsx`）。
3. **任务开关关闭时的空态**：`VITE_UI_TASKS` 默认 off，`TasksView`/`SidePanel` 任务区此前显示「正在读取任务…」不消失；现显示明确的「任务功能未启用」提示。
4. **侧栏导入目标**：`导入/更新当前库` 原先用显式 `corpusId`（可能为空），改用 `effectiveCorpusId`（默认库可用）。
5. **文档预览面板过小**：`DocumentPanel` 原先被 `max-w-3xl`（768px）+ `lg:max-w-[min(54rem,90vw)]` 双重限宽，桌面仅约 50vw，且内容区不是 flex 列，`PdfViewer` 的 `flex-1` 无法生效、iframe 高度塌缩。现改为流式宽度 `md:w-[min(760px,92vw)]` → `lg:w-[clamp(36rem,66vw,76rem)]`，并把内容区改为 `flex flex-col` 以让 PDF/正文填满高度（`DocumentPanel.tsx`）。

## 4. 已执行验证（本轮实测）

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型 + 生产构建 | `cd frontend && npm run build` | ✅ `tsc --noEmit` + `vite build` 通过（319 modules） |
| 前端单元测试 | `cd frontend && npm test` | ✅ 18 passed |
| 浏览器验收（离线，Playwright + dist） | `browser_ui_shell.py` | ✅ rail/侧栏/抽屉 a11y+unmount/会话分组搜索 |
| 同上 | `browser_status_power.py` | ✅ 电源断开/禁用、重连、LLM 状态吸底 |
| 同上 | `browser_answer_controls.py` | ✅ 复制/复制失败、重新生成上下文与历史、实时耗时、取消、失败、导出、移动端不溢出 |
| 同上 | `browser_document_preview.py` | ✅ 预览多页续读、元信息、原文切换、范围不变 |
| 同上 | `browser_session_branches.py` | ✅ 编辑并重问、分支持久化/恢复、历史分支嵌套、不新增会话 |
| 运行时渲染 | Vite SSR `renderToString(<AppProvider><App/></AppProvider>)` 与 `MessageView` | ✅ 全树与回答渲染通过 |
| 产物 | `grep 5645d4 dist/assets/*.css` | ✅ 新令牌进入产物 |
| 文档预览自适应（临时 Playwright 测量 PDF 面板） | 1920→1216px(63%) / 1440→950(66%) / 1280→845(66%) / 1024→676(66%) / 900→760(84%) / 820→754(92%) / 390→100%；iframe 高 695–729px；各断点 `scrollWidth ≤ innerWidth` | ✅ 面板随视口缩放、PDF 填满、无横向溢出 |

**测试调整（保持行为断言不变）**：`tests/browser_ui_shell.py` 的会话标题断言改为限定在侧栏（`aside`）。原因：新外壳在对话顶栏也显示当前会话标题（模板设计），未限定作用域的 `get_by_text` 会同时命中顶栏与侧栏。分组/搜索/归档/新会话的断言内容未变。

**未运行**：`browser_fund_preview.py`、`browser_smoke.py` 需要运行中的后端（`TEST_BASE_URL`，默认 :8000/8011），本机当前无服务，未执行。

## 5. 组件映射

| 参考模板 | 本项目 | 说明 |
|---|---|---|
| `IconRail` | `components/IconRail.tsx` | 对话/任务/文献库/报告 + 新建 + 产出面板 + 检索设置 + LLM 状态点 |
| `SidePanel` | `components/SidePanel.tsx` | 会话分组/重命名/归档/历史分支、知识库选择、任务、导入、LLM 状态与设置入口 |
| `ChatView` | `components/ChatView.tsx` | 顶栏（会话标题/任务/库）+ 消息流 + 分支 + Composer |
| `MessageList` | `components/MessageView.tsx` | 真实 Markdown + `STEP n` 过程 + 引用角标/来源 + 耗时/token + 复制/重生成/改后重发 |
| `Composer` | `components/Composer.tsx` | 知识库切换、资料范围、任务面板、编辑态、发送/停止 |
| `Inspector` | `components/Inspector.tsx` | 产出/引用/原文预览 |
| `KnowledgeView` | `components/LibraryView.tsx` | 卡片/列表、基金元数据、源文件管理 |
| `ListingViews` | `components/ListingViews.tsx` | 真实任务模板页；报告页占位 |
| `Overlays` | `components/OpsDrawer.tsx` + `SettingsDrawer.tsx` + `Overlays.tsx` | 运维抽屉 + Toast + 状态横幅 |
| `Icons` / `ui` | `components/Icons.tsx` / `ui.tsx` | 图标集与基础件 |

迁移后删除：`Answer`/`SessionList`/`TaskPicker`/`Notes`/`appContext`；`documentPreview.ts`→`documentText.ts`（避免与 `DocumentPreview.tsx` 大小写混淆）。

## 6. 未完成与下一步

- **在线集成浏览器验收**：`browser_fund_preview.py`（选库→内联 PDF→引用跳页，chat 带 `corpus_id`）与 `browser_smoke.py` 需启动后端后执行。
- **U2 文档面板**（`VITE_UI_DOC_PANEL`）仍默认 off，未做开关为 on 的浏览器验收。
- **报告页**：依赖 E 阶段 `POST /api/reports`，当前占位。
- `store.tsx` 的 `useMemo` 依赖列表较长，后续可拆会话/检索/预览子 hook。

## 7. 审查意见处理（2026-09-22）

来源：外部审查（P1–P3 + 任务模板建议）。原则：只落地可验证且不与既有验收冲突的项；冲突项说明原因后保留。

### 已落地

- **P1-1 任务系统默认开启**：`uiFlags.tasks` 改为默认 on（`VITE_UI_TASKS=0` 可关）。后端 `GET /api/tasks`、`ChatRequest.task_id`、`graph.task_instruction` 已存在。
- **P1-2 任务卡片信息**：`/api/tasks` 增加 `output_hint`（`src/prompts/__init__.py`）；`TasksView` 卡片与 Composer 任务 popover 展示输出契约。
- **P1-3 侧栏任务搜索**：`SidePanel` 按查询过滤任务，补「没有匹配的任务」。
- **P1-5 任意回答重新生成**：新增 `store.regenerateAt(index)` + `ChatView` 每条回答提供入口；修复 override 路径应**替换**而非追加目标轮（回归：`browser_answer_controls`）。
- **P2-6 每步耗时**：后端 `graph.step()` 记录 running→completed 的 `duration_ms`；前端 `Step.duration_ms` 在思考过程中显示（`tests/test_steps.py` + `browser_tasks.py` 验证）。
- **P2-7 非 PDF 预览下载/新窗口**：文本预览增加「下载 .md/.txt」「新窗口打开」（`exportText.ts`）。
- **P2-8 Composer 弹层统一**：任务/知识库/资料范围弹层共用外部点击 + Esc 关闭；移除重复的「资料范围」chip。
- **P2-9 Inspector 标签**：`产出` → `概览`（E 阶段前不承诺产物）。
- **P2-10 死图标清理**：删除 `thumbsUp/thumbsDown/globe/share/trend/custom/eye/news/folder/check/chevronDown/clock/dots/download` 等无引用图标。
- **P3 uiFlags 清理**：删除未被引用的 `filters/reports/news/models`。
- **后端集成缺口**：`Knowledge.search` 新增 `task_id` 并传入 `retrieve`；`graph.search_impl` 传 `state["task_id"]`（`tests/test_knowledge.py` 接受参数；任务预算由 `tests/test_retrieval.py` 覆盖）。
- **任务提示词**：`base.md` 增加引用纪律与「先直接回答」；task1/2/3 补输出细节（多子问题显式未覆盖 / ≥2 可区分对象 / 方向性置信度）。**注：未做真实语料质量评估**，属文本级改动，由 `tests/test_prompts.py` 保证加载正确。

### 未落地（含原因）

- **P1-4 复制/导出去重为 Markdown**：与既有验收冲突——`browser_answer_controls` 断言「复制答案」剪贴板等于原始 Markdown，且导出文件必须可 `json.loads`（诊断 JSON）。改动会破坏已验证契约，保留现状，待验收口径变更后再做。
- **任务模板 2.4（四类报告模板 + `report_template()` 加载器）**：属 E 阶段 `POST /api/reports`，当前无调用者，按“不做无用实现”推迟。
- **P3 store.tsx 拆分 / 文档预览双轨收敛**：结构优化，风险高于收益，保留在 §6 待办。

### 本轮验证

- `cd frontend && npm run build` ✅；`npm test` ✅ 18 passed。
- `.venv/bin/python -m pytest tests -q` ✅ **115 passed**（新增 `tests/test_prompts.py` 3 例、`test_knowledge` 1 例并强化 `test_steps`）。
- 浏览器验收（Playwright + dist）✅ 6 个用例：`browser_ui_shell` / `browser_status_power` / `browser_answer_controls` / `browser_document_preview` / `browser_session_branches` / **`browser_tasks`（新增）**。

## 8. 知识库信息架构重构（2026-09-22）

目标：对齐参考模板的 3 层 IA（库卡片网格 → 库详情抽屉 → 文档/源文件/导入），并把“浏览”与“切换检索范围”彻底分开。

### 结构变更

- 新增 `components/CorpusGrid.tsx`：文献库主区改为**知识库卡片网格**（数据源 `corpora`，不再吃 `documents`）；头部有新建、搜索、汇总（N 个库 / M 份文档 / K 就绪）；卡片显示 kind/domain/状态/份数，`默认` 与 `当前对话` 分开标注；“更多”= 重命名/删除（默认库禁删）。
- 新增 `components/CorpusDetail.tsx`：库详情抽屉（`文档 / 源文件 / 导入` 三个 tab）；动作：用于当前对话、重命名、删除、按库导入、上传/重命名/删除源文件；默认库额外提供“补充材料（仅默认库）”。
- 新增 `components/Drawer.tsx`：从原 `SettingsDrawer` 抽出遮罩/Esc/焦点陷阱/焦点归还，`OpsDrawer` 与 `CorpusDetail` 共用。
- 删除 `LibraryView.tsx`（被 CorpusGrid 取代）、`CorpusAdmin.tsx`（拆入 CorpusGrid/CorpusDetail）、`SettingsDrawer.tsx`（被 Drawer 取代）。
- `IngestTools.tsx`：删除“已入库文档列表”（文档 tab 拥有）与 `documents` 依赖，保留本地扫描/网页快照/补充正文。
- `DocumentExplorer.tsx`：改为自己按 `corpus` 拉取文档，不再接收全局 `documents`。
- `OpsDrawer.tsx`：精简为模型（只读）/ 在线文档源 / 导出 + 连接电源；不再含知识库 CRUD 与导入。
- `store.tsx`：新增 `openCorpusId/openCorpus/closeCorpus`、`newCorpusOpen/setNewCorpusOpen`、`openPreview(doc,page,corpusId)`；`PreviewTarget/ExplorerTarget` 带 `corpusId`。

### 集成修复（必须一起改）

- `DocumentPreview` 的 `corpus` 改用 `previewDoc.corpusId`；`DocumentExplorer` 同理。此前固定用 `effectiveCorpusId`，从非活动库打开文档会报“不在当前列表”或去错的库拉 `/file`。
- 从库详情打开文档时关闭详情，避免两个右侧抽屉叠加、以及桌面点击穿透误关层级。

### 上层设计冲突/取舍（需确认）

1. **聊天视图侧栏仍可快速切库**：`nav !== "library"` 的侧栏库行仍调用 `selectCorpus`（显式切换当前问答库）；只有 `nav === "library"` 的行改为 `openCorpus`（浏览）。这是“显式切库”而非“浏览”，也保留了 `browser_fund_preview` 的切库路径。若产品要求“只能通过详情里的「用于当前对话」切库”，可去掉聊天视图的侧栏库列表。
2. **“仅默认库”而非“仅活动库”**：`/api/ingest/local`、`/api/ingest/text`、`/api/web/*` 只写 `app.state.knowledge`（默认库），与当前会话活动库无关，因此按 `is_default` 门控并如实标注。
3. **未做**：用途说明/领域标签编辑（`PATCH /api/corpora/{id}` 仅改显示名）、跨库批量导入（无 API）、一次问答用多库（PROJECT §4.1 单库绑定）、E 阶段报告模板。

### 测试调整

- `browser_ui_shell`：抽屉触发按钮 `设置与运维` → `设置`（`exact=True`，避免与 rail「检索设置」子串相撞）；断言抽屉显示“导出对话与证据版本”且**不含**知识库 CRUD。
- `browser_status_power` / `browser_answer_controls`：按钮名同步为 `设置`（`exact=True`）；抽屉 dialog 名仍为“设置与运维”。
- `browser_document_preview`：改为 库网格 → 库详情 → 文档 tab → 预览；新增 `corpora` mock 与带 query 的 `/api/documents` 路由；关闭预览后先返回对话再断言“资料范围：全部”。
- `browser_fund_preview`（在线）：改为 文献库 → 基金库详情 → 文档 tab → PDF 预览；引用跳页逻辑不变。
- 新增 `tests/browser_library.py`：卡片网格/默认标记、详情、切库、跨库浏览不改活动库、按库 `/file`、设置抽屉无 KB CRUD、chat `corpus_id`。

### 本轮验证

- `cd frontend && npm run build` ✅；`npm test` ✅ 18 passed。
- 浏览器验收 ✅ **7 个用例**：上述 6 个 + **`browser_library`（新增）**。
- `browser_fund_preview` / `browser_smoke`（在线）未运行（需运行中的后端）。
