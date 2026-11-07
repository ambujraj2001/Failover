"""Validate every content file and prove every lab is solvable.

For each lab: the starter design must FAIL (otherwise there is nothing to learn) and the reference
solution must PASS every test, visible and hidden, within budget.

    uv run python scripts/verify_content.py            # all labs
    uv run python scripts/verify_content.py url-cache  # labs whose slug contains this text
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.content.loader import cross_check, load_content  # noqa: E402
from app.simulator.grading import grade  # noqa: E402
from app.simulator.validation import DesignInvalid  # noqa: E402


def fmt(r: dict) -> str:
    s = r.get("summary") or {}
    checks = ", ".join(f"{c['label']} {c['got']}{'≤' if c['op'] == 'lte' else '≥'}{c['target']}"
                       f"{'' if c['passed'] else ' ✗'}" for c in r.get("checks", []))
    return f"{r['name'][:34]:34} {'PASS' if r['passed'] else 'FAIL'}  p99={s.get('p99_ms')} " \
           f"err={s.get('error_rate')} cost={s.get('cost_per_hr')}  [{checks}]"


def main() -> int:
    flt = sys.argv[1] if len(sys.argv) > 1 else ""
    content = load_content()
    problems = cross_check(content)
    for p in problems:
        print("INTEGRITY:", p)
    bad = len(problems)
    print(f"{len(content.labs)} labs, {len(content.lessons)} lessons, {len(content.concepts)} concepts, "
          f"{len(content.flashcards)} flashcards, {len(content.tracks)} tracks\n")
    for lab in content.labs.values():
        if flt and flt not in lab.slug:
            continue
        palette = set(lab.palette)
        print(f"== {lab.slug} ({lab.kind}, {lab.difficulty}, budget ${lab.budget}/hr)")
        try:
            # reveal hidden test detail for authors by grading each test individually
            starter = grade(lab.starter, lab.tests, lab.budget, palette)
            sol_rows = [grade(lab.solution, lab.tests, lab.budget, palette, only=t.id, reveal_hidden=True)["results"][0]
                        for t in lab.tests]
            solution = grade(lab.solution, lab.tests, lab.budget, palette)
        except DesignInvalid as e:
            print("  INVALID DESIGN:", e.issues)
            bad += 1
            continue
        print(f"  starter  : {'PASS (bad!)' if starter['passed'] else 'fails as intended'}  "
              f"cost={starter['cost_per_hr']}")
        for t in lab.tests:
            r = grade(lab.starter, lab.tests, lab.budget, palette, only=t.id, reveal_hidden=True)["results"][0]
            print("     ", fmt(r))
        print(f"  solution : {'passes' if solution['passed'] else 'FAILS (bad!)'}  cost={solution['cost_per_hr']} "
              f"within_budget={solution['within_budget']}")
        for r in sol_rows:
            print("     ", fmt(r))
        if starter["passed"] or not solution["passed"]:
            bad += 1
        if solution["warnings"]:
            print("  solution warnings:", solution["warnings"])
        print()
    print("OK" if bad == 0 else f"{bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
