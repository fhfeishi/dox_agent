# dox_agent 实现细节（LLD）

- 更新日期：2026-09-21
- 依据：`src/knowledge.py`、`src/workspace.py`、`src/agent/{graph,routing,evidence,quick,usage,config}.py`、`src/dense.py`、`src/reading.py`、`frontend/src/*`。
- 系统边界见 [`HLD.md`](HLD.md)，接口契约见 [`API.md`](API.md)。

## 1. 数据模型

### 1.1 知识库 SQLite（`data/knowledge.sqlite3`）

表 `docs(id TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT NOT NULL)`：

- `id = sha256(origin)[:20]`，来源相同即同一文档，更新即替换正文。
- `version = sha256(pages JSON)[:20]`，正文变化即换版本。
- `payload = Document` JSON：`title`、`origin`、`kind`、`parser`、`pages[{number,text}]`、`captured_at`。
- 引用携带 version；读取不匹配版本报错，不悄悄引用新正文。
- 健康检查用 `COUNT(*)`，不反序列化整库正文。

### 1.2 工作区 SQLite（`data/workspace.sqlite3`）

表 `records(id TEXT PRIMARY KEY, kind TEXT, revision INTEGER, payload TEXT)`：

- `kind ∈ {sessions, notes}`；`payload` 含 `title`、`data`、`revision`、`updated_at`（UTC）。
- 保存时 `BEGIN IMMEDIATE` 校验 revision：旧记录 revision/kind 不匹配或新增记录 revision≠0 → 409，不覆盖。
- 单记录序列化后 >4MB → 413。
- 笔记 `data` 约束：`body` 字符串 ≤20000、`reviewed` 布尔、`sources` 1–6 条且逐条版本可读，否则 422。

### 1.3 阅读行窗口

- `lines_for` 把超长行按 300 字符切段，存储层不变；行号是规范化视图行号。
- `reading.section_window` 按标题与代码围栏划块，保留旧坐标并返回 `start_line`/`end_line`/`next_start_line`/`heading`/`truncated`/`code_omitted`；超预算或未闭合代码明确省略，不制造完整代码。

## 2. Agent 状态与图

### 2.1 LangGraph State 字段

`messages`、`evidence`、`rounds`、`answer`、`searches`、`report`、`blocked`、`stop_reason`、`new_evidence`、`options`、`policy`、`execution_path`、`telemetry`、`preparation`、`runtime_usage`。

### 2.2 节点

- `understand`：`resolve_policy` 生成 policy，发送 `policy` 事件。
- `direct`：不检索；有 notice 直接回显，否则模型自然回答，不生成引用。
- `research`：见 §2.3；可选快速查证。
- `validate`：确定性溯源核验 + `validate_report` / `preserve_blocked_report` / `decide`。
- `answer`：组织带引用回答；无证据或 blocked 无证据走固定提示。
- `finish`：发送最终 `policy`。

边：`START → understand`；`understand → research|direct`；`research → validate`；`validate → research|answer`；`answer/direct → finish → END`。recursion_limit 12。

每个节点由 `measured` 包装：记录阶段耗时、发送 `telemetry`，异常时把当前步骤标 failed。

### 2.3 research 节点

- 每个请求维护 `searches`（规范化查询 → 定位结果）与 `evidence` 列表（带 `evidence_id = sha256(doc_id/page/start_line/version)[:16]`）。
- 业务工具（默认 `EVIDENCE_ROUTING=true`）：
  - `search_docs`：命中缓存则复用；超过 `MAX_SEARCHES` 返回预算提示。
  - `read_doc`：先搜索后读；范围外、版本不符、超 `MAX_READS` 拒绝；同片段复用。
  - `check_corpus_page`：仅接受用户消息或已读正文中出现的 `docs.langchain.com` URL，核对本地 origin；确认缺页时置 `blocked` 并抛 `CorpusBlocked`。
  - `finish_research`：`return_direct`，接收 `ResearchReport` 并结束内层 Agent。
