# Codex-astra experts/AGENTS 一致性 skim

> Heli night window 2026-11-03 ~01:04 Asia/Shanghai 额度消化
>
> - **session id**: 01a19d4c-a54c-7232-b752-1e875849c53b
> - **model**: gpt-6-astra (model_reasoning_effort=low)
> - **sandbox**: read-only
> - **cwd**: /home/mvr/wslcodespace/dox_agent (main)
> - **saved**: 2026-11-03 01:28 Asia/Shanghai
> - **tokens used** (from log): 125,652

---

## 元数据
- 时间：2026-11-03（Asia/Shanghai）；分支 `main`，HEAD `b5fa3f9`。
- 范围：指定七份文件及相关规则；对照上一轮 experts-boundary 报告去重。
- 方式：只读语义审查；未改文件、未运行测试或校验器，不判断运行时实现。

## 对齐点（简）
- 四席职责、资料范围、不得代替资料审查及不自动修改资料库的边界基本一致，未发现直接互斥要求。
- `AGENTS.md:52` 已明确四席并指向当前 `LEARNING.md`，未见旧三席或旧学习路径残留。
- 申请三态、无指南直接给骨架、文件与文字冲突先确认均已明确，见 `.agents/experts/project-application/AGENT.md:13`。人工维护、不自动装载学习草稿也已对齐。

## NEW 不一致 / 缺口
**1. 中：单席读取契约未完整带入学习边界。**
- `.agents/experts/README.md:5` 要求使用时只读该席 `AGENT.md`；四席也重复这一加载限制。
- 但“不经用户要求，不把对话写进席位”仅在 `.agents/experts/LEARNING.md:16` 明示，四席末尾均未携带这一条件，也未要求学习操作前读取该文件。
- 申请席另有门槛遗漏：`.agents/experts/project-application/AGENT.md:64` 只写完成一次完整写作后人工提炼；`.agents/experts/LEARNING.md:9` 还要求经过用户使用、提炼反复成功的步骤。
- **影响：**全套阅读能得到较严格边界，但按“只读单席”执行时，可能把写完或收到反馈误当成足以持久化、晋升的条件。这是规格传递缺口，不是已证实的自动学习行为。

## 建议优先级（最多 3 条，不改码）
- **P2：**四席统一增加简短学习入口：涉及保存反馈或提炼步骤时先读 `LEARNING.md`；明确普通反馈不等于保存授权。保留具体门槛在唯一正文，避免复制后再次漂移。

## 一句话结论
四席与入口规格已基本对齐，本轮仅发现“只读单席”与集中学习规则之间的传递缺口，未发现新的职责硬冲突。
