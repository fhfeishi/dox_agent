# archive — 已被取代的取数脚本

这些文件是 `scripts/acquire_nsfc_meta.mjs` 的早期版本，**不再是链路的一部分**，保留原因只有一个：它们此前未进 git（旧 `.cache` 与 `tools/` 目录都在忽略/未跟踪状态），直接删除不可恢复。

| 文件 | 说明 |
| --- | --- |
| `acquire_nsfc_meta_v1.mjs` | 单库版，默认目标 100 篇，候选池 `nsfc_candidates.json` |
| `acquire_nsfc_meta_v2.mjs` | 批量版，默认目标 500 篇，候选池独立；v3 在它基础上修正了「诊断」泛词误判领域 |
| `acquire_nsfc_meta_junk.tmp.mjs` | 探查写权限时留下的 108 字节空文件，无内容价值 |

注意：文件内的用法示例仍写着旧路径 `tools/...`，照抄会失败。要用请用 `scripts/acquire_nsfc_meta.mjs`。

确认 `scripts/` 版本可用后，整个 `archive/` 可以删除（`rm -rf datapipe/archive`）。
