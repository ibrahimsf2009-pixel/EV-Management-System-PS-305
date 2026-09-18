/**
 * GridPulse charging allocation — a deterministic optimization/control
 * algorithm. No AI, no learning, no black box: identical inputs always
 * produce identical decisions, and every decision carries the factors and
 * reasons that produced it so the UI can explain itself.
 *
 * ─── How it works ──────────────────────────────────────────────────────────
 *
 * 1. BUDGET. Available charging capacity for the EV cluster:
 *
 *      availableChargingCapacity = gridCapacity - buildingLoad + renewable
 *
 *    Building demand is always served first and is never interrupted. On-site
 *    solar displaces grid import kW-for-kW and the transformer carries only
 *    the import, so this budget can never violate the grid limit — see the
 *    invariant derivation in Step 1 below. Surplus solar legitimately adds
 *    charging headroom instead of being wasted. The result is clamped at 0;
 *    the allocator never invents power.
 *
 * 2. PRIORITY. Each vehicle gets a 0-100 composite score from three
 *    independently normalized factors (see scoreVehicle / priorityFactors):
 *      - batteryUrgency    how low the battery is right now
 *      - departureUrgency  how close departure is, including whether there
 *                          is still enough TIME to finish charging at all
 *      - energyDeficit     how much charge is still missing
 *
 * 3. DISTRIBUTION. Two phases:
 *      Phase A — priority service: vehicles are served at FULL rate in
 *                priority order while headroom allows.
 *      Phase B — weighted fair share: once one vehicle can no longer be
 *                fully served, the remaining headroom is split among it and
 *                all lower-priority vehicles proportionally to their
 *                priority scores (water-filling, capped at each vehicle's
 *                max, re-iterating to redistribute surplus). Scarcity is
 *                shared instead of first-come-first-served.
 *
 * 4. EXPLAIN. Every allocation records its normalized factors, serving
 *    order, the budget it was decided under, its status class, and honest
 *    reason strings naming the constraint that actually bound the decision.
 */
import type { Allocation, AllocationResult, ChargingStatus, GridInputs, Vehicle } from "./types";

/** Earliest sensible departure used when a vehicle time is missing/malformed. */
const DEFAULT_DEPARTURE_MINUTES = 12 * 60;

/**
 * Departure urgency saturates this many minutes out. 8h chosen so a vehicle
 * leaving in the morning is already near-max urgent late at night, but a
 * vehicle leaving next shift does not dominate the queue unfairly.
 */
const DEPARTURE_HORIZON_MINUTES = 480;

/**
 * Below this state of charge a vehicle is critically low and receives
 * maximum battery urgency regardless of other factors.
 */
const CRITICAL_BATTERY = 20;

/**
 * Departure urgency saturates once there is no longer enough time to charge
 * to target before departure — a real deadline miss looming.
 */
const DEADLINE_RISK_BUFFER_MINUTES = 15;

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

/** Clamp to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to one decimal for display-stable numbers. */
function round1(value: number): number {
  return Number(value.toFixed(1));
}

/**
 * Floor to one decimal. Used for granted power so that rounded grants can
 * never sum ABOVE the true budget — the grid invariant survives rounding.
 */
function floor1(value: number): number {
  return Math.max(0, Math.floor(value * 10) / 10);
}

/**
 * kWh still required for a vehicle to reach its target state of charge:
 * (target% - battery%) x pack kWh / 100.
 */
function energyNeededKwh(vehicle: Vehicle): number {
  const deficitPercent = Math.max(0, vehicle.target - vehicle.battery);
  return (deficitPercent / 100) * vehicle.batteryPackKwh;
}

/**
 * Minutes of charging at `powerKw` needed to reach target. Null when power
 * is zero or no energy is needed (no estimate is possible/required).
 */
function minutesToTarget(energyKwh: number, powerKw: number): number | null {
  if (powerKw <= 0 || energyKwh <= 0) return null;
  return (energyKwh / powerKw) * 60;
}

/**
 * PRIORITY SCORING.
 *
 * Three factors, each independently normalized to 0-1 with explicit,
 * documented anchors — the weights are the only policy inputs:
 *
 *   batteryUrgency    (100 - battery) / (100 - CRITICAL_BATTERY), capped at
 *                     1. A near-empty battery is the strongest single
 *                     signal; at or below 20% it saturates.
 *
 *   departureUrgency  1 - clamp(minutesToDeparture / HORIZON, 0, 1). Linear
 *                     ramp over an 8h horizon. When charging to target can
 *                     no longer FINISH before departure (plus a small
 *                     buffer) even at max power, urgency is forced to 1 —
 *                     a deadline is a deadline no matter what the ramp says.
 *
 *   energyDeficit     (target - battery) / target. Relative deficit, so a
 *                     40%->80% gap outweighs an 85%->90% top-up.
 *
 * Composite score = 40% battery + 35% departure + 25% deficit, as an
 * integer 0-100. Weights are policy, stated openly here.
 */
