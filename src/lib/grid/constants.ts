import type { ChartPoint, Vehicle } from "./types";

export const initialVehicles: Vehicle[] = [
  { id: "EV-07", battery: 18, target: 85, departure: "09:15", maxPower: 11, batteryPackKwh: 64 },
  { id: "EV-03", battery: 42, target: 80, departure: "11:30", maxPower: 7, batteryPackKwh: 58 },
  { id: "EV-11", battery: 76, target: 90, departure: "16:45", maxPower: 7, batteryPackKwh: 75 },
  { id: "EV-04", battery: 63, target: 90, departure: "14:20", maxPower: 11, batteryPackKwh: 82 },
  { id: "EV-09", battery: 31, target: 75, departure: "12:10", maxPower: 7, batteryPackKwh: 60 },
];

export const chartSeed: ChartPoint[] = [
  { time: "08:00", building: 14, ev: 13, solar: 5, total: 22, limit: 50 },
  { time: "08:10", building: 16, ev: 17, solar: 7, total: 26, limit: 50 },
  { time: "08:20", building: 20, ev: 18, solar: 11, total: 27, limit: 50 },
  { time: "08:30", building: 22, ev: 20, solar: 14, total: 28, limit: 50 },
  { time: "08:40", building: 19, ev: 21, solar: 17, total: 23, limit: 50 },
];

export const scenarioPresets = {
  normal: { gridCapacity: 50, buildingDemand: 17, solarGeneration: 17 },
  peak: { gridCapacity: 50, buildingDemand: 42, solarGeneration: 4 },
  solar: { gridCapacity: 50, buildingDemand: 19, solarGeneration: 34 },
} as const;

export const GRID_CAPACITY_RANGE = { min: 30, max: 90 } as const;
export const BUILDING_DEMAND_RANGE = { min: 5, max: 60 } as const;
export const SOLAR_RANGE = { min: 0, max: 50 } as const;

export const DERIVED_RANGES = {
  battery: { min: 1, max: 99 },
  target: { min: 1, max: 100 },
  maxPower: { min: 1, max: 22 },
  batteryPackKwh: { min: 20, max: 200 },
} as const;

export function defaultVehicleForm(vehicleCount: number): Vehicle {
  return {
    id: `EV-${String(vehicleCount + 8).padStart(2, "0")}`,
    battery: 25,
    target: 80,
    departure: "13:30",
    maxPower: 7,
    batteryPackKwh: 60,
  };
}

export function isValidVehicleId(id: string): boolean {
  return /^[A-Z0-9-]{1,16}$/.test(id);
}
