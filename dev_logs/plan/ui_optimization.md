# dox_agent 前端 UI 优化方案（拟议）

- 状态：**U0（U0.1–U0.8）、U4.1–U4.2、U5–U8 已实施并离线验收；U1.0–U1.4、U2、U9.1/U9.2/U9.2b/U9.3/U9.4-1 已在工作树实施（未提交）；U1.5、U3、U9.4-2 待后端依赖**。进度与证据见 [`implementation.md`](implementation.md)（完成情况记录）、任务状态见 [`plan.md`](plan.md) 的 U 节。
- 2026-09-21 新增 **§9（U9.1–U9.4）**：参考 SciencePRO 侧栏信息架构提出的四项修订（侧栏收束/展开、文献库一等入口、科研头条占位、模型选择器），均为拟议状态。
- 背景：科学基金历史报告样本暂未到位，语料切换（B 阶段）无法推进；先用这段时间整理前端 UI 与信息架构。
- 依据：[`../demand.md`](../demand.md)（§2.2、§5、§9）、[`plan.md`](plan.md)（设计指南 §2–§4、任务 D/G/E）、[`../status.md`](../status.md)。
- 现状结论均来自实际阅读 `frontend/src/*`（2026-09-21，phase C 提交 `0ff1480`）。标记约定：拟议 / 已实现 / 已验证。

## 1. 前提与边界

### 1.1 前提

- 当前可运行语料是 `knowledge/lcdata`（157 份技术文档），**不是科学基金报告**；UI 不得依赖任何语料特定文案。
- 后端已有：`POST /api/chat`（`messages`/`run_id`/`allowed_doc_ids`）、`GET /api/documents`（doc_id/title/origin/version 等摘要）、`GET|PUT /api/workspace/sessions`、`/api/health`。
- 后端未实现：`GET /api/tasks`、chat 的 `task_id`/`filters`、`/api/documents/{id}/file`、`/api/reports`（见 §3）。
- 前端测试已有可用兜底：测试用 `node:test`，U0 基线为 **12 passed**（Node v26.8.1），U5 新增 `branches.test.mts` 后为 **15 passed**（当前基线）；`package.json` 已加 `"test": "node --test src/"`（U0.8）。统一锁定 `node:test`，**不引入 vitest**。

### 1.2 目标

- 左栏信息架构与产品定位一致：聊天为主，入库/采集等运维能力不与对话并列。
- 会话体验对齐 ChatGPT 式：任务选择、历史分组、搜索、任务徽标。
- 右侧本地文档窗口与引用跳页可用。
- 任务系统（task1–4）与报告入口可用。
- 在无基金语料的前提下，以上均可先用 `lcdata` 验收 UI 行为。

### 1.3 非目标

- 不实现 B 阶段（基金入库/元数据/领域年份过滤）的数据侧；仅预留 UI 入口并标注依赖。
- 不实现多 Agent、知识图谱、模板管理平台等 demand §8.2 首期不做项。
- 不在本轮改动后端契约（U1–U3 以对应后端任务完成为前置）。

### 1.4 受保护区域（不得回归）

- **思考/推理步骤列表**：`Answer.tsx:43-45` 的 Process `step` 列表不动；U0.6 只改 §4 明确的两处（展开态、标签映射）。
- **Timing / Token 用量 / 已读证据卡片**：均不在 U0 改动范围；已读证据保留 title/page/version/snippet（`Answer.tsx:77`）。
- **会话状态机与用量语义**：`conversation.ts` 的 usage/首 token/取消/步骤关闭/策略版本逻辑不得被 UI 重构破坏；`node --test src/` 的 12 passed 为回归基线。

## 2. 现状与问题（已核对）

状态：✅ 已解决 · ⬜ 待处理 · 🔒 受保护。U0 已落地于提交 `72fde7a`；U5 于 `9a0c899`；U6/U7/U8 于 `ce3b4e7`；U1.0–U1.4/U2/U9 系列为工作树改动（未提交）。实施证据见 [`implementation.md`](implementation.md)。

| 问题 | 证据（文件:行） | 影响 | 状态 |
|---|---|---|---|
| 左栏被运维工具淹没 | 原 `main.tsx:143-154`（`SourceManager`/`KnowledgePanel`/`OfficialDocs`/健康/导出/断开） | 与 demand §2.2/§8.2 冲突 | ✅ U0.1/U0.2 |
| 会话历史是原生下拉 | 原 `main.tsx:147` `<select>` | 无法承载徽标/分组/悬停菜单 | ✅ U0.5（`SessionList`） |
| 新建会话未保存时靠下拉兜底 | 原 `main.tsx:147` "当前新会话" | 列表化后若不显式渲染会消失 | ✅ U0.5 |
| `documents` 重复拉取 | 原 `main.tsx:42`/`main.tsx:64`、`KnowledgePanel.tsx:19` | 状态可能不一致 | ✅ U0.4（`useDocuments`） |
| 常驻轮询 | `OfficialDocs.tsx` 2s、`main.tsx` health 3s | 无谓请求 | ✅ U0.2/U0.3（health 保留并就绪后降频） |
| 阶段 C 残留（死键） | `Answer.tsx:46`、`api.ts:7`、`policy.ts` | 语义混乱、历史包袱 | ✅ U0.6 |
| **B1 正常回答停止原因被误标** | `routing.py:31` 正常 `stop_reason=professional`，`policy.ts` 无该键 → `Answer.tsx:46` 回退 | 几乎每条回答显示误导文案 | ✅ U0.6 |
| 处理过程展开 | `Answer.tsx:41` 受控 `open` | running→completed 强制折叠 | ✅ U0.6 |
| `Notes.tsx` 未挂载 | `main.tsx` 无 import | 易被误认为在售功能 | ✅ U0.7（留原处加注） |
| 无前端测试脚本 | `package.json` scripts | 新增逻辑无处回归 | ✅ U0.8（`node --test`） |
| 新建会话直接落空会话 | `main.tsx:145` | 无法先选 task1–4（demand §9.3） | ⬜ U1（依赖 G2/G3） |
| `SessionData` 无 `task_id` | `workspace.ts:6` | 会话无法绑定任务 | ⬜ U1.2 |
| 引用 chip 指向 JSON 读文接口 | `Answer.tsx:77` → `knowledge.py:165` | 无法定位物理页 | ✅ U2.4（`citation` 映射 + `/file` 跳转；D10 页码校验未做） |
| 编辑并重问新增独立会话 | `workspace.ts:86` `createBranch` | 左栏出现两条历史 | ✅ U5（`9a0c899`） |
| "断开连接并退出"占整行 | `SettingsDrawer`/`main.tsx` | 不够紧凑 | ✅ U6（`ce3b4e7`） |
| 无法预览知识库正文 | `IngestTools.tsx:70` 列表仅标题 | 看不到源文件内容 | ✅ U7（`ce3b4e7`） |
| LLM/状态不在左下角 | `main.tsx:161` 侧栏 `md:overflow-y-auto` | 状态可见性差 | ✅ U8（`ce3b4e7`） |