- 快速查证：`quick_verification && evidence_routing && 第 1 轮 && use_quick(state)` 时先走一次有界查证（最多 2 段阅读，15s）；全 supported 直接返回，否则带已有证据升级为完整研究。
- 异常收束：`GraphRecursionError`、研究超时、模型预算超限均保留已读证据继续。

### 2.4 证据交接契约（`agent/evidence.py`）

`Assessment`：`question`(≤500)、`status ∈ supported/partial/unsupported/conflicting`、`evidence_ids`(≤6)、`gap ∈ none/corpus_missing/retrieval/reading/coverage/output/conditions/conflict/unknown`、`next_action ∈ answer/search/read/clarify/stop`、`detail`(≤600)。`ResearchReport`：`answer_mode ∈ consultation/audit`、`assessments` 1–8 条。

- `validate_report`：剔除无效 evidence_id；supported/partial 缺有效引用降级为 unsupported；模型自报 `corpus_missing` 在无目录核验时改为 unknown；`output → answer`、`conditions → clarify`。
- `merge_reports`：补查不得删除旧未解决子问题；合并后 >8 项判交接失败。
- `decide` 顺序：blocked → handoff_missing → covered → round_limit → no_progress → read_limit → repair → search_limit / partial_or_clarify。

## 3. 路由与策略（`agent/routing.py`）

- `TurnOptions`：`execution_mode`(auto/quick/research)、`query_routing`(auto/knowledge_only)、`evidence_level`(low/middle/high)、`allowed_doc_ids`(1–20 或 null)。
- `Intent`：`route`(direct/research/clarify)、`intent`(social/general/analysis/document/specific/follow_up/unclear)、`source_reference`、`source_required`、`source_only`。
- `classify`：问候确定性短路径；否则模型返回 JSON，超时 8s；坏 JSON/超时回退 research，provider 异常回退 clarify，预算异常上抛。
- `resolve_policy`：`knowledge_only` 且无资料指代时跳过分类；解析资料标题/URL 必须出现在用户消息中且唯一对应；允许 ID 在进入研究前校验；范围冲突澄清；`high` 非社交问题强制 research；preparation 非 ready 时研究路径给出不可用提示。
- `answer_policy`：严格模式（knowledge_only / 限定资料 / high）只依据本轮已读资料；`low` 可用一般知识但不得编造具体 API/版本/来源。

## 4. 预算与限制（`agent/config.py` + `.env.example`）

| 配置 | 默认 | 范围/说明 |
|---|---|---|
| `MODEL_NAME` / `MODEL_BASE_URL` / `MODEL_API_KEY` | deepseek-chat / api.deepseek.com / 空 | 兼容 `DEEPSEEK_*` |
| `DATA_DIR` | `<repo>/data` | — |
| `EMBEDDING_PATH` | 空 | 空则仅 BM25；须指向含 `config.json` 的模型目录 |
| `EMBEDDING_DEVICE` / `EMBEDDING_QUERY_PROMPT` | cpu / 空 | — |
| `KNOWLEDGE_ROOT` / `TEXT_ROOT` | `<repo 上级>/knowledge` / 其下 `project_progress/texts/v4` | — |
| `WEB_PROVIDER` / `WEB_SESSIONS_FILE` / `FIRECRAWL_*` | crawl4ai / 空 | crawl4ai 或 firecrawl |
| `PDF_OCR` / `PDF_OCR_LANGUAGE` | true / eng | LiteParse |
| `MAX_RESEARCH_STEPS` | 24 | 4–100，内层 Agent recursion_limit |
| `MAX_ROUNDS` | 2 | 1–3 |
| `QUICK_VERIFICATION` | true | — |
| `EVIDENCE_ROUTING` | true | false 走旧两工具路由 |
| `QUERY_ROUTING` / `EVIDENCE_LEVEL` | auto / middle | 服务默认 |
| `MAX_SEARCHES` / `MAX_READS` | 6 / 8 | 1–20 / 2–20，全 run 共享 |
| `MAX_MODEL_CALLS` | 12 | 3–40，最终回答预留 |
| `RESEARCH_TIMEOUT` / `RUN_TIMEOUT` | 120 / 180 秒 | 研究内层 / 整轮 |
| `LANGSMITH_TRACING` / `LANGSMITH_API_KEY` / `LANGSMITH_PROJECT` | false / 空 / dox-agent | — |

