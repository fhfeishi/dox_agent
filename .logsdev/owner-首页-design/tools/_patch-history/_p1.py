# -*- coding: utf-8 -*-
import json

p = "library-overview-v3.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


extra = json.load(open("/tmp/libextra.json", encoding="utf-8"))
NAME2ID = {
    "AI与信息智能": "ai", "AI与农业": "agri", "AI与医疗": "med", "AI与大数据": "big",
    "AI与机器人自动化": "robo", "AI与材料": "mat", "AI与生物医药": "bio",
    "AI与生物识别": "bioi", "AI与社会治理": "soc", "AI与金融经济": "fin",
    "AI与隐私保护": "priv",
}
data = {}
for k, v in extra.items():
    data[NAME2ID[k]] = {
        "cat": [[c["n"], c["c"], c["p"]] for c in v["cat"]],
        "hi": [[h["n"], h["d"], h["m"], h["b"]] for h in v["hi"]],
        "hic": v["hicount"],
    }

js_data = "var EXTRA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"

rep("var DIM_NAME = [\"场景\",\"问题\",\"技术\",\"成果\"];",
    js_data + "\n\nvar DIM_NAME = [\"场景\",\"问题\",\"技术\",\"成果\"];\n"
    "var DIM_COL = [\"#4E8FA6\", \"#2E8B7A\", \"#75AF98\", \"#B08A50\"];")

# ---------- 右栏样式整体替换 ----------
old_css_start = ".detail{background:var(--surface2);border-left:1px solid var(--line2);padding:16px 18px 18px;display:flex;flex-direction:column;min-width:0}"
old_css_end = ".d-open button.primary:hover{background:#26766A}"
a = s.index(old_css_start)
b = s.index(old_css_end) + len(old_css_end)

new_css = """.detail{background:var(--surface2);border-left:1px solid var(--line2);padding:15px 18px 16px;
  display:flex;flex-direction:column;min-width:0}
.d-eyebrow{font-size:9px;letter-spacing:1.7px;color:var(--ink4)}
.d-name{font-size:19px;font-weight:600;letter-spacing:-.2px;line-height:1.3;margin-top:4px}
.d-sub{font-size:10.5px;color:var(--ink3);margin-top:2px}

.d-hero{display:flex;align-items:baseline;gap:7px;margin:14px 0 0;padding-bottom:12px;
  border-bottom:1px solid var(--line2)}
.d-hero b{font-family:var(--serif);font-weight:400;font-size:27px;line-height:1;
  letter-spacing:-.6px;color:var(--ink);animation:numIn .4s cubic-bezier(.16,1,.3,1) both}
.d-hero b.hi{color:var(--g1)}
.d-hero b.lo{color:var(--warn)}
.d-hero b u{text-decoration:none;font-size:13px;margin-left:1px}
.d-hero span{font-size:9.5px;color:var(--ink3);line-height:1.3}
.d-hero i{width:1px;height:19px;background:var(--line);margin:0 7px;align-self:center}
@keyframes numIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

.d-block{margin-top:13px}
.d-block-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
  font-size:11px;color:var(--ink2);margin-bottom:7px}
.d-block-h i{font-style:normal;font-size:9px;color:var(--ink4)}

/* 成熟度柱 */
.mbars{display:flex;align-items:flex-end;gap:6px;height:50px}
.mbar{flex:1;border-radius:2px 2px 1px 1px;cursor:pointer;position:relative;
  transform-origin:bottom;transition:filter .14s,transform .16s;
  animation:barIn .55s cubic-bezier(.16,1,.3,1) both}
.mbar:hover{filter:brightness(1.08);transform:scaleY(1.06)}
.mbar.zero{background:var(--line2) !important}
.mbar-axis{display:flex;gap:6px;margin-top:4px}
.mbar-axis span{flex:1;text-align:center;font-size:8.5px;color:var(--ink4);
  font-variant-numeric:tabular-nums;cursor:pointer;transition:color .14s;padding:2px 0}
.mbar-axis span:hover{color:var(--g1)}
@keyframes barIn{from{transform:scaleY(0)}to{transform:scaleY(1)}}

/* 四维环 */
.d-dimrow{display:flex;align-items:center;gap:12px}
.ring{flex:none;overflow:visible}
.ring-v{font-family:var(--serif);font-size:16px;fill:var(--ink)}
.ring-k{font-size:8px;fill:var(--ink4);letter-spacing:1.2px}
.rarc{animation:dashIn .75s cubic-bezier(.16,1,.3,1) both}
@keyframes dashIn{to{stroke-dashoffset:0}}
.ring-legend{flex:1;min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:1px 8px}
.rl{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--ink2);cursor:pointer;
  padding:3px 5px;margin:0 -5px;border-radius:4px;transition:background .14s}
.rl:hover{background:#E9F2F4}
.rl i{width:6px;height:6px;border-radius:2px;flex:none}
.rl b{margin-left:auto;font-family:var(--serif);font-weight:400;font-size:11px;color:var(--ink2)}
.rl.low b{color:var(--warn)}

.d-note{margin-top:11px;display:flex;gap:7px;font-size:10px;line-height:1.62;color:#8C4A2E;
  background:var(--warns);border-left:2px solid var(--warn);padding:7px 9px;border-radius:0 4px 4px 0}
.d-note em{font-style:normal;flex:none;font-size:11px;line-height:1.5}

.d-preview{margin-top:auto;padding-top:14px}
.d-preview button{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;
  font-size:11.5px;padding:9px 0;border-radius:7px;border:1px solid var(--g1);
  background:var(--g1);color:#fff;cursor:pointer;font-family:inherit;
  transition:background .18s,transform .18s,box-shadow .18s}
.d-preview button:hover{background:#26766A;transform:translateY(-1px);
  box-shadow:0 8px 18px -8px rgba(46,139,122,.75)}
.d-preview button i{font-style:normal;transition:transform .2s}
.d-preview button:hover i{transform:translateX(3px)}"""

s = s[:a] + new_css + s[b:]
n += 1

open(p, "w", encoding="utf-8").write(s)
print("patched", n, "len", len(s))