export function scoreVehicle(vehicle: Vehicle, nowMinutes: number): number {
  const { batteryUrgency, departureUrgency, energyDeficit } = priorityFactors(vehicle, nowMinutes);
  return Math.round((batteryUrgency * 0.4 + departureUrgency * 0.35 + energyDeficit * 0.25) * 100);
}

/** Compute the raw normalized (0-1) priority factors for one vehicle. */
function priorityFactors(vehicle: Vehicle, nowMinutes: number) {
  const departureMinutes = parseDeparture(vehicle.departure);

  // Time until departure; a vehicle past its departure time is maximally
  // urgent (zero minutes left).
  const minutesToDeparture = Math.max(0, departureMinutes - nowMinutes);

  const batteryUrgency = clamp((100 - vehicle.battery) / (100 - CRITICAL_BATTERY), 0, 1);

  let departureUrgency = 1 - clamp(minutesToDeparture / DEPARTURE_HORIZON_MINUTES, 0, 1);

  // Deadline risk: if charging at max power cannot reach target before
  // departure (with a small buffer), urgency saturates at 1.
  const needed = energyNeededKwh(vehicle);
  const fastestMinutes = minutesToTarget(needed, vehicle.maxPower);
  if (
    fastestMinutes !== null &&
    minutesToDeparture > 0 &&
    fastestMinutes + DEADLINE_RISK_BUFFER_MINUTES >= minutesToDeparture
  ) {
    departureUrgency = 1;
  }
  // Already past departure with energy still missing: maximally urgent.
  if (minutesToDeparture === 0 && needed > 0) departureUrgency = 1;

  const energyDeficit =
    vehicle.target > 0 ? clamp((vehicle.target - vehicle.battery) / vehicle.target, 0, 1) : 0;

  return { batteryUrgency, departureUrgency, energyDeficit };
}

/**
 * Priority explanation in plain language. Reads the same normalized factors
 * the score used and names the dominant one — the operator should never
 * have to reverse-engineer a number.
 */
function priorityReason(vehicle: Vehicle, factors: ReturnType<typeof priorityFactors>): string {
  const { batteryUrgency, departureUrgency, energyDeficit } = factors;
  if (vehicle.battery <= CRITICAL_BATTERY) {
    return `Critical battery (${vehicle.battery}%) — near-empty vehicles are served first.`;
  }
  if (departureUrgency >= 0.95) {
    return `Departure at ${vehicle.departure} is close and there may not be enough time to finish charging.`;
  }
  if (departureUrgency >= 0.6) {
    return `Departure at ${vehicle.departure} is approaching — needs its charge soon.`;
  }
  if (batteryUrgency >= 0.6) {
    return `Battery is getting low (${vehicle.battery}%).`;
  }
  if (energyDeficit >= 0.5) {
    return `Large remaining charge (${vehicle.battery}% → ${vehicle.target}%).`;
  }
  return `Comfortable margins — battery ${vehicle.battery}%, departs ${vehicle.departure}.`;
}

/**
 * THE ALLOCATOR.
 *
 * Deterministic: same vehicles + inputs + clock produce the same output.
 * Sorting is score-descending with id tiebreak, so ties never flip between
 * renders. Grid safety invariant: building load is served first and total
 * EV draw never exceeds the available charging capacity.
 */
