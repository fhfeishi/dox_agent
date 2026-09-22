# 深度审核报告（第二轮）：plan.md / ui_optimization.md 对照 demand.md 与源码

- 审核对象：[`plan.md`](plan.md)、[`ui_optimization.md`](ui_optimization.md)
- 审核基准：[`../demand.md`](../demand.md)（含 §9.5–§9.7 与同步后的 §8.2）
- 联合核对：`src/main.py`、`src/knowledge.py`、`src/parsers.py`、`src/official_docs.py`、`src/prepare_docs.py`、`src/agent/graph.py`、`src/agent/config.py`、`src/agent/routing.py`、`src/agent/evidence.py`、`frontend/src/*`、`frontend/package.json`、`frontend/tsconfig.json`、`dev_logs/design/`、`git log`
- 上一轮报告：[`review-2026-09-21.md`](review-2026-09-21.md)（P0×2 / P1×8 / P2×5）
- 本轮方式：源码逐处比对（不以文档声明为准）；**未修改任何文件**

---

## 0. 本轮新结论摘要

第一轮结论（U9 未同步 plan、ui §2 状态表自相矛盾）**仍然成立**。本轮进一步发现 **8 项文档未提及的实质问题**，其中 3 项会直接阻断 B/C 阶段（语料切换）实施：

| 编号 | 级别 | 一句话 |
|---|---|---|
| N1 | **P0** | B 阶段「切语料」缺少 prompt 改造任务，源码中 4 处语料专属硬编码无人负责 |
| N2 | **P0** | D10 的「页码映射」前提与实际解析行为相悖，该任务方向可能从根上错误 |
| N3 | **P1** | `DocumentPanel` 是 `fixed inset-0` 全屏抽屉，与"右侧侧栏"设计要求不符，多文档切换语义未定义 |
| N4 | **P1** | U4.1 已实施但用的是「固定 `max-w-5xl`」，与文档写的「有侧栏时放宽、窄屏抽屉」不是同一件事 |
| N5 | **P1** | F7 / U0.2b 的「异常可见」只有断连，缺「知识库未就绪 / 保存失败」的可验收定义 |
| N6 | **P1** | A7 契约同步已滞后 6 个提交，`design/` 停在阶段 C，与 A7 的 🟡 不符 |
| N7 | **P1** | U9.1/U9.2 之间「谁先改 grid」的具体冲突未定，且 `DocumentPanel` 的 z-index 与抽屉层未知 |
| N8 | **P2** | 第一轮 P1-6 的根因确认：`workspace.ts` 既无 `remove` 也无 `duplicate`，「删除」在 G6 属于凭空的菜单项 |

---

## 1. P0 · 阻断项（新发现）

### N1　B 阶段「切语料」遗漏 prompt 硬编码改造，无人负责

`demand.md` §2.2 把 B 阶段定义为「语料切换为科学基金历史报告」，`plan.md` B1–B5 只列了入库、元数据、过滤，**没有任何 prompt 相关任务**。但源码中存在 4 处语料专属硬编码：

| 位置 | 内容 | 影响 |
|---|---|---|
| `src/agent/graph.py:232`（`understand` system prompt） | 「对于 **LangChain、LangGraph、Deep Agents** 技术问题，用 1 至 3 个英文技术概念搜索」 | 基金报告场景下该指令直接误导检索策略 |
| `src/agent/graph.py:326`（`answer` system prompt） | 「仅当问题涉及产品关系时区分 **LangChain、LangGraph 与 Deep Agents**，不混用 API」 | 对基金报告无意义，且占用 prompt 预算 |
| `src/main.py:76`（启动预热） | `knowledge.search("LangChain")` | 预热查询用基金语料时无意义 |
| `src/prepare_docs.py:24,36` | `store.search("LangChain")` | 同上 |
| `src/main.py:70` | 启动时自动 `import_official([..., "langchain", "langgraph", "deepagents"])` | 基金场景会去抓官方技术文档 |

