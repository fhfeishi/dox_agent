"""query 2026-1013 1520: a question picks its library from the libraries' own terms."""
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.corpus_route import rank
from src.main import create_app


def library(tmp_path, ident, name, scenes=(), systems=()):
    root = tmp_path / ident
    root.mkdir()
    (root / "hierarchy.json").write_text(json.dumps({"scenes": [{"name": s, "issues": []} for s in scenes]}, ensure_ascii=False), encoding="utf-8")
    (root / "lineage.json").write_text(json.dumps({"categories": [{"name": c, "children": []} for c in systems]}, ensure_ascii=False), encoding="utf-8")
    return SimpleNamespace(id=ident, name=name, alias="", description="", root=root, sqlite=None, docs_count=3, missing=False)


def test_question_ranks_libraries_by_their_own_terms(tmp_path):
    medical = library(tmp_path, "m", "自然科学基金-AI与医疗", scenes=["肺癌与肺结节"], systems=["医学影像分析", "数据治理与隐私计算"])
    society = library(tmp_path, "s", "自然科学基金-AI与社会治理", scenes=["城市应急"])
    robots = library(tmp_path, "r", "自然科学基金-AI与机器人自动化", systems=["柔性装配"])
    empty = SimpleNamespace(**{**vars(library(tmp_path, "e", "自然科学基金-AI与空库")), "docs_count": 0})
    infos = [medical, society, robots, empty]
    assert rank("肺结节的影像分析方法", infos)[0]["corpus_id"] == "m"
    # "治理" is in the medical lineage too, but it is the social-governance library's own name.
    assert rank("城市治理中的人工智能", infos)[0]["corpus_id"] == "s"
    assert rank("机器人柔性装配", infos)[0]["corpus_id"] == "r"
    assert rank("与本库都无关的问题", infos) == []
    assert all(row["corpus_id"] != "e" for row in rank("空库", infos))  # a library without documents is never chosen
    weak = rank("影像", [medical, society])
    assert weak and weak[0]["clear"] is False  # one shared word is not a clear match


def test_route_endpoint_needs_a_question(tmp_path):
    app = create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora"))
    with TestClient(app) as client:
        assert client.get("/api/corpora/route", params={"q": "肺结节"}).json() == []
        assert client.get("/api/corpora/route").status_code == 422