`TurnUsage`：按 `run_id` 记录每次模型调用；`answer`/`direct` 阶段预留最后一次调用；用量缺失记 `waiting_for_provider` / `provider_did_not_report` / `model_error`；`complete` 仅在全部已知时为 true，缺失不估算、不以 0 替代。

## 5. 错误语义

- 请求校验失败：HTTP 422（额外字段、角色、长度、总数等）。
- 准备中写入：`official-docs`、`ingest/local`、`ingest/text`、`web/confirm` 返回 409。
- 官方任务已运行再次启动：409。
- 流建立后失败：SSE `error`，不发送 `done`；若已有 policy 先更新 `stop_reason`（`invalid_request`/`timed_out`/`failed`）。
- 工作区保存冲突：409；超限：413。
- 文档读取：404 不存在；422 页码/行号错误或版本过期。

## 6. 前端实现

- `api.ts`：`streamChat` 支持 `(messages, signal, receive, options)` 与带 `runId` 的重载；按 `\n\n` 分帧，`done` 为终止事件并立即释放 reader；`error` 事件抛错。
- `conversation.ts`：`Attempt`（runId、steps、telemetry、usage、options、policy、answer、sources、complete、outcome、耗时）与 `Turn`（question、requestMessages、previousAttempts）；`receiveEvent` 纯转换；终态不可被后续事件修改；`regenerateTurn` 从 policy 提取生效选项；`branchFromTurn` 生成编辑分支历史。
- `workspace.ts`：`useWorkspace` 恢复/保存会话，串行保存链，`localStorage["dox-agent-session"]` 记录当前会话，500ms 防抖保存，revision 冲突提示；分支记录 `source_session_id`/`source_turn_index`。
- `main.tsx`：健康轮询（3s，单请求 5s 超时）、发送门禁、设置（回答范围/证据要求/查证方式/资料范围）、会话管理、导出 `dox-agent-comparison.json`、侧栏标识 `DOX_AGENT / 01`。
- `Answer.tsx`：Markdown、复制、重新生成、步骤过程、耗时（首 token/总时间）、token 用量与阶段耗时。
- `Notes.tsx`：领域笔记草稿/确认/来源版本状态与导航；**当前未挂载到 `main.tsx`**。
- `KnowledgePanel.tsx` / `OfficialDocs.tsx` / `SourceManager.tsx`：导入、网页预览入库、官方更新、资料范围与正文补充。

## 7. 构建与测试

- 前端构建脚本：`frontend/package.json` → `build: tsc --noEmit && vite build`；测试文件 `api.test.mts`、`conversation.test.mts`（`node:test`，被 tsconfig exclude）。
- 后端 `src/cli.py`：`ingest` / `search` / `preview` / `ask` 本地验证入口。
- `src/evaluate.py`：针对版本化 fixtures 的检索评估（来源召回、证据召回、MRR），只评估检索与版本化阅读，不代表答案质量。
- `src/prepare_docs.py`：启动前预下载官方文档并落盘报告 `data/official-preparation.json`。
- **运行与测试状态**：`pyproject.toml` 与后端 `tests/` 已补齐（A1/A2），`.venv` 已装依赖，后端可运行、可跑测（A3 端到端已验证）；剩余 A7 契约同步见 [`../plan/plan.md`](../plan/plan.md)。
