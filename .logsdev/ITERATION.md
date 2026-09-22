# 当前工作 — dox_agent

- 更新时间：2026-09-22。
- 长期说明见 [`PROJECT.md`](PROJECT.md)；需求 [`demand.md`](archive/demand.md)；现状 [`status.md`](archive/status.md)；计划与证据 [`plan/plan.md`](archive/plan/plan.md) / [`plan/implementation.md`](archive/plan/implementation.md)。

## 当前目标与必要约束

- 目标：在正式基金语料接入前，完成可独立验证的工程与界面部分——（1）仓库文档/数据布局对齐（本轮已完成）；（2）前端 U1/U2/U9 与后端 G/H 的契约落地并做**浏览器验收**，使"已完成"变为"默认可用"。
- 必要约束：
  - `ChatRequest` 为 `extra="forbid"`：后端未就绪字段不得发送（`task_id` 已就绪；`filters`、`corpus_id`、报告相关未就绪）。
  - 功能开关（`uiFlags.ts`）默认关闭；转 on 需同时满足"后端契约已实现 ∧ 浏览器实测通过"。
  - 不引入 [`demand.md`](archive/demand.md) §8.2 首期不做项。

## 已完成内容及依据

| 批次 | 内容 | 依据 |
|---|---|---|
| 2026-09-22（工作树） | 文档/数据布局对齐：`dev_logs/` → `.logsdev/`；演示语料 → `.demo_langchain/{langchain_dox,langchain_vectordb,langchain_datadb}`；新增 `VECTORDB_DIR`；过程审查文件归档 | `git status` 重命名；`py_compile` 通过；`pytest tests -q` → 64 passed；`get_settings()` 解析新路径；见 [`plan/implementation.md`](archive/plan/implementation.md) §1.5、[`DECISIONS.md`](DECISIONS.md) |
| `761c96d` | B6 语料硬编码清理；G1–G4 任务系统后端；D1–D3 文档接口；H1–H3 知识库注册 | [`plan/implementation.md`](archive/plan/implementation.md) §1.2–1.4、1.6 |
| `ce3b4e7` | U6/U8 电源按钮与 LLM 状态；U7 知识库正文预览（`DocumentPanel`/`documentPreview`） | 同上，含离线浏览器脚本 PASS |
| `9a0c899` | U5 会话内分支（`branches.ts` + 测试） | `node --test` 15 passed；`browser_session_branches.py` PASS |
| `e400279` | U1/U2/U9/D11、H5–H7 前端（开关内实现） | `tsc --noEmit` 无新错误；`node --test` 18 passed |
| `e7d08e2` / `67d0ff0` | H4 chat `corpus_id`；H8 会话绑库（`VITE_UI_CORPUS`） | 提交与代码在位；浏览器验收未做 |

> 完整逐项证据与"未运行/受限"清单见 [`plan/implementation.md`](archive/plan/implementation.md) §1、§2。

## 未决问题与下一步

| 未决 | 影响 | 下一步 |
|---|---|---|
| 功能开关默认 off，U1/U2/H8 界面默认不可见 | "完成 ≠ 可用" | 逐枚开关：后端契约已实现 ∧ 浏览器实测通过后转 on（tasks/docPanel/corpus） |
| D10 页码三方一致性未校验；U2 浏览器验收未做 | 引用跳页可信度 | 补 D10 回归测试 + U2 浏览器验收，再开 `VITE_UI_DOC_PANEL` |
| D6 `pdfjs-dist` 未装（Windows×WSL 符号链接冲突） | PDF 缩放能力受限 | 换装后仅替换 `PdfViewer` 内部实现 |
| B2/B4/B5 基金元数据与领域/年份过滤未做 | 报告与过滤缺依据 | 先做 H9（文件名元数据入服务端）→ B2/B4/B5；H4/H8 契约已可配合 |
| E 报告入口未做；#10 报告↔会话绑定未定 | task4（U3/G9）无法开工 | 定稿 #10 后实现 E1/E2 |
| #12 模型可用性判定缺失（`model_verified` 恒 `False`） | F11/U9.4-2 不可验收 | 定 health 探测口径或新增轻量模型探测接口 |
| 旧 `knowledge/`（`nf`/`database`/`vectordb`）未按新布局迁移；`.knowledge/`/`.data/` 未接入配置 | 数据位置与配置不一致 | 按 `.knowledge/`/`.data/` 约定迁移并接入 `DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT` |
