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

# 缺少 .env 时给出明确提示：模型密钥和路径会退回默认值，页面能打开但分析不可用。
if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  printf '未找到 .env：模型密钥与路径使用默认值。可复制 .env.example 为 .env 后填写。\n' >&2
fi

# ------------------------------------------------------------
# 基础依赖
# ------------------------------------------------------------

# 官方安装脚本把 uv 放在 ~/.local/bin（cargo 安装则在 ~/.cargo/bin）；非交互 shell 的 PATH
# 往往不含这两个目录，所以先补上再判断，避免“明明装了却报未安装”。
if ! command -v uv >/dev/null 2>&1; then
  for candidate in "$HOME/.local/bin" "$HOME/.cargo/bin"; do
    if [[ -x "$candidate/uv" ]]; then export PATH="$candidate:$PATH"; break; fi
  done
fi

command -v uv >/dev/null 2>&1 || {
  printf '需要先安装 uv：https://docs.astral.sh/uv/\n' >&2
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
# 前端（先于端口检查：服务已在运行时，重新构建的页面同样生效）
# ------------------------------------------------------------

# 前端源码（src、index.html、package*.json、vite/tsconfig）的哈希与上次构建记录一致时跳过；
# 设 REBUILD_FRONTEND=1 强制构建。package-lock.json 变化时才重新 npm ci。
if ! "$python" src/launcher.py frontend check; then
  # WSL can resolve Windows npm from /mnt while Linux node is absent from PATH.
  # Prefer the user's Linux Node installation for a build rooted in the WSL filesystem.
  if ! command -v node >/dev/null 2>&1 && [[ -x "$HOME/.local/bin/node" && -x "$HOME/.local/bin/npm" ]]; then
    export PATH="$HOME/.local/bin:$PATH"
  fi
  command -v npm >/dev/null 2>&1 || {
    printf '需要 Node.js 22+ 才能构建前端：https://nodejs.org/\n' >&2
    exit 1
  }
  (
    cd frontend
    if ! cmp -s package-lock.json node_modules/.dox-lock; then
      npm ci
      cp package-lock.json node_modules/.dox-lock
    fi
    printf '构建前端……\n'
    npm run build
  )
  "$python" src/launcher.py frontend stamp
fi

# ------------------------------------------------------------
# 启动前检查
# ------------------------------------------------------------

result=0
"$python" src/launcher.py check || result=$?

if [[ "$result" == 10 ]]; then
  # 服务已在运行：直接打开页面（设 OPEN_BROWSER=0 可关闭）。
  "$python" src/launcher.py open || true
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
# 主服务
# ------------------------------------------------------------

# 模型自检：打印接口、模型名与直连/代理模式；失败只提示，不阻止启动。
"$python" src/launcher.py model || printf '模型连接未通过，服务仍会启动；可在管理员设置中复查。\n'

printf '打开 http://127.0.0.1:%s\n' "${PORT:-8000}"

# 服务可访问后自动打开默认浏览器（WSL 下打开 Windows 浏览器）；设 OPEN_BROWSER=0 可关闭。
"$python" src/launcher.py open >/dev/null 2>&1 &

# Ctrl+C 后不等待仍在运行的后台任务（审查、报告），见 launcher.py serve。
HOST="${HOST:-127.0.0.1}" PORT="${PORT:-8000}" exec "$python" src/launcher.py serve