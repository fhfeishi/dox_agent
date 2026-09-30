# dox_agent

面向科研项目资料的本地、单用户研究助手，支持知识库检索、带来源的对话、跨库对比、趋势分析、专项报告，以及独立的申报书形式审查。

前端采用 React 19、TypeScript、React Router、TanStack Query、Tailwind 4 和 Vite；后端采用 FastAPI、LangGraph、SQLite 和 BM25。

## 当前进度

截至 **2026-09-30**，界面包含对话、知识库、任务、成果、形式审查、Prompt / Skill 六个入口。

| 功能 | 当前能力与验证边界 |
| --- | --- |
| 知识库 | 本地目录管理、上传与增量导入、原文预览；四维筛选、只读对照、证据返回和按所选资料发起新任务已实现，浏览器旅程通过 |
| 对话与检索 | 1–6 库检索、会话恢复、分支、重新生成、过程和 token 信息；引用携带所属库及版本，同文档多个片段合并为一个来源 |
| 任务 | 四个内置任务，以及自定义任务、参数、发布版本和输出模板 |
| 成果 | 回答快照、自动归档的专项报告、跨会话列表、正文预览、编辑版本、Markdown / DOCX 导出；图文成果可导出 ZIP |
| 网络资料 | 指定 URL 预览、确认快照与受控搜索；来源按快照回读 |
| Prompt / Skill | 指令资产与能力包管理、版本和静态测试入口，分别保留数据契约 |
| 形式审查 | 指南驱动清单、申请书元信息、审核运行、证据库与导出；后端已有真实模型全链证据，前端已实现并构建，完整浏览器审核与计算工具接入仍待验收 |

四个 Demo 已使用真实医疗库（517 份）及机器人自动化库（510 份）测试。问答、对比、趋势和报告分别读取 3、5、8、10 份资料，26 条来源记录的正文与原文件检查均成功。报告自动产生唯一成果，浏览器验证了正文、引用、编辑保存、重开与旧版本回读；DOCX 导出成功。输入、回答及检查结果见 [Demo 验收记录](.logsdev/verification/demo-tasks-20260930/README.md)。

**检索结果是预算内的资料样本。** 项目数量与主题分布仅代表实际读取资料，不能作为全库统计或领域全貌。多方案提取 Profile（P2）、技术文档结构导航（P3）、完整提取质量标注验收，以及形式审查计算工具仍在后续工作中。

## 启动与开发

