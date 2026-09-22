# 关键决策 — dox_agent

## 文档与本地数据布局（2026-09-22）

- 采用的选择与条件：
  - **开发文档**统一放 `.logsdev/`：框架与维护约定用 `.logsdev/README.md`；记录沿用已有等价文档（`demand.md`、`status.md`、`design/`、`plan/`），不强行套用 PROJECT/ITERATION/DECISIONS 模板；历史快照放 `archive/`。
  - **本地数据**按用途分开：`.knowledge/`（原始语料）、`.data/`（数据库/向量库）、`.demo_langchain/`（演示语料，含 `langchain_dox` 原始文档、`langchain_vectordb` 向量库、`langchain_datadb` 数据库）。
- 理由与代价：把"文档""原始语料""派生数据""演示数据"分开，避免语料与派生物混装、演示数据污染真实库，并让文档位置与维护约定一致。代价是后端需支持数据库与向量库分离——新增 `VECTORDB_DIR`，缺省仍为 `DATA_DIR/chroma`，保持旧行为不变。
- 影响：`README.md`（目录与配置表）、`.env`/`.env.example`、`.gitignore` 已同步；`.knowledge/`、`.data/`、`.demo_langchain/` 的数据默认不入库，只保留各自 `README.md`。
- 替代关系：取代此前"`knowledge/` 单目录同时存放原始语料与派生数据、`DATA_DIR` 同时承载向量库"的约定。旧 `knowledge/`（`nf`、`database`、`vectordb`）保留在本地，待后续按新布局迁移。
