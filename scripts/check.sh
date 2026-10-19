#!/usr/bin/env bash
# One entry for the project's checks (upgrade plan card Q1, 2026-10-19).
#
#   scripts/check.sh quick   lint, Python tests, frontend tests, type check        (~3 min)
#   scripts/check.sh full    quick + frontend build + the browser smoke set         (~10 min)
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

# The browser scripts that cover the main journeys; the others stay runnable by hand
# (python -m tests.<name>). Chosen in Q1, see .logsdev/cleanup-log.md.
SMOKE=(
  browser_review_simple        # login and roles, template preview, queued reviews, 成果, leave and return
  browser_library_documents    # library files, upload, scoped chat, year charts, leader and user homes
  browser_analysis_workspace   # main journey A: files to compared projects to a delivered report
  browser_artifacts_live       # report lifecycle: edit, versions, trash and restore
  browser_export               # report export
  browser_figures_live         # versioned figures, PDF and DOCX/ZIP
  browser_scene_hierarchy      # 技术研判 view, outcome radar
  browser_answer_controls      # chat answer copy, retry, cancel and failure
)

case "$mode" in
  quick|full) ;;
  *) echo "usage: scripts/check.sh [quick|full]" >&2; exit 2 ;;
esac

step ruff "$python" -m ruff check src tests
# test_hygiene inside pytest includes import and dependency-boundary checks.
step pytest "$python" -m pytest -q
step "npm test" npm --prefix frontend test --silent
step tsc npx --prefix frontend tsc --noEmit -p frontend

if [ "$mode" = full ]; then
  if step build npm --prefix frontend run build --silent; then
    for script in "${SMOKE[@]}"; do
      step "$script" timeout 180 "$python" -m "tests.$script"
    done
  else
    echo "Browser checks skipped: the current frontend did not build."
  fi
fi

printf '\n'
if [ ${#failed[@]} -eq 0 ]; then echo "check.sh $mode: all passed"; exit 0; fi
echo "check.sh $mode: failed: ${failed[*]}"; exit 1
