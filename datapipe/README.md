# datapipe — 知识库数据管线（source → target）

> 本目录记录 `.knowledge/**/source/` 下的原始文件如何一步步变成 `target/<doc_id>.json` 的四维提取结果：
> 批量处理脚本、LLM 分析整理用的 task-prompt，以及每一步的验收方式与失败处置。

**边界**：本目录**不是应用运行时代码**。`src/`、`tests/` 不导入这里的任何文件，改动不影响服务行为，也不在常规测试/构建范围内。脚本按个人环境运行，依赖（`requests`、`PIL`、本机 `mineru-kit`、Node ≥ 17）与主应用不保证一致——**不要因为脚本报错去改主应用依赖**。

## 从这里进

| 想了解 | 去哪 |
| --- | --- |
| 整条链路、每阶段的命令 / 产物 / 验收 / 失败处置 | [pipeline.md](pipeline.md) |
| 提取 prompt、草稿回放契约、人工提取的硬规则 | [prompts.md](prompts.md) |
| 历史整理任务的完整提示词 | [prompts/knowledge_reorg.prompt.md](prompts/knowledge_reorg.prompt.md) |
| 库目录结构、增删改语义、API、状态与排障 | `.knowledge/README.md` |
| 四维 schema、枚举、引文校验的权威定义 | `src/targets.py` |
| 模型实际读到的系统提示词 | `src/prompts/target_extract.md` |

单一权威：链路以本文 + `pipeline.md` 为准，脚本行为以 `scripts/` 代码为准，四维契约以 `src/targets.py` 为准。三者冲突时先确认真实行为，再改文档。

## 链路

```text
.knowledge/<库>/source/          原始资料：NSFC 结题报告 PDF（逐页扫描图，无文本层）+ 项目元数据 md
        │
        │ 01 取数   acquire_nsfc_pdf.py（全文 PDF）｜acquire_nsfc_meta.mjs（项目首页信息 → md）
        ▼
.knowledge/<库>/source/          命名约定 `开始年_完成年_批准号_负责人_名称`，PDF 与 md 通用
        │ 02 布局   align_parsed_cache.py（日常对齐）｜layout_corpora.py（一次性拆分，已完成不可重放）
        ▼
.knowledge/<库>/parsed/<source 相对路径>/middle_json.json     MinerU 解析缓存（命中即复用）
        │ 03 解析   parse_missing_pdf.py（只补缺失，可续跑）
        │ 04 入库   POST /api/corpora/{id}/ingest → src/parsers.py:import_defaults
        ▼
datadb/knowledge.sqlite3          docs / doc_pages / doc_markdown / chunks / files
        │ 05 提取   extract_targets.py（模型批处理）｜extract_targets_rules.py（零模型规则）
        │            ｜commit_target_drafts.py（会话内人工提取后回放）
        ▼
.knowledge/<库>/target/<doc_id>.json    schema_version=2 的四维记录（facets / outputs / events / relations）
        │ 06 验收   verify_targets.py（只读）
        ▼
各库 current / stale / missing / rejected 清单
```

## 脚本

| 脚本 | 阶段 | 做什么 | 默认档位 | 幂等性 |
| --- | --- | --- | --- | --- |
| `scripts/acquire_nsfc_pdf.py` | 01 取数 | 按 `kd.nsfc.cn` 接口逐页下载结题报告图片并合成 PDF | 直接执行，输出到当前目录 | 按项目 ID 重跑会覆盖同名输出 |
| `scripts/acquire_nsfc_meta.mjs` | 01 取数 | `collect` 搜索建候选池 → `plan` 打印计划 → `apply` 落 md 到 `source/` | `plan` 默认 dry-run | 候选池缓存 + 已存在文件跳过 |
| `scripts/align_parsed_cache.py` | 02 布局 | 补齐角色目录、按批准号去重、把已有 MinerU 缓存复制到 `parsed/<rel>`、`pending/` 归位、清 `Zone.Identifier` | **dry-run**，需 `--apply` | 可重复执行 |
| `scripts/layout_corpora.py` | 02 布局 | 一次性把旧 `自然科学基金/` 拆成多个领域库、复用缓存、重建 `datadb`+`vectordb`、重写 `corpora.json` | **dry-run**，需 `--apply` | **不可重放**（旧库已删除），仅作布局来源记录 |
| `scripts/parse_missing_pdf.py` | 03 解析 | 对无缓存的 PDF 调 `mineru-kit`，解压到 `parsed/<rel>` | `--tier flash` | 可续跑，命中缓存即跳过 |
| `scripts/extract_targets.py` | 05 提取 | 模型分块批处理，产出/升级 `target/*.json` | **只读计划**；`--trial N` 写临时目录；`--apply` 落盘 | 当前版本已完成即跳过，失败件下次重做 |
| `scripts/extract_targets_rules.py` | 05 提取 | 零模型规则抽取（版式小节 + 报告自带成果列表），走同一套校验 | 默认写盘，加 `--dry` 只统计 | 按文档覆盖写，结果同构 |
| `scripts/commit_target_drafts.py` | 05 提取 | 把人工/会话内产出的 `draft.json` 过同一套校验后落盘 | 直接执行 | 按 doc_id 覆盖写 |
| `scripts/derive_target_events.py` | 05 提取 | 从正文「专利/论文/样机/部署/试验」叙述段落派生 `events` | **试跑**，需 `--apply` | 事件 id 由 `type+date+desc` 派生，重跑幂等 |
| `scripts/verify_targets.py` | 06 验收 | 复刻 `src/targets.py` 的 current/stale 判定，逐库统计 | 只读 | 无副作用 |

