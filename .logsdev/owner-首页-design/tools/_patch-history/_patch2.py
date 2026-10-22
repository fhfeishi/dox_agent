# -*- coding: utf-8 -*-
p = "library-overview-v2.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


# ---------- 1. 阶梯条：去掉会被裁切的伪元素 tooltip，改用独立浮层 ----------
rep(""".stair{position:relative;height:15px;background:var(--line2);border-radius:3px}
.stair-in{display:flex;height:100%;border-radius:3px;overflow:hidden}
.stair span{display:block;height:100%;position:relative;cursor:pointer;transition:transform .18s cubic-bezier(.16,1,.3,1)}
.stair span + span{box-shadow:inset 1px 0 0 #fff}
.stair:hover span{opacity:.42}
.stair span:hover{opacity:1;transform:scaleY(1.22)}
.stair span::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 8px);left:50%;
  transform:translate(-50%,5px);background:#12293A;color:#fff;font-size:10.5px;line-height:1.45;
  padding:5px 9px;border-radius:5px;white-space:nowrap;opacity:0;pointer-events:none;z-index:6;
  transition:opacity .16s,transform .22s cubic-bezier(.16,1,.3,1);font-variant-numeric:tabular-nums;
  box-shadow:0 6px 18px rgba(18,41,58,.2)}
.stair span:hover::after{opacity:1;transform:translate(-50%,0)}
.stair span::before{content:"";position:absolute;bottom:calc(100% + 3px);left:50%;margin-left:-4px;
  border:4px solid transparent;border-top-color:#12293A;opacity:0;pointer-events:none;z-index:6;transition:opacity .16s}
.stair span:hover::before{opacity:1}""",
""".stair{position:relative;height:15px;background:var(--line2);border-radius:3px}
.stair-in{display:flex;height:100%}
.stair-in span:first-child{border-radius:3px 0 0 3px}
.stair-in span:last-child{border-radius:0 3px 3px 0}
.stair span{display:block;height:100%;position:relative;cursor:pointer;
  transition:transform .2s cubic-bezier(.16,1,.3,1),opacity .16s}
.stair span + span{box-shadow:inset 1px 0 0 #fff}
.stair:hover span{opacity:.4}
.stair span:hover{opacity:1;transform:scaleY(1.28);z-index:2}
#hint{position:fixed;z-index:140;pointer-events:none;background:#12293A;color:#fff;
  font-size:10.5px;line-height:1.4;padding:5px 9px;border-radius:5px;white-space:nowrap;
  box-shadow:0 8px 20px rgba(18,41,58,.24);opacity:0;transform:translate(-50%,4px) scale(.96);
  transition:opacity .15s,transform .22s cubic-bezier(.16,1,.3,1);font-variant-numeric:tabular-nums}
#hint.on{opacity:1;transform:translate(-50%,0) scale(1)}
#hint b{font-weight:600;color:#8FD9C6;margin-right:2px}
#hint i{font-style:normal;color:#9FB6C4;margin:0 3px}""")

# ---------- 2. 字号与高亮打磨 ----------
rep(".pop-s{font-size:9.5px;color:var(--ink4);margin-top:3px;line-height:1.5}",
    ".pop-s{font-size:10px;color:var(--ink4);margin-top:3px;line-height:1.55}")
rep(".mstep.on{background:#F1F7F5;box-shadow:-5px 0 0 #F1F7F5,5px 0 0 #F1F7F5}",
    """.mstep.on{background:#EAF5F1;box-shadow:-5px 0 0 #EAF5F1,5px 0 0 #EAF5F1;position:relative}
.mstep.on::before{content:"";position:absolute;left:-17px;top:5px;bottom:5px;width:2px;
  background:var(--g1);border-radius:1px}""")
rep(".mname{font-size:11px;font-weight:600;color:var(--ink);line-height:1.45}",
    ".mname{font-size:11.5px;font-weight:600;color:var(--ink);line-height:1.45}")
rep(".mdesc{font-size:10px;color:var(--ink3);line-height:1.62;margin-top:1px}",
    ".mdesc{font-size:10.5px;color:var(--ink3);line-height:1.62;margin-top:2px}")
rep(".mcnt{font-size:9.5px;color:var(--ink3);text-align:right;line-height:1.5;",
    ".mcnt{font-size:10px;color:var(--ink3);text-align:right;line-height:1.5;")
