import uuid
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select

from app.api.deps import DB, ContentDep, CurrentUser
from app.content.schema import Lab
from app.core.db import SessionLocal, utcnow
from app.core.errors import AppError, Conflict, Forbidden, NotFound
from app.models import DiscussionPost, LabProgress, MentorMessage, Submission, User
from app.schemas import ChatIn, DraftIn, PostEditIn, PostIn, RunIn, SubmitIn
from app.services import ai
from app.services.progress import (
    ensure_lab_unlocked,
    learner_state,
    phase_of_lab,
    touch_activity,
    unlocked_phases,
)
from app.services.ratelimit import limit
from app.simulator.grading import grade
from app.simulator.models import Design
from app.simulator.validation import DesignInvalid

router = APIRouter(prefix="/labs", tags=["labs"])


# ---- serialisation -----------------------------------------------------------------------------

def public_test(t, index: int) -> dict[str, Any]:
    if t.hidden:
        return {"id": t.id, "name": f"Hidden test {index}", "hidden": True,
                "summary": "Runs when you submit. Revealed if it fails."}
    sc = t.scenario
    return {"id": t.id, "name": t.name, "hidden": False, "summary": t.summary,
            "assertions": [a.model_dump() for a in t.assertions],
            "scenario": {"base_rps": sc.base_rps, "read_ratio": sc.read_ratio, "duration": sc.duration,
                         "spikes": [s.model_dump() for s in sc.spikes],
                         "events": [e.model_dump() for e in sc.events]}}


def lab_card(lab: Lab, lp: LabProgress | None, phase: str | None, unlocked: bool) -> dict[str, Any]:
    return {"slug": lab.slug, "kind": lab.kind, "title": lab.title, "difficulty": lab.difficulty, "day": lab.day,
            "phase": phase, "summary": lab.summary, "topics": lab.topics, "company_tags": lab.company_tags,
            "checkpoint": lab.checkpoint, "estimated_minutes": lab.estimated_minutes, "unlocked": unlocked,
            "solved": bool(lp and lp.solved_at), "attempts": lp.attempts if lp else 0,
            "best_cost": lp.best_cost if lp else None, "budget": lab.budget}


def lab_detail(lab: Lab) -> dict[str, Any]:
    hidden_i = 0
    tests = []
    for t in lab.tests:
        if t.hidden:
            hidden_i += 1
        tests.append(public_test(t, hidden_i + 1 if t.hidden else 0))
    return {
        "slug": lab.slug, "kind": lab.kind, "title": lab.title, "difficulty": lab.difficulty, "day": lab.day,
        "checkpoint": lab.checkpoint, "summary": lab.summary, "topics": lab.topics, "company_tags": lab.company_tags,
        "estimated_minutes": lab.estimated_minutes, "incident": lab.incident,
        "brief_beginner": lab.brief_beginner, "brief_expert": lab.brief_expert,
        "glossary": [g.model_dump() for g in lab.glossary], "requirements": lab.requirements,
        "budget": lab.budget, "palette": lab.palette, "starter": lab.starter.model_dump(), "tests": tests,
        "hint_count": len(lab.hints), "design_prompt": lab.design_prompt,
    }


def get_lab(content, slug: str) -> Lab:
    lab = content.labs.get(slug)
    if not lab:
        raise NotFound("Lab not found.")
    return lab


async def progress_row(db, user: User, slug: str, lock: bool = False) -> LabProgress:
    stmt = select(LabProgress).where(LabProgress.user_id == user.id, LabProgress.lab_slug == slug)
    if lock:
        stmt = stmt.with_for_update()
    lp = await db.scalar(stmt)
    if not lp:
        lp = LabProgress(user_id=user.id, lab_slug=slug, hints_revealed=0, runs=0, attempts=0, draft_version=0)
        db.add(lp)
        await db.flush()
    return lp


def _grade(lab: Lab, design, only: str | None = None) -> dict[str, Any]:
    try:
        return grade(design, lab.tests, lab.budget, set(lab.palette), only=only)
    except DesignInvalid as e:
        raise AppError(e.issues[0], code="invalid_design", status=422, details=e.issues) from e


def compact(result: dict[str, Any]) -> dict[str, Any]:
    """Strip bulky per-tick data before persisting a submission."""
    out = {**result, "results": []}
    for r in result["results"]:
        r2 = {k: v for k, v in r.items() if k not in ("series",)}
        if "logs" in r2:
            r2["logs"] = r2["logs"][:60]
        out["results"].append(r2)
    return out