export function allocate(
  vehicles: Vehicle[],
  inputs: GridInputs,
  nowMinutes: number,
): AllocationResult {
  const { gridCapacity, buildingDemand, solarGeneration } = inputs;

  // ── Step 1: cluster budget ────────────────────────────────────────────────
  // availableChargingCapacity = gridCapacity - buildingLoad + renewable.
  // On-site solar displaces grid import kW-for-kW, and the transformer only
  // carries the IMPORT, so:
  //   import = building + ev - solar  <=  gridCapacity
  //   <=>    ev        <=  gridCapacity - building + solar = budget
  // The invariant is therefore satisfied by construction — the EV cluster can
  // never overload the transformer, even during a solar surplus. The result
  // is clamped at 0; the allocator never invents power.
  const availableChargingCapacityKw = Math.max(0, gridCapacity - buildingDemand + solarGeneration);
  const clusterHasCapacity = availableChargingCapacityKw > 1e-9;

  // ── Step 2: deterministic priority order ─────────────────────────────────
  const scored = vehicles
    .map((vehicle) => ({
      vehicle,
      factors: priorityFactors(vehicle, nowMinutes),
      score: scoreVehicle(vehicle, nowMinutes),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.vehicle.id < b.vehicle.id ? -1 : a.vehicle.id > b.vehicle.id ? 1 : 0),
    );

  const needed = (entry: (typeof scored)[number]) => energyNeededKwh(entry.vehicle);

  // Shared builder so every allocation carries the full explanation payload.
  const buildAllocation = (
    entry: (typeof scored)[number],
    grantedPrecise: number,
    status: ChargingStatus,
    phaseBBudgetKw: number,
    peerCount: number,
  ): Allocation => {
    const { vehicle, factors, score } = entry;
    const energyNeeded = needed(entry);
    // Floor to 0.1 kW: rounding must never push total draw above the budget.
    const power = floor1(grantedPrecise);
    const etaMinutes = minutesToTarget(energyNeeded, power);
    const minutesToDeparture = Math.max(0, parseDeparture(vehicle.departure) - nowMinutes);
    const notes: string[] = [];
    if (
      power > 0 &&
      etaMinutes !== null &&
      minutesToDeparture > 0 &&
      etaMinutes + DEADLINE_RISK_BUFFER_MINUTES >= minutesToDeparture
    ) {
      notes.push(
        `At ${power} kW it will not reach ${vehicle.target}% before its ${vehicle.departure} departure.`,
      );
    }
    return {
      ...vehicle,
      priority: score,
      priorityFactors: factors,
      power,
      energyNeededKwh: round1(energyNeeded),
      status,
      etaMinutesFromNow: etaMinutes === null ? null : Math.max(1, Math.round(etaMinutes)),
      capacityBudgetKw: round1(availableChargingCapacityKw),
      servedOrder: -1, // assigned after final assembly
      priorityReason: priorityReason(vehicle, factors),
      powerReason: powerReason({
        granted: power,
        vehicle,
        status,
        phaseBBudgetKw,
        peerCount,
      }),
      notes,
    };
  };

  // Completed vehicles need nothing — they simply free their share.
  const completedAllocs: Allocation[] = scored
    .filter((entry) => needed(entry) <= 1e-9)
    .map((entry) => ({
      ...entry.vehicle,
      priority: entry.score,
      priorityFactors: entry.factors,
      power: 0,
      energyNeededKwh: 0,
      status: "completed" as const,
      etaMinutesFromNow: null,
      capacityBudgetKw: round1(availableChargingCapacityKw),
      servedOrder: -1,
      priorityReason: `Target reached — battery ${entry.vehicle.battery}% ≥ target ${entry.vehicle.target}%.`,
      powerReason: "Charging complete — no energy required.",
      notes: [],
    }));

  const active = scored.filter((entry) => needed(entry) > 1e-9);
  const served: Allocation[] = [];
  const unserved: Allocation[] = [];

  let remaining = availableChargingCapacityKw;

  // ── Step 3a: priority service (Phase A) ──────────────────────────────────
  // Serve vehicles at FULL rate in priority order while headroom allows.
  // Stops at the first vehicle the remaining headroom cannot fully serve.
  let cursor = 0;
  while (cursor < active.length) {
    const entry = active[cursor];
    if (!entry || remaining < entry.vehicle.maxPower - 1e-9) break;
    served.push(buildAllocation(entry, entry.vehicle.maxPower, "charging", 0, 0));
    remaining = Math.max(0, remaining - entry.vehicle.maxPower);
    cursor++;
  }

  // ── Step 3b: weighted fair share (Phase B) ───────────────────────────────
  // The first unservable vehicle and everyone below it share what is left,
  // proportionally to priority score (weight floor 1 keeps zero-score
  // vehicles in the pool). Water-filling: each round computes desired shares
  // against the round's opening pool, applies them in priority order, and
  // vehicles already at their max release surplus to the next round.
  const phaseBBudgetKw = remaining;
  const pending = active.slice(cursor).map((entry) => ({ entry, granted: 0 }));

  for (let round = 0; round <= pending.length && remaining > 1e-9; round++) {
    const open = pending.filter((p) => p.entry.vehicle.maxPower - p.granted > 1e-9);
    if (!open.length) break;

    const totalWeight = open.reduce((sum, p) => sum + Math.max(1, p.entry.score), 0);
    const snapshot = remaining;
    let pool = snapshot;
    let progressed = false;

    for (const p of open) {
      const weight = Math.max(1, p.entry.score);
      const want = p.entry.vehicle.maxPower - p.granted;
      const share = (snapshot * weight) / totalWeight;
      const give = Math.min(want, share);
      if (give > 1e-9) {
        p.granted += give;
        pool -= give;
        progressed = true;
      }
    }

    remaining = Math.max(0, pool);
    if (!progressed) break;
  }

  for (const p of pending) {
    const status = classifyStatus({
      granted: p.granted,
      vehicle: p.entry.vehicle,
      sharingWithPeers: pending.length > 1,
      clusterHasCapacity,
    });
    const target = p.granted > 1e-9 ? served : unserved;
    target.push(
      buildAllocation(p.entry, p.granted, status, phaseBBudgetKw, Math.max(0, pending.length - 1)),
    );
  }

  // Final order: actively charging first (serving order), then queued
  // vehicles, then completed — each group priority-ordered.
  const allocations = [...served, ...unserved, ...completedAllocs];
  for (let index = 0; index < allocations.length; index++) {
    const allocation = allocations[index];
    if (allocation && allocation.power > 0) allocation.servedOrder = index;
  }

  // ── Step 4: cluster-level facts for the UI ───────────────────────────────
  const totalAllocatedKw = round1(served.reduce((sum, a) => sum + a.power, 0));
  return {
    allocations,
    availableChargingCapacityKw: round1(availableChargingCapacityKw),
    totalAllocatedKw,
    chargingCount: served.length,
    completedCount: completedAllocs.length,
  };
}

/**
 * Status classification. Distinguishes the flavors of "getting power":
 * full rate (charging), reduced because capacity is shared with peer
 * vehicles (throttled), and reduced because the grid itself cannot offer
 * more even to a single vehicle (constraint-limited). And the flavors of
 * "not getting power": queued while capacity exists (scheduled), zero
 * capacity anywhere (waiting), and finished (completed).
 */
function classifyStatus(args: {
  granted: number;
  vehicle: Vehicle;
  sharingWithPeers: boolean;
  clusterHasCapacity: boolean;
}): ChargingStatus {
  const { granted, vehicle, sharingWithPeers, clusterHasCapacity } = args;
  if (granted >= vehicle.maxPower - 1e-9) return "charging";
  if (granted > 1e-9) return sharingWithPeers ? "throttled" : "constraint-limited";
  return clusterHasCapacity ? "scheduled" : "waiting";
}

/**
 * Plain-language explanation of WHY the vehicle got its power level. Honest
 * and specific — it names the constraint that actually bound the decision.
 */
function powerReason(args: {
  granted: number;
  vehicle: Vehicle;
  status: ChargingStatus;
  phaseBBudgetKw: number;
  peerCount: number;
}): string {
  const { granted, vehicle, status, phaseBBudgetKw, peerCount } = args;
  switch (status) {
    case "charging":
      return `Full ${vehicle.maxPower} kW rate — grid headroom allowed it.`;
    case "throttled":
      return `Charging reduced to ${granted} kW of ${vehicle.maxPower} kW — the remaining ${round1(phaseBBudgetKw)} kW of headroom is shared with ${peerCount} other vehicle${peerCount === 1 ? "" : "s"}, weighted by priority.`;
    case "constraint-limited":
      return `Capped at ${granted} kW — even alone, the grid could only offer ${round1(phaseBBudgetKw)} kW beyond building demand right now.`;
    case "scheduled":
      return `Queued behind higher-priority vehicles — charging begins as they finish or depart.`;
    case "waiting":
      return `No charging capacity available — building demand is using the entire grid budget. Charging starts when headroom returns.`;
    case "completed":
      return `Charging complete — no energy required.`;
  }
}

/**
 * Human-readable charging completion estimate, or a short honest
 * explanation of why no estimate is possible.
 */
export function formatEta(allocation: Allocation): string {
  if (allocation.status === "completed") return "Done";
  if (allocation.etaMinutesFromNow === null) {
    return allocation.power > 0 ? "—" : "Not charging";
  }
  const minutes = allocation.etaMinutesFromNow;
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `~${hours} h` : `~${hours} h ${rest} min`;
}
