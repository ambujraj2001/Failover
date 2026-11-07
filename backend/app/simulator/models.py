from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_NODES = 40
MAX_EDGES = 80


class Position(BaseModel):
    x: float = 0
    y: float = 0


class DesignNode(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=64)
    type: str = Field(min_length=1, max_length=32)
    label: str | None = Field(default=None, max_length=60)
    config: dict[str, Any] = Field(default_factory=dict)
    position: Position = Field(default_factory=Position)


class DesignEdge(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str | None = Field(default=None, max_length=140)
    source: str = Field(min_length=1, max_length=64)
    target: str = Field(min_length=1, max_length=64)


class Design(BaseModel):
    nodes: list[DesignNode] = Field(default_factory=list, max_length=MAX_NODES)
    edges: list[DesignEdge] = Field(default_factory=list, max_length=MAX_EDGES)


class Spike(BaseModel):
    at: int = Field(ge=0)
    duration: int = Field(ge=1)
    multiplier: float = Field(gt=0)
    ramp: int = Field(default=4, ge=0)


EventType = Literal["kill_db_primary", "kill_app_instance", "cache_flush", "bot_wave", "ttl_expiry_wave"]


class SimEvent(BaseModel):
    at: int = Field(ge=0)
    type: EventType
    count: int = 1
    duration: int = 20
    ratio: float = 0.0
    label: str | None = None


class Scenario(BaseModel):
    duration: int = Field(default=60, ge=10, le=180)
    base_rps: float = Field(gt=0)
    spikes: list[Spike] = Field(default_factory=list)
    read_ratio: float = Field(default=0.9, ge=0, le=1, description="share of dynamic requests that are reads")
    static_ratio: float = Field(default=0.0, ge=0, le=0.95, description="share of all requests for static files")
    bot_ratio: float = Field(default=0.0, ge=0, le=0.95, description="share of traffic that is abusive")
    cacheable: float = Field(default=1.0, ge=0, le=1, description="share of reads that can be cached")
    hot_key_share: float = Field(default=0.0, ge=0, le=1, description="share of keyed traffic on the hottest key")
    working_set_gb: float = Field(default=2.0, gt=0)
    query_column: str = Field(default="id", description="column the hot query filters on")
    app_work: float = Field(default=1.0, gt=0, description="CPU multiplier per request")
    cold_cache: bool = False
    events: list[SimEvent] = Field(default_factory=list)


Metric = Literal["p99_ms", "p50_ms", "error_rate", "cost_per_hr", "stale_read_rate", "queue_lag_s", "write_loss_rate"]

METRIC_LABELS: dict[str, tuple[str, str]] = {
    "p99_ms": ("p99 latency", "ms"),
    "p50_ms": ("p50 latency", "ms"),
    "error_rate": ("error rate", "%"),
    "cost_per_hr": ("cost", "$/hr"),
    "stale_read_rate": ("stale reads", "%"),
    "queue_lag_s": ("queue lag", "s"),
    "write_loss_rate": ("lost writes", "%"),
}


class Assertion(BaseModel):
    metric: Metric
    op: Literal["lte", "gte"] = "lte"
    value: float


class TestCase(BaseModel):
    id: str
    name: str
    summary: str = ""
    hidden: bool = False
    scenario: Scenario
    assertions: list[Assertion]

    @field_validator("assertions")
    @classmethod
    def _non_empty(cls, v: list[Assertion]) -> list[Assertion]:
        if not v:
            raise ValueError("a test needs at least one assertion")
        return v
