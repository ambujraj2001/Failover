# Failover

Learn system design by fixing outages. Every lab hands you a running system that is already on fire.
You redesign it on a live canvas and a traffic simulator grades the design against visible and hidden
tests, inside a budget.

- **24 simulator-graded labs and interview problems**, each with a plain-words brief and an expert brief,
  3 progressive hints, an editorial and a reference solution. Every lab is proven solvable: the starter fails
  and the reference passes (`scripts/verify_content.py`).
- **30-day path**: 6 phases, 57 lessons (plain words + expert view), checkpoints that unlock phases.
- **AI (DeepSeek)**: an on-call mentor inside each lab that sees your canvas and last run, AI design reviews
  of submissions, AI lesson explanations, and a timed mock interviewer that scores you at E4/E5/E6.
- Problem bank, mock interviews, concept library (110), cheat sheet, spaced-repetition flashcards (113),
  study plans, streaks and an activity heatmap.

See [docs/PLAN.md](docs/PLAN.md) for the product and architecture plan and [docs/SIMULATOR.md](docs/SIMULATOR.md)
for how the simulator works.

## Stack

| | |
|---|---|
| `frontend/` | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, Zustand, React Flow (canvas), Recharts, lucide-react icons, Radix primitives |
| `backend/` | FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2, PyJWT, Argon2, httpx (DeepSeek streaming) |
| database | PostgreSQL 16 in Docker |

## Run it locally

Prerequisites: Docker, Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 20.

One command starts everything:

```bash
./dev.sh
```

It checks the tools are installed, starts Docker Desktop if it isn't running, stops anything already on ports
8000/5173 (including a previous `./dev.sh`), starts PostgreSQL and waits until it is healthy, creates
`backend/.env` with a random secret if missing, installs dependencies when needed, runs migrations, then starts
the API and web app and streams both logs. It picks up `DEEPSEEK_API_KEY` from your shell or `~/.zshrc`.
Ctrl+C stops the API and web app; the database keeps running.

```bash
./dev.sh status
```

```bash
./dev.sh stop
```

```bash
./dev.sh reset-db
```

`stop` also stops the database; `reset-db` wipes the local database after asking. Logs are in `.dev/logs/`.
Override ports with `API_PORT=8001 WEB_PORT=5174 ./dev.sh` (the web app proxies to port 8000, so change
`frontend/vite.config.ts` too if you move the API).

Open http://localhost:5173. API docs are at http://localhost:8000/docs in development.

<details>
<summary>Running the pieces by hand</summary>

```bash
docker compose up -d db
```

```bash
cd backend && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

</details>

Full stack in containers (nginx serves the built app on port 8080 and proxies the API):

```bash
docker compose --profile full up --build
```

## Checks

```bash
cd backend && uv run ruff check app scripts tests && uv run pytest -q
```

```bash
cd backend && uv run python scripts/verify_content.py
```

```bash
cd frontend && npm run typecheck && npm run build
```

`pytest` covers the simulator mechanics and the API end to end (auth, refresh-token reuse detection, lockout,
password reset, phase locks, runs and submissions, drafts with optimistic locking, interviews, discussion) against
a throwaway `failover_test` database. Tests never call the AI provider.

## Authentication

Email and password. Passwords are hashed with Argon2 and must be 8–128 characters with a letter and a number.
Short-lived JWT access tokens are kept in memory; a rotating refresh token lives in an httpOnly cookie, and
re-use of a rotated token revokes the whole session family. Five failed sign-ins lock the account for 15 minutes.
Error messages never reveal whether an email is registered. Password reset links are logged by the API (and
shown in the UI) in development; wire up an email provider before production.

## AI cost controls

Every AI call is user-initiated, capped by `max_tokens`, and counted against a per-user daily quota
(`AI_DAILY_LIMIT`, default 40). Lesson explanations are cached in the database. Without `DEEPSEEK_API_KEY`
the app still works: AI panels say they are unavailable and mock interviews are scored from the simulator.

## Production notes

- Set `ENVIRONMENT=production`, a long random `JWT_SECRET`, `COOKIE_SECURE=true`, and your real
  `CORS_ORIGINS` / `FRONTEND_URL`. The API refuses to start in production with the default secret.
- The rate limiter is in-process. With several API workers or hosts, move it to Redis.
- Content lives in `backend/app/content/data/*.yaml`. Run `verify_content.py` after editing any lab.

## Layout

```
backend/
  app/simulator/   catalog, validation, engine, grading
  app/content/     schemas, loader, YAML content (labs, lessons, concepts, flashcards, tracks)
  app/api/routes/  auth, me, content, labs, flashcards, interviews, demo
  app/services/    auth, progress & streaks, spaced repetition, AI, rate limiting
  migrations/      Alembic
frontend/src/
  components/canvas/  React Flow editor, palette, inspector
  components/lab/     lab workspace, results, side tabs
  components/ai/      streaming chat panel
  pages/              landing, auth, dashboard, path, lessons, practice, interviews, reference pages
```
