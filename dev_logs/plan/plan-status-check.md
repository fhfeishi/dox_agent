# plan 完成情况审查（2026-09-21 22:20，实测复核）

> 本轮为**结果核查**，不再新增设计分析。所有结论均经实测（非引用文档声明）。

## 一、最重要的发现：工作量远超文档记录

**31 项未提交改动 + 大量未跟踪新文件**，全部躺在前端/后端工作树里：

```
修改 20 个文件（+666 / -151）    新增 9 个文件（397 行）+ src/prompts/ 5 个文件
```

即：**B6、D1–D3、D11、G1–G4、U1.0–U1.4、U2、U4.1b、U9.1–U9.4-1、A7 全部已在工作树里做完，但一次提交都没有**（最后提交仍是 `ce3b4e7`，时间 17:52；工作树改到 21:53）。

这也是前三轮审核"看起来没做"的根源——**不是没做，是没提交**。

## 二、实测验证结果（我实际跑过的）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端单测 | `node --test src/*.test.mts` | ✅ **15 passed**（与 plan 声明一致） |
| 后端编译 | `py_compile src/*.py src/agent/*.py src/prompts/*.py` | ✅ 通过 |
| prompts 加载器 | 直接调用 `list_tasks()` / `task_prompt()` | ✅ 返回 task1–4（task4 `has_template=True`），task1–3 `False`；未知 id 抛 `UnknownTaskError`（符合 plan，无静默回退） |
| B6 硬编码清理 | `grep LangChain\|LangGraph\|Deep Agents` | ✅ 已清除（仅剩 `graph.py:1` 模块 docstring 描述技术栈，非 prompt） |
| 新配置项 | `grep auto_import_official\|warmup_query` | ✅ `config.py:31-32` 存在，`main.py:98/103`、`prepare_docs.py:23/36` 已改为配置驱动 |
| G2/G3 契约 | 读 `main.py` | ✅ `GET /api/tasks`（142 行）；`ChatRequest.task_id: Literal["task1","task2","task3"]`，注释明确 task4 由 `/api/reports` 生成 |
| D1/D2/D3 | 读 `main.py` | ✅ 增 `rel_path/status/meta`；`/file` 用 `FileResponse`（Range 原生）；`local_path_in_roots` 路径安全 |
| D11 挤压式侧栏 | 读 `DocumentPanel.tsx:16-18` | ✅ `lg:pointer-events-none` + `lg:w-[36rem]` + 遮罩 `lg:hidden` |
| U9.1 收束 | 读 `main.tsx:23/77/109/264` | ✅ `SIDEBAR_KEY` 持久化、`grid-cols` 随 `collapsed` 切换、`aria-expanded` |
| D6 降级诚实性 | `ls node_modules/pdfjs-dist` | ✅ 确未安装；`PdfViewer` 注释与 UI 均标注"降级实现 / best effort" |

**结论：plan 的 ✅ 标记基本可信，未发现虚报。**

## 三、本轮发现的问题（3 项，均为新）

### P1-A　31 项改动零提交，风险极高

工作树累积 20 改 + 9 新 + prompts 目录，横跨前后端与 5 个阶段。任何 `git checkout` / `stash` / 误操作都会一次性抹掉 B6/D1–D3/G1–G4/U2/U9 的全部成果。plan 完成记录里也自认"本批为工作树改动，**未产生提交号**"。

建议：立即按阶段分组提交（B6+G1–G4 / D1–D3+U2+D11 / U9 系列 / A7），每个提交单独可回溯。

### P1-B　已完成功能被开关默认关闭，"完成"不等于"可用"

`uiFlags.ts` 六枚开关默认全 off，且 `.env`/`.env.example` 中**无任何 `VITE_UI_*` 配置**。导致：

- U1.1–U1.4 标 ✅，但 `main.tsx:283` 的 `＋` 按钮在 `uiFlags.tasks=false` 时**不弹任务选择器**，直接新建会话——任务系统在默认配置下**不可见**。
- U2 标 ✅（U2.1–U2.5），但 `uiFlags.docPanel=false` 时右侧文档入口（`main.tsx:307`）**完全不渲染**，`DocumentExplorer` 不挂载——文档窗口与引用跳转在默认配置下**不可见**。
- U9.3 头条入口同理不渲染（这条合理，本就待定）。

矛盾点：这些后端依赖（`/api/tasks`、`/api/documents` 增量字段、`/file`）**都已在同一工作树里实现完毕**，开关却仍按"后端未就绪"的旧假设默认关闭。开关的关闭理由已失效。

