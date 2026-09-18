import type { ChargingStatus } from "./charging-status";
export type { ChargingStatus } from "./charging-status";

/**
 * A connected EV in the simulation cluster.
 */
export type Vehicle = {
  id: string;
  /** Current state of charge, 0-100. */
  battery: number;
  /** Desired state of charge at departure, 0-100. */
  target: number;
  /** 24h "HH:MM" departure time. */
  departure: string;
  /** Maximum charge rate in kW (hardware limit of the charger/vehicle). */
  maxPower: number;
  /** Usable battery pack size in kWh. */
  batteryPackKwh: number;
};

/** Why the priority score is what it is (each 0-1, before weighting). */
export type PriorityFactors = {
  batteryUrgency: number;
  departureUrgency: number;
  energyDeficit: number;
};

/**
 * A charging decision for one vehicle.
 *
 * Everything on this type exists so the UI can EXPLAIN the decision, not
 * just display a number. This is a deterministic optimization/control
 * algorithm — no ML, no magic — and the fields here make its reasoning
 * inspectable.
 */
export type Allocation = Vehicle & {
  /** 0-100 composite priority score (weighted sum of normalized factors). */
  priority: number;
  /** The raw normalized factors behind the score, for transparent display. */
  priorityFactors: PriorityFactors;
  /** Granted charging power in kW (0 when paused/waiting). */
  power: number;
  /** kWh still required to reach `target`. */
  energyNeededKwh: number;
  /** Classification of the vehicle's current charging situation. */
  status: ChargingStatus;
  /**
   * Wall-clock time at which the vehicle reaches `target` at its allocated
   * power, or null when it is not charging or cannot finish before departure.
   */
  etaMinutesFromNow: number | null;
  /** Grid budget available to the EV cluster when this decision was made. */
  capacityBudgetKw: number;
  /** Order in which the allocator granted power (0 = served first). */
  servedOrder: number;
  /** Explanation strings: why this priority, why this power (or lack of it). */
  priorityReason: string;
  powerReason: string;
  /** Extra constraint notes (e.g. "cannot reach target before departure"). */
  notes: string[];
};

export type Scenario = "normal" | "peak" | "solar";

export type View = "dashboard" | "vehicles" | "energy" | "analytics" | "settings";

export type GridInputs = {
  gridCapacity: number;
  buildingDemand: number;
  solarGeneration: number;
};

/** Result of one allocation pass: decisions plus cluster-level facts. */
export type AllocationResult = {
  /** Sorted by serving order (highest priority first). */
  allocations: Allocation[];
  /** availableChargingCapacity = gridCapacity - buildingLoad + renewableGeneration. */
  availableChargingCapacityKw: number;
  /** Sum of granted power across all vehicles. */
  totalAllocatedKw: number;
  /** Vehicles currently drawing power. */
  chargingCount: number;
  /** Vehicles classified as Completed (battery >= target). */
  completedCount: number;
};

export type ChartPoint = {
  time: string;
  building: number;
  ev: number;
  solar: number;
  total: number;
  limit: number;
};