## 3. 后端依赖矩阵

| UI 能力 | 依赖后端 | 后端状态 | 前端状态 / 可否先做 |
|---|---|---|---|
| 左栏收敛 / 设置抽屉 / documents hook / 视觉 | 无 | — | ✅ 已完成（U0/U4.1–U4.2） |
| 会话栏列表化 / 分组 / 搜索 | 无 | — | ✅ 已完成（U0.5） |
| 会话内分支（编辑并重问） | 无 | — | ✅ U5 |
| 设置抽屉电源按钮 | 无 | — | ✅ U6 |
| 知识库正文预览 | 现有 `GET /api/documents/{doc_id}`（`read`） | ✅ 已具备（`next_start_line` 分页；`read` 无 `captured_at`） | ✅ U7 |
| 左下角 LLM 状态 | `/api/health` 的 `model` | ✅ 已具备 | ✅ U8 |
| 侧栏收束/展开（U9.1） | 无 | — | ✅ 已完成（`localStorage` 持久化 + 图标栏） |
| 文献库浏览页（U9.2） | 现有 `GET /api/documents`（`useDocuments`） | ✅ 已具备 | ✅ 已完成（`LibraryView`；PDF 原文件预览走 D2） |
| 科研头条/资讯板块（U9.3） | `GET /api/news`（拟议，板块配置/数据源未定） | ⬜ 未实现 | ✅ 开关占位完成（默认 off，不实现抓取） |
| 模型选择器（U9.4） | `GET /api/models` + chat 可选 `model` 字段（拟议） | ⬜ 未实现 | 🟡 只读展示已完成（U9.4-1）；切换需后端 |
| 任务选择器 / task_id 绑定 | `GET /api/tasks`（G2）、chat `task_id`（G3） | ✅ 已实现 | ✅ 已完成（U1.1–U1.4；`VITE_UI_TASKS` 门控，默认 off） |
| 检索过滤 UI（domain/year/fund） | B5 chat `filters` | ⬜ 未实现 → 422 | ⚠️ 入口可先占位（U1.5 未实现） |
| 右侧目录树 | `GET /api/documents` 补 `rel_path/status/meta`（D1；`kind` 已返回，`main.py:117`） | ✅ 已实现（D1） | ✅ 已完成（U2.2，`VITE_UI_DOC_PANEL` 门控） |
| PDF/Markdown 原文件预览 | `/api/documents/{id}/file`（D2） | ✅ 已实现（D2） | 🟡 已完成（U2.3 **D6 降级**：浏览器原生 PDF，未用 PDF.js） |
| 报告表单 / 报告卡片 | `POST /api/reports`（E1）、`GET /api/reports/{id}`（E2） | ⬜ 未实现 | ❌ 需 E1/E2（task4 报告占位已有） |

**结论**：U0/U4.1–U4.2 已完成；U5–U8 无后端依赖，可在 U1 之前执行（U7 复用现有读接口）；U9.1/U9.2 同样无后端依赖（U9.2 复用 `GET /api/documents`），可与 U1 并行；U9.3/U9.4 第二步必须等新后端契约；U1–U3 必须等对应后端契约，避免前端调用不存在接口或触发 422。

## 4. 分期计划

> 状态：U0.1–U0.8 与 U4.1–U4.2 **已实施并离线验收**（提交 `72fde7a`）；下表保留设计与验收标准，进度以 [`plan.md`](plan.md) 的 U 节为准，完成证据见 [`implementation.md`](implementation.md)。U5–U8（U0 实机反馈修订）见 §8。

### 特性开关（U1–U3 占位，默认关闭）

U1–U3 的前端占位 UI 由显式开关控制，默认关闭且不发送任何新字段，后端就绪后再开启：

| 开关名 | 控制 | 默认 |
|---|---|---|
| `VITE_UI_TASKS` | 任务选择器/徽标/session `task_id`（U1.1–U1.4） | off |
| `VITE_UI_FILTERS` | 检索过滤 UI（U1.5） | off |
| `VITE_UI_DOC_PANEL` | **仅 U2** 的目录树/PDF/引用跳转；不含 U7 正文预览 | off |
| `VITE_UI_REPORTS` | task4 报告表单/卡片（U3） | off |
| `VITE_UI_NEWS` | 科研头条占位（U9.3） | off |
| `VITE_UI_MODELS` | 模型选择器第二步（U9.4，需后端 `GET /api/models`） | off |

实现：`import.meta.env.VITE_*` 读取；关闭时相关组件不渲染、请求不携带对应字段（否则 `ChatRequest extra="forbid"` 会 422，已核验于 `src/main.py:34`）。

**状态（2026-09-21 更新）：六枚开关已随 U1.0 建立**——`frontend/src/vite-env.d.ts`（`vite/client` 引用）与 `frontend/src/uiFlags.ts`（统一读取 `1/true/on`）；默认全部关闭，关闭时不渲染组件、不发送新字段。U1.1–U1.4（tasks）、U2（doc_panel）、U9.3（news）已在各自开关内实施；`VITE_UI_FILTERS`（U1.5，依赖 B5）、`VITE_UI_REPORTS`（U3，依赖 E1/E2）、`VITE_UI_MODELS`（U9.4-2，依赖 `GET /api/models`）保持 off 等待后端。

> **开关启用策略（2026-09-21 第四轮审查新增，与 plan U 节同源）**：任一开关转 on 须同时满足——① 对应后端契约已实现；② 通过浏览器实测验收。当前判定：`VITE_UI_TASKS`、`VITE_UI_DOC_PANEL` 后端均已同批实现，但本批**尚未提交**且浏览器验收（含 D10）未做，**暂维持 off**；其余四枚后端未实现/待定，维持 off。开启时改 `uiFlags.ts` 默认值或配 `.env`，两处口径不得分叉。

**前置（否则 `npm run build` 第一步就失败）**：新增 `frontend/src/vite-env.d.ts`（`/// <reference types="vite/client" />`）或给 `tsconfig` 加 `"types": ["vite/client"]`；当前两者都缺，`import.meta.env` 报 `TS2339: Property 'env' does not exist on type 'ImportMeta'`（已实测）。列为 U1 第一步。

