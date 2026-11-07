from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import DB, ContentDep, CurrentUser
from app.core.db import utcnow
from app.core.errors import NotFound
from app.models import FlashcardState
from app.schemas import ReviewIn
from app.services.progress import curriculum_view, learner_state, touch_activity
from app.services.srs import schedule

router = APIRouter(prefix="/flashcards", tags=["flashcards"])
NEW_PER_SESSION = 10


async def _unlocked_days(db, user, content) -> set[int]:
    lessons, labs = await learner_state(db, user)
    cur = curriculum_view(content, user, lessons, labs)
    return {d["day"] for p in cur["phases"] if p["unlocked"] for d in p["days"]}


@router.get("/due")
async def due(user: CurrentUser, db: DB, content: ContentDep, limit: int = Query(default=20, ge=1, le=50)):
    states = {s.card_id: s for s in (await db.scalars(select(FlashcardState).where(
        FlashcardState.user_id == user.id))).all()}
    now = utcnow()
    cards = {c.id: c for c in content.flashcards}
    due_cards = sorted((s for s in states.values() if s.due_at <= now and s.card_id in cards),
                       key=lambda s: s.due_at)
    out = [{**cards[s.card_id].model_dump(), "new": False, "interval_days": s.interval_days} for s in due_cards]
    days = await _unlocked_days(db, user, content)
    fresh = [c for c in content.flashcards if c.id not in states and (c.day or 1) in days]
    fresh.sort(key=lambda c: (c.day or 0, c.id))
    out += [{**c.model_dump(), "new": True, "interval_days": 0} for c in fresh[:NEW_PER_SESSION]]
    upcoming = min((s.due_at for s in states.values() if s.due_at > now), default=None)
    return {"cards": out[:limit], "due_count": len(due_cards), "new_available": len(fresh),
            "next_due_at": upcoming}


@router.post("/{card_id}/review")
async def review(card_id: str, body: ReviewIn, user: CurrentUser, db: DB, content: ContentDep):
    if card_id not in {c.id for c in content.flashcards}:
        raise NotFound("Card not found.")
    state = await db.get(FlashcardState, (user.id, card_id))
    if not state:
        state = FlashcardState(user_id=user.id, card_id=card_id, ease=2.5, interval_days=0, repetitions=0, lapses=0)
        db.add(state)
    schedule(state, body.grade)
    await touch_activity(db, user)
    await db.commit()
    return {"card_id": card_id, "due_at": state.due_at, "interval_days": state.interval_days}


@router.get("/stats")
async def stats(user: CurrentUser, db: DB, content: ContentDep):
    states = (await db.scalars(select(FlashcardState).where(FlashcardState.user_id == user.id))).all()
    now = utcnow()
    return {
        "total": len(content.flashcards),
        "learning": sum(1 for s in states if s.interval_days < 21),
        "mature": sum(1 for s in states if s.interval_days >= 21),
        "due": sum(1 for s in states if s.due_at <= now),
        "seen": len(states),
    }
