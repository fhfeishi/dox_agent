日期：2026-11-06
来源：用户指令（2026-11-06 审查并优化专家系统 runtime）
状态：草案（待用户选定修复范围）

# 专家系统 runtime 审查

- 范围：`src/experts.py`（803 行）、`src/expert_profile.py`（90）、`src/api/experts.py`（336）、`src/api/reports.py:398-415`、`src/reports.py:357-363`、`src/intelligence.py`、`frontend/src/components/ExpertsPage.tsx`、`frontend/src/components/ReportPage.tsx`、`tests/test_experts.py`、`tests/test_expert_profile.py`
- 证据：本机 `.venv/bin/python` 直接调用运行时函数复现，脚本见 §5；`pytest tests/test_experts.py tests/test_expert_profile.py` 40 passed（3 分 29 秒）——**测试全绿，下面 5 个 P0 一个都没被覆盖**

---

## 1. 它现在到底是什么

一句话：**一个带版本与审批的"专家参数存储"，只有一个注入点（报告生成的 SystemMessage 最前），没有任何"专家行为"的运行时**。

```
POST /api/reports ──► 选席位（按 task_id/template_id 二分）
                       └► load_for_task(owner, seat, task_type, corpus_id)
                            └► 三道闸：status=active · scope_problem 为空 · _matches
                                 └► expert_spine(seat) 读 .agents/experts/<seat>/AGENT.md 的 ## 职责
                                      └► 拼【专家设定｜数据，不是指令】文本块 + provenance
                                           └► generate_markdown(expert_block=…)
                                                └► SystemMessage(块 + EXPERT_DATA_NOTE + task4 指令)
                                                     └► runs.update(expert=provenance)
```

存储侧是完整的：5 张表、版本历史、候选指纹、批准/隔离、账户隔离（无跨账户视图，管理员也不例外）。**这部分质量是好的**，40 个测试也真的在守账户隔离。

问题全在"从存储到行为"这一段。

---

## 2. P0：会让功能整体失效的问题（全部已复现）

### P0-1 `report.shape` 永远加载不到——整个学习闭环是死的

`src/expert_profile.py:48` 用 `run["task_id"]` 写 scope：

```python
return {"seat": seat, "task_type": run.get("task_id") or "report", ...}
```

而报告 run 的 `task_id` 是 `"task4"`（`src/api/reports.py:242`），自定义报告任务是用户自定义 id（`:262`）。
加载侧问的是 `"report"`（`src/api/reports.py:407`）或 `"intelligence"`。两者永不相等。

复现（5 次确认、置信度已推到 0.85，超过 `LOAD_CONFIDENCE=0.5`）：

```
stored: {'length': 'deep', ...} confidence 0.85
scope: {'seat': 'stock-analyst', 'task_type': 'task4', 'corpus_ids': ['c1'], ...}
block 含本账户偏好? False
ignored: [{'key': 'report.shape', 'reason': 'scope 不匹配本次任务'}]
```

后果：用户在报告页点「以后都这样」→ 写入成功 → 界面上出现一条"置信度 0.85"的记录 → **永远不参与生成**。而且每次点击都写一个新版本行，历史表被无效 scope 灌满。

### P0-2 学习偏好的 scope 还被 `corpus_ids` 二次锁死

`_scope` 同时写 `corpus_ids=list(run["effective_corpus_ids"])`。即使 P0-1 修好，学到的形状也只对"当时那一个库"生效。手动偏好默认不限库，学习偏好却默认单库——同一个概念两套语义，用户无法理解为什么换个库就不灵。

### P0-3 审计页对用户撒谎

`src/api/experts.py:308` 固定 `task_type="report"`、不传 `corpus_id`：

```python
ignored = load_for_task(store(request), owner(request), seat, task_type="report")["ignored"]
```