rep(".pop-def u{text-decoration:none;font-size:10.5px;font-weight:600;color:var(--ink)}",
    ".pop-def u{text-decoration:none;font-size:11px;font-weight:600;color:var(--ink)}")
rep(".pop-def p{font-size:10px;color:var(--ink3);line-height:1.65;margin-top:2px}",
    ".pop-def p{font-size:10.5px;color:var(--ink3);line-height:1.7;margin-top:3px}")
rep(".pop-note{margin-top:9px;padding:7px 9px;background:#FBF4E6;border-radius:5px;\n  font-size:9.5px;color:#8A6A2F;line-height:1.65}",
    ".pop-note{margin-top:9px;padding:8px 10px;background:#FBF4E6;border-radius:5px;\n  font-size:10px;color:#8A6A2F;line-height:1.68}")
rep(".meg{color:#A8B7BF;font-size:9.5px}", ".meg{color:#A8B7BF;font-size:10px}")
rep(".parrow{position:absolute;width:10px;height:10px;margin-left:-5px;left:var(--ax,50%);top:-5.5px;\n  background:#fff;border-left:1px solid #DEE9EB;border-top:1px solid #DEE9EB;transform:rotate(45deg)}",
    ".parrow{position:absolute;width:10px;height:10px;margin-left:-5px;left:var(--ax,50%);top:-5.5px;\n  background:#fff;border-left:1px solid #CFDDE1;border-top:1px solid #CFDDE1;transform:rotate(45deg);\n  box-shadow:-1px -1px 3px rgba(16,42,58,.04)}")

# ---------- 3. 分档错峰入场 ----------
rep(".mstep{display:grid;grid-template-columns:17px minmax(0,1fr) auto;gap:9px;padding:6px 0;\n  border-bottom:1px solid var(--line2);align-items:start;transition:background .14s;border-radius:4px}",
    """.mstep{display:grid;grid-template-columns:17px minmax(0,1fr) auto;gap:9px;padding:6.5px 0;
  border-bottom:1px solid var(--line2);align-items:start;transition:background .14s;border-radius:4px}
@keyframes mIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
#pop.on .mstep{animation:mIn .38s cubic-bezier(.16,1,.3,1) both}
#pop.on .mstep:nth-child(1){animation-delay:.02s}
#pop.on .mstep:nth-child(2){animation-delay:.05s}
#pop.on .mstep:nth-child(3){animation-delay:.08s}
#pop.on .mstep:nth-child(4){animation-delay:.11s}
#pop.on .mstep:nth-child(5){animation-delay:.14s}
#pop.on .mstep:nth-child(6){animation-delay:.17s}""")

# ---------- 4. 弹窗宽度 ----------
rep("{ w: 372 });", "{ w: 396 });")
rep("""    '</div>', { w: 334 });""", """    '</div>', { w: 352 });""")
rep("""    { w: 320 });""", """    { w: 336 });""")
rep("{ w: 368 });", "{ w: 388 });")

# ---------- 5. 阶梯 hover 用独立浮层 ----------
rep("""  var box = document.getElementById("detail");""",
"""  var box = document.getElementById("detail");
  Array.prototype.forEach.call(box.querySelectorAll(".stair span[data-tip]"), function (el) {
    el.addEventListener("mouseenter", function () { showHint(this, this.getAttribute("data-tip")); });
    el.addEventListener("mouseleave", hideHint);
  });""")

rep("""/* ---------- 轻量弹窗：点开、点旁边关 ---------- */""",
"""/* ---------- 阶梯段悬停浮层 ---------- */
var hintEl = null;
function showHint(a, text) {
  if (!hintEl) {
    hintEl = document.createElement("div");
    hintEl.id = "hint";
    document.body.appendChild(hintEl);
  }
  hintEl.innerHTML = text.replace(/^(\\d) /, "<b>$1</b>").replace(/ · /g, "<i>·</i>");
  hintEl.classList.add("on");
  var r = a.getBoundingClientRect();
  var w = hintEl.offsetWidth;
  var left = Math.max(8 + w / 2, Math.min(r.left + r.width / 2, window.innerWidth - 8 - w / 2));
  hintEl.style.left = left + "px";
  hintEl.style.top = (r.top - hintEl.offsetHeight - 9) + "px";
}
function hideHint() { if (hintEl) hintEl.classList.remove("on"); }

/* ---------- 轻量弹窗：点开、点旁边关 ---------- */""")

open(p, "w", encoding="utf-8").write(s)
print("patched", n)
