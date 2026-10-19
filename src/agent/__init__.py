# Removed src/agent/quick.py (F4/Q3, 2026-10-19): it imported ResearchReport/validate_report,
# which were removed from evidence.py with the old research loop, so importing it always failed
# and nothing called it. Restore with: git show 4ce4616:src/agent/quick.py
# See .logsdev/cleanup-log.md.
