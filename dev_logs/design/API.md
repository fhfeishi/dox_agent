# dox_agent 接口设计（API）

- 更新日期：2026-09-21
- 依据：`src/main.py`、`src/workspace.py`、路由实现的 `src/agent/routing.py` 与 `src/agent/graph.py`。
- 契约以源码为准；请求/响应类（Pydantic）与运行时 `/openapi.json` 是最终依据。

## 1. 通用约定

- 请求与响应使用 JSON；聊天使用 SSE（`text/event-stream`）。
- 前端不得依赖内部 SQLite、Chroma 或 Python 对象。
- 请求模型均 `extra="forbid"`：出现未声明字段返回 422。
- 前端静态资源由 FastAPI 托管：`GET /{asset_path:path}` 返回 `frontend/dist` 内文件，`api/` 前缀与越界路径返回 404。

## 2. 对外 HTTP 接口

| 方法 与路径 | 请求 | 成功响应 | 已实现错误 |
|---|---|---|---|
| `GET /api/health` | 无 | `status`、`app_id`（`dox-agent`）、`model`、`docs_count`、`api_key_configured`、`model_verified=false`、`web_provider`、`preparation`、`corpus_id`、`index_progress` | 不验证模型连通性 |
| `GET /api/documents` | 可选 `corpus`（H3，缺省=默认库） | 文档摘要数组；`pages` 为页数、不含正文；增 `rel_path`（相对根目录 POSIX 路径）、`status`（当前恒 `indexed`）、`meta`（占位 `{}`，B2 元数据落地前为空）；指定库未初始化时返回空数组 | 未知库 404 |
| `GET /api/documents/{doc_id}/file` | 可选 `version` | 原始 PDF/Markdown/txt 文件流（`FileResponse` 自带 Range）；`Content-Disposition` 带文件名 | 404 不存在或非本地文件/已移动；422 版本过期；415 类型不支持；413 超 200MB |
| `GET /api/tasks` | 无 | 固定任务集 `task1–task4`（`id`/`name`/`description`/`has_template`） | — |
| `GET /api/corpora` | 无 | 库列表（H1）：`id`/`name`/`kind`/`domain`/`rel_path`/`docs_count`/`preparation`/`is_default`/`index_progress`（仅默认库）/`job` | — |
| `POST /api/corpora/{corpus_id}/ingest` | 无 | 202 + 任务状态对象（H2）；导入限定该库 root 内 rglob，不跨库 | 404 库不存在；409 导入中 |
| `GET /api/official-docs` | 无 | `official_job` 状态对象 | — |
| `POST /api/official-docs` | `{sections: ["langchain","langgraph","deepagents"]}` | 202 + 任务状态 | 准备中 409；任务运行中 409 |
| `GET /api/documents/{doc_id}` | `page=1`、`start_line=1`、可选 `version`、`section=false` | 阅读证据对象 | 404 不存在；422 页/行错误或版本过期 |
| `POST /api/ingest/local` | 无 | `{imported: [...], errors: [...]}` 逐文件报告 | 准备中 409；单文件失败由报告表达 |
| `POST /api/ingest/text` | `{title, origin?, text}` | `doc_id`、`version`、`title`、`changed` | 准备中 409；422 正文非法 |
| `POST /api/web/preview` | `{url}` | `preview_id` + `Document` 正文 | 422 输入/抓取超时；502 抓取失败 |
| `POST /api/web/confirm/{preview_id}` | 无 | `doc_id`、`version`、`title`、`changed` | 409 预览过期 |
| `POST /api/chat` | 见 §3 | SSE 事件流 | 422 输入；流建立后用 `error` 事件 |
| `GET /api/workspace/{sessions\|notes}` | 无 | 记录数组；notes 附 `source_status` | 未知 kind 404 |
| `PUT /api/workspace/{sessions\|notes}/{key}` | `{title, data, revision}` | 保存后的记录（含新 `revision`） | 404 kind/key 非法；413 超 4MB；409 revision 冲突；422 笔记正文/来源非法 |

### 说明