**范围澄清**：`VITE_UI_DOC_PANEL` 只门控 U2（目录树/PDF/引用跳转）；U7 的**正文预览不受该开关控制**（无开关或单列开关），保证 U2 未就绪时 U7 仍可用。

### U0 信息架构与基础（无后端依赖）

| 编号 | 任务 | 涉及文件 | 验收 |
|---|---|---|---|
| U0.1 | 拆分 `SourceManager`：`ScopeSelector`（资料范围，保留在输入区）+ `IngestTools`（补充正文/本地导入，入抽屉） | `SourceManager.tsx` → `ScopeSelector.tsx` / `IngestTools.tsx` | 底部仍可设置 `allowed_doc_ids`；入库入口不在左栏 |
| U0.2 | 新增 `SettingsDrawer`，收纳 `IngestTools`/`OfficialDocs`/导出/断开；抽屉关闭即卸载运维组件。可访问性：`role="dialog"` `aria-modal`、focus trap、Esc 关闭 | `SettingsDrawer.tsx`、`main.tsx` | 左栏仅"＋新对话/搜索/历史/归档"；关闭抽屉后无 2s 轮询；纯键盘可完整操作 |
| U0.2b | 断开/重连移入抽屉后，断连、保存失败等异常状态仍须在主界面可见（不藏进抽屉） | `main.tsx` | 断开时主界面可见提示，符合 demand F7 |
| U0.3 | 健康状态：正常=圆点+tooltip；未就绪/失败=展开文字，保留密钥/知识库阻塞提示。**health 轮询保留**（就绪/阻塞态所需），连接正常且 ready 时可降频 | `main.tsx` | 未配置密钥、知识库失败时用户可见原因；health 仍反映就绪状态 |
| U0.4 | `useDocuments` hook 收敛三处 fetch，统一失效与错误 | `useDocuments.ts`、`main.tsx`、`IngestTools.tsx` | 只有一处 fetch；列表刷新后各视图一致 |
| U0.5 | 会话栏列表化：今天/昨天/更早分组、搜索框、当前高亮、悬停菜单（重命名/归档；**复制与删除均未纳入首期**——`useWorkspace` 无会话级 `duplicate()`，删除亦超出 demand §9.1，两者实施前均需确认）；**必须显式渲染尚未持久化的当前会话**（对齐 `main.tsx:147` 兜底）。分组时间源：`updated_at ?? turns[0].startedAt`，未保存会话归"今天" | `SessionList.tsx`（新）、`main.tsx`、`workspace.ts`（如需） | 下拉换成列表；新建的空会话在列表中可见、可切换、不消失；时间分组对未保存会话不报错 |
| U0.6 | 阶段 C 清理（仅动标签与展开态）：① **优先修 B1**：`policy.ts` 补 `professional`（`routing.py:31`，正常路径）、`repair`（`graph.py:298`）、`completed`（`graph.py:88` 默认），删 `social/classified/knowledge_only/routing_*`；② `Answer.tsx:46` 删除死键 `direct`，`api.ts:7` `Policy.route` 收窄为 `research | clarify`；③ `Answer.tsx:41` 受控 `open` 改为"运行中自动展开、完成后不强制收起"；`<summary>` 已含 `finalLabel`（`Answer.tsx:40,42`），不新增进度行 | `Answer.tsx`、`policy.ts`、`api.ts` | 正常回答显示"资料研究 · …"而非"处理已更新"；完成后可手动展开并保持；Process step 列表、Timing、Token、已读证据不变 |
| U0.7 | `Notes.tsx` **留在原处**，文件头加 experimental 注释；**不移动目录**（其相对 import `./api`/`./workspace` 移入子目录会断，`tsc --noEmit` 失败）。若坚持归档须同步改 import | `Notes.tsx` | `npm run build`（tsc）通过；主界面无未挂载功能暗示 |
| U0.8 | 锁定 `node:test`：`package.json` 加 `"test": "node --test src/"`，不引入 vitest | `package.json` | `npm test` 运行现有 `*.test.mts` 且 12 passed |

> 会话「复制」与「删除」：demand §9.1 未要求。复制需先新增会话级 `duplicate()`（现有 `createBranch` 是问题级分支，`workspace.ts:86`）；删除同样超出冻结范围。两者均单列任务，**不塞进 U0.5、U1 或 G6**；口径以本节为准，plan 的 §4 与 G6 已同步。

### U1 任务系统与会话绑定（依赖 G2/G3/G7；过滤依赖 B5）

| 编号 | 任务 | 验收 |
|---|---|---|
| U1.0 | 新增 `frontend/src/vite-env.d.ts`（`/// <reference types="vite/client" />`），使 `import.meta.env.VITE_UI_*` 通过 `tsc --noEmit` | `npm run build` 通过；开关可读取 |
| U1.1 | 消费 `GET /api/tasks`，`＋` 打开 task1–4 单选器（单选列表，可带勾选态） | 选择后新建会话并写入 `task_id` |
| U1.2 | `SessionData` 增 `task_id`（工作区 JSON，无迁移），随会话恢复 | 刷新后任务与会话正确恢复 |
| U1.3 | `POST /api/chat` 发送 `task_id`（task1–3）；task4 不发 chat | task1–3 请求正常；task4 进入报告表单 |
| U1.4 | 会话头显示任务名+职责；会话栏条目显示任务徽标 | 徽标与选中任务一致 |
| U1.5 | 检索过滤 UI（domain/year_from/year_to/fund_types），标明"年份缺失需补录" | 过滤随问答发送；与报告共用口径 |

> 会话内切换任务、删除会话为**补充项，超出 demand §9.1**，实施前需确认。

### U2 右侧文档面板与引用跳转（依赖 D1/D2，页码以 D10 为准）

