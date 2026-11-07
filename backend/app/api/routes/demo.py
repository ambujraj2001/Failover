"""Public, sign-in-free demo of one lab for the landing page."""

from functools import lru_cache

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import ContentDep
from app.api.routes.labs import lab_detail
from app.content.loader import get_content
from app.core.errors import AppError
from app.services.ratelimit import limiter
from app.simulator.grading import grade
from app.simulator.models import Design
from app.simulator.validation import DesignInvalid

router = APIRouter(prefix="/demo", tags=["demo"])
DEMO_SLUG = "redirects-melting-the-database"


class DemoRun(BaseModel):
    design: Design


@router.get("/lab")
async def demo_lab(content: ContentDep):
    lab = content.labs[DEMO_SLUG]
    d = lab_detail(lab)
    d["tests"] = [t for t in d["tests"] if not t["hidden"]]
    return d


@router.post("/run", dependencies=[Depends(limiter("demo", 30, 60))])
async def demo_run(body: DemoRun, content: ContentDep):
    lab = content.labs[DEMO_SLUG]
    visible = [t for t in lab.tests if not t.hidden]
    try:
        return grade(body.design, visible, lab.budget, set(lab.palette), only=visible[0].id)
    except DesignInvalid as e:
        raise AppError(e.issues[0], code="invalid_design", status=422, details=e.issues) from e


@lru_cache(maxsize=1)
def _hero() -> dict:
    lab = get_content().labs[DEMO_SLUG]
    visible = [t for t in lab.tests if not t.hidden]
    before = grade(lab.starter, visible, lab.budget, None, only=visible[0].id)["results"][0]
    after = grade(lab.solution, visible, lab.budget, None, only=visible[0].id)["results"][0]
    keep = ("series", "summary", "nodes", "diagnosis", "checks")
    return {"before": {k: before[k] for k in keep}, "after": {k: after[k] for k in keep},
            "starter": lab.starter.model_dump(), "solution": lab.solution.model_dump(), "title": lab.title, "budget": lab.budget}


@router.get("/hero")
async def hero():
    """Pre-computed before/after runs used by the landing page's live canvas."""
    return _hero()
