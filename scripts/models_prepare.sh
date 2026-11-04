#!/usr/bin/env bash
# 只读检查启动本脚本的环境；不加载 .env、不下载模型、不修改文件。
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  printf '%s\n' "结论：无法使用项目 Python：$PYTHON；未检查，不回退系统 Python。"
  exit 1
fi

"$PYTHON" -B - "$ROOT" <<'PY'
import sys
from pathlib import Path


def normalize(value):
    return Path(value).expanduser().resolve()


try:
    from mineru.config import (
        _mineru_home,
        config,
        get_config_file_path,
        get_config_source,
    )

    root = normalize(sys.argv[1])
    expected_home = root / ".models" / "mineru-home"
    expected_models = root / ".models" / "mineru"
    home = normalize(_mineru_home())
    config_file = normalize(get_config_file_path())
    base_dir = normalize(config.model.base_dir)
    print(f"项目根：{root}")
    print(f"model.base_dir 来源：{get_config_source('model.base_dir')}")
    checks = (
        ("有效 MINERU_HOME", home, home == expected_home.resolve() and home.is_dir()),
        ("有效 config.yaml", config_file,
         config_file == (expected_home / "config.yaml").resolve() and config_file.is_file()),
        ("最终 model.base_dir", base_dir,
         base_dir == expected_models.resolve() and base_dir.is_dir() and any(base_dir.iterdir())),
    )
    passed = True
    for label, path, valid in checks:
        valid = valid and path.is_relative_to(root)
        passed = passed and valid
        print(f"  {'✔' if valid else '✘'} {label}：{path}")
    default_home = normalize(Path.home() / ".mineru")
    if default_home.exists() and default_home != home:
        print("  ! ~/.mineru 存在但未被选中，不影响检查。")
except Exception as error:
    print(f"结论：MinerU 配置导入、初始化或路径检查失败（{type(error).__name__}）；未通过。")
    sys.exit(1)

print("结论：有效路径均指向项目预期位置，--check 通过（只读、未下载）。" if passed else
      "结论：有效路径或模型目录不符合项目预期，见 ✘；只报告，不自动修复。")
sys.exit(0 if passed else 1)
PY
