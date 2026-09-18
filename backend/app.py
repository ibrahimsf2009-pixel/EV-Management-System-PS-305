"""GridPulse Flask backend.

REST API + static hosting for the vanilla-JS frontend. Endpoints:

    GET  /api/health               -> persistence mode + version
    GET  /api/state                -> full simulation state + live allocation
    POST /api/state                -> save grid inputs (gridCapacity,
                                      buildingDemand, solarGeneration)
    POST /api/vehicles             -> add a vehicle
    DELETE /api/vehicles/<id>      -> remove a vehicle
    POST /api/reset                -> reset to the demo fleet + normal preset

The allocation itself runs through backend/allocation.py — the same
deterministic engine verified 1:1 against the original TypeScript
implementation (scripts/diff-test.py).
"""

from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory

import allocation
from database import build_store

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"

app = Flask(__name__, static_folder=None)

store = build_store()

DEMO_VEHICLES = [
    {"id": "EV-07", "battery": 18, "target": 85, "departure": "09:15", "maxPower": 11, "batteryPackKwh": 64},
    {"id": "EV-03", "battery": 42, "target": 80, "departure": "11:30", "maxPower": 7, "batteryPackKwh": 58},
    {"id": "EV-11", "battery": 76, "target": 90, "departure": "16:45", "maxPower": 7, "batteryPackKwh": 75},
    {"id": "EV-04", "battery": 63, "target": 90, "departure": "14:20", "maxPower": 11, "batteryPackKwh": 82},
    {"id": "EV-09", "battery": 31, "target": 75, "departure": "12:10", "maxPower": 7, "batteryPackKwh": 60},
]

NORMAL_PRESET = {"gridCapacity": 50, "buildingDemand": 17, "solarGeneration": 17}


def _now_minutes() -> int:
    now = datetime.now()
    return now.hour * 60 + now.minute


def _clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def _clean_vehicle(raw: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """Validate + normalize an incoming vehicle payload."""
    import re

    vehicle_id = str(raw.get("id", "")).strip().upper()
    if not vehicle_id:
        return None, "Vehicle ID is required."
    if not re.fullmatch(r"[A-Z0-9-]{1,16}", vehicle_id):
        return None, "ID may only contain A-Z, 0-9 and dashes (max 16 chars)."

    battery = float(raw.get("battery", 0))
    target = float(raw.get("target", 0))
    max_power = float(raw.get("maxPower", 0))
    pack = float(raw.get("batteryPackKwh", 0))
    departure = str(raw.get("departure", "12:00"))

    if not all(math.isfinite(x) for x in (battery, target, max_power, pack)):
        return None, "Numeric fields must be finite numbers."

    return (
        {
            "id": vehicle_id,
            "battery": _clamp(battery, 1, 99),
            "target": _clamp(target, 1, 100),
            "departure": departure if len(departure) == 5 else "12:00",
            "maxPower": _clamp(max_power, 1, 22),
            "batteryPackKwh": _clamp(pack, 20, 200),
        },
        None,
    )


def _full_state() -> dict[str, Any]:
    """Everything the frontend needs for one render: state + allocation."""
    state = store.get_state()
    vehicles = store.list_vehicles()
    now_minutes = _now_minutes()

    result = allocation.allocate(
        vehicles,
        state["gridCapacity"],
        state["buildingDemand"],
        state["solarGeneration"],
        now_minutes,
    )
    ev_load = result["totalAllocatedKw"]
    derived = allocation.compute_derived(
        state["gridCapacity"], state["buildingDemand"],
        state["solarGeneration"], ev_load,
    )

    cluster = {
        **state,
        "nowMinutes": now_minutes,
        **result,
        "evCount": len(vehicles),
    }
    explanations = {
        a["id"]: explain_ex(a, cluster) for a in result["allocations"]
    }

    return {
        "state": state,
        "vehicles": vehicles,
        "nowMinutes": now_minutes,
        "allocation": result,
        "derived": derived,
        "explanations": explanations,
        "persistMode": store.mode,
        "scenario": "custom",
    }


def explain_ex(a: dict[str, Any], cluster: dict[str, Any]) -> dict[str, Any]:
    from explain import explain

    return explain(a, cluster)


# ── API routes ───────────────────────────────────────────────────────────────


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "persistence": store.mode, "engine": "python/1.0"})


@app.get("/api/state")
def get_state():
    return jsonify(_full_state())


@app.post("/api/state")
def save_state():
    body = request_json()
    state = store.get_state()
    grid = body.get("gridCapacity", state["gridCapacity"])
    building = body.get("buildingDemand", state["buildingDemand"])
    solar = body.get("solarGeneration", state["solarGeneration"])
    store.save_state(
        _clamp(float(grid), 30, 90),
        _clamp(float(building), 5, 60),
        _clamp(float(solar), 0, 50),
    )
    return jsonify(_full_state())


@app.post("/api/vehicles")
def add_vehicle():
    body = request_json()
    vehicle, error = _clean_vehicle(body)
    if error:
        return jsonify({"error": error}), 400
    if any(v["id"] == vehicle["id"] for v in store.list_vehicles()):
        return jsonify({"error": f"A vehicle with ID {vehicle['id']} is already connected."}), 400
    store.upsert_vehicle(vehicle)
    return jsonify(_full_state()), 201


@app.delete("/api/vehicles/<vehicle_id>")
def remove_vehicle(vehicle_id: str):
    store.delete_vehicle(vehicle_id.upper())
    return jsonify(_full_state())


@app.post("/api/reset")
def reset():
    if store.mode == "memory":
        store.vehicles = [dict(v) for v in DEMO_VEHICLES]
        store.save_state(
            NORMAL_PRESET["gridCapacity"],
            NORMAL_PRESET["buildingDemand"],
            NORMAL_PRESET["solarGeneration"],
        )
    else:
        with store._cur() as cur:
            cur.execute("DELETE FROM vehicles")
            cur.executemany(
                "INSERT INTO vehicles (id, battery, target, departure, "
                "max_power, battery_pack_kwh) VALUES (%s,%s,%s,%s,%s,%s)",
                [
                    (v["id"], v["battery"], v["target"], v["departure"],
                     v["maxPower"], v["batteryPackKwh"])
                    for v in DEMO_VEHICLES
                ],
            )
        store.save_state(
            NORMAL_PRESET["gridCapacity"],
            NORMAL_PRESET["buildingDemand"],
            NORMAL_PRESET["solarGeneration"],
        )
    return jsonify(_full_state())


def request_json() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# ── static frontend ──────────────────────────────────────────────────────────


@app.get("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    full = FRONTEND / path
    if full.is_file():
        return send_from_directory(FRONTEND, path)
    # SPA-ish fallback: serve the shell for unknown non-asset paths
    if "." not in path:
        return send_from_directory(FRONTEND, "index.html")
    return jsonify({"error": "not found"}), 404


if __name__ == "__main__":
    print("[GridPulse] starting on http://127.0.0.1:8000", flush=True)
    app.run(host="127.0.0.1", port=8000, debug=False)
