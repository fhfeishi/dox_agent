# dox_agent



-----
## 2026-09-22 1111 提出更新

| 文件 | 用途与选用条件 |
|---|---|
| [AGENTS.md](AGENTS.md) | 稳定工作原则与任务路由，接入时合并已有指引 |
| [.logsdev/README.md](.logsdev/README.md) | 项目记录入口与维护约定（信息归属、证据、接续、交付；含可选协作） |
| [.logsdev/PROJECT.md](.logsdev/PROJECT.md) | 长期项目的稳定说明；已有等价文档时直接使用 |
| [.logsdev/ITERATION.md](.logsdev/ITERATION.md) | 需要接续的当前工作，不要求按迭代运行 |
| [.logsdev/DECISIONS.md](.logsdev/DECISIONS.md) | 出现值得长期追溯的取舍时采用 |
| [.agents/rules/documentation.md](.agents/rules/documentation.md) | 按用途组织文档、审查与建议 |
| [.agents/rules/testing-and-code.md](.agents/rules/testing-and-code.md) | 按验证目标选择实现检查与测试方式 |

-----



面向国家自然科学基金、省重点、省重大、面上项目等科研项目历史报告的**本地、单用户** Agentic RAG 系统。提供带来源的专业问答、专项报告生成，以及本地目录浏览与 PDF 原文阅读。






- 项目说明（目标/范围/结构/契约）：[`.logsdev/PROJECT.md`](.logsdev/PROJECT.md)
- 当前工作（进度/未决/下一步）：[`.logsdev/ITERATION.md`](.logsdev/ITERATION.md)
- 关键决策：[`.logsdev/DECISIONS.md`](.logsdev/DECISIONS.md)

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/` | 后端：FastAPI + LangGraph / Deep Agents，入口 `src/main.py` |
| `frontend/` | 前端：React 19 + TypeScript + Tailwind 4 + Vite，生产构建输出 `frontend/dist/` |
| `tests/` | 后端回归测试（pytest） |
| `.logsdev/` | 开发文档（PROJECT / ITERATION / DECISIONS） |
| `.knowledge/` | 本地语料与状态（方案 A 自包含库 + `.state/`），见「本地数据布局」 |
| `launch.sh` | 启动脚本：准备环境、安装依赖、构建前端、启动服务 |
| `pyproject.toml` | Python 依赖与 extras（`web` / `embedding` / `dev`） |

## 本地数据布局

每个知识库 = 一个**自包含目录**（方案 A），固定分为 `source/`（原始文件）、`datadb/`（SQLite）、`vectordb/`（向量库）三部分，便于整库备份/迁移/删除。

| 路径 | 说明 |
|---|---|
| `.knowledge/` | 语料根（`CORPORA_ROOT`）：其下每个直接子目录 = 一个自包含知识库 |
| `.knowledge/<库>/source/` | 该库原始文件（PDF / Markdown，可按领域再分子目录） |
| `.knowledge/<库>/datadb/` | 该库 SQLite：`knowledge.sqlite3`（原文/版本） |
| `.knowledge/<库>/vectordb/` | 该库向量索引（Chroma） |
| `.knowledge/demo_langchain/` | 演示库（原 `.demo_langchain/`），同一 `source/` + `datadb/` + `vectordb/` 约定 |
| `.knowledge/.state/` | 应用级七库：`workspace.sqlite3`（会话/笔记）、`reports.sqlite3`（报告）、`runs.sqlite3`（运行快照）、`artifacts.sqlite3`（成果）、`custom_tasks.sqlite3`（自定义任务）、`custom_templates.sqlite3`（自定义模板）、`web_snapshots.sqlite3`（网页快照）；`corpora.json` 保存显示名覆盖。七库按 §16.17 的成组备份契约一起备份与恢复 |

> `.knowledge/` 数据默认不入库（见 `.gitignore`），只保留 `README.md`。

> **配置映射（§10）**：所有本地持久化只在 `CORPORA_ROOT`（默认 `.knowledge`）下；每个直接子目录 = 一个自包含库。新对话与省略范围的旧 API 按实际一级子目录名字典序选首库；`DEFAULT_CORPUS` 仅为旧配置兼容读取，不影响选择。`DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT`/`TEXT_ROOT` 已废弃（启动时忽略）。

> **当前演示语料**：`demo_langchain`（启动时自动从旧 `.demo_langchain/` 迁移并重写文件型 origin）。系统不设持久默认库；新对话使用按实际目录名排序的首个知识库，`DEFAULT_CORPUS` 不改变顺序。

## 运行

前置：Python 3.12、[uv](https://docs.astral.sh/uv/)、Node.js + npm。

```bash
cp .env.example .env   # 填入 MODEL_API_KEY 等
bash launch.sh
```

`launch.sh` 的流程：复用或创建 `.venv` → `uv pip install -e ".[web]"`（`EMBEDDING_PATH` 非空时再装 `.[embedding]`）→ 前端未构建时执行 `npm ci && npm run build` → 启动 `uvicorn src.main:app`。

- 默认地址：<http://127.0.0.1:8000>
- CPU 环境安装 PyTorch 时建议设置 `UV_TORCH_BACKEND=cpu`，避免拉取 CUDA 运行时。

依赖 extras：

| extra | 内容 |
|---|---|
| `web` | Crawl4AI 网页抓取 |
| `embedding` | 本地 HuggingFace embedding + Chroma；需 `EMBEDDING_PATH` 指向含 `config.json` 的模型目录 |
| `dev` | pytest、ruff |

前端开发：`cd frontend && npm run dev`。

## 配置（`.env`）

以 [`.env.example`](.env.example) 为模板；`dox_agent/.env` 会覆盖仓库上一级的 `.env`。常用变量：

| 变量 | 默认 | 用途 |
|---|---|---|
| `MODEL_NAME` / `MODEL_BASE_URL` / `MODEL_API_KEY` | `deepseek-chat` / `https://api.deepseek.com` / 空 | 问答模型（OpenAI 兼容） |
| `CORPORA_ROOT` | `<repo>/.knowledge` | 语料根：每个直接子目录 = 一个自包含知识库（`source/`+`datadb/`+`vectordb/`） |
| `STATE_DIR` | `<CORPORA_ROOT>/.state` | 应用级状态目录（会话/报告/显示名覆盖）；默认随 `CORPORA_ROOT` 派生 |
| `DEFAULT_CORPUS` | `demo_langchain` | 已弃用；兼容读取但不影响首库顺序 |
| `EMBEDDING_PATH` | 空 | 本地 embedding 模型目录；空 = 仅 BM25，不加载 embedding |
| `EMBEDDING_DEVICE` | `cpu` | embedding 设备 |
| `MINERU_CMD` / `MINERU_HOME` | `mineru-kit parse … --tier standard --format middle_json` / 模型缓存目录 | PDF 解析（mineru 4.0.5，K13）；`MINERU_CMD` 支持 `{pdf}`/`{out}` 模板 |
| `WEB_PROVIDER` | `crawl4ai` | 网页抓取器（`crawl4ai` / `firecrawl`） |
| `MAX_SEARCHES` / `MAX_READS` / `MAX_MODEL_CALLS` / `RUN_TIMEOUT` | `6` / `8` / `12` / `180` | 有界研究流程的预算 |

