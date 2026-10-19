# pipeline — 每阶段的命令、产物与验收

本文按阶段写「输入 → 产物 → 命令 → 幂等/续跑 → 验收 → 失败处置」。脚本清单与运行前提见 [README.md](README.md)，四维提取的 prompt 契约见 [prompts.md](prompts.md)。

## 0. 不变量

1. **`source/` 唯一不可重建**。`parsed/`、`datadb/`、`vectordb/`、`target/` 都能从 `source/` 重建（代价是 MinerU 解析时间与模型调用费用）。
2. **提取结果与文档版本绑定**。`target/<doc_id>.json` 里记录 `version`（`docs.version`，内容哈希）与 `source_hash`；任一不符即判 `stale`，界面显示「资料已更新」，不会被当作当前结果使用。
3. **规则版本决定重做范围**。`src/targets.py` 的 `SCHEMA_VERSION` / `PROMPT_VERSION` 一旦升版，全部旧记录自动变 `stale`，需要重跑提取——这是有意的，避免旧口径结果混在新口径统计里。
4. **写盘只有两种形态**：`target/` 单文件原子替换（`tempfile` + `os.replace`），以及应用侧的 `import_defaults` 事务入库。脚本不改 `datadb` 表结构。

## 1. 取数

### 1.1 结题报告全文（PDF）

- 输入：`kd.nsfc.cn` 的项目 ID（32 位十六进制，取自 `finalDetails?id=...` 链接）。
- 产物：`结题报告_<批准号>/page_XXX.png` 逐页图片 + 合成的 `结题报告_<批准号>_<项目名>.pdf`（150 dpi，页面无文本层，必须走 OCR）。
- 命令：

```bash
python datapipe/scripts/acquire_nsfc_pdf.py <URL或项目ID> [输出目录]
```

- 失败处置：单页请求重试 5 次、间隔 3 s，仍失败则整份报错退出（不产出半份 PDF）。接口返回 `code != 200` 或图片 404 视为「无更多页面」，正常结束。
- 已知限制：站点接口无公开文档，字段以实测为准；页面图片本身是渲染图，PDF 里没有可选中文本。

### 1.2 项目首页信息（Markdown）

- 输入：站点搜索结果（加密响应）。
- 产物：`source/<开始年>_<完成年>_<批准号>_<负责人>_<项目名>.md`，与 PDF 同等对待（**不送 MinerU**，按文本直读入库）。
- 命令（三步，`plan` 默认 dry-run）：

```bash
node --openssl-legacy-provider datapipe/scripts/acquire_nsfc_meta.mjs collect
node --openssl-legacy-provider datapipe/scripts/acquire_nsfc_meta.mjs plan  [--corpus=名称 --target=500 --count=md|all --limit=N]
node --openssl-legacy-provider datapipe/scripts/acquire_nsfc_meta.mjs apply [...同上]
```

- 幂等：候选池缓存到 `datapipe/.cache/nsfc_candidates_v2.json`（`collect` 产物，不入库）；`apply` 跳过已存在的同名文件，因此可分批 `--limit` 续跑。
- 失败处置：搜索响应解密失败通常是漏了 `--openssl-legacy-provider`；领域判定误纳（历史问题：「诊断」泛词把故障诊断/认知诊断算进医疗库）已在当前版本改为医疗需 ≥2 个医学词。
- 依赖：Node 内置模块，无 npm 依赖。

## 2. 布局（让库目录与代码接口对齐）

### 2.1 日常对齐

```bash
python datapipe/scripts/align_parsed_cache.py            # dry-run，只打印计划
python datapipe/scripts/align_parsed_cache.py --apply
```

- 做的事：补 `source/ parsed/ datadb/ vectordb/` 角色目录；按批准号去重（保留「真实负责人」版，丢弃把「面上项目/青年科学基金项目」当负责人的错名副本）；把任意库下已存在的 MinerU 缓存复制到 `parsed/<source 相对路径>/`；`pending/` 中有缓存的 PDF 归位 `source/`；删除 `*:Zone.Identifier` 下载残留。
- 幂等：已对齐的项不动，重复执行无副作用（`--apply` 下才写盘）。
- 红线：**不删顶层知识库目录**、不动 `datadb`/`vectordb`。

