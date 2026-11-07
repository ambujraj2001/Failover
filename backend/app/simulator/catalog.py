"""Component catalog: what can be placed on the canvas, its knobs, capacity and price.

Numbers are deliberately close to real cloud pricing / throughput so the intuition transfers,
but they are rounded so learners can do the capacity math in their head.
"""

from __future__ import annotations

from typing import Any, Literal

ComponentType = Literal[
    "users", "cdn", "load_balancer", "app_server", "cache", "database", "queue", "worker", "object_storage"
]

COMPONENT_TYPES: tuple[str, ...] = (
    "users", "cdn", "load_balancer", "app_server", "cache", "database", "queue", "worker", "object_storage",
)

# ---- sizing tables ---------------------------------------------------------------------------

APP_SIZES: dict[str, dict[str, float]] = {
    # rps of "unit work" one instance can serve, worker threads, $/hr
    "small": {"rps": 250, "threads": 64, "cost": 0.04, "label": "small · 1 vCPU"},
    "medium": {"rps": 500, "threads": 128, "cost": 0.085, "label": "medium · 2 vCPU"},
    "large": {"rps": 1000, "threads": 256, "cost": 0.17, "label": "large · 4 vCPU"},
    "xlarge": {"rps": 2000, "threads": 512, "cost": 0.34, "label": "xlarge · 8 vCPU"},
}

DB_SIZES: dict[str, dict[str, float]] = {
    # indexed point queries per second one node can serve, $/hr per node
    "small": {"qps": 600, "cost": 0.09, "label": "small · 2 vCPU"},
    "medium": {"qps": 1500, "cost": 0.18, "label": "medium · 4 vCPU"},
    "large": {"qps": 3500, "cost": 0.36, "label": "large · 8 vCPU"},
    "xlarge": {"qps": 8000, "cost": 0.72, "label": "xlarge · 16 vCPU"},
}

CACHE_MEMORY: dict[str, float] = {"1": 0.03, "4": 0.06, "16": 0.22, "32": 0.44, "64": 0.88}  # GB → $/hr/node

RATE_LIMITS: dict[str, dict[str, float]] = {
    # per-client limit → share of abusive traffic blocked, share of legitimate traffic wrongly blocked
    "10": {"bot_block": 0.99, "legit_block": 0.03},
    "50": {"bot_block": 0.97, "legit_block": 0.002},
    "200": {"bot_block": 0.80, "legit_block": 0.0},
}

SHARD_KEYS = {
    "hash_user": "user_id (hash)",
    "range_time": "created_at (range)",
    "hash_split_hot": "hash + split hot keys",
}

# ---- knob definitions (drive both validation and the inspector UI) ----------------------------


def _select(key: str, label: str, options: list[tuple[str, str]], default: str, help: str, group: str) -> dict:
    return {"key": key, "label": label, "kind": "select", "options": [{"value": v, "label": lbl} for v, lbl in options],
            "default": default, "help": help, "group": group}


def _int(key: str, label: str, lo: int, hi: int, default: int, help: str, group: str, unit: str = "") -> dict:
    return {"key": key, "label": label, "kind": "int", "min": lo, "max": hi, "default": default, "help": help,
            "group": group, "unit": unit}


def _bool(key: str, label: str, default: bool, help: str, group: str) -> dict:
    return {"key": key, "label": label, "kind": "bool", "default": default, "help": help, "group": group}


def _text(key: str, label: str, default: str, help: str, group: str) -> dict:
    return {"key": key, "label": label, "kind": "text", "default": default, "help": help, "group": group}


SIZE_OPTS_APP = [(k, v["label"]) for k, v in APP_SIZES.items()]
SIZE_OPTS_DB = [(k, v["label"]) for k, v in DB_SIZES.items()]