| 编号 | 任务 | 验收 |
|---|---|---|
| U2.1 | 右上"本地文档"入口 + `DocumentPanel` 滑出容器（关闭不丢聊天上下文） | 面板可开合，聊天不中断 |
| U2.2 | `DocumentTree`：按 `rel_path` 建树、展开/折叠、文件名筛选、状态标记 | 中文名/多级目录正常 |
| U2.3 | `PdfViewer`（PDF.js，本地 worker，Vite `new URL` 打包）+ `MarkdownViewer`（可切原文） | PDF 翻页/缩放；Markdown 渲染与原文切换 |
| U2.4 | 正文 `[n]` 在 Markdown 渲染层变可点击（remark/rehype 或自定义 text 组件），调用 `openDocument(doc_id,page)`；**不改写 Markdown 源文本**。映射改用服务端 `citation`：`api.ts` 的 `Source` 增 `citation?: number`，`Answer.tsx:77` 由 `j+1` 改为 `s.citation`（后端 `graph.py:304` 已生成），回退时才用数组下标；`sources` 事件在 `token` 之前发出（`graph.py:304`），流式期间即可点 | 点击定位正确文件与页；`[1][4]` 逐个命中；`n` 超出 `sources` 长度时不误匹配；代码块/普通方括号不误匹配；现有"已读证据"卡片（title/page/version/snippet）保留 |
| U2.5 | 浏览与限定范围分离："限定为检索资料"显式按钮复用 `allowed_doc_ids` | 浏览不改范围；显式操作才改 |
| U2.6 | 新增依赖 `pdfjs-dist` | 构建通过 |

> 页码：`evidence.page` 与 PDF.js 物理页的一致性由 D10 校验；D10 完成前按"文档+页"best effort，并在 UI 标注未校验。

### U3 报告入口（依赖 E1/E2）

| 编号 | 任务 | 验收 |
|---|---|---|
| U3.0 | **先对齐 `POST /api/reports` 的 SSE 事件契约**（阶段/正文/report_id 事件名与 chat 是否一致）；若不同，需独立解析器或扩展 `api.ts:59` 白名单（现仅放行 chat 事件） | 契约文档化后方可开发 U3.2 |
| U3.1 | task4 选中后输入区切换为"领域/年份/模板/分析重点"表单 | 表单校验必填 |
| U3.2 | 调用 `POST /api/reports` 流式展示阶段与正文（按 U3.0 契约） | 阶段可见，流式完成 |
| U3.3 | 报告卡片：预览、复制、`.md` 下载、来源与局限 | 生成结束可得 report_id 并回读 |
| U3.4 | 报告作为会话内记录展示（回读 `GET /api/reports/{id}`）。**前置：plan 待决 #10（报告↔会话绑定）必须先定稿** | 刷新后报告记录可恢复 |

### U4 视觉与响应式（可与 U0–U3 并行）

| 编号 | 任务 | 验收 |
|---|---|---|
| U4.1a | **已实施**（`72fde7a`）：内容区静态放宽 `max-w-4xl` → `max-w-5xl`（`main.tsx:211`） | 构建通过、内容区变宽 |
| U4.1b | **未实施**（N4）：双栏条件自适应——随侧栏收束/展开动态调整内容宽度，文档面板在宽屏降级为挤压式侧栏。依赖关系详见 plan D11 与本节 U9.1 | 宽屏下侧栏收放即时反映到内容宽度，且面板不遮挡聊天 |
| U4.2 | 空状态建议改为任务导向示例（精准问答/对比/趋势） | 文案不含语料专有内容 |
| U4.3 | 流式过程与 Markdown/代码块排版优化 | 长会话噪声可控 |

## 5. 分阶段验收（Given / When / Then）

> U0–U4 场景见本节；U5–U8 的验收场景随 §8 各任务列出（与本节同等效力，避免漏读）。

- `user 左栏只承载对话与会话管理`
  Given 打开主界面；When 查看左栏；Then 无入库/采集/健康详情，仅"＋新对话/搜索/历史/归档"。
- `user 通过设置抽屉使用运维能力`
  Given 左栏已收敛；When 打开设置抽屉；Then 可见入库/在线文档/导出/断开；关闭抽屉后无运维轮询请求。
- `user 选择任务后新建会话`
  Given `GET /api/tasks` 可用；When 点击"＋"选择 task2；Then 新会话带任务徽标，会话头显示任务职责，请求携带 `task_id`。
- `user 点击引用定位原文`
  Given 回答含 `[n]` 且 D1/D2 可用；When 点击 `[n]`；Then 打开右侧面板并定位对应文件与页码；失效引用给出提示。
- `user 浏览文档不改变检索范围`
  Given 已选"全部资料"；When 在文档面板打开某 PDF；Then 检索范围仍为全部；仅点击"限定为检索资料"后改变。
- `user 生成 task4 报告`
  Given 选择 task4；When 填写领域/年份/模板并提交；Then 流式返回报告，卡片支持预览/复制/`.md` 下载，刷新后可回读。
- `user 新建的空会话不会消失`
  Given 新建会话尚未保存；When 查看会话列表；Then 当前未保存会话在列表中可见且为高亮项，可再次切换回来。
- `user 用键盘操作设置抽屉`
  Given 抽屉已打开；When 使用 Tab/Esc；Then 焦点锁定在抽屉内、Esc 可关闭且焦点回到触发按钮。
- `user 点击正文引用不破坏证据卡片`
  Given 回答含 `[1][4]` 且已有"已读证据"卡片；When 点击 `[n]`；Then 正文文本不变，两个编号分别命中对应来源，`n` 超出 sources 时原样显示，卡片 title/page/version/snippet 保持不变。
- `user 正常回答显示正确的停止原因`
  Given 完成一轮正常问答（`stop_reason=professional`）；When 查看"处理过程"；Then 显示"资料研究 · …"而非"处理已更新"。
- `user 回答的推理步骤/耗时/token/证据不回归`
  Given 完成一轮问答；When 展开"处理过程/耗时/已读证据"；Then 步骤列表、首 token 与总时间、token 统计、来源卡片（page/version/snippet）均存在且可展开。

## 6. 风险与待决

