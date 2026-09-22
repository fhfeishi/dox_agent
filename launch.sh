#!/usr/bin/env bash
if [ -n "${ZSH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -euo pipefail
command -v uv >/dev/null 2>&1 || { printf '需要先安装 uv。\n' >&2; exit 1; }
runtime="${VIRTUAL_ENV:-${DOX_AGENT_VENV:-}}"
if [[ -n "$runtime" && "$runtime" != /* ]]; then
  runtime="$PWD/$runtime"
fi
if [[ -n "$runtime" && ! -x "$runtime/bin/python" ]]; then
  printf '指定的虚拟环境不可用：%s\n' "$runtime" >&2
  exit 1
fi
cd "$(dirname "${BASH_SOURCE[0]}")"
if [[ -z "$runtime" ]]; then
  if [[ -x .venv/bin/python ]]; then runtime=.venv;
  elif [[ -x ../.venv/bin/python ]]; then runtime=../.venv;
  else runtime=.venv; fi
fi
if [[ ! -x "$runtime/bin/python" ]]; then
  uv venv --seed --python=3.12 "$runtime"
fi
runtime="$(cd "$runtime" && pwd)"
python="$runtime/bin/python"
"$python" -c 'import sys; assert sys.version_info >= (3, 12), "虚拟环境需要 Python 3.12+"'
printf '使用虚拟环境：%s\n' "$runtime"
result=0
"$python" src/launcher.py check || result=$?
if [[ "$result" == 10 ]]; then exit 0; fi
if [[ "$result" != 0 ]]; then exit "$result"; fi
"$python" src/launcher.py web
embedding_enabled=$("$python" -c 'from src.agent.config import get_settings; print(int(bool(get_settings().embedding_path.strip())))')
if [[ "$embedding_enabled" == 1 ]]; then
  "$python" src/launcher.py embedding
fi
if [[ ! -f frontend/dist/index.html || "${REBUILD_FRONTEND:-0}" == 1 ]]; then
  (cd frontend && npm ci && npm run build)
fi
printf '打开 http://127.0.0.1:%s\n' "${PORT:-8000}"
exec "$python" -m uvicorn src.main:app --loop asyncio --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
