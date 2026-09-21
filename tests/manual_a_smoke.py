"""Opt-in real-model smoke at the same URL users open; never part of pytest."""
import json
import sys
import time
from pathlib import Path

import httpx


def main():
    base = "http://127.0.0.1:8000"
    client = httpx.Client(base_url=base, timeout=200, trust_env=False)
    docs = client.get("/api/documents").json()
    selected = next(d for d in docs if d["title"] == "LangGraph overview")
    cases = [
        ("scoped", "根据所选资料，用两句话说明LangGraph主要解决什么问题。", "low", "knowledge_only", [selected["doc_id"]]),
        ("ambiguous", "根据这份资料，说说它的结论。", "middle", "auto", None),
        ("specific", "解释这个API页面 https://docs.langchain.com/oss/python/integrations/retrievers/a-batch-nonexistent", "high", "auto", None),
    ]
    report = Path("reports/a_live_smoke.json")
    results = json.loads(report.read_text()) if report.exists() else []
    for name, question, level, routing, scope in cases:
        if sys.argv[1:] and name not in sys.argv[1:]:
            continue
        started = time.monotonic()
        response = client.post("/api/chat", json={"messages": [{"role": "user", "content": question}], "evidence_level": level, "query_routing": routing, "allowed_doc_ids": scope})
        events = []
        for frame in response.text.split("\n\n"):
            lines = frame.splitlines()
            event = next((line[7:] for line in lines if line.startswith("event: ")), None)
            data = next((line[6:] for line in lines if line.startswith("data: ")), None)
            if event and data:
                events.append({"event": event, "data": json.loads(data)})
        item = {"case": name, "question": question, "seconds": round(time.monotonic() - started, 2), "events": events}
        results = [result for result in results if result["case"] != name] + [item]
        print(json.dumps({"case": name, "seconds": item["seconds"], "policy": [e["data"] for e in events if e["event"] == "policy"], "answer": "".join(e["data"]["text"] for e in events if e["event"] == "token"), "errors": [e for e in events if e["event"] == "error"]}, ensure_ascii=False), flush=True)
        report.write_text(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
