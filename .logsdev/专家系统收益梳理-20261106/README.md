日期：2026-11-06
来源：用户指令（2026-11-06 梳理"纯 RAG 之外专家系统能带来什么收益"，并倾向少而必要）
状态：草案（待用户确认收益清单与收敛方向）

# 专家系统除 RAG 之外的收益：基于本项目真实数据

- 范围：`src/experts.py`、`src/api/experts.py`、`src/expert_profile.py`、`src/reports.py`、`src/intelligence.py`、`src/prompts/*`、`src/templates/*`、`.agents/experts/*`、`.knowledge/.state/{experts,runs,artifacts}.sqlite3`
- 证据：本机真实运行库（12 份报告、49 个 chat run、13 个 report run、0 条专家数据）+ 代码逐点核对，脚本见 §6
- 关联：[专家系统 runtime 审查](../专家系统runtime审查-20261106/README.md)（5 个 P0）、[资料检索梳理](../资料检索逻辑梳理与search-harness-20261106/README.md)

---

## 0. 先回答你的三个"不确定"

| 你的判断 | 证据 | 结论 |
|---|---|---|
| "设置 role-prompt 会让输出更稳定" | 同一模版 `comprehensive` 的 7 份报告，**5 种不同章节结构**；字数 3438–8914（2.6 倍差）；标题 9–17 个 | **role-prompt 没带来稳定**。但原因不是"role 无效"，而是**当前没有任何东西检查它**（`valid()` 只看 `#`、`##`、`[n]` 和引用有效性，不看模版章节） |
| "专家能根据具体任务做优化" | 任务差异已由 `task1_qa/task2_compare/task3_assess/task4_report.md` + 9 个模版 + `intelligence.py` 的 5 个 `PURPOSES` 表达 | **这一层已经饱和**。专家再加一层"按任务分工"是第三套重复表达 |
| "能少一些就少一些" | 4 席中 2 席生产调用点为 0；选席是一个布尔表达式；`AGENT.md` 5 节只读 1 节（23–30% 字数） | **成立**。当前 4 席 ≈ 1 个角色 × 1 个任务开关 |

---

## 1. 纯 RAG 之外，专家系统真正能提供的只有 4 件事

下面每一条都标了"当前是否已实现"和"证据"。没实现的不算收益。

### A. 把"散文要求"变成"可断言契约"（**最大收益，当前完全没做**）

RAG 只管"找到材料 + 塞进上下文"，它管不了输出**形态**。而本项目对形态有硬要求，现在全靠模型自觉：

| 要求 | 出处 | 当前校验 | 真实遵守情况 |
|---|---|---|---|
| 关键结论必须 `[n]` 引用 | `base.md` 2/9 | `validate_citations` | 12 份报告全有引用（除了 1 份 `period_summary`，本就不是报告） |
| 回答末尾给「资料范围与局限」 | `base.md` 9 | 无 | chat 7 份有正文，**86%** 遵守 |
| 事实与研判分段 | `task3_assess.md`、`stock-analyst` 硬要求 | 无 | 唯一一份技术研判报告：章节是「事实基础 / 推断方向 / 不确定性与前提」，**"研判"一词出现 0 次**，模版要求的「三、研判意见与依据」被写成「二、推断方向与依据」 |
| 按模版章节组织 | 9 个模版 | 无 | `comprehensive` 7 份中 5 份缺「五、四维技术图谱」；有 1 份缺 3 章 |
| 缺失单列 | `stock-analyst` 硬要求 | 无 | 未统计（无结构可查） |
| 对比至少两个对象 | `task2_compare.md` | 无 | 未统计 |

**这是唯一"RAG 结构上做不到、而专家系统天然该做"的事**：RAG 的输出是自由文本，专家系统的价值在于给自由文本套一层**可执行的验收**。

现在的 `AGENT.md` 里已经有最接近这一层的内容——每席的「开口必须包含」4 条，例如 stock-analyst 的：
- 所选资料库和范围。范围为空就停止补充
- 结论。结论写在事实之前
- 事实与研判已经分开；研判带「判断」字样
- 缺失和冲突单独成段

**这 4 条一句都没进 prompt**（代码只读 `## 职责`），更没有对应检查。把它变成 4 个可跑的函数，就是专家系统的第一个真实收益。

### B. 把"用户反复修改的地方"沉淀成默认（**当前完全没做**）

本项目已具备做这件事的全部素材，只是没接起来：

- `artifacts.generated_version` 与 `current_version` 是分开存的（`src/artifacts.py:83`），**能精确 diff「模型生成」与「用户改后」**；
- 但全仓没有任何代码比较这两个值，`grep generated_version` 只出现在导出与迁移；
- 真实数据：12 份报告，**用户编辑过 0 份**（12 份都是 `current_version == generated_version`）。