建议：明确"何时开启"。若后端同批交付，则 U1/U2 应同步开启开关（或改为默认 on），否则 F9–F11、F3 等验收无法进行。

### P2-C　U9.3 的 ✅ 与"首期不做"并存，语义含混

`首期不做` 明列「外部资讯抓取与科研头条」，而 U9.3 标 ✅「占位板块已渲染」。二者并不真冲突（占位 ≠ 抓取），但同一份文档里一处"不做"、一处"✅"，容易被误读为已交付功能。建议 U9.3 状态改为 🟡 或标注"仅占位骨架"。

## 四、plan 中仍未完成、且未受本轮影响的项

- **E 阶段全部**（E1–E7）：报告入口与四模板，未开工。
- **B1–B5**：基金语料入库、元数据、领域/年份过滤，未开工（B6 已完成）。
- **D10 / D10b**：页码三方一致性校验，未做（`PdfViewer` 已标注 best effort）。
- **U9.4-2**：依赖待定设计 #12，未开工（正确）。
- **F 全部**：F1–F13 均 ⬜/🟡，真实语料验收未开始（符合预期，语料未到）。
- **G5–G9**：前端 task4 表单、会话栏徽标重构等待办。

## 五、一句话总结

**plan 的完成情况记录是准确的，前三轮审核的"缺失项"其实大多已完成——真正的问题是这些工作全部堆在未提交的工作树里，并且被默认关闭的开关锁住，所以既无提交可追溯，也无界面可验收。**

当下最该做的两件事：**① 分组提交这 31 项改动；② 决定 U1/U2 开关是否转默认开启**。文档本身（含前三轮采纳记录 #15–#41）已修得比较完整，不必再增文档。

---

## 六、追加审查（2026-09-21 22:35，plan.md × implementation.md 一致性，独立复核）

前文第二节只核了"代码是否如 plan 所说"；本节反向核"**plan 状态列是否跟上了 implementation**"，并复跑证据。

**复跑结果（本机独立执行）**：`node --test src/*.test.mts` → **15 passed / 0 fail**；`py_compile src/*.py src/agent/*.py src/prompts/*.py` → 通过。与 §1.5 声明一致。

**新发现（7 项跨文档矛盾，均已修复并登记 plan.md 第四轮采纳 #42–#49）**：

1. **G5/G7 状态过期**：implementation §1.4 记 U1.2 `SessionData.task_id`、任务选择器已实现（工作树），plan G5/G7 仍 ⬜。代码实证：`workspace.ts:8`（类型与保存/恢复管线）、`main.tsx:284`（TaskPicker 挂载）、`main.tsx:364-367`（task4 阻断发送）。→ G5 🟡、G7 ✅。
2. **阶段总览滞后**：D、G 仍 ⬜，与任务列大面积 ✅ 矛盾 → 各改 🟡（B 维持 ⬜：主目标"基金语料入库"未动）。
3. **A7 自相矛盾**：标 ✅ 却附「E 契约待补」→ 改 🟡；`grep` 实证 API.md/LLD.md 已含新契约（各 8 处命中）。
4. **U9.3 语义含混**（即前文 P2-C）：✅ 与「首期不做：科研头条」同页 → 改 🟡（仅占位骨架）。
5. **P1-B 落地为策略而非悬置**：plan 依赖说明与 ui §4 新增**开关启用策略**（转 on = 后端契约已实现 ∧ 浏览器实测通过）；tasks/docPanel 暂维持 off，随本批提交与浏览器验收开启。
6. **§6 措辞残留**：「D10 的 page→物理页映射」与 D10 重写后「无需映射」冲突 → 改「页码口径校验」。
7. **G1 行残留**「src/prompts/ 为空目录」历史陈述，与 ✅ 矛盾 → 移除。

**对前文两项建议的处置确认**：

- **P1-A（零提交）**：成立，本节不改代码、不代为提交。建议分组：① B6 + G1–G4 + `src/prompts/`（后端任务系统）；② D1–D3 + `design/` + `status.md`（契约与文档）；③ U1 + U9 系列（TaskPicker/LibraryView/uiFlags/侧栏收束）；④ U2 + D6 降级 + D11（DocumentTree/PdfViewer/citation/DocumentPanel）。每组提交前回填 implementation.md 的提交号。
- **P1-B（开关）**：不再需要"决定是否转默认开启"的开放问题——策略已定（见上），开启动作绑定到「提交 + 浏览器验收」两个事件上。
