#!/usr/bin/env bash
# One entry for the project's checks (upgrade plan card Q1, 2026-10-19).
#
#   scripts/check.sh quick   lint, Python tests, frontend tests, type check        (~3 min)
#   scripts/check.sh full    quick + frontend build + the browser smoke set         (~10 min)
#   scripts/check.sh all     full + every other browser journey script               (~20 min)
#
# Each browser script starts its own server on a free port with a temporary state directory and
# stand-in models, so `full` never touches .knowledge/.state or calls a real model. A failing step
# is reported and the remaining steps still run; the exit code is non-zero if any step failed.
# Passing these is a technical check only, not acceptance of a user journey (card A1).
set -uo pipefail
cd "$(dirname "$0")/.."
mode="${1:-quick}"
python=.venv/bin/python
failed=()

step() {  # step <name> <command...>
  local name="$1"; shift
  printf '\n== %s\n' "$name"
  local start=$SECONDS
  if "$@"; then printf -- '-- %s: ok (%ss)\n' "$name" $((SECONDS - start))
  else printf -- '-- %s: FAILED (%ss)\n' "$name" $((SECONDS - start)); failed+=("$name"); return 1; fi
}

# The browser scripts that cover the main journeys, chosen in Q1 (see .logsdev/cleanup-log.md).
SMOKE=(
  browser_review_simple        # login and roles, template preview, queued reviews, 成果, leave and return
  browser_library_documents    # library files, upload, scoped chat, year charts, leader and user homes
  browser_analysis_workspace   # main journey A: files to compared projects to a delivered report
  browser_artifacts_live       # report lifecycle: edit, versions, trash and restore
  browser_export               # report export
  browser_figures_live         # versioned figures, PDF and DOCX/ZIP
  browser_scene_hierarchy      # 技术研判 view, outcome radar
  browser_domain_lens          # 01/02 gestures, annual metrics, restoration and 1366–4K labels
  browser_answer_controls      # chat answer copy, retry, cancel and failure
  browser_run_detach           # G2-3: report survives a closed page; kill -9 → 已中断，可重试 → retry
)
# The remaining journeys, run by `all` so they cannot silently fall behind the interface again.
# browser_ui_shots is not a check: it photographs pages from a copy of the local libraries.
EXTRA=(
  browser_custom_tasks_live    # custom task and template versions, bound templates, drafts
  browser_review_flows         # formal and professional review, template copy and use, source reader
  browser_task_templates       # task and template cards, management entry
  browser_document_preview     # multi-page preview, raw toggle
  browser_markdown_preview     # Markdown tables, reading in a new window
  browser_fund_preview         # fund PDF preview, citation to the physical page
  browser_legacy_scope         # single and multi-library sessions restored
  browser_refresh              # per-library refresh, failures and partial state
  browser_session_branches     # answer branches, edit in place, restore
  browser_web_live             # web page snapshots and cited URLs
  browser_status_power         # service status and power control
  browser_target_facets        # research facets
)

case "$mode" in
  quick|full|all) ;;
  *) echo "usage: scripts/check.sh [quick|full|all]" >&2; exit 2 ;;
esac

step ruff "$python" -m ruff check src tests
# test_hygiene inside pytest includes import and dependency-boundary checks.
step pytest "$python" -m pytest -q
# Every write endpoint, called as each role, against the matrix in .logsdev/design/系统.md §5.
step permissions "$python" scripts/permission_matrix.py --quiet
step "npm test" npm --prefix frontend test --silent
step tsc npx --prefix frontend tsc --noEmit -p frontend

if [ "$mode" != quick ]; then
  scripts=("${SMOKE[@]}")
  [ "$mode" = all ] && scripts+=("${EXTRA[@]}")
  if step build npm --prefix frontend run build --silent; then
    for script in "${scripts[@]}"; do
      step "$script" timeout 180 "$python" -m "tests.$script"
    done
  else
    echo "Browser checks skipped: the current frontend did not build."
  fi
fi

printf '\n'
if [ ${#failed[@]} -eq 0 ]; then echo "check.sh $mode: all passed"; exit 0; fi
echo "check.sh $mode: failed: ${failed[*]}"; exit 1
