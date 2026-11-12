"""P0-B3: a review run and a library's extraction job belong to one account (High#2, 2026-11-05).

Two real accounts with non-empty fixtures. A refusal is checked together with its side effects:
a denied export must leave no file and no directory behind.
"""

import pytest
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.main import create_app
from src.review import storage as review_storage


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


@pytest.fixture(scope="module")
def bench(tmp_path_factory):
    root = tmp_path_factory.mktemp("review-auth")
    settings = Settings(_env_file=None, corpora_root=root / ".knowledge", state_dir=root / "state",
                        user_dir=root / "usr", embedding_path="")
    app = create_app(settings)
    with TestClient(app) as client:
        yield client, app, settings


def make_run(run_id: str, owner: str, *, status: str = "completed") -> dict:
    """A finished review run written straight into the review store, owned by ``owner``."""
    run = {"id": run_id, "created_at": review_storage.now(), "created_by": owner, "status": status,
           "stage": 3, "stage_label": "已完成", "request": {"corpus_ids": [], "evidence_ids": []},
           "rule": {"id": "r1", "title": "预审规则", "checks": []}, "document": {"id": "d1", "title": "申请书"},
           "information_sheet": None, "findings": [], "mappings": {"revision": 0, "rows": []},
           "evidence_selection": {"corpus_ids": [], "evidence_ids": []}, "source_locations": [],
           "input_versions": [], "technical": {"cards": []}}
    return review_storage.save("run", run)


def test_review_run_read_and_export_enforce_owner(bench):
    client, _, _ = bench
    make_run("run-user", "user")
    make_run("run-admin", "admin")
    # The author reads their own run and exports it.
    login(client, "user")
    assert client.get("/api/review/runs/run-user").status_code == 200
    assert client.get("/api/review/runs/run-user/export/json").status_code == 200
    # Another ordinary account cannot read it, and an administrator cannot either (it has an author).
    for name in ("admin", "owner"):
        login(client, name)
        assert client.get("/api/review/runs/run-user").status_code == 403, name
        assert client.get("/api/review/runs/run-user/export/json").status_code == 403, name
    # The administrator's own run stays theirs.
    login(client, "admin")
    assert client.get("/api/review/runs/run-admin").status_code == 200
    login(client, "user")
    assert client.get("/api/review/runs/run-admin").status_code == 403


def test_an_ownerless_review_run_belongs_to_the_administrator(bench):
    """Runs recorded before authorship follow the existing ownerless policy."""
    client, _, _ = bench
    make_run("run-legacy", "")
    login(client, "user")
    assert client.get("/api/review/runs/run-legacy").status_code == 403
    login(client, "admin")
    assert client.get("/api/review/runs/run-legacy").status_code == 200


def test_denied_review_export_creates_no_files(bench):
    client, _, _ = bench
    make_run("run-files", "user")
    output = review_storage.DATA / "reports" / "run-files"
    login(client, "admin")
    assert client.get("/api/review/runs/run-files/export/json").status_code == 403
    assert client.get("/api/review/runs/run-files/export/docx").status_code == 403
    # Authorisation runs before the directory is made, so nothing was left behind.
    assert not output.exists()
    # The author's own export does create the file, which shows the check is not simply blocking.
    login(client, "user")
    assert client.get("/api/review/runs/run-files/export/json").status_code == 200
    assert (output / "report.json").is_file()


def test_target_job_requires_personal_corpus_access(bench):
    """Another account's personal uploads have no jobs to show them (404, not 403)."""
    client, app, _ = bench
    login(client, "user")
    library = client.post("/api/personal-libraries", json={"name": "我的任务库"}).json()
    mine = "mine-" + library["id"]
    # A job id that the runner knows is not needed for the ownership claim: the corpus check runs
    # before the job lookup, so an unknown id on the owner's own corpus still answers 404 from the
    # job lookup, while another account's corpus answers 404 from the corpus check.
    job_id = "target-0123456789abcdef0123456789abcdef"
    own = client.get(f"/api/corpora/{mine}/target/jobs/{job_id}")
    assert own.status_code == 404 and own.json()["detail"] == "四维提取任务不存在"
    for name in ("admin", "owner"):
        login(client, name)
        refused = client.get(f"/api/corpora/{mine}/target/jobs/{job_id}")
        assert refused.status_code == 404, name
        # Different reason: for them the library itself is unknown, not merely the job.
        assert refused.json()["detail"] == "资料库不存在", name
    login(client, "user")
    assert client.get(f"/api/corpora/no-such-library/target/jobs/{job_id}").json()["detail"] == "资料库不存在"
