"""Repair missing prose without inventing review conclusions."""
from .model_client import ModelError

TEXT_FIELDS = ('title', 'detail', 'suggestion')


def missing_text(row):
    return [key for key in TEXT_FIELDS
            if not isinstance(row.get(key), str) or not row[key].strip()]


def repair_explanations(client, payload, rows):
    pending = {i: missing_text(row) for i, row in enumerate(rows) if isinstance(row, dict) and missing_text(row)}
    if not pending:
        return rows, []
    repaired = {}
    try:
        response = client.ask('03_compliance', {**payload,
            'repair_items': [{'repair_index': i, 'finding': rows[i], 'missing_fields': fields} for i, fields in pending.items()],
            'correction': '本次仅补全 repair_items 中条目的缺失文本。返回 findings 数组，每项必须带原 repair_index；保留原条款、工具和来源编号。不输出其他条目。若无法形成有依据的解释，status 必须为 pending，并说明原因。'})
        for row in response.get('findings', []) if isinstance(response.get('findings'), list) else []:
            if not isinstance(row, dict): continue
            index = row.get('repair_index')
            if type(index) is int and index in pending:
                repaired.setdefault(index, []).append(row)
    except ModelError:
        pass  # The original supported rows survive a failed repair request.
    notes = []
    output = [dict(row) if isinstance(row, dict) else row for row in rows]
    for index, fields in pending.items():
        row = output[index]
        candidates = repaired.get(index, [])
        candidate = candidates[0] if len(candidates) == 1 else None
        if candidate and not missing_text(candidate) and candidate.get('status') == row.get('status'):
            # A prose repair cannot replace evidence IDs or change the verdict.
            for key in fields: row[key] = candidate[key].strip()
            notes.append(f'规范审核第 {index+1} 项缺失的说明已由模型补全。')
            continue
        row['status'] = 'pending'
        if 'title' in fields: row['title'] = '需要补充解释的审核事项'
        original = row.get('detail') if isinstance(row.get('detail'), str) else ''
        row['detail'] = '模型未提供完整的判断理由或修改建议，本项尚未形成可确认的审核结论。' + (' 原有说明：' + original.strip() if original.strip() else '')
        if 'suggestion' in fields: row['suggestion'] = '请结合本项原文和审核依据人工核对，或重新审核以补全解释。'
        row['validation_note'] = '模型说明补全未完成，已标记待核实；程序独立确认的计算问题仍保留。'
        notes.append(f'规范审核第 {index+1} 项说明不完整，已单独标记待核实。')
    return output, notes
