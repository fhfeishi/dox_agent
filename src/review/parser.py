from __future__ import annotations

import re
import zipfile
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from pypdf import PdfReader


def compact(text): return re.sub(r'\s+', '', text)

def clean(text):
    return '\n'.join(line.strip() for line in text.splitlines() if not re.fullmatch(r'\s*(NSFC\s*\d{4}|第\s*\d+\s*页|版本[：:].*|国家自然科学基金申请书\s*\d{4}版)\s*', line))

NUMBERED = [(r'^第[一二三四五六七八九十百]+[章节部分篇]', 1), (r'^[一二三四五六七八九十]+[、.．]', 1),
            (r'^[（(][一二三四五六七八九十]+[）)]', 2), (r'^\d{1,2}\.\d{1,2}(\.\d{1,2})?(?![\d.])[、.．\s]?[^\d\s.\-–—~至]', 2)]


def heading_level(text):
    """Explicit numbered titles only; ordinary list items do not end a section."""
    text = text.strip()
    if not text or len(compact(text)) > 40 or re.search(r'[。；;]$', text):
        return 0
    return next((level for pattern, level in NUMBERED if re.match(pattern, text)), 0)


def visible(text):
    """Visible Markdown text: markup, link targets and table rules are not counted."""
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', text)
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$', '', text, flags=re.M)
    text = re.sub(r'^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+)', '', text, flags=re.M)
    return re.sub(r'[|*_`~]', '', text)


def text_blocks(path, markdown):
    """Paragraph blocks with explicit heading levels; images stay visible as unread content."""
    blocks, lines = [], []

    def flush():
        if lines:
            raw = '\n'.join(lines)
            blocks.append({'text': clean(visible(raw) if markdown else raw), 'level': 0,
                           'image': markdown and bool(re.search(r'!\[[^\]]*\]\([^)]*\)', raw))})
            lines.clear()
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        heading = re.match(r'^\s{0,3}(#{1,6})\s+(.+)$', line) if markdown else None
        if heading or (not markdown and heading_level(line)):
            flush()
            blocks.append({'text': heading.group(2).strip() if heading else line.strip(),
                           'level': len(heading.group(1)) if heading else heading_level(line), 'image': False})
        elif line.strip():
            lines.append(line)
        else:
            flush()
    flush()
    return blocks


def _rfonts(rpr, attr):
    if rpr is None:
        return None
    if attr == 'size':
        node = rpr.find(qn('w:sz'))
        return float(node.get(qn('w:val'))) / 2 if node is not None and node.get(qn('w:val')) else None
    node = rpr.find(qn('w:rFonts'))
    return node.get(qn('w:eastAsia')) if node is not None and node.get(qn('w:eastAsia')) else None


def run_fonts(document, paragraph):
    """Effective East-Asian font and size per text run: run → paragraph style chain → defaults.

    A theme font or a value no level states stays None, so the check reports it as unread
    instead of guessing.
    """
    defaults = document.styles.element.find(qn('w:docDefaults'))
    default_rpr = defaults.find(qn('w:rPrDefault') + '/' + qn('w:rPr')) if defaults is not None else None
    out = []
    for run in paragraph.runs:
        if not run.text.strip():
            continue
        value = {}
        for attr in ('font', 'size'):
            found = _rfonts(run._r.rPr, attr)
            style = paragraph.style
            while found is None and style is not None:
                found = _rfonts(style.element.rPr, attr)
                style = style.base_style
            value[attr] = found if found is not None else _rfonts(default_rpr, attr)
        out.append([value['font'], value['size'], len(compact(run.text))])
    return out


def parse_document(path: Path, extract_fields=True):
    suffix = path.suffix.lower()
    if suffix == '.pdf':
        reader = PdfReader(path)
        if reader.is_encrypted: raise ValueError('暂不支持加密 PDF，请提供可读取的版本。')
        if len(reader.pages) > 250: raise ValueError('演示版最多支持 250 页。')
        pages, blocks = [], []
        for i, p in enumerate(reader.pages):
            text = clean(p.extract_text() or '')
            try: image = bool(p.images)
            except Exception: image = True  # Unknown embedded content is not treated as fully read.
            pages.append({'page': i+1, 'text': text})
            blocks.extend({'page': i+1, 'text': line, 'level': heading_level(line), 'image': image}
                          for line in text.splitlines() if line.strip())
        kind = 'pdf'
    elif suffix in ('.doc', '.md', '.txt'):
        if suffix == '.doc':
            from .legacy_doc import read_doc
            parts = [t for t in re.split(r'[\r\n]+', read_doc(path).replace('\x07', '\t')) if t.strip()]
            raw = [{'text': clean(t), 'level': heading_level(t), 'image': False} for t in parts]
        else:
            try: raw = text_blocks(path, suffix == '.md')
            except UnicodeDecodeError: raise ValueError('文本文件须为 UTF-8 编码。') from None
        raw = [b for b in raw if b['text'].strip()]
        blocks = [{**b, 'page': i+1} for i, b in enumerate(raw)]
        pages = [{'page': b['page'], 'text': b['text']} for b in blocks]
        kind = suffix[1:]
    elif suffix == '.docx':
        with zipfile.ZipFile(path) as z:
            if sum(i.file_size for i in z.infolist()) > 100*1024*1024: raise ValueError('DOCX 解压后过大。')
        raw = []
        document = Document(path)
        for b in document.iter_inner_content():
            if hasattr(b, 'text'):
                style = (b.style.name if b.style is not None else '') or ''
                match = re.match(r'^(?:Heading|标题)\s*(\d)', style)
                image = bool(b._p.xpath('.//w:drawing|.//w:pict'))
                raw.append({'text': clean(b.text), 'image': image, 'fonts': run_fonts(document, b),
                            'level': int(match.group(1)) if match else (1 if style == 'Title' else heading_level(b.text))})
            else:
                raw.append({'text': clean('\n'.join('\t'.join(c.text for c in r.cells) for r in b.rows)), 'level': 0, 'image': False})
        # A paragraph holding only a picture is kept so its unread content stays visible.
        raw = [b for b in raw if b['text'].strip() or b['image']]
        blocks = [{**b, 'page': i+1} for i, b in enumerate(raw)]
        pages = [{'page': b['page'], 'text': b['text']} for b in blocks]
        kind = 'docx'
    else: raise ValueError('请上传 PDF、DOC、DOCX、Markdown 或 TXT 文件。')
    blocks = [{**b, 'id': f'k{i+1}'} for i, b in enumerate(blocks)]
    full = '\n'.join(p['text'] for p in pages)
    if len(compact(full)) < 100: raise ValueError('未提取到足够文字。扫描件暂不自动 OCR，请上传文字型 PDF 或 DOCX。')
    if len(full) > 1500000: raise ValueError('文字量超过演示版上限。')
    if not extract_fields:
        return {'pages':pages,'blocks':blocks,'kind':kind,'metadata':{'title':'','fund':'','category':'','year':None,'birth_date':'','budget':None,'domain':''},'warnings':[f'第 {p["page"]} 页文字较少，可能含扫描内容。' for p in pages if kind=='pdf' and len(compact(p['text']))<30]}
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
    return {'pages':pages,'blocks':blocks,'kind':kind,'metadata':{'title':title,'year':year,'fund':'国家自然科学基金' if '国家自然科学基金' in head else '',
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
