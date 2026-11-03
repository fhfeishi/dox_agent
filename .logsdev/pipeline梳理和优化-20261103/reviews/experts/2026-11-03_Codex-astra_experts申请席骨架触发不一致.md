# Codex-astra experts medium: application skeleton trigger inconsistency

- **time**: 2026-11-03 09:14 Asia/Shanghai
- **session id**: 01a19ef7-da39-7291-8bf0-768ebb45212b
- **model / effort**: gpt-6-astra / low
- **sandbox**: read-only
- **cwd**: /home/mvr/wslcodespace/dox_agent
- **HEAD**: b5fa3f9
- **nature**: readonly review

- **NEW · Medium — 申请席通用骨架的触发条件不一致。** `.agents/experts/project-application/AGENT.md:15` 要求有用户文字规范时按文字写；`.agents/experts/project-application/AGENT.md:16` 和 `.agents/experts/project-application/AGENT.md:45` 仅在没有规范时启用八项骨架，但 `.agents/experts/project-application/AGENT.md:20` 将条件写成“没有正式指南”。**触发：**用户只提供文字规范，例如指定三章；此时同时命中“按三章写”和“没有正式指南时的八项骨架”，可能错误增补章节。最小修正：骨架条件统一为“既无指南文件，也无用户文字规范”。**blocks-impl?** 仅阻塞该回退条件的无歧义实现／验收，不阻塞其他工作。

证据来自当前工作树静态核对；未改文件、未运行测试，不声称已发生运行时错误。
