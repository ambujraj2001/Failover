"""All ORM models. Import from here so Alembic sees every table."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, utcnow


def _uuid() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _user_fk(primary: bool = False) -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=primary,
                         index=not primary, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid()
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    level: Mapped[str] = mapped_column(String(16), default="beginner", nullable=False)
    target_level: Mapped[str] = mapped_column(String(4), default="E5", nullable=False)
    track: Mapped[str | None] = mapped_column(String(32))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    free_roam: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    streak_current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak_best: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_active_on: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow,
                                                 nullable=False)


class RefreshToken(TimestampMixin, Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user_fk()
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip: Mapped[str | None] = mapped_column(String(64))


class PasswordResetToken(TimestampMixin, Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user_fk()
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ActivityDay(Base):
    __tablename__ = "activity_days"

    user_id: Mapped[uuid.UUID] = _user_fk(primary=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    user_id: Mapped[uuid.UUID] = _user_fk(primary=True)
    lesson_slug: Mapped[str] = mapped_column(String(80), primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class LabProgress(Base):
    __tablename__ = "lab_progress"

    user_id: Mapped[uuid.UUID] = _user_fk(primary=True)
    lab_slug: Mapped[str] = mapped_column(String(80), primary_key=True)
    draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    draft_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    design_note: Mapped[str | None] = mapped_column(Text)
    hints_revealed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    solved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    best_cost: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow,
                                                 nullable=False)


class Submission(TimestampMixin, Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_user_lab", "user_id", "lab_slug", "created_at"),)

    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user_fk()
    lab_slug: Mapped[str] = mapped_column(String(80), nullable=False)
    design: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    design_note: Mapped[str | None] = mapped_column(Text)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    cost: Mapped[float] = mapped_column(Float, nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    review: Mapped[str | None] = mapped_column(Text)


class DiscussionPost(TimestampMixin, Base):
    __tablename__ = "discussion_posts"
    __table_args__ = (Index("ix_discussion_lab_created", "lab_slug", "created_at"),)

    id: Mapped[uuid.UUID] = _uuid()
    lab_slug: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[uuid.UUID] = _user_fk()
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discussion_posts.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FlashcardState(Base):
    __tablename__ = "flashcard_states"
    __table_args__ = (Index("ix_flashcard_due", "user_id", "due_at"),)

    user_id: Mapped[uuid.UUID] = _user_fk(primary=True)
    card_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    ease: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    interval_days: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    repetitions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lapses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MentorMessage(TimestampMixin, Base):
    __tablename__ = "mentor_messages"
    __table_args__ = (Index("ix_mentor_user_lab", "user_id", "lab_slug", "created_at"),)

    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user_fk()
    lab_slug: Mapped[str] = mapped_column(String(80), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)


class Interview(TimestampMixin, Base):
    __tablename__ = "interviews"

    id: Mapped[uuid.UUID] = _uuid()
    user_id: Mapped[uuid.UUID] = _user_fk()
    problem_slug: Mapped[str] = mapped_column(String(80), nullable=False)
    target_level: Mapped[str] = mapped_column(String(4), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    design: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)
    transcript: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)
    twist: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    twist_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scores: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    verdict: Mapped[str | None] = mapped_column(String(32))
    feedback: Mapped[str | None] = mapped_column(Text)
    sim_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class AICache(TimestampMixin, Base):
    __tablename__ = "ai_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)


class AIUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "day"),)

    user_id: Mapped[uuid.UUID] = _user_fk(primary=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


__all__ = [
    "AICache", "AIUsage", "ActivityDay", "DiscussionPost", "FlashcardState", "Interview", "LabProgress",
    "LessonProgress", "MentorMessage", "PasswordResetToken", "RefreshToken", "Submission", "User",
]
