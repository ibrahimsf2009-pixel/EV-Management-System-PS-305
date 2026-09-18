export type Vehicle = {
  id: string;
  battery: number;
  target: number;
  /** 24h "HH:MM" departure time. */
  departure: string;
  /** Maximum charge rate in kW. */
  maxPower: number;
};

export type Allocation = Vehicle & {
  /** 0-100 charging priority score. */
  priority: number;
  /** Granted charging power in kW. */
  power: number;
  /** Human-readable explanation of the allocation decision. */
  reason: string;
};

export type Scenario = "normal" | "peak" | "solar";

export type View = "dashboard" | "vehicles" | "energy" | "analytics" | "settings";

export type GridInputs = {
  gridCapacity: number;
  buildingDemand: number;
  solarGeneration: number;
};

export type ChartPoint = {
  time: string;
  building: number;
  ev: number;
  solar: number;
  total: number;
  limit: number;
};
