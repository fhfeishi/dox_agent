"""Reader-facing report view; stored evidence and raw exports remain unchanged."""
import re
from copy import deepcopy

# One scale for what to change (query 2026-1020 1719): 发现问题 and 修改建议 were two scales that did not
# line up, so every item that asks for a change carries one 修改建议 level instead.
LEVELS = {'high': '高', 'medium': '中', 'low': '低'}
ACTIONABLE = ('issue', 'warning', 'advisory')


def suggestion_level(item):
    """高 for a breach of a definite requirement; otherwise the model's level, 中 when it gave none.
    Pending, passed and not-applicable items ask for no change and have no level."""
    status = item.get('status')
    if status not in ACTIONABLE:
        return None
    if status == 'issue':
        return 'high'
    return item.get('level') if item.get('level') in LEVELS else 'medium'


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
        item['level'] = suggestion_level(item)
        for field in ('title', 'detail', 'assessment', 'suggestion', 'basis', 'verification_note'):
            if field in item:
                item[field] = readable(item[field])
    if 'summary' in technical:
        technical['summary'] = readable(technical['summary'])

    def point(item):
        return {k: item.get(k, '') for k in ('id', 'title', 'status', 'level', 'suggestion', 'page', 'quote', 'evidence_ids', 'basis')} | {
            'detail': item.get('detail', item.get('assessment', ''))}

    order = list(LEVELS)
    by_level = lambda rows: sorted(rows, key=lambda x: order.index(x['level']))
    issues = by_level([point(x) for x in findings if x['level']])
    technical_points = by_level([point(x) for x in cards if x['level']])
    pending = [point(x) for x in findings + cards if x.get('status') == 'pending']
    actionable = [x for x in findings + cards if x['level']]
    levels = {key: sum(x['level'] == key for x in actionable) for key in LEVELS}
    spoken = '、'.join(f'{LEVELS[k]} {n} 项' for k, n in levels.items() if n) or '无'
    result['reader_report'] = {
        'issues': issues,
        'technical': technical_points,
        'pending': pending,
        'levels': levels,
        'missing_documents': list(dict.fromkeys((run.get('rule') or {}).get('missing_documents', []))),
        'summary': f'修改建议：{spoken}；另有 {len(pending)} 项待核实。待核实不等于不合格，技术建议也不代表已确认先进性。',
    }
    if (run.get("request") or {}).get("kind") == "professional":
        missing = [row["title"] for row in technical.get("coverage", []) if row["state"] == "missing"]
        result["reader_report"]["summary"] = (f"专业评议 {len(cards)} 项，修改建议{spoken}；对照资料匹配 {technical.get('local_matches', 0)} 个项目。"
            + (f"{len(missing)} 个评价问题未完成：{'、'.join(missing)}。" if missing else "")
            + "检索未命中不等于原创，当前资料不足的意见须复核。")
    elif (run.get("request") or {}).get("kind") == "formal":
        result["reader_report"]["summary"] = f"按所选模板核对，修改建议{spoken}，{len(pending)} 项待核实；结果表示是否符合本模板要求，本次未执行专业技术评议。"
    return result
