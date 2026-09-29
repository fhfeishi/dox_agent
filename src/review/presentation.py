"""Reader-facing report view; stored evidence and raw exports remain unchanged."""
import re
from copy import deepcopy


def present_report(run):
    result = deepcopy(run)
    if run.get('status') != 'completed':
        return result
    findings = result.get('findings', [])
    technical = result.get('technical') or {}
    cards = technical.get('cards', [])
    catalog = findings + cards + (run.get('rule') or {}).get('checks', [])
    names = {x['id']: x.get('title', '相关审核项') for x in catalog if x.get('id')}

    def readable(text):
        if not isinstance(text, str):
            return text
        text = re.sub(r'(?<![\w-])(?:ai|model|check|section|word|unreviewed-check)-\d+(?![\w-])',
                      lambda m: '“' + names.get(m.group(), '相关审核项') + '”', text)
        text = re.sub(r'\bsource_id\s*[:：]\s*b\d+-p\d+-\d+-\d+', '对应申请书原文', text)
        for key, label in [('expected_ids', '本批复核清单'), ('target_id', '审核事项'),
                           ('source_id', '原文位置'), ('evidence_ids', '文献依据'),
                           ('calculations', '程序复算'), ('pending', '待核实')]:
            text = re.sub(r'\b' + key + r'\b', label, text)
        return text

    for item in findings + cards:
        for field in ('title', 'detail', 'assessment', 'suggestion', 'basis', 'verification_note'):
            if field in item:
                item[field] = readable(item[field])
    if 'summary' in technical:
        technical['summary'] = readable(technical['summary'])

    def point(item):
        return {k: item.get(k, '') for k in ('id', 'title', 'status', 'suggestion', 'page', 'quote')} | {
            'detail': item.get('detail', item.get('assessment', ''))}

    issues = [point(x) for x in findings if x.get('status') in ('issue', 'warning')]
    pending = [point(x) for x in findings if x.get('status') == 'pending']
    result['reader_report'] = {
        'issues': issues,
        'technical': [point(x) for x in cards],
        'pending': pending,
        'missing_documents': list(dict.fromkeys((run.get('rule') or {}).get('missing_documents', []))),
        'summary': f'规范审核有 {len(issues)} 项问题或修改提醒、{len(pending)} 项待核实；技术部分有 {len(cards)} 项评议意见。待核实不等于不合格，技术建议也不代表已确认先进性。',
    }
    return result
