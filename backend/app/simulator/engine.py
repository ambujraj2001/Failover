"""Discrete-time traffic simulator.

Each one-second tick does two passes over the design graph:

1. **Load pass** (topological order): push request rates from Users through every component.
   Each component turns its inbound load into a utilisation, a backlog, and a served fraction
   (requests it did not drop). Only served traffic flows on.
2. **Path pass** (depth-first from Users): enumerate the distinct request paths, multiplying the
   served fractions and summing per-component latency. That yields a latency distribution and an
   error breakdown for the tick.

The model is intentionally simple (M/M/1-style queueing, bounded backlogs, timeouts) but it is
consistent, so learners can reason about it: halve the load on a component and its tail latency
falls off a cliff; push it past 100% and backlog, timeouts and errors follow.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from .catalog import APP_SIZES, DB_SIZES, RATE_LIMITS, node_cost, parse_indexes
from .models import Scenario
from .validation import Graph

LEGIT = ("read", "uread", "write", "static")
WORK = {"read": 1.0, "uread": 1.0, "bot": 1.0, "write": 1.3, "write_async": 1.3, "static": 0.25}
READS = ("read", "uread", "bot")

LB_LATENCY = 1.0
CDN_LATENCY = 6.0
APP_LATENCY = 8.0
CACHE_LATENCY = 0.8
DB_READ_LATENCY = 3.0
DB_SCAN_LATENCY = 45.0
DB_WRITE_LATENCY = 5.0
SYNC_REPL_PENALTY = 3.0
QUEUE_LATENCY = 2.0
OBJ_LATENCY = 25.0
UNINDEXED_COST = 15.0
DB_QUEUE_TIMEOUT_S = 5.0
APP_QUEUE_S = 0.5
FAILOVER_S = 12
HEALTHCHECK_S = 3
BOOT_S = 20
BREAKER_OPEN_S = 5
CACHE_OPS_PER_NODE = 80_000
QUEUE_MSGS_PER_PARTITION = 5_000
QUEUE_MAX_BACKLOG = 2_000_000


# ---------------------------------------------------------------- helpers -----------------------

def queue_latency(base: float, rho: float, backlog_s: float) -> tuple[float, float]:
    """(p50, p99) in ms for one component at utilisation rho with backlog_s seconds of queued work."""
    if backlog_s > 0:
        wait = backlog_s * 1000
        return base + wait * 0.9, base * 3 + wait * 1.1
    rho = min(rho, 0.995)
    p50 = base * (1 + 0.5 * rho / (1 - rho))
    p99 = base * (2.5 + 4 * rho * rho / (1 - rho))
    return min(p50, base * 40), min(p99, base * 120)


def scale_latency(base: float, p50: float, p99: float, backlogged: bool) -> tuple[float, float]:
    """Turn unit-base queue latency into real ms: M/M/1 inflation scales with service time,
    but time spent waiting in a backlog is absolute and must be added, not multiplied."""
    if backlogged:
        return base + (p50 - 1.0), base * 3 + (p99 - 3.0)
    return base * p50, base * p99


def tail_prob(x: float, p50: float, p99: float) -> float:
    """P(latency > x) for a component distribution described by its p50/p99."""
    p50 = max(p50, 0.05)
    p99 = max(p99, p50 * 1.01)
    if x <= p50:
        return 1 - 0.5 * (x / p50)
    if x <= p99:
        frac = (math.log(x) - math.log(p50)) / (math.log(p99) - math.log(p50))
        return 0.5 * (0.02 ** frac)
    return 0.01 * math.exp(-3 * (x - p99) / p99)


def mixture_quantile(buckets: list[tuple[float, float, float]], q_tail: float) -> float:
    """Latency x such that a q_tail share of requests is slower. buckets = (weight, p50, p99)."""
    total = sum(w for w, _, _ in buckets)
    if total <= 0:
        return 0.0
    target = q_tail * total
    lo, hi = math.log(0.05), math.log(10_000_000)
    for _ in range(50):
        mid = (lo + hi) / 2
        x = math.exp(mid)
        if sum(w * tail_prob(x, a, b) for w, a, b in buckets) > target:
            lo = mid
        else:
            hi = mid
    return math.exp((lo + hi) / 2)


def traffic_multiplier(t: int, scenario: Scenario) -> float:
    m = 1.0
    for s in scenario.spikes:
        end = s.at + s.duration
        if t < s.at or t >= end + s.ramp:
            continue
        if s.ramp and t < s.at + s.ramp:
            f = (t - s.at + 1) / (s.ramp + 1)
        elif t >= end:
            f = 1 - (t - end + 1) / (s.ramp + 1)
        else:
            f = 1.0
        m = max(m, 1 + (s.multiplier - 1) * f)
    return m


@dataclass
class Leg:
    chain: list[str]
    frac: float
    cls: str
    terminal: bool = False
    retries: int = 0
    via_app: str | None = None


@dataclass
class TickNode:
    served: dict[str, float] = field(default_factory=lambda: defaultdict(lambda: 1.0))
    reason: dict[str, str] = field(default_factory=dict)
    p50: dict[str, float] = field(default_factory=dict)
    p99: dict[str, float] = field(default_factory=dict)
    busy: float = 0.0
    load: float = 0.0
    capacity: float = 0.0


# ---------------------------------------------------------------- engine ------------------------

class Simulator:
    def __init__(self, graph: Graph, scenario: Scenario):
        self.g = graph
        self.sc = scenario
        self.t = 0
        self.indexed = scenario.query_column.lower() in set().union(
            *[parse_indexes(n["cfg"].get("indexes")) for n in graph.nodes.values() if n["type"] == "database"]
        ) if any(n["type"] == "database" for n in graph.nodes.values()) else True
        # persistent state
        self.backlog: dict[str, float] = defaultdict(float)
        self.replica_backlog: dict[str, float] = defaultdict(float)
        self.instances: dict[str, int] = {}
        self.booting: dict[str, list[tuple[int, int]]] = defaultdict(list)
        self.dead: dict[str, list[int]] = defaultdict(list)  # app id -> death times
        self.db_down_at: dict[str, int] = {}
        self.db_promoted: dict[str, int] = defaultdict(int)
        self.cache_warm_from: dict[str, tuple[int, float, float]] = {}  # id -> (t0, start_frac, tau)
        self.prev_fail: dict[str, float] = defaultdict(float)  # (db) failure fraction last tick
        self.prev_down_lat: dict[str, float] = defaultdict(float)
        self.breaker_until: dict[str, int] = {}
        self.queue_backlog: dict[str, float] = defaultdict(float)
        self.queue_requeue: dict[str, float] = defaultdict(float)
        self.lost_writes = 0.0
        self.saturated: set[str] = set()
        self.calm: dict[str, int] = {}
        self.last_sat_log: dict[str, int] = {}
        self.logs: list[dict[str, Any]] = []
        self.inst_sum: dict[str, float] = defaultdict(float)
        for nid, n in graph.nodes.items():
            if n["type"] == "app_server":
                self.instances[nid] = n["cfg"]["instances"]
            if n["type"] == "cache" and scenario.cold_cache:
                self.cache_warm_from[nid] = (0, 0.0, 8.0)

    # ---- logging
    def log(self, level: str, msg: str) -> None:
        self.logs.append({"t": self.t, "level": level, "msg": msg})

    # ---- component models ---------------------------------------------------------------------
    def cache_hit(self, cid: str) -> tuple[float, float]:
        """(current hit ratio, steady-state hit ratio) for cacheable reads."""
        cfg = self.g.nodes[cid]["cfg"]
        mem = float(cfg["memory_gb"]) * cfg["nodes"] * 0.8
        coverage = min(1.0, mem / self.sc.working_set_gb)
        target = 0.985 * coverage ** 0.35
        ttl = cfg["ttl_s"]
        target *= ttl / (ttl + 3)
        if cid in self.cache_warm_from:
            t0, start, tau = self.cache_warm_from[cid]
            dt = max(0, self.t - t0)
            frac = 1 - (1 - start) * math.exp(-dt / tau)
            return target * frac, target
        return target, target

    def stampede_factor(self, cid: str) -> float:
        hit, target = self.cache_hit(cid)
        if not self.g.nodes[cid]["cfg"]["stampede_protection"] or target <= 0:
            return 1.0
        warm = hit / target
        return 0.25 + 0.75 * warm

    def app_capacity(self, aid: str) -> tuple[float, int]:
        cfg = self.g.nodes[aid]["cfg"]
        n = self.instances[aid] - len([d for d in self.dead[aid]])
        if self.g.parents_of(aid, "users") and not self.g.parents_of(aid, "load_balancer"):
            n = min(n, 1)
        n = max(n, 0)
        return n * APP_SIZES[cfg["size"]]["rps"] / self.sc.app_work, n

    def worker_capacity(self, wid: str) -> float:
        cfg = self.g.nodes[wid]["cfg"]
        return cfg["instances"] * APP_SIZES[cfg["size"]]["rps"] / (WORK["write"] * self.sc.app_work)

    def db_replicas(self, did: str) -> int:
        return max(0, self.g.nodes[did]["cfg"]["replicas"] - self.db_promoted[did])

    def db_primary_up(self, did: str) -> bool:
        return did not in self.db_down_at

    def shard_share(self, did: str, write: bool) -> float:
        cfg = self.g.nodes[did]["cfg"]
        n = cfg["shards"]
        if n <= 1:
            return 1.0
        hot = self.sc.hot_key_share
        if cfg["shard_key"] == "hash_split_hot":
            return 1 / n
        if cfg["shard_key"] == "range_time" and write:
            return 1.0
        return hot + (1 - hot) / n

    # ---- events -------------------------------------------------------------------------------
    def apply_events(self) -> float:
        extra_bot = 0.0
        for ev in self.sc.events:
            if ev.type == "bot_wave" and ev.at <= self.t < ev.at + ev.duration:
                extra_bot += self.sc.base_rps * ev.ratio
                if self.t == ev.at:
                    self.log("WARN", ev.label or f"Bot wave: +{int(self.sc.base_rps * ev.ratio):,} req/s of abusive "
                                                 "traffic")
            if ev.at != self.t:
                continue
            if ev.type == "kill_db_primary":
                for did, n in self.g.nodes.items():
                    if n["type"] == "database" and did not in self.db_down_at:
                        self.db_down_at[did] = self.t
                        self.log("ERROR", ev.label or f"Chaos: {n['label']} primary crashed")
            elif ev.type == "kill_app_instance":
                for aid, n in self.g.nodes.items():
                    if n["type"] == "app_server":
                        k = min(ev.count, self.instances[aid])
                        self.dead[aid].extend([self.t] * k)
                        self.log("ERROR", ev.label or f"Chaos: {k} {n['label']} instance(s) died")
            elif ev.type == "cache_flush":
                for cid, n in self.g.nodes.items():
                    if n["type"] == "cache":
                        self.cache_warm_from[cid] = (self.t, 0.0, 8.0)
                        self.log("WARN", ev.label or f"{n['label']} restarted: cache is cold")
            elif ev.type == "ttl_expiry_wave":
                for cid, n in self.g.nodes.items():
                    if n["type"] == "cache":
                        self.cache_warm_from[cid] = (self.t, 0.15, 4.0)
                        self.log("WARN", ev.label or f"{n['label']}: thousands of keys expired at the same second")
        # failover progress, dead-instance replacement and health checks
        for did, t_down in list(self.db_down_at.items()):
            cfg = self.g.nodes[did]["cfg"]
            if cfg["failover"] and self.db_replicas(did) > 0 and self.t - t_down >= FAILOVER_S:
                del self.db_down_at[did]
                self.db_promoted[did] += 1
                self.backlog[did] = 0
                self.log("INFO", f"Failover complete: a replica of {self.g.label(did)} was promoted "
                                 f"({FAILOVER_S} s of failed writes)")
        return extra_bot

    def autoscale(self, aid: str, load_units: float) -> None:
        cfg = self.g.nodes[aid]["cfg"]
        # finish boots
        ready = [b for b in self.booting[aid] if b[0] <= self.t]
        if ready:
            self.booting[aid] = [b for b in self.booting[aid] if b[0] > self.t]
            before = self.instances[aid]
            self.instances[aid] += sum(k for _, k in ready)
            self.log("INFO", f"Autoscaling: {self.g.label(aid)} {before} → {self.instances[aid]} instances ready")
        if not cfg["autoscaling"]:
            return
        per = APP_SIZES[cfg["size"]]["rps"] / self.sc.app_work
        pending = sum(k for _, k in self.booting[aid])
        current = self.instances[aid] - len(self.dead[aid]) + pending
        desired = min(cfg["max_instances"], math.ceil(load_units / (per * 0.6)) if load_units else 1)
        if desired > current and self.t % 5 == 0:
            add = desired - current
            self.booting[aid].append((self.t + BOOT_S, add))
            self.log("INFO", f"Autoscaling: CPU over 60% on {self.g.label(aid)}, launching {add} instance(s) "
                             f"(ready in {BOOT_S} s)")

    # ---- load routing -------------------------------------------------------------------------
    def db_targets(self, nid: str) -> list[str]:
        return self.g.kids_of(nid, "database")

    def route_load(self, nid: str, cls: str, rate: float) -> list[tuple[str, str, float]]:
        g, ntype = self.g, self.g.nodes[nid]["type"]
        out: list[tuple[str, str, float]] = []

        def split(targets: list[str], c: str, r: float) -> None:
            for tid in targets:
                out.append((tid, c, r / len(targets)))

        if ntype == "users":
            cdn = g.kids_of(nid, "cdn")
            other = [c for c in g.children[nid] if c not in cdn]
            if cls == "static" and cdn:
                split(cdn, cls, rate)
            elif other:
                split(other, cls, rate)
            elif cdn:
                split(cdn, cls, rate)
        elif ntype == "cdn":
            origin_static = g.kids_of(nid, "object_storage") or g.kids_of(nid, "load_balancer", "app_server")
            dyn = g.kids_of(nid, "load_balancer", "app_server")
            if cls == "static":
                split(origin_static, cls, rate * 0.05)
            else:
                split(dyn, cls, rate)
        elif ntype == "load_balancer":
            apps = g.kids_of(nid, "app_server")
            caps = [max(self.app_capacity(a)[0], 1e-6) for a in apps]
            total = sum(caps)
            for a, c in zip(apps, caps, strict=True):
                out.append((a, cls, rate * c / total))
        elif ntype == "app_server":
            out.extend(self._app_route_load(nid, cls, rate))
        elif ntype == "cache":
            dbs = self.db_targets(nid)
            if cls == "read" and dbs:
                hit, _ = self.cache_hit(nid)
                split(dbs, cls, rate * (1 - hit) * self.stampede_factor(nid))
        elif ntype == "queue":
            pass  # drained separately
        elif ntype == "worker":
            split(self.db_targets(nid), cls, rate)
        return out

    def _db_amp(self, aid: str, did: str) -> float:
        cfg = self.g.nodes[aid]["cfg"]
        f = min(self.prev_fail[did], 0.99)
        if self.breaker_open(aid):
            return 0.1  # half-open probes only
        return 1 + sum(f ** k for k in range(1, cfg["retries"] + 1))

    def breaker_open(self, aid: str) -> bool:
        return self.breaker_until.get(aid, -1) > self.t

    def _app_route_load(self, aid: str, cls: str, rate: float) -> list[tuple[str, str, float]]:
        g = self.g
        out: list[tuple[str, str, float]] = []
        caches = g.kids_of(aid, "cache")
        dbs = self.db_targets(aid)
        queues = g.kids_of(aid, "queue")

        def to_db(c: str, r: float) -> None:
            for d in dbs:
                out.append((d, c, r / len(dbs) * self._db_amp(aid, d)))

        if cls == "read" and caches:
            for cid in caches:
                share = rate / len(caches)
                out.append((cid, cls, share))
                if not self.db_targets(cid):
                    hit, _ = self.cache_hit(cid)
                    to_db(cls, share * (1 - hit) * self.stampede_factor(cid))
        elif cls in READS:
            to_db(cls, rate)
        elif cls == "write":
            if queues:
                for q in queues:
                    out.append((q, cls, rate / len(queues)))
            else:
                to_db(cls, rate)
        elif cls == "static":
            for o in g.kids_of(aid, "object_storage"):
                out.append((o, cls, rate))
        return out

    # ---- per-node processing ------------------------------------------------------------------
    def bounded_queue(self, key: str, load: float, cap: float, timeout_s: float, base: float,
                      store: dict[str, float] | None = None) -> tuple[float, float, float, float]:
        """Returns (served_fraction, rho, p50, p99) and updates backlog."""
        store = self.backlog if store is None else store
        if cap <= 0:
            return (0.0 if load > 0 else 1.0), (math.inf if load > 0 else 0.0), base, base
        rho = load / cap
        total = load + store[key]
        processed = min(total, cap)
        backlog = total - processed
        max_backlog = cap * timeout_s
        dropped = 0.0
        if backlog > max_backlog:
            dropped = backlog - max_backlog
            backlog = max_backlog
        store[key] = backlog
        served = 1.0 if load <= 0 else max(0.0, 1 - dropped / load)
        p50, p99 = queue_latency(base, rho, backlog / cap if backlog > cap * 0.02 else 0)
        return served, rho, p50, p99

    def process(self, nid: str, inbound: dict[str, float], ext: dict[str, float]) -> TickNode:
        n = self.g.nodes[nid]
        ntype, cfg, label = n["type"], n["cfg"], n["label"]
        tn = TickNode()
        load_units = sum(r * WORK[c] for c, r in inbound.items())
        tn.load = sum(inbound.values())

        if ntype == "users":
            return tn
        if ntype == "cdn":
            tn.capacity = math.inf
            for c in inbound:
                tn.p50[c], tn.p99[c] = CDN_LATENCY, CDN_LATENCY * 3
            return tn
        if ntype == "load_balancer":
            tn.capacity = 100_000
            tn.busy = tn.load / tn.capacity
            if cfg["rate_limit"]:
                rl = RATE_LIMITS[cfg["rate_limit_rps"]]
                tn.served["bot"] = 1 - rl["bot_block"]
                for c in LEGIT:
                    tn.served[c] = 1 - rl["legit_block"]
                    if rl["legit_block"]:
                        tn.reason[c] = "429 rate-limited: real users blocked by a tight per-client limit"
            for c in inbound:
                tn.p50[c], tn.p99[c] = LB_LATENCY, LB_LATENCY * 3
            return tn
        if ntype == "app_server":
            self.autoscale(nid, load_units)
            cap, live = self.app_capacity(nid)
            self.inst_sum[nid] += self.instances[nid] + sum(k for _, k in self.booting[nid])
            tn.capacity = cap
            served, rho, p50, p99 = self.bounded_queue(nid, load_units, cap, APP_QUEUE_S, APP_LATENCY)
            tn.busy = rho
            reason = f"503 {label} overloaded (CPU saturated, request queue full)"
            # in-flight limit: threads blocked on slow dependencies
            threads = live * APP_SIZES[cfg["size"]]["threads"]
            down = min(self.prev_down_lat[nid], cfg["timeout_ms"])
            in_flight = tn.load * served * (p50 + down) / 1000
            if threads and in_flight > threads:
                extra = 1 - threads / in_flight
                if served > 0.5 and extra > 0.02:
                    reason = f"503 {label}: in-flight limit reached (threads stuck waiting on slow dependencies)"
                served *= 1 - extra
            # dead instances behind no health checks keep receiving their share
            dead = len(self.dead[nid])
            total_inst = self.instances[nid]
            lbs = self.g.parents_of(nid, "load_balancer")
            hc = bool(lbs) and all(self.g.nodes[lb]["cfg"]["health_checks"] for lb in lbs)
            dead_frac = 0.0
            if dead and total_inst:
                if not hc:
                    dead_frac = dead / total_inst
                else:
                    detecting = [d for d in self.dead[nid] if self.t - d < HEALTHCHECK_S]
                    dead_frac = len(detecting) / total_inst
            if live == 0 and tn.load:
                served, reason = 0.0, f"502 {label}: no healthy instances"
            for c in inbound:
                s = served * (1 - dead_frac)
                tn.served[c] = s
                if dead_frac and served >= 0.99:
                    tn.reason[c] = ("502 request sent to a dead instance before health checks removed it" if hc
                                    else "502 request sent to a dead instance (no health checks)")
                else:
                    tn.reason[c] = reason
                tn.p50[c], tn.p99[c] = p50 * WORK[c], p99 * WORK[c]
            return tn
        if ntype == "cache":
            cap = CACHE_OPS_PER_NODE * cfg["nodes"]
            tn.capacity = cap
            served, rho, p50, p99 = self.bounded_queue(nid, tn.load, cap, 0.2, CACHE_LATENCY)
            tn.busy = rho
            for c in inbound:
                tn.served[c] = served
                tn.reason[c] = f"{label} overloaded"
                tn.p50[c], tn.p99[c] = p50, p99
            return tn
        if ntype == "database":
            return self._process_db(nid, inbound, tn)
        if ntype == "queue":
            cap = QUEUE_MSGS_PER_PARTITION * cfg["partitions"]
            tn.capacity = cap
            arrivals = inbound.get("write", 0.0)
            accepted = min(arrivals, cap)
            tn.busy = arrivals / cap
            self.queue_backlog[nid] += accepted + self.queue_requeue[nid]
            self.queue_requeue[nid] = 0
            if self.queue_backlog[nid] > QUEUE_MAX_BACKLOG:
                self.lost_writes += self.queue_backlog[nid] - QUEUE_MAX_BACKLOG
                self.queue_backlog[nid] = QUEUE_MAX_BACKLOG
            workers = self.g.kids_of(nid, "worker")
            drain_cap = sum(self.worker_capacity(w) for w in workers)
            drain = min(self.queue_backlog[nid], drain_cap)
            self.queue_backlog[nid] -= drain
            ext[f"drain:{nid}"] = drain
            for w in workers:
                ext[f"to:{w}"] = ext.get(f"to:{w}", 0.0) + drain * self.worker_capacity(w) / max(drain_cap, 1e-9)
            tn.served["write"] = accepted / arrivals if arrivals else 1.0
            tn.reason["write"] = f"{label} partitions saturated"
            tn.p50["write"], tn.p99["write"] = QUEUE_LATENCY, QUEUE_LATENCY * 4
            return tn
        if ntype == "worker":
            tn.capacity = self.worker_capacity(nid)
            tn.busy = tn.load / tn.capacity if tn.capacity else 0
            return tn
        if ntype == "object_storage":
            tn.capacity = math.inf
            for c in inbound:
                tn.p50[c], tn.p99[c] = OBJ_LATENCY, OBJ_LATENCY * 4
            return tn
        return tn

    def _process_db(self, did: str, inbound: dict[str, float], tn: TickNode) -> TickNode:
        cfg, label = self.g.nodes[did]["cfg"], self.g.nodes[did]["label"]
        qps = DB_SIZES[cfg["size"]]["qps"]
        shards = cfg["shards"]
        read_cost = 1.0 if self.indexed else UNINDEXED_COST
        reads = sum(inbound.get(c, 0.0) for c in READS)
        writes = inbound.get("write", 0.0) + inbound.get("write_async", 0.0)
        replicas = self.db_replicas(did)
        up = self.db_primary_up(did)
        read_nodes = replicas + (1 if up else 0)
        sr, sw = self.shard_share(did, False), self.shard_share(did, True)

        primary_read_share = (1 / read_nodes) if (up and read_nodes) else 0.0
        # units landing on the hottest shard's primary
        primary_units = writes * 1.5 * sw + reads * read_cost * primary_read_share * sr
        replica_units = (reads * read_cost * sr / read_nodes) if (replicas and read_nodes) else 0.0

        if up:
            s_p, rho_p, p50_p, p99_p = self.bounded_queue(did, primary_units, qps, DB_QUEUE_TIMEOUT_S, 1.0)
        else:
            s_p, rho_p, p50_p, p99_p = 0.0, 0.0, 1.0, 1.0
            self.backlog[did] = 0
        if replicas:
            s_r, rho_r, p50_r, p99_r = self.bounded_queue(did, replica_units, qps, DB_QUEUE_TIMEOUT_S, 1.0,
                                                          store=self.replica_backlog)
        else:
            s_r, rho_r, p50_r, p99_r = 1.0, 0.0, 1.0, 1.0

        tn.busy = max(rho_p, rho_r)
        tn.capacity = qps * shards * (1 + replicas) / read_cost
        overloaded = f"{label} overloaded (timeout waiting in queue)"
        down_reason = f"{label} primary is down: writes rejected"

        read_base = DB_READ_LATENCY if self.indexed else DB_SCAN_LATENCY
        bl_p = self.backlog[did] > qps * 0.02
        bl_r = self.replica_backlog[did] > qps * 0.02
        rp50_p, rp99_p = scale_latency(read_base, p50_p, p99_p, bl_p)
        rp50_r, rp99_r = scale_latency(read_base, p50_r, p99_r, bl_r)
        # reads: mix of primary and replica service
        if read_nodes:
            pr = primary_read_share
            s_read = pr * s_p + (1 - pr) * s_r
            p50_read = pr * rp50_p + (1 - pr) * rp50_r
            p99_read = max(rp99_p if pr else 0, rp99_r if pr < 1 else 0)
        else:
            s_read, p50_read, p99_read = 0.0, read_base, read_base
        for c in READS:
            tn.served[c] = s_read
            tn.reason[c] = overloaded if read_nodes else f"{label} is down: no primary and no replicas"
            tn.p50[c], tn.p99[c] = p50_read, p99_read
        wbase = DB_WRITE_LATENCY + (SYNC_REPL_PENALTY if cfg["replication"] == "sync" and replicas else 0)
        wp50, wp99 = scale_latency(wbase, p50_p, p99_p, bl_p)
        for c in ("write", "write_async"):
            tn.served[c] = s_p if up else 0.0
            tn.reason[c] = overloaded if up else down_reason
            tn.p50[c], tn.p99[c] = wp50, wp99
        # stale reads from async replicas
        stale = 0.0
        if replicas and cfg["replication"] == "async" and read_nodes:
            lag = 0.01 + 0.4 * max(0.0, rho_p - 0.7)
            stale = min(1.0, lag) * (1 - primary_read_share)
        tn.reason["_stale"] = str(stale)
        tn.load = reads + writes
        return tn

    # ---- path pass ----------------------------------------------------------------------------
    def route_paths(self, nid: str, cls: str) -> list[Leg]:
        g, ntype = self.g, self.g.nodes[nid]["type"]
        legs: list[Leg] = []

        def split(targets: list[str], c: str, frac: float, **kw: Any) -> None:
            for tid in targets:
                legs.append(Leg([tid], frac / len(targets), c, **kw))

        if ntype == "users":
            cdn = g.kids_of(nid, "cdn")
            other = [c for c in g.children[nid] if c not in cdn]
            if cls == "static" and cdn:
                split(cdn, cls, 1.0)
            elif other:
                split(other, cls, 1.0)
            elif cdn:
                split(cdn, cls, 1.0)
        elif ntype == "cdn":
            if cls == "static":
                legs.append(Leg([], 0.95, cls, terminal=True))
                origin = g.kids_of(nid, "object_storage") or g.kids_of(nid, "load_balancer", "app_server")
                split(origin, cls, 0.05)
            else:
                split(g.kids_of(nid, "load_balancer", "app_server"), cls, 1.0)
        elif ntype == "load_balancer":
            apps = g.kids_of(nid, "app_server")
            caps = [max(self.app_capacity(a)[0], 1e-6) for a in apps]
            for a, c in zip(apps, caps, strict=True):
                legs.append(Leg([a], c / sum(caps), cls))
        elif ntype == "app_server":
            legs.extend(self._app_route_paths(nid, cls))
        elif ntype == "cache":
            hit, _ = self.cache_hit(nid)
            legs.append(Leg([], hit, cls, terminal=True))
            split(self.db_targets(nid), cls, 1 - hit)
        return legs

    def _app_route_paths(self, aid: str, cls: str) -> list[Leg]:
        g = self.g
        legs: list[Leg] = []
        caches, dbs, queues = g.kids_of(aid, "cache"), self.db_targets(aid), g.kids_of(aid, "queue")
        retries = g.nodes[aid]["cfg"]["retries"]
        if cls == "read" and caches:
            for cid in caches:
                share = 1 / len(caches)
                if self.db_targets(cid):
                    legs.append(Leg([cid], share, cls, via_app=aid))
                else:
                    hit, _ = self.cache_hit(cid)
                    legs.append(Leg([cid], share * hit, cls, terminal=True))
                    for d in dbs or [None]:
                        chain = [cid, d] if d else [cid, "__nodb__"]
                        legs.append(Leg(chain, share * (1 - hit) / max(1, len(dbs)), cls, retries=retries,
                                        via_app=aid, terminal=True))
        elif cls in READS or (cls == "write" and not queues):
            if not dbs:
                legs.append(Leg(["__nodb__"], 1.0, cls, terminal=True))
            for d in dbs:
                legs.append(Leg([d], 1 / len(dbs), cls, retries=retries, via_app=aid, terminal=True))
        elif cls == "write":
            for q in queues:
                legs.append(Leg([q], 1 / len(queues), cls, terminal=True))
        elif cls == "static":
            objs = g.kids_of(aid, "object_storage")
            if objs:
                legs.append(Leg([objs[0]], 1.0, cls, terminal=True))
            else:
                legs.append(Leg([], 1.0, cls, terminal=True))
        return legs

    def walk(self, tick: dict[str, TickNode], cls: str) -> tuple[list[tuple[float, float, float]],
                                                              dict[str, float], dict[str, float], float]:
        """Enumerate paths for one class. Returns (latency buckets, errors by reason,
        downstream latency per app, stale share)."""
        buckets: list[tuple[float, float, float]] = []
        errors: dict[str, float] = defaultdict(float)
        down_lat: dict[str, list[tuple[float, float]]] = defaultdict(list)
        stale = 0.0

        def follow(leg: Leg, frac: float, p50: float, excess: list[float],
                   timeouts: list[tuple[str, float, float]], depth: int) -> None:
            nonlocal stale
            if frac < 1e-7:
                return
            if not leg.chain:
                finish(frac, p50, excess, timeouts)
                return
            for i, nid in enumerate(leg.chain):
                if nid == "__nodb__":
                    errors["No route to a database for this request"] += frac
                    return
                node = tick[nid]
                ntype = self.g.nodes[nid]["type"]
                s = node.served[cls]
                if ntype == "database" and leg.via_app:
                    if self.breaker_open(leg.via_app):
                        errors[f"Circuit breaker open on {self.g.label(leg.via_app)}: failing fast"] += frac * 0.9
                        frac *= 0.1
                    f = 1 - s
                    s = 1 - f ** (1 + leg.retries)
                    if cls in READS:
                        stale += frac * s * float(node.reason.get("_stale", 0))
                if s < 1:
                    errors[node.reason.get(cls, f"{self.g.label(nid)} failed")] += frac * (1 - s)
                frac *= s
                if frac < 1e-7:
                    return
                a = node.p50.get(cls, 0.0)
                b = node.p99.get(cls, a)
                if ntype == "database" and leg.via_app and leg.retries and (1 - node.served[cls]) > 0:
                    a *= 1 + (1 - node.served[cls])
                p50 += a
                excess = excess + [max(0.0, b - a)]
                if ntype == "app_server":
                    timeouts = timeouts + [(nid, p50, self.g.nodes[nid]["cfg"]["timeout_ms"])]
                if i == len(leg.chain) - 1 and not leg.terminal:
                    visit_after(nid, frac, p50, excess, timeouts, depth + 1)
                    return
            finish(frac, p50, excess, timeouts)

        def visit_after(nid: str, frac: float, p50: float, excess: list[float],
                        timeouts: list[tuple[str, float, float]], depth: int) -> None:
            legs = self.route_paths(nid, cls)
            ntype = self.g.nodes[nid]["type"]
            if not legs:
                if ntype == "app_server" and cls != "static":
                    errors["No route to a database for this request"] += frac
                elif ntype in ("cdn", "load_balancer"):
                    errors[f"{self.g.label(nid)} has nothing behind it to send requests to"] += frac
                else:
                    finish(frac, p50, excess, timeouts)
                return
            for leg in legs:
                follow(leg, frac * leg.frac, p50, excess, timeouts, depth)

        def finish(frac: float, p50: float, excess: list[float], timeouts: list[tuple[str, float, float]]) -> None:
            ex = sorted(excess, reverse=True)
            p99 = p50 + (ex[0] if ex else 0) + 0.25 * sum(ex[1:])
            for aid, at_lat, limit in timeouts:
                downstream50 = p50 - at_lat
                downstream99 = p99 - at_lat
                down_lat[aid].append((frac, downstream50))
                if downstream99 > limit:
                    if downstream50 >= limit:
                        over = min(1.0, 0.5 + 0.5 * (downstream50 - limit) / limit)
                    else:
                        over = 0.01 * (downstream99 - limit) / max(downstream99 - downstream50, 1e-6) * 5
                        over = min(over, 0.5)
                    errors[f"Timeout: {self.g.label(aid)} gave up after {limit} ms"] += frac * over
                    frac *= 1 - over
                    p99 = min(p99, at_lat + limit)
                    p50 = min(p50, at_lat + limit)
            if frac > 1e-7:
                buckets.append((frac, max(p50, 0.1), max(p99, p50 * 1.05, 0.2)))

        users = self.g.users_id
        visit_after(users, 1.0, 0.0, [], [], 0)
        dl = {aid: (sum(f * v for f, v in vals) / max(sum(f for f, _ in vals), 1e-9)) for aid, vals in down_lat.items()}
        return buckets, errors, dl, stale

    # ---- main loop ----------------------------------------------------------------------------
    def run(self) -> dict[str, Any]:
        sc, g = self.sc, self.g
        series: list[dict[str, Any]] = []
        all_buckets: list[tuple[float, float, float]] = []
        reason_totals: dict[str, float] = defaultdict(float)
        window_reasons: dict[str, float] = defaultdict(float)
        window_reqs = 0.0
        total_legit = total_err = total_reads = total_stale = 0.0
        total_writes = 0.0
        node_stats: dict[str, dict[str, float]] = {
            nid: {"busy_sum": 0.0, "peak": 0.0, "load_sum": 0.0, "cap": 0.0, "drop_sum": 0.0, "in_sum": 0.0,
                  "backlog_peak": 0.0}
            for nid in g.nodes
        }
        hit_samples: dict[str, list[float]] = defaultdict(list)
        lb_rps_sum = cdn_static_sum = 0.0
        max_queue_lag = 0.0

        for t in range(sc.duration):
            self.t = t
            extra_bot = self.apply_events()
            rps = sc.base_rps * traffic_multiplier(t, sc)
            bots = rps * sc.bot_ratio + extra_bot
            legit = rps * (1 - sc.bot_ratio)
            static = legit * sc.static_ratio
            dyn = legit - static
            reads = dyn * sc.read_ratio
            rates = {
                "read": reads * sc.cacheable,
                "uread": reads * (1 - sc.cacheable),
                "write": dyn * (1 - sc.read_ratio),
                "static": static,
                "bot": bots,
            }

            # ---- pass 1: loads
            inbound: dict[str, dict[str, float]] = {nid: defaultdict(float) for nid in g.nodes}
            inbound[g.users_id].update(rates)
            ext: dict[str, float] = {}
            tick: dict[str, TickNode] = {}
            for nid in g.order:
                ntype = g.nodes[nid]["type"]
                if ntype == "worker":
                    inbound[nid]["write_async"] += ext.get(f"to:{nid}", 0.0)
                tn = self.process(nid, inbound[nid], ext)
                tick[nid] = tn
                for cls, r in list(inbound[nid].items()):
                    if r <= 0:
                        continue
                    if ntype == "worker":
                        for did in self.db_targets(nid):
                            inbound[did]["write_async"] += r / max(1, len(self.db_targets(nid)))
                        continue
                    served = r * tn.served[cls]
                    for tid, c2, r2 in self.route_load(nid, cls, served):
                        inbound[tid][c2] += r2
                if ntype == "load_balancer":
                    lb_rps_sum += tn.load
                if ntype == "cdn":
                    cdn_static_sum += inbound[nid].get("static", 0.0)

            # async writes rejected by the database go back on the queue
            for nid in g.order:
                if g.nodes[nid]["type"] == "database":
                    wa = inbound[nid].get("write_async", 0.0)
                    if wa:
                        rejected = wa * (1 - tick[nid].served["write_async"])
                        queues = [q for q in g.nodes if g.nodes[q]["type"] == "queue"]
                        for q in queues:
                            self.queue_requeue[q] += rejected / len(queues)
                    w_all = sum(inbound[nid].get(c, 0.0) for c in ("write", "write_async", *READS))
                    if w_all:
                        self.prev_fail[nid] = 1 - (
                            sum(inbound[nid].get(c, 0.0) * tick[nid].served[c]
                                for c in ("write", "write_async", *READS)) / w_all)
                    else:
                        self.prev_fail[nid] = 0.0

            # circuit breakers
            for aid, n in g.nodes.items():
                if n["type"] != "app_server" or not n["cfg"]["circuit_breaker"]:
                    continue
                dbs = self.db_targets(aid)
                worst = max((self.prev_fail[d] for d in dbs), default=0.0)
                if not self.breaker_open(aid) and worst > 0.5:
                    self.breaker_until[aid] = t + BREAKER_OPEN_S
                    self.log("WARN", f"Circuit breaker opened on {n['label']}: database failing, shedding load "
                                     f"for {BREAKER_OPEN_S} s")

            # ---- pass 2: paths per class
            tick_buckets: list[tuple[float, float, float]] = []
            tick_err = 0.0
            tick_legit = 0.0
            app_down: dict[str, list[tuple[float, float]]] = defaultdict(list)
            for cls in LEGIT:
                r = rates[cls]
                if r <= 0:
                    continue
                buckets, errors, dl, stale = self.walk(tick, cls)
                tick_legit += r
                for w, a, b in buckets:
                    tick_buckets.append((w * r, a, b))
                e = sum(errors.values())
                tick_err += min(e, 1.0) * r
                for reason, f in errors.items():
                    reason_totals[reason] += f * r
                    window_reasons[reason] += f * r
                if cls in ("read", "uread"):
                    total_reads += r
                    total_stale += stale * r
                if cls == "write":
                    total_writes += r
                for aid, v in dl.items():
                    app_down[aid].append((r, v))
            # cache staleness when invalidation is off
            for cid, n in g.nodes.items():
                if n["type"] == "cache":
                    hit, _ = self.cache_hit(cid)
                    hit_samples[cid].append(hit)
                    if not n["cfg"]["invalidate_on_write"] and rates["read"] > 0:
                        churn = min(1.0, (1 - sc.read_ratio) * 4) * min(1.0, n["cfg"]["ttl_s"] / 30)
                        total_stale += rates["read"] * hit * churn
            for aid, vals in app_down.items():
                cur = sum(r * v for r, v in vals) / max(sum(r for r, _ in vals), 1e-9)
                self.prev_down_lat[aid] = 0.6 * self.prev_down_lat[aid] + 0.4 * cur  # smoothed

            window_reqs += tick_legit
            total_legit += tick_legit
            total_err += tick_err
            all_buckets.extend(tick_buckets)
            p50 = mixture_quantile(tick_buckets, 0.5) if tick_buckets else 0.0
            p99 = mixture_quantile(tick_buckets, 0.01) if tick_buckets else 0.0

            node_busy: dict[str, float] = {}
            for nid, tn in tick.items():
                st = node_stats[nid]
                busy = tn.busy if math.isfinite(tn.busy) else 9.99
                st["busy_sum"] += busy
                st["peak"] = max(st["peak"], busy)
                st["load_sum"] += tn.load
                st["cap"] = tn.capacity
                node_busy[nid] = round(busy, 3)
                st["backlog_peak"] = max(st["backlog_peak"], self.backlog.get(nid, 0.0))
                ntype = g.nodes[nid]["type"]
                if ntype not in ("users",):
                    if busy > 1.0:
                        self.calm[nid] = 0
                        if nid not in self.saturated:
                            self.saturated.add(nid)
                            if t - self.last_sat_log.get(nid, -99) >= 10:
                                self.last_sat_log[nid] = t
                                self.log("ERROR", f"{g.label(nid)} saturated: {busy * 100:.0f}% of capacity, "
                                                  "requests queueing")
                    elif nid in self.saturated:
                        self.calm[nid] = self.calm.get(nid, 0) + 1 if busy < 0.85 else 0
                        if self.calm[nid] >= 5:
                            self.saturated.discard(nid)
                            self.log("INFO", f"{g.label(nid)} recovered: {busy * 100:.0f}% busy")
                if ntype == "queue":
                    drain = ext.get(f"drain:{nid}", 0.0)
                    lag = self.queue_backlog[nid] / max(drain, 1.0) if self.queue_backlog[nid] > 1 else 0.0
                    max_queue_lag = max(max_queue_lag, min(lag, 3600))

            if (t + 1) % 10 == 0 or t == sc.duration - 1:
                for reason, cnt in sorted(window_reasons.items(), key=lambda kv: -kv[1]):
                    pct = cnt / max(window_reqs, 1e-9) * 100
                    if pct >= 0.5:
                        self.log("ERROR", f"{reason} ({pct:.1f}% of requests)")
                window_reasons.clear()
                window_reqs = 0.0

            series.append({
                "t": t,
                "rps": round(rps + bots),
                "ok_rps": round(tick_legit - tick_err),
                "p50": round(p50, 1),
                "p99": round(p99, 1),
                "err": round(tick_err / tick_legit * 100, 3) if tick_legit else 0.0,
                "nodes": node_busy,
            })

        return self._summarise(series, all_buckets, reason_totals, total_legit, total_err, total_reads,
                               total_stale, total_writes, node_stats, hit_samples, lb_rps_sum, cdn_static_sum,
                               max_queue_lag)

    def _summarise(self, series, all_buckets, reason_totals, total_legit, total_err, total_reads, total_stale,
                   total_writes, node_stats, hit_samples, lb_rps_sum, cdn_static_sum, max_queue_lag):
        g, sc = self.g, self.sc
        dur = sc.duration
        cost = 0.0
        for nid, n in g.nodes.items():
            if n["type"] == "users":
                continue
            if n["type"] == "app_server":
                avg_inst = self.inst_sum[nid] / dur if dur else n["cfg"]["instances"]
                cost += node_cost("app_server", n["cfg"], instances_override=avg_inst)
            else:
                cost += node_cost(n["type"], n["cfg"])
        cost += lb_rps_sum / dur * 0.000008 + cdn_static_sum / dur * 0.00002

        err = total_err / total_legit * 100 if total_legit else 0.0
        if all_buckets and err < 99.5:
            p50 = mixture_quantile(all_buckets, 0.5)
            p99 = mixture_quantile(all_buckets, 0.01)
        else:
            # nothing succeeded: report the timeout users experienced instead of a misleading 0
            p50 = p99 = float(max((n["cfg"]["timeout_ms"] for n in g.nodes.values() if n["type"] == "app_server"),
                                  default=10_000))

        nodes_out: dict[str, dict[str, Any]] = {}
        for nid, st in node_stats.items():
            n = g.nodes[nid]
            item: dict[str, Any] = {
                "label": n["label"],
                "type": n["type"],
                "load_rps": round(st["load_sum"] / dur, 1),
                "capacity_rps": None if not math.isfinite(st["cap"]) else round(st["cap"], 1),
                "busy": round(st["busy_sum"] / dur, 3),
                "peak_busy": round(st["peak"], 3),
                "backlog_peak": round(st["backlog_peak"], 1),
            }
            if n["type"] == "cache" and hit_samples[nid]:
                item["hit_ratio"] = round(sum(hit_samples[nid]) / len(hit_samples[nid]), 3)
            if n["type"] == "app_server":
                item["instances_avg"] = round(self.inst_sum[nid] / dur, 1)
                item["instances_end"] = self.instances[nid]
            nodes_out[nid] = item

        reasons = [{"reason": r, "pct": round(c / total_legit * 100, 2)}
                   for r, c in sorted(reason_totals.items(), key=lambda kv: -kv[1])
                   if total_legit and c / total_legit >= 0.0005]

        diagnosis = self._diagnose(nodes_out, reasons, p99, err)
        cache_hits = [v["hit_ratio"] for v in nodes_out.values() if "hit_ratio" in v]
        stale_pct = total_stale / total_reads * 100 if total_reads else 0.0
        loss = self.lost_writes / max(total_writes, 1e-9) * 100 if total_writes else 0.0
        return {
            "summary": {
                "p50_ms": round(p50, 1),
                "p99_ms": round(p99, 1),
                "error_rate": round(err, 3),
                "cost_per_hr": round(cost, 2),
                "stale_read_rate": round(min(stale_pct, 100), 3),
                "queue_lag_s": round(max_queue_lag, 1),
                "write_loss_rate": round(min(loss, 100), 3),
                "throughput_rps": round((total_legit - total_err) / dur, 1),
                "peak_rps": max((s["rps"] for s in series), default=0),
                "cache_hit_ratio": round(sum(cache_hits) / len(cache_hits), 3) if cache_hits else None,
            },
            "series": series,
            "nodes": nodes_out,
            "failure_reasons": reasons,
            "logs": self.logs[:300],
            "diagnosis": diagnosis,
            "warnings": g.warnings,
        }

    def _diagnose(self, nodes: dict[str, dict[str, Any]], reasons: list[dict[str, Any]], p99: float,
                  err: float) -> str:
        worst = max((v for v in nodes.values() if v["type"] != "users"), key=lambda v: v["peak_busy"], default=None)
        if worst and worst["peak_busy"] > 1.0:
            return f"Requests are queueing at {worst['label']} (peak {worst['peak_busy'] * 100:.0f}% busy)."
        if reasons and err >= 0.1:
            return f"Most failures: {reasons[0]['reason']}."
        if worst and worst["peak_busy"] > 0.8:
            return f"{worst['label']} is running hot (peak {worst['peak_busy'] * 100:.0f}% busy). Tail latency grows " \
                   f"fast past 80%."
        return "Healthy: every component kept headroom during this run."


def simulate(graph: Graph, scenario: Scenario) -> dict[str, Any]:
    return Simulator(graph, scenario).run()