### 2.2 一次性拆分（历史，已完成）

`layout_corpora.py` 把旧 `.knowledge/自然科学基金` 拆成按领域的多个库、复用 `parsed/` 缓存、重建各库 `datadb`+`vectordb`、删旧库并重写 `.state/corpora.json`。**旧库已不存在，重放没有意义**，保留它只为记录「当前四类库布局、`corpora.json` 与 `parsed/` 复用是怎么产生的」。

## 3. 解析（MinerU 缓存）

```bash
python datapipe/scripts/parse_missing_pdf.py --tier flash [--limit N] [--timeout 7200]
```

- 输入：`source/**/*.pdf` 中 `parsed/<相对路径>/middle_json.json` 不存在的那些。
- 产物：`parsed/<source 相对路径>/` 下的 `markdown.md`、`middle_json.json`、`images/`。
- 续跑：命中缓存即跳过，天然断点续跑；单份超时只影响该份。
- 本机实测：`--tier flash` 约 7 s/页；`--tier standard` 无 GPU 时约 2.8 min/页，**不要用**。两种档位输出结构相同，代码只依赖 `middle_json.json` 与 `*.md`。
- 失败处置：单份失败只打印 `FAIL`，不中断整批；失败份下次运行自动重试。`pending/` 下的 PDF 用扁平缓存路径 `parsed/<文件名>/`。

## 4. 入库

```bash
curl -s -X POST http://127.0.0.1:8000/api/corpora/<id>/ingest          # 增量
curl -s -X POST "http://127.0.0.1:8000/api/corpora/<id>/ingest?force=true"   # 全量重解析
```

- 实现：`src/parsers.py:import_defaults`，202 后台任务。
- 增量判定：`files` 清单按 `size + mtime` 跳过未变文件，必要时再比 `sha256`；源文件消失则从清单与 `docs` 同步删除。
- PDF 缓存：`parsed/<rel>/` 命中即复用；**内容变更的 PDF 会解析到 `parsed/<rel>/.versions/<sha256>/`**，避免新正文配上旧缓存。
- 产物：`docs`（元数据 + `version` 哈希）、`doc_pages`、`doc_markdown`、`chunks`（PDF 用 `middle_json` 的块级切分、表格整块；其余走页级 fallback）、`files` 清单。
- 禁止：应用运行时手工改 `datadb/*.sqlite3`、`vectordb/`、`.state/corpora.json`。
- 门禁：入库完成后按 `.knowledge/README.md` §6 校验 `preparation=ready`、文档数、`report-metadata` 的年份/批准号/负责人解析。

## 5. 提取四维（三条路径，同一套校验）

无论走哪条，最终都经 `src/targets.py` 的 `_normalize_segment` → `_Merge` → `_outputs_check`，因此 schema、枚举、引文可溯源、id 派生完全一致；区别只在「四维内容从哪来」。

| 路径 | 脚本 | 适用 | 成本 |
| --- | --- | --- | --- |
| 模型批处理 | `extract_targets.py` | 大批量、正文版式不规整 | 每段一次模型调用 |
| 零模型规则抽取 | `extract_targets_rules.py` | 模型不可用/额度受限，且报告版式固定 | 0 次调用 |
| 会话内人工提取 + 回放 | `commit_target_drafts.py` | 少量疑难文档、需要人工校准口径 | 0 次脚本调用（人工成本） |

模型批处理：

```bash
python datapipe/scripts/extract_targets.py                                   # 只读计划
python datapipe/scripts/extract_targets.py --corpus 医疗 --trial 3 --limit 3  # 试跑，写临时目录
python datapipe/scripts/extract_targets.py --corpus 医疗 --apply --concurrency 3 --max-calls 40 --timeout 900
```