也就是说：**这个机制现在是空的，但它是对的机制**。一旦有人真改报告，"改了什么"就是最可靠的偏好来源——比"点一次「以后都这样」"可靠得多，因为它有具体的 diff。

### C. 让同一账户的输出**可预期**（**当前反向**）

你的直觉"role-prompt 让输出更稳定"，在数据上是**反的**：同一模版同一账户，章节结构 5 种、字数 2.6 倍差。
但这不是"专家没用"，而是**专家块在 SystemMessage 里只有 466 字，且位置在 1569 字任务契约之前**（`src/reports.py:363`：`expert_prefix + task_instruction(...)`）——模型先看到 466 字的"角色描述"，再看到 1569 字的"硬契约"，后者压倒前者。专家块的**位置与权重**都不足以产生稳定作用。

这一条的收益是：**把专家从"最前面的一段描述"改成"最后面的一组检查"**，稳定性来自验收而不是来自叙述。

### D. 领域约束的**单点维护**（**当前重复三处**）

"事实与研判分开"这件事现在写在三个地方：
1. `task3_assess.md`（任务提示词）
2. `templates/future_directions.md`（模版章节）
3. `stock-analyst/AGENT.md` 硬要求

三处措辞不同、互相不引用。真实报告证明三处都没生效。专家系统如果做对了，应该是**一处定义、一处检查**，而不是第三份散文。

---

## 2. 专家系统**做不到**的（不要指望）

| 期待 | 为什么做不到 |
|---|---|
| 提高检索召回 | 检索是确定性 BM25 + 规则（见检索梳理文档），专家不参与选文档 |
| 让模型"更懂"领域 | 领域知识在资料里，不在 prompt 里；prompt 里的领域描述无法验证，只会挤占上下文 |
| 减少幻觉 | 幻觉的闸门是 `validate_citations` + "只依据已读原文"，这两条已在 `base.md`，与专家无关 |
| 替代任务模版 | 任务模版管"写什么结构"，专家若也管结构就是重复（见 §1-D） |
| 自动学会用户风格 | 现在的 `report.shape` 只学"字数/标题数"，且因 P0-1 永不加载；学到的也只是形状，不是风格 |

---

## 3. 收敛建议：**1 席 + 1 套检查 + 1 条沉淀通道**

你的倾向（少而必要）与证据一致。具体：

```
.agents/experts/research-analyst/
  AGENT.md              ← 只留：这个角色是谁、不做什么（≤400 字，进 prompt）
  checks.yaml           ← 机读断言，每条绑定一个已存在的确定性检查
```

**`AGENT.md` 只保留现在四席里真正"因角色而不同"的内容**（我从四席 114 条里挑出的、不是任何任务提示词能表达的）：

| 保留 | 来自 | 理由 |
|---|---|---|
| 结论先行、范围写开头 | stock | 任务提示词没有这条 |
| 事实/研判分段，研判带「判断」 | stock | 唯一有真实失败证据的约束（§1-A） |
| 缺失单列，冲突并列不裁定 | stock | 任务提示词没有 |
| 不把"资料里没提到"写成"不存在" | stock 边界 | `base.md` 第 5 条有相近表述，但这条更具体 |
| 范围外不补对照对象 | stock 硬要求 | 直接影响检索与引用 |

intel-analyst 的"事实/自述/推断三分"**保留为一条模式**（`task_type=intelligence` 时启用），不单独成席——因为它现在实际由 `intelligence.py:275` 的独立 system 实现，专家席根本没参与。

`project-application`、`corpus-ingest`：**移出席位表**，文件留 `.agents/experts/archive/` 作为未来素材。理由：0 生产调用点；写申请书不在产品范围；入库清洗已由 `parsers.py` 的确定性检查实现（`low_coverage`、页数校验、重复检测）。

**`checks.yaml` 的第一批 5 条**（全部绑定已有或十行可写的检查）：

```yaml
- id: citations_valid        # 已有：agent/evidence.validate_citations
- id: template_sections      # 新写：实际 ## 标题 ⊇ 模版章节（允许措辞差异，做归一化匹配）
- id: scope_and_limits       # 新写：输出含「资料范围/样本/局限」段落
- id: fact_vs_judgment       # 新写：研判类任务须有独立的研判章节，且研判章节含「判断/推断/置信度」
- id: missing_listed         # 新写：命中不足时输出含「缺失/未覆盖」
```