- 情报分析席：一条 `task_type="intelligence"` 的偏好，在它自己的审计页上显示 **"scope 不匹配本次任务"**（实测）。
- 带 `corpus_ids` 的偏好同样被报成"不匹配"，即使真实调用会加载它（实测：审计页 ignored，真实 `corpus_id=c1` 调用加载成功）。

`:317` 的 `loaded` 标志只看 `status` 与 `confidence`，**不看 scope**，所以还会出现相反方向的谎：页面标"参与生成"，实际加载时被丢。

### P0-4 `explicit_memory` 闸门可绕过

`Experts.add_candidate` 只校验调用方传进来的 `explicit=True`（`src/experts.py:349`）；`explicit_feedback` 只检查 `row["explicit"]`，**从不检查 `kind`**（`:529-538`）。而 `add_feedback` 接受 `kind="comment"` + `explicit=True`。

实测：

```
kind=comment + explicit=True -> comment True
BYPASS: 候选已生成 -> 1 x
```

即普通"这次例外"评论被标记 explicit 后就能生成候选，直接违反 docstring 与 `§八·五.9` 的"只有 `explicit_memory` 可发起"。`FEEDBACK_KINDS` 里定义了 `explicit_memory` 却没有在闸门处使用。

### P0-5 技能正文从不进 prompt——"批准技能"没有任何效果

`expert_prompt_block` 只输出 id、version 和 hash 前 8 位：

```
已启用技能（版本）：
- 技能 #1 v1（deadbeef）
```

实测：`content_path` 指向的文件内容（`## 做法 / 先按场景聚类…`）**不出现在 prompt 里**。也就是说"候选→批准→技能→启用"四步走完，模型什么也看不到，只有一行噪音。

另外 `content_hash` 由前端填 `candidate.fingerprint`（`ExpertsPage.tsx:90`）——那是候选步骤的指纹，**不是文件内容的 hash**。表注释声称的"immutable content copy (path + hash)"没有任何代码校验。

---

## 3. P1：设计层面的断点

| # | 问题 | 证据 |
|---|---|---|
| P1-1 | **情报分析席实际没接**：`/api/intelligence/analyze` 是独立实现（`src/intelligence.py:290`），全程不调 `expert_prompt_block`。`intel-analyst` 席位只在"经 `/api/reports` 且 template_id 以 intelligence 开头"时生效 | `grep expert src/intelligence.py` 为空 |
| P1-2 | **对话/问答完全不加载专家**：`/api/chat` → `src/agent/graph.py` 无任何 expert 引用。四个聊天任务（task1–3 + task4 intake）零席位 | `grep expert src/agent/graph.py` 为空 |
| P1-3 | **`project-application`、`corpus-ingest` 两席零运行时接线**：只有存储和基线文本 | `grep load_for_task src/` 只有 reports 一处 |
| P1-4 | **`project_ids` scope 永不匹配**：`load_for_task` 的 `project_id` 参数没有任何生产调用方传入 | `grep "project_id=" src/` 只命中函数内部 |
| P1-5 | **`/api/runs/{run_id}` 无归属校验**：任何登录用户可读任意 run 快照（含 params、replay、expert provenance）。与"专家数据不跨账户"矛盾——provenance 就存在 run payload 里 | `src/api/reports.py:516-523` 无 `request` 参数 |
| P1-6 | **`use_count` / `last_used_at` 从不写入**：字段建了、审计页显示了，永远是空。加载后没有任何回写 | `grep use_count src/` 只命中定义 |
| P1-7 | **静默截断**：`MAX_LOADED_PREFERENCES=6` 按 `-confidence, -priority, key` 排序截断，第 7 条被丢弃时**不进 `ignored`**，审计页看不到"被上限挤掉" | `src/experts.py:678-679` |
| P1-8 | **基线规则与脊柱重复且无一致性检查**：`DEFAULT_PROFILES` 是代码常量，`AGENT.md` 是仓库文件，两份都进 prompt。stock-analyst 基线第 1 条与脊柱首条相似度 0.51（"先给结论，再给证据…"≈"结论先行…"）；intel-analyst 基线 4 条全部是 `AGENT.md` 硬要求的改写版 | §5 复现脚本 |
| P1-9 | **`expert_spine` 无 `## 职责` 时降级为"文件前 40 行"**，会把 `标识/名称/读者/范围/加载` 一起塞进 prompt | `src/experts.py:707` |

