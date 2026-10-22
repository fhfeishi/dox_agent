"""领域分析 · 全景（query 2026-1021 1629 / 2026-1022 1606）：每个数都从资料记录数出来。"""

from types import SimpleNamespace

from src.api.domains import domain_payload, judged_mean


def project(pid, year, amount=None, achievements=0):
    return {"project_id": pid, "identity_status": "identified", "start_year": year, "title": pid, "number": pid, "unit": "",
            "funding": [{"scope": "awarded", "amount_yuan": str(amount * 10000), "currency": "CNY"}] if amount else [],
            "funding_conflicts": [], "facets": {"成果": {"items": [{}] * achievements}}}


def library(*projects):
    dims = {key: {"evidence_projects": len(projects)} for key in ("场景", "问题", "技术", "成果")}
    return {"projects": list(projects), "coverage": {"dimensions": dims}}


TREE = {
    "items": {"a": {"project_id": "p1", "maturity": 1}, "b": {"project_id": "p1", "maturity": 4},
              "c": {"project_id": "p2", "maturity": 0}, "d": {"project_id": "p2", "maturity": 2}},
    "categories": [{"name": "体系甲", "children": [{"name": "方向一", "themes": [{"items": ["a", "b", "c"]}]}]},
                   {"name": "体系乙", "children": [{"name": "方向二", "themes": [{"items": ["d"]}]}]},
                   {"name": "未归类", "unplaced": True, "children": []}],
}
SCENES = {"scenes": [{"name": "场景一", "project_ids": ["p1"], "issues": [{"name": "难题", "state": "待解决"},
                                                                       {"name": "已办", "state": "已解决"}]}]}
INFO = SimpleNamespace(id="lib", name="自然科学基金-AI与测试")


def payload(blanks=None):
    lib = library(project("p1", 2021, amount=100, achievements=3), project("p2", 2023, achievements=1))
    return domain_payload(INFO, lib, TREE, SCENES, blanks or {}, "awarded")


def test_years_carry_projects_funding_and_the_items_of_those_projects():
    d = payload()
    assert d["name"] == "AI与测试"
    years = {row["year"]: row for row in d["by_year"]}
    assert years[2021]["projects"] == 1 and years[2021]["funding"] == 100 and years[2021]["items"] == 2
    assert years[2021]["levels"] == [0, 1, 0, 0, 1, 0]
    # A project without a stated amount adds nothing to funding, not a zero that looks known
    assert years[2023]["funding"] == 0 and years[2023]["funded"] == 0
    assert d["funded_projects"] == 1 and d["achievements_per_project"] == 2.0


def test_undetermined_maturity_is_left_out_of_the_mean():
    assert judged_mean([5, 0, 0, 0, 0, 0]) is None
    assert payload()["maturity"] == round((1 + 4 + 2) / 3, 2)


def test_systems_skip_the_unplaced_and_open_issues_keep_their_scene():
    d = payload()
    assert [s["name"] for s in d["systems"]] == ["体系甲", "体系乙"]
    assert d["systems"][0]["directions"][0]["items"] == 3
    assert [(i["scene"], i["name"]) for i in d["open_issues"]] == [("场景一", "难题")] and d["solved_issues"] == 1


def test_an_unreviewed_lineage_is_not_reported_as_having_no_blanks():
    unchecked = payload()
    checked = payload({"nodes": [{"name": "缺的技术", "covered": 0}, {"name": "有的", "covered": 3}]})
    assert unchecked["blanks_checked"] is False
    assert checked["blanks_checked"] is True and checked["blanks"] == [{"name": "缺的技术", "plain": "", "reason": ""}]


def test_the_tree_runs_system_direction_theme_project_with_the_best_level_per_project():
    from src.api.domains import lineage_tree
    tree = {**TREE, "categories": [{"name": "体系甲", "children": [{"name": "方向一", "themes": [
        {"name": "主题一", "items": ["a", "b", "c"]}, {"name": "空主题", "items": ["missing"]}]}]},
        {"name": "未归类", "unplaced": True, "children": [{"name": "x", "themes": [{"name": "y", "items": ["d"]}]}]}]}
    lib = library(project("p1", 2021), project("p2", 2023))
    out = lineage_tree(INFO, lib, tree)
    # Unplaced items stay, as a last, labelled branch (query 2026-1022 1706)
    assert [(s["name"], s["unplaced"]) for s in out["systems"]] == [("体系甲", False), ("未归入体系", True)]
    theme = out["systems"][0]["directions"][0]["themes"]
    assert [t["name"] for t in theme] == ["主题一"]  # a theme with no stored item is dropped
    assert [(p["id"], p["maturity"], p["year"]) for p in theme[0]["projects"]] == [("p1", 4, 2021), ("p2", 0, 2023)]
    # Each project says which of its items sit in this theme, best first
    assert [i["maturity"] for i in theme[0]["projects"][0]["items"]] == [4, 1]