- 选择：`--corpus`（id 或名称子串，可重复）、`--doc`（doc_id，可重复）、`--limit`。
- 结果清单：`.knowledge/.state/target_v2_report.json`（每次运行覆盖；含 `counts`、`model_calls`、逐文档 `v1/v2` 条目数对照）。
- 幂等：`needs_extraction` 判定「当前版本 + 已完成」即跳过；未完成/失败件下次重做；**失败的运行不会覆盖可读的旧记录**，完整运行才会替换。
- 退出码：有「失败」或「未完成」返回 1，可用于批处理循环。

规则抽取（零模型）：

```bash
python datapipe/scripts/extract_targets_rules.py 机器人自动化 --dry   # 只统计
python datapipe/scripts/extract_targets_rules.py 机器人自动化         # 写盘
```

- 四维：只从明确的版式小节取句子（科学问题/关键技术/应用背景/成果进展 → 对应维度），引文＝原句。
- `outputs`：直接消费报告自带的「成果列表(N)」著录（`src/achievement_list.py`），题名即原文行。
- `events`：复用 `derive_target_events.py` 的规则。
- 取舍：宁可漏，不可编——版式不规整的文档基本提不出四维，需要用模型路径补。

草稿回放：

```bash
python datapipe/scripts/commit_target_drafts.py 医疗 draft-01.json draft-02.json
```

- 草稿 JSON 结构见 [prompts.md](prompts.md) §4；引文在整个解析正文范围内校验（不要求落在同一段）。
- 记录里 `model` 字段如实标注产出方式（现有数据中 `local-extraction` 表示规则/脚本产出，另一部分标注了会话内人工提取回放）。

事件派生（补 `events`）：

```bash
python datapipe/scripts/derive_target_events.py 医疗 --sample    # 试跑并打印样本
python datapipe/scripts/derive_target_events.py 医疗 --apply     # 写盘
```

- 只在原文明确写出「事件 + 日期 + 状态」时生成；日期必须能在该条引文里读到。
- 为什么需要单独一步：报告的「成果列表」是系统渲染的简化著录（`[期刊论文] 题名 — 作者`），不含日期，无法从它派生事件。

## 6. 验收

```bash
python datapipe/scripts/verify_targets.py
```

输出每库 `docs / files / current / missing / stale / outputs / events / rejected` 与总完成率。判读：

- `current < docs`：有文档未提取或已过期（`stale`），先跑 `extract_targets.py` 看计划。
- `files > docs`：`target/` 里存在孤儿记录（文档已删除/换版本），可人工清理。
- `files` 中出现非 `*.json`：说明有脚本在 `target/` 里直接改文件（历史 sed 批改就是这类残留），应改用脚本写盘。
- `rejected` 偏高：该库引文/枚举不合格比例高，通常是 OCR 质量或版式问题，看单份记录的 `rejected.reason` 定位。

单份排查：

```bash
python - <<'PY'
import json, pathlib
p = pathlib.Path(".knowledge/自然科学基金-AI与医疗/target").glob("*.json")
rec = json.loads(next(p).read_text(encoding="utf-8"))
print(rec["process"], len(rec["outputs"]), len(rec["events"]), [r["reason"] for r in rec["rejected"]][:5])
PY
```

## 7. 字段映射（source → datadb → target）

| 来源 | 入库后 | 提取后 |
| --- | --- | --- |
| `source/` 相对路径 | `files.rel`（清单主键）、`docs.origin` | — |
| 文件名 `2018_2021_61762014_夏海英_…` | `docs.title`；前端 `fundMeta` 解析 `yearFrom/yearTo/projectNo/pi` | 提取提示词里作为「文档」标题传入 |
| PDF `middle_json.json` | `doc_markdown.markdown`（拼装正文）、`doc_pages`（按 `page_idx`）、`chunks`（块级，带页码/标题） | 引文定位 `locator.basis=pdf_page` |
| md/txt/docx 正文 | `doc_markdown.markdown`、页级 `chunks` | 引文定位 `locator.basis=parsed_text`（字符区间） |
| — | `docs.version` = 正文内容哈希；`docs.source_sha256` | `target.version` / `target.source_hash`，用于 stale 判定 |
| 正文中的四类要素 | — | `facets[]`（场景/问题/技术/成果），条目 id = `item-` + `sha256(维度:归一化名称)[:12]` |
| 正文中的著录/成果列表 | — | `outputs[]`，id = `out-` + `sha256(类别+标识或题名)[:12]` |
| 正文中的时间性叙述 | — | `events[]`，id = `evt-` + `sha256(type+date+描述[:120])[:12]` |
| 原文明示的关联 | — | `relations[]`，端点维度必须符合 `RELATION_TYPES` |

