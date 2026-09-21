# dox_agent 前端 UI 优化方案（拟议）

- 状态：**U0（U0.1–U0.8）与 U4.1–U4.2 已实施并离线验收；U1–U3 待后端依赖**。进度与证据见 [`plan.md`](plan.md) 的 U 节与“完成情况记录”。
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

| 问题 | 证据（文件:行） | 影响 |
|---|---|---|
| 左栏被运维工具淹没 | `main.tsx:143-154`：`SourceManager`+`KnowledgePanel`+`OfficialDocs`+健康状态+导出+断开 | 与 demand §2.2/§8.2 冲突 |
| 会话历史是原生下拉 | `main.tsx:147` `<select>` | 无法承载徽标/分组/悬停菜单（plan §4） |
| 新建会话直接落空会话 | `main.tsx:145` `onClick=switchSession()` | 无法先选 task1–4（demand §9.3） |
| 新建会话未保存时靠下拉兜底 | `main.tsx:147` 渲染"当前新会话" | 列表化后若不显式渲染，该会话会消失（回归） |
| `SessionData` 无 `task_id` | `workspace.ts:6` | 会话无法绑定任务（plan G7） |
| 引用 chip 指向 JSON 读文接口 | `Answer.tsx:77` 的 `s.url` → `knowledge.py:165` `/api/documents/{id}?...&section=true` | 不是可读原文，无法定位物理页（plan D8） |
| `documents` 重复拉取 | `main.tsx:42`、`main.tsx:64`、`KnowledgePanel.tsx:19`（SourceManager 只是消费 prop） | 状态可能不一致 |
| 常驻轮询 | `OfficialDocs.tsx` 每 2s、`main.tsx` health 每 3s | OfficialDocs 移入抽屉后应卸载停止；health 是就绪/阻塞态所需，**保留**（空闲可降频，见 U0.3） |
| 阶段 C 残留（死键） | `Answer.tsx:46` 的 `direct` 为死键（`route` 只会是 `research`/`clarify`）；`api.ts:7` `Policy.route` 仍含 `direct`；`Answer.tsx:69` 的 `direct` 属 telemetry 命名空间；`policy.ts` 保留 `social/classified/knowledge_only/routing_*` | 语义混乱、历史包袱 |
| **B1 正常回答停止原因被误标** | `routing.py:31` 正常路径 `stop_reason="professional"`（`graph.py:88` 发出），`policy.ts` 无该键 → `Answer.tsx:46` 回退"处理已更新" | 几乎每条回答都显示误导文案 |
| 处理过程展开 | `Answer.tsx:41` 受控 `open={outcome==="running"}`；`<summary>` 已含 `finalLabel`（`Answer.tsx:40,42`） | 受控 open 在 running→completed 时强制折叠，用户无法保持展开 |
| `Notes.tsx` 未挂载 | `main.tsx` 无 import | 易被误认为在售功能 |
| 无前端测试脚本 | `package.json` scripts | 新增逻辑无处回归 |

## 3. 后端依赖矩阵

| UI 能力 | 依赖后端 | 当前状态 | 无依赖时可否先做 |
|---|---|---|---|
| 左栏收敛 / 设置抽屉 / documents hook / 视觉 | 无 | — | ✅ 立即可做 |
| 会话栏列表化 / 分组 / 搜索 | 无 | — | ✅ |
| 任务选择器 / task_id 绑定 | `GET /api/tasks`（G2）、chat `task_id`（G3） | ⬜ 未实现，`ChatRequest` `extra="forbid"` → 发送即 422 | ⚠️ 可先做视觉，任务值不发送 |
| 检索过滤 UI（domain/year/fund） | B5 chat `filters` | ⬜ 未实现 → 422 | ⚠️ 入口可先占位 |
| 右侧目录树 | `GET /api/documents` 补 `rel_path/status/meta`（D1；`kind` 已返回，`main.py:117`） | ⬜ 未实现 | ❌ 需 D1 |
| PDF/Markdown 预览 | `/api/documents/{id}/file`（D2） | ⬜ 未实现 | ❌ 需 D2 |
| 报告表单 / 报告卡片 | `POST /api/reports`（E1）、`GET /api/reports/{id}`（E2） | ⬜ 未实现 | ❌ 需 E1/E2 |

**结论**：U0（无后端依赖）现在即可做；U1–U3 必须等对应后端契约，避免前端调用不存在接口或触发 422。

## 4. 分期计划

### 特性开关（U1–U3 占位，默认关闭）

U1–U3 的前端占位 UI 由显式开关控制，默认关闭且不发送任何新字段，后端就绪后再开启：

| 开关名 | 控制 | 默认 |
|---|---|---|
| `VITE_UI_TASKS` | 任务选择器/徽标/session `task_id`（U1.1–U1.4） | off |
| `VITE_UI_FILTERS` | 检索过滤 UI（U1.5） | off |
| `VITE_UI_DOC_PANEL` | 右侧文档面板与引用跳转（U2） | off |
| `VITE_UI_REPORTS` | task4 报告表单/卡片（U3） | off |