- 网页预览只保留最近一次，重启失效；确认时使用服务端保存的正文，不接受前端替换正文。
- 导入操作共享进程内 `asyncio.Lock`；当前按单进程单用户运行，不宣称多 worker 一致性。
- 笔记写入时逐条校验来源版本：原文已更新或引用无效返回 422。笔记仅用于导航，不注入为事实来源。
- `GET /api/documents/{doc_id}/file` 的路径仅允许 `knowledge_root`/`text_root` 内的本地文件（D3 路径安全，`local_path_in_roots` 校验）；`file://`、网页与手工正文来源返回 404。自动导入官方文档现由 `AUTO_IMPORT_OFFICIAL` 配置驱动（默认开），且仅在库内无 `kind=official` 文档时触发。
- `GET /api/tasks` 为静态注册表（`src/prompts/__init__.py`）；task4（专项报告）不在 chat 生成，走 `POST /api/reports`（E1 未实现）。
- H1–H3 库管理：库 = `corpora_root`（默认 `DATA_DIR` 父目录）下含 `knowledge.sqlite3` 或 `*.pdf` 的目录；`CORPORA`（JSON 列表）可按相对路径覆盖 id/name/kind/domain；扫描只读，未初始化库不创建 sqlite。每库独立 `Knowledge` 实例（懒创建缓存），默认库复用 lifespan 实例；`POST /api/ingest/local` 现排除其他库 root。

## 3. `POST /api/chat` 契约

### 3.1 请求

```json
{
  "messages": [{"role": "user", "content": "..."}],
  "allowed_doc_ids": null,
  "task_id": "task1",
  "run_id": "hex"
}
```

| 字段 | 约束 |
|---|---|
| `messages` | 1–20 条；`role` 仅 `user`/`assistant`；每条 1–12000 字符；总计 ≤40000；最后一条必须为 `user` |
| `allowed_doc_ids` | 可空；非空时 1–20 个文档 ID；不得为空数组；未知 ID 进入澄清而非放开范围 |
| `task_id` | 可选，默认 `task1`；仅接受 `task1`/`task2`/`task3`（`Literal`，task4 或未知值 422——task4 走报告接口，不在 chat 生成） |
| `run_id` | 默认 uuid4，长度 8–80 |

禁止额外字段（包括 `sources`/`evidence`/`report`/历史版本，也不接受已移除的
`execution_mode`/`query_routing`/`evidence_level`）。每个请求独立新建图状态。

### 3.2 流式流程

```text
验证请求
→ 新建图状态（messages, rounds=0, evidence=[], searches={}, report=None, blocked=None, preparation, options）
→ understand：固定专业策略，解析允许文档范围与知识库状态
→ direct（仅知识库未就绪或范围失效时给出提示）或 research
→ research：search_docs → read_doc → finish_research；必要时 check_corpus_page
→ validate：文档存在、版本相同、正文非空、报告证据 ID 有效
→ 有未覆盖子问题且预算允许：research（仅缺口）
→ 否则 answer：有支持部分优先，缺口与排查动作简短说明
→ sources → token* → 最终 policy → done
```

### 3.3 SSE 事件

| 事件 | 数据 | 说明 |
|---|---|---|
| `status` | `{message}` | 阶段提示文案 |
| `policy` | `{allowed_doc_ids, route, stop_reason, notice}` | 理解完成发送一次，终态更新 `stop_reason` |
| `step` | `{run_id, id, sequence, phase, status, label, detail}` | 来自实际节点及 search/read 工具边界；`status` 为 running/completed/failed/interrupted |
| `telemetry` | `{path, stages_ms, searches, reads, tokens}` + `run_id` | 阶段耗时与搜索/阅读计数 |
| `sources` | 已读证据数组（附 `citation` 编号） | 回答前发送 |
| `token` | `{text}` | 正文增量 |
| `usage` | `{input_tokens, output_tokens, total_tokens, reported_tokens, calls, reported_calls, complete, missing_reasons, calls_by_phase}` + `run_id` | 供应商实际用量；缺失不估算 |
| `done` | `{ok: true}` | 正常完成；收到即结束，不等 EOF |
| `error` | `{message}` | 失败终态；不得当作成功完成 |

- 无 `done` 的断流视为未完成。
- 用户中断或网络断开时由客户端收束为"已中断/结果未确认"，保留最后收到的 `usage`，不承诺服务端最终事件。
- `task_id` 随图状态传入 `understand`/`answer`，注入 `src/prompts/` 对应任务提示词（base 硬约束 + 任务角色/输出结构）；推导许可由任务提示词覆盖全局 `answer_policy`（待定设计 #11 已定稿）。未传时默认 `task1`。

## 4. 内部模块契约

