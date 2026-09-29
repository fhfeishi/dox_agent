from __future__ import annotations

import re
import zipfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader


def compact(text): return re.sub(r'\s+', '', text)

def clean(text):
    return '\n'.join(line.strip() for line in text.splitlines() if not re.fullmatch(r'\s*(NSFC\s*\d{4}|第\s*\d+\s*页|版本[：:].*|国家自然科学基金申请书\s*\d{4}版)\s*', line))

def parse_document(path: Path, extract_fields=True):
    if path.suffix.lower() == '.pdf':
        reader = PdfReader(path)
        if reader.is_encrypted: raise ValueError('暂不支持加密 PDF，请提供可读取的版本。')
        if len(reader.pages) > 250: raise ValueError('演示版最多支持 250 页。')
        pages = [{'page': i+1, 'text': clean(p.extract_text() or '')} for i,p in enumerate(reader.pages)]
        kind = 'pdf'
    elif path.suffix.lower() == '.doc':
        from .legacy_doc import read_doc
        text=read_doc(path)
        pages=[{'page':i+1,'text':clean(t)} for i,t in enumerate(t for t in re.split(r'[\r\n]+',text.replace('\x07','\t')) if t.strip())]
        kind='doc'
    elif path.suffix.lower() == '.docx':
        with zipfile.ZipFile(path) as z:
            if sum(i.file_size for i in z.infolist()) > 100*1024*1024: raise ValueError('DOCX 解压后过大。')
        blocks = []
        for b in Document(path).iter_inner_content():
            blocks.append(b.text if hasattr(b,'text') else '\n'.join('\t'.join(c.text for c in r.cells) for r in b.rows))
        pages = [{'page': i+1, 'text': clean(t)} for i,t in enumerate(t for t in blocks if t.strip())]
        kind = 'docx'
    else: raise ValueError('请上传 PDF、DOC 或 DOCX 文件。')
    full = '\n'.join(p['text'] for p in pages)
    if len(compact(full)) < 100: raise ValueError('未提取到足够文字。扫描件暂不自动 OCR，请上传文字型 PDF 或 DOCX。')
    if len(full) > 1500000: raise ValueError('文字量超过演示版上限。')
    if not extract_fields:
        return {'pages':pages,'kind':kind,'metadata':{'title':'','fund':'','category':'','year':None,'birth_date':'','budget':None,'domain':''},'warnings':[f'第 {p["page"]} 页文字较少，可能含扫描内容。' for p in pages if kind=='pdf' and len(compact(p['text']))<30]}
    raw_head='\n'.join(p['text'] for p in (pages[:15] if kind=='pdf' else pages[:80]))
    head=compact(raw_head)
    units=[t.strip() for t in re.split(r'[\r\n\t]+',raw_head) if t.strip()]
    labels=r'项目名称|英文名称|申请人|资助类别|资助类型|项目类别|申请代码|研究属性|依托单位|合作单位|性别|出生年月|职称|学位|电子邮箱|联系电话|摘要|关键词|申请年度|申报年份'
    def field(names):
        pattern=re.compile(r'^(?:'+names+r')\s*[：:]?\s*(.*)$')
        for i,line in enumerate(units):
            m=pattern.match(line)
            if not m: continue
            value=m.group(1).strip()
            if not value and i+1<len(units) and not re.match(r'^(?:'+labels+r')',units[i+1]): value=units[i+1]
            value=re.split(r'(?:'+labels+r')\s*[：:]',value,maxsplit=1)[0].strip()
            if value: return value
        return ''
    title=field('项目名称')
    if kind=='pdf':
        m=re.search(r'项目名称[：:]?(.{2,100}?)(?:英文名称|申请人|资助类别|资助类型|项目类别|申请代码)',head)
        if m: title=m.group(1)
    # A storage path (often a UUID) is never a document title.
    if len(title)>200 or re.fullmatch(r'[0-9a-fA-F]{32}',title or ''): title=''
    category=field('资助类别|资助类型|项目类别')
    if not category:
        m=re.search(r'资助类别[：:]?(.{2,30}?)(?:亚类说明|附注说明|项目名称)',head)
        category=m.group(1) if m else ''
    year_match=re.search(r'(?:申请年度|申报年份|申报年度)[：:]?\s*(20\d{2})',raw_head)
    if not year_match: year_match=re.search(r'(20\d{2})(?:版|年度)',head)
    if not year_match:
        year_match=next((m for line in units[:3] if (m:=re.search(r'(?:申请书|填报说明).{0,40}?(20\d{2})',line))),None)
    year=int(year_match.group(1)) if year_match else None
    budget_match=re.search(r'申请直接费用[：:]?([\d.]+)万元',head)
    birth_match=re.search(r'出生年月[：:]?[^\d\r\n]{0,12}(\d{4})[年/-](\d{1,2})(?:月|[-/])(\d{1,2})?日?',raw_head)
    if not birth_match: birth_match=re.search(r'出生年月[：:]?(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?',head)
    birth=''
    if birth_match:
        y,m,d=birth_match.groups()
        if 1<=int(m)<=12 and (not d or 1<=int(d)<=31): birth=f'{y}-{int(m):02}'+(f'-{int(d):02}' if d else '')
    domain='人工智能 / 综合研究'
    for term,value in [('深度伪造','人工智能 / 计算机视觉 / 内容安全'),('机器人','人工智能 / 机器人'),('医疗','人工智能 / 医疗'),('金融','人工智能 / 金融')]:
        if term in title: domain=value; break
    warnings=[f'第 {p["page"]} 页文字较少，可能包含扫描内容。' for p in pages if kind=='pdf' and len(compact(p['text']))<30]
    if not title: warnings.append('未能可靠识别项目名称，请依据申请书原文填写。')
    return {'pages':pages,'kind':kind,'metadata':{'title':title,'year':year,'fund':'国家自然科学基金' if '国家自然科学基金' in head else '',
        'category':category,'birth_date':birth,'budget':float(budget_match.group(1)) if budget_match else None,'domain':domain},'warnings':warnings}


def find_section(pages,start,end):
    chunks,offsets,cursor=[],[],0
    for p in pages:
        t=compact(p['text']); offsets.append((cursor,p['page'])); chunks.append(t); cursor+=len(t)+1
    full='\n'.join(chunks); a=full.find(compact(start))
    if a<0: return None
    b=full.find(compact(end),a+len(compact(start))) if end else len(full)
    if b<0: return None
    text=full[a+len(compact(start)):b]
    text=re.sub(r'^[（(][^）)]{0,160}[）)][：:；;]?','',text).lstrip('：:；;')
    return {'text':text,'page':max((p for o,p in offsets if o<=a),default=1),'end_page':max((p for o,p in offsets if o<=b),default=1),'count':len(compact(text))}

def page_for(pages,term): return next((p['page'] for p in pages if compact(term) in compact(p['text'])),None)
