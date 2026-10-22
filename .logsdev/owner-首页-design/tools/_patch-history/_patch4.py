# -*- coding: utf-8 -*-
p = "library-overview-v2.html"
s = open(p, encoding="utf-8").read()
n = 0


def rep(old, new):
    global s, n
    assert old in s, "MISS: " + old[:80]
    s = s.replace(old, new, 1)
    n += 1


# 1. 悬停浮层移到阶梯下方，避免压住标题
rep("""  hintEl.style.left = left + "px";
  hintEl.style.top = (r.top - hintEl.offsetHeight - 9) + "px";""",
    """  hintEl.style.left = left + "px";
  hintEl.style.top = (r.bottom + 7) + "px";""")

# 2. 档位说明精简，避免与右列数字相撞
rep("""var MAT = [
  {n:0, name:"未判定", read:"看不出走的是哪条技术路线，或标注尚未完成。", eg:"只出现技术名词", txt:"#4A5E6B"},
  {n:1, name:"理论与方法研究", read:"停在方法层面：给出框架、公式或论证，没跑过真实数据。", eg:"提出架构 · 给出约束", txt:"#3A6270"},
  {n:2, name:"算法与模型验证", read:"在公开或自有数据集上跑通并给出指标，还不是能运行的系统。", eg:"准确率 92% · AUC 0.81", txt:"#2C5E5A"},
  {n:3, name:"原型与样机验证", read:"做成可运行的原型或样机，实验室条件下能重复演示。", eg:"原型系统 · 原理样机", txt:"#22544D"},
  {n:4, name:"系统集成与场景试验", read:"接进真实业务或真实场景，做过一段时间的小规模试验。", eg:"产线试点 3 个月", txt:"#1B4842"},
  {n:5, name:"示范应用与转化", read:"形成可复制的示范应用，或已完成转化、产品化落地。", eg:"推广运行 · 专利转化", txt:"#fff"}
];""",
    """var MAT = [
  {n:0, name:"未判定", read:"看不出技术路线，或标注未完成。", eg:"只出现技术名词", txt:"#4A5E6B"},
  {n:1, name:"理论与方法研究", read:"有框架或论证，没跑过真实数据。", eg:"提出架构 · 给出约束", txt:"#3A6270"},
  {n:2, name:"算法与模型验证", read:"在数据集上跑通并给出指标，尚非可运行系统。", eg:"准确率 92% · AUC 0.81", txt:"#2C5E5A"},
  {n:3, name:"原型与样机验证", read:"做成原型或样机，实验室里能重复演示。", eg:"原型系统 · 原理样机", txt:"#22544D"},
  {n:4, name:"系统集成与场景试验", read:"接进真实场景，做过小规模试验。", eg:"产线试点 3 个月", txt:"#1B4842"},
  {n:5, name:"示范应用与转化", read:"形成可复制的示范，或已完成转化。", eg:"推广运行 · 专利转化", txt:"#fff"}
];""")

# 3. 底部注释精简
rep("""    '<div class="pop-note"><b>档位名称</b>取自 <code>src/lineage.py</code> 的 MATURITY 常量；判据是为汇报补充的读法，不改变原始标注。级别由模型判定，需人工核对。</div>',""",
    """    '<div class="pop-note"><b>档位名称</b>取自 <code>src/lineage.py</code> 的 MATURITY 常量；灰色小字是本页补充的判据，用于统一口径。级别由模型判定、需人工核对。</div>',""")

open(p, "w", encoding="utf-8").write(s)
print("patched", n)