`status.md` §1 称「问答已固定为带引用的专业模式」，`ui_optimization.md` §1.1 也确认「当前可运行语料是 `knowledge/lcdata`，**UI 不得依赖任何语料特定文案**」——前端做得很好（`status.md` §6 已核验产物无「南溪」「LangChain 官方文档」文案），但**后端 prompt 层的语料特定内容从未被纳入任何任务**。

plan.md 的 G1（建 `src/prompts/`）只覆盖任务提示词，不覆盖 `graph.py` 里这两处既有 system prompt 的去语料化。

**建议**：B 阶段新增任务（如 B6）「清理 `graph.py`/`main.py`/`prepare_docs.py` 的语料专属硬编码，改为由 `src/prompts/base.md` 或配置驱动」，并在 F 节加一条验收「基金语料下无 LangChain/LangGraph/Deep Agents 相关检索指令残留」。此项与 G1 有耦合，建议明确先后。

### N2　D10 的「page → 物理页映射」前提与实际解析行为相悖

`plan.md` D10 写：「确认 `evidence.page` 与 PDF.js 物理页一致（**含扫描件偏移**），不一致则建立映射并加回归测试」；`ui_optimization.md` U2 注也写「`evidence.page` 与 PDF.js 物理页的一致性由 D10 校验；D10 完成前按 best effort」。

但源码证据指向**二者本来就一致**：

- `src/parsers.py:28`：PDF 解析为 `pages = [Page(number=p.page_num, text=p.text) for p in result.pages]`，即 `number` 直接取自 LiteParse 的 **PDF 物理页号**（`parse_file` 分支，非 OCR/非重排）。
- `src/knowledge.py:14-16`：`Page.number: int = Field(ge=1)`，无任何偏移或重编号。
- `src/knowledge.py:130`：检索命中 `"page": page["number"]` —— 即 `evidence.page` 就是物理页号。
- `src/knowledge.py:162,179`：`read`/`read_section` 按 `p["number"] == page` 精确取页，不存在换算。

也就是说：**当前链路下 `evidence.page` 恒等于 PDF 物理页，不存在"需要建立的映射"**。D10 设定的「先确认不一致、再建映射」把风险描述得比实际更重，且会让实施者为不存在的问题写映射层与回归测试。

真正值得 D10 保留的风险只有两条，文档没有点明：
1. **扫描件 OCR 页码**：若某 PDF 带印刷页码且与物理页错位，`LiteParse` 返回的仍是物理页号（`p.page_num`），因此引用定位物理页是**正确**的——需要校验的是"页码标签显示"，而非映射。
2. **PDF.js 页码索引基准**：PDF.js `getPage(n)` 是 1-based 物理页，与 `Page.number` 对齐，无需 `+1/-1`。这才是应写进 D10 的校验点。

**建议**：D10 改写为「校验并锁定三方一致：`Page.number` = LiteParse `page_num` = PDF.js `getPage(n)`；补充 1-based 基准的回归测试；扫描件仅需验印刷页码标签不参与定位」。否则该任务的方向与工作量评估都是错的。

---

## 2. P1 · 重要项（新发现）

### N3　`DocumentPanel` 是全屏遮罩，不是「右侧侧栏」

`ui_optimization.md` §3.1／§3.6、`plan.md` D4 均描述「右侧滑出窗口 / 侧栏 ≥1024px、窄屏全屏抽屉」，U4.1 也以「窄屏文档面板降级全屏抽屉」为验收。但实际实现：

```
frontend/src/DocumentPanel.tsx
  <div className="fixed inset-0 z-40 flex justify-end">
    <div className="absolute inset-0 bg-black/30" .../>           ← 全屏遮罩
    <div role="dialog" aria-modal="true"
         className="... h-full w-full max-w-2xl ..." >              ← 固定 2xl 宽
```

含义与文档不符的三点：

