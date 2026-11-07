# Failover — product & architecture plan

Failover teaches system design by breaking running systems and asking the learner to fix them on a
live canvas. A traffic simulator grades each design against visible and hidden test cases, inside a budget.

## 1. Product surface

| Area | What it does |
|---|---|
| Landing | Hero with a live replay of the simulator, interactive demo lab (no sign-in), roadmap, feature grid, how a lab works, mastery areas, interview mode, problem bank, CTA |
| Auth | Email + password sign-up / sign-in, refresh-token rotation (httpOnly cookie), sign-out, change password, forgot / reset password (dev: link logged by the API), delete account, login lockout after repeated failures |
| Onboarding | Experience level (new / working engineer / senior) and target bar (E4/E5/E6), optional study track |
| Dashboard | Day N of 30, streak, activity heatmap, next item, cards due, solved labs |
| 30-day path | 6 phases → 30 days → lessons + labs. A checkpoint lab ends each phase and unlocks the next (or "free roam" in settings) |
| Lessons | Authored markdown, each with a plain-language and an expert framing; "Explain it another way" uses AI (cached) |
| Lab workspace | Description (beginner / expert brief), hints (progressive), editorial (unlocked after an attempt), submissions, discussion; component palette; React Flow canvas; inspector with real knobs; Run (visible test) / Submit (all tests incl. hidden); results with charts, failure reasons, bottleneck call-out, logs; budget meter; draft autosave |
| AI mentor | Per-lab chat that sees the problem, the current design and the last run. Socratic by default; adapts to the learner's level |
| AI review | After a submission: design review — what's good, what will break next, cost notes |
| Problem bank | Classic interview problems graded by simulation + a written design note reviewed by AI |
| Mock interviews | 45-minute timer, AI interviewer, mid-design twist, canvas graded by the simulator, scored on 4 axes against the chosen bar |
| Concept library | Search every concept, jump to its lesson |
| Cheat sheet | Latency numbers, capacity formulas, availability table |
| Flashcards | SM-2 spaced repetition, per-user schedule |
| Study plans | Meta / Google / Amazon / 2-week crash orderings |

## 2. Simulator (single source of truth, Python, server-side)

* Discrete 1-second ticks over a scenario timeline (base RPS, spikes, events).
* Request classes: `read`, `write`, `static`, plus bot traffic.
* Components: Users, CDN, Load Balancer (rate limiting, health checks), App Server (instances, size,
  autoscaling, timeout, retries, circuit breaker), Redis (memory, TTL, stampede protection),
  PostgreSQL (size, index, replicas, sync/async, failover, shards, shard key), Queue, Worker, Object Storage.
* Per node: utilisation, M/M/1-style queueing latency, backlog, timeouts → drops.
* Events: kill DB primary, kill app instance, flush cache, traffic spike, bot wave.
* Output: per-tick series (RPS, p50, p99, errors, per-node load), summary, failure reasons, logs, cost,
  stale reads, bottleneck diagnosis.
* Hidden tests run only on Submit and stay server-side; a failing hidden test is revealed.
* Every authored lab ships a reference solution; `scripts/verify_labs.py` asserts the starter fails and the solution passes.

## 3. Architecture

```
frontend/  React 18 + TypeScript + Vite, Tailwind, React Router, TanStack Query, Zustand,
           @xyflow/react (canvas), Recharts, lucide-react icons, Radix primitives, sonner
backend/   FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, pydantic-settings, PyJWT, argon2,
           httpx (DeepSeek, OpenAI-compatible, streaming SSE)
db         PostgreSQL 16 in Docker (docker-compose.yml)
```

Backend layout: `app/core` (config, security, db, errors) · `app/models` · `app/schemas` ·
`app/api/routes` · `app/services` (auth, progress, ai, srs) · `app/simulator` · `app/content`.

### Cost protection for AI
* Daily per-user AI quota (configurable), `max_tokens` caps, short context windows, lesson explanations cached in DB.
* The AI is never called during tests or seeding.

## 4. Edge cases handled
Case-insensitive unique emails, password policy, lockout + generic auth errors (no user enumeration),
refresh-token reuse detection (revokes the family), token versioning on password change, expired/used reset
tokens, invalid / cyclic / disconnected designs, unknown component types, out-of-range knobs, designs over budget,
oversized payloads, concurrent draft saves, locked phases, deleted discussion posts, mock interview timeouts,
abandoned interviews, AI provider down / quota exceeded / missing key (graceful UI message), rate limit on the public demo.
