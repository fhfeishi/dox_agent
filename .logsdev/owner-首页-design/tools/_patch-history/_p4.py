# -*- coding: utf-8 -*-
p = "library-overview-v3.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


# 抽屉里两列的紧凑 legend
rep(".dw-cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}",
    """.dw-cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.dw-cols .ring-legend{grid-template-columns:1fr;gap:0}
.dw-cols .rl{font-size:10px;padding:3px 6px}
.dw-bars .mbar b{position:absolute;top:-14px;left:0;right:0;text-align:center;
  font-family:var(--serif);font-size:9px;font-weight:400;color:var(--ink3);font-style:normal}""")

# JS：抽屉控制
rep("/* ---------- 轻量弹窗：点开、点旁边关 ---------- */",
"""/* ---------- 资料库预览抽屉 ---------- */
function clip(t, k) { return t.length > k ? t.slice(0, k) + "…" : t; }

var DW = {
  el: document.getElementById("drawer"),
  mask: document.getElementById("dwMask")
};

function openPreview(id, anchor) {
  var d = byId(id);
  var ex = EXTRA[id] || { cat: [], hi: [], hic: 0 };

  document.getElementById("dwName").textContent = d.name;
  document.getElementById("dwMeta").textContent =
    d.projects + " 个项目 · " + d.docs + " 份已抽取文档 · " + d.systems + " 个技术体系";
  document.getElementById("dwStats").innerHTML =
    "<div><b>" + d.items.toLocaleString() + "</b><span>技术条目</span></div>" +
    '<div><b class="' + (d.hipct >= 20 ? "hi" : "lo") + '">' + d.hipct + "%</b><span>成熟 4 以上</span></div>" +
    "<div><b>" + d.hi.toLocaleString() + "</b><span>高成熟条目</span></div>";

  var body = "";

  /* 1. 技术体系构成 */
  if (ex.cat.length) {
    var mx = ex.cat[0][1] || 1;
    body += '<section class="dw-sec"><div class="dw-h"><b>技术体系构成</b>' +
      "<small>共 " + d.systems + " 个体系 · 按条目数排序</small></div>";
    ex.cat.forEach(function (c) {
      body += '<div class="sysrow"><div class="sys-top"><u>' + c[0] + "</u><b>" +
        c[1].toLocaleString() + "</b></div>" +
        '<div class="sys-track"><i style="width:' + (c[1] / mx * 100) + '%"></i></div>' +
        '<div class="sys-note">' + c[2] + "</div></div>";
    });
    body += "</section>";
  }

  /* 2. 成熟度 + 四维 */
  body += '<section class="dw-sec"><div class="dw-cols">' +
    '<div><div class="dw-h"><b>成熟度分布</b><small>0 → 5</small></div>' +
    barHtml(d, "dw-bars") + "</div>" +
    '<div><div class="dw-h"><b>四维覆盖</b><small>点一项看口径</small></div>' +
    '<div class="d-dimrow">' + ringSvg(d, 92, 9) + '<div class="ring-legend">';
  DIM_NAME.forEach(function (nm, i) {
    var pct = d.dims[i] / d.docs * 100;
    body += '<button class="rl' + (pct < 95 ? " low" : "") + '" data-dim="' + i + '">' +
      '<i style="background:' + DIM_COL[i] + '"></i>' + nm + "<b>" + shortPct(pct) + "</b></button>";
  });
  body += "</div></div></div></div></section>";

  /* 3. 高成熟条目 */
  body += '<section class="dw-sec"><div class="dw-h"><b>进入场景试验或转化的条目</b>' +
    "<small>共 " + ex.hic + " 条" + (ex.hi.length ? " · 取前 " + ex.hi.length : "") + "</small></div>";
  if (ex.hi.length) {
    ex.hi.forEach(function (e) {
      body += '<div class="ev"><div class="ev-t">' + clip(e[0], 34) + "</div>" +
        '<div class="ev-m"><em>M' + e[2] + "</em>" +
        (e[1] ? "<u>" + e[1] + "</u>" : "") +
        "<span>" + clip(e[3], 26) + "</span></div></div>";
    });
  } else {
    body += '<div class="dw-empty">这个库还没有条目达到成熟度 4，全部停在理论与算法验证之间。</div>';
  }
  body += "</section>";

  var box = document.getElementById("dwBody");
  box.innerHTML = body;
  box.scrollTop = 0;

  Array.prototype.forEach.call(box.querySelectorAll("[data-tip]"), function (el) {
    el.addEventListener("mouseenter", function () { showHint(this, this.getAttribute("data-tip")); });
    el.addEventListener("mouseleave", hideHint);
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-m]"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      openMaturity(this, +this.getAttribute("data-m"), true);
    });
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-dim]"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      openDim(this, +this.getAttribute("data-dim"));
    });
  });

  POP.close();
  DW.el.classList.add("on");
  DW.el.setAttribute("aria-hidden", "false");
  DW.mask.classList.add("on");
  document.body.style.overflow = "hidden";
}

function closePreview() {
  DW.el.classList.remove("on");
  DW.el.setAttribute("aria-hidden", "true");
  DW.mask.classList.remove("on");
  document.body.style.overflow = "";
}

DW.mask.addEventListener("click", closePreview);
document.getElementById("dwClose").addEventListener("click", closePreview);
document.getElementById("dwEnter").addEventListener("click", function () {
  var b = this;
  b.textContent = "demo 不跳转";
  setTimeout(function () { b.textContent = "在知识库中打开 →"; }, 1500);
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && DW.el.classList.contains("on")) closePreview();
});

/* ---------- 轻量弹窗：点开、点旁边关 ---------- */""")

open(p, "w", encoding="utf-8").write(s)
print("patched", n, len(s))
