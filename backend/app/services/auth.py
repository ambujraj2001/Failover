from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from fastapi import Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError, Conflict, TooManyRequests, Unauthorized
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_opaque_token,
    password_problems,
    verify_password,
)
from app.models import PasswordResetToken, RefreshToken, User

log = logging.getLogger("failover.auth")
REFRESH_COOKIE = "fo_refresh"
INVALID_CREDENTIALS = "Email or password is incorrect."


def normalise_email(email: str) -> str:
    return email.strip().lower()


def check_password_policy(password: str, email: str | None = None) -> None:
    problems = password_problems(password, email)
    if problems:
        raise AppError(problems[0], code="weak_password", status=422,
                       details=[{"field": "password", "message": p} for p in problems])


async def register(db: AsyncSession, email: str, password: str, name: str, tz: str | None) -> User:
    email = normalise_email(email)
    check_password_policy(password, email)
    exists = await db.scalar(select(User.id).where(User.email == email))
    if exists:
        raise Conflict("An account with this email already exists. Sign in instead.", code="email_taken")
    user = User(email=email, password_hash=hash_password(password), name=name,
                timezone=tz if tz else "UTC")
    db.add(user)
    await db.flush()
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    s = get_settings()
    email = normalise_email(email)
    user = await db.scalar(select(User).where(User.email == email))
    now = utcnow()
    if user and user.locked_until and user.locked_until > now:
        mins = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise TooManyRequests(f"Too many failed attempts. Try again in {mins} min or reset your password.",
                              code="account_locked")
    if not verify_password(password, user.password_hash if user else None) or not user:
        if user:
            user.failed_logins += 1
            if user.failed_logins >= s.max_failed_logins:
                user.locked_until = now + timedelta(minutes=s.lockout_minutes)
                user.failed_logins = 0
            await db.commit()
        raise Unauthorized(INVALID_CREDENTIALS, code="invalid_credentials")
    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user


async def issue_session(db: AsyncSession, user: User, response: Response, user_agent: str | None,
                        ip: str | None, family_id: uuid.UUID | None = None) -> tuple[str, int]:
    s = get_settings()
    raw = new_opaque_token()
    db.add(RefreshToken(user_id=user.id, family_id=family_id or uuid.uuid4(), token_hash=hash_token(raw),
                        expires_at=utcnow() + timedelta(days=s.refresh_token_days),
                        user_agent=(user_agent or "")[:255], ip=(ip or "")[:64]))
    set_refresh_cookie(response, raw)
    return create_access_token(user.id, user.token_version)


def set_refresh_cookie(response: Response, raw: str) -> None:
    s = get_settings()
    response.set_cookie(REFRESH_COOKIE, raw, max_age=s.refresh_token_days * 86400, httponly=True,
                        secure=s.cookie_secure, samesite="lax", path=f"{s.api_prefix}/auth",
                        domain=s.cookie_domain)


def clear_refresh_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(REFRESH_COOKIE, path=f"{s.api_prefix}/auth", domain=s.cookie_domain)


async def rotate(db: AsyncSession, raw: str | None, response: Response, user_agent: str | None,
                 ip: str | None) -> tuple[User, str, int]:
    if not raw:
        raise Unauthorized("Your session has ended. Please sign in.", code="no_session")
    token = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    now = utcnow()
    if not token:
        clear_refresh_cookie(response)
        raise Unauthorized("Your session has ended. Please sign in.", code="invalid_session")
    if token.revoked_at is not None:
        # a rotated token was presented again: assume theft, kill the whole family
        await db.execute(update(RefreshToken).where(RefreshToken.family_id == token.family_id,
                                                    RefreshToken.revoked_at.is_(None)).values(revoked_at=now))
        await db.commit()
        log.warning("refresh token reuse detected for user %s", token.user_id)
        clear_refresh_cookie(response)
        raise Unauthorized("For your security you were signed out. Please sign in again.", code="session_reused")
    if token.expires_at <= now:
        clear_refresh_cookie(response)
        raise Unauthorized("Your session has expired. Please sign in.", code="session_expired")
    user = await db.get(User, token.user_id)
    if not user:
        raise Unauthorized("Your session has ended. Please sign in.", code="invalid_session")
    token.revoked_at = now
    access, ttl = await issue_session(db, user, response, user_agent, ip, family_id=token.family_id)
    return user, access, ttl


async def revoke(db: AsyncSession, raw: str | None) -> None:
    if not raw:
        return
    token = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if token and token.revoked_at is None:
        token.revoked_at = utcnow()


async def revoke_all(db: AsyncSession, user: User) -> None:
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
                     .values(revoked_at=utcnow()))
    user.token_version += 1


async def start_reset(db: AsyncSession, email: str) -> str | None:
    """Create a reset token. Returns the raw token (only logged in development)."""
    user = await db.scalar(select(User).where(User.email == normalise_email(email)))
    if not user:
        return None
    raw = new_opaque_token()
    db.add(PasswordResetToken(user_id=user.id, token_hash=hash_token(raw),
                              expires_at=utcnow() + timedelta(minutes=get_settings().reset_token_minutes)))
    return raw


async def finish_reset(db: AsyncSession, raw: str, new_password: str) -> User:
    tok = await db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw)))
    now = utcnow()
    if not tok or tok.used_at is not None or tok.expires_at <= now:
        raise AppError("This reset link is invalid or has expired. Request a new one.", code="invalid_reset_token")
    user = await db.get(User, tok.user_id)
    if not user:
        raise AppError("This reset link is invalid or has expired.", code="invalid_reset_token")
    check_password_policy(new_password, user.email)
    tok.used_at = now
    user.password_hash = hash_password(new_password)
    user.failed_logins = 0
    user.locked_until = None
    await revoke_all(db, user)
    return user


def is_expired(dt: datetime | None) -> bool:
    return dt is not None and dt <= utcnow()