CATALOG: dict[str, dict[str, Any]] = {
    "users": {
        "label": "Users",
        "category": "source",
        "summary": "Traffic from the scenario: browsers and mobile apps.",
        "description": "Where requests come from. The test case decides how many, what mix of reads and writes, "
                       "and what goes wrong.",
        "knobs": [],
    },
    "cdn": {
        "label": "CDN",
        "category": "edge",
        "summary": "Serves images, JS and video from the edge.",
        "description": "A content delivery network caches static files in hundreds of locations near users. "
                       "About 95% of static requests never reach your servers.",
        "knobs": [],
    },
    "load_balancer": {
        "label": "Load Balancer",
        "category": "routing",
        "summary": "Spreads requests across app servers.",
        "description": "An L7 load balancer. Splits traffic across every app server behind it, removes dead "
                       "instances when health checks are on, and can rate-limit abusive clients.",
        "knobs": [
            _bool("health_checks", "Health checks", True,
                  "Stop sending traffic to instances that fail a health probe (detected in ~3 s).", "Resilience"),
            _bool("rate_limit", "Rate limiting", False,
                  "Cap requests per client IP. Stops floods, but a limit that is too tight blocks real users.",
                  "Protection"),
            _select("rate_limit_rps", "Limit per client", [("10", "10 req/s"), ("50", "50 req/s"),
                                                            ("200", "200 req/s")], "50",
                    "Normal users send 1-5 req/s in bursts. Bots send hundreds.", "Protection"),
        ],
    },
    "app_server": {
        "label": "App Server",
        "category": "compute",
        "summary": "Your stateless API service.",
        "description": "Runs your business logic. Stateless, so you can add instances behind a load balancer. "
                       "Each instance has a fixed amount of CPU and a fixed number of worker threads.",
        "knobs": [
            _select("size", "Instance size", SIZE_OPTS_APP, "medium",
                    "Vertical scaling: more CPU per instance. Capacity doubles each step, so does price.",
                    "Capacity"),
            _int("instances", "Instances", 1, 40, 2,
                 "Horizontal scaling. Needs a load balancer in front when there is more than one.", "Capacity"),
            _bool("autoscaling", "Autoscaling", False,
                  "Add instances when CPU passes 60%. New instances take ~20 s to boot.", "Capacity"),
            _int("max_instances", "Autoscaling max", 1, 60, 10, "Upper bound for autoscaling.", "Capacity"),
            _int("timeout_ms", "Downstream timeout", 100, 10000, 3000,
                 "Give up on a slow dependency after this long. Bounds tail latency but turns slowness into errors.",
                 "Resilience", "ms"),
            _int("retries", "Retries", 0, 3, 0,
                 "Retry failed calls. Helps with blips; multiplies load on a dependency that is already drowning.",
                 "Resilience"),
            _bool("circuit_breaker", "Circuit breaker", False,
                  "When more than half of calls to a dependency fail, stop calling it for 5 s so it can recover.",
                  "Resilience"),
        ],
    },
    "cache": {
        "label": "Redis Cache",
        "category": "cache",
        "summary": "In-memory key-value store.",
        "description": "Sub-millisecond reads from RAM. Connect App → Redis for cache-aside (the app checks Redis "
                       "first and falls back to the database), or Redis → Database for read-through.",
        "knobs": [
            _select("memory_gb", "Memory per node", [(k, f"{k} GB") for k in CACHE_MEMORY], "4",
                    "If the hot data does not fit, the hit rate drops.", "Capacity"),
            _int("nodes", "Nodes", 1, 6, 1, "Each node adds memory and ~80k ops/s.", "Capacity"),
            _int("ttl_s", "TTL", 1, 86400, 300,
                 "How long an entry lives. Short TTL = fresher data, more misses.", "Data", "s"),
            _bool("invalidate_on_write", "Invalidate on write", True,
                  "Delete the cached entry when the row changes. Without it readers see stale data until TTL.",
                  "Data"),
            _bool("stampede_protection", "Stampede protection", False,
                  "Request coalescing: when many requests miss the same key, one fetches it and the rest wait.",
                  "Resilience"),
        ],
    },
    "database": {
        "label": "PostgreSQL",
        "category": "data",
        "summary": "Relational database (primary).",
        "description": "ACID transactions, SQL, indexes. Writes always go to the primary; reads can be spread "
                       "over read replicas.",
        "knobs": [
            _select("size", "Instance size", SIZE_OPTS_DB, "medium",
                    "Vertical scaling. xlarge is the ceiling: past it you need replicas or shards.", "Capacity"),
            _text("indexes", "Indexed columns", "id",
                  "Columns with a B-tree index, comma separated. A query on an unindexed column scans the table.",
                  "Data"),
            _int("replicas", "Read replicas", 0, 5, 0, "Each replica serves reads. Writes still hit the primary.",
                 "Replication"),
            _select("replication", "Replication", [("async", "Asynchronous"), ("sync", "Synchronous")], "async",
                    "Async: fast writes, replicas can lag (stale reads). Sync: no lag, slower writes.",
                    "Replication"),
            _bool("failover", "Automatic failover", False,
                  "Promote a replica when the primary dies (~12 s). Needs at least one replica.", "Replication"),
            _int("shards", "Shards", 1, 16, 1, "Split data across independent primaries.", "Partitioning"),
            _select("shard_key", "Shard key", list(SHARD_KEYS.items()), "hash_user",
                    "How rows map to shards. A bad key sends most traffic to one shard.", "Partitioning"),
        ],
    },
    "queue": {
        "label": "Message Queue",
        "category": "async",
        "summary": "Kafka / SQS style durable buffer.",
        "description": "Accepts writes instantly and lets workers process them at their own pace. Absorbs bursts; "
                       "the trade-off is that work happens later.",
        "knobs": [
            _int("partitions", "Partitions", 1, 64, 4, "Each partition handles ~5,000 msgs/s.", "Capacity"),
        ],
    },
    "worker": {
        "label": "Worker",
        "category": "async",
        "summary": "Consumes the queue and writes to the database.",
        "description": "Background consumers. They pull messages from the queue and do the slow work.",
        "knobs": [
            _select("size", "Instance size", SIZE_OPTS_APP, "medium", "CPU per worker.", "Capacity"),
            _int("instances", "Instances", 1, 40, 2, "More workers drain the queue faster.", "Capacity"),
        ],
    },
    "object_storage": {
        "label": "Object Storage",
        "category": "data",
        "summary": "S3-style blob storage.",
        "description": "Practically unlimited storage for files and media. Slow per request (~25 ms) but never "
                       "runs out of capacity.",
        "knobs": [],
    },
}

