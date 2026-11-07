"""SM-2 style spaced repetition scheduling."""

from __future__ import annotations

from datetime import timedelta

from app.core.db import utcnow
from app.models import FlashcardState

GRADES = {"again": 0, "hard": 3, "good": 4, "easy": 5}


def schedule(state: FlashcardState, grade: str) -> FlashcardState:
    q = GRADES[grade]
    now = utcnow()
    if q < 3:
        state.repetitions = 0
        state.lapses += 1
        state.interval_days = 0
        due = now + timedelta(minutes=10)  # see it again later this session
    else:
        if state.repetitions == 0:
            interval = 1.0
        elif state.repetitions == 1:
            interval = 3.0 if q >= 4 else 2.0
        else:
            interval = state.interval_days * state.ease
        if q == 3:
            interval *= 0.8
        if q == 5:
            interval *= 1.3
        state.repetitions += 1
        state.interval_days = round(min(interval, 365.0), 2)
        due = now + timedelta(days=state.interval_days)
    state.ease = max(1.3, state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
    state.due_at = due
    state.last_reviewed_at = now
    return state
