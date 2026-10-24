# Cleanup log

Removed items, why, and how to get them back. Each restore command names the commit just before
the removal: `4ce4616` (after the Q1 fix) for the F4/Q3 rows, `9f76318` (after Q3) for the F6/Q4 row.
Background: Baha's review of 2026-10-18, findings F4/F6 and quick wins Q3/Q4.

| Date | Removed | Old location | Why | Restore |
|---|---|---|---|---|
| 2026-10-24 | 过期的领域全景实施任务记录 | `.logsdev/tasks/task-领域分析全景实施-20261021.md` | R7：头部“已回退”与后续261560d等已上线实现不符，旧组件名与像素阈值会误导接续。统计边界与仍有效的触屏/投屏/首次阅读及首屏位置待验收转入PROJECT §1；当前实现由代码/测试承接。 | `git show 847ff34:.logsdev/tasks/task-领域分析全景实施-20261021.md` |
| 2026-10-23 | 旧01积累图与专用说明组件及未再引用的样式 | `frontend/src/components/LibraryTerrain.tsx`、`CaliberPop.tsx`，`styles/globals.css` 的旧图专用段 | 用户采纳年度带原型，整体由 `atlas/DomainLens.tsx`、`YearBand.tsx` 替换；共享预览样式保留，成熟度名称改读 `domains.ts` | `git show 67d3656:frontend/src/components/LibraryTerrain.tsx`（说明组件同提交） |
| 2026-10-19 | `src/agent/quick.py` (`use_quick`, `verify`) | `src/agent/quick.py` | Imported `ResearchReport` / `validate_report`, which `evidence.py` no longer has, so importing it always failed. Nothing imported it; 0% coverage. | `git show 4ce4616:src/agent/quick.py` |
| 2026-10-19 | Settings `max_research_steps`, `max_rounds`, `evidence_routing`, `max_searches`, `max_reads`, `model_context_tokens`, `answer_reserve_tokens`, `research_timeout` | `src/agent/config.py` (class `Settings`) | Left over from the old research loop; no code outside `config.py` read them, so changing them did nothing. Old values in a user's `.env` are ignored (`extra="ignore"`), so nothing breaks. | `git show 4ce4616:src/agent/config.py` |
| 2026-10-19 | Dependency `deepagents>=0.7.8,<0.8` | `pyproject.toml` `[project].dependencies` (and `uv.lock`) | Never imported anywhere in `src/` or `tests/`. Also dropped "Deep Agents" from the project description. | `git show 4ce4616:pyproject.toml`, then `uv lock` |
| 2026-10-19 | `.env.example`: `MINERU_API_KEY`, `MAX_RESEARCH_STEPS`, `MAX_ROUNDS`, `EVIDENCE_ROUTING`, `MAX_SEARCHES`, `MAX_READS`, `RESEARCH_TIMEOUT`, `QUICK_VERIFICATION` | `.env.example` | No code reads them (the first is for an unused cloud API, the last had no setting at all, the rest are the settings above). | `git show 4ce4616:.env.example` |
| 2026-10-19 | Automatic read of the parent directory's `.env` (`DOX_AGENT_ROOT.parent / ".env"`) | `src/agent/config.py` (`Settings.model_config.env_file`) | F6/Q4: a stray `.env` one level up could silently change settings. Checked before removing: no such file existed next to either checkout (`/home/mvr/wslcodespace/.env`, `D:\chyCodespace\.env`). Replaced by opt-in `DOX_ENV_FILE`. | Set `DOX_ENV_FILE=<parent>/.env` (same priority as before), or `git show 9f76318:src/agent/config.py` |

`uv.lock` was regenerated with `uv lock --offline` (no version changes). Besides `deepagents` it dropped
11 packages only `deepagents` pulled in: anthropic, bracex, docstring-parser, filetype, google-auth,
google-genai, langchain-anthropic, langchain-google-genai, pyasn1, pyasn1-modules, wcmatch. None of them
is imported by `src/` or `tests/`.

## Fixed rather than removed

| Date | Item | Change | Old version |
|---|---|---|---|
| 2026-10-19 | `python -m src.cli ask "<question>"` | Passed the old `rounds`/`evidence` state and read `result["evidence"]`, which the graph no longer returns (raised `KeyError: 'evidence'`). Now streams the current graph and takes sources from its `sources` event. Covered by `tests/test_cli.py`. | `git show 4ce4616:src/cli.py` |

## Looked at but kept

| Item | Where | Why it stays |
|---|---|---|
| Legacy graph inputs `rounds`, `evidence`, `searches`, `report`, `blocked` | `src/main.py`, the `graph.astream({...})` call in `/api/chat` | The graph ignores them, but `tests/test_app.py::test_chat_rejects_client_research_state_and_starts_fresh` asserts they are passed in fresh each turn. Removing them means changing that test, which needs a decision first. |

`tests/test_hygiene.py` checks that these do not come back: every module imports, every
setting is read, every `.env.example` key is read, every declared dependency is imported, and
no file except `src/main.py` is over 800 lines.

## Q1 浏览器流程清理（2026-10-19）

恢复基线为 0744bcc；使用 git show 0744bcc:tests/<文件名> 恢复单个脚本。本次不删除任何用户资料。

| 删除脚本 | 原流程与理由 | 现行覆盖 |
| --- | --- | --- |
| browser_prompt_skills_live.py | Prompt/Skill 独立页面已取消，脚本依赖已删除的导航入口 | 资产接口契约仍由 pytest 检查；不表示恢复隐藏页面 |
| browser_library.py | 旧库详情 Drawer、设置页 CRUD 和选库布局被原位资料管理替代 | browser_library_documents / browser_analysis_workspace；分组在 browser_artifacts_live |
| browser_ui_shell.py | 旧左栏与底栏布局断言，当前顶栏架构已替代 | browser_review_simple 的稳定导航、角色、窄屏检查 |
| browser_tasks.py | 功能开关时期的任务绑定旧入口，被先选资料的工作区替代 | browser_analysis_workspace / browser_task_templates |
| browser_smoke.py | 依赖外部已运行 8011 端口，且使用旧设置入口 | check.sh full 启动临时服务；browser_export / browser_answer_controls |

没有删除仍有效的原文预览、网络快照、分支和范围恢复等能力测试。它们尚需迁移的具体问题登记在 [Q1 盘点](tasks/upgrade-Q1-20261019.md)。
