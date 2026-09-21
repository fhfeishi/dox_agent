# dox_agent 前端 UI 优化方案（拟议）

- 状态：**U0（U0.1–U0.8）与 U4.1–U4.2 已实施并离线验收；U1–U3 待后端依赖；U5–U8（U0 实机反馈修订）拟议**。进度与证据见 [`plan.md`](plan.md) 的 U 节与“完成情况记录”。
- 背景：科学基金历史报告样本暂未到位，语料切换（B 阶段）无法推进；先用这段时间整理前端 UI 与信息架构。
- 依据：[`../demand.md`](../demand.md)（§2.2、§5、§9）、[`plan.md`](plan.md)（设计指南 §2–§4、任务 D/G/E）、[`../status.md`](../status.md)。
- 现状结论均来自实际阅读 `frontend/src/*`（2026-09-21，phase C 提交 `0ff1480`）。标记约定：拟议 / 已实现 / 已验证。

## 1. 前提与边界

### 1.1 前提

- 当前可运行语料是 `knowledge/lcdata`（157 份技术文档），**不是科学基金报告**；UI 不得依赖任何语料特定文案。
- 后端已有：`POST /api/chat`（`messages`/`run_id`/`allowed_doc_ids`）、`GET /api/documents`（doc_id/title/origin/version 等摘要）、`GET|PUT /api/workspace/sessions`、`/api/health`。
- 后端未实现：`GET /api/tasks`、chat 的 `task_id`/`filters`、`/api/documents/{id}/file`、`/api/reports`（见 §3）。
- 前端测试已有可用兜底：测试用 `node:test`，实测 `node --test src/` → **12 passed**（Node v26.8.1），覆盖 usage/首 token/取消/步骤关闭/策略版本等；`package.json` 已加 `"test": "node --test src/"`（U0.8）。统一锁定 `node:test`，**不引入 vitest**。

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

状态：✅ 已解决（U0，提交 `72fde7a`）· ⬜ 待处理 · 🔒 受保护。

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
| 引用 chip 指向 JSON 读文接口 | `Answer.tsx:77` → `knowledge.py:165` | 无法定位物理页 | ⬜ U2.4 |
| 编辑并重问新增独立会话 | `workspace.ts:86` `createBranch` | 左栏出现两条历史 | ⬜ U5 |
| "断开连接并退出"占整行 | `SettingsDrawer`/`main.tsx` | 不够紧凑 | ⬜ U6 |
| 无法预览知识库正文 | `IngestTools.tsx:70` 列表仅标题 | 看不到源文件内容 | ⬜ U7 |
| LLM/状态不在左下角 | `main.tsx:161` 侧栏 `md:overflow-y-auto` | 状态可见性差 | ⬜ U8 |

## 3. 后端依赖矩阵

| UI 能力 | 依赖后端 | 后端状态 | 前端状态 / 可否先做 |
|---|---|---|---|
| 左栏收敛 / 设置抽屉 / documents hook / 视觉 | 无 | — | ✅ 已完成（U0/U4.1–U4.2） |
| 会话栏列表化 / 分组 / 搜索 | 无 | — | ✅ 已完成（U0.5） |
| 会话内分支（编辑并重问） | 无 | — | ✅ U5 |
| 设置抽屉电源按钮 | 无 | — | ✅ U6 |
| 知识库正文预览 | 现有 `GET /api/documents/{doc_id}`（`read`） | ✅ 已具备（`next_start_line` 分页；`read` 无 `captured_at`） | ✅ U7 |
| 左下角 LLM 状态 | `/api/health` 的 `model` | ✅ 已具备 | ✅ U8 |
| 任务选择器 / task_id 绑定 | `GET /api/tasks`（G2）、chat `task_id`（G3） | ⬜ 未实现，`ChatRequest` `extra="forbid"` → 发送即 422 | ⚠️ 可先做视觉，任务值不发送 |
| 检索过滤 UI（domain/year/fund） | B5 chat `filters` | ⬜ 未实现 → 422 | ⚠️ 入口可先占位 |
| 右侧目录树 | `GET /api/documents` 补 `rel_path/status/meta`（D1；`kind` 已返回，`main.py:117`） | ⬜ 未实现 | ❌ 需 D1 |
| PDF/Markdown 原文件预览 | `/api/documents/{id}/file`（D2） | ⬜ 未实现 | ❌ 需 D2 |
| 报告表单 / 报告卡片 | `POST /api/reports`（E1）、`GET /api/reports/{id}`（E2） | ⬜ 未实现 | ❌ 需 E1/E2 |

**结论**：U0/U4.1–U4.2 已完成；U5–U8 无后端依赖，可在 U1 之前执行（U7 复用现有读接口）；U1–U3 必须等对应后端契约，避免前端调用不存在接口或触发 422。

## 4. 分期计划

> 状态：U0.1–U0.8 与 U4.1–U4.2 **已实施并离线验收**（提交 `72fde7a`）；下表保留设计与验收标准，进度以 [`plan.md`](plan.md) 的 U 节为准。U5–U8（U0 实机反馈修订）见 §8。