- **前端先于后端**：U1–U3 未等契约会 422/404。缓解：U0 先行；U1–U3 由 §4 特性开关控制，默认关且不发新字段，后端就绪再开。
- **B1 正常路径文案（U0.6 优先）**：`routing.py:31` 正常 `stop_reason=professional` 未被 `policy.ts` 覆盖，几乎每条回答显示"处理已更新"；U0.6 必须先补 `professional/repair/completed`。**（U0.6 已修）**
- **B2 移动 Notes 会断构建**：`Notes.tsx` 相对 import `./api`/`./workspace`，移入子目录会使 `tsc --noEmit` 失败；U0.7 定为"留原处加头注"，不移动。**（U0.7 已定）**
- **`[n]` 解析回归（U2 最高风险）**：必须在渲染层处理，**不改写 Markdown 源文本**；映射用服务端 `citation`（`graph.py:304`）而非数组下标，`Source` 增 `citation`；保留"已读证据"卡片。列为 U2 验收项。
- **U3 流式契约未定**：`api.ts:59` 只放行 chat 事件名，`/api/reports` 事件名若不同需独立解析器；U3.0 先对齐契约。
- **PDF.js worker 打包**：需明确 `new Worker(new URL(...))` 与 Range 请求；D2 未完成前降级提示。
- **documents hook**：需统一 `corpusReady`/`connected` 触发与失效，避免旧轮询残留。
- **U3.4 前置未决**：报告"刷新后可恢复"依赖 plan 待决 #10（报告↔会话绑定）；**U3 开工前必须先定稿 #10**。
- **health 轮询**：非"无谓请求"，是就绪/阻塞态所需；U0 只移除 OfficialDocs 抽屉外轮询，health 保留（可降频）。
- **可访问性**：`SettingsDrawer` 需 `role="dialog"`/`aria-modal`/focus trap/Esc；断开/重连移入抽屉后，断连与保存失败仍须在主界面可见（demand F7）。
- **待确认**：会话内切换任务、删除会话、"会话复制"是否纳入首期（超出 demand §9.1）。

## 7. 与 demand / plan 的对应

| 本方案 | demand | plan |
|---|---|---|
| U0.1–U0.4 | §2.2、§5、§8.2 | 信息架构前提（G6 前置） |
| U0.5、U1 | §9.1、§9.3 | G5–G7 |
| U2 | §5、§6 | D1–D10 |
| U3 | §4、§6 | E1–E7、G9 |
| U0.6、U4 | §3、§8.2 | C 残留清理 |
| U5 | §9.1 | 会话管理（G5–G7 邻域） |
| U6 | §9.1 | 会话/运维入口 |
| U7 | §5 | 文档预览（U2/D 的前置外壳 `DocumentPanel`） |
| U8 | §3、§8.2 | 状态与可辨认性（F7） |

## 8. U0 实机反馈修订（**已实施并离线验收**，2026-09-21 17:26）

U0 实机测试（`launch.sh` + 前端）后提出的四项修订；均不依赖新后端契约（U7 复用现有读接口）。U5 落地于 `9a0c899`，U6/U7/U8 落地于 `ce3b4e7`；各节保留设计方案与验收标准，**实施状态与证据以 [`plan.md`](plan.md) 为准**。

### U5 会话内分支：编辑并重问不再新建会话

问题：编辑历史问题走 `workspace.createBranch`（`workspace.ts:86`），新建一条“编辑后的分支”会话，左栏出现两条历史（用 `source_session_id`/`source_turn_index` 记录来源）。

目标：编辑与重问合并进原会话，左栏只保留一条历史。

数据模型（`SessionData`，工作区 JSON，无数据库迁移）：

```ts
type Branch = { id: string; fromIndex: number; turns: Turn[]; label: string; createdAt: string };
type SessionData = {
  turns: Turn[]; options: Options; archived?: boolean; branches?: Branch[];
  source_session_id?: string; source_turn_index?: number; // 保留：旧分支只读展示与归并（workspace.ts:6）
};
```

（新记录不再写 `source_session_id`/`source_turn_index`；旧记录保留只读展示。）

**持久化（最大缺口，必须一并改）**：`branches` 必须进入保存管线，否则下次 autosave 会用旧 `existing.data` 覆盖丢失。要求：
- `useWorkspace` 增 `branches` state + `branchesRef`，与 `turns`/`options` 同步。
- `enqueue`/`saveNow`/autosave（`workspace.ts:67,74`）/`switchSession` 保存时都并入 `branches`：`data: { ...existing?.data, turns, options, branches }`，不得只依赖 `existing?.data`。
- **会话切换单独处理**：实际走 `workspace.select()`（`workspace.ts:78-85`），它直接 `setTurns`/`setOptions` 而不经 `saveNow`；必须同时从 `item.data.branches ?? []` 重置分支 state，否则切会话后分支错位/残留。
- `saveNow` 支持显式传入分支快照，避免竞态时读到旧 ref。

**分支快照语义（与 `branchFromTurn` 区分）**：
- `branchFromTurn`（`conversation.ts:44`）会 `slice(0,index).filter(complete)`，只用于构造请求上下文。
- U5 存入的 `Branch.turns` 是 `turns.slice(i)` 的**完整快照**（含未完成/失败轮），且**深拷贝**，避免主 `turns` 后续原地更新污染分支。

**恢复**：只有 `restoreBranch` 切回主时间线，必须经 `restoreTurns`（`conversation.ts:86`），否则运行中的 turn 会永远停在 `running`；`viewBranch` 只读，不触主时间线。

**空分支/膨胀防护**：
- `restoreBranch` 存回“当前主 turns”时，若主 `turns` 为空则**不存回**，避免空分支与循环。
- 存回分支的 `fromIndex` 取当前截断点，不重复累加。

**容量**：单条 answer+sources 可达数十 KB，固定“10 条”挡不住 4MB 上限（`workspace.py:40` 413）。改为按**字节配额**裁剪最旧分支；命中 413 时给明确提示（“分支过多，已裁剪最旧分支，请重试”）。

**旧数据兼容**：历史上由 `createBranch` 生成的独立会话仍留在左栏。`SessionList` 需按 `source_session_id` 归并到源会话（折叠为“历史分支 n”）或加“历史分支”标记，否则实机反馈的“两条历史”对旧数据依旧存在。

**测试**：`workspace.ts` 是 React hook，`node --test` 覆盖不到。先把分支纯逻辑（切片/深拷贝/字节裁剪/恢复）抽到独立模块（如 `branches.ts`），用 `node:test` 覆盖；hook 只做接线。

行为：
- 编辑第 i 轮并重问：把当前 `turns.slice(i)` 深拷贝为 `Branch` 追加到 `branches`；主 `turns` 截断为 `turns.slice(0, i)`，随后追加编辑后的新一轮。
- 会话 id/标题不变，不调用 `createBranch` 新建会话。
- 被截断处显示“分支 (n)”入口，可查看/切换回某分支（切回时按上面的空分支规则处理）。

前端接口（`workspace.ts`）：`branchInPlace(index): { history, options }` 取代 `createBranch`；`viewBranch(branchId)` **只读查看**（不改主时间线）；`restoreBranch(branchId)` **切回主时间线**（经 `restoreTurns`，并将当前主 `turns` 按空分支规则存回）；纯逻辑在 `branches.ts`。

