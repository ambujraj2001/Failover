"""Timed mock interviews: AI interviewer, mid-interview twist, simulator + AI scoring."""

from __future__ import annotations

import json
import random
import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import DB, ContentDep, CurrentUser
from app.content.schema import Lab
from app.core.config import get_settings
from app.core.db import SessionLocal, utcnow
from app.core.errors import AppError, Conflict, NotFound
from app.models import Interview, User
from app.schemas import ChatIn, InterviewSaveIn, InterviewStartIn
from app.services import ai
from app.services.progress import touch_activity
from app.services.ratelimit import limit
from app.simulator.grading import grade
from app.simulator.models import Design, SimEvent, Spike, TestCase
from app.simulator.validation import DesignInvalid

router = APIRouter(prefix="/interviews", tags=["interviews"])
GRACE = timedelta(minutes=3)
AXES = ("problem_navigation", "solution_design", "technical_excellence", "communication")
VERDICTS = ("strong_hire", "hire", "lean_hire", "lean_no_hire", "no_hire")

TWISTS = [
    {"kind": "traffic", "title": "Traffic x3",
     "prompt": "Product just told us a marketing push will triple peak traffic next week. What changes in your design?"},
    {"kind": "outage", "title": "Primary database failure",
     "prompt": "Your primary database just died at peak. Walk me through what happens to users in the next 60 seconds "
               "with your design, and what you would change."},
    {"kind": "budget", "title": "Budget cut 30%",
     "prompt": "Finance needs this to run for 30% less money. What do you cut, and what risk do you accept?"},
]


def get_problem(content, slug: str) -> Lab:
    lab = content.labs.get(slug)
    if not lab or lab.kind != "problem":
        raise NotFound("Interview problem not found.")
    return lab


def _expired(iv: Interview) -> bool:
    return iv.status == "active" and utcnow() > iv.ends_at + GRACE


def out(iv: Interview, content) -> dict[str, Any]:
    lab = content.labs.get(iv.problem_slug)
    return {
        "id": str(iv.id), "problem_slug": iv.problem_slug, "problem_title": lab.title if lab else iv.problem_slug,
        "target_level": iv.target_level, "status": iv.status, "created_at": iv.created_at, "ends_at": iv.ends_at,
        "finished_at": iv.finished_at, "design": iv.design, "notes": iv.notes, "transcript": iv.transcript,
        "twist": {"title": iv.twist["title"], "kind": iv.twist["kind"]} if iv.twist and iv.twist_sent else None,
        "scores": iv.scores, "verdict": iv.verdict, "feedback": iv.feedback, "sim_result": iv.sim_result,
        "brief": lab.brief_expert if lab else None, "palette": lab.palette if lab else [],
        "starter": lab.starter.model_dump() if lab else None, "design_prompt": lab.design_prompt if lab else None,
        # effective budget: the budget-cut twist lowers it by 30% once introduced
        "budget": (round(lab.budget * 0.7, 2) if iv.twist and iv.twist_sent and iv.twist["kind"] == "budget"
                   else lab.budget) if lab else None,
    }


async def load(db, user: User, iid: uuid.UUID) -> Interview:
    iv = await db.get(Interview, iid)
    if not iv or iv.user_id != user.id:
        raise NotFound("Interview not found.")
    if _expired(iv) and not iv.finished_at:
        # past the deadline: keep it finishable but flag it
        pass
    return iv


@router.get("/problems")
async def problems(content: ContentDep):
    return [{"slug": p.slug, "title": p.title, "difficulty": p.difficulty, "topics": p.topics,
             "company_tags": p.company_tags, "summary": p.summary} for p in content.problems()]


@router.get("")
async def list_interviews(user: CurrentUser, db: DB, content: ContentDep):
    rows = (await db.scalars(select(Interview).where(Interview.user_id == user.id)
                             .order_by(Interview.created_at.desc()).limit(30))).all()
    return [{"id": str(i.id), "problem_slug": i.problem_slug,
             "problem_title": content.labs[i.problem_slug].title if i.problem_slug in content.labs else i.problem_slug,
             "target_level": i.target_level, "status": "expired" if _expired(i) else i.status,
             "verdict": i.verdict, "scores": i.scores, "created_at": i.created_at} for i in rows]


