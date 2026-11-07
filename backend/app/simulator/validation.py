"""Turns an untrusted canvas design into a validated graph the engine can run."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .catalog import ALLOWED_EDGES, CATALOG, COMPONENT_TYPES, default_config
from .models import Design


class DesignInvalid(Exception):
    def __init__(self, issues: list[str]):
        super().__init__("; ".join(issues))
        self.issues = issues


@dataclass
class Graph:
    nodes: dict[str, dict[str, Any]]  # id -> {"type", "label", "cfg"}
    children: dict[str, list[str]]
    parents: dict[str, list[str]]
    order: list[str]  # topological order
    users_id: str
    warnings: list[str] = field(default_factory=list)

    def label(self, nid: str) -> str:
        return self.nodes[nid]["label"]

    def kids_of(self, nid: str, *types: str) -> list[str]:
        return [c for c in self.children[nid] if self.nodes[c]["type"] in types]

    def parents_of(self, nid: str, *types: str) -> list[str]:
        return [p for p in self.parents[nid] if self.nodes[p]["type"] in types]


def _coerce(knob: dict, raw: Any, label: str, issues: list[str]) -> Any:
    kind = knob["kind"]
    name = f"{label} → {knob['label']}"
    if kind == "bool":
        if isinstance(raw, bool):
            return raw
        if raw in (0, 1, "true", "false"):
            return raw in (1, "true")
        issues.append(f"{name} must be on or off.")
        return knob["default"]
    if kind == "int":
        try:
            val = int(raw)
        except (TypeError, ValueError):
            issues.append(f"{name} must be a whole number.")
            return knob["default"]
        if isinstance(raw, float) and not raw.is_integer():
            issues.append(f"{name} must be a whole number.")
        if not knob["min"] <= val <= knob["max"]:
            issues.append(f"{name} must be between {knob['min']} and {knob['max']}.")
            return min(max(val, knob["min"]), knob["max"])
        return val
    if kind == "select":
        allowed = {o["value"] for o in knob["options"]}
        val = str(raw)
        if val not in allowed:
            issues.append(f"{name}: '{val}' is not an option.")
            return knob["default"]
        return val
    if kind == "text":
        if not isinstance(raw, str) or len(raw) > 200:
            issues.append(f"{name} must be text under 200 characters.")
            return knob["default"]
        return raw.strip()
    return raw


def build_graph(design: Design, palette: set[str] | None = None) -> Graph:
    issues: list[str] = []
    warnings: list[str] = []
    nodes: dict[str, dict[str, Any]] = {}

    for n in design.nodes:
        if n.id in nodes:
            issues.append(f"Duplicate component id '{n.id}'.")
            continue
        if n.type not in COMPONENT_TYPES:
            issues.append(f"Unknown component type '{n.type}'.")
            continue
        if palette is not None and n.type != "users" and n.type not in palette:
            issues.append(f"{CATALOG[n.type]['label']} is not available in this lab.")
            continue
        label = (n.label or CATALOG[n.type]["label"]).strip() or CATALOG[n.type]["label"]
        cfg = default_config(n.type)
        for knob in CATALOG[n.type]["knobs"]:
            if knob["key"] in n.config:
                cfg[knob["key"]] = _coerce(knob, n.config[knob["key"]], label, issues)
        nodes[n.id] = {"type": n.type, "label": label, "cfg": cfg}

    users = [nid for nid, n in nodes.items() if n["type"] == "users"]
    if len(users) != 1:
        issues.append("A design needs exactly one Users node.")

    children: dict[str, list[str]] = {nid: [] for nid in nodes}
    parents: dict[str, list[str]] = {nid: [] for nid in nodes}
    seen: set[tuple[str, str]] = set()
    for e in design.edges:
        if e.source not in nodes or e.target not in nodes:
            continue  # dangling edge from a removed node: ignore silently
        if e.source == e.target:
            issues.append(f"{nodes[e.source]['label']} cannot connect to itself.")
            continue
        if (e.source, e.target) in seen:
            continue
        s_type, t_type = nodes[e.source]["type"], nodes[e.target]["type"]
        if t_type not in ALLOWED_EDGES[s_type]:
            issues.append(f"{nodes[e.source]['label']} → {nodes[e.target]['label']} is not a valid connection.")
            continue
        seen.add((e.source, e.target))
        children[e.source].append(e.target)
        parents[e.target].append(e.source)

    if issues:
        raise DesignInvalid(issues)

    # topological sort (Kahn); a cycle means some nodes never reach in-degree 0
    indeg = {nid: len(parents[nid]) for nid in nodes}
    queue = [nid for nid, d in indeg.items() if d == 0]
    order: list[str] = []
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for c in children[nid]:
            indeg[c] -= 1
            if indeg[c] == 0:
                queue.append(c)
    if len(order) != len(nodes):
        raise DesignInvalid(["The design has a loop. Requests must flow one way, from Users to storage."])

    users_id = users[0]
    reachable: set[str] = set()
    stack = [users_id]
    while stack:
        nid = stack.pop()
        if nid in reachable:
            continue
        reachable.add(nid)
        stack.extend(children[nid])
    for nid, n in nodes.items():
        if nid not in reachable:
            warnings.append(f"{n['label']} is not connected to Users, so it receives no traffic.")

    for nid, n in nodes.items():
        cfg = n["cfg"]
        if n["type"] == "database" and cfg["failover"] and cfg["replicas"] == 0:
            warnings.append(f"{n['label']}: automatic failover needs at least one read replica.")
        if n["type"] == "app_server":
            if cfg["autoscaling"] and cfg["max_instances"] < cfg["instances"]:
                warnings.append(f"{n['label']}: autoscaling max is below the starting instance count.")
            if cfg["instances"] > 1 and "users" in {nodes[p]["type"] for p in parents[nid]} \
                    and not any(nodes[p]["type"] == "load_balancer" for p in parents[nid]):
                warnings.append(f"{n['label']}: without a load balancer, users only reach one instance.")
        if n["type"] == "queue" and not children[nid]:
            warnings.append(f"{n['label']} has no workers, so messages pile up forever.")

    return Graph(nodes=nodes, children=children, parents=parents, order=order, users_id=users_id,
                 warnings=warnings)