验收：
- `user 编辑并重问不新增会话`：Given 已有 1 个会话；When 编辑第 2 轮并重问；Then 左栏会话数仍为 1、标题不变，会话内出现“分支 (1)”入口。
- `user 分支在保存后不丢失`：Given 已产生分支；When 触发一次 autosave 后再刷新；Then 分支仍在（覆盖持久化缺口）。
- `user 恢复分支不残留运行态`：Given 分支含未完成轮；When 恢复该分支；Then 相关 turn 经 `restoreTurns` 收束为 `interrupted`，不停留 `running`。
- `user 分支超出配额可继续使用`：Given 分支总量接近 4MB；When 再编辑；Then 自动裁剪最旧分支并提示，保存成功。
- `user 旧历史分支归并`：Given 存在 `source_session_id` 指向源会话的旧分支会话；Then 左栏折叠/标记，不表现为两个平级历史。
- 受保护：重复生成的 `previousAttempts`、Timing/Token/已读证据不变。

> 备选方案（暂不采用）：ChatGPT 式消息版本箭头（在第 i 轮直接切换版本并重放后续）。实现更复杂，需下游版本联动；重新生成的 `previousAttempts` 已覆盖单轮版本，二者不混用。

### U6 设置与运维抽屉细化

- “断开连接并退出”改为抽屉标题栏右侧的**电源按钮**：用内联 SVG 图标（不用 `⏻` U+23FB，字体缺字形会显示方块），保留 `aria-label="断开连接"`。
- 断开态：`connected=false` 时按钮 `disabled` 并给 tooltip（“已断开”），重连交给主界面横幅的“重新连接”（`main.tsx:177`），抽屉内不再重复。
- 点击先关闭抽屉再 `await disconnect()`；若断开中的保存失败，错误经主界面 `setError` 呈现（U0.2b），**不得静默**。
- 知识库信息、在线文档源、导出、已入库文档列表布局保持。

验收：
- `user 用电源按钮断开`：Given 抽屉打开；When 点击电源按钮；Then 抽屉关闭、进入断开态、主界面显示断连横幅与“重新连接”。
- `user 断连失败不静默`：Given 有未保存内容且保存会失败；When 点击电源按钮；Then 主界面出现明确错误而非静默断开。
- `user 已断开时电源按钮不可用`：Given 已断开；Then 抽屉内电源按钮禁用并提示，重连走主界面横幅。

### U7 知识库源文件预览（网页预览）

问题：知识库文档只在抽屉里以标题列表出现，无法查看其内容。

目标：点击任一已入库文档，在网页内预览其**知识库存储正文**。

- **共享右滑面板外壳是 U7 的产物**：新增 `DocumentPanel`（props：`open`/`onClose`/`header`/`meta`/`children`）。U2 再在同一外壳内扩展 PDF.js；避免 U7 与 U2 各写一套。
- **形态现状（N3）**：该外壳落地为**遮罩式全屏抽屉**（`fixed inset-0 z-40`、`bg-black/30`、固定 `max-w-2xl`，`DocumentPanel.tsx:16-17`），不是"挤压式侧栏"。U7 阶段据此保留（符合 demand §5「滑出窗口」的最低要求）；"宽屏侧栏化、不遮挡聊天"顺延到 U2 阶段，由 plan **D11** 承载，**不在 U7 验收内**。
- 入口：`IngestTools.tsx:70` 的“已入库文档”`<li>` 改为可点击按钮，向上传 `openDocument(doc_id)`；抽屉层级为 `z-30`（`SettingsDrawer.tsx:26`），预览面板 z-index 需更高，或先关闭抽屉再打开。
- 内容源：复用 `GET /api/documents/{doc_id}`，**每次请求都带 `version`**（防跨页混版）。
- **分页边界（关键）**：`next_start_line === null` 只表示**当前页**读完，不是全文读完（`knowledge.py:200`）。必须 `page += 1, start_line = 1` 续读，直到 `page > 文档最后一页`。单次 HTTP 读取由 `main.py:148` 固定 `line_count=60`，即每次 **≤60 行 / ≤10000 字符**（不是 100 行）。
- **末页判定与 `pages` 缺失兜底**：`/api/documents` 恒定返回 `pages`（`main.py:117`），据此将 `DocumentInfo.pages` 改为**必填**，用 `page > pages` 终止。若异常缺失，以 `read` 的 404（`main.py:153`）或消息为「页码不存在」的 422 作为终止，并设最大页数保护（如 2000）防死循环；**不得**把「文档已更新」类 422 当作末页。
- **空页跳过**：某页 `lines_for` 为空时 `start_line=1 > len(lines)` 会抛 `ValueError`（`knowledge.py:182`），应跳过该页而非报错。
- 渲染：`parser=official-markdown` 或 `kind=official` → Markdown（复用 `react-markdown` + `remark-gfm`）；其余 kind → 纯文本 `<pre>`。跨页拼接可能切断代码块，按 **best-effort** 验收。
- 元数据栏：标题、来源 URL、kind、parser、版本、采集时间。**`captured_at` 不在 `read` 响应里**（只有 `read_section` 返回，`knowledge.py:164`），取自 `useDocuments` 列表项 `DocumentInfo.captured_at`（`/api/documents`）。
- 明确区分：这是**规范化正文预览**，不等于原始 PDF（原始文件由 U2/D2 的 `/file` + PDF.js 提供）。
- 与检索范围分离：预览不改 `allowed_doc_ids`（demand §5）。

验收：
- `user 预览知识库文档`：Given 抽屉已打开；When 点击某文档；Then 右侧面板显示其正文（Markdown/纯文本）与元数据（含来自列表的采集时间）。
- `user 多页文档续读到尾`：Given 文档有多页；When 打开预览；Then 自动跨页续读至最后一页，而非只显示第一页。
- `user 预览不改变检索范围`：Given 资料范围为“全部”；When 预览任一文档；Then 资料范围不变。
- `user 预览面板不被抽屉遮挡`：Given 抽屉与预览同时存在；Then 预览可见可交互（z-index 或先关抽屉）。

后端：无需新增接口（复用现有读接口；注意 `read` 无 `captured_at`）。若后续需要一次性全文或原始文件，分别另立 `?full=true` 与 D2/file 任务。

### U8 左下角 LLM 状态

