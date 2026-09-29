"""Bounded final verification; missing model actions never discard earlier results."""
from .model_client import ModelError


def verify(client,findings,technical,clauses,calculations,progress):
    targets=findings+technical['cards']; tools={x['id']:x for x in calculations}
    completed=set(); unresolved=[]; notes=[]; summaries=[]
    def read_actions(value,allowed):
        grouped={}
        for action in value.get('actions',[]) if isinstance(value.get('actions'),list) else []:
            if not isinstance(action,dict): continue
            key=action.get('target_id')
            if not isinstance(key,str) or key not in allowed: continue
            if action.get('decision') not in ('retain','downgrade') or not isinstance(action.get('reason'),str) or not action['reason'].strip(): continue
            grouped.setdefault(key,[]).append(action)
        # Conflicting duplicates need a new decision, not an arbitrary first match.
        return {key:items[0] for key,items in grouped.items() if len({x['decision'] for x in items})==1}
    batches=[targets[i:i+10] for i in range(0,len(targets),10)]
    for i,batch in enumerate(batches):
        progress(4,f'结论复核 · {i+1}/{len(batches)} 批')
        allowed={x['id'] for x in batch}; accepted={}
        payload={'findings':[x for x in batch if x in findings],
            'technical':{**technical,'cards':[x for x in batch if x in technical['cards']]},
            'clauses':clauses,'calculations':calculations,'expected_ids':sorted(allowed)}
        for attempt in range(2):
            missing=allowed-set(accepted)
            if not missing: break
            data=payload if attempt==0 else {**payload,'findings':[x for x in payload['findings'] if x['id'] in missing],
                'technical':{**payload['technical'],'cards':[x for x in payload['technical']['cards'] if x['id'] in missing]},
                'expected_ids':sorted(missing),'correction':'仅补充这些尚未完成的条目，每个编号返回一个 action。'}
            try: result=client.ask('05_verify',data)
            except ModelError:
                notes.append(f'第 {i+1} 批复核调用未完成，保留已有结果并标明未复核事项。'); break
            accepted.update(read_actions(result,missing))
            if attempt==0 and isinstance(result.get('summary'),str): summaries.append(result['summary'][:1200])
            if isinstance(result.get('limitations'),list): notes.extend(x[:1500] for x in result['limitations'] if isinstance(x,str))
        for item in batch:
            action=accepted.get(item['id'])
            protected=any(tools.get(t,{}).get('status')=='issue' for t in item.get('tool_ids',[]))
            if not action:
                unresolved.append(item['id']); item['verification_status']='pending'
                item['verification_note']='最终模型复核未完成；本条需人工复核。'+('程序已确认的计算问题仍保留。' if protected else '')
                item['pre_verification_status']=item['status']
                if not protected: item['status']='pending'
                field='detail' if 'detail' in item else 'assessment'
                item[field]=item['verification_note']+' '+item.get(field,'')
            else:
                completed.add(item['id']); item['verification_status']='completed'; item['verification_note']=action['reason']
                if action['decision']=='downgrade' and not protected: item['status']='pending'
    if unresolved:
        summary=f'前序审核结果已保留，但有 {len(unresolved)} 项最终复核未完成，相关意见需人工核查。'
        notes.insert(0,summary)
        technical['summary']='部分结论的最终复核尚未完成，请以逐项标记为准。'+technical['summary']
    else: summary='\n'.join(summaries) or '已完成逐项结论复核，请结合原文依据阅读。'
    return {'summary':summary,'limitations':list(dict.fromkeys(notes)),
        'verification':{'total':len(targets),'completed':len(completed),'pending':len(unresolved),'pending_ids':unresolved,'batches':len(batches)}}
