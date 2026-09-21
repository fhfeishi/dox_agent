# dox_agent

面向国家自然科学基金、省重点、省重大、面上项目等科研项目历史报告的**本地、单用户** Agentic RAG 系统。提供带来源的专业问答、专项报告生成，以及本地目录浏览与 PDF 原文阅读。

- 需求与范围：[`dev_logs/demand.md`](dev_logs/demand.md)
- 接口与实现设计：[`dev_logs/design/`](dev_logs/design/README.md)（HLD / API / LLD）
- 任务计划与完成记录：[`dev_logs/plan/plan.md`](dev_logs/plan/plan.md)
- 当前开发情况：[`dev_logs/status.md`](dev_logs/status.md)

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/` | 后端：FastAPI + LangGraph / Deep Agents，入口 `src/main.py` |
| `frontend/` | 前端：React 19 + TypeScript + Tailwind 4 + Vite，生产构建输出 `frontend/dist/` |
| `tests/` | 后端回归测试（pytest） |
| `knowledge/` | 本地资料与派生数据，见下 |
| `dev_logs/` | 开发文档（需求、设计、计划、状态、历史归档） |
| `launch.sh` | 启动脚本：准备环境、安装依赖、构建前端、启动服务 |
| `pyproject.toml` | Python 依赖与 extras（`web` / `embedding` / `dev`） |

## `knowledge/`：本地资料与数据

| 目录 | 说明 |
|---|---|
| `knowledge/nf/` | 本地自然科学基金报告原文（PDF / Markdown），作为问答与报告的语料 |
| `knowledge/database/` | 基金报告数据库（SQLite） |
| `knowledge/vectordb/` | 基金报告向量库 |
| `knowledge/lcdata/` | 演示用 LangChain 语料数据（`knowledge.sqlite3`、`workspace.sqlite3`、`chroma/`） |

> **配置映射（当前实现）**：后端把 SQLite 原文库与会话库、以及 Chroma 向量索引统一放在 `DATA_DIR` 下（Chroma 固定为 `DATA_DIR/chroma`）。`database/`、`vectordb/` 目前是整理后的目标位置，尚未与 `DATA_DIR` 拆分为两个独立配置项。语料方面，`POST /api/ingest/local` 读取 `TEXT_ROOT` 下的 `.txt`/`.md`，以及 `KNOWLEDGE_ROOT` 下递归的全部 `.pdf`。

> **当前演示配置**：仓库内 `.env` 把 `DATA_DIR` 指向 `knowledge/lcdata`，并设 `QUERY_ROUTING=knowledge_only`；启动后直接用该 LangChain 语料做带引用的问答，无需重新导入。切换到基金报告时改回 `DATA_DIR`/`KNOWLEDGE_ROOT` 即可。

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
| `DATA_DIR` | `<repo>/data` | SQLite（原文/版本、会话）与 Chroma 向量索引目录 |
| `KNOWLEDGE_ROOT` | `<repo>/../knowledge` | 本地资料根目录；`ingest/local` 从此递归导入 PDF |
| `TEXT_ROOT` | `<KNOWLEDGE_ROOT>/project_progress/texts/v4` | `ingest/local` 导入 txt/md 的目录 |
| `EMBEDDING_PATH` | 空 | 本地 embedding 模型目录；空 = 仅 BM25，不加载 embedding |
| `EMBEDDING_DEVICE` | `cpu` | embedding 设备 |
| `WEB_PROVIDER` | `crawl4ai` | 网页抓取器（`crawl4ai` / `firecrawl`） |
| `MAX_SEARCHES` / `MAX_READS` / `MAX_MODEL_CALLS` / `RUN_TIMEOUT` | `6` / `8` / `12` / `180` | 有界研究流程的预算 |

## 主要接口

| 接口 | 说明 |
|---|---|
| `GET /api/health` | 服务状态、模型、文档数、初始化进度 |
| `GET /api/documents`、`GET /api/documents/{doc_id}` | 文档摘要；按 `page`/`start_line`/`version` 读取原文（`section=true` 走章节窗口） |
| `POST /api/ingest/local`、`POST /api/ingest/text` | 导入本地 txt/md/PDF；手工补充正文 |
| `GET\|POST /api/official-docs` | 官方 Markdown 分区发现与批量更新 |
| `POST /api/web/preview`、`POST /api/web/confirm/{preview_id}` | 网页抓取预览与确认入库 |
| `POST /api/chat` | SSE 流式问答 |
| `GET /api/workspace/{sessions\|notes}`、`PUT /api/workspace/{sessions\|notes}/{key}` | 会话与笔记读写 |

完整契约（字段、SSE 事件、错误语义）见 [`dev_logs/design/API.md`](dev_logs/design/API.md)。

## 测试

```bash
.venv/bin/python -m pytest tests -q
```