@router.post("", status_code=201)
async def start(body: InterviewStartIn, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_problem(content, body.problem_slug)
    active = (await db.scalars(select(Interview).where(Interview.user_id == user.id,
                                                       Interview.status == "active"))).all()
    for iv in active:
        if _expired(iv):
            iv.status = "abandoned"
        else:
            raise Conflict("You already have an interview in progress. Finish or abandon it first.",
                           code="interview_active", details={"id": str(iv.id)})
    target = body.target_level or user.target_level
    minutes = get_settings().interview_minutes
    opening = (f"Thanks for joining. Today we'll design **{lab.title.removeprefix('Design ').strip()}**. "
               f"You have {minutes} minutes and I'm assessing at the {target} bar.\n\n{lab.brief_expert}\n\n"
               "Start wherever you like, but I'd suggest clarifying requirements and scale first. Build your "
               "design on the canvas as you go; I can see it.")
    iv = Interview(user_id=user.id, problem_slug=lab.slug, target_level=target,
                   ends_at=utcnow() + timedelta(minutes=minutes), design=lab.starter.model_dump(),
                   transcript=[{"role": "assistant", "content": opening, "at": utcnow().isoformat()}],
                   twist=random.choice(TWISTS))
    db.add(iv)
    await touch_activity(db, user)
    await db.commit()
    return out(iv, content)


@router.get("/{iid}")
async def get_one(iid: uuid.UUID, user: CurrentUser, db: DB, content: ContentDep):
    iv = await load(db, user, iid)
    data = out(iv, content)
    if _expired(iv):
        data["status"] = "expired"
    return data


@router.put("/{iid}")
async def save(iid: uuid.UUID, body: InterviewSaveIn, user: CurrentUser, db: DB):
    iv = await load(db, user, iid)
    if iv.status != "active":
        raise Conflict("This interview has ended.", code="interview_ended")
    if body.design is not None:
        iv.design = body.design.model_dump()
    if body.notes is not None:
        iv.notes = body.notes
    await db.commit()
    return {"saved": True}


def interviewer_system(lab: Lab, iv: Interview, user: User, twist_now: bool) -> str:
    remaining = max(0, int((iv.ends_at - utcnow()).total_seconds() // 60))
    twist = (f"\nIMPORTANT: In this reply, after briefly responding, introduce this twist: \"{iv.twist['prompt']}\""
             if twist_now and iv.twist else "")
    return (
        "You are a senior engineer conducting a system design interview on Failover. Behave like a real "
        f"interviewer at the {iv.target_level} bar: ask clarifying and probing questions, push on trade-offs, "
        "request numbers, steer if the candidate is stuck, but never design it for them. One or two questions per "
        "turn. Keep replies under 120 words, plain markdown, no emoji. You can see their canvas design below.\n"
        f"{ai.LEVEL_STYLE.get(user.level, '')}\n\n"
        f"PROBLEM: {lab.title}\n{lab.brief_expert}\n\nAREAS AN INTERVIEWER PROBES:\n{lab.design_prompt or ''}\n\n"
        f"TIME REMAINING: {remaining} minutes\nCURRENT CANVAS:\n{ai.describe_design(iv.design)}\n"
        f"CANDIDATE NOTES:\n{(iv.notes or '(none)')[:2000]}{twist}"
    )


@router.post("/{iid}/message")
async def message(iid: uuid.UUID, body: ChatIn, user: CurrentUser, db: DB, content: ContentDep):
    iv = await load(db, user, iid)
    if iv.status != "active":
        raise Conflict("This interview has ended.", code="interview_ended")
    if _expired(iv):
        raise Conflict("Time is up. Finish the interview to get your score.", code="interview_time_up")
    limit(f"interview:{user.id}", 10, 60)
    await ai.check_quota(db, user)
    lab = get_problem(content, iv.problem_slug)
    if body.design is not None:
        iv.design = body.design.model_dump()
    total = (iv.ends_at - iv.created_at).total_seconds()
    elapsed = (utcnow() - iv.created_at).total_seconds()
    twist_now = not iv.twist_sent and elapsed >= total * 0.45
    messages = [{"role": "system", "content": interviewer_system(lab, iv, user, twist_now)}]
    messages += [{"role": m["role"], "content": m["content"]} for m in iv.transcript[-14:]]
    messages.append({"role": "user", "content": body.message})
    iv.transcript = [*iv.transcript, {"role": "user", "content": body.message, "at": utcnow().isoformat()}]
    if twist_now:
        iv.twist_sent = True
    await ai.record_usage(db, user)
    await db.commit()
    interview_id = iv.id

    async def gen():
        parts: list[str] = []
        try:
            async for delta in ai.stream(messages, max_tokens=350, temperature=0.6):
                parts.append(delta)
                yield ai.sse({"delta": delta})
        except AppError as e:
            yield ai.sse({"error": e.message})
            return
        text = "".join(parts).strip()
        if text:
            async with SessionLocal() as s2:
                row = await s2.get(Interview, interview_id)
                if row:
                    row.transcript = [*row.transcript, {"role": "assistant", "content": text,
                                                        "at": utcnow().isoformat()}]
                    await s2.commit()
        yield ai.sse({"done": True, "twist": twist_now})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def twist_tests(lab: Lab, iv: Interview) -> tuple[list[TestCase], float]:
    tests = list(lab.tests)
    budget = lab.budget
    if not iv.twist or not iv.twist_sent:
        return tests, budget
    base = next(t for t in lab.tests if not t.hidden)
    kind = iv.twist["kind"]
    if kind == "budget":
        budget = round(lab.budget * 0.7, 2)
    else:
        sc = base.scenario.model_copy(deep=True)
        if kind == "traffic":
            sc.spikes = [*sc.spikes, Spike(at=15, duration=25, multiplier=3, ramp=5)]
            name = "Twist: traffic triples"
        else:
            sc.events = [*sc.events, SimEvent(at=20, type="kill_db_primary")]
            name = "Twist: primary database dies"
        relaxed = [a.model_copy(update={"value": a.value * (3 if a.metric == "error_rate" else 1.5)})
                   if a.op == "lte" else a for a in base.assertions]
        tests.append(TestCase(id="twist", name=name, summary=iv.twist["title"], hidden=False, scenario=sc,
                              assertions=relaxed))
    return tests, budget


def fallback_scores(sim: dict[str, Any] | None, transcript_len: int) -> dict[str, Any]:
    passed = sum(1 for r in (sim or {}).get("results", []) if r.get("passed"))
    total = max(1, len((sim or {}).get("results", [])))
    design = int(40 + 50 * passed / total)
    comms = min(85, 35 + 6 * transcript_len)
    return {"problem_navigation": comms, "solution_design": design, "technical_excellence": design - 5,
            "communication": comms}


@router.post("/{iid}/finish")
async def finish(iid: uuid.UUID, user: CurrentUser, db: DB, content: ContentDep):
    iv = await load(db, user, iid)
    if iv.status == "completed":
        return out(iv, content)
    if iv.status != "active":
        raise Conflict("This interview was abandoned.", code="interview_ended")
    lab = get_problem(content, iv.problem_slug)
    tests, budget = twist_tests(lab, iv)
    sim: dict[str, Any] | None
    try:
        sim = grade(Design.model_validate(iv.design or {}), tests, budget, set(lab.palette), reveal_hidden=True)
        for r in sim["results"]:
            r.pop("series", None)
            r["logs"] = (r.get("logs") or [])[:30]
    except DesignInvalid as e:
        sim = {"passed": False, "invalid": e.issues, "results": [], "cost_per_hr": None, "budget": budget}

    user_turns = sum(1 for m in iv.transcript if m["role"] == "user")
    scores, verdict, feedback = None, None, None
    s = get_settings()
    if s.ai_enabled and user_turns >= 1:
        try:
            await ai.check_quota(db, user)
            transcript = "\n".join(f"{'Interviewer' if m['role'] == 'assistant' else 'Candidate'}: {m['content']}"
                                   for m in iv.transcript)[-9000:]
            system = ("You grade system design interviews. Return only JSON with keys: problem_navigation, "
                      "solution_design, technical_excellence, communication (integers 0-100, calibrated to the "
                      f"{iv.target_level} bar where 70 means meets the bar), verdict (one of {', '.join(VERDICTS)}), "
                      "summary (2-3 sentences), strengths (array of 2-3 strings), improvements (array of 2-3 "
                      "specific, actionable strings).")
            prompt = (f"PROBLEM: {lab.title}\n{lab.brief_expert}\n\nWHAT A STRONG ANSWER COVERS:\n"
                      f"{lab.editorial[:2500]}\n\nFINAL CANVAS:\n{ai.describe_design(iv.design)}\n\nSIMULATOR "
                      f"RESULTS:\n{ai.describe_run(sim) if sim.get('results') else 'invalid design: ' + str(sim.get('invalid'))}"
                      f"\n\nCANDIDATE NOTES:\n{(iv.notes or '(none)')[:3000]}\n\nTRANSCRIPT:\n{transcript}")
            text, tokens = await ai.complete([{"role": "system", "content": system},
                                              {"role": "user", "content": prompt}],
                                             max_tokens=700, temperature=0.2, json_mode=True)
            await ai.record_usage(db, user, tokens)
            data = json.loads(text)
            scores = {k: max(0, min(100, int(data.get(k, 0)))) for k in AXES}
            verdict = data.get("verdict") if data.get("verdict") in VERDICTS else None
            fb = [data.get("summary", "")]
            if data.get("strengths"):
                fb.append("**Strengths**\n" + "\n".join(f"- {x}" for x in data["strengths"][:3]))
            if data.get("improvements"):
                fb.append("**To reach the bar**\n" + "\n".join(f"- {x}" for x in data["improvements"][:3]))
            feedback = "\n\n".join(x for x in fb if x)
        except (AppError, ValueError, json.JSONDecodeError, TypeError):
            scores = None
    if scores is None:
        scores = fallback_scores(sim, user_turns)
        feedback = ("Scored from the simulator results and how much you engaged; detailed AI feedback was not "
                    "available for this interview." if user_turns else
                    "No conversation took place, so only the design was scored.")
    if verdict is None:
        avg = sum(scores.values()) / len(scores)
        verdict = ("strong_hire" if avg >= 88 else "hire" if avg >= 75 else "lean_hire" if avg >= 65
                   else "lean_no_hire" if avg >= 50 else "no_hire")
    iv.scores, iv.verdict, iv.feedback, iv.sim_result = scores, verdict, feedback, sim
    iv.status = "completed"
    iv.finished_at = utcnow()
    await touch_activity(db, user)
    await db.commit()
    return out(iv, content)


@router.post("/{iid}/abandon")
async def abandon(iid: uuid.UUID, user: CurrentUser, db: DB):
    iv = await load(db, user, iid)
    if iv.status == "active":
        iv.status = "abandoned"
        iv.finished_at = utcnow()
        await db.commit()
    return {"status": iv.status}
