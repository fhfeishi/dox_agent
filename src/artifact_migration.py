"""Explicit offline migration. Run with --state-dir and --backup-dir after stopping the service."""

import argparse
import json
import re
import shutil
import sqlite3
from pathlib import Path

from .artifacts import ArtifactStore


def report_references(value):
    if isinstance(value, list):
        return [report_references(v) for v in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, item in value.items():
        if key == "report" and isinstance(item, dict) and item.get("report_id"):
            result[key] = {k: item[k] for k in ("report_id", "artifact_id") if item.get(k)}
        else:
            result[key] = report_references(item)
    return result


def backup_database(source, target):
    with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as old, sqlite3.connect(target) as new:
        old.backup(new)
        if new.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError(f"数据库校验失败: {source.name}")


def migrate(state: Path, backup: Path):
    state, backup = state.resolve(), backup.resolve()
    if backup == state or state in backup.parents:
        raise ValueError("备份须放在状态目录之外")
    target = state / "artifacts"
    if (target / "migration.complete").exists():
        return {"status": "already_migrated"}
    legacy = [state / name for name in ("artifacts.sqlite3", "reports.sqlite3", "custom_templates.sqlite3")]
    if not any(path.exists() for path in legacy) and not (state / ".migration-stage").exists():
        return {"status": "already_current"}
    if (target / "artifacts.sqlite3").exists() and not (state / ".migration-stage").exists():
        raise ValueError("新旧成果库同时存在，需核对来源，不能覆盖已有新库")
    # A failed attempt reuses its immutable backup; it never replaces the original backup.
    backup.mkdir(parents=True, exist_ok=True)
    if not (backup / "backup.complete").exists():
        if any(backup.iterdir()):
            raise ValueError("备份目录非空且未完成，请核对后使用新的目录")
        for source in state.rglob("*"):
            if not source.is_file() or ".migration-stage" in source.parts:
                continue
            rel = source.relative_to(state)
            dest = backup / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if source.suffix == ".sqlite3":
                backup_database(source, dest)
            elif not source.name.endswith(("-wal", "-shm")):
                shutil.copy2(source, dest)
        (backup / "backup.complete").write_text("offline state backup\n")
    stage = state / ".migration-stage"
    stage.mkdir(exist_ok=True)
    # Rebuild only generated staging files from the preserved backup on retry.
    for name in ("artifacts.sqlite3", "workspace.sqlite3", "templates.sqlite3"):
        for suffix in ("", "-wal", "-shm"):
            (stage / (name + suffix)).unlink(missing_ok=True)
    old_artifact = backup / "artifacts.sqlite3"
    if old_artifact.exists():
        backup_database(old_artifact, stage / "artifacts.sqlite3")
    store = ArtifactStore(stage / "artifacts.sqlite3")
    reports = backup / "reports.sqlite3"
    if reports.exists():
        with sqlite3.connect(reports) as db:
            db.row_factory = sqlite3.Row
            rows = [dict(row) for row in db.execute("SELECT * FROM reports")]
        with store.connect() as db:
            for report in rows:
                params = json.loads(report["params"])
                run_id = report.get("run_id", "")
                matches = (
                    db.execute(
                        "SELECT id,current_version FROM artifacts WHERE type='report' AND run_id=?", (run_id,)
                    ).fetchall()
                    if run_id
                    else []
                )
                if len(matches) > 1:
                    raise ValueError(f"同一运行有多个成果，需人工核对: {run_id}")
                aid = matches[0][0] if matches else "report-" + report["id"]
                if not matches:
                    db.execute(
                        "INSERT INTO artifacts (id,created_at,updated_at,type,status,title,session_key,run_id,corpus_ids,task_id,template_id,payload) VALUES (?,?,?,'report','completed',?,?,?,?,?,?,?)",
                        (
                            aid,
                            report["created_at"],
                            report["created_at"],
                            params.get("domain", ""),
                            report.get("session_key", ""),
                            run_id,
                            json.dumps([report["corpus_id"]] if report.get("corpus_id") else []),
                            params.get("task_id", "task4"),
                            params.get("template_id", ""),
                            json.dumps(
                                {
                                    "source_verification": "unverified",
                                    "task_version": params.get("task_version"),
                                    "template_version": params.get("template_version"),
                                }
                            ),
                        ),
                    )
                initial = db.execute(
                    "SELECT version FROM artifact_versions WHERE artifact_id=? AND markdown=? ORDER BY version LIMIT 1",
                    (aid, report["markdown"]),
                ).fetchone()
                if initial:
                    generated = initial[0]
                else:
                    generated = db.execute(
                        "SELECT COALESCE(MAX(version),0)+1 FROM artifact_versions WHERE artifact_id=?", (aid,)
                    ).fetchone()[0]
                    # Resolve only exact figure identities already attached to this same outcome.
                    referenced = set(re.findall(r"figures/([a-f0-9]{20})\.(?:jpg|png)", report["markdown"]))
                    saved_figures = {}
                    for (metadata,) in db.execute(
                        "SELECT figures FROM artifact_versions WHERE artifact_id=?", (aid,)
                    ):
                        for figure in json.loads(metadata):
                            identity = figure["figure_id"]
                            if identity not in referenced:
                                continue
                            if identity in saved_figures and saved_figures[identity] != figure:
                                raise ValueError(f"图片身份冲突，需核对: {aid}/{identity}")
                            saved_figures[identity] = figure
                    missing = referenced - set(saved_figures)
                    citations = [
                        {**c, "corpus_id": c.get("corpus_id") or report.get("corpus_id", "")}
                        for c in params.get("visible_sources", [])
                    ]
                    db.execute(
                        "INSERT INTO artifact_versions VALUES (?,?,?,?,?,?,?,?,?)",
                        (
                            aid,
                            generated,
                            report["created_at"],
                            report["markdown"],
                            json.dumps(citations),
                            "completed",
                            "unverified",
                            "历史图片缺失" if missing else "",
                            json.dumps(list(saved_figures.values())),
                        ),
                    )
                db.execute(
                    "UPDATE artifacts SET report_id=?,report_params=?,generated_version=? WHERE id=?",
                    (report["id"], json.dumps(params), generated, aid),
                )
                if not matches:
                    db.execute("UPDATE artifacts SET current_version=? WHERE id=?", (generated, aid))
                actual = db.execute(
                    "SELECT markdown FROM artifact_versions WHERE artifact_id=? AND version=?",
                    (aid, generated),
                ).fetchone()[0]
                if actual != report["markdown"]:
                    raise ValueError("报告正文校验失败")
    with store.connect() as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("成果库校验失败")
        if old_artifact.exists():
            with sqlite3.connect(old_artifact) as old:
                for aid, version, markdown in old.execute(
                    "SELECT artifact_id,version,markdown FROM artifact_versions"
                ):
                    if db.execute(
                        "SELECT markdown FROM artifact_versions WHERE artifact_id=? AND version=?",
                        (aid, version),
                    ).fetchone() != (markdown,):
                        raise ValueError("用户历史版本丢失")
                for aid, current in old.execute("SELECT id,current_version FROM artifacts"):
                    if db.execute("SELECT current_version FROM artifacts WHERE id=?", (aid,)).fetchone() != (
                        current,
                    ):
                        raise ValueError("当前版本被覆盖")
                for digest, data in old.execute("SELECT sha256,data FROM artifact_images"):
                    if db.execute(
                        "SELECT data FROM artifact_images WHERE sha256=?", (digest,)
                    ).fetchone() != (data,):
                        raise ValueError("图片丢失")
    workspace = backup / "workspace.sqlite3"
    if workspace.exists():
        backup_database(workspace, stage / "workspace.sqlite3")
        with sqlite3.connect(stage / "workspace.sqlite3") as db:
            for key, payload in db.execute("SELECT id,payload FROM records WHERE kind='sessions'").fetchall():
                value = json.loads(payload)

                def validate_refs(node, session_id=key):
                    if isinstance(node, list):
                        for child in node:
                            validate_refs(child)
                    elif isinstance(node, dict):
                        report = node.get("report")
                        if isinstance(report, dict) and report.get("report_id"):
                            try:
                                store.report_identity(report["report_id"])
                            except KeyError as exc:
                                raise ValueError(
                                    f"会话 {session_id} 的报告 {report['report_id']} 无持久正文，请先核对，未切换"
                                ) from exc
                        for child in node.values():
                            validate_refs(child)

                validate_refs(value)
                value = report_references(value)
                db.execute(
                    "UPDATE records SET payload=? WHERE id=?", (json.dumps(value, ensure_ascii=False), key)
                )
    template = backup / "custom_templates.sqlite3"
    if template.exists():
        backup_database(template, stage / "templates.sqlite3")
    # Service refuses startup while old files remain; completion marker is written last.
    target.mkdir(exist_ok=True)
    (stage / "artifacts.sqlite3").replace(target / "artifacts.sqlite3")
    if (stage / "templates.sqlite3").exists():
        (stage / "templates.sqlite3").replace(target / "templates.sqlite3")
    if (stage / "workspace.sqlite3").exists():
        for suffix in ("-wal", "-shm"):
            (state / ("workspace.sqlite3" + suffix)).unlink(missing_ok=True)
        (stage / "workspace.sqlite3").replace(state / "workspace.sqlite3")
    for name in ("artifacts.sqlite3", "reports.sqlite3", "custom_templates.sqlite3"):
        for suffix in ("", "-wal", "-shm"):
            (state / (name + suffix)).unlink(missing_ok=True)
    (target / "migration.complete").write_text(str(backup), encoding="utf-8")
    return {"status": "migrated", "backup": str(backup)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--backup-dir", type=Path, required=True)
    parser.add_argument("--service-stopped", action="store_true", required=True)
    args = parser.parse_args()
    print(json.dumps(migrate(args.state_dir, args.backup_dir)))
