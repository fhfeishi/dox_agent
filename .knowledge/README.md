# .knowledge — 语料根（CORPORA_ROOT）· 管理入口

本目录是本地知识库的唯一持久化根。**本文是管理它的唯一入口**：结构、数据约定、操作流程、排障都从这里进入，不在别处维护平行副本。

知识库的数量、名称与主题会持续增减。本文只写不随具体库变化的规则，**不列举库名、篇数或主题清单**；需要盘点时用 §6 的巡检命令现取。

## 从这里进

| 我要做的事 | 入口 |
| --- | --- |
| 新建库、放资料、导入 | §4 日常操作流程 |
| 改名、改说明、删库 | §5 增删改 |
| 库消失、导入没生效、状态异常 | §6 状态与排障 |
| 备份、迁移、清理 | §7 备份、迁移与清理 |
| 想看代码实际怎么做的 | §8 当前实现梳理（只读） |
| 一次性整理脚本 | `tools/README.md`（仓库根 `tools/`） |

## 1. 目录结构

```text
.knowledge/
├── README.md
├── .state/                     # 应用级状态；点目录被扫描器跳过
└── <知识库>/                   # 任意数量；目录名 = 知识库规范名
    ├── source/                 # 原始资料（.pdf .md .markdown .txt .docx），可再分子目录
    ├── parsed/                 # 可选：MinerU 解析缓存，按 source 相对路径镜像
    ├── datadb/                 # knowledge.sqlite3（原文/版本/分块/文件清单）
    └── vectordb/               # Chroma 向量索引
```

- **一个直接子目录 = 一个自包含知识库**，可整体备份、迁移、删除。
- **名称可以改**：知识库名即目录名；可通过 API 重命名（目录同步改名、稳定 id 不变）。`source/` 下的领域子目录名同样自由，代码递归收集，不依赖具体名称。
- 代码中不存在“`CORPORA_ROOT` 下应有 N 个库”“某固定库名/主题/查询”这类假设。默认库按实际目录名的字典序取第一个，不持久化默认值。

## 2. 数据约定

- **基金结题报告**：`source/` 下 PDF（官方逐页原图合成、无文本层）。
- **项目元数据**：`source/` 下 Markdown，作为**与 PDF 同等的一手资料**直接读取，不做 MinerU 解析。
- **命名约定**（展示/检索元数据用，非硬性要求）：`开始年_完成年_批准号_负责人_名称`，PDF 与 Markdown 通用；解析结果用于卡片展示与报告筛选。
- **解析缓存**：`parsed/<source 相对路径>/` 必须与 `source/<相对路径>` 一一对应，命中即复用；对不上会重新触发 MinerU。缓存目录内含 `markdown.md`、`middle_json.json`、`images/`。
- 主题/领域只体现在目录与文件名里，检索与管理逻辑不依赖具体主题词。

## 3. 命名与标识

- **目录名是唯一权威标识**。`alias`（显示名）与 `description`（用途说明）只改展示，不参与检索匹配，也不改变目录。
- **稳定 id**：`slug(目录名)[:n] + "-" + sha1(目录名)[:8]`，总长 ≤120；改名只改目录名，**id 不变**，已绑定该库的会话不失效。持久化在 `.state/corpora.json`。
- **合法目录名**（`valid_corpus_name`）：非空、≤80 字符、不以 `.` 开头、不以 `.` 或空格结尾、不含 `/ \ \n \r \t`、不是 `source`/`datadb`/`vectordb`、不是 Windows 保留名（`CON` `PRN` `AUX` `NUL` `COM1`–`COM9` `LPT1`–`LPT9`）。
- **建议**：同一批库用统一前缀 + 维度后缀（`<来源>-<领域>`），字典序自然聚类、人工可辨；不要起 `parsed` 之类的名字，易与角色目录混淆。
- **`alias`**：可读显示名，缺省时回退为目录名；它不随改名自动更新，改名后要单独改。
- **`description`**：一句话说明该库的资料来源、覆盖范围与建立时间，**建议每个库都填**。新建时通常为空，用 `PUT /api/corpora/{id}/description` 补，不要在 `corpora.json` 里手改。它只影响界面展示与人工辨识，不参与检索。

