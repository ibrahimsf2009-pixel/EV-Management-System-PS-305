# GridPulse — EV Charging & Grid Management (HTML/CSS/JS + Flask + MySQL)

A real-time dashboard for managing EV charging within a building's grid
capacity envelope, rebuilt on a simple, framework-free stack:

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | HTML + CSS + vanilla JavaScript (no build)   |
| Backend   | Python + Flask                               |
| Database  | MySQL 8                                      |
| Charts    | Hand-rolled canvas renderer (no libraries)   |

The UI is a 1:1 port of the original React/TanStack/Tailwind GridPulse —
same layout, same glass panels, same cyan+yellow palette, same animations,
same interactions. Only the technology underneath changed.

## Quick start

```sh
# 1. Database (one-time; adjust credentials as needed)
mysql -u root -p < database/schema.sql

# 2. Python deps
pip install -r backend/requirements.txt

# 3. Configure DB access (optional — defaults shown)
cp backend/.env.example backend/.env

# 4. Run
cd backend && python app.py
# → http://127.0.0.1:8000
```

No MySQL running? The backend automatically falls back to an in-memory
store so the demo still works; the header of the log tells you which
persistence mode is active.

## Environment variables (`backend/.env`)

| Variable         | Default     | Description        |
| ---------------- | ----------- | ------------------ |
| `MYSQL_HOST`     | `127.0.0.1` | MySQL host         |
| `MYSQL_PORT`     | `3306`      | MySQL port         |
| `MYSQL_USER`     | `root`      | MySQL user         |
| `MYSQL_PASSWORD` | *(empty)*   | MySQL password     |
| `MYSQL_DATABASE` | `gridpulse` | Schema name        |

## Architecture

```
frontend/           Static files served by Flask (no build step)
  index.html        Full app shell — all 5 views
  styles.css        Complete port of the original theme (OKLCH tokens)
  app.js            Rendering, canvas chart, polling, interactions
backend/
  app.py            Flask REST API + static hosting
  allocation.py     Deterministic allocation engine (ported 1:1 from TS)
  explain.py        Plain-English EV status explanations
  database.py       MySQL store + in-memory fallback
database/
  schema.sql        vehicles, charging_sessions, grid_readings,
                    charging_allocations, simulation_state + seed data
scripts/
  diff-generate.mts TS fixture generator (original engine)
  diff-test.py      14-scenario differential test: Python vs TypeScript
  test-explanations.py  10-scenario explanation sweep
```

## API

| Method   | Endpoint                | Purpose                              |
| -------- | ----------------------- | ------------------------------------ |
| `GET`    | `/api/health`           | Liveness + persistence mode          |
| `GET`    | `/api/state`            | Full state + allocation + explanations |
| `POST`   | `/api/state`            | Update grid inputs                   |
| `POST`   | `/api/vehicles`         | Connect a vehicle                    |
| `DELETE` | `/api/vehicles/<id>`    | Remove a vehicle                     |
| `POST`   | `/api/reset`            | Reset to demo fleet + normal preset  |

## The allocation engine

Deterministic two-phase control logic, ported from the original TypeScript
with zero behavior change (verified by `scripts/diff-test.py`: **14/14
scenarios produce byte-identical allocations, statuses, reasons and
derived metrics**):

1. **Budget** — `available = max(0, gridCapacity - buildingDemand + solarGeneration)`,
   so `building + EV - solar <= gridCapacity` holds by construction.
2. **Priority** — composite 0-100 score: 40% battery urgency,
   35% departure urgency (8h ramp + deadline-risk saturation),
   25% energy deficit.
3. **Distribution** — Phase A serves vehicles at full rate in priority
   order; Phase B water-fills the remaining headroom, weighted by priority.
4. **Explain** — every decision carries its factors, status class, ETA and
   honest reason strings.

## Plain-English EV status (new feature)

Every vehicle row carries a compact explanation panel built from the REAL
allocation data — nothing canned:

- **Collapsed**: one line, e.g. *"⚡ Charging limited — power shared with
  other EVs (1.4 kW)."* or *"⏸ Paused — no safe charging capacity right
  now."*
- **Expanded** (click): the full story — why the power level, what the
  system is doing, whether the target will be reached before departure,
  plus a live **why-chip row** (battery urgency / departure urgency / grid
  availability / solar kW) and a **mini energy-flow strip**
  `Solar → Building → Controller → EV` with the current state
  (available / limited / paused / complete).

Validated across ten scenarios in `scripts/test-explanations.py`:
normal charging, low battery, near departure, limited grid capacity, high
building demand, high solar generation, no capacity, shared charging,
target reached, and at-risk of missing target.

> GridPulse is a simulation and energy-management dashboard — it never
> claims to physically control a real charger.

## Tests

```sh
# Engine equivalence vs the original TypeScript implementation
npx tsx scripts/diff-generate.mts > scripts/fixtures.json
python scripts/diff-test.py            # → 14/14 scenarios match

# Explanation quality sweep
python scripts/test-explanations.py    # → ALL SCENARIOS PASS
```
