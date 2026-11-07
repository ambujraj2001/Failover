"""End-to-end API tests against a real PostgreSQL test database.

Requires the docker-compose database. Creates/drops `failover_test`. The AI provider is never called:
AI endpoints are only checked for their disabled/quota behaviour.
"""

from __future__ import annotations

import os
import uuid

import asyncpg
import pytest
import pytest_asyncio

ADMIN_DSN = "postgresql://failover:failover@localhost:5433/postgres"
TEST_DB = "failover_test"
os.environ["DATABASE_URL"] = f"postgresql+asyncpg://failover:failover@localhost:5433/{TEST_DB}"
os.environ["DEEPSEEK_API_KEY"] = ""  # never spend money in tests
os.environ["ENVIRONMENT"] = "test"

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def _db_available() -> bool:
    try:
        conn = await asyncpg.connect(ADMIN_DSN, timeout=2)
        await conn.close()
        return True
    except Exception:  # noqa: BLE001
        return False


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def client():
    if not await _db_available():
        pytest.skip("PostgreSQL (docker compose up -d db) is not running")
    conn = await asyncpg.connect(ADMIN_DSN)
    await conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
    await conn.execute(f"CREATE DATABASE {TEST_DB}")
    await conn.close()

    from httpx import ASGITransport, AsyncClient

    from app.core.db import engine
    from app.main import app
    from app.models import Base

    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac,
    ):
        yield ac
    await engine.dispose()


def _email() -> str:
    return f"user-{uuid.uuid4().hex[:8]}@example.com"


async def _register(client, email=None, password="correct horse 9"):
    email = email or _email()
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": password, "name": "Ada Lovelace",
                                                          "timezone": "Europe/London"})
    return email, r


def _auth(r) -> dict:
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_health(client):
    r = await client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


async def test_register_login_refresh_logout(client):
    email, r = await _register(client)
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email"] == email
    assert "fo_refresh" in r.cookies or any("fo_refresh" in c for c in r.headers.get_list("set-cookie"))

    # duplicate (case-insensitive)
    _, dup = await _register(client, email=email.upper())
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "email_taken"

    bad = await client.post("/api/v1/auth/login", json={"email": email, "password": "wrong password 1"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"
    unknown = await client.post("/api/v1/auth/login", json={"email": _email(), "password": "whatever 1"})
    assert unknown.json()["error"]["message"] == bad.json()["error"]["message"]  # no enumeration

    ok = await client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse 9"})
    assert ok.status_code == 200
    me = await client.get("/api/v1/auth/me", headers=_auth(ok))
    assert me.status_code == 200 and me.json()["timezone"] == "Europe/London"

    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    out = await client.post("/api/v1/auth/logout")
    assert out.status_code == 200


async def test_password_policy(client):
    _, r = await _register(client, password="short")
    assert r.status_code == 422
    _, r = await _register(client, password="onlyletters")
    assert r.status_code == 422


async def test_refresh_token_reuse_revokes_family(client):
    client.cookies.clear()
    _, r = await _register(client)
    old_cookie = client.cookies.get("fo_refresh")
    assert old_cookie
    first = await client.post("/api/v1/auth/refresh")
    assert first.status_code == 200
    # replay the old (rotated) token
    client.cookies.set("fo_refresh", old_cookie, path="/api/v1/auth")
    replay = await client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401 and replay.json()["error"]["code"] == "session_reused"


async def test_lockout_after_failures(client):
    email, _ = await _register(client)
    for _ in range(5):
        await client.post("/api/v1/auth/login", json={"email": email, "password": "nope nope 1"})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse 9"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "account_locked"


async def test_password_reset_flow(client):
    email, _ = await _register(client)
    r = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    link = r.json()["data"]["dev_reset_link"]
    token = link.split("token=")[1]
    weak = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "abc"})
    assert weak.status_code == 422
    ok = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "new password 7"})
    assert ok.status_code == 200
    again = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "another one 8"})
    assert again.status_code == 400  # single use
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "new password 7"})
    assert login.status_code == 200
    missing = await client.post("/api/v1/auth/forgot-password", json={"email": _email()})
    assert missing.status_code == 200 and missing.json()["data"] is None