前置：Python 3.12 或更高版本、[uv](https://docs.astral.sh/uv/)、Node.js 与 npm。当前检查使用 Node.js 26.8.1。仓库不会附带模型密钥。

~~~bash
cp .env.example .env
# 编辑 .env，填写 MODEL_API_KEY、MODEL_BASE_URL、MODEL_NAME
bash launch.sh
~~~

默认地址：<http://127.0.0.1:8000>。

启动脚本优先复用已激活的 VIRTUAL_ENV，其次使用 DOX_AGENT_VENV，否则使用项目 .venv；环境不存在时才创建。随后安装 web 依赖，前端未构建时安装并构建，最后启动服务。EMBEDDING_PATH 非空时安装 embedding 依赖。

修改前端代码后需重新构建：

~~~bash
cd frontend
npm ci
npm run build
~~~

开发前端使用 npm run dev。在 WSL 中，Node、npm 和 node_modules 应来自同一 Linux 环境；Windows 与 WSL 的原生依赖不能混用。

## 数据布局与备份

每个知识库是一个自包含目录：

| 路径 | 内容 |
| --- | --- |
| .knowledge/库/source/ | 原始 PDF、Markdown、txt、docx，可包含子目录 |
| .knowledge/库/datadb/ | 原文、版本、文件清单与检索块的 SQLite 数据库 |
| .knowledge/库/vectordb/ | 配置 embedding 后使用的向量索引 |
| .knowledge/库/target/ | 四维提取结果与版本、证据定位 |
| .knowledge/.state/ | 会话、报告、运行、成果、自定义任务与模板、网页快照、Prompt / Skill，以及库显示信息 |
| .knowledge/.state/review/ | 形式审查独立数据库、申请书、指南和导出报告 |

新本地语料、数据库和运行状态由 .gitignore 排除；仓库中已跟踪的历史资料仍受 Git 管理。备份应包含源文件、数据库、提取结果及应用状态；会话、运行、报告与成果应成组恢复。

审查材料不会进入知识库，也不参与问答检索。新对话按实际知识库目录名字典序选首库，发送时保存显式库范围。

## 报告、引用与范围

专项报告任务先采集主题、项目年份和覆盖重点，再生成正文。**生成成功后自动归入成果板块**，可打开卡片预览、编辑新版本和导出。需求采集说明不能保存为报告正文；普通问答可手动保存为回答快照。已有误存快照不会自动删除。

引用使用“所属知识库＋文档＋版本”定位。同文档多个命中片段保留在 locations 中，新回答每篇文档一个引用编号；历史回答保留原编号并合并来源列表入口。文档更新后应重新提问，避免把旧引用指向新正文。

BM25 在既有报告预算内选择互补主题资料，复用分词结果，补检替换上一轮结果。长文按剩余文档数分配上下文，截断会告知模型，未显示内容不代表原文为空。

明确给出的项目年份按**文件名起止区间与年份窗口相交**筛选，跨越窗口的项目仍属于范围内。项目时间不代表成果发生时间。覆盖重点补充检索候选，不改变已确认的年份和资料范围。

## 常用配置

以 [.env.example](.env.example) 为模板。仓库 .env 覆盖上一级目录的同名配置。

| 变量 | 默认值 / 用途 |
| --- | --- |
| MODEL_NAME / MODEL_BASE_URL / MODEL_API_KEY | deepseek-chat / https://api.deepseek.com / 空；OpenAI 兼容连接 |
| CORPORA_ROOT | 项目下 .knowledge；知识库根目录 |
| STATE_DIR | CORPORA_ROOT 下 .state；应用状态 |
| EMBEDDING_PATH / EMBEDDING_DEVICE | 空 / cpu；空时不加载本地 embedding |
| MINERU_CMD / MINERU_HOME | PDF 解析命令与缓存；支持 {pdf}、{out}，默认输出 ZIP |
| WEB_PROVIDER | crawl4ai；也支持 firecrawl |
| RUN_TIMEOUT | 180；对话运行时限 |
| REVIEW_MODEL_* | 审查模型覆盖配置；未设置时复用 MODEL_* |
| REVIEW_RUN_TIMEOUT / REVIEW_MAX_CALLS | 900 / 32；审查运行预算 |

不要提交 .env。完整配置见 [src/agent/config.py](src/agent/config.py)，审查模型配置见 [src/review/model_client.py](src/review/model_client.py)。

## 主要接口

| 接口 | 用途 |
| --- | --- |
| GET /api/health | 服务、模型配置与知识库状态 |
| /api/corpora、/api/corpora/{id}/files、/api/corpora/{id}/ingest | 库与资料管理、按库导入 |
| /api/corpora/{id}/reports、/api/corpora/{id}/target | 四维结果、提取任务 |
| /api/documents?corpus=、/api/documents/{id}/markdown?corpus=、/api/documents/{id}/file?corpus= | 文档列表、解析正文、原文件 |
| POST /api/chat | 流式对话 |
| /api/tasks、/api/templates | 内置与自定义任务、模板 |
| POST /api/reports/preflight、POST /api/reports | 报告范围核对与正文生成 |
| /api/artifacts、/api/artifacts/{id}/versions、/api/artifacts/{id}/export | 成果、版本与导出 |
| /api/workspace、/api/runs | 会话与运行记录 |
| /api/web、/api/prompt-skills | 网络快照与指令资产 |
| /api/review/* | 形式审查独立接口 |

运行后可通过 /docs 查看实际 OpenAPI 契约。

## 验证与工程文档

~~~bash
uv pip install --python .venv/bin/python -e ".[dev]"
.venv/bin/python -m pytest -q
cd frontend
npm test
npm run build
~~~

浏览器旅程见 tests/browser_target_facets.py、tests/browser_answer_controls.py、tests/browser_artifacts_live.py。真实接口、模型替身与临时数据范围写在各脚本说明中，替身验收不能证明真实模型质量。

| 文档 | 用途 |
| --- | --- |
| AGENTS.md（本地工作环境文件） | 项目协作规则，不随代码发布 |
| [PROJECT.md](.logsdev/PROJECT.md) | 产品目标、有效要求与后续安排 |
| [ITERATION.md](.logsdev/ITERATION.md) | 当前实施进度、证据与未决项 |
| [DECISIONS.md](.logsdev/DECISIONS.md) | 长期架构与产品决定 |
| [Demo 验收记录](.logsdev/verification/demo-tasks-20260930/README.md) | 四个真实任务的回答、报告及验证边界 |
