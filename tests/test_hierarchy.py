"""One corpus-level synthesis journey: only the model answers are controlled.

Extraction, project indexing, hierarchy validation, storage and HTTP use real code and
temporary storage. The test distinguishes kept vs dropped entries, gap reporting, stale
topics and a failed update that must keep the previous version.
"""

import asyncio
import json
import re
import time
from io import BytesIO
from types import SimpleNamespace

from fastapi.testclient import TestClient
from test_app import setup

from src.knowledge import Document, Page

BODY = ("# 国家自然科学基金报告\n\n直接费用：100（万元）\n\n"
        "临床诊疗场景存在病灶识别困难与标注数据不足，项目采用深度学习，形成原型系统，"
        "培养研究生并发表论文。")


class TargetModel:
    """Four-dimension extraction double; every quote must exist in the parsed body."""

    async def ainvoke(self, messages):
        return SimpleNamespace(content="""{
          "facets": [
            {"key":"场景","items":[{"id":"s1","name":"临床诊疗","desc":"临床诊疗流程。","evidence":[{"quote":"临床诊疗场景"}]}]},
            {"key":"问题","items":[
              {"id":"p1","name":"病灶识别困难","desc":"识别精度不足。","evidence":[{"quote":"病灶识别困难"}]},
              {"id":"p2","name":"标注数据不足","desc":"缺少标注数据。","evidence":[{"quote":"标注数据不足"}]}]},
            {"key":"技术","items":[{"id":"t1","name":"深度学习","desc":"深度学习方法。","evidence":[{"quote":"采用深度学习"}]}]},
            {"key":"成果","items":[{"id":"o1","name":"原型系统","desc":"已形成原型。","status":"已取得","evidence":[{"quote":"形成原型系统"}]}]}
          ],
          "relations": []
        }""", response_metadata={})


class HierarchyModel:
    """Synthesis double: one clean scene, plus entries that cannot be traced back."""

    def __init__(self):
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        # A faithful model cites the item ids the prompt supplies; this one also cites a foreign id.
        match = re.search(r"- 原型系统（覆盖去重项目 \d+ 个；条目ID：([^）]+)）", messages[-1].content)
        assert match, "综合提示必须给出成果条目的 ID"
        own_id = match.group(1).strip()
        answer = {"scenes": [{
            # Scenes and issues are named categories over extracted topics.
            "name": "临床应用", "members": ["临床诊疗"], "summary": "围绕临床诊疗流程展开。",
            "issues": [
                {"name": "识别精度瓶颈", "members": ["病灶识别困难", "不存在的问题"], "state": "已解决", "summary": "已有深度学习方法。",
                 "routes": [{"title": "深度学习", "summary": "以深度学习提升识别。"},
                            {"title": "多模态融合", "summary": "清单外的名称，应被丢弃。"}]},
                {"name": "标注数据不足", "members": ["标注数据不足", "病灶识别困难"], "state": "待解决",
                 "summary": "库内尚无对应技术。", "routes": []},
                {"name": "临床疗效评估困难", "state": "已解决", "summary": "清单外的问题，应被丢弃。",
                 "routes": []}],
            "achievements": [{
                "title": "原型系统", "summary": "已形成原型系统。",
                "aspects": [
                    {"aspect": "论文", "stage": "已取得", "note": "报告记载发表论文。",
                     "item_ids": ["item-其它成果"]},
                    {"aspect": "人才/团队", "stage": "在研", "note": "培养研究生。",
                     "item_ids": [own_id]}]}]}]}
        return SimpleNamespace(content=json.dumps(answer, ensure_ascii=False), response_metadata={})


class BrokenModel:
    async def ainvoke(self, messages):
        return SimpleNamespace(content="not json", response_metadata={})


