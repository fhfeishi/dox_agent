# prompts — task-prompt 契约与三条产出路径

四维提取的提示词有唯一权威位置：**`src/prompts/target_extract.md`**（应用运行时会读它）。本目录**不复刻**提示词正文，只记录它怎么被调用、产出怎么被校验、人工提取时必须守哪些规则——这些是脚本与人工操作的知识，代码里读不到。

## 1. 提示词清单

| 提示词 | 位置 | 谁用 | 作用 |
| --- | --- | --- | --- |
| 四维提取契约 | `src/prompts/target_extract.md` | `src/targets.py:extract_target` | 系统提示词。规定返回结构（facets/relations/outputs/events）、引文必须逐字、枚举取值、条目不合并、状态区分 |
| 四维阅读框架 | `src/prompts/target_facet_guide.md` | 报告/分析类任务 | 解释四个维度各自的边界（场景=环境与对象、问题=瓶颈、技术=方法、成果=载体与状态）。**提取时不注入**，避免与提取契约的枚举规则冲突 |
| 整理任务提示词 | [prompts/knowledge_reorg.prompt.md](prompts/knowledge_reorg.prompt.md) | 人工/会话内 Agent | 历史任务：把散装语料拆成多领域库、对齐代码接口、复用 MinerU 缓存、去重、清 Zone 文件。含当时的硬约束与验收标准，作为同类整理任务的模板 |

## 2. 调用形态（模型路径）

`extract_target` 每轮只喂一段正文：

```text
SystemMessage: <src/prompts/target_extract.md 全文>
HumanMessage:  文档：<标题>
               正文分段：<start+1>–<end>（共 <len> 字符）
               解析正文字符：<start+1>–<end>

               <markdown[start:end]>
```

- **分段**：`review_segments(markdown)`（`src/reports.py`）给段落边界，单段上限 6000 字符。
- **预算**：单份最多 `--max-calls`（默认 40，回退 `settings.max_model_calls`）；用尽即标「未完成」，不继续调用。
- **时限**：单份 `--timeout`（默认 900 s，回退 `settings.run_timeout`）。
- **截断重读**：响应 `finish_reason == "length"` 说明这一段超过一次回复容量，按中间换行二分后各自再读，最多递归 2 层。
- **并发**：`--concurrency`（默认 3）。模型侧限流要留余量，失败件靠重跑补齐而不是无限重试。

模型只看到当前段，因此提示词里明确「本段只是全文的一部分，不要因本段没有某类内容而下结论」——这是分块提取的前提，改提示词时不要删掉这句。

## 3. 校验链（三条路径共用）

```text
模型回复 / 规则抽取结果 / draft.json
      │  _json_object        → 只接受一个 JSON 对象，允许 ```json 围栏
      │  _normalize_segment  → 结构错误整段失败；单条问题只拒绝该条
      ▼
   _Merge                  → 跨段/跨稿合并，条目 id 由内容派生（稳定）
      │  _outputs_check      → 与报告自带「成果列表(N)」对账（declared/listed/by_kind）
      ▼