### 特性开关（U1–U3 占位，默认关闭）

U1–U3 的前端占位 UI 由显式开关控制，默认关闭且不发送任何新字段，后端就绪后再开启：

| 开关名 | 控制 | 默认 |
|---|---|---|
| `VITE_UI_TASKS` | 任务选择器/徽标/session `task_id`（U1.1–U1.4） | off |
| `VITE_UI_FILTERS` | 检索过滤 UI（U1.5） | off |
| `VITE_UI_DOC_PANEL` | **仅 U2** 的目录树/PDF/引用跳转；不含 U7 正文预览 | off |
| `VITE_UI_REPORTS` | task4 报告表单/卡片（U3） | off |

实现：`import.meta.env.VITE_*` 读取；关闭时相关组件不渲染、请求不携带对应字段（否则 `ChatRequest extra="forbid"` 会 422）。

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
| U0.5 | 会话栏列表化：今天/昨天/更早分组、搜索框、当前高亮、悬停菜单（重命名/归档，**不含复制**：`useWorkspace` 无会话级 `duplicate()`）；**必须显式渲染尚未持久化的当前会话**（对齐 `main.tsx:147` 兜底）。分组时间源：`updated_at ?? turns[0].startedAt`，未保存会话归"今天" | `SessionList.tsx`（新）、`main.tsx`、`workspace.ts`（如需） | 下拉换成列表；新建的空会话在列表中可见、可切换、不消失；时间分组对未保存会话不报错 |
| U0.6 | 阶段 C 清理（仅动标签与展开态）：① **优先修 B1**：`policy.ts` 补 `professional`（`routing.py:31`，正常路径）、`repair`（`graph.py:298`）、`completed`（`graph.py:88` 默认），删 `social/classified/knowledge_only/routing_*`；② `Answer.tsx:46` 删除死键 `direct`，`api.ts:7` `Policy.route` 收窄为 `research | clarify`；③ `Answer.tsx:41` 受控 `open` 改为"运行中自动展开、完成后不强制收起"；`<summary>` 已含 `finalLabel`（`Answer.tsx:40,42`），不新增进度行 | `Answer.tsx`、`policy.ts`、`api.ts` | 正常回答显示"资料研究 · …"而非"处理已更新"；完成后可手动展开并保持；Process step 列表、Timing、Token、已读证据不变 |
| U0.7 | `Notes.tsx` **留在原处**，文件头加 experimental 注释；**不移动目录**（其相对 import `./api`/`./workspace` 移入子目录会断，`tsc --noEmit` 失败）。若坚持归档须同步改 import | `Notes.tsx` | `npm run build`（tsc）通过；主界面无未挂载功能暗示 |
| U0.8 | 锁定 `node:test`：`package.json` 加 `"test": "node --test src/"`，不引入 vitest | `package.json` | `npm test` 运行现有 `*.test.mts` 且 12 passed |

> 会话「复制」：demand §9.1 未要求，且 `useWorkspace` 无 `duplicate()`（`createBranch` 是问题级分支，`workspace.ts:86`）；如需，单列任务新增 `duplicate()`，不塞进 U0.5。

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
| U4.1 | 双栏自适应：有侧栏时放宽 `max-w-4xl`；窄屏文档面板降级全屏抽屉 | ≥1024px 双栏；窄屏抽屉 |
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

## 8. U0 实机反馈修订（拟议，2026-09-21 17:26）

U0 实机测试（`launch.sh` + 前端）后提出的四项修订；均不依赖新后端契约（U7 复用现有读接口），可在 U1 之前执行。

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
- **固定位置**：侧栏当前是 `md:overflow-y-auto`（`main.tsx:161`），长会话列表会把底部顶走。改为 flex 列布局，状态区 `sticky bottom-0` 或独立 footer。
- 点击打开设置抽屉；tooltip 显示 health 文案；`role="status"`/`aria-label` 可读屏。与 `main.tsx:171` 的“设置与运维”按钮语义一致即可，允许重复入口。
- U0.3 的圆点/文字迁至此底部区，中段不再重复。

验收：
- `user 看到模型与状态灯`：Given 服务正常；Then 左下角显示模型名、文字“正常”与绿灯；断连时变红且可点击查看详情。
- `user 长会话不顶走状态区`：Given 会话列表很长；Then 底部状态区仍可见（sticky/footer）。

### 执行顺序与依赖（U5–U8）

- 依赖：U5/U6/U8 无后端依赖；U7 无新接口（依赖 `/api/documents` 的 `pages`/`captured_at`，均已具备）。
- 顺序：**U5 单独一个提交**（改动核心保存管线与会话切换），并先把分支纯逻辑抽到 `branches.ts` + `node:test`；**U7 次之**；**U6/U8 可并入任一批**。

> 维护约定：本文件为拟议方案；进入实施后，任务状态与完成证据记录到 [`plan.md`](plan.md) 的“实施计划/完成情况记录”，本文件只保留方案与依赖关系。
