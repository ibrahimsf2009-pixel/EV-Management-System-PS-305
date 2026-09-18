/**
 * Differential test fixture generator + TS-engine dump.
 *
 * Generates deterministic pseudo-random scenarios (same seed both sides),
 * runs the production TypeScript allocator on each, and prints JSON to
 * stdout for comparison against the Python port.
 */
import { allocate } from "../src/lib/grid/allocation";
import { computeDerived } from "../src/lib/grid/derived";
import type { Vehicle } from "../src/lib/grid/types";

/** Deterministic xorshift PRNG so both sides generate identical fixtures. */
function makeRng(seed: number) {
  let s = seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const rng = makeRng(42);

const vehicles: Vehicle[] = [];
const ids = ["EV-01", "EV-02", "EV-03", "EV-04", "EV-05", "EV-06", "EV-07", "EV-08"];
for (let i = 0; i < 8; i++) {
  vehicles.push({
    id: ids[i] ?? `EV-${i}`,
    battery: 5 + Math.floor(rng() * 90),
    target: 50 + Math.floor(rng() * 50),
    departure: `${String(Math.floor(rng() * 24)).padStart(2, "0")}:${String(
      Math.floor(rng() * 60),
    ).padStart(2, "0")}`,
    maxPower: [7, 11, 22][Math.floor(rng() * 3)] ?? 7,
    batteryPackKwh: [40, 58, 60, 75, 82][Math.floor(rng() * 5)] ?? 60,
  });
}

const scenarios: {
  name: string;
  vehicles: Vehicle[];
  inputs: { gridCapacity: number; buildingDemand: number; solarGeneration: number };
  nowMinutes: number;
}[] = [
  // Original demo fleet across key times of day
  ...[0, 300, 555, 720, 1005, 1439].map((nowMinutes) => ({
    name: `demo-fleet@${nowMinutes}`,
    vehicles: [
      { id: "EV-07", battery: 18, target: 85, departure: "09:15", maxPower: 11, batteryPackKwh: 64 },
      { id: "EV-03", battery: 42, target: 80, departure: "11:30", maxPower: 7, batteryPackKwh: 58 },
      { id: "EV-11", battery: 76, target: 90, departure: "16:45", maxPower: 7, batteryPackKwh: 75 },
      { id: "EV-04", battery: 63, target: 90, departure: "14:20", maxPower: 11, batteryPackKwh: 82 },
      { id: "EV-09", battery: 31, target: 75, departure: "12:10", maxPower: 7, batteryPackKwh: 60 },
    ],
    inputs: { gridCapacity: 50, buildingDemand: 17, solarGeneration: 17 },
    nowMinutes,
  })),
  // Constraint stress: tight grid, high building, zero solar
  {
    name: "tight-grid",
    vehicles: vehicles.slice(0, 6),
    inputs: { gridCapacity: 30, buildingDemand: 28, solarGeneration: 0 },
    nowMinutes: 600,
  },
  // Surplus solar
  {
    name: "solar-surplus",
    vehicles: vehicles.slice(0, 6),
    inputs: { gridCapacity: 50, buildingDemand: 10, solarGeneration: 34 },
    nowMinutes: 720,
  },
  // Zero capacity
  {
    name: "zero-capacity",
    vehicles: vehicles.slice(0, 4),
    inputs: { gridCapacity: 30, buildingDemand: 40, solarGeneration: 0 },
    nowMinutes: 720,
  },
  // Pseudo-random fleet under normal constraints
  {
    name: "random-fleet-normal",
    vehicles,
    inputs: { gridCapacity: 50, buildingDemand: 17, solarGeneration: 17 },
    nowMinutes: 640,
  },
  // Pseudo-random fleet, everything scarce
  {
    name: "random-fleet-scarce",
    vehicles,
    inputs: { gridCapacity: 35, buildingDemand: 30, solarGeneration: 2 },
    nowMinutes: 900,
  },
  // Malformed departure fallback
  {
    name: "malformed-departure",
    vehicles: [{ id: "EV-X", battery: 40, target: 90, departure: "25:99", maxPower: 11, batteryPackKwh: 60 }],
    inputs: { gridCapacity: 50, buildingDemand: 10, solarGeneration: 5 },
    nowMinutes: 600,
  },
  // Empty fleet
  {
    name: "empty-fleet",
    vehicles: [],
    inputs: { gridCapacity: 50, buildingDemand: 17, solarGeneration: 17 },
    nowMinutes: 600,
  },
  // Completed vehicles only
  {
    name: "all-completed",
    vehicles: [
      { id: "EV-A", battery: 90, target: 80, departure: "18:00", maxPower: 11, batteryPackKwh: 60 },
      { id: "EV-B", battery: 80, target: 80, departure: "18:00", maxPower: 11, batteryPackKwh: 60 },
    ],
    inputs: { gridCapacity: 50, buildingDemand: 17, solarGeneration: 17 },
    nowMinutes: 600,
  },
];

const results = scenarios.map((scenario) => {
  const allocation = allocate(scenario.vehicles, scenario.inputs, scenario.nowMinutes);
  const derived = computeDerived(
    scenario.inputs,
    allocation.totalAllocatedKw,
  );
  return {
    name: scenario.name,
    vehicles: scenario.vehicles,
    inputs: scenario.inputs,
    nowMinutes: scenario.nowMinutes,
    allocation,
    derived,
  };
});

process.stdout.write(JSON.stringify(results, null, 1));
