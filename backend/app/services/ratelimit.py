"""Small in-process sliding-window rate limiter.

Good enough for a single API process. Behind several workers, swap for Redis (INCR + EXPIRE).
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import TooManyRequests

_hits: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def limit(key: str, max_hits: int, window_s: float) -> None:
    if get_settings().environment == "test":
        return
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= max_hits:
        retry = int(window_s - (now - q[0])) + 1
        raise TooManyRequests(f"Too many requests. Try again in {retry} s.", details={"retry_after": retry})
    q.append(now)


def limiter(name: str, max_hits: int, window_s: float):
    """FastAPI dependency: limit by client IP."""

    async def dep(request: Request) -> None:
        limit(f"{name}:{client_ip(request)}", max_hits, window_s)

    return dep
