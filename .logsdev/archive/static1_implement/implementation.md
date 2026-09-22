# 实现边界

> 文档归属：static1。2026-09-16 从 `static1/IMPLEMENTATION.md` 迁入。本文件是此主题的唯一维护入口。正文中的源码路径以仓库根目录或明确标注的 static1 目录为基准，不以本文目录为基准。


四层设计、当前HTTP/内部契约、混合检索pipeline及上游映射见 [API_PIPELINE.md](../static1_design/API_PIPELINE.md)。该文档明确区分已实现与后续分层计划。

依据两份 Agentic RAG 笔记及 chat-langchain 源码；SDK 行为以实际安装版为准。

## 唯一源码结构
```text
frontend/           React + TS + Tailwind（唯一前端）
src/
  main.py           FastAPI、SSE、预览确认、构建页面托管
  knowledge.py      Document/Page、SQLite、BM25 search/read
  dense.py          可选本地HuggingFace + Chroma、增量同步、RRF融合
  parsers.py        UTF-8、LiteParse、Crawl4AI、Firecrawl
  cli.py            本地导入、检索、预览、问答验证
  agent/
    config.py       环境配置
    models.py       模型与追踪适配
    graph.py        Deep Agent 研究 + LangGraph 核验与有界补查
tests/
```
用简单函数作为解析器边界，用 Document/Page 作为数据契约。暂不引入插件注册中心、服务容器或多层 repository。
本地纯文本、PDF 与网页共享同一知识存储及工具，换解析器无需改图。
OpenAI 兼容本地/远程模型共享 models.py；LangSmith 开关也在此控制。
MCP、Managed Deep Agents、多 Agent 是可选后续步骤，当前不引入空适配或未验证部署入口。

## 当前能力

- 答案Markdown复制、最新一轮重新生成与旧版本保留；浏览器首正文等待/完成总耗时、停止失败耗时及导出。状态契约见LLD第7节；尚无模型usage或内部推理耗时。
- 文档导入与更新；LiteParse 本地解析。
- Crawl4AI 或 Firecrawl 网页预览确认入库、按域名加载用户会话。
- Deep Agents 默认四个业务工具：search_docs、read_doc、check_corpus_page、finish_research；EVIDENCE_ROUTING=false保留原两工具路径。
- LangGraph 研究 → 验证 → 补查/回答。
- SSE 过程、来源与文本；断开请求取消当前请求任务。
- React 统一入口；FastAPI 可直接托管生产构建。
- LangSmith 可配置 tracing。

## 当前验证的边界
验证节点核对文档存在、版本匹配、正文非空和报告证据ID，并按结构化覆盖报告做有限路由。报告的语义支持判断仍来自研究模型，不等于独立事实裁判。缺页硬停止只信任本地目录核验，单次未命中不是缺页证明。
结构化证据来自实际工具读取，包含 doc_id、version、page、start_line、text；最终答案不能凭搜索摘要建立来源。
仍有改进空间：检索召回评估、独立语义判定、引用编号准确率、多用户与持久运行取消。
新增功能要用现有小库评估收益，避免先拆分多个 Agent。

## 接口
- GET /api/health、GET /api/documents。
- GET /api/documents/{doc_id}?page=1&start_line=1&version=...。
- POST /api/ingest/local：导入配置中的文本目录和 PDF。
- POST /api/web/preview：url，返回 preview_id、正文；不入库。
- POST /api/web/confirm/{preview_id}：确认最新预览入库。
- POST /api/chat：messages → SSE(status/sources/token/done/error)。

## A 批次实现（2026-09-16）

- agent/routing.py：选项与意图契约、有限分类、资料指代解析、证据表达策略。
- agent/graph.py：新增understand/direct/finish节点，复用research/validate/answer；缺页停止与部分交付分离。
- agent/evidence.py：preserve_blocked_report保留缺失子问题；knowledge.py在候选构建前执行文档范围过滤。
- main.py：增量请求字段、按能力就绪、policy事件、错误终态；health返回默认设置。
- frontend/api.ts / conversation.ts：协议及每版options/policy；Answer.tsx / policy.ts：实际策略展示；main.tsx：输入设置、文档选择、聊天与语料状态分离。
- 前端生产产物已重建，日常入口http://127.0.0.1:8000直接使用新界面。指定资料暂走BM25，未引入新的向量索引或第二套研究Agent。

验证记录见dev_logs；真实模型仅为小规模场景验收，不表示全面专家质量评测。


## 2026-09-17：B/C/D 实施

- 快速路径：单轮短问题优先一次搜索、最多两段阅读及结构化覆盖判断；复杂问题或明确选择深入研究走原研究器。不足时传入已有搜索、证据与覆盖报告，不重置预算。保留总时限、取消、6段阅读和搜索上限。
- 阅读：`reading.py` 按章节/代码块扩展；保持旧300字符逻辑行坐标，新增 section=true 原文入口。返回 end_line、truncated、code_omitted、采集时间。过大/未闭合代码明确省略，不制造完整代码；重复覆盖范围复用证据。
- 观测：阶段耗时、搜索与阅读数量；`usage.py` 按模型调用ID收集供应商实际用量，缺失显示未报告或仅已报告部分，不估算成本。
- 会话：`workspace.sqlite3` 独立存储；保存回答版本、有效配置、引用、用量与耗时。浏览器每秒检查点与结束后保存；恢复中的运行标为已停止，不伪装续跑。写入revision冲突拒绝覆盖，提示导出后刷新。
- 笔记：从有来源答案创建草稿，编辑后人工确认；每次导航检查来源版本，过期/缺失/未确认笔记不参与导航；只提供原文位置，模型仍须阅读原文。
- 补充：侧栏支持按标题/来源筛选、多选最多20份资料、粘贴正文；同一来源更新内容版本。

验证：79项后端测试、10项前端测试、Ruff、TypeScript/Vite构建通过。测试涵盖快速覆盖和升级预算复用、章节完整性、会话revision冲突/重开持久性、恢复未完成回答、笔记过期与范围约束。

边界：快速覆盖仍由模型判断，不等同语义正确性证明；限域检索继续用BM25，避免子集同步破坏全局向量索引。服务器取消请求后不保证终止已开始的线程检索；最后尚未保存的流式片段可能在刷新时丢失。当前为单用户本地服务，无跨设备权限系统，未引入完整Wiki或自动联网补页。
