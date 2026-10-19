> **历史任务提示词（2026-09-23 起草，09-29 前执行完毕）。** 当时的脚本住在 `tools/`，现已迁到 `datapipe/scripts/`，本文路径已同步；任务本身已完成，保留它是作为「把散装语料整理成多个领域库并对齐代码接口」这类工作的模板与验收清单。当前链路的权威说明见 [../pipeline.md](../pipeline.md)。

# 任务提示词：整理 `.knowledge/` 知识库并对其代码接口

## 角色与背景
你是 dox_agent 仓库的工程助理。`.knowledge/` 是语料根（`CORPORA_ROOT`）。
- 每个**直接子目录 = 一个自包含知识库**，内部固定 `source/`（原始 `.pdf/.md/.markdown/.txt/.docx`，可再分子目录）、`datadb/`（`knowledge.sqlite3`）、`vectordb/`（Chroma）；另有可选 `parsed/`（MinerU 解析缓存，必须按 `source/` 的相对路径镜像）。
- **知识库名称、数量、主题都会增减迭代**：名称即目录名，允许修改；代码不得写死库名/数量/主题/查询。默认库按实际目录名字典序取第一个。
- 资料两类：NSFC 结题报告 PDF（扫描图、无文本层，需 MinerU OCR）+ 项目元数据 Markdown（纯文本，**不需要解析**，作为与 PDF 同等的一手资料）。
- 文件命名约定：`开始年_完成年_批准号_负责人_名称`（PDF 与 Markdown 通用）。

## 目标
把 `.knowledge/` 下的资料按领域整理成多个 `自然科学基金-AI与xx` 知识库（名称可调整），使每个库结构对齐代码接口，并尽量复用已有 MinerU 解析缓存，避免重跑解析。

## 硬性约束
1. **不得删除** `.knowledge/<子目录>` 顶层知识库目录。
2. README 只保留最终结论，**不写死**具体知识库名称/数量。
3. `.md` 项目元数据放进对应库 `source/`，按源码文档处理，不解析。
4. PDF 若已有解析缓存（`parsed/<rel>/middle_json.json`）则**直接复用/搬运**，不重跑 MinerU。
5. **去重**：同一批准号的重复/错名副本（如把“面上项目/青年科学基金项目（C类）”当成负责人的版本），保留真实负责人版。
6. **清理** `*:Zone.Identifier`（Windows 下载残留）。
7. **不要动旧库** `自然科学基金/`（用户自行用网页端处理）。
8. 解析完成并经用户确认前，**不重建** `datadb`/`vectordb`。

## 执行步骤
1. **只读盘点**：逐库统计 `source` 中 PDF/Markdown、`parsed` 覆盖情况、`pending` 中间文件、重复批准号、Zone 文件。
2. **结构对齐**：确保每个库有 `source/parsed/datadb/vectordb`；把全局可用的解析缓存复制到目标库的 `parsed/<source 相对路径>/`。
3. **去重 + 清理** Zone 文件。
4. **续跑解析**缺失 PDF：
   `mineru-kit parse "<pdf>" -o "<parsed_dir>/result.zip" --tier flash --ocr-mode auto --format zip`，解压到 `parsed/<rel>/`；脚本需可断点续跑、跳过已缓存。
   - 无 GPU 时不要用 `--tier standard`（实测约 2.8 min/页，不可行）；`--tier flash` 约 7 s/页，输出结构相同。
5. **确认解析状态**：汇总各库 `已解析 / 缺失` 与缺失清单，交用户检查。
6. **用户确认后重建**：按代码 pipeline 执行 `import_defaults(root=<库>/source, parsed_root=<库>/parsed)` 写入 `datadb`；需要时用 `DenseIndex` 构建 `vectordb`。
7. **更新 `.knowledge/README.md`**：只写结构、数据约定、管理 pipeline（见下），不含固定库名/数量。

## 代码接口要点（只读参考，不修改代码）
- 配置：`CORPORA_ROOT`（默认 `<repo>/.knowledge`）、`STATE_DIR`（默认 `<CORPORA_ROOT>/.state`）。
- 发现/注册（`src/agent/corpora.py:scan_corpora`）：扫直接子目录，跳过点目录与角色目录；稳定 id = `slug + sha1(rel)[:8]`；`.state/corpora.json` 按 id 存 `alias/description/created/generated/missing`。
- 增删改 API：`POST /api/corpora`、`PATCH /api/corpora/{id}`（改名同步目录 + 重写 origin，保留 doc_id）、`PUT .../description`、`DELETE ...`、`POST .../reassociate`、`POST .../ingest`、`GET|POST|DELETE|PATCH .../files`。
- 导入（`src/parsers.py:import_defaults`）：递归收集 `SOURCE_SUFFIXES`，`files` 清单按 `size+mtime`（必要时 sha256）跳过未变；PDF 命中 `parsed/<rel>` 复用否则跑 `MINERU_CMD`；md/txt 直读、docx 离线提取；`Knowledge.put` 写 `docs/doc_pages/doc_markdown/version`；PDF 用 `middle_json.json` 生成块级 `chunks`。
- 存储：`datadb/knowledge.sqlite3`（`docs/doc_pages/doc_markdown/chunks/files/meta`）；`vectordb/` = Chroma，`DenseIndex` 惰性创建；**当前检索为 BM25，dense 未接入检索**。
- 前端：`useCorpora` 单一持有列表；`fundMeta` 从文件名解析 `yearFrom/yearTo/projectNo/pi`（pdf/md 通用）。

## 验收标准
- 每个目标库结构为 `source/parsed/datadb/vectordb`，且 `parsed` 与 `source` 相对路径一致。
- 重复文件为 0；Zone 文件为 0；README 无固定库名/数量。
- 已解析 PDF 全部命中缓存；未解析的给出明确清单。
- 用户确认后重建完成，`scan_corpora` 能正确识别各库。

## 执行结果（历史，供接续参考）
- 已创建约 10 个 `自然科学基金-AI与xx` 库；已对齐角色目录、去重 8 个、清 Zone 60 个、补齐已有缓存。
- 当时的后台脚本已迁入 `datapipe/scripts/`：`parse_missing_pdf.py`（tier=flash，可续跑）、`layout_corpora.py`（一次性拆分）、`align_parsed_cache.py`（结构对齐）。
- 缺失清单：`.knowledge/.state/missing_parsed.txt`；解析日志：`/tmp/mineru_missing.log`（临时路径，已随环境清理）。
- 后续：重建 `datadb`/`vectordb` 已完成；入库一致性校验记录见 [../records/ingest-verify-2026-09-26.md](../records/ingest-verify-2026-09-26.md)。