target/<doc_id>.json       → process.status=已完成/未完成；rejected[] 记录被拒条目与原因
```

拒绝粒度是设计要点：**一条伪造引文只丢这一条，不丢整段**。`rejected[]` 里保留 `kind / name / reason / span`，据此定位是 OCR 质量问题还是模型编造。

硬校验（不通过即拒收该条）：

| 校验 | 规则 | 失败原因示例 |
| --- | --- | --- |
| 引文可定位 | `quote` 必须能在解析正文中逐字找到（先在本段范围内找，找不到再全文找一次，防止段落边界切断引文） | 证据引文不在解析正文中 |
| 引文条数 | 每条 1–8 条证据 | 必须包含 1–8 条证据 |
| 引文长度 | 单条 ≤ 2000 字符 | 证据引文过长 |
| 年份 | `outputs[].year`、`events[].date` 里的四位年份必须出现在该条引文中 | 成果年份在引文中找不到 |
| 标识 | `identifiers`、指标 `value` 必须出现在引文中 | 成果标识在引文中找不到 |
| 枚举 | 维度名、技术角色、成果类别/归属/状态、事件类型、关系类型与端点维度 | 成果类别或归属非法 |
| 关系 | 只接受 `basis=原文明示` 的关系，同一段共现不算关系 | — （共现关系被静默丢弃） |

## 4. 草稿回放契约（`commit_target_drafts.py`）

人工或会话内在别处产出四维结果时，写成如下 JSON 再交给脚本，走的是与模型路径完全相同的校验与合并：

```json
{
  "items": [
    {
      "doc_id": "005850eaf929436b2dde",
      "facets": {
        "场景": [{"id": "s1", "name": "细胞-组织特异性调控研究", "desc": "原文限定的研究对象与条件",
                 "evidence": [{"quote": "原文逐字引文"}]}],
        "问题": [{"id": "p1", "name": "多调控因子协同机制不清", "desc": "…",
                 "evidence": [{"quote": "原文逐字引文"}]}],
        "技术": [{"id": "t1", "name": "多组学联合建模", "desc": "…", "role": "关键创新",
                 "evidence": [{"quote": "原文逐字引文"}]}],
        "成果": [{"id": "r1", "name": "调控图谱原型系统", "desc": "…", "status": "已取得",
                 "status_raw": "原文状态词", "self_reported": false,
                 "evidence": [{"quote": "原文逐字引文"}]}]
      },
      "relations": [
        {"from": {"dimension": "技术", "item_id": "t1"},
         "to": {"dimension": "问题", "item_id": "p1"},
         "type": "针对", "basis": "原文明示", "evidence": [{"quote": "原文逐字引文"}]}
      ],
      "outputs": [
        {"id": "o1", "kind": "期刊论文", "title": "题名", "attribution": "本项目",
         "status": "已发表", "status_raw": "原文状态词", "year": "2019",
         "identifiers": {"doi": "…"}, "evidence": [{"quote": "原文逐字引文"}]}
      ],
      "events": [
        {"id": "e1", "type": "专利授权", "date": "2021-05", "desc": "发生了什么",
         "status": "已取得", "result": "…", "environment": "…", "self_reported": false,
         "tech_ids": ["t1"], "output_ids": ["o1"], "evidence": [{"quote": "原文逐字引文"}]}
      ]
    }
  ]
}
```

要点：

- `id` 只是**段内临时引用**。最终 id 由 `_Merge` 按内容派生，`relations`/`tech_ids`/`output_ids` 里的引用在合并时被解析成稳定 id。
- 引文在整个解析正文范围内校验（不要求与某一段对应），但必须逐字存在。
- 记录里 `model` 字段用于区分产出方式，回放时如实写清来源，不要伪装成模型自动提取。

## 5. 人工提取的硬规则

这些规则不是风格偏好，违反会直接被校验拒收或污染下游统计：

1. **引文逐字复制，不改写、不跨句拼接**。宁可引一整句长句，也不要为了简洁删字。
2. **数字必须在引文里读得到**：年份、指标值、专利号、DOI。读不到就不填，不要从项目起止年份推。
3. **状态词从原文取**：拟开展/拟发表只能是「预期」；「已应用/已部署」但无验证细节时 `self_reported=true`；论文的已投稿/已录用/已发表分开，专利的申请/公开/授权分开。
4. **逐条枚举，不合并**：原文逐篇列出就逐篇写 `outputs`；只给「发表论文 17 篇」这类总数时不编题名，改在「成果」维度留一条带数量的条目。
5. **参考文献不是本项目成果**：`attribution` 写「参考文献」；项目前已有的基础写「前期成果」；判断不了写「待核对」（合并时会用更确定的归属覆盖）。
6. **关系只在原文明示时写**，且类型与端点维度必须匹配：场景-问题、针对（技术→问题）、配套（技术→技术）、验证（成果→技术/问题）。
7. **维度可空，不要凑**：本段/本文没提就留空数组，四维不是必须填满的四格。
8. **不输出**置信度、完成百分比、成熟度等级或原文没有的评分。

## 6. 已知失败模式与检出方式

| 失败模式 | 现象 | 检出 |
| --- | --- | --- |
| 凭印象改写引文 | 逐条被拒，`reason=证据引文不在解析正文中` | `rejected[]` 计数偏高 |
| 把「拟发表」写成「已发表」 | `status_raw` 与 `status` 矛盾 | 抽查 `status_raw`，批次对比 `outputs` 状态分布 |
| 「共发表 17 篇」编成 17 个题名 | `outputs_check` 的 `by_kind` 与报告自带列表不符 | `outputs_check.consistent=false` |
| 跨句拼接引文 | 校验通过但语义变形（引文里出现两处不相邻的句子） | 人工抽查；同类问题会推高 `rejected` |
| 把参考文献当本项目成果 | `attribution=本项目` 的题名出现在参考文献段 | 抽查 `outputs` 的题名与 `attribution` |
| 从文件名/项目年份推成果年份 | 年份不在引文中 → 被拒 | `reason=成果年份在引文中找不到` |
| 分块导致漏提 | 该段四维为空但全文明显有内容 | `coverage.processed == total` 但 `facets` 全空，需要看段边界 |

## 7. 改提示词时的连带影响

- `src/prompts/target_extract.md` 改动后必须升 `src/targets.py:PROMPT_VERSION`，否则旧记录仍被当作 current，新旧口径会混在一起。
- 返回结构调整（新增字段或枚举）要同批改 `_normalize_segment` 的校验，并升 `SCHEMA_VERSION`；只改提示词不加校验，等于放弃约束。
- 升版后全库重做的方法：`extract_targets.py` 只读计划会显示「v2 待重做」数量，再用 `--trial` 抽 3 份核对新旧差异，最后 `--apply`。