- 侧栏底部固定区：`LLM: <model>` + 指示灯 + **文字状态**（如“正常/知识库准备中/异常”），颜色不是唯一信号。
- **数据源要补齐**：`main.tsx` 需新增 `model` state，并保留可判定的 `preparation`/`lastHealthError`；现有 catch 只 `setHealth` 文案（`main.tsx:71-75`），无法据此判红灯。
- 颜色：绿=connected 且 ready 且 corpusReady；黄=connected 且 ready 但知识库未就绪（`preparation=running`）；红=断连或未配置密钥或 health 失败 / `preparation=error`。
- **已知缺口（超出 U8 已实施范围）**：上述红灯条件无法表达“模型本身不可用”（模型名失效、provider 不可达、鉴权失败）。`/api/health` 的 `model_verified` 恒为 `False`（`src/main.py:108`）且无生产逻辑消费（`tests/test_professional_policy.py:150` 仅断言其为 `False`），当前前端拿不到可判定的模型可用性信号。该缺口由 [`plan.md`](plan.md) 待定设计 #12 承接；落地前 UI 不得暗示模型已验证可用。
- **固定位置**：侧栏当前是 `md:overflow-y-auto`（`main.tsx:161`），长会话列表会把底部顶走。改为 flex 列布局，状态区 `sticky bottom-0` 或独立 footer。
- 点击打开设置抽屉；tooltip 显示 health 文案；`role="status"`/`aria-label` 可读屏。与 `main.tsx:171` 的“设置与运维”按钮语义一致即可，允许重复入口。
- U0.3 的圆点/文字迁至此底部区，中段不再重复。

验收：
- `user 看到模型与状态灯`：Given 服务正常；Then 左下角显示模型名、文字“正常”与绿灯；断连时变红且可点击查看详情。
- `user 长会话不顶走状态区`：Given 会话列表很长；Then 底部状态区仍可见（sticky/footer）。

### 执行顺序与依赖（U5–U8）

- 依赖：U5/U6/U8 无后端依赖；U7 无新接口（依赖 `/api/documents` 的 `pages`/`captured_at`，均已具备）。
- 顺序：**U5 单独一个提交**（改动核心保存管线与会话切换），并先把分支纯逻辑抽到 `branches.ts` + `node:test`；**U7 次之**；**U6/U8 可并入任一批**。

> 维护约定：本文件只保留**设计方案与依赖关系**（含 §9 的 U9 方案）。任务状态记入 [`plan.md`](plan.md)；完成情况与验证证据记入 [`implementation.md`](implementation.md)。本文件不再记录完成证据。

## 9. SciencePRO 参考修订（拟议，2026-09-21）

依据用户提供的 SciencePRO 界面截图（侧栏导航、文献库、科研头条、模型页）提炼；结合本项目现状（`frontend/src`，2026-09-21）适当裁剪。四项互相独立，可单独实施；其中 U9.1/U9.2 无后端依赖，U9.3/U9.4 需新后端契约（默认关闭的占位开关）。

| 编号 | 参考 SciencePRO | 对应本项目的现有规划 |
|---|---|---|
| U9.1 | 侧栏可收束/展开（图标栏 ↔ 全宽） | 新增；与 U8 左下角状态区、U0.2b 异常可见性联动 |
| U9.2 | “文献库”一级导航 + 文档卡片/列表页 + 文档详情 | 对应 `knowledge/` 本地语料的“本地文档可视化”：U2.1 `DocumentPanel` 外壳、U2.2 目录树（D1）、U7 正文预览 |
| U9.3 | “科研头条”资讯板块（推荐/订阅、分板块卡片流） | 无现有规划；新增占位任务，后端另立 |
| U9.4 | “模型”页（可选模型卡片、Agent 模型） | 对应 U8 的模型名只读展示；切换能力需后端支持 |

### U9.1 侧栏收束/展开（无后端依赖，优先做）

现状：侧栏为固定 `md:grid-cols-[260px_1fr]`（`main.tsx:192`），aside 恒为 260px（`main.tsx:193`），无收束能力。

**同批约束（N7）**：U9.1 与 U9.2 都改 `main.tsx:192-211` 这段结构，**同批实施**，顺序为「先改 grid → 再接文献库视图」，避免两次改动互相覆盖。收束态的宽度切换同时是 U4.1b（条件自适应）的实现前提。

**z-index 层级表（新定，供 U9.2 引用）**：

| 层级 | 元素 | 说明 |
|---|---|---|
| `z-30` | `SettingsDrawer`（`SettingsDrawer.tsx:26`） | 设置抽屉 |
| `z-40` | `DocumentPanel` / `DocumentPreview`（`DocumentPanel.tsx:16`） | 文档预览，须高于抽屉 |
| 无（静态） | U9.2 文献库视图 | **不得另设更高层级**；预览打开时允许覆盖文献库视图，与 U7 现有行为一致 |

设计：

- aside 头部（`DOX_AGENT / 01` 一行右侧）加**收束/展开按钮**：内联 SVG 面板图标（参考 SciencePRO 右上角样式），`aria-expanded` + `aria-label="收起侧栏/展开侧栏"`。
- 收束态：grid 改 `md:grid-cols-[56px_1fr]`，aside 内容切换为图标列：＋新对话、文献库（U9.2）、会话搜索、设置与运维；图标带 `title`/`aria-label` tooltip。
- 状态持久化到 `localStorage`（如 `dox.sidebar.collapsed`），刷新后保留；仅 ≥md 生效，窄屏行为不变（侧栏本就随 grid 折叠为单列，无需处理）。
- **联动约束（N5 修订）**：收束态下 U8 左下角状态区可只保留状态灯；但“知识库未就绪/正在初始化”这类**阻塞性原因**必须在**主界面**以可见文字呈现（不得仅靠 tooltip 或颜色），侧栏收束后亦然。参照现有实现：`main.tsx:217-222` 在 `!ready || !corpusReady` 时渲染主区提示区块，U9.1 收束不得抑制它；plan F13 为对应验收。断连横幅与保存失败（U0.2b）同理。
- 会话列表（`SessionList`）在收束态整体隐藏；当前会话高亮信息经新对话按钮的 tooltip 或主界面标题兜底。

验收：
- `user 收束侧栏`：Given 侧栏展开；When 点击收束按钮；Then 侧栏变为图标栏，主内容区变宽，刷新后仍为收束态。
- `user 收束态下核心功能可达`：Given 侧栏已收束；When 使用图标；Then 新对话/文献库/设置均可经图标触达，键盘可操作（每个图标可 Tab 到、有可读名称）。
- `user 异常状态不受收束影响`：Given 断连或知识库未就绪；When 侧栏收束；Then 主界面横幅/提示仍可见。

### U9.2 文献库一等入口：本地文档可视化（无新后端，复用现有接口）

