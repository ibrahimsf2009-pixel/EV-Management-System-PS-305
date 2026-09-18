export { supabase } from "@/integrations/supabase/client";

import type { GridInputs, Vehicle } from "./types";

export const DEMO_STATE_ID = "main";

export type DemoStatePayload = GridInputs & { vehicles: Vehicle[] };

function toVehicle(value: unknown): Vehicle | null {
  if (value == null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record["id"] !== "string" || record["id"].length === 0) return null;
  const battery = Number(record["battery"]);
  const target = Number(record["target"]);
  const maxPower = Number(record["maxPower"]);
  if (![battery, target, maxPower].every(Number.isFinite)) return null;
  return {
    id: record["id"],
    battery,
    target,
    departure: typeof record["departure"] === "string" ? record["departure"] : "12:00",
    maxPower,
    // Rows saved before pack size existed get a sensible default rather
    // than being discarded.
    batteryPackKwh: Number.isFinite(Number(record["batteryPackKwh"]))
      ? Number(record["batteryPackKwh"])
      : 60,
  };
}

/** Maps a `gridpulse_demo_state` row into strongly-typed sim state, or null when unusable. */
export function mapDemoStateRow(row: Record<string, unknown> | null): DemoStatePayload | null {
  if (!row) return null;
  const gridCapacity = Number(row["grid_capacity"]);
  const buildingDemand = Number(row["building_demand"]);
  const solarGeneration = Number(row["solar_generation"]);
  if (![gridCapacity, buildingDemand, solarGeneration].every(Number.isFinite)) return null;
  const vehicles = Array.isArray(row["vehicles"])
    ? row["vehicles"].map(toVehicle).filter((v): v is Vehicle => v !== null)
    : [];
  return { gridCapacity, buildingDemand, solarGeneration, vehicles };
}
