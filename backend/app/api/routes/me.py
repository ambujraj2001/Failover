from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DB, ContentDep, CurrentUser
from app.core.db import utcnow
from app.models import ActivityDay, FlashcardState, Interview, Submission
from app.schemas import ProfileIn, UserOut
from app.services.progress import curriculum_view, effective_streak, learner_state, today_for

router = APIRouter(prefix="/me", tags=["me"])


@router.patch("", response_model=UserOut)
async def update_profile(body: ProfileIn, user: CurrentUser, db: DB):
    data = body.model_dump(exclude_unset=True)
    if "track" in data:
        data["track"] = None if data["track"] in (None, "none") else data["track"]
    for k, v in data.items():
        if v is not None or k == "track":
            setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/dashboard")
async def dashboard(user: CurrentUser, db: DB, content: ContentDep):
    lessons, labs = await learner_state(db, user)
    cur = curriculum_view(content, user, lessons, labs)
    today = today_for(user)
    since = today - timedelta(days=182)
    activity = (await db.execute(select(ActivityDay.day, ActivityDay.count).where(
        ActivityDay.user_id == user.id, ActivityDay.day >= since).order_by(ActivityDay.day))).all()

    reviewed = await db.scalar(select(func.count()).select_from(FlashcardState)
                               .where(FlashcardState.user_id == user.id))
    due_existing = await db.scalar(select(func.count()).select_from(FlashcardState).where(
        FlashcardState.user_id == user.id, FlashcardState.due_at <= utcnow()))
    unlocked_days = {d["day"] for p in cur["phases"] if p["unlocked"] for d in p["days"]}
    new_cards = sum(1 for c in content.flashcards if (c.day or 1) in unlocked_days) - (reviewed or 0)
    cards_due = (due_existing or 0) + max(0, min(new_cards, 10))

    next_item = None
    for p in cur["phases"]:
        for d in p["days"]:
            if d["day"] == cur["current_day"]:
                next_item = next((i for i in d["items"] if not i["done"]), None)
                current = d
    recent = (await db.scalars(select(Submission).where(Submission.user_id == user.id)
                               .order_by(Submission.created_at.desc()).limit(6))).all()
    interviews = (await db.scalars(select(Interview).where(Interview.user_id == user.id,
                                                           Interview.status == "completed")
                                   .order_by(Interview.created_at.desc()).limit(3))).all()
    solved = [s for s, lp in labs.items() if lp.solved_at]
    phases = [{"id": p["id"], "title": p["title"], "unlocked": p["unlocked"],
               "done": sum(d["done"] for d in p["days"]), "total": sum(d["total"] for d in p["days"])}
              for p in cur["phases"]]
    return {
        "streak": effective_streak(user),
        "streak_best": user.streak_best,
        "current_day": cur["current_day"],
        "today": {"day": current["day"], "title": current["title"], "theme": current["theme"],
                  "items": current["items"]} if next_item is not None or cur["current_day"] else None,
        "next_item": next_item,
        "completed_items": cur["completed_items"],
        "total_items": cur["total_items"],
        "phases": phases,
        "solved_labs": len([s for s in solved if content.labs.get(s) and content.labs[s].kind == "lab"]),
        "solved_problems": len([s for s in solved if content.labs.get(s) and content.labs[s].kind == "problem"]),
        "total_labs": len([x for x in content.labs.values() if x.kind == "lab"]),
        "total_problems": len(content.problems()),
        "lessons_done": len(lessons),
        "cards_due": cards_due,
        "activity": [{"day": d.isoformat(), "count": c} for d, c in activity],
        "recent_submissions": [{"lab_slug": s.lab_slug, "lab_title": content.labs[s.lab_slug].title
                                if s.lab_slug in content.labs else s.lab_slug, "passed": s.passed, "cost": s.cost,
                                "created_at": s.created_at} for s in recent],
        "recent_interviews": [{"id": str(i.id), "problem_slug": i.problem_slug, "verdict": i.verdict,
                               "target_level": i.target_level, "created_at": i.created_at,
                               "scores": i.scores} for i in interviews],
    }
