/**
 * Charging status taxonomy.
 *
 * These are the ONLY six states the allocator can produce. Every vehicle in
 * the UI must be classifiable into one of them so its charging situation is
 * readable at a glance.
 */
export const CHARGING_STATUSES = [
  "charging",
  "waiting",
  "scheduled",
  "completed",
  "throttled",
  "constraint-limited",
] as const;

export type ChargingStatus = (typeof CHARGING_STATUSES)[number];

/** Display order: most actionable first. */
export const STATUS_ORDER: ChargingStatus[] = [
  "charging",
  "throttled",
  "constraint-limited",
  "scheduled",
  "waiting",
  "completed",
];

export type StatusMeta = {
  label: string;
  /** Short operator-facing description shown in the details panel. */
  description: string;
  dot: string;
  text: string;
  chip: string;
  bar: string;
};

export const STATUS_META: Record<ChargingStatus, StatusMeta> = {
  charging: {
    label: "Charging",
    description: "Receiving its full maximum charge rate.",
    dot: "bg-primary shadow-[0_0_6px_oklch(0.84_0.13_180/0.6)]",
    text: "text-primary",
    chip: "border-primary/30 bg-primary/10 text-primary",
    bar: "bg-gradient-to-r from-primary/70 to-primary",
  },
  throttled: {
    label: "Throttled",
    description: "Charging below its maximum rate — capacity is shared.",
    dot: "bg-energy/80",
    text: "text-energy",
    chip: "border-energy/30 bg-energy/10 text-energy",
    bar: "bg-energy/70",
  },
  "constraint-limited": {
    label: "Constraint limited",
    description: "Charging, but capped specifically so the transformer limit is never exceeded.",
    dot: "bg-warning/80",
    text: "text-warning",
    chip: "border-warning/35 bg-warning/10 text-warning",
    bar: "bg-warning/70",
  },
  scheduled: {
    label: "Scheduled",
    description: "Has a reserved share; waiting for higher-priority vehicles to finish.",
    dot: "bg-solar/80",
    text: "text-solar",
    chip: "border-solar/30 bg-solar/10 text-solar",
    bar: "bg-solar/60",
  },
  waiting: {
    label: "Waiting",
    description: "No capacity available right now — will charge when the budget frees up.",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    chip: "border-border bg-secondary/60 text-muted-foreground",
    bar: "bg-muted-foreground/40",
  },
  completed: {
    label: "Completed",
    description: "Already at or above its target state of charge.",
    dot: "bg-emerald-400/90",
    text: "text-emerald-300",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    bar: "bg-emerald-400/70",
  },
} as const;