**`checks.yaml` 不通过怎么办**：报告生成已经有一次 repair 重试（`src/reports.py:406`），把 checks 失败的原因喂给 repair，而不是像现在只说"标题、章节或来源编号问题"。这直接复用现有机制，不新增调用。

**沉淀通道只留一条**：`generated_version` vs `current_version` 的 diff。用户改报告 → 后台算出"改了哪几类"（删了哪章、加了什么措辞）→ 存为 `run_feedback(kind="edit")` → 达到阈值后提示"要不要以后都这样" → 用户确认才写偏好。这条比现在"点一次就写偏好"可靠，且有具体证据可查。

---

## 4. 收益的量级（诚实版）

| 收益 | 可量化 | 量级 |
|---|---|---|
| 报告章节符合模版 | 现在 5/7 份不完整（comprehensive）→ 目标 7/7 | 高，可验收 |
| 事实/研判分段 | 现在 1/1 失败 → 目标 1/1 | 高，可验收 |
| 用户修改沉淀为偏好 | 现在 0 份编辑、0 条偏好 | 中，需要真实用户先用 |
| 输出稳定性 | 章节 5 种 → 目标 1–2 种 | 中高 |
| 代码量 | 现在 2227 行 → 目标 ~800 行 | 反向收益 |

**最诚实的说法**：专家系统在本项目的最大价值不是"让模型更聪明"，而是**"让输出可验收"**。它解决的是"模型写了但不符合要求，没人发现"这个问题——这在 12 份真实报告里已经发生（5/7 模版不完整、1/1 研判分段失败）。

---

## 5. 需要你决定的（比上次更窄）

1. **同意"1 席 + checks.yaml"这个形态吗**？（如果不确定，我可以先只做 `checks.yaml` + 保留现有 4 席不动，看检查能不能跑通——这是最小验证）
2. **`project-application` / `corpus-ingest` 移出席位表**可以吗？（文件保留，只是不进 prompt、不进界面）
3. **沉淀通道只认 diff 不认"点一下"**可以吗？（现在报告页的「以后都这样」按钮会被替换或保留为辅助）
4. 先做"最小验证"（只加 checks + 修 P0，不动席位数），还是直接收敛到 1 席？

---

## 6. 证据脚本

```bash
cd /home/mvr/wslcodespace/dox_agent
.venv/bin/python - <<'PY'
import sqlite3, glob, re, json, statistics
A = glob.glob(".knowledge/.state/artifacts/*.sqlite3")[0]
R = glob.glob(".knowledge/.state/runs.sqlite3")[0]
E = ".knowledge/.state/experts.sqlite3"

a = sqlite3.connect(A)
TPL = ["一、研究范围与资料来源","二、主要成果","三、热点与趋势","四、未来方向（推断）","五、四维技术图谱","六、来源清单与局限"]
print("== 模版符合度（comprehensive 应 6 章）")
for aid, ver, params in a.execute("select id,current_version,report_params from artifacts where type='report'"):
    d = json.loads(params or "{}")
    if d.get("template_id") != "comprehensive": continue
    md = a.execute("select markdown from artifact_versions where artifact_id=? and version=?", (aid,ver)).fetchone()[0]
    h2 = [h.strip() for h in re.findall(r"(?m)^## (.+)$", md)]
    print(f"  {sum(t in h2 for t in TPL)}/6  {len(md)}字  缺 {[t for t in TPL if t not in h2]}")

print("== 用户编辑过的报告")
rows = a.execute("select current_version, generated_version from artifacts where type='report' and generated_version is not null").fetchall()
print(f"  {len(rows)} 份中编辑过 {sum(1 for c,g in rows if c!=g)} 份")

print("== 专家真实数据")
e = sqlite3.connect(E)
for t in ("expert_preferences","expert_candidates","expert_skills","run_feedback"):
    print(f"  {t}: {e.execute(f'select count(*) from {t}').fetchone()[0]}")

print("== 有 expert provenance 的 run")
r = sqlite3.connect(R)
print("  ", sum(1 for (p,) in r.execute("select payload from runs") if json.loads(p).get("expert")))

print("== chat 遵守「资料范围与局限」")
ok = tot = 0
for (p,) in r.execute("select payload from runs where run_type='chat' and status='completed'"):
    parts=[]
    for chunk in (json.loads(p).get("replay") or []):
        for line in str(chunk).splitlines():
            if line.startswith("data: "):
                try: o=json.loads(line[6:])
                except ValueError: continue
                if isinstance(o,dict) and isinstance(o.get("text"),str): parts.append(o["text"])
    text="".join(parts)
    if not text: continue
    tot += 1; ok += "资料范围与局限" in text
print(f"  {ok}/{tot}")
PY
```
