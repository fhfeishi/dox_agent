# dox_agent — 项目说明

- 最近核对：2026-09-22。
- 权威来源：需求 [`demand.md`](archive/demand.md)；现状 [`status.md`](archive/status.md)；计划 [`plan/plan.md`](archive/plan/plan.md)；完成证据 [`plan/implementation.md`](archive/plan/implementation.md)；契约 [`design/`](archive/design/README.md)。

## 目标与范围

**目标**：面向国家自然科学基金、省重点/省重大、面上项目等科研项目历史报告的**本地、单用户** Agentic RAG 系统。基于本地报告语料提供带来源的专业问答、专项报告生成，以及本地目录浏览与 PDF 原文阅读。

**有效要求与来源**：
- 需求基线 [`demand.md`](archive/demand.md)：§1 定位与范围、§3 问答、§4 报告、§5 文档窗口、§6 目标接口、§8.2 首期不做、§9.3 任务系统、§9.5 侧栏与文献库、§9.6 模型展示、§10 知识库管理与选择。
- 交互与任务拆解 [`plan/plan.md`](archive/plan/plan.md) 设计指南；界面拆解 [`plan/ui_optimization.md`](archive/plan/ui_optimization.md)；知识库规划 [`plan/corpus_management.md`](archive/plan/corpus_management.md)。

**当前达成情况**（已验证者见 [`plan/implementation.md`](archive/plan/implementation.md)）：
- 已实现并验证：工程基线（A1–A6）、专业问答入口收敛（C1–C3/C5）、任务系统后端（G1–G4）、文档窗口后端（D1–D3）、知识库注册与选择后端（H1–H3）、前端 UI 基础与任务/文档/状态（U0/U5–U8/U9.1/U9.2/U9.4-1/D11）。
- 代码已提交、验收未做：按库问答契约（H4 `e7d08e2`、H8 `67d0ff0`）。
- 未完成：基金元数据与领域/年份过滤（B2/B4/B5）、统一报告入口（E）、真实基金样本验收（F/H10）、模型可用性判定（待定 #12）。
- 各阶段状态以 [`plan/plan.md`](archive/plan/plan.md) 为准；状态与本文冲突时先核对提交与实测证据。

**范围内**：带引用专业问答；每会话绑定任务（task1–4）；本地文档浏览/预览/引用跳页；知识库隔离与选择；专项报告；单用户本地部署。

**范围外**（[`demand.md`](archive/demand.md) §8.2）：多租户/权限后台、多 Agent 协作、知识图谱、工作流画布、独立问题分类服务、材料遵循等级系统、自动全网研究、自动订阅同步、外部资讯抓取与科研头条、多模型路由与模型管理后台、模板管理平台、分布式任务队列。

**关键限制与待确认**：
- 当前演示语料为 LangChain 技术文档（`.demo_langchain/`），**不是基金报告**；真实基金语料在 `.knowledge/自然科学基金/` 但尚未接入后端配置。
- 待定设计（[`plan/plan.md`](archive/plan/plan.md)）：#10 报告↔会话绑定、#11 任务推导许可、#12 模型可用性判定来源；未定稿前不开工对应任务。
- `pdfjs-dist` 因环境限制未安装，PDF 预览为浏览器原生渲染（D6 降级）。

## 当前结构与主流程

| 组件 | 职责与边界 | 位置 |
|---|---|---|
| 后端 API | HTTP 校验、生命周期、SSE、静态资源托管 | `src/main.py` |
| Agent / 检索 | `understand → research/direct → validate → answer`；BM25Plus + 可选 dense/RRF | `src/agent/`、`src/knowledge.py`、`src/dense.py` |
| 解析与导入 | 本地 txt/md/PDF（LiteParse）、官方 Markdown、网页快照 | `src/parsers.py`、`src/official_docs.py` |
| 知识库注册 | 磁盘扫描 + `CORPORA` 覆盖；每库独立 `Knowledge` | `src/agent/corpora.py` |
| 任务提示词 | `base.md` 硬约束 + task1–4 角色/输出契约 + 加载器 | `src/prompts/` |
| 前端 | 会话/分支、任务、资料范围、文档窗口、设置与状态 | `frontend/src/` |
| 本地数据 | 原始语料 `.knowledge/`、派生数据 `.data/`、演示 `.demo_langchain/` | 仓库 `README.md` |
| 开发文档 | 需求/设计/计划/状态/归档 | `.logsdev/` |

**主流程**：浏览器 → `POST /api/chat`（SSE）→ 服务端按 `task_id` 与本轮资料范围检索、阅读、版本核验 → 事件流（`status`/`policy`/`step`/`sources`/`token`/`usage`/`done`/`error`）→ 前端渲染带 `[n]` 引用的回答。系统边界、模块与状态机见 [`design/HLD.md`](archive/design/HLD.md)。

**关键失败与恢复**：知识库未就绪/失败 → 主界面可见提示、查证暂不可用；模型密钥未配置 → 不可发送并提示；流中断 → 前端收束为"已中断（结果未确认）"；保存 revision 冲突 → 409 且保留本地内容。

## 行为契约

- API / SSE / 错误语义：[`design/API.md`](archive/design/API.md)（单一权威，本文不复制字段）。
- UI / 任务交互：[`plan/plan.md`](archive/plan/plan.md) 设计指南 §2–§4。
- 数据模型与状态机：[`design/LLD.md`](archive/design/LLD.md)。
- 数据布局与配置：仓库 `README.md`、[`DECISIONS.md`](DECISIONS.md)。

## 质量约束与验证入口

| 约束 | 可观察标准 | 验证入口 |
|---|---|---|
| 事实可追溯 | 关键结论带 `[n]` 引用且能打开原文 | 真实问答/报告抽查 |
| 有界执行 | 搜索/阅读/模型调用/超时在预算内 | `MAX_SEARCHES`/`MAX_READS`/`MAX_MODEL_CALLS`/`RUN_TIMEOUT` |
| 回归 | 后端 `pytest`、前端 `node --test`、`npm run build` 通过 | [`plan/implementation.md`](archive/plan/implementation.md) |
| 语料隔离 | 引用仅来自当前库 | H10 验收 |
| 状态可辨认 | 未就绪/失败/停止/恢复在主界面可见 | demand §8.2、F7/F13 |

**当前实现限制**：基金元数据与领域/年份过滤未实现；报告入口未实现；模型可用性无判定信号（`model_verified` 恒 `False`）；D10 页码一致性未校验；演示语料仍是技术文档。

**运行与验证**：仓库 `README.md` 的「运行」「测试」；`launch.sh` 完成环境与启动。

**相关关键决策**：[`DECISIONS.md`](DECISIONS.md)。