class ExtraTargetModel:
    """A second report contributing one more scene and one more issue topic."""

    async def ainvoke(self, messages):
        return SimpleNamespace(content="""{
          "facets": [
            {"key":"场景","items":[{"id":"s1","name":"远程手术","desc":"远程手术流程。","evidence":[{"quote":"远程手术场景"}]}]},
            {"key":"问题","items":[{"id":"p1","name":"术中导航困难","desc":"导航精度不足。","evidence":[{"quote":"术中导航困难"}]}]},
            {"key":"技术","items":[{"id":"t1","name":"图像配准","desc":"图像配准方法。","evidence":[{"quote":"图像配准算法"}]}]},
            {"key":"成果","items":[{"id":"o1","name":"手术导航原型","desc":"已形成原型。","status":"已取得","evidence":[{"quote":"手术导航原型"}]}]}
          ],
          "relations": []
        }""", response_metadata={})


def _prepared(tmp_path, monkeypatch):
    monkeypatch.setattr("src.targets.model_for", lambda settings: TargetModel())
    app, store = setup(tmp_path)
    saved = store.put(Document(title="示例报告", origin="2021_2025_P1_张三_report.md", kind="text",
                              parser="markdown", pages=[Page(number=1, text=BODY)], markdown=BODY))
    with TestClient(app) as client:
        corpus_id = client.get("/api/corpora").json()[0]["id"]
        job_id = client.post(f"/api/corpora/{corpus_id}/target",
                             json={"doc_ids": [saved["doc_id"]]}).json()["job_id"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            job = client.get(f"/api/corpora/{corpus_id}/target/jobs/{job_id}").json()
            if job["status"] != "running":
                break
            time.sleep(0.01)
        assert job["status"] == "done"
    return app, corpus_id, saved


def test_hierarchy_keeps_traceable_entries_and_reports_gaps(tmp_path, monkeypatch):
    app, corpus_id, saved = _prepared(tmp_path, monkeypatch)
    from src import hierarchy

    model = HierarchyModel()
    monkeypatch.setattr(hierarchy, "model_for", lambda settings: model)
    with TestClient(app) as client:
        before = client.get(f"/api/corpora/{corpus_id}/hierarchy").json()
        assert before["state"] == "missing" and before["topics"]["场景"] == 1

        record = client.post(f"/api/corpora/{corpus_id}/hierarchy", json={}).json()
        assert record["process"]["status"] == "已完成", record["process"]
        assert record["state"] == "ready"
        scene = record["scenes"][0]
        assert (scene["name"], scene["members"]) == ("临床应用", ["临床诊疗"])
        assert [issue["state"] for issue in scene["issues"]] == ["已解决", "待解决"]
        # Unknown members are dropped, and a topic counts in one category only.
        assert [issue["members"] for issue in scene["issues"]] == [["病灶识别困难"], ["标注数据不足"]]
        assert any("已归入其他类别" in gap["detail"] for gap in record["coverage"]["gaps"])
        assert [route["title"] for route in scene["issues"][0]["routes"]] == ["深度学习"]
        assert scene["issues"][0]["routes"][0]["evidence"][0]["quote"] == "采用深度学习"
        achievement = scene["achievements"][0]
        assert achievement["marker_basis"]["projects"] == 1
        assert achievement["marker_basis"]["representative"] == "示例报告"
        stages = {aspect["aspect"]: aspect for aspect in achievement["aspects"]}
        assert len(stages) == 8
        # An aspect may only cite evidence belonging to its own achievement.
        assert stages["论文"]["stage"] == "原文未提及"
        assert stages["人才/团队"]["stage"] == "在研" and stages["人才/团队"]["evidence"]
        assert stages["平台/基地"]["stage"] == "原文未提及" and not stages["平台/基地"]["answered"]
        assert {"issue", "route", "aspect"} <= {gap["kind"] for gap in record["coverage"]["gaps"]}

        # A repeat call reuses the current result; a forced call runs the model again.
        again = client.post(f"/api/corpora/{corpus_id}/hierarchy", json={}).json()
        assert again["generated_at"] == record["generated_at"] and model.calls == 1
        client.post(f"/api/corpora/{corpus_id}/hierarchy", json={"force": True})
        assert model.calls == 2

    assert saved["version"]


def test_hierarchy_update_failure_keeps_the_previous_version(tmp_path, monkeypatch):
    app, corpus_id, _ = _prepared(tmp_path, monkeypatch)
    from src import hierarchy

    monkeypatch.setattr(hierarchy, "model_for", lambda settings: HierarchyModel())
    with TestClient(app) as client:
        client.post(f"/api/corpora/{corpus_id}/hierarchy", json={})
        monkeypatch.setattr(hierarchy, "model_for", lambda settings: BrokenModel())
        failed = client.post(f"/api/corpora/{corpus_id}/hierarchy", json={"force": True}).json()

    assert failed["process"]["status"] == "未完成"
    assert "模型未返回合法 JSON" in failed["process"]["error"]
    assert failed["coverage"]["update_error"]
    assert failed["scenes"], "一次失败不得清空已生成的层级"


def test_report_body_carries_the_same_hierarchy_with_its_own_citations(tmp_path):
    """R-SCN-07: the report reuses the stored hierarchy instead of a second synthesis."""
    from src.agent.config import Settings
    from src.knowledge import Knowledge
    from src.reports import generate_markdown

    class ReportModel:
        def __init__(self):
            self.seen = ""

        async def ainvoke(self, messages):
            self.seen = "\n".join(message.content for message in messages)
            return SimpleNamespace(content="# 综合报告\n\n## 发现\n临床诊疗已形成原型 [1]")

    store = Knowledge(tmp_path / "db")
    store.put(Document(title="示例报告", origin="/docs/2021_2025_82030037_张三_report.md", kind="pdf",
                       parser="mineru", pages=[Page(number=1, text=BODY)],
                       markdown=f"# 报告\n{BODY}"))
    evidence = [{"item_id": "s1", "doc_id": store.current()[0]["doc_id"],
                 "version": store.current()[0]["version"], "quote": "临床诊疗场景",
                 "locator": {"basis": "parsed_text", "start_char": 1, "end_char": 5}}]
    record = {
        "state": "ready", "fingerprint": "fp", "generated_at": "2026-10-08T09:00:00+00:00",
        "coverage": {"targets": {"scenes": 6, "issues_per_scene": 3, "routes_per_issue": 2,
                                 "achievements_per_scene": 3},
                     "scenes": 1, "issues": 1, "solved_issues": 1, "open_issues": 0, "routes": 1,
                     "achievements": 1, "gaps": [{"kind": "route", "detail": "清单外的技术名称：多模态融合"}]},
        "scenes": [{"name": "临床诊疗", "summary": "围绕临床诊疗流程展开。",
                    "project_ids": ["NSFC:1"], "item_ids": ["s1"], "evidence": evidence,
                    "issues": [{"name": "病灶识别困难", "state": "已解决", "summary": "已有深度学习方法。",
                                "project_ids": ["NSFC:1"], "item_ids": ["p1"], "evidence": evidence,
                                "routes": [{"title": "深度学习", "summary": "以深度学习提升识别。",
                                            "project_ids": ["NSFC:1"], "item_ids": ["t1"],
                                            "evidence": evidence}]}],
                    "achievements": [{"title": "原型系统", "summary": "已形成原型系统。",
                                      "marker_basis": {"projects": 1, "representative": "示例报告", "note": ""},
                                      "project_ids": ["NSFC:1"], "item_ids": ["o1"], "evidence": evidence,
                                      "aspects": [{"aspect": aspect, "stage": stage, "note": "",
                                                   "answered": stage != "原文未提及",
                                                   "item_ids": ["o1"], "evidence": evidence}
                                                  for aspect, stage in
                                                  (("论文", "已取得"), ("专利", "原文未提及"),
                                                   ("人才/团队", "在研"), ("平台/基地", "原文未提及"),
                                                   ("数据与样本", "原文未提及"), ("指标达成", "原文未提及"),
                                                   ("标准/许可", "原文未提及"), ("转化与应用", "仅预期"))]}]}],
    }
    params = {"domain": "临床", "year_from": 2021, "year_to": 2025, "template_id": "comprehensive"}
    model = ReportModel()
    params["hierarchy_record"] = record
    markdown = asyncio.run(generate_markdown(store, Settings(_env_file=None), params, llm=model))
    section = markdown.split("## 场景层级（按四维归纳结果生成）", 1)[1].split("## 来源附录", 1)[0]
    assert "| 病灶识别困难 | 已解决 | 深度学习：以深度学习提升识别。 | [1] |" in section
    assert "论文：已取得" in section and "专利：原文未提及" in section
    assert "原型系统" in section and "实际归纳：场景 1 类、核心问题 1 个" in section
    assert "生成缺口 1 项" in section
    assert markdown.index("## 场景层级") < markdown.index("## 来源附录")
    # The frozen snapshot travels with the run params so an old report keeps its own version.
    assert params["hierarchy"]["fingerprint"] == "fp" and params["hierarchy"]["scenes"] == 1
    assert "不得改写其名称、状态或数量" in model.seen

    # A library without a hierarchy must not gain an empty or invented chapter.
    plain = asyncio.run(generate_markdown(store, Settings(_env_file=None),
                                          {"domain": "临床", "year_from": 2021, "year_to": 2025,
                                           "template_id": "comprehensive"},
                                          llm=ReportModel()))
    assert "场景层级" not in plain


def test_hierarchy_is_stale_when_the_four_dimension_topics_change(tmp_path, monkeypatch):
    app, corpus_id, _ = _prepared(tmp_path, monkeypatch)
    from src import hierarchy

    monkeypatch.setattr(hierarchy, "model_for", lambda settings: HierarchyModel())
    with TestClient(app) as client:
        client.post(f"/api/corpora/{corpus_id}/hierarchy", json={})
        assert client.get(f"/api/corpora/{corpus_id}/hierarchy").json()["state"] == "ready"

        # A second report adds a scene topic, so the stored hierarchy is behind the index.
        body = ("# 另一份报告\n\n国家自然科学基金远程手术场景存在术中导航困难，项目采用图像配准算法，"
                "形成手术导航原型，发表论文。")
        uploaded = client.post(f"/api/corpora/{corpus_id}/files",
                               files={"upload": ("2022_2024_C1_李四_report.md",
                                                 BytesIO(body.encode()), "text/markdown")})
        assert uploaded.status_code == 201, uploaded.text
        doc_id = next(item["doc_id"] for item in client.get(f"/api/corpora/{corpus_id}/files").json()["files"]
                      if item["rel_path"].endswith("李四_report.md"))
        monkeypatch.setattr("src.targets.model_for", lambda settings: ExtraTargetModel())
        job_id = client.post(f"/api/corpora/{corpus_id}/target", json={"doc_ids": [doc_id]}).json()["job_id"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            job = client.get(f"/api/corpora/{corpus_id}/target/jobs/{job_id}").json()
            if job["status"] != "running":
                break
            time.sleep(0.01)
        state = client.get(f"/api/corpora/{corpus_id}/hierarchy").json()

    assert state["state"] == "stale" and state["message"]
    assert state["scenes"], "需更新也要能回读已生成内容"
    assert state["topics"]["场景"] == 2

def test_intelligence_report_appends_the_same_library_hierarchy(tmp_path, monkeypatch):
    """R-SCN-07 for 情报分析: same record, only entries backed by this run's local sources."""
    import json as json_module

    from pydantic import SecretStr

    from src.agent.config import Settings
    from src.agent.corpora import corpus_id_for
    from src.knowledge import Knowledge
    from src.main import create_app
    from tests.test_artifacts import FakeGraph

    class Model:
        def __init__(self):
            self.seen = ""

        async def ainvoke(self, messages):
            self.seen = "\n".join(message.content for message in messages)
            return SimpleNamespace(content="# 情报分析\n\n## 技术背景\n外部材料声明待库内核对 [1]。")

    root = tmp_path / ".knowledge"
    corpus = root / "fixture"
    corpus.mkdir(parents=True, exist_ok=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path)
    settings.model_api_key = SecretStr("offline-test")
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
    source_dir = corpus / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    (source_dir / "2021_2025_P1_张三_临床诊疗.md").write_text("填表日期：2025年\n正文 临床诊疗 病灶识别困难",
                                                          encoding="utf-8")
    from src.parsers import import_defaults

    import_defaults(store, settings, root=source_dir, parsed_root=corpus / "parsed")
    saved = store.current()[0]
    cid = corpus_id_for("fixture")
    evidence = [{"item_id": "s1", "doc_id": saved["doc_id"], "version": saved["version"],
                 "quote": "正文", "locator": {"basis": "parsed_text", "start_char": 1, "end_char": 2}}]
    record = {
        "corpus_id": cid, "state": "ready", "fingerprint": "fp", "generated_at": "2026-10-08T09:00:00+00:00",
        "process": {"status": "已完成"},
        "coverage": {"targets": {"scenes": 6, "issues_per_scene": 3, "routes_per_issue": 2,
                                 "achievements_per_scene": 3},
                     "scenes": 1, "issues": 1, "solved_issues": 1, "open_issues": 0, "routes": 0,
                     "achievements": 0, "gaps": []},
        "scenes": [{"name": "临床诊疗", "summary": "围绕临床诊疗流程展开。", "project_ids": ["NSFC:1"],
                    "item_ids": ["s1"], "evidence": evidence,
                    "issues": [{"name": "病灶识别困难", "state": "已解决", "summary": "已有方法。",
                                "project_ids": ["NSFC:1"], "item_ids": ["p1"], "evidence": evidence,
                                "routes": []}], "achievements": []}],
    }
    (corpus / "hierarchy.json").write_text(json_module.dumps(record, ensure_ascii=False), encoding="utf-8")

    model = Model()
    monkeypatch.setattr("src.intelligence.model_for", lambda settings: model)
    app = create_app(settings, store, lambda *_: FakeGraph(cid))
    with TestClient(app) as client:
        # The external input names the seeded report so retrieval actually reads it; the
        # hierarchy section may only cite sources this run really loaded.
        uploaded = client.post("/api/intelligence/inputs",
                               files={"file": ("临床诊疗.md", "临床诊疗 正文 病灶识别困难".encode(), "text/markdown")})
        assert uploaded.status_code == 201, uploaded.text
        generated = client.post("/api/intelligence/analyze", json={
            "input_ids": [uploaded.json()["input_id"]], "corpus_id": cid, "purpose": "background"})
    assert generated.status_code == 201, generated.text
    body = generated.json()["markdown"]
    assert "## 场景层级（按四维归纳结果生成）" in body
    assert "| 病灶识别困难 | 已解决 | 本库暂无对应技术条目 |" in body
    assert "不得改写其名称、状态或数量" in model.seen
    assert generated.json()["report_params"]["hierarchy"]["fingerprint"] == "fp"


def test_project_relations_are_graded_by_description_similarity(tmp_path, monkeypatch):
    """Real cache/threshold/degree code; only the embedding model is a deterministic stand-in."""
    from types import SimpleNamespace as NS

    from src import project_similarity
    calls = []

    class Embedder:
        def embed_documents(self, texts):
            calls.append(len(texts))
            topics = ["机器人", "外骨骼", "无人艇", "影像"]
            return [[float(text.count(t)) + 0.01 for t in topics] for text in texts]

    monkeypatch.setattr(project_similarity, "_embedder", lambda path, device: Embedder())
    monkeypatch.setattr(project_similarity, "QUANTILE", 0.5)

    def library(desc):
        return {"projects": [{"project_id": pid, "identity_status": "identified",
                              "facets": {"问题": {"items": [{"name": pid, "desc": text}]}}} for pid, text in desc.items()]}

    desc = {"A": "外骨骼外骨骼", "B": "外骨骼外骨骼", "C": "外骨骼外骨骼", "D": "无人艇无人艇"}
    sim = project_similarity.ProjectSimilarity(tmp_path / "index.sqlite3", NS(embedding_path="x", embedding_device="cpu"))
    result = sim.relations("c1", library(desc), "问题")
    assert result["degree"] == {"A": 2, "B": 2, "C": 2, "D": 0}
    assert [pid for pid, _ in result["edges"]["A"]] == ["B", "C"] and not result["edges"]["D"]
    sim.relations("c1", library(desc), "问题")
    assert calls == [4], "cached vectors are reused"
    sim.relations("c1", library({**desc, "D": "外骨骼外骨骼"}), "问题")
    assert calls == [4, 1], "only the changed description is embedded again"
