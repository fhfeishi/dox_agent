#!/usr/bin/env python3
"""lineage 归类辅助工具（零模型调用，纯本地）。

三个职责：
  1) `framework <库>`  —— 从现有 lineage.json 抽出第①步框架，产出 framework.json
     （categories/fields/stages 已由 deepseek-flash 生成，不重复调用模型）
  2) `batches <库> [size]` —— 按 README 格式打印第②步的 user 消息（K 编号表 + 条目）
  3) `save <库> <file.json>` —— 校验并落盘 assign/retry 结果（带条目 id，回填名称/项目/年份）

校验口径与 README「系统会做的校验」一致：
  体系≤8、每体系方向≤6、每方向主题≤6；名称长度上限（体系20/方向24/主题24），
  theme 必须在编号表内，field/stage 越界或 F0/S0 记未判定，maturity 仅整数 0–5，
  basis 截到 60 字；条目名称/项目/年份由本工具从输入回填，不允许改写。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KB = ROOT / ".knowledge"
TASK = ROOT / ".logsdev" / "lineage-task"
OUT = TASK / "out"

MAX_CAT, MAX_CHILD, MAX_THEME = 8, 6, 6
LEN_CAT, LEN_DIR, LEN_THEME = 20, 24, 24
MATURITY = {0, 1, 2, 3, 4, 5}


def lib_dir(lib: str) -> Path:
    return KB / ("自然科学基金-" + lib)


def load_src(lib: str) -> dict:
    return json.loads((TASK / "inputs" / (lib + ".items.json")).read_text(encoding="utf-8"))


def framework(lib: str) -> dict:
    """从现有 lineage.json 抽框架；缺失则回落到 hierarchy.json 的场景。"""
    lin = lib_dir(lib) / "lineage.json"
    src = load_src(lib)
    if not lin.is_file():
        raise SystemExit("%s 无 lineage.json，无法复用框架" % lib)
    d = json.loads(lin.read_text(encoding="utf-8"))
    cats = []
    for c in d.get("categories") or []:
        name = (c.get("name") or "")[:LEN_CAT]
        children = []
        for ch in (c.get("children") or [])[:MAX_CHILD]:
            themes = []
            for t in (ch.get("themes") or [])[:MAX_THEME]:
                # 实际结构是 {"name": 主题名, "items": [条目id...]}，不是纯字符串
                tname = t.get("name") if isinstance(t, dict) else t
                themes.append((tname or "")[:LEN_THEME])
            children.append({
                "name": (ch.get("name") or "")[:LEN_DIR],
                "plain": (ch.get("plain") or "")[:60],
                "foundation": bool(ch.get("foundation")),
                "themes": themes,
            })
        if children:
            cats.append({"name": name, "summary": (c.get("summary") or "")[:120],
                         "plain": (c.get("plain") or "")[:60], "children": children})
    cats = cats[:MAX_CAT]
    fields = [{"name": (f.get("name") or "")[:12]} for f in (d.get("fields") or [])]
    if not fields:
        fields = [{"name": s} for s in src.get("scenes") or []]
    stages = [{"name": (s.get("name") or "")[:10], "plain": (s.get("plain") or "")[:60]}
              for s in (d.get("stages") or [])]
    return {
        "branch": (d.get("branch") or "")[:12],
        "fields": fields,
        "stages": stages,
        "categories": cats,
        "_corpus_id": src["corpus_id"],
    }


def theme_table(fw: dict) -> list[tuple[str, str, str, str]]:
    """返回 [(K编号, 体系, 方向, 主题)]，编号从 K1 起，顺序即 categories→children→themes。"""
    rows, i = [], 0
    for c in fw["categories"]:
        for ch in c["children"]:
            for th in ch["themes"]:
                i += 1
                rows.append(("K%d" % i, c["name"], ch["name"], th))
    return rows


def cmd_framework(lib: str) -> None:
    fw = framework(lib)
    rows = theme_table(fw)
    p = OUT / lib
    p.mkdir(parents=True, exist_ok=True)
    (p / "framework.json").write_text(
        json.dumps({k: v for k, v in fw.items() if not k.startswith("_")},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print("%s: 体系 %d，主题 %d，领域 %d，环节 %d → %s"
          % (lib, len(fw["categories"]), len(rows), len(fw["fields"]), len(fw["stages"]),
             p / "framework.json"))
    for kid, a, b, t in rows:
        print("   %-5s %s › %s › %s" % (kid, a, b, t))


def cmd_batches(lib: str, size: int) -> None:
    fw = framework(lib)
    rows = theme_table(fw)
    src = load_src(lib)
    items = src["items"]
    print("### 技术主题（编号 体系 › 方向 › 主题）")
    for kid, a, b, t in rows:
        print("%s %s › %s › %s" % (kid, a, b, t))
    print()
    print("### 应用领域（编号 名称）")
    for i, f in enumerate(fw["fields"], 1):
        print("F%d %s" % (i, f["name"]))
    print()
    print("### 业务环节（编号 名称）")
    for i, s in enumerate(fw["stages"], 1):
        print("S%d %s" % (i, s["name"]))
    print()
    for start in range(0, len(items), size):
        batch = items[start:start + size]
        print("### 技术条目（编号｜名称｜说明｜项目起止年｜该项目已取得的成果）  [%d–%d / %d]"
              % (start + 1, start + len(batch), len(items)))
        for i, it in enumerate(batch, 1):
            outs = "；".join(it.get("outcomes") or []) or "无"
            print("T%d｜%s｜%s｜%s–%s｜%s"
                  % (i, it["name"], (it.get("desc") or "")[:80],
                     it.get("start") or "?", it.get("end") or "?", outs))
        # 附条目 id，供结果回填（避免批内编号错位）
        print("### 本批条目 id")
        for i, it in enumerate(batch, 1):
            print("T%d\t%s" % (i, it["id"]))
        print()


def cmd_save(lib: str, path: str) -> None:
    """校验并落盘 assign/retry。输入 [{id, theme, field, stage, maturity, basis}]。"""
    fw = framework(lib)
    rows = theme_table(fw)
    valid_k = {r[0] for r in rows}
    nf = len(fw["fields"])
    ns = len(fw["stages"])
    by_id = {it["id"]: it for it in load_src(lib)["items"]}

    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    items = payload.get("items") if isinstance(payload, dict) else payload
    out, rejected, k0 = [], [], []
    for rec in items:
        iid = rec.get("id")
        src = by_id.get(iid)
        if src is None:
            rejected.append({"id": iid, "reason": "条目 id 不存在"})
            continue
        theme = (rec.get("theme") or "").strip()
        if theme != "K0" and theme not in valid_k:
            rejected.append({"id": iid, "theme": theme, "reason": "主题编号不在表内"})
            continue
        if theme == "K0" or theme not in valid_k:
            k0.append(iid)
        try:
            mat = int(rec.get("maturity", 0))
        except (TypeError, ValueError):
            mat = 0
        if mat not in MATURITY:
            mat = 0
        # F0/S0 或越界 → 未判定（空）
        def norm_f(v, n):
            v = (str(v).strip() if v is not None else "")
            if not re_full(r"F([1-9]\d*)$", v):
                return ""
            return v if int(v[1:]) <= n else ""
        def norm_s(v, n):
            v = (str(v).strip() if v is not None else "")
            if not re_full(r"S([1-9]\d*)$", v):
                return ""
            return v if int(v[1:]) <= n else ""
        out.append({
            "id": iid,
            # 以下三项由输入回填，不接受草稿改写
            "name": src["name"],
            "project_id": src["project_id"],
            "start": src.get("start"),
            "end": src.get("end"),
            "theme": theme,
            "field": norm_f(rec.get("field"), nf),
            "stage": norm_s(rec.get("stage"), ns),
            "maturity": mat,
            "basis": (rec.get("basis") or "")[:60],
        })
    p = OUT / lib
    p.mkdir(parents=True, exist_ok=True)
    name = "retry.json" if "/retry" in path or "retry" in Path(path).name else "assign.json"
    dst = p / name
    merged = out
    if dst.is_file():  # 分批多次保存则合并
        old = json.loads(dst.read_text(encoding="utf-8"))
        seen = {x["id"] for x in merged}
        merged = old + [x for x in out if x["id"] not in seen]
    dst.write_text(json.dumps({"items": merged}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("%s → %s：写入 %d 条，拒绝 %d，未归入主题(K0/无效) %d"
          % (lib, dst.name, len(merged), len(rejected), len(k0)))
    for r in rejected[:10]:
        print("   拒绝 %s" % r)


import re
def re_full(pat, s):
    return re.fullmatch(pat, s or "")


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    cmd, lib = sys.argv[1], sys.argv[2]
    if cmd == "framework":
        cmd_framework(lib)
    elif cmd == "batches":
        cmd_batches(lib, int(sys.argv[3]) if len(sys.argv) > 3 else 25)
    elif cmd == "save":
        cmd_save(lib, sys.argv[3])
    else:
        print("未知命令: %s" % cmd)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