1. **`fixed inset-0` + `bg-black/30` 遮罩**：面板打开时聊天区被遮罩覆盖，而 demand §5／§9.2 与 ui §3.1 都要求「关闭面板不丢失聊天上下文」并暗示「面板打开时聊天仍可滚动查看」（`plan.md` §3.1 明确写了「面板打开时聊天仍可滚动查看」）。当前实现下**遮罩会阻挡聊天交互**，`plan.md` §3.1 的这条要求实际未满足，也没有对应验收项指出它。
2. **`max-w-2xl` 是固定值**，与「≥1024px 为侧栏」无关，宽屏下既不随视口变宽，也不是"侧栏"（侧栏应挤压主区、不遮罩）。
3. `plan.md` §3.1 的「桌面 ≥1024px 为侧栏，窄屏为全屏抽屉」在代码中**没有分支**，`U4.1` 验收里也没有对应可测项（见 N4）。

**建议**：明确 U2/D4 的目标形态——是「遮罩式全屏抽屉」还是「挤压式侧栏」。若维持现状，需改 `plan.md` §3.1 与 demand 无关（demand 只说"滑出窗口"，允许抽屉），但**必须**新增验收项「面板打开时聊天区可滚动」，或明确放弃该要求。

### N4　U4.1 已实施内容与文档描述不是同一件事

`ui_optimization.md` U4.1 写「双栏自适应：有侧栏时放宽 `max-w-4xl`；窄屏文档面板降级全屏抽屉」，`plan.md` 记 U4.1 ✅。实际代码：

- `frontend/src/main.tsx:211`：`<main className="mx-auto ... max-w-5xl ...">` —— 固定 `max-w-5xl`，**不随侧栏有无变化**。
- `query.md` 记录实施为「内容区放宽到 max-w-5xl」。
- 全仓 `grep` 无 `max-w-4xl`（文档里的旧值）。

即：U4.1 被实现为「**一次性把 `4xl` 改成 `5xl`**」，而文档描述的是一个**条件自适应**行为（有侧栏放宽 / 窄屏降级）。二者不等价，且"窄屏文档面板降级全屏抽屉"从未实现（N3）。

**建议**：把 U4.1 拆为 U4.1a（已完成的静态放宽）与 U4.1b（未完成的条件自适应 / 面板降级），避免已 ✅ 的条目掩盖未实现部分。

### N5　F7 / U0.2b 的「异常可见」定义不足

demand §8.2 要求「停止、失败、重新生成及会话恢复状态可辨认」；`ui_optimization.md` U0.2b 与 `plan.md` F7（标 🟡）要求「断开/保存失败在主界面可见」。已核验 `main.tsx` 存在断连横幅与「重新连接」。

但另一条同源要求没有可验收落点：**「知识库未就绪」**。demand §9.5 明确写「断连、**知识库未就绪**、保存失败等异常信息不进侧栏，收束不影响其在主界面的可见性」；§8.2 也有「异常提示不因收束而隐藏」。

现状核查：U0.3 把健康状态做成「圆点 + tooltip，未就绪/失败时展开文字」，并且在 U8 迁移到左下角（`ui_optimization.md` §8 U8：「U0.3 的圆点/文字迁至此底部区，中段不再重复」）。**问题**：U9.1 收束态下，该区「只保留状态灯，文字状态经 tooltip 保留」。用 tooltip 承载「知识库正在初始化」这类**阻塞性原因**，在可访问性与"可辨认"上偏弱，而 demand 恰恰点名了「知识库未就绪」要可见。

**建议**：F 节/§8.2 补一条明确验收：「知识库未就绪时，主界面（非侧栏）有可见文字提示；侧栏收束后仍可见」。

### N6　A7 契约同步实际滞后 6 个提交，与 🟡 不符

