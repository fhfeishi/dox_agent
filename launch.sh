#!/usr/bin/env bash

# 如果通过 zsh source/执行，统一交给 bash。
if [ -n "${ZSH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

# ------------------------------------------------------------
# 项目目录
# ------------------------------------------------------------

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# ------------------------------------------------------------
# 基础依赖
# ------------------------------------------------------------

command -v uv >/dev/null 2>&1 || {
  printf '需要先安装 uv。\n' >&2
  exit 1
}

# ------------------------------------------------------------
# Python 虚拟环境
#
# 优先级：
#   1. 当前已激活的 VIRTUAL_ENV
#   2. DOX_AGENT_VENV 指定环境
#   3. 项目根目录 .venv
#
# 重要：
#   - 已存在的虚拟环境绝不自动重建
#   - 只有目标目录完全不存在时才创建
# ------------------------------------------------------------

runtime=""

if [[ -n "${VIRTUAL_ENV:-}" ]]; then
  runtime="$VIRTUAL_ENV"

elif [[ -n "${DOX_AGENT_VENV:-}" ]]; then
  runtime="$DOX_AGENT_VENV"

else
  runtime="$PROJECT_ROOT/.venv"
fi

# 相对路径统一相对于项目根目录
if [[ "$runtime" != /* ]]; then
  runtime="$PROJECT_ROOT/$runtime"
fi

# ------------------------------------------------------------
# 检查 / 创建虚拟环境
# ------------------------------------------------------------

if [[ -e "$runtime" ]]; then

  # 环境目录已经存在：只允许复用，不允许覆盖
  if [[ ! -x "$runtime/bin/python" ]]; then
    printf '虚拟环境目录已存在，但 Python 不可用：\n  %s\n' "$runtime" >&2
    printf '为避免覆盖已有环境，启动脚本不会自动重建该目录。\n' >&2
    printf '请手动检查或删除该环境后重新运行。\n' >&2
    exit 1
  fi

else

  printf '未找到虚拟环境，创建：%s\n' "$runtime"

  uv venv \
    --seed \
    --python=3.12 \
    "$runtime"
fi

runtime="$(cd "$runtime" && pwd)"
python="$runtime/bin/python"

# ------------------------------------------------------------
# Python 版本检查
# ------------------------------------------------------------

"$python" -c '
import sys

if sys.version_info < (3, 12):
    raise SystemExit(
        f"虚拟环境需要 Python 3.12+，当前版本："
        f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    )
'

printf '使用虚拟环境：%s\n' "$runtime"
printf 'Python：%s\n' "$("$python" --version 2>&1)"

# ------------------------------------------------------------
# 启动前检查
# ------------------------------------------------------------

result=0
"$python" src/launcher.py check || result=$?

if [[ "$result" == 10 ]]; then
  exit 0
fi

if [[ "$result" != 0 ]]; then
  exit "$result"
fi

# ------------------------------------------------------------
# 启动辅助服务
# ------------------------------------------------------------

"$python" src/launcher.py web

embedding_enabled=$(
  "$python" -c '
from src.agent.config import get_settings
print(int(bool(get_settings().embedding_path.strip())))
'
)

if [[ "$embedding_enabled" == 1 ]]; then
  "$python" src/launcher.py embedding
fi

# ------------------------------------------------------------
# 前端
# ------------------------------------------------------------

if [[ ! -f frontend/dist/index.html || "${REBUILD_FRONTEND:-0}" == 1 ]]; then
  # WSL can resolve Windows npm from /mnt while Linux node is absent from PATH.
  # Prefer the user's Linux Node installation for a build rooted in the WSL filesystem.
  if ! command -v node >/dev/null 2>&1 && [[ -x "$HOME/.local/bin/node" && -x "$HOME/.local/bin/npm" ]]; then
    export PATH="$HOME/.local/bin:$PATH"
  fi
  (
    cd frontend
    npm ci
    npm run build
  )
fi

# ------------------------------------------------------------
# 主服务
# ------------------------------------------------------------

printf '打开 http://127.0.0.1:%s\n' "${PORT:-8000}"

exec "$python" -m uvicorn \
  src.main:app \
  --loop asyncio \
  --host "${HOST:-127.0.0.1}" \
  --port "${PORT:-8000}"