# Which connections are meaningful. source type → allowed target types.
ALLOWED_EDGES: dict[str, set[str]] = {
    "users": {"cdn", "load_balancer", "app_server"},
    "cdn": {"load_balancer", "app_server", "object_storage"},
    "load_balancer": {"app_server"},
    "app_server": {"cache", "database", "queue", "object_storage"},
    "cache": {"database"},
    "queue": {"worker"},
    "worker": {"database", "cache"},
    "database": set(),
    "object_storage": set(),
}


def default_config(ctype: str) -> dict[str, Any]:
    return {k["key"]: k["default"] for k in CATALOG[ctype]["knobs"]}


def parse_indexes(raw: Any) -> set[str]:
    if not isinstance(raw, str):
        return set()
    return {c.strip().lower() for c in raw.split(",") if c.strip()}


def node_cost(ctype: str, cfg: dict[str, Any], instances_override: float | None = None) -> float:
    """Hourly cost of one node (excluding usage-based parts, added by the engine)."""
    if ctype == "cdn":
        return 0.05
    if ctype == "load_balancer":
        return 0.025
    if ctype in ("app_server", "worker"):
        n = instances_override if instances_override is not None else cfg["instances"]
        return APP_SIZES[cfg["size"]]["cost"] * n
    if ctype == "cache":
        return CACHE_MEMORY[str(cfg["memory_gb"])] * cfg["nodes"]
    if ctype == "database":
        per = DB_SIZES[cfg["size"]]["cost"]
        return round((per * (1 + cfg["replicas"]) + 0.03) * cfg["shards"], 4)
    if ctype == "queue":
        return 0.04 + 0.01 * cfg["partitions"]
    if ctype == "object_storage":
        return 0.02
    return 0.0


def public_catalog() -> list[dict[str, Any]]:
    out = []
    for ctype in COMPONENT_TYPES:
        c = CATALOG[ctype]
        out.append({
            "type": ctype,
            "label": c["label"],
            "category": c["category"],
            "summary": c["summary"],
            "description": c["description"],
            "knobs": c["knobs"],
            "connects_to": sorted(ALLOWED_EDGES[ctype]),
            "default_config": default_config(ctype),
            "base_cost": node_cost(ctype, default_config(ctype)) if ctype != "users" else 0.0,
        })
    return out
