from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.loader import Content, get_content
from app.core.db import get_session
from app.core.errors import Unauthorized
from app.core.security import decode_access_token
from app.models import User

DB = Annotated[AsyncSession, Depends(get_session)]


def content_dep() -> Content:
    return get_content()


ContentDep = Annotated[Content, Depends(content_dep)]


async def current_user(request: Request, db: DB) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise Unauthorized("Please sign in to continue.", code="not_authenticated")
    payload = decode_access_token(auth[7:].strip())
    if not payload:
        raise Unauthorized("Your session has expired. Please sign in again.", code="token_expired")
    try:
        uid = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise Unauthorized("Invalid session.", code="invalid_token") from e
    user = await db.get(User, uid)
    if not user or user.token_version != payload.get("ver"):
        raise Unauthorized("Your session has ended. Please sign in again.", code="token_revoked")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
