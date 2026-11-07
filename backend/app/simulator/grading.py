"""Runs test cases against a design and turns raw simulation output into a verdict."""

from __future__ import annotations

from typing import Any

from .engine import simulate
from .models import METRIC_LABELS, Design, TestCase
from .validation import Graph, build_graph


def check(test: TestCase, summary: dict[str, Any]) -> list[dict[str, Any]]:
    results = []
    for a in test.assertions:
        got = float(summary.get(a.metric) or 0.0)
        ok = got <= a.value if a.op == "lte" else got >= a.value
        label, unit = METRIC_LABELS[a.metric]
        results.append({"metric": a.metric, "label": label, "unit": unit, "op": a.op, "target": a.value,
                        "got": round(got, 3), "passed": ok})
    return results


def run_test(graph: Graph, test: TestCase, include_detail: bool = True) -> dict[str, Any]:
    sim = simulate(graph, test.scenario)
    checks = check(test, sim["summary"])
    out: dict[str, Any] = {
        "test_id": test.id,
        "name": test.name,
        "hidden": test.hidden,
        "passed": all(c["passed"] for c in checks),
        "checks": checks,
        "summary": sim["summary"],
        "diagnosis": sim["diagnosis"],
    }
    if include_detail:
        out.update({k: sim[k] for k in ("series", "nodes", "failure_reasons", "logs", "warnings")})
    return out


def grade(design: Design, tests: list[TestCase], budget: float | None, palette: set[str] | None,
          only: str | None = None, reveal_hidden: bool = False) -> dict[str, Any]:
    """Run one test (``only``) or all of them. Hidden tests that pass stay masked."""
    graph = build_graph(design, palette)
    selected = [t for t in tests if t.id == only] if only else tests
    results = []
    costs: list[float] = []
    for t in selected:
        r = run_test(graph, t)
        costs.append(r["summary"]["cost_per_hr"])
        if t.hidden and r["passed"] and not reveal_hidden:
            # do not leak the scenario of a hidden test that passed
            r = {"test_id": t.id, "name": "Hidden test", "hidden": True, "passed": True, "checks": [],
                 "summary": None, "diagnosis": None}
        results.append(r)
    cost = max(costs, default=0.0)
    within_budget = budget is None or cost <= budget + 1e-9
    passed = all(r["passed"] for r in results) and within_budget
    return {
        "passed": passed,
        "within_budget": within_budget,
        "budget": budget,
        "cost_per_hr": cost,
        "results": results,
        "warnings": graph.warnings,
    }
