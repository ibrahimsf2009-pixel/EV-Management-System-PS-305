"""MySQL persistence layer for GridPulse.

Replaces the Supabase persistence with plain SQL against a local MySQL
server. Configuration comes from environment variables (or .env):

    MYSQL_HOST     (default 127.0.0.1)
    MYSQL_PORT     (default 3306)
    MYSQL_USER     (default root)
    MYSQL_PASSWORD (default empty)
    MYSQL_DATABASE (default gridpulse)

If MySQL is unreachable, the app falls back to an in-memory store so the
demo still runs — degraded persistence, identical API.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

try:  # optional dependency — only needed for real MySQL mode
    import mysql.connector  # type: ignore
except ImportError:  # pragma: no cover
    mysql = None  # type: ignore

# Load .env from backend/ manually (no python-dotenv dependency).
_ENV = Path(__file__).resolve().parent / ".env"
if _ENV.exists():
    for line in _ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def _cfg() -> dict[str, Any]:
    return {
        "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MYSQL_PORT", "3306")),
        "user": os.environ.get("MYSQL_USER", "root"),
        "password": os.environ.get("MYSQL_PASSWORD", ""),
        "database": os.environ.get("MYSQL_DATABASE", "gridpulse"),
    }


class MemoryStore:
    """In-memory fallback with the same surface as the MySQL store."""

    def __init__(self) -> None:
        self.vehicles: list[dict[str, Any]] = [
            {
                "id": "EV-07", "battery": 18, "target": 85, "departure": "09:15",
                "maxPower": 11, "batteryPackKwh": 64,
            },
            {
                "id": "EV-03", "battery": 42, "target": 80, "departure": "11:30",
                "maxPower": 7, "batteryPackKwh": 58,
            },
            {
                "id": "EV-11", "battery": 76, "target": 90, "departure": "16:45",
                "maxPower": 7, "batteryPackKwh": 75,
            },
            {
                "id": "EV-04", "battery": 63, "target": 90, "departure": "14:20",
                "maxPower": 11, "batteryPackKwh": 82,
            },
            {
                "id": "EV-09", "battery": 31, "target": 75, "departure": "12:10",
                "maxPower": 7, "batteryPackKwh": 60,
            },
        ]
        self.state: dict[str, float] = {
            "gridCapacity": 50, "buildingDemand": 17, "solarGeneration": 17,
        }
        self.readings: list[dict[str, Any]] = []
        self.allocations_log: list[dict[str, Any]] = []
        self.sessions: list[dict[str, Any]] = []

    # -- vehicles ------------------------------------------------------------
    def list_vehicles(self) -> list[dict[str, Any]]:
        return [dict(v) for v in self.vehicles]

    def upsert_vehicle(self, vehicle: dict[str, Any]) -> None:
        for i, v in enumerate(self.vehicles):
            if v["id"] == vehicle["id"]:
                self.vehicles[i] = vehicle
                return
        self.vehicles.append(vehicle)

    def delete_vehicle(self, vehicle_id: str) -> None:
        self.vehicles = [v for v in self.vehicles if v["id"] != vehicle_id]

    # -- simulation state ------------------------------------------------------
    def get_state(self) -> dict[str, float]:
        return dict(self.state)

    def save_state(self, grid_capacity: float, building_demand: float,
                   solar_generation: float) -> None:
        self.state = {
            "gridCapacity": grid_capacity,
            "buildingDemand": building_demand,
            "solarGeneration": solar_generation,
        }

    # -- telemetry / logs -------------------------------------------------------
    def add_reading(self, grid_capacity: float, building_demand: float,
                    solar_generation: float, ev_load: float) -> None:
        self.readings.append({
            "gridCapacity": grid_capacity,
            "buildingDemand": building_demand,
            "solarGeneration": solar_generation,
            "evLoad": ev_load,
        })
        self.readings = self.readings[-120:]

    def add_allocation_pass(self, rows: list[dict[str, Any]]) -> None:
        self.allocations_log.extend(rows)
        self.allocations_log = self.allocations_log[-240:]

    def open_session(self, vehicle_id: str, start_battery: float) -> None:
        self.sessions.append({
            "vehicleId": vehicle_id, "startBattery": start_battery,
            "energyKwh": 0.0, "open": True,
        })

    def close_session(self, vehicle_id: str, end_battery: float,
                      reason: str) -> None:
        for s in reversed(self.sessions):
            if s["vehicleId"] == vehicle_id and s["open"]:
                s["open"] = False
                s["endBattery"] = end_battery
                s["endReason"] = reason
                return

    @property
    def mode(self) -> str:
        return "memory"


class MySQLStore:
    """Real MySQL persistence with the same surface as MemoryStore."""

    def __init__(self) -> None:
        cfg = _cfg()
        self._conn = mysql.connector.connect(  # type: ignore[union-attr]
            host=cfg["host"], port=cfg["port"], user=cfg["user"],
            password=cfg["password"], database=cfg["database"],
            autocommit=True,
        )

    def _cur(self):
        return self._conn.cursor(dictionary=True)

    # -- vehicles ------------------------------------------------------------
    def list_vehicles(self) -> list[dict[str, Any]]:
        with self._cur() as cur:
            cur.execute(
                "SELECT id, battery, target, departure, max_power, "
                "battery_pack_kwh FROM vehicles ORDER BY created_at, id"
            )
            rows = cur.fetchall()
        return [
            {
                "id": r["id"],
                "battery": float(r["battery"]),
                "target": float(r["target"]),
                "departure": r["departure"],
                "maxPower": float(r["max_power"]),
                "batteryPackKwh": float(r["battery_pack_kwh"]),
            }
            for r in rows
        ]

    def upsert_vehicle(self, vehicle: dict[str, Any]) -> None:
        with self._cur() as cur:
            cur.execute(
                "INSERT INTO vehicles (id, battery, target, departure, "
                "max_power, battery_pack_kwh) VALUES (%s,%s,%s,%s,%s,%s) "
                "ON DUPLICATE KEY UPDATE battery=VALUES(battery), "
                "target=VALUES(target), departure=VALUES(departure), "
                "max_power=VALUES(max_power), "
                "battery_pack_kwh=VALUES(battery_pack_kwh)",
                (vehicle["id"], vehicle["battery"], vehicle["target"],
                 vehicle["departure"], vehicle["maxPower"],
                 vehicle["batteryPackKwh"]),
            )

    def delete_vehicle(self, vehicle_id: str) -> None:
        with self._cur() as cur:
            cur.execute("DELETE FROM vehicles WHERE id=%s", (vehicle_id,))

    # -- simulation state ------------------------------------------------------
    def get_state(self) -> dict[str, float]:
        with self._cur() as cur:
            cur.execute(
                "SELECT grid_capacity, building_demand, solar_generation "
                "FROM simulation_state WHERE id='main'"
            )
            row = cur.fetchone()
        if not row:
            return {"gridCapacity": 50, "buildingDemand": 17,
                    "solarGeneration": 17}
        return {
            "gridCapacity": float(row["grid_capacity"]),
            "buildingDemand": float(row["building_demand"]),
            "solarGeneration": float(row["solar_generation"]),
        }

    def save_state(self, grid_capacity: float, building_demand: float,
                   solar_generation: float) -> None:
        with self._cur() as cur:
            cur.execute(
                "INSERT INTO simulation_state (id, grid_capacity, "
                "building_demand, solar_generation) VALUES ('main',%s,%s,%s) "
                "ON DUPLICATE KEY UPDATE grid_capacity=VALUES(grid_capacity), "
                "building_demand=VALUES(building_demand), "
                "solar_generation=VALUES(solar_generation)",
                (grid_capacity, building_demand, solar_generation),
            )

    # -- telemetry / logs -------------------------------------------------------
    def add_reading(self, grid_capacity: float, building_demand: float,
                    solar_generation: float, ev_load: float) -> None:
        with self._cur() as cur:
            cur.execute(
                "INSERT INTO grid_readings (grid_capacity, building_demand, "
                "solar_generation, ev_load) VALUES (%s,%s,%s,%s)",
                (grid_capacity, building_demand, solar_generation, ev_load),
            )

    def latest_reading_id(self) -> int | None:
        with self._cur() as cur:
            cur.execute("SELECT id FROM grid_readings ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
        return row["id"] if row else None

    def add_allocation_pass(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        reading_id = self.latest_reading_id()
        with self._cur() as cur:
            cur.executemany(
                "INSERT INTO charging_allocations (vehicle_id, reading_id, "
                "priority, battery_urgency, departure_urgency, energy_deficit, "
                "granted_power, max_power, energy_needed_kwh, status, "
                "eta_minutes, capacity_budget_kw, served_order, "
                "priority_reason, power_reason, notes) VALUES "
                "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [
                    (
                        r["vehicleId"], reading_id, r["priority"],
                        r["batteryUrgency"], r["departureUrgency"],
                        r["energyDeficit"], r["grantedPower"], r["maxPower"],
                        r["energyNeededKwh"], r["status"], r["etaMinutes"],
                        r["capacityBudgetKw"], r["servedOrder"],
                        r["priorityReason"], r["powerReason"],
                        "\n".join(r["notes"]) if r["notes"] else None,
                    )
                    for r in rows
                ],
            )

    def open_session(self, vehicle_id: str, start_battery: float) -> None:
        with self._cur() as cur:
            cur.execute(
                "INSERT INTO charging_sessions (vehicle_id, start_battery) "
                "VALUES (%s,%s)",
                (vehicle_id, start_battery),
            )

    def close_session(self, vehicle_id: str, end_battery: float,
                      reason: str) -> None:
        with self._cur() as cur:
            cur.execute(
                "UPDATE charging_sessions SET ended_at=NOW(), "
                "end_battery=%s, end_reason=%s WHERE vehicle_id=%s AND "
                "ended_at IS NULL ORDER BY id DESC LIMIT 1",
                (end_battery, reason, vehicle_id),
            )

    @property
    def mode(self) -> str:
        return "mysql"


def build_store():
    """Try MySQL first; fall back to the in-memory store if unavailable."""
    if mysql is not None:
        try:
            store = MySQLStore()
            print("[GridPulse] persistence: MySQL", flush=True)
            return store
        except Exception as exc:  # noqa: BLE001
            print(
                f"[GridPulse] MySQL unavailable ({exc.__class__.__name__}: "
                f"{exc}); using in-memory store", flush=True,
            )
    else:
        print(
            "[GridPulse] mysql-connector-python not installed; "
            "using in-memory store (pip install mysql-connector-python)",
            flush=True,
        )
    return MemoryStore()
