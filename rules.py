import json
from functools import lru_cache
from pathlib import Path
from typing import Any

CATALOG_PATH = Path("/opt/nirvana-max/data/catalog.json")


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    with CATALOG_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def reload_catalog():
    load_catalog.cache_clear()


def get_scenarios() -> list[dict[str, Any]]:
    return load_catalog()["scenarios"]


def get_measures() -> list[dict[str, Any]]:
    return load_catalog()["measures"]


def get_measure(measure_id: str) -> dict[str, Any] | None:
    for measure in get_measures():
        if measure["id"] == measure_id:
            return measure
    return None


def get_scenario(scenario_id: str) -> dict[str, Any] | None:
    for scenario in get_scenarios():
        if scenario["id"] == scenario_id:
            return scenario
    return None


def get_field_value(profile: dict[str, Any], field: str) -> Any:
    return profile.get(field)


def check_rule(profile: dict[str, Any], rule: dict[str, Any]) -> bool:
    field = rule["field"]
    op = rule["op"]
    expected = rule["value"]

    actual = get_field_value(profile, field)

    if op == "==":
        return actual == expected

    if op == "!=":
        return actual != expected

    if op == ">=":
        if actual is None:
            return False
        return actual >= expected

    if op == "<=":
        if actual is None:
            return False
        return actual <= expected

    if op == ">":
        if actual is None:
            return False
        return actual > expected

    if op == "<":
        if actual is None:
            return False
        return actual < expected

    if op == "in":
        if isinstance(expected, list):
            return actual in expected
        return False

    if op == "contains":
        if actual is None:
            return False
        if isinstance(actual, list):
            return expected in actual
        if isinstance(actual, str):
            return expected in actual
        return False

    return False


def match_measure(
    measure: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    rules = measure.get("rules", [])

    if not rules:
        return {
            "matched": True,
            "score": 100,
            "reasons": [],
            "missing": measure.get("missing", []),
        }

    passed = []
    failed = []

    for rule in rules:
        if check_rule(profile, rule):
            passed.append(rule.get("reason", "Условие выполнено"))
        else:
            failed.append(rule.get("reason", "Условие не выполнено"))

    score = round((len(passed) / len(rules)) * 100)

    return {
        "matched": len(failed) == 0,
        "score": score,
        "reasons": passed,
        "failed_conditions": failed,
        "missing": measure.get("missing", []),
    }


def build_recommendations(
    profile: dict[str, Any],
    scenario_id: str | None = None,
) -> list[dict[str, Any]]:
    if scenario_id:
        scenario_measures = [
            measure
            for measure in get_measures()
            if measure.get("scenario") == scenario_id
        ]
    else:
        scenario_measures = get_measures()

    results = []

    for measure in scenario_measures:
        match = match_measure(measure, profile)

        if not match["matched"]:
            continue

        result = dict(measure)
        result["match"] = match

        results.append(result)

    results.sort(
        key=lambda item: (
            -item["match"]["score"],
            item.get("priority", 99),
        )
    )

    return results