# ---- endpoints ---------------------------------------------------------------------------------

@router.get("")
async def list_labs(user: CurrentUser, db: DB, content: ContentDep,
                    kind: str | None = Query(default=None, pattern="^(lab|problem)$")):
    _, labs = await learner_state(db, user)
    solved = {s for s, lp in labs.items() if lp.solved_at}
    unlocked = unlocked_phases(content, user, solved)
    out = []
    for lab in sorted(content.labs.values(), key=lambda x: (x.day or 99, x.slug)):
        if kind and lab.kind != kind:
            continue
        phase = phase_of_lab(content, lab.slug)
        ok = lab.kind == "problem" or unlocked.get(phase or "", True)
        out.append(lab_card(lab, labs.get(lab.slug), phase, ok))
    return out


@router.get("/{slug}")
async def lab_get(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    _, labs = await learner_state(db, user)
    ensure_lab_unlocked(content, user, slug, {s for s, lp in labs.items() if lp.solved_at})
    lp = labs.get(slug)
    return {
        **lab_detail(lab),
        "phase": phase_of_lab(content, slug),
        "progress": {
            "solved": bool(lp and lp.solved_at), "attempts": lp.attempts if lp else 0, "runs": lp.runs if lp else 0,
            "hints_revealed": lp.hints_revealed if lp else 0, "best_cost": lp.best_cost if lp else None,
            "editorial_unlocked": bool(lp and (lp.attempts or lp.solved_at)),
        },
        "draft": ({"design": lp.draft, "design_note": lp.design_note, "version": lp.draft_version}
                  if lp and (lp.draft or lp.design_note) else None),
    }


@router.put("/{slug}/draft")
async def save_draft(slug: str, body: DraftIn, user: CurrentUser, db: DB, content: ContentDep):
    get_lab(content, slug)
    lp = await progress_row(db, user, slug, lock=True)
    if body.version is not None and body.version < lp.draft_version:
        raise Conflict("This lab was changed in another tab. Reload to get the latest version.",
                       code="draft_conflict", details={"version": lp.draft_version})
    lp.draft = body.design.model_dump()
    if body.design_note is not None:
        lp.design_note = body.design_note
    lp.draft_version += 1
    await db.commit()
    return {"version": lp.draft_version, "saved_at": utcnow()}


@router.delete("/{slug}/draft")
async def reset_draft(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    get_lab(content, slug)
    lp = await progress_row(db, user, slug, lock=True)
    lp.draft = None
    lp.draft_version += 1
    await db.commit()
    return {"version": lp.draft_version}


@router.post("/{slug}/run")
async def run(slug: str, body: RunIn, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    limit(f"run:{user.id}", 60, 60)
    _, labs = await learner_state(db, user)
    ensure_lab_unlocked(content, user, slug, {s for s, lp in labs.items() if lp.solved_at})
    visible = [t for t in lab.tests if not t.hidden]
    test_id = body.test_id or visible[0].id
    test = next((t for t in lab.tests if t.id == test_id), None)
    if not test:
        raise NotFound("Unknown test case.")
    if test.hidden:
        raise Forbidden("Hidden tests only run when you submit.", code="hidden_test")
    result = _grade(lab, body.design, only=test_id)
    lp = await progress_row(db, user, slug)
    lp.runs += 1
    await touch_activity(db, user)
    await db.commit()
    return result


@router.post("/{slug}/submit")
async def submit(slug: str, body: SubmitIn, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    limit(f"submit:{user.id}", 20, 60)
    _, labs = await learner_state(db, user)
    solved_before = {s for s, lp in labs.items() if lp.solved_at}
    ensure_lab_unlocked(content, user, slug, solved_before)
    if lab.kind == "problem" and lab.design_prompt and body.design_note and len(body.design_note) > 12000:
        raise AppError("Design note is too long.", status=422)
    result = _grade(lab, body.design)
    lp = await progress_row(db, user, slug, lock=True)
    lp.attempts += 1
    newly_solved = False
    if result["passed"]:
        if not lp.solved_at:
            lp.solved_at = utcnow()
            newly_solved = True
        lp.best_cost = min(lp.best_cost or result["cost_per_hr"], result["cost_per_hr"])
    if body.design_note is not None:
        lp.design_note = body.design_note
    lp.draft = body.design.model_dump()
    sub = Submission(user_id=user.id, lab_slug=slug, design=body.design.model_dump(), design_note=body.design_note,
                     passed=result["passed"], cost=result["cost_per_hr"], result=compact(result))
    db.add(sub)
    await touch_activity(db, user)
    await db.flush()
    unlocked_phase = None
    if newly_solved and lab.checkpoint:
        before = unlocked_phases(content, user, solved_before)
        after = unlocked_phases(content, user, solved_before | {slug})
        unlocked_phase = next((p for p in after if after[p] and not before[p]), None)
    await db.commit()
    return {**result, "submission_id": str(sub.id), "newly_solved": newly_solved, "unlocked_phase": unlocked_phase,
            "attempts": lp.attempts}


@router.get("/{slug}/submissions")
async def submissions(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    get_lab(content, slug)
    rows = (await db.scalars(select(Submission).where(Submission.user_id == user.id, Submission.lab_slug == slug)
                             .order_by(Submission.created_at.desc()).limit(30))).all()
    return [{"id": str(s.id), "created_at": s.created_at, "passed": s.passed, "cost": s.cost,
             "tests_passed": sum(1 for r in s.result.get("results", []) if r.get("passed")),
             "tests_total": len(s.result.get("results", [])), "has_review": bool(s.review)} for s in rows]


@router.get("/{slug}/submissions/{sid}")
async def submission_detail(slug: str, sid: uuid.UUID, user: CurrentUser, db: DB):
    s = await db.get(Submission, sid)
    if not s or s.user_id != user.id or s.lab_slug != slug:
        raise NotFound("Submission not found.")
    return {"id": str(s.id), "created_at": s.created_at, "passed": s.passed, "cost": s.cost, "design": s.design,
            "design_note": s.design_note, "result": s.result, "review": s.review}


@router.get("/{slug}/hints")
async def hints(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    lp = await db.scalar(select(LabProgress).where(LabProgress.user_id == user.id, LabProgress.lab_slug == slug))
    n = lp.hints_revealed if lp else 0
    return {"total": len(lab.hints), "revealed": lab.hints[:n]}


@router.post("/{slug}/hints/reveal")
async def reveal_hint(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    lp = await progress_row(db, user, slug, lock=True)
    lp.hints_revealed = min(len(lab.hints), lp.hints_revealed + 1)
    await db.commit()
    return {"total": len(lab.hints), "revealed": lab.hints[:lp.hints_revealed]}


@router.get("/{slug}/editorial")
async def editorial(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    lp = await db.scalar(select(LabProgress).where(LabProgress.user_id == user.id, LabProgress.lab_slug == slug))
    if not lp or not (lp.attempts or lp.solved_at):
        raise Forbidden("Submit at least once to unlock the editorial.", code="editorial_locked")
    return {"editorial": lab.editorial, "solution": lab.solution.model_dump()}


# ---- discussion --------------------------------------------------------------------------------

def _post_out(p: DiscussionPost, author: str, me: User) -> dict[str, Any]:
    deleted = p.deleted_at is not None
    return {"id": str(p.id), "parent_id": str(p.parent_id) if p.parent_id else None,
            "body": "" if deleted else p.body, "deleted": deleted, "author": "deleted" if deleted else author,
            "mine": p.user_id == me.id, "created_at": p.created_at, "edited_at": p.edited_at}


@router.get("/{slug}/discussion")
async def discussion(slug: str, user: CurrentUser, db: DB, content: ContentDep,
                     limit_: int = Query(default=30, alias="limit", le=100)):
    get_lab(content, slug)
    stmt = (select(DiscussionPost, User.name).join(User, User.id == DiscussionPost.user_id)
            .where(DiscussionPost.lab_slug == slug, DiscussionPost.parent_id.is_(None))
            .order_by(DiscussionPost.created_at.desc()).limit(limit_))
    roots = (await db.execute(stmt)).all()
    ids = [p.id for p, _ in roots]
    replies = (await db.execute(select(DiscussionPost, User.name).join(User, User.id == DiscussionPost.user_id)
                                .where(DiscussionPost.parent_id.in_(ids)).order_by(DiscussionPost.created_at)
                                )).all() if ids else []
    by_parent: dict[uuid.UUID, list] = {}
    for p, name in replies:
        by_parent.setdefault(p.parent_id, []).append(_post_out(p, name, user))
    total = await db.scalar(select(func.count()).select_from(DiscussionPost).where(DiscussionPost.lab_slug == slug))
    out = []
    for p, name in roots:
        item = _post_out(p, name, user)
        item["replies"] = by_parent.get(p.id, [])
        if item["deleted"] and not item["replies"]:
            continue
        out.append(item)
    return {"posts": out, "total": total}


@router.post("/{slug}/discussion", status_code=201)
async def create_post(slug: str, body: PostIn, user: CurrentUser, db: DB, content: ContentDep):
    get_lab(content, slug)
    limit(f"post:{user.id}", 10, 300)
    if body.parent_id:
        parent = await db.get(DiscussionPost, body.parent_id)
        if not parent or parent.lab_slug != slug or parent.deleted_at:
            raise NotFound("The comment you are replying to no longer exists.")
        if parent.parent_id:  # keep threads one level deep
            body.parent_id = parent.parent_id
    p = DiscussionPost(lab_slug=slug, user_id=user.id, parent_id=body.parent_id, body=body.body)
    db.add(p)
    await db.commit()
    return {**_post_out(p, user.name, user), "replies": []}


@router.patch("/{slug}/discussion/{pid}")
async def edit_post(slug: str, pid: uuid.UUID, body: PostEditIn, user: CurrentUser, db: DB):
    p = await db.get(DiscussionPost, pid)
    if not p or p.lab_slug != slug or p.deleted_at:
        raise NotFound("Comment not found.")
    if p.user_id != user.id:
        raise Forbidden("You can only edit your own comments.")
    text = body.body.strip()
    if not text:
        raise AppError("Write something first.", status=422)
    p.body = text
    p.edited_at = utcnow()
    await db.commit()
    return _post_out(p, user.name, user)


@router.delete("/{slug}/discussion/{pid}")
async def delete_post(slug: str, pid: uuid.UUID, user: CurrentUser, db: DB):
    p = await db.get(DiscussionPost, pid)
    if not p or p.lab_slug != slug:
        raise NotFound("Comment not found.")
    if p.user_id != user.id:
        raise Forbidden("You can only delete your own comments.")
    p.deleted_at = utcnow()
    await db.commit()
    return {"deleted": True}


# ---- AI mentor ---------------------------------------------------------------------------------

def mentor_system(lab: Lab, user: User, design_text: str, run_text: str, hints_revealed: int) -> str:
    return (
        "You are the on-call mentor inside Failover, a system design lab. The learner is fixing a broken "
        "architecture on a canvas; a simulator grades it against visible and hidden tests within a budget.\n"
        f"{ai.LEVEL_STYLE[user.level]}\n"
        "Coach, don't solve: point at evidence in the run (which component saturated, numbers, failure reasons), ask "
        "one guiding question, and suggest the next experiment. Only give the full answer if the learner explicitly "
        "asks for it, and then explain why it works. Never reveal or guess hidden test scenarios. Never claim a "
        "design will pass. Use the component and setting names the canvas uses. Keep replies under 160 words, "
        "markdown, no emoji, no greetings.\n\n"
        f"LAB: {lab.title} ({lab.difficulty})\nINCIDENT: {lab.incident}\n\nBRIEF:\n{lab.brief_expert}\n\n"
        f"REQUIREMENTS: {'; '.join(lab.requirements)}\nBUDGET: ${lab.budget}/hr\n"
        f"AVAILABLE COMPONENTS: {', '.join(lab.palette)}\nHINTS ALREADY REVEALED: {hints_revealed} of {len(lab.hints)}\n\n"
        f"CURRENT DESIGN:\n{design_text}\n\nLATEST RUN OF THE VISIBLE TEST:\n{run_text}"
    )


@router.get("/{slug}/mentor")
async def mentor_history(slug: str, user: CurrentUser, db: DB, content: ContentDep):
    get_lab(content, slug)
    rows = (await db.scalars(select(MentorMessage).where(MentorMessage.user_id == user.id,
                                                         MentorMessage.lab_slug == slug)
                             .order_by(MentorMessage.created_at.desc()).limit(50))).all()
    return [{"id": str(m.id), "role": m.role, "content": m.content, "created_at": m.created_at}
            for m in reversed(rows)]


@router.delete("/{slug}/mentor")
async def mentor_clear(slug: str, user: CurrentUser, db: DB):
    await db.execute(delete(MentorMessage).where(MentorMessage.user_id == user.id, MentorMessage.lab_slug == slug))
    await db.commit()
    return {"cleared": True}


@router.post("/{slug}/mentor")
async def mentor(slug: str, body: ChatIn, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    limit(f"mentor:{user.id}", 12, 60)
    await ai.check_quota(db, user)
    lp = await db.scalar(select(LabProgress).where(LabProgress.user_id == user.id, LabProgress.lab_slug == slug))
    if body.design:
        design = body.design
    elif lp and lp.draft:
        design = Design.model_validate(lp.draft)
    else:
        design = lab.starter
    try:
        run_result = grade(design, lab.tests, lab.budget, set(lab.palette),
                           only=next(t.id for t in lab.tests if not t.hidden))
        run_text = ai.describe_run(run_result)
    except DesignInvalid as e:
        run_text = "The design is invalid: " + "; ".join(e.issues)
    history = (await db.scalars(select(MentorMessage).where(MentorMessage.user_id == user.id,
                                                            MentorMessage.lab_slug == slug)
                                .order_by(MentorMessage.created_at.desc()).limit(8))).all()
    messages = [{"role": "system", "content": mentor_system(lab, user, ai.describe_design(design), run_text,
                                                            lp.hints_revealed if lp else 0)}]
    messages += [{"role": m.role, "content": m.content} for m in reversed(history)]
    messages.append({"role": "user", "content": body.message})
    db.add(MentorMessage(user_id=user.id, lab_slug=slug, role="user", content=body.message))
    await ai.record_usage(db, user)
    await db.commit()
    user_id = user.id

    async def gen():
        parts: list[str] = []
        try:
            async for delta in ai.stream(messages, max_tokens=450, temperature=0.4):
                parts.append(delta)
                yield ai.sse({"delta": delta})
        except AppError as e:
            yield ai.sse({"error": e.message})
            return
        text = "".join(parts).strip()
        if text:
            async with SessionLocal() as s2:
                s2.add(MentorMessage(user_id=user_id, lab_slug=slug, role="assistant", content=text))
                await s2.commit()
        yield ai.sse({"done": True})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{slug}/submissions/{sid}/review")
async def review(slug: str, sid: uuid.UUID, user: CurrentUser, db: DB, content: ContentDep):
    lab = get_lab(content, slug)
    s = await db.get(Submission, sid)
    if not s or s.user_id != user.id or s.lab_slug != slug:
        raise NotFound("Submission not found.")
    if s.review:
        return {"review": s.review, "cached": True}
    limit(f"review:{user.id}", 6, 60)
    await ai.check_quota(db, user)
    written = ""
    if lab.design_prompt:
        written = (f"\n\nWRITTEN DESIGN QUESTIONS:\n{lab.design_prompt}\n\nLEARNER'S WRITTEN ANSWERS:\n"
                   f"{(s.design_note or '(none provided)')[:6000]}")
    system = ("You are a staff engineer reviewing a learner's system design submission on Failover. "
              f"{ai.LEVEL_STYLE[user.level]} Be specific to this design and these numbers. Markdown with these "
              "sections: **Verdict** (one line), **What works**, **What breaks next** (the next failure under growth "
              "or chaos), **Cost** (where money is wasted or well spent)" +
              (", **Written answers** (grade each answer briefly, note gaps an interviewer would probe)"
               if lab.design_prompt else "") +
              ", **Study next** (one concept). Under 380 words. No emoji. Don't reveal hidden test scenarios that "
              "passed.")
    prompt = (f"LAB: {lab.title}\nBRIEF:\n{lab.brief_expert}\nREQUIREMENTS: {'; '.join(lab.requirements)}\n"
              f"BUDGET: ${lab.budget}/hr\n\nREFERENCE EDITORIAL (for your judgement, don't copy it):\n"
              f"{lab.editorial[:3000]}\n\nSUBMITTED DESIGN:\n{ai.describe_design(s.design)}\n\nRESULTS "
              f"({'PASSED' if s.passed else 'FAILED'}):\n{ai.describe_run(s.result)}{written}")
    text, tokens = await ai.complete([{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                                     max_tokens=800, temperature=0.3)
    s.review = text
    await ai.record_usage(db, user, tokens)
    await db.commit()
    return {"review": text, "cached": False}
