"""Read main-story text from Word 97+ binary documents; never execute Office.
Format: Microsoft [MS-DOC] 2.4.1, FibRgFcLcb97, PlcPcd and FcCompressed.
https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/1caae71f-35c4-49d7-adf0-af5fc766331c
"""
import struct

import olefile


def read_doc(path):
    try:
        with olefile.OleFileIO(str(path)) as ole:
            if ole.get_size('WordDocument')>100*1024*1024: raise ValueError()
            word=ole.openstream('WordDocument').read()
            u16=lambda o:struct.unpack_from('<H',word,o)[0]
            u32=lambda o:struct.unpack_from('<I',word,o)[0]
            if u16(0)!=0xA5EC or u16(2)<0xC1: raise ValueError()
            flags=u16(10)
            if flags & 0x8100: raise ValueError('不支持加密 DOC，请先解密或另存为 DOCX。')
            table_name='1Table' if flags & 0x0200 else '0Table'
            if ole.get_size(table_name)>100*1024*1024: raise ValueError()
            table=ole.openstream(table_name).read()
            offset=32
            offset+=2+2*u16(offset)
            long_count=u16(offset); offset+=2
            if long_count<4: raise ValueError()
            main_count=u32(offset+12)
            if main_count>1500000: raise ValueError()
            offset+=4*long_count
            pair_count=u16(offset); offset+=2
            if pair_count<34: raise ValueError()
            fc=u32(offset+33*8); length=u32(offset+33*8+4)
            if fc+length>len(table): raise ValueError()
            clx=table[fc:fc+length]; pos=0
            while pos<len(clx) and clx[pos]==1:
                pos+=3+struct.unpack_from('<H',clx,pos+1)[0]
            if pos>=len(clx) or clx[pos]!=2: raise ValueError()
            size=struct.unpack_from('<I',clx,pos+1)[0]; plc=clx[pos+5:pos+5+size]
            if size!=len(plc) or size<4 or (size-4)%12: raise ValueError()
            count=(size-4)//12
            if count>200000: raise ValueError()
            cps=struct.unpack_from('<'+'I'*(count+1),plc,0)
            if cps[0]!=0 or cps[-1]<main_count: raise ValueError()
            pieces=[]
            for i in range(count):
                if cps[i+1]<=cps[i]: raise ValueError()
                if cps[i]>=main_count: break
                chars=min(cps[i+1],main_count)-cps[i]
                encoded=struct.unpack_from('<I',plc,4*(count+1)+8*i+2)[0]
                compressed=bool(encoded & 0x40000000); start=encoded & 0x3fffffff
                if compressed: start//=2
                end=start+chars*(1 if compressed else 2)
                if end>len(word): raise ValueError()
                raw=word[start:end]
                if compressed:
                    text=''.join(bytes([b]).decode('cp1252') if b not in (0x81,0x8D,0x8F,0x90,0x9D) else chr(b) for b in raw)
                else: text=raw.decode('utf-16-le')
                pieces.append(text)
            return ''.join(pieces)
    except ValueError as e:
        if str(e).startswith('不支持加密'): raise
        raise ValueError('DOC 结构不受支持或文件损坏，请另存为 DOCX 后上传。') from None
    except Exception:
        raise ValueError('无法解析旧版 DOC，请确认文件完整或另存为 DOCX。') from None
