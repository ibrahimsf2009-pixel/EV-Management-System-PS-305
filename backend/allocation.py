"""GridPulse charging allocation engine.

Deterministic optimization/control logic ported 1:1 from the TypeScript
implementation (src/lib/grid/allocation.ts). Identical inputs always produce
identical decisions; every decision carries the factors and reasons that
produced it so the UI can explain itself.

Grid safety invariant:
    building demand + EV charging - solar generation <= grid capacity

The cluster budget is derived as:
    available = max(0, grid_capacity - building_demand + solar_generation)
so the invariant holds by construction.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

# ── Policy constants (identical to the TypeScript engine) ────────────────────
DEPARTURE_HORIZON_MINUTES = 480  # 8h linear ramp for departure urgency
CRITICAL_BATTERY = 20  # battery% at/below which urgency saturates
DEADLINE_RISK_BUFFER_MINUTES = 15  # deadline-risk buffer before departure
DEFAULT_DEPARTURE_MINUTES = 12 * 60  # 12:00 fallback for malformed times

EPS = 1e-9

CHARGING_STATUSES = (
    "charging",
    "waiting",
    "scheduled",
    "completed",
    "throttled",
    "constraint-limited",
)


def clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def round1(value: float) -> float:
    """Round to one decimal for display-stable numbers."""
    return round(value, 1)


def floor1(value: float) -> float:
    """Floor to one decimal so rounded grants never sum ABOVE the budget."""
    return max(0.0, math.floor(value * 10) / 10)


def js_num(value: float) -> str:
    """Format a float the way JavaScript's default Number->string does.

    3.0 -> "3", 3.5 -> "3.5", 14.0 -> "14". Used inside reason strings so
    they render identically to the original TypeScript UI.
    """
    if value == int(value) and abs(value) < 1e21:
        return str(int(value))
    return repr(value)


def parse_departure(departure: str) -> int:
    """Parse 'HH:MM' into minutes since midnight, with a sane fallback."""
    try:
        parts = departure.split(":")
        if len(parts) != 2:
            return DEFAULT_DEPARTURE_MINUTES
        hours, minutes = int(parts[0]), int(parts[1])
    except (ValueError, AttributeError):
        return DEFAULT_DEPARTURE_MINUTES
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        return DEFAULT_DEPARTURE_MINUTES
    return hours * 60 + minutes


def minutes_of_day(now_minutes: int | None = None) -> int:
    return now_minutes if now_minutes is not None else 0


def energy_needed_kwh(vehicle: dict[str, Any]) -> float:
    """kWh still required to reach target: (target% - battery%) x pack / 100."""
    deficit_percent = max(0.0, vehicle["target"] - vehicle["battery"])
    return (deficit_percent / 100) * vehicle["batteryPackKwh"]


def minutes_to_target(energy_kwh: float, power_kw: float) -> float | None:
    """Minutes of charging at power_kw needed to reach target.

    None when power is zero or no energy is needed.
    """
    if power_kw <= 0 or energy_kwh <= 0:
        return None
    return (energy_kwh / power_kw) * 60


def priority_factors(vehicle: dict[str, Any], now_minutes: int) -> dict[str, float]:
    """Raw normalized (0-1) priority factors for one vehicle."""
    departure_minutes = parse_departure(vehicle["departure"])

    # Time until departure; a vehicle past its departure time is maximally
    # urgent (zero minutes left).
    minutes_to_departure = max(0, departure_minutes - now_minutes)

    battery_urgency = clamp(
        (100 - vehicle["battery"]) / (100 - CRITICAL_BATTERY), 0, 1
    )

    departure_urgency = 1 - clamp(
        minutes_to_departure / DEPARTURE_HORIZON_MINUTES, 0, 1
    )

    # Deadline risk: if charging at max power cannot reach target before
    # departure (with a small buffer), urgency saturates at 1.
    needed = energy_needed_kwh(vehicle)
    fastest_minutes = minutes_to_target(needed, vehicle["maxPower"])
    if (
        fastest_minutes is not None
        and minutes_to_departure > 0
        and fastest_minutes + DEADLINE_RISK_BUFFER_MINUTES >= minutes_to_departure
    ):
        departure_urgency = 1
    # Already past departure with energy still missing: maximally urgent.
    if minutes_to_departure == 0 and needed > 0:
        departure_urgency = 1

    energy_deficit = (
        clamp((vehicle["target"] - vehicle["battery"]) / vehicle["target"], 0, 1)
        if vehicle["target"] > 0
        else 0.0
    )

    return {
        "batteryUrgency": battery_urgency,
        "departureUrgency": departure_urgency,
        "energyDeficit": energy_deficit,
    }


def score_vehicle(vehicle: dict[str, Any], now_minutes: int) -> int:
    """Composite priority score 0-100.

    40% battery + 35% departure + 25% deficit. Weights are policy, stated
    openly here.
    """
    factors = priority_factors(vehicle, now_minutes)
    composite = (
        factors["batteryUrgency"] * 0.4
        + factors["departureUrgency"] * 0.35
        + factors["energyDeficit"] * 0.25
    )
    # JavaScript Math.round(-0.5) -> 0 (rounds toward +Infinity); Python
    # round() uses banker's rounding. Match the JS behavior exactly.
    return math.floor(composite * 100 + 0.5)


def priority_reason(vehicle: dict[str, Any], factors: dict[str, float]) -> str:
    """Plain-language explanation of WHY the vehicle has its priority."""
    battery_urgency = factors["batteryUrgency"]
    departure_urgency = factors["departureUrgency"]
    energy_deficit = factors["energyDeficit"]

    if vehicle["battery"] <= CRITICAL_BATTERY:
        return (
            f"Critical battery ({vehicle['battery']}%) — near-empty vehicles "
            "are served first."
        )
    if departure_urgency >= 0.95:
        return (
            f"Departure at {vehicle['departure']} is close and there may not "
            "be enough time to finish charging."
        )
    if departure_urgency >= 0.6:
        return (
            f"Departure at {vehicle['departure']} is approaching — needs its "
            "charge soon."
        )
    if battery_urgency >= 0.6:
        return f"Battery is getting low ({vehicle['battery']}%)."
    if energy_deficit >= 0.5:
        return (
            f"Large remaining charge ({vehicle['battery']}% → "
            f"{vehicle['target']}%)."
        )
    return (
        f"Comfortable margins — battery {vehicle['battery']}%, "
        f"departs {vehicle['departure']}."
    )


def classify_status(
    granted: float,
    vehicle: dict[str, Any],
    sharing_with_peers: bool,
    cluster_has_capacity: bool,
) -> str:
    """Status classification, identical semantics to the TypeScript engine."""
    if granted >= vehicle["maxPower"] - EPS:
        return "charging"
    if granted > EPS:
        return "throttled" if sharing_with_peers else "constraint-limited"
    return "scheduled" if cluster_has_capacity else "waiting"


def power_reason(
    granted: float,
    vehicle: dict[str, Any],
    status: str,
    phase_b_budget_kw: float,
    peer_count: int,
) -> str:
    """Plain-language explanation of WHY the vehicle got its power level."""
    if status == "charging":
        return f"Full {vehicle['maxPower']} kW rate — grid headroom allowed it."
    if status == "throttled":
        unit = "vehicle" if peer_count == 1 else "vehicles"
        return (
            f"Charging reduced to {js_num(granted)} kW of {vehicle['maxPower']} kW — "
            f"the remaining {js_num(round1(phase_b_budget_kw))} kW of headroom is "
            f"shared with {peer_count} other {unit}, weighted by priority."
        )
    if status == "constraint-limited":
        return (
            f"Capped at {js_num(granted)} kW — even alone, the grid could only offer "
            f"{js_num(round1(phase_b_budget_kw))} kW beyond building demand right now."
        )
    if status == "scheduled":
        return (
            "Queued behind higher-priority vehicles — charging begins as "
            "they finish or depart."
        )
    if status == "waiting":
        return (
            "No charging capacity available — building demand is using the "
            "entire grid budget. Charging starts when headroom returns."
        )
    return "Charging complete — no energy required."


@dataclass
class _Pending:
    vehicle: dict[str, Any]
    factors: dict[str, float]
    score: int
    granted: float = 0.0


def allocate(
    vehicles: list[dict[str, Any]],
    grid_capacity: float,
    building_demand: float,
    solar_generation: float,
    now_minutes: int,
) -> dict[str, Any]:
    """THE ALLOCATOR — deterministic two-phase allocation.

    Phase A: priority service at full rate while headroom allows.
    Phase B: priority-weighted fair sharing (water-filling) of what remains.
    """
    # ── Step 1: cluster budget ────────────────────────────────────────────
    # available = gridCapacity - buildingLoad + renewable (see module docstring
    # for the invariant derivation). Clamped at 0: never invent power.
    available = max(0.0, grid_capacity - building_demand + solar_generation)
    cluster_has_capacity = available > EPS

    # ── Step 2: deterministic priority order ──────────────────────────────
    scored = sorted(
        (
            {
                "vehicle": vehicle,
                "factors": priority_factors(vehicle, now_minutes),
                "score": score_vehicle(vehicle, now_minutes),
            }
            for vehicle in vehicles
        ),
        key=lambda entry: (-entry["score"], entry["vehicle"]["id"]),
    )

    def build_allocation(
        entry: dict[str, Any],
        granted_precise: float,
        status: str,
        phase_b_budget_kw: float,
        peer_count: int,
    ) -> dict[str, Any]:
        vehicle = entry["vehicle"]
        factors = entry["factors"]
        energy_needed = energy_needed_kwh(vehicle)
        # Floor to 0.1 kW: rounding must never push total draw above budget.
        power = floor1(granted_precise)
        eta_minutes = minutes_to_target(energy_needed, power)
        minutes_to_departure = max(0, parse_departure(vehicle["departure"]) - now_minutes)

        notes: list[str] = []
        if (
            power > 0
            and eta_minutes is not None
            and minutes_to_departure > 0
            and eta_minutes + DEADLINE_RISK_BUFFER_MINUTES >= minutes_to_departure
        ):
            notes.append(
                f"At {js_num(power)} kW it will not reach {vehicle['target']}% before "
                f"its {vehicle['departure']} departure."
            )

        allocation: dict[str, Any] = dict(vehicle)
        allocation.update(
            priority=entry["score"],
            priorityFactors=factors,
            power=power,
            energyNeededKwh=round1(energy_needed),
            status=status,
            etaMinutesFromNow=(
                None if eta_minutes is None else max(1, math.floor(eta_minutes + 0.5))
            ),
            capacityBudgetKw=round1(available),
            servedOrder=-1,
            priorityReason=priority_reason(vehicle, factors),
            powerReason=power_reason(
                power, vehicle, status, phase_b_budget_kw, peer_count
            ),
            notes=notes,
        )
        return allocation

    # ── Completed vehicles need nothing — they free their share ───────────
    completed_allocs = []
    for entry in scored:
        if energy_needed_kwh(entry["vehicle"]) <= EPS:
            vehicle = entry["vehicle"]
            completed_allocs.append(
                {
                    **vehicle,
                    "priority": entry["score"],
                    "priorityFactors": entry["factors"],
                    "power": 0,
                    "energyNeededKwh": 0,
                    "status": "completed",
                    "etaMinutesFromNow": None,
                    "capacityBudgetKw": round1(available),
                    "servedOrder": -1,
                    "priorityReason": (
                        f"Target reached — battery {vehicle['battery']}% ≥ "
                        f"target {vehicle['target']}%."
                    ),
                    "powerReason": "Charging complete — no energy required.",
                    "notes": [],
                }
            )

    active = [entry for entry in scored if energy_needed_kwh(entry["vehicle"]) > EPS]
    served: list[dict[str, Any]] = []
    unserved: list[dict[str, Any]] = []

    remaining = available

    # ── Step 3a: priority service (Phase A) ───────────────────────────────
    cursor = 0
    while cursor < len(active):
        entry = active[cursor]
        if entry is None or remaining < entry["vehicle"]["maxPower"] - EPS:
            break
        served.append(
            build_allocation(entry, entry["vehicle"]["maxPower"], "charging", 0, 0)
        )
        remaining = max(0.0, remaining - entry["vehicle"]["maxPower"])
        cursor += 1

    # ── Step 3b: weighted fair share (Phase B) ────────────────────────────
    phase_b_budget_kw = remaining
    pending: list[_Pending] = [
        _Pending(entry["vehicle"], entry["factors"], entry["score"])
        for entry in active[cursor:]
    ]

    round_index = 0
    while round_index <= len(pending) and remaining > EPS:
        open_pending = [p for p in pending if p.vehicle["maxPower"] - p.granted > EPS]
        if not open_pending:
            break

        total_weight = sum(max(1, p.score) for p in open_pending)
        snapshot = remaining
        pool = snapshot
        progressed = False

        for p in open_pending:
            weight = max(1, p.score)
            want = p.vehicle["maxPower"] - p.granted
            share = (snapshot * weight) / total_weight
            give = min(want, share)
            if give > EPS:
                p.granted += give
                pool -= give
                progressed = True

        remaining = max(0.0, pool)
        if not progressed:
            break
        round_index += 1

    for p in pending:
        status = classify_status(
            granted=p.granted,
            vehicle=p.vehicle,
            sharing_with_peers=len(pending) > 1,
            cluster_has_capacity=cluster_has_capacity,
        )
        entry = {"vehicle": p.vehicle, "factors": p.factors, "score": p.score}
        target = served if p.granted > EPS else unserved
        target.append(
            build_allocation(
                entry,
                p.granted,
                status,
                phase_b_budget_kw,
                max(0, len(pending) - 1),
            )
        )

    # Final order: charging first (serving order), then queued, then done.
    allocations = [*served, *unserved, *completed_allocs]
    for index, allocation in enumerate(allocations):
        if allocation["power"] > 0:
            allocation["servedOrder"] = index

    # ── Step 4: cluster-level facts for the UI ────────────────────────────
    total_allocated = round1(sum(a["power"] for a in served))
    return {
        "allocations": allocations,
        "availableChargingCapacityKw": round1(available),
        "totalAllocatedKw": total_allocated,
        "chargingCount": len(served),
        "completedCount": len(completed_allocs),
    }


def compute_derived(
    grid_capacity: float,
    building_demand: float,
    solar_generation: float,
    ev_load: float,
) -> dict[str, float]:
    """Cluster-level derived metrics (port of derived.ts).

    Import semantics: the transformer carries building + ev - solar. Solar
    can push import below zero (export), clamped where a demand reading
    would be meaningless.
    """
    grid_import = building_demand + ev_load - solar_generation
    total_demand = max(0.0, grid_import)
    headroom = max(0.0, grid_capacity - grid_import)
    utilization = (
        math.floor(max(0.0, grid_import) / grid_capacity * 100 + 0.5)
        if grid_capacity
        else 0
    )
    renewable_share = min(
        100,
        math.floor(solar_generation / max(1, building_demand + ev_load) * 100 + 0.5),
    )
    solar_surplus = max(0.0, solar_generation - building_demand)
    clean_charging = min(ev_load, solar_generation)

    return {
        "gridImport": grid_import,
        "totalDemand": total_demand,
        "headroom": headroom,
        "utilization": utilization,
        "renewableShare": renewable_share,
        "solarSurplus": solar_surplus,
        "cleanCharging": clean_charging,
    }


def format_eta(allocation: dict[str, Any]) -> str:
    """Human-readable completion estimate, or an honest explanation."""
    if allocation["status"] == "completed":
        return "Done"
    eta = allocation.get("etaMinutesFromNow")
    if eta is None:
        return "—" if allocation["power"] > 0 else "Not charging"
    minutes = eta
    if minutes < 60:
        return f"~{minutes} min"
    hours = minutes // 60
    rest = minutes % 60
    return f"~{hours} h" if rest == 0 else f"~{hours} h {rest} min"
