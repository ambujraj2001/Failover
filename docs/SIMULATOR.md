# Simulator reference (for lab authors)

Source of truth: `backend/app/simulator/` (catalog.py, engine.py, models.py). This page summarises it.
Always run `uv run python scripts/verify_content.py <slug>` from `backend/` after editing a lab.

## Request model
Each tick (1 s) Users emit `base_rps × spike multiplier` requests, split into:
* `static` = share `static_ratio` (images/JS). Goes to a CDN if Users → CDN exists (95% served at edge).
* dynamic = the rest: `read` (share `read_ratio`; of those, `cacheable` can be cached, the rest skip the cache)
  and `write`.
* `bot` = `bot_ratio × rps` + any `bot_wave` events. Uncacheable reads. Bot failures are **not** counted in
  error rate, but bots consume capacity. Only LB rate limiting blocks them.

Error rate, latency and stale reads are measured over legitimate requests only.

## Components and their capacity
| type | capacity / behaviour | cost $/hr |
|---|---|---|
| `users` | source, exactly one | – |
| `cdn` | serves 95% of static at edge (6 ms); forwards dynamic to its LB/app child | 0.05 + usage |
| `load_balancer` | 100k rps; splits across app servers by capacity; `health_checks` (stop routing to dead instances after 3 s); `rate_limit` + `rate_limit_rps` 10/50/200 → bot blocked 99%/97%/80%, legit blocked 3%/0.2%/0% | 0.025 + usage |
| `app_server` | per instance rps: small 250, medium 500, large 1000, xlarge 2000 (÷ `app_work`). Work units: read 1, write 1.3, static 0.25. Threads: 64/128/256/512 per instance → in-flight limit = rps × latency (Little's law). Base 8 ms. Knobs: instances, autoscaling (target 60% CPU, +instances every 5 s, boot 20 s, up to max_instances), timeout_ms, retries, circuit_breaker | 0.04 / 0.085 / 0.17 / 0.34 per instance |
| `cache` (Redis) | 80k ops/s per node, 0.8 ms. Hit ratio = 0.985 × coverage^0.35 × ttl/(ttl+3), coverage = min(1, memory×nodes×0.8 / working_set_gb). Cold start warms with τ = 8 s. `stampede_protection` cuts miss traffic to the DB up to 75% while cold. `invalidate_on_write: false` → stale reads | 1GB .03, 4GB .06, 16GB .22, 32GB .44, 64GB .88 per node |
| `database` (PostgreSQL) | indexed point qps per node: small 600, medium 1500, large 3500, xlarge 8000. Read costs 1 unit (15 if `scenario.query_column` is not in `indexes`); write costs 1.5. Reads spread over primary + `replicas`; writes only on primary. `shards` split load; hottest shard share = hot_key_share + (1−hot)/N for `hash_user`, 1/N for `hash_split_hot`; `range_time` sends all writes to one shard. Async replicas → ~1% stale reads (more when primary > 70%); sync replicas → +3 ms writes, no stale. `failover` + ≥1 replica → 12 s outage on primary death instead of permanent. Queue timeout 5 s. | per node: .09/.18/.36/.72 × (1+replicas) × shards (+0.03 storage per shard) |
| `queue` | 5k msg/s per partition, writes acked in 2 ms; drained by workers at worker capacity; DB-rejected async writes are re-queued; >2M backlog → lost writes | 0.04 + 0.01/partition |
| `worker` | per instance like app_server ÷ 1.3 (writes); forwards to its database | like app_server |
| `object_storage` | infinite, 25 ms | 0.02 |

Allowed edges: users→{cdn, load_balancer, app_server}; cdn→{load_balancer, app_server, object_storage};
load_balancer→app_server; app_server→{cache, database, queue, object_storage}; cache→database (read-through);
queue→worker; worker→{database, cache}. No cycles. App → cache **and** app → database = cache-aside.
App servers wired directly from Users (no LB) only use 1 instance.

## Scenario fields (`tests[].scenario`)
`duration` (10–180, default 60), `base_rps`, `spikes: [{at, duration, multiplier, ramp}]`, `read_ratio`,
`static_ratio`, `bot_ratio`, `cacheable`, `hot_key_share`, `working_set_gb`, `query_column`, `app_work`,
`cold_cache`, `events: [{at, type, count, duration, ratio, label}]`.

Event types: `kill_db_primary`, `kill_app_instance` (count), `cache_flush`, `ttl_expiry_wave` (hit ratio drops
to 15% then recovers with τ=4 s), `bot_wave` (adds `ratio × base_rps` bot traffic for `duration` s).

## Metrics for assertions
`p99_ms`, `p50_ms`, `error_rate` (%), `cost_per_hr`, `stale_read_rate` (%), `queue_lag_s`, `write_loss_rate` (%).
Budget is checked separately on submit (lab `budget`).

## Rules for a good lab
1. The starter must fail the visible test for the reason the lab teaches.
2. The reference solution must pass every test within budget, with some margin (aim for 10–20% headroom on
   each threshold, so near-miss alternative answers also pass).
3. Hidden tests probe the next thing that breaks (spike, cold cache, dead node), and the hints/editorial
   prepare the learner for them.
4. The budget should rule out the lazy fix (just buy the biggest box) where the lab is about a smarter fix.
5. Brief for beginners uses an everyday framing and defines terms; the expert brief states the workload
   numerically and names the trade-offs.
