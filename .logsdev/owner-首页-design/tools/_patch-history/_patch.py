# -*- coding: utf-8 -*-
p = "library-overview-v2.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


rep('.meg{color:#A8B7BF;font-size:9.5px;display:block;margin-top:1px}',
    '.meg{color:#A8B7BF;font-size:9.5px}\n.meg::before{content:"· ";color:#C6D3D8}')

rep("""'<div class="mdesc">' + m.read + '<span class="meg"> ' + m.eg + '</span></div></div>' +""",
    """'<div class="mdesc">' + m.read + '<span class="meg">' + m.eg + '</span></div></div>' +""")

rep("""'<div class="pop-s">右列是全库 2,693 条的分布；悬停右栏阶梯条看单个库</div>' +""",
    """'<div class="pop-s">右列是全库 2,693 条的分布 · 点右栏阶梯条可定位到该档</div>' +""")

rep('.mdesc{font-size:10px;color:var(--ink3);line-height:1.6;margin-top:1px}',
    '.mdesc{font-size:10px;color:var(--ink3);line-height:1.62;margin-top:1px}')

open(p, "w", encoding="utf-8").write(s)
print("patched", n)
