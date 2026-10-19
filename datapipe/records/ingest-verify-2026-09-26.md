# 入库校验报告（2026-09-26）

对象：`.knowledge/自然科学基金-AI与医疗`、`.knowledge/自然科学基金-AI与机器人自动化`
方式：Windows 侧用 Node 内置 `node:sqlite` 读 `datadb/knowledge.sqlite3`（直接读 WSL 路径报
`database is locked`，故先 `cp` 快照到本地再读），并与 `source/` 磁盘文件逐一比对。

## 结果

| 项目 | AI与医疗 | AI与机器人自动化 |
| --- | --- | --- |
| 磁盘源文件 | 517（md 500 + pdf 17） | 510（md 500 + pdf 10） |
| `docs` 行数 | 517 | 510 |
| `files` 清单 | 517，全部 `indexed` | 510，全部 `indexed` |
| 磁盘 ↔ 清单差集 | 0 / 0 | 0 / 0 |
| `doc_markdown` | 517 | 510 |
| `chunks` | 5199（覆盖 517 个文档） | 5519（覆盖 510 个文档） |
| 无 chunks 的文档 | 0 | 0 |
| `files` 无对应 `docs` | 0 | 0 |
| 正文一致性抽检 | 3 篇逐字节一致 | 3 篇逐字节一致 |
| md 平均分块数 | 7.3 chunk/篇 | 8.0 chunk/篇 |
| 分块文本覆盖率 | 114% | 115% |

覆盖率 >100% 来自 `chunk_blocks` 的 `overlap=120` 重叠，说明全文被完整切块、无截断丢失。

## 结论

两个库的新语料已完整入库，清单、正文、检索块三者一致，无需重跑导入。

## 说明与观察

- `vectordb/` 为空属正常：当前检索走 BM25（`chunks` 表），dense 索引虽具备但未接入检索（见 `.knowledge/README.md` §3.5），`DenseIndex` 亦为惰性创建。
- 导入期间应用在运行（`datadb` 被占用、`.state/workspace|reports|runs.sqlite3` 的 mtime 为 22:01）。
- 观察（未改动）：md 与 pdf 的 chunk `heading` 均为空，`chunk_blocks` 的 `_heading_of` 似乎只识别 mineru 的 title block；不影响按 text 的 BM25 检索，但 `ReportDoc.headings` 会为空。

## 待办（需在 WSL 内执行，本机无法直通）

```bash
cd ~/wslcodespace/dox_agent
bash launch.sh                                   # 启动服务
curl -s http://127.0.0.1:8000/api/health         # 看文档数与当前库
curl -s "http://127.0.0.1:8000/api/documents?corpus=自然科学基金-AI与医疗" | head -c 500
```

再从应用 UI 对任一库提一个领域问题，确认返回带来源的答案即为端到端验证通过。
