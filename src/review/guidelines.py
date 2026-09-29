"""Build a review checklist directly from supplied guideline documents."""
import uuid
from datetime import date

from .model_client import Client, ModelError
from .models import GuideCheck, RulePack
from .research import redact


def generate(guides,client=None):
    client=client or Client(); cfg=client.settings
    sources=[]
    for guide in guides:
        for page in guide['pages']:
            text=redact(page['text'])
            for offset in range(0,len(text),1600):
                if text[offset:offset+1600].strip():
                    sources.append({'source_id':f'G{len(sources)+1}','guideline_id':guide['id'],'filename':guide['filename'],'page':page['page'],'location_type':'页' if guide['kind']=='pdf' else '文本块','text':text[offset:offset+1600]})
    if not sources: raise ModelError('指南未提取到可用文字。')
    if sum(len(x['text']) for x in sources)>cfg['max_chars']: raise ModelError('指南文字超过单次生成上限，请分批处理。')
    batches=[]; batch=[]; count=0
    for src in sources:
        if batch and count+len(src['text'])>10000: batches.append(batch); batch=[]; count=0
        batch.append(src); count+=len(src['text'])
    if batch: batches.append(batch)
    if len(batches)>cfg['max_calls']//2: raise ModelError('指南过长，无法在调用预算内完整提取，请缩小材料范围。')
    checks=[]; notes=[]; missing=[]; metadata=[]
    for batch in batches:
        allowed={x['source_id']:x for x in batch}
        payload={'sources':batch,'documents':[{'filename':g['filename'],'kind':g['kind']} for g in guides]}
        for attempt in range(2):
            result=client.ask('00_plan',payload)
            rows=result.get('checks')
            valid=isinstance(rows,list) and len(rows)<=40 and all(isinstance(r,dict) and r.get('source_id') in allowed for r in rows)
            if valid: break
            payload['correction']='请重新生成完整 JSON；每个检查项 source_id 必须来自本次 sources，最多40项。'
        if not valid: raise ModelError('指南检查清单格式或原文引用无效，请重新生成。')
        metadata.append(result)
        for field,dest in [('notes',notes),('missing_documents',missing)]:
            values=result.get(field,[])
            if not isinstance(values,list) or not all(isinstance(x,str) for x in values): raise ModelError('指南返回的缺失材料或说明格式无效。')
            dest.extend(values)
        for row in rows:
            src=allowed[row['source_id']]
            item={**row,'id':f'check-{len(checks)+1}','guideline_id':src['guideline_id'],'page':src['page'],'quote':src['text'],
                'source':f'{src["filename"]} · 第 {src["page"]} {src["location_type"]}：{src["text"]}','enabled':True}
            try: checks.append(GuideCheck.model_validate(item).model_dump())
            except Exception: raise ModelError('模型生成的检查项字段不完整，请重新生成。') from None
    if not checks: raise ModelError('未识别出可审核要求，请确认上传的是指南或填写说明。')
    if len(checks)>100: raise ModelError('检查清单超过100项，请按项目类别拆分指南。')
    head=metadata[0]; years={r.get('year') for r in metadata if isinstance(r.get('year'),int)}
    if len(years)!=1: notes.append('申报年份未唯一确定，请确认适用年份后启用。')
    scopes={r.get('category') for r in metadata if r.get('category')}
    if len(scopes)>1: notes.append('材料涉及多个项目类别，请确认各检查项适用条件；冲突不得默认合并。')
    notes.extend(w for g in guides for w in g.get('warnings',[]))
    return RulePack.model_validate({'id':'guide-'+uuid.uuid4().hex[:12],'name':head.get('name') or guides[0]['filename'],'fund':head.get('fund') or '',
        'category':head.get('category') or '', 'year':next(iter(years)) if len(years)==1 else date.today().year,
        'scope_note':head.get('scope_note') or '仅依据上传指南提取；未提供的引用文件不在本次覆盖范围内。',
        'engine':'guideline','checks':checks,'guideline_ids':[g['id'] for g in guides], 'missing_documents':list(dict.fromkeys(missing))[:30],
        'extraction_notes':list(dict.fromkeys(notes))[:40],'generation':{'model':cfg['model'],'calls':client.calls,'source_count':len(sources),'documents':[{'id':g['id'],'filename':g['filename'],'kind':g['kind']} for g in guides]},
        'confirmed':False}).model_dump(mode='json')
