"""Schemas for authored learning content (YAML files in app/content/data)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.simulator.models import Design, TestCase

Difficulty = Literal["easy", "medium", "hard"]
PhaseId = Literal["foundations", "scaling", "production", "case-studies", "advanced", "interview"]


class GlossaryItem(BaseModel):
    term: str
    meaning: str


class Lab(BaseModel):
    slug: str
    kind: Literal["lab", "problem"] = "lab"
    title: str
    difficulty: Difficulty
    day: int | None = None
    checkpoint: bool = False
    summary: str
    topics: list[str]
    company_tags: list[str] = Field(default_factory=list)
    estimated_minutes: int = 20
    incident: str = Field(description="One-line pager alert shown at the top, e.g. 'p99 > 2 s on /r/:code'")
    brief_beginner: str
    brief_expert: str
    glossary: list[GlossaryItem] = Field(default_factory=list)
    requirements: list[str]
    budget: float
    palette: list[str]
    starter: Design
    solution: Design
    tests: list[TestCase]
    hints: list[str] = Field(min_length=3, max_length=3)
    editorial: str
    design_prompt: str | None = None


class Lesson(BaseModel):
    slug: str
    day: int
    title: str
    minutes: int = 8
    summary: str
    plain: str = Field(description="Markdown: the idea in plain words, with an everyday analogy")
    deeper: str = Field(description="Markdown: the expert view — trade-offs, numbers, failure modes")
    key_points: list[str]
    concepts: list[str] = Field(default_factory=list)


class Day(BaseModel):
    day: int
    phase: PhaseId
    title: str
    theme: str
    lessons: list[str]
    lab: str | None = None


class Phase(BaseModel):
    id: PhaseId
    title: str
    days: list[int]
    description: str


class Curriculum(BaseModel):
    phases: list[Phase]
    days: list[Day]


class Concept(BaseModel):
    slug: str
    name: str
    short: str
    area: str
    aliases: list[str] = Field(default_factory=list)
    lesson: str | None = None


class Flashcard(BaseModel):
    id: str
    front: str
    back: str
    concept: str | None = None
    day: int | None = None


class CheatRow(BaseModel):
    label: str
    value: str
    note: str | None = None


class CheatSection(BaseModel):
    title: str
    rows: list[CheatRow]


class Track(BaseModel):
    slug: str
    name: str
    tagline: str
    description: str
    weeks: int
    focus: list[str]
    sequence: list[str] = Field(description="ordered list of lab/problem slugs")


class MasteryArea(BaseModel):
    title: str
    items: list[str]
