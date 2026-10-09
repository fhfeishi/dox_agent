"""Model-based metadata extraction independent of proposal layout."""
import math
import re
from datetime import date

from .model_client import Client, ModelError
from .parser import compact
from .research import redact

FIELDS=('title','fund','category','year','birth_date','budget','total_budget','organizations','plan_start','plan_end','domain')
NUMERIC=('year','budget','total_budget')
def empty(): return {k:None if k in NUMERIC else ([] if k=='organizations' else '') for k in FIELDS}

def valid_value(field,value,source):
    if field=='year': return type(value) is int and 1990<=value<=2100
    if field in ('budget','total_budget'): return type(value) in (int,float) and math.isfinite(value) and 0<=value<=1e9
    if field in ('plan_start','plan_end'):
        if not isinstance(value,str) or not re.fullmatch(r'\d{4}(-\d{2}(-\d{2})?)?',value): return False
        try: date.fromisoformat(value if len(value)==10 else (value+'-01-01')[:10]); return True
        except ValueError: return False
    # A unit name must appear in the cited passage; "无" is not a unit.
    if field=='organizations': return isinstance(value,str) and 2<=len(value)<=100 and value!='无' and compact(value) in compact(source)
    if not isinstance(value,str) or not value.strip(): return False
    if len(value)>(200 if field=='title' else 100): return False
    if field=='birth_date':
        if not re.fullmatch(r'\d{4}-\d{2}(-\d{2})?',value): return False
        try: date.fromisoformat(value if len(value)==10 else value+'-01');return True
        except ValueError:return False
    if field=='title': return not re.fullmatch(r'[0-9a-fA-F]{32}',value) and compact(value) in compact(source)
    return True

def extract(doc,client=None,progress=lambda *a:None):
    client=client or Client();cfg=client.settings
    sources=[]
    for page in doc['pages']:
        text=redact(page['text'])
        for start in range(0,len(text),1600):
            if text[start:start+1600].strip():sources.append({'source_id':f'M{len(sources)+1}','page':page['page'],'text':text[start:start+1600]})
    if not sources: raise ModelError('没有可用于提取基本信息的文字。')
    if sum(len(x['text']) for x in sources)>cfg['max_chars']: raise ModelError('文档超过模型提取字符上限；未截断或猜测字段，请手动填写或缩小材料。')
    batches=[];part=[];size=0
    for src in sources:
        if part and size+len(src['text'])>cfg['chunk']:batches.append(part);part=[];size=0
        part.append(src);size+=len(src['text'])
    if part:batches.append(part)
    if len(batches)*2>cfg['max_calls']:raise ModelError('完整读取所需调用超出配置上限，请调整预算或手工填写。')
    candidates={k:[] for k in FIELDS};notes=[];failed_chunks=[];coverage=set()
    # Give the identifying context real source IDs so later batches can cite it.
    context_sources=[];context_size=0
    for source in sources:
        if context_size+len(source['text'])>3200:break
        context_sources.append(source);context_size+=len(source['text'])
    primer='\n'.join(p['text'] for p in doc['pages'])[:2500]
    for i,batch in enumerate(batches):
        progress(i+1,len(batches))
        allowed={s['source_id']:s for s in context_sources+batch}
        data={'sources':batch,'context_sources':context_sources,'primary_context':redact(primer),'document_kind':doc['kind']}
        accepted=[];valid=False;failure='引用或返回格式未通过校验'
        for attempt in range(2):
            try:result=client.ask('00_metadata',data)
            except ModelError as exc:
                failure=str(exc);break
            rows=result.get('candidates')
            valid=isinstance(rows,list) and len(rows)<=20
            if isinstance(rows,list) and len(rows)<=20:
                for row in rows:
                    if isinstance(row,dict) and row.get('field') in FIELDS and isinstance(row.get('source_id'),str) and row['source_id'] in allowed:
                        if row not in accepted:accepted.append(row)
                    else:valid=False
            if isinstance(result.get('notes'),list): notes.extend(x[:800] for x in result['notes'][:20] if isinstance(x,str))
            if valid:break
            data['correction']='重新输出完整JSON，每个候选 field 必须使用约定字段，source_id 必须逐字使用 sources 或 context_sources 中的现有编号。没有候选时返回 candidates=[]。'
        if not valid:
            failed_chunks.append(i+1)
            notes.append(f'第 {i+1} 块未完成核验：{failure}。已保留通过校验的候选，其余信息需确认。')
        else:coverage.update(s['page'] for s in batch)
        for row in accepted:
            src=allowed[row['source_id']];field=row['field'];value=row.get('value')
            if isinstance(value,str):value=value.strip()
            if not valid_value(field,value,src['text']):notes.append(f'{field} 字段值或原文依据未通过校验，已留待确认。');continue
            candidates[field].append({'value':value,'page':src['page'],'quote':src['text'],'source_id':src['source_id'],'reason':str(row.get('reason',''))[:1000]})
    meta=empty();fields={}
    for field,rows in candidates.items():
        values=[]
        for row in rows:
            if row['value'] not in values:values.append(row['value'])
        if field=='organizations':
            # Several units form a list, not a conflict; duplicates collapse by exact name.
            meta[field]=values;status='extracted' if values else 'missing'
        elif len(values)==1:meta[field]=values[0];status='extracted'
        elif values:status='conflict'
        else:status='missing'
        fields[field]={'status':status,'candidates':rows}
    if failed_chunks and not any(candidates.values()):
        raise ModelError('未获得可用的基本信息候选，引用校验或模型调用未完成；文件已保存，可重试或手动填写。')
    return {'metadata':meta,'extraction':{'status':'partial' if failed_chunks else 'completed','method':'model','model':cfg['model'],'fields':fields,
        'failed_chunks':failed_chunks,'notes':list(dict.fromkeys(notes)),'calls':client.calls,'chunks':len(batches),'coverage_pages':sorted(coverage),
        'empty_pages':[p['page'] for p in doc['pages'] if not p['text'].strip()]}}