## 4. 日常操作流程

1. **建库**：`POST /api/corpora`（建齐 `source/`、`datadb/`、`vectordb/` 并登记）。也可直接在根下建目录，下次扫描按 `generated` 发现。
2. **放资料**：把 `.pdf/.md/.markdown/.txt/.docx` 放进 `source/`，可自由分子目录；**符号链接会被跳过**。
3. **解析（仅 PDF）**：缓存放到 `parsed/<source 相对路径>/` 即可复用，否则触发 MinerU；无 GPU 用 `--tier flash`（`standard` 约 2.8 min/页，不可行）。
4. **导入**：`POST /api/corpora/{id}/ingest`（202 后台任务）。`force=true` 全量重解析，只在解析器或分块逻辑变更后使用。
5. **验收**：`GET /api/corpora` 看 `preparation=ready` 与文档数；再抽查 `GET /api/documents/{doc_id}/markdown` 看正文；文件名元数据（年份/批准号/负责人/标题）是否解析正确，用 `GET /api/corpora/{id}/report-metadata` 核对。

**导入前检查清单**

- [ ] `parsed/` 与 `source/` 相对路径一一对应（不对应 = 全量重跑 MinerU）
- [ ] 同一批准号无重复/错名副本（保留真实负责人版）
- [ ] 无 `*:Zone.Identifier` 等下载残留
- [ ] 该库没有正在跑的导入（重复提交返回 409）

## 5. 增删改

| 端点 | 行为 |
| --- | --- |
| `POST /api/corpora` | 新建 `source/datadb/vectordb` + 注册表（`created`） |
| `PATCH /api/corpora/{id}` | 重命名：`os.rename` 目录 + 重写库内文件型 origin（保留 doc_id）+ 更新注册表；失败回滚 |
| `PUT /api/corpora/{id}/description` | 设置用户说明（与目录名分离） |
| `DELETE /api/corpora/{id}` | 默认只删派生数据；`purge_source=true` 连源文件一起删 |
| `POST /api/corpora/{id}/reassociate` | 把缺失的稳定 id 重新关联到未占用的目录 |
| `GET\|POST\|DELETE\|PATCH /api/corpora/{id}/files` | 库内源文件列表/上传/删除/重命名，落到 `source/` 后立即增量导入 |

**删除语义**

- 默认：只删 `datadb/` + `vectordb/`，**保留 `source/` 与 `parsed/`**，且保留注册表条目 —— 重新导入即可恢复。
- `purge_source=true`：删整棵目录（含 `parsed/`）并移除注册表条目，**不可逆**。
- 导入或上传进行中删除返回 409。

**跨库移动资料**

- 库内文件重命名、库改名都保留 `doc_id`；**跨库移动等于「从 A 删 + 向 B 传」，`doc_id` 会重新生成**，历史会话与报告中对这些文档的引用会失效。
- 因此不要把资料在库之间搬来搬去当作整理手段；确需调整归属时按新资料导入处理，并预期旧引用失效。

## 6. 状态与排障

| 状态 | 含义 | 处置 |
| --- | --- | --- |
| `ready` | 有 docs | 正常 |
| `empty` | 有 sqlite、无 docs | 跑一次 ingest |
| `uninitialized` | 无 sqlite | 跑一次 ingest（会补建 `source/`） |
| `missing` | 注册表有 id、目录不存在 | 用 `reassociate` 重绑到未被占用的目录，或删除失效记录；**不要手工改 `corpora.json`** |

其他已知行为：