现状：已入库文档只出现在设置抽屉的 `IngestTools`“已入库文档”列表（`IngestTools.tsx:70`，纯标题 `<li>`），入口深、无可视化；U7 已提供 `DocumentPreview` 正文预览（经 `openDocument`，`main.tsx:181`）。SciencePRO 的“文献库”是一级导航 + 卡片网格 + 文档详情页，值得对齐。

设计（裁剪自 SciencePRO，不引入 Excel 分类与示例横幅）：

- 左栏新增**“文献库”一级入口**（收束态为图标，见 U9.1）；点击切换到文献库视图（主内容区整体替换，保留返回对话入口；对话状态与流式请求不中断）。
- **切换不中断的机制约束（N7）**：只允许卸载主区 `<section>` 展示层；`turns`、流式 `controller`、请求回调均挂在 `App` 上，因此卸载 section 不影响流式的继续与落库。丢失的只有滚动位置——须在离开对话时记录、返回时恢复，否则验收不成立。
- 文献库视图数据源复用 `useDocuments`（`GET /api/documents`），**无新后端**：
  - 卡片网格（默认）/列表两种视图切换（参考 SciencePRO 的网格/列表切换按钮）；
  - 卡片字段：**必需**为 demand §9.5 要求的标题、页数（`pages`）、采集时间（`captured_at`）；「文件份数」「大小」为**可选**，仅在现有 `DocumentInfo` 已含对应字段时展示，不作为验收硬要求；
  - 顶部按文件名筛选（前端过滤即可）。
- 点击卡片 → 打开文档详情 = 复用 U7 的 `DocumentPreview` 正文预览（元数据栏已有）；**PDF 原文件预览仍归 U2.3/D2**，不在本任务实现。
- 与 U2 的关系：U9.2 是**浏览层**，不依赖 D1 的 `rel_path`（目录树仍由 U2.2 提供）；`VITE_UI_DOC_PANEL` 只门控 U2，不门控 U9.2。
- 与检索范围分离：浏览/预览不改 `allowed_doc_ids`（沿用 U7 约束）。

验收：
- `user 从左栏进入文献库`：Given 知识库就绪；When 点击“文献库”；Then 主区展示文档卡片（标题/页数/采集时间），可切换列表视图、按名称筛选。
- `user 从文献库预览文档`：When 点击任一卡片；Then 打开 U7 正文预览面板，内容与元数据一致。
- `user 浏览不影响对话与范围`：Given 正在流式回答或已限定资料范围；When 进入文献库并预览；Then 对话不中断，`allowed_doc_ids` 不变。
- `user 未就绪时入口降级`：Given 知识库未就绪；When 点击文献库；Then 显示“知识库准备中”等明确提示而非空白。

### U9.3 科研头条/资讯板块（占位，依赖新后端，默认关闭）

SciencePRO 的“科研头条”是分板块资讯流（推荐/订阅、领域标签、卡片流）。本项目定位是**本地知识库问答**，无外部资讯抓取能力，故本期只做占位，不实现任何抓取逻辑。

设计：

- 前端开关 `VITE_UI_NEWS`（默认 **off**，加入 §4 特性开关表）：关闭时组件不渲染、**不发出任何请求**；左栏不出现“头条”入口。
- 开启后的视觉占位（需后端就绪才实际启用）：主界面顶部或左栏“头条”入口 + 板块标签（可配置）+ 资讯卡片（标题/来源/日期/摘要）。
- 后端依赖（**另立后端任务，不在本文件范围**）：`GET /api/news?section=...`；数据源、板块配置、抓取频率与合规性均未定，列入待决。外部抓取涉及网络与内容合规，需求未定稿前**禁止**实现抓取。

验收：
- `user 关闭开关时零痕迹`：Given `VITE_UI_NEWS` 未开启；When 加载任意页面并观察网络面板；Then 无 news 相关组件与请求。
- `user 开启且后端就绪时可用`：Given 开关开启且 `GET /api/news` 可用；When 打开头条；Then 按板块展示资讯卡片，卡片信息完整（标题/来源/日期）。

### U9.4 模型选择器（分两步：只读先行，切换待后端）

现状：模型名来自 `/api/health` 的 `model` 字段，仅在 U8 左下角只读展示；当前只有 `deepseek-v4.1-flash`。`POST /api/chat` 的 `ChatRequest` 为 `extra="forbid"`，携带任何 `model` 字段即 422。

设计（分两步）：

- **第一步（无后端依赖，可并入 U9.1/U9.2 批次）**：设置抽屉内展示当前模型信息（名称、来源 `/api/health`）；左下角 U8 状态区保持现状。明确呈现“当前仅支持 deepseek-v4.1-flash”。
- **第二步（依赖新后端契约，默认关闭）**：
  - 后端另立任务：`GET /api/models`（可用模型列表）+ chat 请求可选 `model` 字段（`ChatRequest` 同步放宽）；
  - 前端开关 `VITE_UI_MODELS`（默认 **off**，加入 §4 特性开关表）：关闭时不渲染选择器、请求不带 `model`；
  - 开启后：左下角模型名变为可点击下拉（或输入区旁选择器），列出 `/api/models` 返回项，默认 `deepseek-v4.1-flash`；选择随 `Options` 进入请求；模型不可用时回退默认并提示。
- **前置依赖（不可跳过）**：第二步还依赖 [`plan.md`](plan.md) 待定设计 #12——后端需先提供可判定的模型可用性信号（现 `/api/health` 的 `model_verified` 恒为 `False` 且无人消费）。该问题不定稿，前端即使有选择器也无法实现 demand §8.2 要求的“模型不可用时明确提示”。

验收：
- `user 查看当前模型`：Given 服务正常；When 打开设置抽屉；Then 可见当前模型名称。
- `user 关闭开关时不发 model 字段`：Given `VITE_UI_MODELS` 未开启；When 发送问题；Then 请求体不含 `model`（不触发 422）。
- `user 切换模型`：Given 第二步后端就绪且开关开启；When 选择另一模型并发送；Then 请求携带所选 `model`，回答正常；后端不可用时回退默认并提示。

### U9 执行顺序与依赖

- U9.1 → U9.2 → U9.4 第一步：均无后端依赖，可在 U1 之前/并行执行；建议 U9.1 先行（改动最小，且为 U9.2 入口提供收束态图标位）。
- U9.3、U9.4 第二步：仅做开关占位与方案，待后端任务定稿后再实施。
- 特性开关汇总（新增两枚，默认 off）：`VITE_UI_NEWS`（U9.3）、`VITE_UI_MODELS`（U9.4 第二步）。