id 由内容派生，因此同一份正文重复提取得到的 id 稳定，下游（报告、谱系、审查）对条目 id 的引用不会因重跑失效。

## 8. 成本与时间

- **模型调用次数 = 分块段数**：正文按 `review_segments` 切段（每段上限 6000 字符），每段一次调用；单份上限由 `--max-calls`（默认 40）约束，超限则该份标「未完成」而不是无限重试。实测样例（医疗库单份报告）`params.model_calls = 8`。
- **单份时限**：`--timeout`（默认 900 s）到点即停止并记「未完成」，已完成的分块结果仍会合并保留。
- **输出被截断**时自动二分该段重读（最多递归 2 层），因此长表格页不会整段丢失，但会增加调用次数。
- **PDF 解析**：`flash` ≈ 7 s/页；`standard` ≈ 2.8 min/页（无 GPU）。解析缓存是省时间的唯一手段，不要随意删 `parsed/`。
- 单价不写死在文档里：成本按 `model_name` 与调用次数自行核算，`target_v2_report.json` 给出每次运行的实际调用总数。

## 9. 现状快照（2026-10-17 实测，会漂移）

| 库 | pdf | md | parsed | target |
| --- | --- | --- | --- | --- |
| 自然科学基金-AI与信息智能 | 0 | 5 | 0 | 5 |
| 自然科学基金-AI与农业 | 12 | 1 | 12 | 13 |
| 自然科学基金-AI与医疗 | 17 | 500 | 17 | 517 |
| 自然科学基金-AI与大数据 | 10 | 0 | 10 | 10 |
| 自然科学基金-AI与机器人自动化 | 10 | 500 | 10 | 510 |
| 自然科学基金-AI与材料 | 10 | 4 | 10 | 14 |
| 自然科学基金-AI与生物医药 | 0 | 9 | 0 | 9 |
| 自然科学基金-AI与生物识别 | 10 | 0 | 10 | 10 |
| 自然科学基金-AI与社会治理 | 0 | 4 | 0 | 4 |
| 自然科学基金-AI与金融经济 | 12 | 8 | 12 | 20 |
| 自然科学基金-AI与隐私保护 | 10 | 0 | 10 | 10 |
| **合计** | **91** | **1031** | **91** | **1122** |

- `target` 1122 = `docs` 1122（91 PDF + 1031 md），逐库相等，**无孤儿记录、无未提取文档**。
- 1122 份全部 `schema_version=2`、`prompt_version=2`、`process.status=已完成`。
- 产出路径构成：`local-extraction`（规则/脚本，611 份）、会话内人工提取回放（511 份）；没有走模型批处理落盘的记录——模型路径的脚本已就绪，但当前数据是靠规则抽取与人工回放补全的。
- `vectordb/` 全为空且 dense 未接入检索（当前检索为 BM25），与本链路无关，不在 datapipe 处理范围。

## 10. 待办与已知缺口

1. `.cache/legacy-scripts/` 里是迁移前的脚本副本与 `.knowledge/*/target/` 里清出的 sed 残留，确认新脚本可跑后整目录删除：`rm -rf datapipe/.cache/legacy-scripts`。
2. `tools/` 目录已清空（脚本迁到本目录），空目录需在 WSL 内 `rmdir tools` 收尾。
3. 模型批处理路径尚无全库实测记录；首次跑建议 `--corpus <小库> --trial 3` 核对与既有记录的口径差异（`target_v2_report.json` 的 `v1_items`/`v2_items` 对照）。
4. `events` 密度取决于原文是否写明日期，成果列表不含日期；若需要更密的事件，只能扩充 `derive_target_events.py` 的叙述规则或走模型路径，不能从文件名/项目起止年份推断。
