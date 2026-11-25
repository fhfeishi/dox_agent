日期：2026-11-06
来源：用户指令（2026-11-06 梳理资料检索逻辑并提出 search-harness）
状态：草案（待用户选定实施范围）

# 资料检索逻辑梳理与 search-harness 方案

- 范围：`src/retrieval.py`、`src/knowledge.py`、`src/agent/graph.py`、`src/reports.py`、`src/intelligence.py`、`src/prompts/*`、`src/experts.py`、`tests/test_retrieval.py`；`.logsdev/PROJECT.md §4.4`、`README`「对话与检索」、`ITERATION` L 阶段条目
- 证据：本机 `.knowledge/` 11 库真实数据上的抽样实测（脚本见 §4，可复跑）；无模型调用

---

## 1. 现状（代码事实）

### 1.1 一句话

检索是**确定性函数** `query → 报告**，不是搜索 agent：一次 BM25 排序 + 一次覆盖率闸门 + 最多一次机械补查，没有 LLM 参与选择或改写。jieba 描述不准确，实际是 CJK **bigram** 切词。

### 1.2 调用链

```
POST /api/chat (SSE)
  └ src/agent/graph.py: understand → retrieve → assemble → validate →(retrieve|answer) → finish
        retrieve: knowledge.retrieve(query, task_id, allowed_doc_ids, extra_queries=missing)
          └ src/retrieval.py: select_reports()          ← 唯一检索实现
          └ src/retrieval.py: retrieve_multi()          ← 多库（≤6）按报告排名 RRF 融合
  └ src/reports.py: generate_markdown()
        preflight_report()（年份/类别/失效文件过滤）→ knowledge.retrieve(task4) → assemble_reports()
  └ src/intelligence.py: 外部材料正文拼成 query → knowledge.retrieve(task2) → assemble_reports()
