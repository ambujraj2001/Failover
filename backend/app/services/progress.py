"""Streaks, activity, phase unlocking and the learner's position in the 30-day path."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.loader import Content
from app.core.db import utcnow
from app.core.errors import Forbidden
from app.models import ActivityDay, LabProgress, LessonProgress, User


def today_for(user: User, now: datetime | None = None) -> date:
    try:
        tz = ZoneInfo(user.timezone)
    except Exception:  # noqa: BLE001 - unknown tz stored somehow: fall back to UTC
        tz = ZoneInfo("UTC")
    return (now or utcnow()).astimezone(tz).date()


async def touch_activity(db: AsyncSession, user: User) -> None:
    """Record that the learner did something today and update the streak."""
    today = today_for(user)
    if user.last_active_on != today:
        if user.last_active_on == today - timedelta(days=1):
            user.streak_current += 1
        else:
            user.streak_current = 1
        user.streak_best = max(user.streak_best, user.streak_current)
        user.last_active_on = today
    stmt = insert(ActivityDay).values(user_id=user.id, day=today, count=1)
    stmt = stmt.on_conflict_do_update(index_elements=["user_id", "day"], set_={"count": ActivityDay.count + 1})
    await db.execute(stmt)


def effective_streak(user: User) -> int:
    """A streak only survives if the learner was active today or yesterday."""
    if not user.last_active_on:
        return 0
    if (today_for(user) - user.last_active_on).days > 1:
        return 0
    return user.streak_current


async def learner_state(db: AsyncSession, user: User) -> tuple[set[str], dict[str, LabProgress]]:
    lessons = set((await db.scalars(select(LessonProgress.lesson_slug).where(LessonProgress.user_id == user.id))).all())
    labs = {lp.lab_slug: lp for lp in (await db.scalars(select(LabProgress).where(LabProgress.user_id == user.id)))}
    return lessons, labs


def unlocked_phases(content: Content, user: User, solved: set[str]) -> dict[str, bool]:
    assert content.curriculum
    days = {d.day: d for d in content.curriculum.days}
    out: dict[str, bool] = {}
    prev_ok = True
    for i, ph in enumerate(content.curriculum.phases):
        out[ph.id] = user.free_roam or i == 0 or prev_ok
        checkpoints = [days[n].lab for n in ph.days if days[n].lab and content.labs[days[n].lab].checkpoint]
        prev_ok = out[ph.id] and all(c in solved for c in checkpoints)
    return out


def phase_of_lab(content: Content, slug: str) -> str | None:
    assert content.curriculum
    for d in content.curriculum.days:
        if d.lab == slug:
            return d.phase
    return None


def ensure_lab_unlocked(content: Content, user: User, slug: str, solved: set[str]) -> None:
    lab = content.labs[slug]
    if lab.kind == "problem":
        return  # the problem bank is always open
    phase = phase_of_lab(content, slug)
    if phase and not unlocked_phases(content, user, solved).get(phase, True):
        raise Forbidden("Finish the previous phase's checkpoint to unlock this lab, or turn on free roam in "
                        "settings.", code="locked")


def curriculum_view(content: Content, user: User, lessons_done: set[str], labs: dict[str, LabProgress]
                    ) -> dict[str, Any]:
    assert content.curriculum
    solved = {s for s, lp in labs.items() if lp.solved_at}
    unlocked = unlocked_phases(content, user, solved)
    phases = []
    current_day = None
    total_items = done_items = 0
    for ph in content.curriculum.phases:
        day_views = []
        for n in ph.days:
            d = next(x for x in content.curriculum.days if x.day == n)
            items = []
            for s in d.lessons:
                les = content.lessons.get(s)
                items.append({"kind": "lesson", "slug": s, "title": les.title if les else s,
                              "minutes": les.minutes if les else 8, "done": s in lessons_done})
            if d.lab:
                lab = content.labs[d.lab]
                lp = labs.get(d.lab)
                items.append({"kind": lab.kind, "slug": lab.slug, "title": lab.title, "difficulty": lab.difficulty,
                              "checkpoint": lab.checkpoint, "minutes": lab.estimated_minutes,
                              "done": bool(lp and lp.solved_at), "attempted": bool(lp and lp.attempts)})
            n_done = sum(1 for i in items if i["done"])
            total_items += len(items)
            done_items += n_done
            complete = n_done == len(items)
            if current_day is None and unlocked[ph.id] and not complete:
                current_day = n
            day_views.append({"day": n, "title": d.title, "theme": d.theme, "items": items,
                              "done": n_done, "total": len(items), "complete": complete})
        phases.append({"id": ph.id, "title": ph.title, "description": ph.description, "unlocked": unlocked[ph.id],
                       "days": day_views})
    return {"phases": phases, "current_day": current_day or 30, "completed_items": done_items,
            "total_items": total_items}
