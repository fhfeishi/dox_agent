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






- 需求与范围：[`.logsdev/demand.md`](.logsdev/demand.md)
- 接口与实现设计：[`.logsdev/design/`](.logsdev/design/README.md)（HLD / API / LLD）
- 任务计划与完成记录：[`.logsdev/plan/plan.md`](.logsdev/plan/plan.md)
- 当前开发情况：[`.logsdev/status.md`](.logsdev/status.md)

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/` | 后端：FastAPI + LangGraph / Deep Agents，入口 `src/main.py` |
| `frontend/` | 前端：React 19 + TypeScript + Tailwind 4 + Vite，生产构建输出 `frontend/dist/` |
| `tests/` | 后端回归测试（pytest） |
| `.logsdev/` | 开发文档（需求、设计、计划、状态、历史归档） |
| `.knowledge/` `.data/` `.demo_langchain/` | 本地语料与派生数据，见「本地数据布局」 |
| `launch.sh` | 启动脚本：准备环境、安装依赖、构建前端、启动服务 |
| `pyproject.toml` | Python 依赖与 extras（`web` / `embedding` / `dev`） |

## 本地数据布局

| 路径 | 说明 |
|---|---|
| `.knowledge/` | 原始语料（基金报告 PDF / Markdown）；各子目录对应一个知识库 |
| `.data/` | 与知识库配套的数据库与向量库 |
| `.demo_langchain/` | 演示用 LangChain 语料：`langchain_dox/`（原始文档，当前为空，说明见其 README）、`langchain_vectordb/`（Chroma）、`langchain_datadb/`（`knowledge.sqlite3`/`workspace.sqlite3`） |

> `.knowledge/`、`.data/`、`.demo_langchain/` 的数据目录默认不入库（见 `.gitignore`），只保留各自 `README.md`。

> **配置映射（当前实现）**：SQLite 原文库与会话库放在 `DATA_DIR`；Chroma 向量索引由 `VECTORDB_DIR` 指定，缺省为 `DATA_DIR/chroma`。`POST /api/ingest/local` 读取 `TEXT_ROOT` 下的 `.txt`/`.md`，以及 `KNOWLEDGE_ROOT` 下递归的全部 `.pdf`。

> **当前演示配置**：`.env` 把 `DATA_DIR` 指向 `.demo_langchain/langchain_datadb`、`VECTORDB_DIR` 指向 `.demo_langchain/langchain_vectordb`；启动后直接用该 LangChain 语料做问答，无需重新导入。切换到基金报告时改 `DATA_DIR`/`VECTORDB_DIR`/`KNOWLEDGE_ROOT` 即可。

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
| `DATA_DIR` | `<repo>/data` | SQLite（原文/版本、会话）目录 |
| `VECTORDB_DIR` | `DATA_DIR/chroma` | Chroma 向量索引目录；与数据库分离时可单独指定 |
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

完整契约（字段、SSE 事件、错误语义）见 [`.logsdev/design/API.md`](.logsdev/design/API.md)。

## 测试

```bash
.venv/bin/python -m pytest tests -q
```