实现：`import.meta.env.VITE_*` 读取；关闭时相关组件不渲染、请求不携带对应字段（否则 `ChatRequest extra="forbid"` 会 422）。

### U0 信息架构与基础（无后端依赖）

| 编号 | 任务 | 涉及文件 | 验收 |
|---|---|---|---|
| U0.1 | 拆分 `SourceManager`：`ScopeSelector`（资料范围，保留在输入区）+ `IngestTools`（补充正文/本地导入，入抽屉） | `SourceManager.tsx` → `ScopeSelector.tsx` / `IngestTools.tsx` | 底部仍可设置 `allowed_doc_ids`；入库入口不在左栏 |
| U0.2 | 新增 `SettingsDrawer`，收纳 `IngestTools`/`OfficialDocs`/导出/断开；抽屉关闭即卸载运维组件。可访问性：`role="dialog"` `aria-modal`、focus trap、Esc 关闭 | `SettingsDrawer.tsx`、`main.tsx` | 左栏仅"＋新对话/搜索/历史/归档"；关闭抽屉后无 2s 轮询；纯键盘可完整操作 |
| U0.2b | 断开/重连移入抽屉后，断连、保存失败等异常状态仍须在主界面可见（不藏进抽屉） | `main.tsx` | 断开时主界面可见提示，符合 demand F7 |
| U0.3 | 健康状态：正常=圆点+tooltip；未就绪/失败=展开文字，保留密钥/知识库阻塞提示。**health 轮询保留**（就绪/阻塞态所需），连接正常且 ready 时可降频 | `main.tsx` | 未配置密钥、知识库失败时用户可见原因；health 仍反映就绪状态 |
| U0.4 | `useDocuments` hook 收敛三处 fetch，统一失效与错误 | `useDocuments.ts`、`main.tsx`、`KnowledgePanel.tsx` | 只有一处 fetch；列表刷新后各视图一致 |
| U0.5 | 会话栏列表化：今天/昨天/更早分组、搜索框、当前高亮、悬停菜单（重命名/归档，**不含复制**：`useWorkspace` 无会话级 `duplicate()`）；**必须显式渲染尚未持久化的当前会话**（对齐 `main.tsx:147` 兜底）。分组时间源：`updated_at ?? turns[0].startedAt`，未保存会话归"今天" | `SessionList.tsx`（新）、`main.tsx`、`workspace.ts`（如需） | 下拉换成列表；新建的空会话在列表中可见、可切换、不消失；时间分组对未保存会话不报错 |
| U0.6 | 阶段 C 清理（仅动标签与展开态）：① **优先修 B1**：`policy.ts` 补 `professional`（`routing.py:31`，正常路径）、`repair`（`graph.py:298`）、`completed`（`graph.py:88` 默认），删 `social/classified/knowledge_only/routing_*`；② `Answer.tsx:46` 删除死键 `direct`，`api.ts:7` `Policy.route` 收窄为 `research | clarify`；③ `Answer.tsx:41` 受控 `open` 改为"运行中自动展开、完成后不强制收起"；`<summary>` 已含 `finalLabel`（`Answer.tsx:40,42`），不新增进度行 | `Answer.tsx`、`policy.ts`、`api.ts` | 正常回答显示"资料研究 · …"而非"处理已更新"；完成后可手动展开并保持；Process step 列表、Timing、Token、已读证据不变 |
| U0.7 | `Notes.tsx` **留在原处**，文件头加 experimental 注释；**不移动目录**（其相对 import `./api`/`./workspace` 移入子目录会断，`tsc --noEmit` 失败）。若坚持归档须同步改 import | `Notes.tsx` | `npm run build`（tsc）通过；主界面无未挂载功能暗示 |
| U0.8 | 锁定 `node:test`：`package.json` 加 `"test": "node --test src/"`，不引入 vitest | `package.json` | `npm test` 运行现有 `*.test.mts` 且 12 passed |

> 会话「复制」：demand §9.1 未要求，且 `useWorkspace` 无 `duplicate()`（`createBranch` 是问题级分支，`workspace.ts:86`）；如需，单列任务新增 `duplicate()`，不塞进 U0.5。

### U1 任务系统与会话绑定（依赖 G2/G3/G7；过滤依赖 B5）

| 编号 | 任务 | 验收 |
|---|---|---|
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
- **B1 正常路径文案（U0.6 优先）**：`routing.py:31` 正常 `stop_reason=professional` 未被 `policy.ts` 覆盖，几乎每条回答显示"处理已更新"；U0.6 必须先补 `professional/repair/completed`。
- **B2 移动 Notes 会断构建**：`Notes.tsx` 相对 import `./api`/`./workspace`，移入子目录会使 `tsc --noEmit` 失败；U0.7 定为"留原处加头注"，不移动。
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

> 维护约定：本文件为拟议方案；进入实施后，任务状态与完成证据记录到 [`plan.md`](plan.md) 的"实施计划/完成情况记录"，本文件只保留方案与依赖关系。