> 仅列常用变量；完整配置见 [.logsdev/PROJECT.md](.logsdev/PROJECT.md) §6。

## 主要接口

> 仅列常用接口；完整契约（字段、错误语义、SSE）见 [.logsdev/PROJECT.md](.logsdev/PROJECT.md) §4。

| 接口 | 说明 |
|---|---|
| `GET /api/health` | 服务状态、模型、文档数、初始化进度、当前库 |
| `GET /api/documents?corpus=`、`GET /api/documents/{doc_id}?corpus=` | 文档摘要（可选按库）；按 `page`/`start_line`/`version` 读取原文（`section=true` 走章节窗口） |
| `GET /api/documents/{doc_id}/file?corpus=` | 原始 PDF/Markdown/txt 文件流（浏览器阅读器） |
| `GET /api/tasks` | 任务列表 task1–4 |
| `GET\|POST\|PATCH\|DELETE /api/corpora...` | 知识库列表/新建/重命名/删除；`/{id}/files` 文件列表/上传/重命名/删除；`/{id}/ingest` 按库导入 |
| `POST /api/ingest/local`、`POST /api/ingest/text` | 导入本地 txt/md/pdf/docx；手工补充正文 |
| `GET\|POST /api/official-docs` | 官方 Markdown 分区发现与批量更新 |
| `POST /api/web/preview`、`POST /api/web/confirm/{preview_id}` | 网页抓取预览与确认入库 |
| `POST /api/chat` | SSE 流式问答 |
| `GET /api/workspace/{sessions\|notes}`、`PUT /api/workspace/{sessions\|notes}/{key}` | 会话与笔记读写 |

完整契约（字段、SSE 事件、错误语义）见 [`.logsdev/PROJECT.md`](.logsdev/PROJECT.md) §4「行为契约」。

## 测试

```bash
.venv/bin/python -m pytest tests -q
```
