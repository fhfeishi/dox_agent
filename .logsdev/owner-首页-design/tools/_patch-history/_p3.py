# -*- coding: utf-8 -*-
p = "library-overview-v3.html"
s = open(p, encoding="utf-8").read()

start = s.index("function renderDetail() {")
end = s.index("\n}\n", start) + 3
old_len = len(s[start:end])

new_fn = r'''function ringArc(cx, cy, r, d0, d1) {
  var a0 = (d0 - 90) * Math.PI / 180, a1 = (d1 - 90) * Math.PI / 180;
  var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  var large = (d1 - d0) > 180 ? 1 : 0;
  return "M" + x0.toFixed(2) + " " + y0.toFixed(2) + "A" + r + " " + r + " 0 " +
    large + " 1 " + x1.toFixed(2) + " " + y1.toFixed(2);
}

function ringSvg(d, size, sw, label) {
  var C = size / 2, R = C - sw / 2 - 1.5;
  var avg = Math.round((d.dims.reduce(function (a, b) { return a + b; }, 0) / 4) / d.docs * 100);
  var out = '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '">';
  DIM_NAME.forEach(function (nm, i) {
    var base = i * 90 + 2, span = 86;
    out += '<path d="' + ringArc(C, C, R, base, base + span) +
      '" fill="none" stroke="#E2ECEF" stroke-width="' + sw + '" stroke-linecap="round"/>';
    var len = span * (d.dims[i] / d.docs);
    if (len > 1.5) {
      var L = 2 * Math.PI * R * len / 360;
      out += '<path class="rarc" d="' + ringArc(C, C, R, base, base + len) +
        '" fill="none" stroke="' + DIM_COL[i] + '" stroke-width="' + sw + '" stroke-linecap="round" ' +
        'style="stroke-dasharray:' + L.toFixed(1) + " " + (L + 3).toFixed(1) +
        ';stroke-dashoffset:' + L.toFixed(1) + ';animation-delay:' + (i * .07) + 's"/>';
    }
  });
  out += '<text class="ring-v" x="' + C + '" y="' + (C + 1) + '" text-anchor="middle">' + avg + '%</text>';
  out += '<text class="ring-k" x="' + C + '" y="' + (C + 13) + '" text-anchor="middle">' + (label || "四维完整") + '</text>';
  return out + "</svg>";
}

function barHtml(d, cls) {
  var mx = Math.max.apply(null, d.dist) || 1;
  var h = '<div class="' + (cls || "mbars") + '">';
  d.dist.forEach(function (n, i) {
    var hgt = n === 0 ? 2 : Math.max(4, Math.round(n / mx * 46));
    h += '<div class="mbar' + (n === 0 ? " zero" : "") + '" data-m="' + i + '" style="height:' + hgt +
      "px;background:" + MCOL[i] + ";animation-delay:" + (i * .04) + 's" data-tip="' + i + " " +
      MAT[i].name + " · " + n + " 条 · " + Math.round(n / d.items * 100) + '%"></div>';
  });
  h += '</div><div class="mbar-axis">';
  for (var i = 0; i < 6; i++) h += '<span data-m="' + i + '">' + i + "</span>";
  return h + "</div>";
}

function renderDetail() {
  var d = byId(sel);
  var minDim = Math.min.apply(null, d.dims) / d.docs;
  var h = "";

  h += '<div class="d-eyebrow">CURRENT LIBRARY</div>';
  h += '<div class="d-name">' + d.name + "</div>";
  h += '<div class="d-sub">' + d.projects + " 个项目 · " + d.docs + " 份已抽取文档</div>";

  h += '<div class="d-hero">' +
    "<b>" + d.items.toLocaleString() + "</b><span>条技术</span>" +
    '<i></i>' +
    "<b class=\"" + (d.hipct >= 20 ? "hi" : "lo") + "\">" + d.hipct + "<u>%</u></b><span>成熟 4 以上</span>" +
    "</div>";

  h += '<div class="d-block"><div class="d-block-h"><span>成熟度分布</span>' +
    '<button class="qmark" data-mhelp="1">0–5 怎么分</button></div>';
  h += barHtml(d);
  h += "</div>";

  h += '<div class="d-block"><div class="d-block-h"><span>四维覆盖</span><i>点一项看口径</i></div>';
  h += '<div class="d-dimrow">' + ringSvg(d, 88, 8.5) + '<div class="ring-legend">';
  DIM_NAME.forEach(function (nm, i) {
    var pct = d.dims[i] / d.docs * 100;
    h += '<button class="rl' + (pct < 95 ? " low" : "") + '" data-dim="' + i + '">' +
      '<i style="background:' + DIM_COL[i] + '"></i>' + nm +
      "<b>" + shortPct(pct) + "</b></button>";
  });
  h += "</div></div></div>";

  if (d.hipct < 10) {
    h += '<div class="d-note"><em>⚑</em><span>' + d.items + " 条技术里仅 " + d.hi +
      " 条（" + d.hipct + "%）进了场景试验或转化</span></div>";
  } else if (minDim < .95) {
    var wi = d.dims.indexOf(Math.min.apply(null, d.dims));
    h += '<div class="d-note"><em>⚑</em><span>' + DIM_NAME[wi] + "维缺 " + (d.docs - d.dims[wi]) +
      " 份文档，覆盖 " + shortPct(minDim * 100) + "</span></div>";
  }

  h += '<div class="d-preview"><button id="btnPreview">预览资料库 <i>→</i></button></div>';

  var box = document.getElementById("detail");
  box.innerHTML = h;

  document.getElementById("btnPreview").addEventListener("click", function (e) {
    e.stopPropagation();
    openPreview(d.id, this);
  });

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
  Array.prototype.forEach.call(box.querySelectorAll("[data-mhelp]"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      openMaturity(this, -1);
    });
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-dim]"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      openDim(this, +this.getAttribute("data-dim"));
    });
  });
}
'''

s = s[:start] + new_fn + s[end:]
open(p, "w", encoding="utf-8").write(s)
print("replaced", old_len, "->", len(new_fn))