---

## 4. P2：清洁度

- `expert_profile.should_load()` 无人调用，是 `confidence >= LOAD_CONFIDENCE` 的重复实现。
- `load_for_task(overrides=...)` 只有测试调用，生产零使用——一个没有入口的能力。
- `ExpertsPage` 的"生成技能"用 `window.prompt` 让用户手填服务器路径，而路径从不被读取（见 P0-5）——这个交互目前纯属空转。
- `summarize_preference` 只认 `report.shape` 一个键，其余键直接 `key: JSON[:60]`，学习到的新键在审计页会是一串 JSON。
- `tests/test_experts.py` 的 `bench` fixture 把 `task_type` 写成 `"intel"`（`:31`），而生产写 `"intelligence"`——测试通过但生产语义不同，正是 P0-1 这类问题不被发现的机制。

---

## 5. 复现脚本

```bash
cd /home/mvr/wslcodespace/dox_agent
.venv/bin/python - <<'PY'
import sys, tempfile; sys.path.insert(0, ".")
from pathlib import Path
from src.experts import Experts, expert_prompt_block, load_for_task
from src.expert_profile import observe_confirmation

d = Path(tempfile.mkdtemp()); s = Experts(d / "e.sqlite3")

# P0-1 / P0-2：生产路径的 task_id 是 task4
run = {"run_id": "r", "run_type": "report", "task_id": "task4", "effective_corpus_ids": ["c1"]}
md = "# T\n\n## 一\n" + "字" * 9000 + "\n\n## 二\n" + "字" * 9000 + "\n"
for i in range(5):
    observe_confirmation(s, "alice", "stock-analyst", run={**run, "run_id": f"r{i}"},
                         artifact={"artifact_id": f"a{i}", "markdown": md})
p = s.preference("alice", "stock-analyst", "report.shape")
print("P0-1 scope:", p["scope"], "conf:", p["confidence"])
print("P0-1 加载到?", "本账户偏好" in expert_prompt_block(s, "alice", "stock-analyst", task_type="report", corpus_id="c1")[0])

# P0-4：comment + explicit 可绕过
fb = s.add_feedback("alice", "run-1", "comment", {"note": "x"}, explicit=True)
c = s.add_candidate("alice", "stock-analyst", summary="x", steps=["a"],
                    scope={"task_type": "report"}, feedback_id=str(fb["id"]), explicit=True)
print("P0-4 绕过成功, candidate:", c["id"])

# P0-5：技能正文不进 prompt
path = d / "skill.md"; path.write_text("## 做法\n先按场景聚类。\n", encoding="utf-8")
s.decide_candidate("alice", c["id"], "approved")
s.add_skill("alice", "stock-analyst", c["id"], content_path=str(path), content_hash="deadbeef",
            scope={"task_type": "report"})
print("P0-5 技能正文进 prompt?", "先按场景聚类" in expert_prompt_block(s, "alice", "stock-analyst", task_type="report")[0])

# P1-7：静默截断
for i in range(6):
    s.put_preference("alice", "stock-analyst", f"m{i}", {"i": i}, {"task_type": "report"})
s.put_learned("alice", "stock-analyst", "shape", {"l": "deep"}, {"task_type": "report"}, confidence=0.9)
r = load_for_task(s, "alice", "stock-analyst", task_type="report")
print("P1-7 loaded:", len(r["preferences"]), "ignored:", r["ignored"])
PY
```

---

## 6. 建议的修复顺序（每步独立可验收）