| 模块 / 入口 | 输入 → 输出 | 职责 |
|---|---|---|
| `parsers.parse_file` | 路径 → `Document` | txt/md/PDF 解析（LiteParse） |
| `parsers.parse_web` | URL → `Document` | Crawl4AI / Firecrawl 抓取 |
| `parsers.import_defaults` | `Knowledge`、`Settings` → 导入报告 | 批量导入 txt/md/PDF |
| `Knowledge.put` | `Document` → `doc_id`/`version`/`changed` | 按 `origin` 稳定标识、按正文计算版本 |
| `Knowledge.search(query, limit=6, allowed_doc_ids)` | → 定位数组 | 只定位，不输出可替代 read 的证据 |
| `Knowledge.read` / `read_section` | doc_id/page/start_line/version → 已读证据 | 版本校验并读取正文 |
| `reading.section_window` | 正文 + start_line → 章节窗口 | 章节/代码块窗口与截断标记 |
| `dense.DenseIndex.search` | query、全文窗口、候选 → dense 排名 | 本地 embedding、Chroma 同步、排名 |
| `dense.fuse_rankings` | sparse/dense 排名 → RRF 结果 | 等权、常数 60，不直接相加异量纲分数 |
| `agent.routing.resolve_policy` | 选项、`Knowledge`、preparation → policy | 固定专业策略；仅校验资料范围与知识库状态 |
| `prompts.task_instruction` / `list_tasks` | task_id → system 提示词；→ 任务注册表 | `src/prompts/`：base 硬约束 + task1–4 角色/输出契约；未知 id 抛 `UnknownTaskError`，不回退 |
| `agent.corpora.scan_corpora` / `default_corpus_id` | `Settings` → `CorpusInfo[]` / 默认库 id | 库注册表：磁盘扫描 + 配置覆盖，只读不建文件；kind 由基金文件名模式推断可被配置覆盖 |
| `agent.graph.build_graph` | `Knowledge`、`Settings`、可注入 model → compiled graph | 研究编排，与 HTTP 无关 |
| `agent.evidence` | 研究报告 → 校验/合并/决策 | ResearchReport / Assessment、路由判定 |
| `agent.usage.TurnUsage` | 模型回调 → 本轮账本 | 按 run 去重、缺失原因、最终回答预留 |
| `models.model_for` / `tracing` | `Settings` → 模型 / tracing | 统一模型协议 |
| `frontend/src/api.ts` | messages、run_id、AbortSignal、options → 事件回调 | 解析 SSE，不承担检索策略 |
| `frontend/src/conversation.ts` | Turn/Attempt 状态转换 | 纯状态机，不发起请求 |
| `frontend/src/workspace.ts` | 会话持久化与恢复 | 串行保存、revision、分支 |

### 阅读证据字段

`doc_id`、`version`、`title`、`page`、`start_line`、`next_start_line`、`text`、`origin`、`kind`、`parser`、`url`、`snippet`；`read_section` 追加 `end_line`、`heading`、`truncated`、`code_omitted`、`captured_at`。页码来自解析器，行号来自规范化阅读视图，不是 PDF 原版排版行号。

## 5. 检索子流程

```text
SQLite 当前文档 → 统一页/行窗口
  ├─ BM25Plus → sparse 排名
  └─ 配置 EMBEDDING_PATH 且未限定资料时：
       加载本地模型 → 同步新增/变化窗口到 Chroma → 清理旧窗口 → dense 排名
       两路各取 max(20, limit*3) 候选 → RRF → 最终 limit 条定位
空 EMBEDDING_PATH：仅 BM25 → 最终 limit 条定位 → 按来源分散（每文档前 2 条优先）
```

- `search` 的最终 limit 限制 1–10（`dense` 内部）。
- 指定 `allowed_doc_ids` 时只走 BM25，不把子集同步到共享 Chroma。
- Chroma 元数据只存 `chunk_id`；完整来源由同次候选快照还原。
- collection 名含模型路径、query prompt 与模型文件签名；`dox-agent-<signature>`；换模型/文件状态会换 collection，旧 collection 保留。

## 6. 静态资源与构建

- 生产：`frontend/dist` 由 `GET /{asset_path}` 托管；构建命令 `cd frontend && npm run build`（`tsc --noEmit && vite build`）。
- 开发：`vite` 端口 5173，`/api` 代理到 `http://127.0.0.1:8000`（`frontend/vite.config.ts`）。
