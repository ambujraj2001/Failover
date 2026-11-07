"""Request / response models for the HTTP API."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.simulator.models import Design

Level = Literal["beginner", "intermediate", "expert"]
Target = Literal["E4", "E5", "E6"]
TrackSlug = Literal["meta", "google", "amazon", "crash"]

_TZ = available_timezones()


def _clean_name(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("Please enter your name.")
    return v


# ---- auth ------------------------------------------------------------------------------------

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    name: str = Field(min_length=1, max_length=80)
    timezone: str | None = None

    _n = field_validator("name")(_clean_name)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    name: str
    level: Level
    target_level: Target
    track: str | None
    timezone: str
    free_roam: bool
    onboarded: bool
    streak_current: int
    streak_best: int
    created_at: datetime


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    level: Level | None = None
    target_level: Target | None = None
    track: TrackSlug | Literal["none"] | None = None
    timezone: str | None = None
    free_roam: bool | None = None
    onboarded: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is not None and v not in _TZ:
            raise ValueError("Unknown time zone.")
        return v


# ---- labs ------------------------------------------------------------------------------------

class RunIn(BaseModel):
    design: Design
    test_id: str | None = Field(default=None, max_length=64)


class SubmitIn(BaseModel):
    design: Design
    design_note: str | None = Field(default=None, max_length=12000)


class DraftIn(BaseModel):
    design: Design
    design_note: str | None = Field(default=None, max_length=12000)
    version: int | None = Field(default=None, ge=0, description="last version the client saw (optimistic lock)")


class PostIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    parent_id: uuid.UUID | None = None

    @field_validator("body")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Write something first.")
        return v


class PostEditIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    design: Design | None = None


class ExplainIn(BaseModel):
    mode: Literal["simpler", "deeper", "example"] = "simpler"


# ---- flashcards ------------------------------------------------------------------------------

class ReviewIn(BaseModel):
    grade: Literal["again", "hard", "good", "easy"]


# ---- interviews ------------------------------------------------------------------------------

class InterviewStartIn(BaseModel):
    problem_slug: str = Field(min_length=1, max_length=80)
    target_level: Target | None = None


class InterviewSaveIn(BaseModel):
    design: Design | None = None
    notes: str | None = Field(default=None, max_length=12000)


class ActivityOut(BaseModel):
    day: date
    count: int


class Message(BaseModel):
    message: str
    data: dict[str, Any] | None = None