```

`select_reports` 内部有 7 层：

| 层 | 做法 | 位置 |
|---|---|---|
| 分词 | `re.findall("[a-zA-Z0-9_]+|[\u4e00-\u9fff]+")`，CJK 整段按 2-gram 切，2 字以上 | `knowledge.tokens` L32 |
| 年份 | 只认 `2020—2023` 这种区间写法，按文件名起止年相交过滤；空窗则全量并标 `year_relaxed` | `retrieval` L268 |
| Layer A | 报告级索引 = 标题 + 全部 heading + 项目号 + rel_path + 年份，`BM25Plus` 取 top-40 | L289 |
| 正文兜底召回 | 未被 A 召回但任一 chunk 有词面交集的报告**全部**召回（不限 k） | L303 |
| Layer B | 候选池内 chunk 级 BM25，多查询（原问 + `missing` 词）加权 RRF（k=60，权重 1.0/0.8） | L322 |
| 覆盖率 | 主题词 = 用候选库标题做最长匹配抽出的词；DF≥0.35 视为泛词净化；逐文档 cover = 实词命中率 | L345 |
| 选报告 | 绝对下限 0.3、相对阈值 0.5×top1、同项目去重、按 task 预算（1/3、2/5、3/8、3/10），多主题贪心补未覆盖主题 | L380 |

### 1.3 上游已有的"任务/专家"信息，实际只有一项进入检索

| 信息 | 有无 | 是否影响检索 |
|---|---|---|
| 任务模版（templates、task prompt） | 有 | **只影响输出格式**，不影响检索 |
| 任务背景（`background/goal/requirements/outline`、自定义任务参数） | 有 | **不影响检索**（`graph.answer` L353 才拼进系统提示） |
| 专家系统（4 席 baseline、偏好、skill、`expert_prompt_block`） | 有，已接到**报告**生成 | **检索完全不知道**。`src/api/reports.py:398` 只取 `task_type` 和 `corpus_id` |
| 共享 Prompt/Skill 资产（`prompt_skills.ALLOWED_TOOLS = {knowledge_search, knowledge_read}`） | 声明了工具名 | 没有实现、没有执行 |
| `task_id` | 有 | 只用于 min/max 报告数与是否装全文（task1 chunk-only） |
| `focus`（覆盖重点） | 有 | 只作为 `extra_queries` 加权 0.8 参与排序 |
| 网页快照、追问上下文 | 有 | 不进检索；网页快照直接追加到答案上下文 |

结论：**"根据任务上下文检索"目前只有 `focus` 一条细线**，其余全靠用户把意图写进那一句 query。

### 1.4 另外两处性质不同的问题

1. **dense 是死代码**：`knowledge.py:89-98` 建了 `DenseIndex`，全仓再没有任何地方读 `self.dense`；`PROJECT §4.4` 写的"BM25-only，dense 留作增强"其实是"dense 已不存在"。
2. **评测样本已失效、且饱和**：`src/evaluate.py` 指向 `tests/data/fund_retrieval.jsonl`，该文件已不存在。`PROJECT §4.4` 记录的 recall/MRR = 1.00 / ctx≈56k 来自 15 条样本（标注"样本饱和，待扩样"）。**今天等于没有检索评测**。

---

## 2. 实测：真实库上的失败模式（本机 ≥500 文档的医疗库、机器人库）

用 `select_reports` 原样跑 5 个真实问法：

| 提问 | 主题词抽到 | 命中 | 问题类型 |
|---|---|---|---|
| 这批项目采用了哪些关键方法？ | `关键方法` | 10 篇，cover 全 1.0 | **假命中**：`关键`/`方法` 因 DF 高被判泛词净化 → `specific` 为空 → `broad=True` → 跳过所有阈值，**一个泛词就能凑满 3 篇报告** |
| 哪些项目在做多模态大模型的临床应用 | `临床应用`（`多模态大模型` 丢了） | `临床应用` 在库中 DF=0 → 幸存 → 用它排序 | **主题退化**：核心词被丢，排序由次要词决定 |
| 研究报告里提到的数据集有哪些 | **`的数据集`** | 10 篇 | **分词垃圾**：最长匹配后剥离的尾助词集合 `与和及的在有是按并就都也而` 不含"到/了/着/过"；首位仍以"的"开头 |
| 2020—2023 年间脑机接口有哪些项目 | `脑机接口` | 18 候选 | 正确（年份窗口生效） |
| 医学影像方向的研究进展如何 | `医学影像` | 486 候选 | 正确 |

同一批数据的结构性问题：

| 结构问题 | 医疗库（517 篇/5199 chunks） | 机器人库（510 篇/5519） | 金融库（20 篇/821） |
|---|---|---|---|
| chunk 以标点/文号开头（从半句或页眉切开） | 787 | 830 | 97 |
| 相邻 chunk 正文**完全相同** | 65 | 17 | 30 |
| 单 chunk token 中位数 / 最大值 | 251 / 1750 | 221 / 969 | 245 / 1320 |

外加：

- **页眉页脚进了索引**：`20240281930055` 这类页眉被切成独立 chunk，`layer A` 和 `layer B` 都按它计分。
- **装进上下文的是报告 markdown 全文，不是命中片段**：`assemble_reports` 按行截断到 `retrieve_report_tokens=12000`，即**每篇只读前 ~12k token**。命中的 chunk 在第 3 万字符时，正文根本没入模，但 `validate` 用全文算覆盖率，判"已覆盖"。这是"检索对了、回答还是错"的根因。
- **chunk 表无 bm25 统计**：每次请求重算全部 chunk 的 token 与 DF；医疗库一次检索约 500 文档 × 10 chunk。单机 P50≈0.6s 可用，但 D-20261023-3（千人并发）下是纯重复计算。
- **无增量**：`Knowledge._chunks` 是进程内列表，一台机器 11 库常驻，没有持久化倒排/统计；重启第一问全量重算。

---

## 3. 用户提的三条意图，逐条对照现状

| 意图 | 现状 | 缺什么 |
|---|---|---|
| 根据**用户提问**检索 | BM25 + 硬编码规则（停用词表、尾助词、泛词阈值、覆盖率） | 规则是猜出来的，用户说法一变就漏（§2 前三行） |
| 根据**任务**（模版/背景）检索 | 无 | "对比分析"要成对召回两个对象；"技术研判"要覆盖多条技术路线；"专项报告"已有 `focus` 却只当 0.8 权重的第二查询 |
| 根据**专家系统**检索 | 无 | 存量分析席的硬要求"事实句能指回文件、缺失单列、不补范围外对照"本质是**检索约束**，现在只约束写作 |

---

## 4. 判断：search-harness 有必要；但"把检索交给 LLM 自由发挥"必须否掉

### 4.1 必要性来自三条本产品自己的硬约束

1. `base.md` 第 9 条：**引用只能指向本轮实际读过的证据**；第 5 条：不得把"未检索到"说成"领域不存在"。
2. `PROJECT §0`「检索结果是预算内的资料样本」，不得冒充全库统计。
3. D-20261023-3：请求路径只读、派生数据由后台单一写入方产出、跨进程用租约与修订号。

这三条决定：检索的每一步必须**可枚举、可复现、可断言**。一个自由 agent（"模型决定下一步搜什么、读哪篇"）产生的运行无法逐条断言，也无法给用户一个"为什么是这几篇"的清单，且同样的问法两次结果不同——在机关单位做资料研究场景是硬伤。

### 4.2 但纯规则已经到顶

§2 的四个失败全部是**规则的表征问题**（2-gram 垃圾词、泛词阈值把核心词净化掉、覆盖率用错语料算），不是权重问题。继续加规则只会让"为什么这次没命中"更难解释——`.logsdev/DeepResearch-products/06` 的结论正是这条：**检索不到时不要只改 prompt，也不要用阈值硬凑**。

### 4.3 定位：受控 harness —— 模型只提"检索意图"，不碰证据

| 谁 | 负责 | 不负责 |
|---|---|---|
| 模型（一次结构化调用） | 把（提问 + 任务背景 + 专家席位）变成**检索计划**：子问题、同义词/上下位扩展、必须覆盖的主题、对象、年份、类型、篇数预算 | 读正文、决定引用、决定命中与否 |
| 确定性引擎 | 执行计划（BM25 + 统计）、算覆盖、给每个未命中项写**机器原因**（词不存在 / 词泛化 / 只有正文命中 / 预算截断） | 猜测用户意图 |
| 模型（可选第二次） | 读**未命中的原因清单**（不读正文），只允许**改查询词**，重排一次 | 新增证据、改阈值、跳过预算 |
| 规则闸门 | 引用只来自引擎返回的 chunk；覆盖率按**实际入模文本**算；专家席位的硬要求转成断言（如"参照项目必须来自同一范围"） | — |

这就是"专业的"：模型做它擅长的**语义转写**，规则做它擅长的**边界与断言**，两者之间是一条可审计的窄接口。同时它是 `base.md`「先定位原文、逐条核对」和 `corpus_route.py`（每个库用自身词汇建画像）已经走过的路的自然延伸，不是引入新范式。

---

## 5. 分层方案（每层独立可验收，L0 单独就有收益）

### L0 修底层（不涉及 LLM，先做）

1. **分块**：按句边界切窗（不跨页）；页眉页脚识别后不进 chunk 正文（或降权标 `boilerplate`）；相邻重复 chunk 去重。验收：§2 表三列降到个位数。
2. **装上下文改为"命中片段 + 所在章节"**，不再整篇截断；或整篇但保证命中 chunk 一定在窗口内。验收：命中 chunk 必然出现在入模文本中（可断言）。
3. **覆盖率语义修正**：`validate` 用入模文本算；未入模的命中判"命中但预算外"。
4. **chunk 统计持久化**（后台单一写入方 + 修订号），按 D-20261023-3；或至少进程内缓存 + 失效率。
5. **评测集重建**：`.logsdev/verification/retrieval-<date>/` 下 60–100 条真实问法 × 已知答案文档 × 已知应缺主题；报告 recall@k / MRR / no-match / 假命中率 / 首次 token 时延。

### L1 SearchPlan（结构化检索计划）

```python
SearchPlan = {
  "subquestions": [{"text": str, "must_cover": [str], "type": "fact|compare|route|report"}],
  "objects": [str],            # 对比分析的两个对象
  "expand": {term: [aliases, hypernyms]},   # 只用本库 hierarchy/lineage 已有词汇
  "year_window": [int, int] | None,
  "corpus_ids": [...],
  "budget": {"reports_per_subq": int, "chunks_per_report": int},
  "hardening": [seat-specific assertions]
}
```

来源优先级：任务模版字段 > 专家席位 preset > 提问原文。生成失败或模型不可用时**退回当前 `select_reports`**，行为等价（关键：可降级，不脆断）。写进 run snapshot 的 `params`，界面「检索过程」卡片直接展示（`retrieval_trace` 已有一半结构）。

### L2 执行与诊断

- 每个 `must_cover` 项返回 `{held_by: [doc], reason: hit|generic|df0|body_only|budget_cut}`。
- reason 不是"没匹配"一句，而是可操作的原因——正是 RAGFlow 研究里"最小诊断路径"的要求。
- 多子问题分别执行、按需合并；对比分析强制两个对象的证据都到位，否则降级为描述并说明（`task2_compare.md` 已有这条输出契约，现在检索层不支持它）。

### L3 一次受控补查

- 只把 L2 的 reason 清单交给模型，产出**新的查询词**，上限一次（`retrieve_retry` 保持 0/1）。
- 补查结果**替换**上一轮（现有设计），但诊断保留两轮，供界面显示"第一轮缺什么、第二轮补到了什么"。
- 校验：新查询词不得引入 `year_window`、`corpus_ids`、`objects` 之外的范围，也不得新增硬断言之外的对象。

### L4 专家席位转成检索约束（不是更多提示词）

| 席位 | 当前只约束写作 | 应变成检索断言 |
|---|---|---|
| `stock-analyst` | "事实能指回文件"、"缺失单列"、"不从范围外补对照" | must_cover 逐项带 reason；缺失项必须产出"缺失清单"结构，且禁止用范围外文档补 |
| `intel-analyst` | 内外材料分开 | 本地库检索结果与外部材料分段标注来源，检索诊断分别给 |
| `corpus-ingest` | — | 不参与问答检索（保持现状） |
| `project-application` | — | 不参与 |

这需要 `expert_prompt_block` 之外再出一个 `expert_search_contract(seat)`，返回机读断言而不是散文，`expert_provenance` 一并记录（现有 run snapshot 已有 `expert` 字段）。

---

## 6. 不做什么（明确列出，避免范围膨胀）

- **不做自由 agent 循环**（模型反复 decide→search→read）。理由 §4.1；且现有 `max_model_calls=12`、`run_timeout=180s` 是按"检索 0 次模型调用、回答 1 次"设的，自由 agent 直接打破这两个预算。
- **不接在线 embedding / 向量库作为首选路径**。dense 是死代码，要么删要么接上，但不能在没重建评测集之前把"召回改进"归因给 dense。
- **不引入 LangChain 之外的检索框架**。RAGFlow 的教训（`06`）是诊断与阈值暴露，不是换引擎。
- **不把阈值调到"能答上"**。没有 L0.5 评测集，任何阈值调整都不可验收。

---

## 7. 需要你决定的四件事

1. **范围**：先只做 L0（纯工程质量，不动架构，约 3–5 个提交），还是 L0+L1+L2 一起（新增一次模型调用，需定超时与降级策略）？
2. **模型调用预算**：L1 计划生成 + 可能的 L3 补查 = 最多 2 次额外模型调用。这与"对话首 token 时延"直接冲突，是否接受（建议：L1 用低温度、max_tokens 限制、超时 6s，超时降级为规则路径）？
3. **专家席位**：是否同意 `stock-analyst` / `intel-analyst` 的硬要求**下沉为检索断言**（会改变报告与问答的召回行为），还是继续只约束写作？
4. **评测集**：谁来定"正确答案文档"（我按问题自动生成候选，你抽查？还是你直接给 20 条最想问的问题？）——没有这个，L1 之后无法证明"更专业"。

---

## 8. 复跑脚本（证据）

```bash
cd /home/mvr/wslcodespace/dox_agent
.venv/bin/python - <<'PY'
import sqlite3, statistics, re, sys
sys.path.insert(0, ".")
from src.knowledge import Knowledge, tokens
from pathlib import Path
for name, p in {"医疗": ".knowledge/自然科学基金-AI与医疗/datadb/knowledge.sqlite3",
                "机器人": ".knowledge/自然科学基金-AI与机器人自动化/datadb/knowledge.sqlite3"}.items():
    c = sqlite3.connect(p)
    seen, dup, bad = set(), 0, 0
    for (t,) in c.execute("select text from chunks"):
        dup += t in seen; seen.add(t)
        first = t.split("\n", 1)[0].strip()
        bad += bool(first) and not re.match(r"^[\u4e00-\u9fffA-Za-z0-9（(【\[]", first)
    print(name, "chunks", len(seen), "identical", dup, "start-with-punct", bad)
k = Knowledge(Path(".knowledge/自然科学基金-AI与医疗/datadb/knowledge.sqlite3"))
for q in ["这批项目采用了哪些关键方法？", "哪些项目在做多模态大模型的临床应用",
          "研究报告里提到的数据集有哪些"]:
    r = k.retrieve(q, task_id="task1")
    print(q, "|", r.specific, "| candidates", r.candidates, "| reports", len(r.reports))
PY
```
