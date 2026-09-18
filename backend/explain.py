"""Plain-English EV status explanations.

Generates simple, honest explanations from the REAL allocation data — never
hardcoded to one scenario. Every sentence is derived from actual conditions:
granted power, cluster budget, solar contribution, battery level, departure
proximity, and deadline risk.

For each EV the generator answers:
  1. What is happening right now?      -> headline
  2. Why is it happening?              -> why (labeled factors)
  3. What is the system doing about it?-> action
  4. Will it reach its target in time? -> outlook
  5. What the user should understand   -> expanded (longer detail)

The wording is generated from actual conditions; nothing is templated to a
single scenario. This is a simulation/energy-management dashboard — the
wording never claims physical control of a real charger.
"""

from __future__ import annotations

from typing import Any


def _num(value: float) -> str:
    """Format a number like JavaScript would for UI text (3.0 -> '3')."""
    if value == int(value):
        return str(int(value))
    return f"{value:g}"


def _urgency_label(value: float) -> str:
    if value >= 0.75:
        return "High"
    if value >= 0.4:
        return "Medium"
    return "Low"


def _time_of_day(minutes: int) -> str:
    hours, mins = divmod(minutes, 60)
    suffix = "AM" if hours < 12 else "PM"
    display = hours % 12 or 12
    return f"{display}:{mins:02d} {suffix}"


