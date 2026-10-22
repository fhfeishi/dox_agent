# -*- coding: utf-8 -*-
p = "library-overview-v2.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


# 1. 弹窗最大宽度，窄屏不溢出
rep(""".pcard{position:relative;background:#fff;border:1px solid #DEE9EB;border-radius:13px;""",
    """.pcard{position:relative;max-width:calc(100vw - 24px);
  background:#fff;border:1px solid #DEE9EB;border-radius:13px;""")

# 2. 触发元素被标记，让人知道弹窗从哪来
rep(".parrow.up{top:auto;bottom:-5.5px;transform:rotate(225deg)}",
    """.parrow.up{top:auto;bottom:-5.5px;transform:rotate(225deg)}
.anchor-on{background:#E7F2EE !important;box-shadow:0 0 0 3px #E7F2EE;border-radius:5px}
.cal.anchor-on,.inf.anchor-on,.qmark.anchor-on{background:#E7F2EE !important;border-color:var(--g1) !important;
  color:var(--g1) !important;box-shadow:0 0 0 2px #E7F2EE}
.qmark.anchor-on::after{background:var(--g1)}""")

# 3. 打开/关闭时同步标记
rep("""  function open(a, html, opts) {
    ensure();
    var was = isOpen;
    cur = a;""",
"""  function open(a, html, opts) {
    ensure();
    var was = isOpen;
    if (cur && cur !== a) cur.classList.remove("anchor-on");
    cur = a;
    cur.classList.add("anchor-on");""")

rep("""  function close() {
    if (!isOpen) return;
    root.classList.remove("on");
    isOpen = false;
    cur = null;
  }""",
"""  function close() {
    if (!isOpen) return;
    root.classList.remove("on");
    isOpen = false;
    if (cur) cur.classList.remove("anchor-on");
    cur = null;
  }""")

open(p, "w", encoding="utf-8").write(s)
print("patched", n)
