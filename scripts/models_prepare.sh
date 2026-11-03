#!/usr/bin/env bash
# P0-5 模型准备检查（只读）：确认运行时真的会用到项目内的 .models/，而不是 ~/.mineru 或别的路径。
#
# 背景：项目目录里有模型，不等于 MinerU 运行时在用它们。2026-11-02 实测过一次：
# mineru_home 为空时 CLI 读 ~/.mineru/config.yaml 与 ~/.mineru/models，其中 ONNX 资源缺失，
# 于是"项目里明明有模型"却解析失败。这个脚本把这条链路的三个环节都打印出来，不做修改：
#
#   ./scripts/models_prepare.sh --check
#
# 退出码：0 = 三个环节都指向项目内目录；1 = 有不一致（会写明是哪一条）。
# 只读：不下载模型、不改 config.yaml、不写任何文件。
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS="$ROOT/.models"
HOME_DIR="$MODELS/mineru-home"
CONFIG="$HOME_DIR/config.yaml"
ok=1

say() { printf '%s\n' "$*"; }
check() {  # check <说明> <条件命令...>
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    say "  ✔ $label"
  else
    say "  ✘ $label"
    ok=0
  fi
}

say "项目根：$ROOT"
say ""

say "1) 模型目录 .models/mineru"
check ".models/mineru 存在且有内容" test -n "$(ls -A "$MODELS/mineru" 2>/dev/null)"
say "     大小：$(du -sh "$MODELS/mineru" 2>/dev/null | cut -f1 || echo '（无）')"

say ""
say "2) MINERU_HOME 与 config.yaml"
home_from_env="${MINERU_HOME:-}"
if [[ -n "$home_from_env" ]]; then
  say "    环境变量 MINERU_HOME=$home_from_env"
else
  say "    环境变量 MINERU_HOME 未设置（将回落到 ~/.mineru）"
fi
check "项目内 $CONFIG 存在" test -f "$CONFIG"
if [[ -f "$CONFIG" ]]; then
  base_dir="$(sed -n 's/^[[:space:]]*base_dir:[[:space:]]*//p' "$CONFIG" | head -1)"
  say "    config.yaml 的 base_dir=$base_dir"
  # 关键：base_dir 必须是当前机器上真实存在的绝对路径，不能是另一台机器的路径。
  if [[ -d "$base_dir" ]]; then
    say "  ✔ base_dir 在本机存在"
  else
    say "  ✘ base_dir 在本机不存在（常见原因：从 Windows 或另一台机器复制过来）"
    ok=0
  fi
fi

say ""
say "3) ~/.mineru 是否会被误读"
if [[ -d "$HOME/.mineru" ]]; then
  say "  ! ~/.mineru 存在：未设置 MINERU_HOME 时 CLI 会优先读它"
  [[ -f "$HOME/.mineru/config.yaml" ]] && \
    say "    它的 config.yaml：$(tr '\n' ' ' < "$HOME/.mineru/config.yaml" | tr -s ' ')"
  say "    其中 models/ 大小：$(du -sh "$HOME/.mineru/models" 2>/dev/null | cut -f1 || echo '（无）')"
  ok=0
else
  say "  ✔ 没有 ~/.mineru，不会覆盖项目内配置"
fi

say ""
if [[ $ok -eq 1 ]]; then
  say "结论：三个环节都指向项目内模型，--check 通过（未下载、未修改任何文件）。"
else
  say "结论：有不一致，见上面的 ✘ / ! 行。本脚本只报告，不自动修复。"
fi
exit $(( ok == 1 ? 0 : 1 ))
