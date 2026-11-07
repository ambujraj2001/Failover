"""Directional tests: each mechanic must move metrics the way an engineer would expect."""

import pytest

from app.simulator.engine import simulate
from app.simulator.models import Design, Scenario
from app.simulator.validation import DesignInvalid, build_graph


def design(nodes, edges) -> Design:
    return Design(
        nodes=[{"id": i, "type": t, "config": c} for i, t, c in nodes],
        edges=[{"source": a, "target": b} for a, b in edges],
    )


def run(nodes, edges, **sc):
    return simulate(build_graph(design(nodes, edges)), Scenario(**sc))["summary"]


def web(app=None, db=None, extra_nodes=(), extra_edges=()):
    nodes = [("u", "users", {}), ("lb", "load_balancer", {}),
             ("api", "app_server", app or {"size": "large", "instances": 4}),
             ("db", "database", db or {"size": "large"}), *extra_nodes]
    edges = [("u", "lb"), ("lb", "api"), ("api", "db"), *extra_edges]
    return nodes, edges


def test_healthy_baseline():
    s = run(*web(), base_rps=1000)
    assert s["error_rate"] < 0.1
    assert s["p99_ms"] < 100


def test_overload_causes_errors_and_latency():
    s = run(*web(db={"size": "small"}), base_rps=3000)
    assert s["error_rate"] > 10


def test_cache_reduces_db_load():
    n, e = web(db={"size": "medium"})
    without = run(n, e, base_rps=3000, read_ratio=0.98)
    n2, e2 = web(db={"size": "medium"}, extra_nodes=[("r", "cache", {})], extra_edges=[("api", "r")])
    with_cache = run(n2, e2, base_rps=3000, read_ratio=0.98)
    assert with_cache["error_rate"] < without["error_rate"]
    assert with_cache["p99_ms"] < without["p99_ms"]


def test_read_replicas_absorb_reads():
    bad = run(*web(db={"size": "medium"}), base_rps=3000, read_ratio=0.95, cacheable=0)
    good = run(*web(db={"size": "medium", "replicas": 2}), base_rps=3000, read_ratio=0.95, cacheable=0)
    assert good["error_rate"] < bad["error_rate"]


def test_replicas_do_not_help_writes():
    s = run(*web(db={"size": "small", "replicas": 3}), base_rps=1500, read_ratio=0.2)
    assert s["error_rate"] > 5


def test_async_replicas_cause_some_stale_reads_sync_does_not():
    a = run(*web(db={"size": "large", "replicas": 2, "replication": "async"}), base_rps=1000, cacheable=0)
    s = run(*web(db={"size": "large", "replicas": 2, "replication": "sync"}), base_rps=1000, cacheable=0)
    assert a["stale_read_rate"] > 0
    assert s["stale_read_rate"] == 0


def test_missing_index_is_catastrophic():
    bad = run(*web(db={"size": "large", "indexes": "id"}), base_rps=800, query_column="email")
    good = run(*web(db={"size": "large", "indexes": "id, email"}), base_rps=800, query_column="email")
    assert bad["error_rate"] > 10 and good["error_rate"] < 0.5


def test_hot_key_defeats_hash_sharding_but_not_split():
    kw = dict(base_rps=6000, read_ratio=0.5, cacheable=0, hot_key_share=0.4)
    hashed = run(*web(app={"size": "xlarge", "instances": 5}, db={"size": "medium", "shards": 8}), **kw)
    split = run(*web(app={"size": "xlarge", "instances": 5},
                     db={"size": "medium", "shards": 8, "shard_key": "hash_split_hot"}), **kw)
    assert split["error_rate"] < hashed["error_rate"]


def test_queue_smooths_write_burst():
    kw = dict(base_rps=500, read_ratio=0.1, spikes=[{"at": 10, "duration": 15, "multiplier": 6}])
    direct = run(*web(app={"size": "large", "instances": 6}, db={"size": "medium"}), **kw)
    n, e = web(app={"size": "large", "instances": 6}, db={"size": "medium"})
    e = [x for x in e if x != ("api", "db")] + [("api", "db"), ("api", "q"), ("q", "w"), ("w", "db")]
    n += [("q", "queue", {}), ("w", "worker", {"instances": 1, "size": "medium"})]
    queued = run(n, e, **kw)
    assert queued["error_rate"] < direct["error_rate"]
    assert queued["queue_lag_s"] > 0


def test_rate_limit_blocks_bots():
    kw = dict(base_rps=4000, bot_ratio=0.7)
    n, e = web(db={"size": "medium"})
    open_ = run(n, e, **kw)
    n2 = [(i, t, {"rate_limit": True}) if t == "load_balancer" else (i, t, c) for i, t, c in n]
    limited = run(n2, e, **kw)
    assert limited["error_rate"] < open_["error_rate"]


def test_failover_limits_damage_of_dead_primary():
    ev = dict(base_rps=800, read_ratio=0.7, events=[{"at": 10, "type": "kill_db_primary"}])
    none = run(*web(db={"size": "large"}), **ev)
    fo = run(*web(db={"size": "large", "replicas": 1, "failover": True}), **ev)
    assert none["error_rate"] > 50
    assert fo["error_rate"] < none["error_rate"] / 3


def test_health_checks_route_around_dead_instance():
    ev = dict(base_rps=800, events=[{"at": 5, "type": "kill_app_instance", "count": 1}])
    n, e = web(app={"size": "large", "instances": 4})
    with_hc = run(n, e, **ev)
    n2 = [(i, t, {"health_checks": False}) if t == "load_balancer" else (i, t, c) for i, t, c in n]
    without = run(n2, e, **ev)
    assert with_hc["error_rate"] < without["error_rate"]


def test_autoscaling_recovers_from_spike():
    kw = dict(base_rps=1000, duration=90, spikes=[{"at": 10, "duration": 70, "multiplier": 3, "ramp": 2}])
    fixed = run(*web(app={"size": "large", "instances": 2}, db={"size": "xlarge"}), **kw)
    auto = run(*web(app={"size": "large", "instances": 2, "autoscaling": True, "max_instances": 10},
                    db={"size": "xlarge"}), **kw)
    assert auto["error_rate"] < fixed["error_rate"]


def test_cdn_offloads_static():
    kw = dict(base_rps=4000, static_ratio=0.7)
    n, e = web(app={"size": "medium", "instances": 2}, db={"size": "large"})
    direct = run(n, e, **kw)
    n2 = n + [("cdn", "cdn", {})]
    e2 = [("u", "cdn"), ("cdn", "lb"), ("lb", "api"), ("api", "db")]
    cdn = run(n2, e2, **kw)
    assert cdn["error_rate"] < direct["error_rate"]


def test_cycle_rejected():
    with pytest.raises(DesignInvalid):
        build_graph(design([("u", "users", {}), ("a", "cache", {}), ("b", "database", {})],
                           [("u", "a"), ("a", "b")]))


def test_unknown_type_and_bad_knob_rejected():
    with pytest.raises(DesignInvalid):
        build_graph(design([("u", "users", {}), ("x", "mainframe", {})], []))
    with pytest.raises(DesignInvalid):
        build_graph(design([("u", "users", {}), ("a", "app_server", {"instances": 999})], [("u", "a")]))


def test_palette_enforced():
    with pytest.raises(DesignInvalid):
        build_graph(design([("u", "users", {}), ("c", "cdn", {})], [("u", "c")]), palette={"app_server"})


def test_no_database_means_errors():
    s = run([("u", "users", {}), ("a", "app_server", {})], [("u", "a")], base_rps=100)
    assert s["error_rate"] > 50