async def test_protected_routes_require_auth(client):
    r = await client.get("/api/v1/curriculum")
    assert r.status_code == 401
    r = await client.get("/api/v1/curriculum", headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 401


async def test_lab_flow_run_submit_editorial(client):
    _, reg = await _register(client)
    h = _auth(reg)
    lab = (await client.get("/api/v1/labs/redirects-melting-the-database", headers=h)).json()
    assert "solution" not in lab
    assert all("scenario" not in t for t in lab["tests"] if t["hidden"])

    ed = await client.get("/api/v1/labs/redirects-melting-the-database/editorial", headers=h)
    assert ed.status_code == 403

    run = await client.post("/api/v1/labs/redirects-melting-the-database/run", headers=h,
                            json={"design": lab["starter"]})
    assert run.status_code == 200 and run.json()["results"][0]["passed"] is False

    hidden = next(t["id"] for t in lab["tests"] if t["hidden"])
    r = await client.post("/api/v1/labs/redirects-melting-the-database/run", headers=h,
                          json={"design": lab["starter"], "test_id": hidden})
    assert r.status_code == 403

    sub = await client.post("/api/v1/labs/redirects-melting-the-database/submit", headers=h,
                            json={"design": lab["starter"]})
    assert sub.status_code == 200 and sub.json()["passed"] is False
    ed = await client.get("/api/v1/labs/redirects-melting-the-database/editorial", headers=h)
    assert ed.status_code == 200
    solution = ed.json()["solution"]
    win = await client.post("/api/v1/labs/redirects-melting-the-database/submit", headers=h, json={"design": solution})
    assert win.json()["passed"] is True and win.json()["newly_solved"] is True

    subs = await client.get("/api/v1/labs/redirects-melting-the-database/submissions", headers=h)
    assert len(subs.json()) == 2


async def test_invalid_designs_rejected(client):
    _, reg = await _register(client)
    h = _auth(reg)
    url = "/api/v1/labs/redirects-melting-the-database/run"
    loop = {"nodes": [{"id": "u", "type": "users"}, {"id": "a", "type": "app_server"}], "edges": []}
    r = await client.post(url, headers=h, json={"design": {**loop, "nodes": loop["nodes"] + [{"id": "x", "type": "mainframe"}]}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_design"
    r = await client.post(url, headers=h, json={"design": {"nodes": [{"id": "u", "type": "users"},
                                                                     {"id": "c", "type": "cdn"}], "edges": []}})
    assert r.status_code == 422  # CDN is not in this lab's palette
    r = await client.post(url, headers=h, json={"design": {"nodes": [], "edges": []}})
    assert r.status_code == 422


async def test_phase_lock_and_free_roam(client):
    _, reg = await _register(client)
    h = _auth(reg)
    cur = (await client.get("/api/v1/curriculum", headers=h)).json()
    assert cur["phases"][0]["unlocked"] and not cur["phases"][1]["unlocked"]
    r = await client.get("/api/v1/labs/the-viral-spike", headers=h)
    assert r.status_code == 403 and r.json()["error"]["code"] == "locked"
    await client.patch("/api/v1/me", headers=h, json={"free_roam": True})
    r = await client.get("/api/v1/labs/the-viral-spike", headers=h)
    assert r.status_code == 200


async def test_draft_optimistic_lock(client):
    _, reg = await _register(client)
    h = _auth(reg)
    lab = (await client.get("/api/v1/labs/redirects-melting-the-database", headers=h)).json()
    url = "/api/v1/labs/redirects-melting-the-database/draft"
    a = await client.put(url, headers=h, json={"design": lab["starter"], "version": 0})
    assert a.json()["version"] == 1
    stale = await client.put(url, headers=h, json={"design": lab["starter"], "version": 0})
    assert stale.status_code == 409


async def test_lessons_flashcards_streak(client):
    _, reg = await _register(client)
    h = _auth(reg)
    r = await client.post("/api/v1/lessons/requirements-first/complete", headers=h)
    assert r.status_code == 200
    r = await client.post("/api/v1/lessons/requirements-first/complete", headers=h)  # idempotent
    assert r.status_code == 200
    dash = (await client.get("/api/v1/me/dashboard", headers=h)).json()
    assert dash["streak"] == 1 and dash["lessons_done"] == 1
    due = (await client.get("/api/v1/flashcards/due", headers=h)).json()
    assert due["cards"]
    card = due["cards"][0]["id"]
    rv = await client.post(f"/api/v1/flashcards/{card}/review", headers=h, json={"grade": "good"})
    assert rv.status_code == 200 and rv.json()["interval_days"] == 1


async def test_ai_disabled_is_graceful(client):
    _, reg = await _register(client)
    h = _auth(reg)
    r = await client.post("/api/v1/lessons/requirements-first/explain", headers=h, json={"mode": "simpler"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_disabled"


async def test_interview_lifecycle_without_ai(client):
    _, reg = await _register(client)
    h = _auth(reg)
    r = await client.post("/api/v1/interviews", headers=h, json={"problem_slug": "design-url-shortener"})
    assert r.status_code == 201
    iid = r.json()["id"]
    dup = await client.post("/api/v1/interviews", headers=h, json={"problem_slug": "design-chat-app"})
    assert dup.status_code == 409
    fin = await client.post(f"/api/v1/interviews/{iid}/finish", headers=h)
    assert fin.status_code == 200 and fin.json()["status"] == "completed" and fin.json()["verdict"]


async def test_discussion_ownership(client):
    _, a = await _register(client)
    _, b = await _register(client)
    url = "/api/v1/labs/redirects-melting-the-database/discussion"
    p = await client.post(url, headers=_auth(a), json={"body": "Cache-aside worked for me."})
    assert p.status_code == 201
    pid = p.json()["id"]
    r = await client.delete(f"{url}/{pid}", headers=_auth(b))
    assert r.status_code == 403
    r = await client.delete(f"{url}/{pid}", headers=_auth(a))
    assert r.status_code == 200


async def test_demo_is_public(client):
    lab = (await client.get("/api/v1/demo/lab")).json()
    assert all(not t["hidden"] for t in lab["tests"])
    r = await client.post("/api/v1/demo/run", json={"design": lab["starter"]})
    assert r.status_code == 200
    hero = await client.get("/api/v1/demo/hero")
    assert hero.status_code == 200 and hero.json()["before"]["series"]
