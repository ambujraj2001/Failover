import hashlib

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import DB, ContentDep, CurrentUser
from app.core.errors import NotFound
from app.models import AICache, LessonProgress
from app.schemas import ExplainIn
from app.services import ai
from app.services.progress import curriculum_view, learner_state, touch_activity
from app.simulator.catalog import public_catalog

router = APIRouter(tags=["content"])


@router.get("/components")
async def components():
    return public_catalog()


@router.get("/stats/public")
async def public_stats(content: ContentDep):
    labs = [x for x in content.labs.values() if x.kind == "lab"]
    return {
        "labs": len(labs),
        "problems": len(content.problems()),
        "lessons": len(content.lessons),
        "concepts": len(content.concepts),
        "flashcards": len(content.flashcards),
        "days": len(content.curriculum.days) if content.curriculum else 0,
    }


@router.get("/curriculum")
async def curriculum(user: CurrentUser, db: DB, content: ContentDep):
    lessons, labs = await learner_state(db, user)
    return curriculum_view(content, user, lessons, labs)


@router.get("/roadmap")
async def roadmap(content: ContentDep):
    """Public, progress-free outline for the landing page."""
    assert content.curriculum
    days = {d.day: d for d in content.curriculum.days}
    return [{"id": p.id, "title": p.title, "days": [p.days[0], p.days[-1]],
             "topics": [days[n].title for n in p.days]} for p in content.curriculum.phases]


@router.get("/lessons/{slug}")
async def lesson(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    les = content.lessons.get(slug)
    if not les:
        raise NotFound("Lesson not found.")
    done = await db.scalar(select(LessonProgress.completed_at).where(LessonProgress.user_id == user.id,
                                                                     LessonProgress.lesson_slug == slug))
    assert content.curriculum
    day = next((d for d in content.curriculum.days if d.day == les.day), None)
    siblings = day.lessons if day else []
    idx = siblings.index(slug) if slug in siblings else -1
    nxt = siblings[idx + 1] if 0 <= idx < len(siblings) - 1 else None
    concepts = [c.model_dump() for c in content.concepts if c.slug in set(les.concepts)]
    return {
        **les.model_dump(),
        "completed": done is not None,
        "day_title": day.title if day else None,
        "next_lesson": {"slug": nxt, "title": content.lessons[nxt].title} if nxt and nxt in content.lessons else None,
        "day_lab": ({"slug": day.lab, "title": content.labs[day.lab].title, "kind": content.labs[day.lab].kind}
                    if day and day.lab else None),
        "concept_cards": concepts,
    }


@router.post("/lessons/{slug}/complete")
async def complete_lesson(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    if slug not in content.lessons:
        raise NotFound("Lesson not found.")
    stmt = insert(LessonProgress).values(user_id=user.id, lesson_slug=slug).on_conflict_do_nothing()
    res = await db.execute(stmt)
    if res.rowcount:
        await touch_activity(db, user)
    await db.commit()
    return {"completed": True}


@router.delete("/lessons/{slug}/complete")
async def uncomplete_lesson(slug: str, user: CurrentUser, db: DB):
    row = await db.get(LessonProgress, (user.id, slug))
    if row:
        await db.delete(row)
        await db.commit()
    return {"completed": False}


@router.post("/lessons/{slug}/explain")
async def explain_lesson(slug: str, body: ExplainIn, user: CurrentUser, db: DB, content: ContentDep):
    les = content.lessons.get(slug)
    if not les:
        raise NotFound("Lesson not found.")
    key = hashlib.sha256(f"lesson:{slug}:{body.mode}:{user.level}:v1".encode()).hexdigest()
    cached = await db.get(AICache, key)
    if cached:
        return {"content": cached.content, "cached": True}
    await ai.check_quota(db, user)
    ask = {
        "simpler": "Explain this lesson again, more simply, with a fresh everyday analogy and a tiny worked example. "
                   "Under 250 words.",
        "deeper": "Go one level deeper than the lesson: production failure modes, real numbers, and one question an "
                  "interviewer would ask with a model answer. Under 350 words.",
        "example": "Walk through one concrete, realistic scenario (a named fictional product, specific numbers) where "
                   "this idea decides the outcome. Under 300 words.",
    }[body.mode]
    messages = [
        {"role": "system", "content": "You are a staff engineer teaching system design on Failover. "
                                      f"{ai.LEVEL_STYLE[user.level]} Use markdown, no emoji, no preamble."},
        {"role": "user", "content": f"Lesson: {les.title}\n\n{les.plain}\n\n{les.deeper}\n\n{ask}"},
    ]
    text, tokens = await ai.complete(messages, max_tokens=700, temperature=0.5)
    await ai.record_usage(db, user, tokens)
    await db.execute(insert(AICache).values(key=key, content=text).on_conflict_do_nothing())
    await db.commit()
    return {"content": text, "cached": False}


@router.get("/concepts")
async def concepts(content: ContentDep, q: str | None = Query(default=None, max_length=80),
                   area: str | None = Query(default=None, max_length=60)):
    items = content.concepts
    if area:
        items = [c for c in items if c.area.lower() == area.lower()]
    if q:
        needle = q.strip().lower()

        def score(c) -> int:
            hay = [c.name.lower(), *[a.lower() for a in c.aliases]]
            if any(h == needle for h in hay):
                return 3
            if any(h.startswith(needle) for h in hay):
                return 2
            if any(needle in h for h in hay) or needle in c.short.lower():
                return 1
            return 0

        items = sorted((c for c in items if score(c)), key=lambda c: -score(c))
    lesson_day = {s: les.day for s, les in content.lessons.items()}
    lesson_title = {s: les.title for s, les in content.lessons.items()}
    return [{**c.model_dump(), "day": lesson_day.get(c.lesson or ""), "lesson_title": lesson_title.get(c.lesson or "")}
            for c in items]


@router.get("/cheatsheet")
async def cheatsheet(content: ContentDep):
    return [s.model_dump() for s in content.cheatsheet]


@router.get("/tracks")
async def tracks(content: ContentDep):
    out = []
    for t in content.tracks:
        out.append({**t.model_dump(), "items": [
            {"slug": s, "title": content.labs[s].title, "kind": content.labs[s].kind,
             "difficulty": content.labs[s].difficulty} for s in t.sequence if s in content.labs]})
    return out


@router.get("/mastery")
async def mastery(content: ContentDep):
    return [m.model_dump() for m in content.mastery]