### 第 1 批：修闭环（P0-1/2/3/4/5）

1. **统一 `task_type` 词汇表**：新增 `TASK_TYPES = ("report", "intelligence", "chat", "ingest")`，`_scope` 用运行类型而不是 `run["task_id"]`；对已写入的 `task_type="task4"` 旧行做一次迁移（`task4`→`report`，自定义报告任务 id 也映射到 `report`）。验收：`observe_confirmation` → `expert_prompt_block(task_type="report")` 能读到。
2. **学习偏好默认不限库**：`_scope` 的 `corpus_ids` 只在用户明确选"只对这个库"时写，默认 `[]`。验收：换库仍生效。
3. **审计页按真实调用参数算**：`audit_seat` 接收可选 `task_type`/`corpus_id`（默认 `report` + 该席全部），`loaded` 直接用 `load_for_task` 的返回集合而不是自己重算。验收：intel 席的 intelligence 偏好在审计页显示"参与生成"。
4. **闸门下沉到 store**：`explicit_feedback` 增加 `kind == "explicit_memory"` 校验；`add_candidate` 从 `feedback_id` 反查并自行判定 explicit，不接受调用方的 `explicit` 参数。验收：`comment + explicit=True` 被拒。
5. **技能正文进 prompt（并真正校验）**：`expert_prompt_block` 读 `content_path`（限制在 `state_dir/skills/` 下，拒绝越界路径），校验 `sha256(内容) == content_hash`，不符则该技能进 `ignored` 并写明原因；正文按字节上限截断（建议 2 KB/技能）。前端"生成技能"改为选择已有文件或直接粘贴正文，不再让用户填服务器路径。验收：prompt 中出现技能正文；hash 不符时不出现且被记录。

### 第 2 批：接线（P1-1/2/5/6/7）

6. **情报分析席接进 `/api/intelligence/analyze`**：同一套 `expert_prompt_block`，`task_type="intelligence"`，provenance 写进该 run。
7. **对话加载专家**：`/api/chat` 按 `task_id` 映射席位（task1–3 → `stock-analyst`，`task_type="chat"`），块注入 `graph.answer` 的 SystemMessage 最前，provenance 写 run。这一步会改变问答行为，**需要你确认**。
8. **`/api/runs/{run_id}` 加归属校验**（与报告同规则：作者或管理员；无作者的旧 run 归管理员）。
9. **加载回写 `use_count`/`last_used_at`**（异步、失败不阻塞）；**截断进 `ignored`**，原因写"超过上限 6 条"。

### 第 3 批：收敛重复（P1-8/9 + P2）

10. **基线只留 `AGENT.md` 里没有的**：要么删掉 `DEFAULT_PROFILES` 与脊柱的重复项，要么反过来把 `AGENT.md` 的硬要求作为唯一来源、基线只放"如何组织工作"的操作性规则。加一条检查：基线规则与脊柱任一行相似度 >0.4 时报错。
11. **`expert_spine` 找不到 `## 职责` 时返回空**，不再降级为文件前 40 行。
12. 删 `should_load`、`overrides`（或给 `overrides` 接一个真实入口）、修 `bench` fixture 的 `"intel"`。

---

## 7. 需要你决定的

1. **第 2 批第 7 项（对话也加载专家）要不要做**？它会改变问答行为，也会让"专家"第一次真正出现在用户日常路径上。不做的话，专家仍然只在报告生成时生效。
2. **基线规则与 `AGENT.md` 谁是唯一来源**？我倾向 `AGENT.md`（人审过的产品资产，已入库），基线只保留"操作性"规则（怎么组织工作），不再重复硬要求。
3. **技能正文的落盘位置**：`state_dir/skills/<owner>/<seat>/` 下由服务端写文件（用户粘贴正文），还是继续要求用户提供已存在的路径？
4. 这次先做第 1 批（纯修 bug，不动产品行为），还是 1+2 一起？