`plan.md` A7：「契约同步：随 C/D/E/G 更新 `design/API.md`/`LLD.md`/`HLD.md` … 🟡」。核查 `git log -- dev_logs/design/`：最后一笔是 **`0ff1480`（阶段 C）**，此后 `be1ddc5`、`72fde7a`(U0)、`9a0c899`(U5)、`ce3b4e7`(U6/U7/U8) **均未同步**。

同时 `dev_logs/design/API.md` 中 `grep -n "reports|tasks|models|news"` 仅命中 `models.model_for`（内部模块），**未覆盖** demand §6 的 `/api/tasks`、`/api/reports`、`/api/models`、`/api/news` 任何一条。

即 A7 已实质性停摆约 6 个提交，但仍记 🟡（暗示"进行中"）。**建议**：A7 明确回退为 ⬜ 或补充说明「U0/U5–U8 未涉及契约变更，故未同步」——但 U5 引入了 `SessionData.branches`、U7 引入了 `DocumentPanel`，前者触及数据模型（LLD 范畴），应同步。

### N7　U9.1 / U9.2 的 grid 改动冲突未定，z-index 未知

- `ui_optimization.md` U9.1 要求把 `md:grid-cols-[260px_1fr]`（`main.tsx:192`）改为收束态 `md:grid-cols-[56px_1fr]`；U9.2 又要求在**同一 aside** 内新增「文献库」一级入口并切换主区视图。二者都要改 `main.tsx:192-211` 这段结构，但文档未说明**合并实施还是分两次改**，也未说明"主区整体替换"（U9.2）与"聊天流式不中断"如何共存（替换视图是否卸载会话组件？卸载即丢失流式状态）。
- z-index 冲突有记录但未决：`ui_optimization.md` §8 U7 指出「抽屉层级为 `z-30`，预览面板 z-index 需更高，或先关闭抽屉再打开」；实测 `DocumentPanel` 用 `z-40`，`SettingsDrawer` 为 `z-30`。**但 U9.2 的"文献库视图"若也要叠 `DocumentPreview`，其层级关系未定义**（文献库在主区内，面板是全屏 `fixed inset-0`，会盖住整个文献库——这是否符合预期？）。

**建议**：U9.1/U9.2 明确「同批实施，先改 grid 后接入文库」；并补一张 z-index 层级表（SettingsDrawer 30 / DocumentPanel 40 / 通报级 toast ?）。

---

## 3. P2 · 建议项（新增）

