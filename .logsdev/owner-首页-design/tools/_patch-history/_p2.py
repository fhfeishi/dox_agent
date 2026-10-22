# -*- coding: utf-8 -*-
p = "library-overview-v3.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


# ---------- A. 抽屉样式 ----------
rep(".readout{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-top:1px solid var(--line2);background:var(--surface3)}",
""".rl{border:0;background:none;font-family:inherit;text-align:left;width:100%}

/* ---------- 资料库预览抽屉 ---------- */
.dw-mask{position:fixed;inset:0;background:rgba(9,28,40,.30);backdrop-filter:blur(2px);
  opacity:0;pointer-events:none;transition:opacity .3s ease;z-index:100}
.dw-mask.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:600px;max-width:94vw;background:var(--paper);
  z-index:110;transform:translateX(100%);transition:transform .44s cubic-bezier(.16,1,.3,1);
  display:flex;flex-direction:column;box-shadow:-34px 0 70px -26px rgba(9,28,40,.35)}
.drawer.on{transform:none}
.dw-head{position:relative;padding:22px 26px 20px;background:#0D2A3B;color:#fff;overflow:hidden}
.dw-head::after{content:"";position:absolute;right:-70px;top:-90px;width:240px;height:240px;
  border-radius:50%;background:radial-gradient(circle,rgba(46,139,122,.34),transparent 68%)}
.dw-head::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
  background:linear-gradient(180deg,#2E8B7A,#4E8FA6)}
.dw-eyebrow{font-size:9px;letter-spacing:2.2px;color:#6E93A6}
.dw-name{font-size:22px;font-weight:600;letter-spacing:-.2px;margin-top:7px}
.dw-meta{font-size:11px;color:#9DB2C4;margin-top:4px}
.dw-x{position:absolute;top:18px;right:20px;width:28px;height:28px;border-radius:50%;
  border:1px solid rgba(255,255,255,.2);background:transparent;color:#CFE0E8;font-size:13px;
  cursor:pointer;line-height:1;transition:.16s;z-index:3;font-family:inherit}
.dw-x:hover{background:rgba(255,255,255,.14);color:#fff;transform:rotate(90deg)}
.dw-stats{display:flex;margin-top:18px;position:relative;z-index:1}
.dw-stats > div{padding-right:24px;margin-right:24px;border-right:1px solid rgba(255,255,255,.13)}
.dw-stats > div:last-child{border-right:0;margin-right:0;padding-right:0}
.dw-stats b{display:block;font-family:var(--serif);font-size:23px;font-weight:400;
  line-height:1.15;letter-spacing:-.3px}
.dw-stats b.lo{color:#F0A882}
.dw-stats b.hi{color:#8FD9C6}
.dw-stats span{font-size:9.5px;color:#8FA8B8}
.dw-body{flex:1;overflow-y:auto;padding:20px 26px 24px}
.dw-body::-webkit-scrollbar{width:6px}
.dw-body::-webkit-scrollbar-thumb{background:#CBDDE2;border-radius:3px}
.dw-sec{margin-bottom:22px}
.drawer.on .dw-sec{animation:dwIn .52s cubic-bezier(.16,1,.3,1) both}
.drawer.on .dw-sec:nth-child(1){animation-delay:.06s}
.drawer.on .dw-sec:nth-child(2){animation-delay:.12s}
.drawer.on .dw-sec:nth-child(3){animation-delay:.18s}
.drawer.on .dw-sec:nth-child(4){animation-delay:.24s}
@keyframes dwIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.dw-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}
.dw-h b{font-size:12px;font-weight:600;color:var(--ink)}
.dw-h small{font-size:9.5px;color:var(--ink4);line-height:1.5;text-align:right}
.sysrow{margin-bottom:10px}
.sysrow:last-child{margin-bottom:0}
.sys-top{display:flex;align-items:baseline;gap:8px}
.sys-top u{text-decoration:none;font-size:11.5px;color:var(--ink)}
.sys-top b{margin-left:auto;font-family:var(--serif);font-weight:400;font-size:11.5px;color:var(--ink2)}
.sys-track{height:5px;border-radius:3px;background:#E4EEF1;overflow:hidden;margin-top:4px}
.sys-track i{display:block;height:100%;border-radius:3px;background:#4E8FA6;
  transform-origin:left;animation:sweep .65s cubic-bezier(.16,1,.3,1) both}
@keyframes sweep{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.sys-note{font-size:9.5px;color:var(--ink4);line-height:1.55;margin-top:3px}
.dw-cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.dw-bars{display:flex;align-items:flex-end;gap:7px;height:64px}
.dw-bars .mbar{animation-duration:.6s}
.ev{padding:10px 0;border-bottom:1px solid var(--line2)}
.ev:last-child{border-bottom:0;padding-bottom:0}
.ev-t{font-size:11.5px;color:var(--ink);line-height:1.55}
.ev-m{display:flex;align-items:center;gap:7px;font-size:9.5px;color:var(--ink3);margin-top:4px;flex-wrap:wrap}
.ev-m em{font-style:normal;font-family:var(--serif);font-size:10px;color:var(--g1);
  background:var(--g1s);padding:0 5px;border-radius:3px;line-height:1.7}
.ev-m u{text-decoration:none;color:var(--ink4)}
.dw-empty{padding:16px 0;font-size:10.5px;color:var(--ink4);text-align:center}
.dw-foot{padding:12px 26px;border-top:1px solid var(--line);background:var(--surface);
  display:flex;align-items:center;gap:10px}
.dw-foot span{font-size:9.5px;color:var(--ink4)}
.dw-foot button{margin-left:auto;font-size:11px;padding:8px 14px;border-radius:6px;
  border:1px solid var(--line);background:transparent;color:var(--ink2);cursor:pointer;
  font-family:inherit;transition:.16s}
.dw-foot button:hover{border-color:var(--g1);color:var(--g1)}

.readout{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-top:1px solid var(--line2);background:var(--surface3)}""")

# ---------- B. 抽屉 HTML ----------
rep('<div id="pop" aria-live="polite"></div>',
"""<div class="dw-mask" id="dwMask"></div>
<aside class="drawer" id="drawer" role="dialog" aria-label="资料库预览">
  <div class="dw-head">
    <button class="dw-x" id="dwClose" aria-label="关闭">✕</button>
    <div class="dw-eyebrow">LIBRARY PREVIEW</div>
    <div class="dw-name" id="dwName"></div>
    <div class="dw-meta" id="dwMeta"></div>
    <div class="dw-stats" id="dwStats"></div>
  </div>
  <div class="dw-body" id="dwBody"></div>
  <div class="dw-foot">
    <span>只读摘要 · 数据取 lineage.json</span>
    <button id="dwEnter">在知识库中打开 →</button>
  </div>
</aside>

<div id="pop" aria-live="polite"></div>""")

open(p, "w", encoding="utf-8").write(s)
print("patched", n, len(s))
