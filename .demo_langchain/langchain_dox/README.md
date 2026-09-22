# langchain_dox — 演示语料原始文档

本目录用于放置演示用 LangChain 语料的**原始文档**（`.txt`/`.md`/`.pdf`）。

当前演示语料由官方文档在线导入（`POST /api/official-docs`）后，正文与版本存于
[`../langchain_datadb/knowledge.sqlite3`](../langchain_datadb/knowledge.sqlite3)，
因此**没有独立的原始文件**，本目录暂为空。

如需改为文件式演示语料：把原始文件放入本目录，令 `TEXT_ROOT`/`KNOWLEDGE_ROOT`
指向本目录，再执行 `POST /api/ingest/local` 导入；向量库与数据库分别落在
`../langchain_vectordb/` 与 `../langchain_datadb/`。