## 目录

```text
datapipe/
├── README.md                        本文件：入口、边界、脚本清单
├── pipeline.md                      每阶段的命令、产物、验收门禁、失败处置
├── prompts.md                       task-prompt 契约、三条产出路径、人工提取规则
├── prompts/
│   └── knowledge_reorg.prompt.md     历史任务提示词：散装语料 → 多领域库并对齐代码接口
├── records/
│   └── ingest-verify-2026-09-26.md   入库校验记录（磁盘 ↔ 清单 ↔ 正文 ↔ 块 一致性）
├── archive/                          已被取代的取数脚本 v1/v2（未入库的历史版本），确认后可删
├── .cache/                           候选池缓存与迁移前副本，`*` 忽略、不入库、可整体删除
└── scripts/                          可执行脚本（上表）
```

`archive/` 里的 `acquire_nsfc_meta_v1.mjs`（单库版，默认 100 篇）与 `_v2.mjs`（批量版）已被 `scripts/acquire_nsfc_meta.mjs` 取代：同一数据链路，v3 额外修正了「诊断」等泛词把故障/认知诊断误判进医疗库的问题。保留它们只因为这批文件此前未入 git，删掉不可恢复。

## 运行前提

- **在 WSL 内、仓库根目录执行**，用应用 venv 的解释器（`.venv/bin/python`）。Windows 侧 Python 缺 `langchain_core` 等依赖，`import src.targets` 会直接失败。
- 05 提取需要 `.env` 里的 `MODEL_API_KEY` / `MODEL_BASE_URL` / `MODEL_NAME`（`src/agent/models.py`）；未配置时脚本明确失败，不会静默跳过。
- 03 解析需要 `mineru-kit` 可执行（`src/agent/config.py` 的 `MINERU_CMD`）；脚本会把 `sys.executable` 目录加入 `PATH`，因此装在 venv 里也能被找到。
- 01 元数据抓取需要 Node ≥ 17 且带 `--openssl-legacy-provider`（站点搜索接口是 DES/ECB + base64，属 OpenSSL legacy 算法）。
- 应用运行时直接读 `datadb/*.sqlite3` 会 `database is locked`；盘点优先停服务，或用文件快照。

## 巡检（只读，随时可跑）

```bash
# 1) 提取进度：各库待提取 / 已是当前版本 / 当前版本但未完成
python datapipe/scripts/extract_targets.py

# 2) 契约复验：docs / target 文件 / current / missing / stale / outputs / events / rejected
python datapipe/scripts/verify_targets.py

# 3) 资料构成与解析覆盖（在 .knowledge/ 下执行）
cd .knowledge && for d in */; do printf '%-34s pdf=%s md=%s parsed=%s\n' "${d%/}" \
  "$(find "$d/source" -type f -name '*.pdf' | wc -l)" \
  "$(find "$d/source" -type f \( -name '*.md' -o -name '*.markdown' \) | wc -l)" \
  "$(find "$d/parsed" -type f -name middle_json.json 2>/dev/null | wc -l)"; done
```

读法：`parsed < pdf` 表示还有 PDF 未解析（导入时会现跑 MinerU）；`parsed > pdf` 是孤儿缓存（源文件已删/改名），不会再被命中；`docs` 与 `files` 清单不一致时先看导入任务报错。

## 排障

| 现象 | 原因与处置 |
| --- | --- |
| `import src.targets` 报 `No module named 'langchain_core'` | 用的是 Windows 侧 Python；换 WSL venv 解释器 |
| `database is locked` | 应用正在运行；停服务后再读写 `datadb`，或先 `cp` 快照再查 |
| MinerU 极慢（数分钟/页） | 用了 `--tier standard`（无 GPU 时约 2.8 min/页）；改 `--tier flash`（约 7 s/页） |
| 导入时整库重跑 MinerU | `parsed/` 与 `source/` 相对路径不对应；先跑 `align_parsed_cache.py` |
| 提取结果被判 `stale`（资料已更新） | `docs.version`/`source_sha256` 变了，或 `SCHEMA_VERSION`/`PROMPT_VERSION` 升级；重跑提取即可，旧记录不会被静默沿用 |
| 在 Windows 侧改不动仓库里的既有文件（EPERM） | 该盘为 WSL 9p 挂载，Windows 进程只能新建不能改写既有文件；在 WSL 内编辑。`.cache/legacy-scripts/` 就是因此留下的迁移前副本 |
| `target/` 中出现非 `*.json` 文件 | 历史 sed 批改残留；已清理，若再现说明有脚本在 `target/` 里直接改文件 |

## 范围

本目录**不负责**：`datadb` schema 与导入实现（`src/knowledge.py`、`src/parsers.py`）、检索与四维读取接口（`src/retrieval.py`、`src/targets.py`）、前端展示。临时调试脚本与补丁留在 `.workbuddy/`（未入库），不属于本链路。

## 维护

- 脚本增删、阶段顺序、缓存布局或验收口径变化时，同步改本文与 `pipeline.md`；一次性操作的输出只进 `records/`，不写成新阶段。
- 不写死库名、篇数与提取结果：现状用上面三条巡检命令现取。
