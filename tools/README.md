# tools/ — 个人脚本（非应用代码）

本目录是**用户个人的数据获取/整理脚本记录**，不属于应用运行时代码，不被 `src/`、`tests/` 或任何服务端入口导入。保留在此仅为方便复现语料来源与一次性数据布局操作。

| 脚本 | 用途 | 性质 |
| --- | --- | --- |
| `get_nf_pdfs.py` | 从 `kd.nsfc.cn` 下载 NSFC 结题报告全文图片并合成 PDF | 个人取数脚本 |
| `split_knowledge_corpora.py` | 一次性：把旧 `.knowledge/自然科学基金` 拆分为多个领域库、复用 `parsed/` 缓存、重建 `datadb/`+`vectordb/`，删除旧库并重写 `.state/corpora.json` | 个人一次性脚本，含破坏性操作 |

## 注意

- 两脚本均**不参与业务逻辑**，其改动不影响应用行为，也不在常规测试/构建范围内。
- 按个人环境运行，**在应用 venv 与测试/构建保护之外**：依赖缺失时不应把它们当作项目依赖安装，也不要因脚本报错而修改主应用依赖。
- `split_knowledge_corpora.py` 默认 **dry run**（只打印计划），必须显式 `--apply` 才执行；执行会删除旧库并重写 `corpora.json`，不可逆，运行前先备份 `.knowledge/` 与 `.state/`。
- 依赖 `requests`、`PIL`（`get_nf_pdfs.py`）及本机 MinerU（`split_knowledge_corpora.py` 复用解析缓存），与主应用依赖不保证一致。
- 当前四个领域库布局、`corpora.json` 与 `parsed/` 复用均由 `split_knowledge_corpora.py` 产生；运行记录应结合 git 历史与该脚本版本理解。
