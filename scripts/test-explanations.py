"""Explanation scenario sweep — validates the plain-English generator across
the ten conditions required by the feature spec:

    normal charging / low battery / near departure / limited grid capacity /
    high building demand / high solar generation / no charging capacity /
    shared charging / target reached / EV at risk of missing target

Uses Flask's test client directly (no live server needed).
"""

import os
import sys
from pathlib import Path

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import app  # noqa: E402  (starts with the in-memory store)


def expect(condition: bool, label: str, detail: str = "") -> bool:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def main() -> int:
    client = app.test_client()
    failures = 0

    def reset_state(grid=50, building=17, solar=17):
        client.post("/api/state", json={
            "gridCapacity": grid, "buildingDemand": building, "solarGeneration": solar,
        })

    print("1. Normal charging")
    client.post("/api/reset")
    s = client.get("/api/state").get_json()
    ev07 = next(a for a in s["allocation"]["allocations"] if a["id"] == "EV-07")
    ex = s["explanations"]["EV-07"]
    failures += not expect(
        ev07["status"] == "charging" and "Charging normally" in ex["collapsed"],
        "full-rate EV says 'Charging normally'",
        ex["collapsed"],
    )

    print("2. Low battery (critical <= 20%)")
    failures += not expect(
        "High priority: the battery is very low" in ex["expanded"],
        "low battery flagged as high priority in expanded text",
    )

    print("3. Near departure (deadline risk)")
    client.post("/api/vehicles", json={
        "id": "EV-URGENT", "battery": 20, "target": 95, "departure": _soon(),
        "maxPower": 7, "batteryPackKwh": 60,
    })
    s = client.get("/api/state").get_json()
    exu = s["explanations"]["EV-URGENT"]
    au = next(a for a in s["allocation"]["allocations"] if a["id"] == "EV-URGENT")
    failures += not expect(
        au["priority"] >= 65 or "Departure is approaching" in exu["expanded"]
        or "May miss" in exu["collapsed"] or "at-risk" in exu["outlook"]["state"],
        "near-departure EV gets urgent treatment",
        f"status={au['status']} collapsed={exu['collapsed']}",
    )

    print("4. Limited grid capacity (throttled)")
    client.post("/api/reset")  # drop EV-URGENT; scenario needs the clean demo fleet
    reset_state(grid=35, building=30, solar=2)
    s = client.get("/api/state").get_json()
    throttled = [
        (a, s["explanations"][a["id"]])
        for a in s["allocation"]["allocations"]
        if a["status"] == "throttled"
    ]
    failures += not expect(
        bool(throttled)
        and all(
            "shared with other EVs" in ex["collapsed"]
            or "limited" in ex["collapsed"].lower()
            or "May miss" in ex["collapsed"]  # deadline warning outranks throttled wording
            for _, ex in throttled
        ),
        "throttled EVs explain power sharing",
    )

    print("5. High building demand (waiting / no capacity)")
    client.post("/api/vehicles", json={
        "id": "EV-EXTRA", "battery": 10, "target": 90, "departure": "23:00",
        "maxPower": 22, "batteryPackKwh": 100,
    })
    reset_state(grid=30, building=60, solar=0)
    s = client.get("/api/state").get_json()
    waiting = [
        (a, s["explanations"][a["id"]])
        for a in s["allocation"]["allocations"]
        if a["status"] == "waiting"
    ]
    failures += not expect(
        bool(waiting)
        and all("Paused" in ex["collapsed"] or "no safe charging capacity" in ex["collapsed"]
                for _, ex in waiting),
        "zero-capacity EVs say paused",
        str([ex["collapsed"] for _, ex in waiting][:1]),
    )

    print("6. High solar generation")
    reset_state(grid=50, building=19, solar=34)
    s = client.get("/api/state").get_json()
    ex_any = next(iter(s["explanations"].values()))
    failures += not expect(
        "Solar is providing" in ex_any["expanded"],
        "solar contribution mentioned in expanded text",
    )

    print("7. No charging capacity (already covered) + paused flow state")
    failures += not expect(
        all(s["explanations"][a["id"]]["flow"]["state"] in ("paused", "available", "limited", "queued", "complete")
            for a in s["allocation"]["allocations"]),
        "flow states always valid",
    )

    print("8. Shared charging (throttled wording already checked)")
    client.post("/api/reset")  # drop EV-EXTRA; scenario needs the clean demo fleet
    reset_state(grid=35, building=30, solar=2)
    s = client.get("/api/state").get_json()
    thr = [s["explanations"][a["id"]] for a in s["allocation"]["allocations"] if a["status"] == "throttled"]
    failures += not expect(
        bool(thr)
        and all(
            "shared" in e["collapsed"].lower()
            or "limited" in e["collapsed"].lower()
            or "may miss" in e["collapsed"].lower()
            for e in thr
        ),
        "shared charging wording",
    )

    print("9. Target reached (completed)")
    reset_state()
    client.post("/api/vehicles", json={
        "id": "EV-DONE", "battery": 95, "target": 80, "departure": "23:00",
        "maxPower": 11, "batteryPackKwh": 60,
    })
    s = client.get("/api/state").get_json()
    exd = s["explanations"]["EV-DONE"]
    failures += not expect(
        "Charging complete" in exd["collapsed"] and exd["outlook"]["state"] == "complete",
        "completed EV says done",
        exd["collapsed"],
    )

    print("10. EV at risk of missing target")
    client.post("/api/vehicles", json={
        "id": "EV-RISK", "battery": 5, "target": 100, "departure": _soon(20),
        "maxPower": 7, "batteryPackKwh": 100,
    })
    s = client.get("/api/state").get_json()
    exr = s["explanations"]["EV-RISK"]
    ar = next(a for a in s["allocation"]["allocations"] if a["id"] == "EV-RISK")
    failures += not expect(
        (ar.get("notes") and "Target may not be reached" in exr["outlook"]["text"])
        or "May miss" in exr["collapsed"]
        or exr["outlook"]["state"] == "at-risk",
        "at-risk EV flagged honestly",
        f"notes={ar.get('notes')} outlook={exr['outlook']}",
    )

    # cleanup
    client.post("/api/reset")

    print()
    print("ALL SCENARIOS PASS" if failures == 0 else f"{failures} FAILURES")
    return 1 if failures else 0


def _soon(within_minutes: int = 45) -> str:
    """A departure time `within_minutes` from now (wraps at midnight)."""
    from datetime import datetime, timedelta

    now = datetime.now() + timedelta(minutes=within_minutes)
    return now.strftime("%H:%M")


if __name__ == "__main__":
    sys.exit(main())
