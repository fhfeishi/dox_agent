"""Bounded evidence matching utilities; documents are untrusted data.

删减说明：local_review 关键词本地评议与 TOPICS/seeded 人脸伪造硬编码已按裁决删除。
保留：PII 脱敏 redact、模型评议结果校验 validate_model_result、Crossref 题录检索。
"""
import re

import httpx

from .parser import compact


def redact(text):
    text = re.sub(r"(?:银行账号|账户|账号)\s*[:：]\s*[0-9 ]{8,40}", "账户：[已掩码]", text)
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[邮箱已移除]", text)
    text = re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", "[电话已移除]", text)
    text = re.sub(r"(?<!\d)\d{17}[\dXx](?!\d)", "[证件号已移除]", text)
    return text


def validate_model_result(result, doc, evidence):
    allowed = {e["id"] for e in evidence}
    pages = {p["page"]: compact(p["text"]) for p in doc["pages"]}
    if not isinstance(result.get("summary"), str) or not isinstance(result.get("cards"), list) or not 1 <= len(result["cards"]) <= 8:
        raise ValueError("模型返回结构无效")
    clean_cards = []
    for i, c in enumerate(result["cards"]):
        ids = c.get("evidence_ids", [])
        page = c.get("page")
        quote = c.get("quote", "")
        if not isinstance(ids, list) or any(x not in allowed for x in ids):
            raise ValueError("模型引用了未提供的证据")
        if page not in pages or not quote or compact(quote) not in pages[page]:
            raise ValueError("模型原文引用无法定位")
        if not all(isinstance(c.get(k), str) and 1 <= len(c[k]) <= 4000 for k in ["title", "assessment", "suggestion"]):
            raise ValueError("模型评议字段无效")
        clean_cards.append({
            "id": f"model-{i}", "title": c["title"], "assessment": c["assessment"],
            "suggestion": c["suggestion"], "page": page, "quote": quote,
            "evidence_ids": ids, "status": "advisory" if ids else "pending",
            "basis": "模型基于所列文献摘要及申请书节选生成，须人工复核。",
        })
    return {"summary": result["summary"][:4000], "cards": clean_cards}


def search_crossref(query, cutoff):
    # Only this explicit user-supplied query goes to Crossref, never the application document.
    with httpx.Client(timeout=20, follow_redirects=True) as client:
        r = client.get(
            "https://api.crossref.org/works",
            params={"query.bibliographic": query, "filter": f"until-pub-date:{cutoff}", "rows": 6},
            headers={"User-Agent": "DoxAgentReview/0.1"},
        )
        r.raise_for_status()
    output = []
    for x in r.json()["message"]["items"]:
        parts = (x.get("published", {}).get("date-parts") or [[]])[0]
        if not parts:
            continue
        # Conservative upper date when metadata is incomplete, not invented Jan 1.
        from calendar import monthrange
        y = parts[0]
        m = parts[1] if len(parts) > 1 else 12
        d = parts[2] if len(parts) > 2 else monthrange(y, m)[1]
        published = f"{y:04}-{m:02}-{d:02}"
        if published > cutoff:
            continue
        abstract = re.sub("<[^>]+>", "", x.get("abstract", "")).strip()
        output.append({
            "title": (x.get("title") or ["未命名文献"])[0],
            "published": published,
            "url": "https://doi.org/" + x["DOI"],
            "summary": abstract[:5000] or "检索仅返回题录，未提供摘要。请阅读原文并补充摘要后加入证据库。",
            "keywords": query.split()[:15],
            "has_abstract": bool(abstract),
        })
    return output
