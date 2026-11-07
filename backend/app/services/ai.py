"""DeepSeek client (OpenAI-compatible chat completions) with per-user daily quotas.

Cost controls: every call is user-initiated, capped by ``max_tokens``, counted against a daily quota,
and deterministic content (lesson explanations) is cached in the database.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, ServiceUnavailable, TooManyRequests
from app.models import AIUsage, User
from app.services.progress import today_for
from app.simulator.catalog import CATALOG
from app.simulator.models import Design

log = logging.getLogger("failover.ai")

LEVEL_STYLE = {
    "beginner": "The learner is new to system design. Use plain words, define any jargon the first time, and "
                "prefer a concrete analogy over abstraction.",
    "intermediate": "The learner is a working software engineer. Be direct and practical; light jargon is fine.",
    "expert": "The learner is a senior engineer. Be terse and precise, use exact terminology and numbers.",
}


class AIError(AppError):
    status, code = 502, "ai_error"


async def check_quota(db: AsyncSession, user: User) -> int:
    s = get_settings()
    if not s.ai_enabled:
        raise ServiceUnavailable("The AI assistant is not configured on this server (missing DEEPSEEK_API_KEY).",
                                 code="ai_disabled")
    used = await db.scalar(select(AIUsage.count).where(AIUsage.user_id == user.id,
                                                       AIUsage.day == today_for(user))) or 0
    if used >= s.ai_daily_limit:
        raise TooManyRequests(f"You've used today's {s.ai_daily_limit} AI requests. They reset at midnight.",
                              code="ai_quota")
    return s.ai_daily_limit - used


async def record_usage(db: AsyncSession, user: User, tokens: int = 0) -> None:
    stmt = insert(AIUsage).values(user_id=user.id, day=today_for(user), count=1, tokens=tokens)
    stmt = stmt.on_conflict_do_update(index_elements=["user_id", "day"],
                                      set_={"count": AIUsage.count + 1, "tokens": AIUsage.tokens + tokens})
    await db.execute(stmt)


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_settings().deepseek_api_key}", "Content-Type": "application/json"}


def _payload(messages: list[dict[str, str]], max_tokens: int, temperature: float, stream: bool,
             json_mode: bool = False) -> dict[str, Any]:
    body: dict[str, Any] = {"model": get_settings().deepseek_model, "messages": messages, "max_tokens": max_tokens,
                            "temperature": temperature, "stream": stream}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    return body


def _friendly(status: int) -> str:
    if status == 401:
        return "The AI provider rejected our API key."
    if status == 402:
        return "The AI provider account is out of credit."
    if status == 429:
        return "The AI provider is rate limiting us. Try again in a minute."
    return "The AI assistant is unavailable right now. Try again shortly."


async def complete(messages: list[dict[str, str]], *, max_tokens: int = 600, temperature: float = 0.4,
                   json_mode: bool = False) -> tuple[str, int]:
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=s.ai_timeout_s) as client:
            r = await client.post(f"{s.deepseek_base_url}/chat/completions", headers=_headers(),
                                  json=_payload(messages, max_tokens, temperature, False, json_mode))
    except httpx.HTTPError as e:
        log.warning("deepseek request failed: %s", e)
        raise AIError("Couldn't reach the AI assistant. Try again shortly.") from e
    if r.status_code != 200:
        log.warning("deepseek error %s: %s", r.status_code, r.text[:300])
        raise AIError(_friendly(r.status_code))
    data = r.json()
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    tokens = (data.get("usage") or {}).get("total_tokens", 0)
    return text.strip(), tokens


async def stream(messages: list[dict[str, str]], *, max_tokens: int = 500,
                 temperature: float = 0.5) -> AsyncIterator[str]:
    """Yield text deltas. Raises AIError on failure before the first token."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=httpx.Timeout(s.ai_timeout_s, connect=10)) as client:
        try:
            async with client.stream("POST", f"{s.deepseek_base_url}/chat/completions", headers=_headers(),
                                     json=_payload(messages, max_tokens, temperature, True)) as r:
                if r.status_code != 200:
                    body = await r.aread()
                    log.warning("deepseek stream error %s: %s", r.status_code, body[:300])
                    raise AIError(_friendly(r.status_code))
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    chunk = line[5:].strip()
                    if chunk == "[DONE]":
                        break
                    try:
                        delta = json.loads(chunk)["choices"][0]["delta"].get("content")
                    except (KeyError, IndexError, json.JSONDecodeError):
                        continue
                    if delta:
                        yield delta
        except httpx.HTTPError as e:
            log.warning("deepseek stream failed: %s", e)
            raise AIError("The AI assistant connection dropped. Try again.") from e


def sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


# ---- prompt context helpers --------------------------------------------------------------------

def describe_design(design: Design | dict | None) -> str:
    if design is None:
        return "(no design yet)"
    d = design if isinstance(design, Design) else Design.model_validate(design)
    labels = {}
    lines = []
    for n in d.nodes:
        meta = CATALOG.get(n.type)
        label = n.label or (meta["label"] if meta else n.type)
        labels[n.id] = label
        cfg = ", ".join(f"{k}={v}" for k, v in n.config.items()) if n.config else "defaults"
        lines.append(f"- {label} [{n.type}] ({cfg})")
    edges = [f"{labels.get(e.source, e.source)} -> {labels.get(e.target, e.target)}" for e in d.edges]
    return "Components:\n" + "\n".join(lines) + "\nConnections: " + ("; ".join(edges) or "none")


def describe_run(result: dict[str, Any] | None) -> str:
    if not result:
        return "(the learner has not run a test yet)"
    out = []
    for r in result.get("results", []):
        if r.get("hidden") and r.get("summary") is None:
            out.append(f"- hidden test: {'passed' if r['passed'] else 'failed'}")
            continue
        s = r.get("summary") or {}
        checks = "; ".join(f"{c['label']} target {'≤' if c['op'] == 'lte' else '≥'} {c['target']}{c['unit']} got "
                           f"{c['got']}{c['unit']} {'PASS' if c['passed'] else 'FAIL'}" for c in r.get("checks", []))
        out.append(f"- {r['name']}: {'PASS' if r['passed'] else 'FAIL'} | p50 {s.get('p50_ms')} ms, p99 "
                   f"{s.get('p99_ms')} ms, errors {s.get('error_rate')}%, cost ${s.get('cost_per_hr')}/hr | {checks}"
                   f" | diagnosis: {r.get('diagnosis')}")
        reasons = r.get("failure_reasons") or []
        if reasons:
            out.append("  top failure reasons: " + "; ".join(f"{x['reason']} ({x['pct']}%)" for x in reasons[:3]))
        busiest = sorted((r.get("nodes") or {}).values(), key=lambda v: -v.get("peak_busy", 0))[:3]
        if busiest:
            out.append("  busiest: " + "; ".join(f"{v['label']} avg {round(v['busy'] * 100)}% peak "
                                                 f"{round(v['peak_busy'] * 100)}%" for v in busiest))
    budget = result.get("budget")
    if budget is not None:
        out.append(f"- cost ${result.get('cost_per_hr')}/hr vs budget ${budget}/hr")
    return "\n".join(out)
