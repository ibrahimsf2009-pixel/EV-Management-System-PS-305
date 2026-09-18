-- GridPulse MySQL schema.
-- Replaces Supabase persistence with a local relational database.
-- The application's data model is unchanged: vehicles keep the same fields,
-- and the simulation state (grid inputs + vehicle set) maps 1:1.

CREATE DATABASE IF NOT EXISTS gridpulse
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gridpulse;

-- ── vehicles ────────────────────────────────────────────────────────────────
-- One row per connected EV. Fields mirror the original Vehicle type exactly.
CREATE TABLE IF NOT EXISTS vehicles (
  id               VARCHAR(16)  NOT NULL PRIMARY KEY,   -- e.g. 'EV-07'
  battery          DECIMAL(5,2) NOT NULL,               -- current state of charge 0-100
  target           DECIMAL(5,2) NOT NULL,               -- desired state of charge 0-100
  departure        VARCHAR(5)   NOT NULL,               -- 24h 'HH:MM'
  max_power        DECIMAL(6,2) NOT NULL,               -- charger/vehicle hardware limit, kW
  battery_pack_kwh DECIMAL(7,2) NOT NULL,               -- usable pack size, kWh
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── grid_readings ───────────────────────────────────────────────────────────
-- Time-series of grid conditions (one row per telemetry tick / state save).
CREATE TABLE IF NOT EXISTS grid_readings (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grid_capacity    DECIMAL(6,2) NOT NULL,
  building_demand  DECIMAL(6,2) NOT NULL,
  solar_generation DECIMAL(6,2) NOT NULL,
  ev_load          DECIMAL(6,2) NOT NULL DEFAULT 0,     -- total allocated EV power at reading time
  recorded_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_grid_readings_time (recorded_at)
);

-- ── charging_allocations ────────────────────────────────────────────────────
-- Snapshot of one allocation pass per vehicle: priority, granted power,
-- status, ETA and the cluster budget it was decided under.
CREATE TABLE IF NOT EXISTS charging_allocations (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehicle_id          VARCHAR(16)  NOT NULL,
  reading_id          BIGINT UNSIGNED NULL,            -- grid_readings row this pass used
  priority            INT          NOT NULL,           -- 0-100 composite score
  battery_urgency     DECIMAL(5,4) NOT NULL,           -- normalized factors behind the score
  departure_urgency   DECIMAL(5,4) NOT NULL,
  energy_deficit      DECIMAL(5,4) NOT NULL,
  granted_power       DECIMAL(6,2) NOT NULL,           -- kW actually granted
  max_power           DECIMAL(6,2) NOT NULL,
  energy_needed_kwh   DECIMAL(7,2) NOT NULL,
  status              VARCHAR(24)  NOT NULL,           -- charging/throttled/constraint-limited/
                                                       -- scheduled/waiting/completed
  eta_minutes         INT          NULL,               -- NULL when not charging / unreachable
  capacity_budget_kw  DECIMAL(6,2) NOT NULL,           -- cluster budget for this pass
  served_order        INT          NOT NULL DEFAULT -1,
  priority_reason     TEXT         NOT NULL,
  power_reason        TEXT         NOT NULL,
  notes               TEXT         NULL,               -- newline-separated constraint notes
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alloc_vehicle (vehicle_id),
  INDEX idx_alloc_time (created_at),
  CONSTRAINT fk_alloc_vehicle FOREIGN KEY (vehicle_id)
    REFERENCES vehicles (id) ON DELETE CASCADE
);

-- ── charging_sessions ───────────────────────────────────────────────────────
-- A session opens when a vehicle starts drawing power after being idle/
-- completed, and closes when it reaches target, departs, or stops drawing.
CREATE TABLE IF NOT EXISTS charging_sessions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehicle_id      VARCHAR(16)  NOT NULL,
  started_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at        TIMESTAMP    NULL,
  start_battery   DECIMAL(5,2) NOT NULL,
  end_battery     DECIMAL(5,2) NULL,
  energy_kwh      DECIMAL(8,2) NOT NULL DEFAULT 0,     -- cumulative energy delivered
  end_reason      VARCHAR(24)  NULL,                   -- completed/departed/stopped
  INDEX idx_session_vehicle (vehicle_id),
  CONSTRAINT fk_session_vehicle FOREIGN KEY (vehicle_id)
    REFERENCES vehicles (id) ON DELETE CASCADE
);

-- ── simulation_state ────────────────────────────────────────────────────────
-- Single-row table holding the mutable demo state (mirrors the Supabase
-- gridpulse_demo_state row): the current grid inputs and telemetry chart.
CREATE TABLE IF NOT EXISTS simulation_state (
  id               VARCHAR(16) NOT NULL PRIMARY KEY,   -- always 'main'
  grid_capacity    DECIMAL(6,2) NOT NULL,
  building_demand  DECIMAL(6,2) NOT NULL,
  solar_generation DECIMAL(6,2) NOT NULL,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

-- ── seed data ───────────────────────────────────────────────────────────────
-- Original demo fleet + normal scenario, matching constants.ts.
INSERT INTO vehicles (id, battery, target, departure, max_power, battery_pack_kwh)
VALUES
  ('EV-07', 18, 85, '09:15', 11, 64),
  ('EV-03', 42, 80, '11:30',  7, 58),
  ('EV-11', 76, 90, '16:45',  7, 75),
  ('EV-04', 63, 90, '14:20', 11, 82),
  ('EV-09', 31, 75, '12:10',  7, 60)
ON DUPLICATE KEY UPDATE battery = VALUES(battery);

INSERT INTO simulation_state (id, grid_capacity, building_demand, solar_generation)
VALUES ('main', 50, 17, 17)
ON DUPLICATE KEY UPDATE grid_capacity = VALUES(grid_capacity);
