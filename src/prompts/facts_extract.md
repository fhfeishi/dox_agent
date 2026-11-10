只提取项目身份与资金事实，不提取场景、问题、技术、成果。只依据给定原文，不补充常识，不把推测写成事实。

必须只返回一个 JSON 对象，不要 Markdown 代码围栏。结构固定为：

{
  "project": {
    "name":   {"value": "项目/课题名称", "quote": "原文逐字引文", "confidence": "high|medium|low"},
    "number": {"value": "批准号/合同编号/项目编号/课题编号", "quote": "原文逐字引文", "confidence": "high|medium|low"},
    "scheme": {"value": "NSFC|HORIZONTAL|VERTICAL|OTHER", "quote": "原文逐字引文", "confidence": "high|medium|low"},
    "category": {"value": "资助类别/项目类别/专项", "quote": "原文逐字引文", "confidence": "high|medium|low"},
    "lead_unit": {"value": "依托/承担/牵头/受托单位", "quote": "原文逐字引文", "confidence": "high|medium|low"},
    "participants": [{"value": "参与/合作/协作单位", "quote": "原文逐字引文", "confidence": "high|medium|low"}],
    "pi": {"value": "负责人姓名", "quote": "原文逐字引文", "confidence": "high|medium|low"},
    "start": {"value": "YYYY 或 YYYY-MM 或 YYYY-MM-DD", "precision": "year|month|day", "quote": "原文逐字引文", "confidence": "high|medium|low"},
    "end":   {"value": "YYYY 或 YYYY-MM 或 YYYY-MM-DD", "precision": "year|month|day", "quote": "原文逐字引文", "confidence": "high|medium|low"}
  },
  "funding": [
    {"term": "total|awarded|direct|indirect",
     "term_raw": "原文口径词",
     "amount": "原文数字",
     "unit": "万元|元",
     "currency": "CNY",
     "tax": "含税|不含税|未说明",
     "quote": "原文逐字引文",
     "confidence": "high|medium|low"}
  ]
}

规则：

1. 只填原文明确写出的值；原文没有的字段直接省略，不要填空字符串或猜测。
2. 每个值必须有 quote，quote 必须能在原文中逐字找到；找不到就不要输出该字段。
3. scheme 只按原文明确写出的体系判断：国家自然科学基金/自然科学基金 → NSFC；横向/委托/合同 → HORIZONTAL；重点研发/纵向/专项/课题 → VERTICAL；无法判断就省略。不要从标题、文件名或单位名称推导。
4. 项目编号保留原文形式，不要改写；批准号、合同编号、项目编号、课题编号都放在 number。
5. 时间保留原文精度：只写年份填 precision=year，写年月填 month，写完整日期填 day；不要从其他字段推算。
6. 资金只按下列口径抽取：
   - total 总经费：项目总经费、总经费、经费总额、项目总金额；
   - awarded 批准资助金额：批准资助、资助金额、批准金额、资助经费；
   - direct 直接费用：直接费用、直接经费；
   - indirect 间接费用：间接费用、间接经费。
   原文写“项目总经费”就填 total，不要把它换算成批准资助或直接费用。
7. 金额保留原文数字和单位，不做加减乘除、不做汇率换算、不补零；同一口径有多个不同金额时逐条输出，不合并。
8. 合同类金额保留含税/不含税；原文没有说明就填“未说明”。
9. 不输出置信度以外的评分、百分比、成熟度或原文没有的数据。
