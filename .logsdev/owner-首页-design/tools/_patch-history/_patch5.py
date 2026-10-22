# -*- coding: utf-8 -*-
p = "library-overview-v2.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


# 1. 象限标签可点
rep(".qzlabel{font-size:11px;fill:#93A7B2}",
    """.qzlabel{font-size:11px;fill:#93A7B2}
.qz-tip{cursor:pointer;transition:opacity .2s}
.qz-tip text{transition:fill .15s}
.qz-tip:hover text{fill:var(--g1)}
.qz-tip:hover rect{stroke:#9CC9BC}""")

# 2. 空白象限改成可点组
rep("""  s += '<rect x="' + ex + '" y="' + G.t + '" width="' + (G.r - ex) + '" height="' + (ey - G.t) + '" fill="none" stroke="#C4D4DA" stroke-width="1" stroke-dasharray="6 6"/>';
  s += '<text x="' + qc + '" y="' + (qm - 4) + '" text-anchor="middle" font-size="11.5" fill="#9FB2BB">没有资料库</text>';
  s += '<text x="' + qc + '" y="' + (qm + 13) + '" text-anchor="middle" font-size="11.5" fill="#B6C4CB">既铺得开又沉得深</text>';""",
"""  s += '<g class="qz-tip" data-q="br">' +
    '<rect x="' + ex + '" y="' + G.t + '" width="' + (G.r - ex) + '" height="' + (ey - G.t) +
    '" fill="none" stroke="#C4D4DA" stroke-width="1" stroke-dasharray="6 6"/>' +
    '<text x="' + qc + '" y="' + (qm - 4) + '" text-anchor="middle" font-size="11.5" fill="#9FB2BB">没有资料库</text>' +
    '<text x="' + qc + '" y="' + (qm + 13) + '" text-anchor="middle" font-size="11.5" fill="#B6C4CB">既铺得开又沉得深</text></g>';""")

# 3. 三个象限名加 data-q
rep("""  s += '<text class="qzlabel" x="' + (G.l + 9) + '" y="' + (G.t + 118) + '"><tspan x="' + (G.l + 9) + '" font-weight="600">小而精</tspan><tspan x="' + (G.l + 9) + '" dy="14">条目少 · 成熟高</tspan></text>';
  s += '<text class="qzlabel" x="' + (G.l + 9) + '" y="' + (G.b - 34) + '"><tspan x="' + (G.l + 9) + '" font-weight="600">少且浅</tspan><tspan x="' + (G.l + 9) + '" dy="14">条目少 · 成熟低</tspan></text>';
  s += '<text class="qzlabel" x="' + (px(100) + 24) + '" y="' + (G.b - 46) + '"><tspan x="' + (px(100) + 24) + '" font-weight="600">铺得宽 · 沉不下去</tspan><tspan x="' + (px(100) + 24) + '" dy="14">条目多 · 成熟低</tspan></text>';""",
"""  s += '<g class="qz-tip" data-q="tl"><text class="qzlabel" x="' + (G.l + 9) + '" y="' + (G.t + 118) + '"><tspan x="' + (G.l + 9) + '" font-weight="600">小而精</tspan><tspan x="' + (G.l + 9) + '" dy="14">条目少 · 成熟高</tspan></text></g>';
  s += '<g class="qz-tip" data-q="bl"><text class="qzlabel" x="' + (G.l + 9) + '" y="' + (G.b - 34) + '"><tspan x="' + (G.l + 9) + '" font-weight="600">少且浅</tspan><tspan x="' + (G.l + 9) + '" dy="14">条目少 · 成熟低</tspan></text></g>';
  s += '<g class="qz-tip" data-q="brr"><text class="qzlabel" x="' + (px(100) + 24) + '" y="' + (G.b - 46) + '"><tspan x="' + (px(100) + 24) + '" font-weight="600">铺得宽 · 沉不下去</tspan><tspan x="' + (px(100) + 24) + '" dy="14">条目多 · 成熟低</tspan></text></g>';""")

# 4. 绑定点击
rep("""  Array.prototype.forEach.call(svg.querySelectorAll(".pt"), function (el) {""",
"""  Array.prototype.forEach.call(svg.querySelectorAll(".qz-tip"), function (el) {
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      openQuad(this, this.getAttribute("data-q"));
    });
  });

  Array.prototype.forEach.call(svg.querySelectorAll(".pt"), function (el) {""")

# 5. 象限说明弹窗
rep("""/* ---------- 口径与边界 ---------- */""",
"""/* ---------- 象限与分割线 ---------- */
var QUAD = {
  tl: { t:"小而精 · 左上", s:"条目不破百，平均成熟度高于 2.5",
        d:"摊子不大，但沉淀得比多数库深。生物识别（40 条 / 2.95）、生物医药（32 条 / 3.06）、信息智能（17 条 / 3.18）、社会治理（16 条 / 3.50）都在这里。",
        n:"这一类最适合当模板：做法已经跑通，把它们的方法迁移到别的库，成本最低。" },
  bl: { t:"少且浅 · 左下", s:"条目不破百，平均成熟度低于 2.5",
        d:"规模本来就小，沉淀也还没起来。金融经济、农业、材料、大数据、隐私保护在这一区。",
        n:"这里不宜再摊新方向，先把已有的条目往原型推，否则扩量只会放大低成熟条目。" },
  brr: { t:"铺得宽 · 沉不下去 · 右下", s:"条目破百，平均成熟度低于 2.5",
        d:"机器人自动化 1,025 条 / 1.15，是全库最典型的一例：条目占了 38%，八成停在理论与未判定。",
        n:"条目多而成熟低，通常意味着抽取时把大量方法描述都算作了技术条目。先查口径，再谈投入。" },
  br: { t:"右上象限为什么是空的", s:"条目破百 且 平均成熟度高于 2.5",
        d:"没有任何一个库同时做到两件事。医疗有 1,336 条但均值 2.28，机器人 1,025 条但均值 1.15；成熟度高的几个库，条目都不超过 40。",
        n:"这不是巧合：条目越多，混进来的低成熟条目越多，均值就越难抬高。所以「量大且深」需要先控制条目质量，不是靠继续加量。" }
};

function openQuad(a, k) {
  var q = QUAD[k];
  if (!q) return;
  POP.open(a,
    '<div class="pop-h">' + q.t + '</div>' +
    '<div class="pop-s">' + q.s + '</div>' +
    '<div class="pop-def">' +
      '<div><u>谁在这里</u><p>' + q.d + '</p></div>' +
      '<div><u>该怎么读</u><p>' + q.n + '</p></div>' +
      '<div><u>分割线怎么定</u><p>横轴切在 100 条：11 个库里只有医疗、机器人超过 100，其余 9 个落在 16–66 之间，100 正好在断层上。纵轴切在 2.5：这是 6 档里「算法验证」与「原型样机」的中点，越过它意味着平均做出过可运行的东西。</p></div>' +
    '</div>', { w: 344 });
}

/* ---------- 口径与边界 ---------- */""")

open(p, "w", encoding="utf-8").write(s)
print("patched", n)