- 改名/重关联与导入互斥（`import_lock`），并发请求返回 409。
- 默认库按目录名字典序取第一个非 `missing` 的目录，不持久化。
- 应用运行时直接读 `datadb` 会 `database is locked`（实测），盘点优先用 `GET /api/corpora`；要直接查先停应用。
- 本仓库跑在 WSL 文件系统上，Windows 侧命令行连不到应用端口（实测 `127.0.0.1:8000` 超时）；上面的命令与 `curl` 请在 WSL 内执行。

**巡检命令**（在 `.knowledge/` 下执行，均为只读）

```bash
# 各库资料构成与解析覆盖
for d in */; do printf '%s pdf=%s doc=%s parsed=%s\n' "${d%/}" \
  "$(find "$d/source" -type f -name '*.pdf' | wc -l)" \
  "$(find "$d/source" -type f \( -name '*.md' -o -name '*.markdown' -o -name '*.txt' -o -name '*.docx' \) | wc -l)" \
  "$(find "$d/parsed" -type f -name middle_json.json 2>/dev/null | wc -l)"; done

# 已入库文档数（Python ≥3.12；需先停止应用）
python -m sqlite3 "<库>/datadb/knowledge.sqlite3" "select count(*) from docs;"

# 注册表（id / 目录名 / 显示名 / 说明）
python -c "import json;[print(v['id'],'|',v['rel'],'|',v.get('alias',''),'|',v.get('description','')) for v in json.load(open('.state/corpora.json',encoding='utf-8')).values()]"

# 容量
du -sh */ .state
```

**怎么读这几个数**

- `pdf` 与 `doc` 分开看：只放 Markdown 元数据的库 `pdf=0` 是正常的，不要误判成空库。
- `parsed` < `pdf`：还有 PDF 未解析，导入时会现跑 MinerU（无 GPU 时必须 `--tier flash`，否则极慢）。
- `parsed` > `pdf`：**异常**，存在孤儿缓存（源文件已删或改名后留在 `parsed/` 的残留），不会再被命中；确认无用后再删，删了不影响检索结果。
- 文档数与 `source/` 文件数对不上：先看导入任务是否报错，再按本节的状态表处置。

## 7. 备份、迁移与清理

- 一个库目录 = 自包含单元，可整体拷贝或移动。`datadb/`、`vectordb/` 是派生数据，可由 `source/` + `parsed/` 重建；**`source/` 唯一不可重建**。
- `.state/` 在语料根下，承载注册表（`corpora.json`）、会话、报告、运行快照与产物。**备份知识库时连同 `.state/` 一起备份**，否则稳定 id 与会话引用会丢。
- **整个 `.knowledge/` 被 `.gitignore` 排除**（`.gitignore:19-20`），本文与各库内容都不进版本库；备份与回滚只能靠本节的文件拷贝，不要指望 git。
- 迁移/升级工具会在原文件旁留 `.pre-*`、`*.bak` 快照（如 `corpora.json.pre-*.bak`、`knowledge.sqlite3.pre-*`）；确认新状态可用后再删。
- `vectordb/` 是惰性创建的派生索引（未配置 `EMBEDDING_PATH` 时不会生成），当前未接入检索；删掉不丢资料，会在需要时重建。
- 备份示例：`cp -a .knowledge /备份盘/knowledge-$(date +%F)`（整棵目录含 `.state/`）；只留资料底稿时可只拷各库 `source/`。
- 可清理：下载残留 `*:Zone.Identifier`、确认无用后的 `parsed/`（删除后会触发重解析）、确认新状态可用后的 `.pre-*`/`*.bak` 快照。
- **禁止**：应用运行时手工编辑 `datadb/*.sqlite3`、`vectordb/`、`.state/corpora.json`；不要在文件系统里直接重命名或删除库目录（会造成注册表与目录失配，表现为 `missing`）。

## 8. 当前实现梳理（只读）

