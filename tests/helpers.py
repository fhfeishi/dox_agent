"""Shared test fixtures."""
import hashlib

from src.knowledge import Document, Knowledge


def put_listed(store: Knowledge, doc: Document, **kwargs) -> dict:
    """Publish a fixture document with a manifest entry, as every real import does (P0-3 B1).

    Fixture origins name no file under the corpus ``source/``, so the entry is a virtual one
    (``manual:<doc_id>``): it is current without a disk check, exactly as unlisted fixtures were
    before B1. Tests about local files pass a real ``source_file`` instead; tests about the
    unlisted case use ``put_unlisted``.
    """
    doc_id = kwargs.pop("doc_id", None) or hashlib.sha256(doc.origin.encode()).hexdigest()[:20]
    body = "\n".join(page.text for page in doc.pages).encode()
    return store.put(doc, doc_id=doc_id, source_file=("manual:" + doc_id, len(body), 0,
                                                      hashlib.sha256(body).hexdigest()), **kwargs)


def put_unlisted(store: Knowledge, doc: Document) -> dict:
    """A pre-B1 history row: the document is stored but has no manifest entry (never current)."""
    result = put_listed(store, doc)
    with store.connect() as db:
        db.execute("DELETE FROM files WHERE doc_id=?", (result["doc_id"],))
    return result
