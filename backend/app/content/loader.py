"""Loads and cross-checks all authored content once at startup."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

from .schema import CheatSection, Concept, Curriculum, Flashcard, Lab, Lesson, MasteryArea, Track

DATA = Path(__file__).parent / "data"


def _yaml(path: Path):
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


@dataclass
class Content:
    labs: dict[str, Lab] = field(default_factory=dict)
    lessons: dict[str, Lesson] = field(default_factory=dict)
    curriculum: Curriculum | None = None
    concepts: list[Concept] = field(default_factory=list)
    flashcards: list[Flashcard] = field(default_factory=list)
    cheatsheet: list[CheatSection] = field(default_factory=list)
    tracks: list[Track] = field(default_factory=list)
    mastery: list[MasteryArea] = field(default_factory=list)

    def problems(self) -> list[Lab]:
        return [lab for lab in self.labs.values() if lab.kind == "problem"]


def load_content(data_dir: Path = DATA) -> Content:
    c = Content()
    for p in sorted((data_dir / "labs").glob("*.yaml")):
        lab = Lab.model_validate(_yaml(p))
        if lab.slug in c.labs:
            raise ValueError(f"duplicate lab slug {lab.slug}")
        c.labs[lab.slug] = lab
    for p in sorted((data_dir / "lessons").glob("*.yaml")):
        raw = _yaml(p)
        items = raw if isinstance(raw, list) else [raw]
        for item in items:
            lesson = Lesson.model_validate(item)
            if lesson.slug in c.lessons:
                raise ValueError(f"duplicate lesson slug {lesson.slug}")
            c.lessons[lesson.slug] = lesson
    if (data_dir / "curriculum.yaml").exists():
        c.curriculum = Curriculum.model_validate(_yaml(data_dir / "curriculum.yaml"))
    if (data_dir / "concepts.yaml").exists():
        c.concepts = [Concept.model_validate(x) for x in _yaml(data_dir / "concepts.yaml")]
    if (data_dir / "flashcards.yaml").exists():
        c.flashcards = [Flashcard.model_validate(x) for x in _yaml(data_dir / "flashcards.yaml")]
    if (data_dir / "cheatsheet.yaml").exists():
        c.cheatsheet = [CheatSection.model_validate(x) for x in _yaml(data_dir / "cheatsheet.yaml")]
    if (data_dir / "tracks.yaml").exists():
        c.tracks = [Track.model_validate(x) for x in _yaml(data_dir / "tracks.yaml")]
    if (data_dir / "mastery.yaml").exists():
        c.mastery = [MasteryArea.model_validate(x) for x in _yaml(data_dir / "mastery.yaml")]
    return c


def cross_check(c: Content) -> list[str]:
    """Referential integrity problems (empty list = OK)."""
    issues: list[str] = []
    if c.curriculum:
        days = {d.day for d in c.curriculum.days}
        for d in c.curriculum.days:
            for s in d.lessons:
                if s not in c.lessons:
                    issues.append(f"day {d.day}: unknown lesson '{s}'")
            if d.lab and d.lab not in c.labs:
                issues.append(f"day {d.day}: unknown lab '{d.lab}'")
        for ph in c.curriculum.phases:
            for n in ph.days:
                if n not in days:
                    issues.append(f"phase {ph.id}: unknown day {n}")
    for con in c.concepts:
        if con.lesson and con.lesson not in c.lessons:
            issues.append(f"concept {con.slug}: unknown lesson '{con.lesson}'")
    ids = [f.id for f in c.flashcards]
    if len(ids) != len(set(ids)):
        issues.append("duplicate flashcard ids")
    for t in c.tracks:
        for s in t.sequence:
            if s not in c.labs:
                issues.append(f"track {t.slug}: unknown lab '{s}'")
    for lab in c.labs.values():
        tids = [t.id for t in lab.tests]
        if len(tids) != len(set(tids)):
            issues.append(f"lab {lab.slug}: duplicate test ids")
        if not any(not t.hidden for t in lab.tests):
            issues.append(f"lab {lab.slug}: needs at least one visible test")
    return issues


@lru_cache(maxsize=1)
def get_content() -> Content:
    c = load_content()
    problems = cross_check(c)
    if problems:
        raise RuntimeError("Content integrity check failed:\n" + "\n".join(problems))
    return c