> 本节只描述代码里的实际流程，不代表未来方案。关键实现见 `src/agent/corpora.py`、`src/parsers.py`、`src/knowledge.py`、`src/dense.py`、`src/main.py`。

### 8.1 配置
- `CORPORA_ROOT`（默认 `<repo>/.knowledge`）：语料根。
- `STATE_DIR`（默认 `<CORPORA_ROOT>/.state`）：应用级状态。
- 旧变量 `DATA_DIR` / `VECTORDB_DIR` / `KNOWLEDGE_ROOT` / `TEXT_ROOT` 已废弃。

### 8.2 发现与注册（`scan_corpora`，只读扫描）
1. 枚举语料根的**直接子目录**，跳过点目录与角色目录（`source`/`datadb`/`vectordb`）。
2. 每个目录 → `CorpusInfo`（名称、`rel_path`、各角色路径、文档数、`preparation`）。
3. 稳定 id 持久化在 `.state/corpora.json`；**改名只改 `rel`，id 不变**。
4. 注册表按 id 存 `alias`、`description`、`created`（显式新建）、`generated`（仅扫描发现）等；**规范名始终是目录名**。
5. `kind` 由内容推断（如命中基金命名 → `fund`）；`preparation` 见 §6。
6. 注册表有 id 但目录不存在 → 标记 `missing`，API 明确提示，不静默 404。

### 8.3 导入（ingest）
`POST /api/corpora/{id}/ingest`（202，后台任务）→ `import_defaults(root=source, parsed_root=parsed)`：
1. `collect_sources` 递归收集 `source/` 下 `.pdf/.md/.markdown/.txt/.docx`（跳过符号链接）。
2. `files` 文件清单按 `size + mtime`（必要时 `sha256`）跳过未变文件。
3. `parse_file`：PDF 命中 `parsed/<rel>/` 缓存则复用，否则执行 `MINERU_CMD`；Markdown/txt 直接读取；docx 离线提取文本。
4. `Knowledge.put` 写入 `docs` / `doc_pages` / `doc_markdown` / `version`（内容哈希）。
5. PDF 用 `parsed` 的 `middle_json.json` 生成**块级 chunks**（表格整块），其余用页级 fallback。
6. 源文件消失 → 从清单与 `docs` 同步删除。
- 命中缓存时不会重跑 MinerU；`parsed/` 与 `source/` 相对路径不一致会强制重跑。

### 8.4 存储
- `datadb/knowledge.sqlite3` 表：`docs`（元数据+版本）、`doc_pages`（页文本）、`doc_markdown`（正文）、`chunks`（检索块）、`files`（清单）、`meta`（库级设置，如 OCR 模式）。
- `vectordb/`：Chroma；`DenseIndex` 在配置了 `EMBEDDING_PATH` 时惰性创建。**当前检索流程为 BM25（chunks）**，dense 索引已具备但尚未接入检索。

### 8.5 检索与读取
- `Knowledge.retrieve`：报告级分块检索（BM25）。
- `GET /api/documents...`：按 `page` / `start_line` / `version` 读取原文；`/file` 原文件流；`/markdown` 渲染正文。
- 前端 `useCorpora` 单一持有知识库列表；`fundMeta` 从文件名解析 `yearFrom/yearTo/projectNo/pi/title`（`.pdf` 与 `.md` 通用）。

### 8.6 设计约束
- 语料随时增删改名：代码只依赖目录结构与注册表，不写死库名、数量、主题或查询。
- 目录名是规范名，`alias`/`description` 只是展示信息；重命名保持 id 稳定。
- 所有本地持久化都在 `CORPORA_ROOT` 下，无根外语料特例。

## 9. 维护本文

- 结构、接口、导入流程或删除语义变化时更新相应小节；一次性脚本与历史操作留在 `tools/README.md` 和 git 历史，不复制进本文。
- 不写死库名、数量、主题；盘点结果用 §6 命令现取。
- 与本文冲突的实现以代码为准，改代码后回来改本文。