def explain(
    allocation: dict[str, Any],
    cluster: dict[str, Any],
) -> dict[str, Any]:
    """Build the human-readable explanation block for one allocation.

    `cluster` carries the fleet-level context: gridCapacity,
    buildingDemand, solarGeneration, availableChargingCapacityKw,
    totalAllocatedKw, evCount.
    """
    status = allocation["status"]
    power = allocation["power"]
    max_power = allocation["maxPower"]
    battery = allocation["battery"]
    target = allocation["target"]
    departure = allocation["departure"]
    needed = allocation["energyNeededKwh"]
    budget = cluster["availableChargingCapacityKw"]
    solar = cluster["solarGeneration"]
    building = cluster["buildingDemand"]
    factors = allocation["priorityFactors"]
    notes = allocation.get("notes") or []
    now_minutes = cluster.get("nowMinutes", 0)

    solar_helping = min(solar, budget) if budget > 0 else 0
    at_risk = bool(notes)
    charging = power > 0

    # ── 1. Headline: what is happening right now ────────────────────────────
    if status == "completed":
        headline = (
            f"Charging complete: the battery has reached the requested "
            f"target ({_num(target)}%)."
        )
    elif status == "waiting":
        headline = (
            "Charging paused: there is currently no safe charging capacity "
            "available."
        )
    elif status == "scheduled":
        headline = (
            "Waiting in the queue: other EVs have higher priority right now, "
            "so charging has not started yet."
        )
    elif status == "constraint-limited":
        headline = (
            f"Charging is limited to {_num(power)} kW because the building "
            "and other loads are using most of the available grid capacity."
        )
    elif status == "throttled":
        headline = (
            f"Power is being shared with other EVs to keep the building "
            f"within its safe grid limit — charging at {_num(power)} kW."
        )
    else:  # charging at full rate
        headline = (
            f"Charging normally at {_num(power)} kW. There is enough "
            "available power to charge this EV at its full rate."
        )

    # ── 2. Why: labeled factors in simple terms ─────────────────────────────
    why: list[dict[str, str]] = []
    if status != "completed":
        why.append({
            "label": "Battery urgency",
            "value": _urgency_label(factors["batteryUrgency"]),
        })
        why.append({
            "label": "Departure urgency",
            "value": _urgency_label(factors["departureUrgency"]),
        })
        grid_load = building - solar
        if grid_load >= cluster["gridCapacity"] * 0.8:
            grid_state = "Heavily used"
        elif grid_load >= cluster["gridCapacity"] * 0.5:
            grid_state = "Limited"
        else:
            grid_state = "Healthy"
        why.append({"label": "Grid availability", "value": grid_state})
        if solar > 0:
            why.append({
                "label": "Solar contribution",
                "value": f"{_num(solar)} kW",
            })

    # ── 3. Action: what the system is doing about it ────────────────────────
    if status == "completed":
        action = "No action needed — this EV is done and its share of power has been released to the others."
    elif status == "waiting":
        action = "GridPulse will start charging automatically as soon as headroom returns — nothing to do."
    elif status == "scheduled":
        action = "Holding a reserved share — charging begins as higher-priority EVs finish or depart."
    elif status == "throttled":
        action = (
            f"Sharing the remaining {_num(budget)} kW fairly across "
            f"{cluster['evCount']} EVs, weighted by priority."
        )
    elif status == "constraint-limited":
        action = (
            f"Keeping total demand within the {_num(cluster['gridCapacity'])} kW "
            "grid limit by capping this charger."
        )
    elif at_risk:
        action = (
            f"Charging at full rate, but the clock is tight — GridPulse is "
            "prioritizing this EV."
        )
    else:
        action = f"Serving at the charger's full {_num(max_power)} kW rate."

    # ── 4. Outlook: will it reach target before departure? ──────────────────
    eta = allocation.get("etaMinutesFromNow")
    dep_minutes = _parse_departure_minutes(departure)
    minutes_to_departure = max(0, dep_minutes - now_minutes) if dep_minutes is not None else None

    if status == "completed":
        outlook = {
            "state": "complete",
            "text": "Target already reached — no more charging needed.",
        }
    elif at_risk:
        outlook = {
            "state": "at-risk",
            "text": (
                f"Target may not be reached before the {_time_of_day(dep_minutes) if dep_minutes is not None else departure} "
                "departure with the current available power."
            ),
        }
    elif status == "waiting":
        outlook = {
            "state": "waiting",
            "text": "Cannot estimate until capacity frees up.",
        }
    elif status == "scheduled":
        outlook = {
            "state": "queued",
            "text": "Starts charging when the queue clears — estimate pending.",
        }
    elif charging and eta is not None:
        outlook = {
            "state": "on-track",
            "text": (
                f"On track: reaches {_num(target)}% in about "
                f"{_eta_text(eta)} — before the "
                f"{_time_of_day(dep_minutes) if dep_minutes is not None else departure} departure."
            ),
        }
    else:
        outlook = {"state": "unknown", "text": "No estimate available right now."}

    # ── 5. Expanded detail (the "why?" a user can click open) ───────────────
    expanded_parts: list[str] = [headline]
    if status == "throttled":
        expanded_parts.append(
            f"GridPulse reduced charging from {_num(max_power)} kW to "
            f"{_num(power)} kW because building demand ({_num(building)} kW) "
            f"and other EVs are using most of the available capacity."
        )
    elif status == "constraint-limited":
        expanded_parts.append(
            f"Even alone, the grid could only offer {_num(budget)} kW beyond "
            f"the building's {_num(building)} kW demand right now."
        )
    elif status == "waiting":
        expanded_parts.append(
            f"The building is consuming the full {_num(cluster['gridCapacity'])} kW "
            "grid budget, so EV charging is safely paused."
        )
    elif status == "charging" and not at_risk:
        expanded_parts.append(
            f"Available charging capacity is {_num(budget)} kW — plenty for "
            f"this EV's full rate."
        )
    if solar > 0 and budget > 0:
        expanded_parts.append(
            f"Solar is providing {_num(solar)} kW of the available charging "
            "capacity, allowing more EVs to charge."
        )
    if battery <= 20 and status != "completed":
        expanded_parts.append(
            f"High priority: the battery is very low ({_num(battery)}%), so "
            "GridPulse is giving this EV higher priority."
        )
    if factors["departureUrgency"] >= 0.95 and status != "completed":
        expanded_parts.append(
            "Departure is approaching, so this EV is receiving higher "
            "priority to help reach its target in time."
        )
    for note in notes:
        expanded_parts.append(note)
    expanded = " ".join(expanded_parts)

    # Compact collapsed line (the one shown on the row)
    if status == "completed":
        collapsed = headline
    elif at_risk:
        collapsed = (
            f"⚠ May miss its {_time_of_day(dep_minutes) if dep_minutes is not None else departure} "
            f"departure target at {_num(power)} kW."
        )
    elif status == "throttled":
        collapsed = (
            f"⚡ Charging limited — power shared with other EVs "
            f"({_num(power)} kW)."
        )
    elif status == "constraint-limited":
        collapsed = (
            f"⚡ Charging limited because grid capacity is low "
            f"({_num(power)} kW)."
        )
    elif status == "waiting":
        collapsed = "⏸ Paused — no safe charging capacity right now."
    elif status == "scheduled":
        collapsed = "⏳ Queued — waiting for higher-priority EVs."
    else:
        collapsed = f"⚡ Charging normally at {_num(power)} kW."

    return {
        "collapsed": collapsed,
        "expanded": expanded,
        "why": why,
        "action": action,
        "outlook": outlook,
        "flow": _flow(cluster, status),
    }


def _eta_text(minutes: int) -> str:
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    rest = minutes % 60
    return f"{hours} h" if rest == 0 else f"{hours} h {rest} min"


def _parse_departure_minutes(departure: str) -> int | None:
    try:
        hours_s, minutes_s = departure.split(":")
        hours, minutes = int(hours_s), int(minutes_s)
    except (ValueError, AttributeError):
        return None
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        return None
    return hours * 60 + minutes


def _flow(cluster: dict[str, Any], status: str) -> dict[str, Any]:
    """Compact Solar → Grid → Controller → EV flow state for the UI."""
    if status == "completed":
        state = "complete"
    elif status == "waiting":
        state = "paused"
    elif status == "scheduled":
        state = "queued"
    elif status in ("throttled", "constraint-limited"):
        state = "limited"
    else:
        state = "available"
    return {
        "state": state,
        "solarKw": cluster["solarGeneration"],
        "buildingKw": cluster["buildingDemand"],
        "budgetKw": cluster["availableChargingCapacityKw"],
        "gridCapacityKw": cluster["gridCapacity"],
    }
