# Cleanup log

Removed items, why, and how to get them back. Base commit for every restore below: `4ce4616`
(`quality-pilot`, right after the Q1 command-injection fix). Background: Baha's review of
2026-10-18, finding F4 and quick-win Q3.

| Date | Removed | Old location | Why | Restore |
|---|---|---|---|---|
| 2026-10-19 | `src/agent/quick.py` (`use_quick`, `verify`) | `src/agent/quick.py` | Imported `ResearchReport` / `validate_report`, which `evidence.py` no longer has, so importing it always failed. Nothing imported it; 0% coverage. | `git show 4ce4616:src/agent/quick.py` |
| 2026-10-19 | Settings `max_research_steps`, `max_rounds`, `evidence_routing`, `max_searches`, `max_reads`, `model_context_tokens`, `answer_reserve_tokens`, `research_timeout` | `src/agent/config.py` (class `Settings`) | Left over from the old research loop; no code outside `config.py` read them, so changing them did nothing. Old values in a user's `.env` are ignored (`extra="ignore"`), so nothing breaks. | `git show 4ce4616:src/agent/config.py` |
| 2026-10-19 | Dependency `deepagents>=0.7.8,<0.8` | `pyproject.toml` `[project].dependencies` (and `uv.lock`) | Never imported anywhere in `src/` or `tests/`. Also dropped "Deep Agents" from the project description. | `git show 4ce4616:pyproject.toml`, then `uv lock` |
| 2026-10-19 | `.env.example`: `MINERU_API_KEY`, `MAX_RESEARCH_STEPS`, `MAX_ROUNDS`, `EVIDENCE_ROUTING`, `MAX_SEARCHES`, `MAX_READS`, `RESEARCH_TIMEOUT`, `QUICK_VERIFICATION` | `.env.example` | No code reads them (the first is for an unused cloud API, the last had no setting at all, the rest are the settings above). | `git show 4ce4616:.env.example` |

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
