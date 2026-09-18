import type { Allocation, GridInputs, Vehicle } from "./types";

/** Earliest sensible departure used when a vehicle time is missing/malformed. */
const DEFAULT_DEPARTURE_MINUTES = 12 * 60;

export function parseDeparture(departure: string): number {
  const parts = departure.split(":").map(Number);
  const hours = Number.isFinite(parts[0]) ? (parts[0] as number) : NaN;
  const minutes = Number.isFinite(parts[1]) ? (parts[1] as number) : NaN;
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return DEFAULT_DEPARTURE_MINUTES;
  }
  return hours * 60 + minutes;
}

/** Minutes since midnight on the 24h clock. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Priority score (0-100): lower battery weighs most, then urgency as the
 * departure approaches, then remaining charge deficit.
 */
export function scoreVehicle(vehicle: Vehicle, nowMinutes: number): number {
  const departureMinutes = parseDeparture(vehicle.departure);
  const urgency = Math.max(0, 1 - Math.max(0, departureMinutes - nowMinutes) / 600);
  const deficit = Math.max(0, vehicle.target - vehicle.battery) / 100;
  const lowBattery = (100 - vehicle.battery) / 100;
  return Math.round((lowBattery * 0.4 + urgency * 0.35 + deficit * 0.25) * 100);
}

/**
 * Greedy priority allocation: sort by score, hand out headroom
 * (capacity minus net building draw after solar) up to each vehicle's max.
 */
export function allocate(
  vehicles: Vehicle[],
  inputs: GridInputs,
  nowMinutes: number,
): Allocation[] {
  const { gridCapacity, buildingDemand, solarGeneration } = inputs;
  const netBuilding = Math.max(0, buildingDemand - solarGeneration);
  let budget = Math.max(0, gridCapacity - netBuilding);

  return [...vehicles]
    .sort((a, b) => scoreVehicle(b, nowMinutes) - scoreVehicle(a, nowMinutes))
    .map((vehicle) => {
      const priority = scoreVehicle(vehicle, nowMinutes);
      const power = Math.min(vehicle.maxPower, Math.max(0, budget));
      budget -= power;
      const urgent = vehicle.battery < 30 || priority >= 65;
      const reason =
        power === vehicle.maxPower
          ? urgent
            ? "Full allocation · low battery + early departure"
            : "Full allocation · capacity available"
          : power > 0
            ? "Reduced allocation · transformer headroom protected"
            : "Paused · higher-priority vehicles protected";
      return { ...vehicle, priority, power: Number(power.toFixed(1)), reason };
    });
}