- **N8**　第一轮 P1-6 的根因确认：`frontend/src/workspace.ts:123` 的导出为 `{ sessions, active, loaded, message, branches, select, flush, saveNow, branchInPlace, viewBranch, restoreBranch, rename, setArchived }`——**既无 `remove` 也无 `duplicate`**。`SessionList.tsx` 悬停菜单实测只有「重命名 / 归档」。故 G6 写的「重命名/归档/**删除**」中的"删除"是**凭空菜单项**，无后端亦无状态层支撑，比第一轮判断的更严重（不只是措辞不一致）。
- **N9**　`ui_optimization.md` §4 特性开关表列了 6 个开关（`VITE_UI_TASKS`/`FILTERS`/`DOC_PANEL`/`REPORTS`/`NEWS`/`MODELS`），实测 `frontend/src/` 中 `grep VITE_UI` **零命中**（除文档外无实现），且 `package.json` 无 dotenv 相关依赖。这与 `plan.md` §U 的「本轮未创建开关（当前无占位 UI 可控制）」口径一致，但 ui 文档正文仍按"已有开关"叙述，建议在 §4 表首行加「全部未创建」。
- **N10**　`ui_optimization.md` §1.1 写 `node --test src/` → 12 passed（Node v26.8.1），`plan.md` 记 U5 后为 15 passed，`status.md` §6 只记 12。三处口径不同（第一轮 P1-7 已提，此处补充：**`status.md` 也需同步**，否则"现状基准"本身失真）。
- **N11**　`plan.md` §2.5 的 `POST /api/chat` 行写「task1–3」，而 `demand.md` §6 表格写「task_id（task1–3）」——一致。但 §2.2 又写「左侧 `+` 打开任务选择列表（单选列表…）选中后新建会话并写入 `task_id`」，而 U1.1 要求「`＋` 打开 task1–4 单选器」。task4 可选但不可发 chat（须进报告表单），这条**交互分支**（选 task4 → 切表单而非发请求）在 plan §2.2 与 G5 中均未描述，只在 U1.3 一笔带过。建议补明。
- **N12**　`dev_logs/design/API.md` 等 3 份设计文档的"维护规则"要求「改接口同步 API.md」，但 A7 已滞后（N6）。建议在 A7 补充"同步时机：每个阶段收尾提交内完成"，否则规则形同虚设。
- **N13**　`ui_optimization.md` §8 U7 称「`captured_at` 不在 `read` 响应里（只有 `read_section` 返回，`knowledge.py:164`）」——经核验准确（`src/knowledge.py:164` 在 `read_section` 内 `result.update(captured_at=...)`）。该细节正确，可保留为正面记录。

---

## 4. 与第一轮结论的关系

| 第一轮 | 本轮状态 | 说明 |
|---|---|---|
| P0-1 plan 未同步 §9.5–§9.7 | **成立**，且本轮确认 `plan.md` 连设计指南 §3 也未含「文献库」一级入口 | — |
| P0-2 ui §2 状态表与文件头矛盾 | **成立** | — |
| P1-1 F 节缺 3 条验收 | **成立**，本轮追加 N5（异常可见定义不足） | — |
| P1-2 首期不做缺 2 项 | **成立** | — |
| P1-3 §5 缺 2 条拟议接口 | **成立** | — |
| P1-4「模型不可用」无承载 | **成立**（`main.py:108` `model_verified: False` 无人消费） | — |
| P1-5 §8 标题「拟议」与实施矛盾 | **成立** | — |
| P1-6 悬停菜单三处不一致 | **成立，并升级**：见 N8，`remove`/`duplicate` 均不存在 | — |
| P1-7 测试基线数字过期 | **成立**，补充 `status.md` 也需同步（N10） | — |
| P1-8 提交号口径不统一 | **成立** | — |
| P2-1 ~ P2-5 | 全部成立 | — |

---

## 5. 建议修订清单（按优先级，可直接执行）

**第一优先（阻断实施）**

1. `plan.md` B 阶段新增「清理 `graph.py`/`main.py`/`prepare_docs.py` 语料专属硬编码」任务（N1），并在 F 节加验收。
2. `plan.md` D10 修订为「校验三方 1-based 一致（`Page.number` = LiteParse `page_num` = PDF.js `getPage(n)`）」，删除"建立映射"的错误预设（N2）。
3. `plan.md` 新增 U9.1/U9.2/U9.3/U9.4-1/U9.4-2 任务行 + 阶段总览补行（第一轮 P0-1）。

**第二优先（避免文档失真）**

4. `ui_optimization.md` §2 表四行状态改 ✅（第一轮 P0-2）。
5. `ui_optimization.md` U4.1 拆为 a/b（N4）；§8 标题改「已实施」（第一轮 P1-5）。
6. `ui_optimization.md` U9.1/U9.2 明确同批实施与 z-index 层级（N7）。
7. `plan.md` G6 删除「删除」菜单项，或单列为需确认的补充项（N8）。
8. `plan.md` F 节补 F9–F11（第一轮 P1-1）+「知识库未就绪主界面可见」验收（N5）。

**第三优先（口径统一）**

9. `plan.md`/`ui_optimization.md`/`status.md` 三方统一测试基线数字与提交号（第一轮 P1-7/P1-8、N10）。
10. `plan.md` A7 回退为 ⬜ 或补充同步说明（N6）。
11. `plan.md` §5 补 `/api/models`、`/api/news`；「首期不做」补 2 项（第一轮 P1-2/P1-3）。
12. `ui_optimization.md` §4 开关表标注「全部未创建」（N9）。
13. `plan.md` §2.2/G5 补「选 task4 → 进报告表单」的交互分支说明（N11）。

---

## 7. 处理记录（2026-09-21 修订完成）

本报告 N1–N13 与所复核的第一轮结论**全部采纳**，无未采纳项；采纳表登记在 [`plan.md`](plan.md)「第三轮审核采纳」#30–#41。源码证据复核结果与原报告一致（`graph.py:232/326`、`main.py:45/73/76`、`prepare_docs.py:24/36`、`parsers.py:28`、`knowledge.py:14-16/123`、`DocumentPanel.tsx:16-17`、`main.tsx:211`、`workspace.ts:123`、`git log -- dev_logs/design/` 最后一笔为 `0ff1480`）。

对原报告建议的三处调整（并非推翻，而是收紧）：

1. **N2 未采用"删除映射预设"的绝对结论**：D10 改写为三方 1-based 一致性校验（采纳原建议），但**另立 D10b** 保留 OCR/重排分支的再校验——现有语料走 `parse_file` 非 OCR 分支，不能据此推断基金样本（可能为扫描件）同样成立；届时的差异来自解析路径而非偏移量。
2. **N3 采纳"实为遮罩抽屉"的事实，但形态选择上保留 Demand 弹性**：demand §5 只要求"滑出窗口"，允许抽屉形式。故 U7 阶段维持现状，把"≥1024px 挤压式侧栏"立为 **D11**（U2 阶段），并从 U7 验收中移除该要求，而非直接改代码。
3. **N4 拆分而非覆盖**：U4.1a 记已实施（静态放宽 `max-w-5xl`），U4.1b 记未实施（条件自适应），避免把已完成的半截工作继续写成一个整体。

配套同步：`ui_optimization.md`（U4.1a/b 拆分、§4 开关表加「全部未创建」、U9.1 同批约束与 z-index 层级表、U9.2 切换不中断机制、U9.1 联动约束按 N5 修订、§8 U7 标注面板形态）、`status.md`（面板形态与 `max-w-5xl` 现状、B6 待清理清单、design 滞后）。

1. **引用链路 `citation` 设计正确且有必要**：`src/agent/graph.py:302` 生成 `sources = [{**e, "citation": i+1} ...]`，但 `frontend/src/api.ts:1` 的 `Source` 类型**确无 `citation` 字段**——证实 U2.4 要求「`Source` 增 `citation`、由 `j+1` 改为 `s.citation`」的前提成立，非臆测。
2. **`DocumentPanel` 外壳设计合理**：注释明确「U7 renders stored text; U2 will render the raw file/PDF inside it」，U7/U2 共用外壳避免重复实现，判断正确。
3. **U7 跨页续读逻辑比文档描述更严谨**：`documentPreview.ts` 同时处理 `next_start_line === null`（页内读完）、`next_start_line <= start`（防死循环）、「页码不存在」/「行号超出范围」（正常终止）与其余错误（抛出），并有 `MAX_PAGES = 2000` 保护。文档 §8 U7 的风险描述与实现一致且无夸大。
4. **`ChatRequest extra="forbid"` 已核验**（`src/main.py:34`），ui 文档「发送新字段即 422」的判断正确。
5. **预算边界与文档一致**：`config.py` 的 `max_rounds=2`、`max_searches=6`、`max_reads=8`、`max_model_calls=12`，与 plan「沿用现有有界流程、不新建 Agent」一致。
6. **`answer_policy` 允许有条件推导**（`src/agent/routing.py:35`），证实 plan 待定设计 #11 揭示的「task1 不推测 vs 全局允许推导」矛盾真实存在，该待决项设置得当。
7. **`src/prompts/` 现状为已存在的空目录**（`ls` 可见、`/usr/bin/find` 无文件），与 G1 标 ⬜ 不冲突，但需注意空目录不被 git 跟踪（第一轮 P2-3）。
